/**
 * Deployment AI
 *
 * Handles pre-game unit deployment for the AI player.
 * Places units in the deployment zone with formation logic.
 */

import type { GameState, UnitState } from '@hh/types';
import { getAliveModels } from '@hh/engine';
import { buildUnitDeploymentFormation } from '@hh/geometry';
import type { DeploymentCommand, StrategyMode, AIDeploymentFormation } from '../types';
import { generateLineFormation } from '../helpers/movement-destination';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default battlefield dimensions */
const DEFAULT_BATTLEFIELD_WIDTH = 72;
const DEFAULT_BATTLEFIELD_HEIGHT = 48;

/** Horizontal offset between units to avoid stacking */
const UNIT_HORIZONTAL_OFFSET = 8;

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
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, i) => ({
      modelId: model.id,
      position: offsetPositions[i] ?? offsetPositions[0],
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
  );

  return {
    unitId: unit.id,
    modelPositions: aliveModels.map((model, i) => ({
      modelId: model.id,
      position: offsetPositions[i] ?? offsetPositions[0],
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
) {
  if (deploymentFormation === 'auto') {
    const positions = generateLineFormation(
      modelCount,
      zoneMinY,
      zoneMaxY,
      battlefieldWidth,
      battlefieldHeight,
      preferredY,
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
  );
}
