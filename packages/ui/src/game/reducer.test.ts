import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Allegiance,
  CoreReaction,
  DeploymentMap,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type {
  GameState,
  PendingReaction,
} from '@hh/types';
import type { CommandResult } from '@hh/engine';
import { createInitialGameUIState, GameUIPhase } from './types';

vi.mock('./command-bridge', async () => {
  const actual = await vi.importActual<typeof import('./command-bridge')>('./command-bridge');
  return {
    ...actual,
    executeCommand: vi.fn(),
    buildReactionCommand: vi.fn((unitId: string, reactionType: CoreReaction) => ({
      type: 'selectReaction',
      unitId,
      reactionType: String(reactionType),
    })),
    buildDeclineReactionCommand: vi.fn(() => ({ type: 'declineReaction' })),
    eventsToLogEntries: vi.fn(() => []),
    extractGhostTrails: vi.fn(() => []),
    extractLatestDiceRoll: vi.fn(() => null),
  };
});

import { gameReducer } from './reducer';
import * as commandBridge from './command-bridge';

function createBaseGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      {
        id: 'army-0',
        playerIndex: 0,
        playerName: 'Player 1',
        faction: LegionFaction.SonsOfHorus,
        allegiance: Allegiance.Traitor,
        units: [
          {
            id: 'attacker-u1',
            profileId: 'attacker-profile',
            models: [
              {
                id: 'attacker-u1-m1',
                profileModelName: 'Marine',
                unitProfileId: 'attacker-profile',
                position: { x: 10, y: 10 },
                currentWounds: 1,
                isDestroyed: false,
                modifiers: [],
                equippedWargear: [],
                isWarlord: false,
              },
            ],
            statuses: [],
            hasReactedThisTurn: false,
            movementState: UnitMovementState.Stationary,
            isLockedInCombat: false,
            embarkedOnId: null,
            isInReserves: false,
            isDeployed: true,
            engagedWithUnitIds: [],
            modifiers: [],
          },
        ],
        totalPoints: 1000,
        pointsLimit: 1000,
        reactionAllotmentRemaining: 1,
        baseReactionAllotment: 1,
        victoryPoints: 0,
      },
      {
        id: 'army-1',
        playerIndex: 1,
        playerName: 'Player 2',
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Loyalist,
        units: [
          {
            id: 'target-u1',
            profileId: 'target-profile',
            models: [
              {
                id: 'target-u1-m1',
                profileModelName: 'Marine',
                unitProfileId: 'target-profile',
                position: { x: 20, y: 20 },
                currentWounds: 1,
                isDestroyed: false,
                modifiers: [],
                equippedWargear: [],
                isWarlord: false,
              },
            ],
            statuses: [],
            hasReactedThisTurn: false,
            movementState: UnitMovementState.Stationary,
            isLockedInCombat: false,
            embarkedOnId: null,
            isInReserves: false,
            isDeployed: true,
            engagedWithUnitIds: [],
            modifiers: [],
          },
        ],
        totalPoints: 1000,
        pointsLimit: 1000,
        reactionAllotmentRemaining: 1,
        baseReactionAllotment: 1,
        victoryPoints: 0,
      },
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Shooting,
    currentSubPhase: SubPhase.Attack,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
    missionState: null,
    ...overrides,
  };
}

function createPendingReaction(reactionType: string): PendingReaction {
  return {
    reactionType,
    isAdvancedReaction: reactionType.startsWith('advanced-'),
    eligibleUnitIds: ['target-u1'],
    triggerDescription: 'Reaction available',
    triggerSourceUnitId: 'attacker-u1',
  };
}

function createReactionUiState(pendingReaction: PendingReaction) {
  const uiState = createInitialGameUIState();
  const gameState = createBaseGameState({
    awaitingReaction: true,
    pendingReaction,
  });

  return {
    ...uiState,
    uiPhase: GameUIPhase.Playing,
    gameState,
    flowState: {
      type: 'reaction' as const,
      step: {
        step: 'prompt' as const,
        pendingReaction,
      },
    },
  };
}

