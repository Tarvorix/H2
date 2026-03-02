/**
 * Rite of War Enforcement Module.
 * Validates Rite of War restrictions, availability, and provides
 * detachment templates from rites.
 *
 * Reference: HH_Legiones_Astartes.md — per-legion Rite of War restrictions
 * Reference: HH_Battle_AOD.md — Rite of War rules
 */

import type {
  ArmyList,
  ArmyListUnit,
  ArmyValidationError,
} from '@hh/types';
import {
  Allegiance,
  ArmyFaction,
  BattlefieldRole,
} from '@hh/types';
import type { RiteOfWarDefinition, RiteOfWarRestriction } from '@hh/types';
import { findRiteOfWar } from '@hh/data';
import type { DetachmentTemplate } from '@hh/data';
import { buildRiteDetachmentTemplates } from '@hh/data';

// ─── Rite Availability ───────────────────────────────────────────────────────

/**
 * Check if a Rite of War is available for the given army configuration.
 *
 * @param rite - The Rite of War definition
 * @param faction - The army's primary faction
 * @param allegiance - The army's allegiance
 * @param pointsLimit - The army's points limit
 * @returns true if the rite can be used
 */
export function isRiteAvailable(
  rite: RiteOfWarDefinition,
  faction: ArmyFaction,
  allegiance: Allegiance,
  pointsLimit: number,
): boolean {
  // Rite must belong to the army's faction
  if (rite.legion !== faction) {
    return false;
  }

  // Check minimum points requirement
  if (rite.minimumPoints && pointsLimit < rite.minimumPoints) {
    return false;
  }

  // Check allegiance restriction
  for (const restriction of rite.restrictions) {
    if (restriction.type === 'allegianceRequired') {
      const requiredAllegiance = restriction.restriction.allegiance as Allegiance | null;
      if (requiredAllegiance !== null && requiredAllegiance !== allegiance) {
        return false;
      }
    }
  }

  return true;
}

// ─── Rite Restriction Validation ─────────────────────────────────────────────

/**
 * Validate all restrictions of a Rite of War against the army list.
 *
 * @param armyList - The army list to validate
 * @param rite - The Rite of War to enforce
 * @returns Array of validation errors for any violated restrictions
 */
export function validateRiteOfWarRestrictions(
  armyList: ArmyList,
  rite: RiteOfWarDefinition,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const restriction of rite.restrictions) {
    const restrictionErrors = validateSingleRestriction(armyList, rite, restriction);
    errors.push(...restrictionErrors);
  }

  return errors;
}

/**
 * Validate a single restriction.
 */
