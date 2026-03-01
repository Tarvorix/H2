/**
 * Geometric Intersection Routines
 * Reference: Pure math utilities — no game rule awareness.
 *
 * Ray-segment, ray-circle, ray-polygon, segment-segment intersection tests.
 * Tangent line computation between circles for LOS raycasting.
 * Chord length calculation through terrain polygons.
 */

import type { Position } from '@hh/types';
import { EPSILON } from './constants';
import {
  vec2Sub,
  vec2Add,
  vec2Scale,
  vec2Dot,
  vec2Cross,
  vec2Length,
  vec2LengthSq,
  vec2Distance,
  vec2DistanceSq,
  vec2Perpendicular,
  approxZero,
  closestPointOnSegment,
} from './vec2';
import {
  type CircleBase,
  type RectHull,
  type Segment,
  getRectEdges,
} from './shapes';

// ─── Segment-Segment Intersection ────────────────────────────────────────────

/**
 * Find the intersection point of two line segments, if it exists.
 * Uses the parametric line intersection method.
 *
 * @param a1 - Start of first segment
 * @param a2 - End of first segment
 * @param b1 - Start of second segment
 * @param b2 - End of second segment
 * @returns Intersection point, or null if segments don't intersect
 */
export function segmentSegmentIntersection(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): Position | null {
  const d1 = vec2Sub(a2, a1); // direction of segment A
  const d2 = vec2Sub(b2, b1); // direction of segment B
  const cross = vec2Cross(d1, d2);

  if (approxZero(cross)) {
    // Parallel or coincident — no single intersection point
    return null;
  }

  const d = vec2Sub(b1, a1);
  const t = vec2Cross(d, d2) / cross;
  const u = vec2Cross(d, d1) / cross;

  // Both parameters must be in [0, 1] for intersection to be on both segments
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    return vec2Add(a1, vec2Scale(d1, t));
  }

  return null;
}

// ─── Segment-Circle Intersection ─────────────────────────────────────────────

/**
 * Find all intersection points of a line segment with a circle.
 * Returns 0, 1, or 2 intersection points.
 *
 * @param segStart - Start of segment
 * @param segEnd - End of segment
 * @param circle - The circle to test against
 * @returns Array of intersection points (empty if no intersection)
 */
export function segmentCircleIntersection(
  segStart: Position,
  segEnd: Position,
  circle: CircleBase,
): Position[] {
  const d = vec2Sub(segEnd, segStart);
  const f = vec2Sub(segStart, circle.center);

  const a = vec2Dot(d, d);
  const b = 2 * vec2Dot(f, d);
  const c = vec2Dot(f, f) - circle.radius * circle.radius;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) {
    return []; // No intersection
  }

  if (discriminant < 0) discriminant = 0; // Tangent — treat as single point
  const sqrtDisc = Math.sqrt(discriminant);

  const results: Position[] = [];

  const t1 = (-b - sqrtDisc) / (2 * a);
  if (t1 >= -EPSILON && t1 <= 1 + EPSILON) {
    results.push(vec2Add(segStart, vec2Scale(d, t1)));
  }

  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t2 >= -EPSILON && t2 <= 1 + EPSILON && Math.abs(t2 - t1) > EPSILON) {
    results.push(vec2Add(segStart, vec2Scale(d, t2)));
  }

  return results;
}

// ─── Segment-Polygon Intersection ────────────────────────────────────────────

/**
 * Find all intersection points of a line segment with a polygon boundary.
 * The polygon is defined as an array of vertices forming a closed shape.
 *
 * @param segStart - Start of segment
 * @param segEnd - End of segment
 * @param vertices - Polygon vertices (closed: last connects to first)
 * @returns Array of intersection points (may be empty)
 */
