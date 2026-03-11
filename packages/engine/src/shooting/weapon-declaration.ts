/**
 * Weapon Declaration — Shooting Pipeline Step 3
 * Reference: HH_Rules_Battle.md — Step 3: Declare Weapons
 * Reference: HH_Principles.md — Snap Shots, Heavy Weapons, Tactical Statuses
 *
 * Each model in the attacking unit selects ONE ranged weapon to fire.
 * Validates weapon is in range of the target, model has LOS to target,
 * and determines if model must fire as snap shots.
 *
 * Snap Shot determination:
 * - Heavy weapon type AND unit moved (movementState !== Stationary) -> snap shots
 * - Unit has Pinned status -> snap shots
 * - Unit has Suppressed status -> snap shots
 * - Defensive weapon firing from vehicle that moved -> snap shots (unless Stationary)
 */

import type {
  UnitState,
  SpecialRuleRef,
  RangedWeaponProfile,
  DedicatedWeapon,
  RangedWeaponInline,
  GameState,
} from '@hh/types';
import { UnitMovementState, TacticalStatus } from '@hh/types';
import { findWeapon, findLegionWeapon, isRangedWeapon } from '@hh/data';
import type { ValidationError } from '../types';
import type { WeaponAssignment, ResolvedWeaponProfile } from './shooting-types';
import { resolveWeaponFromData } from './shooting-types';
import { lookupUnitProfile } from '../profile-lookup';
import { getModelPsychicRangedWeapon, getPsychicWeaponStrengthModifier } from '../psychic/psychic-runtime';

// ─── Validation Result ──────────────────────────────────────────────────────

/**
 * Result of validating weapon assignments for a shooting attack.
 */
export interface WeaponAssignmentValidationResult {
  /** Whether all assignments are valid */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: ValidationError[];
}

// ─── Snap Shot Determination ────────────────────────────────────────────────

/**
 * Check if a trait string array contains a given trait (case-insensitive).
 *
 * @param traits - Array of trait strings on the weapon
 * @param traitName - Trait to search for
 * @returns true if the trait is found
 */
function hasTrait(traits: string[], traitName: string): boolean {
  const lower = traitName.toLowerCase();
  return traits.some((t) => t.toLowerCase() === lower);
}

/**
 * Check if a special rule is present by name (case-insensitive).
 *
 * @param specialRules - Array of special rule references
 * @param ruleName - Name to search for
 * @returns true if the rule is found
 */
function hasSpecialRule(specialRules: SpecialRuleRef[], ruleName: string): boolean {
  return specialRules.some(
    (r) => r.name.toLowerCase() === ruleName.toLowerCase(),
  );
}

/**
 * Determine if a specific model's attack should be snap shots.
 *
 * Reference: HH_Rules_Battle.md — Snap Shots
 * Reference: HH_Principles.md — Tactical Statuses
 *
 * A model fires as snap shots if:
 * 1. The weapon has the "Heavy" trait and the unit has moved
 *    (movementState is not Stationary)
 * 2. The unit has the Pinned tactical status
 * 3. The unit has the Suppressed tactical status
 * 4. The weapon has the "Defensive" trait and the unit (vehicle) has moved
 *    (movementState is not Stationary)
 *
 * @param unit - The unit state containing the model
 * @param weaponProfile - The resolved weapon profile being fired
 * @returns true if the attack must be snap shots
 */
export function determineSnapShots(
  unit: UnitState,
  weaponProfile: ResolvedWeaponProfile,
  forceSnapShots: boolean = false,   // Legion tactica forces snap shots (e.g., Raven Guard at 18"+)
  countsAsStationary: boolean = false, // Legion tactica treats unit as stationary (e.g., Death Guard heavy after ≤4" move)
  forceNoSnapShots: boolean = false, // Reaction shots like Overwatch fire at full BS regardless of normal snap-shot gates
): boolean {
  if (forceNoSnapShots) {
    return false;
  }

  // Legion tactica: force snap shots regardless of other conditions
  if (forceSnapShots) {
    return true;
  }

  // Check unit-level snap shot conditions first

  // Pinned status forces all shooting to snap shots
  if (unit.statuses.includes(TacticalStatus.Pinned)) {
    return true;
  }

  // Suppressed status forces all shooting to snap shots
  if (unit.statuses.includes(TacticalStatus.Suppressed)) {
    return true;
  }

  // Check weapon-specific snap shot conditions

  const isStationary = unit.movementState === UnitMovementState.Stationary || countsAsStationary;

  // Heavy weapon and unit has moved -> snap shots
  if (!isStationary && isHeavyWeapon(weaponProfile)) {
    return true;
  }

  // Defensive weapon firing from vehicle that moved -> snap shots
  if (!isStationary && isDefensiveWeapon(weaponProfile)) {
    return true;
  }

  return false;
}

