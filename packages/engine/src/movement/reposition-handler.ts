/**
 * Reposition Reaction Handler
 * Handles the Reposition reaction during the Movement Phase.
 *
 * Reference: HH_Principles.md — "Reposition Reaction"
 * Reference: HH_Rules_Battle.md — "Reactions", "Movement Phase Reactions"
 *
 * Reposition flow:
 * 1. Active player moves a unit. After the move completes, check if any reactive
 *    player units can trigger a Reposition reaction.
 * 2. Trigger conditions:
 *    a. Enemy unit ends its move within 12" of a reactive player unit AND has LOS.
 *    b. The reactive army has at least 1 reaction allotment remaining.
 *    c. The reactive unit is eligible to react (not already reacted, not stunned,
 *       not routed, not locked in combat, deployed, not embarked).
 * 3. If triggered, the reactive player may choose a unit to reposition.
 * 4. Each model in the repositioning unit may move up to its Initiative value.
 * 5. Normal movement restrictions apply (terrain, exclusion zone, coherency).
 * 6. The unit cannot Rush during a reaction.
 * 7. Deduct 1 reaction allotment from the reactive army.
 * 8. Mark the unit as having reacted this turn.
 */

import type {
  GameState,
  Position,
} from '@hh/types';
import {
  UnitMovementState,
} from '@hh/types';
import {
  vec2Distance,
  hasLOS,
  checkCoherency,
  STANDARD_COHERENCY_RANGE,
} from '@hh/geometry';
import type { CommandResult, GameEvent, DiceProvider, ValidationError } from '../types';
import type { RepositionExecutedEvent } from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  updateArmyByIndex,
} from '../state-helpers';
import {
  findUnit,
  findUnitPlayerIndex,
  getReactiveArmy,
  getReactivePlayerIndex,
  canUnitReact,
  hasReactionAllotment,
  getAliveModels,
  getModelShape,
  getEnemyModelShapes,
} from '../game-queries';
import { getModelInitiative } from '../profile-lookup';
import { getModelShapeAtPosition } from '../model-shapes';
import { validateModelMove } from './movement-validator';
import {
  handleDangerousTerrainTest,
  hasDangerousTerrainInteraction,
  resolveDangerousTerrainOutcome,
} from './move-handler';


// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum distance for Reposition reaction trigger (12").
 * Reference: HH_Principles.md — "Reposition: within 12" and LOS"
 */
export const REPOSITION_TRIGGER_RANGE = 12;

/**
 * Default Initiative value for reaction movement distance.
 * Used as fallback when profile data is unavailable.
 */
export const REPOSITION_DEFAULT_INITIATIVE = 4;

// ─── checkRepositionTrigger ──────────────────────────────────────────────────

/**
 * Check if a Reposition reaction can be triggered after an active player unit
 * has completed its move.
 *
 * Checks:
 * 1. The reactive army has reaction allotments remaining.
 * 2. For each reactive unit: is eligible to react, is within 12" of the
 *    trigger unit, and has LOS to the trigger unit.
 *
 * @param state - Current game state (after active player move)
 * @param triggerUnitId - ID of the active player's unit that just moved
 * @returns Object with triggered flag and list of eligible reactive unit IDs
 */
