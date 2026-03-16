/**
 * Ghost Trail Overlay
 * Renders translucent circles at previous model positions and dashed path lines
 * showing where models moved from during the current Movement Phase.
 *
 * Ghost trails appear after a model is moved, showing its original position
 * as a semi-transparent circle with a dashed line connecting to the current position.
 */
import type { Position } from '@hh/types';
/** Fill color for the ghost (previous position) circle */
export declare const GHOST_FILL = "rgba(148, 163, 184, 0.2)";
/** Stroke color for the ghost circle outline */
export declare const GHOST_STROKE = "rgba(148, 163, 184, 0.4)";
/** Color of the dashed path line from ghost to current position */
export declare const GHOST_PATH_COLOR = "rgba(148, 163, 184, 0.3)";
/**
 * A ghost trail entry representing a model's previous position.
 */
export interface GhostTrail {
    /** Model ID this trail belongs to */
    modelId: string;
    /** The previous position (where the model was before moving) */
    fromPosition: Position;
    /** The current position (where the model is now) */
    toPosition: Position;
    /** Model footprint used for rendering the previous-position ghost */
    shape: {
        kind: 'circle';
        radiusInches: number;
    } | {
        kind: 'rect';
        lengthInches: number;
        widthInches: number;
        rotationRadians: number;
    };
}
/**
 * Render ghost trails for all moved models.
 * Draws translucent circles at previous positions with dashed path lines
 * connecting to current positions.
 *
 * @param ctx - Canvas 2D rendering context (in world space, already transformed)
 * @param ghostTrails - Array of ghost trail entries to render
 * @param zoom - Current camera zoom level (pixels per inch)
 */
export declare function renderGhostTrails(ctx: CanvasRenderingContext2D, ghostTrails: GhostTrail[], zoom: number): void;
//# sourceMappingURL=ghostTrailOverlay.d.ts.map