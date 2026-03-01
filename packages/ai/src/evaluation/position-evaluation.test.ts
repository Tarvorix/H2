/**
 * Position Evaluation Tests
 *
 * Tests for evaluateMovementDestination, findBestMovePosition,
 * and generateCandidatePositions which evaluate movement destinations
 * for the tactical AI.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, Position } from '@hh/types';
import {
  evaluateMovementDestination,
  findBestMovePosition,
  generateCandidatePositions,
} from './position-evaluation';

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

// ─── evaluateMovementDestination Tests ───────────────────────────────────────

describe('evaluateMovementDestination', () => {
  it('position near objective scores higher than position far from objective', () => {
    const state = createGameState({
      missionState: {
        objectives: [
          {
            id: 'obj-1',
            position: { x: 36, y: 24 },
            vpValue: 3,
            isRemoved: false,
            controlledBy: null,
            isActive: true,
            name: 'Objective 1',
          },
        ],
      } as any,
    });

    const nearObjective: Position = { x: 35, y: 24 };
    const farFromObjective: Position = { x: 5, y: 5 };

    const nearScore = evaluateMovementDestination(state, 'unit-1', nearObjective, 0);
    const farScore = evaluateMovementDestination(state, 'unit-1', farFromObjective, 0);

    expect(nearScore).toBeGreaterThan(farScore);
  });

  it('position too close to edge gets penalty', () => {
    const state = createGameState();

    const edgePosition: Position = { x: 1, y: 1 };
    const centerPosition: Position = { x: 36, y: 24 };

    const edgeScore = evaluateMovementDestination(state, 'unit-1', edgePosition, 0);
    const centerScore = evaluateMovementDestination(state, 'unit-1', centerPosition, 0);

    // Edge position should be penalized
    expect(edgeScore).toBeLessThan(centerScore);
  });

  it('position within edge threshold on multiple sides gets larger penalty', () => {
    const state = createGameState();

    // Corner position: close to two edges
    const cornerPosition: Position = { x: 1, y: 1 };
    // Position close to one edge only
    const singleEdgePosition: Position = { x: 1, y: 24 };

    const cornerScore = evaluateMovementDestination(state, 'unit-1', cornerPosition, 0);
    const singleEdgeScore = evaluateMovementDestination(state, 'unit-1', singleEdgePosition, 0);

    // Corner should get more penalty (two edge penalties)
    expect(cornerScore).toBeLessThan(singleEdgeScore);
  });

  it('position at optimal shooting range from enemy scores higher', () => {
    const enemyModel = createModel({ id: 'em-1', position: { x: 50, y: 24 } });
    const enemyUnit = createUnit({ id: 'enemy-1', models: [enemyModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [enemyUnit] } as any,
      ],
    });

    // Good shooting range (18" from enemy at x=50)
    const optimalPos: Position = { x: 32, y: 24 };
    // Too close to enemy (3" away)
    const tooClosePos: Position = { x: 47, y: 24 };

    const optimalScore = evaluateMovementDestination(state, 'unit-1', optimalPos, 0);
    const closeScore = evaluateMovementDestination(state, 'unit-1', tooClosePos, 0);

    expect(optimalScore).toBeGreaterThan(closeScore);
  });

  it('returns a numeric score', () => {
    const state = createGameState();
    const pos: Position = { x: 36, y: 24 };

    const score = evaluateMovementDestination(state, 'unit-1', pos, 0);

    expect(typeof score).toBe('number');
  });
});

// ─── findBestMovePosition Tests ──────────────────────────────────────────────

describe('findBestMovePosition', () => {
  it('returns highest-scoring position from candidates', () => {
    const state = createGameState({
      missionState: {
        objectives: [
          {
            id: 'obj-1',
            position: { x: 36, y: 24 },
            vpValue: 3,
            isRemoved: false,
            controlledBy: null,
            isActive: true,
            name: 'Objective 1',
          },
        ],
      } as any,
    });

    const candidates: Position[] = [
      { x: 5, y: 5 },   // Far from objective, near edge
      { x: 36, y: 24 },  // On the objective
      { x: 60, y: 40 },  // Far from objective
    ];

    const best = findBestMovePosition(state, 'unit-1', candidates, 0);

    // The position on the objective should win
    expect(best.x).toBe(36);
    expect(best.y).toBe(24);
  });

  it('returns center of battlefield when no candidates provided', () => {
    const state = createGameState();

    const best = findBestMovePosition(state, 'unit-1', [], 0);

    expect(best.x).toBe(36);
    expect(best.y).toBe(24);
  });

  it('returns the only candidate when just one is provided', () => {
    const state = createGameState();
    const candidates: Position[] = [{ x: 15, y: 20 }];

    const best = findBestMovePosition(state, 'unit-1', candidates, 0);

    expect(best.x).toBe(15);
    expect(best.y).toBe(20);
  });
});

// ─── generateCandidatePositions Tests ────────────────────────────────────────

describe('generateCandidatePositions', () => {
  it('returns expected number of candidates (8 + 8 + 1 = 17)', () => {
    const candidates = generateCandidatePositions(
      { x: 36, y: 24 },
      7,
      72,
      48,
    );

    expect(candidates).toHaveLength(17);
  });

  it('all candidate positions are within battlefield bounds', () => {
    const candidates = generateCandidatePositions(
      { x: 36, y: 24 },
      7,
      72,
      48,
    );

    for (const pos of candidates) {
      expect(pos.x).toBeGreaterThanOrEqual(0.5);
      expect(pos.x).toBeLessThanOrEqual(71.5);
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('positions from edge-of-battlefield start position are clamped', () => {
    const candidates = generateCandidatePositions(
      { x: 1, y: 1 },
      10,
      72,
      48,
    );

    for (const pos of candidates) {
      expect(pos.x).toBeGreaterThanOrEqual(0.5);
      expect(pos.x).toBeLessThanOrEqual(71.5);
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('includes the current position (stay in place)', () => {
    const currentPos: Position = { x: 20, y: 15 };
    const candidates = generateCandidatePositions(currentPos, 7, 72, 48);

    // The last candidate should be the current position
    const lastCandidate = candidates[candidates.length - 1];
    expect(lastCandidate.x).toBe(20);
    expect(lastCandidate.y).toBe(15);
  });

  it('half-distance candidates are closer than full-distance candidates', () => {
    const currentPos: Position = { x: 36, y: 24 };
    const maxDistance = 10;
    const candidates = generateCandidatePositions(currentPos, maxDistance, 72, 48);

    // First 8 are full distance, next 8 are half distance
    const fullDistanceCandidates = candidates.slice(0, 8);
    const halfDistanceCandidates = candidates.slice(8, 16);

    // Calculate average distance from center for each group
    const avgFullDist = fullDistanceCandidates.reduce((sum, p) => {
      const dx = p.x - currentPos.x;
      const dy = p.y - currentPos.y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / 8;

    const avgHalfDist = halfDistanceCandidates.reduce((sum, p) => {
      const dx = p.x - currentPos.x;
      const dy = p.y - currentPos.y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / 8;

    expect(avgHalfDist).toBeLessThan(avgFullDist);
  });
});
