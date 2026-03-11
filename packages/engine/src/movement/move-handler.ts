/**
 * Move Sub-Phase Handler
 * Handles normal moves, rush moves, and dangerous terrain tests.
 *
 * Reference: HH_Rules_Battle.md -- "Movement Phase"
 * Reference: HH_Principles.md -- "Terrain", "1" Exclusion Zone", "Coherency"
 *
 * Supports both per-model moves and atomic full-unit moves. The unit tracks
 * whether it has moved, declared a rush, or completed a rush this turn.
 *
 * Move flow:
 * 1. Validate model exists and belongs to active player
 * 2. Validate unit can move (not pinned, not locked, etc.)
 * 3. Validate the specific move (range, exclusion zone, impassable, etc.)
 * 4. If ending in dangerous terrain, roll dangerous terrain test
 * 5. Update model position
 * 6. Track that unit has moved
 * 7. Check coherency after move (warn if broken -- unit gains Suppressed)
 * 8. Return CommandResult with events
 */

import type {
  GameState,
  Position,
  UnitState,
} from '@hh/types';
import {
  UnitMovementState,
  TacticalStatus,
  PipelineHook,
  TerrainType,
} from '@hh/types';
import {
  vec2Distance,
  checkCoherency,
  STANDARD_COHERENCY_RANGE,
  pointInTerrainShape,
  terrainChordLength,
  EPSILON,
} from '@hh/geometry';
import { getTacticaEffectsForLegion } from '@hh/data';
import type { CommandResult, GameEvent, DiceProvider } from '../types';
import type {
  DangerousTerrainTestEvent,
  ModelMovedEvent,
  UnitRushedEvent,
  StatusAppliedEvent,
  SavingThrowRollEvent,
  DamageAppliedEvent,
} from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setMovementState,
  addStatus,
  applyWoundsToModel,
} from '../state-helpers';
import {
  findModel,
  findUnit,
  findUnitPlayerIndex,
  canUnitMove,
  canUnitRush,
  getEnemyModelShapes,
  getUnitModelShapes,
  getModelShape,
  getUnitLegion,
} from '../game-queries';
import {
  validateModelMove,
} from './movement-validator';
import { applyLegionTactica } from '../legion';
import {
  getModelInvulnSave,
  getModelStateCharacteristics,
  isVehicleCharacteristics,
} from '../profile-lookup';
import { getCurrentModelInitiative, getCurrentModelMovement } from '../runtime-characteristics';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default Movement characteristic value for standard Marines.
 * Used as fallback when profile data is unavailable.
 */
export const DEFAULT_MOVEMENT = 7;

/**
 * Default Initiative characteristic value for standard Marines.
 * Used as fallback when profile data is unavailable.
 */
export const DEFAULT_INITIATIVE = 4;

/**
 * Dangerous Terrain test failure threshold.
 * A roll of this value or below on a d6 means the test is failed.
 * Reference: HH_Principles.md -- "Dangerous Terrain"
 */
const DANGEROUS_TERRAIN_FAIL_THRESHOLD = 1;

/**
 * Damage value for wounds caused by dangerous terrain test failures.
 */
const DANGEROUS_TERRAIN_DAMAGE = 1;

function chooseBestTargetNumber(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (validValues.length === 0) {
    return null;
  }
  return Math.min(...validValues);
}

function getModifierThreshold(model: { modifiers: Array<{ characteristic: string; operation: string; value: number }> }, characteristic: string): number | null {
  const matching = model.modifiers.filter(
    (modifier) => modifier.characteristic.toLowerCase() === characteristic.toLowerCase(),
  );
  if (matching.length === 0) {
    return null;
  }

  const setValues = matching
    .filter((modifier) => modifier.operation === 'set')
    .map((modifier) => modifier.value);
  if (setValues.length > 0) {
    return chooseBestTargetNumber(setValues);
  }

  return chooseBestTargetNumber(matching.map((modifier) => modifier.value));
}

function getEffectiveInvulnerableSave(model: { unitProfileId: string; profileModelName: string; modifiers: Array<{ characteristic: string; operation: string; value: number }> }): number | null {
  return chooseBestTargetNumber([
    getModelInvulnSave(model.unitProfileId, model.profileModelName),
    getModifierThreshold(model, 'InvulnSave'),
  ]);
}

