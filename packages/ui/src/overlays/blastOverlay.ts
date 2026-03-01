/**
 * Blast & Template Overlay
 * Renders blast markers (circles) and template weapons (trapezoids).
 * Hit models are highlighted with a golden ring.
 */

import type { Position } from '@hh/types';
import { TWO_PI, getTemplateVertices } from '@hh/geometry';
import type { ModelShape, TemplateShape } from '@hh/geometry';
import {
  BLAST_FILL,
  BLAST_STROKE,
  BLAST_HIT_HIGHLIGHT,
  TEMPLATE_FILL,
  TEMPLATE_STROKE,
} from '../styles/colors';

export function renderBlast(
  ctx: CanvasRenderingContext2D,
  center: Position,
  radius: number,
  hitIndices: number[],
  allShapes: ModelShape[],
  zoom: number,
  template?: TemplateShape,
): void {
  const lineWidth = 1.5 / zoom;

  if (template) {
    // ── Template rendering ──────────────────────────────────────────────────
    const verts = getTemplateVertices(template);
    if (verts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i].x, verts[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = TEMPLATE_FILL;
      ctx.fill();
      ctx.strokeStyle = TEMPLATE_STROKE;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // Origin marker
    ctx.beginPath();
    ctx.arc(template.origin.x, template.origin.y, 2 / zoom, 0, TWO_PI);
    ctx.fillStyle = TEMPLATE_STROKE;
    ctx.fill();
  } else {
    // ── Blast marker rendering ──────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, TWO_PI);
    ctx.fillStyle = BLAST_FILL;
    ctx.fill();
    ctx.strokeStyle = BLAST_STROKE;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Center crosshair
    const crossSize = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(center.x - crossSize, center.y);
    ctx.lineTo(center.x + crossSize, center.y);
    ctx.moveTo(center.x, center.y - crossSize);
    ctx.lineTo(center.x, center.y + crossSize);
    ctx.strokeStyle = BLAST_STROKE;
    ctx.lineWidth = 0.8 / zoom;
    ctx.stroke();

    // Diameter label
    const diameter = radius * 2;
    const fontSize = Math.min(0.6, 10 / zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = BLAST_STROKE;
    ctx.fillText(`${diameter.toFixed(0)}"`, center.x, center.y + radius + 0.3);
  }

  // ── Hit highlighting ────────────────────────────────────────────────────────
  const hitSet = new Set(hitIndices);
  for (let i = 0; i < allShapes.length; i++) {
    if (!hitSet.has(i)) continue;
    const shape = allShapes[i];

    ctx.strokeStyle = BLAST_HIT_HIGHLIGHT;
    ctx.lineWidth = 2 / zoom;

    if (shape.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(shape.center.x, shape.center.y, shape.radius + 1.5 / zoom, 0, TWO_PI);
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(shape.center.x, shape.center.y);
      ctx.rotate(shape.rotation);
      const pad = 1.5 / zoom;
      const hw = shape.width / 2 + pad;
      const hh = shape.height / 2 + pad;
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      ctx.restore();
    }
  }

  // Hit count label
  if (hitIndices.length > 0) {
    const labelY = template
      ? template.origin.y - 1
      : center.y - radius - 0.5;
    const labelX = template ? template.origin.x : center.x;

    const fontSize = Math.min(0.6, 10 / zoom);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = BLAST_HIT_HIGHLIGHT;
    ctx.fillText(`${hitIndices.length} hit`, labelX, labelY);
  }
}
