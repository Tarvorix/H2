/**
 * Tactical AI Strategy
 *
 * Heuristic-based tactical decisions. Extends the same phase handler
 * framework as Basic but passes 'tactical' mode which activates:
 * - Target prioritization (wounded > exposed > high-threat)
 * - Position evaluation (objectives, cover, firing lanes)
 * - Charge evaluation (only charge favorable combats)
 * - Rules-valid reaction handling (accept legal reaction opportunities)
 * - Role-based deployment (ranged units back, melee units forward)
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

export class TacticalStrategy implements AIStrategy {
  /**
   * Generate the next command for the AI player.
   *
   * Same flow as BasicStrategy but delegates with 'tactical' mode
   * which activates heuristic decision-making in all phase handlers.
   */
  generateNextCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null {
    // Handle reactions first
    if (state.awaitingReaction) {
      return generateReactionCommand(state, playerIndex, 'tactical');
    }

    // Check for auto-advance sub-phases
    const phaseControl = generatePhaseControlCommand(state, playerIndex);
    if (phaseControl) return phaseControl;

    // Delegate to phase-specific handler with tactical mode
    const command = this.generatePhaseCommand(state, playerIndex, context);

    // If no command available, advance the sub-phase
    if (command === null) {
      return { type: 'endSubPhase' };
    }

    return command;
  }

  /**
   * Generate a deployment command for pre-game deployment.
   * Uses role-based placement: ranged units toward the back, melee toward the front.
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
      'tactical',
    );
  }

  /**
   * Route to the appropriate phase handler with tactical mode.
   */
  private generatePhaseCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null {
    switch (state.currentPhase) {
      case Phase.Movement:
        return generateMovementCommand(state, playerIndex, context, 'tactical');
      case Phase.Shooting:
        return generateShootingCommand(state, playerIndex, context, 'tactical');
      case Phase.Assault:
        return generateAssaultCommand(state, playerIndex, context, 'tactical');
      default:
        return null;
    }
  }
}
