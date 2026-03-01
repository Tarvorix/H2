/**
 * Move Sub-Phase Handler
 * Handles normal moves, rush moves, and dangerous terrain tests.
 *
 * Reference: HH_Rules_Battle.md -- "Movement Phase"
 * Reference: HH_Principles.md -- "Terrain", "1" Exclusion Zone", "Coherency"
 *
 * Models are moved individually within a unit. The unit tracks whether it has
 * moved (UnitMovementState.Moved) or rushed (UnitMovementState.Rushed).
 * Individual models are moved one at a time to their target positions.
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
} from '@hh/types';
import {
  UnitMovementState,
  TacticalStatus,
  PipelineHook,
} from '@hh/types';
import { vec2Distance, checkCoherency, STANDARD_COHERENCY_RANGE } from '@hh/geometry';
import { getTacticaEffectsForLegion } from '@hh/data';
import type { CommandResult, GameEvent, DiceProvider } from '../types';
import type { DangerousTerrainTestEvent, ModelMovedEvent, UnitRushedEvent, StatusAppliedEvent } from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setMovementState,
  addStatus,
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
  isInDangerousTerrain,
} from './movement-validator';
import { applyLegionTactica } from '../legion';
import { getModelMovement, getModelInitiative } from '../profile-lookup';

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

  // A unit that has Rushed cannot make additional normal moves
  if (unit.movementState === UnitMovementState.Rushed) {
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

  // ── Step 3: Determine effective movement and validate the move ────────

  // Calculate max move distance using the model's actual Movement characteristic.
  // Apply legion tactica movement bonuses (e.g., White Scars +2M)
  let maxMoveDistance = getModelMovement(model.unitProfileId, model.profileModelName);

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

  if (!ignoresDifficultTerrain && isInDangerousTerrain(targetPosition, state.terrain)) {
    const dangerousResult = handleDangerousTerrainTest(modelId, unitId, dice);
    events.push(dangerousResult.event);

    if (!dangerousResult.passed) {
      // Model takes an AP2 D1 wound (simplified: reduce current wounds by 1)
      // In a full implementation, this would go through the saving throw pipeline
      // with only INV saves allowed. For now, we directly apply the wound.
      newState = updateUnitInGameState(newState, unitId, (u) =>
        updateModelInUnit(u, modelId, (m) => {
          const newWounds = m.currentWounds - DANGEROUS_TERRAIN_DAMAGE;
          return {
            ...m,
            currentWounds: newWounds,
            isDestroyed: newWounds <= 0,
          };
        }),
      );
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

  // Only transition from Stationary to Moved. If already Moved (another model
  // in the same unit was moved previously), keep it as Moved.
  const currentUnit = findUnit(newState, unitId);
  if (currentUnit && currentUnit.movementState === UnitMovementState.Stationary) {
    newState = updateUnitInGameState(newState, unitId, (u) =>
      setMovementState(u, UnitMovementState.Moved),
    );
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

// ─── handleRushUnit ─────────────────────────────────────────────────────────

/**
 * Handle declaring a Rush for a unit.
 *
 * A Rush allows the unit to move at M + I distance instead of just M, but the
 * unit is marked as Rushed and cannot shoot or charge for the rest of the turn.
 *
 * This function only sets the unit's movement state to Rushed and records the
 * rush distance. The actual model-by-model movement is still done via
 * handleMoveModel, which will use the rush distance instead of normal M when
 * the unit's state is Rushed.
 *
 * Note: In the current implementation, handleMoveModel uses DEFAULT_MOVEMENT
 * for move validation. When a unit is rushing, the caller should use the rush
 * distance for validation. This is a simplification -- a full implementation
 * would check the unit's movement state and use the appropriate distance.
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
    // Determine the specific reason
    let reason = 'Unknown';
    if (unit.statuses.includes(TacticalStatus.Pinned)) {
      reason = 'Unit is Pinned';
    } else if (unit.isLockedInCombat) {
      reason = 'Unit is locked in combat';
    } else if (!unit.isDeployed) {
      reason = 'Unit is not deployed';
    } else if (unit.embarkedOnId !== null) {
      reason = 'Unit is embarked on a transport';
    } else if (unit.movementState !== UnitMovementState.Stationary) {
      reason = `Unit has already ${unit.movementState === UnitMovementState.Moved ? 'moved' : 'acted'} this turn`;
    }

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
  const unitM = refModel ? getModelMovement(refModel.unitProfileId, refModel.profileModelName) : DEFAULT_MOVEMENT;
  const unitI = refModel ? getModelInitiative(refModel.unitProfileId, refModel.profileModelName) : DEFAULT_INITIATIVE;
  const rushDistance = unitM + unitI + rushMovementBonus;

  let newState = updateUnitInGameState(state, unitId, (u) =>
    setMovementState(u, UnitMovementState.Rushed),
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
 * be negated by an Invulnerable Save (simplified: directly apply wound for now).
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
