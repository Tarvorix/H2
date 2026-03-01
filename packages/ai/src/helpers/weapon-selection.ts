/**
 * Weapon Selection Helper
 *
 * Handles AI weapon assignment for shooting attacks.
 * Determines which weapon each model should fire at the target.
 */

import type { GameState, UnitState } from '@hh/types';
import { getAliveModels, getClosestModelDistance, resolveWeaponAssignment } from '@hh/engine';
import type { StrategyMode } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WeaponAssignment {
  modelId: string;
  weaponId: string;
  profileName?: string;
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
  const targetDistance = getEstimatedTargetDistance(state, attackerUnit, targetUnit);
  if (targetDistance === null) return assignments;

  for (const model of aliveModels) {
    if (model.equippedWargear.length === 0) continue;

    const inRangeWeapons = model.equippedWargear
      .map((weaponId) => ({
        weaponId,
        profile: resolveWeaponAssignment({ modelId: model.id, weaponId }, attackerUnit),
      }))
      .filter(
        (
          candidate,
        ): candidate is { weaponId: string; profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>> } =>
          candidate.profile !== undefined &&
          (candidate.profile.hasTemplate || targetDistance <= candidate.profile.range),
      );
    if (inRangeWeapons.length === 0) continue;

    if (strategy === 'basic') {
      // Basic: pick the first valid in-range weapon.
      assignments.push({
        modelId: model.id,
        weaponId: inRangeWeapons[0].weaponId,
      });
    } else {
      // Tactical: score in-range weapons and choose the strongest expected option.
      const bestWeaponId = selectBestWeaponForTarget(inRangeWeapons);
      assignments.push({
        modelId: model.id,
        weaponId: bestWeaponId,
      });
    }
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
  candidates: { weaponId: string; profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>> }[],
): string {
  if (candidates.length === 0) return '';

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

  return best.weaponId;
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

  // Check if any alive model has at least one valid ranged weapon in range.
  const aliveModels = getAliveModels(attackerUnit);
  return aliveModels.some((model) =>
    model.equippedWargear.some((weaponId) => {
      const profile = resolveWeaponAssignment({ modelId: model.id, weaponId }, attackerUnit);
      if (!profile) return false;
      return profile.hasTemplate || distance <= profile.range;
    }),
  );
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
