import type {
  GameState,
  PendingDeathOrGloryTrigger,
  SpecialRuleRef,
  StatModifier,
  UnitState,
} from '@hh/types';
import {
  ModelSubType,
  ModelType,
  TacticalStatus,
  VehicleFacing,
} from '@hh/types';
import {
  distanceShapes,
  EPSILON,
} from '@hh/geometry';
import {
  findWeapon,
  findLegionWeapon,
  isMeleeWeapon,
} from '@hh/data';
import type {
  DamageAppliedEvent,
  DiceProvider,
  GameEvent,
  HitTestRollEvent,
  StatusAppliedEvent,
} from '../types';
import {
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
  getReactiveArmy,
  canUnitReact,
  hasReactionAllotment,
  getUnitMajorityToughness,
} from '../game-queries';
import {
  getModelShape,
  getModelShapeAtPosition,
} from '../model-shapes';
import {
  getCurrentModelAttacks,
  getCurrentModelStrength,
} from '../runtime-characteristics';
import {
  getModelInvulnSave,
  getModelSave,
  getModelStateCharacteristics,
  getModelType,
  getModelSubTypes,
  getModelWounds,
  isVehicleCharacteristics,
} from '../profile-lookup';
import { getModelPsychicMeleeWeapon } from '../psychic/psychic-runtime';
import { getWeaponSelectionOptions } from '../shooting/weapon-declaration';
import { resolveArmourPenetration } from '../shooting/armour-penetration';
import { resolveWoundTests } from '../shooting/wound-resolution';
import { resolveSaves } from '../shooting/save-resolution';
import { resolveDamage } from '../shooting/damage-resolution';
import { removeCasualties } from '../shooting/casualty-removal';
import { autoSelectTargetModel } from '../shooting/target-model-selection';
import { resolveVehicleDamageTable } from '../shooting/vehicle-damage';
import {
  addStatus,
  applyWoundsToModel,
  updateModelInUnit,
  updateUnitInGameState,
} from '../state-helpers';

const VEHICLE_MOVE_THROUGH_HIT_STRENGTH = 6;
const VEHICLE_MOVE_THROUGH_HIT_DAMAGE = 1;

type WeaponCategory = 'ranged' | 'melee';

export interface DeathOrGloryWeaponOption {
  modelId: string;
  weaponId: string;
  profileName?: string;
  displayName: string;
  category: WeaponCategory;
  attacks: number;
  strength: number;
  ap: number | null;
  damage: number;
  specialRules: SpecialRuleRef[];
}

function resolveStatModifier(baseValue: number, modifier: StatModifier): number {
  if (typeof modifier === 'number') {
    return modifier;
  }

  if (typeof modifier === 'string') {
    return baseValue;
  }

  switch (modifier.op) {
    case 'add':
      return baseValue + modifier.value;
    case 'subtract':
      return baseValue - modifier.value;
    case 'multiply':
      return baseValue * modifier.value;
    default:
      return baseValue;
  }
}

function getMoveThroughSampleCount(movingModel: UnitState['models'][number], start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt((dx * dx) + (dy * dy));
  const shape = getModelShape(movingModel);
  const footprint = shape.kind === 'circle'
    ? shape.radius
    : Math.max(shape.width, shape.height) / 2;
  return Math.max(8, Math.ceil(distance / Math.max(0.2, footprint / 3)));
}

function vehiclePathMovesThroughModel(
  movingModel: UnitState['models'][number],
  targetPosition: { x: number; y: number },
  targetModel: UnitState['models'][number],
): boolean {
  const start = movingModel.position;
  const sampleCount = getMoveThroughSampleCount(movingModel, start, targetPosition);
  const targetShape = getModelShape(targetModel);

  for (let index = 1; index < sampleCount; index += 1) {
    const t = index / sampleCount;
    const samplePosition = {
      x: start.x + ((targetPosition.x - start.x) * t),
      y: start.y + ((targetPosition.y - start.y) * t),
    };
    const movingShape = getModelShapeAtPosition(movingModel, samplePosition);
    if (distanceShapes(movingShape, targetShape) <= EPSILON) {
      return true;
    }
  }

  return false;
}

