/**
 * Model Shape Representations
 * Reference: HH_Principles.md — "Measuring" (base-to-base measurement)
 *
 * Internal geometry representations for models on the battlefield.
 * Infantry/cavalry use circular bases (25mm, 32mm, 40mm, 60mm).
 * Vehicles use rectangular hulls with a rotation angle.
 */

import type { Position } from '@hh/types';
import { EPSILON, MM_TO_INCHES } from './constants';
import {
  vec2Sub,
  vec2Add,
  vec2Scale,
  vec2Rotate,
  vec2Length,
  clamp,
} from './vec2';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A circular base representing an infantry/cavalry/character model.
 * The base is defined by its center position and radius (in inches).
 */
export interface CircleBase {
  readonly kind: 'circle';
  /** Center position in inches */
  readonly center: Position;
  /** Radius in inches (converted from mm) */
  readonly radius: number;
}

/**
 * A rectangular hull representing a vehicle model.
 * The hull is defined by its center position, width, height, and rotation angle.
 * Width is measured along the vehicle's facing direction.
 * Height is measured perpendicular to the facing direction.
 */
export interface RectHull {
  readonly kind: 'rect';
  /** Center position in inches */
  readonly center: Position;
  /** Width along the facing direction in inches */
  readonly width: number;
  /** Height perpendicular to the facing direction in inches */
  readonly height: number;
  /** Rotation in radians. 0 = facing right (+x). PI/2 = facing up (+y). */
  readonly rotation: number;
}

/**
 * A model's physical shape on the battlefield.
 * Discriminated union of circle (infantry) and rect (vehicle).
 */
export type ModelShape = CircleBase | RectHull;

/**
 * A line segment defined by two endpoints.
 */
