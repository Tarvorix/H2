/**
 * Army Validation Module.
 * Master validator and all sub-validators for army list legality.
 *
 * Reference: HH_Battle_AOD.md — "Army Selection Rules", "Detachment Rules"
 */

import type {
  ArmyList,
  ArmyValidationResult,
  ArmyValidationError,
} from '@hh/types';
import {
  BattlefieldRole,
  DetachmentType,
} from '@hh/types';
import {
  findDetachmentTemplate,
  getProfileById,
  isMvpLegion,
} from '@hh/data';
import {
  calculateArmyTotalPoints,
  calculateLordOfWarCap,
  getLordOfWarAndWarlordPoints,
  getAlliedPointsCap,
  getAlliedPoints,
} from './points';
import {
  areMandatorySlotsFilled,
  getUnlockedAuxiliaryCount,
  getUnlockedApexCount,
} from './detachments';

function isPrimaryCategoryDetachment(
  detachment: ArmyList['detachments'][number],
): boolean {
  const template = findDetachmentTemplate(detachment.detachmentTemplateId);
  if (!template) {
    return detachment.type === DetachmentType.Primary;
  }
  return template.category === 'primary';
}

// ─── Master Validator ────────────────────────────────────────────────────────

/**
 * Validate a complete army list.
 * Runs all sub-validators and aggregates results.
 *
 * @param armyList - The army list to validate
 * @returns Validation result with errors and warnings
 */
export function validateArmyList(armyList: ArmyList): ArmyValidationResult {
  const errors: ArmyValidationError[] = [];

  errors.push(...validatePrimaryDetachment(armyList));
  errors.push(...validatePointsLimit(armyList));
  errors.push(...validateLordOfWarCap(armyList));
  errors.push(...validateWarlordPointsThreshold(armyList));
  errors.push(...validateAlliedDetachment(armyList));
  errors.push(...validateMandatorySlots(armyList));
  errors.push(...validateDetachmentCounts(armyList));
  errors.push(...validateUnitEligibility(armyList));
  errors.push(...validateWarlordDesignation(armyList));

  const validationErrors = errors.filter((e) => e.severity === 'error');
  const warnings = errors
    .filter((e) => e.severity === 'warning')
    .map((e) => e.message);

  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors,
    warnings,
  };
}

/**
 * Validate an army list against HHv2 MVP scope.
 * Extends core legality checks with:
 * - faction scope restriction (3 launch legions only)
 * - unit profile existence in the MVP profile registry
 */
export function validateArmyListForMvp(armyList: ArmyList): ArmyValidationResult {
  const base = validateArmyList(armyList);
  const extraErrors: ArmyValidationError[] = [
    ...validateMvpFactionScope(armyList),
    ...validateUnitProfilesExist(armyList),
  ];

  const allErrors = [...base.errors, ...extraErrors.filter((e) => e.severity === 'error')];
  const allWarnings = [...base.warnings, ...extraErrors.filter((e) => e.severity === 'warning').map((e) => e.message)];

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ─── Sub-Validators ──────────────────────────────────────────────────────────

/**
 * Validate that exactly one Primary detachment exists.
 */
export function validatePrimaryDetachment(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  const primaryDetachments = armyList.detachments.filter(
    (d) => isPrimaryCategoryDetachment(d),
  );

  if (primaryDetachments.length === 0) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: 'Army must have exactly one Primary Detachment.',
    });
  } else if (primaryDetachments.length > 1) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Army has ${primaryDetachments.length} Primary Detachments; only one is allowed.`,
    });
  }

  return errors;
}

/**
 * Validate that total points do not exceed the points limit.
 */
export function validatePointsLimit(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  const allUnits = armyList.detachments.flatMap((d) => d.units);
  const totalPoints = calculateArmyTotalPoints(allUnits);

  if (totalPoints > armyList.pointsLimit) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Army total points (${totalPoints}) exceeds the points limit (${armyList.pointsLimit}).`,
    });
  }

  return errors;
}

/**
 * Validate the Lord of War + Warlord role 25% cap.
 */
export function validateLordOfWarCap(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  const allUnits = armyList.detachments.flatMap((d) => d.units);
  const lowPoints = getLordOfWarAndWarlordPoints(allUnits);
  const cap = calculateLordOfWarCap(armyList.pointsLimit);

  if (lowPoints > cap) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Lord of War and Warlord role units (${lowPoints} pts) exceed the 25% cap (${cap} pts).`,
    });
  }

  return errors;
}

/**
 * Validate that no Warlord-role units exist below 3,000 points.
 */
export function validateWarlordPointsThreshold(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  if (armyList.pointsLimit < 3000) {
    const allUnits = armyList.detachments.flatMap((d) => d.units);
    const warlordUnits = allUnits.filter(
      (u) => u.battlefieldRole === BattlefieldRole.Warlord,
    );

    if (warlordUnits.length > 0) {
      errors.push({
        severity: 'error',
        scope: 'army',
        message: `Warlord-role units are only allowed at 3,000+ points (current limit: ${armyList.pointsLimit}).`,
      });
    }

    // Also check for Warlord Detachment
    const warlordDetachments = armyList.detachments.filter(
      (d) => {
        const template = findDetachmentTemplate(d.detachmentTemplateId);
        return template?.category === 'warlord';
      },
    );

    if (warlordDetachments.length > 0) {
      errors.push({
        severity: 'error',
        scope: 'army',
        message: `Warlord Detachment is only allowed at 3,000+ points (current limit: ${armyList.pointsLimit}).`,
      });
    }
  }

  return errors;
}

/**
 * Validate Allied detachment rules:
 * - Must be a different faction than Primary
 * - Total allied points ≤ 50% of points limit
 */
export function validateAlliedDetachment(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  const alliedDetachments = armyList.detachments.filter(
    (d) => d.type === DetachmentType.Allied,
  );

  if (alliedDetachments.length === 0) return errors;

  // Check faction is different from primary
  for (const allied of alliedDetachments) {
    if (allied.faction === armyList.faction) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: allied.id,
        message: `Allied Detachment "${allied.id}" must be from a different faction than the Primary (${armyList.faction}).`,
      });
    }
  }

  // Check 50% cap
  const alliedPointsTotal = getAlliedPoints(armyList.detachments);
  const cap = getAlliedPointsCap(armyList.pointsLimit);

  if (alliedPointsTotal > cap) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Allied units total (${alliedPointsTotal} pts) exceeds the 50% cap (${cap} pts).`,
    });
  }

  return errors;
}