export function checkRepositionTrigger(
  state: GameState,
  triggerUnitId: string,
): { triggered: boolean; eligibleUnitIds: string[] } {
  const reactiveArmy = getReactiveArmy(state);

  // Check reaction allotment
  if (!hasReactionAllotment(reactiveArmy)) {
    return { triggered: false, eligibleUnitIds: [] };
  }

  // Find the trigger unit
  const triggerUnit = findUnit(state, triggerUnitId);
  if (!triggerUnit) {
    return { triggered: false, eligibleUnitIds: [] };
  }

  // Get trigger unit's alive models for range and LOS checks
  const triggerModels = getAliveModels(triggerUnit);
  if (triggerModels.length === 0) {
    return { triggered: false, eligibleUnitIds: [] };
  }

  const eligibleUnitIds: string[] = [];

  for (const reactiveUnit of reactiveArmy.units) {
    // Check basic eligibility
    if (!canUnitReact(reactiveUnit)) continue;

    // Get reactive unit's alive models
    const reactiveModels = getAliveModels(reactiveUnit);
    if (reactiveModels.length === 0) continue;

    // Check if any reactive model is within 12" of any trigger model AND has LOS
    let unitIsEligible = false;

    for (const reactiveModel of reactiveModels) {
      if (unitIsEligible) break;

      for (const triggerModel of triggerModels) {
        // Check distance
        const dist = vec2Distance(reactiveModel.position, triggerModel.position);
        if (dist > REPOSITION_TRIGGER_RANGE) continue;

        // Check LOS
        const reactiveShape = getModelShape(reactiveModel);
        const triggerShape = getModelShape(triggerModel);
        const losResult = hasLOS(reactiveShape, triggerShape, state.terrain, []);

        if (losResult) {
          unitIsEligible = true;
          break;
        }
      }
    }

    if (unitIsEligible) {
      eligibleUnitIds.push(reactiveUnit.id);
    }
  }

  return {
    triggered: eligibleUnitIds.length > 0,
    eligibleUnitIds,
  };
}

// ─── handleRepositionReaction ────────────────────────────────────────────────

/**
 * Handle executing a Reposition reaction.
 *
 * The reactive player has chosen a unit to reposition. Each model in the unit
 * may move up to its Initiative characteristic value (in inches). Normal
 * movement restrictions apply. The unit cannot Rush.
 *
 * After the reaction:
 * - The reactive army's reaction allotment is decremented by 1.
 * - The reacting unit is marked as having reacted this turn.
 * - The reacting unit's movement state is set to Moved.
 *
 * @param state - Current game state
 * @param reactingUnitId - ID of the reactive player's unit to reposition
 * @param modelMoves - Array of { modelId, position } for each model to move
 * @param _dice - Dice provider (not used currently, reserved)
 * @returns CommandResult with updated state, events, and errors
 */
