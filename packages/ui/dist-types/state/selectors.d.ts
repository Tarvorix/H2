/**
 * State Selectors
 * Pure functions to derive display data from state.
 */
import type { Position } from '@hh/types';
import type { ModelShape, RectHull } from '@hh/geometry';
import type { DebugVisualizerState, VisualizerModel } from './types';
export declare function getSelectedModel(state: DebugVisualizerState): VisualizerModel | null;
export declare function getHoveredModel(state: DebugVisualizerState): VisualizerModel | null;
export declare function getModelById(state: DebugVisualizerState, id: string): VisualizerModel | null;
export declare function getModelAtWorldPos(models: VisualizerModel[], pos: Position): VisualizerModel | null;
export declare function getAllModelShapes(state: DebugVisualizerState): ModelShape[];
export declare function getVehicleHulls(state: DebugVisualizerState): RectHull[];
export declare function getPlayerModels(state: DebugVisualizerState, player: 1 | 2): VisualizerModel[];
export declare function getPlayerShapes(state: DebugVisualizerState, player: 1 | 2): ModelShape[];
export declare function getModelIndex(state: DebugVisualizerState, id: string): number;
export declare function getNearestOtherPlayerModel(state: DebugVisualizerState, modelId: string): {
    model: VisualizerModel;
    distance: number;
} | null;
//# sourceMappingURL=selectors.d.ts.map