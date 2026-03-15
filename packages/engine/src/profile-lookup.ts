/**
 * Profile Lookup — Engine-side access to unit profile data.
 *
 * Provides functions for looking up UnitProfile, ModelDefinition,
 * and model characteristics from the @hh/data profile registry.
 * Used by game-queries.ts, shooting pipeline, movement handlers,
 * and other engine modules that need real profile data.
 */

import type {
  UnitProfile,
  ModelDefinition,
  ModelCharacteristics,
  VehicleCharacteristics,
  UnitState,
  ModelState,
} from '@hh/types';
import { ModelType, ModelSubType } from '@hh/types';
import type { SpecialRuleRef } from '@hh/types';
import { getProfileById } from '@hh/data';

// ─── Profile Lookups ────────────────────────────────────────────────────────

/**
 * Look up a UnitProfile by its ID.
 */
export function lookupUnitProfile(profileId: string): UnitProfile | undefined {
  return getProfileById(profileId);
}

/**
 * Look up a specific ModelDefinition within a UnitProfile.
 * Matches by the model's profileModelName field.
 */
export function lookupModelDefinition(
  profileId: string,
  modelName: string,
): ModelDefinition | undefined {
  const profile = getProfileById(profileId);
  if (!profile) return undefined;

  // Try exact match first
  let modelDef = profile.modelDefinitions.find(
    md => md.name === modelName,
  );
  if (modelDef) return modelDef;

  // Try case-insensitive match
  const lowerName = modelName.toLowerCase();
  modelDef = profile.modelDefinitions.find(
    md => md.name.toLowerCase() === lowerName,
  );
  if (modelDef) return modelDef;

  // Fallback: if there's only one model definition, return it
  if (profile.modelDefinitions.length === 1) {
    return profile.modelDefinitions[0];
  }

  return undefined;
}

// ─── Characteristics Lookups ────────────────────────────────────────────────

/**
 * Get the characteristics for a specific model in a unit.
 * Returns infantry ModelCharacteristics or VehicleCharacteristics
 * depending on the unit type.
 */
export function getModelCharacteristics(
  profileId: string,
  modelName: string,
): ModelCharacteristics | VehicleCharacteristics | undefined {
  const modelDef = lookupModelDefinition(profileId, modelName);
  return modelDef?.characteristics;
}

/**
 * Get characteristics for a ModelState by using its stored profile references.
 */
export function getModelStateCharacteristics(
  model: ModelState,
): ModelCharacteristics | VehicleCharacteristics | undefined {
  return getModelCharacteristics(model.unitProfileId, model.profileModelName);
}

/**
 * Type guard: check if characteristics are VehicleCharacteristics.
 * VehicleCharacteristics have frontArmour; ModelCharacteristics do not.
 */
export function isVehicleCharacteristics(
  chars: ModelCharacteristics | VehicleCharacteristics,
): chars is VehicleCharacteristics {
  return 'frontArmour' in chars;
}

/**
 * Type guard: check if characteristics are infantry-style ModelCharacteristics.
 */
export function isInfantryCharacteristics(
  chars: ModelCharacteristics | VehicleCharacteristics,
): chars is ModelCharacteristics {
  return 'WS' in chars && 'T' in chars && !('frontArmour' in chars);
}

// ─── Unit Type Queries ──────────────────────────────────────────────────────

/**
 * Check if a unit profile represents a Vehicle-type unit.
 */
export function isVehicleProfile(profileId: string): boolean {
  const profile = getProfileById(profileId);
  if (!profile) return false;
  return profile.unitType === ModelType.Vehicle;
}

/**
 * Check if a UnitState represents a Vehicle-type unit.
 */
export function isVehicleUnitState(unit: UnitState): boolean {
  return isVehicleProfile(unit.profileId);
}

// ─── Special Rule Queries ───────────────────────────────────────────────────

/**
 * Get all special rules for a unit profile.
 */
export function getUnitSpecialRules(profileId: string): SpecialRuleRef[] {
  const profile = getProfileById(profileId);
  if (!profile) return [];
  return profile.specialRules;
}

/**
 * Check if a unit profile has a specific special rule by name.
 */
export function unitProfileHasSpecialRule(
  profileId: string,
  ruleName: string,
): boolean {
  const rules = getUnitSpecialRules(profileId);
  const lowerName = ruleName.toLowerCase();
  return rules.some(r => r.name.toLowerCase() === lowerName);
}

