/**
 * Reaction AI
 *
 * Handles reaction decisions for the AI when it's the reactive player.
 * Decides whether to accept or decline reactions (Reposition, Return Fire, Overwatch).
 */

import type { GameState, GameCommand } from '@hh/types';
import type { StrategyMode } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Probability of accepting a reaction in Basic strategy */
const BASIC_ACCEPT_PROBABILITY = 0.3;

/** Minimum reaction allotments to save (Tactical strategy won't use the last one) */
const TACTICAL_RESERVE_ALLOTMENT = 1;

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
  strategy: StrategyMode,
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

  if (strategy === 'basic') {
    return generateBasicReaction(state, eligibleUnitIds, pendingReaction);
  }

  return generateTacticalReaction(state, playerIndex, eligibleUnitIds, pendingReaction);
}

// ─── Basic Strategy ──────────────────────────────────────────────────────────

/**
 * Basic reaction: accept with BASIC_ACCEPT_PROBABILITY, otherwise decline.
 */
function generateBasicReaction(
  _state: GameState,
  eligibleUnitIds: string[],
  pendingReaction: NonNullable<GameState['pendingReaction']>,
): GameCommand {
  if (Math.random() < BASIC_ACCEPT_PROBABILITY) {
    return {
      type: 'selectReaction',
      unitId: eligibleUnitIds[0],
      reactionType: pendingReaction.reactionType,
    };
  }

  return { type: 'declineReaction' };
}

// ─── Tactical Strategy ───────────────────────────────────────────────────────

/**
 * Tactical reaction: evaluate whether the reaction is worth using.
 */
function generateTacticalReaction(
  state: GameState,
  playerIndex: number,
  eligibleUnitIds: string[],
  pendingReaction: NonNullable<GameState['pendingReaction']>,
): GameCommand {
  const army = state.armies[playerIndex];

  // Save reactions if we're running low
  if (army.reactionAllotmentRemaining <= TACTICAL_RESERVE_ALLOTMENT) {
    return { type: 'declineReaction' };
  }

  const reactionType = pendingReaction.reactionType;

  // Evaluate based on reaction type
  switch (reactionType) {
    case 'Reposition': {
      // Accept reposition to move away from melee threats
      // or to get into better firing positions
      return {
        type: 'selectReaction',
        unitId: eligibleUnitIds[0],
        reactionType,
      };
    }

    case 'ReturnFire': {
      // Accept return fire — shooting back is almost always valuable
      return {
        type: 'selectReaction',
        unitId: eligibleUnitIds[0],
        reactionType,
      };
    }

    case 'Overwatch': {
      // Accept overwatch against charging enemies
      return {
        type: 'selectReaction',
        unitId: eligibleUnitIds[0],
        reactionType,
      };
    }

    default: {
      // For advanced reactions: accept if we have plenty of allotment
      if (army.reactionAllotmentRemaining >= 3) {
        return {
          type: 'selectReaction',
          unitId: eligibleUnitIds[0],
          reactionType,
        };
      }
      return { type: 'declineReaction' };
    }
  }
}
