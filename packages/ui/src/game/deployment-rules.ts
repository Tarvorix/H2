import { DEPLOYMENT_ENEMY_BUFFER } from '@hh/data';
import { DeploymentMap, TerrainType } from '@hh/types';
import type {
  DeploymentZone,
  GameState,
  Position,
  UnitState,
} from '@hh/types';
import {
  buildUnitDeploymentFormationWithAxes,
  checkCoherency,
  createCircleBase,
  distanceShapes,
  pointInPolygon,
  pointInTerrainShape,
  STANDARD_COHERENCY_RANGE,
} from '@hh/geometry';
import type { DeploymentFormationPreset } from '@hh/geometry';
import { getModelStateBaseSizeMM } from '@hh/engine';

const POSITION_EPSILON = 0.05;
const FORMATION_SHIFT_STEP = 0.5;
const FORMATION_MAX_SHIFT = 12;

function isPointOnSegment(point: Position, start: Position, end: Position): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > POSITION_EPSILON) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < -POSITION_EPSILON) {
    return false;
  }

  const lengthSq = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (dot - lengthSq > POSITION_EPSILON) {
    return false;
  }

  return true;
}

function isPointOnPolygonBoundary(point: Position, vertices: Position[]): boolean {
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    if (isPointOnSegment(point, start, end)) {
      return true;
    }
  }
  return false;
}

export function isPointInDeploymentZone(position: Position, zone: DeploymentZone): boolean {
  return pointInPolygon(position, zone.vertices) || isPointOnPolygonBoundary(position, zone.vertices);
}

export function getDeploymentZoneForPlayer(
  gameState: GameState | null,
  playerIndex: number,
): DeploymentZone | null {
  if (!gameState?.missionState) return null;
  return gameState.missionState.deploymentZones.find((zone) => zone.playerIndex === playerIndex) ?? null;
}

function getDeploymentAxes(
  deploymentMap: DeploymentMap,
  playerIndex: number,
): { lateral: Position; depth: Position } {
  switch (deploymentMap) {
    case DeploymentMap.DawnOfWar:
      return {
        lateral: { x: 0, y: 1 },
        depth: { x: playerIndex === 0 ? 1 : -1, y: 0 },
      };
    case DeploymentMap.SearchAndDestroy: {
      const diagonal = Math.SQRT1_2;
      return playerIndex === 0
        ? {
            lateral: { x: diagonal, y: -diagonal },
            depth: { x: diagonal, y: diagonal },
          }
        : {
            lateral: { x: -diagonal, y: diagonal },
            depth: { x: -diagonal, y: -diagonal },
          };
    }
    case DeploymentMap.HammerAndAnvil:
    default:
      return {
        lateral: { x: 1, y: 0 },
        depth: { x: 0, y: playerIndex === 0 ? 1 : -1 },
      };
  }
}

function rotateFormationAxes(
  axes: { lateral: Position; depth: Position },
  quarterTurns: number,
): { lateral: Position; depth: Position } {
  const normalizedQuarterTurns = ((quarterTurns % 4) + 4) % 4;

  switch (normalizedQuarterTurns) {
    case 1:
      return {
        lateral: axes.depth,
        depth: { x: -axes.lateral.x, y: -axes.lateral.y },
      };
    case 2:
      return {
        lateral: { x: -axes.lateral.x, y: -axes.lateral.y },
        depth: { x: -axes.depth.x, y: -axes.depth.y },
      };
    case 3:
      return {
        lateral: { x: -axes.depth.x, y: -axes.depth.y },
        depth: axes.lateral,
      };
    case 0:
    default:
      return axes;
  }
}

function projectPointOntoAxis(point: Position, axis: Position): number {
  return point.x * axis.x + point.y * axis.y;
}

function getProjectionRange(
  zone: DeploymentZone,
  axis: Position,
): { min: number; max: number } {
  const projections = zone.vertices.map((vertex) => projectPointOntoAxis(vertex, axis));
  return {
    min: Math.min(...projections),
    max: Math.max(...projections),
  };
}

