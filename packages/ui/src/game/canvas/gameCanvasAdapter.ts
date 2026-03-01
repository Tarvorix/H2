/**
 * Game Canvas Adapter
 *
 * Bridges the game mode's GameUIState to the existing canvas rendering infrastructure.
 * Converts GameState data into the formats expected by the canvas renderers.
 */

import type { GameState, TerrainPiece } from '@hh/types';
import type { VisualizerModel } from '../../state/types';
import type { CameraState } from '../../state/types';
import type { GameUIState, GhostTrailEntry } from '../types';
import {
  gameStateToVisualizerModels,
  buildGameModelVisualInfos,
  renderGameModelStatuses,
  renderWoundMarkers,
  renderActiveUnitGlow,
  renderDestroyedMarkers,
} from './gameModelRenderer';

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
}

/**
 * Convert GameUIState into GameCanvasData for the canvas rendering pipeline.
 */
export function extractGameCanvasData(state: GameUIState): GameCanvasData {
  let models: VisualizerModel[] = [];

  if (state.gameState) {
    models = gameStateToVisualizerModels(state.gameState);
  }

  return {
    models,
    terrain: state.terrain,
    camera: state.camera,
    battlefieldWidth: state.battlefieldWidth,
    battlefieldHeight: state.battlefieldHeight,
    selectedModelId: findSelectedModelId(state),
    hoveredModelId: state.hoveredModelId,
    ghostTrails: state.ghostTrails,
    gameState: state.gameState,
    selectedUnitId: state.selectedUnitId,
    hoveredUnitId: state.hoveredUnitId,
  };
}

/**
 * Find the first alive model in the selected unit for selection rendering.
 * The existing selection renderer highlights individual models, so we pick
 * the first alive model of the selected unit.
 */
function findSelectedModelId(state: GameUIState): string | null {
  if (!state.selectedUnitId || !state.gameState) return null;

  for (const army of state.gameState.armies) {
    for (const unit of army.units) {
      if (unit.id === state.selectedUnitId) {
        const aliveModel = unit.models.find(m => !m.isDestroyed);
        return aliveModel?.id ?? null;
      }
    }
  }
  return null;
}

/**
 * Render game-specific overlays on top of the standard canvas rendering.
 * Called after the base renderers (grid, terrain, models, selection) have drawn.
 */
export function renderGameOverlays(
  ctx: CanvasRenderingContext2D,
  data: GameCanvasData,
  zoom: number,
): void {
  if (!data.gameState) return;

  const infos = buildGameModelVisualInfos(
    data.gameState,
    data.selectedUnitId,
    data.hoveredUnitId,
    data.hoveredModelId,
  );

  // Render active unit glow (subtle highlight for units that can act)
  renderActiveUnitGlow(ctx, infos, zoom);

  // Render status overlays (pinned, suppressed, stunned, routed)
  renderGameModelStatuses(ctx, infos, zoom);

  // Render wound markers on multi-wound models
  renderWoundMarkers(ctx, infos, zoom);

  // Render destroyed model markers
  renderDestroyedMarkers(ctx, data.gameState, zoom);
}

/**
 * Find which unit a model belongs to, given a model ID.
 * Used for click-to-select behavior on the game canvas.
 */
export function findUnitIdForModel(gameState: GameState, modelId: string): string | null {
  for (const army of gameState.armies) {
    for (const unit of army.units) {
      if (unit.models.some(m => m.id === modelId)) {
        return unit.id;
      }
    }
  }
  return null;
}

/**
 * Find the model under the given world position (hit test).
 * Returns the model ID if a model is found, null otherwise.
 */
export function hitTestGameModels(
  gameState: GameState,
  worldX: number,
  worldY: number,
): string | null {
  // Check models in reverse order (top-most first)
  for (let ai = gameState.armies.length - 1; ai >= 0; ai--) {
    const army = gameState.armies[ai];
    for (let ui = army.units.length - 1; ui >= 0; ui--) {
      const unit = army.units[ui];
      if (!unit.isDeployed) continue;
      for (let mi = unit.models.length - 1; mi >= 0; mi--) {
        const model = unit.models[mi];
        if (model.isDestroyed) continue;

        const dx = worldX - model.position.x;
        const dy = worldY - model.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const baseRadius = 0.5; // Default infantry base radius

        if (dist <= baseRadius * 1.2) {
          // Small hit margin
          return model.id;
        }
      }
    }
  }
  return null;
}
