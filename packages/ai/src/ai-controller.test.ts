/**
 * AI Controller Tests
 *
 * Tests for shouldAIAct, createTurnContext, createStrategy, and generateNextCommand.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import {
  shouldAIAct,
  createTurnContext,
  createStrategy,
  generateNextCommand,
} from './ai-controller';
import { AIStrategyTier } from './types';
import type { AIPlayerConfig } from './types';
import { BasicStrategy } from './strategy/basic-strategy';
import { TacticalStrategy } from './strategy/tactical-strategy';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['boltgun'],
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
    faction: 'Dark Angels' as ArmyState['faction'],
    allegiance: 'Loyalist' as ArmyState['allegiance'],
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
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0 }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [createUnit({ id: 'p1-unit-1', models: [createModel({ id: 'p1-m1', position: { x: 50, y: 40 } })] })],
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

function createConfig(overrides: Partial<AIPlayerConfig> = {}): AIPlayerConfig {
  return {
    playerIndex: 0,
    strategyTier: AIStrategyTier.Basic,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    enabled: true,
    ...overrides,
  };
}

// ─── shouldAIAct Tests ──────────────────────────────────────────────────────

describe('shouldAIAct', () => {
  it('returns true when active player matches AI player index', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    const config = createConfig({ playerIndex: 0 });
    expect(shouldAIAct(state, config)).toBe(true);
  });

  it('returns true when awaiting reaction for AI player (reactive)', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
    });
    // AI controls player 1 (the reactive player when active is 0)
    const config = createConfig({ playerIndex: 1 });
    expect(shouldAIAct(state, config)).toBe(true);
  });

  it('returns false when game is over', () => {
    const state = createGameState({ isGameOver: true, activePlayerIndex: 0 });
    const config = createConfig({ playerIndex: 0 });
    expect(shouldAIAct(state, config)).toBe(false);
  });

  it('returns false when disabled', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    const config = createConfig({ playerIndex: 0, enabled: false });
    expect(shouldAIAct(state, config)).toBe(false);
  });

  it('returns false when it is the other player turn', () => {
    const state = createGameState({ activePlayerIndex: 1 });
    const config = createConfig({ playerIndex: 0 });
    expect(shouldAIAct(state, config)).toBe(false);
  });

  it('returns false when disabled even if active player matches', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    const config = createConfig({ playerIndex: 0, enabled: false });
    expect(shouldAIAct(state, config)).toBe(false);
  });

  it('returns false when awaiting reaction and AI is the active player, not reactive', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
    });
    // AI is player 0 (the active player, not the reactive one)
    const config = createConfig({ playerIndex: 0 });
    expect(shouldAIAct(state, config)).toBe(false);
  });
});

// ─── createTurnContext Tests ────────────────────────────────────────────────

describe('createTurnContext', () => {
  it('creates context with empty actedUnitIds set', () => {
    const ctx = createTurnContext();
    expect(ctx.actedUnitIds).toBeInstanceOf(Set);
    expect(ctx.actedUnitIds.size).toBe(0);
  });

  it('creates context with empty movedModelIds set', () => {
    const ctx = createTurnContext();
    expect(ctx.movedModelIds).toBeInstanceOf(Set);
    expect(ctx.movedModelIds.size).toBe(0);
  });

  it('creates context with null currentMovingUnitId', () => {
    const ctx = createTurnContext();
    expect(ctx.currentMovingUnitId).toBeNull();
  });

  it('creates context with null lastPhase and lastSubPhase', () => {
    const ctx = createTurnContext();
    expect(ctx.lastPhase).toBeNull();
    expect(ctx.lastSubPhase).toBeNull();
  });
});

// ─── createStrategy Tests ───────────────────────────────────────────────────

describe('createStrategy', () => {
  it('returns BasicStrategy for Basic tier', () => {
    const strategy = createStrategy(AIStrategyTier.Basic);
    expect(strategy).toBeInstanceOf(BasicStrategy);
  });

  it('returns TacticalStrategy for Tactical tier', () => {
    const strategy = createStrategy(AIStrategyTier.Tactical);
    expect(strategy).toBeInstanceOf(TacticalStrategy);
  });
});

// ─── generateNextCommand Tests ──────────────────────────────────────────────

describe('generateNextCommand', () => {
  it('returns null when AI should not act (game over)', () => {
    const state = createGameState({ isGameOver: true });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();
    const result = generateNextCommand(state, config, ctx);
    expect(result).toBeNull();
  });

  it('returns null when AI should not act (disabled)', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    const config = createConfig({ playerIndex: 0, enabled: false });
    const ctx = createTurnContext();
    const result = generateNextCommand(state, config, ctx);
    expect(result).toBeNull();
  });

  it('returns null when it is not the AI player turn', () => {
    const state = createGameState({ activePlayerIndex: 1 });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();
    const result = generateNextCommand(state, config, ctx);
    expect(result).toBeNull();
  });

  it('delegates to strategy when AI should act', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();
    const result = generateNextCommand(state, config, ctx);
    // Should return a command (either a move command or endSubPhase)
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('type');
  });

  it('resets context when phase changes', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();

    // First call sets lastPhase/lastSubPhase
    ctx.lastPhase = Phase.Start;
    ctx.lastSubPhase = SubPhase.StartEffects;
    ctx.actedUnitIds.add('some-unit');
    ctx.movedModelIds.add('some-model');

    generateNextCommand(state, config, ctx);

    // Context should have been reset because phase changed
    expect(ctx.lastPhase).toBe(Phase.Movement);
    expect(ctx.lastSubPhase).toBe(SubPhase.Move);
    expect(ctx.actedUnitIds.has('some-unit')).toBe(false);
    expect(ctx.movedModelIds.has('some-model')).toBe(false);
  });

  it('resets context when sub-phase changes', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();

    // Set context to same phase but different sub-phase
    ctx.lastPhase = Phase.Movement;
    ctx.lastSubPhase = SubPhase.Reserves;
    ctx.actedUnitIds.add('old-unit');

    generateNextCommand(state, config, ctx);

    // Context should have been reset because sub-phase changed
    expect(ctx.lastSubPhase).toBe(SubPhase.Move);
    expect(ctx.actedUnitIds.has('old-unit')).toBe(false);
  });

  it('does not reset context when phase and sub-phase remain the same', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const config = createConfig({ playerIndex: 0 });
    const ctx = createTurnContext();

    // Set context to same phase and sub-phase
    ctx.lastPhase = Phase.Movement;
    ctx.lastSubPhase = SubPhase.Move;
    ctx.actedUnitIds.add('existing-unit');

    generateNextCommand(state, config, ctx);

    // actedUnitIds should not be cleared
    expect(ctx.actedUnitIds.has('existing-unit')).toBe(true);
  });
});
