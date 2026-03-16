/**
 * Game Reducer
 *
 * Manages the complete GameUIState for a game session.
 * Handles pre-game flow (army load, terrain setup, deployment),
 * game actions (movement, shooting, assault, reactions),
 * and UI state (selection, camera, overlays, combat log, dice animation).
 *
 * All game-logic mutations flow through the engine's processCommand().
 * The reducer translates UI actions → engine commands → updated state.
 */
import type { GameUIState, GameUIAction } from './types';
export declare function gameReducer(state: GameUIState, action: GameUIAction): GameUIState;
//# sourceMappingURL=reducer.d.ts.map