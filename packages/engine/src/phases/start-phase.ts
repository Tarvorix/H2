/**
 * Start Phase Handler
 * Processes the Start Phase of a player turn.
 *
 * Reference: HH_Rules_Battle.md — "Start Phase"
 *
 * The Start Phase handles:
 * - Reset per-turn legion tactica state (reaction discount, movement bonus)
 * - Start-of-turn effects (ongoing effects, aura abilities)
 * - Psychic powers that activate at the start of the turn
 */

import type { GameState, LegionTacticaState } from '@hh/types';
import type { CommandResult, DiceProvider } from '../types';
import { expirePsychicEffectsAtTurnStart } from '../psychic/psychic-runtime';

/**
 * Process the Start Phase effects.
 * Resets per-turn legion tactica tracking state for the active player.
 *
 * @param state - Current game state
 * @param _dice - Dice provider (unused currently)
 * @returns CommandResult with updated state
 */
export function handleStartPhase(
  state: GameState,
  _dice: DiceProvider,
): CommandResult {
  const psychicExpiredState = expirePsychicEffectsAtTurnStart(state);

  // Reset per-turn legion tactica state for the active player
  const playerIndex = psychicExpiredState.activePlayerIndex;
  const resetState: LegionTacticaState = {
    reactionDiscountUsedThisTurn: false,
    movementBonusActiveThisTurn: false,
    perTurnFlags: {},
  };

  const newLegionTacticaState = [...psychicExpiredState.legionTacticaState] as [LegionTacticaState, LegionTacticaState];
  newLegionTacticaState[playerIndex] = resetState;

  return {
    state: {
      ...psychicExpiredState,
      legionTacticaState: newLegionTacticaState,
    },
    events: [],
    errors: [],
    accepted: true,
  };
}
