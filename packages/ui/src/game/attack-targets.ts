import type { AttackTargetRef, GameState, ModelState, TerrainPiece } from '@hh/types';
import {
  checkWeaponRange,
  TEMPLATE_EFFECTIVE_RANGE_INCHES,
  findUnit,
  getClosestModelDistance,
  getModelShape,
  getModelsWithLOSToUnit,
  hasLOSToUnit,
  getWeaponSelectionOptions,
  getZoneMortalisBlockingTerrainPieces,
  getZoneMortalisMeasurementDistanceIgnoringTerrain,
  hasZoneMortalisLineOfSightIgnoringTerrain,
  isZoneMortalisGame,
} from '@hh/engine';
import {
  closestPointOnShape,
  createRectHull,
  distanceShapes,
  getRectCorners,
  hasLOS,
} from '@hh/geometry';

function findDoorwayTerrain(
  gameState: GameState,
  doorwayId: string,
): (TerrainPiece & {
  shape: Extract<TerrainPiece['shape'], { kind: 'rectangle' }>;
}) | null {
  const terrain = gameState.terrain.find((piece) => piece.id === doorwayId);
  if (!terrain || terrain.zoneMortalis?.kind !== 'doorway' || terrain.shape.kind !== 'rectangle') {
    return null;
  }

  return terrain as TerrainPiece & {
    shape: Extract<TerrainPiece['shape'], { kind: 'rectangle' }>;
  };
}

function createDoorwayHull(
  doorwayTerrain: TerrainPiece & {
    shape: Extract<TerrainPiece['shape'], { kind: 'rectangle' }>;
  },
) {
  return createRectHull(
    {
      x: doorwayTerrain.shape.topLeft.x + doorwayTerrain.shape.width / 2,
      y: doorwayTerrain.shape.topLeft.y + doorwayTerrain.shape.height / 2,
    },
    doorwayTerrain.shape.width,
    doorwayTerrain.shape.height,
    0,
  );
}

function getDoorwaySamplePoints(
  doorwayTerrain: TerrainPiece & {
    shape: Extract<TerrainPiece['shape'], { kind: 'rectangle' }>;
  },
) {
  const hull = createDoorwayHull(doorwayTerrain);
  const corners = getRectCorners(hull);
  const center = {
    x: doorwayTerrain.shape.topLeft.x + doorwayTerrain.shape.width / 2,
    y: doorwayTerrain.shape.topLeft.y + doorwayTerrain.shape.height / 2,
  };
  const topMid = {
    x: doorwayTerrain.shape.topLeft.x + doorwayTerrain.shape.width / 2,
    y: doorwayTerrain.shape.topLeft.y,
  };
  const bottomMid = {
    x: doorwayTerrain.shape.topLeft.x + doorwayTerrain.shape.width / 2,
    y: doorwayTerrain.shape.topLeft.y + doorwayTerrain.shape.height,
  };
  const leftMid = {
    x: doorwayTerrain.shape.topLeft.x,
    y: doorwayTerrain.shape.topLeft.y + doorwayTerrain.shape.height / 2,
  };
  const rightMid = {
    x: doorwayTerrain.shape.topLeft.x + doorwayTerrain.shape.width,
    y: doorwayTerrain.shape.topLeft.y + doorwayTerrain.shape.height / 2,
  };

  return [
    center,
    topMid,
    bottomMid,
    leftMid,
    rightMid,
    ...corners,
  ];
}

function getRangedWeaponIdsForModel(model: ModelState): string[] {
  return model.equippedWargear.length > 0 ? model.equippedWargear : ['bolter'];
}

export function getAttackTargetLabel(
  gameState: GameState,
  target: AttackTargetRef,
): string {
  if (target.kind === 'unit') {
    return findUnit(gameState, target.unitId)?.profileId ?? 'Unknown Unit';
  }

  const doorway = gameState.zoneMortalisState?.doorways.find((entry) => entry.id === target.doorwayId);
  if (!doorway) {
    return `Doorway ${target.doorwayId}`;
  }

  return `Doorway ${doorway.boundary.orientation} ${doorway.boundary.row},${doorway.boundary.column}`;
}

export function getDoorwayDistanceForModel(
  gameState: GameState,
  model: ModelState,
  doorwayId: string,
): number {
  const doorwayTerrain = findDoorwayTerrain(gameState, doorwayId);
  if (!doorwayTerrain) {
    return Number.POSITIVE_INFINITY;
  }

  const modelShape = getModelShape(model);
  const doorwayHull = createDoorwayHull(doorwayTerrain);
  if (!isZoneMortalisGame(gameState)) {
    return distanceShapes(modelShape, doorwayHull);
  }

  const samplePoints = getDoorwaySamplePoints(doorwayTerrain);
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const point of samplePoints) {
    const fromPoint = closestPointOnShape(modelShape, point);
    const measured = getZoneMortalisMeasurementDistanceIgnoringTerrain(
      gameState,
      fromPoint,
      point,
      [doorwayId],
    );
    if (measured === null) {
      continue;
    }
    if (measured < closestDistance) {
      closestDistance = measured;
    }
  }

  return closestDistance;
}

