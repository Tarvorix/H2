import type { DeclareChargeCommand, GameState, ModelState, StatModifier } from '@hh/types';
import { TacticalStatus, VehicleFacing } from '@hh/types';
import { findLegionWeapon, findWeapon, isMeleeWeapon } from '@hh/data';
import type {
  ArmourPenetrationRollEvent,
  CommandResult,
  DiceProvider,
  GameEvent,
} from '../types';
import { updateUnitInGameState, updateModelInUnit, moveModel, addStatus } from '../state-helpers';
import { resolveArmourPenetration } from '../shooting/armour-penetration';
import { findUnit, getAliveModels } from '../game-queries';
import { moveToward } from '../assault/setup-move-handler';
import { resolveChargeRoll } from '../assault/charge-move-handler';
import { validateChargeEligibility, MAX_CHARGE_RANGE } from '../assault/charge-validator';
import {
  getUnitSetupMoveInitiative,
  getUnitSetupMoveMovement,
  getUnitCoolForStatusChecks,
} from '../assault/unit-characteristics';
import { calculateSetupMoveDistance } from '../assault/assault-types';
import {
  applyDoorwayDamage,
  findDoorwayTerrain,
  getDoorwayCenter,
  getDoorwayDistanceForModel,
  getModelsWithLOSToDoorway,
} from './doorway-shooting';
import { getCurrentModelAttacks, getCurrentModelStrength } from '../runtime-characteristics';
import {
  ensureZoneMortalisState,
  getZoneMortalisDoorway,
  isZoneMortalisGame,
} from './zone-mortalis';

interface ResolvedMeleeWeaponProfile {
  id: string;
  name: string;
  attacksModifier: StatModifier;
  strengthModifier: StatModifier;
  ap: number | null;
  damage: number;
  specialRules: { name: string; value?: string }[];
}

