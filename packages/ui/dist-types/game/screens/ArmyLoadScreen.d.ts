/**
 * ArmyLoadScreen
 *
 * UI for loading two armies before a game.
 * For Phase 6, provides preset army lists since the Army Builder is Phase 8.
 * Players can select from presets or (future) upload JSON army files.
 */
import type { GameUIState, GameUIAction } from '../types';
interface ArmyLoadScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function ArmyLoadScreen({ state, dispatch, onReturnToMenu }: ArmyLoadScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ArmyLoadScreen.d.ts.map