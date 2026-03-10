import { describe, expect, it } from 'vitest';
import {
  Allegiance,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type { ArmyState, GameState, ModelState, UnitState } from '@hh/types';
import {
  estimateUnitExposureBreakdown,
  estimateUnitStrategicValue,
  summarizePlayerTacticalState,
} from './tactical-signals';

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['bolter', 'close-combat-weapon'],
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
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units: [createUnit({ id: 'p0-unit-1' })],
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
    gameId: 'tactical-signals-test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({
        playerIndex: 0,
        units: [
          createUnit({
            id: 'p0-warlord',
            models: [
              createModel({
                id: 'p0-w1',
                isWarlord: true,
                position: { x: 18, y: 18 },
              }),
            ],
          }),
          createUnit({
            id: 'p0-line',
            models: [
              createModel({
                id: 'p0-l1',
                position: { x: 30, y: 12 },
              }),
              createModel({
                id: 'p0-l2',
                position: { x: 31.5, y: 12 },
              }),
            ],
          }),
        ],
      }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: LegionFaction.WorldEaters,
        allegiance: Allegiance.Traitor,
        units: [
          createUnit({
            id: 'p1-threat',
            profileId: 'assault-squad',
            models: [
              createModel({
                id: 'p1-a1',
                unitProfileId: 'assault-squad',
                profileModelName: 'Legionary',
                position: { x: 24, y: 18 },
                equippedWargear: ['bolt-pistol', 'chainsword'],
              }),
              createModel({
                id: 'p1-a2',
                unitProfileId: 'assault-squad',
                profileModelName: 'Legionary',
                position: { x: 25.5, y: 18 },
                equippedWargear: ['bolt-pistol', 'chainsword'],
              }),
            ],
          }),
        ],
      }),
    ],
    currentBattleTurn: 2,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: {
      primaryObjective: null,
      currentRoundScoredByPlayer: [0, 0],
      objectives: [
        {
          id: 'obj-1',
          name: 'Hold',
          position: { x: 18, y: 18 },
          controlledByPlayerIndex: 0,
          isRemoved: false,
          grantsVictoryPoints: 1,
        },
      ],
    },
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

describe('tactical signals', () => {
  it('assigns more strategic value to a warlord holding an objective than to a line unit', () => {
    const state = createGameState();
    const warlord = state.armies[0].units[0];
    const lineUnit = state.armies[0].units[1];

    expect(estimateUnitStrategicValue(state, 0, warlord)).toBeGreaterThan(
      estimateUnitStrategicValue(state, 0, lineUnit),
    );
  });

  it('detects meaningful exposure from a nearby threatening enemy unit', () => {
    const state = createGameState();
    const warlord = state.armies[0].units[0];
    const exposure = estimateUnitExposureBreakdown(state, 0, warlord);

    expect(exposure.total).toBeGreaterThan(0);
    expect(exposure.ranged + exposure.melee).toBeGreaterThan(0);
  });

  it('summarizes objective-hold and retaliation pressure for the current player', () => {
    const state = createGameState();
    const summary = summarizePlayerTacticalState(state, 0);

    expect(summary.objectiveHolderValue).toBeGreaterThan(0);
    expect(summary.objectiveHoldDurability).toBeGreaterThan(0);
    expect(summary.retaliationPressure).toBeGreaterThan(0);
  });
});
