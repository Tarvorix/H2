/**
 * Game Model Renderer
 *
 * Converts engine GameState models into VisualizerModel[] format
 * for the existing canvas rendering pipeline. Also provides status-based
 * coloring, wound display, and selection highlighting.
 */

import type { GameState, UnitState, Position } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import { getModelShape, getModelWounds } from '@hh/engine';
import type { VisualizerModel } from '../../state/types';
import type { ModelShape } from '@hh/geometry';

export function gameStateToVisualizerModels(
  gameState: GameState,
  positionOverrides: Map<string, Position> = new Map(),
): VisualizerModel[] {
  const models: VisualizerModel[] = [];

  for (const army of gameState.armies) {
    const player: 1 | 2 = army.playerIndex === 0 ? 1 : 2;

    for (const unit of army.units) {
      if (!unit.isDeployed) continue;

      for (const model of unit.models) {
        if (model.isDestroyed) continue;

        const position = positionOverrides.get(model.id);
        const shape = position ? getModelShape({ ...model, position }) : getModelShape(model);

        models.push({
          id: model.id,
          shape,
          player,
          label: unit.profileId,
        });
      }
    }
  }

  return models;
}

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
  isActive: boolean; // Can act this phase
  statuses: TacticalStatus[];
  currentWounds: number;
  maxWounds: number;
  isLockedInCombat: boolean;
}

/**
 * Build visual info for all alive models in the game state.
 * This provides richer data for status overlays, wound markers, etc.
 */
export function buildGameModelVisualInfos(
  gameState: GameState,
  selectedUnitId: string | null,
  hoveredUnitId: string | null,
  hoveredModelId: string | null,
  positionOverrides: Map<string, Position> = new Map(),
): GameModelVisualInfo[] {
  const infos: GameModelVisualInfo[] = [];

  for (const army of gameState.armies) {
    for (const unit of army.units) {
      if (!unit.isDeployed) continue;

      const isUnitSelected = unit.id === selectedUnitId;
      const isUnitHovered = unit.id === hoveredUnitId;

      for (const model of unit.models) {
        if (model.isDestroyed) continue;

        const position = positionOverrides.get(model.id) ?? model.position;
        const shape = getModelShape({ ...model, position });
        const baseRadius = shape.kind === 'circle'
          ? shape.radius
          : Math.max(shape.width, shape.height) / 2;

        infos.push({
          modelId: model.id,
          unitId: unit.id,
          playerIndex: army.playerIndex,
          position,
          shape,
          baseRadius,
          isSelected: isUnitSelected,
          isHovered: isUnitHovered || model.id === hoveredModelId,
          isActive: isUnitActive(gameState, army.playerIndex, unit),
          statuses: unit.statuses,
          currentWounds: model.currentWounds,
          maxWounds: getModelWounds(model.unitProfileId, model.profileModelName),
          isLockedInCombat: unit.isLockedInCombat,
        });
      }
    }
  }

  return infos;
}

/**
 * Check if a unit can act in the current phase.
 */
function isUnitActive(gameState: GameState, playerIndex: number, unit: UnitState): boolean {
  // Only active player's units can act
  if (playerIndex !== gameState.activePlayerIndex) return false;
  if (!unit.isDeployed || unit.isInReserves) return false;
  if (unit.models.every(m => m.isDestroyed)) return false;

  return true;
}

/**
 * Get status-based overlay color for a model.
 */
export function getStatusColor(statuses: TacticalStatus[]): string | null {
  if (statuses.includes(TacticalStatus.Routed)) return 'rgba(255, 255, 255, 0.6)';
  if (statuses.includes(TacticalStatus.Stunned)) return 'rgba(239, 68, 68, 0.5)';
  if (statuses.includes(TacticalStatus.Suppressed)) return 'rgba(251, 146, 60, 0.5)';
  if (statuses.includes(TacticalStatus.Pinned)) return 'rgba(251, 191, 36, 0.4)';
  return null;
}

/**
 * Render status indicators on models (called after model rendering).
 * Draws colored ring overlays for pinned/suppressed/stunned/routed models.
 */
export function renderGameModelStatuses(
  ctx: CanvasRenderingContext2D,
  infos: GameModelVisualInfo[],
  zoom: number,
): void {
  const lineWidth = Math.max(1.5 / zoom, 0.08);

  for (const info of infos) {
    const statusColor = getStatusColor(info.statuses);
    if (!statusColor) continue;

    ctx.beginPath();
    ctx.arc(info.position.x, info.position.y, info.baseRadius + lineWidth, 0, Math.PI * 2);
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = lineWidth * 2;
    ctx.stroke();
  }
}

/**
 * Render wound markers on multi-wound models.
 */
export function renderWoundMarkers(
  ctx: CanvasRenderingContext2D,
  infos: GameModelVisualInfo[],
  zoom: number,
): void {
  const fontSize = Math.min(0.4, 6 / zoom);

  for (const info of infos) {
    // Only show wound markers for multi-wound models or models that have taken damage
    if (info.maxWounds <= 1 && info.currentWounds >= 1) continue;
    if (info.currentWounds === info.maxWounds) continue;

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = info.currentWounds <= 1 ? '#ef4444' : '#fbbf24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw wound count below the model
    const textY = info.position.y + info.baseRadius + fontSize * 0.8;
    ctx.fillText(`${info.currentWounds}W`, info.position.x, textY);
    ctx.restore();
  }
}

/**
 * Render "active unit" glow for units that can act this phase.
 */
export function renderActiveUnitGlow(
  ctx: CanvasRenderingContext2D,
  infos: GameModelVisualInfo[],
  zoom: number,
): void {
  const glowRadius = Math.max(2 / zoom, 0.1);

  for (const info of infos) {
    if (!info.isActive) continue;

    ctx.beginPath();
    ctx.arc(info.position.x, info.position.y, info.baseRadius + glowRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = glowRadius;
    ctx.stroke();
  }
}

/**
 * Render destroyed model X markers (optional, for showing where models fell).
 */
export function renderDestroyedMarkers(
  ctx: CanvasRenderingContext2D,
  gameState: GameState,
  zoom: number,
): void {
  const lineWidth = Math.max(1 / zoom, 0.05);
  const markerSize = 0.3;

  for (const army of gameState.armies) {
    for (const unit of army.units) {
      if (!unit.isDeployed) continue;
      for (const model of unit.models) {
        if (!model.isDestroyed) continue;

        const { x, y } = model.position;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        ctx.moveTo(x - markerSize, y - markerSize);
        ctx.lineTo(x + markerSize, y + markerSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + markerSize, y - markerSize);
        ctx.lineTo(x - markerSize, y + markerSize);
        ctx.stroke();
      }
    }
  }
}
