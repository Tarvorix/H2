/**
 * Objective Control Queries.
 * Pure read-only functions for determining objective control.
 *
 * Reference: HH_Battle_AOD.md — "Objectives", "Tactical Strength",
 *   "Objective Control", "Contested Objectives"
 */

import type {
  GameState,
  UnitState,
  ModelState,
  ObjectiveMarker,
  SpecialRuleRef,
} from '@hh/types';
import { ModelType } from '@hh/types';
import {
  getUnitSpecialRules,
  lookupModelDefinition,
  lookupUnitProfile,
} from '../profile-lookup';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Objective control range in inches */
export const OBJECTIVE_CONTROL_RANGE = 3;

// ─── Special Rule Helpers ───────────────────────────────────────────────────

function parseNumericRuleValue(
  specialRules: SpecialRuleRef[],
  ruleName: string,
): number | null {
  const matches = specialRules.filter(
    (rule) => rule.name.toLowerCase() === ruleName.toLowerCase(),
  );
  if (matches.length === 0) return null;

  let parsedValue: number | null = null;
  for (const rule of matches) {
    if (!rule.value) {
      parsedValue = 0;
      continue;
    }

    const match = rule.value.match(/-?\d+(\.\d+)?/);
    if (!match) {
      parsedValue = 0;
      continue;
    }

    const parsed = Number.parseFloat(match[0]);
    if (Number.isFinite(parsed)) {
      parsedValue = parsed;
    }
  }

  return parsedValue;
}

function getModelInheritedSpecialRules(
  unit: UnitState,
  model: ModelState,
): SpecialRuleRef[] {
  const unitRules = getUnitSpecialRules(unit.profileId);
  const modelRules = lookupModelDefinition(unit.profileId, model.profileModelName)?.specialRules ?? [];
  return [...unitRules, ...modelRules];
}

function getModelRuleValue(
  unit: UnitState,
  model: ModelState,
  ruleName: string,
): number | null {
  return parseNumericRuleValue(getModelInheritedSpecialRules(unit, model), ruleName);
}

function getAliveModels(unit: UnitState): ModelState[] {
  return unit.models.filter((model) => !model.isDestroyed);
}

export interface UnitObjectiveRuleSummary {
  lineMajorityValue: number | null;
  supportUnitCap: number | null;
  vanguardMajorityValue: number | null;
}

function summarizeUnitObjectiveRules(unit: UnitState): UnitObjectiveRuleSummary {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return {
      lineMajorityValue: null,
      supportUnitCap: null,
      vanguardMajorityValue: null,
    };
  }

  const countMajorityValue = (ruleName: string): number | null => {
    const values = aliveModels
      .map((model) => getModelRuleValue(unit, model, ruleName))
      .filter((value): value is number => value !== null && value > 0);

    if (values.length <= aliveModels.length / 2) {
      return null;
    }

    return values.reduce((maximum, value) => Math.max(maximum, value), 0);
  };

  const supportCaps = aliveModels
    .map((model) => getModelRuleValue(unit, model, 'Support Unit'))
    .filter((value): value is number => value !== null && value >= 0);

  return {
    lineMajorityValue: countMajorityValue('Line'),
    supportUnitCap: supportCaps.length > 0
      ? supportCaps.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY)
      : null,
    vanguardMajorityValue: countMajorityValue('Vanguard'),
  };
}

export function getUnitObjectiveRuleSummary(unit: UnitState): UnitObjectiveRuleSummary {
  return summarizeUnitObjectiveRules(unit);
}

// ─── Model Eligibility ───────────────────────────────────────────────────────

/**
 * Check if a model can hold an objective.
 *
 * A model CANNOT hold objectives if:
 * - Its unit has any Tactical Status (Pinned, Suppressed, Stunned, Routed, etc.)
 * - Its unit is locked in combat
 * - The model is embarked in a transport
 * - The model is a Vehicle, Cavalry, or Automata (unless it has Line sub-type)
 *
 * Reference: HH_Battle_AOD.md — "Objective Control: Eligible Models"
 *
 * @param model - The model to check
 * @param unit - The unit the model belongs to
 * @returns true if the model can hold objectives
 */
