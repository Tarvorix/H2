/**
 * Movement AI
 *
 * Generates movement commands for the AI during the Movement phase.
 * Handles reserves testing, unit movement, and rush decisions.
 */

import type { GameState, GameCommand, Position } from '@hh/types';
import { SubPhase } from '@hh/types';
import { getAliveModels } from '@hh/engine';
import type { AITurnContext, StrategyMode } from '../types';
import { getMovableUnits, getReservesUnits, getModelMovementCharacteristic, getUnitCentroid, getEnemyDeployedUnits } from '../helpers/unit-queries';
import {
  calculateRandomMovePosition,
  calculateDirectionalMovePosition,
} from '../helpers/movement-destination';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default battlefield dimensions (from standard 6'x4' table = 72"x48") */
const DEFAULT_BATTLEFIELD_WIDTH = 72;
const DEFAULT_BATTLEFIELD_HEIGHT = 48;

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate the next movement command for the AI.
 *
 * @returns A GameCommand or null if no more movement actions are needed
 */
export function generateMovementCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  switch (state.currentSubPhase) {
    case SubPhase.Reserves:
      return generateReservesCommand(state, playerIndex, context);
    case SubPhase.Move:
      return generateMoveCommand(state, playerIndex, context, strategy);
    default:
      return null;
  }
}

// ─── Reserves ────────────────────────────────────────────────────────────────

/**
 * Generate reserves test or deployment commands.
 */
function generateReservesCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
): GameCommand | null {
  const reserveUnits = getReservesUnits(state, playerIndex, context.actedUnitIds);

  if (reserveUnits.length === 0) {
    return null; // No more reserves to test
  }

  // Test the first un-tested reserves unit
  const unit = reserveUnits[0];
  context.actedUnitIds.add(unit.id);

  return {
    type: 'reservesTest',
    unitId: unit.id,
  };
}

// ─── Movement ────────────────────────────────────────────────────────────────

/**
 * Generate move commands for units.
 * Moves one model at a time (engine processes moveModel per-model).
 */
function generateMoveCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  const bfWidth = state.battlefield?.width ?? DEFAULT_BATTLEFIELD_WIDTH;
  const bfHeight = state.battlefield?.height ?? DEFAULT_BATTLEFIELD_HEIGHT;

  // If we're in the middle of moving a unit's models, continue
  if (context.currentMovingUnitId) {
    return continueMovingUnit(state, playerIndex, context, strategy, bfWidth, bfHeight);
  }

  // Find the next unit to move
  const movableUnits = getMovableUnits(state, playerIndex, context.actedUnitIds);
  if (movableUnits.length === 0) {
    return null; // No more units to move
  }

  // Pick the first movable unit and start moving its models
  const unit = movableUnits[0];
  context.currentMovingUnitId = unit.id;
  context.movedModelIds.clear();

  return moveNextModel(state, unit.id, context, strategy, bfWidth, bfHeight);
}

/**
 * Continue moving models of the current unit.
 */
function continueMovingUnit(
  state: GameState,
  _playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
  bfWidth: number,
  bfHeight: number,
): GameCommand | null {
  const unitId = context.currentMovingUnitId!;
  const result = moveNextModel(state, unitId, context, strategy, bfWidth, bfHeight);

  if (result === null) {
    // All models in this unit have been moved
    context.actedUnitIds.add(unitId);
    context.currentMovingUnitId = null;
    context.movedModelIds.clear();
    // Return null to trigger picking the next unit on the next call
    return null;
  }

  return result;
}

/**
 * Move the next un-moved model in a unit.
 */
function moveNextModel(
  state: GameState,
  unitId: string,
  context: AITurnContext,
  strategy: StrategyMode,
  bfWidth: number,
  bfHeight: number,
): GameCommand | null {
  // Find the unit
  const army0 = state.armies[0];
  const army1 = state.armies[1];
  const unit = army0.units.find((u) => u.id === unitId) ?? army1.units.find((u) => u.id === unitId);
  if (!unit) return null;

  const aliveModels = getAliveModels(unit);
  const unmovedModel = aliveModels.find((m) => !context.movedModelIds.has(m.id));

  if (!unmovedModel) {
    return null; // All models moved
  }

  context.movedModelIds.add(unmovedModel.id);

  const maxMove = getModelMovementCharacteristic(unmovedModel);
  let targetPosition: Position;

  if (strategy === 'basic') {
    targetPosition = calculateRandomMovePosition(
      unmovedModel.position,
      maxMove,
      bfWidth,
      bfHeight,
    );
  } else {
    // Tactical: move toward the nearest enemy or objectives
    targetPosition = calculateTacticalMovePosition(
      state,
      unit.id,
      unmovedModel.position,
      maxMove,
      bfWidth,
      bfHeight,
    );
  }

  return {
    type: 'moveModel',
    modelId: unmovedModel.id,
    targetPosition,
  };
}

/**
 * Calculate a tactical movement destination.
 * Moves toward the nearest enemy unit to get into shooting/charge range.
 */
function calculateTacticalMovePosition(
  state: GameState,
  unitId: string,
  currentPos: Position,
  maxDistance: number,
  bfWidth: number,
  bfHeight: number,
): Position {
  // Find the unit's owning player
  const playerIndex = state.armies[0].units.some((u) => u.id === unitId) ? 0 : 1;

  // Find nearest enemy centroid to move toward
  const enemies = getEnemyDeployedUnits(state, playerIndex);
  if (enemies.length === 0) {
    return calculateRandomMovePosition(currentPos, maxDistance, bfWidth, bfHeight);
  }

  // Find the nearest enemy unit centroid
  let nearestCentroid: Position | null = null;
  let nearestDist = Infinity;

  for (const enemy of enemies) {
    const centroid = getUnitCentroid(enemy);
    if (!centroid) continue;

    const dx = centroid.x - currentPos.x;
    const dy = centroid.y - currentPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestCentroid = centroid;
    }
  }

  if (!nearestCentroid) {
    return calculateRandomMovePosition(currentPos, maxDistance, bfWidth, bfHeight);
  }

  // Move toward the nearest enemy
  return calculateDirectionalMovePosition(
    currentPos,
    nearestCentroid,
    maxDistance,
    bfWidth,
    bfHeight,
  );
}
