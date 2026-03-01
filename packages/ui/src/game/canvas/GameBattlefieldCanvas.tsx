/**
 * GameBattlefieldCanvas
 *
 * Bridge component that adapts GameUIState → DebugVisualizerState
 * and DebugVisualizerAction → GameUIAction so the existing
 * BattlefieldCanvas + renderer pipeline works for game mode.
 *
 * Also integrates game-specific overlays (status rings, wound markers,
 * objective markers, active unit glow, destroyed model markers) via
 * a custom render callback injected into the renderer pipeline.
 */

import { useCallback, useMemo } from 'react';
import type { DebugVisualizerState, DebugVisualizerAction } from '../../state/types';
import type { GameUIState, GameUIAction } from '../types';
import { BattlefieldCanvas } from '../../canvas/BattlefieldCanvas';
import type { RendererAssetMode } from '../../canvas/assets';
import { defaultAssetManifestLoader } from '../../canvas/assets';
import {
  extractGameCanvasData,
  hitTestGameModels,
  findUnitIdForModel,
} from './gameCanvasAdapter';

interface GameBattlefieldCanvasProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  rendererMode?: RendererAssetMode;
}

/**
 * Convert GameUIState into DebugVisualizerState for the existing canvas pipeline.
 * Provides sensible defaults for debug-only fields that don't apply to game mode.
 */
function buildVisualizerState(state: GameUIState): DebugVisualizerState {
  const canvasData = extractGameCanvasData(state);

  return {
    battlefieldWidth: canvasData.battlefieldWidth,
    battlefieldHeight: canvasData.battlefieldHeight,
    models: canvasData.models,
    terrain: canvasData.terrain,
    camera: canvasData.camera,
    mode: 'select',
    selectedModelId: canvasData.selectedModelId,
    hoveredModelId: canvasData.hoveredModelId,
    mouseWorldPos: state.mouseWorldPos,
    los: { modelAId: null, modelBId: null, result: null },
    blast: { center: null, radius: 0, hitIndices: [], blastSize: 3 },
    template: { origin: null, direction: 0, template: null, hitIndices: [] },
    movement: { selectedModelId: null, maxMove: 0, envelope: null },
    terrainEditor: {
      placingType: 'lightArea' as never,
      placingShape: 'rectangle',
      isDifficult: false,
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
    isPanning: state.isPanning,
    panStart: state.panStart,
    dragModelId: null,
    gameState: state.gameState,
    ghostTrails: state.ghostTrails,
  };
}

export function GameBattlefieldCanvas({
  state,
  dispatch,
  rendererMode = 'placeholder',
}: GameBattlefieldCanvasProps) {
  /**
   * Dispatch bridge: translates DebugVisualizerAction → GameUIAction.
   * Camera actions forward directly (same shape).
   * Mouse actions add hit-testing for unit selection/hover.
   */
  const bridgeDispatch = useCallback(
    (action: DebugVisualizerAction) => {
      switch (action.type) {
        // Camera actions — forward directly (same payload shape)
        case 'ZOOM_AT':
          dispatch({ type: 'ZOOM_AT', screenX: action.screenX, screenY: action.screenY, delta: action.delta });
          break;

        case 'PAN_START':
          dispatch({ type: 'PAN_START', screenX: action.screenX, screenY: action.screenY });
          break;

        case 'PAN_END':
          dispatch({ type: 'PAN_END' });
          break;

        case 'MOUSE_MOVE': {
          dispatch({ type: 'MOUSE_MOVE', screenX: action.screenX, screenY: action.screenY });

          // Hit-test for model hover
          if (state.gameState) {
            const worldX = (action.screenX - state.camera.offsetX) / state.camera.zoom;
            const worldY = (action.screenY - state.camera.offsetY) / state.camera.zoom;
            const modelId = hitTestGameModels(state.gameState, worldX, worldY);
            if (modelId) {
              const unitId = findUnitIdForModel(state.gameState, modelId);
              dispatch({ type: 'HOVER_UNIT', unitId });
              dispatch({ type: 'HOVER_MODEL', modelId });
            } else {
              dispatch({ type: 'HOVER_UNIT', unitId: null });
              dispatch({ type: 'HOVER_MODEL', modelId: null });
            }
          }
          break;
        }

        case 'MOUSE_DOWN': {
          // Right/middle click → pan (handled by reducer)
          if (action.button === 1 || action.button === 2) {
            dispatch({
              type: 'MOUSE_DOWN',
              screenX: action.screenX,
              screenY: action.screenY,
              button: action.button,
            });
            break;
          }

          // Left click → hit test for unit selection
          if (state.gameState) {
            const worldX = (action.screenX - state.camera.offsetX) / state.camera.zoom;
            const worldY = (action.screenY - state.camera.offsetY) / state.camera.zoom;
            const modelId = hitTestGameModels(state.gameState, worldX, worldY);
            if (modelId) {
              const unitId = findUnitIdForModel(state.gameState, modelId);
              dispatch({ type: 'SELECT_UNIT', unitId });
            } else {
              dispatch({ type: 'SELECT_UNIT', unitId: null });
            }
          }

          dispatch({
            type: 'MOUSE_DOWN',
            screenX: action.screenX,
            screenY: action.screenY,
            button: action.button,
          });
          break;
        }

        case 'MOUSE_UP':
          dispatch({
            type: 'MOUSE_UP',
            screenX: action.screenX,
            screenY: action.screenY,
            button: action.button,
          });
          break;

        // Ignore debug-only actions that don't apply to game mode
        case 'SELECT_MODEL':
        case 'MOVE_MODEL':
        case 'START_DRAG':
        case 'END_DRAG':
        case 'SET_MODE':
        case 'SET_CAMERA':
        case 'PAN':
        case 'SET_LOS_MODEL_A':
        case 'SET_LOS_MODEL_B':
        case 'CLEAR_LOS':
        case 'PLACE_BLAST':
        case 'SET_BLAST_SIZE':
        case 'CLEAR_BLAST':
        case 'SET_TEMPLATE_ORIGIN':
        case 'SET_TEMPLATE_DIRECTION':
        case 'CLEAR_TEMPLATE':
        case 'SET_MOVEMENT_MODEL':
        case 'SET_MOVEMENT_DISTANCE':
        case 'CLEAR_MOVEMENT':
        case 'ADD_TERRAIN':
        case 'REMOVE_TERRAIN':
        case 'SET_TERRAIN_EDITOR':
        case 'TERRAIN_DRAG_START':
        case 'TERRAIN_DRAG_MOVE':
        case 'TERRAIN_DRAG_END':
        case 'TOGGLE_OVERLAY':
        case 'SET_GAME_STATE':
        case 'DISPATCH_COMMAND':
        case 'ADD_GHOST_TRAIL':
        case 'CLEAR_GHOST_TRAILS':
        case 'LOAD_SCENARIO':
          break;
      }
    },
    [dispatch, state.gameState, state.camera],
  );

  const visualizerState = useMemo(() => buildVisualizerState(state), [state]);
  const assetManifest = useMemo(
    () => defaultAssetManifestLoader.load(rendererMode),
    [rendererMode],
  );

  return (
    <BattlefieldCanvas
      state={visualizerState}
      dispatch={bridgeDispatch}
      renderOptions={{ assetManifest }}
    />
  );
}
