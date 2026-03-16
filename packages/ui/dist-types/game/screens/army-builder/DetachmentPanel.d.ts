/**
 * DetachmentPanel
 *
 * Left panel showing detachment list with units (filled/empty indicators).
 * Allows selecting detachments and individual units.
 */
import type { ArmyList } from '@hh/types';
interface DetachmentPanelProps {
    armyList: ArmyList | null;
    activeDetachmentIndex: number | null;
    activeSlotId: string | null;
    addOptions: Array<{
        templateId: string;
        label: string;
        disabled: boolean;
        disabledReason?: string;
    }>;
    selectedAddTemplateId: string;
    onSetSelectedAddTemplateId: (templateId: string) => void;
    onAddDetachment: () => void;
    onRemoveDetachment: (index: number) => void;
    onRemoveUnit: (detachmentIndex: number, unitId: string) => void;
    onSelectDetachment: (index: number | null) => void;
    onSelectSlot: (slotId: string | null) => void;
}
export declare function DetachmentPanel({ armyList, activeDetachmentIndex, activeSlotId, addOptions, selectedAddTemplateId, onSetSelectedAddTemplateId, onAddDetachment, onRemoveDetachment, onRemoveUnit, onSelectDetachment, onSelectSlot, }: DetachmentPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DetachmentPanel.d.ts.map