/**
 * Movement AI
 *
 * Generates movement commands for the AI during the Movement phase.
 * Handles reserves testing, unit movement, and rush decisions.
 */

import type {
  FlyerCombatAssignment,
  GameState,
  GameCommand,
  Position,
  UnitState,
  ModelState,
} from '@hh/types';
import { ModelSubType, SubPhase, UnitMovementState } from '@hh/types';
import {
  getAliveModels,
  getEnemyModelShapes,
  getModelShape,
  unitProfileHasSubType,
  validateModelMove,
} from '@hh/engine';
import type { ModelShape } from '@hh/geometry';
import type { AITurnContext, StrategyMode } from '../types';
import {
  getMovableUnits,
  getReservesUnits,
  getReservesReadyUnits,
  getModelInitiativeCharacteristic,
  getModelMovementCharacteristic,
  getUnitCentroid,
  getEnemyDeployedUnits,
} from '../helpers/unit-queries';
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
  const readyUnits = getReservesReadyUnits(state, playerIndex, context.actedUnitIds);
  if (readyUnits.length > 0) {
    const unit = readyUnits[0];
    context.actedUnitIds.add(unit.id);
    return {
      type: 'deployUnit',
      unitId: unit.id,
      modelPositions: buildReserveEntryPositions(state, unit, playerIndex),
      combatAssignment: chooseReserveCombatAssignment(state, unit, playerIndex),
    };
  }

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

function buildReserveEntryPositions(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
): { modelId: string; position: Position }[] {
  const aliveModels = getAliveModels(unit);
  const xCenter = state.battlefield.width / 2;
  const isBottomEdge = playerIndex === 0;
  const edgeY = isBottomEdge ? 0.5 : (state.battlefield.height - 0.5);
  const inwardY = isBottomEdge ? 2 : (state.battlefield.height - 2);
  const spacing = 1.5;

  return aliveModels.map((model, index) => {
    const offset = index - ((aliveModels.length - 1) / 2);
    return {
      modelId: model.id,
      position: {
        x: Math.max(1, Math.min(state.battlefield.width - 1, xCenter + (offset * spacing))),
        y: index === 0 ? edgeY : inwardY,
      },
    };
  });
}

function chooseReserveCombatAssignment(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
): FlyerCombatAssignment | undefined {
  if ((unit.reserveType ?? 'standard') !== 'aerial') {
    return undefined;
  }

  const army = state.armies[playerIndex];
  if (army.units.some((candidate) => candidate.embarkedOnId === unit.id)) {
    return 'drop-mission';
  }

  if (unitProfileHasSubType(unit.profileId, ModelSubType.Transport)) {
    return 'extraction-mission';
  }

  return 'strike-mission';
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

  // Pick the next movable unit with a legal translated destination.
  for (const unit of movableUnits) {
    const command = buildUnitTranslationCommand(
      state,
      playerIndex,
      unit,
      strategy,
      bfWidth,
      bfHeight,
    );
    context.actedUnitIds.add(unit.id);
    if (!command) continue;

    context.currentMovingUnitId = null;
    context.movedModelIds.clear();
    return command;
  }

  return null;
}

/**
 * Calculate a tactical movement destination.
 * Moves toward the nearest enemy unit to get into shooting/charge range.
 */
function calculateTacticalMovePosition(
  state: GameState,
  playerIndex: number,
  currentPos: Position,
  maxDistance: number,
  bfWidth: number,
  bfHeight: number,
): Position {
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
  playerIndex: number,
  unit: UnitState,
  strategy: StrategyMode,
  bfWidth: number,
  bfHeight: number,
): GameCommand | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return null;

  const originCentroid = getUnitCentroid(unit);
  if (!originCentroid) return null;

  const isRush = unit.movementState === UnitMovementState.RushDeclared;
  const maxMove = getUnitMaxSafeTranslation(aliveModels, isRush);
  let targetCentroid: Position;

  if (strategy === 'basic') {
    targetCentroid = calculateRandomMovePosition(originCentroid, maxMove, bfWidth, bfHeight);
  } else {
    targetCentroid = calculateTacticalMovePosition(
      state,
      playerIndex,
      originCentroid,
      maxMove,
      bfWidth,
      bfHeight,
    );
  }

  const modelPositions = findLegalTranslatedPositions(
    state,
    playerIndex,
    unit,
    aliveModels,
    originCentroid,
    targetCentroid,
    maxMove,
    bfWidth,
    bfHeight,
  );
  if (!modelPositions) return null;

  return {
    type: 'moveUnit',
    unitId: unit.id,
    modelPositions,
    ...(isRush ? { isRush: true } : {}),
  };
}

