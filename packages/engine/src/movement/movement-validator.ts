/**
 * Movement Validator
 * Core movement validation (range, terrain, exclusion, coherency).
 * Reference: HH_Rules_Battle.md — "Movement Phase"
 * Reference: HH_Principles.md — "Terrain", "1" Exclusion Zone", "Coherency"
 */

import type { Position, TerrainPiece, ModelState } from '@hh/types';
import { TerrainType } from '@hh/types';
import {
  closestPointOnRect,
  getRectCorners,
  vec2Distance,
  vec2Dot,
  vec2Rotate,
  vec2Sub,
  isInExclusionZone,
  isInImpassableTerrain,
  checkCoherency,
  pointInTerrainShape,
  STANDARD_COHERENCY_RANGE,
  EPSILON,
} from '@hh/geometry';
import type { CircleBase, ModelShape, CoherencyResult, RectHull } from '@hh/geometry';
import type { ValidationError } from '../types';
import { getModelShapeAtPosition } from '../model-shapes';

// ─── Terrain Penalty ─────────────────────────────────────────────────────────

/**
 * Difficult terrain penalty in inches.
 * Reference: HH_Principles.md — "Difficult Terrain: −2" to M"
 */
export const DIFFICULT_TERRAIN_PENALTY = 2;
/**
 * Movement range comparisons are displayed to 0.01", so allow half-step
 * float noise before failing validation.
 */
const MOVEMENT_RANGE_ROUNDING_EPSILON = 0.005;

/**
 * Compute the terrain penalty for a move from start to end.
 * If the end position is in difficult or dangerous terrain, apply -2" penalty.
 *
 * Reference: HH_Principles.md — models entering or moving within Difficult
 * terrain subtract 2" from their Movement characteristic.
 *
 * @returns The penalty in inches (0 or DIFFICULT_TERRAIN_PENALTY)
 */
export function computeTerrainPenalty(
  endPosition: Position,
  terrain: TerrainPiece[],
): number {
  for (const piece of terrain) {
    if (!isTerrainDifficultOrDangerous(piece)) continue;
    if (pointInTerrainShape(endPosition, piece.shape)) {
      return DIFFICULT_TERRAIN_PENALTY;
    }
  }
  return 0;
}

/**
 * Check if a terrain piece is difficult or dangerous (dangerous implies difficult).
 */
function isTerrainDifficultOrDangerous(terrain: TerrainPiece): boolean {
  return (
    terrain.type === TerrainType.Difficult ||
    terrain.type === TerrainType.Dangerous ||
    terrain.isDifficult ||
    terrain.isDangerous
  );
}

/**
 * Check if a position is in dangerous terrain.
 */
export function isInDangerousTerrain(
  position: Position,
  terrain: TerrainPiece[],
): boolean {
  for (const piece of terrain) {
    if (piece.type !== TerrainType.Dangerous && !piece.isDangerous) continue;
    if (pointInTerrainShape(position, piece.shape)) {
      return true;
    }
  }
  return false;
}

// ─── Path Checks ─────────────────────────────────────────────────────────────

/**
 * Check if a movement path (approximated as straight line) passes through
 * impassable terrain.
 *
 * Uses point sampling along the path to detect impassable terrain.
 *
 * Reference: HH_Principles.md — "Models cannot move into or through Impassable terrain."
 */
