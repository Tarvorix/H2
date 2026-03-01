/**
 * Line of Sight (LOS) Raycasting Module
 * Reference: HH_Principles.md — "Line of Sight", "Base to Base Contact", "Terrain"
 *
 * Implements Line of Sight checking between two models on the battlefield.
 * LOS exists if ANY unbroken straight line can be drawn between two models.
 *
 * Blocking rules:
 * - Models with Vehicle Type ALWAYS block LOS
 * - Non-vehicle models do NOT block LOS
 * - Light Area Terrain: NEVER blocks LOS
 * - Medium Area Terrain: blocks only if ray passes through MORE THAN 3" (chord length)
 * - Heavy Area Terrain: ALWAYS blocks LOS
 * - Terrain Pieces (solid objects): ALWAYS block LOS
 * - Impassable terrain: ALWAYS block LOS
 * - Dangerous and Difficult terrain types alone DON'T block LOS
 * - Models in base contact ALWAYS have LOS to each other
 */

import type { Position, TerrainPiece } from '@hh/types';
import { TerrainType } from '@hh/types';
import { EPSILON, MEDIUM_TERRAIN_CHORD_THRESHOLD } from './constants';
import { vec2Distance } from './vec2';
import type { ModelShape, RectHull, Segment } from './shapes';
import { areInBaseContact } from './distance';
import {
  allTangentLines,
  circleToRectRays,
  rectToRectRays,
  segmentRectIntersection,
} from './intersection';
import { terrainChordLength } from './terrain';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Describes where a LOS ray intersects a terrain piece.
 * Records the entry point, exit point, and the chord length
 * (the distance the ray travels inside the terrain).
 */
export interface TerrainIntersection {
  /** Unique identifier of the terrain piece intersected */
  terrainId: string;
  /** Point where the ray enters the terrain piece */
  enterPoint: Position;
  /** Point where the ray exits the terrain piece */
  exitPoint: Position;
  /** Distance the ray travels inside the terrain piece (in inches) */
  chordLength: number;
}

/**
 * A single LOS ray between two models, with its blocking status.
 * Multiple rays are cast between model boundaries (tangent lines, edge points).
 * LOS exists if at least one ray is unblocked.
 */
export interface LOSRay {
  /** Start point of the ray (on model A's boundary) */
  start: Position;
  /** End point of the ray (on model B's boundary) */
  end: Position;
  /** Whether this ray is blocked by an obstruction */
  isBlocked: boolean;
  /**
   * The reason this ray is blocked, if blocked.
   * - 'vehicle': blocked by a Vehicle model hull
   * - 'heavy_area': blocked by Heavy Area Terrain
   * - 'medium_area_chord': blocked by Medium Area Terrain (chord > 3")
   * - 'terrain_piece': blocked by a solid Terrain Piece
   * - 'impassable': blocked by Impassable terrain
   */
  blockingReason?: 'vehicle' | 'heavy_area' | 'medium_area_chord' | 'terrain_piece' | 'impassable';
  /** All terrain intersections along this ray, regardless of blocking */
  terrainIntersections: TerrainIntersection[];
}

/**
 * The complete result of a Line of Sight check between two models.
 * Contains the overall LOS determination and all individual ray results.
 */
export interface LOSResult {
  /** True if at least one unblocked ray exists between the two models */
  hasLOS: boolean;
  /** All rays cast between the two models with their individual results */
  rays: LOSRay[];
}

// ─── Ray Generation ──────────────────────────────────────────────────────────

/**
 * Generate candidate LOS ray segments between two model shapes.
 * Uses tangent lines for circle-circle, edge/corner sampling for
 * circle-rect and rect-rect pairs.
 *
 * @param a - First model shape
 * @param b - Second model shape
 * @returns Array of ray segments from model A's boundary to model B's boundary
 */
