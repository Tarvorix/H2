import type {
  TerrainPiece,
  Position,
  ZoneMortalisBoundaryRef,
} from '@hh/types';
import { TerrainType } from '@hh/types';

const SECTION_SIZE = 12;
const WALL_THICKNESS = 0.6;
const LIGHT_AREA_SIZE = 6;

function boundaryKey(boundary: ZoneMortalisBoundaryRef): string {
  return `${boundary.orientation}-${boundary.row}-${boundary.column}`;
}

function boundaryId(prefix: string, boundary: ZoneMortalisBoundaryRef): string {
  return `zm-default-${prefix}-${boundaryKey(boundary)}`;
}

function createRectTerrain(
  id: string,
  name: string,
  type: TerrainType,
  topLeft: Position,
  width: number,
  height: number,
  isDifficult: boolean,
  isDangerous: boolean,
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

function createWallTerrain(
  boundary: ZoneMortalisBoundaryRef,
  options: {
    isPerimeter?: boolean;
    segmentIndex?: number;
    segmentTopLeft?: { x: number; y: number };
    segmentWidth?: number;
    segmentHeight?: number;
  } = {},
): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const terrainId = typeof options.segmentIndex === 'number'
    ? `${boundaryId('wall', boundary)}-segment-${options.segmentIndex}`
    : boundaryId('wall', boundary);
  const topLeft = options.segmentTopLeft ?? (
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE }
  );
  const width = options.segmentWidth ?? (isHorizontal ? SECTION_SIZE : WALL_THICKNESS);
  const height = options.segmentHeight ?? (isHorizontal ? WALL_THICKNESS : SECTION_SIZE);
  const terrain = createRectTerrain(
    terrainId,
    `Zone Mortalis Wall ${boundaryKey(boundary)}`,
    TerrainType.Impassable,
    topLeft,
    width,
    height,
    false,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      kind: 'wall',
      boundary,
      isPerimeter: options.isPerimeter,
    },
  };
}

function createDoorTerrain(boundary: ZoneMortalisBoundaryRef, width: number): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const offset = (SECTION_SIZE - width) / 2;
  const terrain = createRectTerrain(
    boundaryId('door', boundary),
    `Zone Mortalis Doorway ${boundaryKey(boundary)}`,
    TerrainType.Impassable,
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE + offset, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE + offset },
    isHorizontal ? width : WALL_THICKNESS,
    isHorizontal ? WALL_THICKNESS : width,
    false,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      id: boundaryId('door', boundary),
      kind: 'doorway',
      boundary,
      width,
      state: 'closed',
      armourValue: 12,
      hullPoints: 3,
      maxHullPoints: 3,
    },
  };
}

function createDoorwayWithWallSegments(
  boundary: ZoneMortalisBoundaryRef,
  width: number,
): TerrainPiece[] {
  const isHorizontal = boundary.orientation === 'horizontal';
  const gapOffset = (SECTION_SIZE - width) / 2;
  const pieces: TerrainPiece[] = [];

  if (gapOffset > 0) {
    pieces.push(createWallTerrain(boundary, {
      segmentIndex: 0,
      segmentTopLeft: isHorizontal
        ? { x: boundary.column * SECTION_SIZE, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
        : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE },
      segmentWidth: isHorizontal ? gapOffset : WALL_THICKNESS,
      segmentHeight: isHorizontal ? WALL_THICKNESS : gapOffset,
    }));
  }

  pieces.push(createDoorTerrain(boundary, width));

  const trailingLength = SECTION_SIZE - gapOffset - width;
  if (trailingLength > 0) {
    pieces.push(createWallTerrain(boundary, {
      segmentIndex: 1,
      segmentTopLeft: isHorizontal
        ? {
            x: boundary.column * SECTION_SIZE + gapOffset + width,
            y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2,
          }
        : {
            x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2,
            y: boundary.row * SECTION_SIZE + gapOffset + width,
          },
      segmentWidth: isHorizontal ? trailingLength : WALL_THICKNESS,
      segmentHeight: isHorizontal ? WALL_THICKNESS : trailingLength,
    }));
  }

  return pieces;
}

