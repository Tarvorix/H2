/**
 * Weapon Selection Helper
 *
 * Handles AI weapon assignment for shooting attacks.
 * Determines which weapon each model should fire at the target.
 */

import type { GameState, UnitState } from '@hh/types';
import {
  findDoorwayTerrain,
  getDoorwayDistanceForModel,
  getAliveModels,
  getClosestModelDistance,
  getModelsWithLOSToDoorway,
  getModelsWithLOSToUnit,
  getModelPsychicDisciplines,
  getWeaponSelectionOptions,
  isWeaponProfileInRange,
  resolveWeaponAssignment,
} from '@hh/engine';
import type { StrategyMode } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WeaponAssignment {
  modelId: string;
  weaponId: string;
  profileName?: string;
}

export function getAvailableRangedWeaponIdsForModel(model: UnitState['models'][number]): string[] {
  const weaponIds = new Set<string>(model.equippedWargear);

  for (const discipline of getModelPsychicDisciplines(model)) {
    for (const weapon of discipline.weapons) {
      weaponIds.add(weapon.id);
    }
  }

  return [...weaponIds];
}

// ─── Weapon Selection ────────────────────────────────────────────────────────

/**
 * Select weapons for a shooting attack.
 * Each alive model picks a weapon from their equipped wargear.
 *
 * For Basic strategy: each model fires their first equipped weapon.
 * For Tactical strategy: tries to match weapons to target characteristics.
 *
 * @param state - Current game state
 * @param attackerUnit - The unit shooting
 * @param targetUnit - The target unit
 * @param strategy - Which strategy mode to use
 * @returns Array of weapon assignments (one per model with a weapon)
 */
export function selectWeaponsForAttack(
  state: GameState,
  attackerUnit: UnitState,
  targetUnit: UnitState,
  strategy: StrategyMode,
): WeaponAssignment[] {
  const assignments: WeaponAssignment[] = [];
  const aliveModels = getAliveModels(attackerUnit);
  const modelsWithLos = new Set(getModelsWithLOSToUnit(state, attackerUnit.id, targetUnit.id).map((model) => model.id));
  if (modelsWithLos.size === 0) return assignments;
  const targetDistance = getEstimatedTargetDistance(state, attackerUnit, targetUnit);
  if (targetDistance === null) return assignments;

  for (const model of aliveModels) {
    if (!modelsWithLos.has(model.id)) continue;

    const candidateWeaponIds = getAvailableRangedWeaponIdsForModel(model);
    if (candidateWeaponIds.length === 0) continue;

    const inRangeWeapons = candidateWeaponIds
      .flatMap((weaponId) =>
        getWeaponSelectionOptions(
          { modelId: model.id, weaponId },
          attackerUnit,
          state,
          targetDistance,
        ).map((option) => ({
          assignment: option.assignment,
          profile: option.weaponProfile,
        })),
      )
      .filter(
        (
          candidate,
        ): candidate is {
          assignment: WeaponAssignment;
          profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>>;
        } =>
          candidate.profile !== undefined &&
          (candidate.profile.hasTemplate || isWeaponProfileInRange(candidate.profile, targetDistance)),
      );
    if (inRangeWeapons.length === 0) continue;

    if (strategy === 'basic') {
      // Basic: pick the first valid in-range weapon.
      assignments.push(inRangeWeapons[0].assignment);
    } else {
      // Tactical: score in-range weapons and choose the strongest expected option.
      const bestWeapon = selectBestWeaponForTarget(inRangeWeapons);
      assignments.push(bestWeapon);
    }
  }

  return assignments;
}

export function selectWeaponsForDoorwayAttack(
  state: GameState,
  attackerUnit: UnitState,
  doorwayId: string,
  strategy: StrategyMode,
): WeaponAssignment[] {
  const assignments: WeaponAssignment[] = [];
  const doorwayTerrain = findDoorwayTerrain(state, doorwayId);
  if (!doorwayTerrain) {
    return assignments;
  }

  const aliveModels = getAliveModels(attackerUnit);
  const modelsWithLos = new Set(getModelsWithLOSToDoorway(
    state,
    attackerUnit.id,
    doorwayId,
    doorwayTerrain,
  ));
  if (modelsWithLos.size === 0) {
    return assignments;
  }

  const targetDistance = aliveModels.reduce((closest, model) => (
    Math.min(closest, getDoorwayDistanceForModel(state, model, doorwayId, doorwayTerrain))
  ), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(targetDistance)) {
    return assignments;
  }

  for (const model of aliveModels) {
    if (!modelsWithLos.has(model.id)) continue;

    const inRangeWeapons = getInRangeWeaponOptions(
      state,
      attackerUnit,
      model.id,
      targetDistance,
    );
    if (inRangeWeapons.length === 0) continue;

    assignments.push(
      strategy === 'basic'
        ? inRangeWeapons[0].assignment
        : selectBestWeaponForTarget(inRangeWeapons),
    );
  }

  return assignments;
}

/**
 * Select the best weapon from a list for a given target.
 * Tactical heuristic: score each valid in-range profile and pick the highest.
 *
 * In a full integration with parsed datasheets, this would:
 * - Consider target profile details (T/Sv/AV)
 * - Compare against target T/Sv/AV
 * - Maximize expected damage output
 */
function selectBestWeaponForTarget(
  candidates: {
    assignment: WeaponAssignment;
    profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>>;
  }[],
): WeaponAssignment {
  if (candidates.length === 0) {
    return { modelId: '', weaponId: '' };
  }

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const score =
      candidate.profile.rangedStrength * 10 +
      candidate.profile.damage * 5 +
      candidate.profile.firepower +
      candidate.profile.range * 0.1 +
      (candidate.profile.hasTemplate ? 3 : 0);

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best.assignment;
}