function unitCanBeMovedThrough(unit: UnitState): boolean {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0 || !unit.isDeployed) {
    return false;
  }

  return aliveModels.every((model) => getModelType(model.unitProfileId, model.profileModelName) !== ModelType.Vehicle);
}

export function detectVehicleMoveThroughTriggers(
  state: GameState,
  activeUnitId: string,
  modelPositions: Array<{ modelId: string; position: { x: number; y: number } }>,
): PendingDeathOrGloryTrigger[] {
  const movingUnit = findUnit(state, activeUnitId);
  const movingPlayerIndex = findUnitPlayerIndex(state, activeUnitId);
  if (!movingUnit || movingPlayerIndex === undefined) {
    return [];
  }

  const reactiveArmy = state.armies[movingPlayerIndex === 0 ? 1 : 0];
  const positionByModelId = new Map(modelPositions.map((entry) => [entry.modelId, entry.position]));
  const triggers: PendingDeathOrGloryTrigger[] = [];

  for (const movingModel of getAliveModels(movingUnit)) {
    const targetPosition = positionByModelId.get(movingModel.id);
    if (!targetPosition) {
      continue;
    }

    const movingModelType = getModelType(movingModel.unitProfileId, movingModel.profileModelName);
    const movingModelSubTypes = getModelSubTypes(movingModel.unitProfileId, movingModel.profileModelName);
    if (
      movingModelType !== ModelType.Vehicle ||
      movingModelSubTypes.includes(ModelSubType.Flyer)
    ) {
      continue;
    }

    const movedThroughUnitIds = reactiveArmy.units
      .filter((unit) => unitCanBeMovedThrough(unit))
      .filter((unit) => getAliveModels(unit).some((targetModel) =>
        vehiclePathMovesThroughModel(movingModel, targetPosition, targetModel),
      ))
      .map((unit) => unit.id);

    if (movedThroughUnitIds.length === 0) {
      continue;
    }

    triggers.push({
      vehicleUnitId: activeUnitId,
      vehicleModelId: movingModel.id,
      movedThroughUnitIds: [...new Set(movedThroughUnitIds)],
    });
  }

  return triggers;
}

export function getDeathOrGloryEligibleModelIds(unit: UnitState): string[] {
  return getAliveModels(unit)
    .filter((model) => getModelType(model.unitProfileId, model.profileModelName) !== ModelType.Vehicle)
    .map((model) => model.id);
}

export function getDeathOrGloryEligibleUnitIds(
  state: GameState,
  movedThroughUnitIds: string[],
): string[] {
  const reactiveArmy = getReactiveArmy(state);
  if (!hasReactionAllotment(reactiveArmy)) {
    return [];
  }

  return movedThroughUnitIds.filter((unitId) => {
    const unit = findUnit(state, unitId);
    return !!unit && canUnitReact(unit) && getDeathOrGloryEligibleModelIds(unit).length > 0;
  });
}

function createFallbackMeleeWeaponOption(
  unit: UnitState,
  model: UnitState['models'][number],
): DeathOrGloryWeaponOption {
  const baseAttacks = getCurrentModelAttacks(unit, model);
  const baseStrength = getCurrentModelStrength(unit, model);

  return {
    modelId: model.id,
    weaponId: 'basic-close-combat-weapon',
    displayName: 'Close Combat Attack',
    category: 'melee',
    attacks: Math.max(0, baseAttacks),
    strength: Math.max(1, baseStrength - 1),
    ap: null,
    damage: 1,
    specialRules: [],
  };
}

