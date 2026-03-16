import type {
  DeclareShootingCommand,
  GameState,
  ModelState,
  Position,
  TerrainPiece,
} from '@hh/types';
import { VehicleFacing } from '@hh/types';
import type {
  ArmourPenetrationRollEvent,
  BlastMarkerPlacedEvent,
  CommandResult,
  DiceProvider,
  FireGroupResolvedEvent,
  GameEvent,
  ScatterRollEvent,
  TemplatePlacedEvent,
  ValidationError,
} from '../types';
import {
  applyScatter,
  blastOverlap,
  blastSizeToRadius,
  closestPointOnShape,
  createRectHull,
  createStandardTemplate,
  distanceShapes,
  getRectCorners,
  hasLOS,
  pointInTerrainShape,
  templateOverlap,
  terrainChordLength,
} from '@hh/geometry';
import { findModel, findUnit, getAliveModels, getModelShape } from '../game-queries';
import { applyWoundsToModel, updateModelInUnit, updateUnitInGameState } from '../state-helpers';
import { resolveArmourPenetration } from '../shooting/armour-penetration';
import { formFireGroups } from '../shooting/fire-groups';
import { processGetsHot, resolveFireGroupHits } from '../shooting/hit-resolution';
import { validateAttackerEligibility } from '../shooting/shooting-validator';
import { validateWeaponAssignments } from '../shooting/weapon-declaration';
import { getBlastSizeInches } from '../shooting/special-shot-resolution';
import type {
  FireGroup,
  HitResult,
  ResolvedWeaponProfileModifier,
  WeaponAssignment,
} from '../shooting/shooting-types';
import {
  getZoneMortalisBlockingTerrainPieces,
  getZoneMortalisDoorway,
  getZoneMortalisMeasurementDistanceIgnoringTerrain,
  hasZoneMortalisLineOfSightIgnoringTerrain,
  isZoneMortalisGame,
  updateZoneMortalisDoorway,
} from './zone-mortalis';

type DoorwayTerrainPiece = TerrainPiece & {
  shape: Extract<TerrainPiece['shape'], { kind: 'rectangle' }>;
};

interface DoorwayShootingOptions {
  weaponProfileModifier?: ResolvedWeaponProfileModifier;
}

function rejectDoorwayShooting(
  state: GameState,
  code: string,
  message: string,
): CommandResult {
  return {
    state,
    events: [],
    errors: [{ code, message }],
    accepted: false,
  };
}

export function findDoorwayTerrain(
  state: GameState,
  doorwayId: string,
): DoorwayTerrainPiece | null {
  const terrain = state.terrain.find((piece) => piece.id === doorwayId);
  if (!terrain || terrain.zoneMortalis?.kind !== 'doorway' || terrain.shape.kind !== 'rectangle') {
    return null;
  }

  return terrain as DoorwayTerrainPiece;
}

export function createDoorwayHull(terrain: DoorwayTerrainPiece) {
  return createRectHull(
    {
      x: terrain.shape.topLeft.x + terrain.shape.width / 2,
      y: terrain.shape.topLeft.y + terrain.shape.height / 2,
    },
    terrain.shape.width,
    terrain.shape.height,
    0,
  );
}

export function getDoorwayCenter(terrain: DoorwayTerrainPiece): Position {
  return {
    x: terrain.shape.topLeft.x + terrain.shape.width / 2,
    y: terrain.shape.topLeft.y + terrain.shape.height / 2,
  };
}

export function getDoorwaySamplePoints(terrain: DoorwayTerrainPiece): Position[] {
  const hull = createDoorwayHull(terrain);
  const corners = getRectCorners(hull);
  const center = getDoorwayCenter(terrain);

  return [
    center,
    { x: center.x, y: terrain.shape.topLeft.y },
    { x: center.x, y: terrain.shape.topLeft.y + terrain.shape.height },
    { x: terrain.shape.topLeft.x, y: center.y },
    { x: terrain.shape.topLeft.x + terrain.shape.width, y: center.y },
    ...corners,
  ];
}

