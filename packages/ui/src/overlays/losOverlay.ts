/**
 * LOS Overlay
 * Renders Line of Sight rays between two models.
 * Clear rays are green, blocked rays are red.
 * Terrain intersection points are marked with small circles.
 */

import type { LOSResult, ModelShape } from '@hh/geometry';
import {
  LOS_RAY_CLEAR,
  LOS_RAY_BLOCKED,
  LOS_ENTER_POINT,
  LOS_EXIT_POINT,
  LOS_TEXT_YES,
  LOS_TEXT_NO,
} from '../styles/colors';

export function renderLOS(
  ctx: CanvasRenderingContext2D,
  result: LOSResult,
  _modelA: ModelShape,
  _modelB: ModelShape,
  zoom: number,
): void {
  const lineWidth = 1 / zoom;
  const markerRadius = 2 / zoom;

  // Draw each ray
  for (const ray of result.rays) {
    ctx.beginPath();
    ctx.moveTo(ray.start.x, ray.start.y);
    ctx.lineTo(ray.end.x, ray.end.y);
    ctx.strokeStyle = ray.isBlocked ? LOS_RAY_BLOCKED : LOS_RAY_CLEAR;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = ray.isBlocked ? 0.4 : 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Draw terrain intersection markers
    for (const intersection of ray.terrainIntersections) {
      // Enter point (yellow circle)
      ctx.beginPath();
      ctx.arc(
        intersection.enterPoint.x,
        intersection.enterPoint.y,
        markerRadius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = LOS_ENTER_POINT;
      ctx.fill();

      // Exit point (orange circle)
      ctx.beginPath();
      ctx.arc(
        intersection.exitPoint.x,
        intersection.exitPoint.y,
        markerRadius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = LOS_EXIT_POINT;
      ctx.fill();
    }
  }

  // Draw LOS result text near the midpoint of the first ray
  if (result.rays.length > 0) {
    const firstRay = result.rays[0];
    const midX = (firstRay.start.x + firstRay.end.x) / 2;
    const midY = (firstRay.start.y + firstRay.end.y) / 2;

    const fontSize = Math.min(1, 14 / zoom);
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = result.hasLOS ? LOS_TEXT_YES : LOS_TEXT_NO;
    ctx.fillText(
      result.hasLOS ? 'LOS: YES' : 'LOS: BLOCKED',
      midX,
      midY - 0.5,
    );

    // Show clear/blocked count
    const clearCount = result.rays.filter(r => !r.isBlocked).length;
    const blockedCount = result.rays.filter(r => r.isBlocked).length;
    ctx.font = `${fontSize * 0.7}px monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(
      `${clearCount} clear / ${blockedCount} blocked`,
      midX,
      midY - 0.5 + fontSize * 0.8,
    );
  }
}