export function canModelHoldObjective(
  model: ModelState,
  unit: UnitState,
): boolean {
  // Destroyed models can't hold
  if (model.isDestroyed) return false;

  // Units with ANY tactical status cannot hold objectives
  if (unit.statuses.length > 0) return false;

  // Units locked in combat cannot hold objectives
  if (unit.isLockedInCombat) return false;

  // Embarked models cannot hold objectives
  if (unit.embarkedOnId !== null) return false;

  // Models in reserves cannot hold objectives
  if (unit.isInReserves) return false;

  const profile = lookupUnitProfile(unit.profileId);
  if (
    profile
    && [ModelType.Vehicle, ModelType.Cavalry, ModelType.Automata].includes(profile.unitType)
    && (getModelRuleValue(unit, model, 'Line') ?? 0) <= 0
  ) {
    return false;
  }

  return true;
}

/**
 * Get all models within objective control range for a specific player.
 *
 * @param state - Current game state
 * @param objective - The objective marker
 * @param playerIndex - Which player's models to check
 * @returns Array of { model, unit } pairs within range
 */
export function getModelsWithinObjectiveRange(
  state: GameState,
  objective: ObjectiveMarker,
  playerIndex: number,
): { model: ModelState; unit: UnitState }[] {
  const army = state.armies[playerIndex];
  const result: { model: ModelState; unit: UnitState }[] = [];

  for (const unit of army.units) {
    for (const model of unit.models) {
      if (model.isDestroyed) continue;

      const dx = model.position.x - objective.position.x;
      const dy = model.position.y - objective.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= OBJECTIVE_CONTROL_RANGE) {
        result.push({ model, unit });
      }
    }
  }

  return result;
}

// ─── Tactical Strength ───────────────────────────────────────────────────────

export interface ObjectiveContestingUnit {
  playerIndex: number;
  unitId: string;
  tacticalStrength: number;
  eligibleModelCount: number;
  lineMajorityValue: number | null;
  supportUnitCap: number | null;
  vanguardMajorityValue: number | null;
}

interface ObjectiveAssignmentPlan {
  objectiveToUnitId: Record<string, string | null>;
  signature: string;
}

interface ObjectiveAssignmentEvaluation {
  objectiveResults: Record<string, ObjectiveControlResult>;
  totalVictoryPoints: number;
  controlledObjectiveCount: number;
}

export interface ObjectiveScoringResolution {
  scoringPlayerIndex: number;
  objectiveResults: Record<string, ObjectiveControlResult>;
  playerAssignments: [Record<string, string | null>, Record<string, string | null>];
  totalVictoryPoints: number;
}

export function getUnitTacticalStrengthAtObjective(
  unit: UnitState,
  objective: ObjectiveMarker,
): number {
  let strength = 0;

  for (const model of unit.models) {
    if (!canModelHoldObjective(model, unit)) continue;

    const dx = model.position.x - objective.position.x;
    const dy = model.position.y - objective.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > OBJECTIVE_CONTROL_RANGE) continue;

    strength += 1 + Math.max(0, getModelRuleValue(unit, model, 'Line') ?? 0);
  }

  return strength;
}

export function getContestingUnitsAtObjective(
  state: GameState,
  objective: ObjectiveMarker,
  playerIndex: number,
): ObjectiveContestingUnit[] {
  const army = state.armies[playerIndex];
  const result: ObjectiveContestingUnit[] = [];

  for (const unit of army.units) {
    const tacticalStrength = getUnitTacticalStrengthAtObjective(unit, objective);
    if (tacticalStrength <= 0) continue;

    const eligibleModelCount = unit.models.filter((model) => {
      if (!canModelHoldObjective(model, unit)) return false;
      const dx = model.position.x - objective.position.x;
      const dy = model.position.y - objective.position.y;
      return Math.sqrt(dx * dx + dy * dy) <= OBJECTIVE_CONTROL_RANGE;
    }).length;

    const rules = summarizeUnitObjectiveRules(unit);
    result.push({
      playerIndex,
      unitId: unit.id,
      tacticalStrength,
      eligibleModelCount,
      lineMajorityValue: rules.lineMajorityValue,
      supportUnitCap: rules.supportUnitCap,
      vanguardMajorityValue: rules.vanguardMajorityValue,
    });
  }

  return result.sort((left, right) => {
    if (right.tacticalStrength !== left.tacticalStrength) {
      return right.tacticalStrength - left.tacticalStrength;
    }

    const leftScoreValue = getObjectiveScoringValueForUnit(
      findUnitById(state, left.unitId) ?? null,
      objective,
    );
    const rightScoreValue = getObjectiveScoringValueForUnit(
      findUnitById(state, right.unitId) ?? null,
      objective,
    );
    if (rightScoreValue !== leftScoreValue) {
      return rightScoreValue - leftScoreValue;
    }

    return left.unitId.localeCompare(right.unitId);
  });
}

