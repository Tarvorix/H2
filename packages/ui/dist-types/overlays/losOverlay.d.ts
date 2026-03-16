/**
 * LOS Overlay
 * Renders Line of Sight rays between two models.
 * Clear rays are green, blocked rays are red.
 * Terrain intersection points are marked with small circles.
 */
import type { LOSResult, ModelShape } from '@hh/geometry';
export declare function renderLOS(ctx: CanvasRenderingContext2D, result: LOSResult, _modelA: ModelShape, _modelB: ModelShape, zoom: number): void;
//# sourceMappingURL=losOverlay.d.ts.map