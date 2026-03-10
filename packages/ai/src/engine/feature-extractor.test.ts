import { describe, expect, it } from 'vitest';
import {
  Allegiance,
  LegionFaction,
  Phase,
  SubPhase,
  TacticalStatus,
  UnitMovementState,
} from '@hh/types';
import type {
  ArmyState,
  GameState,
  ModelState,
  UnitState,
} from '@hh/types';
import {
  GAMEPLAY_FEATURE_DIMENSION,
  GAMEPLAY_FEATURE_VERSION,
  extractGameplayFeatures,
} from '../index';

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

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units: [createUnit({ id: 'p0-unit-1', models: [createModel({ id: 'p0-m1', isWarlord: true })] })],
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
    gameId: 'feature-extractor-test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0 }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: LegionFaction.WorldEaters,
        allegiance: Allegiance.Traitor,
        units: [
          createUnit({
            id: 'p1-unit-1',
            models: [createModel({ id: 'p1-m1', position: { x: 48, y: 36 } })],
            statuses: [TacticalStatus.Pinned],
            isLockedInCombat: true,
          }),
        ],
        reactionAllotmentRemaining: 1,
        victoryPoints: 2,
      }),
    ],
    currentBattleTurn: 2,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 6,
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
          name: 'Center',
          position: { x: 36, y: 24 },
          controlledByPlayerIndex: null,
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

describe('extractGameplayFeatures', () => {
  it('returns the 39-feature gameplay schema with bounded values', () => {
    const features = extractGameplayFeatures(createGameState(), 0);

    expect(GAMEPLAY_FEATURE_VERSION).toBe(3);
    expect(features).toHaveLength(GAMEPLAY_FEATURE_DIMENSION);
    expect(GAMEPLAY_FEATURE_DIMENSION).toBe(39);
    expect(Array.from(features).every((feature) => feature >= -1 && feature <= 1)).toBe(true);
  });

  it('tracks decision ownership and battle progress in the final features', () => {
    const activeFeatures = extractGameplayFeatures(createGameState(), 0);
    const reactiveFeatures = extractGameplayFeatures(createGameState({
      awaitingReaction: true,
      activePlayerIndex: 0,
      currentBattleTurn: 4,
      maxBattleTurns: 8,
    }), 0);

    expect(activeFeatures[37]).toBe(1);
    expect(activeFeatures[38]).toBeCloseTo((-1 / 3), 5);
    expect(reactiveFeatures[37]).toBe(-1);
    expect(reactiveFeatures[38]).toBe(0, 5);
  });
});
