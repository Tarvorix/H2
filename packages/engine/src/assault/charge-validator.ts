/**
 * Charge Validator
 * Validates charge eligibility and target legality for the Assault Phase.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Steps 1-2
 * Reference: HH_Principles.md — "Assault Phase", "Charging"
 *
 * Step 1: Declare Charge — validate charger is eligible to charge
 * Step 2: Select Target — validate target is a legal charge target within range
 */

import type { GameState, UnitState } from '@hh/types';
import { UnitMovementState, TacticalStatus } from '@hh/types';
import type { ValidationError } from '../types';
import {
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
  getClosestModelDistance,
  getModelsWithLOSToUnit,
} from '../game-queries';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum charge range in inches */
export const MAX_CHARGE_RANGE = 12;

// ─── Validation Result Type ─────────────────────────────────────────────────

/**
 * Result of a charge validation check.
 */
export interface ChargeValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * Result of a charge eligibility and target validation.
 * Extends ChargeValidationResult with computed data for the charge.
 */
export interface ChargeValidationData extends ChargeValidationResult {
  /** Whether the charge is disordered (unit has tactical statuses) */
  isDisordered: boolean;
  /** Distance between closest models with LOS */
  closestDistance: number;
  /** IDs of charging models that have LOS to the target */
  modelsWithLOS: string[];
}

// ─── Validate Charge Eligibility ─────────────────────────────────────────────

/**
 * Validates that a unit is eligible to declare a charge.
 *
 * Checks:
 * - Unit must exist in the game state
 * - Unit must belong to the active player
 * - Unit must be deployed on the battlefield
 * - Unit must not be embarked on a transport
 * - Unit must not have Rushed this turn
 * - Unit must not be locked in combat already
 * - Unit must not have Pinned status
 * - Unit must not have Routed status
 * - Unit must have at least one alive model
 *
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 1
 *
 * @param state - Current game state
 * @param chargingUnitId - ID of the unit attempting to charge
 * @returns ChargeValidationResult with valid flag and any errors
 */
