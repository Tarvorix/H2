/**
 * Deployment AI
 *
 * Handles pre-game unit deployment for the AI player.
 * Places units in the deployment zone with formation logic.
 */

import {
  DeploymentMap,
} from '@hh/types';
import type { DeploymentZone, GameState, Position, UnitState } from '@hh/types';
import { getAliveModels, getModelStateBaseSizeMM } from '@hh/engine';
import {
  buildUnitDeploymentFormation,
  buildUnitDeploymentFormationWithAxes,
  getDeploymentFormationSpacing,
  pointInPolygon,
  vec2Dot,
} from '@hh/geometry';
import type { DeploymentCommand, StrategyMode, AIDeploymentFormation } from '../types';
import { generateLineFormation } from '../helpers/movement-destination';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default battlefield dimensions */
const DEFAULT_BATTLEFIELD_WIDTH = 72;
const DEFAULT_BATTLEFIELD_HEIGHT = 48;

/** Horizontal offset between units to avoid stacking */
const UNIT_HORIZONTAL_OFFSET = 8;
const FORMATION_SHIFT_STEP = 0.5;
const FORMATION_MAX_SHIFT = 12;
const ZONE_EDGE_PADDING = 1;
const POSITION_EPSILON = 0.05;

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate a deployment command for placing the next unit.
 *
 * @param state - Current game state
 * @param playerIndex - AI player index
 * @param deployedUnitIds - IDs of units already deployed
 * @param deploymentZoneDepth - Depth of deployment zone from player edge (typically 12")
 * @param strategy - Strategy mode
 * @returns DeploymentCommand or null if all units are deployed
 */
export function generateDeploymentPlacement(
  state: GameState,
  playerIndex: number,
  deployedUnitIds: string[],
  deploymentZoneDepth: number,
  strategy: StrategyMode,
  deploymentFormation: AIDeploymentFormation = 'auto',
): DeploymentCommand | null {
  const army = state.armies[playerIndex];
  const deployedSet = new Set(deployedUnitIds);

  // Find undeployed units (that aren't in reserves)
  const undeployedUnits = army.units.filter(
    (u) => !deployedSet.has(u.id) && !u.isInReserves && getAliveModels(u).length > 0,
  );

  if (undeployedUnits.length === 0) {
    return null; // All units deployed
  }

  const bfWidth = state.battlefield?.width ?? DEFAULT_BATTLEFIELD_WIDTH;
  const bfHeight = state.battlefield?.height ?? DEFAULT_BATTLEFIELD_HEIGHT;
  const deploymentZone = state.missionState?.deploymentZones.find(
    (zone) => zone.playerIndex === playerIndex,
  ) ?? null;
  const deploymentMap = state.missionState?.deploymentMap ?? null;

  if (deploymentZone && deploymentMap) {
    if (strategy === 'basic') {
      return deployBasicInMissionZone(
        undeployedUnits[0],
        deploymentZone,
        deploymentMap,
        bfWidth,
        bfHeight,
        deployedUnitIds.length,
        playerIndex,
        deploymentFormation,
      );
    }

    return deployTacticalInMissionZone(
      undeployedUnits,
      deploymentZone,
      deploymentMap,
      bfWidth,
      bfHeight,
      deployedUnitIds.length,
      playerIndex,
      deploymentFormation,
    );
  }

  // Calculate deployment zone bounds
  const { zoneMinY, zoneMaxY } = getDeploymentZoneBounds(
    playerIndex,
    deploymentZoneDepth,
    bfHeight,
  );

  if (strategy === 'basic') {
    return deployBasic(
      undeployedUnits[0],
      zoneMinY,
      zoneMaxY,
      bfWidth,
      bfHeight,
      deploymentZoneDepth,
      deployedUnitIds.length,
      playerIndex,
      deploymentFormation,
    );
  }

  return deployTactical(
    undeployedUnits,
    zoneMinY,
    zoneMaxY,
    bfWidth,
    bfHeight,
    deploymentZoneDepth,
    deployedUnitIds.length,
    playerIndex,
    deploymentFormation,
  );
}

// ─── Deployment Zone ─────────────────────────────────────────────────────────

/**
 * Get the deployment zone y-range for a player.
 * Player 0 deploys at the bottom, Player 1 deploys at the top.
 */
function getDeploymentZoneBounds(
  playerIndex: number,
  depth: number,
  battlefieldHeight: number,
): { zoneMinY: number; zoneMaxY: number } {
  if (playerIndex === 0) {
    return { zoneMinY: 1, zoneMaxY: depth };
  }
  return { zoneMinY: battlefieldHeight - depth, zoneMaxY: battlefieldHeight - 1 };
}

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

function isPointInDeploymentZone(position: Position, zone: DeploymentZone): boolean {
  return pointInPolygon(position, zone.vertices) || isPointOnPolygonBoundary(position, zone.vertices);
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

function projectPointOntoAxis(point: Position, axis: Position): number {
  return vec2Dot(point, axis);
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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
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

function buildFormationPositionsForMissionZone(
  modelCount: number,
  zone: DeploymentZone,
  deploymentMap: DeploymentMap,
  playerIndex: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  preferredDepth: number,
  deployedCount: number,
  deploymentFormation: AIDeploymentFormation,
  spacingInches: number,
): Position[] {
  const axes = getDeploymentAxes(deploymentMap, playerIndex);
  const depthRange = getProjectionRange(zone, axes.depth);
  const lateralRange = getProjectionRange(zone, axes.lateral);
  const depthSpan = depthRange.max - depthRange.min;
  const lateralMin = lateralRange.min + ZONE_EDGE_PADDING;
  const lateralMax = lateralRange.max - ZONE_EDGE_PADDING;
  const lateralSpan = Math.max(0, lateralMax - lateralMin);
  const effectiveFormation = deploymentFormation === 'auto' ? 'line' : deploymentFormation;
  const preferredDepthCoordinate = depthRange.min + depthSpan * clamp(preferredDepth, 0, 1);
  const preferredLateralCoordinate = lateralSpan > 0
    ? lateralMin + ((deployedCount * UNIT_HORIZONTAL_OFFSET) % Math.max(UNIT_HORIZONTAL_OFFSET, lateralSpan))
    : (lateralRange.min + lateralRange.max) / 2;
  const initialAnchor = buildAnchorFromAxisCoordinates(
    axes,
    clamp(preferredLateralCoordinate, lateralMin, lateralMax),
    preferredDepthCoordinate,
  );

  const lateralOffsets: number[] = [0];
  for (let offset = FORMATION_SHIFT_STEP; offset <= FORMATION_MAX_SHIFT; offset += FORMATION_SHIFT_STEP) {
    lateralOffsets.push(offset, -offset);
  }

  const depthOffsets: number[] = [0];
  for (let offset = FORMATION_SHIFT_STEP; offset <= FORMATION_MAX_SHIFT; offset += FORMATION_SHIFT_STEP) {
    depthOffsets.push(offset, -offset);
  }

  for (const depthOffset of depthOffsets) {
    for (const lateralOffset of lateralOffsets) {
      const shiftedAnchor = {
        x: initialAnchor.x + axes.depth.x * depthOffset + axes.lateral.x * lateralOffset,
        y: initialAnchor.y + axes.depth.y * depthOffset + axes.lateral.y * lateralOffset,
      };
      const positions = buildUnitDeploymentFormationWithAxes(
        modelCount,
        shiftedAnchor,
        effectiveFormation,
        axes,
        spacingInches,
      );
      if (areFormationPositionsInsideZone(positions, zone, battlefieldWidth, battlefieldHeight)) {
        return positions;
      }
    }
  }

  return buildUnitDeploymentFormationWithAxes(
    modelCount,
    initialAnchor,
    effectiveFormation,
    axes,
    spacingInches,
  );
}

// ─── Basic Deployment ────────────────────────────────────────────────────────

/**
 * Basic deployment: line formation at the center of the zone.
 * Each subsequent unit is offset horizontally.
 */
function deployBasic(
  unit: UnitState,
  zoneMinY: number,
  zoneMaxY: number,
  bfWidth: number,
  bfHeight: number,
  deploymentZoneDepth: number,
  deployedCount: number,
  playerIndex: number,
  deploymentFormation: AIDeploymentFormation,
): DeploymentCommand {
  const aliveModels = getAliveModels(unit);
  const preferredY = 0.5;
  const formationSpacing = getDeploymentFormationSpacing(
    aliveModels.map((model) => getModelStateBaseSizeMM(model)),
  );

  // Offset each unit horizontally to avoid stacking
  const xOffset = (deployedCount * UNIT_HORIZONTAL_OFFSET) % (bfWidth - 10);

  const offsetPositions = buildFormationPositions(
    aliveModels.length,
    zoneMinY,
    zoneMaxY,
    bfWidth,
    bfHeight,
    deploymentZoneDepth,
    preferredY,
    xOffset,
    playerIndex,
    deploymentFormation,
    formationSpacing,
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, i) => ({
      modelId: model.id,
      position: offsetPositions[i] ?? offsetPositions[0],
    })),
  };
}

function deployBasicInMissionZone(
  unit: UnitState,
  zone: DeploymentZone,
  deploymentMap: DeploymentMap,
  bfWidth: number,
  bfHeight: number,
  deployedCount: number,
  playerIndex: number,
  deploymentFormation: AIDeploymentFormation,
): DeploymentCommand {
  const aliveModels = getAliveModels(unit);
  const formationSpacing = getDeploymentFormationSpacing(
    aliveModels.map((model) => getModelStateBaseSizeMM(model)),
  );
  const positions = buildFormationPositionsForMissionZone(
    aliveModels.length,
    zone,
    deploymentMap,
    playerIndex,
    bfWidth,
    bfHeight,
    0.5,
    deployedCount,
    deploymentFormation,
    formationSpacing,
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, index) => ({
      modelId: model.id,
      position: positions[index] ?? positions[0],
    })),
  };
}

