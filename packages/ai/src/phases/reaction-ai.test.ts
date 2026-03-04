/**
 * Reaction AI Tests
 *
 * Tests for AI reaction decision-making.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase } from '@hh/types';
import type { GameState, ArmyState } from '@hh/types';
import { generateReactionCommand } from './reaction-ai';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: 'Dark Angels' as ArmyState['faction'],
    allegiance: 'Loyalist' as ArmyState['allegiance'],
    units: [],
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
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0, units: [] }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [],
        reactionAllotmentRemaining: 2,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateReactionCommand', () => {
  it('returns null when not awaiting reaction', () => {
    const state = createGameState({ awaitingReaction: false });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).toBeNull();
  });

  it('returns null when no pending reaction', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: undefined as any,
    });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).toBeNull();
  });

  it('returns declineReaction when no eligible units', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: [],
      } as any,
    });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('returns declineReaction when AI is not the reactive player', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    // Player 0 is active, player 1 is reactive, but we pass playerIndex=0
    const result = generateReactionCommand(state, 0, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('returns declineReaction when no reaction allotment remaining', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 0;

    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('basic strategy accepts a valid pending reaction', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 2;

    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy accepts ReturnFire with sufficient allotment', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy still accepts when allotment is low but legal', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 1;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy accepts Overwatch reactions', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Overwatch',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('Overwatch');
  });

  it('tactical strategy accepts Reposition reactions', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Reposition',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('Reposition');
  });
});
