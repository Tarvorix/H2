import type {
  GameState,
  ModelState,
  ShootingMisfireGroup,
  SpecialRuleRef,
  TacticalStatus,
} from '@hh/types';
import { ModelSubType, VehicleFacing } from '@hh/types';
import type {
  CommandResult,
  DamageAppliedEvent,
  FireGroupResolvedEvent,
  GameEvent,
  DiceProvider,
} from '../types';
import { findModel, getAliveModels } from '../game-queries';
import {
  lookupModelDefinition,
  lookupUnitProfile,
  getModelInvulnSave,
  getModelSave,
  getModelToughness,
  getVehicleArmour,
  unitProfileHasSubType,
} from '../profile-lookup';
import { updateModelInUnit, updateUnitInGameState, applyWoundsToModel, addStatus } from '../state-helpers';
import type { FireGroup, GlancingHit, HitResult, WoundResult } from './shooting-types';
import { getSpecialRuleValue } from './hit-resolution';
import { resolveArmourPenetration } from './armour-penetration';
import { resolveDamage, handleDamageMitigation } from './damage-resolution';
import { removeCasualties } from './casualty-removal';
import { resolveSaves } from './save-resolution';
import {
  accumulateHullPointLossesFromGlancingHits,
  resolveVehicleDamageTable,
} from './vehicle-damage';
import { resolveWoundTests } from './wound-resolution';

interface DamageMitigationOption {
  label: string;
  targetNumber: number;
}

function chooseBestTargetNumber(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (validValues.length === 0) {
    return null;
  }
  return Math.min(...validValues);
}

function getRuleThreshold(ruleRefs: SpecialRuleRef[] | undefined, ruleName: string): number | null {
  if (!ruleRefs || ruleRefs.length === 0) {
    return null;
  }
  return getSpecialRuleValue(ruleRefs, ruleName);
}

function getModifierThreshold(model: ModelState, characteristic: string): number | null {
  const matching = model.modifiers.filter(
    (modifier) => modifier.characteristic.toLowerCase() === characteristic.toLowerCase(),
  );
  if (matching.length === 0) {
    return null;
  }

  const setValues = matching
    .filter((modifier) => modifier.operation === 'set')
    .map((modifier) => modifier.value);
  if (setValues.length > 0) {
    return chooseBestTargetNumber(setValues);
  }

  return chooseBestTargetNumber(matching.map((modifier) => modifier.value));
}

function getEffectiveInvulnerableSave(model: ModelState): number | null {
  return chooseBestTargetNumber([
    getModelInvulnSave(model.unitProfileId, model.profileModelName),
    getModifierThreshold(model, 'InvulnSave'),
  ]);
}

function getBestDamageMitigationOption(model: ModelState): DamageMitigationOption | null {
  const profile = lookupUnitProfile(model.unitProfileId);
  const modelDef = lookupModelDefinition(model.unitProfileId, model.profileModelName);
  const candidates: DamageMitigationOption[] = [];

  const shroudedThreshold = chooseBestTargetNumber([
    getRuleThreshold(profile?.specialRules, 'Shrouded'),
    getRuleThreshold(modelDef?.specialRules, 'Shrouded'),
    getModifierThreshold(model, 'Shrouded'),
  ]);
  if (shroudedThreshold !== null) {
    candidates.push({ label: 'Shrouded', targetNumber: shroudedThreshold });
  }

  const fnpThreshold = chooseBestTargetNumber([
    getRuleThreshold(profile?.specialRules, 'Feel No Pain'),
    getRuleThreshold(modelDef?.specialRules, 'Feel No Pain'),
    getModifierThreshold(model, 'FNP'),
  ]);
  if (fnpThreshold !== null) {
    candidates.push({ label: 'Feel No Pain', targetNumber: fnpThreshold });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => left.targetNumber - right.targetNumber);
  return candidates[0];
}

function hasSpecialRule(ruleRefs: SpecialRuleRef[] | undefined, ruleName: string): boolean {
  if (!ruleRefs) {
    return false;
  }
  return ruleRefs.some((rule) => rule.name.toLowerCase() === ruleName.toLowerCase());
}

