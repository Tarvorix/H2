/**
 * Rout Handler Tests
 *
 * Tests for handleRoutSubPhase, computeFallBackDirection, and computeFallBackDistance.
 * Covers routed unit fall-back movement, leadership checks, terrain penalties,
 * direction computation, unit removal, and event emission.
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  TacticalStatus,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  TerrainType,
} from '@hh/types';
import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  TerrainPiece,
} from '@hh/types';
import { createRectTerrain } from '@hh/geometry';
import { FixedDiceProvider } from '../dice';
import {
  handleRoutSubPhase,
  computeFallBackDirection,
  computeFallBackDistance,
  DEFAULT_INITIATIVE,
  DEFAULT_LEADERSHIP,
  EDGE_THRESHOLD,
} from './rout-handler';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createModel(id: string, x: number, y: number, overrides?: Partial<ModelState>): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['bolter'],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(id: string, models: ModelState[], overrides?: Partial<UnitState>): UnitState {
  return {
    id,
    profileId: 'tactical-squad',
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

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createGameState(overrides?: Partial<GameState>): GameState {
  const p0Models = [
    createModel('u1-m0', 10, 24),
    createModel('u1-m1', 12, 24),
    createModel('u1-m2', 14, 24),
  ];
  const p1Models = [
    createModel('u3-m0', 50, 40),
    createModel('u3-m1', 52, 40),
  ];

  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, [createUnit('u1', p0Models)]),
      createArmy(1, [createUnit('u3', p1Models)]),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Rout,
    awaitingReaction: false,
    pendingReaction: undefined,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

function makeDifficultTerrain(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): TerrainPiece {
  return createRectTerrain(
    id,
    'Difficult Area',
    TerrainType.Difficult,
    { x, y },
    w,
    h,
    true,
    false,
  );
}

// ─── computeFallBackDirection Tests ─────────────────────────────────────────

describe('computeFallBackDirection', () => {
  const width = 72;
  const height = 48;

  it('should point toward the left edge when model is closest to x=0', () => {
    // Model at x=5, y=24 -- closest to left edge (5") vs right (67") vs top (24") vs bottom (24")
    const dir = computeFallBackDirection({ x: 5, y: 24 }, width, height);
    expect(dir).toEqual({ x: -1, y: 0 });
  });

  it('should point toward the right edge when model is closest to x=width', () => {
    // Model at x=68, y=24 -- closest to right edge (4") vs left (68") vs top (24") vs bottom (24")
    const dir = computeFallBackDirection({ x: 68, y: 24 }, width, height);
    expect(dir).toEqual({ x: 1, y: 0 });
  });

  it('should point toward the top edge when model is closest to y=0', () => {
    // Model at x=36, y=5 -- closest to top edge (5") vs bottom (43") vs left (36") vs right (36")
    const dir = computeFallBackDirection({ x: 36, y: 5 }, width, height);
    expect(dir).toEqual({ x: 0, y: -1 });
  });

  it('should point toward the bottom edge when model is closest to y=height', () => {
    // Model at x=36, y=44 -- closest to bottom edge (4") vs top (44") vs left (36") vs right (36")
    const dir = computeFallBackDirection({ x: 36, y: 44 }, width, height);
    expect(dir).toEqual({ x: 0, y: 1 });
  });

  it('should pick left when tied between left and top', () => {
    // Model at x=10, y=10 -- tied between left (10) and top (10)
    // Since left is checked first (minimum comparisons), left wins on tie
    const dir = computeFallBackDirection({ x: 10, y: 10 }, width, height);
    // Both are 10 from edge. Math.min returns 10, and distToLeft === 10 is checked first
    expect(dir).toEqual({ x: -1, y: 0 });
  });

  it('should return correct direction for center of battlefield', () => {
    // Model at center (36, 24) -- closest to top/bottom (24") vs left/right (36")
    const dir = computeFallBackDirection({ x: 36, y: 24 }, width, height);
    // Top and bottom are both 24", left and right are both 36"
    // 24 < 36, so top/bottom wins. distToTop === distToBottom === 24,
    // so distToTop is checked first.
    expect(dir).toEqual({ x: 0, y: -1 });
  });
});

// ─── computeFallBackDistance Tests ───────────────────────────────────────────

describe('computeFallBackDistance', () => {
  it('should compute I + d6 for standard initiative and low roll', () => {
    expect(computeFallBackDistance(4, 1)).toBe(5);
  });

  it('should compute I + d6 for standard initiative and high roll', () => {
    expect(computeFallBackDistance(4, 6)).toBe(10);
  });

  it('should compute I + d6 for high initiative', () => {
    expect(computeFallBackDistance(7, 3)).toBe(10);
  });

  it('should compute I + d6 for low initiative', () => {
    expect(computeFallBackDistance(1, 2)).toBe(3);
  });

  it('should return initiative when dice roll is 0 (edge case)', () => {
    expect(computeFallBackDistance(4, 0)).toBe(4);
  });
});

// ─── handleRoutSubPhase Tests ───────────────────────────────────────────────

describe('handleRoutSubPhase', () => {
  it('should be a no-op when no units are routed', () => {
    const state = createGameState(); // Default units have no Routed status
    const dice = new FixedDiceProvider([]);

    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    // State unchanged
    expect(result.state).toBe(state);
  });

  it('should fall back routed unit toward nearest edge', () => {
    // Place a routed unit near the left edge at x=10, y=24
    // Nearest edge is left (x=0), distance=10
    const routedModels = [
      createModel('r-m0', 10, 24),
      createModel('r-m1', 12, 24),
    ];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Roll a 3 for fall back: I(4) + 3 = 7" toward left edge
    const dice = new FixedDiceProvider([3]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Model at x=10 should move 7" left to x=3
    const unit = result.state.armies[0].units[0];
    expect(unit.models[0].position.x).toBeCloseTo(3, 5);
    expect(unit.models[0].position.y).toBeCloseTo(24, 5);

    // Model at x=12 should move 7" left to x=5
    expect(unit.models[1].position.x).toBeCloseTo(5, 5);
    expect(unit.models[1].position.y).toBeCloseTo(24, 5);

    // Unit should be in FellBack state
    expect(unit.movementState).toBe(UnitMovementState.FellBack);
  });

  it('should emit RoutMoveEvent with correct data', () => {
    const routedModels = [createModel('r-m0', 10, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([2]); // I(4) + 2 = 6"
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);
    const routEvent = result.events.find(e => e.type === 'routMove');
    expect(routEvent).toBeDefined();
    expect(routEvent).toMatchObject({
      type: 'routMove',
      unitId: 'routed-1',
      distanceRolled: 2,
      reachedEdge: false,
    });
  });

  it('should trigger leadership check when models reach edge', () => {
    // Place routed unit very close to left edge at x=2
    // Fall back I(4) + any d6 >= 1 = at least 5", which puts them past the edge
    const routedModels = [createModel('r-m0', 2, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Dice: [1] for fall back d6 (I+1=5, will move past x=0 to edge),
    // then [3, 3] for leadership check (3+3=6 <= LD 7, passes)
    const dice = new FixedDiceProvider([1, 3, 3]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Should have routMove and leadershipCheck events
    const routEvent = result.events.find(e => e.type === 'routMove');
    expect(routEvent).toBeDefined();
    expect(routEvent).toMatchObject({
      reachedEdge: true,
    });

    const ldEvent = result.events.find(e => e.type === 'leadershipCheck');
    expect(ldEvent).toBeDefined();
    expect(ldEvent).toMatchObject({
      type: 'leadershipCheck',
      unitId: 'routed-1',
      roll: 6,
      target: DEFAULT_LEADERSHIP,
      passed: true,
    });
  });

  it('should lose Routed and gain Suppressed on leadership pass', () => {
    const routedModels = [createModel('r-m0', 2, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Roll 1 for fall back (reaches edge), roll 3+3=6 for leadership (passes, <=7)
    const dice = new FixedDiceProvider([1, 3, 3]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    const unit = result.state.armies[0].units[0];
    expect(unit.statuses).not.toContain(TacticalStatus.Routed);
    expect(unit.statuses).toContain(TacticalStatus.Suppressed);

    // Check events
    const removedEvent = result.events.find(e => e.type === 'statusRemoved');
    expect(removedEvent).toMatchObject({
      type: 'statusRemoved',
      unitId: 'routed-1',
      status: TacticalStatus.Routed,
    });

    const appliedEvent = result.events.find(e => e.type === 'statusApplied');
    expect(appliedEvent).toMatchObject({
      type: 'statusApplied',
      unitId: 'routed-1',
      status: TacticalStatus.Suppressed,
    });
  });

  it('should remove unit on leadership failure', () => {
    const routedModels = [createModel('r-m0', 2, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Roll 1 for fall back (reaches edge), roll 6+6=12 for leadership (fails, >7)
    const dice = new FixedDiceProvider([1, 6, 6]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Unit should have all models destroyed
    const unit = result.state.armies[0].units[0];
    expect(unit.models[0].isDestroyed).toBe(true);
    expect(unit.models[0].currentWounds).toBe(0);

    // Check leadership check event
    const ldEvent = result.events.find(e => e.type === 'leadershipCheck');
    expect(ldEvent).toMatchObject({
      type: 'leadershipCheck',
      unitId: 'routed-1',
      roll: 12,
      target: DEFAULT_LEADERSHIP,
      passed: false,
    });

    // Check destroyed event
    const destroyedEvent = result.events.find(e => e.type === 'unitDestroyed');
    expect(destroyedEvent).toBeDefined();
    expect(destroyedEvent).toMatchObject({
      type: 'unitDestroyed',
      unitId: 'routed-1',
      reason: 'Failed Leadership Check while Routed at battlefield edge',
    });
  });

  it('should process multiple routed units', () => {
    const routedModels1 = [createModel('r1-m0', 10, 24)];
    const routedUnit1 = createUnit('routed-1', routedModels1, {
      statuses: [TacticalStatus.Routed],
    });
    const routedModels2 = [createModel('r2-m0', 60, 24)];
    const routedUnit2 = createUnit('routed-2', routedModels2, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit1, routedUnit2]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 36, 40)])]),
      ],
    });

    // Each unit gets 1 d6 roll for fall back
    // Unit 1 rolls 2 (I4+2=6, moves left), Unit 2 rolls 4 (I4+4=8, moves right)
    const dice = new FixedDiceProvider([2, 4]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Unit 1: x=10, moves 6" left to x=4
    const unit1 = result.state.armies[0].units[0];
    expect(unit1.models[0].position.x).toBeCloseTo(4, 5);
    expect(unit1.movementState).toBe(UnitMovementState.FellBack);

    // Unit 2: x=60, moves 8" right to x=68
    const unit2 = result.state.armies[0].units[1];
    expect(unit2.models[0].position.x).toBeCloseTo(68, 5);
    expect(unit2.movementState).toBe(UnitMovementState.FellBack);

    // Should have two routMove events
    const routEvents = result.events.filter(e => e.type === 'routMove');
    expect(routEvents).toHaveLength(2);
  });

  it('should not affect non-routed units', () => {
    const normalModels = [createModel('n-m0', 10, 24)];
    const normalUnit = createUnit('normal-1', normalModels);

    const routedModels = [createModel('r-m0', 30, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [normalUnit, routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([3]); // Only routed unit rolls
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Normal unit should not have moved
    const normal = result.state.armies[0].units[0];
    expect(normal.models[0].position).toEqual({ x: 10, y: 24 });
    expect(normal.movementState).toBe(UnitMovementState.Stationary);

    // Routed unit should have moved (toward nearest edge, which is top/bottom at y=24)
    const routed = result.state.armies[0].units[1];
    expect(routed.models[0].position.y).not.toBe(24);
  });

  it('should apply terrain penalties to fall-back movement', () => {
    // Place routed unit at x=10, y=24 -- nearest edge is left
    // Place difficult terrain between model and the left edge
    const routedModels = [createModel('r-m0', 10, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const terrain = [makeDifficultTerrain('diff-1', 0, 20, 10, 8)];
    // Terrain covers x=0 to x=10, y=20 to y=28 -- model will end in difficult terrain

    const state = createGameState({
      terrain,
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Roll 2 for fall back: I(4) + 2 = 6", with -2 terrain penalty = 4" effective
    const dice = new FixedDiceProvider([2]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Model at x=10 should move 4" left (6" - 2" penalty) to x=6
    const unit = result.state.armies[0].units[0];
    expect(unit.models[0].position.x).toBeCloseTo(6, 5);
  });

  it('should clamp model position to battlefield bounds', () => {
    // Place routed unit at x=3, y=24 -- nearest edge is left, only 3" away
    // Fall back distance will exceed 3" so model should be clamped to x=0
    const routedModels = [createModel('r-m0', 3, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // Roll 6 for fall back: I(4) + 6 = 10", but only 3" to edge
    // Then 3+3=6 for leadership (passes, <=7)
    const dice = new FixedDiceProvider([6, 3, 3]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);

    // Model should be clamped to x=0 (battlefield edge)
    const unit = result.state.armies[0].units[0];
    expect(unit.models[0].position.x).toBe(0);
    expect(unit.models[0].position.y).toBe(24);
  });

  it('should not mutate original state', () => {
    const routedModels = [createModel('r-m0', 10, 24)];
    const routedUnit = createUnit('routed-1', routedModels, {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      armies: [
        createArmy(0, [routedUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    const originalX = state.armies[0].units[0].models[0].position.x;
    const dice = new FixedDiceProvider([3]);
    const result = handleRoutSubPhase(state, dice);

    expect(result.accepted).toBe(true);
    // Original state unchanged
    expect(state.armies[0].units[0].models[0].position.x).toBe(originalX);
    // New state different
    expect(result.state.armies[0].units[0].models[0].position.x).not.toBe(originalX);
  });
});

// ─── Constants Verification ─────────────────────────────────────────────────

describe('rout constants', () => {
  it('should have DEFAULT_INITIATIVE of 4', () => {
    expect(DEFAULT_INITIATIVE).toBe(4);
  });

  it('should have DEFAULT_LEADERSHIP of 7', () => {
    expect(DEFAULT_LEADERSHIP).toBe(7);
  });

  it('should have EDGE_THRESHOLD of 0.5', () => {
    expect(EDGE_THRESHOLD).toBe(0.5);
  });
});
