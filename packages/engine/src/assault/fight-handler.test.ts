/**
 * Fight Handler Tests
 * Tests for combat determination, weapon/initiative step setup, and initiative scoring.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Steps 1-2
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
import {
  determineCombats,
  declareWeaponsAndSetInitiativeSteps,
  getCombatInitiativeScore,
} from './fight-handler';
import type { ModelCombatSetup } from './fight-handler';
import type { CombatState } from './assault-types';

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

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createArmy(0, []), createArmy(1, [])],
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
    ...overrides,
  };
}

function createCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    combatId: 'combat-0',
    activePlayerUnitIds: ['unit-0'],
    reactivePlayerUnitIds: ['unit-1'],
    initiativeSteps: [],
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

// ─── determineCombats ────────────────────────────────────────────────────────

describe('determineCombats', () => {
  it('should find a single combat between two engaged units', () => {
    const unit0 = createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
    });
    const unit1 = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
    });

    const state = createGameState({
      armies: [createArmy(0, [unit0]), createArmy(1, [unit1])],
    });

    const result = determineCombats(state);

    expect(result.combats).toHaveLength(1);
    expect(result.combats[0].activePlayerUnitIds).toContain('unit-0');
    expect(result.combats[0].reactivePlayerUnitIds).toContain('unit-1');
  });

  it('should find multiple separate combats', () => {
    const unitA0 = createUnit('unit-a0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-a1'],
    });
    const unitA1 = createUnit('unit-a1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-a0'],
    });
    const unitB0 = createUnit('unit-b0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-b1'],
    });
    const unitB1 = createUnit('unit-b1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-b0'],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [unitA0, unitB0]),
        createArmy(1, [unitA1, unitB1]),
      ],
    });

    const result = determineCombats(state);

    expect(result.combats).toHaveLength(2);
    // Each combat should have one unit per side
    const combatIds = result.combats.map(c => c.combatId);
    expect(combatIds).toContain('combat-0');
    expect(combatIds).toContain('combat-1');
  });

  it('should merge multi-unit combats (A engaged with B, B engaged with C forms one combat)', () => {
    // Unit A (player 0) engaged with Unit B (player 1)
    // Unit C (player 0) also engaged with Unit B (player 1)
    // All three should form one combat
    const unitA = createUnit('unit-a', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-b'],
    });
    const unitC = createUnit('unit-c', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-b'],
    });
    const unitB = createUnit('unit-b', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-a', 'unit-c'],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [unitA, unitC]),
        createArmy(1, [unitB]),
      ],
    });

    const result = determineCombats(state);

    expect(result.combats).toHaveLength(1);
    expect(result.combats[0].activePlayerUnitIds).toContain('unit-a');
    expect(result.combats[0].activePlayerUnitIds).toContain('unit-c');
    expect(result.combats[0].reactivePlayerUnitIds).toContain('unit-b');
  });

  it('should correctly split units into active and reactive player sides', () => {
    const unit0 = createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
    });
    const unit1 = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
    });

    // Active player is 1 this time
    const state = createGameState({
      activePlayerIndex: 1,
      armies: [createArmy(0, [unit0]), createArmy(1, [unit1])],
    });

    const result = determineCombats(state);

    expect(result.combats).toHaveLength(1);
    // Player 1 is active, so unit-1 should be on the active side
    expect(result.combats[0].activePlayerUnitIds).toContain('unit-1');
    expect(result.combats[0].reactivePlayerUnitIds).toContain('unit-0');
  });

  it('should return empty combats when no units are locked in combat', () => {
    const unit0 = createUnit('unit-0', { isLockedInCombat: false });
    const unit1 = createUnit('unit-1', { isLockedInCombat: false });

    const state = createGameState({
      armies: [createArmy(0, [unit0]), createArmy(1, [unit1])],
    });

    const result = determineCombats(state);

    expect(result.combats).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it('should generate CombatDeclaredEvent for each combat', () => {
    const unit0 = createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
    });
    const unit1 = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
    });

    const state = createGameState({
      armies: [createArmy(0, [unit0]), createArmy(1, [unit1])],
    });

    const result = determineCombats(state);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('combatDeclared');

    const event = result.events[0] as { type: string; combatId: string; activePlayerUnitIds: string[]; reactivePlayerUnitIds: string[] };
    expect(event.combatId).toBe('combat-0');
    expect(event.activePlayerUnitIds).toContain('unit-0');
    expect(event.reactivePlayerUnitIds).toContain('unit-1');
  });

  it('should initialize CRP to 0 and resolved to false', () => {
    const unit0 = createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
    });
    const unit1 = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
    });

    const state = createGameState({
      armies: [createArmy(0, [unit0]), createArmy(1, [unit1])],
    });

    const result = determineCombats(state);

    expect(result.combats[0].activePlayerCRP).toBe(0);
    expect(result.combats[0].reactivePlayerCRP).toBe(0);
    expect(result.combats[0].resolved).toBe(false);
    expect(result.combats[0].isMassacre).toBe(false);
    expect(result.combats[0].massacreWinnerPlayerIndex).toBeNull();
    expect(result.combats[0].challengeState).toBeNull();
    expect(result.combats[0].activePlayerCasualties).toHaveLength(0);
    expect(result.combats[0].reactivePlayerCasualties).toHaveLength(0);
  });

  it('should handle units from different armies engaging each other', () => {
    // Multiple units from each army in one big combat
    const unitP0A = createUnit('p0-unit-a', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['p1-unit-a'],
    });
    const unitP0B = createUnit('p0-unit-b', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['p1-unit-b'],
    });
    const unitP1A = createUnit('p1-unit-a', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['p0-unit-a', 'p0-unit-b'],
    });
    const unitP1B = createUnit('p1-unit-b', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['p0-unit-b'],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [unitP0A, unitP0B]),
        createArmy(1, [unitP1A, unitP1B]),
      ],
    });

    const result = determineCombats(state);

    // p0-unit-a <-> p1-unit-a <-> p0-unit-b <-> p1-unit-b forms a connected component
    // because p1-unit-a is engaged with both p0-unit-a and p0-unit-b
    expect(result.combats).toHaveLength(1);
    expect(result.combats[0].activePlayerUnitIds).toHaveLength(2);
    expect(result.combats[0].reactivePlayerUnitIds).toHaveLength(2);
    expect(result.combats[0].activePlayerUnitIds).toContain('p0-unit-a');
    expect(result.combats[0].activePlayerUnitIds).toContain('p0-unit-b');
    expect(result.combats[0].reactivePlayerUnitIds).toContain('p1-unit-a');
    expect(result.combats[0].reactivePlayerUnitIds).toContain('p1-unit-b');
  });
});

// ─── declareWeaponsAndSetInitiativeSteps ─────────────────────────────────────

describe('declareWeaponsAndSetInitiativeSteps', () => {
  it('should create initiative steps sorted highest to lowest', () => {
    const combat = createCombatState();

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 3, weaponName: 'Chainsword' },
      { modelId: 'model-b', initiativeValue: 5, weaponName: 'Power Sword' },
      { modelId: 'model-c', initiativeValue: 1, weaponName: 'Power Fist' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    expect(result.initiativeSteps).toHaveLength(3);
    expect(result.initiativeSteps[0].initiativeValue).toBe(5);
    expect(result.initiativeSteps[1].initiativeValue).toBe(3);
    expect(result.initiativeSteps[2].initiativeValue).toBe(1);
  });

  it('should group models with same initiative into one step', () => {
    const combat = createCombatState();

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 4, weaponName: 'Chainsword' },
      { modelId: 'model-b', initiativeValue: 4, weaponName: 'Chainsword' },
      { modelId: 'model-c', initiativeValue: 4, weaponName: 'Power Sword' },
      { modelId: 'model-d', initiativeValue: 2, weaponName: 'Power Fist' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    expect(result.initiativeSteps).toHaveLength(2);
    // Initiative 4 step should have 3 models
    const step4 = result.initiativeSteps.find(s => s.initiativeValue === 4);
    expect(step4).toBeDefined();
    expect(step4!.modelIds).toHaveLength(3);
    expect(step4!.modelIds).toContain('model-a');
    expect(step4!.modelIds).toContain('model-b');
    expect(step4!.modelIds).toContain('model-c');
    // Initiative 2 step should have 1 model
    const step2 = result.initiativeSteps.find(s => s.initiativeValue === 2);
    expect(step2).toBeDefined();
    expect(step2!.modelIds).toHaveLength(1);
    expect(step2!.modelIds).toContain('model-d');
  });

  it('should handle single initiative value (all models at same initiative)', () => {
    const combat = createCombatState();

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 4, weaponName: 'Chainsword' },
      { modelId: 'model-b', initiativeValue: 4, weaponName: 'Chainsword' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    expect(result.initiativeSteps).toHaveLength(1);
    expect(result.initiativeSteps[0].initiativeValue).toBe(4);
    expect(result.initiativeSteps[0].modelIds).toHaveLength(2);
  });

  it('should set currentInitiativeStepIndex to 0', () => {
    const combat = createCombatState({
      currentInitiativeStepIndex: 5, // start with a non-zero value to prove it resets
    });

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 4, weaponName: 'Chainsword' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    expect(result.currentInitiativeStepIndex).toBe(0);
  });

  it('should preserve existing combat state fields', () => {
    const combat = createCombatState({
      combatId: 'combat-7',
      activePlayerUnitIds: ['alpha', 'bravo'],
      reactivePlayerUnitIds: ['charlie'],
      activePlayerCRP: 3,
      reactivePlayerCRP: 2,
      activePlayerCasualties: ['dead-model-1'],
      reactivePlayerCasualties: ['dead-model-2'],
      resolved: false,
      isMassacre: false,
      massacreWinnerPlayerIndex: null,
    });

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 4, weaponName: 'Chainsword' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    expect(result.combatId).toBe('combat-7');
    expect(result.activePlayerUnitIds).toEqual(['alpha', 'bravo']);
    expect(result.reactivePlayerUnitIds).toEqual(['charlie']);
    expect(result.activePlayerCRP).toBe(3);
    expect(result.reactivePlayerCRP).toBe(2);
    expect(result.activePlayerCasualties).toEqual(['dead-model-1']);
    expect(result.reactivePlayerCasualties).toEqual(['dead-model-2']);
    expect(result.resolved).toBe(false);
    expect(result.isMassacre).toBe(false);
    expect(result.massacreWinnerPlayerIndex).toBeNull();
  });

  it('should initialize each step with empty strikeGroups and resolved false', () => {
    const combat = createCombatState();

    const modelSetups: ModelCombatSetup[] = [
      { modelId: 'model-a', initiativeValue: 5, weaponName: 'Power Sword' },
      { modelId: 'model-b', initiativeValue: 3, weaponName: 'Chainsword' },
    ];

    const result = declareWeaponsAndSetInitiativeSteps(combat, modelSetups);

    for (const step of result.initiativeSteps) {
      expect(step.strikeGroups).toEqual([]);
      expect(step.resolved).toBe(false);
    }
  });
});

// ─── getCombatInitiativeScore ────────────────────────────────────────────────

describe('getCombatInitiativeScore', () => {
  it('should return base + modifier normally', () => {
    const score = getCombatInitiativeScore(4, 1, false);
    expect(score).toBe(5);
  });

  it('should force to 1 when hasAnyTacticalStatus is true', () => {
    const score = getCombatInitiativeScore(4, 1, true);
    expect(score).toBe(1);
  });

  it('should not go below 1', () => {
    // base 2, modifier -5 would give -3, but minimum is 1
    const score = getCombatInitiativeScore(2, -5, false);
    expect(score).toBe(1);
  });

  it('should handle zero modifier', () => {
    const score = getCombatInitiativeScore(4, 0, false);
    expect(score).toBe(4);
  });

  it('should handle large initiative values', () => {
    const score = getCombatInitiativeScore(10, 5, false);
    expect(score).toBe(15);
  });

  it('should return 1 for tactical status even with high base and modifier', () => {
    const score = getCombatInitiativeScore(10, 5, true);
    expect(score).toBe(1);
  });

  it('should clamp to 1 when base is 0 and modifier is negative', () => {
    const score = getCombatInitiativeScore(0, -3, false);
    expect(score).toBe(1);
  });

  it('should handle base initiative of 1 with zero modifier', () => {
    const score = getCombatInitiativeScore(1, 0, false);
    expect(score).toBe(1);
  });

  it('should handle negative modifier that results in exactly 1', () => {
    const score = getCombatInitiativeScore(4, -3, false);
    expect(score).toBe(1);
  });

  it('should handle base initiative of 1 with positive modifier', () => {
    const score = getCombatInitiativeScore(1, 2, false);
    expect(score).toBe(3);
  });
});
