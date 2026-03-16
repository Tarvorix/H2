/**
 * Movement Envelope Overlay
 * Renders the computed movement envelope with zone coloring:
 * - Blue fill for legal movement area
 * - Yellow for difficult terrain zones
 * - Orange for dangerous terrain zones
 * - Dark red for impassable zones
 * - Red circles for enemy exclusion zones
 */
import type { MovementEnvelopeResult, ModelShape } from '@hh/geometry';
export declare function renderMovementEnvelope(ctx: CanvasRenderingContext2D, envelope: MovementEnvelopeResult, _originShape: ModelShape, zoom: number): void;
//# sourceMappingURL=movementOverlay.d.ts.map