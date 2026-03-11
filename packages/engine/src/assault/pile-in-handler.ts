/**
 * Pile-In Handler — Pile-In Movement for the Fight Sub-Phase
 * Implements pile-in movement that allows models to move closer to the enemy
 * during a combat, ensuring more models can participate in melee.
 *
 * Pile-in occurs in two contexts:
 *   1. During an initiative step — models at that initiative value pile in
 *      toward the closest eligible enemy model, up to their initiative distance.
 *   2. Final pile-in after all initiative steps — any model not in base contact
 *      with an enemy gets one final move toward the closest enemy.
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase, Pile-In
 */

import type { GameState, ModelState, Position } from '@hh/types';
import type { GameEvent, PileInMoveEvent } from '../types';
import { findUnit, getAliveModels, getDistanceBetween, isModelInBaseContact } from '../game-queries';
import { updateUnitInGameState, updateModelInUnit, moveModel } from '../state-helpers';
import type { CombatState } from './assault-types';
import { moveToward } from './setup-move-handler';
import { getModelInitiative } from '../profile-lookup';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default initiative value used for the final pile-in move when
 * per-model initiative stats are not available.
 * Standard Space Marine initiative is 4.
 */
export const DEFAULT_PILE_IN_INITIATIVE = 4;

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of resolving a single model's pile-in move.
 */
export interface PileInResult {
  /** The updated game state after the pile-in move */
  state: GameState;
  /** Events generated during the pile-in (PileInMoveEvent if model moved) */
  events: GameEvent[];
  /** Number of models that actually moved (0 or 1 for a single model pile-in) */
  modelsMoved: number;
}

/**
 * Result of resolving the final pile-in for all models in a combat
 * that are not yet in base contact with an enemy.
 */
export interface FinalPileInResult {
  /** The updated game state after all final pile-in moves */
  state: GameState;
  /** All PileInMoveEvents generated during the final pile-in */
  events: GameEvent[];
  /** Total number of models that moved during the final pile-in */
  totalModelsMoved: number;
}

// ─── Resolve Pile-In (Single Model) ─────────────────────────────────────────

/**
 * Resolves pile-in movement for a single model within a combat.
 *
 * Pile-in allows a model to move up to its initiative value in inches
 * toward the closest eligible enemy model in the combat. This movement
 * brings models into base contact so they can participate in melee strikes.
 *
 * Procedure:
 *   1. Determine which side the model's unit is on (active or reactive player)
 *   2. Identify enemy units (units on the opposite side of the combat)
 *   3. Find all alive enemy models from those units
 *   4. Find the closest eligible enemy model
 *   5. Move the model toward that enemy up to initiativeValue inches
 *   6. Generate a PileInMoveEvent recording the movement
 *
 * If no eligible enemy targets exist (all enemy models destroyed or no enemy
 * units in the combat), the model does not move and no event is generated.
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase, Pile-In
 *
 * @param state - Current game state
 * @param modelId - ID of the model performing the pile-in
 * @param unitId - ID of the unit the model belongs to
 * @param combatState - Current combat state tracking all participating units
 * @param initiativeValue - Maximum distance in inches the model can pile in
 * @returns PileInResult with updated state, events, and count of models moved
 */