export function segmentPolygonIntersection(
  segStart: Position,
  segEnd: Position,
  vertices: Position[],
): Position[] {
  const results: Position[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % n];
    const hit = segmentSegmentIntersection(segStart, segEnd, v1, v2);
    if (hit) {
      // Avoid duplicate points (can happen at polygon corners)
      let isDuplicate = false;
      for (const existing of results) {
        if (vec2DistanceSq(hit, existing) < EPSILON * EPSILON) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        results.push(hit);
      }
    }
  }

  return results;
}

// ─── Segment-Rectangle Intersection ──────────────────────────────────────────

/**
 * Find all intersection points of a line segment with a rotated rectangle boundary.
 *
 * @param segStart - Start of segment
 * @param segEnd - End of segment
 * @param rect - The rectangular hull
 * @returns Array of intersection points (may be empty)
 */
export function segmentRectIntersection(
  segStart: Position,
  segEnd: Position,
  rect: RectHull,
): Position[] {
  const edges = getRectEdges(rect);
  const results: Position[] = [];

  for (const edge of edges) {
    const hit = segmentSegmentIntersection(segStart, segEnd, edge.start, edge.end);
    if (hit) {
      let isDuplicate = false;
      for (const existing of results) {
        if (vec2DistanceSq(hit, existing) < EPSILON * EPSILON) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        results.push(hit);
      }
    }
  }

  return results;
}

// ─── Tangent Lines Between Circles ───────────────────────────────────────────

/**
 * Compute external tangent lines between two circles.
 * External tangents don't cross between the circles.
 *
 * For two non-overlapping circles, there are 2 external tangent lines.
 * For overlapping circles, tangent lines may not exist — returns empty.
 *
 * @param c1 - First circle
 * @param c2 - Second circle
 * @returns Array of tangent line segments (each from c1 boundary to c2 boundary)
 */
export function externalTangentLines(c1: CircleBase, c2: CircleBase): Segment[] {
  const d = vec2Sub(c2.center, c1.center);
  const dist = vec2Length(d);

  if (dist < EPSILON) {
    return []; // Concentric circles — no tangent lines
  }

  const rDiff = c1.radius - c2.radius;

  // External tangents exist when distance > |r1 - r2|
  if (dist < Math.abs(rDiff) + EPSILON) {
    return []; // One circle is inside the other
  }

  const dir = vec2Scale(d, 1 / dist); // Unit direction from c1 to c2

  // For external tangents, the tangent makes an angle alpha with the center line
  // sin(alpha) = (r1 - r2) / dist
  const sinAlpha = rDiff / dist;

  if (Math.abs(sinAlpha) > 1 + EPSILON) {
    return []; // Shouldn't happen after the check above, but be safe
  }

  const cosAlpha = Math.sqrt(Math.max(0, 1 - sinAlpha * sinAlpha));

  const results: Segment[] = [];

  // Two external tangent lines — one on each side
  for (const sign of [1, -1]) {
    // Tangent direction perpendicular to the center line, rotated by alpha
    const tangentNormal: Position = {
      x: dir.x * sinAlpha + sign * dir.y * cosAlpha,
      y: dir.y * sinAlpha - sign * dir.x * cosAlpha,
    };

    // Tangent points on each circle
    const p1 = vec2Add(c1.center, vec2Scale(tangentNormal, c1.radius));
    const p2 = vec2Add(c2.center, vec2Scale(tangentNormal, c2.radius));

    results.push({ start: p1, end: p2 });
  }

  return results;
}

/**
 * Compute internal tangent lines between two circles.
 * Internal tangents cross between the circles.
 *
 * For two non-overlapping, non-touching circles, there are 2 internal tangent lines.
 * For overlapping or touching circles, internal tangents don't exist.
 *
 * @param c1 - First circle
 * @param c2 - Second circle
 * @returns Array of tangent line segments (each from c1 boundary to c2 boundary)
 */