function buildAnchorFromAxisCoordinates(
  axes: { lateral: Position; depth: Position },
  lateralCoordinate: number,
  depthCoordinate: number,
): Position {
  return {
    x: axes.lateral.x * lateralCoordinate + axes.depth.x * depthCoordinate,
    y: axes.lateral.y * lateralCoordinate + axes.depth.y * depthCoordinate,
  };
}

function buildSortedCoordinateSearchValues(
  min: number,
  max: number,
  preferred: number,
  step: number,
): number[] {
  const coordinates: number[] = [];
  for (let value = min; value <= max + POSITION_EPSILON; value += step) {
    coordinates.push(Math.round(value * 10) / 10);
  }

  return coordinates.sort((left, right) => {
    const leftDistance = Math.abs(left - preferred);
    const rightDistance = Math.abs(right - preferred);
    return leftDistance - rightDistance;
  });
}

function isPositionInsideBattlefield(
  position: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
): boolean {
  return (
    position.x >= -POSITION_EPSILON &&
    position.y >= -POSITION_EPSILON &&
    position.x <= battlefieldWidth + POSITION_EPSILON &&
    position.y <= battlefieldHeight + POSITION_EPSILON
  );
}

function areFormationPositionsInsideZone(
  positions: Position[],
  zone: DeploymentZone,
  battlefieldWidth: number,
  battlefieldHeight: number,
): boolean {
  return positions.every((position) =>
    isPositionInsideBattlefield(position, battlefieldWidth, battlefieldHeight) &&
    isPointInDeploymentZone(position, zone),
  );
}

export function buildDeploymentFormationForZone(
  modelCount: number,
  anchor: Position,
  deploymentMap: DeploymentMap,
  playerIndex: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  zone: DeploymentZone,
  preset: DeploymentFormationPreset,
  options: { spacingInches?: number; rotationQuarterTurns?: number } = {},
): Position[] {
  const zoneAxes = getDeploymentAxes(deploymentMap, playerIndex);
  const formationAxes = rotateFormationAxes(zoneAxes, options.rotationQuarterTurns ?? 0);
  const lateralOffsets: number[] = [0];
  for (let offset = FORMATION_SHIFT_STEP; offset <= FORMATION_MAX_SHIFT; offset += FORMATION_SHIFT_STEP) {
    lateralOffsets.push(offset, -offset);
  }

  for (let depthOffset = 0; depthOffset <= FORMATION_MAX_SHIFT; depthOffset += FORMATION_SHIFT_STEP) {
    for (const lateralOffset of lateralOffsets) {
      const shiftedAnchor = {
        x: anchor.x + zoneAxes.depth.x * depthOffset + zoneAxes.lateral.x * lateralOffset,
        y: anchor.y + zoneAxes.depth.y * depthOffset + zoneAxes.lateral.y * lateralOffset,
      };
      const positions = buildUnitDeploymentFormationWithAxes(
        modelCount,
        shiftedAnchor,
        preset,
        formationAxes,
        options.spacingInches,
      );
      if (areFormationPositionsInsideZone(positions, zone, battlefieldWidth, battlefieldHeight)) {
        return positions;
      }
    }
  }

  const lateralRange = getProjectionRange(zone, zoneAxes.lateral);
  const depthRange = getProjectionRange(zone, zoneAxes.depth);
  const preferredLateral = projectPointOntoAxis(anchor, zoneAxes.lateral);
  const preferredDepth = projectPointOntoAxis(anchor, zoneAxes.depth);
  const lateralCoordinates = buildSortedCoordinateSearchValues(
    lateralRange.min,
    lateralRange.max,
    preferredLateral,
    FORMATION_SHIFT_STEP,
  );
  const depthCoordinates = buildSortedCoordinateSearchValues(
    depthRange.min,
    depthRange.max,
    preferredDepth,
    FORMATION_SHIFT_STEP,
  );

  for (const depthCoordinate of depthCoordinates) {
    for (const lateralCoordinate of lateralCoordinates) {
      const candidateAnchor = buildAnchorFromAxisCoordinates(
        zoneAxes,
        lateralCoordinate,
        depthCoordinate,
      );
      const positions = buildUnitDeploymentFormationWithAxes(
        modelCount,
        candidateAnchor,
        preset,
        formationAxes,
        options.spacingInches,
      );
      if (areFormationPositionsInsideZone(positions, zone, battlefieldWidth, battlefieldHeight)) {
        return positions;
      }
    }
  }

  return buildUnitDeploymentFormationWithAxes(
    modelCount,
    anchor,
    preset,
    formationAxes,
    options.spacingInches,
  );
}