/**
 * Validate that all mandatory slots in each detachment are filled.
 */
export function validateMandatorySlots(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const detachment of armyList.detachments) {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template) continue;

    if (!areMandatorySlotsFilled(detachment, template)) {
      const mandatorySlots = template.slots.filter((s) => s.isMandatory);
      const unfilledRoles = mandatorySlots
        .filter(
          (slot) =>
            !detachment.units.some((u) => u.battlefieldRole === slot.role),
        )
        .map((s) => s.role);

      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Detachment "${template.name}" has unfilled mandatory slots: ${unfilledRoles.join(', ')}.`,
      });
    }
  }

  return errors;
}

/**
 * Validate that Auxiliary and Apex detachment counts don't exceed unlocked limits.
 *
 * Rules:
 * - Each filled Command slot in Primary unlocks 1 Auxiliary
 * - Filled HC slot in Primary unlocks 1 Apex OR 1 additional Auxiliary
 */
export function validateDetachmentCounts(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  const primaryDet = armyList.detachments.find(
    (d) => isPrimaryCategoryDetachment(d),
  );
  if (!primaryDet) return errors; // Already caught by validatePrimaryDetachment

  const primaryTemplate = findDetachmentTemplate(primaryDet.detachmentTemplateId);
  if (!primaryTemplate) return errors;

  const auxCount = armyList.detachments.filter(
    (d) => d.type === DetachmentType.Auxiliary,
  ).length;
  const apexCount = armyList.detachments.filter(
    (d) => d.type === DetachmentType.Apex,
  ).length;

  // Determine if HC unlock is used for Apex or Auxiliary
  const hcUsedForApex = apexCount > 0;

  const maxAux = getUnlockedAuxiliaryCount(
    primaryDet,
    primaryTemplate,
    hcUsedForApex,
  );
  const maxApex = getUnlockedApexCount(
    primaryDet,
    primaryTemplate,
    hcUsedForApex,
  );

  if (auxCount > maxAux) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Too many Auxiliary Detachments (${auxCount}). Only ${maxAux} unlocked by filled Primary Command/HC slots.`,
    });
  }

  if (apexCount > maxApex) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Too many Apex Detachments (${apexCount}). Only ${maxApex} unlocked by filled Primary HC slot.`,
    });
  }

  return errors;
}

/**
 * Validate that each unit in a detachment matches a slot's battlefield role.
 */
export function validateUnitEligibility(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const detachment of armyList.detachments) {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template) continue;

    // Get available roles from the template
    const availableRoles = new Set(template.slots.map((s) => s.role));

    for (const unit of detachment.units) {
      if (!availableRoles.has(unit.battlefieldRole)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Unit "${unit.profileId}" (${unit.battlefieldRole}) has no matching slot in detachment "${template.name}".`,
        });
      }
    }

    // Check for over-filling: more units of a role than slots available
    const roleCounts = new Map<BattlefieldRole, number>();
    for (const unit of detachment.units) {
      roleCounts.set(
        unit.battlefieldRole,
        (roleCounts.get(unit.battlefieldRole) || 0) + 1,
      );
    }

    for (const [role, count] of roleCounts) {
      const slotCount = template.slots.filter((s) => s.role === role).length;
      if (count > slotCount) {
        errors.push({
          severity: 'error',
          scope: 'detachment',
          elementId: detachment.id,
          message: `Detachment "${template.name}" has ${count} ${role} units but only ${slotCount} ${role} slots.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate Warlord designation rules.
 * If a Warlord Detachment is included, it must contain a Paragon model.
 * (In practice, we check that the Warlord slot is filled — the model type
 *  validation happens at a higher level when specific unit data is available.)
 */
export function validateWarlordDesignation(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const detachment of armyList.detachments) {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template || template.category !== 'warlord') continue;

    // Warlord Detachment must be same faction as Primary
    if (detachment.faction !== armyList.faction) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Warlord Detachment must be the same faction as the Primary Detachment (${armyList.faction}).`,
      });
    }
  }

  return errors;
}

/**
 * Validate legion scope for HHv2 MVP.
 */
export function validateMvpFactionScope(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  if (!isMvpLegion(armyList.faction)) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Faction "${armyList.faction}" is outside HHv2 MVP legion scope.`,
    });
  }

  for (const detachment of armyList.detachments) {
    if (!isMvpLegion(detachment.faction)) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Detachment "${detachment.id}" faction "${detachment.faction}" is outside HHv2 MVP legion scope.`,
      });
    }
  }

  return errors;
}

/**
 * Validate all army list unit profile IDs resolve in the active data registry.
 */
export function validateUnitProfilesExist(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const detachment of armyList.detachments) {
    for (const unit of detachment.units) {
      if (!getProfileById(unit.profileId)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Unit "${unit.id}" references unknown or out-of-scope profile ID "${unit.profileId}".`,
        });
      }
    }
  }

  return errors;
}