function createBarricadeTerrain(boundary: ZoneMortalisBoundaryRef): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const terrain = createRectTerrain(
    boundaryId('barricade', boundary),
    `Zone Mortalis Barricade ${boundaryKey(boundary)}`,
    TerrainType.TerrainPiece,
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE + 2, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE + 2 },
    isHorizontal ? SECTION_SIZE - 4 : WALL_THICKNESS,
    isHorizontal ? WALL_THICKNESS : SECTION_SIZE - 4,
    true,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      kind: 'barricade',
      boundary,
    },
  };
}

function createLightAreaTerrain(row: number, column: number): TerrainPiece {
  return createRectTerrain(
    `zm-default-light-${row}-${column}`,
    `Zone Mortalis Light Area ${row + 1}-${column + 1}`,
    TerrainType.LightArea,
    {
      x: column * SECTION_SIZE + (SECTION_SIZE - LIGHT_AREA_SIZE) / 2,
      y: row * SECTION_SIZE + (SECTION_SIZE - LIGHT_AREA_SIZE) / 2,
    },
    LIGHT_AREA_SIZE,
    LIGHT_AREA_SIZE,
    false,
    false,
  );
}

export function createDefaultZoneMortalisTerrain(): TerrainPiece[] {
  const terrain: TerrainPiece[] = [];

  for (let column = 0; column < 4; column++) {
    terrain.push(createWallTerrain({ orientation: 'horizontal', row: 0, column }, { isPerimeter: true }));
    terrain.push(createWallTerrain({ orientation: 'horizontal', row: 4, column }, { isPerimeter: true }));
  }

  for (let row = 0; row < 4; row++) {
    terrain.push(createWallTerrain({ orientation: 'vertical', row, column: 0 }, { isPerimeter: true }));
    terrain.push(createWallTerrain({ orientation: 'vertical', row, column: 4 }, { isPerimeter: true }));
  }

  // Keep the default tooling board recognizably Zone Mortalis, but avoid
  // overloading headless self-play with an unnecessarily dense obstacle graph.
  const interiorBoundaries: Array<{
    boundary: ZoneMortalisBoundaryRef;
    kind: 'wall' | 'door' | 'barricade';
    width?: number;
  }> = [
    { boundary: { orientation: 'vertical', row: 0, column: 1 }, kind: 'door', width: 2 },
    { boundary: { orientation: 'vertical', row: 1, column: 1 }, kind: 'wall' },
    { boundary: { orientation: 'vertical', row: 2, column: 1 }, kind: 'door', width: 4 },
    { boundary: { orientation: 'vertical', row: 0, column: 2 }, kind: 'wall' },
    { boundary: { orientation: 'vertical', row: 1, column: 2 }, kind: 'door', width: 2 },
    { boundary: { orientation: 'vertical', row: 2, column: 2 }, kind: 'door', width: 4 },
    { boundary: { orientation: 'horizontal', row: 1, column: 0 }, kind: 'wall' },
    { boundary: { orientation: 'horizontal', row: 1, column: 1 }, kind: 'door', width: 2 },
    { boundary: { orientation: 'horizontal', row: 2, column: 2 }, kind: 'door', width: 2 },
    { boundary: { orientation: 'horizontal', row: 2, column: 3 }, kind: 'wall' },
  ];

  for (const entry of interiorBoundaries) {
    if (entry.kind === 'wall') {
      terrain.push(createWallTerrain(entry.boundary));
      continue;
    }
    if (entry.kind === 'barricade') {
      terrain.push(createBarricadeTerrain(entry.boundary));
      continue;
    }
    terrain.push(...createDoorwayWithWallSegments(entry.boundary, entry.width ?? 2));
  }

  terrain.push(createBarricadeTerrain({ orientation: 'horizontal', row: 2, column: 1 }));
  terrain.push(createLightAreaTerrain(1, 1));

  return terrain;
}
