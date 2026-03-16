/**
 * TerrainSetupScreen
 *
 * Allows players to place terrain on the battlefield before deployment.
 * Reuses the existing terrain editor functionality from the debug visualizer.
 */
import type { GameUIState, GameUIAction } from '../types';
interface TerrainSetupScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function TerrainSetupScreen({ state, dispatch, onReturnToMenu }: TerrainSetupScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=TerrainSetupScreen.d.ts.map