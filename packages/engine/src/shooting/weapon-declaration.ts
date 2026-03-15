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
  ModelState,
  SpecialRuleRef,
  RangedWeaponProfile,
  DedicatedWeapon,
  RangedWeaponInline,
  GameState,
} from '@hh/types';
import { UnitMovementState, TacticalStatus } from '@hh/types';
import { ALL_LEGION_WEAPONS, ALL_WEAPONS, findWeapon, findLegionWeapon, isRangedWeapon } from '@hh/data';
import type { ValidationError } from '../types';
import type { WeaponAssignment, ResolvedWeaponProfile } from './shooting-types';
import { resolveWeaponFromData } from './shooting-types';
import { lookupModelDefinition, lookupUnitProfile } from '../profile-lookup';
import { getModelPsychicRangedWeapon, getPsychicWeaponStrengthModifier } from '../psychic/psychic-runtime';
import { checkWeaponRange } from './shooting-validator';

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

export interface WeaponSelectionOption {
  assignment: WeaponAssignment;
  weaponProfile: ResolvedWeaponProfile;
  displayName: string;
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
  targetIsFlyer: boolean = false,
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

  // Weapons without Skyfire must fire Snap Shots when targeting Flyers.
  if (targetIsFlyer && !hasSpecialRule(weaponProfile.specialRules, 'Skyfire')) {
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
  targetDistance?: number,
): ResolvedWeaponProfile | undefined {
  const options = getWeaponSelectionOptions(assignment, attackerUnit, state, targetDistance);
  if (options.length !== 1) {
    return undefined;
  }

  return options[0].weaponProfile;
}

export function getWeaponSelectionOptions(
  assignment: WeaponAssignment,
  attackerUnit?: UnitState,
  state?: GameState,
  targetDistance?: number,
): WeaponSelectionOption[] {
  const normalizedWeapon = normalizeLegacyWeaponId(assignment.weaponId);
  const directWeapon = normalizedWeapon.candidateIds
    .map((candidateId) => findWeapon(candidateId) ?? findLegionWeapon(candidateId))
    .find((candidate): candidate is RangedWeaponProfile => candidate !== undefined && isRangedWeapon(candidate));

  if (directWeapon) {
    return [
      buildSelectionOption(
        assignment,
        directWeapon,
        normalizedWeapon.firepowerMultiplier,
        deriveProfileNameFromWeapon(directWeapon),
      ),
    ];
  }

  const dedicated = attackerUnit
    ? resolveDedicatedRangedWeapon(attackerUnit, normalizedWeapon.candidateIds[0] ?? assignment.weaponId)
    : undefined;
  if (dedicated) {
    return [
      buildSelectionOption(
        assignment,
        dedicated,
        normalizedWeapon.firepowerMultiplier,
        deriveProfileNameFromWeapon(dedicated),
      ),
    ];
  }

  if (attackerUnit) {
    const model = attackerUnit.models.find((entry) => entry.id === assignment.modelId);
    if (model) {
      const psychicWeapon = getModelPsychicRangedWeapon(
        model,
        normalizedWeapon.candidateIds[0] ?? assignment.weaponId,
      );
      if (psychicWeapon) {
        return [
          buildSelectionOption(
            assignment,
            {
              ...psychicWeapon,
              rangedStrength: Math.max(
                1,
                psychicWeapon.rangedStrength + (state ? getPsychicWeaponStrengthModifier(state, attackerUnit.id) : 0),
              ),
            },
            normalizedWeapon.firepowerMultiplier,
            deriveProfileNameFromWeapon(psychicWeapon),
          ),
        ];
      }
    }
  }

  const variantWeapons = getParentVariantWeapons(normalizedWeapon.candidateIds);
  if (variantWeapons.length === 0) {
    return [];
  }

  const requestedProfileName = assignment.profileName;
  const targetDistanceMatches = variantWeapons.filter((weapon) =>
    targetDistance === undefined || !weapon.rangeBand || isTargetDistanceWithinRangeBand(targetDistance, weapon.rangeBand),
  );
  const profileMatches = (requestedProfileName
    ? targetDistanceMatches.filter((weapon) => weaponMatchesProfileName(weapon, requestedProfileName))
    : targetDistanceMatches
  );

  return profileMatches.map((weapon) =>
    buildSelectionOption(
      assignment,
      weapon,
      normalizedWeapon.firepowerMultiplier,
      deriveProfileNameFromWeapon(weapon),
    ),
  );
}

function buildSelectionOption(
  assignment: WeaponAssignment,
  weapon: RangedWeaponProfile,
  firepowerMultiplier: number,
  derivedProfileName?: string,
): WeaponSelectionOption {
  const profileName = assignment.profileName ?? derivedProfileName;
  const weaponProfile = applyLegacyWeaponMultiplier(
    resolveWeaponFromData(weapon),
    firepowerMultiplier,
  );
  const normalizedProfileName = profileName ? normalizeWeaponToken(profileName) : null;
  const weaponNameAlreadyIncludesProfile = normalizedProfileName
    ? normalizeWeaponToken(weaponProfile.name).endsWith(`-${normalizedProfileName}`)
    : false;

  return {
    assignment: {
      ...assignment,
      profileName,
    },
    weaponProfile,
    displayName: profileName && !weaponNameAlreadyIncludesProfile
      ? `${weaponProfile.name} (${profileName})`
      : weaponProfile.name,
  };
}

function getParentVariantWeapons(candidateIds: string[]): RangedWeaponProfile[] {
  const normalizedCandidates = new Set(candidateIds.map((candidate) => normalizeWeaponToken(candidate)));

  return [...Object.values(ALL_WEAPONS), ...ALL_LEGION_WEAPONS]
    .filter((weapon): weapon is RangedWeaponProfile => isRangedWeapon(weapon))
    .filter((weapon) => weapon.parentWeaponId && normalizedCandidates.has(normalizeWeaponToken(weapon.parentWeaponId)));
}

function deriveProfileNameFromWeapon(
  weapon: Pick<RangedWeaponProfile, 'id' | 'name'> & Partial<Pick<RangedWeaponProfile, 'parentWeaponId' | 'rangeBand'>>,
): string | undefined {
  const parentWeaponId = weapon.parentWeaponId;
  if (!parentWeaponId) {
    return weapon.rangeBand ? deriveRangeBandProfileName(weapon.rangeBand) : undefined;
  }

  const nameSegments = weapon.name.split(/\s+[—-]\s+/);
  if (nameSegments.length > 1) {
    return nameSegments[nameSegments.length - 1].trim();
  }

  const normalizedParent = normalizeWeaponToken(parentWeaponId);
  const normalizedId = normalizeWeaponToken(weapon.id);
  if (normalizedId.startsWith(`${normalizedParent}-`)) {
    return formatProfileToken(normalizedId.slice(normalizedParent.length + 1));
  }

  return weapon.rangeBand ? deriveRangeBandProfileName(weapon.rangeBand) : undefined;
}

function deriveRangeBandProfileName(rangeBand: NonNullable<RangedWeaponProfile['rangeBand']>): string {
  if (rangeBand.min <= 0) {
    return 'Short';
  }
  if (rangeBand.max - rangeBand.min <= 15) {
    return rangeBand.max <= 30 ? 'Mid' : 'Long';
  }
  return `${rangeBand.min}-${rangeBand.max}`;
}

function formatProfileToken(token: string): string {
  const specialCase = PROFILE_TOKEN_ALIASES[token];
  if (specialCase) {
    return specialCase;
  }

  return token
    .split('-')
    .map((segment) => {
      const alias = PROFILE_TOKEN_ALIASES[segment];
      if (alias) {
        return alias;
      }
      if (segment.length === 0) {
        return segment;
      }
      return `${segment[0].toUpperCase()}${segment.slice(1)}`;
    })
    .join(' ');
}

function weaponMatchesProfileName(
  weapon: Pick<RangedWeaponProfile, 'id' | 'name'> & Partial<Pick<RangedWeaponProfile, 'parentWeaponId' | 'rangeBand'>>,
  profileName: string,
): boolean {
  const normalizedRequested = normalizeWeaponToken(profileName);
  const derivedProfileName = deriveProfileNameFromWeapon(weapon);
  if (derivedProfileName && normalizeWeaponToken(derivedProfileName) === normalizedRequested) {
    return true;
  }

  const normalizedName = normalizeWeaponToken(weapon.name);
  if (normalizedName.endsWith(`-${normalizedRequested}`)) {
    return true;
  }

  const normalizedId = normalizeWeaponToken(weapon.id);
  if (normalizedId.endsWith(`-${normalizedRequested}`)) {
    return true;
  }

  return false;
}

export function isTargetDistanceWithinRangeBand(
  targetDistance: number,
  rangeBand: NonNullable<ResolvedWeaponProfile['rangeBand']>,
): boolean {
  const aboveMinimum = rangeBand.min <= 0
    ? targetDistance >= 0
    : targetDistance > rangeBand.min;
  return aboveMinimum && targetDistance <= rangeBand.max;
}

export function isWeaponProfileInRange(
  weaponProfile: ResolvedWeaponProfile,
  targetDistance: number,
): boolean {
  if (weaponProfile.rangeBand) {
    return isTargetDistanceWithinRangeBand(targetDistance, weaponProfile.rangeBand);
  }
  return targetDistance <= weaponProfile.range;
}

function applyLegacyWeaponMultiplier(
  weaponProfile: ResolvedWeaponProfile,
  firepowerMultiplier: number,
): ResolvedWeaponProfile {
  if (firepowerMultiplier <= 1) {
    return weaponProfile;
  }

  return {
    ...weaponProfile,
    firepower: weaponProfile.firepower * firepowerMultiplier,
  };
}

function normalizeLegacyWeaponId(
  weaponId: string,
): { candidateIds: string[]; firepowerMultiplier: number } {
  const normalized = normalizeWeaponToken(weaponId);

  // Local fixtures and parsed prose sometimes use the common synonym "boltgun"
  // while the rules/data registry keys the weapon as "bolter".
  if (normalized === 'boltgun') {
    return { candidateIds: ['bolter'], firepowerMultiplier: 1 };
  }

  const countPrefixMatch = normalized.match(/^(one|two|three|four|five|six|seven|eight|nine|ten)-(.+)$/);
  const firepowerMultiplier = countPrefixMatch
    ? LEGACY_COUNT_PREFIXES[countPrefixMatch[1]] ?? 1
    : 1;
  let stripped = countPrefixMatch?.[2] ?? normalized;

  let removedMountPrefix = true;
  while (removedMountPrefix) {
    removedMountPrefix = false;
    for (const prefix of LEGACY_MOUNT_PREFIXES) {
      if (!stripped.startsWith(prefix)) {
        continue;
      }
      stripped = stripped.slice(prefix.length);
      removedMountPrefix = true;
      break;
    }
  }

  const candidateIds = [normalized];
  if (stripped !== normalized) {
    candidateIds.push(stripped);
  }

  const singularized = singularizeWeaponToken(stripped);
  if (singularized !== stripped) {
    candidateIds.push(singularized);
  }

  return {
    candidateIds: [...new Set(candidateIds)],
    firepowerMultiplier,
  };
}

const LEGACY_COUNT_PREFIXES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const LEGACY_MOUNT_PREFIXES = [
  'centreline-mounted-',
  'turret-mounted-',
  'sponson-mounted-',
  'hull-front-mounted-',
  'hull-rear-mounted-',
  'hull-left-mounted-',
  'hull-right-mounted-',
  'hull-mounted-',
  'pintle-mounted-',
];

const PROFILE_TOKEN_ALIASES: Record<string, string> = {
  ap: 'AP',
  he: 'HE',
  fp: 'FP',
};

function singularizeWeaponToken(weaponId: string): string {
  if (weaponId.endsWith('ies')) {
    return `${weaponId.slice(0, -3)}y`;
  }
  if (weaponId.endsWith('s')) {
    return weaponId.slice(0, -1);
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

function getAvailableWeaponIdsForModel(
  attackerUnit: UnitState,
  model: ModelState,
): string[] {
  if (model.equippedWargear.length > 0) {
    return [...new Set(model.equippedWargear)];
  }

  const profile = lookupUnitProfile(attackerUnit.profileId);
  const modelDefinition = lookupModelDefinition(attackerUnit.profileId, model.profileModelName);
  return [...new Set([
    ...(profile?.defaultWargear ?? []),
    ...(modelDefinition?.defaultWargear ?? []),
  ])];
}

function normalizeOwnedWeaponId(weaponId: string): string {
  const normalized = normalizeWeaponToken(weaponId);
  return normalized === 'boltgun' ? 'bolter' : normalized;
}

function modelCanUseWeaponAssignment(
  attackerUnit: UnitState,
  model: ModelState,
  assignment: WeaponAssignment,
): boolean {
  const availableWeaponIds = getAvailableWeaponIdsForModel(attackerUnit, model);
  const normalizedAssignmentId = normalizeOwnedWeaponId(assignment.weaponId);

  if (availableWeaponIds.some((weaponId) => normalizeOwnedWeaponId(weaponId) === normalizedAssignmentId)) {
    return true;
  }

  const directWeapon = findWeapon(normalizedAssignmentId) ?? findLegionWeapon(normalizedAssignmentId);
  if (directWeapon && 'parentWeaponId' in directWeapon && directWeapon.parentWeaponId) {
    const normalizedParentId = normalizeOwnedWeaponId(directWeapon.parentWeaponId);
    if (availableWeaponIds.some((weaponId) => normalizeOwnedWeaponId(weaponId) === normalizedParentId)) {
      return true;
    }
  }

  for (const availableWeaponId of availableWeaponIds) {
    const availableWeapon = findWeapon(availableWeaponId) ?? findLegionWeapon(availableWeaponId);
    if (!availableWeapon || !('parentWeaponId' in availableWeapon) || !availableWeapon.parentWeaponId) {
      continue;
    }
    if (normalizeOwnedWeaponId(availableWeapon.parentWeaponId) === normalizedAssignmentId) {
      return true;
    }
  }

  const normalizedCandidates = normalizeLegacyWeaponId(assignment.weaponId).candidateIds;
  return normalizedCandidates.some((candidateId) => getModelPsychicRangedWeapon(model, candidateId) !== undefined);
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
  targetModels?: ModelState[],
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

    // Resolve the weapon
    const weaponProfile = resolveWeaponAssignment(assignment, attackerUnit, undefined, targetDistance);
    if (!weaponProfile) {
      errors.push({
        code: 'INVALID_WEAPON',
        message: `Weapon '${assignment.weaponId}' is not a valid ranged weapon`,
        context: { weaponId: assignment.weaponId, modelId: assignment.modelId },
      });
      continue;
    }

    if (!modelCanUseWeaponAssignment(attackerUnit, model, assignment)) {
      errors.push({
        code: 'WEAPON_NOT_EQUIPPED',
        message: `Model '${assignment.modelId}' does not have weapon '${assignment.weaponId}' equipped`,
        context: { weaponId: assignment.weaponId, modelId: assignment.modelId },
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

    // Check weapon range (template weapons don't need range check — they auto-hit)
    if (!weaponProfile.hasTemplate) {
      const isInRange = targetModels
        ? checkWeaponRange(
            model,
            targetModels,
            weaponProfile.range,
            weaponProfile.rangeBand?.min ?? 0,
          )
        : isWeaponProfileInRange(weaponProfile, targetDistance);
      if (!isInRange) {
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
