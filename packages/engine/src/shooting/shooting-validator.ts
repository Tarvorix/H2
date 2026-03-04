/**
 * Shooting Validator
 * Validates shooting attack eligibility (Steps 1-2 of the 11-step pipeline).
 * Reference: HH_Rules_Battle.md — Shooting Phase Steps 1-2
 * Reference: HH_Principles.md — "Line of Sight", "Measuring", "Vehicles and Damage"
 *
 * Step 1: Select Target Unit — validate target is a legal target (enemy, on battlefield)
 * Step 2: Check Target — LOS check, range check, vehicle facing determination
 */

import type { GameState, ModelState, Position, TerrainPiece } from '@hh/types';
import { VehicleFacing, UnitMovementState } from '@hh/types';
import type { ValidationError } from '../types';
import { findUnit, findUnitPlayerIndex, getAliveModels, getModelShape } from '../game-queries';
// From geometry package:
import { hasLOS, distanceShapes, createCircleBase } from '@hh/geometry';
import type { ModelShape, RectHull } from '@hh/geometry';
import { determineVehicleFacing } from '@hh/geometry';

// ─── Validation Result Type ───────────────────────────────────────────────────

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * Optional attacker validation overrides for special-case shooting flows
 * like reaction attacks.
 */
export interface AttackerValidationOptions {
  /** Allow attacker to shoot even if it is not owned by active player */
  allowNonActivePlayerAttack?: boolean;
  /** Ignore the normal "rushed units cannot shoot" restriction */
  ignoreRushedRestriction?: boolean;
  /** Ignore the normal "unit has already shot this turn" restriction */
  ignoreHasShotRestriction?: boolean;
}

// ─── Step 1: Validate Shooting Target ─────────────────────────────────────────

/**
 * Validates that a target unit is a legal shooting target.
 *
 * Checks:
 * - Target must exist in the game state
 * - Target must be an enemy unit (different player index than attacker)
 * - Target must not be embarked on a transport
 * - Target must not be in reserves
 * - Target must be deployed on the battlefield
 * - Target must not be destroyed (all models destroyed)
 *
 * Reference: HH_Rules_Battle.md — "Step 1: Select Target Unit"
 *
 * @param state - Current game state
 * @param attackerUnitId - ID of the attacking unit
 * @param targetUnitId - ID of the target unit
 * @returns ValidationResult with valid flag and any errors
 */
