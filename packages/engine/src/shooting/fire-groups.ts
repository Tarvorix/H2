/**
 * Fire Group Formation — Shooting Pipeline Step 4
 * Reference: HH_Rules_Battle.md — Step 4: Set Fire Groups
 * Reference: HH_Principles.md — Weapon Traits, Rapid Fire
 *
 * Groups all attacks by weapon name, then splits by:
 * - Ballistic Skill
 * - Snap-shot status
 * - Profile name (for multi-profile weapons)
 *
 * Each fire group shares identical weapon profile, BS, and snap-shot status.
 * Calculates total firepower per group, accounting for Rapid Fire at half range.
 *
 * Also provides utility to split precision hits into their own fire group
 * after hit resolution.
 */

import type { UnitState, SpecialRuleRef } from '@hh/types';
import type {
  WeaponAssignment,
  FireGroup,
  FireGroupAttack,
  ResolvedWeaponProfile,
  HitResult,
} from './shooting-types';
import { resolveWeaponAssignment, determineSnapShots } from './weapon-declaration';
import { getModelBS as lookupModelBS } from '../profile-lookup';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default Ballistic Skill for models when BS is not directly stored */
const DEFAULT_BS = 4;

// ─── Helper Functions ───────────────────────────────────────────────────────

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
 * Get the Ballistic Skill for a model.
 * Currently uses a default value since ModelState doesn't have BS directly.
 * Standard Legiones Astartes have BS4.
 *
 * @param _modelId - The model ID (reserved for future per-model BS lookup)
 * @param _unit - The unit the model belongs to
 * @returns The model's BS value
 */
function getModelBS(modelId: string, unit: UnitState): number {
  const model = unit.models.find(m => m.id === modelId);
  if (model) {
    return lookupModelBS(model.unitProfileId, model.profileModelName);
  }
  return DEFAULT_BS;
}

/**
 * Calculate the effective firepower for a weapon, accounting for Rapid Fire.
 *
 * Rapid Fire: If the weapon has the "Rapid Fire" trait and the target distance
 * is at half the weapon's range or less, firepower is doubled.
 *
 * Reference: HH_Principles.md — "Rapid Fire" trait
 *
 * @param weaponProfile - The resolved weapon profile
 * @param targetDistance - Distance to target in inches
 * @returns The effective firepower value
 */
function calculateEffectiveFirepower(
  weaponProfile: ResolvedWeaponProfile,
  targetDistance: number,
): number {
  const baseFirepower = weaponProfile.firepower;

  // Check for Rapid Fire trait
  const isRapidFire =
    hasTrait(weaponProfile.traits, 'Rapid Fire') ||
    hasSpecialRule(weaponProfile.specialRules, 'Rapid Fire');

  if (isRapidFire) {
    const halfRange = weaponProfile.range / 2;
    if (targetDistance <= halfRange) {
      return baseFirepower * 2;
    }
  }

  return baseFirepower;
}

/**
 * Generate the grouping key for a fire group.
 * All attacks with the same key belong to the same fire group.
 *
 * Key format: `${weaponName}|${profileName}|${bs}|${isSnapShot}`
 *
 * @param weaponName - Name of the weapon
 * @param profileName - Profile name for multi-profile weapons (empty string if none)
 * @param bs - Ballistic Skill
 * @param isSnapShot - Whether the attack is snap shots
 * @returns The grouping key string
 */
function makeGroupKey(
  weaponName: string,
  profileName: string,
  bs: number,
  isSnapShot: boolean,
  sourceModelId?: string,
): string {
  return `${weaponName}|${profileName}|${bs}|${isSnapShot}|${sourceModelId ?? ''}`;
}

// ─── Fire Group Formation ───────────────────────────────────────────────────

/**
 * Form fire groups from validated weapon assignments.
 *
 * Reference: HH_Rules_Battle.md — Step 4: Set Fire Groups
 *
 * Process:
 * 1. For each weapon assignment, resolve the weapon profile
 * 2. Determine BS and snap-shot status for the model
 * 3. Calculate effective firepower (accounting for Rapid Fire)
 * 4. Group attacks by weapon name + profile name + BS + snap-shot status
 * 5. Calculate total firepower per group
 * 6. Initialize resolution tracking fields
 *
 * @param assignments - Validated weapon assignments (model -> weapon)
 * @param attackerUnit - The attacking unit's state
 * @param modelsWithLOS - IDs of models with LOS to target (used for validation)
 * @param targetDistance - Distance to target in inches
 * @returns Array of formed fire groups
 */
