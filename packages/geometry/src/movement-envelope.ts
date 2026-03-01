/**
 * Movement Envelope Computation
 * Reference: HH_Principles.md — "Movement", "Terrain"
 * Reference: HH_Rules_Battle.md — "Movement Phase"
 *
 * Computes the legal movement area for a model, accounting for:
 * - Maximum movement characteristic (M) in inches
 * - Difficult terrain: −2" to M penalty when entering/within
 * - Dangerous terrain: same as difficult + requires Dangerous Terrain test
 * - Impassable terrain: cannot enter at all
 * - 1" enemy exclusion zone: cannot end move within 1" of enemy models
 * - Vehicle hulls: cannot cross vehicle hulls
 * - Battlefield bounds: must stay within the battlefield rectangle
 *
 * The envelope is an approximation showing the maximum theoretical reach.
 * The precise path-dependent computation (where moving through difficult terrain
 * uses more of the movement budget) is handled by the Phase 3 movement validator
 * which checks the actual chosen path.
 */

import type { Position, TerrainPiece } from '@hh/types';
import { TerrainType } from '@hh/types';
import {
  EPSILON,
  ENEMY_EXCLUSION_ZONE,
  DEFAULT_BATTLEFIELD_WIDTH,
  DEFAULT_BATTLEFIELD_HEIGHT,
  TWO_PI,
} from './constants';
import { vec2Distance, vec2Sub } from './vec2';
import type { ModelShape } from './shapes';
import { pointInTerrainShape } from './terrain';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Number of sample points around the movement circle boundary.
 * 72 points = one every 5 degrees, providing smooth visual fidelity.
 */
const BOUNDARY_POINT_COUNT = 72;

/**
 * Angular step between boundary points in radians (5 degrees).
 */
const BOUNDARY_ANGLE_STEP = TWO_PI / BOUNDARY_POINT_COUNT;

// ─── Result Type ─────────────────────────────────────────────────────────────

/**
 * Result of computing a model's movement envelope.
 * Contains the boundary polygon and all zone overlays for the visualizer.
 */
export interface MovementEnvelopeResult {
  /** Polygon vertices defining the legal movement area boundary */
  boundary: Position[];
  /** Maximum movement distance (base, before terrain penalties) */
  maxDistance: number;
  /** Terrain pieces that overlap with the envelope and are difficult */
  difficultZones: TerrainPiece[];
  /** Terrain pieces that overlap with the envelope and are dangerous */
  dangerousZones: TerrainPiece[];
  /** Impassable zones within the raw circle (for rendering exclusion) */
  impassableZones: TerrainPiece[];
  /** Enemy exclusion circles within the raw circle */
  exclusionZones: { center: Position; radius: number }[];
}

// ─── Boundary Generation ─────────────────────────────────────────────────────

/**
 * Generate a circle of boundary points centered on a position.
 * Produces 72 evenly-spaced points (one every 5 degrees) at the given radius.
 *
 * @param center - Center position of the circle
 * @param radius - Radius of the circle in inches
 * @returns Array of 72 positions forming the circle boundary
 */