// ─── Tactical Deployment ─────────────────────────────────────────────────────

/**
 * Tactical deployment: position units based on their role.
 * - Units with many weapons: toward the back (shooting platform)
 * - Units with few/no weapons: toward the front (assault units)
 * - Spread units across the frontage
 */
function deployTactical(
  undeployedUnits: UnitState[],
  zoneMinY: number,
  zoneMaxY: number,
  bfWidth: number,
  bfHeight: number,
  deploymentZoneDepth: number,
  deployedCount: number,
  playerIndex: number,
  deploymentFormation: AIDeploymentFormation,
): DeploymentCommand {
  const unit = undeployedUnits[0];
  const aliveModels = getAliveModels(unit);
  const formationSpacing = getDeploymentFormationSpacing(
    aliveModels.map((model) => getModelStateBaseSizeMM(model)),
  );

  // Determine if this is a "ranged" or "assault" unit based on equipped weapons
  const totalWeapons = aliveModels.reduce(
    (acc, m) => acc + m.equippedWargear.length,
    0,
  );
  const avgWeaponsPerModel = aliveModels.length > 0 ? totalWeapons / aliveModels.length : 0;

  // Ranged units (>= 1 weapon per model average): deploy toward the back
  // Assault units (< 1 weapon per model): deploy toward the front
  const preferredY = avgWeaponsPerModel >= 1 ? 0.8 : 0.2;

  // Offset horizontally based on deployment order
  const xOffset = (deployedCount * UNIT_HORIZONTAL_OFFSET) % (bfWidth - 10);
  const offsetPositions = buildFormationPositions(
    aliveModels.length,
    zoneMinY,
    zoneMaxY,
    bfWidth,
    bfHeight,
    deploymentZoneDepth,
    preferredY,
    xOffset,
    playerIndex,
    deploymentFormation,
    formationSpacing,
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, i) => ({
      modelId: model.id,
      position: offsetPositions[i] ?? offsetPositions[0],
    })),
  };
}