export function resolvePileIn(
  state: GameState,
  modelId: string,
  unitId: string,
  combatState: CombatState,
  initiativeValue: number,
): PileInResult {
  const events: GameEvent[] = [];

  // Step 1: Determine which side this unit is on
  const isActivePlayer = combatState.activePlayerUnitIds.includes(unitId);
  const isReactivePlayer = combatState.reactivePlayerUnitIds.includes(unitId);

  // If the unit is not part of this combat, no movement
  if (!isActivePlayer && !isReactivePlayer) {
    return { state, events, modelsMoved: 0 };
  }

  // Step 2: Identify enemy unit IDs (opposite side)
  const enemyUnitIds = isActivePlayer
    ? combatState.reactivePlayerUnitIds
    : combatState.activePlayerUnitIds;

  // Step 3: Find all alive enemy models from those units
  const aliveEnemyModels = collectAliveModelsFromUnits(state, enemyUnitIds);

  // If no alive enemy models exist, no pile-in target
  if (aliveEnemyModels.length === 0) {
    return { state, events, modelsMoved: 0 };
  }

  // Find the model performing the pile-in
  const modelUnit = findUnit(state, unitId);
  if (!modelUnit) {
    return { state, events, modelsMoved: 0 };
  }

  const model = modelUnit.models.find(m => m.id === modelId);
  if (!model || model.isDestroyed) {
    return { state, events, modelsMoved: 0 };
  }

  // Step 4: Find the closest eligible enemy model
  const closestEnemy = findClosestEnemyModel(model.position, aliveEnemyModels);
  if (!closestEnemy) {
    return { state, events, modelsMoved: 0 };
  }

  // Step 5: Move toward the closest enemy up to initiativeValue distance
  const newPosition = moveToward(model.position, closestEnemy.position, initiativeValue);

  // Calculate the actual distance moved
  const distanceMoved = getDistanceBetween(model.position, newPosition);

  // If the model didn't actually move (already at target or 0 initiative), skip
  if (distanceMoved < 0.001) {
    return { state, events, modelsMoved: 0 };
  }

  // Update the model's position in the game state
  const newState = updateUnitInGameState(state, unitId, unit =>
    updateModelInUnit(unit, modelId, m => moveModel(m, newPosition)),
  );

  // Step 6: Generate PileInMoveEvent
  const pileInEvent: PileInMoveEvent = {
    type: 'pileInMove',
    modelId,
    unitId,
    from: model.position,
    to: newPosition,
    distance: distanceMoved,
  };
  events.push(pileInEvent);

  return {
    state: newState,
    events,
    modelsMoved: 1,
  };
}

// ─── Resolve Final Pile-In ──────────────────────────────────────────────────

/**
 * Resolves the final pile-in after all initiative steps have been resolved.
 *
 * After all initiative steps are complete, any model that is still alive
 * but NOT in base contact with any enemy model in the combat gets one
 * final pile-in move. This ensures that as many models as possible can
 * participate in ongoing combat.
 *
 * Active player's models pile in first, then reactive player's models.
 * Each model moves toward the closest enemy model in the combat up to
 * DEFAULT_PILE_IN_INITIATIVE inches (4"), since per-model initiative
 * values are not available at this stage.
 *
 * Procedure:
 *   1. Find all active player models not in base contact with any enemy
 *   2. For each such model, resolve a pile-in move toward the closest enemy
 *   3. Find all reactive player models not in base contact with any enemy
 *   4. For each such model, resolve a pile-in move toward the closest enemy
 *   5. Collect all events and return the updated state
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase, Final Pile-In
 *
 * @param state - Current game state
 * @param combatState - Current combat state tracking all participating units
 * @returns FinalPileInResult with updated state, all events, and total models moved
 */
export function resolveFinalPileIn(
  state: GameState,
  combatState: CombatState,
): FinalPileInResult {
  const allEvents: GameEvent[] = [];
  let currentState = state;
  let totalModelsMoved = 0;

  // Step 1: Active player's models pile in first
  const activeModelsNeedingPileIn = getModelsNeedingPileIn(
    currentState,
    combatState,
    combatState.activePlayerUnitIds,
  );

  for (const { modelId, unitId } of activeModelsNeedingPileIn) {
    const unit = findUnit(currentState, unitId);
    const model = unit?.models.find((candidate) => candidate.id === modelId);
    const result = resolvePileIn(
      currentState,
      modelId,
      unitId,
      combatState,
      model
        ? getModelInitiative(model.unitProfileId, model.profileModelName)
        : DEFAULT_PILE_IN_INITIATIVE,
    );

    currentState = result.state;
    allEvents.push(...result.events);
    totalModelsMoved += result.modelsMoved;
  }

  // Step 2: Reactive player's models pile in second
  const reactiveModelsNeedingPileIn = getModelsNeedingPileIn(
    currentState,
    combatState,
    combatState.reactivePlayerUnitIds,
  );

  for (const { modelId, unitId } of reactiveModelsNeedingPileIn) {
    const unit = findUnit(currentState, unitId);
    const model = unit?.models.find((candidate) => candidate.id === modelId);
    const result = resolvePileIn(
      currentState,
      modelId,
      unitId,
      combatState,
      model
        ? getModelInitiative(model.unitProfileId, model.profileModelName)
        : DEFAULT_PILE_IN_INITIATIVE,
    );

    currentState = result.state;
    allEvents.push(...result.events);
    totalModelsMoved += result.modelsMoved;
  }

  return {
    state: currentState,
    events: allEvents,
    totalModelsMoved,
  };
}

