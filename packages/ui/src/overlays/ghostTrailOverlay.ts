/**
 * Ghost Trail Overlay
 * Renders translucent circles at previous model positions and dashed path lines
 * showing where models moved from during the current Movement Phase.
 *
 * Ghost trails appear after a model is moved, showing its original position
 * as a semi-transparent circle with a dashed line connecting to the current position.
 */

import type { Position } from '@hh/types';
import { TWO_PI } from '@hh/geometry';

// ─── Colors ──────────────────────────────────────────────────────────────────

/** Fill color for the ghost (previous position) circle */
export const GHOST_FILL = 'rgba(148, 163, 184, 0.2)';

/** Stroke color for the ghost circle outline */
export const GHOST_STROKE = 'rgba(148, 163, 184, 0.4)';

/** Color of the dashed path line from ghost to current position */
export const GHOST_PATH_COLOR = 'rgba(148, 163, 184, 0.3)';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A ghost trail entry representing a model's previous position.
 */
export interface GhostTrail {
  /** Model ID this trail belongs to */
  modelId: string;
  /** The previous position (where the model was before moving) */
  fromPosition: Position;
  /** The current position (where the model is now) */
  toPosition: Position;
  /** Model footprint used for rendering the previous-position ghost */
  shape: {
    kind: 'circle';
    radiusInches: number;
  } | {
    kind: 'rect';
    lengthInches: number;
    widthInches: number;
    rotationRadians: number;
  };
}

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * Render ghost trails for all moved models.
 * Draws translucent circles at previous positions with dashed path lines
 * connecting to current positions.
 *
 * @param ctx - Canvas 2D rendering context (in world space, already transformed)
 * @param ghostTrails - Array of ghost trail entries to render
 * @param zoom - Current camera zoom level (pixels per inch)
 */
export function renderGhostTrails(
  ctx: CanvasRenderingContext2D,
  ghostTrails: GhostTrail[],
  zoom: number,
): void {
  if (ghostTrails.length === 0) return;

  for (const trail of ghostTrails) {
    const { fromPosition, toPosition, shape } = trail;

    // ── Draw dashed path line ────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(fromPosition.x, fromPosition.y);
    ctx.lineTo(toPosition.x, toPosition.y);
    ctx.strokeStyle = GHOST_PATH_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Draw ghost footprint at previous position ───────────────────────
    ctx.fillStyle = GHOST_FILL;
    ctx.strokeStyle = GHOST_STROKE;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([2 / zoom, 2 / zoom]);

    if (shape.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(fromPosition.x, fromPosition.y, shape.radiusInches, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(fromPosition.x, fromPosition.y);
      ctx.rotate(shape.rotationRadians);
      ctx.beginPath();
      ctx.rect(
        -shape.lengthInches / 2,
        -shape.widthInches / 2,
        shape.lengthInches,
        shape.widthInches,
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.setLineDash([]);
  }
}