function deployTacticalInMissionZone(
  undeployedUnits: UnitState[],
  zone: DeploymentZone,
  deploymentMap: DeploymentMap,
  bfWidth: number,
  bfHeight: number,
  deployedCount: number,
  playerIndex: number,
  deploymentFormation: AIDeploymentFormation,
): DeploymentCommand {
  const unit = undeployedUnits[0];
  const aliveModels = getAliveModels(unit);
  const formationSpacing = getDeploymentFormationSpacing(
    aliveModels.map((model) => getModelStateBaseSizeMM(model)),
  );
  const totalWeapons = aliveModels.reduce(
    (acc, model) => acc + model.equippedWargear.length,
    0,
  );
  const avgWeaponsPerModel = aliveModels.length > 0 ? totalWeapons / aliveModels.length : 0;
  const preferredDepth = avgWeaponsPerModel >= 1 ? 0.8 : 0.2;
  const positions = buildFormationPositionsForMissionZone(
    aliveModels.length,
    zone,
    deploymentMap,
    playerIndex,
    bfWidth,
    bfHeight,
    preferredDepth,
    deployedCount,
    deploymentFormation,
    formationSpacing,
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, index) => ({
      modelId: model.id,
      position: positions[index] ?? positions[0],
    })),
  };
}

function buildFormationPositions(
  modelCount: number,
  zoneMinY: number,
  zoneMaxY: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  deploymentZoneDepth: number,
  preferredY: number,
  xOffset: number,
  playerIndex: number,
  deploymentFormation: AIDeploymentFormation,
  spacingInches: number,
) {
  if (deploymentFormation === 'auto') {
    const positions = generateLineFormation(
      modelCount,
      zoneMinY,
      zoneMaxY,
      battlefieldWidth,
      battlefieldHeight,
      preferredY,
      spacingInches,
    );

    return positions.map((p) => ({
      x: Math.max(0.5, Math.min(battlefieldWidth - 0.5, p.x + xOffset - battlefieldWidth / 4)),
      y: p.y,
    }));
  }

  const zoneDepth = zoneMaxY - zoneMinY;
  const anchor = {
    x: battlefieldWidth / 4 + xOffset,
    y: zoneMinY + zoneDepth * Math.max(0, Math.min(1, preferredY)),
  };

  return buildUnitDeploymentFormation(
    modelCount,
    anchor,
    playerIndex,
    battlefieldWidth,
    battlefieldHeight,
    deploymentZoneDepth,
    deploymentFormation,
    spacingInches,
  );
}
