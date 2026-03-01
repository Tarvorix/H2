/**
 * Objective Overlay
 * Renders objective markers on the canvas with control coloring.
 *
 * Objectives are drawn as diamonds with VP text inside.
 * Colors indicate control status:
 * - Gold: contested/uncontrolled
 * - Player 1 color: controlled by player 0
 * - Player 2 color: controlled by player 1
 * - Gray: removed (Window of Opportunity)
 */

import type { GameState, ObjectiveMarker } from '@hh/types';
import { TWO_PI } from '@hh/geometry';
import { getObjectiveController } from '@hh/engine';

// ─── Colors ─────────────────────────────────────────────────────────────────

const OBJECTIVE_UNCONTROLLED_FILL = 'rgba(255, 200, 50, 0.3)';
const OBJECTIVE_UNCONTROLLED_STROKE = 'rgba(255, 200, 50, 0.9)';
const OBJECTIVE_PLAYER0_FILL = 'rgba(37, 99, 235, 0.3)';
const OBJECTIVE_PLAYER0_STROKE = 'rgba(37, 99, 235, 0.9)';
const OBJECTIVE_PLAYER1_FILL = 'rgba(239, 68, 68, 0.3)';
const OBJECTIVE_PLAYER1_STROKE = 'rgba(239, 68, 68, 0.9)';
const OBJECTIVE_REMOVED_FILL = 'rgba(100, 100, 100, 0.2)';
const OBJECTIVE_REMOVED_STROKE = 'rgba(100, 100, 100, 0.5)';
const OBJECTIVE_TEXT_COLOR = '#ffffff';
const OBJECTIVE_RANGE_FILL = 'rgba(255, 255, 255, 0.05)';
const OBJECTIVE_RANGE_STROKE = 'rgba(255, 255, 255, 0.15)';

const OBJECTIVE_CONTROL_RANGE = 3; // inches

/**
 * Render all objective markers on the canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param gameState - Current game state
 * @param zoom - Current camera zoom level
 */
export function renderObjectives(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  zoom: number,
): void {
  if (!gameState.missionState) return;

  const { objectives } = gameState.missionState;

  for (const objective of objectives) {
    renderObjectiveMarker(ctx, objective, gameState, zoom);
  }
}

function renderObjectiveMarker(
  ctx: CanvasRenderingContext2D,
  objective: ObjectiveMarker,
  gameState: GameState,
  zoom: number,
): void {
  const { x, y } = objective.position;
  const lineWidth = 1.5 / zoom;
  const markerSize = 1.5; // inches (diameter of objective marker)
  const halfSize = markerSize / 2;

  // Determine control colors
  let fill: string;
  let stroke: string;

  if (objective.isRemoved) {
    fill = OBJECTIVE_REMOVED_FILL;
    stroke = OBJECTIVE_REMOVED_STROKE;
  } else {
    const control = getObjectiveController(gameState, objective);
    if (control.controllerPlayerIndex === 0) {
      fill = OBJECTIVE_PLAYER0_FILL;
      stroke = OBJECTIVE_PLAYER0_STROKE;
    } else if (control.controllerPlayerIndex === 1) {
      fill = OBJECTIVE_PLAYER1_FILL;
      stroke = OBJECTIVE_PLAYER1_STROKE;
    } else {
      fill = OBJECTIVE_UNCONTROLLED_FILL;
      stroke = OBJECTIVE_UNCONTROLLED_STROKE;
    }
  }

  // ── Draw control range circle ─────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(x, y, OBJECTIVE_CONTROL_RANGE, 0, TWO_PI);
  ctx.fillStyle = OBJECTIVE_RANGE_FILL;
  ctx.fill();
  ctx.strokeStyle = OBJECTIVE_RANGE_STROKE;
  ctx.lineWidth = lineWidth * 0.5;
  ctx.setLineDash([0.3, 0.3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Draw diamond marker ───────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(x, y - halfSize); // top
  ctx.lineTo(x + halfSize, y); // right
  ctx.lineTo(x, y + halfSize); // bottom
  ctx.lineTo(x - halfSize, y); // left
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // ── Draw VP text ──────────────────────────────────────────────────────────
  const fontSize = Math.max(0.6, 12 / zoom);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = OBJECTIVE_TEXT_COLOR;

  if (objective.isRemoved) {
    ctx.fillText('X', x, y);
  } else {
    ctx.fillText(`${objective.currentVpValue}`, x, y);
  }

  // ── Draw label above marker ───────────────────────────────────────────────
  const labelFontSize = Math.max(0.4, 9 / zoom);
  ctx.font = `${labelFontSize}px monospace`;
  ctx.fillStyle = stroke;
  ctx.fillText(objective.label, x, y - halfSize - labelFontSize * 0.8);
}