function findUnitById(state: GameState, unitId: string): UnitState | null {
  for (const army of state.armies) {
    const unit = army.units.find((candidate) => candidate.id === unitId);
    if (unit) return unit;
  }
  return null;
}

function getObjectiveCandidateLookup(
  state: GameState,
  objective: ObjectiveMarker,
  playerIndex: number,
): Map<string, ObjectiveContestingUnit> {
  return new Map(
    getContestingUnitsAtObjective(state, objective, playerIndex).map((unit) => [unit.unitId, unit]),
  );
}

function buildObjectiveAssignmentPlans(
  objectiveIds: string[],
  candidateUnitIdsByObjective: Record<string, string[]>,
): ObjectiveAssignmentPlan[] {
  const plans: ObjectiveAssignmentPlan[] = [];
  const currentAssignments: Record<string, string | null> = {};
  const usedUnitIds = new Set<string>();

  const visit = (objectiveIndex: number): void => {
    if (objectiveIndex >= objectiveIds.length) {
      const objectiveToUnitId: Record<string, string | null> = {};
      for (const objectiveId of objectiveIds) {
        objectiveToUnitId[objectiveId] = currentAssignments[objectiveId] ?? null;
      }
      const signature = objectiveIds
        .map((objectiveId) => `${objectiveId}:${objectiveToUnitId[objectiveId] ?? '-'}`)
        .join('|');
      plans.push({ objectiveToUnitId, signature });
      return;
    }

    const objectiveId = objectiveIds[objectiveIndex];
    currentAssignments[objectiveId] = null;
    visit(objectiveIndex + 1);

    const candidateUnitIds = candidateUnitIdsByObjective[objectiveId] ?? [];
    for (const unitId of candidateUnitIds) {
      if (usedUnitIds.has(unitId)) continue;
      usedUnitIds.add(unitId);
      currentAssignments[objectiveId] = unitId;
      visit(objectiveIndex + 1);
      usedUnitIds.delete(unitId);
    }
  };

  visit(0);
  return plans;
}

