/**
 * Blast Marker & Template Weapon Overlap
 * Reference: HH_Principles.md — "Blast Markers", "Templates"
 *
 * Blast markers are circular (3", 5", 7" diameter).
 * Templates are teardrop-shaped (flame weapons).
 * All models whose bases are touched by the marker/template are hit.
 * Scatter mechanic displaces blast markers randomly.
 */

import type { Position } from '@hh/types';
import {
  EPSILON,
  TEMPLATE_LENGTH,
  TEMPLATE_NARROW_WIDTH,
  TEMPLATE_WIDE_WIDTH,
  TWO_PI,
} from './constants';
import {
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Distance,
  vec2DistanceSq,
  vec2Rotate,
  vec2Perpendicular,
  vec2Dot,
  vec2Cross,
} from './vec2';
import type { ModelShape } from './shapes';
import { getRectCorners, closestPointOnRect } from './shapes';

// ─── Blast Marker Overlap ────────────────────────────────────────────────────

/**
 * Determine which models are hit by a circular blast marker.
 * A model is hit if any part of its base/hull touches the blast circle.
 *
 * Reference: HH_Principles.md — "Blast Markers"
 * "All models whose bases/hulls are touched by the blast marker are hit"
 *
 * @param center - Center of the blast marker (in inches)
 * @param radius - Radius of the blast marker (in inches)
 * @param models - Array of model shapes to test
 * @returns Array of indices of hit models
 */
export function blastOverlap(center: Position, radius: number, models: ModelShape[]): number[] {
  const hitIndices: number[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (isModelHitByBlast(center, radius, model)) {
      hitIndices.push(i);
    }
  }

  return hitIndices;
}

/**
 * Test if a single model is hit by a blast marker.
 *
 * @param blastCenter - Center of blast marker
 * @param blastRadius - Radius of blast marker
 * @param model - Model shape to test
 * @returns True if the model's base/hull is touched by the blast circle
 */
export function isModelHitByBlast(blastCenter: Position, blastRadius: number, model: ModelShape): boolean {
  switch (model.kind) {
    case 'circle': {
      // Circle-circle overlap: distance between centers <= sum of radii
      const dist = vec2Distance(blastCenter, model.center);
      return dist <= blastRadius + model.radius + EPSILON;
    }
    case 'rect': {
      // Circle-rect overlap: closest point on rect to blast center within blast radius
      const closest = closestPointOnRect(model, blastCenter);
      const dist = vec2Distance(blastCenter, closest);
      return dist <= blastRadius + EPSILON;
    }
  }
}

// ─── Template Weapon Overlap ─────────────────────────────────────────────────

/**
 * A teardrop template shape used by flame weapons.
 * Narrow end touches the attacking model's base.
 * Wide end extends over the target.
 */
export interface TemplateShape {
  /** Position of the narrow end (at attacker) */
  origin: Position;
  /** Direction the template points (radians, toward target) */
  direction: number;
  /** Length of the template in inches */
  length: number;
  /** Width at the narrow end in inches */
  narrowWidth: number;
  /** Width at the wide end in inches */
  wideWidth: number;
}

/**
 * Create a standard flame template.
 *
 * @param origin - Position of the narrow end (attacker's base edge)
 * @param direction - Direction toward target (radians)
 * @returns Template shape with standard dimensions
 */
export function createStandardTemplate(origin: Position, direction: number): TemplateShape {
  return {
    origin,
    direction,
    length: TEMPLATE_LENGTH,
    narrowWidth: TEMPLATE_NARROW_WIDTH,
    wideWidth: TEMPLATE_WIDE_WIDTH,
  };
}

/**
 * Get the polygon vertices of a template shape.
 * The template is approximated as a trapezoid (narrow end → wide end).
 *
 * @param template - The template shape
 * @returns Array of 4 vertices forming the template polygon
 */
export function getTemplateVertices(template: TemplateShape): Position[] {
  const dir = { x: Math.cos(template.direction), y: Math.sin(template.direction) };
  const perp = vec2Perpendicular(dir);

  const narrowHalf = template.narrowWidth / 2;
  const wideHalf = template.wideWidth / 2;

  // Narrow end (at attacker)
  const nearLeft = vec2Add(template.origin, vec2Scale(perp, narrowHalf));
  const nearRight = vec2Sub(template.origin, vec2Scale(perp, narrowHalf));

  // Wide end (toward target)
  const farCenter = vec2Add(template.origin, vec2Scale(dir, template.length));
  const farLeft = vec2Add(farCenter, vec2Scale(perp, wideHalf));
  const farRight = vec2Sub(farCenter, vec2Scale(perp, wideHalf));

  return [nearLeft, farLeft, farRight, nearRight];
}

/**
 * Determine which models are hit by a template weapon.
 * A model is hit if any part of its base/hull touches the template polygon.
 *
 * Reference: HH_Principles.md — "Templates"
 *
 * @param template - The template shape
 * @param models - Array of model shapes to test
 * @returns Array of indices of hit models
 */
export function templateOverlap(template: TemplateShape, models: ModelShape[]): number[] {
  const vertices = getTemplateVertices(template);
  const hitIndices: number[] = [];

  for (let i = 0; i < models.length; i++) {
    if (isModelHitByTemplate(vertices, models[i])) {
      hitIndices.push(i);
    }
  }

  return hitIndices;
}

