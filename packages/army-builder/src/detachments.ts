/**
 * Detachment Management Module.
 * Handles creating detachments from templates, filling/clearing slots,
 * and calculating unlocked detachment counts.
 *
 * Reference: HH_Battle_AOD.md — "Detachments", "Force Organisation Charts",
 *   "Detachment Unlocking Rules"
 */

import type {
  ArmyListDetachment,
  ArmyFaction,
  ArmyListUnit,
  ForceOrgSlot,
} from '@hh/types';
import {
  BattlefieldRole,
} from '@hh/types';
import type { DetachmentTemplate, DetachmentSlotTemplate } from '@hh/data';

// ─── Detachment Creation ─────────────────────────────────────────────────────

/**
 * Create a new ArmyListDetachment from a template.
 *
 * @param template - The detachment template to instantiate
 * @param faction - The faction for this detachment
 * @param detachmentId - Unique ID for this detachment instance
 * @returns A new ArmyListDetachment with empty units array
 */
export function createDetachment(
  template: DetachmentTemplate,
  faction: ArmyFaction,
  detachmentId: string,
): ArmyListDetachment {
  return {
    id: detachmentId,
    detachmentTemplateId: template.id,
    type: template.type,
    faction,
    units: [],
  };
}

/**
 * Convert a DetachmentSlotTemplate array to ForceOrgSlot array.
 * ForceOrgSlots include a filledByUnitId field for tracking which unit fills them.
 *
 * @param templateSlots - The slot templates from a DetachmentTemplate
 * @returns Array of ForceOrgSlots (all empty)
 */
export function createSlotsFromTemplate(
  templateSlots: DetachmentSlotTemplate[],
): ForceOrgSlot[] {
  return templateSlots.map((slot) => ({
    id: slot.id,
    role: slot.role,
    isPrime: slot.isPrime,
    filledByUnitId: null,
  }));
}

// ─── Detachment Unlocking ────────────────────────────────────────────────────

/**
 * Calculate how many Auxiliary detachments are unlocked by the Primary detachment.
 *
 * Rules:
 * - Each filled Command slot in the Primary unlocks 1 Auxiliary detachment
 * - A filled High Command slot can unlock 1 Auxiliary OR 1 Apex (mutually exclusive)
 *   If the HC is used for an Apex, it doesn't grant an Auxiliary.
 *
 * @param primaryDetachment - The Primary detachment
 * @param primaryTemplate - The template for the Primary detachment
 * @param hcUsedForApex - Whether the HC slot's unlock is used for an Apex instead
 * @returns Number of unlocked Auxiliary detachments
 */
export function getUnlockedAuxiliaryCount(
  primaryDetachment: ArmyListDetachment,
  primaryTemplate: DetachmentTemplate,
  hcUsedForApex: boolean = false,
): number {
  let count = 0;

  // Count filled Command slots
  const commandSlots = primaryTemplate.slots.filter(
    (s) => s.role === BattlefieldRole.Command,
  );
  for (const _slot of commandSlots) {
    // We check if there's a unit filling this slot by matching slot count
    if (getFilledSlotCount(primaryDetachment, primaryTemplate, BattlefieldRole.Command) > 0) {
      // Each filled command slot = 1 auxiliary unlock
      break; // Will compute below
    }
  }

  // Simpler: count filled Command slots by comparing unit count to slot count
  const filledCommandCount = getFilledSlotCount(
    primaryDetachment,
    primaryTemplate,
    BattlefieldRole.Command,
  );
  count += filledCommandCount;

  // HC slot: if filled and not used for Apex, grants 1 more Auxiliary
  const filledHCCount = getFilledSlotCount(
    primaryDetachment,
    primaryTemplate,
    BattlefieldRole.HighCommand,
  );
  if (filledHCCount > 0 && !hcUsedForApex) {
    count += 1;
  }

  return count;
}

/**
 * Calculate how many Apex detachments are unlocked.
 *
 * Rules:
 * - A filled High Command slot in the Primary can unlock 1 Apex (mutually exclusive with Auxiliary)
 *
 * @param primaryDetachment - The Primary detachment
 * @param primaryTemplate - The template for the Primary detachment
 * @param hcUsedForApex - Whether the HC slot's unlock is used for an Apex
 * @returns Number of unlocked Apex detachments (0 or 1)
 */
export function getUnlockedApexCount(
  primaryDetachment: ArmyListDetachment,
  primaryTemplate: DetachmentTemplate,
  hcUsedForApex: boolean = true,
): number {
  if (!hcUsedForApex) return 0;

  const filledHCCount = getFilledSlotCount(
    primaryDetachment,
    primaryTemplate,
    BattlefieldRole.HighCommand,
  );

  return filledHCCount > 0 ? 1 : 0;
}

/**
 * Count how many slots of a given role are filled in a detachment.
 * A slot is considered "filled" if there is a unit with a matching battlefield role.
 *
 * @param detachment - The detachment to check
 * @param template - The template to get slot counts from
 * @param role - The battlefield role to count
 * @returns Number of filled slots of that role
 */
export function getFilledSlotCount(
  detachment: ArmyListDetachment,
  template: DetachmentTemplate,
  role: BattlefieldRole,
): number {
  const slotsOfRole = template.slots.filter((s) => s.role === role).length;
  const unitsOfRole = detachment.units.filter(
    (u) => u.battlefieldRole === role,
  ).length;
  return Math.min(unitsOfRole, slotsOfRole);
}