function evaluateObjectiveAssignmentPair(
  state: GameState,
  objectives: ObjectiveMarker[],
  scoringPlayerIndex: number,
  playerPlans: [ObjectiveAssignmentPlan, ObjectiveAssignmentPlan],
  playerCandidateLookups: [Record<string, Map<string, ObjectiveContestingUnit>>, Record<string, Map<string, ObjectiveContestingUnit>>],
): ObjectiveAssignmentEvaluation {
  const objectiveResults: Record<string, ObjectiveControlResult> = {};
  let totalVictoryPoints = 0;
  let controlledObjectiveCount = 0;

  for (const objective of objectives) {
    const p0AssignedUnitId = playerPlans[0].objectiveToUnitId[objective.id] ?? null;
    const p1AssignedUnitId = playerPlans[1].objectiveToUnitId[objective.id] ?? null;
    const p0AssignedUnit = p0AssignedUnitId
      ? playerCandidateLookups[0][objective.id]?.get(p0AssignedUnitId) ?? null
      : null;
    const p1AssignedUnit = p1AssignedUnitId
      ? playerCandidateLookups[1][objective.id]?.get(p1AssignedUnitId) ?? null
      : null;

    let result: ObjectiveControlResult;
    if (!p0AssignedUnit && !p1AssignedUnit) {
      result = {
        controllerPlayerIndex: null,
        controllingUnitId: null,
        isContested: false,
        player0Strength: 0,
        player1Strength: 0,
      };
    } else if (p0AssignedUnit && !p1AssignedUnit) {
      result = {
        controllerPlayerIndex: 0,
        controllingUnitId: p0AssignedUnit.unitId,
        isContested: false,
        player0Strength: p0AssignedUnit.tacticalStrength,
        player1Strength: 0,
      };
    } else if (!p0AssignedUnit && p1AssignedUnit) {
      result = {
        controllerPlayerIndex: 1,
        controllingUnitId: p1AssignedUnit.unitId,
        isContested: false,
        player0Strength: 0,
        player1Strength: p1AssignedUnit.tacticalStrength,
      };
    } else if (p0AssignedUnit!.tacticalStrength === p1AssignedUnit!.tacticalStrength) {
      result = {
        controllerPlayerIndex: null,
        controllingUnitId: null,
        isContested: true,
        player0Strength: p0AssignedUnit!.tacticalStrength,
        player1Strength: p1AssignedUnit!.tacticalStrength,
      };
    } else {
      const controllerPlayerIndex = p0AssignedUnit!.tacticalStrength > p1AssignedUnit!.tacticalStrength ? 0 : 1;
      const controllingUnitId = controllerPlayerIndex === 0 ? p0AssignedUnit!.unitId : p1AssignedUnit!.unitId;
      result = {
        controllerPlayerIndex,
        controllingUnitId,
        isContested: false,
        player0Strength: p0AssignedUnit!.tacticalStrength,
        player1Strength: p1AssignedUnit!.tacticalStrength,
      };
    }

    objectiveResults[objective.id] = result;

    if (result.controllerPlayerIndex === scoringPlayerIndex && result.controllingUnitId) {
      const controllingUnit = findUnitById(state, result.controllingUnitId);
      totalVictoryPoints += getObjectiveScoringValueForUnit(controllingUnit, objective);
      controlledObjectiveCount += 1;
    }
  }

  return {
    objectiveResults,
    totalVictoryPoints,
    controlledObjectiveCount,
  };
}

function comparePreferredEvaluation(
  left: { evaluation: ObjectiveAssignmentEvaluation; plan: ObjectiveAssignmentPlan },
  right: { evaluation: ObjectiveAssignmentEvaluation; plan: ObjectiveAssignmentPlan },
): number {
  if (left.evaluation.totalVictoryPoints !== right.evaluation.totalVictoryPoints) {
    return left.evaluation.totalVictoryPoints - right.evaluation.totalVictoryPoints;
  }

  if (left.evaluation.controlledObjectiveCount !== right.evaluation.controlledObjectiveCount) {
    return left.evaluation.controlledObjectiveCount - right.evaluation.controlledObjectiveCount;
  }

  return right.plan.signature.localeCompare(left.plan.signature);
}

function compareDefensiveEvaluation(
  left: { evaluation: ObjectiveAssignmentEvaluation; plan: ObjectiveAssignmentPlan },
  right: { evaluation: ObjectiveAssignmentEvaluation; plan: ObjectiveAssignmentPlan },
): number {
  if (left.evaluation.totalVictoryPoints !== right.evaluation.totalVictoryPoints) {
    return right.evaluation.totalVictoryPoints - left.evaluation.totalVictoryPoints;
  }

  if (left.evaluation.controlledObjectiveCount !== right.evaluation.controlledObjectiveCount) {
    return right.evaluation.controlledObjectiveCount - left.evaluation.controlledObjectiveCount;
  }

  return right.plan.signature.localeCompare(left.plan.signature);
}

