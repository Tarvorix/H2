/**
 * State Machine — Phase/SubPhase Transition Table
 * Reference: HH_Rules_Battle.md — "Turn Sequence"
 *
 * Battle (1..maxBattleTurns)
 *   └── BattleTurn
 *        └── PlayerTurn (Active then Reactive)
 *             ├── Start → StartEffects
 *             ├── Movement → Reserves → Move → Rout
 *             ├── Shooting → Attack → ShootingMorale  (stubs)
 *             ├── Assault → Charge → Challenge → Fight → Resolution  (stubs)
 *             └── End → EndEffects → Statuses → Victory
 */

import type { GameState } from '@hh/types';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { PhaseState, GameEvent } from './types';
import { expireModifiersForTransition, setPhaseState } from './state-helpers';

// ─── Player Turn Sequence ────────────────────────────────────────────────────

/**
 * The ordered sequence of phase/sub-phase states within a single Player Turn.
 * The state machine advances through these in order.
 */
export const PLAYER_TURN_SEQUENCE: PhaseState[] = [
  // Start Phase
  { phase: Phase.Start, subPhase: SubPhase.StartEffects },
  // Movement Phase
  { phase: Phase.Movement, subPhase: SubPhase.Reserves },
  { phase: Phase.Movement, subPhase: SubPhase.Move },
  { phase: Phase.Movement, subPhase: SubPhase.Rout },
  // Shooting Phase
  { phase: Phase.Shooting, subPhase: SubPhase.Attack },
  { phase: Phase.Shooting, subPhase: SubPhase.ShootingMorale },
  // Assault Phase
  { phase: Phase.Assault, subPhase: SubPhase.Charge },
  { phase: Phase.Assault, subPhase: SubPhase.Challenge },
  { phase: Phase.Assault, subPhase: SubPhase.Fight },
  { phase: Phase.Assault, subPhase: SubPhase.Resolution },
  // End Phase
  { phase: Phase.End, subPhase: SubPhase.EndEffects },
  { phase: Phase.End, subPhase: SubPhase.Statuses },
  { phase: Phase.End, subPhase: SubPhase.Victory },
];

// ─── Sequence Index Lookup ───────────────────────────────────────────────────

/**
 * Find the index of a phase/sub-phase in the sequence.
 * Returns -1 if not found.
 */
export function findSequenceIndex(phase: Phase, subPhase: SubPhase): number {
  return PLAYER_TURN_SEQUENCE.findIndex(
    ps => ps.phase === phase && ps.subPhase === subPhase,
  );
}

/**
 * Get the next phase state in the sequence.
 * Returns null if at the end of the sequence.
 */
export function getNextPhaseState(phase: Phase, subPhase: SubPhase): PhaseState | null {
  const idx = findSequenceIndex(phase, subPhase);
  if (idx < 0 || idx >= PLAYER_TURN_SEQUENCE.length - 1) return null;
  return PLAYER_TURN_SEQUENCE[idx + 1];
}

// ─── Sub-Phase Advancement ───────────────────────────────────────────────────

/**
 * Advance to the next sub-phase within the current player turn.
 * If at the end of the sequence (Victory), advances the player turn.
 *
 * Returns the updated game state and any events emitted.
 */
export function advanceSubPhase(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const next = getNextPhaseState(state.currentPhase, state.currentSubPhase);

  if (next === null) {
    // End of player turn sequence — advance player turn
    return advancePlayerTurn(state);
  }

  // Emit events for phase/sub-phase transitions
  if (next.phase !== state.currentPhase) {
    events.push({
      type: 'phaseAdvanced',
      fromPhase: state.currentPhase,
      toPhase: next.phase,
    });
  }

  events.push({
    type: 'subPhaseAdvanced',
    phase: next.phase,
    fromSubPhase: state.currentSubPhase,
    toSubPhase: next.subPhase,
  });

  const expiredState = expireModifiersForTransition(state, next.phase, next.subPhase);

  return {
    state: setPhaseState(expiredState, next.phase, next.subPhase),
    events,
  };
}

// ─── Phase Advancement ───────────────────────────────────────────────────────

