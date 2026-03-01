/**
 * Camera System
 * World↔screen coordinate transforms for the battlefield canvas.
 * World coordinates are in inches. Screen coordinates are in CSS pixels.
 */

import type { Position } from '@hh/types';
import type { CameraState } from '../state/types';

export function worldToScreen(camera: CameraState, world: Position): { x: number; y: number } {
  return {
    x: world.x * camera.zoom + camera.offsetX,
    y: world.y * camera.zoom + camera.offsetY,
  };
}

export function screenToWorld(camera: CameraState, screen: { x: number; y: number }): Position {
  return {
    x: (screen.x - camera.offsetX) / camera.zoom,
    y: (screen.y - camera.offsetY) / camera.zoom,
  };
}

export function zoomAtPoint(
  camera: CameraState,
  screenX: number,
  screenY: number,
  zoomDelta: number,
): CameraState {
  const oldZoom = camera.zoom;
  const factor = zoomDelta > 0 ? 0.9 : 1.1;
  const newZoom = clampZoom(oldZoom * factor);

  // Keep the world point under the cursor fixed
  const worldX = (screenX - camera.offsetX) / oldZoom;
  const worldY = (screenY - camera.offsetY) / oldZoom;

  return {
    zoom: newZoom,
    offsetX: screenX - worldX * newZoom,
    offsetY: screenY - worldY * newZoom,
  };
}

export function clampZoom(zoom: number): number {
  return Math.max(4, Math.min(40, zoom));
}

export function fitBattlefield(
  canvasWidth: number,
  canvasHeight: number,
  bfWidth: number,
  bfHeight: number,
): CameraState {
  const padding = 40; // px
  const availW = canvasWidth - padding * 2;
  const availH = canvasHeight - padding * 2;
  const zoom = clampZoom(Math.min(availW / bfWidth, availH / bfHeight));

  const renderedW = bfWidth * zoom;
  const renderedH = bfHeight * zoom;

  return {
    zoom,
    offsetX: (canvasWidth - renderedW) / 2,
    offsetY: (canvasHeight - renderedH) / 2,
  };
}
