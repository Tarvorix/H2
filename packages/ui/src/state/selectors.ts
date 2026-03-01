/**
 * State Selectors
 * Pure functions to derive display data from state.
 */

import type { Position } from '@hh/types';
import { pointInShape, distanceShapes } from '@hh/geometry';
import type { ModelShape, RectHull } from '@hh/geometry';
import type { DebugVisualizerState, VisualizerModel } from './types';

export function getSelectedModel(state: DebugVisualizerState): VisualizerModel | null {
  if (!state.selectedModelId) return null;
  return state.models.find(m => m.id === state.selectedModelId) ?? null;
}

export function getHoveredModel(state: DebugVisualizerState): VisualizerModel | null {
  if (!state.hoveredModelId) return null;
  return state.models.find(m => m.id === state.hoveredModelId) ?? null;
}

export function getModelById(state: DebugVisualizerState, id: string): VisualizerModel | null {
  return state.models.find(m => m.id === id) ?? null;
}

export function getModelAtWorldPos(models: VisualizerModel[], pos: Position): VisualizerModel | null {
  for (let i = models.length - 1; i >= 0; i--) {
    if (pointInShape(pos, models[i].shape)) {
      return models[i];
    }
  }
  return null;
}

export function getAllModelShapes(state: DebugVisualizerState): ModelShape[] {
  return state.models.map(m => m.shape);
}

export function getVehicleHulls(state: DebugVisualizerState): RectHull[] {
  return state.models
    .filter((m): m is VisualizerModel & { shape: RectHull } => m.shape.kind === 'rect')
    .map(m => m.shape);
}

export function getPlayerModels(state: DebugVisualizerState, player: 1 | 2): VisualizerModel[] {
  return state.models.filter(m => m.player === player);
}

export function getPlayerShapes(state: DebugVisualizerState, player: 1 | 2): ModelShape[] {
  return state.models.filter(m => m.player === player).map(m => m.shape);
}

export function getModelIndex(state: DebugVisualizerState, id: string): number {
  return state.models.findIndex(m => m.id === id);
}

export function getNearestOtherPlayerModel(
  state: DebugVisualizerState,
  modelId: string,
): { model: VisualizerModel; distance: number } | null {
  const model = state.models.find(m => m.id === modelId);
  if (!model) return null;

  let nearest: VisualizerModel | null = null;
  let nearestDist = Infinity;

  for (const m of state.models) {
    if (m.player === model.player) continue;
    const d = distanceShapes(model.shape, m.shape);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = m;
    }
  }

  if (!nearest) return null;
  return { model: nearest, distance: nearestDist };
}
