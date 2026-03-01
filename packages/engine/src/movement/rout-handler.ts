/**
 * Rout Sub-Phase Handler
 * Auto-processes all Routed units in the active army.
 *
 * Reference: HH_Rules_Battle.md -- "Rout Sub-Phase"
 * Reference: HH_Principles.md -- "Tactical Statuses: Routed"
 *
 * Rout flow:
 * 1. Identify all Routed units in the active army.
 * 2. For each routed unit: fall back I + 1d6 inches toward the nearest battlefield edge.
 * 3. Terrain penalties apply normally (difficult terrain reduces movement).
 * 4. Coherency is relaxed during rout movement (movement takes priority).
 * 5. If any models reach the battlefield edge, the unit takes a Leadership Check.
 *    - Roll 2d6 <= LD stat to pass.
 *    - On failure: unit is removed (destroyed).
 *    - On pass: unit loses Routed status and gains Suppressed instead.
 */

import type {
  GameState,
  UnitState,
  Position,
} from '@hh/types';
import {
  UnitMovementState,
  TacticalStatus,
} from '@hh/types';
import {
  vec2Scale,
  vec2Add,
} from '@hh/geometry';
import type { CommandResult, GameEvent, DiceProvider } from '../types';
import type {
  RoutMoveEvent,
  LeadershipCheckEvent,
  StatusAppliedEvent,
  StatusRemovedEvent,
  UnitDestroyedEvent,
} from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setMovementState,
  addStatus,
  removeStatus,
} from '../state-helpers';
import {
  getRoutedUnits,
  getAliveModels,
  findUnit,
} from '../game-queries';
import { computeTerrainPenalty } from './movement-validator';
import { getModelInitiative, getModelLeadership } from '../profile-lookup';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default Initiative characteristic value for standard Marines.
 * Used as fallback when profile data is unavailable.
 */
export const DEFAULT_INITIATIVE = 4;

/**
 * Default Leadership characteristic value for standard Marines.
 * Used as fallback when profile data is unavailable.
 */
export const DEFAULT_LEADERSHIP = 7;

/**
 * Edge threshold distance in inches.
 * A model is considered to have "reached the edge" if it is within this
 * distance of any battlefield edge after its fall-back movement.
 */
export const EDGE_THRESHOLD = 0.5;

// ─── handleRoutSubPhase ─────────────────────────────────────────────────────

/**
 * Auto-process all Routed units in the active army.
 *
 * Each routed unit falls back toward the nearest battlefield edge by I + 1d6
 * inches. If any model reaches the edge, the entire unit must take a Leadership
 * Check (2d6 <= LD). Failure means the unit is destroyed; success means the
 * unit loses Routed and gains Suppressed.
 *
 * @param state - Current game state
 * @param dice - Dice provider for d6 rolls
 * @returns CommandResult with updated state, events, and errors
 */