function createChargeUiState() {
  const uiState = createInitialGameUIState();
  const gameState = createBaseGameState({
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Charge,
  });

  return {
    ...uiState,
    uiPhase: GameUIPhase.Playing,
    gameState,
    flowState: {
      type: 'assault' as const,
      step: {
        step: 'confirmCharge' as const,
        chargingUnitId: 'attacker-u1',
        targetUnitId: 'target-u1',
      },
    },
  };
}

describe('gameReducer reaction flow persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps reaction prompt open when DECLINE_REACTION resolves into another pending reaction', () => {
    const initialPending = createPendingReaction('advanced-shooting-reaction');
    const chainedPending = createPendingReaction(CoreReaction.ReturnFire);
    const state = createReactionUiState(initialPending);

    const nextGameState = createBaseGameState({
      awaitingReaction: true,
      pendingReaction: chainedPending,
    });

    const result: CommandResult = {
      state: nextGameState,
      events: [],
      errors: [],
      accepted: true,
    };

    vi.mocked(commandBridge.executeCommand).mockReturnValue(result);

    const nextState = gameReducer(state, { type: 'DECLINE_REACTION' });

    expect(nextState.flowState.type).toBe('reaction');
    expect(nextState.flowState.type === 'reaction' && nextState.flowState.step.step === 'prompt').toBe(true);
    if (nextState.flowState.type === 'reaction' && nextState.flowState.step.step === 'prompt') {
      expect(nextState.flowState.step.pendingReaction).toEqual(chainedPending);
    }
  });

  it('keeps reaction prompt open when SELECT_REACTION_UNIT resolves into another pending reaction', () => {
    const initialPending = createPendingReaction('advanced-shooting-reaction');
    const chainedPending = createPendingReaction(CoreReaction.ReturnFire);
    const state = createReactionUiState(initialPending);

    const nextGameState = createBaseGameState({
      awaitingReaction: true,
      pendingReaction: chainedPending,
    });

    const result: CommandResult = {
      state: nextGameState,
      events: [],
      errors: [],
      accepted: true,
    };

    vi.mocked(commandBridge.executeCommand).mockReturnValue(result);

    const nextState = gameReducer(state, {
      type: 'SELECT_REACTION_UNIT',
      unitId: 'target-u1',
      reactionType: CoreReaction.ReturnFire,
    });

    expect(nextState.flowState.type).toBe('reaction');
    expect(nextState.flowState.type === 'reaction' && nextState.flowState.step.step === 'prompt').toBe(true);
    if (nextState.flowState.type === 'reaction' && nextState.flowState.step.step === 'prompt') {
      expect(nextState.flowState.step.pendingReaction).toEqual(chainedPending);
    }
  });
});

