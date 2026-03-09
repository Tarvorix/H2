import type { GameState, UnitState } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import { canUnitReact, getAliveModels, getClosestModelDistance, isVehicleUnit } from '@hh/engine';
import { getDecisionPlayerIndex } from '../state-utils';

export const GAMEPLAY_FEATURE_VERSION = 2;
export const GAMEPLAY_FEATURE_DIMENSION = 25;

function clampFeature(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function countAliveUnits(units: UnitState[]): number {
  return units.filter((unit) => getAliveModels(unit).length > 0).length;
}

function countAliveModels(units: UnitState[]): number {
  return units.reduce((sum, unit) => sum + getAliveModels(unit).length, 0);
}

function countAliveWounds(units: UnitState[]): number {
  return units.reduce(
    (sum, unit) =>
      sum + getAliveModels(unit).reduce((unitSum, model) => unitSum + Math.max(model.currentWounds, 0), 0),
    0,
  );
}

function countStatus(units: UnitState[], status: TacticalStatus): number {
  return units.reduce(
    (sum, unit) => sum + unit.statuses.filter((candidate) => candidate === status).length,
    0,
  );
}

function countLockedUnits(units: UnitState[]): number {
  return units.filter((unit) => unit.isLockedInCombat && getAliveModels(unit).length > 0).length;
}

function countReserves(units: UnitState[]): number {
  return units.filter((unit) => unit.isInReserves && getAliveModels(unit).length > 0).length;
}

function countEmbarkedUnits(units: UnitState[]): number {
  return units.filter((unit) => unit.embarkedOnId !== null && getAliveModels(unit).length > 0).length;
}

function countVehicleUnits(units: UnitState[]): number {
  return units.filter((unit) => isVehicleUnit(unit) && getAliveModels(unit).length > 0).length;
}

function countVehicleWounds(units: UnitState[]): number {
  return units.reduce((sum, unit) => {
    if (!isVehicleUnit(unit)) return sum;
    return sum + getAliveModels(unit).reduce(
      (unitSum, model) => unitSum + Math.max(model.currentWounds, 0),
      0,
    );
  }, 0);
}

function countReactionReadyUnits(units: UnitState[]): number {
  return units.filter((unit) => getAliveModels(unit).length > 0 && canUnitReact(unit)).length;
}

function countAliveWarlords(units: UnitState[]): number {
  return units.reduce(
    (sum, unit) => sum + getAliveModels(unit).filter((model) => model.isWarlord).length,
    0,
  );
}

function unitsNearCenter(state: GameState, units: UnitState[]): number {
  const centerX = state.battlefield.width / 2;
  const centerY = state.battlefield.height / 2;
  const radiusSq = 18 * 18;
  let count = 0;

  for (const unit of units) {
    for (const model of getAliveModels(unit)) {
      const dx = model.position.x - centerX;
      const dy = model.position.y - centerY;
      if ((dx * dx) + (dy * dy) <= radiusSq) {
        count += 1;
      }
    }
  }

  return count;
}

function countObjectivePresence(
  state: GameState,
  units: UnitState[],
  radius: number,
): number {
  const objectives = state.missionState?.objectives ?? [];
  if (objectives.length === 0) return 0;

  let controlCount = 0;
  for (const objective of objectives) {
    if (objective.isRemoved) continue;

    let hasModelInRange = false;
    for (const unit of units) {
      for (const model of getAliveModels(unit)) {
        const dx = model.position.x - objective.position.x;
        const dy = model.position.y - objective.position.y;
        if (Math.sqrt((dx * dx) + (dy * dy)) <= radius) {
          hasModelInRange = true;
          break;
        }
      }
      if (hasModelInRange) break;
    }

    if (hasModelInRange) {
      controlCount += 1;
    }
  }

  return controlCount;
}

function countObjectiveControl(state: GameState, units: UnitState[]): number {
  return countObjectivePresence(state, units, 3);
}

function countObjectiveContest(state: GameState, units: UnitState[]): number {
  return countObjectivePresence(state, units, 6);
}

function objectivePressure(state: GameState, units: UnitState[]): number {
  const objectives = state.missionState?.objectives ?? [];
  if (objectives.length === 0) return 0;

  let score = 0;
  for (const objective of objectives) {
    if (objective.isRemoved) continue;

    let closest = Infinity;
    for (const unit of units) {
      for (const model of getAliveModels(unit)) {
        const dx = model.position.x - objective.position.x;
        const dy = model.position.y - objective.position.y;
        closest = Math.min(closest, Math.sqrt((dx * dx) + (dy * dy)));
      }
    }

    if (Number.isFinite(closest)) {
      score += Math.max(0, 1 - (closest / 24));
    }
  }

  return objectives.length > 0 ? score / objectives.length : 0;
}

function threatProjectionScore(friendlyUnits: UnitState[], enemyUnits: UnitState[]): number {
  if (friendlyUnits.length === 0 || enemyUnits.length === 0) return 0;

  let total = 0;
  let counted = 0;

  for (const unit of friendlyUnits) {
    for (const model of getAliveModels(unit)) {
      let closest = Infinity;
      for (const enemyUnit of enemyUnits) {
        for (const enemyModel of getAliveModels(enemyUnit)) {
          const dx = model.position.x - enemyModel.position.x;
          const dy = model.position.y - enemyModel.position.y;
          closest = Math.min(closest, Math.sqrt((dx * dx) + (dy * dy)));
        }
      }

      if (Number.isFinite(closest)) {
        total += Math.max(0, 1 - (closest / 24));
        counted += 1;
      }
    }
  }

  return counted > 0 ? total / counted : 0;
}

function countUnitsWithEnemyWithinDistance(
  state: GameState,
  friendlyUnits: UnitState[],
  enemyUnits: UnitState[],
  distanceThreshold: number,
): number {
  if (friendlyUnits.length === 0 || enemyUnits.length === 0) return 0;

  return friendlyUnits.filter((unit) => {
    if (getAliveModels(unit).length === 0) return false;

    let closest = Infinity;
    for (const enemyUnit of enemyUnits) {
      if (getAliveModels(enemyUnit).length === 0) continue;
      const distance = getClosestModelDistance(state, unit.id, enemyUnit.id);
      if (distance !== null) {
        closest = Math.min(closest, distance);
      }
    }

    return Number.isFinite(closest) && closest <= distanceThreshold;
  }).length;
}

export function extractGameplayFeatures(
  state: GameState,
  playerIndex: number,
): Float32Array {
  const friendlyUnits = state.armies[playerIndex].units;
  const enemyUnits = state.armies[playerIndex === 0 ? 1 : 0].units;
  const friendlyAliveUnits = countAliveUnits(friendlyUnits);
  const enemyAliveUnits = countAliveUnits(enemyUnits);
  const friendlyAliveModels = countAliveModels(friendlyUnits);
  const enemyAliveModels = countAliveModels(enemyUnits);
  const friendlyAliveWounds = countAliveWounds(friendlyUnits);
  const enemyAliveWounds = countAliveWounds(enemyUnits);
  const objectiveCount = Math.max(1, state.missionState?.objectives?.filter((objective) => !objective.isRemoved).length ?? 0);
  const totalUnits = Math.max(1, friendlyUnits.length + enemyUnits.length);
  const aliveTotalUnits = Math.max(1, friendlyAliveUnits + enemyAliveUnits);
  const totalModels = Math.max(1, friendlyAliveModels + enemyAliveModels);
  const totalWounds = Math.max(1, friendlyAliveWounds + enemyAliveWounds);
  const totalVehicles = Math.max(1, countVehicleUnits(friendlyUnits) + countVehicleUnits(enemyUnits));
  const totalVehicleWounds = Math.max(1, countVehicleWounds(friendlyUnits) + countVehicleWounds(enemyUnits));
  const totalReactionAllotment = Math.max(
    1,
    state.armies[playerIndex].reactionAllotmentRemaining + state.armies[playerIndex === 0 ? 1 : 0].reactionAllotmentRemaining,
  );
  const decisionPlayerIndex = getDecisionPlayerIndex(state);
  const battleProgress = state.maxBattleTurns > 0
    ? state.currentBattleTurn / state.maxBattleTurns
    : 0;
  const friendlyObjectivePressure = objectivePressure(state, friendlyUnits);
  const enemyObjectivePressure = objectivePressure(state, enemyUnits);
  const friendlyCenterPresence = unitsNearCenter(state, friendlyUnits);
  const enemyCenterPresence = unitsNearCenter(state, enemyUnits);
  const friendlyThreatProjection = threatProjectionScore(friendlyUnits, enemyUnits);
  const enemyThreatProjection = threatProjectionScore(enemyUnits, friendlyUnits);
  const friendlyUnitsWithinChargeRange = countUnitsWithEnemyWithinDistance(state, friendlyUnits, enemyUnits, 12);
  const enemyUnitsWithinChargeRange = countUnitsWithEnemyWithinDistance(state, enemyUnits, friendlyUnits, 12);
  const friendlyUnitsWithinFireRange = countUnitsWithEnemyWithinDistance(state, friendlyUnits, enemyUnits, 24);
  const enemyUnitsWithinFireRange = countUnitsWithEnemyWithinDistance(state, enemyUnits, friendlyUnits, 24);

  // Feature order is versioned. Keep this stable unless GAMEPLAY_FEATURE_VERSION changes.
  return new Float32Array([
    clampFeature((friendlyAliveModels - enemyAliveModels) / totalModels),
    clampFeature((friendlyAliveWounds - enemyAliveWounds) / totalWounds),
    clampFeature((friendlyAliveUnits - enemyAliveUnits) / aliveTotalUnits),
    clampFeature((state.armies[playerIndex].victoryPoints - state.armies[playerIndex === 0 ? 1 : 0].victoryPoints) / 10),
    clampFeature((countObjectiveControl(state, friendlyUnits) - countObjectiveControl(state, enemyUnits)) / objectiveCount),
    clampFeature((countObjectiveContest(state, friendlyUnits) - countObjectiveContest(state, enemyUnits)) / objectiveCount),
    clampFeature(friendlyObjectivePressure - enemyObjectivePressure),
    clampFeature((friendlyCenterPresence - enemyCenterPresence) / totalModels),
    clampFeature(friendlyThreatProjection - enemyThreatProjection),
    clampFeature((countReserves(enemyUnits) - countReserves(friendlyUnits)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Pinned) - countStatus(friendlyUnits, TacticalStatus.Pinned)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Suppressed) - countStatus(friendlyUnits, TacticalStatus.Suppressed)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Stunned) - countStatus(friendlyUnits, TacticalStatus.Stunned)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Routed) - countStatus(friendlyUnits, TacticalStatus.Routed)) / totalUnits),
    clampFeature((countLockedUnits(enemyUnits) - countLockedUnits(friendlyUnits)) / totalUnits),
    clampFeature((countEmbarkedUnits(friendlyUnits) - countEmbarkedUnits(enemyUnits)) / totalUnits),
    clampFeature((countVehicleUnits(friendlyUnits) - countVehicleUnits(enemyUnits)) / totalVehicles),
    clampFeature((countVehicleWounds(friendlyUnits) - countVehicleWounds(enemyUnits)) / totalVehicleWounds),
    clampFeature((state.armies[playerIndex].reactionAllotmentRemaining - state.armies[playerIndex === 0 ? 1 : 0].reactionAllotmentRemaining) / totalReactionAllotment),
    clampFeature((countReactionReadyUnits(friendlyUnits) - countReactionReadyUnits(enemyUnits)) / aliveTotalUnits),
    clampFeature(countAliveWarlords(friendlyUnits) - countAliveWarlords(enemyUnits)),
    clampFeature((friendlyUnitsWithinChargeRange - enemyUnitsWithinChargeRange) / aliveTotalUnits),
    clampFeature((friendlyUnitsWithinFireRange - enemyUnitsWithinFireRange) / aliveTotalUnits),
    decisionPlayerIndex === playerIndex ? 1 : -1,
    clampFeature((battleProgress * 2) - 1),
  ]);
}
