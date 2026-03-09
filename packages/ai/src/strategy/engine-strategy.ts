import type { GameState, GameCommand } from '@hh/types';
import type {
  AIPlayerConfig,
  AIStrategy,
  AITurnContext,
  DeploymentCommand,
  AIDeploymentFormation,
} from '../types';
import { generatePhaseControlCommand } from '../phases/phase-control-ai';
import { generateDeploymentPlacement } from '../deployment/deployment-ai';
import { searchBestAction } from '../engine/search';
import { getStateFingerprint } from '../state-utils';

export class EngineStrategy implements AIStrategy {
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

    const searchResult = searchBestAction(state, this.config, context.actedUnitIds);
    context.latestDiagnostics = searchResult.diagnostics;
    context.lastEngineScore = searchResult.score;
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
