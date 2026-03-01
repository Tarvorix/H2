/**
 * Coherency Overlay
 * Renders coherency state for a player's unit:
 * - Green rings around coherent models, red rings around incoherent models
 * - Green adjacency link lines between models within coherency range
 */

import { TWO_PI } from '@hh/geometry';
import type { CoherencyResult, ModelShape } from '@hh/geometry';
import { COHERENCY_OK, COHERENCY_FAIL, COHERENCY_LINK } from '../styles/colors';

function getShapeCenter(shape: ModelShape): { x: number; y: number } {
  return shape.center;
}

function getShapeRadius(shape: ModelShape): number {
  if (shape.kind === 'circle') {
    return shape.radius;
  }
  return Math.max(shape.width, shape.height) / 2;
}

export function renderCoherency(
  ctx: CanvasRenderingContext2D,
  result: CoherencyResult,
  shapes: ModelShape[],
  zoom: number,
): void {
  if (shapes.length < 2) return;

  const lineWidth = 1 / zoom;
  const ringPad = 1.5 / zoom;

  // Draw adjacency links
  ctx.strokeStyle = COHERENCY_LINK;
  ctx.lineWidth = lineWidth * 2;
  for (const [i, j] of result.links) {
    if (i >= shapes.length || j >= shapes.length) continue;
    const a = getShapeCenter(shapes[i]);
    const b = getShapeCenter(shapes[j]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Draw coherency rings
  const coherentSet = new Set(result.coherentModelIndices);

  for (let i = 0; i < shapes.length; i++) {
    const center = getShapeCenter(shapes[i]);
    const radius = getShapeRadius(shapes[i]) + ringPad;
    const isCoherent = coherentSet.has(i);

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, TWO_PI);
    ctx.strokeStyle = isCoherent ? COHERENCY_OK : COHERENCY_FAIL;
    ctx.lineWidth = lineWidth * 1.5;
    ctx.setLineDash(isCoherent ? [] : [3 / zoom, 3 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Status label at the center of the unit
  if (shapes.length > 0) {
    let cx = 0, cy = 0;
    for (const shape of shapes) {
      const c = getShapeCenter(shape);
      cx += c.x;
      cy += c.y;
    }
    cx /= shapes.length;
    cy /= shapes.length;

    // Find the topmost model to place label above
    let minY = Infinity;
    for (const shape of shapes) {
      const c = getShapeCenter(shape);
      const r = getShapeRadius(shape);
      if (c.y - r < minY) minY = c.y - r;
    }

    const fontSize = Math.min(0.8, 12 / zoom);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = result.isCoherent ? COHERENCY_OK : COHERENCY_FAIL;
    ctx.fillText(
      result.isCoherent ? 'COHERENT' : 'INCOHERENT',
      cx,
      minY - 0.5,
    );

    // Sub-label with count
    ctx.font = `${fontSize * 0.7}px monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(
      `${result.coherentModelIndices.length}/${shapes.length} linked`,
      cx,
      minY - 0.5 + fontSize * 0.8,
    );
  }
}
