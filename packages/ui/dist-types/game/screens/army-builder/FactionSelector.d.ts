/**
 * FactionSelector
 *
 * Dropdowns for selecting faction, allegiance, and Rite of War.
 */
import type { ArmyFaction } from '@hh/types';
import { Allegiance } from '@hh/types';
import type { ArmyList } from '@hh/types';
interface FactionSelectorProps {
    armyList: ArmyList | null;
    playerIndex: number;
    selectedRiteId: string | null;
    onFactionChange: (faction: ArmyFaction) => void;
    onAllegianceChange: (allegiance: Allegiance) => void;
    onPointsLimitChange: (limit: number) => void;
    onRiteChange: (riteId: string | null) => void;
}
export declare function FactionSelector({ armyList, playerIndex, selectedRiteId, onFactionChange, onAllegianceChange, onPointsLimitChange, onRiteChange, }: FactionSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=FactionSelector.d.ts.map