export function internalTangentLines(c1: CircleBase, c2: CircleBase): Segment[] {
  const d = vec2Sub(c2.center, c1.center);
  const dist = vec2Length(d);

  if (dist < EPSILON) {
    return []; // Concentric circles
  }

  const rSum = c1.radius + c2.radius;

  // Internal tangents exist only when circles don't overlap: dist > r1 + r2
  if (dist < rSum + EPSILON) {
    return []; // Circles overlap or touch
  }

  const dir = vec2Scale(d, 1 / dist);

  // For internal tangents: sin(alpha) = (r1 + r2) / dist
  const sinAlpha = rSum / dist;

  if (sinAlpha > 1 + EPSILON) {
    return [];
  }

  const cosAlpha = Math.sqrt(Math.max(0, 1 - sinAlpha * sinAlpha));

  const results: Segment[] = [];

  for (const sign of [1, -1]) {
    const tangentNormal: Position = {
      x: dir.x * sinAlpha + sign * dir.y * cosAlpha,
      y: dir.y * sinAlpha - sign * dir.x * cosAlpha,
    };

    // For internal tangents, p2 is on the opposite side
    const p1 = vec2Add(c1.center, vec2Scale(tangentNormal, c1.radius));
    const p2 = vec2Add(c2.center, vec2Scale(tangentNormal, -c2.radius));

    results.push({ start: p1, end: p2 });
  }

  return results;
}

/**
 * Compute all tangent lines between two circles (both external and internal).
 * Also includes the center-to-center line clipped to circle boundaries.
 *
 * This is the primary LOS ray generator for circle-to-circle model pairs.
 *
 * @param c1 - First circle
 * @param c2 - Second circle
 * @returns Array of ray segments for LOS checking
 */
export function allTangentLines(c1: CircleBase, c2: CircleBase): Segment[] {
  const results: Segment[] = [];

  // External tangent lines
  results.push(...externalTangentLines(c1, c2));

  // Internal tangent lines (only if circles don't overlap)
  results.push(...internalTangentLines(c1, c2));

  // Center-to-center line clipped to circle boundaries
  const d = vec2Sub(c2.center, c1.center);
  const dist = vec2Length(d);
  if (dist > EPSILON) {
    const dir = vec2Scale(d, 1 / dist);
    const p1 = vec2Add(c1.center, vec2Scale(dir, c1.radius));
    const p2 = vec2Sub(c2.center, vec2Scale(dir, c2.radius));
    results.push({ start: p1, end: p2 });
  }

  return results;
}

// ─── Rays Between Circle and Rectangle ───────────────────────────────────────

/**
 * Generate LOS rays from a circular base to a rectangular hull.
 * Rays go from tangent points on the circle to edge midpoints and corners of the rect.
 *
 * @param circle - Circular base (infantry model)
 * @param rect - Rectangular hull (vehicle model)
 * @returns Array of ray segments for LOS checking
 */
export function circleToRectRays(circle: CircleBase, rect: RectHull): Segment[] {
  const results: Segment[] = [];
  const edges = getRectEdges(rect);

  // Collect all unique target points on the rect (corners + edge midpoints)
  const targetPoints: Position[] = [];
  for (const edge of edges) {
    targetPoints.push(edge.start);
    targetPoints.push({
      x: (edge.start.x + edge.end.x) / 2,
      y: (edge.start.y + edge.end.y) / 2,
    });
  }

  // For each target point, generate a ray from the circle boundary
  for (const target of targetPoints) {
    const dirToTarget = vec2Sub(target, circle.center);
    const dist = vec2Length(dirToTarget);
    if (dist < EPSILON) continue;

    const dir = vec2Scale(dirToTarget, 1 / dist);
    const start = vec2Add(circle.center, vec2Scale(dir, circle.radius));
    results.push({ start, end: target });
  }

  // Also add rays from circle tangent points perpendicular to the center-to-rect direction
  const toRect = vec2Sub(rect.center, circle.center);
  const toRectDist = vec2Length(toRect);
  if (toRectDist > EPSILON) {
    const dir = vec2Scale(toRect, 1 / toRectDist);
    const perp = vec2Perpendicular(dir);

    // Tangent points on circle
    const tangent1 = vec2Add(circle.center, vec2Scale(perp, circle.radius));
    const tangent2 = vec2Sub(circle.center, vec2Scale(perp, circle.radius));

    // Project to closest points on rect edges
    for (const tangentPoint of [tangent1, tangent2]) {
      let closestDist = Infinity;
      let closestPoint = rect.center;
      for (const edge of edges) {
        const cp = closestPointOnSegment(tangentPoint, edge.start, edge.end);
        const d = vec2DistanceSq(tangentPoint, cp);
        if (d < closestDist) {
          closestDist = d;
          closestPoint = cp;
        }
      }
      results.push({ start: tangentPoint, end: closestPoint });
    }
  }

  return results;
}

