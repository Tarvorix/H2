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
  ReserveEntryMethod,
  FlyerCombatAssignment,
} from '@hh/types';
import {
  ModelSubType,
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
  updateArmyByIndex,
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
import {
  getModelInitiative,
  getModelMovement,
  unitProfileHasSpecialRule,
  unitProfileHasSubType,
} from '../profile-lookup';

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

  if (unit.reserveReadyToEnter === true) {
    return {
      state,
      events: [],
      errors: [{
        code: 'RESERVES_ALREADY_PASSED',
        message: `Unit "${unitId}" has already passed its reserves test`,
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

  const targetNumber = getReservesTargetNumber(unit);
  const roll = dice.rollD6();
  const passed = roll >= targetNumber;

  // Emit ReservesTestEvent
  const testEvent: ReservesTestEvent = {
    type: 'reservesTest',
    unitId,
    roll,
    targetNumber,
    passed,
  };
  events.push(testEvent);

  // ── Step 3: Apply the result ──────────────────────────────────────

  let newState = state;

  if (passed) {
    // Mark the unit as ready to enter while it remains off-board until actually deployed.
    newState = updateUnitInGameState(newState, unitId, (u) => ({
      ...u,
      reserveReadyToEnter: true,
    }));

    // Embarked passengers share the same passed reserve test as their carrier.
    const army = getActiveArmy(newState);
    const embarkedUnits = army.units.filter(u => u.embarkedOnId === unitId);
    for (const embarked of embarkedUnits) {
      newState = updateUnitInGameState(newState, embarked.id, (u) => ({
        ...u,
        reserveReadyToEnter: true,
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
  combatAssignment?: FlyerCombatAssignment,
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

  if (!unit.isInReserves || unit.reserveReadyToEnter !== true) {
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

  const entryMethod = determineEntryMethod(state, unit, modelPositions, combatAssignment);
  if (!entryMethod) {
    return {
      state,
      events: [],
      errors: [{
        code: 'INVALID_RESERVES_ENTRY_METHOD',
        message: `Unit "${unitId}" cannot enter play using the provided deployment pattern.`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  const activeArmy = getActiveArmy(state);
  if (entryMethod === 'deepStrike') {
    if (state.currentBattleTurn <= 1) {
      return {
        state,
        events: [],
        errors: [{
          code: 'DEEP_STRIKE_TURN_ONE_FORBIDDEN',
          message: 'Units may not Deep Strike during the first battle turn.',
          context: { unitId, currentBattleTurn: state.currentBattleTurn },
        }],
        accepted: false,
      };
    }

    if ((activeArmy.deepStrikeAttemptsThisTurn ?? 0) >= 1) {
      return {
        state,
        events: [],
        errors: [{
          code: 'DEEP_STRIKE_LIMIT_REACHED',
          message: 'Only one unit may attempt a Deep Strike in the current player turn.',
          context: { unitId },
        }],
        accepted: false,
      };
    }
  }

  if (entryMethod === 'extraction-mission') {
    if (!unitProfileHasSubType(unit.profileId, ModelSubType.Transport)) {
      return {
        state,
        events: [],
        errors: [{
          code: 'EXTRACTION_MISSION_REQUIRES_TRANSPORT',
          message: 'Extraction Mission may only be assigned to Flyers with the Transport sub-type.',
          context: { unitId },
        }],
        accepted: false,
      };
    }

    const embarkedUnits = getActiveArmy(state).units.filter((candidate) => candidate.embarkedOnId === unitId);
    if (embarkedUnits.length > 0) {
      return {
        state,
        events: [],
        errors: [{
          code: 'EXTRACTION_MISSION_REQUIRES_EMPTY_TRANSPORT',
          message: 'Extraction Mission may only be assigned to a Flyer with no units embarked upon it.',
          context: { unitId },
        }],
        accepted: false,
      };
    }
  }

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

  const casualtyModelIds = new Set<string>();
  let usedRushOnEntry = false;
  const edgeReference = getEntryEdgeReference(
    entryMethod,
    modelPositions[0]?.position,
    state.battlefield.width,
    state.battlefield.height,
  );

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
      if (entryMethod === 'deepStrike' && mp.modelId !== modelPositions[0]?.modelId) {
        casualtyModelIds.add(mp.modelId);
      } else {
        errors.push({
          code: 'IN_IMPASSABLE_TERRAIN',
          message: `Position for model "${mp.modelId}" is in impassable terrain`,
          context: { modelId: mp.modelId, position: mp.position },
        });
      }
    }

    // Check enemy exclusion zone
    if (isInExclusionZone(mp.position, enemyShapes)) {
      if (entryMethod === 'deepStrike' && mp.modelId !== modelPositions[0]?.modelId) {
        casualtyModelIds.add(mp.modelId);
      } else {
        errors.push({
          code: 'IN_EXCLUSION_ZONE',
          message: `Position for model "${mp.modelId}" is within 1" of an enemy model`,
          context: { modelId: mp.modelId, position: mp.position },
        });
      }
    }

    if ((entryMethod === 'edge' || entryMethod === 'outflank') && edgeReference) {
      const unitModel = unit.models.find((candidate) => candidate.id === mp.modelId);
      if (!unitModel) continue;

      const baseMove = getModelMovement(unitModel.unitProfileId, unitModel.profileModelName);
      const rushMove = baseMove + Math.max(0, getModelInitiative(unitModel.unitProfileId, unitModel.profileModelName));
      const distanceFromEdge = getDistanceFromEdgeReference(mp.position, edgeReference, state.battlefield.width, state.battlefield.height);
      if (distanceFromEdge > rushMove + 0.01) {
        errors.push({
          code: 'RESERVES_MOVE_TOO_FAR',
          message: `Model "${mp.modelId}" exceeds its legal move allowance when entering from reserves`,
          context: { modelId: mp.modelId, distanceFromEdge, rushMove },
        });
      } else if (distanceFromEdge > baseMove + 0.01) {
        usedRushOnEntry = true;
      }
    }
  }

  // Entry-method-specific validation
  if (entryMethod === 'deepStrike') {
    // Deep Strike: must not be within 1" of board edges
    for (const mp of modelPositions) {
      if (!aliveModelIds.has(mp.modelId)) continue;
      if (isAtBattlefieldEdge(
        mp.position,
        state.battlefield.width,
        state.battlefield.height,
        DEEP_STRIKE_EDGE_BUFFER,
      )) {
        if (mp.modelId === modelPositions[0]?.modelId) {
          errors.push({
            code: 'TOO_CLOSE_TO_EDGE',
            message: `Deep Strike model "${mp.modelId}" is within ${DEEP_STRIKE_EDGE_BUFFER}" of a battlefield edge`,
            context: { modelId: mp.modelId, position: mp.position },
          });
        } else {
          casualtyModelIds.add(mp.modelId);
        }
      }
    }

    const anchor = modelPositions[0]?.position;
    if (anchor) {
      for (const mp of modelPositions.slice(1)) {
        const dx = mp.position.x - anchor.x;
        const dy = mp.position.y - anchor.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 6.01) {
          casualtyModelIds.add(mp.modelId);
        }
      }
    }
  }

  // Check coherency among placed models (if more than one)
  if (modelPositions.length > 1) {
    const modelShapes = modelPositions
      .filter(mp => aliveModelIds.has(mp.modelId) && !casualtyModelIds.has(mp.modelId))
      .map((mp) => {
        const model = unit.models.find((candidate) => candidate.id === mp.modelId);
        return model ? getModelShapeAtPosition(model, mp.position) : null;
      })
      .filter((shape): shape is ReturnType<typeof getModelShapeAtPosition> => shape !== null);
    const coherencyResult = checkCoherency(modelShapes, STANDARD_COHERENCY_RANGE);
    if (!coherencyResult.isCoherent) {
      const coherentModelPositions = modelPositions.filter(
        (mp) => aliveModelIds.has(mp.modelId) && !casualtyModelIds.has(mp.modelId),
      );
      for (const incoherentIndex of coherencyResult.incoherentModelIndices) {
        const incoherentModel = coherentModelPositions[incoherentIndex];
        if (incoherentModel) {
          casualtyModelIds.add(incoherentModel.modelId);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // ── Step 4: Place all models and update state ──────────────────────

  let newState = state;

  for (const mp of modelPositions) {
    if (!aliveModelIds.has(mp.modelId) || casualtyModelIds.has(mp.modelId)) continue;
    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, mp.modelId, (m) => moveModel(m, mp.position)),
    );
  }

  if (casualtyModelIds.size > 0) {
    for (const modelId of casualtyModelIds) {
      newState = updateUnitInGameState(newState, unitId, (u) =>
        updateModelInUnit(u, modelId, (model) => ({
          ...model,
          isDestroyed: true,
          currentWounds: 0,
        })),
      );
      events.push({
        type: 'casualtyRemoved',
        unitId,
        modelId,
      });
    }
  }

  const isAerialEntry = (unit.reserveType ?? 'standard') === 'aerial';
  const nextMovementState = isAerialEntry
    ? UnitMovementState.Stationary
    : usedRushOnEntry
      ? UnitMovementState.Rushed
      : UnitMovementState.EnteredFromReserves;
  const forbidsCharge = entryMethod === 'deepStrike' || entryMethod === 'outflank';

  newState = updateUnitInGameState(newState, unitId, (u) => ({
    ...setMovementState(u, nextMovementState),
    isInReserves: false,
    reserveReadyToEnter: false,
    isDeployed: true,
    flyerCombatAssignment: combatAssignment ?? u.flyerCombatAssignment ?? null,
    reserveEntryMethodThisTurn: entryMethod,
    cannotChargeThisTurn: forbidsCharge,
  }));

  const embarkedUnits = getActiveArmy(newState).units.filter((candidate) => candidate.embarkedOnId === unitId);
  for (const embarked of embarkedUnits) {
    newState = updateUnitInGameState(newState, embarked.id, (u) => ({
      ...u,
      isInReserves: false,
      reserveReadyToEnter: false,
      reserveEntryMethodThisTurn: entryMethod,
      cannotChargeThisTurn: forbidsCharge,
      movementState: nextMovementState,
    }));
  }

  if (entryMethod === 'deepStrike') {
    newState = updateArmyByIndex(newState, state.activePlayerIndex, (army) => ({
      ...army,
      deepStrikeAttemptsThisTurn: (army.deepStrikeAttemptsThisTurn ?? 0) + 1,
    }));
  }

  // Emit ReservesEntryEvent
  const entryEvent: ReservesEntryEvent = {
    type: 'reservesEntry',
    unitId,
    entryMethod,
    modelPositions: modelPositions
      .filter(mp => aliveModelIds.has(mp.modelId) && !casualtyModelIds.has(mp.modelId))
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
function determineEntryMethod(
  state: GameState,
  unit: UnitState,
  modelPositions: Array<{ modelId: string; position: Position }>,
  combatAssignment?: FlyerCombatAssignment,
): ReserveEntryMethod | null {
  if ((unit.reserveType ?? 'standard') === 'aerial') {
    return combatAssignment ?? unit.flyerCombatAssignment ?? null;
  }

  const firstPosition = modelPositions[0]?.position;
  if (!firstPosition) {
    return null;
  }

  const hasDeepStrike = unitProfileHasSpecialRule(unit.profileId, 'Deep Strike');
  const hasOutflank = unitProfileHasSpecialRule(unit.profileId, 'Outflank');
  const onAnyEdge = isAtBattlefieldEdge(firstPosition, state.battlefield.width, state.battlefield.height, EDGE_BUFFER);
  const onSideEdge = isAtSideEdge(firstPosition, state.battlefield.width, state.battlefield.height, EDGE_BUFFER);

  if (hasDeepStrike && !onAnyEdge) {
    return 'deepStrike';
  }
  if (hasOutflank && onSideEdge) {
    return 'outflank';
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

type EdgeReference = 'left' | 'right' | 'top' | 'bottom';

function getReservesTargetNumber(unit: UnitState): number {
  if ((unit.reserveType ?? 'standard') !== 'aerial') {
    return RESERVES_TARGET_NUMBER;
  }

  return Math.min(6, RESERVES_TARGET_NUMBER + Math.max(0, unit.aerialReserveReturnCount ?? 0));
}

function getEntryEdgeReference(
  entryMethod: ReserveEntryMethod,
  firstPosition: Position | undefined,
  width: number,
  height: number,
): EdgeReference | null {
  if (!firstPosition) {
    return null;
  }

  if (entryMethod === 'outflank') {
    return firstPosition.x <= width / 2 ? 'left' : 'right';
  }

  if (entryMethod !== 'edge') {
    return null;
  }

  const distances: Array<[EdgeReference, number]> = [
    ['left', firstPosition.x],
    ['right', width - firstPosition.x],
    ['bottom', firstPosition.y],
    ['top', height - firstPosition.y],
  ];
  distances.sort((left, right) => left[1] - right[1]);
  return distances[0]?.[0] ?? null;
}

function getDistanceFromEdgeReference(
  position: Position,
  edgeReference: EdgeReference,
  width: number,
  height: number,
): number {
  switch (edgeReference) {
    case 'left':
      return position.x;
    case 'right':
      return width - position.x;
    case 'bottom':
      return position.y;
    case 'top':
      return height - position.y;
  }
}
