/**
 * Move Handler Tests
 *
 * Tests for handleMoveModel, handleRushUnit, and handleDangerousTerrainTest.
 * Covers normal moves, rush moves, terrain interactions, coherency,
 * validation errors, and event emission.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  handleMoveModel,
  handleMoveUnit,
  handleRushUnit,
  handleDangerousTerrainTest,
  DEFAULT_MOVEMENT,
  DEFAULT_INITIATIVE,
} from './move-handler';

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
  // Default: player 0 has one unit with 3 models in a line at y=24 (mid-table)
  // Player 1 has one unit with 2 models at y=40 (far side)
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
    currentSubPhase: SubPhase.Move,
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
  x: number,
  y: number,
  w: number,
  h: number,
): TerrainPiece {
  return createRectTerrain(
    'diff-1',
    'Difficult Area',
    TerrainType.Difficult,
    { x, y },
    w,
    h,
    true,
    false,
  );
}

function makeDangerousTerrain(
  x: number,
  y: number,
  w: number,
  h: number,
): TerrainPiece {
  return createRectTerrain(
    'dang-1',
    'Dangerous Area',
    TerrainType.Dangerous,
    { x, y },
    w,
    h,
    true,
    true,
  );
}

function makeImpassableTerrain(
  x: number,
  y: number,
  w: number,
  h: number,
): TerrainPiece {
  return createRectTerrain(
    'imp-1',
    'Impassable Wall',
    TerrainType.Impassable,
    { x, y },
    w,
    h,
    false,
    false,
  );
}

// ─── handleMoveModel Tests ──────────────────────────────────────────────────

describe('handleMoveModel', () => {
  let state: GameState;
  let dice: FixedDiceProvider;

  beforeEach(() => {
    state = createGameState();
    dice = new FixedDiceProvider([]);
  });

  // ── Normal Move on Open Ground ──────────────────────────────────────

  it('should succeed for a valid move within range on open ground', () => {
    const result = handleMoveModel(state, 'u1-m0', { x: 17, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Model position should be updated
    const movedModel = result.state.armies[0].units[0].models[0];
    expect(movedModel.position).toEqual({ x: 17, y: 24 });
  });

  it('should emit a modelMoved event with correct data', () => {
    const result = handleMoveModel(state, 'u1-m0', { x: 15, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    const movedEvent = result.events.find(e => e.type === 'modelMoved');
    expect(movedEvent).toBeDefined();
    expect(movedEvent).toMatchObject({
      type: 'modelMoved',
      modelId: 'u1-m0',
      unitId: 'u1',
      fromPosition: { x: 10, y: 24 },
      toPosition: { x: 15, y: 24 },
      distanceMoved: 5,
    });
  });

  it('should set unit movement state to Moved on first model move', () => {
    const result = handleMoveModel(state, 'u1-m0', { x: 15, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.movementState).toBe(UnitMovementState.Moved);
  });

  it('should allow moving exactly M inches (7")', () => {
    const result = handleMoveModel(state, 'u1-m0', { x: 17, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // ── Exceeding Movement Range ────────────────────────────────────────

  it('should reject a move that exceeds movement range', () => {
    // 10 inches is more than M=7
    const result = handleMoveModel(state, 'u1-m0', { x: 20, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'EXCEEDS_MOVEMENT')).toBe(true);
    // State should be unchanged
    expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 10, y: 24 });
  });

  // ── Exclusion Zone (1" from enemy) ──────────────────────────────────

  it('should reject a move into the enemy exclusion zone', () => {
    // Place enemy models close enough that moving near them enters exclusion zone
    const closeEnemyModels = [
      createModel('u3-m0', 18, 24),
      createModel('u3-m1', 20, 24),
    ];
    state = createGameState({
      armies: [
        createArmy(0, [createUnit('u1', [
          createModel('u1-m0', 10, 24),
          createModel('u1-m1', 12, 24),
          createModel('u1-m2', 14, 24),
        ])]),
        createArmy(1, [createUnit('u3', closeEnemyModels)]),
      ],
    });

    // Try to move within 1" of enemy at x=18
    // 32mm base radius ~0.63". Enemy at 18, so exclusion extends to ~16.37"
    const result = handleMoveModel(state, 'u1-m0', { x: 17.5, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'IN_EXCLUSION_ZONE')).toBe(true);
  });

  // ── Impassable Terrain ──────────────────────────────────────────────

  it('should reject a move into impassable terrain', () => {
    state = createGameState({
      terrain: [makeImpassableTerrain(14, 22, 4, 4)],
    });

    const result = handleMoveModel(state, 'u1-m0', { x: 16, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(
      e => e.code === 'IN_IMPASSABLE_TERRAIN' || e.code === 'PATH_CROSSES_IMPASSABLE',
    )).toBe(true);
  });

  // ── Terrain Penalty ─────────────────────────────────────────────────

  it('should apply difficult terrain penalty correctly', () => {
    // Difficult terrain at x=14 to x=24, y=20 to y=28
    state = createGameState({
      terrain: [makeDifficultTerrain(14, 20, 10, 8)],
    });

    // M=7, penalty=2, effective=5. Moving 6" into difficult terrain should fail
    const resultFail = handleMoveModel(state, 'u1-m0', { x: 16, y: 24 }, dice);
    expect(resultFail.accepted).toBe(false);
    expect(resultFail.errors.some(e => e.code === 'EXCEEDS_MOVEMENT')).toBe(true);

    // Moving 4" into difficult terrain should succeed (effective M = 5)
    const resultOk = handleMoveModel(state, 'u1-m0', { x: 14, y: 24 }, dice);
    expect(resultOk.accepted).toBe(true);
    expect(resultOk.errors).toHaveLength(0);
  });

  // ── Dangerous Terrain ───────────────────────────────────────────────

  it('should trigger dangerous terrain test when ending in dangerous terrain (pass)', () => {
    state = createGameState({
      terrain: [makeDangerousTerrain(12, 20, 10, 8)],
    });
    // Roll a 4 -- passes the dangerous terrain test
    dice = new FixedDiceProvider([4]);

    // Move 3" into dangerous terrain (effective M = 7 - 2 = 5, so 3" is ok)
    const result = handleMoveModel(state, 'u1-m0', { x: 13, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    const dangerousEvent = result.events.find(e => e.type === 'dangerousTerrainTest');
    expect(dangerousEvent).toBeDefined();
    expect(dangerousEvent).toMatchObject({
      type: 'dangerousTerrainTest',
      modelId: 'u1-m0',
      roll: 4,
      passed: true,
      woundsCaused: 0,
    });

    // Model should not be wounded
    const movedModel = result.state.armies[0].units[0].models[0];
    expect(movedModel.currentWounds).toBe(1);
    expect(movedModel.isDestroyed).toBe(false);
  });

  it('should wound model on failed dangerous terrain test (roll of 1)', () => {
    state = createGameState({
      terrain: [makeDangerousTerrain(12, 20, 10, 8)],
    });
    // Roll a 1 -- fails the dangerous terrain test
    dice = new FixedDiceProvider([1]);

    const result = handleMoveModel(state, 'u1-m0', { x: 13, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    const dangerousEvent = result.events.find(e => e.type === 'dangerousTerrainTest');
    expect(dangerousEvent).toBeDefined();
    expect(dangerousEvent).toMatchObject({
      type: 'dangerousTerrainTest',
      modelId: 'u1-m0',
      roll: 1,
      passed: false,
      woundsCaused: 1,
    });

    // Model should be wounded (1W model → destroyed)
    const movedModel = result.state.armies[0].units[0].models[0];
    expect(movedModel.currentWounds).toBe(0);
    expect(movedModel.isDestroyed).toBe(true);
  });

  // ── Model Not Found ─────────────────────────────────────────────────

  it('should reject if model not found', () => {
    const result = handleMoveModel(state, 'nonexistent-model', { x: 15, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('MODEL_NOT_FOUND');
    expect(result.state).toBe(state);
  });

  // ── Wrong Player ────────────────────────────────────────────────────

  it('should reject if model does not belong to active player', () => {
    // u3-m0 belongs to player 1, but active player is 0
    const result = handleMoveModel(state, 'u3-m0', { x: 55, y: 40 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_ACTIVE_PLAYER');
  });

  // ── Pinned Unit Cannot Move ─────────────────────────────────────────

  it('should reject if unit is pinned', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { statuses: [TacticalStatus.Pinned] }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleMoveModel(state, 'u1-m0', { x: 15, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_MOVE');
  });

  // ── Unit Already Rushed Cannot Make Normal Moves ────────────────────

  it('should reject normal move for a unit that already rushed', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { movementState: UnitMovementState.Rushed }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleMoveModel(state, 'u1-m0', { x: 15, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_ALREADY_RUSHED');
  });

  // ── Multiple Model Moves Within Same Unit ───────────────────────────

  it('should allow multiple models in the same unit to move sequentially', () => {
    // Move first model
    const result1 = handleMoveModel(state, 'u1-m0', { x: 15, y: 24 }, dice);
    expect(result1.accepted).toBe(true);
    expect(result1.state.armies[0].units[0].movementState).toBe(UnitMovementState.Moved);

    // Move second model using updated state
    const result2 = handleMoveModel(result1.state, 'u1-m1', { x: 17, y: 24 }, dice);
    expect(result2.accepted).toBe(true);

    // Both models should have new positions
    expect(result2.state.armies[0].units[0].models[0].position).toEqual({ x: 15, y: 24 });
    expect(result2.state.armies[0].units[0].models[1].position).toEqual({ x: 17, y: 24 });

    // Unit should still be in Moved state
    expect(result2.state.armies[0].units[0].movementState).toBe(UnitMovementState.Moved);
  });

  // ── Coherency Broken ───────────────────────────────────────────────

  it('should apply Suppressed status when coherency is broken', () => {
    // Create a unit with models that will become incoherent after move
    // Model at 10,24 moved to 30,24 -- far from models at 12,24 and 14,24
    // 30 - 14 = 16" apart, well beyond 2" coherency
    const result = handleMoveModel(state, 'u1-m0', { x: 17, y: 24 }, dice);

    // First, move should succeed (coherency is a warning, not a blocker)
    expect(result.accepted).toBe(true);

    // Now move the same model's unit to break coherency
    // Recreate state with wider spacing to guarantee incoherency
    const wideState = createGameState({
      armies: [
        createArmy(0, [createUnit('u1', [
          createModel('u1-m0', 10, 24),
          createModel('u1-m1', 12, 24),
          createModel('u1-m2', 14, 24),
        ])]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    // Move m0 far away from the others (but within M range)
    // 10 -> 17 = 7" move (exactly M), but 17 is 3" from m1 at 12, 5" from m2 at 14
    // With 32mm bases (~0.63" radius each), edge-to-edge from 17 to 14 is ~1.74"
    // That's within 2" coherency, so this won't break coherency.
    // We need to move to a position that IS out of coherency from all other models.
    // Move model from 10,24 to 10,31 (7" up). Other models at 12,24 and 14,24.
    // Distance from (10,31) to (12,24) = sqrt(4+49) = 7.28", minus ~1.26" bases = ~6.02" > 2"
    const breakResult = handleMoveModel(wideState, 'u1-m0', { x: 10, y: 31 }, dice);

    expect(breakResult.accepted).toBe(true);
    const suppressedEvent = breakResult.events.find(e => e.type === 'statusApplied');
    expect(suppressedEvent).toBeDefined();
    expect(suppressedEvent).toMatchObject({
      type: 'statusApplied',
      unitId: 'u1',
      status: TacticalStatus.Suppressed,
    });

    // Unit should have Suppressed status
    const unit = breakResult.state.armies[0].units[0];
    expect(unit.statuses).toContain(TacticalStatus.Suppressed);
  });

  // ── Model Position Updates Correctly ────────────────────────────────

  it('should update model position without mutating original state', () => {
    const originalPosition = { ...state.armies[0].units[0].models[0].position };
    const result = handleMoveModel(state, 'u1-m0', { x: 15, y: 26 }, dice);

    expect(result.accepted).toBe(true);
    // New state has updated position
    expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 15, y: 26 });
    // Original state is unchanged (immutability)
    expect(state.armies[0].units[0].models[0].position).toEqual(originalPosition);
  });

  // ── Out of Bounds ───────────────────────────────────────────────────

  it('should reject a move outside battlefield bounds', () => {
    const edgeState = createGameState({
      armies: [
        createArmy(0, [createUnit('u1', [
          createModel('u1-m0', 2, 24),
          createModel('u1-m1', 4, 24),
          createModel('u1-m2', 6, 24),
        ])]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleMoveModel(edgeState, 'u1-m0', { x: -1, y: 24 }, dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'OUT_OF_BOUNDS')).toBe(true);
  });

  // ── Zero Distance Move (Staying in Place) ──────────────────────────

  it('should accept a zero-distance move (staying in place)', () => {
    const result = handleMoveModel(state, 'u1-m0', { x: 10, y: 24 }, dice);

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 10, y: 24 });
  });
});

// ─── handleMoveUnit Tests ───────────────────────────────────────────────────

describe('handleMoveUnit', () => {
  let state: GameState;
  let dice: FixedDiceProvider;

  beforeEach(() => {
    state = createGameState();
    dice = new FixedDiceProvider([]);
  });

  it('should move all alive models atomically and mark unit as moved', () => {
    const result = handleMoveUnit(
      state,
      'u1',
      [
        { modelId: 'u1-m0', position: { x: 13, y: 24 } },
        { modelId: 'u1-m1', position: { x: 15, y: 24 } },
        { modelId: 'u1-m2', position: { x: 17, y: 24 } },
      ],
      dice,
    );

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 13, y: 24 });
    expect(result.state.armies[0].units[0].models[1].position).toEqual({ x: 15, y: 24 });
    expect(result.state.armies[0].units[0].models[2].position).toEqual({ x: 17, y: 24 });
    expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Moved);
    expect(result.events.filter(e => e.type === 'modelMoved')).toHaveLength(3);
  });

  it('should allow Rush distance via moveUnit and mark unit as rushed', () => {
    const result = handleMoveUnit(
      state,
      'u1',
      [
        { modelId: 'u1-m0', position: { x: 20, y: 24 } },
        { modelId: 'u1-m1', position: { x: 22, y: 24 } },
        { modelId: 'u1-m2', position: { x: 24, y: 24 } },
      ],
      dice,
      { isRush: true },
    );

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
    expect(result.events.some(e => e.type === 'unitRushed')).toBe(true);
  });

  it('should reject moveUnit rush when unit has already moved', () => {
    state = createGameState({
      armies: [
        createArmy(0, [createUnit('u1', [
          createModel('u1-m0', 10, 24),
          createModel('u1-m1', 12, 24),
          createModel('u1-m2', 14, 24),
        ], { movementState: UnitMovementState.Moved })]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleMoveUnit(
      state,
      'u1',
      [
        { modelId: 'u1-m0', position: { x: 13, y: 24 } },
        { modelId: 'u1-m1', position: { x: 15, y: 24 } },
        { modelId: 'u1-m2', position: { x: 17, y: 24 } },
      ],
      dice,
      { isRush: true },
    );

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'UNIT_CANNOT_RUSH')).toBe(true);
  });

  it('should not apply Suppressed when coherent formation is preserved', () => {
    const result = handleMoveUnit(
      state,
      'u1',
      [
        { modelId: 'u1-m0', position: { x: 13, y: 24 } },
        { modelId: 'u1-m1', position: { x: 15, y: 24 } },
        { modelId: 'u1-m2', position: { x: 17, y: 24 } },
      ],
      dice,
    );

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].statuses).not.toContain(TacticalStatus.Suppressed);
    expect(result.events.some(e => e.type === 'statusApplied')).toBe(false);
  });

  it('should reject when model positions do not cover all alive models', () => {
    const result = handleMoveUnit(
      state,
      'u1',
      [
        { modelId: 'u1-m0', position: { x: 13, y: 24 } },
        { modelId: 'u1-m1', position: { x: 15, y: 24 } },
      ],
      dice,
    );

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'MODEL_POSITION_COUNT_MISMATCH')).toBe(true);
  });
});

// ─── handleRushUnit Tests ───────────────────────────────────────────────────

describe('handleRushUnit', () => {
  let state: GameState;
  let dice: FixedDiceProvider;

  beforeEach(() => {
    state = createGameState();
    dice = new FixedDiceProvider([]);
  });

  it('should set unit movement state to Rushed', () => {
    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);

    const unit = result.state.armies[0].units[0];
    expect(unit.movementState).toBe(UnitMovementState.Rushed);
  });

  it('should emit unitRushed event with correct rush distance', () => {
    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(true);
    const rushedEvent = result.events.find(e => e.type === 'unitRushed');
    expect(rushedEvent).toBeDefined();
    expect(rushedEvent).toMatchObject({
      type: 'unitRushed',
      unitId: 'u1',
      rushDistance: DEFAULT_MOVEMENT + DEFAULT_INITIATIVE, // 7 + 4 = 11
    });
  });

  it('should reject rush for a pinned unit', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { statuses: [TacticalStatus.Pinned] }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_RUSH');
  });

  it('should reject rush for an already-moved unit', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { movementState: UnitMovementState.Moved }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_RUSH');
  });

  it('should reject rush for an already-rushed unit', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { movementState: UnitMovementState.Rushed }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_RUSH');
  });

  it('should reject rush for a nonexistent unit', () => {
    const result = handleRushUnit(state, 'nonexistent', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_NOT_FOUND');
  });

  it('should reject rush for opponent unit (not active player)', () => {
    const result = handleRushUnit(state, 'u3', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_ACTIVE_PLAYER');
  });

  it('should not mutate original state', () => {
    const originalMovementState = state.armies[0].units[0].movementState;
    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(true);
    // Original state unchanged
    expect(state.armies[0].units[0].movementState).toBe(originalMovementState);
    // New state updated
    expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
  });

  it('should reject rush for a unit locked in combat', () => {
    state = createGameState({
      armies: [
        createArmy(0, [
          createUnit('u1', [
            createModel('u1-m0', 10, 24),
            createModel('u1-m1', 12, 24),
            createModel('u1-m2', 14, 24),
          ], { isLockedInCombat: true }),
        ]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 50, 40),
          createModel('u3-m1', 52, 40),
        ])]),
      ],
    });

    const result = handleRushUnit(state, 'u1', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_RUSH');
  });
});

// ─── handleDangerousTerrainTest Tests ───────────────────────────────────────

describe('handleDangerousTerrainTest', () => {
  it('should pass on roll of 2', () => {
    const dice = new FixedDiceProvider([2]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(true);
    expect(result.event.roll).toBe(2);
    expect(result.event.passed).toBe(true);
    expect(result.event.woundsCaused).toBe(0);
  });

  it('should pass on roll of 3', () => {
    const dice = new FixedDiceProvider([3]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(true);
  });

  it('should pass on roll of 4', () => {
    const dice = new FixedDiceProvider([4]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(true);
  });

  it('should pass on roll of 5', () => {
    const dice = new FixedDiceProvider([5]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(true);
  });

  it('should pass on roll of 6', () => {
    const dice = new FixedDiceProvider([6]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(true);
  });

  it('should fail on roll of 1', () => {
    const dice = new FixedDiceProvider([1]);
    const result = handleDangerousTerrainTest('m1', 'u1', dice);

    expect(result.passed).toBe(false);
    expect(result.event.roll).toBe(1);
    expect(result.event.passed).toBe(false);
    expect(result.event.woundsCaused).toBe(1);
  });

  it('should emit correct event structure', () => {
    const dice = new FixedDiceProvider([3]);
    const result = handleDangerousTerrainTest('model-42', 'unit-7', dice);

    expect(result.event).toEqual({
      type: 'dangerousTerrainTest',
      modelId: 'model-42',
      unitId: 'unit-7',
      roll: 3,
      passed: true,
      woundsCaused: 0,
    });
  });
});

// ─── Constants Verification ─────────────────────────────────────────────────

describe('constants', () => {
  it('should have DEFAULT_MOVEMENT of 7 (standard marine M value)', () => {
    expect(DEFAULT_MOVEMENT).toBe(7);
  });

  it('should have DEFAULT_INITIATIVE of 4 (standard marine I value)', () => {
    expect(DEFAULT_INITIATIVE).toBe(4);
  });

  it('should compute rush distance as M + I = 11', () => {
    expect(DEFAULT_MOVEMENT + DEFAULT_INITIATIVE).toBe(11);
  });
});
