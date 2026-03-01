/**
 * Reserves Handler Tests
 *
 * Tests for handleReservesTest and handleReservesEntry.
 * Covers reserves arrival rolls, battlefield placement, entry methods,
 * transport/embarked sharing, validation, and event emission.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Phase,
  SubPhase,
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
  CharacteristicModifier,
} from '@hh/types';
import { createRectTerrain } from '@hh/geometry';
import { FixedDiceProvider } from '../dice';
import {
  handleReservesTest,
  handleReservesEntry,
  RESERVES_TARGET_NUMBER,
} from './reserves-handler';

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
    currentSubPhase: SubPhase.Reserves,
    awaitingReaction: false,
    pendingReaction: undefined,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
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

// ─── handleReservesTest Tests ───────────────────────────────────────────────

describe('handleReservesTest', () => {
  let state: GameState;

  beforeEach(() => {
    // Create a state with a reserves unit
    const reserveModels = [
      createModel('res-m0', 0, 0),
      createModel('res-m1', 0, 0),
      createModel('res-m2', 0, 0),
    ];
    const reserveUnit = createUnit('res-u1', reserveModels, {
      isInReserves: true,
      isDeployed: false,
    });

    const p1Models = [
      createModel('u3-m0', 50, 40),
      createModel('u3-m1', 52, 40),
    ];

    state = createGameState({
      armies: [
        createArmy(0, [reserveUnit]),
        createArmy(1, [createUnit('u3', p1Models)]),
      ],
    });
  });

  it('should pass reserves test on roll of 3+', () => {
    const dice = new FixedDiceProvider([3]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Unit should no longer be in reserves and should be deployed
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(false);
    expect(unit.isDeployed).toBe(true);
    expect(unit.movementState).toBe(UnitMovementState.EnteredFromReserves);
  });

  it('should pass reserves test on roll of 4', () => {
    const dice = new FixedDiceProvider([4]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(false);
    expect(unit.isDeployed).toBe(true);
  });

  it('should pass reserves test on roll of 5', () => {
    const dice = new FixedDiceProvider([5]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(false);
  });

  it('should pass reserves test on roll of 6', () => {
    const dice = new FixedDiceProvider([6]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(false);
  });

  it('should fail reserves test on roll of 1', () => {
    const dice = new FixedDiceProvider([1]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);

    // Unit should still be in reserves
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(true);
    expect(unit.isDeployed).toBe(false);
  });

  it('should fail reserves test on roll of 2', () => {
    const dice = new FixedDiceProvider([2]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);

    // Unit should still be in reserves
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(true);
    expect(unit.isDeployed).toBe(false);
  });

  it('should emit ReservesTestEvent with correct data on pass', () => {
    const dice = new FixedDiceProvider([4]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    const testEvent = result.events.find(e => e.type === 'reservesTest');
    expect(testEvent).toBeDefined();
    expect(testEvent).toMatchObject({
      type: 'reservesTest',
      unitId: 'res-u1',
      roll: 4,
      targetNumber: RESERVES_TARGET_NUMBER,
      passed: true,
    });
  });

  it('should emit ReservesTestEvent with correct data on fail', () => {
    const dice = new FixedDiceProvider([2]);
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    const testEvent = result.events.find(e => e.type === 'reservesTest');
    expect(testEvent).toBeDefined();
    expect(testEvent).toMatchObject({
      type: 'reservesTest',
      unitId: 'res-u1',
      roll: 2,
      targetNumber: RESERVES_TARGET_NUMBER,
      passed: false,
    });
  });

  it('should share test between transport and embarked units', () => {
    // Create a transport with an embarked unit
    const transportModels = [createModel('trans-m0', 0, 0)];
    const transportUnit = createUnit('transport-1', transportModels, {
      isInReserves: true,
      isDeployed: false,
    });
    const embarkedModels = [
      createModel('emb-m0', 0, 0),
      createModel('emb-m1', 0, 0),
    ];
    const embarkedUnit = createUnit('embarked-1', embarkedModels, {
      isInReserves: true,
      isDeployed: false,
      embarkedOnId: 'transport-1',
    });

    const p1Models = [createModel('u3-m0', 50, 40)];

    const transportState = createGameState({
      armies: [
        createArmy(0, [transportUnit, embarkedUnit]),
        createArmy(1, [createUnit('u3', p1Models)]),
      ],
    });

    // Roll 3+ for the transport -- embarked unit should also arrive
    const dice = new FixedDiceProvider([5]);
    const result = handleReservesTest(transportState, 'transport-1', dice);

    expect(result.accepted).toBe(true);

    // Both transport and embarked unit should be out of reserves
    const transport = result.state.armies[0].units[0];
    const embarked = result.state.armies[0].units[1];
    expect(transport.isInReserves).toBe(false);
    expect(transport.isDeployed).toBe(true);
    expect(embarked.isInReserves).toBe(false);
    expect(embarked.isDeployed).toBe(true);
    expect(embarked.movementState).toBe(UnitMovementState.EnteredFromReserves);
  });

  it('should reject test for unit not in reserves', () => {
    const deployedState = createGameState(); // Default units are deployed, not in reserves
    const dice = new FixedDiceProvider([6]);
    const result = handleReservesTest(deployedState, 'u1', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_IN_RESERVES');
  });

  it('should reject test for nonexistent unit', () => {
    const dice = new FixedDiceProvider([6]);
    const result = handleReservesTest(state, 'nonexistent', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_NOT_FOUND');
  });

  it('should reject test for opponent unit', () => {
    // Put an enemy unit in reserves
    const enemyReserveModels = [createModel('er-m0', 0, 0)];
    const enemyReserveUnit = createUnit('enemy-res', enemyReserveModels, {
      isInReserves: true,
      isDeployed: false,
    });
    const p0ReserveModels = [createModel('res-m0', 0, 0)];
    const p0ReserveUnit = createUnit('res-u1', p0ReserveModels, {
      isInReserves: true,
      isDeployed: false,
    });

    const modifiedState = createGameState({
      armies: [
        createArmy(0, [p0ReserveUnit]),
        createArmy(1, [enemyReserveUnit]),
      ],
    });

    const dice = new FixedDiceProvider([6]);
    const result = handleReservesTest(modifiedState, 'enemy-res', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_ACTIVE_PLAYER');
  });

  it('should process multiple reserves tests in sequence', () => {
    // Add two reserve units
    const resModels1 = [createModel('r1-m0', 0, 0), createModel('r1-m1', 0, 0)];
    const resUnit1 = createUnit('res-1', resModels1, { isInReserves: true, isDeployed: false });
    const resModels2 = [createModel('r2-m0', 0, 0), createModel('r2-m1', 0, 0)];
    const resUnit2 = createUnit('res-2', resModels2, { isInReserves: true, isDeployed: false });

    const seqState = createGameState({
      armies: [
        createArmy(0, [resUnit1, resUnit2]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    // First unit rolls 3 (passes), second unit rolls 1 (fails)
    const dice1 = new FixedDiceProvider([3]);
    const result1 = handleReservesTest(seqState, 'res-1', dice1);
    expect(result1.accepted).toBe(true);
    expect(result1.state.armies[0].units[0].isInReserves).toBe(false);

    const dice2 = new FixedDiceProvider([1]);
    const result2 = handleReservesTest(result1.state, 'res-2', dice2);
    expect(result2.accepted).toBe(true);
    expect(result2.state.armies[0].units[1].isInReserves).toBe(true);
  });

  it('should not mutate original state', () => {
    const dice = new FixedDiceProvider([5]);
    const originalIsInReserves = state.armies[0].units[0].isInReserves;
    const result = handleReservesTest(state, 'res-u1', dice);

    expect(result.accepted).toBe(true);
    // Original state unchanged
    expect(state.armies[0].units[0].isInReserves).toBe(originalIsInReserves);
    // New state updated
    expect(result.state.armies[0].units[0].isInReserves).toBe(false);
  });
});

// ─── handleReservesEntry Tests ──────────────────────────────────────────────

describe('handleReservesEntry', () => {
  let state: GameState;

  beforeEach(() => {
    // Unit that has passed reserves test (isInReserves = false, isDeployed = true,
    // movementState = EnteredFromReserves)
    const entryModels = [
      createModel('e-m0', 0, 0),
      createModel('e-m1', 0, 0),
      createModel('e-m2', 0, 0),
    ];
    const entryUnit = createUnit('entry-u1', entryModels, {
      isInReserves: false,
      isDeployed: true,
      movementState: UnitMovementState.EnteredFromReserves,
    });

    const p1Models = [
      createModel('u3-m0', 50, 40),
      createModel('u3-m1', 52, 40),
    ];

    state = createGameState({
      armies: [
        createArmy(0, [entryUnit]),
        createArmy(1, [createUnit('u3', p1Models)]),
      ],
    });
  });

  it('should place unit at battlefield edge with valid positions', () => {
    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Models should be at their new positions
    const unit = result.state.armies[0].units[0];
    expect(unit.models[0].position).toEqual({ x: 0.5, y: 24 });
    expect(unit.models[1].position).toEqual({ x: 0.5, y: 26 });
    expect(unit.models[2].position).toEqual({ x: 0.5, y: 22 });
  });

  it('should mark unit as EnteredFromReserves after entry', () => {
    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.movementState).toBe(UnitMovementState.EnteredFromReserves);
  });

  it('should emit ReservesEntryEvent with correct data', () => {
    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(true);
    const entryEvent = result.events.find(e => e.type === 'reservesEntry');
    expect(entryEvent).toBeDefined();
    expect(entryEvent).toMatchObject({
      type: 'reservesEntry',
      unitId: 'entry-u1',
      entryMethod: 'edge',
      modelPositions: [
        { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
        { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
        { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
      ],
    });
  });

  it('should reject entry if positions are in impassable terrain', () => {
    const impassableState = {
      ...state,
      terrain: [makeImpassableTerrain(0, 20, 4, 8)],
    };

    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(impassableState, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 2, y: 24 } },
      { modelId: 'e-m1', position: { x: 2, y: 26 } },
      { modelId: 'e-m2', position: { x: 2, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'IN_IMPASSABLE_TERRAIN')).toBe(true);
  });

  it('should reject entry if positions are in enemy exclusion zone', () => {
    // Place enemy right at the edge
    const closeEnemyState = createGameState({
      armies: [
        createArmy(0, [createUnit('entry-u1', [
          createModel('e-m0', 0, 0),
          createModel('e-m1', 0, 0),
          createModel('e-m2', 0, 0),
        ], {
          isInReserves: false,
          isDeployed: true,
          movementState: UnitMovementState.EnteredFromReserves,
        })]),
        createArmy(1, [createUnit('u3', [
          createModel('u3-m0', 2, 24),
          createModel('u3-m1', 2, 26),
        ])]),
      ],
    });

    const dice = new FixedDiceProvider([]);
    // Try to place within 1" of enemy at x=2
    const result = handleReservesEntry(closeEnemyState, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'IN_EXCLUSION_ZONE')).toBe(true);
  });

  it('should reject entry if coherency is broken among placed models', () => {
    const dice = new FixedDiceProvider([]);
    // Place models far apart so coherency breaks (>2" edge-to-edge)
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 10 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 40 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'COHERENCY_BROKEN')).toBe(true);
  });

  it('should reject entry if first model is not at battlefield edge', () => {
    const dice = new FixedDiceProvider([]);
    // Place first model in the middle of the battlefield (not at edge)
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 36, y: 24 } },
      { modelId: 'e-m1', position: { x: 36, y: 26 } },
      { modelId: 'e-m2', position: { x: 36, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'NOT_AT_EDGE')).toBe(true);
  });

  it('should validate deep strike entry (not too close to edges)', () => {
    // Create unit with Deep Strike modifier
    const deepStrikeModifier: CharacteristicModifier = {
      characteristic: 'movement',
      operation: 'set',
      value: 0,
      source: 'Deep Strike',
      expiresAt: { type: 'endOfBattle' },
    };

    const dsModels = [
      createModel('ds-m0', 0, 0),
      createModel('ds-m1', 0, 0),
    ];
    const dsUnit = createUnit('ds-u1', dsModels, {
      isInReserves: false,
      isDeployed: true,
      movementState: UnitMovementState.EnteredFromReserves,
      modifiers: [deepStrikeModifier],
    });

    const dsState = createGameState({
      armies: [
        createArmy(0, [dsUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 60, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([]);
    // Place at edge -- should be rejected for deep strike (too close to edge)
    const result = handleReservesEntry(dsState, 'ds-u1', [
      { modelId: 'ds-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'ds-m1', position: { x: 0.5, y: 26 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'TOO_CLOSE_TO_EDGE')).toBe(true);
  });

  it('should allow deep strike entry at valid interior positions', () => {
    const deepStrikeModifier: CharacteristicModifier = {
      characteristic: 'movement',
      operation: 'set',
      value: 0,
      source: 'Deep Strike',
      expiresAt: { type: 'endOfBattle' },
    };

    const dsModels = [
      createModel('ds-m0', 0, 0),
      createModel('ds-m1', 0, 0),
    ];
    const dsUnit = createUnit('ds-u1', dsModels, {
      isInReserves: false,
      isDeployed: true,
      movementState: UnitMovementState.EnteredFromReserves,
      modifiers: [deepStrikeModifier],
    });

    const dsState = createGameState({
      armies: [
        createArmy(0, [dsUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 60, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([]);
    // Place in the interior -- should be accepted
    const result = handleReservesEntry(dsState, 'ds-u1', [
      { modelId: 'ds-m0', position: { x: 30, y: 24 } },
      { modelId: 'ds-m1', position: { x: 30, y: 26 } },
    ], dice);

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);

    const entryEvent = result.events.find(e => e.type === 'reservesEntry');
    expect(entryEvent).toMatchObject({
      type: 'reservesEntry',
      entryMethod: 'deepStrike',
    });
  });

  it('should validate outflank entry (must be at side edge)', () => {
    const outflankModifier: CharacteristicModifier = {
      characteristic: 'movement',
      operation: 'set',
      value: 0,
      source: 'Outflank',
      expiresAt: { type: 'endOfBattle' },
    };

    const ofModels = [
      createModel('of-m0', 0, 0),
      createModel('of-m1', 0, 0),
    ];
    const ofUnit = createUnit('of-u1', ofModels, {
      isInReserves: false,
      isDeployed: true,
      movementState: UnitMovementState.EnteredFromReserves,
      modifiers: [outflankModifier],
    });

    const ofState = createGameState({
      armies: [
        createArmy(0, [ofUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 60, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([]);

    // Place at top edge (y=0) -- not a side edge, should be rejected
    const resultTop = handleReservesEntry(ofState, 'of-u1', [
      { modelId: 'of-m0', position: { x: 36, y: 0.5 } },
      { modelId: 'of-m1', position: { x: 38, y: 0.5 } },
    ], dice);

    expect(resultTop.accepted).toBe(false);
    expect(resultTop.errors.some(e => e.code === 'NOT_AT_SIDE_EDGE')).toBe(true);

    // Place at left edge (x=0) -- this IS a side edge, should be accepted
    const resultLeft = handleReservesEntry(ofState, 'of-u1', [
      { modelId: 'of-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'of-m1', position: { x: 0.5, y: 26 } },
    ], dice);

    expect(resultLeft.accepted).toBe(true);
    expect(resultLeft.errors).toHaveLength(0);

    const entryEvent = resultLeft.events.find(e => e.type === 'reservesEntry');
    expect(entryEvent).toMatchObject({
      type: 'reservesEntry',
      entryMethod: 'outflank',
    });
  });

  it('should reject entry for unit still in reserves', () => {
    const stillInReserveUnit = createUnit('still-res', [
      createModel('sr-m0', 0, 0),
    ], {
      isInReserves: true,
      isDeployed: false,
    });

    const resState = createGameState({
      armies: [
        createArmy(0, [stillInReserveUnit]),
        createArmy(1, [createUnit('u3', [createModel('u3-m0', 50, 40)])]),
      ],
    });

    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(resState, 'still-res', [
      { modelId: 'sr-m0', position: { x: 0.5, y: 24 } },
    ], dice);

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_STILL_IN_RESERVES');
  });

  it('should not mutate original state on entry', () => {
    const originalPosition = { ...state.armies[0].units[0].models[0].position };
    const dice = new FixedDiceProvider([]);
    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 0.5, y: 26 } },
      { modelId: 'e-m2', position: { x: 0.5, y: 22 } },
    ], dice);

    expect(result.accepted).toBe(true);
    // Original state unchanged
    expect(state.armies[0].units[0].models[0].position).toEqual(originalPosition);
    // New state updated
    expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 0.5, y: 24 });
  });
});
