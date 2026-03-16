/**
 * Coherency Overlay
 * Renders coherency state for a player's unit:
 * - Green rings around coherent models, red rings around incoherent models
 * - Green adjacency link lines between models within coherency range
 */
import type { CoherencyResult, ModelShape } from '@hh/geometry';
export declare function renderCoherency(ctx: CanvasRenderingContext2D, result: CoherencyResult, shapes: ModelShape[], zoom: number): void;
//# sourceMappingURL=coherencyOverlay.d.ts.map