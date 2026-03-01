/**
 * Movement Envelope Overlay
 * Renders the computed movement envelope with zone coloring:
 * - Blue fill for legal movement area
 * - Yellow for difficult terrain zones
 * - Orange for dangerous terrain zones
 * - Dark red for impassable zones
 * - Red circles for enemy exclusion zones
 */

import { TWO_PI, getTerrainVertices } from '@hh/geometry';
import type { MovementEnvelopeResult, ModelShape } from '@hh/geometry';
import type { TerrainPiece } from '@hh/types';
import {
  MOVEMENT_FILL,
  MOVEMENT_STROKE,
  MOVEMENT_DIFFICULT,
  MOVEMENT_DANGEROUS,
  MOVEMENT_IMPASSABLE,
  MOVEMENT_EXCLUSION,
} from '../styles/colors';

function drawTerrainZone(
  ctx: CanvasRenderingContext2D,
  terrain: TerrainPiece,
  fillColor: string,
): void {
  const vertices = getTerrainVertices(terrain.shape);
  if (vertices.length < 3) return;

  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();
}

export function renderMovementEnvelope(
  ctx: CanvasRenderingContext2D,
  envelope: MovementEnvelopeResult,
  _originShape: ModelShape,
  zoom: number,
): void {
  const { boundary, difficultZones, dangerousZones, impassableZones, exclusionZones } = envelope;

  // Draw the main envelope boundary
  if (boundary.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(boundary[0].x, boundary[0].y);
    for (let i = 1; i < boundary.length; i++) {
      ctx.lineTo(boundary[i].x, boundary[i].y);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = MOVEMENT_FILL;
    ctx.fill();

    // Stroke
    ctx.strokeStyle = MOVEMENT_STROKE;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 2 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw terrain zone overlays (clipped to envelope)
  ctx.save();
  if (boundary.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(boundary[0].x, boundary[0].y);
    for (let i = 1; i < boundary.length; i++) {
      ctx.lineTo(boundary[i].x, boundary[i].y);
    }
    ctx.closePath();
    ctx.clip();
  }

  // Difficult terrain zones
  for (const zone of difficultZones) {
    drawTerrainZone(ctx, zone, MOVEMENT_DIFFICULT);
  }

  // Dangerous terrain zones
  for (const zone of dangerousZones) {
    drawTerrainZone(ctx, zone, MOVEMENT_DANGEROUS);
  }

  // Impassable terrain zones
  for (const zone of impassableZones) {
    drawTerrainZone(ctx, zone, MOVEMENT_IMPASSABLE);
  }

  // Enemy exclusion zones
  for (const zone of exclusionZones) {
    ctx.beginPath();
    ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, TWO_PI);
    ctx.fillStyle = MOVEMENT_EXCLUSION;
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([2 / zoom, 2 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Label showing max movement distance
  if (boundary.length >= 3) {
    let cx = 0, cy = 0;
    for (const p of boundary) {
      cx += p.x;
      cy += p.y;
    }
    cx /= boundary.length;
    cy /= boundary.length;

    // Find the topmost point to place label above
    let minY = Infinity;
    for (const p of boundary) {
      if (p.y < minY) minY = p.y;
    }

    const fontSize = Math.min(0.6, 10 / zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = MOVEMENT_STROKE;
    ctx.fillText(`Move: ${envelope.maxDistance}"`, cx, minY - 0.3);
  }
}