/**
 * Check if a weapon profile is a Heavy weapon (has "Heavy" trait).
 *
 * @param weaponProfile - The resolved weapon profile
 * @returns true if the weapon has the Heavy trait
 */
function isHeavyWeapon(weaponProfile: ResolvedWeaponProfile): boolean {
  // Check traits for "Heavy"
  if (hasTrait(weaponProfile.traits, 'Heavy')) {
    return true;
  }

  // Also check special rules for "Heavy" (some weapons have Heavy(FP) or Heavy(RS) as special rule)
  if (hasSpecialRule(weaponProfile.specialRules, 'Heavy')) {
    return true;
  }

  return false;
}

/**
 * Check if a weapon profile is a Defensive weapon (has "Defensive" trait or special rule).
 *
 * @param weaponProfile - The resolved weapon profile
 * @returns true if the weapon has the Defensive designation
 */
function isDefensiveWeapon(weaponProfile: ResolvedWeaponProfile): boolean {
  if (hasTrait(weaponProfile.traits, 'Defensive')) {
    return true;
  }

  if (hasSpecialRule(weaponProfile.specialRules, 'Defensive')) {
    return true;
  }

  return false;
}

// ─── Weapon Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a weapon assignment to a full ResolvedWeaponProfile.
 * Looks up weapon from @hh/data package and converts to ResolvedWeaponProfile.
 *
 * @param assignment - The weapon assignment with weapon ID
 * @returns The resolved weapon profile, or undefined if weapon not found or not ranged
 */
export function resolveWeaponAssignment(
  assignment: WeaponAssignment,
  attackerUnit?: UnitState,
  state?: GameState,
): ResolvedWeaponProfile | undefined {
  const normalizedWeaponId = normalizeLegacyWeaponId(assignment.weaponId);
  const weapon = findWeapon(normalizedWeaponId) ?? findLegionWeapon(normalizedWeaponId);

  if (weapon && isRangedWeapon(weapon)) {
    return resolveWeaponFromData(weapon as RangedWeaponProfile);
  }

  const dedicated = attackerUnit
    ? resolveDedicatedRangedWeapon(attackerUnit, normalizedWeaponId)
    : undefined;
  if (dedicated) {
    return resolveWeaponFromData(dedicated);
  }

  if (attackerUnit) {
    const model = attackerUnit.models.find((entry) => entry.id === assignment.modelId);
    if (model) {
      const psychicWeapon = getModelPsychicRangedWeapon(model, normalizedWeaponId);
      if (psychicWeapon) {
        return resolveWeaponFromData({
          ...psychicWeapon,
          rangedStrength: Math.max(
            1,
            psychicWeapon.rangedStrength + (state ? getPsychicWeaponStrengthModifier(state, attackerUnit.id) : 0),
          ),
        });
      }
    }
  }

  return undefined;
}

function normalizeLegacyWeaponId(weaponId: string): string {
  const normalized = normalizeWeaponToken(weaponId);

  // Local fixtures and parsed prose sometimes use the common synonym "boltgun"
  // while the rules/data registry keys the weapon as "bolter".
  if (normalized === 'boltgun') {
    return 'bolter';
  }

  return weaponId;
}

function resolveDedicatedRangedWeapon(
  attackerUnit: UnitState,
  weaponId: string,
): RangedWeaponProfile | undefined {
  const profile = lookupUnitProfile(attackerUnit.profileId);
  if (!profile?.dedicatedWeapons || profile.dedicatedWeapons.length === 0) {
    return undefined;
  }

  const normalizedRequested = normalizeWeaponToken(weaponId);

  for (const dedicated of profile.dedicatedWeapons) {
    if (dedicated.category !== 'ranged') continue;
    if (!matchesDedicatedWeapon(dedicated, normalizedRequested)) continue;
    if (!isRangedInlineProfile(dedicated.profile)) continue;

    return {
      id: dedicated.id,
      name: dedicated.name,
      range: dedicated.profile.range,
      hasTemplate: dedicated.profile.hasTemplate,
      firepower: dedicated.profile.firepower,
      rangedStrength: dedicated.profile.rangedStrength,
      ap: dedicated.profile.ap,
      damage: dedicated.profile.damage,
      specialRules: dedicated.profile.specialRules,
      traits: [...dedicated.profile.traits] as RangedWeaponProfile['traits'],
      rangeBand: dedicated.profile.rangeBand,
    };
  }

  return undefined;
}

