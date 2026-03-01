/**
 * Distance Overlay
 * Renders a distance readout line between two models
 * with an inline label showing the measurement in inches.
 */

import type { DistanceReadout } from '../state/types';
import {
  DISTANCE_LINE,
  DISTANCE_LABEL_BG,
  DISTANCE_LABEL_TEXT,
} from '../styles/colors';

export function renderDistance(
  ctx: CanvasRenderingContext2D,
  readout: DistanceReadout,
  zoom: number,
): void {
  const { pointA, pointB, distance, roundedDistance } = readout;

  // Draw the distance line
  ctx.beginPath();
  ctx.moveTo(pointA.x, pointA.y);
  ctx.lineTo(pointB.x, pointB.y);
  ctx.strokeStyle = DISTANCE_LINE;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Endpoint markers
  const markerRadius = 2 / zoom;
  ctx.fillStyle = DISTANCE_LINE;
  ctx.beginPath();
  ctx.arc(pointA.x, pointA.y, markerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pointB.x, pointB.y, markerRadius, 0, Math.PI * 2);
  ctx.fill();

  // Label at midpoint
  const midX = (pointA.x + pointB.x) / 2;
  const midY = (pointA.y + pointB.y) / 2;

  const fontSize = Math.min(0.8, 12 / zoom);
  const labelText = `${distance.toFixed(2)}" (${roundedDistance}")`;
  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(labelText);
  const labelPadX = 0.3;
  const labelPadY = 0.15;
  const labelWidth = metrics.width + labelPadX * 2;
  const labelHeight = fontSize + labelPadY * 2;

  // Background
  ctx.fillStyle = DISTANCE_LABEL_BG;
  ctx.fillRect(
    midX - labelWidth / 2,
    midY - labelHeight / 2,
    labelWidth,
    labelHeight,
  );

  // Text
  ctx.fillStyle = DISTANCE_LABEL_TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, midX, midY);
}
