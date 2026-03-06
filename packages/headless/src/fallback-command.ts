import type { GameCommand, GameState } from '@hh/types';
import { getValidCommands } from '@hh/engine';

export function buildFallbackCommand(state: GameState): GameCommand | null {
  if (state.awaitingReaction) {
    const pending = state.pendingReaction;
    const fallbackUnitId = pending?.eligibleUnitIds.find((unitId) => unitId.length > 0);

    if (pending && fallbackUnitId) {
      return {
        type: 'selectReaction',
        unitId: fallbackUnitId,
        reactionType: String(pending.reactionType),
      };
    }

    return { type: 'declineReaction' };
  }

  const valid = new Set(getValidCommands(state));

  if (valid.has('endSubPhase')) return { type: 'endSubPhase' };
  if (valid.has('endPhase')) return { type: 'endPhase' };

  return null;
}