export function handleRoutSubPhase(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  let newState = state;

  // Get all routed units in the active army
  const routedUnits = getRoutedUnits(newState);

  // If no routed units, this is a no-op
  if (routedUnits.length === 0) {
    return {
      state: newState,
      events: [],
      errors: [],
      accepted: true,
    };
  }

  // Process each routed unit
  for (const unit of routedUnits) {
    const result = processRoutedUnit(newState, unit, dice);
    newState = result.state;
    events.push(...result.events);
  }

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── processRoutedUnit ──────────────────────────────────────────────────────

/**
 * Process a single routed unit's fall-back movement and leadership check.
 */
function processRoutedUnit(
  state: GameState,
  unit: UnitState,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let newState = state;

  // Roll 1d6 for fall-back distance
  const diceRoll = dice.rollD6();
  // Use the first alive model's Initiative for fall-back distance
  const refModel = getAliveModels(unit)[0];
  const unitInitiative = refModel ? getModelInitiative(refModel.unitProfileId, refModel.profileModelName) : DEFAULT_INITIATIVE;
  const fallBackDistance = computeFallBackDistance(unitInitiative, diceRoll);

  // Move each alive model toward the nearest battlefield edge
  const aliveModels = getAliveModels(unit);
  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  let anyModelReachedEdge = false;

  for (const model of aliveModels) {
    const direction = computeFallBackDirection(
      model.position,
      state.battlefield.width,
      state.battlefield.height,
    );

    // Apply terrain penalty to the fall-back distance
    const proposedEnd: Position = vec2Add(
      model.position,
      vec2Scale(direction, fallBackDistance),
    );
    const terrainPenalty = computeTerrainPenalty(proposedEnd, state.terrain);
    const effectiveDistance = Math.max(0, fallBackDistance - terrainPenalty);

    // Compute final position
    let newPosition: Position = vec2Add(
      model.position,
      vec2Scale(direction, effectiveDistance),
    );

    // Clamp to battlefield bounds
    newPosition = clampToBattlefield(
      newPosition,
      state.battlefield.width,
      state.battlefield.height,
    );

    // Check if model reached the edge
    if (isAtBattlefieldEdge(newPosition, state.battlefield.width, state.battlefield.height)) {
      anyModelReachedEdge = true;
    }

    modelMoves.push({
      modelId: model.id,
      from: model.position,
      to: newPosition,
    });

    // Update model position
    newState = updateUnitInGameState(newState, unit.id, (u) =>
      updateModelInUnit(u, model.id, (m) => moveModel(m, newPosition)),
    );
  }

  // Set unit movement state to FellBack
  newState = updateUnitInGameState(newState, unit.id, (u) =>
    setMovementState(u, UnitMovementState.FellBack),
  );

  // Emit RoutMoveEvent
  const routEvent: RoutMoveEvent = {
    type: 'routMove',
    unitId: unit.id,
    distanceRolled: diceRoll,
    modelMoves,
    reachedEdge: anyModelReachedEdge,
  };
  events.push(routEvent);

  // If any model reached the edge, take a Leadership Check
  if (anyModelReachedEdge) {
    const ldResult = handleLeadershipCheck(newState, unit.id, dice);
    newState = ldResult.state;
    events.push(...ldResult.events);
  }

  return { state: newState, events };
}

// ─── handleLeadershipCheck ──────────────────────────────────────────────────

/**
 * Handle a Leadership Check for a routed unit that has reached the battlefield edge.
 *
 * Roll 2d6. If the total is <= the unit's LD stat, the check passes.
 * - Pass: unit loses Routed, gains Suppressed.
 * - Fail: unit is removed from play (all models destroyed).
 */
function handleLeadershipCheck(
  state: GameState,
  unitId: string,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let newState = state;

  // Roll 2d6 and compare against the unit's Leadership
  const [die1, die2] = dice.rollMultipleD6(2);
  const roll = die1 + die2;
  const unit = findUnit(newState, unitId);
  const refModel = unit ? getAliveModels(unit)[0] : undefined;
  const target = refModel ? getModelLeadership(refModel.unitProfileId, refModel.profileModelName) : DEFAULT_LEADERSHIP;
  const passed = roll <= target;

  // Emit LeadershipCheckEvent
  const ldEvent: LeadershipCheckEvent = {
    type: 'leadershipCheck',
    unitId,
    roll,
    target,
    passed,
  };
  events.push(ldEvent);

  if (passed) {
    // Lose Routed, gain Suppressed
    newState = updateUnitInGameState(newState, unitId, (u) => {
      let updated = removeStatus(u, TacticalStatus.Routed);
      updated = addStatus(updated, TacticalStatus.Suppressed);
      return updated;
    });

    // Emit status events
    const removedEvent: StatusRemovedEvent = {
      type: 'statusRemoved',
      unitId,
      status: TacticalStatus.Routed,
    };
    events.push(removedEvent);

    const appliedEvent: StatusAppliedEvent = {
      type: 'statusApplied',
      unitId,
      status: TacticalStatus.Suppressed,
    };
    events.push(appliedEvent);
  } else {
    // Unit is destroyed -- mark all models as destroyed
    newState = updateUnitInGameState(newState, unitId, (u) => ({
      ...u,
      models: u.models.map(m => ({
        ...m,
        isDestroyed: true,
        currentWounds: 0,
      })),
    }));

    // Emit UnitDestroyedEvent
    const destroyedEvent: UnitDestroyedEvent = {
      type: 'unitDestroyed',
      unitId,
      reason: 'Failed Leadership Check while Routed at battlefield edge',
    };
    events.push(destroyedEvent);
  }

  return { state: newState, events };
}

// ─── computeFallBackDirection ────────────────────────────────────────────────

/**
 * Compute the normalized direction vector toward the nearest battlefield edge
 * for a model at the given position.
 *
 * The battlefield spans from (0,0) to (width, height). The four edges are:
 * - Left:   x = 0
 * - Right:  x = width
 * - Top:    y = 0
 * - Bottom: y = height
 *
 * Returns a normalized direction vector pointing toward the closest edge.
 *
 * @param modelPosition - Current model position
 * @param battlefieldWidth - Battlefield width in inches
 * @param battlefieldHeight - Battlefield height in inches
 * @returns Normalized direction vector toward the nearest edge
 */
export function computeFallBackDirection(
  modelPosition: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position {
  // Compute distance to each edge
  const distToLeft = modelPosition.x;
  const distToRight = battlefieldWidth - modelPosition.x;
  const distToTop = modelPosition.y;
  const distToBottom = battlefieldHeight - modelPosition.y;

  // Find the minimum distance
  const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

  // Return direction toward the nearest edge
  if (minDist === distToLeft) {
    return { x: -1, y: 0 };
  } else if (minDist === distToRight) {
    return { x: 1, y: 0 };
  } else if (minDist === distToTop) {
    return { x: 0, y: -1 };
  } else {
    // distToBottom
    return { x: 0, y: 1 };
  }
}

// ─── computeFallBackDistance ─────────────────────────────────────────────────

/**
 * Compute the total fall-back distance for a routed unit.
 *
 * Formula: Initiative + d6 roll
 *
 * @param initiative - Unit's Initiative characteristic value
 * @param diceRoll - Result of the d6 roll
 * @returns Total fall-back distance in inches
 */
export function computeFallBackDistance(
  initiative: number,
  diceRoll: number,
): number {
  return initiative + diceRoll;
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Check if a position is at or past a battlefield edge.
 */
function isAtBattlefieldEdge(
  position: Position,
  width: number,
  height: number,
): boolean {
  return (
    position.x <= EDGE_THRESHOLD ||
    position.x >= width - EDGE_THRESHOLD ||
    position.y <= EDGE_THRESHOLD ||
    position.y >= height - EDGE_THRESHOLD
  );
}

/**
 * Clamp a position to the battlefield bounds.
 */
function clampToBattlefield(
  position: Position,
  width: number,
  height: number,
): Position {
  return {
    x: Math.max(0, Math.min(width, position.x)),
    y: Math.max(0, Math.min(height, position.y)),
  };
}
