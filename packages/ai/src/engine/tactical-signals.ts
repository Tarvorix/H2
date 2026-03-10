import { findLegionWeapon, findWeapon, isMeleeWeapon } from '@hh/data';
import type {
  GameState,
  MeleeWeaponProfile,
  ModelState,
  Position,
  StatModifier,
  UnitState,
} from '@hh/types';
import {
  canUnitCharge,
  canUnitReact,
  getAliveModels,
  getClosestModelDistance,
  getModelAttacks,
  getModelBS,
  getModelSave,
  getModelStrength,
  getModelToughness,
  getModelWS,
  getVehicleArmour,
  isVehicleUnit,
  lookupUnitProfile,
  meleeHitTable,
  resolveWeaponAssignment,
  woundTable,
} from '@hh/engine';
import { getEnemyDeployedUnits, getUnitCentroid } from '../helpers/unit-queries';

const MAX_RELEVANT_UNITS = 4;
const OBJECTIVE_HOLD_RANGE = 3;
const OBJECTIVE_CONTEST_RANGE = 6;
const CLOSE_ASSAULT_DISTANCE = 12;
const DEFAULT_TEMPLATE_RANGE = 8;
const HIGH_VALUE_THRESHOLD = 16;
const HIGH_EXPOSURE_THRESHOLD = 3;

export interface ExposureBreakdown {
  ranged: number;
  melee: number;
  total: number;
}

export interface PlayerTacticalSummary {
  bestRangedVsObjectiveHolders: number;
  bestMeleeVsObjectiveHolders: number;
  bestRangedVsHighValueTargets: number;
  bestMeleeVsHighValueTargets: number;
  objectiveHoldDurability: number;
  objectiveHolderValue: number;
  contestedObjectiveValue: number;
  exposedObjectiveHolderValue: number;
  exposedHighValueValue: number;
  retaliationPressure: number;
  warlordExposureValue: number;
  transportPayloadExposure: number;
  antiVehicleRangedPressure: number;
  antiVehicleMeleePressure: number;
}

