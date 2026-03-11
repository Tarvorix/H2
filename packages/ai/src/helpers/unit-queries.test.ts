/**
 * Unit Queries Tests
 *
 * Tests for AI-specific unit query helpers.
 */

import { describe, it, expect } from 'vitest';
import { UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import {
  getMovableUnits,
  getReservesUnits,
  getShootableUnits,
  getChargeableUnits,
  getUnitEquippedWeapons,
  getModelMovementCharacteristic,
  getModelInitiativeCharacteristic,
  getUnitCentroid,
  getEnemyDeployedUnits,
  findOwnedUnit,
} from './unit-queries';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['boltgun'],
    modifiers: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: [createModel()],
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    statuses: [],
    hasReactedThisTurn: false,
    modifiers: [],
    ...overrides,
  };
}

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: 'Dark Angels' as ArmyState['faction'],
    allegiance: 'Loyalist' as ArmyState['allegiance'],
    units: [],
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0, units: [] }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [],
      }),
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: 'Movement' as GameState['currentPhase'],
    currentSubPhase: 'Move' as GameState['currentSubPhase'],
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ─── getMovableUnits Tests ─────────────────────────────────────────────────

describe('getMovableUnits', () => {
  it('returns deployed stationary units for the player', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary });
    const unit2 = createUnit({ id: 'u2', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1, unit2] });

    const result = getMovableUnits(state, 0, new Set());
    expect(result.length).toBe(2);
    expect(result.map((u) => u.id)).toContain('u1');
    expect(result.map((u) => u.id)).toContain('u2');
  });

  it('excludes already moved units', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Moved });
    const unit2 = createUnit({ id: 'u2', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1, unit2] });

    const result = getMovableUnits(state, 0, new Set());
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('u2');
  });

  it('includes units with a declared rush so the rush move can be completed', () => {
    const unit = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.RushDeclared });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = getMovableUnits(state, 0, new Set());
    expect(result.map((u) => u.id)).toContain('u1');
  });

  it('excludes units in the actedIds set', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getMovableUnits(state, 0, new Set(['u1']));
    expect(result.length).toBe(0);
  });

  it('excludes un-deployed units', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: false, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getMovableUnits(state, 0, new Set());
    expect(result.length).toBe(0);
  });

  it('excludes units locked in combat', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary, isLockedInCombat: true });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getMovableUnits(state, 0, new Set());
    expect(result.length).toBe(0);
  });
});

// ─── getReservesUnits Tests ──────────────────────────────────────────────────

describe('getReservesUnits', () => {
  it('returns units in reserves for the player', () => {
    const unit1 = createUnit({ id: 'u1', isInReserves: true, isDeployed: false });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getReservesUnits(state, 0, new Set());
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('u1');
  });

  it('excludes units already acted', () => {
    const unit1 = createUnit({ id: 'u1', isInReserves: true, isDeployed: false });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getReservesUnits(state, 0, new Set(['u1']));
    expect(result.length).toBe(0);
  });

  it('returns empty array when no units in reserves', () => {
    const unit1 = createUnit({ id: 'u1', isInReserves: false, isDeployed: true });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getReservesUnits(state, 0, new Set());
    expect(result.length).toBe(0);
  });
});

// ─── getShootableUnits Tests ──────────────────────────────────────────────────

describe('getShootableUnits', () => {
  it('returns deployed units that can shoot', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getShootableUnits(state, 0, new Set());
    expect(result.length).toBe(1);
  });

  it('excludes units in actedIds', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getShootableUnits(state, 0, new Set(['u1']));
    expect(result.length).toBe(0);
  });
});

describe('getModelInitiativeCharacteristic', () => {
  it('returns the model initiative from profile data', () => {
    const model = createModel({ profileModelName: 'Tactical Marine', unitProfileId: 'tactical-squad' });
    expect(getModelInitiativeCharacteristic(model)).toBeGreaterThan(0);
  });
});

// ─── getChargeableUnits Tests ──────────────────────────────────────────────

describe('getChargeableUnits', () => {
  it('returns deployed units that can charge', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getChargeableUnits(state, 0, new Set());
    expect(result.length).toBe(1);
  });

  it('excludes acted units', () => {
    const unit1 = createUnit({ id: 'u1', isDeployed: true, movementState: UnitMovementState.Stationary });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1] });

    const result = getChargeableUnits(state, 0, new Set(['u1']));
    expect(result.length).toBe(0);
  });
});