export function handleRepositionReaction(
  state: GameState,
  reactingUnitId: string,
  modelMoves: Array<{ modelId: string; position: Position }>,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  const errors: ValidationError[] = [];

  // ── Step 1: Validate the reacting unit ──────────────────────────────

  const unit = findUnit(state, reactingUnitId);
  if (!unit) {
    return {
      state,
      events: [],
      errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit "${reactingUnitId}" not found` }],
      accepted: false,
    };
  }

  // Validate unit belongs to the reactive player
  const unitPlayerIndex = findUnitPlayerIndex(state, reactingUnitId);
  const reactivePlayerIndex = getReactivePlayerIndex(state);
  if (unitPlayerIndex !== reactivePlayerIndex) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_REACTIVE_PLAYER',
        message: 'Reposition reaction can only be performed by the reactive player\'s units',
      }],
      accepted: false,
    };
  }

  // Check the unit can react
  if (!canUnitReact(unit)) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_CANNOT_REACT',
        message: `Unit "${reactingUnitId}" is not eligible to react`,
        context: {
          hasReacted: unit.hasReactedThisTurn,
          statuses: unit.statuses,
          isLockedInCombat: unit.isLockedInCombat,
          isDeployed: unit.isDeployed,
          embarkedOnId: unit.embarkedOnId,
        },
      }],
      accepted: false,
    };
  }

  // Check the reactive army has allotments remaining
  const reactiveArmy = getReactiveArmy(state);
  if (!hasReactionAllotment(reactiveArmy)) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NO_REACTION_ALLOTMENT',
        message: 'Reactive army has no reaction allotments remaining',
      }],
      accepted: false,
    };
  }

  // ── Step 2: Validate each model move ────────────────────────────────

  const aliveModels = getAliveModels(unit);
  const aliveModelIds = new Set(aliveModels.map(m => m.id));

  // Get enemy model shapes for exclusion zone check
  const enemyShapes = getEnemyModelShapes(state, unitPlayerIndex!);

  // Record model moves for the event
  const modelMoveRecords: { modelId: string; from: Position; to: Position }[] = [];
  const finalPositions = new Map<string, Position>(
    aliveModels.map((model) => [model.id, model.position]),
  );
  for (const move of modelMoves) {
    if (aliveModelIds.has(move.modelId)) {
      finalPositions.set(move.modelId, move.position);
    }
  }

  for (const move of modelMoves) {
    if (!aliveModelIds.has(move.modelId)) {
      errors.push({
        code: 'MODEL_NOT_FOUND',
        message: `Model "${move.modelId}" not found in unit "${reactingUnitId}"`,
        context: { modelId: move.modelId },
      });
      continue;
    }

    // Find the model
    const model = aliveModels.find(m => m.id === move.modelId);
    if (!model) continue;

    const modelInit = getModelInitiative(model.unitProfileId, model.profileModelName);

    const friendlyShapes = aliveModels
      .filter((other) => other.id !== move.modelId)
      .map((other) =>
        getModelShapeAtPosition(other, finalPositions.get(other.id) ?? other.position),
      );

    const moveErrors = validateModelMove(
      model,
      move.position,
      modelInit,
      state.terrain,
      enemyShapes,
      friendlyShapes,
      state.battlefield.width,
      state.battlefield.height,
    ).map((error) => {
      if (error.code !== 'EXCEEDS_MOVEMENT') {
        return error;
      }

      const moveDist = vec2Distance(model.position, move.position);
      return {
        ...error,
        code: 'EXCEEDS_INITIATIVE',
        message: `Model "${move.modelId}" move of ${moveDist.toFixed(2)}" exceeds Initiative of ${modelInit}"`,
        context: { modelId: move.modelId, distance: moveDist, maxDistance: modelInit },
      };
    });
    if (moveErrors.length > 0) {
      errors.push(...moveErrors);
    }

    modelMoveRecords.push({
      modelId: move.modelId,
      from: model.position,
      to: move.position,
    });
  }

  // Check coherency after all moves
  if (modelMoves.length > 0 && aliveModels.length > 1) {
    const shapes = aliveModels.map((model) =>
      getModelShapeAtPosition(
        model,
        finalPositions.get(model.id) ?? model.position,
      ),
    );
    const coherencyResult = checkCoherency(shapes, STANDARD_COHERENCY_RANGE);
    if (!coherencyResult.isCoherent) {
      errors.push({
        code: 'COHERENCY_BROKEN',
        message: 'Repositioned models must maintain coherency',
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // ── Step 3: Apply model moves ───────────────────────────────────────

  let newState = state;
  for (const move of modelMoves) {
    if (!aliveModelIds.has(move.modelId)) continue;
    newState = updateUnitInGameState(newState, reactingUnitId, (u) =>
      updateModelInUnit(u, move.modelId, (m) => moveModel(m, move.position)),
    );

    const movedModel = aliveModels.find((model) => model.id === move.modelId);
    if (
      movedModel &&
      !(newState.dangerousTerrainTestedModelIds?.includes(move.modelId) ?? false) &&
      hasDangerousTerrainInteraction(movedModel.position, move.position, state.terrain)
    ) {
      const dangerousResult = handleDangerousTerrainTest(move.modelId, reactingUnitId, dice);
      events.push(dangerousResult.event);
      newState = {
        ...newState,
        dangerousTerrainTestedModelIds: [
          ...(newState.dangerousTerrainTestedModelIds ?? []),
          move.modelId,
        ],
      };

      if (!dangerousResult.passed) {
        const dangerousOutcome = resolveDangerousTerrainOutcome(
          newState,
          reactingUnitId,
          move.modelId,
          dice,
        );
        newState = dangerousOutcome.state;
        events.push(...dangerousOutcome.events);
      }
    }
  }

  // ── Step 4: Mark unit as reacted and moved ──────────────────────────

  newState = updateUnitInGameState(newState, reactingUnitId, (u) => ({
    ...u,
    hasReactedThisTurn: true,
    movementState: UnitMovementState.Moved,
  }));

  // ── Step 5: Deduct reaction allotment ───────────────────────────────

  newState = updateArmyByIndex(newState, reactivePlayerIndex, (army) => ({
    ...army,
    reactionAllotmentRemaining: army.reactionAllotmentRemaining - 1,
  }));

  // ── Step 6: Emit events ─────────────────────────────────────────────

  const event: RepositionExecutedEvent = {
    type: 'repositionExecuted',
    reactingUnitId,
    modelMoves: modelMoveRecords,
  };
  events.push(event);

  return { state: newState, events, errors: [], accepted: true };
}
