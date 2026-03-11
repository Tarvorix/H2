/**
 * AI Unit Queries
 *
 * AI-specific query wrappers that compose engine queries.
 * These filter units by ownership, eligibility, and acted status.
 */

import type { GameState, UnitState, ModelState, Position } from '@hh/types';
import { UnitMovementState } from '@hh/types';
import {
  canUnitMove,
  canUnitShoot,
  canUnitCharge,
  getDeployedUnits,
  getUnitsInReserves,
  getAliveModels,
  findUnit,
  findUnitPlayerIndex,
  hasLOSToUnit,
  getClosestModelDistance,
  getModelMovement,
  getModelInitiative,
} from '@hh/engine';

// ─── Movement Queries ────────────────────────────────────────────────────────

/**
 * Get all units owned by the AI that can still move in the current sub-phase.
 * Filters out units that have already been issued move commands (in actedIds).
 */
export function getMovableUnits(
  state: GameState,
  playerIndex: number,
  actedIds: Set<string>,
): UnitState[] {
  const army = state.armies[playerIndex];
  return getDeployedUnits(army).filter(
    (unit) =>
      canUnitMove(unit) &&
      (
        unit.movementState === UnitMovementState.Stationary
        || unit.movementState === UnitMovementState.RushDeclared
      ) &&
      !actedIds.has(unit.id),
  );
}

/**
 * Get units in reserves for the given player that haven't been tested yet.
 */
export function getReservesUnits(
  state: GameState,
  playerIndex: number,
  actedIds: Set<string>,
): UnitState[] {
  const army = state.armies[playerIndex];
  return getUnitsInReserves(army).filter((unit) => !actedIds.has(unit.id));
}

// ─── Shooting Queries ────────────────────────────────────────────────────────

/**
 * Get all units owned by the AI that can still shoot.
 * Filters out units that have already shot (in actedIds).
 */
export function getShootableUnits(
  state: GameState,
  playerIndex: number,
  actedIds: Set<string>,
): UnitState[] {
  const army = state.armies[playerIndex];
  return getDeployedUnits(army).filter(
    (unit) => canUnitShoot(unit) && !actedIds.has(unit.id),
  );
}

/**
 * Get valid enemy targets for a shooting attack.
 * Must be enemy, deployed, alive, not embarked, and the attacker must have LOS.
 */
export function getValidShootingTargets(
  state: GameState,
  attackerUnitId: string,
): UnitState[] {
  const attackerPlayerIndex = findUnitPlayerIndex(state, attackerUnitId);
  if (attackerPlayerIndex === undefined) return [];

  const enemyIndex = attackerPlayerIndex === 0 ? 1 : 0;
  const enemyArmy = state.armies[enemyIndex];

  return getDeployedUnits(enemyArmy).filter((enemyUnit) => {
    // Must be alive (at least one alive model)
    if (getAliveModels(enemyUnit).length === 0) return false;
    // Must not be embarked
    if (enemyUnit.embarkedOnId !== null) return false;
    // Attacker must have LOS
    if (!hasLOSToUnit(state, attackerUnitId, enemyUnit.id)) return false;
    return true;
  });
}

// ─── Assault Queries ─────────────────────────────────────────────────────────

/**
 * Get all units owned by the AI that can still charge.
 * Filters out units that have already charged (in actedIds).
 */
export function getChargeableUnits(
  state: GameState,
  playerIndex: number,
  actedIds: Set<string>,
): UnitState[] {
  const army = state.armies[playerIndex];
  return getDeployedUnits(army).filter(
    (unit) => canUnitCharge(unit) && !actedIds.has(unit.id),
  );
}

/**
 * Get valid enemy targets for a charge.
 * Must be enemy, deployed, alive, within 12", and charger must have LOS.
 */
export function getValidChargeTargets(
  state: GameState,
  chargerUnitId: string,
): UnitState[] {
  const chargerPlayerIndex = findUnitPlayerIndex(state, chargerUnitId);
  if (chargerPlayerIndex === undefined) return [];

  const enemyIndex = chargerPlayerIndex === 0 ? 1 : 0;
  const enemyArmy = state.armies[enemyIndex];

  return getDeployedUnits(enemyArmy).filter((enemyUnit) => {
    if (getAliveModels(enemyUnit).length === 0) return false;
    if (enemyUnit.embarkedOnId !== null) return false;
    // Must be within 12"
    const distance = getClosestModelDistance(state, chargerUnitId, enemyUnit.id);
    if (distance === null || distance > 12) return false;
    // Must have LOS
    if (!hasLOSToUnit(state, chargerUnitId, enemyUnit.id)) return false;
    return true;
  });
}

// ─── Utility Queries ─────────────────────────────────────────────────────────

/**
 * Get the equipped ranged weapon IDs for models in a unit.
 * Returns the weapon IDs from each alive model's equippedWargear.
 * In the current system, all equipped wargear IDs can potentially be ranged weapons.
 */
export function getUnitEquippedWeapons(unit: UnitState): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const model of getAliveModels(unit)) {
    result.set(model.id, [...model.equippedWargear]);
  }
  return result;
}

/**
 * Get the movement characteristic for a model from its profile.
 * Falls back to 7" via engine profile lookup if profile data is unavailable.
 */
export function getModelMovementCharacteristic(model: ModelState): number {
  return getModelMovement(model.unitProfileId, model.profileModelName);
}

/**
 * Get the initiative characteristic for a model from its profile.
 */
export function getModelInitiativeCharacteristic(model: ModelState): number {
  return getModelInitiative(model.unitProfileId, model.profileModelName);
}

/**
 * Calculate the centroid (average position) of alive models in a unit.
 */
export function getUnitCentroid(unit: UnitState): Position | null {
  const alive = getAliveModels(unit);
  if (alive.length === 0) return null;

  const sumX = alive.reduce((acc, m) => acc + m.position.x, 0);
  const sumY = alive.reduce((acc, m) => acc + m.position.y, 0);

  return {
    x: sumX / alive.length,
    y: sumY / alive.length,
  };
}

/**
 * Get enemy deployed units for a given player.
 */
export function getEnemyDeployedUnits(state: GameState, playerIndex: number): UnitState[] {
  const enemyIndex = playerIndex === 0 ? 1 : 0;
  return getDeployedUnits(state.armies[enemyIndex]);
}

/**
 * Find a unit and verify it belongs to the specified player.
 */
export function findOwnedUnit(
  state: GameState,
  unitId: string,
  playerIndex: number,
): UnitState | null {
  const unit = findUnit(state, unitId);
  if (!unit) return null;
  const ownerIndex = findUnitPlayerIndex(state, unitId);
  if (ownerIndex !== playerIndex) return null;
  return unit;
}
