/**
 * Terrain Renderer
 * Draws terrain pieces with type-based coloring.
 */

import type { TerrainPiece } from '@hh/types';
import { TerrainType } from '@hh/types';
import { TWO_PI } from '@hh/geometry';
import {
  TERRAIN_LIGHT_AREA,
  TERRAIN_MEDIUM_AREA,
  TERRAIN_HEAVY_AREA,
  TERRAIN_TERRAIN_PIECE,
  TERRAIN_IMPASSABLE,
  TERRAIN_DANGEROUS,
  TERRAIN_DIFFICULT,
  TERRAIN_STROKE,
  TERRAIN_LABEL,
} from '../styles/colors';
import type { AssetManifest, TerrainRenderPattern } from './assets';
import { resolveTerrainAsset } from './assets';

function getTerrainFillColor(type: TerrainType): string {
  switch (type) {
    case TerrainType.LightArea: return TERRAIN_LIGHT_AREA;
    case TerrainType.MediumArea: return TERRAIN_MEDIUM_AREA;
    case TerrainType.HeavyArea: return TERRAIN_HEAVY_AREA;
    case TerrainType.TerrainPiece: return TERRAIN_TERRAIN_PIECE;
    case TerrainType.Impassable: return TERRAIN_IMPASSABLE;
    case TerrainType.Dangerous: return TERRAIN_DANGEROUS;
    case TerrainType.Difficult: return TERRAIN_DIFFICULT;
  }
}

function drawTerrainShape(ctx: CanvasRenderingContext2D, terrain: TerrainPiece): void {
  const shape = terrain.shape;

  ctx.beginPath();
  switch (shape.kind) {
    case 'polygon': {
      if (shape.vertices.length < 3) return;
      ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
      for (let i = 1; i < shape.vertices.length; i++) {
        ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
      }
      ctx.closePath();
      break;
    }
    case 'rectangle': {
      ctx.rect(shape.topLeft.x, shape.topLeft.y, shape.width, shape.height);
      break;
    }
    case 'circle': {
      ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, TWO_PI);
      break;
    }
  }
}

function renderHatchPattern(
  ctx: CanvasRenderingContext2D,
  terrain: TerrainPiece,
  zoom: number,
): void {
  const shape = terrain.shape;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  switch (shape.kind) {
    case 'polygon': {
      minX = Math.min(...shape.vertices.map((vertex) => vertex.x));
      minY = Math.min(...shape.vertices.map((vertex) => vertex.y));
      maxX = Math.max(...shape.vertices.map((vertex) => vertex.x));
      maxY = Math.max(...shape.vertices.map((vertex) => vertex.y));
      break;
    }
    case 'rectangle': {
      minX = shape.topLeft.x;
      minY = shape.topLeft.y;
      maxX = shape.topLeft.x + shape.width;
      maxY = shape.topLeft.y + shape.height;
      break;
    }
    case 'circle': {
      minX = shape.center.x - shape.radius;
      minY = shape.center.y - shape.radius;
      maxX = shape.center.x + shape.radius;
      maxY = shape.center.y + shape.radius;
      break;
    }
  }

  const spacing = Math.max(0.35, 5 / zoom);
  const width = maxX - minX;
  const height = maxY - minY;

  ctx.save();
  drawTerrainShape(ctx, terrain);
  ctx.clip();
  ctx.beginPath();
  for (let offset = -height; offset <= width + height; offset += spacing) {
    ctx.moveTo(minX + offset, minY);
    ctx.lineTo(minX + offset - height, maxY);
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 0.8 / zoom;
  ctx.stroke();
  ctx.restore();
}

function getTerrainCenter(terrain: TerrainPiece): { x: number; y: number } {
  const shape = terrain.shape;
  switch (shape.kind) {
    case 'polygon': {
      let cx = 0, cy = 0;
      for (const v of shape.vertices) { cx += v.x; cy += v.y; }
      return { x: cx / shape.vertices.length, y: cy / shape.vertices.length };
    }
    case 'rectangle':
      return { x: shape.topLeft.x + shape.width / 2, y: shape.topLeft.y + shape.height / 2 };
    case 'circle':
      return shape.center;
  }
}

export function renderTerrain(
  ctx: CanvasRenderingContext2D,
  terrain: TerrainPiece[],
  zoom: number,
  assetManifest?: AssetManifest,
): void {
  for (const piece of terrain) {
    const asset = resolveTerrainAsset(assetManifest, piece.type);
    const pattern: TerrainRenderPattern = asset?.pattern ?? 'none';

    // Fill
    ctx.fillStyle = asset?.fallbackFill ?? getTerrainFillColor(piece.type);
    drawTerrainShape(ctx, piece);
    ctx.fill();

    if (pattern === 'hatch') {
      renderHatchPattern(ctx, piece, zoom);
    }

    // Stroke
    ctx.strokeStyle = asset?.fallbackStroke ?? TERRAIN_STROKE;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([3 / zoom, 3 / zoom]);
    drawTerrainShape(ctx, piece);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    const center = getTerrainCenter(piece);
    // Keep terrain labels at a stable on-screen size across zoom levels.
    const fontSize = Math.max(0.5, 10 / zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = asset?.labelColor ?? TERRAIN_LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(piece.name, center.x, center.y);
  }
}

export function renderTerrainPreview(
  ctx: CanvasRenderingContext2D,
  dragStart: { x: number; y: number } | null,
  dragCurrent: { x: number; y: number } | null,
  placingShape: 'rectangle' | 'circle',
  zoom: number,
): void {
  if (!dragStart || !dragCurrent) return;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 4 / zoom]);

  if (placingShape === 'rectangle') {
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    ctx.strokeRect(x, y, w, h);
  } else {
    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    ctx.beginPath();
    ctx.arc(dragStart.x, dragStart.y, radius, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}
