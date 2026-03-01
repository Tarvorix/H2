/**
 * Basic AI Strategy
 *
 * Random valid action strategy — no tactical intelligence.
 * Picks random targets, random movement destinations, and randomly
 * decides whether to charge or use reactions.
 *
 * This is the foundation strategy that proves the AI system works.
 */

import type { GameState, GameCommand } from '@hh/types';
import { Phase } from '@hh/types';
import type { AIStrategy, AITurnContext, DeploymentCommand } from '../types';
import { generatePhaseControlCommand } from '../phases/phase-control-ai';
import { generateMovementCommand } from '../phases/movement-ai';
import { generateShootingCommand } from '../phases/shooting-ai';
import { generateAssaultCommand } from '../phases/assault-ai';
import { generateReactionCommand } from '../phases/reaction-ai';
import { generateDeploymentPlacement } from '../deployment/deployment-ai';

export class BasicStrategy implements AIStrategy {
  /**
   * Generate the next command for the AI player.
   *
   * Logic flow:
   * 1. If awaiting reaction → handle reaction decision
   * 2. Check for auto-advance sub-phases → endSubPhase
   * 3. Delegate to phase-specific handler
   * 4. If handler returns null → endSubPhase (nothing more to do)
   */
  generateNextCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null {
    // Handle reactions first (reactive player decisions)
    if (state.awaitingReaction) {
      return generateReactionCommand(state, playerIndex, 'basic');
    }

    // Check for auto-advance sub-phases
    const phaseControl = generatePhaseControlCommand(state, playerIndex);
    if (phaseControl) return phaseControl;

    // Delegate to phase-specific handler
    const command = this.generatePhaseCommand(state, playerIndex, context);

    // If no command available, advance the sub-phase
    if (command === null) {
      return { type: 'endSubPhase' };
    }

    return command;
  }

  /**
   * Generate a deployment command for pre-game deployment.
   */
  generateDeploymentCommand(
    state: GameState,
    playerIndex: number,
    deployedUnitIds: string[],
    deploymentZoneDepth: number,
  ): DeploymentCommand | null {
    return generateDeploymentPlacement(
      state,
      playerIndex,
      deployedUnitIds,
      deploymentZoneDepth,
      'basic',
    );
  }

  /**
   * Route to the appropriate phase handler.
   */
  private generatePhaseCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null {
    switch (state.currentPhase) {
      case Phase.Movement:
        return generateMovementCommand(state, playerIndex, context, 'basic');
      case Phase.Shooting:
        return generateShootingCommand(state, playerIndex, context, 'basic');
      case Phase.Assault:
        return generateAssaultCommand(state, playerIndex, context, 'basic');
      default:
        return null;
    }
  }
}
