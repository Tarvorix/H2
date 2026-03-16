/**
 * UnitBrowser
 *
 * Center panel showing available units filtered by slot role.
 * Searchable, shows points, stats, and unit type.
 */
import type { ArmyFaction, BattlefieldRole } from '@hh/types';
interface UnitBrowserProps {
    /** The battlefield role to filter by (from the selected slot) */
    filterRole: BattlefieldRole | null;
    /** Search text filter */
    searchFilter: string;
    /** Faction to filter profiles for */
    faction: ArmyFaction | null;
    /** Callback when a unit is selected */
    onSelectUnit: (profileId: string) => void;
    /** Callback when search text changes */
    onSearchChange: (filter: string) => void;
}
export declare function UnitBrowser({ filterRole, searchFilter, faction, onSelectUnit, onSearchChange, }: UnitBrowserProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=UnitBrowser.d.ts.map