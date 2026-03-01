/**
 * Selection Renderer
 * Draws highlight rings around selected and hovered models.
 */

import { TWO_PI } from '@hh/geometry';
import type { VisualizerModel } from '../state/types';
import { SELECTION_STROKE, HOVER_STROKE } from '../styles/colors';

function drawModelHighlight(
  ctx: CanvasRenderingContext2D,
  model: VisualizerModel,
  color: string,
  lineWidth: number,
  dashPattern: number[],
): void {
  const shape = model.shape;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);

  if (shape.kind === 'circle') {
    const pad = lineWidth * 2;
    ctx.beginPath();
    ctx.arc(shape.center.x, shape.center.y, shape.radius + pad, 0, TWO_PI);
    ctx.stroke();
  } else {
    ctx.save();
    ctx.translate(shape.center.x, shape.center.y);
    ctx.rotate(shape.rotation);

    const pad = lineWidth * 2;
    const hw = shape.width / 2 + pad;
    const hh = shape.height / 2 + pad;

    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.restore();
  }

  ctx.setLineDash([]);
}

export function renderSelection(
  ctx: CanvasRenderingContext2D,
  models: VisualizerModel[],
  selectedModelId: string | null,
  hoveredModelId: string | null,
  zoom: number,
): void {
  const baseLineWidth = 1.5 / zoom;

  // Draw hover highlight (underneath selection)
  if (hoveredModelId && hoveredModelId !== selectedModelId) {
    const hoveredModel = models.find(m => m.id === hoveredModelId);
    if (hoveredModel) {
      drawModelHighlight(ctx, hoveredModel, HOVER_STROKE, baseLineWidth, [4 / zoom, 4 / zoom]);
    }
  }

  // Draw selection highlight
  if (selectedModelId) {
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (selectedModel) {
      drawModelHighlight(ctx, selectedModel, SELECTION_STROKE, baseLineWidth * 1.5, []);
    }
  }
}