function getUnitMaxSafeTranslation(models: ModelState[], isRush: boolean = false): number {
  return models.reduce((minValue, model) => {
    const movement = getModelMovementCharacteristic(model)
      + (isRush ? getModelInitiativeCharacteristic(model) : 0);
    return Math.min(minValue, movement);
  }, Number.POSITIVE_INFINITY);
}

function findLegalTranslatedPositions(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  aliveModels: ModelState[],
  originCentroid: Position,
  preferredTargetCentroid: Position,
  maxMove: number,
  bfWidth: number,
  bfHeight: number,
): { modelId: string; position: Position }[] | null {
  const enemyShapes = getEnemyModelShapes(state, playerIndex);
  const friendlyShapes = collectFriendlyShapesExcludingUnit(state, playerIndex, unit.id);

  for (const centroid of buildCandidateCentroids(
    originCentroid,
    preferredTargetCentroid,
    maxMove,
    bfWidth,
    bfHeight,
  )) {
    const dx = centroid.x - originCentroid.x;
    const dy = centroid.y - originCentroid.y;
    const modelPositions = aliveModels.map((model) => ({
      modelId: model.id,
      position: {
        x: model.position.x + dx,
        y: model.position.y + dy,
      },
    }));

    const isLegal = aliveModels.every((model) => {
      const translatedPosition = modelPositions.find(
        (entry) => entry.modelId === model.id,
      )!.position;
      return validateModelMove(
        model,
        translatedPosition,
        maxMove,
        state.terrain,
        enemyShapes,
        friendlyShapes,
        bfWidth,
        bfHeight,
      ).length === 0;
    });

    if (isLegal) {
      return modelPositions;
    }
  }

  return null;
}

function collectFriendlyShapesExcludingUnit(
  state: GameState,
  playerIndex: number,
  unitId: string,
): ModelShape[] {
  const shapes: ModelShape[] = [];
  for (const friendlyUnit of state.armies[playerIndex].units) {
    if (friendlyUnit.id === unitId || !friendlyUnit.isDeployed || friendlyUnit.embarkedOnId !== null) {
      continue;
    }

    for (const model of friendlyUnit.models) {
      if (!model.isDestroyed) {
        shapes.push(getModelShape(model));
      }
    }
  }

  return shapes;
}

function buildCandidateCentroids(
  originCentroid: Position,
  preferredTargetCentroid: Position,
  maxMove: number,
  bfWidth: number,
  bfHeight: number,
): Position[] {
  const candidates: Position[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: Position): void => {
    const clamped = clampCandidateToMoveLimit(originCentroid, candidate, maxMove, bfWidth, bfHeight);
    const key = `${clamped.x.toFixed(3)},${clamped.y.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(clamped);
  };

  addCandidate(preferredTargetCentroid);

  const dx = preferredTargetCentroid.x - originCentroid.x;
  const dy = preferredTargetCentroid.y - originCentroid.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0) {
    return candidates;
  }

  const unitX = dx / distance;
  const unitY = dy / distance;
  const lateralX = -unitY;
  const lateralY = unitX;

  for (const scale of [0.9, 0.75, 0.6, 0.45, 0.3, 0.15]) {
    addCandidate({
      x: originCentroid.x + dx * scale,
      y: originCentroid.y + dy * scale,
    });
  }

  for (const scale of [0.75, 0.5, 0.25]) {
    const baseX = originCentroid.x + dx * scale;
    const baseY = originCentroid.y + dy * scale;
    for (const offset of [1.5, -1.5, 3, -3]) {
      addCandidate({
        x: baseX + lateralX * offset,
        y: baseY + lateralY * offset,
      });
    }
  }

  return candidates;
}

function clampCandidateToMoveLimit(
  origin: Position,
  candidate: Position,
  maxMove: number,
  bfWidth: number,
  bfHeight: number,
): Position {
  const dx = candidate.x - origin.x;
  const dy = candidate.y - origin.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > maxMove && distance > 0) {
    const scale = maxMove / distance;
    return {
      x: Math.max(0.5, Math.min(bfWidth - 0.5, origin.x + dx * scale)),
      y: Math.max(0.5, Math.min(bfHeight - 0.5, origin.y + dy * scale)),
    };
  }

  return {
    x: Math.max(0.5, Math.min(bfWidth - 0.5, candidate.x)),
    y: Math.max(0.5, Math.min(bfHeight - 0.5, candidate.y)),
  };
}
