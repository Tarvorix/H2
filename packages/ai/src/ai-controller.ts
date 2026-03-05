/**
 * AI Controller
 *
 * Main entry point for the AI opponent system. Determines when the AI
 * should act and delegates command generation to the appropriate strategy.
 *
 * The controller is stateless per call — it uses an AITurnContext to track
 * which units have already been issued commands within a sub-phase.
 * The context is automatically reset when the phase or sub-phase changes.
 */

import type { GameState, GameCommand } from '@hh/types';
import { Phase, SubPhase } from '@hh/types';
import type { AIPlayerConfig, AIStrategy, AITurnContext, DeploymentCommand } from './types';
import { AIStrategyTier } from './types';
import { BasicStrategy } from './strategy/basic-strategy';
import { TacticalStrategy } from './strategy/tactical-strategy';

// ─── Strategy Factory ────────────────────────────────────────────────────────

/**
 * Create the appropriate strategy instance for the given tier.
 */
export function createStrategy(tier: AIStrategyTier): AIStrategy {
  switch (tier) {
    case AIStrategyTier.Basic:
      return new BasicStrategy();
    case AIStrategyTier.Tactical:
      return new TacticalStrategy();
  }
}

// ─── Turn Context Factory ────────────────────────────────────────────────────

/**
 * Create a fresh AITurnContext. Call once when the AI game session starts,
 * then pass the same context to every generateNextCommand call.
 * The context is automatically reset when the phase/sub-phase changes.
 */
export function createTurnContext(): AITurnContext {
  return {
    actedUnitIds: new Set(),
    movedModelIds: new Set(),
    currentMovingUnitId: null,
    lastPhase: null,
    lastSubPhase: null,
  };
}

/**
 * Reset the context if the phase or sub-phase has changed since last call.
 * This ensures the AI doesn't carry stale "acted" data across sub-phases.
 */
function maybeResetContext(
  context: AITurnContext,
  currentPhase: Phase,
  currentSubPhase: SubPhase,
): void {
  if (context.lastPhase !== currentPhase || context.lastSubPhase !== currentSubPhase) {
    context.actedUnitIds.clear();
    context.movedModelIds.clear();
    context.currentMovingUnitId = null;
    context.lastPhase = currentPhase;
    context.lastSubPhase = currentSubPhase;
  }
}

// ─── Should AI Act ───────────────────────────────────────────────────────────

/**
 * Determine if the AI should act right now.
 *
 * The AI acts when:
 * 1. It's enabled and the game isn't over
 * 2. The active player matches the AI's playerIndex (it's the AI's turn), OR
 * 3. awaitingReaction is true and the reactive player is the AI
 */
export function shouldAIAct(state: GameState, config: AIPlayerConfig): boolean {
  if (!config.enabled) return false;
  if (state.isGameOver) return false;

  // Reaction windows are owned by the reactive player, not the active player.
  if (state.awaitingReaction) {
    const reactiveIndex = state.activePlayerIndex === 0 ? 1 : 0;
    return reactiveIndex === config.playerIndex;
  }

  // Active player's turn
  if (state.activePlayerIndex === config.playerIndex) return true;

  return false;
}

// ─── Generate Next Command ───────────────────────────────────────────────────

/**
 * Generate the next command for the AI player.
 * This is the main entry point called by the UI integration loop.
 *
 * Returns null if:
 * - The AI should not act (not its turn, game over, etc.)
 * - No valid actions available (sub-phase complete, strategy returns null)
 */
export function generateNextCommand(
  state: GameState,
  config: AIPlayerConfig,
  context: AITurnContext,
): GameCommand | null {
  if (!shouldAIAct(state, config)) return null;

  // Reset context if phase/sub-phase changed
  maybeResetContext(context, state.currentPhase, state.currentSubPhase);

  const strategy = createStrategy(config.strategyTier);
  return strategy.generateNextCommand(state, config.playerIndex, context);
}

// ─── Generate Deployment Command ─────────────────────────────────────────────

/**
 * Generate a deployment command for the AI.
 * Called during the Deployment UI phase when it's the AI's turn to deploy.
 */
export function generateDeploymentCommand(
  state: GameState,
  config: AIPlayerConfig,
  deployedUnitIds: string[],
  deploymentZoneDepth: number,
): DeploymentCommand | null {
  if (!config.enabled) return null;

  const strategy = createStrategy(config.strategyTier);
  return strategy.generateDeploymentCommand(
    state,
    config.playerIndex,
    deployedUnitIds,
    deploymentZoneDepth,
  );
}