export function getUnitSpecialRuleValue(
  profileId: string,
  ruleName: string,
): number | null {
  const rules = getUnitSpecialRules(profileId);
  const lowerName = ruleName.toLowerCase();
  const match = rules.find((rule) => rule.name.toLowerCase() === lowerName);
  if (!match?.value) {
    return null;
  }

  const parsed = Number.parseInt(String(match.value).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function unitProfileHasSubType(
  profileId: string,
  subType: ModelSubType,
): boolean {
  const profile = getProfileById(profileId);
  if (!profile) return false;
  return profile.unitSubTypes.includes(subType);
}

export function unitProfileHasTrait(
  profileId: string,
  traitName: string,
): boolean {
  const profile = getProfileById(profileId);
  if (!profile) return false;
  const lowerName = traitName.toLowerCase();
  return profile.traits.some((trait) => trait.value.toLowerCase() === lowerName);
}

/**
 * Check if a model definition has a specific special rule.
 */
export function modelHasSpecialRule(
  profileId: string,
  modelName: string,
  ruleName: string,
): boolean {
  const modelDef = lookupModelDefinition(profileId, modelName);
  if (!modelDef?.specialRules) return false;
  const lowerName = ruleName.toLowerCase();
  return modelDef.specialRules.some(r => r.name.toLowerCase() === lowerName);
}

// ─── Base Size Queries ──────────────────────────────────────────────────────

/**
 * Get the base size in mm for a specific model.
 * Falls back to 32mm (standard infantry) if profile is not found.
 */
export function getModelBaseSizeMM(
  profileId: string,
  modelName: string,
): number {
  const modelDef = lookupModelDefinition(profileId, modelName);
  return modelDef?.baseSizeMM ?? 32;
}

/**
 * Get base size for a ModelState using its stored profile references.
 */
export function getModelStateBaseSizeMM(model: ModelState): number {
  return getModelBaseSizeMM(model.unitProfileId, model.profileModelName);
}

/**
 * Get the model type for a specific model definition.
 */
export function getModelType(
  profileId: string,
  modelName: string,
): ModelType | undefined {
  const modelDef = lookupModelDefinition(profileId, modelName);
  return modelDef?.modelType;
}

/**
 * Get the model sub-types for a specific model definition.
 */
export function getModelSubTypes(
  profileId: string,
  modelName: string,
): ModelSubType[] {
  const modelDef = lookupModelDefinition(profileId, modelName);
  return modelDef?.modelSubTypes ?? [];
}

/**
 * Check whether a model definition has a specific subtype.
 */
export function modelHasSubType(
  profileId: string,
  modelName: string,
  subType: ModelSubType,
): boolean {
  return getModelSubTypes(profileId, modelName).includes(subType);
}

// ─── Stat Helpers ───────────────────────────────────────────────────────────

/**
 * Get the Movement characteristic for a model.
 * Returns the default of 7 if profile not found.
 */
export function getModelMovement(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 7;
  return chars.M;
}

/**
 * Get the Initiative characteristic for a model (infantry-style only).
 * Returns 4 as default if profile not found or is a vehicle.
 */
export function getModelInitiative(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 4;
  if (isVehicleCharacteristics(chars)) return 0; // Vehicles have no Initiative
  return chars.I;
}

/**
 * Get the Toughness characteristic for a model (infantry-style only).
 * Returns 4 as default if not found.
 */
export function getModelToughness(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 4;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.T;
}

/**
 * Get the Weapon Skill characteristic for a model (infantry-style only).
 * Returns 4 as default if not found.
 */
export function getModelWS(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 4;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.WS;
}

/**
 * Get the Ballistic Skill for a model.
 * Works for both infantry and vehicle profiles.
 * Returns 4 as default if not found.
 */
export function getModelBS(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 4;
  return chars.BS;
}

/**
 * Get the Wounds (or HP for vehicles) for a model.
 * Returns 1 as default if not found.
 */
export function getModelWounds(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 1;
  if (isVehicleCharacteristics(chars)) return chars.HP;
  return chars.W;
}

/**
 * Get the armour save value for a model (infantry-style only).
 * Returns null (no save) if not found or is a vehicle.
 */
export function getModelSave(profileId: string, modelName: string): number | null {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return null;
  if (isVehicleCharacteristics(chars)) return null;
  return chars.SAV;
}

/**
 * Get the invulnerable save value for a model (infantry-style only).
 * Returns null (no invuln) if not found or is a vehicle.
 */
export function getModelInvulnSave(profileId: string, modelName: string): number | null {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return null;
  if (isVehicleCharacteristics(chars)) return null;
  return chars.INV;
}

/**
 * Get vehicle armour values.
 * Returns undefined if the model is not a vehicle.
 */
export function getVehicleArmour(
  profileId: string,
  modelName: string,
): { front: number; side: number; rear: number } | undefined {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars || !isVehicleCharacteristics(chars)) return undefined;
  if (unitProfileHasSubType(profileId, ModelSubType.Flyer)) {
    return {
      front: chars.frontArmour,
      side: chars.frontArmour,
      rear: chars.frontArmour,
    };
  }
  return {
    front: chars.frontArmour,
    side: chars.sideArmour,
    rear: chars.rearArmour,
  };
}

/**
 * Get the Leadership characteristic for a model.
 * Returns 7 as default if not found.
 */
export function getModelLeadership(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 7;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.LD;
}

/**
 * Get the Cool characteristic for a model.
 * Returns 7 as default if not found.
 */
export function getModelCool(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 7;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.CL;
}

/**
 * Get the Willpower characteristic for a model.
 * Returns 7 as default if not found.
 */
export function getModelWillpower(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 7;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.WP;
}

/**
 * Get the Strength characteristic for a model (infantry-style only).
 * Returns 4 as default if not found.
 */
export function getModelStrength(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 4;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.S;
}

/**
 * Get the Attacks characteristic for a model (infantry-style only).
 * Returns 1 as default if not found.
 */
export function getModelAttacks(profileId: string, modelName: string): number {
  const chars = getModelCharacteristics(profileId, modelName);
  if (!chars) return 1;
  if (isVehicleCharacteristics(chars)) return 0;
  return chars.A;
}
