/**
 * Weapon Selection Tests
 *
 * Tests for AI weapon assignment helpers.
 */

import { describe, it, expect } from 'vitest';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import { TerrainType, UnitMovementState } from '@hh/types';
import { selectWeaponsForAttack, hasWeaponsInRange, estimateExpectedDamage } from './weapon-selection';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['bolter'],
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

function createGameState(): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      {
        id: 'army-0',
        playerIndex: 0,
        playerName: 'Player 1',
        faction: 'Dark Angels',
        allegiance: 'Loyalist',
        units: [],
        totalPoints: 1000,
        pointsLimit: 1000,
        reactionAllotmentRemaining: 2,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as ArmyState,
      {
        id: 'army-1',
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus',
        allegiance: 'Traitor',
        units: [],
        totalPoints: 1000,
        pointsLimit: 1000,
        reactionAllotmentRemaining: 2,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as ArmyState,
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: 'Shooting' as GameState['currentPhase'],
    currentSubPhase: 'Attack' as GameState['currentSubPhase'],
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
  } as unknown as GameState;
}

// ─── selectWeaponsForAttack Tests ────────────────────────────────────────────

describe('selectWeaponsForAttack', () => {
  it('assigns first in-range weapon per model for basic strategy', () => {
    const m1 = createModel({
      id: 'm1',
      position: { x: 10, y: 10 },
      equippedWargear: ['krak-grenades', 'bolter'],
    });
    const m2 = createModel({ id: 'm2', position: { x: 10, y: 11 }, equippedWargear: ['bolter'] });
    const attacker = createUnit({ id: 'attacker', models: [m1, m2] });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 30, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result.length).toBe(2);
    expect(result[0].modelId).toBe('m1');
    expect(result[0].weaponId).toBe('bolter');
    expect(result[1].modelId).toBe('m2');
    expect(result[1].weaponId).toBe('bolter');
  });

  it('assigns strongest in-range weapon per model for tactical strategy', () => {
    const m1 = createModel({
      id: 'm1',
      position: { x: 10, y: 10 },
      equippedWargear: ['bolter', 'lascannon'],
    });
    const attacker = createUnit({ id: 'attacker', models: [m1] });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 40, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'tactical');
    expect(result.length).toBe(1);
    expect(result[0].weaponId).toBe('lascannon');
  });

  it('skips models with no equipped wargear', () => {
    const m1 = createModel({ id: 'm1', equippedWargear: ['bolter'] });
    const m2 = createModel({ id: 'm2', equippedWargear: [] });
    const attacker = createUnit({ id: 'attacker', models: [m1, m2] });
    const target = createUnit({ id: 'target' });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result.length).toBe(1);
    expect(result[0].modelId).toBe('m1');
  });

  it('skips destroyed models', () => {
    const m1 = createModel({ id: 'm1', equippedWargear: ['bolter'] });
    const m2 = createModel({ id: 'm2', equippedWargear: ['bolter'], isDestroyed: true });
    const attacker = createUnit({ id: 'attacker', models: [m1, m2] });
    const target = createUnit({ id: 'target' });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result.length).toBe(1);
    expect(result[0].modelId).toBe('m1');
  });

  it('only assigns weapons to models with line of sight', () => {
    const m0 = createModel({ id: 'm0', position: { x: 0, y: 0 }, equippedWargear: ['bolter'] });
    const m1 = createModel({ id: 'm1', position: { x: 0, y: 6 }, equippedWargear: ['bolter'] });
    const attacker = createUnit({ id: 'attacker', models: [m0, m1] });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 10, y: 0 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.terrain = [{
      id: 'heavy-1',
      name: 'Heavy Area',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 4, y: -2 }, width: 2, height: 4 },
      isDifficult: false,
      isDangerous: false,
    }];
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe('m1');
    expect(result[0].weaponId).toBe('bolter');
  });

  it('skips models when all ranged weapons are out of range', () => {
    const m1 = createModel({
      id: 'm1',
      position: { x: 10, y: 10 },
      equippedWargear: ['krak-grenades'],
    });
    const attacker = createUnit({ id: 'attacker', models: [m1] });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 30, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result.length).toBe(0);
  });

  it('returns empty array for unit with no alive models', () => {
    const m1 = createModel({ id: 'm1', equippedWargear: ['bolter'], isDestroyed: true });
    const attacker = createUnit({ id: 'attacker', models: [m1] });
    const target = createUnit({ id: 'target' });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result.length).toBe(0);
  });

  it('picks a legal parent-weapon profile when the model is armed with a missile launcher', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 10, y: 10 }, equippedWargear: ['missile-launcher'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 30, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'basic');
    expect(result).toHaveLength(1);
    expect(result[0].weaponId).toBe('missile-launcher');
    expect(result[0].profileName).toBe('Frag');
  });

  it('uses the stronger parent-weapon profile for tactical shooting choices', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 10, y: 10 }, equippedWargear: ['missile-launcher'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 30, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    const result = selectWeaponsForAttack(state, attacker, target, 'tactical');
    expect(result).toHaveLength(1);
    expect(result[0].weaponId).toBe('missile-launcher');
    expect(result[0].profileName).toBe('Krak');
  });
});