// ─── Slot Management ─────────────────────────────────────────────────────────

/**
 * Check if a unit can fill a given slot based on battlefield role.
 *
 * @param slot - The slot template to check
 * @param unitRole - The unit's battlefield role
 * @returns true if the unit's role matches the slot's role
 */
export function canFillSlot(
  slot: DetachmentSlotTemplate,
  unitRole: BattlefieldRole,
): boolean {
  return slot.role === unitRole;
}

export interface SlotAssignmentValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validate whether a unit role can be assigned to a specific slot in a detachment.
 *
 * This enforces a concrete slot-level guard used by the UI:
 * - slot must exist in the template
 * - role must match slot role
 * - slot must not already be filled
 * - role slots are filled left-to-right (no skipping ahead)
 */
export function validateUnitAssignmentToSlot(
  detachment: ArmyListDetachment,
  template: DetachmentTemplate,
  slotId: string,
  unitRole: BattlefieldRole,
): SlotAssignmentValidationResult {
  const slot = template.slots.find((s) => s.id === slotId);
  if (!slot) {
    return {
      isValid: false,
      reason: `Slot "${slotId}" does not exist in detachment template "${template.name}".`,
    };
  }

  if (!canFillSlot(slot, unitRole)) {
    return {
      isValid: false,
      reason: `Selected slot "${slot.label}" only accepts ${slot.role}, not ${unitRole}.`,
    };
  }

  const roleSlots = template.slots.filter((s) => s.role === unitRole);
  const targetRoleSlotIndex = roleSlots.findIndex((s) => s.id === slotId);
  if (targetRoleSlotIndex < 0) {
    return {
      isValid: false,
      reason: `Selected slot "${slot.label}" is not a valid ${unitRole} slot.`,
    };
  }

  const unitsOfRole = detachment.units.filter((u) => u.battlefieldRole === unitRole);
  if (targetRoleSlotIndex < unitsOfRole.length) {
    return {
      isValid: false,
      reason: `Selected slot "${slot.label}" is already filled.`,
    };
  }

  if (targetRoleSlotIndex > unitsOfRole.length) {
    return {
      isValid: false,
      reason: `Fill earlier ${unitRole} slots before adding to "${slot.label}".`,
    };
  }

  return { isValid: true };
}

/**
 * Add a unit to a detachment (immutable — returns new detachment).
 *
 * @param detachment - The detachment to add to
 * @param unit - The unit to add
 * @returns New detachment with the unit added
 */
export function addUnitToDetachment(
  detachment: ArmyListDetachment,
  unit: ArmyListUnit,
): ArmyListDetachment {
  return {
    ...detachment,
    units: [...detachment.units, unit],
  };
}

/**
 * Remove a unit from a detachment by unit ID (immutable — returns new detachment).
 *
 * @param detachment - The detachment to remove from
 * @param unitId - The ID of the unit to remove
 * @returns New detachment with the unit removed
 */
export function removeUnitFromDetachment(
  detachment: ArmyListDetachment,
  unitId: string,
): ArmyListDetachment {
  return {
    ...detachment,
    units: detachment.units.filter((u) => u.id !== unitId),
  };
}

/**
 * Check whether all mandatory slots in a detachment template are filled.
 *
 * @param detachment - The detachment to check
 * @param template - The template defining which slots are mandatory
 * @returns true if all mandatory slots have matching units
 */
export function areMandatorySlotsFilled(
  detachment: ArmyListDetachment,
  template: DetachmentTemplate,
): boolean {
  const mandatorySlots = template.slots.filter((s) => s.isMandatory);

  for (const slot of mandatorySlots) {
    const hasUnitForRole = detachment.units.some(
      (u) => u.battlefieldRole === slot.role,
    );
    if (!hasUnitForRole) return false;
  }

  return true;
}

/**
 * Check how many open slots of a given role remain in a detachment.
 *
 * @param detachment - The detachment to check
 * @param template - The template defining available slots
 * @param role - The battlefield role to check
 * @returns Number of unfilled slots of that role
 */
export function getOpenSlotCount(
  detachment: ArmyListDetachment,
  template: DetachmentTemplate,
  role: BattlefieldRole,
): number {
  const totalSlots = template.slots.filter((s) => s.role === role).length;
  const filledSlots = getFilledSlotCount(detachment, template, role);
  return totalSlots - filledSlots;
}

/**
 * Check whether a Warlord Detachment is allowed at the given points limit.
 * Warlord Detachments are only available at 3,000+ points.
 *
 * @param pointsLimit - The army's agreed points limit
 * @returns true if Warlord Detachment is allowed
 */
export function isWarlordDetachmentAllowed(pointsLimit: number): boolean {
  return pointsLimit >= 3000;
}

/**
 * Get all available slot roles in a detachment template.
 *
 * @param template - The detachment template
 * @returns Array of unique BattlefieldRoles available in this template
 */
export function getAvailableRoles(template: DetachmentTemplate): BattlefieldRole[] {
  const roles = new Set<BattlefieldRole>();
  for (const slot of template.slots) {
    roles.add(slot.role);
  }
  return Array.from(roles);
}