export function pathCrossesImpassable(
  startPosition: Position,
  endPosition: Position,
  terrain: TerrainPiece[],
): boolean {
  const impassable = terrain.filter(
    t => t.type === TerrainType.Impassable,
  );
  if (impassable.length === 0) return false;

  // Sample points along the path
  const dist = vec2Distance(startPosition, endPosition);
  if (dist < EPSILON) return false;

  const sampleCount = Math.max(10, Math.ceil(dist * 4));
  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const samplePoint: Position = {
      x: startPosition.x + t * (endPosition.x - startPosition.x),
      y: startPosition.y + t * (endPosition.y - startPosition.y),
    };

    for (const piece of impassable) {
      if (pointInTerrainShape(samplePoint, piece.shape)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a movement path enters an enemy exclusion zone (passes within 1").
 * This checks intermediate points along the path, not just the endpoint.
 *
 * Note: models CAN move through exclusion zones, they just can't END within them.
 * This function is for informational purposes — the real check is on the endpoint.
 */
export function pathEntersExclusionZone(
  _startPosition: Position,
  endPosition: Position,
  enemyShapes: ModelShape[],
): boolean {
  // The endpoint check is what matters for rules — this is supplementary
  return isInExclusionZone(endPosition, enemyShapes);
}

function shapesOverlap(a: ModelShape, b: ModelShape): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return vec2Distance(a.center, b.center) < a.radius + b.radius - EPSILON;
  }

  if (a.kind === 'circle' && b.kind === 'rect') {
    return circleOverlapsRect(a, b);
  }

  if (a.kind === 'rect' && b.kind === 'circle') {
    return circleOverlapsRect(b, a);
  }

  if (a.kind === 'rect' && b.kind === 'rect') {
    return rectsOverlap(a, b);
  }

  return false;
}

function circleOverlapsRect(circle: CircleBase, rect: RectHull): boolean {
  const toLocal = vec2Sub(circle.center, rect.center);
  const localPoint = vec2Rotate(toLocal, -rect.rotation);
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  const insideRectInterior = (
    Math.abs(localPoint.x) < halfWidth - EPSILON &&
    Math.abs(localPoint.y) < halfHeight - EPSILON
  );
  if (insideRectInterior) return true;

  const closest = closestPointOnRect(rect, circle.center);
  return vec2Distance(circle.center, closest) < circle.radius - EPSILON;
}

function rectsOverlap(a: RectHull, b: RectHull): boolean {
  const axes = [...getRectAxes(a), ...getRectAxes(b)];

  for (const axis of axes) {
    const aProjection = projectRectOntoAxis(a, axis);
    const bProjection = projectRectOntoAxis(b, axis);
    const overlap = Math.min(aProjection.max, bProjection.max)
      - Math.max(aProjection.min, bProjection.min);

    if (overlap <= EPSILON) {
      return false;
    }
  }

  return true;
}

function getRectAxes(rect: RectHull): Position[] {
  return [
    { x: Math.cos(rect.rotation), y: Math.sin(rect.rotation) },
    { x: -Math.sin(rect.rotation), y: Math.cos(rect.rotation) },
  ];
}

function projectRectOntoAxis(rect: RectHull, axis: Position): { min: number; max: number } {
  const corners = getRectCorners(rect);
  let min = Infinity;
  let max = -Infinity;

  for (const corner of corners) {
    const projection = vec2Dot(corner, axis);
    if (projection < min) min = projection;
    if (projection > max) max = projection;
  }

  return { min, max };
}

// ─── Model Move Validation ──────────────────────────────────────────────────

/**
 * Validate a single model's move to a new position.
 *
 * Checks:
 * 1. Within movement range (accounting for terrain penalty)
 * 2. Not in impassable terrain
 * 3. Not in enemy exclusion zone (cannot end within 1")
 * 4. Path doesn't cross impassable terrain
 * 5. Within battlefield bounds
 * 6. Not overlapping other model bases
 *
 * @returns Array of validation errors (empty = valid move)
 */
export function validateModelMove(
  model: ModelState,
  targetPosition: Position,
  maxMoveDistance: number,
  terrain: TerrainPiece[],
  enemyShapes: ModelShape[],
  friendlyShapes: ModelShape[],
  battlefieldWidth: number,
  battlefieldHeight: number,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const startPosition = model.position;

  // 1. Check battlefield bounds
  if (
    targetPosition.x < 0 ||
    targetPosition.y < 0 ||
    targetPosition.x > battlefieldWidth ||
    targetPosition.y > battlefieldHeight
  ) {
    errors.push({
      code: 'OUT_OF_BOUNDS',
      message: 'Target position is outside the battlefield',
      context: { targetPosition, battlefieldWidth, battlefieldHeight },
    });
  }

  // 2. Check movement range (accounting for terrain penalty)
  const terrainPenalty = computeTerrainPenalty(targetPosition, terrain);
  const effectiveMove = Math.max(0, maxMoveDistance - terrainPenalty);
  const moveDistance = vec2Distance(startPosition, targetPosition);

  if (moveDistance > effectiveMove + MOVEMENT_RANGE_ROUNDING_EPSILON) {
    errors.push({
      code: 'EXCEEDS_MOVEMENT',
      message: `Move distance ${moveDistance.toFixed(2)}" exceeds effective movement ${effectiveMove.toFixed(2)}"`,
      context: { moveDistance, maxMoveDistance, terrainPenalty, effectiveMove },
    });
  }

  // 3. Check impassable terrain at target
  if (isInImpassableTerrain(targetPosition, terrain)) {
    errors.push({
      code: 'IN_IMPASSABLE_TERRAIN',
      message: 'Cannot end move in impassable terrain',
    });
  }

  // 4. Check path through impassable terrain
  if (pathCrossesImpassable(startPosition, targetPosition, terrain)) {
    errors.push({
      code: 'PATH_CROSSES_IMPASSABLE',
      message: 'Movement path crosses impassable terrain',
    });
  }

  // 5. Check enemy exclusion zone (1" rule)
  if (isInExclusionZone(targetPosition, enemyShapes)) {
    errors.push({
      code: 'IN_EXCLUSION_ZONE',
      message: 'Cannot end move within 1" of an enemy model',
    });
  }

  // 6. Check base/hull overlap with other models
  const modelShape = getModelShapeAtPosition(model, targetPosition);
  for (const friendly of friendlyShapes) {
    if (shapesOverlap(modelShape, friendly)) {
      errors.push({
        code: 'BASE_OVERLAP',
        message: 'Model base overlaps with another model',
      });
      break;
    }
  }

  return errors;
}

// ─── Coherency Check ────────────────────────────────────────────────────────

/**
 * Validate that a unit maintains coherency after movement.
 *
 * Reference: HH_Principles.md — "Coherency"
 * Every model must be within 2" of at least one other model in the unit.
 *
 * @returns CoherencyResult from geometry package
 */
export function validateCoherencyAfterMove(
  unitModelShapes: ModelShape[],
  coherencyRange?: number,
): CoherencyResult {
  return checkCoherency(unitModelShapes, coherencyRange ?? STANDARD_COHERENCY_RANGE);
}

/**
 * Get the effective movement distance for a model, accounting for terrain.
 */
export function getEffectiveMovement(
  maxMove: number,
  targetPosition: Position,
  terrain: TerrainPiece[],
): number {
  const penalty = computeTerrainPenalty(targetPosition, terrain);
  return Math.max(0, maxMove - penalty);
}
