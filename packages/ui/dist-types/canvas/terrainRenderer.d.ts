/**
 * Terrain Renderer
 * Draws terrain pieces with type-based coloring.
 */
import type { TerrainPiece } from '@hh/types';
import type { AssetManifest } from './assets';
export declare function renderTerrain(ctx: CanvasRenderingContext2D, terrain: TerrainPiece[], zoom: number, assetManifest?: AssetManifest): void;
export declare function renderTerrainPreview(ctx: CanvasRenderingContext2D, dragStart: {
    x: number;
    y: number;
} | null, dragCurrent: {
    x: number;
    y: number;
} | null, placingShape: 'rectangle' | 'circle', zoom: number): void;
//# sourceMappingURL=terrainRenderer.d.ts.map