export function hasDangerousTerrainInteraction(
  startPosition: Position,
  endPosition: Position,
  terrain: GameState['terrain'],
): boolean {
  for (const piece of terrain) {
    if (piece.type !== TerrainType.Dangerous && !piece.isDangerous) {
      continue;
    }

    if (
      pointInTerrainShape(startPosition, piece.shape) ||
      pointInTerrainShape(endPosition, piece.shape) ||
      terrainChordLength(startPosition, endPosition, piece) > EPSILON
    ) {
      return true;
    }
  }

  return false;
}

function hasTakenDangerousTerrainTestThisPhase(state: GameState, modelId: string): boolean {
  return state.dangerousTerrainTestedModelIds?.includes(modelId) ?? false;
}

function markDangerousTerrainTestTaken(state: GameState, modelId: string): GameState {
  if (hasTakenDangerousTerrainTestThisPhase(state, modelId)) {
    return state;
  }

  return {
    ...state,
    dangerousTerrainTestedModelIds: [
      ...(state.dangerousTerrainTestedModelIds ?? []),
      modelId,
    ],
  };
}

export function resolveDangerousTerrainOutcome(
  state: GameState,
  unitId: string,
  modelId: string,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  const unit = findUnit(state, unitId);
  const model = unit?.models.find((candidate) => candidate.id === modelId);
  if (!unit || !model || model.isDestroyed) {
    return { state, events: [] };
  }

  const characteristics = getModelStateCharacteristics(model);
  const isVehicle = characteristics ? isVehicleCharacteristics(characteristics) : false;
  const events: GameEvent[] = [];
  let newState = state;

  if (isVehicle) {
    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, modelId, (currentModel) =>
        applyWoundsToModel(currentModel, DANGEROUS_TERRAIN_DAMAGE),
      ),
    );

    const updatedModel = findUnit(newState, unitId)?.models.find((candidate) => candidate.id === modelId);
    const damageEvent: DamageAppliedEvent = {
      type: 'damageApplied',
      modelId,
      unitId,
      woundsLost: DANGEROUS_TERRAIN_DAMAGE,
      remainingWounds: updatedModel?.currentWounds ?? 0,
      destroyed: updatedModel?.isDestroyed ?? false,
      damageSource: 'dangerousTerrain',
    };
    events.push(damageEvent);

    return { state: newState, events };
  }

  const invulnerableSave = getEffectiveInvulnerableSave(model);
  if (invulnerableSave !== null) {
    const saveRoll = dice.rollD6();
    const passed = saveRoll >= invulnerableSave;
    const saveEvent: SavingThrowRollEvent = {
      type: 'savingThrowRoll',
      modelId,
      saveType: 'invulnerable',
      roll: saveRoll,
      targetNumber: invulnerableSave,
      passed,
      weaponAP: 2,
    };
    events.push(saveEvent);

    if (passed) {
      return { state: newState, events };
    }
  }

  newState = updateUnitInGameState(newState, unitId, (u) =>
    updateModelInUnit(u, modelId, (currentModel) =>
      applyWoundsToModel(currentModel, DANGEROUS_TERRAIN_DAMAGE),
    ),
  );

  const updatedModel = findUnit(newState, unitId)?.models.find((candidate) => candidate.id === modelId);
  const damageEvent: DamageAppliedEvent = {
    type: 'damageApplied',
    modelId,
    unitId,
    woundsLost: DANGEROUS_TERRAIN_DAMAGE,
    remainingWounds: updatedModel?.currentWounds ?? 0,
    destroyed: updatedModel?.isDestroyed ?? false,
    damageSource: 'dangerousTerrain',
  };
  events.push(damageEvent);

  return { state: newState, events };
}

function getCannotRushReason(unit: UnitState): string {
  if (unit.statuses.includes(TacticalStatus.Pinned)) {
    return 'Unit is Pinned';
  }
  if (unit.isLockedInCombat) {
    return 'Unit is locked in combat';
  }
  if (!unit.isDeployed) {
    return 'Unit is not deployed';
  }
  if (unit.embarkedOnId !== null) {
    return 'Unit is embarked on a transport';
  }
  if (unit.movementState !== UnitMovementState.Stationary) {
    if (unit.movementState === UnitMovementState.RushDeclared) {
      return 'Unit has already declared a Rush this turn';
    }
    return `Unit has already ${unit.movementState === UnitMovementState.Moved ? 'moved' : 'acted'} this turn`;
  }
  return 'Unknown';
}

