/**
 * UnitConfigPanel
 *
 * Right panel for configuring a selected unit:
 * model count, wargear options, points preview.
 */
import type { UnitProfile } from '@hh/types';
interface UnitConfigPanelProps {
    /** The unit profile being configured */
    profile: UnitProfile | null;
    /** Callback when unit configuration is confirmed */
    onConfirm: (config: UnitConfigResult) => void;
    /** Callback to cancel selection */
    onCancel: () => void;
}
export interface UnitConfigResult {
    profileId: string;
    modelCount: number;
    selectedWargearIndices: number[];
    totalPoints: number;
}
export declare function UnitConfigPanel({ profile, onConfirm, onCancel, }: UnitConfigPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=UnitConfigPanel.d.ts.map