export function resolveObjectiveControlForScoring(
  state: GameState,
  scoringPlayerIndex: number = state.activePlayerIndex,
): ObjectiveScoringResolution {
  const objectives = state.missionState?.objectives.filter((objective) => !objective.isRemoved) ?? [];
  if (objectives.length === 0) {
    return {
      scoringPlayerIndex,
      objectiveResults: {},
      playerAssignments: [{}, {}],
      totalVictoryPoints: 0,
    };
  }

  const orderedObjectives = [...objectives].sort((left, right) => {
    if (right.currentVpValue !== left.currentVpValue) {
      return right.currentVpValue - left.currentVpValue;
    }
    return left.id.localeCompare(right.id);
  });
  const objectiveIds = orderedObjectives.map((objective) => objective.id);

  const playerCandidateLookups: [Record<string, Map<string, ObjectiveContestingUnit>>, Record<string, Map<string, ObjectiveContestingUnit>>] = [{}, {}];
  const playerCandidateUnitIdsByObjective: [Record<string, string[]>, Record<string, string[]>] = [{}, {}];

  for (const objective of orderedObjectives) {
    for (const playerIndex of [0, 1] as const) {
      const lookup = getObjectiveCandidateLookup(state, objective, playerIndex);
      playerCandidateLookups[playerIndex][objective.id] = lookup;
      playerCandidateUnitIdsByObjective[playerIndex][objective.id] = [...lookup.keys()];
    }
  }

  const playerPlans: [ObjectiveAssignmentPlan[], ObjectiveAssignmentPlan[]] = [
    buildObjectiveAssignmentPlans(objectiveIds, playerCandidateUnitIdsByObjective[0]),
    buildObjectiveAssignmentPlans(objectiveIds, playerCandidateUnitIdsByObjective[1]),
  ];

  const opponentPlayerIndex = scoringPlayerIndex === 0 ? 1 : 0;
  let chosenScoringPlan = playerPlans[scoringPlayerIndex][0];
  let chosenOpponentPlan = playerPlans[opponentPlayerIndex][0];
  let chosenEvaluation = evaluateObjectiveAssignmentPair(
    state,
    orderedObjectives,
    scoringPlayerIndex,
    scoringPlayerIndex === 0
      ? [chosenScoringPlan, chosenOpponentPlan]
      : [chosenOpponentPlan, chosenScoringPlan],
    playerCandidateLookups,
  );

  for (const scoringPlan of playerPlans[scoringPlayerIndex]) {
    let worstOpponentPlan = playerPlans[opponentPlayerIndex][0];
    let worstEvaluation = evaluateObjectiveAssignmentPair(
      state,
      orderedObjectives,
      scoringPlayerIndex,
      scoringPlayerIndex === 0
        ? [scoringPlan, worstOpponentPlan]
        : [worstOpponentPlan, scoringPlan],
      playerCandidateLookups,
    );

    for (const opponentPlan of playerPlans[opponentPlayerIndex].slice(1)) {
      const evaluation = evaluateObjectiveAssignmentPair(
        state,
        orderedObjectives,
        scoringPlayerIndex,
        scoringPlayerIndex === 0
          ? [scoringPlan, opponentPlan]
          : [opponentPlan, scoringPlan],
        playerCandidateLookups,
      );

      if (
        compareDefensiveEvaluation(
          { evaluation, plan: opponentPlan },
          { evaluation: worstEvaluation, plan: worstOpponentPlan },
        ) > 0
      ) {
        worstOpponentPlan = opponentPlan;
        worstEvaluation = evaluation;
      }
    }

    if (
      comparePreferredEvaluation(
        { evaluation: worstEvaluation, plan: scoringPlan },
        { evaluation: chosenEvaluation, plan: chosenScoringPlan },
      ) > 0
    ) {
      chosenScoringPlan = scoringPlan;
      chosenOpponentPlan = worstOpponentPlan;
      chosenEvaluation = worstEvaluation;
    }
  }

  const playerAssignments: [Record<string, string | null>, Record<string, string | null>] = [{}, {}];
  if (scoringPlayerIndex === 0) {
    playerAssignments[0] = chosenScoringPlan.objectiveToUnitId;
    playerAssignments[1] = chosenOpponentPlan.objectiveToUnitId;
  } else {
    playerAssignments[0] = chosenOpponentPlan.objectiveToUnitId;
    playerAssignments[1] = chosenScoringPlan.objectiveToUnitId;
  }

  return {
    scoringPlayerIndex,
    objectiveResults: chosenEvaluation.objectiveResults,
    playerAssignments,
    totalVictoryPoints: chosenEvaluation.totalVictoryPoints,
  };
}

export function getObjectiveScoringValueForUnit(
  unit: UnitState | null,
  objective: ObjectiveMarker,
): number {
  if (!unit) return objective.currentVpValue;

  const rules = summarizeUnitObjectiveRules(unit);
  let vp = objective.currentVpValue;

  if (rules.lineMajorityValue !== null) {
    vp += rules.lineMajorityValue;
  }

  if (rules.supportUnitCap !== null) {
    vp = Math.min(vp, rules.supportUnitCap);
  }

  if (rules.vanguardMajorityValue !== null) {
    vp = Math.min(vp, 1);
  }

  return Math.max(0, vp);
}

