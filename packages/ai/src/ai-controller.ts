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
import type {
  AIPlayerConfig,
  AIStrategy,
  AITurnContext,
  DeploymentCommand,
  QueuedCommandStep,
} from './types';
import { AIStrategyTier } from './types';
import { BasicStrategy } from './strategy/basic-strategy';
import { TacticalStrategy } from './strategy/tactical-strategy';
import { EngineStrategy } from './strategy/engine-strategy';
import { AlphaStrategy } from './strategy/alpha-strategy';
import { searchAlphaBestAction } from './alpha/search';
import {
  clearQueuedPlan,
  cloneQueuedPlan,
  getDecisionPlayerIndex,
  getStateFingerprint,
} from './state-utils';

// ─── Strategy Factory ────────────────────────────────────────────────────────

/**
 * Create the appropriate strategy instance for the given tier.
 */
export function createStrategy(configOrTier: AIStrategyTier | AIPlayerConfig): AIStrategy {
  const tier = typeof configOrTier === 'string'
    ? configOrTier
    : configOrTier.strategyTier;
  switch (tier) {
    case AIStrategyTier.Basic:
      return new BasicStrategy();
    case AIStrategyTier.Tactical:
      return new TacticalStrategy();
    case AIStrategyTier.Engine:
      if (typeof configOrTier === 'string') {
        throw new Error('Engine strategy creation requires a full AIPlayerConfig.');
      }
      return new EngineStrategy(configOrTier);
    case AIStrategyTier.Alpha:
      if (typeof configOrTier === 'string') {
        throw new Error('Alpha strategy creation requires a full AIPlayerConfig.');
      }
      return new AlphaStrategy(configOrTier);
  }
}

function createFallbackDiagnostics(config: AIPlayerConfig, error?: string) {
  return {
    tier: config.strategyTier,
    modelId: config.strategyTier === AIStrategyTier.Engine
      ? config.nnueModelId
      : config.strategyTier === AIStrategyTier.Alpha
        ? config.alphaModelId
        : undefined,
    principalVariation: [],
    ...(error ? { error } : {}),
  };
}

function maybeAttachShadowAlphaDiagnostics(
  state: GameState,
  config: AIPlayerConfig,
  context: AITurnContext,
): void {
  if (config.strategyTier === AIStrategyTier.Alpha) return;
  if (!config.shadowAlpha?.enabled) return;

  const shadowConfig: AIPlayerConfig = {
    ...config,
    strategyTier: AIStrategyTier.Alpha,
    alphaModelId: config.shadowAlpha.alphaModelId ?? config.alphaModelId,
    timeBudgetMs: config.shadowAlpha.timeBudgetMs ?? config.timeBudgetMs,
    maxSimulations: config.shadowAlpha.maxSimulations ?? config.maxSimulations,
    baseSeed: config.shadowAlpha.baseSeed ?? config.baseSeed,
    diagnosticsEnabled: config.shadowAlpha.diagnosticsEnabled ?? config.diagnosticsEnabled,
    shadowAlpha: null,
  };

  const shadowResult = searchAlphaBestAction(state, shadowConfig, context.actedUnitIds);
  const liveDiagnostics = context.latestDiagnostics ?? createFallbackDiagnostics(config);
  const shadowSummary = { ...shadowResult.diagnostics };
  delete (shadowSummary as { shadowAlphaDiagnostics?: unknown }).shadowAlphaDiagnostics;
  context.latestDiagnostics = {
    ...liveDiagnostics,
    shadowAlphaDiagnostics: shadowSummary,
  };
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
    latestStateFingerprint: null,
    lastDecisionOwner: null,
    queuedPlan: [],
    pendingResultFingerprint: null,
    pendingResultDecisionOwner: null,
    pendingResultCommandType: null,
    latestDiagnostics: null,
    latestError: null,
    lastEngineScore: null,
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
    clearQueuedPlan(context);
    context.lastPhase = currentPhase;
    context.lastSubPhase = currentSubPhase;
  }
}

function maybeClearRejectedPlan(
  context: AITurnContext,
  currentFingerprint: string,
  decisionOwner: number,
): void {
  if (context.pendingResultFingerprint === null) return;

  const commandWasRejected =
    context.pendingResultFingerprint === currentFingerprint &&
    context.pendingResultDecisionOwner === decisionOwner;

  if (commandWasRejected) {
    clearQueuedPlan(context);
  } else {
    context.pendingResultFingerprint = null;
    context.pendingResultDecisionOwner = null;
    context.pendingResultCommandType = null;
  }
}

function maybeConsumeQueuedPlan(
  context: AITurnContext,
  currentFingerprint: string,
  decisionOwner: number,
): GameCommand | null {
  const nextStep = context.queuedPlan[0];
  if (!nextStep) return null;

  if (
    nextStep.expectedStateFingerprint !== currentFingerprint ||
    nextStep.phase !== context.lastPhase ||
    nextStep.subPhase !== context.lastSubPhase ||
    nextStep.decisionOwner !== decisionOwner
  ) {
    clearQueuedPlan(context);
    return null;
  }

  context.queuedPlan = context.queuedPlan.slice(1);
  return nextStep.command;
}

function markCommandPendingResult(
  context: AITurnContext,
  currentFingerprint: string,
  decisionOwner: number,
  command: GameCommand,
): void {
  context.pendingResultFingerprint = currentFingerprint;
  context.pendingResultDecisionOwner = decisionOwner;
  context.pendingResultCommandType = command.type;
  context.latestStateFingerprint = currentFingerprint;
}

export function getTurnContextDiagnostics(context: AITurnContext) {
  return context.latestDiagnostics;
}

export function getTurnContextError(context: AITurnContext): string | null {
  return context.latestError;
}

export function getTurnContextQueuedPlan(context: AITurnContext): QueuedCommandStep[] {
  return cloneQueuedPlan(context.queuedPlan);
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
  context.latestError = null;

  const decisionOwner = getDecisionPlayerIndex(state);
  const currentFingerprint = getStateFingerprint(state);
  if (context.lastDecisionOwner !== null && context.lastDecisionOwner !== decisionOwner) {
    clearQueuedPlan(context);
  }
  context.lastDecisionOwner = decisionOwner;

  maybeClearRejectedPlan(context, currentFingerprint, decisionOwner);

  const queuedCommand = maybeConsumeQueuedPlan(context, currentFingerprint, decisionOwner);
  if (queuedCommand) {
    markCommandPendingResult(context, currentFingerprint, decisionOwner, queuedCommand);
    return queuedCommand;
  }

  try {
    const strategy = createStrategy(config);
    const command = strategy.generateNextCommand(state, config.playerIndex, context);
    maybeAttachShadowAlphaDiagnostics(state, config, context);
    if (command) {
      markCommandPendingResult(context, currentFingerprint, decisionOwner, command);
    }
    return command;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.latestError = message;
    context.latestDiagnostics = createFallbackDiagnostics(config, message);
    clearQueuedPlan(context);
    throw error;
  }
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

  const strategy = createStrategy(config);
  return strategy.generateDeploymentCommand(
    state,
    config.playerIndex,
    deployedUnitIds,
    deploymentZoneDepth,
    config.deploymentFormation,
  );
}