/**
 * Generate LOS rays between two rectangular hulls.
 * Rays connect corners and edge midpoints between the two rectangles.
 *
 * @param a - First rectangle
 * @param b - Second rectangle
 * @returns Array of ray segments for LOS checking
 */
export function rectToRectRays(a: RectHull, b: RectHull): Segment[] {
  const results: Segment[] = [];
  const edgesA = getRectEdges(a);
  const edgesB = getRectEdges(b);

  // Collect points on each rect
  const pointsA: Position[] = [];
  const pointsB: Position[] = [];

  for (const edge of edgesA) {
    pointsA.push(edge.start);
    pointsA.push({ x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 });
  }
  for (const edge of edgesB) {
    pointsB.push(edge.start);
    pointsB.push({ x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 });
  }

  // Connect each point on A to each point on B
  for (const pa of pointsA) {
    for (const pb of pointsB) {
      results.push({ start: pa, end: pb });
    }
  }

  // Also add center-to-center ray
  results.push({ start: a.center, end: b.center });

  return results;
}

// ─── Chord Length Through Polygon ────────────────────────────────────────────

/**
 * Calculate the total chord length of a segment passing through a polygon.
 * A segment may enter and exit a polygon multiple times (e.g., concave polygon),
 * so this sums all interior chord segments.
 *
 * @param segStart - Start of the segment
 * @param segEnd - End of the segment
 * @param vertices - Polygon vertices (closed: last connects to first)
 * @returns Total length of the segment that is inside the polygon (in inches)
 */
export function chordLengthThroughPolygon(
  segStart: Position,
  segEnd: Position,
  vertices: Position[],
): number {
  // Find all intersection points with the polygon boundary
  const intersections = segmentPolygonIntersection(segStart, segEnd, vertices);

  if (intersections.length === 0) {
    // Segment may be entirely inside or entirely outside
    if (pointInPolygon(segStart, vertices)) {
      return vec2Distance(segStart, segEnd);
    }
    return 0;
  }

  // Also include segStart/segEnd if they're inside the polygon
  const allPoints: { point: Position; t: number }[] = [];

  const segDir = vec2Sub(segEnd, segStart);
  const segLenSq = vec2LengthSq(segDir);

  // Parametrize each point along the segment
  for (const p of intersections) {
    const t = segLenSq > EPSILON * EPSILON
      ? vec2Dot(vec2Sub(p, segStart), segDir) / segLenSq
      : 0;
    allPoints.push({ point: p, t });
  }

  // Add start and end if inside
  const startInside = pointInPolygon(segStart, vertices);
  const endInside = pointInPolygon(segEnd, vertices);

  if (startInside) {
    allPoints.push({ point: segStart, t: 0 });
  }
  if (endInside) {
    allPoints.push({ point: segEnd, t: 1 });
  }

  // Sort by parameter t
  allPoints.sort((a, b) => a.t - b.t);

  // Remove duplicates (same t value)
  const uniquePoints: { point: Position; t: number }[] = [];
  for (const p of allPoints) {
    if (uniquePoints.length === 0 || Math.abs(p.t - uniquePoints[uniquePoints.length - 1].t) > EPSILON) {
      uniquePoints.push(p);
    }
  }

  // Sum chord lengths: inside segments are between pairs of consecutive points
  // The segment enters/exits the polygon alternately at intersection points.
  // We use the midpoint test to determine if a segment between consecutive points is inside.
  let totalChord = 0;
  for (let i = 0; i < uniquePoints.length - 1; i++) {
    const midT = (uniquePoints[i].t + uniquePoints[i + 1].t) / 2;
    const midPoint = vec2Add(segStart, vec2Scale(segDir, midT));
    if (pointInPolygon(midPoint, vertices)) {
      totalChord += vec2Distance(uniquePoints[i].point, uniquePoints[i + 1].point);
    }
  }

  return totalChord;
}