describe('hasWeaponsInRange', () => {
  it('returns true when at least one valid ranged weapon can reach target', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 10, y: 10 }, equippedWargear: ['bolter'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 25, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    expect(hasWeaponsInRange(state, attacker, target.id)).toBe(true);
  });

  it('returns false when all available weapons are out of range', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 10, y: 10 }, equippedWargear: ['krak-grenades'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 30, y: 10 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    expect(hasWeaponsInRange(state, attacker, target.id)).toBe(false);
  });

  it('returns false when only blocked models have ranged weapons in range', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 0, y: 0 }, equippedWargear: ['bolter'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 10, y: 0 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.terrain = [{
      id: 'heavy-1',
      name: 'Heavy Area',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 4, y: -2 }, width: 2, height: 4 },
      isDifficult: false,
      isDangerous: false,
    }];
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    expect(hasWeaponsInRange(state, attacker, target.id)).toBe(false);
  });

  it('returns true for a range-band weapon when the target sits in the matching band', () => {
    const attacker = createUnit({
      id: 'attacker',
      models: [createModel({ id: 'm1', position: { x: 0, y: 0 }, equippedWargear: ['conversion-beam-cannon'] })],
    });
    const target = createUnit({
      id: 'target',
      models: [createModel({ id: 't1', position: { x: 20, y: 0 }, equippedWargear: [] })],
    });
    const state = createGameState();
    state.armies[0].units = [attacker];
    state.armies[1].units = [target];

    expect(hasWeaponsInRange(state, attacker, target.id)).toBe(true);
  });
});

// ─── estimateExpectedDamage Tests ───────────────────────────────────────────

describe('estimateExpectedDamage', () => {
  it('returns 0 for 0 models', () => {
    expect(estimateExpectedDamage(0)).toBe(0);
  });

  it('returns positive value for standard marine vs marine', () => {
    const result = estimateExpectedDamage(10, 4, 4, 4, 3);
    expect(result).toBeGreaterThan(0);
  });

  it('returns higher damage for more models', () => {
    const result5 = estimateExpectedDamage(5, 4, 4, 4, 3);
    const result10 = estimateExpectedDamage(10, 4, 4, 4, 3);
    expect(result10).toBeGreaterThan(result5);
    expect(result10).toBeCloseTo(result5 * 2, 5);
  });

  it('returns higher damage when strength exceeds toughness', () => {
    const equalST = estimateExpectedDamage(10, 4, 4, 4, 3);
    const highS = estimateExpectedDamage(10, 4, 8, 4, 3);
    expect(highS).toBeGreaterThan(equalST);
  });

  it('returns lower damage when toughness exceeds strength', () => {
    const equalST = estimateExpectedDamage(10, 4, 4, 4, 3);
    const highT = estimateExpectedDamage(10, 4, 4, 8, 3);
    expect(highT).toBeLessThan(equalST);
  });

  it('returns higher damage against worse saves', () => {
    const goodSave = estimateExpectedDamage(10, 4, 4, 4, 2);
    const badSave = estimateExpectedDamage(10, 4, 4, 4, 5);
    expect(badSave).toBeGreaterThan(goodSave);
  });

  it('strength double toughness wounds on 2+', () => {
    // S8 vs T4 should wound on 2+ = 5/6 probability
    // BS4 = hits on 3+ = 4/6; Save 6+ = fails 5/6
    const result = estimateExpectedDamage(6, 4, 8, 4, 6);
    const expected = 6 * (4 / 6) * (5 / 6) * (5 / 6);
    expect(result).toBeCloseTo(expected, 5);
  });
});
