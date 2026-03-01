/**
 * Base-Edge to Base-Edge Distance Calculations
 * Reference: HH_Principles.md — "Measuring"
 *
 * "When measuring the distance between two Models that have Bases,
 * the distance is always measured Base to Base. This means that the
 * distance between the two Models is measured between the two closest
 * points on the two Models' Bases, not from any point on the actual Models."
 *
 * All distances are in inches (floating-point).
 */

import { EPSILON } from './constants';
import {
  vec2Distance,
  vec2DistanceSq,
  closestPointOnSegment,
} from './vec2';
import {
  type ModelShape,
  type CircleBase,
  type RectHull,
  type Segment,
  getRectEdges,
  closestPointOnRect,
} from './shapes';

// ─── Circle-to-Circle Distance ───────────────────────────────────────────────

/**
 * Compute base-edge to base-edge distance between two circular bases.
 * This is the closest distance between the boundaries of two circles.
 *
 * @param a - First circular base
 * @param b - Second circular base
 * @returns Distance in inches (0 if overlapping or touching)
 *
 * @example
 * // Two 32mm bases 10" center-to-center:
 * // radius each = 32/25.4/2 ≈ 0.6299"
 * // edge distance = 10.0 - 0.6299 - 0.6299 ≈ 8.74"
 */
export function distanceCircleToCircle(a: CircleBase, b: CircleBase): number {
  const centerDist = vec2Distance(a.center, b.center);
  const edgeDist = centerDist - a.radius - b.radius;
  return Math.max(0, edgeDist);
}

// ─── Circle-to-Rectangle Distance ────────────────────────────────────────────

/**
 * Compute base-edge to hull-edge distance between a circular base and
 * a rectangular vehicle hull.
 *
 * @param circle - Circular base
 * @param rect - Rectangular hull
 * @returns Distance in inches (0 if overlapping or touching)
 */
export function distanceCircleToRect(circle: CircleBase, rect: RectHull): number {
  // Find closest point on rect boundary to circle center
  const closestOnRect = closestPointOnRect(rect, circle.center);
  const distToClosest = vec2Distance(circle.center, closestOnRect);
  const edgeDist = distToClosest - circle.radius;
  return Math.max(0, edgeDist);
}

// ─── Rectangle-to-Rectangle Distance ─────────────────────────────────────────

/**
 * Compute hull-edge to hull-edge distance between two rectangular vehicle hulls.
 * Uses edge-to-edge minimum distance between all pairs of edges.
 *
 * @param a - First rectangular hull
 * @param b - Second rectangular hull
 * @returns Distance in inches (0 if overlapping or touching)
 */
export function distanceRectToRect(a: RectHull, b: RectHull): number {
  const edgesA = getRectEdges(a);
  const edgesB = getRectEdges(b);

  let minDistSq = Infinity;

  // Check all edge-to-edge combinations
  for (const edgeA of edgesA) {
    for (const edgeB of edgesB) {
      const d = segmentToSegmentDistanceSq(edgeA, edgeB);
      if (d < minDistSq) {
        minDistSq = d;
      }
    }
  }

  // Also check if one rectangle is completely inside the other
  // (in which case edge-to-edge might give wrong results)
  // We check if the center of A is inside B or vice versa
  const closestOnBtoA = closestPointOnRect(b, a.center);
  const dCenterA = vec2DistanceSq(a.center, closestOnBtoA);
  if (dCenterA < minDistSq) {
    minDistSq = dCenterA;
  }

  const closestOnAtoB = closestPointOnRect(a, b.center);
  const dCenterB = vec2DistanceSq(b.center, closestOnAtoB);
  if (dCenterB < minDistSq) {
    minDistSq = dCenterB;
  }

  return Math.max(0, Math.sqrt(minDistSq));
}

/**
 * Compute the squared distance between two line segments.
 * @internal
 */
function segmentToSegmentDistanceSq(a: Segment, b: Segment): number {
  // Check all 4 point-to-segment combinations and take the minimum
  let minSq = Infinity;

  // Point on A closest to endpoints of B
  const closestA1 = closestPointOnSegment(b.start, a.start, a.end);
  minSq = Math.min(minSq, vec2DistanceSq(b.start, closestA1));

  const closestA2 = closestPointOnSegment(b.end, a.start, a.end);
  minSq = Math.min(minSq, vec2DistanceSq(b.end, closestA2));

  // Point on B closest to endpoints of A
  const closestB1 = closestPointOnSegment(a.start, b.start, b.end);
  minSq = Math.min(minSq, vec2DistanceSq(a.start, closestB1));

  const closestB2 = closestPointOnSegment(a.end, b.start, b.end);
  minSq = Math.min(minSq, vec2DistanceSq(a.end, closestB2));

  return minSq;
}

// ─── Shape Dispatcher ────────────────────────────────────────────────────────

/**
 * Compute base-edge to base-edge distance between any two model shapes.
 * Dispatches to the appropriate specialized function based on shape kinds.
 *
 * Reference: HH_Principles.md — "Measuring"
 * "the distance between the two Models is measured between the two closest
 * points on the two Models' Bases"
 *
 * @param a - First model shape
 * @param b - Second model shape
 * @returns Distance in inches (0 if overlapping or touching)
 */
export function distanceShapes(a: ModelShape, b: ModelShape): number {
  if (a.kind === 'circle' && b.kind === 'circle') {
    return distanceCircleToCircle(a, b);
  }
  if (a.kind === 'circle' && b.kind === 'rect') {
    return distanceCircleToRect(a, b);
  }
  if (a.kind === 'rect' && b.kind === 'circle') {
    return distanceCircleToRect(b, a);
  }
  if (a.kind === 'rect' && b.kind === 'rect') {
    return distanceRectToRect(a, b);
  }
  // Exhaustive — should never reach here
  return 0;
}

// ─── Base Contact ────────────────────────────────────────────────────────────

/**
 * Check if two model shapes are in base contact (touching or overlapping).
 *
 * @param a - First model shape
 * @param b - Second model shape
 * @returns True if the shapes are touching or overlapping
 */
export function areInBaseContact(a: ModelShape, b: ModelShape): boolean {
  return distanceShapes(a, b) <= EPSILON;
}

// ─── Distance Rounding ───────────────────────────────────────────────────────

/**
 * Round a distance up to the nearest whole inch.
 * Reference: HH_Principles.md — "Measuring"
 * "any fractional distance is always rounded up to the nearest whole inch"
 *
 * @param inches - Distance in inches (floating-point)
 * @returns Distance rounded up to the nearest whole inch
 *
 * @example
 * distanceRoundUp(4.0) // → 4
 * distanceRoundUp(4.1) // → 5
 * distanceRoundUp(4.9) // → 5
 * distanceRoundUp(0.0) // → 0
 */
export function distanceRoundUp(inches: number): number {
  if (inches <= 0) return 0;
  return Math.ceil(inches - EPSILON); // Subtract tiny epsilon to handle floating-point exact integers
}

// ─── Range Check ─────────────────────────────────────────────────────────────

/**
 * Check if one shape is within a specified range of another.
 * Uses base-edge to base-edge distance.
 *
 * @param a - First model shape
 * @param b - Second model shape
 * @param range - Maximum range in inches
 * @returns True if the edge-to-edge distance is within range
 */
export function isWithinRange(a: ModelShape, b: ModelShape, range: number): boolean {
  return distanceShapes(a, b) <= range + EPSILON;
}
