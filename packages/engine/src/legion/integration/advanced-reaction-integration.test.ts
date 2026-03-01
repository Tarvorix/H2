/**
 * Advanced Reaction System — Integration Tests
 *
 * Tests end-to-end integration of the advanced reaction system:
 *   1. Registration completeness (all 20 reactions registered)
 *   2. Movement trigger detection (WS Chasing the Wind, IF Bastion of Fire)
 *   3. Shooting trigger detection (various legion reactions at correct steps)
 *   4. Once-per-battle enforcement (available first time, denied after use)
 *   5. Resolution produces valid results (events emitted, state changes applied)
 *   6. Cross-system interaction (reaction deducts allotment, marks reacted)
 *   7. Non-triggering scenarios (wrong legion, wrong phase, wrong step)
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections, "Advanced Reaction" subsections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  AdvancedReactionUsage,
} from '@hh/types';
import {
  LegionFaction,
  Phase,
  SubPhase,
  Allegiance,
  UnitMovementState,
} from '@hh/types';
import { FixedDiceProvider } from '../../dice';
import {
  registerAllAdvancedReactions,
  clearAdvancedReactionRegistry,
  isAdvancedReactionAvailable,
  hasAdvancedReactionBeenUsed,
  checkMovementAdvancedReactionTriggers,
  checkShootingAdvancedReactionTriggers,
  checkAssaultAdvancedReactionTriggers,
  resolveAdvancedReaction,
  getRegisteredAdvancedReactions,
} from '../advanced-reaction-registry';
import type {
  AdvancedReactionDeclaredEvent,
  AdvancedReactionResolvedEvent,
  ModelMovedEvent,
} from '../../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(id: string, x: number, y: number, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'test-profile',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['boltgun'],
    isWarlord: false,
    ...overrides,
  };
}

function makeUnit(id: string, options?: Partial<UnitState>): UnitState {
  return {
    id,
    profileId: 'test-profile',
    models: [makeModel(`${id}-m1`, 10, 10)],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...options,
  };
}

function makeArmy(
  playerIndex: number,
  faction: LegionFaction,
  allegiance: Allegiance = Allegiance.Loyalist,
  units: UnitState[] = [],
): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex}`,
    faction,
    allegiance,
    units,
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
  } as ArmyState;
}

function makeTestState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: 'integration-test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [
      makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
        makeUnit('active-u1'),
      ]),
      makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
        makeUnit('reactive-u1'),
      ]),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
    ...overrides,
  } as GameState;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Advanced Reaction System — Integration Tests', () => {
  beforeEach(() => {
    clearAdvancedReactionRegistry();
    registerAllAdvancedReactions();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. REGISTRATION COMPLETENESS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration completeness', () => {
    it('should register exactly 20 advanced reactions', () => {
      const registered = getRegisteredAdvancedReactions();
      expect(registered.length).toBe(20);
    });

    it('should register all 18 standard legion reactions', () => {
      const registered = getRegisteredAdvancedReactions();
      const standardIds = [
        'da-vengeance',
        'ec-perfect-counter',
        'iw-bitter-fury',
        'ws-chasing-wind',
        'sw-bestial-savagery',
        'if-bastion-of-fire',
        'nl-better-part',
        'ba-wrath-of-angels',
        'ih-spite-of-gorgon',
        'we-brutal-tide',
        'um-retribution-strike',
        'dg-barbaran-endurance',
        'ts-fortress-of-mind',
        'soh-warrior-pride',
        'wb-glorious-martyrdom',
        'sal-selfless-burden',
        'rg-shadow-veil',
        'al-smoke-and-mirrors',
      ];
      for (const id of standardIds) {
        expect(registered).toContain(id);
      }
    });

    it('should register both Hereticus reactions', () => {
      const registered = getRegisteredAdvancedReactions();
      expect(registered).toContain('ec-h-twisted-desire');
      expect(registered).toContain('we-h-furious-charge');
    });

    it('should not have duplicate registrations after calling registerAllAdvancedReactions twice', () => {
      registerAllAdvancedReactions();
      const registered = getRegisteredAdvancedReactions();
      expect(registered.length).toBe(20);
      // Verify uniqueness
      const uniqueIds = new Set(registered);
      expect(uniqueIds.size).toBe(20);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MOVEMENT TRIGGER DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Movement trigger detection', () => {
    it('should trigger White Scars Chasing the Wind when enemy moves within 12 inches', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('ws-chasing-wind');
      expect(result!.eligibleUnitIds).toContain('reactive-u1');
    });

    it('should trigger Imperial Fists Bastion of Fire when enemy moves within 10 inches', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 18, 10)] }),
          ]),
          makeArmy(1, LegionFaction.ImperialFists, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('if-bastion-of-fire');
      expect(result!.eligibleUnitIds).toContain('reactive-u1');
    });

    it('should return multiple eligible units when several are within range', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('ws-unit-1', { models: [makeModel('ws-m1', 10, 10)] }),
            makeUnit('ws-unit-2', { models: [makeModel('ws-m2', 12, 10)] }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('ws-chasing-wind');
      expect(result!.eligibleUnitIds).toContain('ws-unit-1');
      expect(result!.eligibleUnitIds).toContain('ws-unit-2');
      expect(result!.eligibleUnitIds.length).toBe(2);
    });

    it('should not trigger when enemy is beyond the range threshold', () => {
      // White Scars range is 12". Place units 20" apart.
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SHOOTING TRIGGER DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Shooting trigger detection', () => {
    it('should trigger Iron Warriors Bitter Fury at shooting step 3', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('iw-bitter-fury');
      expect(result!.eligibleUnitIds).toContain('target-u1');
    });

    it('should trigger Blood Angels Wrath of Angels at shooting step 4', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.BloodAngels, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 4);

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('ba-wrath-of-angels');
      expect(result!.eligibleUnitIds).toContain('target-u1');
    });

    it('should trigger Word Bearers Glorious Martyrdom at shooting step 5', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WordBearers, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 5);

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('wb-glorious-martyrdom');
      expect(result!.eligibleUnitIds).toContain('target-u1');
    });

    it('should trigger Ultramarines Retribution Strike with a different unit than target', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.Ultramarines, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
            makeUnit('retribution-u1', { models: [makeModel('retrib-m1', 12, 10)] }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);

      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('um-retribution-strike');
      // The eligible unit must NOT be the target itself
      expect(result!.eligibleUnitIds).not.toContain('target-u1');
      expect(result!.eligibleUnitIds).toContain('retribution-u1');
    });

    it('should not trigger when shooting at the wrong step for a legion', () => {
      // Iron Warriors triggers at step 3, not step 5
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 5);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ONCE-PER-BATTLE ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Once-per-battle enforcement', () => {
    it('should allow a reaction that has not been used yet', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
        advancedReactionsUsed: [],
      });

      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(true);
      expect(hasAdvancedReactionBeenUsed(state, 'da-vengeance', 1)).toBe(false);
    });

    it('should deny a once-per-battle reaction after it has been used', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'da-vengeance', playerIndex: 1, battleTurn: 1 },
        ],
      });

      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(false);
      expect(hasAdvancedReactionBeenUsed(state, 'da-vengeance', 1)).toBe(true);
    });

    it('should record usage after successful resolution and block subsequent use', () => {
      // Step 1: Resolve the reaction successfully
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);

      // Step 2: Verify usage was recorded
      expect(hasAdvancedReactionBeenUsed(result.state, 'ws-chasing-wind', 1)).toBe(true);

      // Step 3: Verify reaction is no longer available
      expect(isAdvancedReactionAvailable(result.state, 'ws-chasing-wind', 1)).toBe(false);
    });

    it('should not record usage after failed resolution', () => {
      // ws-chasing-wind handler returns success:false when the reacting unit has no alive models
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', {
              models: [
                makeModel('reactive-m1', 10, 10, { isDestroyed: true, currentWounds: 0 }),
              ],
            }),
          ]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      // The reactive unit exists but has all models destroyed — handler returns success:false
      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      // The reaction was declared (accepted:true) but the effect failed
      expect(result.accepted).toBe(true);
      expect(hasAdvancedReactionBeenUsed(result.state, 'ws-chasing-wind', 1)).toBe(false);
      // Reaction should still be available for future use since it failed
      expect(isAdvancedReactionAvailable(result.state, 'ws-chasing-wind', 1)).toBe(true);
    });

    it('should allow one player to use a reaction even if the other player already used the same legion reaction', () => {
      // Both players are Dark Angels (hypothetical mirror match)
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'da-vengeance', playerIndex: 0, battleTurn: 1 },
        ],
      });

      // Player 0 used it already — player 1 should still have access
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 0)).toBe(false);
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(true);
    });

    it('should not block trigger detection after the reaction has been used once per battle', () => {
      // Iron Warriors Bitter Fury is once-per-battle; after use, triggers should return null
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'iw-bitter-fury', playerIndex: 1, battleTurn: 1 },
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RESOLUTION PRODUCES VALID RESULTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Resolution produces valid results', () => {
    it('should emit advancedReactionDeclared and advancedReactionResolved events on successful resolution', () => {
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      expect(result.errors.length).toBe(0);

      const declaredEvents = result.events.filter(e => e.type === 'advancedReactionDeclared');
      const resolvedEvents = result.events.filter(e => e.type === 'advancedReactionResolved');

      expect(declaredEvents.length).toBe(1);
      expect(resolvedEvents.length).toBe(1);

      const declared = declaredEvents[0] as AdvancedReactionDeclaredEvent;
      expect(declared.reactionId).toBe('ws-chasing-wind');
      expect(declared.reactionName).toBe('Chasing the Wind');
      expect(declared.reactingUnitId).toBe('reactive-u1');
      expect(declared.triggerSourceUnitId).toBe('active-u1');
      expect(declared.playerIndex).toBe(1);

      const resolved = resolvedEvents[0] as AdvancedReactionResolvedEvent;
      expect(resolved.reactionId).toBe('ws-chasing-wind');
      expect(resolved.success).toBe(true);
      expect(resolved.effectsSummary).toBeDefined();
      expect(resolved.effectsSummary.length).toBeGreaterThan(0);
    });

    it('should produce modelMoved events when resolving WS Chasing the Wind', () => {
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 20, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 5, 10)] }),
          ]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);

      const movedEvents = result.events.filter(e => e.type === 'modelMoved') as ModelMovedEvent[];
      expect(movedEvents.length).toBe(1);

      const moved = movedEvents[0];
      expect(moved.modelId).toBe('reactive-m1');
      expect(moved.unitId).toBe('reactive-u1');
      expect(moved.fromPosition).toEqual({ x: 5, y: 10 });
      // Model at (5,10) moves 7" toward enemy at (20,10) — straight horizontal
      expect(moved.toPosition.x).toBeCloseTo(12, 1);
      expect(moved.toPosition.y).toBeCloseTo(10, 1);
      expect(moved.distanceMoved).toBeCloseTo(7, 1);
    });

    it('should produce fireGroupResolved and damageApplied events when resolving IF Bastion of Fire with hits', () => {
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 18, 10, { currentWounds: 2 })] }),
          ]),
          makeArmy(1, LegionFaction.ImperialFists, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      // Roll 4 to hit (passes at BS4), roll 4 to wound (passes at S4 vs T4)
      const dice = new FixedDiceProvider([4, 4]);

      const result = resolveAdvancedReaction(state, 'if-bastion-of-fire', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);

      const fireGroupEvents = result.events.filter(e => e.type === 'fireGroupResolved');
      expect(fireGroupEvents.length).toBe(1);
      const fireGroup = fireGroupEvents[0] as any;
      expect(fireGroup.totalHits).toBe(1);
      expect(fireGroup.totalWounds).toBe(1);

      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(1);
      const damage = damageEvents[0] as any;
      expect(damage.modelId).toBe('active-m1');
      expect(damage.unitId).toBe('active-u1');
      expect(damage.woundsLost).toBe(1);
    });

    it('should return error result for unknown reaction ID during resolution', () => {
      const state = makeTestState();
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'nonexistent-reaction', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('UNKNOWN_REACTION');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CROSS-SYSTEM INTERACTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-system interaction', () => {
    it('should deduct reaction allotment after successful resolution', () => {
      const army1 = makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
        makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
      ]);
      army1.reactionAllotmentRemaining = 3;

      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          army1,
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      // ws-chasing-wind has cost: 1, so 3 - 1 = 2
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(2);
    });

    it('should mark the reacting unit as having reacted this turn', () => {
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      const reactedUnit = result.state.armies[1].units.find(u => u.id === 'reactive-u1');
      expect(reactedUnit!.hasReactedThisTurn).toBe(true);
    });

    it('should clear the awaitingReaction flag after successful resolution', () => {
      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
    });

    it('should not deduct allotment after failed resolution', () => {
      const army1 = makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
        makeUnit('reactive-u1', {
          models: [
            makeModel('reactive-m1', 10, 10, { isDestroyed: true, currentWounds: 0 }),
          ],
        }),
      ]);
      army1.reactionAllotmentRemaining = 3;

      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          army1,
        ],
      });
      const dice = new FixedDiceProvider([]);

      // Unit exists but has all models destroyed — handler returns success:false
      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      // Allotment should remain unchanged since the handler returned success:false
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(3);
    });

    it('should deny reaction when army has zero reaction allotment remaining', () => {
      const army1 = makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
        makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
      ]);
      army1.reactionAllotmentRemaining = 0;

      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          army1,
        ],
      });

      expect(isAdvancedReactionAvailable(state, 'ws-chasing-wind', 1)).toBe(false);

      // Also verify trigger check returns null since no allotment
      const triggerResult = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(triggerResult).toBeNull();
    });

    it('should prevent a unit that has already reacted from being eligible for trigger detection', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', {
              models: [makeModel('reactive-m1', 10, 10)],
              hasReactedThisTurn: true,
            }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. NON-TRIGGERING SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Non-triggering scenarios', () => {
    it('should not trigger movement reactions for a legion without movement-triggered reactions', () => {
      // Iron Warriors have a shooting reaction, not a movement reaction
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');

      expect(result).toBeNull();
    });

    it('should not trigger shooting reactions for a legion without shooting-triggered reactions', () => {
      // Dark Angels have an assault reaction (da-vengeance), not a shooting one
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      // Try all steps 3-5 — Dark Angels have no shooting reaction
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3)).toBeNull();
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 4)).toBeNull();
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 5)).toBeNull();
    });

    it('should not trigger assault reactions for wrong trigger type', () => {
      // Emperor's Children perfect-counter is duringChargeStep step 3
      // Try afterLastInitiativeStep instead
      const state = makeTestState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('charger-u1', { models: [makeModel('charger-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      const result = checkAssaultAdvancedReactionTriggers(
        state,
        'afterLastInitiativeStep',
        'charger-u1',
        'target-u1',
      );

      // Emperor's Children have duringChargeStep, not afterLastInitiativeStep
      expect(result).toBeNull();
    });

    it('should not trigger when the reactive army faction does not match any registered reaction', () => {
      // Use a faction that has no shooting reactions and check shooting triggers
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });

      // Emperor's Children have assault reactions (perfect counter, twisted desire), not shooting
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3)).toBeNull();
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 4)).toBeNull();
      expect(checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 5)).toBeNull();
    });

    it('should not trigger Hereticus reaction when allegiance is Loyalist', () => {
      // ec-h-twisted-desire requires Traitor allegiance
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });

      expect(isAdvancedReactionAvailable(state, 'ec-h-twisted-desire', 1)).toBe(false);
    });

    it('should allow Hereticus reaction when allegiance is Traitor', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Traitor, [makeUnit('reactive-u1')]),
        ],
      });

      expect(isAdvancedReactionAvailable(state, 'ec-h-twisted-desire', 1)).toBe(true);
    });

    it('should not trigger when target unit belongs to the active player, not the reactive player', () => {
      // Shooting trigger: the target unit should belong to the reactive player
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
            makeUnit('friendly-u1', { models: [makeModel('friendly-m1', 10, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 20, 10)] }),
          ]),
        ],
      });

      // Targeting a unit that belongs to the active player (index 0), not the reactive player (index 1)
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'friendly-u1', 3);

      expect(result).toBeNull();
    });

    it('should not trigger when target unit cannot react (has already reacted)', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', {
              models: [makeModel('target-m1', 10, 10)],
              hasReactedThisTurn: true,
            }),
          ]),
        ],
      });

      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);

      expect(result).toBeNull();
    });
  });
});
