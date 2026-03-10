import type { GameState, UnitState } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import { canUnitReact, getAliveModels, getClosestModelDistance, isVehicleUnit } from '@hh/engine';
import { getDecisionPlayerIndex } from '../state-utils';
import { summarizeTacticalBalance } from './tactical-signals';

export const GAMEPLAY_FEATURE_VERSION = 4;
export const GAMEPLAY_FEATURE_DIMENSION = 50;

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
  const friendlyThreatProjection = threatProjectionScore(friendlyUnits, enemyUnits);
  const enemyThreatProjection = threatProjectionScore(enemyUnits, friendlyUnits);
  const friendlyUnitsWithinChargeRange = countUnitsWithEnemyWithinDistance(state, friendlyUnits, enemyUnits, 12);
  const enemyUnitsWithinChargeRange = countUnitsWithEnemyWithinDistance(state, enemyUnits, friendlyUnits, 12);
  const tacticalBalance = summarizeTacticalBalance(state, playerIndex);
  const { friendly, enemy } = tacticalBalance;

  // Feature order is versioned. Keep this stable unless GAMEPLAY_FEATURE_VERSION changes.
  return new Float32Array([
    clampFeature((friendlyAliveModels - enemyAliveModels) / totalModels),
    clampFeature((friendlyAliveWounds - enemyAliveWounds) / totalWounds),
    clampFeature((friendlyAliveUnits - enemyAliveUnits) / aliveTotalUnits),
    clampFeature((state.armies[playerIndex].victoryPoints - state.armies[playerIndex === 0 ? 1 : 0].victoryPoints) / 10),
    clampFeature((friendly.controlledObjectiveCount - enemy.controlledObjectiveCount) / objectiveCount),
    clampFeature((friendly.contestedObjectiveCount - enemy.contestedObjectiveCount) / objectiveCount),
    clampFeature((friendly.controlledObjectiveVp - enemy.controlledObjectiveVp) / (objectiveCount * 3)),
    clampFeature((friendly.contestedObjectiveVp - enemy.contestedObjectiveVp) / (objectiveCount * 3)),
    clampFeature((friendly.objectiveTacticalStrength - enemy.objectiveTacticalStrength) / totalModels),
    clampFeature((friendly.objectiveControlMargin - enemy.objectiveControlMargin) / totalModels),
    clampFeature((friendly.durableControlledVp - enemy.durableControlledVp) / (objectiveCount * 3)),
    clampFeature((enemy.threatenedControlledVp - friendly.threatenedControlledVp) / (objectiveCount * 3)),
    clampFeature((friendly.flippableEnemyVp - enemy.flippableEnemyVp) / (objectiveCount * 3)),
    clampFeature((friendly.reachableObjectiveVp - enemy.reachableObjectiveVp) / (objectiveCount * 3)),
    clampFeature((friendly.projectedScoringSwing - enemy.projectedScoringSwing) / (objectiveCount * 4)),
    clampFeature((friendly.scoringUnitCount - enemy.scoringUnitCount) / aliveTotalUnits),
    clampFeature((friendly.scoringUnitValue - enemy.scoringUnitValue) / 80),
    clampFeature((friendly.readyScoringUnitValue - enemy.readyScoringUnitValue) / 80),
    clampFeature(countAliveWarlords(friendlyUnits) - countAliveWarlords(enemyUnits)),
    clampFeature((state.armies[playerIndex].reactionAllotmentRemaining - state.armies[playerIndex === 0 ? 1 : 0].reactionAllotmentRemaining) / totalReactionAllotment),
    clampFeature((countReactionReadyUnits(friendlyUnits) - countReactionReadyUnits(enemyUnits)) / aliveTotalUnits),
    clampFeature((countReserves(enemyUnits) - countReserves(friendlyUnits)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Pinned) - countStatus(friendlyUnits, TacticalStatus.Pinned)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Suppressed) - countStatus(friendlyUnits, TacticalStatus.Suppressed)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Stunned) - countStatus(friendlyUnits, TacticalStatus.Stunned)) / totalUnits),
    clampFeature((countStatus(enemyUnits, TacticalStatus.Routed) - countStatus(friendlyUnits, TacticalStatus.Routed)) / totalUnits),
    clampFeature((countLockedUnits(enemyUnits) - countLockedUnits(friendlyUnits)) / totalUnits),
    clampFeature((countEmbarkedUnits(friendlyUnits) - countEmbarkedUnits(enemyUnits)) / totalUnits),
    clampFeature((countVehicleUnits(friendlyUnits) - countVehicleUnits(enemyUnits)) / totalVehicles),
    clampFeature((countVehicleWounds(friendlyUnits) - countVehicleWounds(enemyUnits)) / totalVehicleWounds),
    clampFeature(friendlyThreatProjection - enemyThreatProjection),
    clampFeature((friendlyUnitsWithinChargeRange - enemyUnitsWithinChargeRange) / aliveTotalUnits),
    clampFeature((friendly.bestRangedVsObjectiveHolders - enemy.bestRangedVsObjectiveHolders) / 8),
    clampFeature((friendly.bestMeleeVsObjectiveHolders - enemy.bestMeleeVsObjectiveHolders) / 8),
    clampFeature((friendly.bestRangedVsScorers - enemy.bestRangedVsScorers) / 8),
    clampFeature((friendly.bestMeleeVsScorers - enemy.bestMeleeVsScorers) / 8),
    clampFeature((friendly.bestRangedVsHighValueTargets - enemy.bestRangedVsHighValueTargets) / 10),
    clampFeature((friendly.bestMeleeVsHighValueTargets - enemy.bestMeleeVsHighValueTargets) / 10),
    clampFeature((friendly.objectiveHoldDurability - enemy.objectiveHoldDurability) / 24),
    clampFeature((enemy.exposedObjectiveHolderValue - friendly.exposedObjectiveHolderValue) / 24),
    clampFeature((enemy.exposedScoringValue - friendly.exposedScoringValue) / 30),
    clampFeature((enemy.exposedHighValueValue - friendly.exposedHighValueValue) / 30),
    clampFeature((enemy.retaliationPressure - friendly.retaliationPressure) / 40),
    clampFeature((enemy.warlordExposureValue - friendly.warlordExposureValue) / 20),
    clampFeature((enemy.transportPayloadExposure - friendly.transportPayloadExposure) / 30),
    clampFeature((friendly.transportDeliveryValue - enemy.transportDeliveryValue) / 30),
    clampFeature((friendly.antiVehicleRangedPressure - enemy.antiVehicleRangedPressure) / 8),
    clampFeature((friendly.antiVehicleMeleePressure - enemy.antiVehicleMeleePressure) / 8),
    decisionPlayerIndex === playerIndex ? 1 : -1,
    clampFeature((battleProgress * 2) - 1),
  ]);
}