describe('gameReducer shooting special-shot flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves blast weapons into the placement step before resolving the attack', () => {
    const uiState = createInitialGameUIState();
    const gameState = createBaseGameState({
      armies: [
        {
          ...createBaseGameState().armies[0],
          units: [
            {
              ...createBaseGameState().armies[0].units[0],
              models: [
                {
                  ...createBaseGameState().armies[0].units[0].models[0],
                  equippedWargear: ['plasma-cannon'],
                },
              ],
            },
          ],
        },
        createBaseGameState().armies[1],
      ],
    });

    const state = {
      ...uiState,
      uiPhase: GameUIPhase.Playing,
      gameState,
      flowState: {
        type: 'shooting' as const,
        step: {
          step: 'selectWeapons' as const,
          attackerUnitId: 'attacker-u1',
          targetUnitId: 'target-u1',
          weaponSelections: [{
            modelId: 'attacker-u1-m1',
            weaponId: 'plasma-cannon',
            weaponName: 'Plasma cannon',
          }],
        },
      },
    };

    const nextState = gameReducer(state, { type: 'CONFIRM_SHOOTING' });

    expect(nextState.flowState.type).toBe('shooting');
    expect(nextState.flowState.type === 'shooting' && nextState.flowState.step.step === 'placeSpecial').toBe(true);
    if (nextState.flowState.type === 'shooting' && nextState.flowState.step.step === 'placeSpecial') {
      expect(nextState.flowState.step.requirements).toHaveLength(1);
      expect(nextState.flowState.step.requirements[0].kind).toBe('blast');
    }
  });

  it('submits the prepared blast placement on the last placement click', () => {
    const uiState = createInitialGameUIState();
    const resultGameState = createBaseGameState({
      shootingAttackState: {
        attackerUnitId: 'attacker-u1',
        targetUnitId: 'target-u1',
        attackerPlayerIndex: 0,
        targetFacing: null,
        weaponAssignments: [{ modelId: 'attacker-u1-m1', weaponId: 'plasma-cannon' }],
        fireGroups: [],
        currentFireGroupIndex: 0,
        currentStep: 'COMPLETE',
        accumulatedGlancingHits: [],
        accumulatedCasualties: [],
        unitSizesAtStart: { 'attacker-u1': 1, 'target-u1': 1 },
        pendingMoraleChecks: [],
        returnFireResolved: true,
        isReturnFire: false,
        modelsWithLOS: ['attacker-u1-m1'],
      },
    });

    vi.mocked(commandBridge.executeCommand).mockReturnValue({
      state: resultGameState,
      events: [],
      errors: [],
      accepted: true,
    });

    const state = {
      ...uiState,
      uiPhase: GameUIPhase.Playing,
      gameState: createBaseGameState(),
      flowState: {
        type: 'shooting' as const,
        step: {
          step: 'placeSpecial' as const,
          attackerUnitId: 'attacker-u1',
          targetUnitId: 'target-u1',
          weaponSelections: [{
            modelId: 'attacker-u1-m1',
            weaponId: 'plasma-cannon',
            weaponName: 'Plasma cannon',
          }],
          requirements: [{
            kind: 'blast' as const,
            label: 'Plasma cannon: place 3" blast marker',
            weaponName: 'Plasma cannon',
            sizeInches: 3,
            sourceModelIds: ['attacker-u1-m1'],
          }],
          currentIndex: 0,
          blastPlacements: [],
          templatePlacements: [],
        },
      },
    };

    const nextState = gameReducer(state, {
      type: 'PLACE_SPECIAL_SHOT',
      position: { x: 20, y: 20 },
    });

    expect(vi.mocked(commandBridge.executeCommand)).toHaveBeenCalledTimes(1);
    const submittedCommand = vi.mocked(commandBridge.executeCommand).mock.calls[0]?.[1];
    expect(submittedCommand).toMatchObject({
      type: 'declareShooting',
      blastPlacements: [{ sourceModelIds: ['attacker-u1-m1'], position: { x: 20, y: 20 } }],
    });
    expect(nextState.flowState.type).toBe('shooting');
    expect(nextState.flowState.type === 'shooting' && nextState.flowState.step.step === 'showResults').toBe(true);
  });
});

