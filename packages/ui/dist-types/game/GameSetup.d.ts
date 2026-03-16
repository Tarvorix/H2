/**
 * GameSetup — Pre-game setup orchestrator
 *
 * Manages the pre-game flow:
 * 1. Army Load — select/load armies for both players
 * 2. Terrain Setup — place terrain on the battlefield
 * 3. Deployment — place units in deployment zones
 *
 * Each screen transitions to the next via the GameUIPhase.
 */
import type { GameUIState, GameUIAction } from './types';
interface GameSetupProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function GameSetup({ state, dispatch, onReturnToMenu }: GameSetupProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=GameSetup.d.ts.map