function validateSingleRestriction(
  armyList: ArmyList,
  rite: RiteOfWarDefinition,
  restriction: RiteOfWarRestriction,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  switch (restriction.type) {
    case 'excludeUnit': {
      const excludedUnitId = restriction.restriction.unitProfileId as string | undefined;
      if (excludedUnitId) {
        const allUnits = armyList.detachments.flatMap((d) => d.units);
        const found = allUnits.find((u) => u.profileId === excludedUnitId);
        if (found) {
          errors.push({
            severity: 'error',
            scope: 'unit',
            elementId: found.id,
            message: `Rite of War "${rite.name}" prohibits unit "${excludedUnitId}".`,
          });
        }
      }
      break;
    }

    case 'excludeRole': {
      const excludedRole = restriction.restriction.role as BattlefieldRole | undefined;
      if (excludedRole) {
        const allUnits = armyList.detachments.flatMap((d) => d.units);
        const found = allUnits.filter((u) => u.battlefieldRole === excludedRole);
        for (const unit of found) {
          errors.push({
            severity: 'error',
            scope: 'unit',
            elementId: unit.id,
            message: `Rite of War "${rite.name}" prohibits ${excludedRole} units.`,
          });
        }
      }
      break;
    }

    case 'requireUnit': {
      const requiredUnitId = restriction.restriction.unitProfileId as string | undefined;
      if (requiredUnitId) {
        const allUnits = armyList.detachments.flatMap((d) => d.units);
        const found = allUnits.find((u) => u.profileId === requiredUnitId);
        if (!found) {
          errors.push({
            severity: 'error',
            scope: 'army',
            message: `Rite of War "${rite.name}" requires unit "${requiredUnitId}" to be included.`,
          });
        }
      }
      break;
    }

    case 'requireRole': {
      const requiredRole = restriction.restriction.role as BattlefieldRole | undefined;
      const requiredCount = (restriction.restriction.count as number) || 1;
      if (requiredRole) {
        const allUnits = armyList.detachments.flatMap((d) => d.units);
        const count = allUnits.filter((u) => u.battlefieldRole === requiredRole).length;
        if (count < requiredCount) {
          errors.push({
            severity: 'error',
            scope: 'army',
            message: `Rite of War "${rite.name}" requires at least ${requiredCount} ${requiredRole} unit(s) (found ${count}).`,
          });
        }
      }
      break;
    }

    case 'allegianceRequired': {
      const requiredAllegiance = restriction.restriction.allegiance as Allegiance | null;
      if (requiredAllegiance !== null && armyList.allegiance !== requiredAllegiance) {
        errors.push({
          severity: 'error',
          scope: 'army',
          message: `Rite of War "${rite.name}" requires ${requiredAllegiance} allegiance.`,
        });
      }
      break;
    }

    case 'minimumPoints': {
      const minPoints = restriction.restriction.points as number | undefined;
      if (minPoints && armyList.pointsLimit < minPoints) {
        errors.push({
          severity: 'error',
          scope: 'army',
          message: `Rite of War "${rite.name}" requires at least ${minPoints} points (army limit is ${armyList.pointsLimit}).`,
        });
      }
      break;
    }

    case 'detachmentRestriction': {
      // Detachment restrictions are advisory — validated by description only
      // Specific sub-types (e.g., "Armour slots must be Arquitor Bombards") are
      // validated when the specific unit data is available at a higher level
      break;
    }
  }

  return errors;
}

// ─── Rite Detachment Templates ───────────────────────────────────────────────

/**
 * Get the additional detachment templates provided by a Rite of War.
 *
 * @param rite - The Rite of War definition
 * @returns Array of DetachmentTemplates from the rite
 */
export function getRiteDetachmentTemplates(rite: RiteOfWarDefinition): DetachmentTemplate[] {
  return buildRiteDetachmentTemplates(rite);
}

/**
 * Get additional detachment templates for a rite by its ID.
 *
 * @param riteId - The rite ID
 * @returns Array of DetachmentTemplates, or empty array if rite not found
 */
export function getRiteDetachmentTemplatesById(riteId: string): DetachmentTemplate[] {
  const rite = findRiteOfWar(riteId);
  if (!rite) return [];
  return buildRiteDetachmentTemplates(rite);
}

// ─── Unit Filtering for Rite Restrictions ────────────────────────────────────

/**
 * Filter units to only include those eligible under a Rite of War's restrictions.
 * Used by the army builder UI to show only valid unit choices.
 *
 * @param units - Array of units to filter (by profile IDs and roles)
 * @param rite - The active Rite of War
 * @param slotRole - Optional: only consider restrictions for a specific slot role
 * @returns Filtered array of eligible units
 */
export function filterUnitsForRite(
  units: ArmyListUnit[],
  rite: RiteOfWarDefinition,
  _slotRole?: BattlefieldRole,
): ArmyListUnit[] {
  return units.filter((unit) => {
    for (const restriction of rite.restrictions) {
      if (restriction.type === 'excludeUnit') {
        const excludedUnitId = restriction.restriction.unitProfileId as string | undefined;
        if (excludedUnitId && unit.profileId === excludedUnitId) {
          return false;
        }
      }
      if (restriction.type === 'excludeRole') {
        const excludedRole = restriction.restriction.role as BattlefieldRole | undefined;
        if (excludedRole && unit.battlefieldRole === excludedRole) {
          return false;
        }
      }
    }
    return true;
  });
}