export interface Segment {
  readonly start: Position;
  readonly end: Position;
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a circular base from a center position and base size in millimetres.
 * Converts the mm diameter to inches radius.
 *
 * @param center - Center position in inches
 * @param baseSizeMM - Base diameter in millimetres (e.g., 32 for 32mm base)
 * @returns CircleBase with correct radius in inches
 *
 * @example
 * // 32mm base at position (10, 20)
 * const base = createCircleBase({ x: 10, y: 20 }, 32);
 * // base.radius ≈ 0.6299 inches
 */
export function createCircleBase(center: Position, baseSizeMM: number): CircleBase {
  const radiusInches = (baseSizeMM * MM_TO_INCHES) / 2;
  return {
    kind: 'circle',
    center,
    radius: radiusInches,
  };
}

/**
 * Create a circular base from a center position and radius already in inches.
 *
 * @param center - Center position in inches
 * @param radiusInches - Radius in inches
 * @returns CircleBase
 */
export function createCircleBaseInches(center: Position, radiusInches: number): CircleBase {
  return {
    kind: 'circle',
    center,
    radius: radiusInches,
  };
}

/**
 * Create a rectangular vehicle hull.
 *
 * @param center - Center position in inches
 * @param width - Width along facing direction in inches
 * @param height - Height perpendicular to facing in inches
 * @param rotation - Rotation in radians (0 = facing right/+x)
 * @returns RectHull
 *
 * @example
 * // A Rhino hull roughly 2.5" wide x 4.5" long, facing up
 * const rhino = createRectHull({ x: 24, y: 12 }, 4.5, 2.5, Math.PI / 2);
 */
export function createRectHull(center: Position, width: number, height: number, rotation: number): RectHull {
  return {
    kind: 'rect',
    center,
    width,
    height,
    rotation,
  };
}

// ─── Rectangle Corner & Edge Geometry ────────────────────────────────────────

/**
 * Get the 4 corners of a rectangular hull in world coordinates,
 * accounting for the hull's rotation.
 *
 * Corners are returned in order: front-left, front-right, rear-right, rear-left
 * (relative to the vehicle's facing direction).
 *
 * @param hull - The rectangular hull
 * @returns Array of 4 corner positions [FL, FR, RR, RL]
 */
export function getRectCorners(hull: RectHull): [Position, Position, Position, Position] {
  const hw = hull.width / 2;
  const hh = hull.height / 2;

  // Local-space corners (before rotation): front-left, front-right, rear-right, rear-left
  // Width is along the facing direction (x-axis in local space)
  const localCorners: [Position, Position, Position, Position] = [
    { x: hw, y: hh },    // front-left
    { x: hw, y: -hh },   // front-right
    { x: -hw, y: -hh },  // rear-right
    { x: -hw, y: hh },   // rear-left
  ];

  // Rotate and translate each corner to world space
  return localCorners.map(corner => {
    const rotated = vec2Rotate(corner, hull.rotation);
    return vec2Add(rotated, hull.center);
  }) as [Position, Position, Position, Position];
}

/**
 * Get the 4 edges of a rectangular hull as line segments.
 * Edges are: front, right, rear, left (relative to facing direction).
 *
 * @param hull - The rectangular hull
 * @returns Array of 4 edge segments [front, right, rear, left]
 */
export function getRectEdges(hull: RectHull): [Segment, Segment, Segment, Segment] {
  const [fl, fr, rr, rl] = getRectCorners(hull);
  return [
    { start: fl, end: fr },   // front edge
    { start: fr, end: rr },   // right edge
    { start: rr, end: rl },   // rear edge
    { start: rl, end: fl },   // left edge
  ];
}

// ─── Closest Point Functions ─────────────────────────────────────────────────

/**
 * Find the closest point on a circle's boundary to an external point.
 * If the point is at the circle's center, returns a point on the boundary
 * in the +x direction (arbitrary but deterministic).
 *
 * @param circle - The circle
 * @param point - External point
 * @returns Closest point on the circle's boundary
 */
export function closestPointOnCircle(circle: CircleBase, point: Position): Position {
  const dir = vec2Sub(point, circle.center);
  const len = vec2Length(dir);
  if (len < EPSILON) {
    // Point is at circle center — return arbitrary boundary point
    return { x: circle.center.x + circle.radius, y: circle.center.y };
  }
  const normalized = vec2Scale(dir, 1 / len);
  return vec2Add(circle.center, vec2Scale(normalized, circle.radius));
}

/**
 * Find the closest point on a rotated rectangle's boundary to an external point.
 * This works by transforming the point into the rectangle's local coordinate system,
 * clamping to the rectangle's bounds, then transforming back.
 *
 * @param rect - The rectangle hull
 * @param point - External point
 * @returns Closest point on the rectangle's boundary
 */
export function closestPointOnRect(rect: RectHull, point: Position): Position {
  // Transform point to local space (un-rotate relative to rect center)
  const toLocal = vec2Sub(point, rect.center);
  const localPoint = vec2Rotate(toLocal, -rect.rotation);

  const hw = rect.width / 2;
  const hh = rect.height / 2;

  // Check if point is inside the rectangle
  const insideX = localPoint.x >= -hw && localPoint.x <= hw;
  const insideY = localPoint.y >= -hh && localPoint.y <= hh;

  let closestLocal: Position;

  if (insideX && insideY) {
    // Point is inside — find closest edge
    const distToLeft = localPoint.x + hw;
    const distToRight = hw - localPoint.x;
    const distToBottom = localPoint.y + hh;
    const distToTop = hh - localPoint.y;
    const minDist = Math.min(distToLeft, distToRight, distToBottom, distToTop);

    if (minDist === distToLeft) {
      closestLocal = { x: -hw, y: localPoint.y };
    } else if (minDist === distToRight) {
      closestLocal = { x: hw, y: localPoint.y };
    } else if (minDist === distToBottom) {
      closestLocal = { x: localPoint.x, y: -hh };
    } else {
      closestLocal = { x: localPoint.x, y: hh };
    }
  } else {
    // Point is outside — clamp to rectangle bounds
    closestLocal = {
      x: clamp(localPoint.x, -hw, hw),
      y: clamp(localPoint.y, -hh, hh),
    };
  }

  // Transform back to world space
  const rotatedBack = vec2Rotate(closestLocal, rect.rotation);
  return vec2Add(rotatedBack, rect.center);
}

/**
 * Find the closest point on a model shape's boundary to an external point.
 * Dispatches to the appropriate function based on shape kind.
 *
 * @param shape - The model shape
 * @param point - External point
 * @returns Closest point on the shape's boundary
 */
export function closestPointOnShape(shape: ModelShape, point: Position): Position {
  switch (shape.kind) {
    case 'circle':
      return closestPointOnCircle(shape, point);
    case 'rect':
      return closestPointOnRect(shape, point);
  }
}

// ─── Bounding Box ────────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box.
 */
export interface AABB {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Get the axis-aligned bounding box of a model shape.
 *
 * @param shape - The model shape
 * @returns AABB enclosing the shape
 */
export function getShapeBounds(shape: ModelShape): AABB {
  switch (shape.kind) {
    case 'circle':
      return {
        x: shape.center.x - shape.radius,
        y: shape.center.y - shape.radius,
        width: shape.radius * 2,
        height: shape.radius * 2,
      };
    case 'rect': {
      const corners = getRectCorners(shape);
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      for (const c of corners) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
  }
}

/**
 * Check if a point is inside an AABB.
 *
 * @param point - The point to check
 * @param aabb - The bounding box
 * @returns True if the point is inside the AABB
 */
export function pointInAABB(point: Position, aabb: AABB): boolean {
  return (
    point.x >= aabb.x &&
    point.x <= aabb.x + aabb.width &&
    point.y >= aabb.y &&
    point.y <= aabb.y + aabb.height
  );
}

/**
 * Check if two AABBs overlap.
 *
 * @param a - First bounding box
 * @param b - Second bounding box
 * @returns True if the AABBs overlap
 */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// ─── Point Inside Shape ──────────────────────────────────────────────────────

/**
 * Check if a point is inside a circular base (including boundary).
 *
 * @param point - The point to check
 * @param circle - The circle base
 * @returns True if the point is inside or on the boundary
 */
export function pointInCircleBase(point: Position, circle: CircleBase): boolean {
  const dx = point.x - circle.center.x;
  const dy = point.y - circle.center.y;
  return dx * dx + dy * dy <= (circle.radius + EPSILON) * (circle.radius + EPSILON);
}

/**
 * Check if a point is inside a rectangular hull (including boundary).
 * Accounts for hull rotation.
 *
 * @param point - The point to check
 * @param rect - The rectangle hull
 * @returns True if the point is inside or on the boundary
 */
export function pointInRectHull(point: Position, rect: RectHull): boolean {
  // Transform point to local space
  const toLocal = vec2Sub(point, rect.center);
  const localPoint = vec2Rotate(toLocal, -rect.rotation);

  const hw = rect.width / 2 + EPSILON;
  const hh = rect.height / 2 + EPSILON;

  return localPoint.x >= -hw && localPoint.x <= hw && localPoint.y >= -hh && localPoint.y <= hh;
}

/**
 * Check if a point is inside a model shape (including boundary).
 *
 * @param point - The point to check
 * @param shape - The model shape
 * @returns True if the point is inside or on the boundary
 */
export function pointInShape(point: Position, shape: ModelShape): boolean {
  switch (shape.kind) {
    case 'circle':
      return pointInCircleBase(point, shape);
    case 'rect':
      return pointInRectHull(point, shape);
  }
}
