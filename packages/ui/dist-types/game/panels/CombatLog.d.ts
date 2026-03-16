/**
 * CombatLog Panel
 *
 * Scrolling log of all game events with dice roll details.
 * Filterable by category. Auto-scrolls to latest entry.
 */
import type { CombatLogEntry, CombatLogCategory, GameUIAction } from '../types';
interface CombatLogProps {
    entries: CombatLogEntry[];
    filter: CombatLogCategory | 'all';
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function CombatLog({ entries, filter, dispatch }: CombatLogProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=CombatLog.d.ts.map