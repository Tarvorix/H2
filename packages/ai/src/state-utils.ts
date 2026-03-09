import type { GameState } from '@hh/types';
import { hashGameState } from '@hh/engine';
import type { AITurnContext, QueuedCommandStep } from './types';

export function getDecisionPlayerIndex(state: GameState): number {
  if (state.awaitingReaction) {
    return state.activePlayerIndex === 0 ? 1 : 0;
  }
  return state.activePlayerIndex;
}

export function getStateFingerprint(state: GameState): string {
  return hashGameState(state);
}

export function clearQueuedPlan(context: AITurnContext): void {
  context.queuedPlan = [];
  context.pendingResultFingerprint = null;
  context.pendingResultDecisionOwner = null;
  context.pendingResultCommandType = null;
}

export function cloneQueuedPlan(queuedPlan: readonly QueuedCommandStep[]): QueuedCommandStep[] {
  return queuedPlan.map((step) => ({
    command: step.command,
    expectedStateFingerprint: step.expectedStateFingerprint,
    decisionOwner: step.decisionOwner,
    phase: step.phase,
    subPhase: step.subPhase,
    label: step.label,
  }));
}
