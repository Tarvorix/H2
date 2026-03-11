import type { ModelState, UnitState } from '@hh/types';
import { ModelSubType, ModelType } from '@hh/types';
import { getAliveModels } from '../game-queries';
import {
  getModelType,
  getModelWounds,
  modelHasSubType,
} from '../profile-lookup';
import {
  getCurrentModelCool,
  getCurrentModelInitiative,
  getCurrentModelLeadership,
  getCurrentModelMovement,
} from '../runtime-characteristics';

function getAliveUnitModels(unit: UnitState): ModelState[] {
  return getAliveModels(unit);
}

function getControllingModelCandidates(unit: UnitState): ModelState[] {
  const aliveModels = getAliveUnitModels(unit);
  if (aliveModels.length === 0) {
    return [];
  }

  const paragonModels = aliveModels.filter((model) =>
    getModelType(model.unitProfileId, model.profileModelName) === ModelType.Paragon,
  );
  return paragonModels.length > 0 ? paragonModels : [aliveModels[0]];
}

function getHighestCandidateValue(
  unit: UnitState,
  getValue: (model: ModelState) => number,
): number {
  const candidates = getControllingModelCandidates(unit);
  if (candidates.length === 0) {
    return 0;
  }

  return Math.max(...candidates.map(getValue));
}

export function unitHasAnyHeavyModel(unit: UnitState): boolean {
  return getAliveUnitModels(unit).some((model) =>
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Heavy),
  );
}

export function unitHasOnlyHeavyModels(unit: UnitState): boolean {
  const aliveModels = getAliveUnitModels(unit);
  return aliveModels.length > 0 && aliveModels.every((model) =>
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Heavy),
  );
}

export function getUnitSetupMoveInitiative(unit: UnitState): number {
  return getHighestCandidateValue(unit, (model) =>
    getCurrentModelInitiative(unit, model),
  );
}

export function getUnitSetupMoveMovement(unit: UnitState): number {
  return getHighestCandidateValue(unit, (model) =>
    getCurrentModelMovement(unit, model),
  );
}

export function getUnitCoolForStatusChecks(unit: UnitState): number {
  let coolValue = getHighestCandidateValue(unit, (model) =>
    getCurrentModelCool(unit, model),
  );

  if (unitHasOnlyHeavyModels(unit)) {
    coolValue += 1;
  }

  return coolValue;
}

export function getUnitFallBackInitiative(unit: UnitState): number {
  return getHighestCandidateValue(unit, (model) =>
    getCurrentModelInitiative(unit, model),
  );
}

export function getUnitMajorityLeadership(unit: UnitState): number {
  const aliveModels = getAliveUnitModels(unit);
  if (aliveModels.length === 0) {
    return 0;
  }

  const leadershipCounts = new Map<number, number>();
  for (const model of aliveModels) {
    const leadership = getCurrentModelLeadership(unit, model);
    leadershipCounts.set(leadership, (leadershipCounts.get(leadership) ?? 0) + 1);
  }

  let bestLeadership = 0;
  let bestCount = 0;
  for (const [leadership, count] of leadershipCounts.entries()) {
    if (count > bestCount || (count === bestCount && leadership > bestLeadership)) {
      bestLeadership = leadership;
      bestCount = count;
    }
  }

  return bestLeadership;
}

export function getUnitLeaderLeadership(unit: UnitState): number | null {
  let bestLeadership: number | null = null;

  for (const model of getAliveUnitModels(unit)) {
    const qualifies =
      modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Command) ||
      modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Sergeant) ||
      getModelType(model.unitProfileId, model.profileModelName) === ModelType.Paragon;

    if (!qualifies) {
      continue;
    }

    const leadership = getCurrentModelLeadership(unit, model);
    if (bestLeadership === null || leadership > bestLeadership) {
      bestLeadership = leadership;
    }
  }

  return bestLeadership;
}

export function getUnitPanicLeadership(unit: UnitState): number {
  return Math.max(
    getUnitMajorityLeadership(unit),
    getUnitLeaderLeadership(unit) ?? 0,
  );
}

export function getModelCombatControlValue(model: ModelState): number {
  const modelType = getModelType(model.unitProfileId, model.profileModelName);
  if (modelType === ModelType.Walker || modelType === ModelType.Paragon) {
    return Math.max(1, getModelWounds(model.unitProfileId, model.profileModelName));
  }
  return 1;
}

export function getUnitCombatControlValue(unit: UnitState): number {
  return getAliveUnitModels(unit).reduce(
    (total, model) => total + getModelCombatControlValue(model),
    0,
  );
}