function matchesDedicatedWeapon(dedicated: DedicatedWeapon, normalizedRequested: string): boolean {
  const normalizedDedicatedId = normalizeWeaponToken(dedicated.id);
  const normalizedDedicatedName = normalizeWeaponToken(dedicated.name);

  return (
    normalizedDedicatedId === normalizedRequested ||
    normalizedDedicatedId.endsWith(`-${normalizedRequested}`) ||
    normalizedDedicatedName === normalizedRequested
  );
}

function normalizeWeaponToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRangedInlineProfile(profile: DedicatedWeapon['profile']): profile is RangedWeaponInline {
  return 'range' in profile && 'rangedStrength' in profile;
}

// ─── Weapon Assignment Validation ───────────────────────────────────────────

/**
 * Validate a set of weapon assignments for a shooting attack.
 *
 * Checks for each assignment:
 * 1. The weapon ID resolves to a valid ranged weapon
 * 2. The model exists in the attacking unit and is alive
 * 3. The model has LOS to the target (is in modelsWithLOS list)
 * 4. The weapon is in range of the target (unless template weapon)
 * 5. No duplicate model IDs (each model fires one weapon)
 *
 * @param assignments - Array of weapon assignments (model -> weapon)
 * @param attackerUnit - The attacking unit's state
 * @param modelsWithLOS - IDs of models that have LOS to the target
 * @param targetDistance - Distance to target in inches (closest model-to-model)
 * @returns Validation result with valid flag and any errors
 */
export function validateWeaponAssignments(
  assignments: WeaponAssignment[],
  attackerUnit: UnitState,
  modelsWithLOS: string[],
  targetDistance: number,
): WeaponAssignmentValidationResult {
  const errors: ValidationError[] = [];

  // Check for empty assignments
  if (assignments.length === 0) {
    errors.push({
      code: 'NO_WEAPON_ASSIGNMENTS',
      message: 'At least one weapon assignment is required for a shooting attack',
    });
    return { valid: false, errors };
  }

  // Check for duplicate model IDs (each model can only fire one weapon)
  const modelIdsSeen = new Set<string>();
  for (const assignment of assignments) {
    if (modelIdsSeen.has(assignment.modelId)) {
      errors.push({
        code: 'DUPLICATE_MODEL_ASSIGNMENT',
        message: `Model '${assignment.modelId}' has multiple weapon assignments — each model may fire only one weapon`,
        context: { modelId: assignment.modelId },
      });
    }
    modelIdsSeen.add(assignment.modelId);
  }

  // Validate each assignment
  for (const assignment of assignments) {
    // Check the model exists in the unit and is alive
    const model = attackerUnit.models.find((m) => m.id === assignment.modelId);
    if (!model) {
      errors.push({
        code: 'MODEL_NOT_IN_UNIT',
        message: `Model '${assignment.modelId}' is not a member of attacking unit '${attackerUnit.id}'`,
        context: { modelId: assignment.modelId, unitId: attackerUnit.id },
      });
      continue;
    }

    if (model.isDestroyed) {
      errors.push({
        code: 'MODEL_DESTROYED',
        message: `Model '${assignment.modelId}' has been destroyed and cannot fire`,
        context: { modelId: assignment.modelId },
      });
      continue;
    }

    // Check model has LOS to target
    if (!modelsWithLOS.includes(assignment.modelId)) {
      errors.push({
        code: 'MODEL_NO_LOS',
        message: `Model '${assignment.modelId}' does not have line of sight to the target`,
        context: { modelId: assignment.modelId },
      });
      continue;
    }

    // Resolve the weapon
    const weaponProfile = resolveWeaponAssignment(assignment, attackerUnit);
    if (!weaponProfile) {
      errors.push({
        code: 'INVALID_WEAPON',
        message: `Weapon '${assignment.weaponId}' is not a valid ranged weapon`,
        context: { weaponId: assignment.weaponId, modelId: assignment.modelId },
      });
      continue;
    }

    // Check weapon range (template weapons don't need range check — they auto-hit)
    if (!weaponProfile.hasTemplate) {
      if (targetDistance > weaponProfile.range) {
        errors.push({
          code: 'WEAPON_OUT_OF_RANGE',
          message: `Weapon '${weaponProfile.name}' (range ${weaponProfile.range}") cannot reach target at ${targetDistance}"`,
          context: {
            weaponId: assignment.weaponId,
            weaponName: weaponProfile.name,
            weaponRange: weaponProfile.range,
            targetDistance,
            modelId: assignment.modelId,
          },
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