// ─── handleMoveModel ────────────────────────────────────────────────────────

/**
 * Handle moving a single model to a target position during the Move Sub-Phase.
 *
 * This function validates the move, applies terrain effects, updates the model's
 * position, and tracks the unit's movement state. Individual models within a unit
 * are moved one at a time -- the unit's movement state transitions from Stationary
 * to Moved on the first model move.
 *
 * @param state - Current game state
 * @param modelId - ID of the model to move
 * @param targetPosition - Target position in inches
 * @param dice - Dice provider for dangerous terrain tests
 * @returns CommandResult with updated state, events, and errors
 */
export function handleMoveModel(
  state: GameState,
  modelId: string,
  targetPosition: Position,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];

  // ── Step 1: Find the model and validate ownership ─────────────────────

  const modelInfo = findModel(state, modelId);
  if (!modelInfo) {
    return {
      state,
      events: [],
      errors: [{
        code: 'MODEL_NOT_FOUND',
        message: `Model "${modelId}" not found in any army`,
        context: { modelId },
      }],
      accepted: false,
    };
  }

  const { model, unit } = modelInfo;
  const unitId = unit.id;

  // Validate model belongs to the active player
  const playerIndex = findUnitPlayerIndex(state, unitId);
  if (playerIndex === undefined || playerIndex !== state.activePlayerIndex) {
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_ACTIVE_PLAYER',
        message: 'Model does not belong to the active player',
        context: { modelId, unitId, playerIndex, activePlayerIndex: state.activePlayerIndex },
      }],
      accepted: false,
    };
  }

  // ── Step 2: Validate the unit can move ────────────────────────────────

  if (!canUnitMove(unit)) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_CANNOT_MOVE',
        message: `Unit "${unitId}" cannot move (pinned, locked in combat, embarked, or not deployed)`,
        context: { unitId, movementState: unit.movementState, statuses: unit.statuses },
      }],
      accepted: false,
    };
  }

  // ── Step 3: Determine effective movement and validate the move ────────

  // Calculate max move distance using the model's actual Movement characteristic.
  // Apply legion tactica movement bonuses (e.g., White Scars +2M).
  // Legacy rush flow resolves through moveModel after rushUnit, so both the
  // declared and in-progress rushed states use M + I here.
  const isRushMove =
    unit.movementState === UnitMovementState.RushDeclared
    || unit.movementState === UnitMovementState.Rushed;
  let maxMoveDistance = getCurrentModelMovement(unit, model)
    + (isRushMove ? getCurrentModelInitiative(unit, model) : 0);

  const unitLegion = getUnitLegion(state, unitId);
  if (unitLegion) {
    const effects = getTacticaEffectsForLegion(unitLegion);
    const tacticaResult = applyLegionTactica(unitLegion, PipelineHook.Movement, {
      state,
      unit,
      effects,
      hook: PipelineHook.Movement,
      moveDistance: 0,
      entireUnitHasTactica: true,
    });
    if (tacticaResult.movementBonus) {
      maxMoveDistance += tacticaResult.movementBonus;
    }
  }

  // Get enemy model shapes for exclusion zone check
  const enemyShapes = getEnemyModelShapes(state, playerIndex);

  // Get friendly model shapes (excluding the moving model itself)
  const friendlyShapes = getUnitModelShapes(unit)
    .filter((_, idx) => unit.models[idx].id !== modelId);

  // Validate the move using the movement validator
  const moveErrors = validateModelMove(
    model,
    targetPosition,
    maxMoveDistance,
    state.terrain,
    enemyShapes,
    friendlyShapes,
    state.battlefield.width,
    state.battlefield.height,
  );

  if (moveErrors.length > 0) {
    return {
      state,
      events: [],
      errors: moveErrors,
      accepted: false,
    };
  }

  // ── Step 4: Dangerous terrain test ────────────────────────────────────
  // Check if legion tactica grants immunity to difficult terrain (e.g., Death Guard)

  let newState = state;
  let ignoresDifficultTerrain = false;
  if (unitLegion) {
    const effects = getTacticaEffectsForLegion(unitLegion);
    const movementResult = applyLegionTactica(unitLegion, PipelineHook.Movement, {
      state,
      unit,
      effects,
      hook: PipelineHook.Movement,
      moveDistance: 0,
      entireUnitHasTactica: true,
    });
    if (movementResult.ignoresDifficultTerrain) {
      ignoresDifficultTerrain = true;
    }
  }

  if (
    !ignoresDifficultTerrain &&
    !hasTakenDangerousTerrainTestThisPhase(state, modelId) &&
    hasDangerousTerrainInteraction(model.position, targetPosition, state.terrain)
  ) {
    const dangerousResult = handleDangerousTerrainTest(modelId, unitId, dice);
    events.push(dangerousResult.event);
    newState = markDangerousTerrainTestTaken(newState, modelId);

    if (!dangerousResult.passed) {
      const dangerousOutcome = resolveDangerousTerrainOutcome(newState, unitId, modelId, dice);
      newState = dangerousOutcome.state;
      events.push(...dangerousOutcome.events);
    }
  }

  // ── Step 5: Update model position ─────────────────────────────────────

  const fromPosition = model.position;
  const distanceMoved = vec2Distance(fromPosition, targetPosition);

  newState = updateUnitInGameState(newState, unitId, (u) =>
    updateModelInUnit(u, modelId, (m) => moveModel(m, targetPosition)),
  );

  // Emit ModelMoved event
  const movedEvent: ModelMovedEvent = {
    type: 'modelMoved',
    modelId,
    unitId,
    fromPosition,
    toPosition: targetPosition,
    distanceMoved,
  };
  events.push(movedEvent);

  // ── Step 6: Track that the unit has moved ─────────────────────────────

  // A declared Rush is consumed by the move; otherwise transition from
  // Stationary to Moved on the first model move.
  const currentUnit = findUnit(newState, unitId);
  if (currentUnit) {
    if (currentUnit.movementState === UnitMovementState.RushDeclared) {
      newState = updateUnitInGameState(newState, unitId, (u) =>
        setMovementState(u, UnitMovementState.Rushed),
      );
    } else if (currentUnit.movementState === UnitMovementState.Stationary) {
      newState = updateUnitInGameState(newState, unitId, (u) =>
        setMovementState(u, UnitMovementState.Moved),
      );
    }
  }

  // ── Step 7: Check coherency after move ────────────────────────────────

  const updatedUnit = findUnit(newState, unitId);
  if (updatedUnit) {
    const aliveModels = updatedUnit.models.filter(m => !m.isDestroyed);
    if (aliveModels.length > 1) {
      const unitShapes = aliveModels.map(m => getModelShape(m));
      const coherencyResult = checkCoherency(unitShapes, STANDARD_COHERENCY_RANGE);

      if (!coherencyResult.isCoherent) {
        // Unit is out of coherency -- apply Suppressed status as a penalty.
        // Reference: HH_Principles.md -- units that break coherency gain Suppressed.
        newState = updateUnitInGameState(newState, unitId, (u) =>
          addStatus(u, TacticalStatus.Suppressed),
        );

        const suppressedEvent: StatusAppliedEvent = {
          type: 'statusApplied',
          unitId,
          status: TacticalStatus.Suppressed,
        };
        events.push(suppressedEvent);
      }
    }
  }

  // ── Return result ─────────────────────────────────────────────────────

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── handleMoveUnit ─────────────────────────────────────────────────────────