/**
 * Advance to the next main phase (skipping all sub-phases of current phase).
 * Used when ending a phase early (e.g., no units to move in Movement phase).
 */
export function advancePhase(state: GameState): { state: GameState; events: GameEvent[] } {
  const currentPhase = state.currentPhase;
  let result = { state, events: [] as GameEvent[] };

  // Keep advancing sub-phases until we're in a different phase or at end of sequence
  while (result.state.currentPhase === currentPhase) {
    const next = getNextPhaseState(result.state.currentPhase, result.state.currentSubPhase);
    if (next === null) {
      // End of sequence, advance player turn
      return advancePlayerTurn(result.state);
    }
    result = advanceSubPhase(result.state);
  }

  return result;
}

// ─── Player Turn Advancement ─────────────────────────────────────────────────

/**
 * Reset per-turn state for all units in an army.
 */
function resetArmyTurnState(state: GameState, playerIndex: number): GameState {
  const armies = [...state.armies] as [typeof state.armies[0], typeof state.armies[1]];
  armies[playerIndex] = {
    ...armies[playerIndex],
    units: armies[playerIndex].units.map(unit => ({
      ...unit,
      hasReactedThisTurn: false,
      hasShotThisTurn: false,
      movementState: UnitMovementState.Stationary,
    })),
    reactionAllotmentRemaining: armies[playerIndex].baseReactionAllotment,
  };
  return { ...state, armies };
}

/**
 * Advance to the next player's turn.
 * If both players have gone, advances the battle turn.
 */
export function advancePlayerTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // Determine if both players have had their turn this battle turn.
  // The first player goes first, then the second player.
  const isFirstPlayerActive = state.activePlayerIndex === state.firstPlayerIndex;

  if (isFirstPlayerActive) {
    // First player just finished — switch to second player
    const nextPlayerIndex = state.activePlayerIndex === 0 ? 1 : 0;
    let newState = resetArmyTurnState(state, nextPlayerIndex);
    newState = {
      ...newState,
      activePlayerIndex: nextPlayerIndex,
    };
    // Reset to start of sequence
    newState = setPhaseState(newState, Phase.Start, SubPhase.StartEffects);

    events.push({ type: 'playerTurnAdvanced', newActivePlayerIndex: nextPlayerIndex });

    return { state: newState, events };
  } else {
    // Second player just finished — advance battle turn
    return advanceBattleTurn(state);
  }
}

// ─── Battle Turn Advancement ─────────────────────────────────────────────────

/**
 * Advance to the next battle turn.
 * If max turns reached, end the game.
 */
export function advanceBattleTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextTurn = state.currentBattleTurn + 1;

  if (nextTurn > state.maxBattleTurns) {
    // Game over
    events.push({
      type: 'gameOver',
      winnerPlayerIndex: determineWinner(state),
      reason: 'Maximum battle turns reached',
    });

    return {
      state: {
        ...state,
        isGameOver: true,
        winnerPlayerIndex: determineWinner(state),
      },
      events,
    };
  }

  // Reset both armies for the new battle turn
  let newState = resetArmyTurnState(state, 0);
  newState = resetArmyTurnState(newState, 1);

  newState = {
    ...newState,
    currentBattleTurn: nextTurn,
    activePlayerIndex: state.firstPlayerIndex,
  };
  newState = setPhaseState(newState, Phase.Start, SubPhase.StartEffects);

  events.push({ type: 'battleTurnAdvanced', newBattleTurn: nextTurn });
  events.push({ type: 'playerTurnAdvanced', newActivePlayerIndex: state.firstPlayerIndex });

  return { state: newState, events };
}

// ─── Winner Determination ────────────────────────────────────────────────────

/**
 * Determine the winner based on victory points.
 * Returns player index or null for draw.
 */
function determineWinner(state: GameState): number | null {
  const vp0 = state.armies[0].victoryPoints;
  const vp1 = state.armies[1].victoryPoints;
  if (vp0 > vp1) return 0;
  if (vp1 > vp0) return 1;
  return null;
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize a game state to the beginning of the first player turn.
 */
export function initializeGamePhase(state: GameState): GameState {
  return setPhaseState(state, Phase.Start, SubPhase.StartEffects);
}