export function getClosestAttackTargetDistance(
  gameState: GameState,
  attackerUnitId: string,
  target: AttackTargetRef,
): number {
  if (target.kind === 'unit') {
    return getClosestModelDistance(gameState, attackerUnitId, target.unitId);
  }

  const attackerUnit = findUnit(gameState, attackerUnitId);
  if (!attackerUnit) {
    return Number.POSITIVE_INFINITY;
  }

  return attackerUnit.models
    .filter((model) => !model.isDestroyed)
    .reduce((closest, model) => (
      Math.min(closest, getDoorwayDistanceForModel(gameState, model, target.doorwayId))
    ), Number.POSITIVE_INFINITY);
}

export function getModelsWithLOSToDoorway(
  gameState: GameState,
  attackerUnitId: string,
  doorwayId: string,
): string[] {
  const attackerUnit = findUnit(gameState, attackerUnitId);
  const doorwayTerrain = findDoorwayTerrain(gameState, doorwayId);
  if (!attackerUnit || !doorwayTerrain) {
    return [];
  }

  const doorwayHull = createDoorwayHull(doorwayTerrain);
  const doorwayPoints = getDoorwaySamplePoints(doorwayTerrain);
  const blockingTerrain = isZoneMortalisGame(gameState)
    ? getZoneMortalisBlockingTerrainPieces(gameState).filter((piece) => piece.id !== doorwayId)
    : gameState.terrain.filter((piece) => piece.id !== doorwayId);

  return attackerUnit.models
    .filter((model) => !model.isDestroyed)
    .filter((model) => {
      const modelShape = getModelShape(model);
      if (!hasLOS(modelShape, doorwayHull, blockingTerrain, [])) {
        return false;
      }

      if (!isZoneMortalisGame(gameState)) {
        return true;
      }

      return doorwayPoints.some((point) => hasZoneMortalisLineOfSightIgnoringTerrain(
        gameState,
        model.position,
        point,
        [doorwayId],
      ));
    })
    .map((model) => model.id);
}

export function hasLineOfSightToAttackTarget(
  gameState: GameState,
  attackerUnitId: string,
  target: AttackTargetRef,
): boolean {
  if (target.kind === 'unit') {
    return hasLOSToUnit(gameState, attackerUnitId, target.unitId);
  }

  return getModelsWithLOSToDoorway(gameState, attackerUnitId, target.doorwayId).length > 0;
}

export function canAnyWeaponReachAttackTarget(
  gameState: GameState,
  attackerUnitId: string,
  target: AttackTargetRef,
): boolean {
  const attackerUnit = findUnit(gameState, attackerUnitId);
  if (!attackerUnit) {
    return false;
  }

  if (target.kind === 'unit') {
    const targetUnit = findUnit(gameState, target.unitId);
    if (!targetUnit) {
      return false;
    }

    const aliveTargets = targetUnit.models.filter((model) => !model.isDestroyed);
    const closestDistance = getClosestModelDistance(gameState, attackerUnitId, target.unitId);
    const modelsWithLOS = new Set(
      getModelsWithLOSToUnit(gameState, attackerUnitId, target.unitId).map((model) => model.id),
    );

    return attackerUnit.models
      .filter((model) => !model.isDestroyed)
      .some((model) => getRangedWeaponIdsForModel(model).some((weaponId) =>
        getWeaponSelectionOptions(
          { modelId: model.id, weaponId },
          attackerUnit,
          gameState,
          closestDistance,
        ).some((option) => {
          if (!modelsWithLOS.has(model.id)) {
            return false;
          }
          const effectiveRange = option.weaponProfile.hasTemplate
            ? TEMPLATE_EFFECTIVE_RANGE_INCHES
            : option.weaponProfile.range;
          if (effectiveRange <= 0) {
            return false;
          }
          return checkWeaponRange(
            model,
            aliveTargets,
            effectiveRange,
            option.weaponProfile.rangeBand?.min ?? 0,
            0,
            gameState,
          );
        }),
      ));
  }

  return attackerUnit.models
    .filter((model) => !model.isDestroyed)
    .some((model) => getRangedWeaponIdsForModel(model).some((weaponId) => {
      const targetDistance = getDoorwayDistanceForModel(gameState, model, target.doorwayId);
      return getWeaponSelectionOptions(
        { modelId: model.id, weaponId },
        attackerUnit,
        gameState,
        Number.isFinite(targetDistance) ? targetDistance : undefined,
      ).some((option) => {
        const effectiveRange = option.weaponProfile.hasTemplate
          ? TEMPLATE_EFFECTIVE_RANGE_INCHES
          : option.weaponProfile.range;
        if (effectiveRange <= 0) {
          return false;
        }
        const minimumRange = option.weaponProfile.rangeBand?.min ?? 0;
        return targetDistance > minimumRange && targetDistance <= effectiveRange;
      });
    }));
}