export function validateChargeEligibility(
  state: GameState,
  chargingUnitId: string,
): ChargeValidationResult {
  const errors: ValidationError[] = [];

  // Find the charging unit
  const chargingUnit = findUnit(state, chargingUnitId);
  if (!chargingUnit) {
    errors.push({
      code: 'CHARGER_NOT_FOUND',
      message: `Charging unit '${chargingUnitId}' not found in game state`,
      context: { chargingUnitId },
    });
    return { valid: false, errors };
  }

  // Must belong to the active player
  const chargerPlayerIndex = findUnitPlayerIndex(state, chargingUnitId);
  if (chargerPlayerIndex !== state.activePlayerIndex) {
    errors.push({
      code: 'CHARGER_NOT_ACTIVE_PLAYER',
      message: 'Charging unit does not belong to the active player',
      context: { chargingUnitId, chargerPlayerIndex, activePlayerIndex: state.activePlayerIndex },
    });
  }

  // Must be deployed on the battlefield
  if (!chargingUnit.isDeployed) {
    errors.push({
      code: 'CHARGER_NOT_DEPLOYED',
      message: 'Unit that is not deployed cannot declare a charge',
      context: { chargingUnitId },
    });
  }

  // Must not be embarked on a transport
  if (chargingUnit.embarkedOnId !== null) {
    errors.push({
      code: 'CHARGER_EMBARKED',
      message: 'Embarked unit cannot declare a charge',
      context: { chargingUnitId, embarkedOnId: chargingUnit.embarkedOnId },
    });
  }

  // Must not have Rushed this turn
  if (chargingUnit.movementState === UnitMovementState.Rushed) {
    errors.push({
      code: 'CHARGER_RUSHED',
      message: 'Unit that Rushed this turn cannot declare a charge',
      context: { chargingUnitId, movementState: chargingUnit.movementState },
    });
  }

  // Must not be locked in combat already
  if (chargingUnit.isLockedInCombat) {
    errors.push({
      code: 'CHARGER_LOCKED_IN_COMBAT',
      message: 'Unit already locked in combat cannot declare a new charge',
      context: { chargingUnitId, engagedWithUnitIds: chargingUnit.engagedWithUnitIds },
    });
  }

  // Must not have Pinned status
  if (chargingUnit.statuses.includes(TacticalStatus.Pinned)) {
    errors.push({
      code: 'CHARGER_PINNED',
      message: 'Pinned unit cannot declare a charge',
      context: { chargingUnitId, statuses: chargingUnit.statuses },
    });
  }

  // Must not have Routed status
  if (chargingUnit.statuses.includes(TacticalStatus.Routed)) {
    errors.push({
      code: 'CHARGER_ROUTED',
      message: 'Routed unit cannot declare a charge',
      context: { chargingUnitId, statuses: chargingUnit.statuses },
    });
  }

  // Must have at least one alive model
  const aliveModels = getAliveModels(chargingUnit);
  if (aliveModels.length === 0) {
    errors.push({
      code: 'CHARGER_NO_ALIVE_MODELS',
      message: 'Unit has no alive models to declare a charge',
      context: { chargingUnitId },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Validate Charge Target ─────────────────────────────────────────────────

/**
 * Validates that a target unit is a legal charge target.
 *
 * Checks:
 * - Target must exist in the game state
 * - Target must be an enemy unit (different player index than charger)
 * - Target must be deployed on the battlefield
 * - Target must not be embarked on a transport
 * - Target must not be in reserves
 * - Target must have at least one alive model
 * - At least one charging model must have LOS to at least one target model
 * - Closest distance between LOS-visible models must be <= 12"
 *
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 1
 *
 * @param state - Current game state
 * @param chargingUnitId - ID of the charging unit
 * @param targetUnitId - ID of the target unit
 * @returns ChargeValidationData with valid flag, errors, and computed data
 */
export function validateChargeTarget(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
): ChargeValidationData {
  const errors: ValidationError[] = [];
  let isDisordered = false;
  let closestDistance = Infinity;
  let modelsWithLOS: string[] = [];

  // Find the charging unit (for disordered check)
  const chargingUnit = findUnit(state, chargingUnitId);
  if (chargingUnit) {
    isDisordered = chargingUnit.statuses.length > 0;
  }

  // Find the target unit
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) {
    errors.push({
      code: 'TARGET_NOT_FOUND',
      message: `Target unit '${targetUnitId}' not found in game state`,
      context: { targetUnitId },
    });
    return { valid: false, errors, isDisordered, closestDistance, modelsWithLOS };
  }

  // Target must be an enemy unit (different player index)
  const chargerPlayerIndex = findUnitPlayerIndex(state, chargingUnitId);
  const targetPlayerIndex = findUnitPlayerIndex(state, targetUnitId);
  if (chargerPlayerIndex === targetPlayerIndex) {
    errors.push({
      code: 'TARGET_IS_FRIENDLY',
      message: 'Cannot charge a friendly unit',
      context: { chargingUnitId, targetUnitId, chargerPlayerIndex, targetPlayerIndex },
    });
  }

  // Target must be deployed on the battlefield
  if (!targetUnit.isDeployed) {
    errors.push({
      code: 'TARGET_NOT_DEPLOYED',
      message: 'Cannot charge a unit that is not deployed on the battlefield',
      context: { targetUnitId },
    });
  }

  // Target must not be embarked on a transport
  if (targetUnit.embarkedOnId !== null) {
    errors.push({
      code: 'TARGET_EMBARKED',
      message: 'Cannot charge a unit that is embarked on a transport',
      context: { targetUnitId, embarkedOnId: targetUnit.embarkedOnId },
    });
  }

  // Target must not be in reserves
  if (targetUnit.isInReserves) {
    errors.push({
      code: 'TARGET_IN_RESERVES',
      message: 'Cannot charge a unit that is in reserves',
      context: { targetUnitId },
    });
  }

  // Target must have at least one alive model
  const aliveTargetModels = getAliveModels(targetUnit);
  if (aliveTargetModels.length === 0) {
    errors.push({
      code: 'TARGET_DESTROYED',
      message: 'Cannot charge a unit where all models have been destroyed',
      context: { targetUnitId },
    });
  }

  // Only proceed with LOS and range checks if we have valid units
  if (errors.length === 0 && chargingUnit) {
    // Check LOS — at least one charging model must have LOS to target
    const losModels = getModelsWithLOSToUnit(state, chargingUnitId, targetUnitId);
    modelsWithLOS = losModels.map(m => m.id);

    if (modelsWithLOS.length === 0) {
      errors.push({
        code: 'NO_LOS_TO_TARGET',
        message: 'No charging model has line of sight to any target model',
        context: { chargingUnitId, targetUnitId },
      });
    } else {
      // Check range — closest distance between LOS-visible models must be <= 12"
      closestDistance = getClosestModelDistance(state, chargingUnitId, targetUnitId);

      if (closestDistance > MAX_CHARGE_RANGE) {
        errors.push({
          code: 'TARGET_OUT_OF_CHARGE_RANGE',
          message: `Target is ${closestDistance.toFixed(1)}" away, exceeding maximum charge range of ${MAX_CHARGE_RANGE}"`,
          context: { chargingUnitId, targetUnitId, closestDistance, maxChargeRange: MAX_CHARGE_RANGE },
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    isDisordered,
    closestDistance,
    modelsWithLOS,
  };
}

// ─── Disordered Charge Check ─────────────────────────────────────────────────

/**
 * Determines if a unit's charge would be disordered.
 * A charge is disordered if the charging unit has ANY tactical status.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase, Disordered Charge
 *
 * Effects of a disordered charge:
 * - No Set-up Move (Step 3 is skipped)
 * - No Volley Attacks for the charging unit (Step 4, charger cannot volley)
 * - Combat Initiative forced to 1 for the charging unit in subsequent Fight
 *
 * @param unit - The charging unit
 * @returns True if the charge would be disordered
 */
export function isDisorderedCharge(unit: UnitState): boolean {
  return unit.statuses.length > 0;
}
