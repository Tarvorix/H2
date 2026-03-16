/**
 * Master Renderer
 * Orchestrates all sub-renderers in the correct layer order.
 * Called once per animation frame.
 */
import type { DebugVisualizerState } from '../state/types';
import type { AssetManifest } from './assets';
export interface RenderFrameOptions {
    assetManifest?: AssetManifest;
}
export declare function renderFrame(ctx: CanvasRenderingContext2D, state: DebugVisualizerState, canvasWidth: number, canvasHeight: number, options?: RenderFrameOptions): void;
//# sourceMappingURL=renderer.d.ts.map