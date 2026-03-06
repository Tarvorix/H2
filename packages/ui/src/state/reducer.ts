/**
 * Debug Visualizer Reducer
 * All state transitions and geometry computations.
 */

import type { Position, TerrainPiece } from '@hh/types';
import {
  checkLOS,
  checkCoherency,
  computeMovementEnvelope,
  blastOverlap,
  blastSizeToRadius,
  createStandardTemplate,
  templateOverlap,
  distanceShapes,
  distanceRoundUp,
  closestPointOnShape,
  pointInShape,
  STANDARD_COHERENCY_RANGE,
  createRectTerrain,
  createCircleTerrain,
  vec2Distance,
} from '@hh/geometry';
import type { ModelShape, RectHull, Scenario } from '@hh/geometry';
import {
  findModel,
  getModelShape,
  processCommand,
  RandomDiceProvider,
} from '@hh/engine';
import type {
  DebugVisualizerState,
  DebugVisualizerAction,
  VisualizerModel,
} from './types';
import type { GhostTrail } from '../overlays/ghostTrailOverlay';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function screenToWorld(
  camera: { offsetX: number; offsetY: number; zoom: number },
  screenX: number,
  screenY: number,
): Position {
  return {
    x: (screenX - camera.offsetX) / camera.zoom,
    y: (screenY - camera.offsetY) / camera.zoom,
  };
}

function getVehicleHulls(models: VisualizerModel[]): RectHull[] {
  return models
    .filter((m): m is VisualizerModel & { shape: RectHull } => m.shape.kind === 'rect')
    .map(m => m.shape);
}

function getAllShapes(models: VisualizerModel[]): ModelShape[] {
  return models.map(m => m.shape);
}

function getPlayerShapes(models: VisualizerModel[], player: 1 | 2): ModelShape[] {
  return models.filter(m => m.player === player).map(m => m.shape);
}

function findModelAtPos(models: VisualizerModel[], worldPos: Position): VisualizerModel | null {
  // Check in reverse order so top-rendered models are picked first
  for (let i = models.length - 1; i >= 0; i--) {
    if (pointInShape(worldPos, models[i].shape)) {
      return models[i];
    }
  }
  return null;
}

function findModelById(models: VisualizerModel[], id: string): VisualizerModel | undefined {
  return models.find(m => m.id === id);
}

function recomputeCoherency(models: VisualizerModel[]): ReturnType<typeof checkCoherency> | null {
  const p1Shapes = getPlayerShapes(models, 1);
  if (p1Shapes.length < 2) return null;
  return checkCoherency(p1Shapes, STANDARD_COHERENCY_RANGE);
}

function blastRadiusFromSize(size: 3 | 5 | 7): number {
  return blastSizeToRadius(size);
}

function toGhostTrailShape(shape: ModelShape): GhostTrail['shape'] {
  if (shape.kind === 'circle') {
    return {
      kind: 'circle',
      radiusInches: shape.radius,
    };
  }

  return {
    kind: 'rect',
    lengthInches: shape.width,
    widthInches: shape.height,
    rotationRadians: shape.rotation,
  };
}

function clampZoom(zoom: number): number {
  return Math.max(4, Math.min(40, zoom));
}

// ─── Scenario Loading ─────────────────────────────────────────────────────────