function hasWeaponTrait(traits: string[], traitName: string): boolean {
  return traits.some((trait) => trait.toLowerCase() === traitName.toLowerCase());
}

function hasThermalDiffractionField(model: ModelState): boolean {
  const profile = lookupUnitProfile(model.unitProfileId);
  const modelDef = lookupModelDefinition(model.unitProfileId, model.profileModelName);
  return (
    hasSpecialRule(profile?.specialRules, 'Thermal Diffraction Field') ||
    hasSpecialRule(modelDef?.specialRules, 'Thermal Diffraction Field')
  );
}

function isThermalDiffractionSensitiveWeapon(group: ShootingMisfireGroup): boolean {
  return ['Las', 'Plasma', 'Melta', 'Flame'].some((trait) => hasWeaponTrait(group.traits, trait));
}

function createMisfireHit(group: ShootingMisfireGroup): HitResult {
  return {
    diceRoll: 0,
    targetNumber: 0,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    isAutoHit: true,
    sourceModelId: group.sourceModelId,
    weaponStrength: group.weaponStrength,
    weaponAP: group.weaponAP,
    weaponDamage: group.weaponDamage,
    specialRules: group.specialRules.map((rule) => ({ ...rule })),
  };
}

function toMisfireWeaponName(group: ShootingMisfireGroup): string {
  return `${group.weaponName} (Misfire)`;
}

function selectNextMisfireTargetModel(
  state: GameState,
  attackerUnitId: string,
  eligibleModelIds: string[],
): ModelState | null {
  const unit = state.armies
    .flatMap((army) => army.units)
    .find((candidate) => candidate.id === attackerUnitId);
  if (!unit) {
    return null;
  }

  const eligible = getAliveModels(unit).filter((model) => eligibleModelIds.includes(model.id));
  return eligible[0] ?? null;
}

function getLowestArmourFacing(model: ModelState): { facing: VehicleFacing; value: number } | null {
  const armour = getVehicleArmour(model.unitProfileId, model.profileModelName);
  if (!armour) {
    return null;
  }

  const facings: Array<{ facing: VehicleFacing; value: number }> = [
    { facing: VehicleFacing.Front, value: armour.front },
    { facing: VehicleFacing.Side, value: armour.side },
    { facing: VehicleFacing.Rear, value: armour.rear },
  ];

  facings.sort((left, right) => left.value - right.value);
  return facings[0];
}

function applyThermalBreachingRestriction(
  group: ShootingMisfireGroup,
  sourceModel: ModelState,
  wound: WoundResult,
): WoundResult {
  if (!hasThermalDiffractionField(sourceModel)) {
    return wound;
  }

  if (!wound.isBreaching || wound.diceRoll < 0 || wound.diceRoll >= 6) {
    return wound;
  }

  return {
    ...wound,
    ap: group.weaponAP,
    isBreaching: false,
  };
}