/**
 * Test if a single model is hit by a template polygon.
 *
 * @param templateVertices - Template polygon vertices
 * @param model - Model shape to test
 * @returns True if the model is touched by the template
 */
function isModelHitByTemplate(templateVertices: Position[], model: ModelShape): boolean {
  switch (model.kind) {
    case 'circle':
      return circleOverlapsPolygon(model.center, model.radius, templateVertices);
    case 'rect': {
      // Check if any rect corner is inside the template
      const corners = getRectCorners(model);
      for (const corner of corners) {
        if (pointInConvexPolygon(corner, templateVertices)) {
          return true;
        }
      }
      // Check if any template vertex is inside the rect
      for (const vertex of templateVertices) {
        // Transform to rect local space and check bounds
        const local = vec2Rotate(vec2Sub(vertex, model.center), -model.rotation);
        if (
          Math.abs(local.x) <= model.width / 2 + EPSILON &&
          Math.abs(local.y) <= model.height / 2 + EPSILON
        ) {
          return true;
        }
      }
      return false;
    }
  }
}

/**
 * Test if a circle overlaps a convex polygon.
 * The circle overlaps if:
 * 1. The center is inside the polygon, OR
 * 2. Any polygon edge is within radius of the center
 *
 * @param center - Circle center
 * @param radius - Circle radius
 * @param vertices - Convex polygon vertices
 * @returns True if they overlap
 */
function circleOverlapsPolygon(center: Position, radius: number, vertices: Position[]): boolean {
  // Check if center is inside polygon
  if (pointInConvexPolygon(center, vertices)) {
    return true;
  }

  // Check distance from center to each edge
  const n = vertices.length;
  const radiusSq = (radius + EPSILON) * (radius + EPSILON);

  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const closest = closestPointOnEdge(center, a, b);
    if (vec2DistanceSq(center, closest) <= radiusSq) {
      return true;
    }
  }

  return false;
}

/**
 * Find closest point on a line segment (edge) to a point.
 * @internal
 */
function closestPointOnEdge(point: Position, a: Position, b: Position): Position {
  const ab = vec2Sub(b, a);
  const ap = vec2Sub(point, a);
  const lenSq = vec2Dot(ab, ab);
  if (lenSq < EPSILON * EPSILON) return a;
  const t = Math.max(0, Math.min(1, vec2Dot(ap, ab) / lenSq));
  return vec2Add(a, vec2Scale(ab, t));
}

/**
 * Point-in-convex-polygon test using cross product winding.
 * @internal
 */
function pointInConvexPolygon(point: Position, vertices: Position[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  let sign: number | null = null;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const cross = vec2Cross(vec2Sub(b, a), vec2Sub(point, a));
    if (Math.abs(cross) < EPSILON) continue; // on edge
    if (sign === null) {
      sign = cross > 0 ? 1 : -1;
    } else if ((cross > 0 ? 1 : -1) !== sign) {
      return false;
    }
  }
  return true;
}

// ─── Scatter Mechanic ────────────────────────────────────────────────────────

/**
 * Result of a scatter roll.
 */
export interface ScatterResult {
  /** Direction of scatter in radians (0 = right/+x, PI/2 = up/+y) */
  angle: number;
  /** Distance of scatter in inches */
  distance: number;
  /** Whether the scatter die showed "HIT" (no scatter) */
  isHit: boolean;
}

/**
 * Apply scatter to a blast marker position.
 * If the scatter die shows "HIT", the marker stays in place.
 * Otherwise, it moves in the scatter direction by the scatter distance.
 *
 * Reference: HH_Principles.md — "Scatter"
 *
 * @param originalCenter - Original blast marker center
 * @param scatter - Scatter roll result
 * @returns New blast marker center after scatter
 */
export function applyScatter(originalCenter: Position, scatter: ScatterResult): Position {
  if (scatter.isHit) {
    return originalCenter;
  }
  const offset: Position = {
    x: Math.cos(scatter.angle) * scatter.distance,
    y: Math.sin(scatter.angle) * scatter.distance,
  };
  return vec2Add(originalCenter, offset);
}

/**
 * Generate a random scatter result.
 * Scatter dice: 4 arrow faces (random direction), 2 HIT faces (1/3 chance of HIT).
 * Distance: d6 roll (1-6 inches).
 *
 * @returns Random scatter result
 */
export function randomScatter(): ScatterResult {
  const isHit = Math.random() < 1 / 3; // 2 out of 6 faces are HIT
  const angle = Math.random() * TWO_PI;
  const distance = Math.floor(Math.random() * 6) + 1; // d6: 1-6
  return { angle, distance, isHit };
}

// ─── Blast Size Helpers ──────────────────────────────────────────────────────

/**
 * Get the radius for a blast marker by its size name.
 * Blast marker sizes are diameters: 3" (Standard), 5" (Large), 7" (Massive).
 *
 * @param size - Blast size in inches (diameter: 3, 5, or 7)
 * @returns Radius in inches
 */
export function blastSizeToRadius(size: number): number {
  return size / 2;
}