export function getDoorwayDistanceForModel(
  state: GameState,
  model: ModelState,
  doorwayId: string,
  terrain: DoorwayTerrainPiece,
): number {
  const modelShape = getModelShape(model);
  const doorwayHull = createDoorwayHull(terrain);
  if (!isZoneMortalisGame(state)) {
    return distanceShapes(modelShape, doorwayHull);
  }

  return getDoorwaySamplePoints(terrain).reduce((closest, point) => {
    const fromPoint = closestPointOnShape(modelShape, point);
    const measured = getZoneMortalisMeasurementDistanceIgnoringTerrain(
      state,
      fromPoint,
      point,
      [doorwayId],
    );
    if (measured === null) {
      return closest;
    }
    return Math.min(closest, measured);
  }, Number.POSITIVE_INFINITY);
}

export function getModelsWithLOSToDoorway(
  state: GameState,
  attackerUnitId: string,
  doorwayId: string,
  terrain: DoorwayTerrainPiece,
): string[] {
  const attackerUnit = findUnit(state, attackerUnitId);
  if (!attackerUnit) {
    return [];
  }

  const doorwayHull = createDoorwayHull(terrain);
  const doorwayPoints = getDoorwaySamplePoints(terrain);
  const blockingTerrain = isZoneMortalisGame(state)
    ? getZoneMortalisBlockingTerrainPieces(state).filter((piece) => piece.id !== doorwayId)
    : state.terrain.filter((piece) => piece.id !== doorwayId);

  return getAliveModels(attackerUnit)
    .filter((model) => {
      const modelShape = getModelShape(model);
      if (!hasLOS(modelShape, doorwayHull, blockingTerrain, [])) {
        return false;
      }

      if (!isZoneMortalisGame(state)) {
        return true;
      }

      return doorwayPoints.some((point) => hasZoneMortalisLineOfSightIgnoringTerrain(
        state,
        model.position,
        point,
        [doorwayId],
      ));
    })
    .map((model) => model.id);
}

function rollScatterResult(dice: DiceProvider): { angle: number; distance: number; isHit: boolean } {
  const scatter = dice.rollScatter();
  if (scatter.direction <= 2) {
    return { angle: 0, distance: 0, isHit: true };
  }

  const angleByFace: Record<number, number> = {
    3: 0,
    4: Math.PI / 2,
    5: Math.PI,
    6: (3 * Math.PI) / 2,
  };

  return {
    angle: angleByFace[scatter.direction] ?? 0,
    distance: scatter.distance,
    isHit: false,
  };
}