function resolveInfantryMisfireGroup(
  state: GameState,
  group: ShootingMisfireGroup,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[]; totalWounds: number } {
  let currentState = state;
  const events: GameEvent[] = [];
  const casualties: string[] = [];
  let totalWounds = 0;

  const sourceInfo = findModel(currentState, group.sourceModelId);
  if (!sourceInfo) {
    return { state, events, totalWounds };
  }

  for (let index = 0; index < group.misfireCount; index++) {
    const targetModel = selectNextMisfireTargetModel(currentState, group.attackerUnitId, group.eligibleModelIds);
    if (!targetModel) {
      break;
    }

    const thermalStrengthModifier =
      hasThermalDiffractionField(targetModel) && isThermalDiffractionSensitiveWeapon(group)
        ? -1
        : 0;
    const hit = createMisfireHit(group);
    const woundResolution = resolveWoundTests(
      [hit],
      getModelToughness(targetModel.unitProfileId, targetModel.profileModelName),
      dice,
      thermalStrengthModifier,
    );
    events.push(...woundResolution.events);

    const wound = woundResolution.wounds[0];
    if (!wound?.isWound) {
      continue;
    }

    totalWounds += 1;
    let resolvedWound = applyThermalBreachingRestriction(group, sourceInfo.model, wound);
    resolvedWound = {
      ...resolvedWound,
      assignedToModelId: targetModel.id,
    };

    const saveResolution = resolveSaves(
      getModelSave(targetModel.unitProfileId, targetModel.profileModelName),
      getEffectiveInvulnerableSave(targetModel),
      null,
      [resolvedWound],
      dice,
    );
    events.push(...saveResolution.events);

    let unresolvedWounds = saveResolution.unsavedWounds;
    if (unresolvedWounds.length > 0) {
      const mitigation = getBestDamageMitigationOption(targetModel);
      if (mitigation) {
        const mitigationResult = handleDamageMitigation(
          unresolvedWounds,
          mitigation.label,
          mitigation.targetNumber,
          dice,
        );
        events.push(...mitigationResult.events);
        unresolvedWounds = mitigationResult.remainingWounds;
      }
    }

    if (unresolvedWounds.length === 0) {
      continue;
    }

    const freshTarget = findModel(currentState, targetModel.id);
    if (!freshTarget) {
      continue;
    }

    const damageResult = resolveDamage(
      unresolvedWounds,
      targetModel.id,
      freshTarget.model.currentWounds,
    );
    currentState = updateUnitInGameState(currentState, group.attackerUnitId, (unit) =>
      updateModelInUnit(unit, targetModel.id, (model) => ({
        ...model,
        currentWounds: damageResult.finalWounds,
        isDestroyed: damageResult.destroyed,
      })),
    );

    const damageEvent: DamageAppliedEvent = {
      type: 'damageApplied',
      modelId: targetModel.id,
      unitId: group.attackerUnitId,
      woundsLost: damageResult.totalDamageApplied,
      remainingWounds: damageResult.finalWounds,
      destroyed: damageResult.destroyed,
      damageSource: `Misfire from ${group.weaponName}`,
    };
    events.push(damageEvent);

    if (damageResult.destroyed) {
      casualties.push(targetModel.id);
    }
  }

  if (casualties.length > 0) {
    const casualtyResult = removeCasualties(
      currentState,
      casualties,
      { [group.attackerUnitId]: group.eligibleModelIds.length },
      { emitEventsForAlreadyDestroyedModels: true },
    );
    currentState = casualtyResult.state;
    events.push(...casualtyResult.events);
  }

  return { state: currentState, events, totalWounds };
}