// ─── Get Models Needing Pile-In ─────────────────────────────────────────────

/**
 * Finds all alive models from the given player's units that are NOT in base
 * contact with any enemy model in the combat.
 *
 * This function identifies models that need to pile in — models that are
 * alive but not yet engaged in base-to-base contact with the enemy. These
 * models are eligible for a pile-in move to get closer to the fight.
 *
 * For each unit in playerUnitIds:
 *   1. Get all alive models in that unit
 *   2. Determine the enemy unit IDs (opposite side of the combat)
 *   3. For each alive model, check if it is in base contact with any model
 *      from any enemy unit
 *   4. If NOT in base contact, include it in the result
 *
 * @param state - Current game state
 * @param combatState - Current combat state tracking all participating units
 * @param playerUnitIds - Unit IDs belonging to the player whose models to check
 * @returns Array of { modelId, unitId } for models not in base contact with any enemy
 */
export function getModelsNeedingPileIn(
  state: GameState,
  combatState: CombatState,
  playerUnitIds: string[],
): { modelId: string; unitId: string }[] {
  const result: { modelId: string; unitId: string }[] = [];

  // Determine enemy unit IDs for this set of player units
  // If playerUnitIds matches activePlayerUnitIds, enemies are reactivePlayerUnitIds
  // and vice versa
  const isActivePlayerSide = playerUnitIds.length > 0
    && combatState.activePlayerUnitIds.includes(playerUnitIds[0]);

  const enemyUnitIds = isActivePlayerSide
    ? combatState.reactivePlayerUnitIds
    : combatState.activePlayerUnitIds;

  for (const unitId of playerUnitIds) {
    const unit = findUnit(state, unitId);
    if (!unit) continue;

    const aliveModels = getAliveModels(unit);

    for (const model of aliveModels) {
      // Check if this model is in base contact with any enemy unit
      let inBaseContact = false;

      for (const enemyUnitId of enemyUnitIds) {
        if (isModelInBaseContact(state, model.id, enemyUnitId)) {
          inBaseContact = true;
          break;
        }
      }

      // If NOT in base contact with any enemy, it needs to pile in
      if (!inBaseContact) {
        result.push({ modelId: model.id, unitId });
      }
    }
  }

  return result;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Collects all alive (non-destroyed) models from a set of unit IDs.
 *
 * Iterates through each unit ID, finds the unit in the game state,
 * and gathers all non-destroyed models from that unit into a single array.
 *
 * @param state - Current game state
 * @param unitIds - Array of unit IDs to collect alive models from
 * @returns Array of all alive ModelState objects from the specified units
 */
function collectAliveModelsFromUnits(
  state: GameState,
  unitIds: string[],
): ModelState[] {
  const models: ModelState[] = [];

  for (const unitId of unitIds) {
    const unit = findUnit(state, unitId);
    if (!unit) continue;

    const alive = getAliveModels(unit);
    models.push(...alive);
  }

  return models;
}

/**
 * Finds the closest enemy model to a given position from a list of candidate models.
 *
 * Compares the Euclidean distance from the given position to each candidate
 * model's position and returns the model with the smallest distance. If the
 * candidates array is empty, returns null.
 *
 * @param from - The position to measure distance from
 * @param candidates - Array of candidate enemy models to search through
 * @returns The closest ModelState, or null if no candidates exist
 */
function findClosestEnemyModel(
  from: Position,
  candidates: ModelState[],
): ModelState | null {
  if (candidates.length === 0) return null;

  let minDist = Infinity;
  let closest: ModelState | null = null;

  for (const candidate of candidates) {
    const dist = getDistanceBetween(from, candidate.position);
    if (dist < minDist) {
      minDist = dist;
      closest = candidate;
    }
  }

  return closest;
}