function generateCircleBoundary(center: Position, radius: number): Position[] {
  const points: Position[] = [];
  for (let i = 0; i < BOUNDARY_POINT_COUNT; i++) {
    const angle = i * BOUNDARY_ANGLE_STEP;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return points;
}

// ─── Polygon Clipping to Battlefield Bounds ──────────────────────────────────

/**
 * Clip a convex polygon to a rectangle using the Sutherland-Hodgman algorithm.
 * The rectangle is defined by (0, 0) to (width, height) representing the
 * battlefield bounds.
 *
 * Reference: HH_Principles.md — models must stay within the battlefield.
 *
 * @param polygon - Input polygon vertices (assumed convex for the movement circle)
 * @param width - Battlefield width in inches
 * @param height - Battlefield height in inches
 * @returns Clipped polygon vertices
 */
function clipPolygonToRect(
  polygon: Position[],
  width: number,
  height: number,
): Position[] {
  if (polygon.length === 0) {
    return [];
  }

  // Define the four clip edges as half-planes.
  // Each edge is defined by a test function (inside?) and an intersection function.
  const clipEdges: {
    inside: (p: Position) => boolean;
    intersect: (a: Position, b: Position) => Position;
  }[] = [
    // Left edge: x >= 0
    {
      inside: (p: Position) => p.x >= -EPSILON,
      intersect: (a: Position, b: Position) => {
        const t = (0 - a.x) / (b.x - a.x);
        return { x: 0, y: a.y + t * (b.y - a.y) };
      },
    },
    // Right edge: x <= width
    {
      inside: (p: Position) => p.x <= width + EPSILON,
      intersect: (a: Position, b: Position) => {
        const t = (width - a.x) / (b.x - a.x);
        return { x: width, y: a.y + t * (b.y - a.y) };
      },
    },
    // Bottom edge: y >= 0
    {
      inside: (p: Position) => p.y >= -EPSILON,
      intersect: (a: Position, b: Position) => {
        const t = (0 - a.y) / (b.y - a.y);
        return { x: a.x + t * (b.x - a.x), y: 0 };
      },
    },
    // Top edge: y <= height
    {
      inside: (p: Position) => p.y <= height + EPSILON,
      intersect: (a: Position, b: Position) => {
        const t = (height - a.y) / (b.y - a.y);
        return { x: a.x + t * (b.x - a.x), y: height };
      },
    },
  ];

  let output = [...polygon];

  for (const edge of clipEdges) {
    if (output.length === 0) {
      return [];
    }

    const input = output;
    output = [];

    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const next = input[(i + 1) % input.length];
      const currentInside = edge.inside(current);
      const nextInside = edge.inside(next);

      if (currentInside) {
        output.push(current);
        if (!nextInside) {
          // Exiting the clip region — add intersection point
          output.push(edge.intersect(current, next));
        }
      } else if (nextInside) {
        // Entering the clip region — add intersection point
        output.push(edge.intersect(current, next));
      }
      // Both outside — add nothing
    }
  }

  return output;
}

// ─── Terrain Classification ──────────────────────────────────────────────────

/**
 * Check whether a terrain piece overlaps with the movement envelope circle.
 * Uses a conservative bounding-box + distance check against the envelope radius.
 *
 * @param terrain - The terrain piece to check
 * @param center - Center of the movement envelope (model position)
 * @param radius - Radius of the movement envelope (maxMove)
 * @returns True if the terrain piece potentially overlaps the envelope
 */
function terrainOverlapsEnvelope(
  terrain: TerrainPiece,
  center: Position,
  radius: number,
): boolean {
  const shape = terrain.shape;

  switch (shape.kind) {
    case 'circle': {
      const dist = vec2Distance(center, shape.center);
      return dist <= radius + shape.radius + EPSILON;
    }
    case 'rectangle': {
      // Find closest point on the rectangle to the envelope center
      const clampedX = Math.max(shape.topLeft.x, Math.min(center.x, shape.topLeft.x + shape.width));
      const clampedY = Math.max(shape.topLeft.y, Math.min(center.y, shape.topLeft.y + shape.height));
      const dist = vec2Distance(center, { x: clampedX, y: clampedY });
      return dist <= radius + EPSILON;
    }
    case 'polygon': {
      // Check if any vertex is within the envelope radius
      for (const vertex of shape.vertices) {
        if (vec2Distance(center, vertex) <= radius + EPSILON) {
          return true;
        }
      }
      // Check if the envelope center is inside the polygon
      if (pointInTerrainShape(center, shape)) {
        return true;
      }
      // Check if any polygon edge passes through the envelope circle
      // by finding the closest point on each edge to the center
      const vertices = shape.vertices;
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        const closestDist = distancePointToSegment(center, a, b);
        if (closestDist <= radius + EPSILON) {
          return true;
        }
      }
      return false;
    }
  }
}

