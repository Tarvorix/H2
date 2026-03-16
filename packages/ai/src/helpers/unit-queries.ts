/**
 * AI Unit Queries
 *
 * AI-specific query wrappers that compose engine queries.
 * These filter units by ownership, eligibility, and acted status.
 */

import type { GameState, UnitState, ModelState, Position, ObjectiveMarker } from '@hh/types';
import { GameMode, UnitMovementState } from '@hh/types';
import {
  canUnitMove,
  canUnitShoot,
  canUnitCharge,
  getDeployedUnits,
  getUnitsAwaitingReservesTest,
  getUnitsReadyToEnterFromReserves,
  getAliveModels,
  getDoorwayDistanceForModel,
  findUnit,
  findUnitPlayerIndex,
  findDoorwayTerrain,
  getModelStateBaseSizeMM,
  getModelsWithLOSToDoorway,
  getZoneMortalisMeasurementDistance,
  hasLOSToUnit,
  getClosestModelDistance,
  getModelMovement,
  getModelInitiative,
} from '@hh/engine';
import { EPSILON } from '@hh/geometry';

export interface ZoneMortalisDoorwayTarget {
  doorwayId: string;
  state: 'open' | 'closed' | 'destroyed';
  hullPoints: number;
  width: number;
}

export interface ZoneMortalisObjectiveTarget {
  objective: ObjectiveMarker;
  measuredDistance: number;
}

export interface ZoneMortalisDoorwayOperationTarget {
  doorwayId: string;
  desiredState: 'open' | 'closed';
  currentState: 'open' | 'closed';
}

function getDistanceFromPointToRectangle(
  point: Position,
  topLeft: Position,
  width: number,
  height: number,
): number {
  const dx = Math.max(topLeft.x - point.x, 0, point.x - (topLeft.x + width));
  const dy = Math.max(topLeft.y - point.y, 0, point.y - (topLeft.y + height));
  return Math.hypot(dx, dy);
}

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
  return getUnitsAwaitingReservesTest(army).filter((unit) => !actedIds.has(unit.id));
}

