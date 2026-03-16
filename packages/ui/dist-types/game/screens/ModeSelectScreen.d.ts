import type { GameUIAction, GameUIState } from '../types';
interface ModeSelectScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function ModeSelectScreen({ state, dispatch, onReturnToMenu }: ModeSelectScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ModeSelectScreen.d.ts.map