describe('gameReducer charge flow resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the reaction prompt when confirming a charge opens a reaction window', () => {
    const pendingReaction = createPendingReaction(CoreReaction.Overwatch);
    const state = createChargeUiState();

    const result: CommandResult = {
      state: createBaseGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction,
      }),
      events: [],
      errors: [],
      accepted: true,
    };

    vi.mocked(commandBridge.executeCommand).mockReturnValue(result);

    const nextState = gameReducer(state, { type: 'CONFIRM_CHARGE' });

    expect(nextState.flowState.type).toBe('reaction');
    expect(nextState.flowState.type === 'reaction' && nextState.flowState.step.step === 'prompt').toBe(true);
  });

  it('closes the assault flow when the charge resolves immediately', () => {
    const state = createChargeUiState();

    const result: CommandResult = {
      state: createBaseGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
      }),
      events: [],
      errors: [],
      accepted: true,
    };

    vi.mocked(commandBridge.executeCommand).mockReturnValue(result);

    const nextState = gameReducer(state, { type: 'CONFIRM_CHARGE' });

    expect(nextState.flowState).toEqual({ type: 'idle' });
  });

  it('leaves the confirm charge step in place when the engine rejects the charge', () => {
    const state = createChargeUiState();

    const result: CommandResult = {
      state: state.gameState!,
      events: [],
      errors: [{ code: 'CHARGE_INVALID', message: 'Charge is not valid.' }],
      accepted: false,
    };

    vi.mocked(commandBridge.executeCommand).mockReturnValue(result);

    const nextState = gameReducer(state, { type: 'CONFIRM_CHARGE' });

    expect(nextState.flowState).toEqual(state.flowState);
    expect(nextState.lastErrors).toEqual(result.errors);
  });
});

describe('gameReducer deployment order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls deployment order when setup enters deployment', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.0);

    const nextState = gameReducer(createInitialGameUIState(), { type: 'CONFIRM_ALL_OBJECTIVES' });

    expect(nextState.uiPhase).toBe(GameUIPhase.Deployment);
    expect(nextState.deployment.deployingPlayerIndex).toBe(1);

    randomSpy.mockRestore();
  });

  it('syncs the initial game state turn order to the deployment roll-off result', () => {
    const state = {
      ...createInitialGameUIState(),
      uiPhase: GameUIPhase.Deployment,
      deployment: {
        ...createInitialGameUIState().deployment,
        deployingPlayerIndex: 1,
      },
    };

    const nextState = gameReducer(state, {
      type: 'INIT_GAME_STATE',
      gameState: createBaseGameState({
        currentPhase: Phase.Start,
        currentSubPhase: SubPhase.StartEffects,
        activePlayerIndex: 0,
        firstPlayerIndex: 0,
      }),
    });

    expect(nextState.gameState?.firstPlayerIndex).toBe(1);
    expect(nextState.gameState?.activePlayerIndex).toBe(1);
  });

  it('hands deployment to the other player and starts battle after both confirm when player 2 deploys first', () => {
    const state = {
      ...createInitialGameUIState(),
      uiPhase: GameUIPhase.Deployment,
      gameState: createBaseGameState({
        currentPhase: Phase.Start,
        currentSubPhase: SubPhase.StartEffects,
      }),
      deployment: {
        ...createInitialGameUIState().deployment,
        deployingPlayerIndex: 1,
      },
    };

    const afterFirstConfirmation = gameReducer(state, { type: 'CONFIRM_DEPLOYMENT' });

    expect(afterFirstConfirmation.uiPhase).toBe(GameUIPhase.Deployment);
    expect(afterFirstConfirmation.deployment.player2Confirmed).toBe(true);
    expect(afterFirstConfirmation.deployment.player1Confirmed).toBe(false);
    expect(afterFirstConfirmation.deployment.deployingPlayerIndex).toBe(0);

    const afterSecondConfirmation = gameReducer(afterFirstConfirmation, { type: 'CONFIRM_DEPLOYMENT' });

    expect(afterSecondConfirmation.uiPhase).toBe(GameUIPhase.Playing);
    expect(afterSecondConfirmation.deployment.player1Confirmed).toBe(true);
    expect(afterSecondConfirmation.deployment.player2Confirmed).toBe(true);
  });
});

