/**
 * Reaction AI
 *
 * Handles reaction decisions for the AI when it's the reactive player.
 * Accepts valid reactions by default and only declines when reactions are
 * not legally usable by rules/state.
 */

import type { GameState, GameCommand } from '@hh/types';
import type { StrategyMode } from '../types';

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate a reaction command when the AI is the reactive player.
 * Only called when state.awaitingReaction is true.
 *
 * @returns selectReaction or declineReaction command
 */
export function generateReactionCommand(
  state: GameState,
  playerIndex: number,
  _strategy: StrategyMode,
): GameCommand | null {
  if (!state.awaitingReaction || !state.pendingReaction) {
    return null;
  }

  const pendingReaction = state.pendingReaction;
  const eligibleUnitIds = pendingReaction.eligibleUnitIds;

  if (!eligibleUnitIds || eligibleUnitIds.length === 0) {
    return { type: 'declineReaction' };
  }

  // Check reaction allotment
  const reactiveIndex = state.activePlayerIndex === 0 ? 1 : 0;
  if (reactiveIndex !== playerIndex) {
    return { type: 'declineReaction' };
  }

  const army = state.armies[reactiveIndex];
  if (army.reactionAllotmentRemaining <= 0) {
    return { type: 'declineReaction' };
  }

  return {
    type: 'selectReaction',
    unitId: eligibleUnitIds[0],
    reactionType: pendingReaction.reactionType,
  };
}
