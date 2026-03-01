/**
 * Grid Renderer
 * Draws inch-scale grid lines on the battlefield.
 * Minor lines every 1", major every 6", foot markers every 12".
 */

import { GRID_MINOR, GRID_MAJOR, GRID_FOOT } from '../styles/colors';

export function renderGrid(
  ctx: CanvasRenderingContext2D,
  battlefieldWidth: number,
  battlefieldHeight: number,
  zoom: number,
): void {
  // Line widths in world units (appear constant on screen)
  const minorWidth = 0.5 / zoom;
  const majorWidth = 1 / zoom;
  const footWidth = 1.5 / zoom;

  // Minor grid lines (every inch)
  ctx.strokeStyle = GRID_MINOR;
  ctx.lineWidth = minorWidth;
  ctx.beginPath();
  for (let x = 0; x <= battlefieldWidth; x++) {
    if (x % 6 === 0) continue; // Skip major/foot lines
    ctx.moveTo(x, 0);
    ctx.lineTo(x, battlefieldHeight);
  }
  for (let y = 0; y <= battlefieldHeight; y++) {
    if (y % 6 === 0) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(battlefieldWidth, y);
  }
  ctx.stroke();

  // Major grid lines (every 6 inches = half foot)
  ctx.strokeStyle = GRID_MAJOR;
  ctx.lineWidth = majorWidth;
  ctx.beginPath();
  for (let x = 0; x <= battlefieldWidth; x += 6) {
    if (x % 12 === 0) continue; // Skip foot lines
    ctx.moveTo(x, 0);
    ctx.lineTo(x, battlefieldHeight);
  }
  for (let y = 0; y <= battlefieldHeight; y += 6) {
    if (y % 12 === 0) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(battlefieldWidth, y);
  }
  ctx.stroke();

  // Foot grid lines (every 12 inches)
  ctx.strokeStyle = GRID_FOOT;
  ctx.lineWidth = footWidth;
  ctx.beginPath();
  for (let x = 0; x <= battlefieldWidth; x += 12) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, battlefieldHeight);
  }
  for (let y = 0; y <= battlefieldHeight; y += 12) {
    ctx.moveTo(0, y);
    ctx.lineTo(battlefieldWidth, y);
  }
  ctx.stroke();
}