function resolveVehicleMisfireGroup(
  state: GameState,
  group: ShootingMisfireGroup,
  dice: DiceProvider,
): {
  state: GameState;
  events: GameEvent[];
  totalPenetrating: number;
  totalGlancing: number;
} {
  let currentState = state;
  const events: GameEvent[] = [];
  const sourceInfo = findModel(currentState, group.sourceModelId);
  if (!sourceInfo) {
    return { state, events, totalPenetrating: 0, totalGlancing: 0 };
  }

  const lowestFacing = getLowestArmourFacing(sourceInfo.model);
  if (!lowestFacing) {
    return { state, events, totalPenetrating: 0, totalGlancing: 0 };
  }

  let totalPenetrating = 0;
  let totalGlancing = 0;
  const accumulatedGlancingHits: GlancingHit[] = [];
  const casualties: string[] = [];

  for (let index = 0; index < group.misfireCount; index++) {
    const currentVehicle = findModel(currentState, group.sourceModelId);
    if (!currentVehicle || currentVehicle.model.isDestroyed) {
      break;
    }

    const hit = createMisfireHit(group);
    const armourPenetration = resolveArmourPenetration(
      [hit],
      lowestFacing.value,
      lowestFacing.facing,
      dice,
    );
    events.push(...armourPenetration.events);
    totalPenetrating += armourPenetration.penetratingHits.length;
    totalGlancing += armourPenetration.glancingHits.length;

    accumulatedGlancingHits.push(
      ...armourPenetration.glancingHits.map((glancingHit) => ({
        ...glancingHit,
        vehicleModelId: group.sourceModelId,
        vehicleUnitId: group.attackerUnitId,
      })),
    );

    for (const penetratingHit of armourPenetration.penetratingHits) {
      const freshVehicle = findModel(currentState, group.sourceModelId);
      if (!freshVehicle || freshVehicle.model.isDestroyed) {
        break;
      }

      const damageResult = resolveDamage(
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
        group.sourceModelId,
        freshVehicle.model.currentWounds,
      );

      currentState = updateUnitInGameState(currentState, group.attackerUnitId, (unit) =>
        updateModelInUnit(unit, group.sourceModelId, (model) => ({
          ...model,
          currentWounds: damageResult.finalWounds,
          isDestroyed: damageResult.destroyed,
        })),
      );

      const damageEvent: DamageAppliedEvent = {
        type: 'damageApplied',
        modelId: group.sourceModelId,
        unitId: group.attackerUnitId,
        woundsLost: damageResult.totalDamageApplied,
        remainingWounds: damageResult.finalWounds,
        destroyed: damageResult.destroyed,
        damageSource: `Misfire from ${group.weaponName}`,
      };
      events.push(damageEvent);

      if (damageResult.destroyed) {
        casualties.push(group.sourceModelId);
      }
    }
  }

  if (accumulatedGlancingHits.length > 0) {
    const currentVehicle = findModel(currentState, group.sourceModelId);
    if (currentVehicle && !currentVehicle.model.isDestroyed) {
      const currentUnit = currentVehicle.unit;
      if (unitProfileHasSubType(currentUnit.profileId, ModelSubType.Flyer)) {
        for (const hullPointEntry of accumulateHullPointLossesFromGlancingHits(accumulatedGlancingHits)) {
          currentState = updateUnitInGameState(currentState, hullPointEntry.vehicleUnitId, (unit) =>
            updateModelInUnit(unit, hullPointEntry.vehicleModelId, (model) =>
              applyWoundsToModel(model, hullPointEntry.hullPointsLost),
            ),
          );
        }
      } else {
        const existingStatuses = new Map<string, TacticalStatus[]>([
          [group.sourceModelId, [...currentUnit.statuses]],
        ]);
        const damageTable = resolveVehicleDamageTable(accumulatedGlancingHits, existingStatuses, dice);
        events.push(...damageTable.events);

        for (const statusEntry of damageTable.statusesToApply) {
          currentState = updateUnitInGameState(currentState, statusEntry.vehicleUnitId, (unit) =>
            addStatus(unit, statusEntry.status),
          );
        }

        for (const hullPointEntry of damageTable.hullPointsToRemove) {
          currentState = updateUnitInGameState(currentState, hullPointEntry.vehicleUnitId, (unit) =>
            updateModelInUnit(unit, hullPointEntry.vehicleModelId, (model) =>
              applyWoundsToModel(model, hullPointEntry.hullPointsLost),
            ),
          );
        }
      }
    }
  }

  if (casualties.length > 0) {
    const casualtyResult = removeCasualties(
      currentState,
      casualties,
      { [group.attackerUnitId]: 1 },
      { emitEventsForAlreadyDestroyedModels: true },
    );
    currentState = casualtyResult.state;
    events.push(...casualtyResult.events);
  }

  return {
    state: currentState,
    events,
    totalPenetrating,
    totalGlancing,
  };
}

export function buildPendingMisfireGroupsFromHitResults(
  fireGroup: FireGroup,
  hitResults: HitResult[],
  attackerUnitId: string,
): ShootingMisfireGroup[] {
  const overloadValue = getSpecialRuleValue(fireGroup.specialRules, 'Overload');
  if (overloadValue === null) {
    return [];
  }

  const eligibleModelIds = [...new Set(fireGroup.attacks.map((attack) => attack.modelId))];
  const counts = new Map<string, number>();

  for (const hitResult of hitResults) {
    if (hitResult.diceRoll <= 0 || hitResult.diceRoll > overloadValue) {
      continue;
    }
    counts.set(hitResult.sourceModelId, (counts.get(hitResult.sourceModelId) ?? 0) + 1);
  }

  return [...counts.entries()].map(([sourceModelId, misfireCount]) => ({
    sourceFireGroupIndex: fireGroup.index,
    sourceModelId,
    attackerUnitId,
    weaponName: fireGroup.weaponName,
    misfireCount,
    eligibleModelIds,
    weaponStrength: fireGroup.weaponProfile.rangedStrength,
    weaponAP: fireGroup.weaponProfile.ap,
    weaponDamage: fireGroup.weaponProfile.damage,
    specialRules: fireGroup.weaponProfile.specialRules.map((rule) => ({ ...rule })),
    traits: [...fireGroup.weaponProfile.traits],
    fromTemplate: false,
  }));
}

