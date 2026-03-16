/**
 * ObjectivePlacementScreen
 *
 * For alternating/symmetric missions, allows players to click to place objectives on the battlefield.
 * Shows the deployment zones and existing objectives.
 */
import type { GameUIState, GameUIAction } from '../types';
interface ObjectivePlacementScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function ObjectivePlacementScreen({ state, dispatch, onReturnToMenu }: ObjectivePlacementScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ObjectivePlacementScreen.d.ts.map