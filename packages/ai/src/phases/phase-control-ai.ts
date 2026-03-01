/**
 * Phase Control AI
 *
 * Handles auto-advancing through non-interactive sub-phases.
 * Issues endSubPhase commands for phases that don't require player input.
 */

import type { GameState, GameCommand } from '@hh/types';
import { Phase, SubPhase } from '@hh/types';

/**
 * Auto-advance sub-phases that don't require player action.
 *
 * The following sub-phases are auto-processed by the engine and just need
 * an endSubPhase command to advance:
 * - StartEffects (start-of-turn effects)
 * - Rout (automatic rout movement)
 * - ShootingMorale (automatic morale resolution)
 * - EndEffects (end-of-turn effects)
 * - Statuses (automatic status cleanup)
 * - Victory (automatic victory check)
 */
export function isAutoAdvanceSubPhase(_phase: Phase, subPhase: SubPhase): boolean {
  switch (subPhase) {
    case SubPhase.StartEffects:
    case SubPhase.Rout:
    case SubPhase.ShootingMorale:
    case SubPhase.EndEffects:
    case SubPhase.Statuses:
    case SubPhase.Victory:
      return true;
    default:
      return false;
  }
}

/**
 * Generate a phase control command if the current sub-phase should auto-advance.
 * Returns an endSubPhase command for auto-advance sub-phases, null otherwise.
 */
export function generatePhaseControlCommand(
  state: GameState,
  _playerIndex: number,
): GameCommand | null {
  if (isAutoAdvanceSubPhase(state.currentPhase, state.currentSubPhase)) {
    return { type: 'endSubPhase' };
  }

  return null;
}
