/**
 * Target Model Selection — Shooting Pipeline Step 8
 * Reference: HH_Rules_Battle.md — Step 8: Defender Selects Target Model
 * Reference: HH_Principles.md — Wound Allocation
 *
 * Determines which model in the target unit receives wounds:
 * 1. Models that have already lost wounds/HP must be selected first
 *    (UNLESS they have Paragon type or Command sub-type)
 * 2. For 'wound' type: only non-vehicle models are valid targets
 * 3. For 'penetrating' type: only vehicle models are valid targets
 * 4. After the wounded-first rule, select the first alive model
 */

import type { ModelState } from '@hh/types';
import { ModelType, ModelSubType } from '@hh/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Extended model information needed for target selection.
 * Combines runtime ModelState with profile data needed for selection rules.
 */
export interface TargetModelInfo {
  /** The runtime model state */
  model: ModelState;
  /** The model's primary type from its unit profile */
  modelType: ModelType;
  /** The model's sub-types from its unit profile */
  modelSubTypes: ModelSubType[];
  /** The model's maximum wounds (from profile characteristics) */
  maxWounds: number;
  /** Whether this model is a vehicle (derived from modelType) */
  isVehicle: boolean;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Check if a model has Paragon type or Command sub-type.
 * These models are exempt from the "wounded models must be selected first" rule.
 *
 * @param info - Target model information
 * @returns true if the model has Paragon type or Command sub-type
 */
function isExemptFromWoundedFirstRule(info: TargetModelInfo): boolean {
  if (info.modelType === ModelType.Paragon) {
    return true;
  }
  if (info.modelSubTypes.includes(ModelSubType.Command)) {
    return true;
  }
  return false;
}

/**
 * Check if a model has lost wounds (current wounds < max wounds).
 *
 * @param info - Target model information
 * @returns true if the model has taken damage but is not destroyed
 */
function hasLostWounds(info: TargetModelInfo): boolean {
  return !info.model.isDestroyed && info.model.currentWounds < info.maxWounds;
}

/**
 * Check if a model is alive (not destroyed).
 *
 * @param info - Target model information
 * @returns true if the model is not destroyed
 */
function isAlive(info: TargetModelInfo): boolean {
  return !info.model.isDestroyed;
}

// ─── Target Model Selection ─────────────────────────────────────────────────

/**
 * Get an array of valid target models for wound allocation.
 *
 * @param models - Array of target model information for all models in the unit
 * @param woundType - 'wound' for non-vehicle targets, 'penetrating' for vehicle targets
 * @returns Array of model IDs that are valid targets
 */
export function getValidTargetModels(
  models: TargetModelInfo[],
  woundType: 'wound' | 'penetrating',
): string[] {
  return models
    .filter((info) => {
      // Must be alive
      if (!isAlive(info)) return false;

      // Filter by wound type
      if (woundType === 'wound' && info.isVehicle) return false;
      if (woundType === 'penetrating' && !info.isVehicle) return false;

      return true;
    })
    .map((info) => info.model.id);
}

/**
 * Automatically select the best target model for wound allocation.
 *
 * Reference: HH_Rules_Battle.md — Step 8: Target Model Selection
 *
 * Selection priority:
 * 1. Models that have already lost wounds/HP must be selected first
 *    UNLESS they have Paragon type or Command sub-type
 * 2. After wounded-first rule, select the first alive model
 *
 * @param models - Array of target model information for all models in the unit
 * @param woundType - 'wound' for non-vehicle targets, 'penetrating' for vehicle targets
 * @returns The model ID of the selected target, or null if no valid target exists
 */
export function autoSelectTargetModel(
  models: TargetModelInfo[],
  woundType: 'wound' | 'penetrating',
): string | null {
  // Filter to valid targets based on wound type
  const validModels = models.filter((info) => {
    if (!isAlive(info)) return false;
    if (woundType === 'wound' && info.isVehicle) return false;
    if (woundType === 'penetrating' && !info.isVehicle) return false;
    return true;
  });

  if (validModels.length === 0) {
    return null;
  }

  // Priority 1: Models that have lost wounds and are NOT exempt (not Paragon/Command)
  const woundedNonExempt = validModels.filter(
    (info) => hasLostWounds(info) && !isExemptFromWoundedFirstRule(info),
  );

  if (woundedNonExempt.length > 0) {
    // Select the first wounded non-exempt model
    return woundedNonExempt[0].model.id;
  }

  // Priority 2: First alive model
  return validModels[0].model.id;
}
