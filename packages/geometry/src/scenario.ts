/**
 * Scenario Builder Helpers
 * Reference: HH_Digital_Design_Document.md — "Debug Visualizer"
 *
 * Convenience functions for creating test scenarios quickly:
 * lines of infantry, vehicles, terrain pieces, and preset
 * battlefield configurations for visual and automated testing.
 */

import type { Position, TerrainPiece } from '@hh/types';
import { TerrainType } from '@hh/types';
import type { CircleBase, RectHull, ModelShape } from './shapes';
import { createCircleBaseInches, createRectHull } from './shapes';
import {
  BASE_32MM_RADIUS,
  DEFAULT_BATTLEFIELD_WIDTH,
  DEFAULT_BATTLEFIELD_HEIGHT,
} from './constants';

// ─── Infantry Line Builders ──────────────────────────────────────────────────

/**
 * Create a line of infantry models along a direction.
 * Models are placed with a given center-to-center spacing starting from
 * the given origin position.
 *
 * @param count - Number of models to create
 * @param origin - Position of the first model's center
 * @param spacing - Center-to-center distance between adjacent models (in inches)
 * @param baseRadiusInches - Base radius for each model (in inches)
 * @param direction - Direction of the line in radians (0 = right, PI/2 = up). Default 0.
 * @returns Array of CircleBase shapes
 */
export function createInfantryLine(
  count: number,
  origin: Position,
  spacing: number,
  baseRadiusInches: number = BASE_32MM_RADIUS,
  direction: number = 0,
): CircleBase[] {
  const dx = Math.cos(direction) * spacing;
  const dy = Math.sin(direction) * spacing;
  const models: CircleBase[] = [];

  for (let i = 0; i < count; i++) {
    models.push(
      createCircleBaseInches(
        { x: origin.x + i * dx, y: origin.y + i * dy },
        baseRadiusInches,
      ),
    );
  }

  return models;
}

/**
 * Create a line of infantry with a given edge-to-edge spacing.
 * Automatically calculates the center-to-center spacing from the base size.
 *
 * @param count - Number of models
 * @param origin - Position of the first model's center
 * @param edgeSpacing - Edge-to-edge distance between adjacent models (in inches)
 * @param baseRadiusInches - Base radius for each model (in inches)
 * @param direction - Direction of the line in radians. Default 0.
 * @returns Array of CircleBase shapes
 */
export function createInfantryLineEdgeSpacing(
  count: number,
  origin: Position,
  edgeSpacing: number,
  baseRadiusInches: number = BASE_32MM_RADIUS,
  direction: number = 0,
): CircleBase[] {
  const centerSpacing = edgeSpacing + 2 * baseRadiusInches;
  return createInfantryLine(count, origin, centerSpacing, baseRadiusInches, direction);
}

/**
 * Create a grid of infantry models (rows and columns).
 *
 * @param rows - Number of rows
 * @param cols - Number of columns
 * @param origin - Top-left model position
 * @param colSpacing - Center-to-center horizontal spacing (in inches)
 * @param rowSpacing - Center-to-center vertical spacing (in inches)
 * @param baseRadiusInches - Base radius for each model (in inches)
 * @returns Array of CircleBase shapes, row-major order
 */
export function createInfantryGrid(
  rows: number,
  cols: number,
  origin: Position,
  colSpacing: number,
  rowSpacing: number,
  baseRadiusInches: number = BASE_32MM_RADIUS,
): CircleBase[] {
  const models: CircleBase[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      models.push(
        createCircleBaseInches(
          { x: origin.x + c * colSpacing, y: origin.y + r * rowSpacing },
          baseRadiusInches,
        ),
      );
    }
  }

  return models;
}

// ─── Vehicle Builders ────────────────────────────────────────────────────────

/**
 * Create a vehicle hull at the given position.
 *
 * @param center - Center position of the vehicle
 * @param width - Hull width along facing direction (in inches)
 * @param height - Hull height perpendicular to facing (in inches)
 * @param rotation - Hull rotation in radians (0 = facing right)
 * @returns RectHull shape
 */