// ─── getUnitEquippedWeapons Tests ────────────────────────────────────────────

describe('getUnitEquippedWeapons', () => {
  it('returns a map of model id to weapon ids', () => {
    const m1 = createModel({ id: 'm1', equippedWargear: ['boltgun', 'bolt pistol'] });
    const m2 = createModel({ id: 'm2', equippedWargear: ['lascannon'] });
    const unit = createUnit({ models: [m1, m2] });

    const result = getUnitEquippedWeapons(unit);
    expect(result.get('m1')).toEqual(['boltgun', 'bolt pistol']);
    expect(result.get('m2')).toEqual(['lascannon']);
  });

  it('excludes destroyed models', () => {
    const m1 = createModel({ id: 'm1', equippedWargear: ['boltgun'] });
    const m2 = createModel({ id: 'm2', equippedWargear: ['lascannon'], isDestroyed: true });
    const unit = createUnit({ models: [m1, m2] });

    const result = getUnitEquippedWeapons(unit);
    expect(result.has('m1')).toBe(true);
    expect(result.has('m2')).toBe(false);
  });
});

// ─── getModelMovementCharacteristic Tests ────────────────────────────────────

describe('getModelMovementCharacteristic', () => {
  it('returns 7 for default Astartes movement', () => {
    const model = createModel();
    expect(getModelMovementCharacteristic(model)).toBe(7);
  });
});

// ─── getUnitCentroid Tests ─────────────────────────────────────────────────

describe('getUnitCentroid', () => {
  it('returns centroid of alive models', () => {
    const m1 = createModel({ id: 'm1', position: { x: 0, y: 0 } });
    const m2 = createModel({ id: 'm2', position: { x: 10, y: 10 } });
    const unit = createUnit({ models: [m1, m2] });

    const centroid = getUnitCentroid(unit);
    expect(centroid).toEqual({ x: 5, y: 5 });
  });

  it('returns null for unit with no alive models', () => {
    const m1 = createModel({ id: 'm1', isDestroyed: true });
    const unit = createUnit({ models: [m1] });

    expect(getUnitCentroid(unit)).toBeNull();
  });

  it('excludes destroyed models from centroid calculation', () => {
    const m1 = createModel({ id: 'm1', position: { x: 0, y: 0 } });
    const m2 = createModel({ id: 'm2', position: { x: 20, y: 20 }, isDestroyed: true });
    const unit = createUnit({ models: [m1, m2] });

    const centroid = getUnitCentroid(unit);
    expect(centroid).toEqual({ x: 0, y: 0 });
  });
});

// ─── getEnemyDeployedUnits Tests ───────────────────────────────────────────

describe('getEnemyDeployedUnits', () => {
  it('returns deployed enemy units', () => {
    const enemyUnit = createUnit({ id: 'e1', isDeployed: true });
    const state = createGameState();
    state.armies[1] = createArmy({
      playerIndex: 1,
      units: [enemyUnit],
    });

    const result = getEnemyDeployedUnits(state, 0);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('e1');
  });

  it('excludes un-deployed enemy units', () => {
    const enemyUnit = createUnit({ id: 'e1', isDeployed: false });
    const state = createGameState();
    state.armies[1] = createArmy({
      playerIndex: 1,
      units: [enemyUnit],
    });

    const result = getEnemyDeployedUnits(state, 0);
    expect(result.length).toBe(0);
  });
});

// ─── findOwnedUnit Tests ───────────────────────────────────────────────────

describe('findOwnedUnit', () => {
  it('returns the unit if it belongs to the player', () => {
    const unit = createUnit({ id: 'u1' });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = findOwnedUnit(state, 'u1', 0);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('u1');
  });

  it('returns null if the unit belongs to another player', () => {
    const unit = createUnit({ id: 'u1' });
    const state = createGameState();
    state.armies[1] = createArmy({ playerIndex: 1, units: [unit] });

    const result = findOwnedUnit(state, 'u1', 0);
    expect(result).toBeNull();
  });

  it('returns null if the unit does not exist', () => {
    const state = createGameState();
    const result = findOwnedUnit(state, 'nonexistent', 0);
    expect(result).toBeNull();
  });
});