function generateRays(a: ModelShape, b: ModelShape): Segment[] {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return allTangentLines(a, b);
  }
  if (a.kind === 'circle' && b.kind === 'rect') {
    return circleToRectRays(a, b);
  }
  if (a.kind === 'rect' && b.kind === 'circle') {
    // Reverse the rays so they go from A to B
    const reversed = circleToRectRays(b, a);
    return reversed.map(seg => ({ start: seg.end, end: seg.start }));
  }
  if (a.kind === 'rect' && b.kind === 'rect') {
    return rectToRectRays(a, b);
  }
  // Exhaustive — should never reach here
  return [];
}

// ─── Terrain Classification ──────────────────────────────────────────────────

/**
 * Determine whether a terrain type can potentially block LOS.
 * Reference: HH_Principles.md — "Terrain"
 *
 * - Light Area Terrain: NEVER blocks LOS
 * - Dangerous terrain: does NOT block LOS on its own
 * - Difficult terrain: does NOT block LOS on its own
 * - Medium Area Terrain: blocks only if chord > 3"
 * - Heavy Area Terrain: ALWAYS blocks LOS
 * - Terrain Pieces: ALWAYS block LOS
 * - Impassable: ALWAYS blocks LOS
 *
 * @param terrainType - The terrain type to classify
 * @returns True if this terrain type can potentially obstruct a LOS ray
 */
function terrainCanBlockLOS(terrainType: TerrainType): boolean {
  switch (terrainType) {
    case TerrainType.LightArea:
      return false;
    case TerrainType.Dangerous:
      return false;
    case TerrainType.Difficult:
      return false;
    case TerrainType.MediumArea:
      return true;
    case TerrainType.HeavyArea:
      return true;
    case TerrainType.TerrainPiece:
      return true;
    case TerrainType.Impassable:
      return true;
  }
}

// ─── Terrain Intersection Computation ────────────────────────────────────────

/**
 * Compute the terrain intersection details for a ray passing through a terrain piece.
 * Calculates enter/exit points and chord length using binary search along the
 * parametric ray interval to precisely locate entry and exit boundaries.
 *
 * @param ray - The ray segment to test
 * @param terrain - The terrain piece to check against
 * @param chord - Pre-computed chord length of the ray through this terrain
 * @returns TerrainIntersection with entry/exit points and chord length
 */
function computeTerrainIntersection(
  ray: Segment,
  terrain: TerrainPiece,
  chord: number,
): TerrainIntersection | null {
  if (chord <= EPSILON) {
    return null;
  }

  const rayDx = ray.end.x - ray.start.x;
  const rayDy = ray.end.y - ray.start.y;
  const rayLength = vec2Distance(ray.start, ray.end);

  if (rayLength <= EPSILON) {
    return null;
  }

  // Find the parametric entry and exit points along the ray
  const enterT = findTerrainEntryT(ray, terrain, 0, 1);
  const exitT = findTerrainExitT(ray, terrain, enterT, 1);

  const enterPoint: Position = {
    x: ray.start.x + rayDx * enterT,
    y: ray.start.y + rayDy * enterT,
  };

  const exitPoint: Position = {
    x: ray.start.x + rayDx * exitT,
    y: ray.start.y + rayDy * exitT,
  };

  return {
    terrainId: terrain.id,
    enterPoint,
    exitPoint,
    chordLength: chord,
  };
}

/**
 * Binary search along a ray to find the parametric t value where the ray
 * first enters a terrain piece. Performs a coarse linear scan followed by
 * a fine binary search refinement.
 *
 * @param ray - The ray segment
 * @param terrain - The terrain piece
 * @param tMin - Minimum t to search from
 * @param tMax - Maximum t to search to
 * @returns Parametric t value of the entry point
 */