export function createVehicle(
  center: Position,
  width: number,
  height: number,
  rotation: number = 0,
): RectHull {
  return createRectHull(center, width, height, rotation);
}

/**
 * Create a standard Rhino transport hull (approximately 4" x 2").
 *
 * @param center - Center position
 * @param rotation - Hull rotation in radians
 * @returns RectHull shape
 */
export function createRhino(center: Position, rotation: number = 0): RectHull {
  return createVehicle(center, 4, 2, rotation);
}

/**
 * Create a standard Land Raider hull (approximately 5" x 3").
 *
 * @param center - Center position
 * @param rotation - Hull rotation in radians
 * @returns RectHull shape
 */
export function createLandRaider(center: Position, rotation: number = 0): RectHull {
  return createVehicle(center, 5, 3, rotation);
}

// ─── Terrain Builders ────────────────────────────────────────────────────────

/**
 * Create a rectangular terrain piece.
 *
 * @param id - Unique terrain identifier
 * @param name - Display name
 * @param type - Terrain type classification
 * @param topLeft - Top-left corner position
 * @param width - Width in inches
 * @param height - Height in inches
 * @param isDifficult - Whether the terrain is difficult
 * @param isDangerous - Whether the terrain is dangerous
 * @returns TerrainPiece with rectangle shape
 */
export function createRectTerrain(
  id: string,
  name: string,
  type: TerrainType,
  topLeft: Position,
  width: number,
  height: number,
  isDifficult: boolean = false,
  isDangerous: boolean = false,
): TerrainPiece {
  return {
    id,
    name,
    type,
    shape: {
      kind: 'rectangle',
      topLeft,
      width,
      height,
    },
    isDifficult,
    isDangerous,
  };
}

/**
 * Create a circular terrain piece.
 *
 * @param id - Unique terrain identifier
 * @param name - Display name
 * @param type - Terrain type classification
 * @param center - Center position
 * @param radius - Radius in inches
 * @param isDifficult - Whether the terrain is difficult
 * @param isDangerous - Whether the terrain is dangerous
 * @returns TerrainPiece with circle shape
 */
export function createCircleTerrain(
  id: string,
  name: string,
  type: TerrainType,
  center: Position,
  radius: number,
  isDifficult: boolean = false,
  isDangerous: boolean = false,
): TerrainPiece {
  return {
    id,
    name,
    type,
    shape: {
      kind: 'circle',
      center,
      radius,
    },
    isDifficult,
    isDangerous,
  };
}

/**
 * Create a polygon terrain piece.
 *
 * @param id - Unique terrain identifier
 * @param name - Display name
 * @param type - Terrain type classification
 * @param vertices - Polygon vertices
 * @param isDifficult - Whether the terrain is difficult
 * @param isDangerous - Whether the terrain is dangerous
 * @returns TerrainPiece with polygon shape
 */
export function createPolygonTerrain(
  id: string,
  name: string,
  type: TerrainType,
  vertices: Position[],
  isDifficult: boolean = false,
  isDangerous: boolean = false,
): TerrainPiece {
  return {
    id,
    name,
    type,
    shape: {
      kind: 'polygon',
      vertices,
    },
    isDifficult,
    isDangerous,
  };
}

// ─── Preset Scenarios ────────────────────────────────────────────────────────

/**
 * A scenario configuration for testing.
 */
export interface Scenario {
  /** Friendly name for the scenario */
  name: string;
  /** All model shapes (infantry + vehicles) for player 1 */
  player1Models: ModelShape[];
  /** All model shapes (infantry + vehicles) for player 2 */
  player2Models: ModelShape[];
  /** Terrain pieces on the battlefield */
  terrain: TerrainPiece[];
  /** Battlefield width in inches */
  battlefieldWidth: number;
  /** Battlefield height in inches */
  battlefieldHeight: number;
}

/**
 * Create a basic scenario: two 10-man squads facing each other across open ground.
 * Player 1 at x=12, Player 2 at x=60.
 *
 * @returns Scenario with two squads, no terrain
 */