export function validateShootingTarget(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Find attacker unit and its player index
  const attackerUnit = findUnit(state, attackerUnitId);
  if (!attackerUnit) {
    errors.push({
      code: 'ATTACKER_NOT_FOUND',
      message: `Attacking unit '${attackerUnitId}' not found in game state`,
      context: { attackerUnitId },
    });
    return { valid: false, errors };
  }

  const attackerPlayerIndex = findUnitPlayerIndex(state, attackerUnitId);

  // Find target unit
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) {
    errors.push({
      code: 'TARGET_NOT_FOUND',
      message: `Target unit '${targetUnitId}' not found in game state`,
      context: { targetUnitId },
    });
    return { valid: false, errors };
  }

  const targetPlayerIndex = findUnitPlayerIndex(state, targetUnitId);

  // Target must be an enemy unit (different player index)
  if (attackerPlayerIndex === targetPlayerIndex) {
    errors.push({
      code: 'TARGET_IS_FRIENDLY',
      message: 'Cannot target a friendly unit with a shooting attack',
      context: { attackerUnitId, targetUnitId, attackerPlayerIndex, targetPlayerIndex },
    });
  }

  // Target must not be embarked on a transport
  if (targetUnit.embarkedOnId !== null) {
    errors.push({
      code: 'TARGET_EMBARKED',
      message: 'Cannot target a unit that is embarked on a transport',
      context: { targetUnitId, embarkedOnId: targetUnit.embarkedOnId },
    });
  }

  // Target must not be in reserves
  if (targetUnit.isInReserves) {
    errors.push({
      code: 'TARGET_IN_RESERVES',
      message: 'Cannot target a unit that is in reserves',
      context: { targetUnitId },
    });
  }

  // Target must be deployed on the battlefield
  if (!targetUnit.isDeployed) {
    errors.push({
      code: 'TARGET_NOT_DEPLOYED',
      message: 'Cannot target a unit that is not deployed on the battlefield',
      context: { targetUnitId },
    });
  }

  // Target must not be destroyed (all models destroyed)
  const aliveModels = getAliveModels(targetUnit);
  if (aliveModels.length === 0) {
    errors.push({
      code: 'TARGET_DESTROYED',
      message: 'Cannot target a unit where all models have been destroyed',
      context: { targetUnitId },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Validate Attacker Eligibility ────────────────────────────────────────────

/**
 * Validates that the attacking unit is eligible to make a shooting attack.
 *
 * Checks:
 * - Attacker must exist in the game state
 * - Attacker must belong to the active player
 * - Must not have Rushed this turn (UnitMovementState.Rushed)
 * - Must not be locked in combat (isLockedInCombat)
 * - Must not be embarked (embarkedOnId !== null)
 * - Must be deployed (isDeployed)
 * - Must have at least one alive model
 *
 * Reference: HH_Rules_Battle.md — "Shooting Phase" eligibility
 *
 * @param state - Current game state
 * @param attackerUnitId - ID of the attacking unit
 * @returns ValidationResult with valid flag and any errors
 */
export function validateAttackerEligibility(
  state: GameState,
  attackerUnitId: string,
  options: AttackerValidationOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];

  // Find the attacker unit
  const attackerUnit = findUnit(state, attackerUnitId);
  if (!attackerUnit) {
    errors.push({
      code: 'ATTACKER_NOT_FOUND',
      message: `Attacking unit '${attackerUnitId}' not found in game state`,
      context: { attackerUnitId },
    });
    return { valid: false, errors };
  }

  // Attacker must belong to the active player
  const attackerPlayerIndex = findUnitPlayerIndex(state, attackerUnitId);
  if (!options.allowNonActivePlayerAttack && attackerPlayerIndex !== state.activePlayerIndex) {
    errors.push({
      code: 'ATTACKER_NOT_ACTIVE_PLAYER',
      message: 'Attacking unit does not belong to the active player',
      context: { attackerUnitId, attackerPlayerIndex, activePlayerIndex: state.activePlayerIndex },
    });
  }

  // Must not have Rushed this turn
  if (!options.ignoreRushedRestriction && attackerUnit.movementState === UnitMovementState.Rushed) {
    errors.push({
      code: 'ATTACKER_RUSHED',
      message: 'Unit that Rushed this turn cannot shoot',
      context: { attackerUnitId, movementState: attackerUnit.movementState },
    });
  }

  // Must not have already made a normal shooting attack this turn
  if (!options.ignoreHasShotRestriction && attackerUnit.hasShotThisTurn === true) {
    errors.push({
      code: 'ATTACKER_ALREADY_SHOT',
      message: 'Unit has already made a shooting attack this turn',
      context: { attackerUnitId },
    });
  }

  // Must not be locked in combat
  if (attackerUnit.isLockedInCombat) {
    errors.push({
      code: 'ATTACKER_IN_COMBAT',
      message: 'Unit locked in combat cannot make shooting attacks',
      context: { attackerUnitId },
    });
  }

  // Must not be embarked
  if (attackerUnit.embarkedOnId !== null) {
    errors.push({
      code: 'ATTACKER_EMBARKED',
      message: 'Embarked unit cannot make shooting attacks',
      context: { attackerUnitId, embarkedOnId: attackerUnit.embarkedOnId },
    });
  }

  // Must be deployed
  if (!attackerUnit.isDeployed) {
    errors.push({
      code: 'ATTACKER_NOT_DEPLOYED',
      message: 'Unit that is not deployed cannot shoot',
      context: { attackerUnitId },
    });
  }

  // Must have at least one alive model
  const aliveModels = getAliveModels(attackerUnit);
  if (aliveModels.length === 0) {
    errors.push({
      code: 'ATTACKER_NO_ALIVE_MODELS',
      message: 'Unit has no alive models to make a shooting attack',
      context: { attackerUnitId },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Step 2: LOS Filtering ───────────────────────────────────────────────────

/**
 * Determines which attacker models have Line of Sight to at least one target model.
 *
 * For each attacker model, checks if it has LOS to ANY target model using
 * the geometry package's `hasLOS` function, accounting for terrain and vehicle
 * hulls that block LOS.
 *
 * Reference: HH_Principles.md — "Line of Sight"
 * "if an unbroken straight line can be drawn between the first Model and its target
 * ... then both Models have Line of Sight to each other"
 *
 * @param attackerModels - Models in the attacking unit (alive, deployed)
 * @param targetModels - Models in the target unit (alive, deployed)
 * @param terrain - All terrain pieces on the battlefield
 * @param vehicleHulls - Vehicle hulls that could block LOS (excluding attacker/target vehicles)
 * @returns Array of model IDs that have LOS to at least one target model
 */
export function filterModelsWithLOS(
  attackerModels: ModelState[],
  targetModels: ModelState[],
  terrain: TerrainPiece[],
  vehicleHulls: RectHull[],
): string[] {
  const modelsWithLOS: string[] = [];

  // Get target model shapes once (reused for each attacker model)
  const targetShapes: ModelShape[] = targetModels.map(m => getModelShape(m));

  for (const attackerModel of attackerModels) {
    const attackerShape = getModelShape(attackerModel);

    // Check if this attacker model can see ANY target model
    let canSeeAnyTarget = false;
    for (let i = 0; i < targetModels.length; i++) {
      const targetShape = targetShapes[i];

      if (hasLOS(attackerShape, targetShape, terrain, vehicleHulls)) {
        canSeeAnyTarget = true;
        break; // Only need to see one target model
      }
    }

    if (canSeeAnyTarget) {
      modelsWithLOS.push(attackerModel.id);
    }
  }

  return modelsWithLOS;
}

// ─── Step 2: Weapon Range Check ──────────────────────────────────────────────

/**
 * Checks if any target model is within weapon range of the attacker model.
 *
 * Range is measured from base edge to base edge (closest points on model shapes).
 *
 * Reference: HH_Principles.md — "Measuring"
 * "the distance between the two Models is measured between the two closest
 * points on the two Models' Bases"
 *
 * @param attackerModelPosition - Position of the attacking model
 * @param targetModels - Models in the target unit (alive, deployed)
 * @param weaponRange - Maximum range of the weapon in inches
 * @returns True if at least one target model is within weapon range
 */
export function checkWeaponRange(
  attackerModelPosition: Position,
  targetModels: ModelState[],
  weaponRange: number,
  virtualRangeIncrease: number = 0,  // Legion tactica virtual range increase (e.g., Alpha Legion +2" treated as farther)
): boolean {
  // Apply legion tactica virtual range reduction (simulates target appearing farther away)
  const effectiveWeaponRange = weaponRange - virtualRangeIncrease;
  if (effectiveWeaponRange <= 0) return false;

  // Create a shape for the attacker model at its position
  // Using 32mm base as default (same as getModelShape)
  const attackerShape = createCircleBase(attackerModelPosition, 32);

  for (const targetModel of targetModels) {
    const targetShape = getModelShape(targetModel);
    const distance = distanceShapes(attackerShape, targetShape);

    if (distance <= effectiveWeaponRange) {
      return true; // At least one target model is in range
    }
  }

  return false;
}

// ─── Step 2: Vehicle Facing Determination ────────────────────────────────────

/**
 * Determines which armour facing of a target vehicle is targeted by the attack.
 *
 * The majority facing from attacker models with LOS determines the facing used.
 * Each attacker model's position is tested against the vehicle hull to determine
 * which arc it fires into. The facing with the most attacker models wins.
 *
 * If there's a tie, the defender (target unit controller) chooses. The default
 * resolution is Side, as this is the most common defender choice.
 *
 * Reference: HH_Principles.md — "Vehicles and Damage"
 * "The majority of the firing Unit's Models must be in the relevant Facing Arc"
 *
 * @param attackerModels - Attacker models with LOS (filtered by filterModelsWithLOS)
 * @param targetVehicleModel - The target vehicle's rectangular hull shape
 * @returns The VehicleFacing (Front, Side, or Rear) that the majority of attackers see
 */
export function determineTargetFacing(
  attackerModels: ModelState[],
  targetVehicleModel: RectHull,
): VehicleFacing {
  if (attackerModels.length === 0) {
    // No attacker models with LOS — default to Front
    return VehicleFacing.Front;
  }

  // Count how many attacker models see each facing
  const facingCounts: Record<VehicleFacing, number> = {
    [VehicleFacing.Front]: 0,
    [VehicleFacing.Side]: 0,
    [VehicleFacing.Rear]: 0,
  };

  for (const model of attackerModels) {
    const facing = determineVehicleFacing(targetVehicleModel, model.position);
    facingCounts[facing]++;
  }

  // Find the majority facing
  let maxCount = 0;
  let majorityFacing = VehicleFacing.Side; // Default if tied

  // Check Front first, then Rear, then Side (so ties fall through to Side default)
  const facings: VehicleFacing[] = [VehicleFacing.Front, VehicleFacing.Rear, VehicleFacing.Side];

  for (const facing of facings) {
    if (facingCounts[facing] > maxCount) {
      maxCount = facingCounts[facing];
      majorityFacing = facing;
    }
  }

  // Check for ties: if the winner ties with another facing, defender chooses → default Side
  const tiedFacings = facings.filter(f => facingCounts[f] === maxCount);
  if (tiedFacings.length > 1) {
    return VehicleFacing.Side;
  }

  return majorityFacing;
}
