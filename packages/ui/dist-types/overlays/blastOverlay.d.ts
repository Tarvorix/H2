/**
 * Blast & Template Overlay
 * Renders blast markers (circles) and template weapons (trapezoids).
 * Hit models are highlighted with a golden ring.
 */
import type { Position } from '@hh/types';
import type { ModelShape, TemplateShape } from '@hh/geometry';
export declare function renderBlast(ctx: CanvasRenderingContext2D, center: Position, radius: number, hitIndices: number[], allShapes: ModelShape[], zoom: number, template?: TemplateShape): void;
//# sourceMappingURL=blastOverlay.d.ts.map