describe('gameReducer objective placement rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts Heart of Battle with only the centre objective fixed and a placement roll-off', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.0);

    const state = {
      ...createInitialGameUIState(),
      missionSelect: {
        selectedMissionId: 'heart-of-battle',
        selectedDeploymentMap: DeploymentMap.SearchAndDestroy,
        confirmed: true,
      },
    };

    const nextState = gameReducer(state, { type: 'CONFIRM_TERRAIN' });

    expect(nextState.uiPhase).toBe(GameUIPhase.ObjectivePlacement);
    expect(nextState.objectivePlacement.firstPlacingPlayerIndex).toBe(0);
    expect(nextState.objectivePlacement.placingPlayerIndex).toBe(0);
    expect(nextState.objectivePlacement.placedObjectives).toHaveLength(1);
    expect(nextState.objectivePlacement.placedObjectives[0].vpValue).toBe(3);
    expect(nextState.objectivePlacement.placedObjectives[0].position).toEqual({ x: 36, y: 24 });
    expect(nextState.objectivePlacement.totalToPlace).toBe(3);

    randomSpy.mockRestore();
  });

  it('rejects Heart of Battle flank placements that are too close to the centre objective', () => {
    const state = {
      ...createInitialGameUIState(),
      missionSelect: {
        selectedMissionId: 'heart-of-battle',
        selectedDeploymentMap: DeploymentMap.SearchAndDestroy,
        confirmed: true,
      },
      uiPhase: GameUIPhase.ObjectivePlacement,
      objectivePlacement: {
        ...createInitialGameUIState().objectivePlacement,
        firstPlacingPlayerIndex: 0 as const,
        placingPlayerIndex: 0,
        placedObjectives: [
          {
            id: 'obj-fixed-0',
            position: { x: 36, y: 24 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
            label: 'Primary Alpha (Centre)',
          },
        ],
        totalToPlace: 3,
        pendingPosition: { x: 30, y: 24 },
      },
    };

    const nextState = gameReducer(state, { type: 'CONFIRM_OBJECTIVE_PLACEMENT' });

    expect(nextState.objectivePlacement.placedObjectives).toHaveLength(1);
    expect(nextState.notifications.at(-1)?.message).toContain('central objective');
  });

  it('does not undo the fixed Heart of Battle centre objective', () => {
    const state = {
      ...createInitialGameUIState(),
      missionSelect: {
        selectedMissionId: 'heart-of-battle',
        selectedDeploymentMap: DeploymentMap.SearchAndDestroy,
        confirmed: true,
      },
      uiPhase: GameUIPhase.ObjectivePlacement,
      objectivePlacement: {
        ...createInitialGameUIState().objectivePlacement,
        firstPlacingPlayerIndex: 0 as const,
        placingPlayerIndex: 1,
        placedObjectives: [
          {
            id: 'obj-fixed-0',
            position: { x: 36, y: 24 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
            label: 'Primary Alpha (Centre)',
          },
        ],
        totalToPlace: 3,
        pendingPosition: null,
      },
    };

    const nextState = gameReducer(state, { type: 'UNDO_OBJECTIVE_PLACEMENT' });

    expect(nextState.objectivePlacement.placedObjectives).toHaveLength(1);
  });

  it('uses 3VP markers for Take and Hold objective placement', () => {
    const state = {
      ...createInitialGameUIState(),
      missionSelect: {
        selectedMissionId: 'take-and-hold',
        selectedDeploymentMap: DeploymentMap.DawnOfWar,
        confirmed: true,
      },
      uiPhase: GameUIPhase.ObjectivePlacement,
      objectivePlacement: {
        ...createInitialGameUIState().objectivePlacement,
        firstPlacingPlayerIndex: 0 as const,
        placingPlayerIndex: 0,
        placedObjectives: [],
        totalToPlace: 2,
        pendingPosition: { x: 12, y: 24 },
      },
    };

    const nextState = gameReducer(state, { type: 'CONFIRM_OBJECTIVE_PLACEMENT' });

    expect(nextState.objectivePlacement.placedObjectives).toHaveLength(1);
    expect(nextState.objectivePlacement.placedObjectives[0].vpValue).toBe(3);
    expect(nextState.objectivePlacement.placedObjectives[0].currentVpValue).toBe(3);
  });
});
