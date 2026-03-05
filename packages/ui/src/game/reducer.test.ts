import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Allegiance,
  CoreReaction,
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
