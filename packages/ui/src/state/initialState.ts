/**
 * Initial State Factory
 * Creates the default DebugVisualizerState with the open-field scenario loaded.
 */

import { TerrainType } from '@hh/types';
import {
  DEFAULT_BATTLEFIELD_WIDTH,
  DEFAULT_BATTLEFIELD_HEIGHT,
  BLAST_STANDARD_RADIUS,
  createOpenFieldScenario,
} from '@hh/geometry';
import type { DebugVisualizerState } from './types';
import { loadScenarioIntoState } from './reducer';

export function createInitialState(): DebugVisualizerState {
  const base: DebugVisualizerState = {
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
    models: [],
    terrain: [],

    camera: {
      offsetX: 20,
      offsetY: 20,
      zoom: 12,
    },

    mode: 'select',
    selectedModelId: null,
    hoveredModelId: null,
    mouseWorldPos: null,

    los: {
      modelAId: null,
      modelBId: null,
      result: null,
    },

    blast: {
      center: null,
      radius: BLAST_STANDARD_RADIUS,
      hitIndices: [],
      blastSize: 3,
    },

    template: {
      origin: null,
      direction: 0,
      template: null,
      hitIndices: [],
    },

    movement: {
      selectedModelId: null,
      maxMove: 7,
      envelope: null,
    },

    terrainEditor: {
      placingType: TerrainType.MediumArea,
      placingShape: 'rectangle',
      isDifficult: true,
      isDangerous: false,
      dragStart: null,
      dragCurrent: null,
    },

    overlayVisibility: {
      grid: true,
      coherency: false,
      los: false,
      distance: false,
      movement: false,
      blast: false,
      template: false,
      vehicleFacing: false,
    },

    coherencyResult: null,
    distanceReadout: null,

    isDragging: false,
    isPanning: false,
    panStart: null,
    dragModelId: null,

    gameState: null,
    ghostTrails: [],
  };

  // Load the default scenario
  const scenario = createOpenFieldScenario();
  return loadScenarioIntoState(base, scenario);
}