/**
 * Compute the distance from a point to a line segment.
 *
 * @param point - The query point
 * @param segStart - Start of the segment
 * @param segEnd - End of the segment
 * @returns Distance from the point to the closest point on the segment
 */
function distancePointToSegment(
  point: Position,
  segStart: Position,
  segEnd: Position,
): number {
  const seg = vec2Sub(segEnd, segStart);
  const toPoint = vec2Sub(point, segStart);
  const segLenSq = seg.x * seg.x + seg.y * seg.y;

  if (segLenSq < EPSILON * EPSILON) {
    // Degenerate segment (zero length) — distance to the point
    return vec2Distance(point, segStart);
  }

  // Project point onto the segment line, clamped to [0, 1]
  const t = Math.max(0, Math.min(1, (toPoint.x * seg.x + toPoint.y * seg.y) / segLenSq));
  const closest: Position = {
    x: segStart.x + t * seg.x,
    y: segStart.y + t * seg.y,
  };

  return vec2Distance(point, closest);
}

/**
 * Check if a terrain piece is impassable.
 * Reference: HH_Principles.md — "Impassable Terrain"
 *
 * @param terrain - The terrain piece to check
 * @returns True if the terrain is impassable
 */
function isTerrainImpassable(terrain: TerrainPiece): boolean {
  return terrain.type === TerrainType.Impassable;
}

/**
 * Check if a terrain piece is difficult.
 * Reference: HH_Principles.md — "Difficult Terrain" (−2" M penalty)
 *
 * @param terrain - The terrain piece to check
 * @returns True if the terrain is difficult (either by type or flag)
 */
function isTerrainDifficult(terrain: TerrainPiece): boolean {
  return terrain.type === TerrainType.Difficult || terrain.isDifficult;
}

/**
 * Check if a terrain piece is dangerous.
 * Reference: HH_Principles.md — "Dangerous Terrain" (same as difficult + test)
 *
 * @param terrain - The terrain piece to check
 * @returns True if the terrain is dangerous (either by type or flag)
 */
function isTerrainDangerous(terrain: TerrainPiece): boolean {
  return terrain.type === TerrainType.Dangerous || terrain.isDangerous;
}

// ─── Enemy Exclusion Zones ───────────────────────────────────────────────────

/**
 * Compute the exclusion zone radius for an enemy model.
 * The exclusion zone extends 1" beyond the model's base edge.
 *
 * Reference: HH_Principles.md — "1" Exclusion Zone"
 * "A model cannot voluntarily end its move within 1" of an enemy model."
 *
 * @param enemy - The enemy model shape
 * @returns Exclusion zone radius (base radius + 1") for circles,
 *          or the bounding radius + 1" for rectangles
 */
function getExclusionRadius(enemy: ModelShape): number {
  if (enemy.kind === 'circle') {
    return enemy.radius + ENEMY_EXCLUSION_ZONE;
  }
  // For rectangular hulls, compute the bounding circle radius from the center
  // to the farthest corner, then add the exclusion zone
  const halfDiag = Math.sqrt(
    (enemy.width / 2) * (enemy.width / 2) +
    (enemy.height / 2) * (enemy.height / 2),
  );
  return halfDiag + ENEMY_EXCLUSION_ZONE;
}

/**
 * Get the center position of a model shape.
 *
 * @param model - The model shape
 * @returns The center position
 */
function getModelCenter(model: ModelShape): Position {
  return model.center;
}

// ─── Main Computation ────────────────────────────────────────────────────────