/**
 * Handle moving an entire unit atomically using explicit per-model destinations.
 *
 * This validates each model movement against the current battlefield state, then
 * applies all model position updates in one command so coherency is evaluated only
 * on the final arrangement.
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to move
 * @param modelPositions - Destination positions for all alive models in the unit
 * @param dice - Dice provider for dangerous terrain tests
 * @returns CommandResult with updated state, events, and errors
 */
export function handleMoveUnit(
  state: GameState,
  unitId: string,
  modelPositions: { modelId: string; position: Position }[],
  dice: DiceProvider,
  options: { isRush?: boolean; expectedPlayerIndex?: number } = {},
): CommandResult {
  const events: GameEvent[] = [];
  const isRush = options.isRush === true;
  const expectedPlayerIndex = options.expectedPlayerIndex ?? state.activePlayerIndex;

  // ── Step 1: Find unit and validate ownership ─────────────────────────

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

  const playerIndex = findUnitPlayerIndex(state, unitId);
  if (playerIndex === undefined || playerIndex !== expectedPlayerIndex) {
    const ownershipDescription = expectedPlayerIndex === state.activePlayerIndex
      ? 'active player'
      : 'acting player';
    return {
      state,
      events: [],
      errors: [{
        code: 'NOT_ACTIVE_PLAYER',
        message: `Unit does not belong to the ${ownershipDescription}`,
        context: {
          unitId,
          playerIndex,
          expectedPlayerIndex,
          activePlayerIndex: state.activePlayerIndex,
        },
      }],
      accepted: false,
    };
  }

  // ── Step 2: Validate unit movement eligibility ───────────────────────

  if (isRush) {
    const rushAlreadyDeclared = unit.movementState === UnitMovementState.RushDeclared;
    if (!rushAlreadyDeclared && !canUnitRush(unit)) {
      const reason = getCannotRushReason(unit);
      return {
        state,
        events: [],
        errors: [{
          code: 'UNIT_CANNOT_RUSH',
          message: `Unit "${unitId}" cannot rush: ${reason}`,
          context: { unitId, reason, movementState: unit.movementState, statuses: unit.statuses },
        }],
        accepted: false,
      };
    }
  } else {
    if (!canUnitMove(unit)) {
      return {
        state,
        events: [],
        errors: [{
          code: 'UNIT_CANNOT_MOVE',
          message: `Unit "${unitId}" cannot move (pinned, locked in combat, embarked, or not deployed)`,
          context: { unitId, movementState: unit.movementState, statuses: unit.statuses },
        }],
        accepted: false,
      };
    }

    if (
      unit.movementState === UnitMovementState.Rushed
      || unit.movementState === UnitMovementState.RushDeclared
    ) {
      return {
        state,
        events: [],
        errors: [{
          code: 'UNIT_ALREADY_RUSHED',
          message: `Unit "${unitId}" has already rushed this turn and cannot make normal moves`,
          context: { unitId },
        }],
        accepted: false,
      };
    }
  }

  const aliveModels = unit.models.filter(m => !m.isDestroyed);
  if (aliveModels.length === 0) {
    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_HAS_NO_ALIVE_MODELS',
        message: `Unit "${unitId}" has no alive models to move`,
        context: { unitId },
      }],
      accepted: false,
    };
  }

  // Atomic unit move requires a destination for every alive model.
  if (modelPositions.length !== aliveModels.length) {
    return {
      state,
      events: [],
      errors: [{
        code: 'MODEL_POSITION_COUNT_MISMATCH',
        message: `Expected ${aliveModels.length} model positions, received ${modelPositions.length}`,
        context: { unitId, expected: aliveModels.length, received: modelPositions.length },
      }],
      accepted: false,
    };
  }

  const aliveModelIds = new Set(aliveModels.map(m => m.id));
  const targetPositionByModelId = new Map<string, Position>();

  for (const mp of modelPositions) {
    if (!aliveModelIds.has(mp.modelId)) {
      return {
        state,
        events: [],
        errors: [{
          code: 'MODEL_NOT_IN_UNIT',
          message: `Model "${mp.modelId}" is not an alive member of unit "${unitId}"`,
          context: { unitId, modelId: mp.modelId },
        }],
        accepted: false,
      };
    }
    if (targetPositionByModelId.has(mp.modelId)) {
      return {
        state,
        events: [],
        errors: [{
          code: 'DUPLICATE_MODEL_POSITION',
          message: `Duplicate destination provided for model "${mp.modelId}"`,
          context: { unitId, modelId: mp.modelId },
        }],
        accepted: false,
      };
    }
    targetPositionByModelId.set(mp.modelId, mp.position);
  }

  for (const model of aliveModels) {
    if (!targetPositionByModelId.has(model.id)) {
      return {
        state,
        events: [],
        errors: [{
          code: 'MISSING_MODEL_POSITION',
          message: `Missing destination for model "${model.id}" in unit "${unitId}"`,
          context: { unitId, modelId: model.id },
        }],
        accepted: false,
      };
    }
  }

  // ── Step 3: Compute tactica movement modifiers ───────────────────────

  let movementBonus = 0;
  let ignoresDifficultTerrain = false;
  const unitLegion = getUnitLegion(state, unitId);
  if (unitLegion) {
    const effects = getTacticaEffectsForLegion(unitLegion);
    const tacticaResult = applyLegionTactica(unitLegion, PipelineHook.Movement, {
      state,
      unit,
      effects,
      hook: PipelineHook.Movement,
      moveDistance: 0,
      entireUnitHasTactica: true,
    });
    if (tacticaResult.movementBonus) {
      movementBonus = tacticaResult.movementBonus;
    }
    if (tacticaResult.ignoresDifficultTerrain) {
      ignoresDifficultTerrain = true;
    }
  }

  // ── Step 4: Validate every model against final arrangement ───────────

  const enemyShapes = getEnemyModelShapes(state, playerIndex);

  for (const model of aliveModels) {
    const targetPosition = targetPositionByModelId.get(model.id)!;
    const maxMoveDistance =
      getCurrentModelMovement(unit, model)
      + (isRush ? getCurrentModelInitiative(unit, model) : 0)
      + movementBonus;

    const friendlyShapes = aliveModels
      .filter(other => other.id !== model.id)
      .map((other) => {
        const otherTarget = targetPositionByModelId.get(other.id) ?? other.position;
        return getModelShape({ ...other, position: otherTarget });
      });

    const moveErrors = validateModelMove(
      model,
      targetPosition,
      maxMoveDistance,
      state.terrain,
      enemyShapes,
      friendlyShapes,
      state.battlefield.width,
      state.battlefield.height,
    );

    if (moveErrors.length > 0) {
      return {
        state,
        events: [],
        errors: moveErrors,
        accepted: false,
      };
    }
  }

  // ── Step 5: Apply dangerous terrain and movement updates atomically ──

  let newState = state;

  for (const model of aliveModels) {
    const targetPosition = targetPositionByModelId.get(model.id)!;

    if (
      !ignoresDifficultTerrain &&
      !hasTakenDangerousTerrainTestThisPhase(newState, model.id) &&
      hasDangerousTerrainInteraction(model.position, targetPosition, state.terrain)
    ) {
      const dangerousResult = handleDangerousTerrainTest(model.id, unitId, dice);
      events.push(dangerousResult.event);
      newState = markDangerousTerrainTestTaken(newState, model.id);

      if (!dangerousResult.passed) {
        const dangerousOutcome = resolveDangerousTerrainOutcome(newState, unitId, model.id, dice);
        newState = dangerousOutcome.state;
        events.push(...dangerousOutcome.events);
      }
    }

    const fromPosition = model.position;
    const distanceMoved = vec2Distance(fromPosition, targetPosition);

    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, model.id, (m) => moveModel(m, targetPosition)),
    );

    const movedEvent: ModelMovedEvent = {
      type: 'modelMoved',
      modelId: model.id,
      unitId,
      fromPosition,
      toPosition: targetPosition,
      distanceMoved,
    };
    events.push(movedEvent);
  }

  // ── Step 6: Track that the unit has moved ────────────────────────────

  if (isRush) {
    newState = updateUnitInGameState(newState, unitId, (u) =>
      setMovementState(u, UnitMovementState.Rushed),
    );

    const refModel = aliveModels[0];
    const rushDistance =
      getCurrentModelMovement(unit, refModel)
      + getCurrentModelInitiative(unit, refModel)
      + movementBonus;

    const rushedEvent: UnitRushedEvent = {
      type: 'unitRushed',
      unitId,
      rushDistance,
    };
    events.push(rushedEvent);
  } else {
    const currentUnit = findUnit(newState, unitId);
    if (currentUnit && currentUnit.movementState === UnitMovementState.Stationary) {
      newState = updateUnitInGameState(newState, unitId, (u) =>
        setMovementState(u, UnitMovementState.Moved),
      );
    }
  }

  // ── Step 7: Check coherency once on final arrangement ────────────────

  const updatedUnit = findUnit(newState, unitId);
  if (updatedUnit) {
    const aliveAfterMove = updatedUnit.models.filter(m => !m.isDestroyed);
    if (aliveAfterMove.length > 1) {
      const unitShapes = aliveAfterMove.map(m => getModelShape(m));
      const coherencyResult = checkCoherency(unitShapes, STANDARD_COHERENCY_RANGE);

      if (!coherencyResult.isCoherent) {
        newState = updateUnitInGameState(newState, unitId, (u) =>
          addStatus(u, TacticalStatus.Suppressed),
        );

        const suppressedEvent: StatusAppliedEvent = {
          type: 'statusApplied',
          unitId,
          status: TacticalStatus.Suppressed,
        };
        events.push(suppressedEvent);
      }
    }
  }

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── handleRushUnit ─────────────────────────────────────────────────────────

