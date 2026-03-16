/**
 * UnitCard Panel
 *
 * Displays detailed information about the selected unit:
 * - Unit name, model count (alive/total)
 * - Full stat line (M/WS/BS/S/T/W/I/A/LD/Sv)
 * - Wargear list with weapon profiles
 * - Current statuses (Pinned/Suppressed/Stunned/Routed)
 * - Wounds remaining per model
 * - Movement state (Stationary/Moved/Rushed)
 * - Special rules
 */
import type { GameState } from '@hh/types';
interface UnitCardProps {
    gameState: GameState;
    selectedUnitId: string;
}
export declare function UnitCard({ gameState, selectedUnitId }: UnitCardProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=UnitCard.d.ts.map