/**
 * Compute the movement envelope for a model.
 *
 * Generates a 72-point circular boundary representing the maximum theoretical
 * movement area, clipped to battlefield bounds. Also identifies all terrain
 * zones and enemy exclusion zones that overlap with the envelope, returning
 * them separately for the visualizer to render.
 *
 * Reference: HH_Principles.md — "Movement", "Terrain"
 * Reference: HH_Rules_Battle.md — "Movement Phase"
 *
 * Algorithm:
 * 1. Generate boundary as a 72-point circle (every 5°) centered on model
 *    position with radius = maxMove
 * 2. Clip boundary to battlefield bounds (0,0 to width,height)
 * 3. Identify terrain within the envelope:
 *    - Impassable: mark for exclusion rendering
 *    - Difficult: mark as difficult zone (−2" M penalty)
 *    - Dangerous: mark as dangerous zone (−2" M penalty + terrain test)
 * 4. Identify enemy exclusion zones: each enemy model creates an exclusion
 *    circle with radius = enemy base radius + 1"
 * 5. Return boundary polygon and all zone overlays for the visualizer
 *
 * NOTE: The precise path-dependent computation (where moving through difficult
 * terrain uses more of the movement budget) is too complex for a pre-computed
 * envelope. The Phase 3 movement validator will check the actual chosen path.
 *
 * @param model - The model to compute the envelope for
 * @param maxMove - Maximum movement distance in inches (M characteristic)
 * @param terrain - All terrain pieces on the battlefield
 * @param enemyModels - All enemy model shapes on the battlefield
 * @param battlefieldWidth - Battlefield width in inches (defaults to 72")
 * @param battlefieldHeight - Battlefield height in inches (defaults to 48")
 * @returns MovementEnvelopeResult with boundary, zones, and metadata
 */
export function computeMovementEnvelope(
  model: ModelShape,
  maxMove: number,
  terrain: TerrainPiece[],
  enemyModels: ModelShape[],
  battlefieldWidth?: number,
  battlefieldHeight?: number,
): MovementEnvelopeResult {
  const bfWidth = battlefieldWidth ?? DEFAULT_BATTLEFIELD_WIDTH;
  const bfHeight = battlefieldHeight ?? DEFAULT_BATTLEFIELD_HEIGHT;
  const center = getModelCenter(model);

  // ── Step 1: Generate circular boundary ──────────────────────────────────
  const rawBoundary = generateCircleBoundary(center, maxMove);

  // ── Step 2: Clip boundary to battlefield bounds ─────────────────────────
  const clippedBoundary = clipPolygonToRect(rawBoundary, bfWidth, bfHeight);

  // ── Step 3: Classify terrain within the envelope ────────────────────────
  const difficultZones: TerrainPiece[] = [];
  const dangerousZones: TerrainPiece[] = [];
  const impassableZones: TerrainPiece[] = [];

  for (const piece of terrain) {
    // Skip terrain that is outside the envelope entirely
    if (!terrainOverlapsEnvelope(piece, center, maxMove)) {
      continue;
    }

    // A terrain piece can be both difficult and dangerous (dangerous implies difficult).
    // Classify into the most relevant category for the visualizer.
    if (isTerrainImpassable(piece)) {
      impassableZones.push(piece);
    }

    if (isTerrainDangerous(piece)) {
      dangerousZones.push(piece);
    } else if (isTerrainDifficult(piece)) {
      difficultZones.push(piece);
    }
  }

  // ── Step 4: Identify enemy exclusion zones ──────────────────────────────
  const exclusionZones: { center: Position; radius: number }[] = [];

  for (const enemy of enemyModels) {
    const enemyCenter = getModelCenter(enemy);
    const exclusionRadius = getExclusionRadius(enemy);

    // Check if the exclusion zone overlaps with the movement envelope
    const distToEnemy = vec2Distance(center, enemyCenter);
    if (distToEnemy <= maxMove + exclusionRadius + EPSILON) {
      exclusionZones.push({
        center: enemyCenter,
        radius: exclusionRadius,
      });
    }
  }

  // ── Step 5: Return result ───────────────────────────────────────────────
  return {
    boundary: clippedBoundary,
    maxDistance: maxMove,
    difficultZones,
    dangerousZones,
    impassableZones,
    exclusionZones,
  };
}

// ─── Movement Range Check ────────────────────────────────────────────────────

