/**
 * ArmySummaryPanel
 *
 * Bottom bar showing running total points, validation status,
 * import/export buttons, and confirm button.
 */
import type { ArmyList, ArmyValidationResult } from '@hh/types';
interface ArmySummaryPanelProps {
    armyList: ArmyList | null;
    validationResult: ArmyValidationResult | null;
    onValidate: () => void;
    onExport: () => void;
    onImport: () => void;
    onConfirm: () => void;
}
export declare function ArmySummaryPanel({ armyList, validationResult, onValidate, onExport, onImport, onConfirm, }: ArmySummaryPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ArmySummaryPanel.d.ts.map