/**
 * Handle declaring a Rush for a unit.
 *
 * A Rush allows the unit to move at M + I distance instead of just M, but the
 * unit is then prevented from shooting or charging for the rest of the turn.
 *
 * This function records the rush declaration by setting the unit state to
 * RushDeclared and emitting the rush distance. The subsequent movement can be
 * resolved either via handleMoveModel (legacy sequential flow) or
 * handleMoveUnit(..., { isRush: true }) (atomic flow).
 *
 * @param state - Current game state
 * @param unitId - ID of the unit to rush
 * @param dice - Dice provider (not used currently, reserved for Fleet re-roll)
 * @returns CommandResult with updated state and events
 */
export function handleRushUnit(
  state: GameState,
  unitId: string,
  _dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];

  // ── Step 1: Find and validate the unit ────────────────────────────────

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

  // ── Step 2: Validate the unit can rush ────────────────────────────────

  if (!canUnitRush(unit)) {
    const reason = getCannotRushReason(unit);

    return {
      state,
      events: [],
      errors: [{
        code: 'UNIT_CANNOT_RUSH',
        message: `Unit "${unitId}" cannot rush: ${reason}`,
        context: { unitId, reason, movementState: unit.movementState, statuses: unit.statuses },
      }],
      accepted: false,
    };
  }

  // ── Step 3: Set rush state ────────────────────────────────────────────
  // Apply legion tactica movement bonuses (e.g., White Scars +2M)
  let rushMovementBonus = 0;
  const rushUnitLegion = getUnitLegion(state, unitId);
  if (rushUnitLegion) {
    const effects = getTacticaEffectsForLegion(rushUnitLegion);
    const tacticaResult = applyLegionTactica(rushUnitLegion, PipelineHook.Movement, {
      state,
      unit,
      effects,
      hook: PipelineHook.Movement,
      moveDistance: 0,
      entireUnitHasTactica: true,
    });
    if (tacticaResult.movementBonus) {
      rushMovementBonus = tacticaResult.movementBonus;
    }
  }

  // Use the first alive model's M + I for rush distance
  const aliveModels = unit.models.filter(m => !m.isDestroyed);
  const refModel = aliveModels[0];
  const unitM = refModel ? getCurrentModelMovement(unit, refModel) : DEFAULT_MOVEMENT;
  const unitI = refModel ? getCurrentModelInitiative(unit, refModel) : DEFAULT_INITIATIVE;
  const rushDistance = unitM + unitI + rushMovementBonus;

  let newState = updateUnitInGameState(state, unitId, (u) =>
    setMovementState(u, UnitMovementState.RushDeclared),
  );

  // Emit UnitRushed event
  const rushedEvent: UnitRushedEvent = {
    type: 'unitRushed',
    unitId,
    rushDistance,
  };
  events.push(rushedEvent);

  // ── Return result ─────────────────────────────────────────────────────

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── handleDangerousTerrainTest ─────────────────────────────────────────────

/**
 * Perform a Dangerous Terrain test for a model.
 *
 * Reference: HH_Principles.md -- "Dangerous Terrain"
 * Roll a d6. On a roll of 1, the model suffers an AP2, D1 wound that can only
 * be negated by an Invulnerable Save.
 *
 * @param modelId - ID of the model being tested
 * @param unitId - ID of the unit the model belongs to
 * @param dice - Dice provider for the d6 roll
 * @returns Object with passed (boolean) and the event to emit
 */
export function handleDangerousTerrainTest(
  modelId: string,
  unitId: string,
  dice: DiceProvider,
): { passed: boolean; event: DangerousTerrainTestEvent } {
  const roll = dice.rollD6();
  const passed = roll > DANGEROUS_TERRAIN_FAIL_THRESHOLD;
  const woundsCaused = passed ? 0 : DANGEROUS_TERRAIN_DAMAGE;

  const event: DangerousTerrainTestEvent = {
    type: 'dangerousTerrainTest',
    modelId,
    unitId,
    roll,
    passed,
    woundsCaused,
  };

  return { passed, event };
}