function findTerrainEntryT(
  ray: Segment,
  terrain: TerrainPiece,
  tMin: number,
  tMax: number,
): number {
  const steps = 64;
  const dt = (tMax - tMin) / steps;
  const rayDx = ray.end.x - ray.start.x;
  const rayDy = ray.end.y - ray.start.y;

  // Linear scan to find the first step interval that has a non-zero chord
  let entryStep = -1;
  for (let i = 0; i <= steps; i++) {
    const t = tMin + i * dt;
    const tLow = Math.max(tMin, t - dt * 0.5);
    const tHigh = Math.min(tMax, t + dt * 0.5);
    const subStart: Position = {
      x: ray.start.x + rayDx * tLow,
      y: ray.start.y + rayDy * tLow,
    };
    const subEnd: Position = {
      x: ray.start.x + rayDx * tHigh,
      y: ray.start.y + rayDy * tHigh,
    };
    const subChord = terrainChordLength(subStart, subEnd, terrain);
    if (subChord > EPSILON) {
      entryStep = i;
      break;
    }
  }

  if (entryStep < 0) {
    return tMin;
  }

  // Binary search between the step before entry and the entry step
  let lo = tMin + Math.max(0, entryStep - 1) * dt;
  let hi = tMin + entryStep * dt;

  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const subStart: Position = {
      x: ray.start.x + rayDx * lo,
      y: ray.start.y + rayDy * lo,
    };
    const subEnd: Position = {
      x: ray.start.x + rayDx * mid,
      y: ray.start.y + rayDy * mid,
    };
    const subChord = terrainChordLength(subStart, subEnd, terrain);
    if (subChord > EPSILON) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return hi;
}

/**
 * Binary search along a ray to find the parametric t value where the ray
 * last exits a terrain piece. Scans backwards from tMax to find the last
 * interval with chord, then refines with binary search.
 *
 * @param ray - The ray segment
 * @param terrain - The terrain piece
 * @param tMin - Minimum t to search from (entry point)
 * @param tMax - Maximum t to search to
 * @returns Parametric t value of the exit point
 */
function findTerrainExitT(
  ray: Segment,
  terrain: TerrainPiece,
  tMin: number,
  tMax: number,
): number {
  const steps = 64;
  const dt = (tMax - tMin) / steps;
  const rayDx = ray.end.x - ray.start.x;
  const rayDy = ray.end.y - ray.start.y;

  // Linear scan from the end backwards to find the last step with chord > 0
  let exitStep = -1;
  for (let i = steps; i >= 0; i--) {
    const t = tMin + i * dt;
    const tLow = Math.max(tMin, t - dt * 0.5);
    const tHigh = Math.min(tMax, t + dt * 0.5);
    const subStart: Position = {
      x: ray.start.x + rayDx * tLow,
      y: ray.start.y + rayDy * tLow,
    };
    const subEnd: Position = {
      x: ray.start.x + rayDx * tHigh,
      y: ray.start.y + rayDy * tHigh,
    };
    const subChord = terrainChordLength(subStart, subEnd, terrain);
    if (subChord > EPSILON) {
      exitStep = i;
      break;
    }
  }

  if (exitStep < 0) {
    return tMax;
  }

  // Binary search between the exit step and the step after it
  let lo = tMin + exitStep * dt;
  let hi = tMin + Math.min(steps, exitStep + 1) * dt;

  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const subStart: Position = {
      x: ray.start.x + rayDx * mid,
      y: ray.start.y + rayDy * mid,
    };
    const subEnd: Position = {
      x: ray.start.x + rayDx * hi,
      y: ray.start.y + rayDy * hi,
    };
    const subChord = terrainChordLength(subStart, subEnd, terrain);
    if (subChord > EPSILON) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return lo;
}

// ─── Single Ray Evaluation ───────────────────────────────────────────────────

/**
 * Evaluate a single LOS ray against all terrain pieces and vehicle hulls.
 * Checks each potential obstruction and marks the ray as blocked with the
 * appropriate reason if any obstruction is found.
 *
 * Reference: HH_Principles.md — "Line of Sight"
 * - Vehicle hulls always block LOS
 * - Heavy Area Terrain always blocks LOS
 * - Terrain Pieces always block LOS
 * - Impassable terrain always blocks LOS
 * - Medium Area Terrain blocks only if chord > 3"
 * - Light Area, Dangerous, Difficult never block LOS
 *
 * @param ray - The ray segment to evaluate
 * @param terrain - All terrain pieces on the battlefield
 * @param vehicleHulls - All vehicle model hulls that could block LOS
 * @returns A fully evaluated LOSRay with blocking status and terrain intersections
 */
