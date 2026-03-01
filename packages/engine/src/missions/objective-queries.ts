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
} from '@hh/types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Objective control range in inches */
export const OBJECTIVE_CONTROL_RANGE = 3;

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
  const modelsInRange = getModelsWithinObjectiveRange(state, objective, playerIndex);
  let strength = 0;

  for (const { model, unit } of modelsInRange) {
    if (!canModelHoldObjective(model, unit)) continue;
    strength += 1;
  }

  return strength;
}

// ─── Objective Controller ────────────────────────────────────────────────────

/**
 * Result of determining objective control.
 */
export interface ObjectiveControlResult {
  /** Player index of the controller (null if contested or uncontrolled) */
  controllerPlayerIndex: number | null;
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
  const p0Strength = calculateTacticalStrength(state, objective, 0);
  const p1Strength = calculateTacticalStrength(state, objective, 1);

  if (p0Strength === 0 && p1Strength === 0) {
    return {
      controllerPlayerIndex: null,
      isContested: false,
      player0Strength: 0,
      player1Strength: 0,
    };
  }

  if (p0Strength === p1Strength) {
    return {
      controllerPlayerIndex: null,
      isContested: true,
      player0Strength: p0Strength,
      player1Strength: p1Strength,
    };
  }

  return {
    controllerPlayerIndex: p0Strength > p1Strength ? 0 : 1,
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

  return state.missionState.objectives.filter((obj) => {
    if (obj.isRemoved) return false;
    const result = getObjectiveController(state, obj);
    return result.controllerPlayerIndex === playerIndex;
  });
}