export function rollTemplateMisfireGroups(
  fireGroup: FireGroup,
  attackerUnitId: string,
  dice: DiceProvider,
): ShootingMisfireGroup[] {
  const overloadValue = getSpecialRuleValue(fireGroup.specialRules, 'Overload');
  if (overloadValue === null || !fireGroup.weaponProfile.hasTemplate) {
    return [];
  }

  const eligibleModelIds = [...new Set(fireGroup.attacks.map((attack) => attack.modelId))];
  const groups: ShootingMisfireGroup[] = [];

  for (const attack of fireGroup.attacks) {
    let misfireCount = 0;
    for (let index = 0; index < attack.firepower; index++) {
      if (dice.rollD6() <= overloadValue) {
        misfireCount += 1;
      }
    }

    if (misfireCount === 0) {
      continue;
    }

    groups.push({
      sourceFireGroupIndex: fireGroup.index,
      sourceModelId: attack.modelId,
      attackerUnitId,
      weaponName: fireGroup.weaponName,
      misfireCount,
      eligibleModelIds,
      weaponStrength: fireGroup.weaponProfile.rangedStrength,
      weaponAP: fireGroup.weaponProfile.ap,
      weaponDamage: fireGroup.weaponProfile.damage,
      specialRules: fireGroup.weaponProfile.specialRules.map((rule) => ({ ...rule })),
      traits: [...fireGroup.weaponProfile.traits],
      fromTemplate: true,
    });
  }

  return groups;
}

export function resolvePendingMisfireGroups(
  state: GameState,
  pendingGroups: ShootingMisfireGroup[],
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  let currentState = state;
  const events: GameEvent[] = [];

  for (const group of pendingGroups) {
    const sourceInfo = findModel(currentState, group.sourceModelId);
    if (!sourceInfo) {
      continue;
    }

    const isVehicleMisfire = getVehicleArmour(
      sourceInfo.model.unitProfileId,
      sourceInfo.model.profileModelName,
    ) !== undefined;

    if (isVehicleMisfire) {
      const result = resolveVehicleMisfireGroup(currentState, group, dice);
      currentState = result.state;
      events.push(...result.events);

      const resolvedEvent: FireGroupResolvedEvent = {
        type: 'fireGroupResolved',
        fireGroupIndex: group.sourceFireGroupIndex,
        weaponName: toMisfireWeaponName(group),
        totalHits: group.misfireCount,
        totalWounds: 0,
        totalPenetrating: result.totalPenetrating,
        totalGlancing: result.totalGlancing,
      };
      events.push(resolvedEvent);
      continue;
    }

    const result = resolveInfantryMisfireGroup(currentState, group, dice);
    currentState = result.state;
    events.push(...result.events);

    const resolvedEvent: FireGroupResolvedEvent = {
      type: 'fireGroupResolved',
      fireGroupIndex: group.sourceFireGroupIndex,
      weaponName: toMisfireWeaponName(group),
      totalHits: group.misfireCount,
      totalWounds: result.totalWounds,
      totalPenetrating: 0,
      totalGlancing: 0,
    };
    events.push(resolvedEvent);
  }

  return { state: currentState, events };
}

export function resolveDeferredMisfiresFromAttackState(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  const pendingGroups = state.shootingAttackState?.pendingMisfireGroups ?? [];
  if (pendingGroups.length === 0) {
    return { state, events: [], errors: [], accepted: true };
  }

  const resolved = resolvePendingMisfireGroups(state, pendingGroups, dice);
  return {
    state: {
      ...resolved.state,
      shootingAttackState: resolved.state.shootingAttackState
        ? {
            ...resolved.state.shootingAttackState,
            pendingMisfireGroups: [],
          }
        : resolved.state.shootingAttackState,
    },
    events: resolved.events,
    errors: [],
    accepted: true,
  };
}