function evaluateRay(
  ray: Segment,
  terrain: TerrainPiece[],
  vehicleHulls: RectHull[],
): LOSRay {
  const result: LOSRay = {
    start: ray.start,
    end: ray.end,
    isBlocked: false,
    terrainIntersections: [],
  };

  // Skip degenerate rays (zero length)
  const rayLength = vec2Distance(ray.start, ray.end);
  if (rayLength <= EPSILON) {
    return result;
  }

  // ── Step 3a: Check vehicle hulls ───────────────────────────────────────────
  // Reference: HH_Principles.md — "Models with the Vehicle Type ... always block LOS"
  for (const hull of vehicleHulls) {
    const hits = segmentRectIntersection(ray.start, ray.end, hull);
    if (hits.length >= 1) {
      // Ray intersects the vehicle hull boundary — LOS is blocked
      result.isBlocked = true;
      result.blockingReason = 'vehicle';
      return result;
    }
  }

  // ── Steps 3b-3f: Check terrain pieces ──────────────────────────────────────
  for (const piece of terrain) {
    // Skip terrain types that never block LOS
    if (!terrainCanBlockLOS(piece.type)) {
      continue;
    }

    const chord = terrainChordLength(ray.start, ray.end, piece);

    if (chord <= EPSILON) {
      continue;
    }

    // Record the terrain intersection regardless of whether it blocks
    const intersection = computeTerrainIntersection(ray, piece, chord);
    if (intersection) {
      result.terrainIntersections.push(intersection);
    }

    // Determine if this terrain blocks the ray based on its type
    switch (piece.type) {
      // ── Step 3b: Heavy Area Terrain — any chord > 0 blocks ─────────────
      // Reference: HH_Principles.md — "Heavy Area Terrain always blocks Line of Sight"
      case TerrainType.HeavyArea: {
        result.isBlocked = true;
        result.blockingReason = 'heavy_area';
        return result;
      }

      // ── Step 3c: Terrain Pieces (solid objects) — any chord > 0 blocks ─
      // Reference: HH_Principles.md — "a piece of Terrain ... breaks the line"
      case TerrainType.TerrainPiece: {
        result.isBlocked = true;
        result.blockingReason = 'terrain_piece';
        return result;
      }

      // ── Step 3d: Impassable terrain — any chord > 0 blocks ─────────────
      // Reference: HH_Principles.md — "Impassable"
      case TerrainType.Impassable: {
        result.isBlocked = true;
        result.blockingReason = 'impassable';
        return result;
      }

      // ── Step 3e: Medium Area Terrain — chord > 3" blocks ───────────────
      // Reference: HH_Principles.md — "Terrain only obstructs Line of Sight
      // if the line passes through more than 3" of an Area of Terrain"
      case TerrainType.MediumArea: {
        if (chord > MEDIUM_TERRAIN_CHORD_THRESHOLD + EPSILON) {
          result.isBlocked = true;
          result.blockingReason = 'medium_area_chord';
          return result;
        }
        // Chord <= 3" — does not block this ray
        break;
      }

      // ── Step 3f: Light Area, Dangerous, Difficult — never block ────────
      // These are filtered out by terrainCanBlockLOS above, but the
      // default case handles any unexpected terrain type gracefully.
      default:
        break;
    }
  }

  return result;
}

// ─── Main LOS Check ──────────────────────────────────────────────────────────