/**
 * Check if an attacker unit has any models with weapons and the target is in range.
 * Uses the default 24" range for standard weapons.
 */
export function hasWeaponsInRange(
  state: GameState,
  attackerUnit: UnitState,
  targetUnitId: string,
  _defaultRange: number = 24,
): boolean {
  const targetUnit = state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === targetUnitId);
  if (!targetUnit) return false;

  const distance = getEstimatedTargetDistance(state, attackerUnit, targetUnit);
  if (distance === null) return false;

  const modelsWithLos = new Set(getModelsWithLOSToUnit(state, attackerUnit.id, targetUnit.id).map((model) => model.id));
  if (modelsWithLos.size === 0) return false;

  // Check if any alive model has at least one valid ranged weapon in range.
  const aliveModels = getAliveModels(attackerUnit);
  return aliveModels.some((model) =>
    modelsWithLos.has(model.id) &&
    getInRangeWeaponOptions(state, attackerUnit, model.id, distance).length > 0,
  );
}

export function hasWeaponsInRangeToDoorway(
  state: GameState,
  attackerUnit: UnitState,
  doorwayId: string,
): boolean {
  const doorwayTerrain = findDoorwayTerrain(state, doorwayId);
  if (!doorwayTerrain) {
    return false;
  }

  const aliveModels = getAliveModels(attackerUnit);
  const modelsWithLos = new Set(getModelsWithLOSToDoorway(
    state,
    attackerUnit.id,
    doorwayId,
    doorwayTerrain,
  ));
  if (modelsWithLos.size === 0) {
    return false;
  }

  return aliveModels.some((model) => {
    if (!modelsWithLos.has(model.id)) {
      return false;
    }

    const distance = getDoorwayDistanceForModel(state, model, doorwayId, doorwayTerrain);
    if (!Number.isFinite(distance)) {
      return false;
    }

    return getInRangeWeaponOptions(state, attackerUnit, model.id, distance).length > 0;
  });
}

/**
 * Mirror shooting validation distance conservatively so AI only selects
 * weapons that pass engine validation.
 */
function getEstimatedTargetDistance(
  state: GameState,
  attackerUnit: UnitState,
  targetUnit: UnitState,
): number | null {
  const closestDistance = getClosestModelDistance(state, attackerUnit.id, targetUnit.id);

  const attackerAlive = getAliveModels(attackerUnit);
  const targetAlive = getAliveModels(targetUnit);
  const firstAttacker = attackerAlive[0];
  const firstTarget = targetAlive[0];

  let firstModelDistance: number | null = null;
  if (firstAttacker && firstTarget) {
    const dx = firstAttacker.position.x - firstTarget.position.x;
    const dy = firstAttacker.position.y - firstTarget.position.y;
    firstModelDistance = Math.hypot(dx, dy);
  }

  if (closestDistance === null) return firstModelDistance;
  if (firstModelDistance === null) return closestDistance;
  return Math.max(closestDistance, firstModelDistance);
}

function getInRangeWeaponOptions(
  state: GameState,
  attackerUnit: UnitState,
  modelId: string,
  targetDistance: number,
): {
  assignment: WeaponAssignment;
  profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>>;
}[] {
  const model = attackerUnit.models.find((candidate) => candidate.id === modelId);
  if (!model) {
    return [];
  }

  return getAvailableRangedWeaponIdsForModel(model)
    .flatMap((weaponId) =>
      getWeaponSelectionOptions(
        { modelId, weaponId },
        attackerUnit,
        state,
        targetDistance,
      ).map((option) => ({
        assignment: option.assignment,
        profile: option.weaponProfile,
      })),
    )
    .filter(
      (
        candidate,
      ): candidate is {
        assignment: WeaponAssignment;
        profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>>;
      } =>
        candidate.profile !== undefined &&
        (candidate.profile.hasTemplate || isWeaponProfileInRange(candidate.profile, targetDistance)),
    );
}

/**
 * Estimate the expected damage output against a target.
 * Simplified formula for tactical target prioritization.
 *
 * @param modelCount - Number of attacking models
 * @param attackerBS - Ballistic skill (default 4)
 * @param weaponStrength - Weapon strength (default 4)
 * @param targetToughness - Target toughness (default 4)
 * @param targetSave - Target save value (default 3+)
 * @returns Estimated wounds caused
 */
export function estimateExpectedDamage(
  modelCount: number,
  attackerBS: number = 4,
  weaponStrength: number = 4,
  targetToughness: number = 4,
  targetSave: number = 3,
): number {
  // Hit probability: BS 4 = 3+ = 4/6, BS 3 = 4+ = 3/6, etc.
  const hitTarget = Math.max(2, Math.min(6, 7 - attackerBS));
  const hitProb = (7 - hitTarget) / 6;

  // Wound probability based on S vs T
  let woundTarget: number;
  if (weaponStrength >= targetToughness * 2) {
    woundTarget = 2;
  } else if (weaponStrength > targetToughness) {
    woundTarget = 3;
  } else if (weaponStrength === targetToughness) {
    woundTarget = 4;
  } else if (weaponStrength * 2 <= targetToughness) {
    woundTarget = 6;
  } else {
    woundTarget = 5;
  }
  const woundProb = (7 - woundTarget) / 6;

  // Save probability (assume standard save, no AP modifiers in estimate)
  const saveProb = (7 - targetSave) / 6;
  const failSaveProb = 1 - saveProb;

  return modelCount * hitProb * woundProb * failSaveProb;
}
