/**
 * useAITurn Hook
 *
 * React hook that drives the AI opponent during the Playing phase.
 * Detects when the AI should act, generates commands, and dispatches them.
 *
 * The hook runs a loop: state change → hook fires → AI generates command →
 * dispatch → state change → hook fires again. The loop terminates when
 * shouldAIAct() returns false or generateNextCommand() returns null.
 *
 * Uses setTimeout with commandDelayMs for visual pacing so the human player
 * can follow the AI's actions.
 */
import type { GameUIState, GameUIAction } from '../types';
/**
 * Hook that automatically executes AI turns when it's the AI player's turn.
 *
 * @param state - Current UI state
 * @param dispatch - UI action dispatcher
 */
export declare function useAITurn(state: GameUIState, dispatch: React.Dispatch<GameUIAction>): void;
//# sourceMappingURL=useAITurn.d.ts.map