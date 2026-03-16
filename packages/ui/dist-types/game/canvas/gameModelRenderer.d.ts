/**
 * Game Model Renderer
 *
 * Converts engine GameState models into VisualizerModel[] format
 * for the existing canvas rendering pipeline. Also provides status-based
 * coloring, wound display, and selection highlighting.
 */
import type { GameState, Position } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import type { VisualizerModel } from '../../state/types';
import type { ModelShape } from '@hh/geometry';
export declare function gameStateToVisualizerModels(gameState: GameState, positionOverrides?: Map<string, Position>): VisualizerModel[];
/**
 * Information about a model's visual state for enhanced rendering.
 */
export interface GameModelVisualInfo {
    modelId: string;
    unitId: string;
    playerIndex: number;
    position: Position;
    shape: ModelShape;
    baseRadius: number;
    isSelected: boolean;
    isHovered: boolean;
    isActive: boolean;
    statuses: TacticalStatus[];
    currentWounds: number;
    maxWounds: number;
    isLockedInCombat: boolean;
}
/**
 * Build visual info for all alive models in the game state.
 * This provides richer data for status overlays, wound markers, etc.
 */
export declare function buildGameModelVisualInfos(gameState: GameState, selectedUnitId: string | null, hoveredUnitId: string | null, hoveredModelId: string | null, positionOverrides?: Map<string, Position>): GameModelVisualInfo[];
/**
 * Get status-based overlay color for a model.
 */
export declare function getStatusColor(statuses: TacticalStatus[]): string | null;
/**
 * Render status indicators on models (called after model rendering).
 * Draws colored ring overlays for pinned/suppressed/stunned/routed models.
 */
export declare function renderGameModelStatuses(ctx: CanvasRenderingContext2D, infos: GameModelVisualInfo[], zoom: number): void;
/**
 * Render wound markers on multi-wound models.
 */
export declare function renderWoundMarkers(ctx: CanvasRenderingContext2D, infos: GameModelVisualInfo[], zoom: number): void;
/**
 * Render "active unit" glow for units that can act this phase.
 */
export declare function renderActiveUnitGlow(ctx: CanvasRenderingContext2D, infos: GameModelVisualInfo[], zoom: number): void;
/**
 * Render destroyed model X markers (optional, for showing where models fell).
 */
export declare function renderDestroyedMarkers(ctx: CanvasRenderingContext2D, gameState: GameState, zoom: number): void;
//# sourceMappingURL=gameModelRenderer.d.ts.map