export function createOpenFieldScenario(): Scenario {
  return {
    name: 'Open Field — Two Squads',
    player1Models: createInfantryLineEdgeSpacing(10, { x: 12, y: 24 }, 1.5, BASE_32MM_RADIUS),
    player2Models: createInfantryLineEdgeSpacing(10, { x: 60, y: 24 }, 1.5, BASE_32MM_RADIUS),
    terrain: [],
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
  };
}

/**
 * Create a scenario with terrain between two squads:
 * Medium Area Terrain (4" wide) in the center of the battlefield.
 *
 * @returns Scenario with terrain blocking potential LOS
 */
export function createTerrainScenario(): Scenario {
  const terrain: TerrainPiece[] = [
    createRectTerrain(
      'medium-center',
      'Ruined Building',
      TerrainType.MediumArea,
      { x: 33, y: 18 },
      6,
      12,
      true,
    ),
    createCircleTerrain(
      'heavy-flank',
      'Bunker',
      TerrainType.HeavyArea,
      { x: 50, y: 10 },
      3,
    ),
    createRectTerrain(
      'light-scatter',
      'Scattered Debris',
      TerrainType.LightArea,
      { x: 20, y: 30 },
      8,
      6,
    ),
  ];

  return {
    name: 'Terrain Scenario — Medium Ruins + Heavy Bunker',
    player1Models: createInfantryLineEdgeSpacing(10, { x: 12, y: 24 }, 1.5, BASE_32MM_RADIUS),
    player2Models: createInfantryLineEdgeSpacing(10, { x: 60, y: 24 }, 1.5, BASE_32MM_RADIUS),
    terrain,
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
  };
}

/**
 * Create a vehicle-heavy scenario: tanks with infantry support.
 *
 * @returns Scenario with vehicles and infantry
 */
export function createVehicleScenario(): Scenario {
  const p1Infantry = createInfantryLineEdgeSpacing(5, { x: 10, y: 20 }, 1.5, BASE_32MM_RADIUS);
  const p1Vehicles: ModelShape[] = [
    createRhino({ x: 12, y: 28 }),
    createLandRaider({ x: 12, y: 14 }),
  ];

  const p2Infantry = createInfantryLineEdgeSpacing(5, { x: 60, y: 20 }, 1.5, BASE_32MM_RADIUS);
  const p2Vehicles: ModelShape[] = [
    createRhino({ x: 58, y: 28 }),
    createRhino({ x: 58, y: 14 }),
  ];

  return {
    name: 'Vehicle Scenario — Tanks + Infantry',
    player1Models: [...p1Infantry, ...p1Vehicles],
    player2Models: [...p2Infantry, ...p2Vehicles],
    terrain: [],
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
  };
}

/**
 * Create a coherency test scenario: 10 models in a line with configurable spacing.
 *
 * @param edgeSpacing - Edge-to-edge spacing between models (in inches)
 * @returns Scenario with a single line of 10 infantry
 */
export function createCoherencyTestScenario(edgeSpacing: number = 1.5): Scenario {
  return {
    name: `Coherency Test — 10 models, ${edgeSpacing}" edge spacing`,
    player1Models: createInfantryLineEdgeSpacing(10, { x: 10, y: 24 }, edgeSpacing, BASE_32MM_RADIUS),
    player2Models: [],
    terrain: [],
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
  };
}

/**
 * Create a blast test scenario: a cluster of models for blast template testing.
 *
 * @returns Scenario with a tight cluster of 5 models
 */
export function createBlastTestScenario(): Scenario {
  const cluster = createInfantryGrid(3, 3, { x: 34, y: 22 }, 1.5, 1.5, BASE_32MM_RADIUS);

  return {
    name: 'Blast Test — 3x3 Grid Cluster',
    player1Models: [],
    player2Models: cluster,
    terrain: [],
    battlefieldWidth: DEFAULT_BATTLEFIELD_WIDTH,
    battlefieldHeight: DEFAULT_BATTLEFIELD_HEIGHT,
  };
}
