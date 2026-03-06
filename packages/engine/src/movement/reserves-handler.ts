/**
 * Reserves Sub-Phase Handler
 * Handles reserves arrival tests and battlefield entry for units in reserves.
 *
 * Reference: HH_Rules_Battle.md -- "Reserves Sub-Phase"
 * Reference: HH_Principles.md -- "Reserves", "Deep Strike", "Outflank"
 *
 * Reserves flow:
 * 1. Roll 1d6 for each unit in reserves. On 3+, the unit may enter the battlefield.
 * 2. Place the first model at a valid battlefield edge position.
 * 3. Remaining models must end in coherency with the first model.
 * 4. The unit counts as having moved (EnteredFromReserves).
 * 5. Transports and embarked units share a single reserves test.
 * 6. Units with Deep Strike or Outflank enter via alternate methods.
 */

import type {
  GameState,
  UnitState,
  Position,
} from '@hh/types';
import {
  UnitMovementState,
} from '@hh/types';
import {
  checkCoherency,
  isInExclusionZone,
  isInImpassableTerrain,
  STANDARD_COHERENCY_RANGE,
} from '@hh/geometry';
import type { CommandResult, GameEvent, DiceProvider, ValidationError } from '../types';
import type { ReservesTestEvent, ReservesEntryEvent } from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setMovementState,
} from '../state-helpers';
import {
  findUnit,
  findUnitPlayerIndex,
  getActiveArmy,
  getAliveModels,
  getEnemyModelShapes,
} from '../game-queries';
import { getModelShapeAtPosition } from '../model-shapes';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Reserves test target number.
 * A unit in reserves must roll this value or higher on a d6 to enter the battlefield.
 * Reference: HH_Rules_Battle.md -- "Reserves: 3+ on a d6"
 */
export const RESERVES_TARGET_NUMBER = 3;

/**
 * Edge buffer distance in inches.
 * The first model placed from reserves must be within this distance of a battlefield edge.
 * Reference: HH_Rules_Battle.md -- reserves enter from battlefield edge
 */
export const EDGE_BUFFER = 1;

/**
 * Minimum distance from enemy models for Deep Strike placement.
 * Reference: HH_Armoury.md -- "Deep Strike: not within 1" of enemies"
 */
export const DEEP_STRIKE_ENEMY_EXCLUSION = 1;

/**
 * Minimum distance from board edge for Deep Strike placement.
 * Reference: HH_Armoury.md -- "Deep Strike: not within 1" of board edges"
 */
export const DEEP_STRIKE_EDGE_BUFFER = 1;

// ─── handleReservesTest ─────────────────────────────────────────────────────

/**
 * Handle the reserves arrival test for a unit.
 *
 * Roll 1d6: on a 3+, the unit passes the reserves test and is ready to enter
 * the battlefield. On a 1-2, the unit remains in reserves.
 *
 * If the unit is a transport with embarked units, the transport and all
 * embarked units share a single test -- they all arrive or all stay.
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to test
 * @param dice - Dice provider for the d6 roll
 * @returns CommandResult with updated state, events, and errors
 */
export function handleReservesTest(
  state: GameState,
  unitId: string,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];

  // ── Step 1: Find and validate the unit ──────────────────────────────

  const unit = findUnit(state, unitId);
  if (!unit) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_NOT_FOUND',
        message: `Unit "${unitId}" not found`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // Validate the unit is actually in reserves
  if (!unit.isInReserves) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_IN_RESERVES',
        message: `Unit "${unitId}" is not in reserves`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // Validate unit belongs to the active player
  const playerIndex = findUnitPlayerIndex(state, unitId);
  if (playerIndex === undefined || playerIndex !== state.activePlayerIndex) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_ACTIVE_PLAYER',
        message: 'Unit does not belong to the active player',
        context: { unitId, playerIndex, activePlayerIndex: state.activePlayerIndex },
      }],
      accepted: false,
    };
  }

  // ── Step 2: Roll the reserves test ──────────────────────────────────

  const roll = dice.rollD6();
  const passed = roll >= RESERVES_TARGET_NUMBER;

  // Emit ReservesTestEvent
  const testEvent: ReservesTestEvent = {
    type: 'reservesTest',
    unitId,
    roll,
    targetNumber: RESERVES_TARGET_NUMBER,
    passed,
  };
  events.push(testEvent);

  // ── Step 3: Apply the result ──────────────────────────────────────

  let newState = state;

  if (passed) {
    // Mark the unit as ready to enter (no longer in reserves, deployed, EnteredFromReserves)
    newState = updateUnitInGameState(newState, unitId, (u) => ({
      ...u,
      isInReserves: false,
      isDeployed: true,
      movementState: UnitMovementState.EnteredFromReserves,
    }));

    // If this unit is a transport, also mark all embarked units
    const army = getActiveArmy(newState);
    const embarkedUnits = army.units.filter(u => u.embarkedOnId === unitId);
    for (const embarked of embarkedUnits) {
      newState = updateUnitInGameState(newState, embarked.id, (u) => ({
        ...u,
        isInReserves: false,
        isDeployed: true,
        movementState: UnitMovementState.EnteredFromReserves,
      }));
    }
  }
  // On failure, the unit stays in reserves -- no state change needed.

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── handleReservesEntry ────────────────────────────────────────────────────

