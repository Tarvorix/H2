/**
 * Movement Destination Helpers
 *
 * Calculates movement destinations for AI-controlled models.
 * Handles random movement, directional movement, and coherency-aware spreading.
 */

import type { Position } from '@hh/types';

// ─── Battlefield Bounds ──────────────────────────────────────────────────────

/** Minimum distance from battlefield edge for placement */
const EDGE_MARGIN = 0.5;

/** Default coherency spacing between models (inches) */
const COHERENCY_SPACING = 1.5;

/**
 * Clamp a position to within the battlefield boundaries.
 */
export function clampToBattlefield(
  pos: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position {
  return {
    x: Math.max(EDGE_MARGIN, Math.min(battlefieldWidth - EDGE_MARGIN, pos.x)),
    y: Math.max(EDGE_MARGIN, Math.min(battlefieldHeight - EDGE_MARGIN, pos.y)),
  };
}

// ─── Distance Utilities ──────────────────────────────────────────────────────

/**
 * Calculate the distance between two positions.
 */
export function distanceBetween(a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize a direction vector to unit length.
 */
function normalize(dx: number, dy: number): { dx: number; dy: number } {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { dx: 0, dy: 0 };
  return { dx: dx / len, dy: dy / len };
}

// ─── Random Movement ─────────────────────────────────────────────────────────

/**
 * Calculate a random movement destination within maxDistance of the current position.
 * Uses a seeded-ish approach based on model position for reproducibility in tests.
 */
export function calculateRandomMovePosition(
  currentPos: Position,
  maxDistance: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position {
  // Pick a random angle and distance
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.random() * maxDistance;

  const target: Position = {
    x: currentPos.x + Math.cos(angle) * dist,
    y: currentPos.y + Math.sin(angle) * dist,
  };

  return clampToBattlefield(target, battlefieldWidth, battlefieldHeight);
}

// ─── Directional Movement ────────────────────────────────────────────────────

/**
 * Calculate a movement destination toward a target position, limited by maxDistance.
 */
export function calculateDirectionalMovePosition(
  currentPos: Position,
  targetPos: Position,
  maxDistance: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position {
  const dx = targetPos.x - currentPos.x;
  const dy = targetPos.y - currentPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Already at or past the target
  if (dist <= maxDistance) {
    return clampToBattlefield(targetPos, battlefieldWidth, battlefieldHeight);
  }

  // Move maxDistance toward the target
  const norm = normalize(dx, dy);
  const destination: Position = {
    x: currentPos.x + norm.dx * maxDistance,
    y: currentPos.y + norm.dy * maxDistance,
  };

  return clampToBattlefield(destination, battlefieldWidth, battlefieldHeight);
}

// ─── Formation Spreading ─────────────────────────────────────────────────────

/**
 * Spread models around a centroid position, maintaining coherency spacing.
 * Models are arranged in a grid pattern around the centroid.
 *
 * @param centroid - Center point to spread around
 * @param modelCount - Number of models to position
 * @param maxDistance - Maximum distance any model can be from the centroid
 * @param battlefieldWidth - Battlefield width in inches
 * @param battlefieldHeight - Battlefield height in inches
 * @returns Array of positions, one per model
 */
export function spreadModelsAroundCentroid(
  centroid: Position,
  modelCount: number,
  maxDistance: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position[] {
  if (modelCount === 0) return [];
  if (modelCount === 1) {
    return [clampToBattlefield(centroid, battlefieldWidth, battlefieldHeight)];
  }

  const positions: Position[] = [];
  const cols = Math.ceil(Math.sqrt(modelCount));
  const rows = Math.ceil(modelCount / cols);

  // Calculate grid dimensions — limit by maxDistance
  const gridWidth = Math.min((cols - 1) * COHERENCY_SPACING, maxDistance * 2);
  const gridHeight = Math.min((rows - 1) * COHERENCY_SPACING, maxDistance * 2);

  const startX = centroid.x - gridWidth / 2;
  const startY = centroid.y - gridHeight / 2;

  const colSpacing = cols > 1 ? gridWidth / (cols - 1) : 0;
  const rowSpacing = rows > 1 ? gridHeight / (rows - 1) : 0;

  for (let i = 0; i < modelCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const pos: Position = {
      x: startX + col * colSpacing,
      y: startY + row * rowSpacing,
    };

    positions.push(clampToBattlefield(pos, battlefieldWidth, battlefieldHeight));
  }

  return positions;
}

// ─── Deployment Positioning ──────────────────────────────────────────────────

/**
 * Generate positions for deploying a unit in a line formation within a deployment zone.
 *
 * @param modelCount - Number of models to place
 * @param zoneMinY - Minimum y coordinate of the deployment zone
 * @param zoneMaxY - Maximum y coordinate of the deployment zone
 * @param battlefieldWidth - Battlefield width in inches
 * @param battlefieldHeight - Battlefield height in inches
 * @param preferredY - Where within the zone to place the line (0.0 = front, 1.0 = back)
 * @returns Array of positions, one per model
 */
export function generateLineFormation(
  modelCount: number,
  zoneMinY: number,
  zoneMaxY: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  preferredY: number = 0.5,
  spacingInches: number = COHERENCY_SPACING,
): Position[] {
  if (modelCount === 0) return [];

  // Calculate y position within the zone
  const zoneDepth = zoneMaxY - zoneMinY;
  const y = zoneMinY + zoneDepth * Math.max(0, Math.min(1, preferredY));

  // Spread models across the width with coherency spacing
  const totalWidth = (modelCount - 1) * spacingInches;
  const startX = Math.max(EDGE_MARGIN, (battlefieldWidth - totalWidth) / 2);

  const positions: Position[] = [];
  for (let i = 0; i < modelCount; i++) {
    const pos: Position = {
      x: startX + i * spacingInches,
      y,
    };
    positions.push(clampToBattlefield(pos, battlefieldWidth, battlefieldHeight));
  }

  return positions;
}
