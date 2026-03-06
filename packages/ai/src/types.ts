/**
 * AI Opponent Types
 *
 * Core type definitions for the AI strategy system.
 * The AI is stateless per-call but uses an AITurnContext to track
 * which units have already acted within the current sub-phase.
 */

import type { GameState, GameCommand, Position } from '@hh/types';
import { Phase, SubPhase } from '@hh/types';
import type { DeploymentFormationPreset } from '@hh/geometry';

// ─── Strategy Tier ───────────────────────────────────────────────────────────

/**
 * AI strategy tier. Determines the sophistication of decision-making.
 */
export enum AIStrategyTier {
  /** Random valid actions — no tactical intelligence */
  Basic = 'Basic',
  /** Heuristic-based tactical decisions */
  Tactical = 'Tactical',
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration for an AI player.
 */
export interface AIPlayerConfig {
  /** Which player index this AI controls (0 or 1) */
  playerIndex: number;
  /** Strategy tier to use */
  strategyTier: AIStrategyTier;
  /** Preferred deployment formation when placing units before the game */
  deploymentFormation: AIDeploymentFormation;
  /** Delay between commands in ms (for UI pacing, 0 = instant) */
  commandDelayMs: number;
  /** Whether the AI is enabled */
  enabled: boolean;
}

export type AIDeploymentFormation = 'auto' | DeploymentFormationPreset;

// ─── Turn Context ────────────────────────────────────────────────────────────

/**
 * Mutable context that persists across generateNextCommand calls within
 * a single sub-phase. Reset automatically when the phase/sub-phase changes.
 *
 * This solves the problem of a stateless AI needing to remember which
 * units it has already issued commands for (since the engine doesn't
 * track per-turn shooting usage, etc.).
 */
export interface AITurnContext {
  /** Unit IDs that have already been issued commands in the current sub-phase */
  actedUnitIds: Set<string>;
  /** Model IDs that have already been moved in the current move command sequence */
  movedModelIds: Set<string>;
  /** The unit currently being processed (for multi-model movement) */
  currentMovingUnitId: string | null;
  /** Phase when this context was last used */
  lastPhase: Phase | null;
  /** Sub-phase when this context was last used */
  lastSubPhase: SubPhase | null;
}

// ─── Strategy Interface ──────────────────────────────────────────────────────

/**
 * The core AI strategy interface. Both Basic and Tactical implement this.
 */
export interface AIStrategy {
  /**
   * Generate the next command for the AI player to execute.
   * Returns null if no action is available (end of sub-phase, etc.).
   */
  generateNextCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null;

  /**
   * Generate a deployment command for placing units during pre-game.
   * Returns null if deployment is complete.
   */
  generateDeploymentCommand(
    state: GameState,
    playerIndex: number,
    deployedUnitIds: string[],
    deploymentZoneDepth: number,
    deploymentFormation: AIDeploymentFormation,
  ): DeploymentCommand | null;
}

// ─── Deployment ──────────────────────────────────────────────────────────────

/**
 * Result from deployment AI — a unit to deploy with its model positions.
 */
export interface DeploymentCommand {
  unitId: string;
  modelPositions: { modelId: string; position: Position }[];
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Scoring data for a potential target. Used by Tactical strategy.
 */
export interface TargetScore {
  unitId: string;
  score: number;
  reasons: string[];
}

/**
 * Movement evaluation for a potential destination.
 */
export interface MovementScore {
  position: Position;
  score: number;
  reasons: string[];
}

/**
 * Strategy tier string literal type used by phase handlers.
 * Matches the lowercase version of AIStrategyTier values.
 */
export type StrategyMode = 'basic' | 'tactical';