export function formFireGroups(
  assignments: WeaponAssignment[],
  attackerUnit: UnitState,
  modelsWithLOS: string[],
  targetDistance: number,
  countsAsStationary: boolean = false,
  forceNoSnapShots: boolean = false,
): FireGroup[] {
  // Map to accumulate attacks by group key
  const groupMap = new Map<string, {
    weaponName: string;
    profileName: string;
    bs: number;
    isSnapShot: boolean;
    attacks: FireGroupAttack[];
    weaponProfile: ResolvedWeaponProfile;
    specialRules: SpecialRuleRef[];
    traits: string[];
  }>();

  for (const assignment of assignments) {
    // Resolve the weapon profile
    const weaponProfile = resolveWeaponAssignment(assignment, attackerUnit);
    if (!weaponProfile) {
      // Skip invalid weapons — these should have been caught during validation
      continue;
    }

    // Check that model has LOS (skip if not — should have been validated)
    if (!modelsWithLOS.includes(assignment.modelId)) {
      continue;
    }

    // Check that model exists and is alive
    const model = attackerUnit.models.find((m) => m.id === assignment.modelId);
    if (!model || model.isDestroyed) {
      continue;
    }

    // Get the model's Ballistic Skill
    const bs = getModelBS(assignment.modelId, attackerUnit);

    // Determine if this model fires as snap shots
    const isSnapShot = determineSnapShots(
      attackerUnit,
      weaponProfile,
      false,
      countsAsStationary,
      forceNoSnapShots,
    );

    // Calculate effective firepower (Rapid Fire doubling at half range)
    const effectiveFirepower = calculateEffectiveFirepower(weaponProfile, targetDistance);

    // Determine the profile name for grouping
    const profileName = assignment.profileName ?? '';

    // Generate the grouping key
    const groupKey = makeGroupKey(
      weaponProfile.name,
      profileName,
      bs,
      isSnapShot,
      weaponProfile.hasTemplate ? assignment.modelId : undefined,
    );

    // Create the attack entry
    const attack: FireGroupAttack = {
      modelId: assignment.modelId,
      firepower: effectiveFirepower,
      ballisticSkill: bs,
      weaponProfile,
      isSnapShot,
    };

    // Add to existing group or create new one
    const existingGroup = groupMap.get(groupKey);
    if (existingGroup) {
      existingGroup.attacks.push(attack);
    } else {
      groupMap.set(groupKey, {
        weaponName: weaponProfile.name,
        profileName,
        bs,
        isSnapShot,
        attacks: [attack],
        weaponProfile,
        specialRules: [...weaponProfile.specialRules],
        traits: [...weaponProfile.traits],
      });
    }
  }

  // Convert the map to an array of FireGroup objects
  const fireGroups: FireGroup[] = [];
  let index = 0;

  for (const group of groupMap.values()) {
    const totalFirepower = group.attacks.reduce(
      (sum, attack) => sum + attack.firepower,
      0,
    );

    const fireGroup: FireGroup = {
      index,
      weaponName: group.weaponName,
      profileName: group.profileName || undefined,
      ballisticSkill: group.bs,
      targetUnitId: undefined,
      isSnapShot: group.isSnapShot,
      attacks: group.attacks,
      totalFirepower,
      specialRules: group.specialRules,
      traits: group.traits,
      weaponProfile: group.weaponProfile,
      // Initialize resolution tracking fields
      hits: [],
      wounds: [],
      penetratingHits: [],
      glancingHits: [],
      resolved: false,
      hitPoolResolved: false,
      isPrecisionGroup: false,
      isDeflagrateGroup: false,
    };

    fireGroups.push(fireGroup);
    index++;
  }

  return fireGroups;
}

// ─── Precision Hit Splitting ────────────────────────────────────────────────

/**
 * Split precision hits from a resolved fire group into a separate fire group.
 *
 * After hit resolution, precision hits are separated from normal hits because
 * precision hits allow the attacker to choose which model takes the wound
 * (instead of the defender choosing).
 *
 * Reference: HH_Armoury.md — Precision
 * "When a Hit Test made as part of a Shooting Attack with a weapon that has
 * this Special Rule succeeds on a natural roll of X+, the Attacking Player
 * can assign any Wounds caused by those Hit Tests to any Model in the
 * target Unit."
 *
 * @param parentGroup - The fire group that has been resolved for hits
 * @param hitResults - The hit results from hit resolution
 * @returns An object with normalGroup (non-precision) and precisionGroup (precision hits, or null)
 */
export function splitPrecisionHits(
  parentGroup: FireGroup,
  hitResults: HitResult[],
): { normalGroup: FireGroup; precisionGroup: FireGroup | null } {
  // Separate precision hits from normal hits
  const precisionHits = hitResults.filter((h) => h.isHit && h.isPrecision);
  const normalHits = hitResults.filter((h) => !h.isPrecision);

  // If there are no precision hits, return the parent group as-is with all hits
  if (precisionHits.length === 0) {
    const normalGroup: FireGroup = {
      ...parentGroup,
      hits: hitResults,
    };
    return { normalGroup, precisionGroup: null };
  }

  // Create the normal group with non-precision hits
  const normalGroup: FireGroup = {
    ...parentGroup,
    hits: normalHits,
    hitPoolResolved: true,
    // Recalculate total firepower is not needed — firepower reflects dice rolled, not hits
    // The firepower stays the same as it represents the original pool
  };

  // Create the precision group
  const precisionGroup: FireGroup = {
    ...parentGroup,
    index: -1, // Will be re-indexed by the caller
    hits: precisionHits,
    // Precision groups carry all the same weapon stats
    attacks: [...parentGroup.attacks],
    specialRules: [...parentGroup.specialRules],
    traits: [...parentGroup.traits],
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    hitPoolResolved: true,
    isPrecisionGroup: true,
    isDeflagrateGroup: false,
  };

  return { normalGroup, precisionGroup };
}
