/**
 * DetachmentPanel
 *
 * Left panel showing detachment list with units (filled/empty indicators).
 * Allows selecting detachments and individual units.
 */

import { useCallback } from 'react';
import type { ArmyList, ArmyListDetachment } from '@hh/types';
import type { DetachmentTemplate, DetachmentSlotTemplate } from '@hh/data';
import { findDetachmentTemplate, getProfileById } from '@hh/data';

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

export function DetachmentPanel({
  armyList,
  activeDetachmentIndex,
  activeSlotId,
  addOptions,
  selectedAddTemplateId,
  onSetSelectedAddTemplateId,
  onAddDetachment,
  onRemoveDetachment,
  onRemoveUnit,
  onSelectDetachment,
  onSelectSlot,
}: DetachmentPanelProps) {
  const selectedAddOption = addOptions.find((option) => option.templateId === selectedAddTemplateId);
  const canAddSelected = !!selectedAddTemplateId && !selectedAddOption?.disabled;

  if (!armyList || armyList.detachments.length === 0) {
    return (
      <div className="detachment-panel">
        <div className="panel-title">Detachments</div>
        <div className="detachment-empty">
          Select a faction to begin building your army.
        </div>
      </div>
    );
  }

  return (
    <div className="detachment-panel">
      <div className="panel-title">Detachments</div>
      <div className="detachment-controls">
        <select
          className="detachment-add-select"
          value={selectedAddTemplateId}
          onChange={(e) => onSetSelectedAddTemplateId(e.target.value)}
        >
          <option value="" disabled>
            Select detachment...
          </option>
          {addOptions.map((option) => (
            <option key={option.templateId} value={option.templateId} disabled={option.disabled}>
              {option.disabled && option.disabledReason
                ? `${option.label} — ${option.disabledReason}`
                : option.label}
            </option>
          ))}
        </select>
        <button
          className="toolbar-btn detachment-add-btn"
          onClick={onAddDetachment}
          disabled={!canAddSelected}
        >
          Add
        </button>
      </div>
      <div className="detachment-list">
        {armyList.detachments.map((detachment, index) => {
          const template = findDetachmentTemplate(detachment.detachmentTemplateId);
          return (
            <DetachmentEntry
              key={detachment.id}
              detachment={detachment}
              template={template ?? undefined}
              index={index}
              isActive={activeDetachmentIndex === index}
              activeSlotId={activeDetachmentIndex === index ? activeSlotId : null}
              onRemoveDetachment={onRemoveDetachment}
              onRemoveUnit={onRemoveUnit}
              onSelectDetachment={onSelectDetachment}
              onSelectSlot={onSelectSlot}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DetachmentEntryProps {
  detachment: ArmyListDetachment;
  template?: DetachmentTemplate;
  index: number;
  isActive: boolean;
  activeSlotId: string | null;
  onRemoveDetachment: (index: number) => void;
  onRemoveUnit: (detachmentIndex: number, unitId: string) => void;
  onSelectDetachment: (index: number | null) => void;
  onSelectSlot: (slotId: string | null) => void;
}

function DetachmentEntry({
  detachment,
  template,
  index,
  isActive,
  activeSlotId,
  onRemoveDetachment,
  onRemoveUnit,
  onSelectDetachment,
  onSelectSlot,
}: DetachmentEntryProps) {
  const handleClick = useCallback(() => {
    onSelectDetachment(isActive ? null : index);
  }, [index, isActive, onSelectDetachment]);
  const canRemoveDetachment = template?.category !== 'primary';

  const filledCount = detachment.units.length;
  const totalSlots = template?.slots.length ?? 0;
  const mandatorySlots = template?.slots.filter((s) => s.isMandatory).length ?? 0;

  return (
    <div className={`detachment-entry ${isActive ? 'active' : ''}`}>
      <div
        className="detachment-header"
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <div className="detachment-name">
          {template?.name ?? detachment.detachmentTemplateId}
        </div>
        <div className="detachment-header-right">
          <div className="detachment-fill-count">
            {filledCount}/{totalSlots}
            {mandatorySlots > 0 && (
              <span className="detachment-mandatory"> ({mandatorySlots} req)</span>
            )}
          </div>
          <button
            className="detachment-remove-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveDetachment(index);
            }}
            title="Remove detachment"
            disabled={!canRemoveDetachment}
          >
            ×
          </button>
        </div>
      </div>

      {isActive && template && (
        <div className="detachment-slots">
          {template.slots.map((slot) => {
            // Find a unit filling this slot by matching battlefield role
            const fillingUnit = findUnitForSlot(slot, detachment);
            const isFilled = !!fillingUnit;
            const isSlotActive = activeSlotId === slot.id;
            const unitProfile = fillingUnit ? getProfileById(fillingUnit.profileId) : null;

            return (
              <div
                key={slot.id}
                className={`detachment-slot ${isFilled ? 'filled' : 'empty'} ${isSlotActive ? 'active' : ''} ${slot.isMandatory ? 'mandatory' : ''}`}
                onClick={() => onSelectSlot(isSlotActive ? null : slot.id)}
                role="button"
                tabIndex={0}
              >
                <span className="slot-role">{slot.label}</span>
                {slot.isPrime && <span className="slot-prime">PRIME</span>}
                {isFilled && fillingUnit && (
                  <span className="slot-unit">
                    {unitProfile?.name ?? fillingUnit.profileId} ({fillingUnit.totalPoints}pts)
                    <button
                      className="slot-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveUnit(index, fillingUnit.id);
                      }}
                      title="Remove unit from slot"
                    >
                      ×
                    </button>
                  </span>
                )}
                {!isFilled && (
                  <span className="slot-empty-indicator">Empty</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Find a unit in the detachment that fills a given template slot.
 * Matches by battlefield role, and tracks which units have already been
 * matched to slots to avoid double-counting.
 */
function findUnitForSlot(
  slot: DetachmentSlotTemplate,
  detachment: ArmyListDetachment,
): import('@hh/types').ArmyListUnit | undefined {
  // Count how many slots of this role precede this one in the template
  // to handle multiple slots of the same role
  const template = findDetachmentTemplate(detachment.detachmentTemplateId);
  if (!template) return undefined;

  const slotsOfSameRole = template.slots.filter(s => s.role === slot.role);
  const slotIndex = slotsOfSameRole.indexOf(slot);
  const unitsOfRole = detachment.units.filter(u => u.battlefieldRole === slot.role);

  return unitsOfRole[slotIndex];
}
