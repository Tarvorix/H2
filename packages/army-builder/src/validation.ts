/**
 * Army Validation Module.
 * Master validator and all sub-validators for army list legality.
 *
 * Reference: HH_Battle_AOD.md — "Army Selection Rules", "Detachment Rules"
 */

import type {
  ArmyList,
  ArmyListUnit,
  ShatteredLegionsDoctrine,
  ArmyValidationResult,
  ArmyValidationError,
} from '@hh/types';
import {
  BattlefieldRole,
  DetachmentType,
  LegionFaction,
  SpecialFaction,
} from '@hh/types';
import {
  canProfileEmbarkOnTransport,
  findBlackshieldsOath,
  findDetachmentTemplate,
  isProfileCompatibleWithArmyAllegiance,
  isProfileCompatibleWithArmyFaction,
  getProfileById,
  getBlackshieldsOathLimit,
  isProfileAllowedForBlackshields,
  isPlayableFaction,
  isValidShatteredLegion,
  SHATTERED_LEGIONS_MAX_SELECTED,
  SHATTERED_LEGIONS_MIN_SELECTED,
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
 * Validate an army list with faction/doctrine legality checks.
 * Extends core legality checks with:
 * - faction scope restriction (playable factions only)
 * - unit profile existence in the active profile registry
 */
export function validateArmyListWithDoctrine(armyList: ArmyList): ArmyValidationResult {
  const base = validateArmyList(armyList);
  const extraErrors: ArmyValidationError[] = [
    ...validatePlayableFactionScope(armyList),
    ...validateUnitProfilesExist(armyList),
    ...validateProfileTraitRestrictions(armyList),
    ...validateTransportAssignments(armyList),
    ...validateDoctrineConstraints(armyList),
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
    if (allied.faction === armyList.faction && isLegionFactionValue(armyList.faction)) {
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
 * Validate faction scope for currently playable factions.
 */
export function validatePlayableFactionScope(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  if (!isPlayableFaction(armyList.faction)) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Faction "${armyList.faction}" is not currently playable.`,
    });
  }

  for (const detachment of armyList.detachments) {
    if (!isPlayableFaction(detachment.faction)) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Detachment "${detachment.id}" faction "${detachment.faction}" is not currently playable.`,
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

/**
 * Validate fixed faction/allegiance profile traits against the chosen army identity.
 */
export function validateProfileTraitRestrictions(
  armyList: ArmyList,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  for (const detachment of armyList.detachments) {
    for (const unit of detachment.units) {
      const profile = getProfileById(unit.profileId);
      if (!profile) continue;

      if (!isProfileCompatibleWithArmyAllegiance(profile, armyList.allegiance)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message:
            `Unit "${unit.id}" profile "${unit.profileId}" is locked to a different allegiance ` +
            `than army allegiance "${armyList.allegiance}".`,
        });
      }

      if (!isProfileCompatibleWithArmyFaction(profile, detachment.faction)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message:
            `Unit "${unit.id}" profile "${unit.profileId}" is not available to detachment faction ` +
            `"${detachment.faction}".`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate explicit transport assignments against faction, type, and capacity rules.
 */
export function validateTransportAssignments(
  armyList: ArmyList,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];
  const unitContexts = armyList.detachments.flatMap((detachment) =>
    detachment.units.map((unit) => ({
      detachment,
      unit,
      profile: getProfileById(unit.profileId),
    })),
  );
  const unitById = new Map(unitContexts.map((context) => [context.unit.id, context] as const));
  const embarkedUnitIdsByTransport = new Map<string, string[]>();
  const occupiedCapacityByTransport = new Map<string, number>();

  for (const context of unitContexts) {
    const { detachment, unit, profile } = context;
    if (!unit.assignedTransportUnitId) {
      continue;
    }

    const transportContext = unitById.get(unit.assignedTransportUnitId);
    if (!transportContext) {
      errors.push({
        severity: 'error',
        scope: 'unit',
        elementId: unit.id,
        message:
          `Unit "${unit.id}" references unknown assigned transport "${unit.assignedTransportUnitId}".`,
      });
      continue;
    }

    if (transportContext.unit.id === unit.id) {
      errors.push({
        severity: 'error',
        scope: 'unit',
        elementId: unit.id,
        message: `Unit "${unit.id}" cannot assign itself as its own transport.`,
      });
      continue;
    }

    if (!profile || !transportContext.profile) {
      continue;
    }

    const embarkedUnitIds = embarkedUnitIdsByTransport.get(transportContext.unit.id) ?? [];
    const occupiedCapacity = occupiedCapacityByTransport.get(transportContext.unit.id) ?? 0;
    const compatibility = canProfileEmbarkOnTransport({
      passengerProfile: profile,
      passengerModelCount: unit.modelCount,
      passengerFaction: detachment.faction,
      transportProfile: transportContext.profile,
      transportFaction: transportContext.detachment.faction,
      occupiedCapacity,
      embarkedUnitCount: embarkedUnitIds.length,
    });

    if (!compatibility.isCompatible) {
      errors.push({
        severity: 'error',
        scope: 'unit',
        elementId: unit.id,
        message:
          `Unit "${unit.id}" cannot be assigned to transport "${transportContext.unit.id}": ` +
          `${compatibility.reason ?? 'incompatible transport assignment.'}`,
      });
      continue;
    }

    embarkedUnitIds.push(unit.id);
    embarkedUnitIdsByTransport.set(transportContext.unit.id, embarkedUnitIds);
    occupiedCapacityByTransport.set(
      transportContext.unit.id,
      occupiedCapacity + compatibility.requiredCapacity,
    );
  }

  return errors;
}

function isLegionFactionValue(value: unknown): value is LegionFaction {
  return typeof value === 'string' && Object.values(LegionFaction).includes(value as LegionFaction);
}

function collectAllUnits(armyList: ArmyList): ArmyListUnit[] {
  return armyList.detachments.flatMap((detachment) => detachment.units);
}

function validateBlackshieldsDoctrine(
  armyList: ArmyList,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];
  const byDetachmentId = new Map(
    armyList.detachments.map((detachment) => [detachment.id, detachment] as const),
  );

  for (const detachment of armyList.detachments) {
    if (detachment.faction !== SpecialFaction.Blackshields) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Blackshields army includes non-Blackshields detachment "${detachment.id}".`,
      });
      continue;
    }

    const doctrine = detachment.doctrine;
    const oathLimit = getBlackshieldsOathLimit(detachment.type);

    if (oathLimit > 0) {
      if (!doctrine || doctrine.kind !== 'blackshields') {
        errors.push({
          severity: 'error',
          scope: 'detachment',
          elementId: detachment.id,
          message: `Detachment "${detachment.id}" must define Blackshields doctrine with exactly ${oathLimit} oath(s).`,
        });
      } else {
        const oathIds = doctrine.oathIds ?? [];
        if (oathIds.length !== oathLimit) {
          errors.push({
            severity: 'error',
            scope: 'detachment',
            elementId: detachment.id,
            message: `Detachment "${detachment.id}" must select exactly ${oathLimit} oath(s) (selected ${oathIds.length}).`,
          });
        }

        if (new Set(oathIds).size !== oathIds.length) {
          errors.push({
            severity: 'error',
            scope: 'detachment',
            elementId: detachment.id,
            message: `Detachment "${detachment.id}" includes duplicate Blackshields oath selections.`,
          });
        }

        const selectedOaths = oathIds
          .map((oathId) => findBlackshieldsOath(oathId))
          .filter((oath): oath is NonNullable<typeof oath> => oath !== undefined);

        for (const oathId of oathIds) {
          if (!findBlackshieldsOath(oathId)) {
            errors.push({
              severity: 'error',
              scope: 'detachment',
              elementId: detachment.id,
              message: `Detachment "${detachment.id}" selected unknown Blackshields oath "${oathId}".`,
            });
          }
        }

        for (const oath of selectedOaths) {
          if (oath.requiresSelectedLegionForArmoury && !doctrine.selectedLegionForArmoury) {
            errors.push({
              severity: 'error',
              scope: 'detachment',
              elementId: detachment.id,
              message: `Detachment "${detachment.id}" must select a legion for armoury access because "${oath.name}" is active.`,
            });
          }

          for (const incompatible of oath.incompatibleWith ?? []) {
            if (oathIds.includes(incompatible)) {
              const incompatibleOath = findBlackshieldsOath(incompatible);
              errors.push({
                severity: 'error',
                scope: 'detachment',
                elementId: detachment.id,
                message: `Detachment "${detachment.id}" cannot combine "${oath.name}" with "${incompatibleOath?.name ?? incompatible}".`,
              });
            }
          }
        }
      }
    }

    if (detachment.type === DetachmentType.Auxiliary || detachment.type === DetachmentType.Apex) {
      if (!detachment.parentDetachmentId) {
        errors.push({
          severity: 'error',
          scope: 'detachment',
          elementId: detachment.id,
          message: `Blackshields ${detachment.type} detachment "${detachment.id}" must link to a parent detachment.`,
        });
      } else {
        const parent = byDetachmentId.get(detachment.parentDetachmentId);
        if (!parent) {
          errors.push({
            severity: 'error',
            scope: 'detachment',
            elementId: detachment.id,
            message: `Blackshields detachment "${detachment.id}" references unknown parent detachment "${detachment.parentDetachmentId}".`,
          });
        } else if (parent.faction !== SpecialFaction.Blackshields) {
          errors.push({
            severity: 'error',
            scope: 'detachment',
            elementId: detachment.id,
            message: `Blackshields detachment "${detachment.id}" parent "${parent.id}" must also be Blackshields.`,
          });
        } else if (parent.doctrine?.kind === 'blackshields' && detachment.doctrine?.kind === 'blackshields') {
          const parentOaths = parent.doctrine.oathIds ?? [];
          const childOaths = detachment.doctrine.oathIds ?? [];
          if (JSON.stringify(parentOaths) !== JSON.stringify(childOaths)) {
            errors.push({
              severity: 'error',
              scope: 'detachment',
              elementId: detachment.id,
              message: `Blackshields detachment "${detachment.id}" must inherit parent oath selection from "${parent.id}".`,
            });
          }
        }
      }
    }

    for (const unit of detachment.units) {
      const profile = getProfileById(unit.profileId);
      if (!profile) continue;
      if (!isProfileAllowedForBlackshields(profile)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Unit "${unit.id}" uses legion-specific profile "${unit.profileId}" which is not allowed in Blackshields detachments.`,
        });
      }
    }
  }

  return errors;
}

function inferUnitLegionFromProfile(unit: ArmyListUnit): LegionFaction | undefined {
  if (unit.originLegion) return unit.originLegion;
  const profile = getProfileById(unit.profileId);
  if (!profile) return undefined;
  const factionTraits = profile.traits
    .filter((trait) => trait.category === 'Faction')
    .map((trait) => trait.value)
    .filter(isLegionFactionValue);

  if (factionTraits.length === 1) {
    return factionTraits[0];
  }
  return undefined;
}

function validateShatteredLegionsDoctrine(
  armyList: ArmyList,
  doctrine: ShatteredLegionsDoctrine,
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];
  const selectedLegions = doctrine.selectedLegions ?? [];
  const uniqueSelected = new Set(selectedLegions);

  if (
    selectedLegions.length < SHATTERED_LEGIONS_MIN_SELECTED ||
    selectedLegions.length > SHATTERED_LEGIONS_MAX_SELECTED
  ) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message:
        `Shattered Legions must select exactly ${SHATTERED_LEGIONS_MIN_SELECTED} or ` +
        `${SHATTERED_LEGIONS_MAX_SELECTED} legions (selected ${selectedLegions.length}).`,
    });
  }

  if (uniqueSelected.size !== selectedLegions.length) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: 'Shattered Legions selectedLegions cannot contain duplicates.',
    });
  }

  for (const legion of selectedLegions) {
    if (!isValidShatteredLegion(legion)) {
      errors.push({
        severity: 'error',
        scope: 'army',
        message: `Shattered Legions selectedLegions contains invalid legion "${legion}".`,
      });
    }
  }

  for (const detachment of armyList.detachments) {
    if (detachment.faction !== SpecialFaction.ShatteredLegions) {
      errors.push({
        severity: 'error',
        scope: 'detachment',
        elementId: detachment.id,
        message: `Shattered Legions army includes non-Shattered detachment "${detachment.id}".`,
      });
      continue;
    }

    for (const unit of detachment.units) {
      const lineage = inferUnitLegionFromProfile(unit);
      if (!lineage) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Unit "${unit.id}" must declare originLegion (or use a uniquely legion-tagged profile) in Shattered Legions armies.`,
        });
        continue;
      }

      if (!uniqueSelected.has(lineage)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Unit "${unit.id}" origin legion "${lineage}" is not in the selected Shattered Legions set.`,
        });
      }
    }
  }

  if (doctrine.exemplarLegionByPrimeUnitId) {
    const allUnits = collectAllUnits(armyList);
    for (const [primeUnitId, legion] of Object.entries(doctrine.exemplarLegionByPrimeUnitId)) {
      const unit = allUnits.find((candidate) => candidate.id === primeUnitId);
      if (!unit) {
        errors.push({
          severity: 'error',
          scope: 'army',
          message: `Shattered Legions exemplar map references unknown prime unit "${primeUnitId}".`,
        });
        continue;
      }
      if (unit.battlefieldRole !== BattlefieldRole.Command) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Shattered Legions exemplar unit "${unit.id}" must be a Command Battlefield Role unit.`,
        });
      }
      if (!uniqueSelected.has(legion)) {
        errors.push({
          severity: 'error',
          scope: 'unit',
          elementId: unit.id,
          message: `Shattered Legions exemplar unit "${unit.id}" references non-selected legion "${legion}".`,
        });
      }
    }
  }

  return errors;
}

/**
 * Validate faction doctrine payload and doctrine-dependent composition rules.
 */
export function validateDoctrineConstraints(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  if (
    armyList.faction === SpecialFaction.Blackshields &&
    armyList.doctrine &&
    armyList.doctrine.kind !== 'blackshields'
  ) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: 'Blackshields armies must use Blackshields doctrine payloads.',
    });
  }

  if (
    armyList.faction === SpecialFaction.ShatteredLegions &&
    (!armyList.doctrine || armyList.doctrine.kind !== 'shatteredLegions')
  ) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: 'Shattered Legions armies must define a Shattered Legions doctrine payload.',
    });
  }

  if (armyList.faction === SpecialFaction.Blackshields) {
    errors.push(...validateBlackshieldsDoctrine(armyList));
  }

  if (
    armyList.faction === SpecialFaction.ShatteredLegions &&
    armyList.doctrine?.kind === 'shatteredLegions'
  ) {
    errors.push(...validateShatteredLegionsDoctrine(armyList, armyList.doctrine));
  }

  return errors;
}