export function getDeathOrGloryWeaponOptions(
  state: GameState,
  unitId: string,
  modelId: string,
): DeathOrGloryWeaponOption[] {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return [];
  }

  const model = unit.models.find((entry) => entry.id === modelId);
  if (!model || model.isDestroyed) {
    return [];
  }

  if (getModelType(model.unitProfileId, model.profileModelName) === ModelType.Vehicle) {
    return [];
  }

  const options: DeathOrGloryWeaponOption[] = [];
  const seen = new Set<string>();

  for (const weaponId of model.equippedWargear) {
    const rangedSelections = getWeaponSelectionOptions(
      { modelId, weaponId },
      unit,
      state,
    );

    for (const selection of rangedSelections) {
      const attacks = selection.weaponProfile.firepower;
      if (attacks <= 0) {
        continue;
      }

      const key = `ranged:${selection.assignment.weaponId}:${selection.assignment.profileName ?? ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      options.push({
        modelId,
        weaponId: selection.assignment.weaponId,
        profileName: selection.assignment.profileName,
        displayName: selection.displayName,
        category: 'ranged',
        attacks,
        strength: selection.weaponProfile.rangedStrength,
        ap: selection.weaponProfile.ap,
        damage: selection.weaponProfile.damage,
        specialRules: [...selection.weaponProfile.specialRules],
      });
    }

    const psychicMeleeWeapon = getModelPsychicMeleeWeapon(model, weaponId);
    if (psychicMeleeWeapon) {
      const attacks = Math.max(0, resolveStatModifier(
        getCurrentModelAttacks(unit, model),
        psychicMeleeWeapon.attacksModifier,
      ));
      const strength = Math.max(1, resolveStatModifier(
        getCurrentModelStrength(unit, model),
        psychicMeleeWeapon.strengthModifier,
      ));
      const key = `melee:${psychicMeleeWeapon.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({
          modelId,
          weaponId: psychicMeleeWeapon.id,
          displayName: psychicMeleeWeapon.name,
          category: 'melee',
          attacks,
          strength,
          ap: psychicMeleeWeapon.ap,
          damage: psychicMeleeWeapon.damage,
          specialRules: [...psychicMeleeWeapon.specialRules],
        });
      }
    }

    const meleeWeapon = findWeapon(weaponId) ?? findLegionWeapon(weaponId);
    if (!meleeWeapon || !isMeleeWeapon(meleeWeapon)) {
      continue;
    }

    const attacks = Math.max(0, resolveStatModifier(
      getCurrentModelAttacks(unit, model),
      meleeWeapon.attacksModifier,
    ));
    const strength = Math.max(1, resolveStatModifier(
      getCurrentModelStrength(unit, model),
      meleeWeapon.strengthModifier,
    ));
    const key = `melee:${meleeWeapon.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    options.push({
      modelId,
      weaponId: meleeWeapon.id,
      displayName: meleeWeapon.name,
      category: 'melee',
      attacks,
      strength,
      ap: meleeWeapon.ap,
      damage: meleeWeapon.damage,
      specialRules: [...meleeWeapon.specialRules],
    });
  }

  if (!options.some((option) => option.category === 'melee')) {
    options.push(createFallbackMeleeWeaponOption(unit, model));
  }

  return options;
}

function buildTargetModelInfos(unit: UnitState) {
  return unit.models.map((model) => {
    const characteristics = getModelStateCharacteristics(model);
    return {
      model,
      modelType: getModelType(model.unitProfileId, model.profileModelName) ?? ModelType.Infantry,
      modelSubTypes: getModelSubTypes(model.unitProfileId, model.profileModelName),
      maxWounds: getModelWounds(model.unitProfileId, model.profileModelName),
      isVehicle: !!characteristics && isVehicleCharacteristics(characteristics),
    };
  });
}

function applyVehicleHullPointLoss(
  state: GameState,
  vehicleUnitId: string,
  vehicleModelId: string,
  hullPointsLost: number,
  damageSource: string,
): { state: GameState; events: GameEvent[] } {
  const updatedState = updateUnitInGameState(state, vehicleUnitId, (unit) =>
    updateModelInUnit(unit, vehicleModelId, (model) =>
      applyWoundsToModel(model, hullPointsLost),
    ),
  );
  const updatedModel = findUnit(updatedState, vehicleUnitId)?.models.find((entry) => entry.id === vehicleModelId);
  const damageEvent: DamageAppliedEvent = {
    type: 'damageApplied',
    modelId: vehicleModelId,
    unitId: vehicleUnitId,
    woundsLost: hullPointsLost,
    remainingWounds: updatedModel?.currentWounds ?? 0,
    destroyed: updatedModel?.isDestroyed ?? false,
    damageSource,
  };

  return {
    state: updatedState,
    events: [damageEvent],
  };
}

function finalizeDestroyedModels(
  state: GameState,
  casualtyModelIds: string[],
): { state: GameState; events: GameEvent[] } {
  if (casualtyModelIds.length === 0) {
    return { state, events: [] };
  }

  const casualtyResult = removeCasualties(
    state,
    casualtyModelIds,
    {},
    { emitEventsForAlreadyDestroyedModels: true },
  );

  return {
    state: casualtyResult.state,
    events: casualtyResult.events,
  };
}

export function resolveDeathOrGloryReaction(
  state: GameState,
  trigger: PendingDeathOrGloryTrigger,
  reactingUnitId: string,
  attackingModelId: string,
  weaponId: string,
  profileName: string | undefined,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[]; vehicleDestroyed: boolean; vehiclePinned: boolean } {
  const reactingUnit = findUnit(state, reactingUnitId);
  const reactingPlayerIndex = findUnitPlayerIndex(state, reactingUnitId);
  const vehicleUnit = findUnit(state, trigger.vehicleUnitId);
  const vehicleModel = vehicleUnit?.models.find((model) => model.id === trigger.vehicleModelId);

  if (!reactingUnit || reactingPlayerIndex === undefined || !vehicleUnit || !vehicleModel) {
    return { state, events: [], vehicleDestroyed: false, vehiclePinned: false };
  }

  const weaponOption = getDeathOrGloryWeaponOptions(state, reactingUnitId, attackingModelId).find((option) =>
    option.weaponId === weaponId && option.profileName === profileName,
  );
  if (!weaponOption) {
    return { state, events: [], vehicleDestroyed: false, vehiclePinned: false };
  }

  const hitEvents: GameEvent[] = [];
  const autoHitRolls = Array.from({ length: weaponOption.attacks }, () => 6);
  if (autoHitRolls.length > 0) {
    const hitEvent: HitTestRollEvent = {
      type: 'hitTestRoll',
      fireGroupIndex: 0,
      rolls: autoHitRolls,
      targetNumber: 2,
      isSnapShot: false,
      hits: autoHitRolls.length,
      misses: 0,
      criticals: 0,
      precisionHits: 0,
      rendingHits: 0,
    };
    hitEvents.push(hitEvent);
  }

  let currentState = updateUnitInGameState(state, reactingUnitId, (unit) => ({
    ...unit,
    hasReactedThisTurn: true,
  }));
  currentState = {
    ...currentState,
    armies: currentState.armies.map((army, armyIndex) =>
      armyIndex === reactingPlayerIndex
        ? { ...army, reactionAllotmentRemaining: Math.max(0, army.reactionAllotmentRemaining - 1) }
        : army
    ) as GameState['armies'],
  };

  const autoHits = Array.from({ length: weaponOption.attacks }, () => ({
    diceRoll: 6,
    targetNumber: 2,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    isAutoHit: true,
    sourceModelId: attackingModelId,
    weaponStrength: weaponOption.strength,
    weaponAP: weaponOption.ap,
    weaponDamage: weaponOption.damage,
    specialRules: weaponOption.specialRules.map((rule) => ({ ...rule })),
  }));

  const vehicleCharacteristics = getModelStateCharacteristics(vehicleModel);
  if (!vehicleCharacteristics || !isVehicleCharacteristics(vehicleCharacteristics)) {
    return { state: currentState, events: hitEvents, vehicleDestroyed: false, vehiclePinned: false };
  }

  const armourPenetration = resolveArmourPenetration(
    autoHits,
    vehicleCharacteristics.frontArmour,
    VehicleFacing.Front,
    dice,
  );

  const events: GameEvent[] = [
    ...hitEvents,
    ...armourPenetration.events,
  ];
  const casualtyModelIds: string[] = [];

  for (const penetratingHit of armourPenetration.penetratingHits) {
    const latestVehicleModel = findUnit(currentState, trigger.vehicleUnitId)?.models.find((model) => model.id === trigger.vehicleModelId);
    if (!latestVehicleModel || latestVehicleModel.isDestroyed) {
      continue;
    }

    const damageResolution = resolveDamage(
      [{
        diceRoll: penetratingHit.diceRoll,
        targetNumber: 0,
        isWound: true,
        strength: penetratingHit.strength,
        ap: null,
        damage: penetratingHit.damage,
        isBreaching: false,
        isShred: false,
        isPoisoned: false,
        isCriticalWound: false,
        isRendingWound: false,
        isPrecision: false,
        specialRules: penetratingHit.specialRules.map((rule) => ({ ...rule })),
      }],
      trigger.vehicleModelId,
      latestVehicleModel.currentWounds,
    );

    currentState = updateUnitInGameState(currentState, trigger.vehicleUnitId, (unit) =>
      updateModelInUnit(unit, trigger.vehicleModelId, (model) => ({
        ...model,
        currentWounds: damageResolution.finalWounds,
        isDestroyed: damageResolution.destroyed,
      })),
    );
    events.push({
      type: 'damageApplied',
      modelId: trigger.vehicleModelId,
      unitId: trigger.vehicleUnitId,
      woundsLost: damageResolution.totalDamageApplied,
      remainingWounds: damageResolution.finalWounds,
      destroyed: damageResolution.destroyed,
      damageSource: `Death or Glory from ${weaponOption.displayName}`,
    } as DamageAppliedEvent);

    if (damageResolution.destroyed) {
      casualtyModelIds.push(trigger.vehicleModelId);
    }
  }

  const glancingHits = armourPenetration.glancingHits.map((glancingHit) => ({
    ...glancingHit,
    vehicleModelId: trigger.vehicleModelId,
    vehicleUnitId: trigger.vehicleUnitId,
  }));
  let vehiclePinned = false;
  if (glancingHits.length > 0) {
    const latestVehicleUnit = findUnit(currentState, trigger.vehicleUnitId);
    const existingStatuses = new Map<string, TacticalStatus[]>();
    existingStatuses.set(trigger.vehicleModelId, [...(latestVehicleUnit?.statuses ?? [])]);

    const damageTable = resolveVehicleDamageTable(glancingHits, existingStatuses, dice);
    events.push(...damageTable.events);

    for (const statusEntry of damageTable.statusesToApply) {
      currentState = updateUnitInGameState(currentState, statusEntry.vehicleUnitId, (unit) =>
        addStatus(unit, statusEntry.status),
      );
      events.push({
        type: 'statusApplied',
        unitId: statusEntry.vehicleUnitId,
        status: statusEntry.status,
      } as StatusAppliedEvent);
    }

    vehiclePinned = damageTable.statusesToApply.some((entry) => entry.status === TacticalStatus.Pinned);

    for (const hullPointEntry of damageTable.hullPointsToRemove) {
      const hullPointLoss = applyVehicleHullPointLoss(
        currentState,
        hullPointEntry.vehicleUnitId,
        hullPointEntry.vehicleModelId,
        hullPointEntry.hullPointsLost,
        'Death or Glory glancing hit',
      );
      currentState = hullPointLoss.state;
      events.push(...hullPointLoss.events);

      const updatedModel = findUnit(currentState, hullPointEntry.vehicleUnitId)?.models.find(
        (model) => model.id === hullPointEntry.vehicleModelId,
      );
      if (updatedModel?.isDestroyed) {
        casualtyModelIds.push(hullPointEntry.vehicleModelId);
      }
    }
  }

  const destroyedVehicle = finalizeDestroyedModels(currentState, casualtyModelIds);
  currentState = destroyedVehicle.state;
  events.push(...destroyedVehicle.events);

  const vehicleDestroyed = findUnit(currentState, trigger.vehicleUnitId)?.models.find(
    (model) => model.id === trigger.vehicleModelId,
  )?.isDestroyed === true;

  if (!vehicleDestroyed && !vehiclePinned) {
    const attackerCasualty = removeCasualties(
      currentState,
      [attackingModelId],
      {},
    );
    currentState = attackerCasualty.state;
    events.push(...attackerCasualty.events);
  }

  return {
    state: currentState,
    events,
    vehicleDestroyed,
    vehiclePinned,
  };
}

export function resolveVehicleMoveThroughHits(
  state: GameState,
  trigger: PendingDeathOrGloryTrigger,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  let currentState = state;
  const events: GameEvent[] = [];

  for (const targetUnitId of trigger.movedThroughUnitIds) {
    const unitAtStart = findUnit(currentState, targetUnitId);
    if (!unitAtStart) {
      continue;
    }

    const aliveAtStart = getAliveModels(unitAtStart);
    if (aliveAtStart.length === 0) {
      continue;
    }

    const hitCount = dice.rollD6();
    const hitResults = Array.from({ length: hitCount }, () => ({
      diceRoll: 6,
      targetNumber: 2,
      isHit: true,
      isCritical: false,
      isPrecision: false,
      isRending: false,
      isAutoHit: true,
      sourceModelId: trigger.vehicleModelId,
      weaponStrength: VEHICLE_MOVE_THROUGH_HIT_STRENGTH,
      weaponAP: null,
      weaponDamage: VEHICLE_MOVE_THROUGH_HIT_DAMAGE,
      specialRules: [] as SpecialRuleRef[],
    }));

    const woundResult = resolveWoundTests(
      hitResults,
      getUnitMajorityToughness(unitAtStart),
      dice,
    );
    events.push(...woundResult.events);

    const casualtyModelIds: string[] = [];
    for (const wound of woundResult.wounds.filter((entry) => entry.isWound)) {
      const targetUnit = findUnit(currentState, targetUnitId);
      if (!targetUnit) {
        break;
      }

      const targetModelId = autoSelectTargetModel(buildTargetModelInfos(targetUnit), 'wound');
      if (!targetModelId) {
        break;
      }

      wound.assignedToModelId = targetModelId;
      const targetModel = targetUnit.models.find((model) => model.id === targetModelId);
      if (!targetModel || targetModel.isDestroyed) {
        continue;
      }

      const saveResult = resolveSaves(
        getModelSave(targetModel.unitProfileId, targetModel.profileModelName),
        getModelInvulnSave(targetModel.unitProfileId, targetModel.profileModelName),
        null,
        [wound],
        dice,
      );
      events.push(...saveResult.events);

      if (saveResult.unsavedWounds.length === 0) {
        continue;
      }

      const damageResolution = resolveDamage(
        saveResult.unsavedWounds,
        targetModelId,
        targetModel.currentWounds,
      );
      currentState = updateUnitInGameState(currentState, targetUnitId, (unit) =>
        updateModelInUnit(unit, targetModelId, (model) => ({
          ...model,
          currentWounds: damageResolution.finalWounds,
          isDestroyed: damageResolution.destroyed,
        })),
      );
      events.push({
        type: 'damageApplied',
        modelId: targetModelId,
        unitId: targetUnitId,
        woundsLost: damageResolution.totalDamageApplied,
        remainingWounds: damageResolution.finalWounds,
        destroyed: damageResolution.destroyed,
        damageSource: `Vehicle move-through by ${trigger.vehicleModelId}`,
      } as DamageAppliedEvent);

      if (damageResolution.destroyed) {
        casualtyModelIds.push(targetModelId);
      }
    }

    if (casualtyModelIds.length > 0) {
      const casualtyResult = removeCasualties(
        currentState,
        casualtyModelIds,
        { [targetUnitId]: aliveAtStart.length },
        { emitEventsForAlreadyDestroyedModels: true },
      );
      currentState = casualtyResult.state;
      events.push(...casualtyResult.events);
    }
  }

  return { state: currentState, events };
}