function rejectDoorwayCharge(
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

function scoreWeapon(weapon: ResolvedMeleeWeaponProfile): number {
  const apScore = weapon.ap === null ? 0 : (10 - weapon.ap);
  return (weapon.damage * 10) + apScore + (weapon.specialRules.length * 0.25);
}

function createFallbackWeapon(): ResolvedMeleeWeaponProfile {
  return {
    id: 'unarmed',
    name: 'Unarmed',
    attacksModifier: 'A',
    strengthModifier: { op: 'subtract', value: 1 },
    ap: null,
    damage: 1,
    specialRules: [],
  };
}

function resolveStatModifier(baseValue: number, modifier: StatModifier): number {
  if (typeof modifier === 'number') {
    return modifier;
  }

  if (typeof modifier === 'string') {
    if (modifier === 'I' || modifier === 'A' || modifier === 'S') {
      return baseValue;
    }

    const rawModifier = modifier as string;
    const addMatch = rawModifier.match(/^([IAS])?([+-]\d+)$/);
    if (addMatch) {
      return baseValue + Number(addMatch[2]);
    }

    const multiplyMatch = rawModifier.match(/^([IAS])?x(\d+)$/i);
    if (multiplyMatch) {
      return baseValue * Number(multiplyMatch[2]);
    }

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

function resolveMeleeWeaponProfile(model: ModelState): ResolvedMeleeWeaponProfile {
  const meleeWeapons: ResolvedMeleeWeaponProfile[] = [];

  for (const weaponId of model.equippedWargear) {
    const weapon = findWeapon(weaponId) ?? findLegionWeapon(weaponId);
    if (!weapon || !isMeleeWeapon(weapon)) {
      continue;
    }

    meleeWeapons.push({
      id: weapon.id,
      name: weapon.name,
      attacksModifier: weapon.attacksModifier,
      strengthModifier: weapon.strengthModifier,
      ap: weapon.ap,
      damage: weapon.damage,
      specialRules: [...weapon.specialRules],
    });
  }

  meleeWeapons.sort((left, right) => scoreWeapon(right) - scoreWeapon(left));
  return meleeWeapons[0] ?? createFallbackWeapon();
}

function resolveCoolCheck(
  dice: DiceProvider,
  coolValue: number,
): { roll: number; passed: boolean } {
  const [die1, die2] = dice.roll2D6();
  const roll = die1 + die2;
  return { roll, passed: roll <= coolValue };
}

function moveUnitTowardDoorway(
  state: GameState,
  unitId: string,
  doorwayId: string,
  maxDistance: number,
  eventType: 'setupMove' | 'chargeMove',
): { state: GameState; events: GameEvent[] } {
  const unit = findUnit(state, unitId);
  const doorwayTerrain = findDoorwayTerrain(state, doorwayId);
  if (!unit || !doorwayTerrain) {
    return { state, events: [] };
  }

  const doorwayCenter = getDoorwayCenter(doorwayTerrain);
  let newState = state;
  const events: GameEvent[] = [];

  for (const model of getAliveModels(unit)) {
    const distanceToDoorway = getDoorwayDistanceForModel(newState, model, doorwayId, doorwayTerrain);
    if (!Number.isFinite(distanceToDoorway) || distanceToDoorway <= 0) {
      continue;
    }

    const destination = moveToward(
      model.position,
      doorwayCenter,
      Math.min(maxDistance, distanceToDoorway),
    );

    newState = updateUnitInGameState(newState, unitId, (currentUnit) =>
      updateModelInUnit(currentUnit, model.id, (currentModel) => moveModel(currentModel, destination)),
    );

    events.push({
      type: eventType,
      chargingUnitId: unitId,
      targetUnitId: doorwayId,
      modelId: model.id,
      from: model.position,
      to: destination,
      distance: Math.min(maxDistance, distanceToDoorway),
    } as GameEvent);
  }

  return { state: newState, events };
}

function resolveDoorwayMelee(
  state: GameState,
  chargingUnitId: string,
  doorwayId: string,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  const chargingUnit = findUnit(state, chargingUnitId);
  const doorway = getZoneMortalisDoorway(state, doorwayId);
  const doorwayTerrain = findDoorwayTerrain(state, doorwayId);
  if (!chargingUnit || !doorway || !doorwayTerrain) {
    return { state, events: [] };
  }

  const engagedModels = getAliveModels(chargingUnit).filter((model) =>
    getDoorwayDistanceForModel(state, model, doorwayId, doorwayTerrain) <= 0.05,
  );
  const attackingModels = engagedModels.length > 0
    ? engagedModels
    : getAliveModels(chargingUnit).slice(0, 1);

  let newState = state;
  const events: GameEvent[] = [];

  for (const model of attackingModels) {
    const weapon = resolveMeleeWeaponProfile(model);
    const totalAttacks = Math.max(
      1,
      resolveStatModifier(getCurrentModelAttacks(chargingUnit, model), weapon.attacksModifier),
    );
    const strength = Math.max(
      1,
      resolveStatModifier(getCurrentModelStrength(chargingUnit, model), weapon.strengthModifier),
    );
    const hits = Array.from({ length: totalAttacks }, () => ({
      diceRoll: 0,
      targetNumber: 0,
      isHit: true,
      isCritical: false,
      isPrecision: false,
      isRending: false,
      isAutoHit: true,
      sourceModelId: model.id,
      weaponStrength: strength,
      weaponAP: weapon.ap,
      weaponDamage: weapon.damage,
      specialRules: weapon.specialRules,
    }));

    const apResult = resolveArmourPenetration(hits, doorway.armourValue, VehicleFacing.Front, dice);
    const filledAPEvents = apResult.events.map((event) => (
      event.type === 'armourPenetrationRoll'
        ? { ...event, fireGroupIndex: -1 } as ArmourPenetrationRollEvent
        : event
    ));
    const glancingDamage = apResult.glancingHits.length;
    const penetratingDamage = apResult.penetratingHits.reduce((total, hit) => total + hit.damage, 0);
    const doorwayDamage = applyDoorwayDamage(newState, doorwayId, glancingDamage + penetratingDamage);
    newState = doorwayDamage.state;

    events.push(...filledAPEvents);
    events.push(...doorwayDamage.events);

    const refreshedDoorway = getZoneMortalisDoorway(newState, doorwayId);
    if (!refreshedDoorway || refreshedDoorway.hullPoints <= 0) {
      break;
    }
  }

  return { state: newState, events };
}

export function handleZoneMortalisDoorwayCharge(
  state: GameState,
  command: DeclareChargeCommand,
  dice: DiceProvider,
): CommandResult {
  if (!isZoneMortalisGame(state)) {
    return rejectDoorwayCharge(
      state,
      'INVALID_TARGET',
      'Doorway charges may only be declared in Zone Mortalis games.',
    );
  }

  const doorwayId = command.targetDoorwayId ?? (
    command.target?.kind === 'doorway' ? command.target.doorwayId : undefined
  );
  if (!doorwayId) {
    return rejectDoorwayCharge(state, 'DOORWAY_NOT_FOUND', 'A doorway target is required.');
  }

  const ensuredState = ensureZoneMortalisState(state);

  const eligibility = validateChargeEligibility(ensuredState, command.chargingUnitId);
  if (!eligibility.valid) {
    const firstError = eligibility.errors[0];
    return rejectDoorwayCharge(ensuredState, firstError.code, firstError.message);
  }

  const chargingUnit = findUnit(ensuredState, command.chargingUnitId);
  const doorway = getZoneMortalisDoorway(ensuredState, doorwayId);
  const doorwayTerrain = findDoorwayTerrain(ensuredState, doorwayId);
  if (!chargingUnit || !doorway || !doorwayTerrain) {
    return rejectDoorwayCharge(ensuredState, 'DOORWAY_NOT_FOUND', `Doorway "${doorwayId}" was not found.`);
  }
  if (doorway.state === 'destroyed' || doorway.hullPoints <= 0) {
    return rejectDoorwayCharge(ensuredState, 'DOORWAY_DESTROYED', 'Destroyed doorways cannot be charged.');
  }

  const modelsWithLOS = getModelsWithLOSToDoorway(ensuredState, command.chargingUnitId, doorwayId, doorwayTerrain);
  if (modelsWithLOS.length === 0) {
    return rejectDoorwayCharge(ensuredState, 'NO_LOS_TO_TARGET', 'No charging model has line of sight to the doorway.');
  }

  const closestDistance = getAliveModels(chargingUnit).reduce((closest, model) => (
    Math.min(closest, getDoorwayDistanceForModel(ensuredState, model, doorwayId, doorwayTerrain))
  ), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(closestDistance) || closestDistance > MAX_CHARGE_RANGE) {
    return rejectDoorwayCharge(
      ensuredState,
      'TARGET_OUT_OF_CHARGE_RANGE',
      `Target is ${closestDistance.toFixed(1)}" away, exceeding maximum charge range of ${MAX_CHARGE_RANGE}".`,
    );
  }

  const isDisordered = chargingUnit.statuses.length > 0;
  const events: GameEvent[] = [{
    type: 'chargeDeclared',
    chargingUnitId: command.chargingUnitId,
    targetUnitId: doorwayId,
    isDisordered,
  } as GameEvent];

  let currentState = ensuredState;
  let setupMoveDistance = 0;

  if (!isDisordered) {
    setupMoveDistance = calculateSetupMoveDistance(
      getUnitSetupMoveInitiative(chargingUnit),
      getUnitSetupMoveMovement(chargingUnit),
    );
    const setupMove = moveUnitTowardDoorway(
      currentState,
      command.chargingUnitId,
      doorwayId,
      setupMoveDistance,
      'setupMove',
    );
    currentState = setupMove.state;
    events.push(...setupMove.events);
  }

  const updatedDoorwayTerrain = findDoorwayTerrain(currentState, doorwayId);
  const updatedUnit = findUnit(currentState, command.chargingUnitId);
  const postSetupDistance = updatedUnit && updatedDoorwayTerrain
    ? getAliveModels(updatedUnit).reduce((closest, model) => (
      Math.min(closest, getDoorwayDistanceForModel(currentState, model, doorwayId, updatedDoorwayTerrain))
    ), Number.POSITIVE_INFINITY)
    : closestDistance;

  const chargeRoll = resolveChargeRoll(dice);
  events.push({
    type: 'chargeRoll',
    chargingUnitId: command.chargingUnitId,
    targetUnitId: doorwayId,
    diceValues: chargeRoll.diceValues,
    chargeRoll: chargeRoll.chargeRoll,
    discardedDie: chargeRoll.discardedDie,
    distanceNeeded: postSetupDistance,
  } as GameEvent);

  if (chargeRoll.chargeRoll < postSetupDistance) {
    events.push({
      type: 'chargeFailed',
      chargingUnitId: command.chargingUnitId,
      targetUnitId: doorwayId,
      chargeRoll: chargeRoll.chargeRoll,
      distanceNeeded: postSetupDistance,
    } as GameEvent);

    const coolCheck = resolveCoolCheck(dice, getUnitCoolForStatusChecks(chargingUnit));
    events.push({
      type: 'coolCheck',
      unitId: command.chargingUnitId,
      roll: coolCheck.roll,
      target: getUnitCoolForStatusChecks(chargingUnit),
      passed: coolCheck.passed,
    } as GameEvent);

    if (!coolCheck.passed) {
      currentState = updateUnitInGameState(currentState, command.chargingUnitId, (unit) =>
        addStatus(unit, TacticalStatus.Stunned),
      );
    }

    return {
      state: currentState,
      events,
      errors: [],
      accepted: true,
    };
  }

  events.push({
    type: 'chargeSucceeded',
    chargingUnitId: command.chargingUnitId,
    targetUnitId: doorwayId,
    chargeRoll: chargeRoll.chargeRoll,
    distanceNeeded: postSetupDistance,
  } as GameEvent);

  const chargeMove = moveUnitTowardDoorway(
    currentState,
    command.chargingUnitId,
    doorwayId,
    chargeRoll.chargeRoll,
    'chargeMove',
  );
  currentState = chargeMove.state;
  events.push(...chargeMove.events);

  const melee = resolveDoorwayMelee(currentState, command.chargingUnitId, doorwayId, dice);
  currentState = melee.state;
  events.push(...melee.events);

  return {
    state: currentState,
    events,
    errors: [],
    accepted: true,
  };
}
