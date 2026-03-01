/**
 * Terrain Geometry Operations
 * Reference: HH_Principles.md — "Terrain"
 *
 * Terrain-specific containment tests and chord length calculations.
 * Uses the TerrainShape and TerrainPiece types from @hh/types.
 */

import type { Position, TerrainPiece, TerrainShape } from '@hh/types';
import {
  pointInPolygon,
  pointInCircle,
  pointInRect,
  chordLengthThroughPolygon,
  chordLengthThroughCircle,
} from './intersection';
import type { ModelShape } from './shapes';

// ─── Point-in-TerrainShape ───────────────────────────────────────────────────

/**
 * Test if a point is inside a terrain shape.
 * Dispatches based on the TerrainShape discriminated union (polygon, circle, rectangle).
 *
 * @param point - The point to test
 * @param shape - The terrain shape
 * @returns True if the point is inside the terrain shape
 */
export function pointInTerrainShape(point: Position, shape: TerrainShape): boolean {
  switch (shape.kind) {
    case 'polygon':
      return pointInPolygon(point, shape.vertices);
    case 'circle':
      return pointInCircle(point, shape.center, shape.radius);
    case 'rectangle':
      return pointInRect(point, shape.topLeft, shape.width, shape.height);
  }
}

/**
 * Test if a point is inside a terrain piece.
 *
 * @param point - The point to test
 * @param terrain - The terrain piece
 * @returns True if the point is inside the terrain piece
 */
export function pointInTerrain(point: Position, terrain: TerrainPiece): boolean {
  return pointInTerrainShape(point, terrain.shape);
}

// ─── Model-in-Terrain ────────────────────────────────────────────────────────

/**
 * Test if a model's center is inside a terrain piece.
 * A model is considered "in" terrain if its center point is inside the terrain boundary.
 *
 * @param model - The model shape
 * @param terrain - The terrain piece
 * @returns True if the model's center is in the terrain
 */
export function modelInTerrain(model: ModelShape, terrain: TerrainPiece): boolean {
  const center = model.kind === 'circle' ? model.center : model.center;
  return pointInTerrainShape(center, terrain.shape);
}

// ─── Get Terrain at Point ────────────────────────────────────────────────────

/**
 * Find all terrain pieces that contain a given point.
 *
 * @param point - The point to query
 * @param terrainPieces - All terrain pieces on the battlefield
 * @returns Array of terrain pieces containing the point
 */
export function getTerrainAtPoint(point: Position, terrainPieces: TerrainPiece[]): TerrainPiece[] {
  return terrainPieces.filter(t => pointInTerrainShape(point, t.shape));
}

// ─── Terrain Chord Length ────────────────────────────────────────────────────

/**
 * Compute the chord length of a ray passing through a terrain piece.
 * This is critical for Medium Area Terrain LOS blocking (>3" chord blocks LOS).
 *
 * @param segStart - Start of the ray segment
 * @param segEnd - End of the ray segment
 * @param terrain - The terrain piece
 * @returns Length of the ray inside the terrain (in inches)
 */
export function terrainChordLength(segStart: Position, segEnd: Position, terrain: TerrainPiece): number {
  switch (terrain.shape.kind) {
    case 'polygon':
      return chordLengthThroughPolygon(segStart, segEnd, terrain.shape.vertices);
    case 'circle':
      return chordLengthThroughCircle(
        segStart,
        segEnd,
        { kind: 'circle', center: terrain.shape.center, radius: terrain.shape.radius },
      );
    case 'rectangle': {
      // Convert rectangle to polygon vertices for chord calculation
      const { topLeft, width, height } = terrain.shape;
      const vertices: Position[] = [
        topLeft,
        { x: topLeft.x + width, y: topLeft.y },
        { x: topLeft.x + width, y: topLeft.y + height },
        { x: topLeft.x, y: topLeft.y + height },
      ];
      return chordLengthThroughPolygon(segStart, segEnd, vertices);
    }
  }
}

// ─── Get Terrain Vertices ────────────────────────────────────────────────────

/**
 * Get the polygon vertices representing a terrain shape's boundary.
 * Circles are approximated with a 32-sided polygon.
 * Rectangles are converted to 4 vertices.
 *
 * @param shape - The terrain shape
 * @returns Array of vertices forming the terrain boundary
 */
export function getTerrainVertices(shape: TerrainShape): Position[] {
  switch (shape.kind) {
    case 'polygon':
      return shape.vertices;
    case 'circle': {
      const sides = 32;
      const vertices: Position[] = [];
      for (let i = 0; i < sides; i++) {
        const angle = (2 * Math.PI * i) / sides;
        vertices.push({
          x: shape.center.x + shape.radius * Math.cos(angle),
          y: shape.center.y + shape.radius * Math.sin(angle),
        });
      }
      return vertices;
    }
    case 'rectangle': {
      const { topLeft, width, height } = shape;
      return [
        topLeft,
        { x: topLeft.x + width, y: topLeft.y },
        { x: topLeft.x + width, y: topLeft.y + height },
        { x: topLeft.x, y: topLeft.y + height },
      ];
    }
  }
}
