/**
 * Assault State Helpers & Game Queries Tests
 * Tests for assault-specific state helpers (state-helpers.ts) and
 * game queries (game-queries.ts) used throughout the Assault Phase.
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  TacticalStatus,
  Allegiance,
  LegionFaction,
} from '@hh/types';
import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  AssaultAttackState,
  AssaultCombatState,
} from '@hh/types';

import {
  setAssaultAttackState,
  clearAssaultAttackState,
  updateAssaultAttackState,
  setActiveCombats,
  clearActiveCombats,
  updateCombat,
  lockUnitsInCombat,
  unlockFromCombat,
  applyDisgraced,
} from '../state-helpers';

import {
  isAssaultPhase,
  hasActiveAssaultAttack,
  canUnitCharge,
  isDisorderedCharge,
  getLockedInCombatUnits,
  getCombatParticipants,
  isModelInBaseContact,
  getEngagedModels,
  getMajorityWS,
  getCombatInitiative,
  getDistanceBetween,
  getClosestModelDistance,
  hasLOSToUnit,
  getModelsWithLOSToUnit,
} from '../game-queries';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ModelState> = {},
): ModelState {
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

function createUnit(
  id: string,
  models: ModelState[],
  overrides: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    profileId: 'tactical',
    models,
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

function createArmy(
  playerIndex: number,
  units: UnitState[],
  overrides: Partial<ArmyState> = {},
): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `P${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createArmy(0, []), createArmy(1, [])],
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
    ...overrides,
  };
}

function createAttackState(
  overrides: Partial<AssaultAttackState> = {},
): AssaultAttackState {
  return {
    chargingUnitId: 'unit-a',
    targetUnitId: 'unit-b',
    chargerPlayerIndex: 0,
    chargeStep: 'DECLARING',
    setupMoveDistance: 0,
    chargeRoll: 0,
    isDisordered: false,
    chargeCompleteViaSetup: false,
    overwatchResolved: false,
    closestDistance: 10,
    modelsWithLOS: [],
    ...overrides,
  };
}

function createCombatState(
  overrides: Partial<AssaultCombatState> = {},
): AssaultCombatState {
  return {
    combatId: 'combat-1',
    activePlayerUnitIds: ['unit-a'],
    reactivePlayerUnitIds: ['unit-b'],
    activePlayerCRP: 0,
    reactivePlayerCRP: 0,
    activePlayerCasualties: [],
    reactivePlayerCasualties: [],
    resolved: false,
    isMassacre: false,
    challengeState: null,
    ...overrides,
  };
}

// ─── State Helpers ───────────────────────────────────────────────────────────

describe('Assault State Helpers', () => {
  // ── setAssaultAttackState ──────────────────────────────────────────────

  describe('setAssaultAttackState', () => {
    it('sets assaultAttackState on the game state', () => {
      const state = createGameState();
      const attackState = createAttackState({
        chargingUnitId: 'u1',
        targetUnitId: 'u2',
      });
      const result = setAssaultAttackState(state, attackState);
      expect(result.assaultAttackState).toEqual(attackState);
    });

    it('replaces an existing assaultAttackState', () => {
      const state = createGameState({
        assaultAttackState: createAttackState({ chargingUnitId: 'old' }),
      });
      const newAttack = createAttackState({ chargingUnitId: 'new' });
      const result = setAssaultAttackState(state, newAttack);
      expect(result.assaultAttackState?.chargingUnitId).toBe('new');
    });
  });

  // ── clearAssaultAttackState ────────────────────────────────────────────

  describe('clearAssaultAttackState', () => {
    it('clears assaultAttackState to undefined', () => {
      const state = createGameState({
        assaultAttackState: createAttackState(),
      });
      const result = clearAssaultAttackState(state);
      expect(result.assaultAttackState).toBeUndefined();
    });

    it('is safe to call when already undefined', () => {
      const state = createGameState();
      const result = clearAssaultAttackState(state);
      expect(result.assaultAttackState).toBeUndefined();
    });
  });

  // ── updateAssaultAttackState ───────────────────────────────────────────

  describe('updateAssaultAttackState', () => {
    it('updates existing assaultAttackState via updater function', () => {
      const state = createGameState({
        assaultAttackState: createAttackState({ chargeRoll: 0 }),
      });
      const result = updateAssaultAttackState(state, a => ({
        ...a,
        chargeRoll: 7,
      }));
      expect(result.assaultAttackState?.chargeRoll).toBe(7);
    });

    it('is a no-op when assaultAttackState is undefined', () => {
      const state = createGameState();
      const result = updateAssaultAttackState(state, a => ({
        ...a,
        chargeRoll: 99,
      }));
      expect(result.assaultAttackState).toBeUndefined();
      expect(result).toBe(state); // same reference — untouched
    });
  });

  // ── setActiveCombats ───────────────────────────────────────────────────

  describe('setActiveCombats', () => {
    it('sets activeCombats on the game state', () => {
      const state = createGameState();
      const combats = [createCombatState({ combatId: 'c1' })];
      const result = setActiveCombats(state, combats);
      expect(result.activeCombats).toHaveLength(1);
      expect(result.activeCombats![0].combatId).toBe('c1');
    });

    it('sets an empty array of combats', () => {
      const state = createGameState();
      const result = setActiveCombats(state, []);
      expect(result.activeCombats).toEqual([]);
    });
  });

  // ── clearActiveCombats ─────────────────────────────────────────────────

  describe('clearActiveCombats', () => {
    it('clears activeCombats to undefined', () => {
      const state = createGameState({
        activeCombats: [createCombatState()],
      });
      const result = clearActiveCombats(state);
      expect(result.activeCombats).toBeUndefined();
    });

    it('is safe to call when already undefined', () => {
      const state = createGameState();
      const result = clearActiveCombats(state);
      expect(result.activeCombats).toBeUndefined();
    });
  });

  // ── updateCombat ───────────────────────────────────────────────────────

  describe('updateCombat', () => {
    it('updates a specific combat by combatId', () => {
      const state = createGameState({
        activeCombats: [
          createCombatState({ combatId: 'c1', activePlayerCRP: 0 }),
          createCombatState({ combatId: 'c2', activePlayerCRP: 0 }),
        ],
      });
      const result = updateCombat(state, 'c1', c => ({
        ...c,
        activePlayerCRP: 5,
      }));
      expect(result.activeCombats![0].activePlayerCRP).toBe(5);
      expect(result.activeCombats![1].activePlayerCRP).toBe(0); // untouched
    });

    it('is a no-op when activeCombats is undefined', () => {
      const state = createGameState();
      const result = updateCombat(state, 'c1', c => ({
        ...c,
        activePlayerCRP: 99,
      }));
      expect(result.activeCombats).toBeUndefined();
      expect(result).toBe(state);
    });

    it('does not modify combats when combatId is not found', () => {
      const state = createGameState({
        activeCombats: [createCombatState({ combatId: 'c1', activePlayerCRP: 2 })],
      });
      const result = updateCombat(state, 'nonexistent', c => ({
        ...c,
        activePlayerCRP: 99,
      }));
      expect(result.activeCombats![0].activePlayerCRP).toBe(2);
    });
  });

  // ── lockUnitsInCombat ──────────────────────────────────────────────────

  describe('lockUnitsInCombat', () => {
    it('sets isLockedInCombat=true and populates engagedWithUnitIds on both units', () => {
      const unitA = createUnit('unit-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('unit-b', [createModel('b-m0', 1, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      const result = lockUnitsInCombat(state, 'unit-a', 'unit-b');

      const rA = result.armies[0].units.find(u => u.id === 'unit-a')!;
      const rB = result.armies[1].units.find(u => u.id === 'unit-b')!;

      expect(rA.isLockedInCombat).toBe(true);
      expect(rA.engagedWithUnitIds).toContain('unit-b');
      expect(rB.isLockedInCombat).toBe(true);
      expect(rB.engagedWithUnitIds).toContain('unit-a');
    });

    it('does not duplicate engagement IDs when called twice', () => {
      const unitA = createUnit('unit-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('unit-b', [createModel('b-m0', 1, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      let result = lockUnitsInCombat(state, 'unit-a', 'unit-b');
      result = lockUnitsInCombat(result, 'unit-a', 'unit-b');

      const rA = result.armies[0].units.find(u => u.id === 'unit-a')!;
      expect(rA.engagedWithUnitIds.filter(id => id === 'unit-b')).toHaveLength(1);
    });
  });

  // ── unlockFromCombat ───────────────────────────────────────────────────

  describe('unlockFromCombat', () => {
    it('clears the units isLockedInCombat and removes from engaged partners', () => {
      const unitA = createUnit('unit-a', [createModel('a-m0', 0, 0)], {
        isLockedInCombat: true,
        engagedWithUnitIds: ['unit-b'],
      });
      const unitB = createUnit('unit-b', [createModel('b-m0', 1, 0)], {
        isLockedInCombat: true,
        engagedWithUnitIds: ['unit-a'],
      });
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      const result = unlockFromCombat(state, 'unit-a');

      const rA = result.armies[0].units.find(u => u.id === 'unit-a')!;
      const rB = result.armies[1].units.find(u => u.id === 'unit-b')!;

      expect(rA.isLockedInCombat).toBe(false);
      expect(rA.engagedWithUnitIds).toEqual([]);
      expect(rB.engagedWithUnitIds).not.toContain('unit-a');
      // Unit B should also lose locked status when no more engaged units
      expect(rB.isLockedInCombat).toBe(false);
    });

    it('keeps a unit locked if it is still engaged with another unit after unlock', () => {
      const unitA = createUnit('unit-a', [createModel('a-m0', 0, 0)], {
        isLockedInCombat: true,
        engagedWithUnitIds: ['unit-b', 'unit-c'],
      });
      const unitB = createUnit('unit-b', [createModel('b-m0', 1, 0)], {
        isLockedInCombat: true,
        engagedWithUnitIds: ['unit-a'],
      });
      const unitC = createUnit('unit-c', [createModel('c-m0', 1, 1)], {
        isLockedInCombat: true,
        engagedWithUnitIds: ['unit-a'],
      });
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB, unitC])],
      });

      const result = unlockFromCombat(state, 'unit-b');

      const rA = result.armies[0].units.find(u => u.id === 'unit-a')!;
      const rB = result.armies[1].units.find(u => u.id === 'unit-b')!;

      expect(rB.isLockedInCombat).toBe(false);
      expect(rB.engagedWithUnitIds).toEqual([]);
      // Unit A should remain locked — still engaged with unit-c
      expect(rA.isLockedInCombat).toBe(true);
      expect(rA.engagedWithUnitIds).toContain('unit-c');
      expect(rA.engagedWithUnitIds).not.toContain('unit-b');
    });

    it('is a no-op when the unit does not exist', () => {
      const state = createGameState();
      const result = unlockFromCombat(state, 'nonexistent');
      expect(result).toBe(state);
    });
  });

  // ── applyDisgraced ─────────────────────────────────────────────────────

  describe('applyDisgraced', () => {
    it('adds WS and LD multiply(0.5) modifiers to the model', () => {
      const model = createModel('m1', 5, 5);
      const unit = createUnit('u1', [model]);
      const state = createGameState({
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const result = applyDisgraced(state, 'm1');
      const resultModel = result.armies[0].units[0].models[0];

      const wsModifier = resultModel.modifiers.find(m => m.characteristic === 'WS');
      const ldModifier = resultModel.modifiers.find(m => m.characteristic === 'LD');

      expect(wsModifier).toBeDefined();
      expect(wsModifier!.operation).toBe('multiply');
      expect(wsModifier!.value).toBe(0.5);
      expect(wsModifier!.source).toBe('Disgraced');
      expect(wsModifier!.expiresAt).toEqual({
        type: 'endOfPhase',
        phase: Phase.Assault,
      });

      expect(ldModifier).toBeDefined();
      expect(ldModifier!.operation).toBe('multiply');
      expect(ldModifier!.value).toBe(0.5);
      expect(ldModifier!.source).toBe('Disgraced');
    });
  });
});

// ─── Game Queries ────────────────────────────────────────────────────────────

describe('Assault Game Queries', () => {
  // ── isAssaultPhase ─────────────────────────────────────────────────────

  describe('isAssaultPhase', () => {
    it('returns true when currentPhase is Assault', () => {
      const state = createGameState({ currentPhase: Phase.Assault });
      expect(isAssaultPhase(state)).toBe(true);
    });

    it('returns false for other phases', () => {
      const state = createGameState({ currentPhase: Phase.Movement });
      expect(isAssaultPhase(state)).toBe(false);
    });
  });

  // ── hasActiveAssaultAttack ─────────────────────────────────────────────

  describe('hasActiveAssaultAttack', () => {
    it('returns true when assaultAttackState is defined', () => {
      const state = createGameState({
        assaultAttackState: createAttackState(),
      });
      expect(hasActiveAssaultAttack(state)).toBe(true);
    });

    it('returns false when assaultAttackState is undefined', () => {
      const state = createGameState();
      expect(hasActiveAssaultAttack(state)).toBe(false);
    });
  });

  // ── canUnitCharge ──────────────────────────────────────────────────────

  describe('canUnitCharge', () => {
    it('returns true for an eligible unit', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)]);
      expect(canUnitCharge(unit)).toBe(true);
    });

    it('returns false if the unit is not deployed', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        isDeployed: false,
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if the unit is embarked', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        embarkedOnId: 'transport-1',
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if the unit Rushed this turn', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        movementState: UnitMovementState.Rushed,
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if the unit is already locked in combat', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        isLockedInCombat: true,
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if the unit is Pinned', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        statuses: [TacticalStatus.Pinned],
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if the unit is Routed', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        statuses: [TacticalStatus.Routed],
      });
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns false if all models are destroyed', () => {
      const unit = createUnit('u1', [
        createModel('m1', 0, 0, { isDestroyed: true }),
        createModel('m2', 1, 0, { isDestroyed: true }),
      ]);
      expect(canUnitCharge(unit)).toBe(false);
    });

    it('returns true if at least one model is alive', () => {
      const unit = createUnit('u1', [
        createModel('m1', 0, 0, { isDestroyed: true }),
        createModel('m2', 1, 0, { isDestroyed: false }),
      ]);
      expect(canUnitCharge(unit)).toBe(true);
    });
  });

  // ── isDisorderedCharge ─────────────────────────────────────────────────

  describe('isDisorderedCharge', () => {
    it('returns true when unit has any statuses', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        statuses: [TacticalStatus.Suppressed],
      });
      expect(isDisorderedCharge(unit)).toBe(true);
    });

    it('returns false when unit has no statuses', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        statuses: [],
      });
      expect(isDisorderedCharge(unit)).toBe(false);
    });
  });

  // ── getLockedInCombatUnits ─────────────────────────────────────────────

  describe('getLockedInCombatUnits', () => {
    it('returns units with isLockedInCombat=true from both armies', () => {
      const lockedA = createUnit('u-a', [createModel('a-m', 0, 0)], {
        isLockedInCombat: true,
      });
      const freeA = createUnit('u-free', [createModel('f-m', 5, 5)]);
      const lockedB = createUnit('u-b', [createModel('b-m', 1, 0)], {
        isLockedInCombat: true,
      });
      const state = createGameState({
        armies: [createArmy(0, [lockedA, freeA]), createArmy(1, [lockedB])],
      });

      const result = getLockedInCombatUnits(state);
      expect(result).toHaveLength(2);
      expect(result.map(u => u.id)).toContain('u-a');
      expect(result.map(u => u.id)).toContain('u-b');
    });

    it('returns empty array when no units are locked', () => {
      const state = createGameState({
        armies: [
          createArmy(0, [createUnit('u1', [createModel('m1', 0, 0)])]),
          createArmy(1, [createUnit('u2', [createModel('m2', 5, 5)])]),
        ],
      });
      expect(getLockedInCombatUnits(state)).toEqual([]);
    });
  });

  // ── getCombatParticipants ──────────────────────────────────────────────

  describe('getCombatParticipants', () => {
    it('returns all units the given unit is engaged with', () => {
      const unitA = createUnit('unit-a', [createModel('a-m', 0, 0)], {
        engagedWithUnitIds: ['unit-b', 'unit-c'],
      });
      const unitB = createUnit('unit-b', [createModel('b-m', 1, 0)]);
      const unitC = createUnit('unit-c', [createModel('c-m', 2, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB, unitC])],
      });

      const participants = getCombatParticipants(state, 'unit-a');
      expect(participants).toHaveLength(2);
      expect(participants.map(u => u.id)).toContain('unit-b');
      expect(participants.map(u => u.id)).toContain('unit-c');
    });

    it('returns empty array for a non-existent unit', () => {
      const state = createGameState();
      expect(getCombatParticipants(state, 'nonexistent')).toEqual([]);
    });

    it('returns empty array for a unit with no engagements', () => {
      const unitA = createUnit('unit-a', [createModel('a-m', 0, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [])],
      });
      expect(getCombatParticipants(state, 'unit-a')).toEqual([]);
    });
  });

  // ── isModelInBaseContact ───────────────────────────────────────────────

  describe('isModelInBaseContact', () => {
    // Base contact threshold: 0.63 * 2 + 0.01 = 1.27"
    it('returns true when models are within base contact distance (<=1.27")', () => {
      const modelA = createModel('a-m0', 10, 10);
      const modelB = createModel('b-m0', 11.2, 10); // 1.2" apart — within threshold
      const unitA = createUnit('unit-a', [modelA]);
      const unitB = createUnit('unit-b', [modelB]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(isModelInBaseContact(state, 'a-m0', 'unit-b')).toBe(true);
    });

    it('returns false when models are beyond base contact distance', () => {
      const modelA = createModel('a-m0', 10, 10);
      const modelB = createModel('b-m0', 12, 10); // 2.0" apart — beyond threshold
      const unitA = createUnit('unit-a', [modelA]);
      const unitB = createUnit('unit-b', [modelB]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(isModelInBaseContact(state, 'a-m0', 'unit-b')).toBe(false);
    });

    it('returns true at exactly the threshold boundary (1.27")', () => {
      const modelA = createModel('a-m0', 0, 0);
      const modelB = createModel('b-m0', 1.27, 0); // exactly at threshold
      const unitA = createUnit('unit-a', [modelA]);
      const unitB = createUnit('unit-b', [modelB]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(isModelInBaseContact(state, 'a-m0', 'unit-b')).toBe(true);
    });

    it('skips destroyed models in the target unit', () => {
      const modelA = createModel('a-m0', 10, 10);
      const modelB = createModel('b-m0', 11.0, 10, { isDestroyed: true }); // close but destroyed
      const unitA = createUnit('unit-a', [modelA]);
      const unitB = createUnit('unit-b', [modelB]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(isModelInBaseContact(state, 'a-m0', 'unit-b')).toBe(false);
    });

    it('returns false for a non-existent model', () => {
      const unitB = createUnit('unit-b', [createModel('b-m0', 1, 0)]);
      const state = createGameState({
        armies: [createArmy(0, []), createArmy(1, [unitB])],
      });

      expect(isModelInBaseContact(state, 'nonexistent', 'unit-b')).toBe(false);
    });

    it('returns false for a non-existent target unit', () => {
      const unitA = createUnit('unit-a', [createModel('a-m0', 0, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [])],
      });

      expect(isModelInBaseContact(state, 'a-m0', 'nonexistent')).toBe(false);
    });
  });

  // ── getEngagedModels ───────────────────────────────────────────────────

  describe('getEngagedModels', () => {
    it('includes models in base contact with enemy', () => {
      // Model in base contact: distance <= 1.27"
      const friendlyM = createModel('f-m0', 10, 10);
      const enemyM = createModel('e-m0', 11.0, 10); // 1.0" apart
      const friendlyUnit = createUnit('f-unit', [friendlyM]);
      const enemyUnit = createUnit('e-unit', [enemyM]);
      const state = createGameState({
        armies: [createArmy(0, [friendlyUnit]), createArmy(1, [enemyUnit])],
      });

      const engaged = getEngagedModels(state, 'f-unit', ['e-unit']);
      expect(engaged).toHaveLength(1);
      expect(engaged[0].id).toBe('f-m0');
    });

    it('includes models within 2" of a friendly model in base contact', () => {
      // Model A: in base contact with enemy (1.0" apart)
      // Model B: 1.5" from model A but NOT in base contact with enemy (5" away from enemy)
      const friendlyA = createModel('f-m0', 10, 10);
      const friendlyB = createModel('f-m1', 11.5, 10); // 1.5" from A — within 2"
      const enemyM = createModel('e-m0', 11.0, 10); // 1.0" from A — in base contact
      const friendlyUnit = createUnit('f-unit', [friendlyA, friendlyB]);
      const enemyUnit = createUnit('e-unit', [enemyM]);
      const state = createGameState({
        armies: [createArmy(0, [friendlyUnit]), createArmy(1, [enemyUnit])],
      });

      const engaged = getEngagedModels(state, 'f-unit', ['e-unit']);
      expect(engaged).toHaveLength(2);
      expect(engaged.map(m => m.id)).toContain('f-m0');
      expect(engaged.map(m => m.id)).toContain('f-m1');
    });

    it('excludes models beyond 2" of any friendly in base contact', () => {
      const friendlyA = createModel('f-m0', 10, 10);
      const friendlyB = createModel('f-m1', 13, 10); // 3.0" from A — beyond 2"
      const enemyM = createModel('e-m0', 11.0, 10); // 1.0" from A
      const friendlyUnit = createUnit('f-unit', [friendlyA, friendlyB]);
      const enemyUnit = createUnit('e-unit', [enemyM]);
      const state = createGameState({
        armies: [createArmy(0, [friendlyUnit]), createArmy(1, [enemyUnit])],
      });

      const engaged = getEngagedModels(state, 'f-unit', ['e-unit']);
      expect(engaged).toHaveLength(1);
      expect(engaged[0].id).toBe('f-m0');
    });

    it('excludes destroyed models', () => {
      const aliveModel = createModel('f-m0', 10, 10);
      const deadModel = createModel('f-m1', 10.5, 10, { isDestroyed: true });
      const enemyM = createModel('e-m0', 11.0, 10);
      const friendlyUnit = createUnit('f-unit', [aliveModel, deadModel]);
      const enemyUnit = createUnit('e-unit', [enemyM]);
      const state = createGameState({
        armies: [createArmy(0, [friendlyUnit]), createArmy(1, [enemyUnit])],
      });

      const engaged = getEngagedModels(state, 'f-unit', ['e-unit']);
      expect(engaged).toHaveLength(1);
      expect(engaged[0].id).toBe('f-m0');
    });

    it('returns empty array when unit has no alive models', () => {
      const deadModel = createModel('f-m0', 10, 10, { isDestroyed: true });
      const enemyM = createModel('e-m0', 11.0, 10);
      const friendlyUnit = createUnit('f-unit', [deadModel]);
      const enemyUnit = createUnit('e-unit', [enemyM]);
      const state = createGameState({
        armies: [createArmy(0, [friendlyUnit]), createArmy(1, [enemyUnit])],
      });

      const engaged = getEngagedModels(state, 'f-unit', ['e-unit']);
      expect(engaged).toEqual([]);
    });

    it('returns empty array for a non-existent unit', () => {
      const state = createGameState();
      expect(getEngagedModels(state, 'nonexistent', ['e-unit'])).toEqual([]);
    });
  });

  // ── getMajorityWS ──────────────────────────────────────────────────────

  describe('getMajorityWS', () => {
    it('returns 4 for a unit with alive models (default Marine WS)', () => {
      const unit = createUnit('u1', [
        createModel('m1', 0, 0),
        createModel('m2', 1, 0),
      ]);
      expect(getMajorityWS(unit)).toBe(4);
    });

    it('returns 0 for a unit with all models destroyed', () => {
      const unit = createUnit('u1', [
        createModel('m1', 0, 0, { isDestroyed: true }),
        createModel('m2', 1, 0, { isDestroyed: true }),
      ]);
      expect(getMajorityWS(unit)).toBe(0);
    });
  });

  // ── getCombatInitiative ────────────────────────────────────────────────

  describe('getCombatInitiative', () => {
    it('returns modelInit + weaponIM when no statuses', () => {
      expect(getCombatInitiative(4, -1, [])).toBe(3);
    });

    it('returns model initiative when weaponIM is positive', () => {
      expect(getCombatInitiative(4, 2, [])).toBe(6);
    });

    it('floors at 1 for heavily negative weapon modifier', () => {
      expect(getCombatInitiative(2, -5, [])).toBe(1);
    });

    it('forces initiative to 1 when unit has any statuses', () => {
      expect(getCombatInitiative(5, 0, [TacticalStatus.Suppressed])).toBe(1);
      expect(getCombatInitiative(5, 0, [TacticalStatus.Pinned])).toBe(1);
    });

    it('forces initiative to 1 with multiple statuses', () => {
      expect(
        getCombatInitiative(5, 0, [
          TacticalStatus.Suppressed,
          TacticalStatus.Stunned,
        ]),
      ).toBe(1);
    });

    it('handles string weapon initiative modifier (e.g. "I")', () => {
      expect(getCombatInitiative(4, 'I', [])).toBe(4);
    });
  });

  // ── getDistanceBetween ─────────────────────────────────────────────────

  describe('getDistanceBetween', () => {
    it('returns 0 for identical positions', () => {
      expect(getDistanceBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });

    it('calculates horizontal distance correctly', () => {
      expect(getDistanceBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    });

    it('calculates vertical distance correctly', () => {
      expect(getDistanceBetween({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
    });

    it('calculates euclidean distance for diagonal', () => {
      const dist = getDistanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(dist).toBe(5); // 3-4-5 triangle
    });
  });

  // ── getClosestModelDistance ─────────────────────────────────────────────

  describe('getClosestModelDistance', () => {
    it('returns the minimum distance between alive models in two units', () => {
      const unitA = createUnit('u-a', [
        createModel('a-m0', 0, 0),
        createModel('a-m1', 5, 0),
      ]);
      const unitB = createUnit('u-b', [
        createModel('b-m0', 10, 0),
        createModel('b-m1', 3, 0), // closest to a-m1 at 2" and to a-m0 at 3"
      ]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      const dist = getClosestModelDistance(state, 'u-a', 'u-b');
      expect(dist).toBe(2); // a-m1 at x=5 and b-m1 at x=3 => distance = 2
    });

    it('returns Infinity when a unit is not found', () => {
      const state = createGameState();
      expect(getClosestModelDistance(state, 'u-a', 'nonexistent')).toBe(Infinity);
    });

    it('returns Infinity when all models are destroyed', () => {
      const unitA = createUnit('u-a', [
        createModel('a-m0', 0, 0, { isDestroyed: true }),
      ]);
      const unitB = createUnit('u-b', [createModel('b-m0', 3, 0)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(getClosestModelDistance(state, 'u-a', 'u-b')).toBe(Infinity);
    });
  });

  // ── hasLOSToUnit ───────────────────────────────────────────────────────

  describe('hasLOSToUnit', () => {
    it('returns true when both units are deployed with alive models', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('u-b', [createModel('b-m0', 10, 10)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(hasLOSToUnit(state, 'u-a', 'u-b')).toBe(true);
    });

    it('returns false when the source unit is not deployed', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)], {
        isDeployed: false,
      });
      const unitB = createUnit('u-b', [createModel('b-m0', 10, 10)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(hasLOSToUnit(state, 'u-a', 'u-b')).toBe(false);
    });

    it('returns false when the target unit is not deployed', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('u-b', [createModel('b-m0', 10, 10)], {
        isDeployed: false,
      });
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(hasLOSToUnit(state, 'u-a', 'u-b')).toBe(false);
    });

    it('returns false when all models in the target are destroyed', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('u-b', [
        createModel('b-m0', 10, 10, { isDestroyed: true }),
      ]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(hasLOSToUnit(state, 'u-a', 'u-b')).toBe(false);
    });

    it('returns false for non-existent unit IDs', () => {
      const state = createGameState();
      expect(hasLOSToUnit(state, 'nonexistent', 'also-nope')).toBe(false);
    });
  });

  // ── getModelsWithLOSToUnit ─────────────────────────────────────────────

  describe('getModelsWithLOSToUnit', () => {
    it('returns all alive models in the source unit (simplified LOS)', () => {
      const unitA = createUnit('u-a', [
        createModel('a-m0', 0, 0),
        createModel('a-m1', 1, 0),
        createModel('a-m2', 2, 0, { isDestroyed: true }),
      ]);
      const unitB = createUnit('u-b', [createModel('b-m0', 10, 10)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      const result = getModelsWithLOSToUnit(state, 'u-a', 'u-b');
      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toContain('a-m0');
      expect(result.map(m => m.id)).toContain('a-m1');
    });

    it('returns empty array when target has no alive models', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)]);
      const unitB = createUnit('u-b', [
        createModel('b-m0', 10, 10, { isDestroyed: true }),
      ]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(getModelsWithLOSToUnit(state, 'u-a', 'u-b')).toEqual([]);
    });

    it('returns empty array when either unit is not deployed', () => {
      const unitA = createUnit('u-a', [createModel('a-m0', 0, 0)], {
        isDeployed: false,
      });
      const unitB = createUnit('u-b', [createModel('b-m0', 10, 10)]);
      const state = createGameState({
        armies: [createArmy(0, [unitA]), createArmy(1, [unitB])],
      });

      expect(getModelsWithLOSToUnit(state, 'u-a', 'u-b')).toEqual([]);
    });

    it('returns empty array for non-existent unit IDs', () => {
      const state = createGameState();
      expect(getModelsWithLOSToUnit(state, 'nope', 'also-nope')).toEqual([]);
    });
  });
});