/**
 * Calculate the Tactical Strength of a player at an objective.
 *
 * Each eligible model within control range contributes 1 Tactical Strength.
 * Models with the Line(X) sub-type contribute an additional X
 * (but we use 1 as the standard Line bonus since data doesn't specify X yet).
 *
 * Reference: HH_Battle_AOD.md — "Tactical Strength"
 *
 * @param state - Current game state
 * @param objective - The objective marker
 * @param playerIndex - Which player
 * @returns Tactical Strength value
 */
export function calculateTacticalStrength(
  state: GameState,
  objective: ObjectiveMarker,
  playerIndex: number,
): number {
  const units = getContestingUnitsAtObjective(state, objective, playerIndex);
  return units[0]?.tacticalStrength ?? 0;
}

// ─── Objective Controller ────────────────────────────────────────────────────

/**
 * Result of determining objective control.
 */
export interface ObjectiveControlResult {
  /** Player index of the controller (null if contested or uncontrolled) */
  controllerPlayerIndex: number | null;
  /** Unit ID of the controlling unit (null if contested or uncontrolled) */
  controllingUnitId: string | null;
  /** Whether the objective is contested (both players have equal strength) */
  isContested: boolean;
  /** Tactical Strength of player 0 */
  player0Strength: number;
  /** Tactical Strength of player 1 */
  player1Strength: number;
}

/**
 * Determine who controls an objective marker.
 *
 * The player with higher Tactical Strength controls the objective.
 * If both players have equal non-zero strength, the objective is contested.
 * If no eligible models are in range, the objective is uncontrolled.
 *
 * Reference: HH_Battle_AOD.md — "Objective Control"
 *
 * @param state - Current game state
 * @param objective - The objective marker to check
 * @returns Control result
 */
export function getObjectiveController(
  state: GameState,
  objective: ObjectiveMarker,
): ObjectiveControlResult {
  if (state.missionState) {
    const resolved = resolveObjectiveControlForScoring(state, state.activePlayerIndex).objectiveResults[objective.id];
    if (resolved) {
      return resolved;
    }
  }

  const p0Units = getContestingUnitsAtObjective(state, objective, 0);
  const p1Units = getContestingUnitsAtObjective(state, objective, 1);
  const p0Strength = p0Units[0]?.tacticalStrength ?? 0;
  const p1Strength = p1Units[0]?.tacticalStrength ?? 0;

  if (p0Strength === 0 && p1Strength === 0) {
    return {
      controllerPlayerIndex: null,
      controllingUnitId: null,
      isContested: false,
      player0Strength: 0,
      player1Strength: 0,
    };
  }

  if (p0Strength === p1Strength) {
    return {
      controllerPlayerIndex: null,
      controllingUnitId: null,
      isContested: true,
      player0Strength: p0Strength,
      player1Strength: p1Strength,
    };
  }

  const controllerPlayerIndex = p0Strength > p1Strength ? 0 : 1;
  const controllingUnitId = controllerPlayerIndex === 0
    ? (p0Units[0]?.unitId ?? null)
    : (p1Units[0]?.unitId ?? null);

  return {
    controllerPlayerIndex,
    controllingUnitId,
    isContested: false,
    player0Strength: p0Strength,
    player1Strength: p1Strength,
  };
}

/**
 * Get all objectives controlled by a specific player.
 *
 * @param state - Current game state
 * @param playerIndex - Which player
 * @returns Array of controlled objective markers
 */
export function getControlledObjectives(
  state: GameState,
  playerIndex: number,
): ObjectiveMarker[] {
  if (!state.missionState) return [];

  const resolution = resolveObjectiveControlForScoring(state, state.activePlayerIndex);
  return state.missionState.objectives.filter((obj) => {
    if (obj.isRemoved) return false;
    const result = resolution.objectiveResults[obj.id] ?? getObjectiveController(state, obj);
    return result.controllerPlayerIndex === playerIndex;
  });
}
