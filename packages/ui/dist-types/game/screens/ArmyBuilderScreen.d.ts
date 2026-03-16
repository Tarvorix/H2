/**
 * ArmyBuilderScreen
 *
 * Multi-panel layout for building armies:
 * - Top bar: Player tabs, Faction/Allegiance/Rite dropdowns, Points Limit
 * - Left panel: Detachment list with slots (filled/empty)
 * - Center panel: Unit browser (filtered by slot role, searchable)
 * - Right panel: Unit config (model count, wargear options, points preview)
 * - Bottom bar: Running total, Validate, Import/Export, Confirm
 */
import type { GameUIState, GameUIAction } from '../types';
interface ArmyBuilderScreenProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    onReturnToMenu: () => void;
}
export declare function ArmyBuilderScreen({ state, dispatch, onReturnToMenu }: ArmyBuilderScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ArmyBuilderScreen.d.ts.map