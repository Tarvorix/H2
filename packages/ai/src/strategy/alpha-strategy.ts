import type { GameCommand, GameState } from '@hh/types';
import type {
  AIDeploymentFormation,
  AIPlayerConfig,
  AIStrategy,
  AITurnContext,
  DeploymentCommand,
} from '../types';
import { generateDeploymentPlacement } from '../deployment/deployment-ai';
import { generatePhaseControlCommand } from '../phases/phase-control-ai';
import { searchAlphaBestAction } from '../alpha/search';
import { getStateFingerprint } from '../state-utils';

export class AlphaStrategy implements AIStrategy {
  constructor(private readonly config: AIPlayerConfig) {}

  generateNextCommand(
    state: GameState,
    playerIndex: number,
    context: AITurnContext,
  ): GameCommand | null {
    const phaseControl = generatePhaseControlCommand(state, playerIndex);
    if (phaseControl) {
      return phaseControl;
    }

    const searchResult = searchAlphaBestAction(state, this.config, context.actedUnitIds);
    context.latestDiagnostics = searchResult.diagnostics;
    context.latestError = searchResult.diagnostics.error ?? null;
    context.latestStateFingerprint = getStateFingerprint(state);

    if (!searchResult.bestAction) {
      return null;
    }

    context.queuedPlan = searchResult.queuedPlan;
    const firstCommand = searchResult.bestAction.commands[0] ?? null;
    if (!firstCommand) {
      context.queuedPlan = [];
      return null;
    }

    searchResult.bestAction.actorIds.forEach((actorId) => context.actedUnitIds.add(actorId));
    return firstCommand;
  }

  generateDeploymentCommand(
    state: GameState,
    playerIndex: number,
    deployedUnitIds: string[],
    deploymentZoneDepth: number,
    deploymentFormation: AIDeploymentFormation,
  ): DeploymentCommand | null {
    return generateDeploymentPlacement(
      state,
      playerIndex,
      deployedUnitIds,
      deploymentZoneDepth,
      'tactical',
      deploymentFormation,
    );
  }
}
