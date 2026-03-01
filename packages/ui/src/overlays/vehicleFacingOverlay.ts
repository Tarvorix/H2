/**
 * Vehicle Facing Overlay
 * Renders the front/side/rear armour arc boundaries and sector fills
 * for a selected vehicle hull.
 */

import { getRectCorners } from '@hh/geometry';
import type { RectHull } from '@hh/geometry';
import {
  FACING_FRONT,
  FACING_SIDE,
  FACING_REAR,
  FACING_BOUNDARY,
} from '../styles/colors';

export function renderVehicleFacing(
  ctx: CanvasRenderingContext2D,
  vehicle: RectHull,
  zoom: number,
): void {
  const { center } = vehicle;
  const corners = getRectCorners(vehicle);

  // Extend boundary lines beyond the hull for visibility
  const extensionLength = Math.max(vehicle.width, vehicle.height) * 1.5;

  // ── Sector fills ──────────────────────────────────────────────────────────
  // The four corners define the diagonal lines.
  // corners = [FL, FR, RR, RL]
  const [fl, fr, rr, rl] = corners;

  // Front sector: between FL and FR corners, extending forward
  drawSector(ctx, center, fl, fr, extensionLength, FACING_FRONT);

  // Rear sector: between RL and RR corners, extending rearward
  drawSector(ctx, center, rr, rl, extensionLength, FACING_REAR);

  // Side sectors (left): between FL and RL corners
  drawSector(ctx, center, rl, fl, extensionLength, FACING_SIDE);

  // Side sectors (right): between FR and RR corners
  drawSector(ctx, center, fr, rr, extensionLength, FACING_SIDE);

  // ── Boundary lines (diagonals) ─────────────────────────────────────────────
  ctx.strokeStyle = FACING_BOUNDARY;
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([3 / zoom, 2 / zoom]);

  for (const corner of corners) {
    const dx = corner.x - center.x;
    const dy = corner.y - center.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;
    const nx = dx / len;
    const ny = dy / len;

    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(
      center.x + nx * extensionLength,
      center.y + ny * extensionLength,
    );
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Sector labels ──────────────────────────────────────────────────────────
  const labelDist = extensionLength * 0.6;
  const fontSize = Math.min(0.6, 10 / zoom);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Front label
  const frontAngle = vehicle.rotation;
  ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
  ctx.fillText(
    'FRONT',
    center.x + Math.cos(frontAngle) * labelDist,
    center.y + Math.sin(frontAngle) * labelDist,
  );

  // Rear label
  const rearAngle = vehicle.rotation + Math.PI;
  ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
  ctx.fillText(
    'REAR',
    center.x + Math.cos(rearAngle) * labelDist,
    center.y + Math.sin(rearAngle) * labelDist,
  );

  // Side labels
  const sideAngle1 = vehicle.rotation + Math.PI / 2;
  const sideAngle2 = vehicle.rotation - Math.PI / 2;
  ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
  ctx.fillText(
    'SIDE',
    center.x + Math.cos(sideAngle1) * labelDist * 0.8,
    center.y + Math.sin(sideAngle1) * labelDist * 0.8,
  );
  ctx.fillText(
    'SIDE',
    center.x + Math.cos(sideAngle2) * labelDist * 0.8,
    center.y + Math.sin(sideAngle2) * labelDist * 0.8,
  );
}

function drawSector(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  corner1: { x: number; y: number },
  corner2: { x: number; y: number },
  extensionLength: number,
  fillColor: string,
): void {
  const dx1 = corner1.x - center.x;
  const dy1 = corner1.y - center.y;
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const dx2 = corner2.x - center.x;
  const dy2 = corner2.y - center.y;
  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

  if (len1 < 0.001 || len2 < 0.001) return;

  const ext1 = {
    x: center.x + (dx1 / len1) * extensionLength,
    y: center.y + (dy1 / len1) * extensionLength,
  };
  const ext2 = {
    x: center.x + (dx2 / len2) * extensionLength,
    y: center.y + (dy2 / len2) * extensionLength,
  };

  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(ext1.x, ext1.y);
  ctx.lineTo(ext2.x, ext2.y);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
}
