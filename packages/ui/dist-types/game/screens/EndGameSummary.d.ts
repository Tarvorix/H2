/**
 * EndGameSummary
 *
 * Full-screen overlay when the game is over.
 * Shows winner, victory points, total casualties, and game summary.
 */
import type { GameUIState, GameUIAction } from '../types';
interface EndGameSummaryProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onNewGame: () => void;
    onReturnToMenu: () => void;
}
export declare function EndGameSummary({ state, onNewGame, onReturnToMenu }: EndGameSummaryProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=EndGameSummary.d.ts.map