export function loadScenarioIntoState(
  state: DebugVisualizerState,
  scenario: Scenario,
): DebugVisualizerState {
  const models: VisualizerModel[] = [];

  for (let i = 0; i < scenario.player1Models.length; i++) {
    models.push({
      id: `p1-${i}`,
      shape: scenario.player1Models[i],
      player: 1,
      label: scenario.player1Models[i].kind === 'rect' ? `P1-V${i}` : `P1-M${i}`,
    });
  }

  for (let i = 0; i < scenario.player2Models.length; i++) {
    models.push({
      id: `p2-${i}`,
      shape: scenario.player2Models[i],
      player: 2,
      label: scenario.player2Models[i].kind === 'rect' ? `P2-V${i}` : `P2-M${i}`,
    });
  }

  const newState: DebugVisualizerState = {
    ...state,
    battlefieldWidth: scenario.battlefieldWidth,
    battlefieldHeight: scenario.battlefieldHeight,
    models,
    terrain: scenario.terrain,
    selectedModelId: null,
    hoveredModelId: null,
    los: { modelAId: null, modelBId: null, result: null },
    blast: { ...state.blast, center: null, hitIndices: [] },
    template: { origin: null, direction: 0, template: null, hitIndices: [] },
    movement: { ...state.movement, selectedModelId: null, envelope: null },
    coherencyResult: null,
    distanceReadout: null,
  };

  newState.coherencyResult = recomputeCoherency(newState.models);
  return newState;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function debugVisualizerReducer(
  state: DebugVisualizerState,
  action: DebugVisualizerAction,
): DebugVisualizerState {
  switch (action.type) {
    // ── Scenario ────────────────────────────────────────────────────────
    case 'LOAD_SCENARIO':
      return loadScenarioIntoState(state, action.scenario);

    // ── Mode ────────────────────────────────────────────────────────────
    case 'SET_MODE': {
      const overlayVisibility = { ...state.overlayVisibility };

      // Auto-enable the overlay for the selected mode
      switch (action.mode) {
        case 'los':
          overlayVisibility.los = true;
          break;
        case 'distance':
          overlayVisibility.distance = true;
          break;
        case 'coherency':
          overlayVisibility.coherency = true;
          break;
        case 'movement':
          overlayVisibility.movement = true;
          break;
        case 'blast':
          overlayVisibility.blast = true;
          break;
        case 'template':
          overlayVisibility.template = true;
          break;
        case 'vehicleFacing':
          overlayVisibility.vehicleFacing = true;
          break;
      }

      return {
        ...state,
        mode: action.mode,
        overlayVisibility,
      };
    }

    // ── Camera ──────────────────────────────────────────────────────────
    case 'SET_CAMERA':
      return {
        ...state,
        camera: { ...state.camera, ...action.camera },
      };

    case 'ZOOM_AT': {
      const oldZoom = state.camera.zoom;
      const zoomFactor = action.delta > 0 ? 0.9 : 1.1;
      const newZoom = clampZoom(oldZoom * zoomFactor);
      // Keep the world point under the cursor fixed
      const worldX = (action.screenX - state.camera.offsetX) / oldZoom;
      const worldY = (action.screenY - state.camera.offsetY) / oldZoom;
      return {
        ...state,
        camera: {
          zoom: newZoom,
          offsetX: action.screenX - worldX * newZoom,
          offsetY: action.screenY - worldY * newZoom,
        },
      };
    }

    case 'PAN':
      return {
        ...state,
        camera: {
          ...state.camera,
          offsetX: state.camera.offsetX + action.dx,
          offsetY: state.camera.offsetY + action.dy,
        },
      };

    case 'PAN_START':
      return {
        ...state,
        isPanning: true,
        panStart: { x: action.screenX, y: action.screenY },
      };

    case 'PAN_END':
      return {
        ...state,
        isPanning: false,
        panStart: null,
      };

    // ── Mouse ───────────────────────────────────────────────────────────
    case 'MOUSE_MOVE': {
      const worldPos = screenToWorld(state.camera, action.screenX, action.screenY);
      let newState = { ...state, mouseWorldPos: worldPos };

      // Panning
      if (state.isPanning && state.panStart) {
        const dx = action.screenX - state.panStart.x;
        const dy = action.screenY - state.panStart.y;
        newState = {
          ...newState,
          camera: {
            ...state.camera,
            offsetX: state.camera.offsetX + dx,
            offsetY: state.camera.offsetY + dy,
          },
          panStart: { x: action.screenX, y: action.screenY },
        };
      }

      // Dragging a model
      if (state.isDragging && state.dragModelId) {
        const modelIdx = newState.models.findIndex(m => m.id === state.dragModelId);
        if (modelIdx >= 0) {
          const model = newState.models[modelIdx];
          const updatedShape = model.shape.kind === 'circle'
            ? { ...model.shape, center: worldPos }
            : { ...model.shape, center: worldPos };
          const updatedModels = [...newState.models];
          updatedModels[modelIdx] = { ...model, shape: updatedShape };
          newState = {
            ...newState,
            models: updatedModels,
            coherencyResult: recomputeCoherency(updatedModels),
          };
        }
      }

      // Hover detection
      const hoveredModel = findModelAtPos(newState.models, worldPos);
      newState.hoveredModelId = hoveredModel?.id ?? null;

      // Distance readout in distance mode
      if (state.mode === 'distance' && hoveredModel) {
        let nearestDist = Infinity;
        let nearestModel: VisualizerModel | null = null;
        const otherPlayer = hoveredModel.player === 1 ? 2 : 1;

        for (const m of newState.models) {
          if (m.player !== otherPlayer) continue;
          const d = distanceShapes(hoveredModel.shape, m.shape);
          if (d < nearestDist) {
            nearestDist = d;
            nearestModel = m;
          }
        }

        if (nearestModel) {
          const ptA = closestPointOnShape(hoveredModel.shape, nearestModel.shape.center);
          const ptB = closestPointOnShape(nearestModel.shape, hoveredModel.shape.center);
          newState.distanceReadout = {
            modelAId: hoveredModel.id,
            modelBId: nearestModel.id,
            distance: nearestDist,
            roundedDistance: distanceRoundUp(nearestDist),
            pointA: ptA,
            pointB: ptB,
          };
        } else {
          newState.distanceReadout = null;
        }
      }

      // Template aiming
      if (state.mode === 'template' && state.template.origin && !state.template.template) {
        const dx = worldPos.x - state.template.origin.x;
        const dy = worldPos.y - state.template.origin.y;
        const direction = Math.atan2(dy, dx);
        newState = {
          ...newState,
          template: { ...newState.template, direction },
        };
      }

      // Terrain editor drag preview
      if (state.mode === 'terrainEdit' && state.terrainEditor.dragStart) {
        newState = {
          ...newState,
          terrainEditor: { ...newState.terrainEditor, dragCurrent: worldPos },
        };
      }

      return newState;
    }

    case 'MOUSE_DOWN': {
      const worldPos = screenToWorld(state.camera, action.screenX, action.screenY);

      // Right or middle click → pan
      if (action.button === 1 || action.button === 2) {
        return {
          ...state,
          isPanning: true,
          panStart: { x: action.screenX, y: action.screenY },
        };
      }

      // Left click behavior depends on mode
      switch (state.mode) {
        case 'select': {
          const clickedModel = findModelAtPos(state.models, worldPos);
          if (clickedModel) {
            return {
              ...state,
              selectedModelId: clickedModel.id,
              isDragging: true,
              dragModelId: clickedModel.id,
            };
          }
          return { ...state, selectedModelId: null };
        }

        case 'los': {
          const clickedModel = findModelAtPos(state.models, worldPos);
          if (!clickedModel) return state;

          if (!state.los.modelAId) {
            return {
              ...state,
              los: { ...state.los, modelAId: clickedModel.id, modelBId: null, result: null },
            };
          }
          if (!state.los.modelBId) {
            const modelA = findModelById(state.models, state.los.modelAId);
            if (!modelA) return state;
            const vehicleHulls = getVehicleHulls(
              state.models.filter(m => m.id !== modelA.id && m.id !== clickedModel.id),
            );
            const result = checkLOS(modelA.shape, clickedModel.shape, state.terrain, vehicleHulls);
            return {
              ...state,
              los: { modelAId: state.los.modelAId, modelBId: clickedModel.id, result },
            };
          }
          // Third click → clear
          return {
            ...state,
            los: { modelAId: null, modelBId: null, result: null },
          };
        }

        case 'movement': {
          const clickedModel = findModelAtPos(state.models, worldPos);
          if (!clickedModel) return state;
          const enemyModels = getAllShapes(
            state.models.filter(m => m.player !== clickedModel.player),
          );
          const envelope = computeMovementEnvelope(
            clickedModel.shape,
            state.movement.maxMove,
            state.terrain,
            enemyModels,
            state.battlefieldWidth,
            state.battlefieldHeight,
          );
          return {
            ...state,
            selectedModelId: clickedModel.id,
            movement: {
              ...state.movement,
              selectedModelId: clickedModel.id,
              envelope,
            },
          };
        }

        case 'blast': {
          const allShapes = getAllShapes(state.models);
          const radius = blastRadiusFromSize(state.blast.blastSize);
          const hitIndices = blastOverlap(worldPos, radius, allShapes);
          return {
            ...state,
            blast: {
              ...state.blast,
              center: worldPos,
              radius,
              hitIndices,
            },
          };
        }

        case 'template': {
          if (!state.template.origin) {
            return {
              ...state,
              template: { ...state.template, origin: worldPos },
            };
          }
          // Second click → place template
          const tmpl = createStandardTemplate(state.template.origin, state.template.direction);
          const allShapes = getAllShapes(state.models);
          const hitIndices = templateOverlap(tmpl, allShapes);
          return {
            ...state,
            template: {
              origin: state.template.origin,
              direction: state.template.direction,
              template: tmpl,
              hitIndices,
            },
          };
        }

        case 'vehicleFacing': {
          const clickedModel = findModelAtPos(state.models, worldPos);
          if (clickedModel && clickedModel.shape.kind === 'rect') {
            return { ...state, selectedModelId: clickedModel.id };
          }
          return state;
        }

        case 'terrainEdit': {
          return {
            ...state,
            terrainEditor: {
              ...state.terrainEditor,
              dragStart: worldPos,
              dragCurrent: worldPos,
            },
          };
        }

        case 'coherency':
        case 'distance':
          // These modes respond to hover, not click (or auto-display)
          return state;

        default:
          return state;
      }
    }

    case 'MOUSE_UP': {
      // End panning
      if (state.isPanning) {
        return { ...state, isPanning: false, panStart: null };
      }

      // End model dragging
      if (state.isDragging) {
        return {
          ...state,
          isDragging: false,
          dragModelId: null,
          coherencyResult: recomputeCoherency(state.models),
        };
      }

      // End terrain drag → create terrain piece
      if (state.mode === 'terrainEdit' && state.terrainEditor.dragStart && state.terrainEditor.dragCurrent) {
        const { dragStart, dragCurrent, placingType, placingShape, isDifficult, isDangerous } = state.terrainEditor;
        const id = `terrain-${Date.now()}`;
        const name = `${placingType} Area`;

        let newTerrain: TerrainPiece | null = null;

        if (placingShape === 'rectangle') {
          const x = Math.min(dragStart.x, dragCurrent.x);
          const y = Math.min(dragStart.y, dragCurrent.y);
          const w = Math.abs(dragCurrent.x - dragStart.x);
          const h = Math.abs(dragCurrent.y - dragStart.y);
          if (w > 0.5 && h > 0.5) {
            newTerrain = createRectTerrain(id, name, placingType, { x, y }, w, h, isDifficult, isDangerous);
          }
        } else {
          const radius = vec2Distance(dragStart, dragCurrent);
          if (radius > 0.5) {
            newTerrain = createCircleTerrain(id, name, placingType, dragStart, radius, isDifficult, isDangerous);
          }
        }

        return {
          ...state,
          terrain: newTerrain ? [...state.terrain, newTerrain] : state.terrain,
          terrainEditor: { ...state.terrainEditor, dragStart: null, dragCurrent: null },
        };
      }

      return state;
    }

    // ── Selection ───────────────────────────────────────────────────────
    case 'SELECT_MODEL':
      return { ...state, selectedModelId: action.modelId };

    // ── Model Movement ──────────────────────────────────────────────────
    case 'MOVE_MODEL': {
      const idx = state.models.findIndex(m => m.id === action.modelId);
      if (idx < 0) return state;
      const model = state.models[idx];
      const updatedShape = model.shape.kind === 'circle'
        ? { ...model.shape, center: action.position }
        : { ...model.shape, center: action.position };
      const updatedModels = [...state.models];
      updatedModels[idx] = { ...model, shape: updatedShape };
      return {
        ...state,
        models: updatedModels,
        coherencyResult: recomputeCoherency(updatedModels),
      };
    }

    case 'START_DRAG':
      return { ...state, isDragging: true, dragModelId: action.modelId };

    case 'END_DRAG':
      return { ...state, isDragging: false, dragModelId: null };

    // ── LOS ─────────────────────────────────────────────────────────────
    case 'SET_LOS_MODEL_A':
      return {
        ...state,
        los: { modelAId: action.modelId, modelBId: null, result: null },
      };

    case 'SET_LOS_MODEL_B': {
      const modelA = findModelById(state.models, state.los.modelAId ?? '');
      const modelB = findModelById(state.models, action.modelId);
      if (!modelA || !modelB) return state;
      const vehicleHulls = getVehicleHulls(
        state.models.filter(m => m.id !== modelA.id && m.id !== modelB.id),
      );
      const result = checkLOS(modelA.shape, modelB.shape, state.terrain, vehicleHulls);
      return {
        ...state,
        los: { modelAId: state.los.modelAId, modelBId: action.modelId, result },
      };
    }

    case 'CLEAR_LOS':
      return { ...state, los: { modelAId: null, modelBId: null, result: null } };

    // ── Blast ───────────────────────────────────────────────────────────
    case 'PLACE_BLAST': {
      const allShapes = getAllShapes(state.models);
      const radius = blastRadiusFromSize(state.blast.blastSize);
      const hitIndices = blastOverlap(action.center, radius, allShapes);
      return {
        ...state,
        blast: { ...state.blast, center: action.center, radius, hitIndices },
      };
    }

    case 'SET_BLAST_SIZE': {
      const radius = blastRadiusFromSize(action.size);
      let hitIndices = state.blast.hitIndices;
      if (state.blast.center) {
        const allShapes = getAllShapes(state.models);
        hitIndices = blastOverlap(state.blast.center, radius, allShapes);
      }
      return {
        ...state,
        blast: { ...state.blast, blastSize: action.size, radius, hitIndices },
      };
    }

    case 'CLEAR_BLAST':
      return {
        ...state,
        blast: { ...state.blast, center: null, hitIndices: [] },
      };

    // ── Template ────────────────────────────────────────────────────────
    case 'SET_TEMPLATE_ORIGIN':
      return {
        ...state,
        template: { ...state.template, origin: action.origin, template: null, hitIndices: [] },
      };

    case 'SET_TEMPLATE_DIRECTION': {
      if (!state.template.origin) return state;
      const tmpl = createStandardTemplate(state.template.origin, action.direction);
      const allShapes = getAllShapes(state.models);
      const hitIndices = templateOverlap(tmpl, allShapes);
      return {
        ...state,
        template: { origin: state.template.origin, direction: action.direction, template: tmpl, hitIndices },
      };
    }

    case 'CLEAR_TEMPLATE':
      return {
        ...state,
        template: { origin: null, direction: 0, template: null, hitIndices: [] },
      };

    // ── Movement ────────────────────────────────────────────────────────
    case 'SET_MOVEMENT_MODEL': {
      const model = findModelById(state.models, action.modelId);
      if (!model) return state;
      const enemyModels = getAllShapes(state.models.filter(m => m.player !== model.player));
      const envelope = computeMovementEnvelope(
        model.shape,
        state.movement.maxMove,
        state.terrain,
        enemyModels,
        state.battlefieldWidth,
        state.battlefieldHeight,
      );
      return {
        ...state,
        selectedModelId: action.modelId,
        movement: { ...state.movement, selectedModelId: action.modelId, envelope },
      };
    }

    case 'SET_MOVEMENT_DISTANCE': {
      let envelope = state.movement.envelope;
      if (state.movement.selectedModelId) {
        const model = findModelById(state.models, state.movement.selectedModelId);
        if (model) {
          const enemyModels = getAllShapes(state.models.filter(m => m.player !== model.player));
          envelope = computeMovementEnvelope(
            model.shape,
            action.distance,
            state.terrain,
            enemyModels,
            state.battlefieldWidth,
            state.battlefieldHeight,
          );
        }
      }
      return {
        ...state,
        movement: { ...state.movement, maxMove: action.distance, envelope },
      };
    }

    case 'CLEAR_MOVEMENT':
      return {
        ...state,
        movement: { ...state.movement, selectedModelId: null, envelope: null },
      };

    // ── Terrain Editor ──────────────────────────────────────────────────
    case 'ADD_TERRAIN':
      return { ...state, terrain: [...state.terrain, action.terrain] };

    case 'REMOVE_TERRAIN':
      return { ...state, terrain: state.terrain.filter(t => t.id !== action.terrainId) };

    case 'SET_TERRAIN_EDITOR':
      return {
        ...state,
        terrainEditor: { ...state.terrainEditor, ...action.partial },
      };

    case 'TERRAIN_DRAG_START':
      return {
        ...state,
        terrainEditor: { ...state.terrainEditor, dragStart: action.worldPos, dragCurrent: action.worldPos },
      };

    case 'TERRAIN_DRAG_MOVE':
      return {
        ...state,
        terrainEditor: { ...state.terrainEditor, dragCurrent: action.worldPos },
      };

    case 'TERRAIN_DRAG_END':
      return {
        ...state,
        terrainEditor: { ...state.terrainEditor, dragStart: null, dragCurrent: null },
      };

    // ── Overlay Toggles ─────────────────────────────────────────────────
    case 'TOGGLE_OVERLAY':
      return {
        ...state,
        overlayVisibility: {
          ...state.overlayVisibility,
          [action.overlay]: !state.overlayVisibility[action.overlay],
        },
      };

    // ── Game Engine Integration ───────────────────────────────────────
    case 'SET_GAME_STATE':
      return {
        ...state,
        gameState: action.gameState,
      };

    case 'DISPATCH_COMMAND': {
      if (!state.gameState) return state;
      const dice = new RandomDiceProvider();
      const result = processCommand(state.gameState, action.command, dice);
      if (!result.accepted) return state;

      // Extract ghost trails from ModelMoved events
      const newTrails: GhostTrail[] = [];
      for (const event of result.events) {
        if (event.type === 'modelMoved') {
          const movedModel = findModel(result.state, event.modelId)?.model;
          const shape: GhostTrail['shape'] = movedModel
            ? toGhostTrailShape(getModelShape(movedModel))
            : { kind: 'circle', radiusInches: 0.63 };
          newTrails.push({
            modelId: event.modelId,
            fromPosition: event.fromPosition,
            toPosition: event.toPosition,
            shape,
          });
        }
      }

      return {
        ...state,
        gameState: result.state,
        ghostTrails: [...state.ghostTrails, ...newTrails],
      };
    }

    case 'ADD_GHOST_TRAIL':
      return {
        ...state,
        ghostTrails: [...state.ghostTrails, action.trail],
      };

    case 'CLEAR_GHOST_TRAILS':
      return {
        ...state,
        ghostTrails: [],
      };

    default:
      return state;
  }
}