/**
 * Handle placing a unit onto the battlefield from reserves.
 *
 * The caller provides positions for all models in the unit. This function validates:
 * 1. The first model must be placed at a valid battlefield edge position (within EDGE_BUFFER).
 * 2. All positions must be within battlefield bounds.
 * 3. No positions in impassable terrain.
 * 4. No positions in enemy exclusion zones.
 * 5. Models (other than the first) must maintain coherency.
 * 6. For Deep Strike: positions can be anywhere on the battlefield (not near edges,
 *    not near enemies, not in impassable terrain).
 * 7. For Outflank: positions must be along a side (non-deployment) battlefield edge.
 *
 * After placement, the unit is marked as EnteredFromReserves and counts as having moved.
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to place
 * @param modelPositions - Array of { modelId, position } for all models
 * @param dice - Dice provider (reserved for scatter on Deep Strike)
 * @returns CommandResult with updated state, events, and errors
 */
export function handleReservesEntry(
  state: GameState,
  unitId: string,
  modelPositions: Array<{ modelId: string; position: Position }>,
  _dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  const errors: ValidationError[] = [];

  // ── Step 1: Find and validate the unit ──────────────────────────────

  const unit = findUnit(state, unitId);
  if (!unit) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_NOT_FOUND',
        message: `Unit "${unitId}" not found`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // Unit must have passed its reserves test (isInReserves = false, isDeployed = true)
  // or be ready to enter (movementState = EnteredFromReserves)
  if (unit.isInReserves) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_STILL_IN_RESERVES',
        message: `Unit "${unitId}" has not passed its reserves test yet`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // Validate unit belongs to the active player
  const playerIndex = findUnitPlayerIndex(state, unitId);
  if (playerIndex === undefined || playerIndex !== state.activePlayerIndex) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_ACTIVE_PLAYER',
        message: 'Unit does not belong to the active player',
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // ── Step 2: Determine entry method (edge, deep strike, outflank) ────

  const entryMethod = determineEntryMethod(unit);

  // ── Step 3: Validate all model positions ──────────────────────────────

  const aliveModels = getAliveModels(unit);

  // Validate that we have positions for all alive models
  const aliveModelIds = new Set(aliveModels.map(m => m.id));
  const providedModelIds = new Set(modelPositions.map(mp => mp.modelId));
  for (const aliveModel of aliveModels) {
    if (!providedModelIds.has(aliveModel.id)) {
      errors.push({
        code: 'MISSING_MODEL_POSITION',
        message: `No position provided for model "${aliveModel.id}"`,
        context: { modelId: aliveModel.id },
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // Get enemy shapes for exclusion zone check
  const enemyShapes = getEnemyModelShapes(state, playerIndex);

  // Validate each model position
  for (const mp of modelPositions) {
    if (!aliveModelIds.has(mp.modelId)) {
      continue; // Skip positions for destroyed models
    }

    // Check battlefield bounds
    if (
      mp.position.x < 0 ||
      mp.position.y < 0 ||
      mp.position.x > state.battlefield.width ||
      mp.position.y > state.battlefield.height
    ) {
      errors.push({
        code: 'OUT_OF_BOUNDS',
        message: `Position for model "${mp.modelId}" is outside the battlefield`,
        context: { modelId: mp.modelId, position: mp.position },
      });
    }

    // Check impassable terrain
    if (isInImpassableTerrain(mp.position, state.terrain)) {
      errors.push({
        code: 'IN_IMPASSABLE_TERRAIN',
        message: `Position for model "${mp.modelId}" is in impassable terrain`,
        context: { modelId: mp.modelId, position: mp.position },
      });
    }

    // Check enemy exclusion zone
    if (isInExclusionZone(mp.position, enemyShapes)) {
      errors.push({
        code: 'IN_EXCLUSION_ZONE',
        message: `Position for model "${mp.modelId}" is within 1" of an enemy model`,
        context: { modelId: mp.modelId, position: mp.position },
      });
    }
  }

  // Entry-method-specific validation
  if (entryMethod === 'edge') {
    // Standard reserves: first model must be at a battlefield edge
    const firstModelPosition = modelPositions[0];
    if (firstModelPosition && !isAtBattlefieldEdge(
      firstModelPosition.position,
      state.battlefield.width,
      state.battlefield.height,
      EDGE_BUFFER,
    )) {
      errors.push({
        code: 'NOT_AT_EDGE',
        message: 'First model must be placed at a battlefield edge for standard reserves entry',
        context: { position: firstModelPosition.position },
      });
    }
  } else if (entryMethod === 'deepStrike') {
    // Deep Strike: must not be within 1" of board edges
    for (const mp of modelPositions) {
      if (!aliveModelIds.has(mp.modelId)) continue;
      if (isAtBattlefieldEdge(
        mp.position,
        state.battlefield.width,
        state.battlefield.height,
        DEEP_STRIKE_EDGE_BUFFER,
      )) {
        errors.push({
          code: 'TOO_CLOSE_TO_EDGE',
          message: `Deep Strike model "${mp.modelId}" is within ${DEEP_STRIKE_EDGE_BUFFER}" of a battlefield edge`,
          context: { modelId: mp.modelId, position: mp.position },
        });
      }
    }
  } else if (entryMethod === 'outflank') {
    // Outflank: first model must be at a side edge (left or right)
    const firstModelPosition = modelPositions[0];
    if (firstModelPosition && !isAtSideEdge(
      firstModelPosition.position,
      state.battlefield.width,
      state.battlefield.height,
      EDGE_BUFFER,
    )) {
      errors.push({
        code: 'NOT_AT_SIDE_EDGE',
        message: 'Outflank unit must enter from a side (left or right) battlefield edge',
        context: { position: firstModelPosition.position },
      });
    }
  }

  // Check coherency among placed models (if more than one)
  if (modelPositions.length > 1) {
    const modelShapes = modelPositions
      .filter(mp => aliveModelIds.has(mp.modelId))
      .map((mp) => {
        const model = unit.models.find((candidate) => candidate.id === mp.modelId);
        return model ? getModelShapeAtPosition(model, mp.position) : null;
      })
      .filter((shape): shape is ReturnType<typeof getModelShapeAtPosition> => shape !== null);
    const coherencyResult = checkCoherency(modelShapes, STANDARD_COHERENCY_RANGE);
    if (!coherencyResult.isCoherent) {
      errors.push({
        code: 'COHERENCY_BROKEN',
        message: 'Models placed from reserves must maintain coherency',
        context: { incoherentModelCount: coherencyResult.incoherentModelIndices.length },
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // ── Step 4: Place all models and update state ──────────────────────

  let newState = state;

  for (const mp of modelPositions) {
    if (!aliveModelIds.has(mp.modelId)) continue;
    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, mp.modelId, (m) => moveModel(m, mp.position)),
    );
  }

  // Mark unit as EnteredFromReserves (it counts as having moved)
  newState = updateUnitInGameState(newState, unitId, (u) =>
    setMovementState(u, UnitMovementState.EnteredFromReserves),
  );

  // Emit ReservesEntryEvent
  const entryEvent: ReservesEntryEvent = {
    type: 'reservesEntry',
    unitId,
    entryMethod,
    modelPositions: modelPositions
      .filter(mp => aliveModelIds.has(mp.modelId))
      .map(mp => ({ modelId: mp.modelId, position: mp.position })),
  };
  events.push(entryEvent);

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Determine the entry method for a unit based on its special rules.
 * Checks for Deep Strike and Outflank flags on the unit's modifiers.
 *
 * In the current implementation, we check the unit's modifier sources
 * for "Deep Strike" or "Outflank" strings. A future implementation
 * would use the rule registry to determine this.
 */
function determineEntryMethod(unit: UnitState): 'edge' | 'deepStrike' | 'outflank' {
  // Check unit modifiers for Deep Strike or Outflank indicators
  for (const modifier of unit.modifiers) {
    if (modifier.source === 'Deep Strike') return 'deepStrike';
    if (modifier.source === 'Outflank') return 'outflank';
  }
  return 'edge';
}

/**
 * Check if a position is at a battlefield edge (within buffer distance).
 */
function isAtBattlefieldEdge(
  position: Position,
  width: number,
  height: number,
  buffer: number,
): boolean {
  return (
    position.x <= buffer ||
    position.x >= width - buffer ||
    position.y <= buffer ||
    position.y >= height - buffer
  );
}

/**
 * Check if a position is at a side (left or right) battlefield edge.
 * Side edges are x=0 (left) and x=width (right).
 */
function isAtSideEdge(
  position: Position,
  width: number,
  _height: number,
  buffer: number,
): boolean {
  return position.x <= buffer || position.x >= width - buffer;
}
