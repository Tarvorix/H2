/**
 * Movement AI
 *
 * Generates movement commands for the AI during the Movement phase.
 * Handles reserves testing, unit movement, and rush decisions.
 */

import type { GameState, GameCommand, Position, UnitState, ModelState } from '@hh/types';
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
 * Issues atomic moveUnit commands so model destinations resolve together.
 */
function generateMoveCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  const bfWidth = state.battlefield?.width ?? DEFAULT_BATTLEFIELD_WIDTH;
  const bfHeight = state.battlefield?.height ?? DEFAULT_BATTLEFIELD_HEIGHT;

  const movableUnits = getMovableUnits(state, playerIndex, context.actedUnitIds);
  if (movableUnits.length === 0) {
    return null; // No more units to move
  }

  // Pick the next movable unit and move it as a coherent block.
  const unit = movableUnits[0];
  const command = buildUnitTranslationCommand(state, unit, strategy, bfWidth, bfHeight);
  if (!command) return null;

  context.actedUnitIds.add(unit.id);
  context.currentMovingUnitId = null;
  context.movedModelIds.clear();
  return command;
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

function buildUnitTranslationCommand(
  state: GameState,
  unit: UnitState,
  strategy: StrategyMode,
  bfWidth: number,
  bfHeight: number,
): GameCommand | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return null;

  const originCentroid = getUnitCentroid(unit);
  if (!originCentroid) return null;

  const maxMove = getUnitMaxSafeTranslation(aliveModels);
  let targetCentroid: Position;

  if (strategy === 'basic') {
    targetCentroid = calculateRandomMovePosition(originCentroid, maxMove, bfWidth, bfHeight);
  } else {
    targetCentroid = calculateTacticalMovePosition(
      state,
      unit.id,
      originCentroid,
      maxMove,
      bfWidth,
      bfHeight,
    );
  }

  const dx = targetCentroid.x - originCentroid.x;
  const dy = targetCentroid.y - originCentroid.y;
  const modelPositions = aliveModels.map((model) => ({
    modelId: model.id,
    position: {
      x: model.position.x + dx,
      y: model.position.y + dy,
    },
  }));

  return {
    type: 'moveUnit',
    unitId: unit.id,
    modelPositions,
  };
}

function getUnitMaxSafeTranslation(models: ModelState[]): number {
  return models.reduce((minValue, model) => {
    const movement = getModelMovementCharacteristic(model);
    return Math.min(minValue, movement);
  }, Number.POSITIVE_INFINITY);
}
