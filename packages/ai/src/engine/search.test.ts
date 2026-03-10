import { afterEach, describe, expect, it, vi } from 'vitest';
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
  ShootingAttackState,
  UnitState,
} from '@hh/types';
import {
  AIStrategyTier,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  searchBestAction,
  type AIPlayerConfig,
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
    gameId: 'search-test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0 }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: LegionFaction.SonsOfHorus,
        allegiance: Allegiance.Traitor,
        units: [createUnit({
          id: 'p1-unit-1',
          models: [createModel({ id: 'p1-m1', position: { x: 50, y: 40 } })],
        })],
      }),
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
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

function createEngineConfig(overrides: Partial<AIPlayerConfig> = {}): AIPlayerConfig {
  return {
    playerIndex: 0,
    strategyTier: AIStrategyTier.Engine,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    timeBudgetMs: 50,
    nnueModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    baseSeed: 2026,
    rolloutCount: 1,
    maxDepthSoft: 2,
    diagnosticsEnabled: true,
    enabled: true,
    ...overrides,
  };
}

function createAwaitingTargetSelectionAttack(): ShootingAttackState {
  return {
    attackerUnitId: 'p0-unit-1',
    targetUnitId: 'p1-unit-1',
    attackerPlayerIndex: 0,
    targetFacing: null,
    weaponAssignments: [],
    fireGroups: [],
    currentFireGroupIndex: 0,
    currentStep: 'AWAITING_TARGET_SELECTION',
    accumulatedGlancingHits: [],
    accumulatedCasualties: [],
    unitSizesAtStart: {},
    pendingMoraleChecks: [],
    returnFireResolved: true,
    isReturnFire: false,
    modelsWithLOS: ['p0-m1'],
  };
}

describe('searchBestAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the same root action and score for the same state/config/seed', () => {
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [createModel({ id: 'p0-m1', position: { x: 10, y: 10 } })],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [createUnit({
            id: 'p1-unit-1',
            models: [createModel({ id: 'p1-m1', position: { x: 48, y: 36 } })],
          })],
        }),
      ],
    });
    const config = createEngineConfig();

    const resultA = searchBestAction(state, config, new Set());
    const resultB = searchBestAction(state, config, new Set());

    expect(resultA.bestAction?.id).toBe(resultB.bestAction?.id);
    expect(resultA.score).toBe(resultB.score);
    expect(resultA.principalVariation).toEqual(resultB.principalVariation);
    expect(resultA.diagnostics.modelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(resultA.diagnostics.nodesVisited).toBeGreaterThan(0);
  });

  it('queues follow-up commands for multi-step shooting target selection', () => {
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [createModel({ id: 'p0-m1', position: { x: 12, y: 12 } })],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [createUnit({
            id: 'p1-unit-1',
            models: [createModel({ id: 'p1-m1', position: { x: 18, y: 18 }, isWarlord: true })],
          })],
        }),
      ],
      shootingAttackState: createAwaitingTargetSelectionAttack(),
    });

    const result = searchBestAction(state, createEngineConfig(), new Set());

    expect(result.bestAction?.commands[0]?.type).toBe('selectTargetModel');
    expect(result.queuedPlan).toHaveLength(1);
    expect(result.queuedPlan[0]?.command.type).toBe('resolveShootingCasualties');
  });

  it('does not generate movement actions for units locked in combat', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            isLockedInCombat: true,
            engagedWithUnitIds: ['p1-unit-1'],
            models: [createModel({ id: 'p0-m1', position: { x: 12, y: 12 } })],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [createUnit({
            id: 'p1-unit-1',
            isLockedInCombat: true,
            engagedWithUnitIds: ['p0-unit-1'],
            models: [createModel({ id: 'p1-m1', position: { x: 14, y: 12 } })],
          })],
        }),
      ],
    });

    const result = searchBestAction(state, createEngineConfig(), new Set());

    expect(result.bestAction).not.toBeNull();
    expect(result.bestAction?.commands[0]?.type).not.toBe('moveUnit');
    expect(result.bestAction?.commands[0]?.type).toBe('endSubPhase');
  });

  it('returns a scored emergency root baseline when the budget expires before full deepening completes', () => {
    const state = createGameState();
    const config = createEngineConfig({
      timeBudgetMs: 5,
      maxDepthSoft: 3,
    });
    const nowSequence = [0, 0, 0, 0, 0.25, 2, 2, 2, 2, 2, 2, 2];
    let nowIndex = 0;

    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      const value = nowSequence[Math.min(nowIndex, nowSequence.length - 1)];
      nowIndex += 1;
      return value;
    });

    const result = searchBestAction(state, config, new Set());

    expect(result.bestAction).not.toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.depthCompleted).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.selectedMacroActionId).toBeTruthy();
  });
});