/**
 * Calculate the chord length of a segment passing through a circle.
 *
 * @param segStart - Start of the segment
 * @param segEnd - End of the segment
 * @param circle - The circle to check
 * @returns Length of the segment that is inside the circle (in inches)
 */
export function chordLengthThroughCircle(
  segStart: Position,
  segEnd: Position,
  circle: CircleBase,
): number {
  const intersections = segmentCircleIntersection(segStart, segEnd, circle);

  const startInside = vec2DistanceSq(segStart, circle.center) <= (circle.radius + EPSILON) * (circle.radius + EPSILON);
  const endInside = vec2DistanceSq(segEnd, circle.center) <= (circle.radius + EPSILON) * (circle.radius + EPSILON);

  if (intersections.length === 0) {
    if (startInside && endInside) {
      return vec2Distance(segStart, segEnd);
    }
    return 0;
  }

  if (intersections.length === 1) {
    // Segment is tangent or partially inside
    const hit = intersections[0];
    if (startInside) {
      return vec2Distance(segStart, hit);
    }
    if (endInside) {
      return vec2Distance(hit, segEnd);
    }
    return 0; // Tangent — zero chord length
  }

  // Two intersections — chord is between them
  return vec2Distance(intersections[0], intersections[1]);
}

// ─── Point in Polygon ────────────────────────────────────────────────────────

/**
 * Test if a point is inside a polygon using the ray-casting algorithm.
 * The polygon is defined as an array of vertices forming a closed shape.
 *
 * @param point - The point to test
 * @param vertices - Polygon vertices (closed: last connects to first)
 * @returns True if the point is inside the polygon
 */
export function pointInPolygon(point: Position, vertices: Position[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];

    if (
      (vi.y > point.y) !== (vj.y > point.y) &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Test if a point is inside a circle.
 *
 * @param point - The point to test
 * @param center - Circle center
 * @param radius - Circle radius
 * @returns True if the point is inside or on the boundary of the circle
 */
export function pointInCircle(point: Position, center: Position, radius: number): boolean {
  return vec2DistanceSq(point, center) <= (radius + EPSILON) * (radius + EPSILON);
}

/**
 * Test if a point is inside an axis-aligned rectangle.
 *
 * @param point - The point to test
 * @param topLeft - Rectangle top-left corner
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @returns True if the point is inside or on the boundary
 */
export function pointInRect(point: Position, topLeft: Position, width: number, height: number): boolean {
  return (
    point.x >= topLeft.x - EPSILON &&
    point.x <= topLeft.x + width + EPSILON &&
    point.y >= topLeft.y - EPSILON &&
    point.y <= topLeft.y + height + EPSILON
  );
}

// ─── Segment Intersects Shape ────────────────────────────────────────────────

/**
 * Test if a segment intersects a rectangular hull.
 * Returns true if the segment crosses the rectangle boundary or is inside it.
 *
 * @param segStart - Start of segment
 * @param segEnd - End of segment
 * @param rect - The rectangular hull
 * @returns True if the segment intersects the rectangle
 */
export function segmentIntersectsRect(segStart: Position, segEnd: Position, rect: RectHull): boolean {
  return segmentRectIntersection(segStart, segEnd, rect).length > 0;
}