export function getReservesReadyUnits(
  state: GameState,
  playerIndex: number,
  actedIds: Set<string>,
): UnitState[] {
  const army = state.armies[playerIndex];
  return getUnitsReadyToEnterFromReserves(army).filter((unit) => !actedIds.has(unit.id));
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

export function getValidDoorwayShootingTargets(
  state: GameState,
  attackerUnitId: string,
): ZoneMortalisDoorwayTarget[] {
  if (state.gameMode !== GameMode.ZoneMortalis) {
    return [];
  }

  const attackerUnit = findUnit(state, attackerUnitId);
  if (!attackerUnit) {
    return [];
  }

  return (state.zoneMortalisState?.doorways ?? []).filter((doorway) => {
    if (doorway.state === 'destroyed' || doorway.hullPoints <= 0) {
      return false;
    }

    const terrain = findDoorwayTerrain(state, doorway.id ?? '');
    if (!terrain) {
      return false;
    }

    const modelsWithLos = getModelsWithLOSToDoorway(state, attackerUnitId, doorway.id ?? '', terrain);
    if (modelsWithLos.length === 0) {
      return false;
    }

    const distance = getAliveModels(attackerUnit).reduce((closest, model) => (
      Math.min(closest, getDoorwayDistanceForModel(state, model, doorway.id ?? '', terrain))
    ), Number.POSITIVE_INFINITY);

    return Number.isFinite(distance);
  }).map((doorway) => ({
    doorwayId: doorway.id ?? '',
    state: doorway.state,
    hullPoints: doorway.hullPoints,
    width: doorway.width,
  }));
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

export function getValidDoorwayChargeTargets(
  state: GameState,
  chargerUnitId: string,
): ZoneMortalisDoorwayTarget[] {
  if (state.gameMode !== GameMode.ZoneMortalis) {
    return [];
  }

  const chargerUnit = findUnit(state, chargerUnitId);
  if (!chargerUnit) {
    return [];
  }

  return (state.zoneMortalisState?.doorways ?? []).filter((doorway) => {
    if (doorway.state === 'destroyed' || doorway.hullPoints <= 0) {
      return false;
    }

    const terrain = findDoorwayTerrain(state, doorway.id ?? '');
    if (!terrain) {
      return false;
    }

    const modelsWithLos = getModelsWithLOSToDoorway(state, chargerUnitId, doorway.id ?? '', terrain);
    if (modelsWithLos.length === 0) {
      return false;
    }

    const distance = getAliveModels(chargerUnit).reduce((closest, model) => (
      Math.min(closest, getDoorwayDistanceForModel(state, model, doorway.id ?? '', terrain))
    ), Number.POSITIVE_INFINITY);

    return Number.isFinite(distance) && distance <= 12 + EPSILON;
  }).map((doorway) => ({
    doorwayId: doorway.id ?? '',
    state: doorway.state,
    hullPoints: doorway.hullPoints,
    width: doorway.width,
  }));
}

function isZoneMortalisUtilityEligibleUnit(unit: UnitState | null | undefined): unit is UnitState {
  return Boolean(
    unit &&
    unit.isDeployed &&
    unit.embarkedOnId === null &&
    !unit.isLockedInCombat &&
    getAliveModels(unit).length > 0,
  );
}

export function getZoneMortalisObjectiveInterfaceTargets(
  state: GameState,
  unitId: string,
): ZoneMortalisObjectiveTarget[] {
  if (
    state.gameMode !== GameMode.ZoneMortalis ||
    state.missionState?.missionId !== 'terminal-control'
  ) {
    return [];
  }

  const unit = findUnit(state, unitId);
  if (!isZoneMortalisUtilityEligibleUnit(unit)) {
    return [];
  }

  return (state.missionState?.objectives ?? []).map((objective) => {
    const measuredDistance = getAliveModels(unit).reduce((closest, model) => (
      Math.min(
        closest,
        getZoneMortalisMeasurementDistance(state, model.position, objective.position) ?? Number.POSITIVE_INFINITY,
      )
    ), Number.POSITIVE_INFINITY);
    return {
      objective,
      measuredDistance,
    };
  }).filter((candidate) => Number.isFinite(candidate.measuredDistance) && candidate.measuredDistance <= 3 + EPSILON);
}

export function getZoneMortalisOperableDoorways(
  state: GameState,
  unitId: string,
): ZoneMortalisDoorwayOperationTarget[] {
  if (state.gameMode !== GameMode.ZoneMortalis) {
    return [];
  }

  const unit = findUnit(state, unitId);
  if (!isZoneMortalisUtilityEligibleUnit(unit)) {
    return [];
  }

  const history = new Set(state.zoneMortalisState?.doorwayOperationHistory ?? []);
  const aliveModels = getAliveModels(unit);

  return (state.zoneMortalisState?.doorways ?? []).filter((doorway) => {
    if (!doorway.id || doorway.state === 'destroyed') {
      return false;
    }

    const terrain = findDoorwayTerrain(state, doorway.id);
    if (!terrain) {
      return false;
    }

    const historyKey = `${state.currentBattleTurn}:${state.activePlayerIndex}:${unitId}:${doorway.id}`;
    if (history.has(historyKey)) {
      return false;
    }

    const hasBaseContact = aliveModels.some((model) => {
      const radius = (getModelStateBaseSizeMM(model) / 25.4) / 2;
      return getDistanceFromPointToRectangle(
        model.position,
        terrain.shape.topLeft,
        terrain.shape.width,
        terrain.shape.height,
      ) <= radius + EPSILON;
    });
    if (!hasBaseContact) {
      return false;
    }

    return aliveModels.some((model) => {
      const radius = (getModelStateBaseSizeMM(model) / 25.4) / 2;
      return getDistanceFromPointToRectangle(
        model.position,
        terrain.shape.topLeft,
        terrain.shape.width,
        terrain.shape.height,
      ) <= radius + 2 + EPSILON;
    });
  }).map((doorway) => ({
    doorwayId: doorway.id ?? '',
    desiredState: doorway.state === 'open' ? 'closed' : 'open',
    currentState: doorway.state === 'open' ? 'open' : 'closed',
  }));
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
