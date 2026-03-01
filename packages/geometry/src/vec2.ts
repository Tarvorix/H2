/**
 * 2D Vector Math Primitives
 * Reference: Pure math utilities — no game rule awareness.
 *
 * All operations use the Position type from @hh/types (x/y in inches).
 * Functions are pure (no mutation) and return new Position objects.
 */

import type { Position } from '@hh/types';
import { EPSILON } from './constants';

// ─── Basic Arithmetic ────────────────────────────────────────────────────────

/**
 * Add two vectors component-wise.
 * @param a - First vector
 * @param b - Second vector
 * @returns New vector (a.x + b.x, a.y + b.y)
 */
export function vec2Add(a: Position, b: Position): Position {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract vector b from vector a.
 * @param a - First vector
 * @param b - Vector to subtract
 * @returns New vector (a.x - b.x, a.y - b.y)
 */
export function vec2Sub(a: Position, b: Position): Position {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a vector by a scalar value.
 * @param v - Vector to scale
 * @param s - Scalar multiplier
 * @returns New vector (v.x * s, v.y * s)
 */
export function vec2Scale(v: Position, s: number): Position {
  return { x: v.x * s, y: v.y * s };
}

/**
 * Negate a vector (reverse direction).
 * @param v - Vector to negate
 * @returns New vector (-v.x, -v.y)
 */
export function vec2Negate(v: Position): Position {
  return { x: -v.x, y: -v.y };
}

// ─── Products ────────────────────────────────────────────────────────────────

/**
 * Dot product of two vectors.
 * @param a - First vector
 * @param b - Second vector
 * @returns Scalar dot product (a.x * b.x + a.y * b.y)
 */
export function vec2Dot(a: Position, b: Position): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * 2D cross product (z-component of the 3D cross product).
 * Positive result means b is counter-clockwise from a.
 * Negative result means b is clockwise from a.
 * Zero means vectors are parallel.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Scalar cross product (a.x * b.y - a.y * b.x)
 */
export function vec2Cross(a: Position, b: Position): number {
  return a.x * b.y - a.y * b.x;
}

// ─── Length & Distance ───────────────────────────────────────────────────────

/**
 * Squared length of a vector. Use this instead of vec2Length when
 * you only need to compare magnitudes (avoids sqrt).
 * @param v - Vector
 * @returns v.x^2 + v.y^2
 */
export function vec2LengthSq(v: Position): number {
  return v.x * v.x + v.y * v.y;
}

/**
 * Length (magnitude) of a vector.
 * @param v - Vector
 * @returns sqrt(v.x^2 + v.y^2)
 */
export function vec2Length(v: Position): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Squared distance between two points. Use this instead of vec2Distance
 * when you only need to compare distances (avoids sqrt).
 * @param a - First point
 * @param b - Second point
 * @returns (b.x - a.x)^2 + (b.y - a.y)^2
 */
export function vec2DistanceSq(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Euclidean distance between two points.
 * @param a - First point
 * @param b - Second point
 * @returns Distance in the same units as the input coordinates
 */
export function vec2Distance(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize a vector to unit length.
 * Returns the zero vector if the input has zero (or near-zero) length.
 * @param v - Vector to normalize
 * @returns Unit vector in the same direction, or {0, 0} if zero-length
 */
export function vec2Normalize(v: Position): Position {
  const len = vec2Length(v);
  if (len < EPSILON) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

// ─── Rotation & Perpendicular ────────────────────────────────────────────────

/**
 * Rotate a vector 90 degrees counter-clockwise (perpendicular).
 * @param v - Vector to rotate
 * @returns New vector perpendicular to v (rotated CCW)
 */
export function vec2Perpendicular(v: Position): Position {
  return { x: -v.y, y: v.x };
}

/**
 * Rotate a vector 90 degrees clockwise.
 * @param v - Vector to rotate
 * @returns New vector perpendicular to v (rotated CW)
 */
export function vec2PerpendicularCW(v: Position): Position {
  return { x: v.y, y: -v.x };
}

/**
 * Rotate a vector by an angle in radians.
 * @param v - Vector to rotate
 * @param angle - Angle in radians (positive = counter-clockwise)
 * @returns New rotated vector
 */
export function vec2Rotate(v: Position, angle: number): Position {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

// ─── Interpolation ───────────────────────────────────────────────────────────

/**
 * Linear interpolation between two points.
 * @param a - Start point (t=0)
 * @param b - End point (t=1)
 * @param t - Interpolation factor (0 to 1, but not clamped)
 * @returns Point at parameter t along the line from a to b
 */
export function vec2Lerp(a: Position, b: Position, t: number): Position {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

// ─── Angles ──────────────────────────────────────────────────────────────────

/**
 * Compute the angle from one point to another.
 * Returns the angle in radians, measured from the positive x-axis.
 * Range: (-PI, PI]
 *
 * @param from - Origin point
 * @param to - Target point
 * @returns Angle in radians
 */
export function vec2Angle(from: Position, to: Position): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Compute the angle of a vector from the positive x-axis.
 * Range: (-PI, PI]
 *
 * @param v - Vector
 * @returns Angle in radians
 */
export function vec2AngleOf(v: Position): number {
  return Math.atan2(v.y, v.x);
}

// ─── Comparison ──────────────────────────────────────────────────────────────

/**
 * Check if two vectors are approximately equal within a tolerance.
 * @param a - First vector
 * @param b - Second vector
 * @param epsilon - Tolerance (defaults to EPSILON)
 * @returns True if both components are within epsilon of each other
 */
export function vec2Equal(a: Position, b: Position, epsilon: number = EPSILON): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
}

/**
 * Check if a value is approximately zero within a tolerance.
 * @param value - Value to check
 * @param epsilon - Tolerance (defaults to EPSILON)
 * @returns True if the absolute value is less than epsilon
 */
export function approxZero(value: number, epsilon: number = EPSILON): boolean {
  return Math.abs(value) < epsilon;
}

/**
 * Check if two numbers are approximately equal within a tolerance.
 * @param a - First value
 * @param b - Second value
 * @param epsilon - Tolerance (defaults to EPSILON)
 * @returns True if the absolute difference is less than epsilon
 */
export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max.
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Project point onto a line segment and return the parameter t.
 * t=0 is at segStart, t=1 is at segEnd.
 * The returned value is NOT clamped to [0,1].
 *
 * @param point - Point to project
 * @param segStart - Segment start point
 * @param segEnd - Segment end point
 * @returns Parameter t along the segment
 */
export function projectPointOntoSegment(point: Position, segStart: Position, segEnd: Position): number {
  const seg = vec2Sub(segEnd, segStart);
  const lenSq = vec2LengthSq(seg);
  if (lenSq < EPSILON * EPSILON) {
    return 0; // Degenerate segment (zero length)
  }
  return vec2Dot(vec2Sub(point, segStart), seg) / lenSq;
}

/**
 * Find the closest point on a line segment to a given point.
 * @param point - Query point
 * @param segStart - Segment start point
 * @param segEnd - Segment end point
 * @returns The closest point on the segment
 */
export function closestPointOnSegment(point: Position, segStart: Position, segEnd: Position): Position {
  const t = clamp(projectPointOntoSegment(point, segStart, segEnd), 0, 1);
  return vec2Lerp(segStart, segEnd, t);
}