/**
 * Perform a full Line of Sight check between two models.
 *
 * Algorithm:
 * 1. If models are in base contact, LOS is automatically granted
 *    (Reference: HH_Principles.md — "Models that are in Base-to-Base contact
 *    are always considered to have Line of Sight to each other")
 * 2. Generate candidate rays between model boundaries using tangent lines
 *    (circle-circle), edge/corner sampling (circle-rect, rect-rect)
 * 3. For each ray, check if it is blocked by:
 *    a. Vehicle hulls (segmentRectIntersection)
 *    b. Heavy Area Terrain (any chord > 0 → blocked)
 *    c. Terrain Pieces (any chord > 0 → blocked)
 *    d. Impassable terrain (any chord > 0 → blocked)
 *    e. Medium Area Terrain (chord > 3" → blocked)
 *    f. Light Area, Dangerous, Difficult → NEVER block
 * 4. LOS exists if ANY ray is unobstructed
 *
 * @param modelA - First model shape
 * @param modelB - Second model shape
 * @param terrain - All terrain pieces on the battlefield
 * @param vehicleHulls - All vehicle model hulls that could block LOS
 *   (should NOT include modelA or modelB if either is a vehicle)
 * @returns LOSResult containing the overall determination and all ray details
 */
export function checkLOS(
  modelA: ModelShape,
  modelB: ModelShape,
  terrain: TerrainPiece[],
  vehicleHulls: RectHull[],
): LOSResult {
  // ── Step 1: Base contact check ─────────────────────────────────────────────
  // Reference: HH_Principles.md — "Models that are in Base-to-Base contact
  // are always considered to have Line of Sight to each other, regardless
  // of Terrain or any other Rules."
  if (areInBaseContact(modelA, modelB)) {
    return {
      hasLOS: true,
      rays: [],
    };
  }

  // ── Step 2: Generate candidate rays ────────────────────────────────────────
  const segments = generateRays(modelA, modelB);

  // If no rays could be generated (degenerate geometry), no LOS
  if (segments.length === 0) {
    return {
      hasLOS: false,
      rays: [],
    };
  }

  // ── Steps 3-4: Evaluate each ray and check for any unblocked ray ───────────
  const rays: LOSRay[] = [];
  let foundUnblockedRay = false;

  for (const segment of segments) {
    const evaluatedRay = evaluateRay(segment, terrain, vehicleHulls);
    rays.push(evaluatedRay);

    if (!evaluatedRay.isBlocked) {
      foundUnblockedRay = true;
      // Continue evaluating all rays to provide complete diagnostic data
      // in the LOSResult, even after finding an unblocked ray.
    }
  }

  return {
    hasLOS: foundUnblockedRay,
    rays,
  };
}

// ─── Convenience Function ────────────────────────────────────────────────────

/**
 * Quick boolean check for Line of Sight between two models.
 * This is a convenience wrapper that returns only the boolean result,
 * with an early-out optimisation (stops as soon as one unblocked ray is found).
 *
 * Reference: HH_Principles.md — "Line of Sight"
 * "if an unbroken straight line can be drawn between the first Model and its target
 * ... then both Models have Line of Sight to each other"
 *
 * @param modelA - First model shape
 * @param modelB - Second model shape
 * @param terrain - All terrain pieces on the battlefield
 * @param vehicleHulls - All vehicle model hulls that could block LOS
 *   (should NOT include modelA or modelB if either is a vehicle)
 * @returns True if modelA has Line of Sight to modelB
 */
export function hasLOS(
  modelA: ModelShape,
  modelB: ModelShape,
  terrain: TerrainPiece[],
  vehicleHulls: RectHull[],
): boolean {
  // Base contact is the fastest check — do it first
  // Reference: HH_Principles.md — "Models that are in Base-to-Base contact
  // are always considered to have Line of Sight to each other"
  if (areInBaseContact(modelA, modelB)) {
    return true;
  }

  // Generate candidate rays
  const segments = generateRays(modelA, modelB);

  if (segments.length === 0) {
    return false;
  }

  // Early-out: return true as soon as we find any unblocked ray
  for (const segment of segments) {
    const evaluatedRay = evaluateRay(segment, terrain, vehicleHulls);
    if (!evaluatedRay.isBlocked) {
      return true;
    }
  }

  return false;
}
