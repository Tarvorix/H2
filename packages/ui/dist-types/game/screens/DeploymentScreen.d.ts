/**
 * DeploymentScreen
 *
 * Allows players to deploy units into their deployment zones before the game starts.
 * The player who loses the deployment roll-off deploys all units first, then the opponent.
 * Deployment zones are 12" deep from each player's table edge.
 */
import type { GameUIState, GameUIAction } from '../types';
interface DeploymentScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function DeploymentScreen({ state, dispatch, onReturnToMenu }: DeploymentScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DeploymentScreen.d.ts.map