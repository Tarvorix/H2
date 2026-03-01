/**
 * Threat Evaluation Tests
 *
 * Tests for evaluateUnitThreat and rankUnitsByThreat which score
 * enemy units by how threatening they are to the AI's army.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState } from '@hh/types';
import { evaluateUnitThreat, rankUnitsByThreat } from './threat-evaluation';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> & { id?: string } = {}): ModelState {
  return {
    id: overrides.id ?? `model-${Math.random().toString(36).slice(2, 8)}`,
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

function createUnit(overrides: Partial<UnitState> & { id?: string } = {}): UnitState {
  return {
    id: overrides.id ?? `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: overrides.models ?? [createModel()],
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

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      {
        id: 'army-0',
        playerIndex: 0,
        playerName: 'Player 1',
        units: [],
        reactionAllotmentRemaining: 2,
        faction: 'Dark Angels',
        allegiance: 'Loyalist',
        totalPoints: 1000,
        pointsLimit: 2000,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as any,
      {
        id: 'army-1',
        playerIndex: 1,
        playerName: 'Player 2',
        units: [],
        reactionAllotmentRemaining: 2,
        faction: 'Sons of Horus',
        allegiance: 'Traitor',
        totalPoints: 1000,
        pointsLimit: 2000,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as any,
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    pendingReaction: undefined,
    shootingAttackState: undefined,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null] as any,
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ─── evaluateUnitThreat Tests ────────────────────────────────────────────────

describe('evaluateUnitThreat', () => {
  it('returns 0 for non-existent unit', () => {
    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const score = evaluateUnitThreat(state, 0, 'non-existent-unit');

    expect(score).toBe(0);
  });

  it('returns 0 for unit with all destroyed models', () => {
    const destroyedModel = createModel({ id: 'dm-1', isDestroyed: true });
    const deadUnit = createUnit({ id: 'enemy-1', models: [destroyedModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [deadUnit] } as any,
      ],
    });

    const score = evaluateUnitThreat(state, 0, 'enemy-1');

    expect(score).toBe(0);
  });

  it('higher score for units with more alive models', () => {
    const smallUnit = createUnit({
      id: 'small-enemy',
      models: [
        createModel({ id: 'sm-1', equippedWargear: ['boltgun'] }),
      ],
    });

    const largeUnit = createUnit({
      id: 'large-enemy',
      models: [
        createModel({ id: 'lm-1', equippedWargear: ['boltgun'] }),
        createModel({ id: 'lm-2', equippedWargear: ['boltgun'] }),
        createModel({ id: 'lm-3', equippedWargear: ['boltgun'] }),
        createModel({ id: 'lm-4', equippedWargear: ['boltgun'] }),
        createModel({ id: 'lm-5', equippedWargear: ['boltgun'] }),
      ],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [smallUnit, largeUnit] } as any,
      ],
    });

    const smallScore = evaluateUnitThreat(state, 0, 'small-enemy');
    const largeScore = evaluateUnitThreat(state, 0, 'large-enemy');

    expect(largeScore).toBeGreaterThan(smallScore);
  });

  it('higher score for units with more weapons', () => {
    const lowWeaponUnit = createUnit({
      id: 'low-weapon',
      models: [createModel({ id: 'lw-1', equippedWargear: [] })],
    });

    const highWeaponUnit = createUnit({
      id: 'high-weapon',
      models: [createModel({ id: 'hw-1', equippedWargear: ['boltgun', 'missile-launcher', 'plasma-gun'] })],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [lowWeaponUnit, highWeaponUnit] } as any,
      ],
    });

    const lowScore = evaluateUnitThreat(state, 0, 'low-weapon');
    const highScore = evaluateUnitThreat(state, 0, 'high-weapon');

    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('higher score for units closer to friendly units (within 12")', () => {
    // Friendly unit at x=10, y=10
    const friendlyModel = createModel({ id: 'fm-1', position: { x: 10, y: 10 } });
    const friendlyUnit = createUnit({ id: 'friendly-1', models: [friendlyModel] });

    // Close enemy at x=15, y=10 (5" away)
    const closeEnemyModel = createModel({ id: 'ce-1', position: { x: 15, y: 10 }, equippedWargear: ['boltgun'] });
    const closeEnemy = createUnit({ id: 'close-enemy', models: [closeEnemyModel] });

    // Far enemy at x=50, y=10 (40" away)
    const farEnemyModel = createModel({ id: 'fe-1', position: { x: 50, y: 10 }, equippedWargear: ['boltgun'] });
    const farEnemy = createUnit({ id: 'far-enemy', models: [farEnemyModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [friendlyUnit] } as any,
        { ...createGameState().armies[1], units: [closeEnemy, farEnemy] } as any,
      ],
    });

    const closeScore = evaluateUnitThreat(state, 0, 'close-enemy');
    const farScore = evaluateUnitThreat(state, 0, 'far-enemy');

    expect(closeScore).toBeGreaterThan(farScore);
  });

  it('score is capped at 100', () => {
    // Create a very threatening unit: many models, many weapons, close proximity
    const friendlyModel = createModel({ id: 'fm-1', position: { x: 10, y: 10 } });
    const friendlyUnit = createUnit({ id: 'friendly-1', models: [friendlyModel] });

    const manyModels = Array.from({ length: 20 }, (_, i) =>
      createModel({
        id: `em-${i}`,
        position: { x: 12, y: 10 },
        equippedWargear: ['boltgun', 'plasma-gun', 'melta-gun'],
      }),
    );
    const threateningUnit = createUnit({ id: 'big-threat', models: manyModels });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [friendlyUnit] } as any,
        { ...createGameState().armies[1], units: [threateningUnit] } as any,
      ],
    });

    const score = evaluateUnitThreat(state, 0, 'big-threat');

    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── rankUnitsByThreat Tests ─────────────────────────────────────────────────

describe('rankUnitsByThreat', () => {
  it('returns sorted list with highest threat first', () => {
    const smallUnit = createUnit({
      id: 'small-enemy',
      models: [createModel({ id: 'se-1', equippedWargear: ['boltgun'] })],
    });

    const largeUnit = createUnit({
      id: 'large-enemy',
      models: [
        createModel({ id: 'le-1', equippedWargear: ['boltgun'] }),
        createModel({ id: 'le-2', equippedWargear: ['boltgun'] }),
        createModel({ id: 'le-3', equippedWargear: ['boltgun'] }),
        createModel({ id: 'le-4', equippedWargear: ['boltgun'] }),
        createModel({ id: 'le-5', equippedWargear: ['boltgun'] }),
      ],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [smallUnit, largeUnit] } as any,
      ],
    });

    const ranked = rankUnitsByThreat(state, 0);

    expect(ranked.length).toBe(2);
    expect(ranked[0].unitId).toBe('large-enemy');
    expect(ranked[1].unitId).toBe('small-enemy');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it('returns empty array when no enemy units deployed', () => {
    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const ranked = rankUnitsByThreat(state, 0);

    expect(ranked).toHaveLength(0);
  });

  it('each entry has unitId and score', () => {
    const enemyUnit = createUnit({
      id: 'enemy-1',
      models: [createModel({ id: 'e1-m1', equippedWargear: ['boltgun'] })],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [enemyUnit] } as any,
      ],
    });

    const ranked = rankUnitsByThreat(state, 0);

    expect(ranked.length).toBe(1);
    expect(ranked[0].unitId).toBe('enemy-1');
    expect(typeof ranked[0].score).toBe('number');
    expect(ranked[0].score).toBeGreaterThan(0);
  });
});
