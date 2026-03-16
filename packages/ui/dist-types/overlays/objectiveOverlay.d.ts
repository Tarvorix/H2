/**
 * Objective Overlay
 * Renders objective markers on the canvas with control coloring.
 *
 * Objectives are drawn as diamonds with VP text inside.
 * Colors indicate control status:
 * - Gold: contested/uncontrolled
 * - Player 1 color: controlled by player 0
 * - Player 2 color: controlled by player 1
 * - Gray: removed (Window of Opportunity)
 */
import type { GameState } from '@hh/types';
/**
 * Render all objective markers on the canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param gameState - Current game state
 * @param zoom - Current camera zoom level
 */
export declare function renderObjectives(ctx: CanvasRenderingContext2D, gameState: GameState, zoom: number): void;
//# sourceMappingURL=objectiveOverlay.d.ts.map