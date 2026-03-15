/**
 * Reserves Handler Tests
 *
 * Verifies the reserve-ready flow, standard/aerial reserve targets, and the
 * corrected reserve-entry behavior for standard reserves, Deep Strike,
 * Outflank, and flyer combat assignments.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  Allegiance,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type {
  ArmyState,
  GameState,
  ModelState,
  UnitState,
} from '@hh/types';
import { FixedDiceProvider } from '../dice';
import {
  handleReservesEntry,
  handleReservesTest,
  RESERVES_TARGET_NUMBER,
} from './reserves-handler';

function createModel(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ModelState> = {},
): ModelState {
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

function createUnit(
  id: string,
  models: ModelState[],
  overrides: Partial<UnitState> = {},
): UnitState {
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
    reserveType: 'standard',
    reserveReadyToEnter: false,
    isDeployed: true,
    flyerCombatAssignment: null,
    aerialReserveReturnCount: 0,
    reserveEntryMethodThisTurn: null,
    cannotChargeThisTurn: false,
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
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    deepStrikeAttemptsThisTurn: 0,
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
      createArmy(0, []),
      createArmy(1, []),
    ],
    currentBattleTurn: 2,
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

describe('handleReservesTest', () => {
  let state: GameState;

  beforeEach(() => {
    const reserveUnit = createUnit(
      'res-u1',
      [
        createModel('res-m0', 0, 0),
        createModel('res-m1', 0, 0),
      ],
      {
        isInReserves: true,
        isDeployed: false,
      },
    );

    state = createGameState({
      armies: [
        createArmy(0, [reserveUnit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });
  });

  it('marks a passed reserves test as ready-to-enter without deploying the unit', () => {
    const result = handleReservesTest(state, 'res-u1', new FixedDiceProvider([4]));

    expect(result.accepted).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.events).toContainEqual({
      type: 'reservesTest',
      unitId: 'res-u1',
      roll: 4,
      targetNumber: RESERVES_TARGET_NUMBER,
      passed: true,
    });

    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(true);
    expect(unit.isDeployed).toBe(false);
    expect(unit.reserveReadyToEnter).toBe(true);
    expect(unit.movementState).toBe(UnitMovementState.Stationary);
  });

  it('keeps a failed reserves test off-board and not ready', () => {
    const result = handleReservesTest(state, 'res-u1', new FixedDiceProvider([2]));

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.isInReserves).toBe(true);
    expect(unit.isDeployed).toBe(false);
    expect(unit.reserveReadyToEnter).toBe(false);
  });

  it('shares a passed reserve test with embarked passengers without deploying either unit', () => {
    const transport = createUnit(
      'transport-1',
      [createModel('transport-m0', 0, 0)],
      {
        profileId: 'rhino',
        isInReserves: true,
        isDeployed: false,
      },
    );
    const embarked = createUnit(
      'embarked-1',
      [
        createModel('emb-m0', 0, 0),
        createModel('emb-m1', 0, 0),
      ],
      {
        isInReserves: true,
        isDeployed: false,
        embarkedOnId: 'transport-1',
      },
    );
    const transportState = createGameState({
      armies: [
        createArmy(0, [transport, embarked]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesTest(transportState, 'transport-1', new FixedDiceProvider([5]));

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].reserveReadyToEnter).toBe(true);
    expect(result.state.armies[0].units[1].reserveReadyToEnter).toBe(true);
    expect(result.state.armies[0].units[0].isInReserves).toBe(true);
    expect(result.state.armies[0].units[1].isInReserves).toBe(true);
  });

  it('rejects a second reserve test after the unit has already passed', () => {
    const passedState = handleReservesTest(state, 'res-u1', new FixedDiceProvider([6])).state;
    const result = handleReservesTest(passedState, 'res-u1', new FixedDiceProvider([6]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0]?.code).toBe('RESERVES_ALREADY_PASSED');
  });

  it('uses the escalating aerial reserves target number', () => {
    const aerialUnit = createUnit(
      'xiphon-1',
      [createModel('xiphon-m0', 0, 0, {
        profileModelName: 'Xiphon',
        unitProfileId: 'xiphon-interceptor',
      })],
      {
        profileId: 'xiphon-interceptor',
        isInReserves: true,
        isDeployed: false,
        reserveType: 'aerial',
        aerialReserveReturnCount: 2,
      },
    );
    const aerialState = createGameState({
      armies: [
        createArmy(0, [aerialUnit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesTest(aerialState, 'xiphon-1', new FixedDiceProvider([4]));

    expect(result.accepted).toBe(true);
    expect(result.events[0]).toMatchObject({
      type: 'reservesTest',
      unitId: 'xiphon-1',
      targetNumber: 5,
      passed: false,
    });
    expect(result.state.armies[0].units[0].reserveReadyToEnter).toBe(false);
  });
});

describe('handleReservesEntry', () => {
  it('requires a reserve-ready unit before any entry placement is accepted', () => {
    const unit = createUnit(
      'entry-u1',
      [createModel('e-m0', 0, 0)],
      {
        isInReserves: true,
        isDeployed: false,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0]?.code).toBe('UNIT_STILL_IN_RESERVES');
  });

  it('deploys a standard reserve unit after it has passed its reserve test', () => {
    const unit = createUnit(
      'entry-u1',
      [
        createModel('e-m0', 0, 0),
        createModel('e-m1', 0, 0),
      ],
      {
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 2, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    const unitState = result.state.armies[0].units[0];
    expect(unitState.isInReserves).toBe(false);
    expect(unitState.isDeployed).toBe(true);
    expect(unitState.reserveReadyToEnter).toBe(false);
    expect(unitState.movementState).toBe(UnitMovementState.EnteredFromReserves);
    expect(unitState.reserveEntryMethodThisTurn).toBe('edge');
    expect(result.events.find((event) => event.type === 'reservesEntry')).toMatchObject({
      type: 'reservesEntry',
      unitId: 'entry-u1',
      entryMethod: 'edge',
    });
  });

  it('marks the whole unit as having rushed if any reserve-entry move exceeds base movement', () => {
    const unit = createUnit(
      'entry-u1',
      [createModel('e-m0', 0, 0)],
      {
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 9.5, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
  });

  it('removes incoherent reserve entrants as casualties instead of rejecting the whole command', () => {
    const unit = createUnit(
      'entry-u1',
      [
        createModel('e-m0', 0, 0),
        createModel('e-m1', 0, 0),
        createModel('e-m2', 0, 0),
      ],
      {
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'entry-u1', [
      { modelId: 'e-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'e-m1', position: { x: 2, y: 24 } },
      { modelId: 'e-m2', position: { x: 8.5, y: 40 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    expect(result.events).toContainEqual({
      type: 'casualtyRemoved',
      unitId: 'entry-u1',
      modelId: 'e-m2',
    });
    expect(result.state.armies[0].units[0].models[2]?.isDestroyed).toBe(true);
  });

  it('forbids Deep Strike on the first battle turn', () => {
    const unit = createUnit(
      'deep-u1',
      [createModel('deep-m0', 0, 0, {
        profileModelName: 'Praetor',
        unitProfileId: 'praetor',
      })],
      {
        profileId: 'praetor',
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      currentBattleTurn: 1,
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'deep-u1', [
      { modelId: 'deep-m0', position: { x: 30, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0]?.code).toBe('DEEP_STRIKE_TURN_ONE_FORBIDDEN');
  });

  it('applies Deep Strike placement casualties and charge restriction on turn two or later', () => {
    const unit = createUnit(
      'deep-u1',
      [
        createModel('deep-m0', 0, 0, {
          profileModelName: 'Praetor',
          unitProfileId: 'praetor',
        }),
        createModel('deep-m1', 0, 0, {
          profileModelName: 'Praetor',
          unitProfileId: 'praetor',
        }),
      ],
      {
        profileId: 'praetor',
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'deep-u1', [
      { modelId: 'deep-m0', position: { x: 30, y: 24 } },
      { modelId: 'deep-m1', position: { x: 37.5, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    const unitState = result.state.armies[0].units[0];
    expect(unitState.reserveEntryMethodThisTurn).toBe('deepStrike');
    expect(unitState.cannotChargeThisTurn).toBe(true);
    expect(unitState.models[1]?.isDestroyed).toBe(true);
    expect(result.state.armies[0].deepStrikeAttemptsThisTurn).toBe(1);
  });

  it('uses Outflank from the unit profile and prevents charging after entry', () => {
    const unit = createUnit(
      'outflank-u1',
      [
        createModel('outflank-m0', 0, 0, {
          profileModelName: 'Outrider',
          unitProfileId: 'outrider-squadron',
        }),
        createModel('outflank-m1', 0, 0, {
          profileModelName: 'Outrider',
          unitProfileId: 'outrider-squadron',
        }),
      ],
      {
        profileId: 'outrider-squadron',
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'outflank-u1', [
      { modelId: 'outflank-m0', position: { x: 0.5, y: 24 } },
      { modelId: 'outflank-m1', position: { x: 2, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    expect(result.state.armies[0].units[0].reserveEntryMethodThisTurn).toBe('outflank');
    expect(result.state.armies[0].units[0].cannotChargeThisTurn).toBe(true);
  });

  it('keeps aerial reserve flyers stationary after assignment deployment so they can make their assignment move later', () => {
    const unit = createUnit(
      'xiphon-1',
      [createModel('xiphon-m0', 0, 0, {
        profileModelName: 'Xiphon',
        unitProfileId: 'xiphon-interceptor',
        equippedWargear: ['two-centreline-mounted-twin-lascannon'],
      })],
      {
        profileId: 'xiphon-interceptor',
        isInReserves: true,
        isDeployed: false,
        reserveType: 'aerial',
        reserveReadyToEnter: true,
      },
    );
    const state = createGameState({
      armies: [
        createArmy(0, [unit]),
        createArmy(1, [createUnit('enemy-u1', [createModel('enemy-m0', 50, 40)])]),
      ],
    });

    const result = handleReservesEntry(state, 'xiphon-1', [
      { modelId: 'xiphon-m0', position: { x: 0.5, y: 24 } },
    ], new FixedDiceProvider([]), 'strike-mission');

    expect(result.accepted).toBe(true);
    const unitState = result.state.armies[0].units[0];
    expect(unitState.movementState).toBe(UnitMovementState.Stationary);
    expect(unitState.flyerCombatAssignment).toBe('strike-mission');
    expect(unitState.reserveEntryMethodThisTurn).toBe('strike-mission');
  });
});