function distanceBetween(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function hasRule(
  specialRules: Array<{ name: string; value?: string }>,
  ruleName: string,
): boolean {
  return specialRules.some((rule) => rule.name === ruleName);
}

function applyStatModifier(base: number, modifier: StatModifier): number {
  if (typeof modifier === 'number') {
    return modifier;
  }

  if (modifier === 'A' || modifier === 'S' || modifier === 'I') {
    return base;
  }

  switch (modifier.op) {
    case 'add':
      return base + modifier.value;
    case 'subtract':
      return base - modifier.value;
    case 'multiply':
      return base * modifier.value;
    default:
      return base;
  }
}

function normalizeWeaponToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveDedicatedMeleeWeapon(unit: UnitState, weaponId: string): MeleeWeaponProfile | undefined {
  const profile = lookupUnitProfile(unit.profileId);
  if (!profile?.dedicatedWeapons?.length) return undefined;

  const normalizedRequested = normalizeWeaponToken(weaponId);
  for (const dedicated of profile.dedicatedWeapons) {
    if (dedicated.category !== 'melee') continue;

    const normalizedId = normalizeWeaponToken(dedicated.id);
    const normalizedName = normalizeWeaponToken(dedicated.name);
    if (
      normalizedId !== normalizedRequested &&
      !normalizedId.endsWith(`-${normalizedRequested}`) &&
      normalizedName !== normalizedRequested
    ) {
      continue;
    }

    if (!('initiativeModifier' in dedicated.profile)) continue;
    return {
      id: dedicated.id,
      name: dedicated.name,
      initiativeModifier: dedicated.profile.initiativeModifier as StatModifier,
      attacksModifier: dedicated.profile.attacksModifier as StatModifier,
      strengthModifier: dedicated.profile.strengthModifier as StatModifier,
      ap: dedicated.profile.ap,
      damage: dedicated.profile.damage,
      specialRules: dedicated.profile.specialRules,
      traits: [...dedicated.profile.traits] as MeleeWeaponProfile['traits'],
    };
  }

  return undefined;
}

function resolveMeleeWeaponForModel(
  unit: UnitState,
  weaponId: string,
): MeleeWeaponProfile | undefined {
  const weapon = findWeapon(weaponId) ?? findLegionWeapon(weaponId);
  if (weapon && isMeleeWeapon(weapon)) {
    return weapon;
  }

  return resolveDedicatedMeleeWeapon(unit, weaponId);
}

function getTargetRepresentativeModel(unit: UnitState): ModelState | null {
  return getAliveModels(unit)[0] ?? null;
}

function getEffectiveInfantrySave(targetSave: number | null, ap: number | null): number | null {
  if (targetSave === null) return null;
  if (ap !== null && ap <= targetSave) {
    return null;
  }
  return targetSave;
}

function getSaveFailureProbability(targetSave: number | null, ap: number | null): number {
  const effectiveSave = getEffectiveInfantrySave(targetSave, ap);
  if (effectiveSave === null) return 1;
  const clamped = Math.max(2, Math.min(6, effectiveSave));
  const saveProbability = (7 - clamped) / 6;
  return 1 - saveProbability;
}

function estimateVehicleDamagePerShot(
  strength: number,
  armour: number,
  damage: number,
  armourbane: boolean,
): number {
  if (strength <= 0 || armour <= 0 || damage <= 0) return 0;

  let total = 0;
  if (armourbane) {
    for (let first = 1; first <= 6; first++) {
      for (let second = 1; second <= 6; second++) {
        const penetration = strength + first + second;
        if (penetration > armour) {
          total += damage;
        } else if (penetration === armour) {
          total += damage * 0.5;
        }
      }
    }
    return total / 36;
  }

  for (let roll = 1; roll <= 6; roll++) {
    const penetration = strength + roll;
    if (penetration > armour) {
      total += damage;
    } else if (penetration === armour) {
      total += damage * 0.5;
    }
  }
  return total / 6;
}

function estimateRangedWeaponDamageAgainstUnit(
  attackerBS: number,
  targetUnit: UnitState,
  profile: NonNullable<ReturnType<typeof resolveWeaponAssignment>>,
): number {
  const representative = getTargetRepresentativeModel(targetUnit);
  if (!representative) return 0;

  if (isVehicleUnit(targetUnit)) {
    const armour = getVehicleArmour(representative.unitProfileId, representative.profileModelName);
    if (!armour) return 0;
    const perShot = estimateVehicleDamagePerShot(
      profile.rangedStrength,
      armour.side,
      Math.max(1, profile.damage),
      hasRule(profile.specialRules, 'Armourbane'),
    );
    return perShot * Math.max(1, profile.firepower);
  }

  const targetToughness = Math.max(1, getModelToughness(representative.unitProfileId, representative.profileModelName));
  const targetSave = getModelSave(representative.unitProfileId, representative.profileModelName);
  const hitProbability = Math.max(0, Math.min(1, attackerBS / 6));
  const woundTarget = woundTable(profile.rangedStrength, targetToughness);
  const woundProbability = (7 - Math.max(2, Math.min(6, woundTarget ?? 6))) / 6;
  const saveFailureProbability = getSaveFailureProbability(targetSave, profile.ap);

  let expectedDamage =
    Math.max(1, profile.firepower) *
    hitProbability *
    woundProbability *
    saveFailureProbability *
    Math.max(1, profile.damage);

  if (profile.hasTemplate) {
    expectedDamage *= 1.25;
  }
  if (hasRule(profile.specialRules, 'Breaching')) {
    expectedDamage *= 1.12;
  }
  if (hasRule(profile.specialRules, 'Rending')) {
    expectedDamage *= 1.08;
  }

  return expectedDamage;
}

function getBestMeleeProfileForModel(
  attackerUnit: UnitState,
  attackerModel: ModelState,
  targetUnit: UnitState,
): MeleeWeaponProfile | null {
  const meleeProfiles = attackerModel.equippedWargear
    .map((weaponId) => resolveMeleeWeaponForModel(attackerUnit, weaponId))
    .filter((profile): profile is MeleeWeaponProfile => profile !== undefined);

  if (meleeProfiles.length === 0) {
    const fallback = findWeapon('close-combat-weapon');
    if (fallback && isMeleeWeapon(fallback)) {
      meleeProfiles.push(fallback);
    }
  }

  if (meleeProfiles.length === 0) return null;

  const attackerStrength = getModelStrength(attackerModel.unitProfileId, attackerModel.profileModelName);
  const attackerAttacks = getModelAttacks(attackerModel.unitProfileId, attackerModel.profileModelName);
  const attackerWS = getModelWS(attackerModel.unitProfileId, attackerModel.profileModelName);
  const representative = getTargetRepresentativeModel(targetUnit);
  if (!representative) return null;

  const targetWS = Math.max(1, getModelWS(representative.unitProfileId, representative.profileModelName));
  const targetToughness = Math.max(1, getModelToughness(representative.unitProfileId, representative.profileModelName));
  const targetSave = getModelSave(representative.unitProfileId, representative.profileModelName);
  const targetArmour = isVehicleUnit(targetUnit)
    ? getVehicleArmour(representative.unitProfileId, representative.profileModelName)?.rear
    : undefined;

  let bestProfile: MeleeWeaponProfile | null = null;
  let bestScore = -Infinity;

  for (const profile of meleeProfiles) {
    const effectiveAttacks = Math.max(1, applyStatModifier(attackerAttacks, profile.attacksModifier));
    const effectiveStrength = Math.max(1, applyStatModifier(attackerStrength, profile.strengthModifier));
    let score = 0;

    if (targetArmour !== undefined) {
      score = estimateVehicleDamagePerShot(
        effectiveStrength,
        targetArmour,
        Math.max(1, profile.damage),
        hasRule(profile.specialRules, 'Armourbane'),
      ) * effectiveAttacks;
    } else {
      const hitProbability = (7 - Math.max(2, Math.min(6, meleeHitTable(attackerWS, targetWS)))) / 6;
      const woundProbability = (7 - Math.max(2, Math.min(6, woundTable(effectiveStrength, targetToughness) ?? 6))) / 6;
      const saveFailureProbability = getSaveFailureProbability(targetSave, profile.ap);
      score =
        effectiveAttacks *
        hitProbability *
        woundProbability *
        saveFailureProbability *
        Math.max(1, profile.damage);

      if (hasRule(profile.specialRules, 'Rending')) {
        score *= 1.08;
      }
      if (hasRule(profile.specialRules, 'Shred')) {
        score *= 1.1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
    }
  }

  return bestProfile;
}

function estimateMeleeProfileDamageAgainstUnit(
  attackerModel: ModelState,
  targetUnit: UnitState,
  profile: MeleeWeaponProfile,
): number {
  const representative = getTargetRepresentativeModel(targetUnit);
  if (!representative) return 0;

  const attackerStrength = getModelStrength(attackerModel.unitProfileId, attackerModel.profileModelName);
  const attackerAttacks = getModelAttacks(attackerModel.unitProfileId, attackerModel.profileModelName);
  const attackerWS = getModelWS(attackerModel.unitProfileId, attackerModel.profileModelName);
  const effectiveAttacks = Math.max(1, applyStatModifier(attackerAttacks, profile.attacksModifier));
  const effectiveStrength = Math.max(1, applyStatModifier(attackerStrength, profile.strengthModifier));

  if (isVehicleUnit(targetUnit)) {
    const armour = getVehicleArmour(representative.unitProfileId, representative.profileModelName);
    if (!armour) return 0;
    return estimateVehicleDamagePerShot(
      effectiveStrength,
      armour.rear,
      Math.max(1, profile.damage),
      hasRule(profile.specialRules, 'Armourbane'),
    ) * effectiveAttacks;
  }

  const targetWS = Math.max(1, getModelWS(representative.unitProfileId, representative.profileModelName));
  const targetToughness = Math.max(1, getModelToughness(representative.unitProfileId, representative.profileModelName));
  const targetSave = getModelSave(representative.unitProfileId, representative.profileModelName);
  const hitProbability = (7 - Math.max(2, Math.min(6, meleeHitTable(attackerWS, targetWS)))) / 6;
  const woundProbability = (7 - Math.max(2, Math.min(6, woundTable(effectiveStrength, targetToughness) ?? 6))) / 6;
  const saveFailureProbability = getSaveFailureProbability(targetSave, profile.ap);

  let expectedDamage =
    effectiveAttacks *
    hitProbability *
    woundProbability *
    saveFailureProbability *
    Math.max(1, profile.damage);

  if (hasRule(profile.specialRules, 'Rending')) {
    expectedDamage *= 1.08;
  }
  if (hasRule(profile.specialRules, 'Shred')) {
    expectedDamage *= 1.1;
  }

  return expectedDamage;
}

function getUnitPosition(unit: UnitState, positionOverride?: Position): Position | null {
  return positionOverride ?? getUnitCentroid(unit);
}

function getDistanceToTarget(
  state: GameState,
  attackerUnit: UnitState,
  targetUnit: UnitState,
  attackerPositionOverride?: Position,
  targetPositionOverride?: Position,
): number | null {
  if (!attackerPositionOverride && !targetPositionOverride) {
    return getClosestModelDistance(state, attackerUnit.id, targetUnit.id);
  }

  const attackerPosition = getUnitPosition(attackerUnit, attackerPositionOverride);
  const targetPosition = getUnitPosition(targetUnit, targetPositionOverride);
  if (!attackerPosition || !targetPosition) return null;
  return distanceBetween(attackerPosition, targetPosition);
}

function getRelevantEnemyUnits(
  state: GameState,
  playerIndex: number,
  referencePosition: Position | null,
): UnitState[] {
  const enemies = getEnemyDeployedUnits(state, playerIndex).filter((unit) => getAliveModels(unit).length > 0);
  return enemies
    .map((unit) => {
      const centroid = getUnitCentroid(unit);
      const distance = centroid && referencePosition ? distanceBetween(referencePosition, centroid) : 24;
      return {
        unit,
        distance,
        importance: estimateUnitStrategicValue(state, playerIndex === 0 ? 1 : 0, unit),
      };
    })
    .sort((left, right) => {
      const leftScore = (left.importance * 2) - left.distance;
      const rightScore = (right.importance * 2) - right.distance;
      return rightScore - leftScore;
    })
    .slice(0, MAX_RELEVANT_UNITS)
    .map((entry) => entry.unit);
}

function getObjectiveDistances(state: GameState, unit: UnitState, positionOverride?: Position): number[] {
  const objectives = state.missionState?.objectives?.filter((objective) => !objective.isRemoved) ?? [];
  const centroid = getUnitPosition(unit, positionOverride);
  if (!centroid) return [];
  return objectives.map((objective) => distanceBetween(centroid, objective.position));
}

function isObjectiveHolder(state: GameState, unit: UnitState, positionOverride?: Position): boolean {
  return getObjectiveDistances(state, unit, positionOverride).some((distance) => distance <= OBJECTIVE_HOLD_RANGE);
}

function isObjectiveContester(state: GameState, unit: UnitState, positionOverride?: Position): boolean {
  return getObjectiveDistances(state, unit, positionOverride).some((distance) => distance <= OBJECTIVE_CONTEST_RANGE);
}

function getEmbarkedPayloadValue(state: GameState, playerIndex: number, transportUnitId: string): number {
  const embarkedUnits = state.armies[playerIndex].units.filter((unit) => unit.embarkedOnId === transportUnitId);
  return embarkedUnits.reduce((sum, unit) => {
    const wounds = getAliveModels(unit).reduce((unitSum, model) => unitSum + Math.max(model.currentWounds, 0), 0);
    return sum + wounds + getAliveModels(unit).length;
  }, 0);
}

export function estimateUnitStrategicValue(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  positionOverride?: Position,
): number {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return 0;

  const woundValue = aliveModels.reduce((sum, model) => sum + Math.max(model.currentWounds, 0), 0);
  let value = woundValue * 2 + aliveModels.length;

  if (aliveModels.some((model) => model.isWarlord)) {
    value += 18;
  }
  if (isObjectiveHolder(state, unit, positionOverride)) {
    value += 12;
  } else if (isObjectiveContester(state, unit, positionOverride)) {
    value += 6;
  }
  if (isVehicleUnit(unit)) {
    value += 6;
  }
  if (canUnitReact(unit)) {
    value += 2;
  }

  const payloadValue = getEmbarkedPayloadValue(state, playerIndex, unit.id);
  if (payloadValue > 0) {
    value += 8 + (payloadValue * 0.4);
  }

  return value;
}

export function estimateUnitRangedDamagePotential(
  state: GameState,
  attackerUnit: UnitState,
  targetUnit: UnitState,
  options: {
    attackerPositionOverride?: Position;
    targetPositionOverride?: Position;
  } = {},
): number {
  const aliveModels = getAliveModels(attackerUnit);
  const targetRepresentative = getTargetRepresentativeModel(targetUnit);
  if (aliveModels.length === 0 || !targetRepresentative) return 0;

  const distance = getDistanceToTarget(
    state,
    attackerUnit,
    targetUnit,
    options.attackerPositionOverride,
    options.targetPositionOverride,
  );
  if (distance === null) return 0;

  let totalDamage = 0;
  for (const model of aliveModels) {
    let bestForModel = 0;
    for (const weaponId of model.equippedWargear) {
      const profile = resolveWeaponAssignment({ modelId: model.id, weaponId }, attackerUnit);
      if (!profile) continue;

      const inRange = profile.hasTemplate
        ? distance <= DEFAULT_TEMPLATE_RANGE
        : distance <= profile.range;
      if (!inRange) continue;

      const attackerBS = getModelBS(model.unitProfileId, model.profileModelName);
      const expected = estimateRangedWeaponDamageAgainstUnit(attackerBS, targetUnit, profile);
      bestForModel = Math.max(bestForModel, expected);
    }
    totalDamage += bestForModel;
  }

  return totalDamage;
}

export function estimateUnitMeleeDamagePotential(
  state: GameState,
  attackerUnit: UnitState,
  targetUnit: UnitState,
  options: {
    attackerPositionOverride?: Position;
    targetPositionOverride?: Position;
  } = {},
): number {
  const aliveModels = getAliveModels(attackerUnit);
  const targetRepresentative = getTargetRepresentativeModel(targetUnit);
  if (aliveModels.length === 0 || !targetRepresentative) return 0;

  const distance = getDistanceToTarget(
    state,
    attackerUnit,
    targetUnit,
    options.attackerPositionOverride,
    options.targetPositionOverride,
  );
  if (distance === null) return 0;
  if (!attackerUnit.isLockedInCombat && !canUnitCharge(attackerUnit) && distance > CLOSE_ASSAULT_DISTANCE) {
    return 0;
  }
  if (!attackerUnit.isLockedInCombat && distance > CLOSE_ASSAULT_DISTANCE) {
    return 0;
  }

  let totalDamage = 0;
  for (const model of aliveModels) {
    const bestProfile = getBestMeleeProfileForModel(attackerUnit, model, targetUnit);
    if (!bestProfile) continue;
    totalDamage += estimateMeleeProfileDamageAgainstUnit(model, targetUnit, bestProfile);
  }

  return totalDamage;
}

export function estimateUnitExposureBreakdown(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  positionOverride?: Position,
): ExposureBreakdown {
  const referencePosition = getUnitPosition(unit, positionOverride);
  const relevantEnemies = getRelevantEnemyUnits(state, playerIndex, referencePosition);

  let bestRanged = 0;
  let bestMelee = 0;
  const combined: number[] = [];

  for (const enemy of relevantEnemies) {
    const ranged = estimateUnitRangedDamagePotential(state, enemy, unit, {
      targetPositionOverride: positionOverride,
    });
    const melee = estimateUnitMeleeDamagePotential(state, enemy, unit, {
      targetPositionOverride: positionOverride,
    });
    bestRanged = Math.max(bestRanged, ranged);
    bestMelee = Math.max(bestMelee, melee);
    combined.push(ranged + melee);
  }

  combined.sort((left, right) => right - left);
  const total = (combined[0] ?? 0) + ((combined[1] ?? 0) * 0.5);

  return {
    ranged: bestRanged,
    melee: bestMelee,
    total,
  };
}

export function estimateProjectedOutgoingPressure(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  positionOverride?: Position,
): number {
  const enemyUnits = getEnemyDeployedUnits(state, playerIndex).filter((enemy) => getAliveModels(enemy).length > 0);
  const prioritizedTargets = enemyUnits
    .map((enemy) => ({
      unit: enemy,
      strategicValue: estimateUnitStrategicValue(state, playerIndex === 0 ? 1 : 0, enemy),
    }))
    .sort((left, right) => right.strategicValue - left.strategicValue)
    .slice(0, MAX_RELEVANT_UNITS);

  let best = 0;
  for (const entry of prioritizedTargets) {
    const ranged = estimateUnitRangedDamagePotential(state, unit, entry.unit, {
      attackerPositionOverride: positionOverride,
    });
    const melee = estimateUnitMeleeDamagePotential(state, unit, entry.unit, {
      attackerPositionOverride: positionOverride,
    });
    best = Math.max(best, (Math.max(ranged, melee) * (1 + (entry.strategicValue / 24))));
  }

  return best;
}

function summarizeBestPressure(
  state: GameState,
  attackers: UnitState[],
  targets: UnitState[],
  mode: 'ranged' | 'melee',
): number {
  let best = 0;

  for (const attacker of attackers) {
    for (const target of targets) {
      const pressure = mode === 'ranged'
        ? estimateUnitRangedDamagePotential(state, attacker, target)
        : estimateUnitMeleeDamagePotential(state, attacker, target);
      best = Math.max(best, pressure);
    }
  }

  return best;
}

function getPlayerObjectiveUnits(
  state: GameState,
  playerIndex: number,
): { holders: UnitState[]; contesters: UnitState[] } {
  const units = state.armies[playerIndex].units.filter((unit) => getAliveModels(unit).length > 0 && unit.embarkedOnId === null);
  return {
    holders: units.filter((unit) => isObjectiveHolder(state, unit)),
    contesters: units.filter((unit) => isObjectiveContester(state, unit)),
  };
}

function getHighValueUnits(
  state: GameState,
  playerIndex: number,
): UnitState[] {
  return state.armies[playerIndex].units
    .filter((unit) => getAliveModels(unit).length > 0 && unit.embarkedOnId === null)
    .map((unit) => ({
      unit,
      strategicValue: estimateUnitStrategicValue(state, playerIndex, unit),
    }))
    .sort((left, right) => right.strategicValue - left.strategicValue)
    .filter((entry, index) => entry.strategicValue >= HIGH_VALUE_THRESHOLD || index < MAX_RELEVANT_UNITS)
    .slice(0, MAX_RELEVANT_UNITS)
    .map((entry) => entry.unit);
}

export function summarizePlayerTacticalState(
  state: GameState,
  playerIndex: number,
): PlayerTacticalSummary {
  const friendlyUnits = state.armies[playerIndex].units.filter((unit) => getAliveModels(unit).length > 0 && unit.embarkedOnId === null);
  const enemyIndex = playerIndex === 0 ? 1 : 0;
  const enemyUnits = state.armies[enemyIndex].units.filter((unit) => getAliveModels(unit).length > 0 && unit.embarkedOnId === null);
  const { holders, contesters } = getPlayerObjectiveUnits(state, playerIndex);
  const { holders: enemyHolders } = getPlayerObjectiveUnits(state, enemyIndex);
  const highValueTargets = getHighValueUnits(state, enemyIndex);
  const vehicleTargets = enemyUnits.filter((unit) => isVehicleUnit(unit));

  let objectiveHoldDurability = 0;
  let objectiveHolderValue = 0;
  let contestedObjectiveValue = 0;
  let exposedObjectiveHolderValue = 0;
  let exposedHighValueValue = 0;
  let retaliationPressure = 0;
  let warlordExposureValue = 0;
  let transportPayloadExposure = 0;

  for (const holder of holders) {
    const holderValue = estimateUnitStrategicValue(state, playerIndex, holder);
    const exposure = estimateUnitExposureBreakdown(state, playerIndex, holder);
    objectiveHolderValue += holderValue;
    objectiveHoldDurability += holderValue / (1 + exposure.total);
    if (exposure.total >= HIGH_EXPOSURE_THRESHOLD) {
      exposedObjectiveHolderValue += holderValue;
    }
  }

  for (const contester of contesters) {
    contestedObjectiveValue += estimateUnitStrategicValue(state, playerIndex, contester);
  }

  for (const unit of getHighValueUnits(state, playerIndex)) {
    const strategicValue = estimateUnitStrategicValue(state, playerIndex, unit);
    const exposure = estimateUnitExposureBreakdown(state, playerIndex, unit);
    retaliationPressure += exposure.total * (1 + (strategicValue / 20));

    if (exposure.total >= HIGH_EXPOSURE_THRESHOLD) {
      exposedHighValueValue += strategicValue;
    }
    if (getAliveModels(unit).some((model) => model.isWarlord) && exposure.total >= (HIGH_EXPOSURE_THRESHOLD * 0.8)) {
      warlordExposureValue += strategicValue;
    }
    if (getEmbarkedPayloadValue(state, playerIndex, unit.id) > 0 && exposure.total >= HIGH_EXPOSURE_THRESHOLD) {
      transportPayloadExposure += strategicValue + getEmbarkedPayloadValue(state, playerIndex, unit.id);
    }
  }

  return {
    bestRangedVsObjectiveHolders: summarizeBestPressure(state, friendlyUnits, enemyHolders, 'ranged'),
    bestMeleeVsObjectiveHolders: summarizeBestPressure(state, friendlyUnits, enemyHolders, 'melee'),
    bestRangedVsHighValueTargets: summarizeBestPressure(state, friendlyUnits, highValueTargets, 'ranged'),
    bestMeleeVsHighValueTargets: summarizeBestPressure(state, friendlyUnits, highValueTargets, 'melee'),
    objectiveHoldDurability,
    objectiveHolderValue,
    contestedObjectiveValue,
    exposedObjectiveHolderValue,
    exposedHighValueValue,
    retaliationPressure,
    warlordExposureValue,
    transportPayloadExposure,
    antiVehicleRangedPressure: summarizeBestPressure(state, friendlyUnits, vehicleTargets, 'ranged'),
    antiVehicleMeleePressure: summarizeBestPressure(state, friendlyUnits, vehicleTargets, 'melee'),
  };
}

export function summarizeTacticalBalance(
  state: GameState,
  playerIndex: number,
): { friendly: PlayerTacticalSummary; enemy: PlayerTacticalSummary } {
  return {
    friendly: summarizePlayerTacticalState(state, playerIndex),
    enemy: summarizePlayerTacticalState(state, playerIndex === 0 ? 1 : 0),
  };
}

export function estimateProjectedObjectiveValue(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  positionOverride?: Position,
): number {
  const objectiveValue = estimateUnitStrategicValue(state, playerIndex, unit, positionOverride);
  if (isObjectiveHolder(state, unit, positionOverride)) {
    return objectiveValue;
  }
  if (isObjectiveContester(state, unit, positionOverride)) {
    return objectiveValue * 0.6;
  }
  return 0;
}