/**
 * Check if a target position is within the raw movement range (ignoring terrain).
 * Measures from the model's center to the target position.
 *
 * Reference: HH_Principles.md — "Measuring" (base-to-base measurement)
 *
 * Movement is measured from the model's current position center to the
 * target position center (the model moves its center point). The model
 * can move up to maxMove inches.
 *
 * @param model - The model shape at its current position
 * @param target - The target position to check
 * @param maxMove - Maximum movement distance in inches (M characteristic)
 * @returns True if the target position is within movement range
 */
export function isWithinMovementRange(
  model: ModelShape,
  target: Position,
  maxMove: number,
): boolean {
  const center = getModelCenter(model);
  const distFromCenter = vec2Distance(center, target);

  return distFromCenter <= maxMove + EPSILON;
}

// ─── Exclusion Zone Check ────────────────────────────────────────────────────

/**
 * Check if a position is within any enemy model's exclusion zone.
 * A model cannot voluntarily end its move within 1" of an enemy model.
 *
 * Reference: HH_Principles.md — "1" Exclusion Zone"
 * "A model cannot voluntarily end its move within 1" of an enemy model
 * unless it is charging into close combat."
 *
 * The check measures from the target position to each enemy model's
 * base edge. If the distance is less than the ENEMY_EXCLUSION_ZONE (1"),
 * the position is in the exclusion zone.
 *
 * @param position - The position to check
 * @param enemyModels - All enemy model shapes on the battlefield
 * @returns True if the position is within 1" of any enemy model's base
 */
export function isInExclusionZone(
  position: Position,
  enemyModels: ModelShape[],
): boolean {
  for (const enemy of enemyModels) {
    const enemyCenter = getModelCenter(enemy);

    if (enemy.kind === 'circle') {
      // Distance from position to the circle base edge
      const distToEdge = vec2Distance(position, enemyCenter) - enemy.radius;
      if (distToEdge < ENEMY_EXCLUSION_ZONE - EPSILON) {
        return true;
      }
    } else {
      // For rectangular hulls, use the closest point on the hull boundary.
      // Transform position into hull-local space to find the closest edge point.
      const toLocal = vec2Sub(position, enemy.center);
      const cos = Math.cos(-enemy.rotation);
      const sin = Math.sin(-enemy.rotation);
      const localPoint: Position = {
        x: toLocal.x * cos - toLocal.y * sin,
        y: toLocal.x * sin + toLocal.y * cos,
      };

      const hw = enemy.width / 2;
      const hh = enemy.height / 2;

      // Closest point on the rectangle in local space
      const closestLocal: Position = {
        x: Math.max(-hw, Math.min(localPoint.x, hw)),
        y: Math.max(-hh, Math.min(localPoint.y, hh)),
      };

      const dx = localPoint.x - closestLocal.x;
      const dy = localPoint.y - closestLocal.y;
      const distToEdge = Math.sqrt(dx * dx + dy * dy);

      // If the point is inside the hull, distance is 0 (definitely in exclusion zone)
      if (distToEdge < ENEMY_EXCLUSION_ZONE - EPSILON) {
        return true;
      }
    }
  }

  return false;
}

// ─── Impassable Terrain Check ────────────────────────────────────────────────

/**
 * Check if a position is inside any impassable terrain piece.
 * A model cannot enter impassable terrain at all.
 *
 * Reference: HH_Principles.md — "Impassable Terrain"
 * "Models cannot move into or through Impassable terrain."
 *
 * @param position - The position to check
 * @param terrain - All terrain pieces on the battlefield
 * @returns True if the position is inside any impassable terrain
 */
export function isInImpassableTerrain(
  position: Position,
  terrain: TerrainPiece[],
): boolean {
  for (const piece of terrain) {
    if (!isTerrainImpassable(piece)) {
      continue;
    }

    if (pointInTerrainShape(position, piece.shape)) {
      return true;
    }
  }

  return false;
}
