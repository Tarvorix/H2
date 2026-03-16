/**
 * Game Canvas Adapter
 *
 * Bridges the game mode's GameUIState to the existing canvas rendering infrastructure.
 * Converts GameState data into the formats expected by the canvas renderers.
 */
import type { GameState, Position, TerrainPiece } from '@hh/types';
import type { VisualizerModel } from '../../state/types';
import type { CameraState } from '../../state/types';
import type { GameUIState, GhostTrailEntry } from '../types';
/**
 * Extract all data the canvas needs from GameUIState.
 * Returns a snapshot compatible with the existing rendering pipeline.
 */
export interface GameCanvasData {
    /** Models in VisualizerModel format for the model renderer */
    models: VisualizerModel[];
    /** Terrain pieces for the terrain renderer */
    terrain: TerrainPiece[];
    /** Camera state for pan/zoom */
    camera: CameraState;
    /** Battlefield dimensions */
    battlefieldWidth: number;
    battlefieldHeight: number;
    /** Selected model ID for selection rendering */
    selectedModelId: string | null;
    /** Hovered model ID for hover rendering */
    hoveredModelId: string | null;
    /** Ghost trails for movement trail rendering */
    ghostTrails: GhostTrailEntry[];
    /** The raw game state for additional rendering (statuses, wounds, etc.) */
    gameState: GameState | null;
    /** Selected unit ID */
    selectedUnitId: string | null;
    /** Hovered unit ID */
    hoveredUnitId: string | null;
    /** Preview model positions for in-progress placement flows */
    positionOverrides: Map<string, Position>;
}
/**
 * Convert GameUIState into GameCanvasData for the canvas rendering pipeline.
 */
export declare function extractGameCanvasData(state: GameUIState): GameCanvasData;
/**
 * Render game-specific overlays on top of the standard canvas rendering.
 * Called after the base renderers (grid, terrain, models, selection) have drawn.
 */
export declare function renderGameOverlays(ctx: CanvasRenderingContext2D, data: GameCanvasData, zoom: number): void;
/**
 * Find which unit a model belongs to, given a model ID.
 * Used for click-to-select behavior on the game canvas.
 */
export declare function findUnitIdForModel(gameState: GameState, modelId: string): string | null;
/**
 * Find the model under the given world position (hit test).
 * Returns the model ID if a model is found, null otherwise.
 */
export declare function hitTestGameModels(gameState: GameState, worldX: number, worldY: number): string | null;
//# sourceMappingURL=gameCanvasAdapter.d.ts.map