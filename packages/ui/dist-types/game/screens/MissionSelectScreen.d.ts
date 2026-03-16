/**
 * MissionSelectScreen
 *
 * Shows 3 core missions with descriptions, deployment map preview, and confirm button.
 * Also allows selection of deployment map.
 */
import type { GameUIState, GameUIAction } from '../types';
interface MissionSelectScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function MissionSelectScreen({ state, dispatch, onReturnToMenu }: MissionSelectScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=MissionSelectScreen.d.ts.map