export function validateSetupDeploymentPlacement(
  gameState: GameState,
  playerIndex: number,
  unit: UnitState,
  modelPositions: { modelId: string; position: Position }[],
): { valid: boolean; error?: string } {
  const deploymentZone = getDeploymentZoneForPlayer(gameState, playerIndex);
  if (!deploymentZone) {
    return {
      valid: false,
      error: 'Deployment failed: no deployment zone is available for this mission.',
    };
  }

  const positionByModelId = new Map(modelPositions.map((entry) => [entry.modelId, entry.position]));
  const placedShapes = unit.models
    .filter((model) => !model.isDestroyed)
    .map((model) => {
      const position = positionByModelId.get(model.id);
      return position
        ? {
            modelId: model.id,
            shape: createCircleBase(position, getModelStateBaseSizeMM(model)),
            position,
          }
        : null;
    })
    .filter((entry): entry is { modelId: string; shape: ReturnType<typeof createCircleBase>; position: Position } => entry !== null);

  const friendlyShapes = gameState.armies[playerIndex].units
    .filter((otherUnit) => otherUnit.id !== unit.id && otherUnit.isDeployed)
    .flatMap((otherUnit) => otherUnit.models.filter((model) => !model.isDestroyed))
    .map((model) => createCircleBase(model.position, getModelStateBaseSizeMM(model)));

  const enemyShapes = gameState.armies[playerIndex === 0 ? 1 : 0].units
    .filter((otherUnit) => otherUnit.isDeployed)
    .flatMap((otherUnit) => otherUnit.models.filter((model) => !model.isDestroyed))
    .map((model) => createCircleBase(model.position, getModelStateBaseSizeMM(model)));

  for (const placed of placedShapes) {
    if (!isPositionInsideBattlefield(placed.position, gameState.battlefield.width, gameState.battlefield.height)) {
      return {
        valid: false,
        error: 'Deployment failed: models must be placed fully inside the battlefield.',
      };
    }

    if (!isPointInDeploymentZone(placed.position, deploymentZone)) {
      return {
        valid: false,
        error: 'Deployment failed: every model must be inside your mission deployment zone.',
      };
    }

    if (gameState.terrain.some((terrain) =>
      terrain.type === TerrainType.Impassable && pointInTerrainShape(placed.position, terrain.shape),
    )) {
      return {
        valid: false,
        error: 'Deployment failed: models cannot be deployed in impassable terrain.',
      };
    }

    for (const friendlyShape of friendlyShapes) {
      if (distanceShapes(placed.shape, friendlyShape) < -POSITION_EPSILON) {
        return {
          valid: false,
          error: 'Deployment failed: models cannot overlap friendly models that are already deployed.',
        };
      }
    }

    for (const enemyShape of enemyShapes) {
      if (distanceShapes(placed.shape, enemyShape) < DEPLOYMENT_ENEMY_BUFFER - POSITION_EPSILON) {
        return {
          valid: false,
          error: `Deployment failed: models must be at least ${DEPLOYMENT_ENEMY_BUFFER}" away from enemy models.`,
        };
      }
    }
  }

  for (let index = 0; index < placedShapes.length; index++) {
    for (let otherIndex = index + 1; otherIndex < placedShapes.length; otherIndex++) {
      if (distanceShapes(placedShapes[index].shape, placedShapes[otherIndex].shape) < -POSITION_EPSILON) {
        return {
          valid: false,
          error: 'Deployment failed: models in the same unit cannot overlap each other.',
        };
      }
    }
  }

  if (placedShapes.length > 1) {
    const coherencyResult = checkCoherency(
      placedShapes.map((entry) => entry.shape),
      STANDARD_COHERENCY_RANGE,
    );
    if (!coherencyResult.isCoherent) {
      return {
        valid: false,
        error: 'Deployment failed: deployed models must be in unit coherency.',
      };
    }
  }

  return { valid: true };
}
