/**
 * Initiative Step Handler Tests
 * Tests for single initiative step resolution within a combat.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Steps 3-5
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import type { DiceProvider } from '../types';
import type {
  CombatState,
  MeleeStrikeGroup,
  InitiativeStep,
} from './assault-types';
import {
  resolveInitiativeStep,
  resolveStrikeGroupHits,
  resolveStrikeGroupWounds,
  resolveStrikeGroupSaves,
} from './initiative-step-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x = 0, y = 0, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createModel(`${id}-m0`), createModel(`${id}-m1`)],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...overrides,
  };
}

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.Ultramarines,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createDiceProvider(values: number[]): DiceProvider {
  let index = 0;
  return {
    rollD6(): number {
      if (index >= values.length) return 4;
      return values[index++];
    },
    rollMultipleD6(count: number): number[] {
      const results: number[] = [];
      for (let i = 0; i < count; i++) {
        results.push(this.rollD6());
      }
      return results;
    },
    rollD3(): number {
      return Math.ceil(this.rollD6() / 2);
    },
    roll2D6(): [number, number] {
      return [this.rollD6(), this.rollD6()];
    },
    rollScatter(): { direction: number; distance: number } {
      return { direction: 0, distance: this.rollD6() };
    },
  };
}

function createStrikeGroup(overrides: Partial<MeleeStrikeGroup> = {}): MeleeStrikeGroup {
  return {
    index: 0,
    weaponName: 'Chainsword',
    attackerModelIds: ['attacker-m0'],
    targetUnitId: 'defender-unit',
    weaponSkill: 4,
    combatInitiative: 4,
    totalAttacks: 2,
    weaponStrength: 4,
    weaponAP: null,
    weaponDamage: 1,
    specialRules: [],
    hits: [],
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    attackerPlayerIndex: 0,
    ...overrides,
  };
}

function createInitiativeStep(overrides: Partial<InitiativeStep> = {}): InitiativeStep {
  return {
    initiativeValue: 4,
    modelIds: ['attacker-m0'],
    strikeGroups: [createStrikeGroup()],
    resolved: false,
    ...overrides,
  };
}

function createCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    combatId: 'combat-1',
    activePlayerUnitIds: ['attacker-unit'],
    reactivePlayerUnitIds: ['defender-unit'],
    initiativeSteps: [createInitiativeStep()],
    currentInitiativeStepIndex: 0,
    activePlayerCRP: 0,
    reactivePlayerCRP: 0,
    challengeState: null,
    activePlayerCasualties: [],
    reactivePlayerCasualties: [],
    resolved: false,
    isMassacre: false,
    massacreWinnerPlayerIndex: null,
    ...overrides,
  };
}

function createCombatGameState(): GameState {
  const attackerUnit = createUnit('attacker-unit', {
    isLockedInCombat: true,
    engagedWithUnitIds: ['defender-unit'],
    models: [
      createModel('attacker-m0', 10, 10),
      createModel('attacker-m1', 10, 11),
    ],
  });

  const defenderUnit = createUnit('defender-unit', {
    isLockedInCombat: true,
    engagedWithUnitIds: ['attacker-unit'],
    models: [
      createModel('defender-m0', 11, 10),
      createModel('defender-m1', 11, 11),
    ],
  });

  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, [attackerUnit]),
      createArmy(1, [defenderUnit]),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Fight,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
  };
}

// ─── resolveStrikeGroupHits ─────────────────────────────────────────────────

describe('resolveStrikeGroupHits', () => {
  it('should return all hits when all rolls meet target (rolls all 4+)', () => {
    // WS4 vs WS4 → need 4+ to hit (from melee hit table)
    const strikeGroup = createStrikeGroup({
      weaponSkill: 4,
      totalAttacks: 3,
    });
    const dice = createDiceProvider([4, 5, 6]); // All meet or exceed 4

    const result = resolveStrikeGroupHits(strikeGroup, 4, dice);

    expect(result.hits).toBe(3);
    expect(result.misses).toBe(0);
    expect(result.rolls).toEqual([4, 5, 6]);
    // WS4 vs WS4 → target is 4
    expect(result.targetNumber).toBe(4);
  });

  it('should return all misses when all rolls below target (rolls all 1)', () => {
    const strikeGroup = createStrikeGroup({
      weaponSkill: 4,
      totalAttacks: 3,
    });
    const dice = createDiceProvider([1, 1, 1]);

    const result = resolveStrikeGroupHits(strikeGroup, 4, dice);

    expect(result.hits).toBe(0);
    expect(result.misses).toBe(3);
    expect(result.rolls).toEqual([1, 1, 1]);
  });

  it('should count mixed hits and misses correctly', () => {
    const strikeGroup = createStrikeGroup({
      weaponSkill: 4,
      totalAttacks: 5,
    });
    // WS4 vs WS4 = 4+ to hit
    const dice = createDiceProvider([4, 2, 6, 1, 5]); // hits: 4,6,5; misses: 2,1

    const result = resolveStrikeGroupHits(strikeGroup, 4, dice);

    expect(result.hits).toBe(3);
    expect(result.misses).toBe(2);
    expect(result.rolls).toEqual([4, 2, 6, 1, 5]);
  });

  it('should handle single attack', () => {
    const strikeGroup = createStrikeGroup({
      weaponSkill: 4,
      totalAttacks: 1,
    });
    const dice = createDiceProvider([5]);

    const result = resolveStrikeGroupHits(strikeGroup, 4, dice);

    expect(result.hits).toBe(1);
    expect(result.misses).toBe(0);
    expect(result.rolls).toEqual([5]);
  });

  it('should use correct target number from melee hit table for mismatched WS', () => {
    // WS5 vs WS3 → attacker needs 3+ (from table: row 5, col 3)
    const strikeGroup = createStrikeGroup({
      weaponSkill: 5,
      totalAttacks: 2,
    });
    const dice = createDiceProvider([3, 2]); // 3 hits (3+), 2 misses

    const result = resolveStrikeGroupHits(strikeGroup, 3, dice);

    expect(result.targetNumber).toBe(3);
    expect(result.hits).toBe(1);
    expect(result.misses).toBe(1);
  });
});

// ─── resolveStrikeGroupWounds ───────────────────────────────────────────────

describe('resolveStrikeGroupWounds', () => {
  it('should return all wounds when rolls meet target', () => {
    // S4 vs T4 → need 4+ to wound
    const dice = createDiceProvider([4, 5, 6]);

    const result = resolveStrikeGroupWounds(3, 4, 4, dice);

    expect(result.wounds).toBe(3);
    expect(result.failures).toBe(0);
    expect(result.rolls).toEqual([4, 5, 6]);
    expect(result.targetNumber).toBe(4);
  });

  it('should return 0 wounds when strength cannot wound toughness (woundTable returns null)', () => {
    // S1 vs T8 → impossible to wound (null in wound table)
    const dice = createDiceProvider([6, 6, 6]); // These shouldn't be consumed

    const result = resolveStrikeGroupWounds(3, 1, 8, dice);

    expect(result.wounds).toBe(0);
    expect(result.failures).toBe(3);
    expect(result.rolls).toEqual([]);
    expect(result.targetNumber).toBeNull();
  });

  it('should count mixed wounds and failures', () => {
    // S4 vs T4 → need 4+ to wound
    const dice = createDiceProvider([4, 2, 6, 1, 5]);

    const result = resolveStrikeGroupWounds(5, 4, 4, dice);

    expect(result.wounds).toBe(3); // 4, 6, 5
    expect(result.failures).toBe(2); // 2, 1
    expect(result.rolls).toEqual([4, 2, 6, 1, 5]);
  });

  it('should handle S > T (easier to wound, target 3+)', () => {
    // S5 vs T4 → need 3+ to wound
    const dice = createDiceProvider([3, 2, 4]);

    const result = resolveStrikeGroupWounds(3, 5, 4, dice);

    expect(result.wounds).toBe(2); // 3, 4
    expect(result.failures).toBe(1); // 2
    expect(result.targetNumber).toBe(3);
  });

  it('should handle S much greater than T (target 2+)', () => {
    // S6 vs T4 → need 2+ to wound (S >= T+2)
    const dice = createDiceProvider([2, 1, 6]);

    const result = resolveStrikeGroupWounds(3, 6, 4, dice);

    expect(result.wounds).toBe(2); // 2, 6
    expect(result.failures).toBe(1); // 1
    expect(result.targetNumber).toBe(2);
  });

  it('should handle zero hits gracefully', () => {
    const dice = createDiceProvider([]);

    const result = resolveStrikeGroupWounds(0, 4, 4, dice);

    expect(result.wounds).toBe(0);
    expect(result.failures).toBe(0);
    expect(result.rolls).toEqual([]);
    expect(result.targetNumber).toBe(4);
  });
});

// ─── resolveStrikeGroupSaves ────────────────────────────────────────────────

describe('resolveStrikeGroupSaves', () => {
  it('should save all wounds when save roll is high enough', () => {
    // Save 3+, no AP → need 3+ to save
    const dice = createDiceProvider([4, 5, 6]);

    const result = resolveStrikeGroupSaves(3, 3, null, dice);

    expect(result.savedCount).toBe(3);
    expect(result.unsavedWounds).toBe(0);
    expect(result.rolls).toEqual([4, 5, 6]);
  });

  it('should fail all saves when rolls are low', () => {
    // Save 3+, no AP → need 3+ to save
    const dice = createDiceProvider([1, 2, 1]);

    const result = resolveStrikeGroupSaves(3, 3, null, dice);

    expect(result.savedCount).toBe(0);
    expect(result.unsavedWounds).toBe(3);
    expect(result.rolls).toEqual([1, 2, 1]);
  });

  it('should handle no save (null) - all wounds go through', () => {
    const dice = createDiceProvider([6, 6, 6]); // Should not be consumed

    const result = resolveStrikeGroupSaves(3, null, null, dice);

    expect(result.unsavedWounds).toBe(3);
    expect(result.savedCount).toBe(0);
    expect(result.rolls).toEqual([]);
  });

  it('should apply AP to degrade save (save 3+ with AP 2 = 5+)', () => {
    // Save 3+ with AP 2 → effective save = 3 + 2 = 5+
    const dice = createDiceProvider([5, 4, 6]);

    const result = resolveStrikeGroupSaves(3, 3, 2, dice);

    expect(result.savedCount).toBe(2); // 5 and 6 pass, 4 fails
    expect(result.unsavedWounds).toBe(1);
    expect(result.rolls).toEqual([5, 4, 6]);
  });

  it('should handle AP making save impossible (save 3+ with AP 5 = 8+, effectively no save)', () => {
    // Save 3+ with AP 5 → effective save = 3 + 5 = 8, which exceeds 6
    const dice = createDiceProvider([6, 6, 6]); // Should not be consumed since save is impossible

    const result = resolveStrikeGroupSaves(3, 3, 5, dice);

    expect(result.unsavedWounds).toBe(3);
    expect(result.savedCount).toBe(0);
    expect(result.rolls).toEqual([]);
  });

  it('should handle mixed saves and failures', () => {
    // Save 4+, no AP
    const dice = createDiceProvider([4, 2, 6, 1, 5]);

    const result = resolveStrikeGroupSaves(5, 4, null, dice);

    expect(result.savedCount).toBe(3); // 4, 6, 5
    expect(result.unsavedWounds).toBe(2); // 2, 1
    expect(result.rolls).toEqual([4, 2, 6, 1, 5]);
  });

  it('should handle save of 6+ (borderline save)', () => {
    // Save 3+ with AP 3 → effective save = 3 + 3 = 6+
    const dice = createDiceProvider([6, 5, 6]);

    const result = resolveStrikeGroupSaves(3, 3, 3, dice);

    expect(result.savedCount).toBe(2); // both 6s pass
    expect(result.unsavedWounds).toBe(1); // 5 fails
  });

  it('should handle zero wounds gracefully', () => {
    const dice = createDiceProvider([]);

    const result = resolveStrikeGroupSaves(0, 3, null, dice);

    expect(result.unsavedWounds).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.rolls).toEqual([]);
  });
});

// ─── resolveInitiativeStep ──────────────────────────────────────────────────

describe('resolveInitiativeStep', () => {
  it('should resolve a simple initiative step with one strike group', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
              weaponAP: null,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // WS4 vs WS4 = 4+ to hit, S4 vs T4 = 4+ to wound
    // Roll 5, 4 for hits (2 hits), 5, 5 for wounds (2 wounds), 2, 1 for saves (2 fail on 3+)
    const dice = createDiceProvider([5, 4, 5, 5, 2, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Should have events: hit roll, wound roll, save rolls, damage, casualties, step resolved
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.combatState.initiativeSteps[0].resolved).toBe(true);
  });

  it('should generate MeleeHitTestRollEvent', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponSkill: 4,
            }),
          ],
        }),
      ],
    });

    // Hits: 5, 1 (1 hit, 1 miss at 4+), wound: 5 (1 wound at 4+), save: 1 (fail on 3+)
    const dice = createDiceProvider([5, 1, 5, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const hitEvent = result.events.find(e => e.type === 'meleeHitTestRoll');
    expect(hitEvent).toBeDefined();
    expect(hitEvent!.type).toBe('meleeHitTestRoll');

    const typedHitEvent = hitEvent as {
      type: string;
      strikeGroupIndex: number;
      rolls: number[];
      targetNumber: number;
      attackerWS: number;
      defenderWS: number;
      hits: number;
      misses: number;
    };
    expect(typedHitEvent.rolls).toEqual([5, 1]);
    expect(typedHitEvent.hits).toBe(1);
    expect(typedHitEvent.misses).toBe(1);
    expect(typedHitEvent.attackerWS).toBe(4);
    // Defender majority WS defaults to 4
    expect(typedHitEvent.defenderWS).toBe(4);
  });

  it('should generate InitiativeStepResolvedEvent', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
            }),
          ],
        }),
      ],
    });

    // All miss
    const dice = createDiceProvider([1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const resolvedEvent = result.events.find(e => e.type === 'initiativeStepResolved');
    expect(resolvedEvent).toBeDefined();

    const typedEvent = resolvedEvent as {
      type: string;
      combatId: string;
      initiativeValue: number;
      activePlayerCasualties: number;
      reactivePlayerCasualties: number;
    };
    expect(typedEvent.combatId).toBe('combat-1');
    expect(typedEvent.initiativeValue).toBe(4);
  });

  it('should mark step as resolved', () => {
    const state = createCombatGameState();
    const combatState = createCombatState();

    const dice = createDiceProvider([1, 1]); // All misses

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    expect(result.combatState.initiativeSteps[0].resolved).toBe(true);
    // All strike groups within the step should also be resolved
    for (const sg of result.combatState.initiativeSteps[0].strikeGroups) {
      expect(sg.resolved).toBe(true);
    }
  });

  it('should track casualties in combatState', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
              weaponAP: null,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 2 hits, 2 wounds, 2 failed saves → 2 casualties (defender models have 1W each)
    // WS4 vs WS4 = 4+, S4 vs T4 = 4+, save 3+
    const dice = createDiceProvider([6, 6, 6, 6, 1, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Defender is on the reactive player side, so casualties go to reactivePlayerCasualties
    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(2);
    expect(result.combatState.reactivePlayerCasualties.length).toBe(2);
  });

  it('should handle step with no alive models (all destroyed)', () => {
    const state = createCombatGameState();
    // Destroy all models in the attacker unit
    state.armies[0].units[0].models = [
      createModel('attacker-m0', 10, 10, { isDestroyed: true, currentWounds: 0 }),
      createModel('attacker-m1', 10, 11, { isDestroyed: true, currentWounds: 0 }),
    ];

    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0', 'attacker-m1'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0', 'attacker-m1'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
            }),
          ],
        }),
      ],
    });

    const dice = createDiceProvider([]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Step should be resolved with no casualties
    expect(result.combatState.initiativeSteps[0].resolved).toBe(true);
    expect(result.activePlayerCasualtiesThisStep.length).toBe(0);
    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(0);

    // Should still emit an InitiativeStepResolvedEvent
    const resolvedEvent = result.events.find(e => e.type === 'initiativeStepResolved');
    expect(resolvedEvent).toBeDefined();
    const typedEvent = resolvedEvent as {
      type: string;
      activePlayerCasualties: number;
      reactivePlayerCasualties: number;
    };
    expect(typedEvent.activePlayerCasualties).toBe(0);
    expect(typedEvent.reactivePlayerCasualties).toBe(0);
  });

  it('should apply damage to target models', () => {
    const state = createCombatGameState();
    // Give defender models 2 wounds so they don't die immediately
    state.armies[1].units[0].models = [
      createModel('defender-m0', 11, 10, { currentWounds: 2 }),
      createModel('defender-m1', 11, 11, { currentWounds: 2 }),
    ];

    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 1 hit (6), 1 wound (6), 1 failed save (1) → 1 damage to closest model
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // The damage event should show 1 wound lost
    const damageEvent = result.events.find(e => e.type === 'damageApplied');
    expect(damageEvent).toBeDefined();
    const typedDamage = damageEvent as {
      type: string;
      modelId: string;
      woundsLost: number;
      remainingWounds: number;
      destroyed: boolean;
    };
    expect(typedDamage.woundsLost).toBe(1);
    expect(typedDamage.remainingWounds).toBe(1);
    expect(typedDamage.destroyed).toBe(false);

    // No casualties since model survived
    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(0);
  });

  it('should return unchanged state for invalid step index', () => {
    const state = createCombatGameState();
    const combatState = createCombatState();

    const dice = createDiceProvider([]);

    // Step index 99 doesn't exist
    const result = resolveInitiativeStep(
      state, combatState, 99, dice, 4, 3,
    );

    expect(result.state).toBe(state);
    expect(result.combatState).toBe(combatState);
    expect(result.events.length).toBe(0);
  });

  it('should skip already resolved strike groups', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              resolved: true, // Already resolved
            }),
          ],
        }),
      ],
    });

    const dice = createDiceProvider([]); // No dice should be consumed

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Should only have the InitiativeStepResolvedEvent (no hit/wound events)
    const hitEvents = result.events.filter(e => e.type === 'meleeHitTestRoll');
    expect(hitEvents.length).toBe(0);

    // Step should be marked resolved
    expect(result.combatState.initiativeSteps[0].resolved).toBe(true);
  });

  it('should generate wound test events when hits are scored', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
            }),
          ],
        }),
      ],
    });

    // 2 hits (5, 6), then wounds: 4+ needed, rolls 5, 2 (1 wound, 1 fail)
    // Save on wound: roll 1 (fail 3+)
    const dice = createDiceProvider([5, 6, 5, 2, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const woundEvent = result.events.find(e => e.type === 'meleeWoundTestRoll');
    expect(woundEvent).toBeDefined();
    const typedWound = woundEvent as {
      type: string;
      rolls: number[];
      targetNumber: number;
      strength: number;
      toughness: number;
      wounds: number;
      failures: number;
    };
    expect(typedWound.rolls).toEqual([5, 2]);
    expect(typedWound.wounds).toBe(1);
    expect(typedWound.failures).toBe(1);
    expect(typedWound.strength).toBe(4);
    expect(typedWound.toughness).toBe(4);
  });

  it('should generate saving throw events for each wound', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
              weaponAP: null,
            }),
          ],
        }),
      ],
    });

    // 2 hits, 2 wounds, then 2 save rolls
    const dice = createDiceProvider([6, 6, 6, 6, 3, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const saveEvents = result.events.filter(e => e.type === 'savingThrowRoll');
    expect(saveEvents.length).toBe(2);

    const save1 = saveEvents[0] as { type: string; roll: number; passed: boolean; targetNumber: number };
    expect(save1.roll).toBe(3);
    expect(save1.passed).toBe(true); // 3 >= 3 (save 3+)
    expect(save1.targetNumber).toBe(3);

    const save2 = saveEvents[1] as { type: string; roll: number; passed: boolean; targetNumber: number };
    expect(save2.roll).toBe(1);
    expect(save2.passed).toBe(false); // 1 < 3
  });

  it('should generate casualty removed event when model is destroyed', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 1 hit, 1 wound, failed save → model destroyed (1W model)
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const casualtyEvent = result.events.find(e => e.type === 'casualtyRemoved');
    expect(casualtyEvent).toBeDefined();
    const typedCasualty = casualtyEvent as { type: string; modelId: string; unitId: string };
    expect(typedCasualty.unitId).toBe('defender-unit');
  });

  it('should track active player casualties when targeting active player unit', () => {
    const state = createCombatGameState();
    // Reactive player attacks active player's unit
    const combatState = createCombatState({
      activePlayerUnitIds: ['attacker-unit'],
      reactivePlayerUnitIds: ['defender-unit'],
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['defender-m0'],
          strikeGroups: [
            createStrikeGroup({
              index: 0,
              attackerModelIds: ['defender-m0'],
              targetUnitId: 'attacker-unit', // Targeting active player's unit
              totalAttacks: 1,
              weaponDamage: 1,
              attackerPlayerIndex: 1,
            }),
          ],
        }),
      ],
    });

    // 1 hit, 1 wound, failed save
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Casualty should be on the active player side
    expect(result.activePlayerCasualtiesThisStep.length).toBe(1);
    expect(result.combatState.activePlayerCasualties.length).toBe(1);
    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(0);
  });

  it('should accumulate casualties with existing combatState casualties', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      reactivePlayerCasualties: ['previous-casualty-1'], // Pre-existing casualty
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 1 hit, 1 wound, failed save
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Should have previous casualty + new one
    expect(result.combatState.reactivePlayerCasualties.length).toBe(2);
    expect(result.combatState.reactivePlayerCasualties).toContain('previous-casualty-1');
  });

  it('should handle no hits (all misses skip wound/save/damage)', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 3,
            }),
          ],
        }),
      ],
    });

    // All misses
    const dice = createDiceProvider([1, 1, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Should have hit event and resolved event, but NO wound, save, or damage events
    const hitEvent = result.events.find(e => e.type === 'meleeHitTestRoll');
    expect(hitEvent).toBeDefined();

    const woundEvents = result.events.filter(e => e.type === 'meleeWoundTestRoll');
    expect(woundEvents.length).toBe(0);

    const saveEvents = result.events.filter(e => e.type === 'savingThrowRoll');
    expect(saveEvents.length).toBe(0);

    const damageEvents = result.events.filter(e => e.type === 'damageApplied');
    expect(damageEvents.length).toBe(0);

    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(0);
  });

  it('should handle no wounds after hits (skip save/damage)', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
            }),
          ],
        }),
      ],
    });

    // 2 hits (6, 6), then 2 wound rolls (1, 1) — all fail to wound at 4+
    const dice = createDiceProvider([6, 6, 1, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    // Should have hit event and wound event but NO save or damage events
    const woundEvents = result.events.filter(e => e.type === 'meleeWoundTestRoll');
    expect(woundEvents.length).toBe(1);

    const saveEvents = result.events.filter(e => e.type === 'savingThrowRoll');
    expect(saveEvents.length).toBe(0);

    const damageEvents = result.events.filter(e => e.type === 'damageApplied');
    expect(damageEvents.length).toBe(0);
  });

  it('should handle all saves passed (no damage)', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponStrength: 4,
              weaponAP: null,
            }),
          ],
        }),
      ],
    });

    // 2 hits (6, 6), 2 wounds (6, 6), 2 saves passed (5, 6) on 3+
    const dice = createDiceProvider([6, 6, 6, 6, 5, 6]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const saveEvents = result.events.filter(e => e.type === 'savingThrowRoll');
    expect(saveEvents.length).toBe(2);

    const damageEvents = result.events.filter(e => e.type === 'damageApplied');
    expect(damageEvents.length).toBe(0);

    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(0);
  });

  it('should apply weapon damage correctly for multi-damage weapons', () => {
    const state = createCombatGameState();
    // Defender model has 3 wounds
    state.armies[1].units[0].models = [
      createModel('defender-m0', 11, 10, { currentWounds: 3 }),
      createModel('defender-m1', 11, 11, { currentWounds: 3 }),
    ];

    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
              weaponDamage: 2, // 2 damage per wound
            }),
          ],
        }),
      ],
    });

    // 1 hit, 1 wound, 1 failed save → 2 damage applied
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const damageEvent = result.events.find(e => e.type === 'damageApplied');
    expect(damageEvent).toBeDefined();
    const typedDamage = damageEvent as {
      type: string;
      woundsLost: number;
      remainingWounds: number;
      destroyed: boolean;
    };
    expect(typedDamage.woundsLost).toBe(2);
    expect(typedDamage.remainingWounds).toBe(1);
    expect(typedDamage.destroyed).toBe(false);
  });

  it('should generate damage applied event with correct weapon name', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 1,
              weaponName: 'Power Fist',
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 1 hit, 1 wound, 1 failed save
    const dice = createDiceProvider([6, 6, 1]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, 3,
    );

    const damageEvent = result.events.find(e => e.type === 'damageApplied');
    expect(damageEvent).toBeDefined();
    const typedDamage = damageEvent as { type: string; damageSource: string };
    expect(typedDamage.damageSource).toBe('Power Fist');
  });

  it('should handle defender save of null (no save roll, all wounds go through)', () => {
    const state = createCombatGameState();
    const combatState = createCombatState({
      initiativeSteps: [
        createInitiativeStep({
          modelIds: ['attacker-m0'],
          strikeGroups: [
            createStrikeGroup({
              attackerModelIds: ['attacker-m0'],
              targetUnitId: 'defender-unit',
              totalAttacks: 2,
              weaponDamage: 1,
            }),
          ],
        }),
      ],
    });

    // 2 hits (6, 6), 2 wounds (6, 6), no save (null) → 2 unsaved wounds → 2 casualties
    const dice = createDiceProvider([6, 6, 6, 6]);

    const result = resolveInitiativeStep(
      state, combatState, 0, dice, 4, null, // null save
    );

    // No save events should be generated
    const saveEvents = result.events.filter(e => e.type === 'savingThrowRoll');
    expect(saveEvents.length).toBe(0);

    // Both defender models should be casualties (1W each)
    expect(result.reactivePlayerCasualtiesThisStep.length).toBe(2);
  });
});
