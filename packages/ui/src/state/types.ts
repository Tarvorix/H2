/**
 * Debug Visualizer State Types
 * All interfaces, action types, and the root state shape.
 */

import type { Position, TerrainPiece, GameState, GameCommand } from '@hh/types';
import type { TerrainType } from '@hh/types';
import type {
  ModelShape,
  LOSResult,
  CoherencyResult,
  MovementEnvelopeResult,
  TemplateShape,
  Scenario,
} from '@hh/geometry';
import type { GhostTrail } from '../overlays/ghostTrailOverlay';

// ─── Interaction Modes ────────────────────────────────────────────────────────

export type InteractionMode =
  | 'select'
  | 'los'
  | 'distance'
  | 'coherency'
  | 'movement'
  | 'blast'
  | 'template'
  | 'vehicleFacing'
  | 'terrainEdit';

// ─── Visualizer Model ─────────────────────────────────────────────────────────

export interface VisualizerModel {
  id: string;
  shape: ModelShape;
  player: 1 | 2;
  label: string;
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export interface CameraState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// ─── Sub-States ───────────────────────────────────────────────────────────────

export interface LOSState {
  modelAId: string | null;
  modelBId: string | null;
  result: LOSResult | null;
}

export interface BlastState {
  center: Position | null;
  radius: number;
  hitIndices: number[];
  blastSize: 3 | 5 | 7;
}

export interface TemplateState {
  origin: Position | null;
  direction: number;
  template: TemplateShape | null;
  hitIndices: number[];
}

export interface MovementState {
  selectedModelId: string | null;
  maxMove: number;
  envelope: MovementEnvelopeResult | null;
}

export interface TerrainEditorState {
  placingType: TerrainType;
  placingShape: 'rectangle' | 'circle';
  isDifficult: boolean;
  isDangerous: boolean;
  dragStart: Position | null;
  dragCurrent: Position | null;
}

export interface DistanceReadout {
  modelAId: string;
  modelBId: string;
  distance: number;
  roundedDistance: number;
  pointA: Position;
  pointB: Position;
}

export interface OverlayVisibility {
  grid: boolean;
  coherency: boolean;
  los: boolean;
  distance: boolean;
  movement: boolean;
  blast: boolean;
  template: boolean;
  vehicleFacing: boolean;
}

// ─── Root State ───────────────────────────────────────────────────────────────

export interface DebugVisualizerState {
  battlefieldWidth: number;
  battlefieldHeight: number;
  models: VisualizerModel[];
  terrain: TerrainPiece[];

  camera: CameraState;

  mode: InteractionMode;
  selectedModelId: string | null;
  hoveredModelId: string | null;
  mouseWorldPos: Position | null;

  los: LOSState;
  blast: BlastState;
  template: TemplateState;
  movement: MovementState;
  terrainEditor: TerrainEditorState;

  overlayVisibility: OverlayVisibility;

  coherencyResult: CoherencyResult | null;
  distanceReadout: DistanceReadout | null;

  isDragging: boolean;
  isPanning: boolean;
  panStart: { x: number; y: number } | null;
  dragModelId: string | null;

  /** Engine game state (null when in debug visualizer mode without engine) */
  gameState: GameState | null;
  /** Ghost trails showing previous model positions during movement */
  ghostTrails: GhostTrail[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type DebugVisualizerAction =
  | { type: 'LOAD_SCENARIO'; scenario: Scenario }
  | { type: 'SET_MODE'; mode: InteractionMode }
  | { type: 'SET_CAMERA'; camera: Partial<CameraState> }
  | { type: 'ZOOM_AT'; screenX: number; screenY: number; delta: number }
  | { type: 'PAN'; dx: number; dy: number }
  | { type: 'PAN_START'; screenX: number; screenY: number }
  | { type: 'PAN_END' }
  | { type: 'MOUSE_MOVE'; screenX: number; screenY: number }
  | { type: 'MOUSE_DOWN'; screenX: number; screenY: number; button: number }
  | { type: 'MOUSE_UP'; screenX: number; screenY: number; button: number }
  | { type: 'SELECT_MODEL'; modelId: string | null }
  | { type: 'MOVE_MODEL'; modelId: string; position: Position }
  | { type: 'START_DRAG'; modelId: string }
  | { type: 'END_DRAG' }
  | { type: 'SET_LOS_MODEL_A'; modelId: string }
  | { type: 'SET_LOS_MODEL_B'; modelId: string }
  | { type: 'CLEAR_LOS' }
  | { type: 'PLACE_BLAST'; center: Position }
  | { type: 'SET_BLAST_SIZE'; size: 3 | 5 | 7 }
  | { type: 'CLEAR_BLAST' }
  | { type: 'SET_TEMPLATE_ORIGIN'; origin: Position }
  | { type: 'SET_TEMPLATE_DIRECTION'; direction: number }
  | { type: 'CLEAR_TEMPLATE' }
  | { type: 'SET_MOVEMENT_MODEL'; modelId: string }
  | { type: 'SET_MOVEMENT_DISTANCE'; distance: number }
  | { type: 'CLEAR_MOVEMENT' }
  | { type: 'ADD_TERRAIN'; terrain: TerrainPiece }
  | { type: 'REMOVE_TERRAIN'; terrainId: string }
  | { type: 'SET_TERRAIN_EDITOR'; partial: Partial<TerrainEditorState> }
  | { type: 'TERRAIN_DRAG_START'; worldPos: Position }
  | { type: 'TERRAIN_DRAG_MOVE'; worldPos: Position }
  | { type: 'TERRAIN_DRAG_END' }
  | { type: 'TOGGLE_OVERLAY'; overlay: keyof OverlayVisibility }
  | { type: 'SET_GAME_STATE'; gameState: GameState }
  | { type: 'DISPATCH_COMMAND'; command: GameCommand }
  | { type: 'ADD_GHOST_TRAIL'; trail: GhostTrail }
  | { type: 'CLEAR_GHOST_TRAILS' };