function clampScatterPositionForZoneMortalis(
  state: GameState,
  origin: Position,
  target: Position,
): Position {
  if (!isZoneMortalisGame(state)) {
    return target;
  }

  const blockingTerrain = getZoneMortalisBlockingTerrainPieces(state);
  const isBlocked = (position: Position): boolean => blockingTerrain.some((terrain) =>
    terrainChordLength(origin, position, terrain) > 0.0001,
  );

  if (!isBlocked(target)) {
    return target;
  }

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration++) {
    const mid = (low + high) / 2;
    const point = {
      x: origin.x + (target.x - origin.x) * mid,
      y: origin.y + (target.y - origin.y) * mid,
    };
    if (isBlocked(point)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const clamped = {
    x: origin.x + (target.x - origin.x) * low,
    y: origin.y + (target.y - origin.y) * low,
  };
  return blockingTerrain.some((terrain) => pointInTerrainShape(clamped, terrain.shape))
    ? {
        x: origin.x + (target.x - origin.x) * Math.max(0, low - 0.0005),
        y: origin.y + (target.y - origin.y) * Math.max(0, low - 0.0005),
      }
    : clamped;
}

function buildTemplateAutoHits(
  fireGroup: FireGroup,
): HitResult[] {
  const hits: HitResult[] = [];

  for (const attack of fireGroup.attacks) {
    for (let index = 0; index < attack.firepower; index++) {
      hits.push({
        diceRoll: 0,
        targetNumber: 0,
        isHit: true,
        isCritical: false,
        isPrecision: false,
        isRending: false,
        isAutoHit: true,
        sourceModelId: attack.modelId,
        weaponStrength: fireGroup.weaponProfile.rangedStrength,
        weaponAP: fireGroup.weaponProfile.ap,
        weaponDamage: fireGroup.weaponProfile.damage,
        specialRules: [...fireGroup.weaponProfile.specialRules],
      });
    }
  }

  return hits;
}

function resolveDoorwayTemplateFireGroup(
  state: GameState,
  doorwayTerrain: DoorwayTerrainPiece,
  fireGroup: FireGroup,
): { hits: HitResult[]; events: GameEvent[]; errors: ValidationError[] } {
  const sourceModelId = fireGroup.attacks[0]?.modelId;
  if (!sourceModelId) {
    return {
      hits: [],
      events: [],
      errors: [{
        code: 'INVALID_TEMPLATE_ATTACK',
        message: `Template fire group "${fireGroup.weaponName}" has no source model.`,
      }],
    };
  }

  const sourceModelInfo = findModel(state, sourceModelId);
  if (!sourceModelInfo) {
    return {
      hits: [],
      events: [],
      errors: [{
        code: 'INVALID_TEMPLATE_ATTACK',
        message: `Template source model "${sourceModelId}" was not found.`,
      }],
    };
  }

  const doorwayCenter = getDoorwayCenter(doorwayTerrain);
  const directionRadians = Math.atan2(
    doorwayCenter.y - sourceModelInfo.model.position.y,
    doorwayCenter.x - sourceModelInfo.model.position.x,
  );
  const templateOrigin = closestPointOnShape(getModelShape(sourceModelInfo.model), doorwayCenter);
  const template = createStandardTemplate(templateOrigin, directionRadians);
  const overlapsDoorway = templateOverlap(template, [createDoorwayHull(doorwayTerrain)]).length > 0;

  const event: TemplatePlacedEvent = {
    type: 'templatePlaced',
    origin: templateOrigin,
    modelsHit: [],
  };

  return {
    hits: overlapsDoorway ? buildTemplateAutoHits(fireGroup) : [],
    events: [event],
    errors: [],
  };
}

function resolveDoorwayBlastFireGroup(
  state: GameState,
  doorwayTerrain: DoorwayTerrainPiece,
  fireGroup: FireGroup,
  hitTestResults: HitResult[],
  hitTestEvents: GameEvent[],
  dice: DiceProvider,
): { hits: HitResult[]; events: GameEvent[]; errors: ValidationError[] } {
  const blastSize = getBlastSizeInches(fireGroup.specialRules);
  if (blastSize === null) {
    return { hits: hitTestResults.filter((hit) => hit.isHit), events: hitTestEvents, errors: [] };
  }

  const doorwayCenter = getDoorwayCenter(doorwayTerrain);
  const doorwayHull = createDoorwayHull(doorwayTerrain);
  const directHits = hitTestResults.filter((hit) => hit.isHit);
  const missedHits = hitTestResults.filter((hit) => !hit.isHit);
  const resolvedHits = [...directHits];
  const events: GameEvent[] = [
    ...hitTestEvents,
    {
      type: 'blastMarkerPlaced',
      center: doorwayCenter,
      radius: blastSizeToRadius(blastSize),
      modelsHit: [],
      scattered: false,
    } as BlastMarkerPlacedEvent,
  ];

  for (const missedHit of missedHits) {
    const scatter = rollScatterResult(dice);
    const finalPosition = clampScatterPositionForZoneMortalis(
      state,
      doorwayCenter,
      applyScatter(doorwayCenter, scatter),
    );

    events.push({
      type: 'scatterRoll',
      diceRoll: scatter.distance,
      angle: scatter.angle,
      distance: scatter.distance,
      isHit: scatter.isHit,
      originalPosition: doorwayCenter,
      finalPosition,
    } as ScatterRollEvent);

    if (blastOverlap(finalPosition, blastSizeToRadius(blastSize), [doorwayHull]).length > 0) {
      resolvedHits.push({
        ...missedHit,
        isHit: true,
        isCritical: false,
        isPrecision: false,
        isRending: false,
      });
    }
  }

  return {
    hits: resolvedHits,
    events,
    errors: [],
  };
}

export function applyDoorwayDamage(
  state: GameState,
  doorwayId: string,
  damage: number,
): { state: GameState; events: GameEvent[] } {
  if (damage <= 0) {
    return { state, events: [] };
  }

  const doorway = getZoneMortalisDoorway(state, doorwayId);
  if (!doorway) {
    return { state, events: [] };
  }

  const hullPointsRemaining = Math.max(0, doorway.hullPoints - damage);
  let newState = updateZoneMortalisDoorway(state, doorwayId, (currentDoorway) => ({
    ...currentDoorway,
    id: doorwayId,
    hullPoints: hullPointsRemaining,
    state: hullPointsRemaining <= 0 ? 'destroyed' : currentDoorway.state,
  }));

  const events: GameEvent[] = [{
    type: 'doorwayDamaged',
    doorwayId,
    hullPointsRemaining,
    destroyed: hullPointsRemaining <= 0,
  }];

  if (hullPointsRemaining <= 0 && doorway.state !== 'destroyed') {
    events.push({
      type: 'doorwayStateChanged',
      doorwayId,
      previousState: doorway.state,
      newState: 'destroyed',
    });
  }

  return {
    state: newState,
    events,
  };
}

export function handleZoneMortalisDoorwayShootingAttack(
  state: GameState,
  command: DeclareShootingCommand,
  dice: DiceProvider,
  options: DoorwayShootingOptions = {},
): CommandResult {
  if (!isZoneMortalisGame(state)) {
    return rejectDoorwayShooting(
      state,
      'INVALID_TARGET',
      'Doorway targets may only be used in Zone Mortalis games.',
    );
  }

  const doorwayId = command.targetDoorwayId ?? (
    command.target?.kind === 'doorway' ? command.target.doorwayId : undefined
  );
  if (!doorwayId) {
    return rejectDoorwayShooting(state, 'DOORWAY_NOT_FOUND', 'A doorway target is required.');
  }

  const attackerValidation = validateAttackerEligibility(state, command.attackingUnitId);
  if (!attackerValidation.valid) {
    const firstError = attackerValidation.errors[0];
    return rejectDoorwayShooting(state, firstError.code, firstError.message);
  }

  const doorway = getZoneMortalisDoorway(state, doorwayId);
  const doorwayTerrain = findDoorwayTerrain(state, doorwayId);
  if (!doorway || !doorwayTerrain) {
    return rejectDoorwayShooting(state, 'DOORWAY_NOT_FOUND', `Doorway "${doorwayId}" was not found.`);
  }
  if (doorway.state === 'destroyed' || doorway.hullPoints <= 0) {
    return rejectDoorwayShooting(state, 'DOORWAY_DESTROYED', 'Destroyed doorways cannot be targeted.');
  }

  const attackerUnit = findUnit(state, command.attackingUnitId);
  if (!attackerUnit) {
    return rejectDoorwayShooting(state, 'ATTACKER_NOT_FOUND', `Attacking unit "${command.attackingUnitId}" was not found.`);
  }

  const modelsWithLOS = getModelsWithLOSToDoorway(state, command.attackingUnitId, doorwayId, doorwayTerrain);
  if (modelsWithLOS.length === 0) {
    return rejectDoorwayShooting(state, 'NO_LOS', 'No attacking models have line of sight to the doorway.');
  }

  const targetDistance = getAliveModels(attackerUnit).reduce((closest, model) => (
    Math.min(closest, getDoorwayDistanceForModel(state, model, doorwayId, doorwayTerrain))
  ), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(targetDistance)) {
    return rejectDoorwayShooting(state, 'TARGET_OUT_OF_RANGE', 'No legal measurement path exists to the doorway.');
  }

  const weaponAssignments: WeaponAssignment[] = command.weaponSelections.map((selection) => ({
    modelId: selection.modelId,
    weaponId: selection.weaponId,
    profileName: selection.profileName,
  }));
  if (weaponAssignments.length === 0) {
    return rejectDoorwayShooting(state, 'NO_WEAPON_SELECTIONS', 'At least one weapon selection is required.');
  }

  const weaponValidation = validateWeaponAssignments(
    weaponAssignments,
    attackerUnit,
    modelsWithLOS,
    targetDistance,
    undefined,
    state,
  );
  if (!weaponValidation.valid) {
    const firstError = weaponValidation.errors[0];
    return rejectDoorwayShooting(state, firstError.code, firstError.message);
  }

  let currentState = updateUnitInGameState(state, command.attackingUnitId, (unit) => ({
    ...unit,
    hasShotThisTurn: true,
  }));
  const fireGroups = formFireGroups(
    weaponAssignments,
    attackerUnit,
    modelsWithLOS,
    targetDistance,
    false,
    false,
    false,
    options.weaponProfileModifier,
    currentState,
  );
  const events: GameEvent[] = [];

  for (const fireGroup of fireGroups) {
    let groupHits: HitResult[] = [];
    let groupEvents: GameEvent[] = [];

    if (fireGroup.weaponProfile.hasTemplate) {
      const templateResult = resolveDoorwayTemplateFireGroup(currentState, doorwayTerrain, fireGroup);
      if (templateResult.errors.length > 0) {
        const firstError = templateResult.errors[0];
        return rejectDoorwayShooting(currentState, firstError.code, firstError.message);
      }
      groupHits = templateResult.hits;
      groupEvents = templateResult.events;
    } else {
      const hitResult = resolveFireGroupHits(fireGroup, dice);
      groupHits = hitResult.hits;
      groupEvents = [...hitResult.events];

      const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);
      if (getsHotResult.getsHotEvents.length > 0) {
        const getsHotEvents = getsHotResult.getsHotEvents.map((event) => ({
          ...event,
          unitId: command.attackingUnitId,
        }));
        groupEvents.push(...getsHotEvents);

        for (const wound of getsHotResult.modelWounds) {
          currentState = updateUnitInGameState(currentState, command.attackingUnitId, (unit) =>
            updateModelInUnit(unit, wound.modelId, (model) =>
              applyWoundsToModel(model, wound.wounds),
            ),
          );
        }
      }

      const blastResult = resolveDoorwayBlastFireGroup(
        currentState,
        doorwayTerrain,
        fireGroup,
        groupHits,
        groupEvents,
        dice,
      );
      if (blastResult.errors.length > 0) {
        const firstError = blastResult.errors[0];
        return rejectDoorwayShooting(currentState, firstError.code, firstError.message);
      }
      groupHits = blastResult.hits;
      groupEvents = blastResult.events;
    }

    const successfulHits = groupHits.filter((hit) => hit.isHit);
    const apResult = resolveArmourPenetration(
      successfulHits,
      doorway.armourValue,
      VehicleFacing.Front,
      dice,
    );
    const filledAPEvents = apResult.events.map((event) => (
      event.type === 'armourPenetrationRoll'
        ? { ...event, fireGroupIndex: fireGroup.index } as ArmourPenetrationRollEvent
        : event
    ));

    const glancingDamage = apResult.glancingHits.length;
    const penetratingDamage = apResult.penetratingHits.reduce((total, hit) => total + hit.damage, 0);
    const doorwayDamage = applyDoorwayDamage(currentState, doorwayId, glancingDamage + penetratingDamage);
    currentState = doorwayDamage.state;

    events.push(...groupEvents);
    events.push(...filledAPEvents);
    events.push(...doorwayDamage.events);
    events.push({
      type: 'fireGroupResolved',
      fireGroupIndex: fireGroup.index,
      weaponName: fireGroup.weaponName,
      totalHits: successfulHits.length,
      totalWounds: 0,
      totalPenetrating: apResult.penetratingHits.length,
      totalGlancing: apResult.glancingHits.length,
    } as FireGroupResolvedEvent);
  }

  return {
    state: currentState,
    events,
    errors: [],
    accepted: true,
  };
}
