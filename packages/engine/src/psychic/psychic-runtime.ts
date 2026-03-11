import type {
  ActivePsychicEffect,
  GameState,
  ModelState,
  PsychicDisciplineDefinition,
  PsychicGambitDefinition,
  PsychicPowerDefinition,
  PsychicReactionDefinition,
  PsychicState,
  UnitState,
} from '@hh/types';
import {
  ModelSubType,
  ModelType,
  PipelineHook,
  TacticalStatus,
} from '@hh/types';
import type { MeleeWeaponProfile, RangedWeaponProfile } from '@hh/types';
import {
  findDisciplineByName,
  getDisciplineIds,
  getPsychicWeaponProfile,
  getTacticaEffectsForLegion,
  PSYCHIC_DISCIPLINES,
} from '@hh/data';
import { distanceShapes, hasLOS } from '@hh/geometry';
import {
  findModel,
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
  getInterveningVehicleShapes,
  getModelShape,
  getUnitLegion,
} from '../game-queries';
import { applyLegionTactica } from '../legion';
import { getEffectiveNumericCharacteristic } from '../characteristic-modifiers';
import {
  getModelInvulnSave,
  getModelWillpower,
  lookupModelDefinition,
  lookupUnitProfile,
  modelHasSubType,
} from '../profile-lookup';
import { addStatus, applyWoundsToModel, updateModelInUnit, updateUnitInGameState } from '../state-helpers';

const DISCIPLINE_IDS = new Set(getDisciplineIds());
const WARGEAR_OPTION_MARKER = /^__wargear_option_(\d+)$/;

interface PsychicCheckResult {
  focusUnitId: string;
  focusModelId: string;
  targetNumber: number;
  dice: [number, number] | null;
  total: number | null;
  passed: boolean;
  perilsValue: number | null;
}

function normalizeDisciplineToken(value: string): string {
  return value
    .trim()
    .replace(/\+\d+\s*points?/gi, '')
    .replace(/\bfree\b/gi, '')
    .replace(/[’']/g, '\'')
    .trim()
    .toLowerCase();
}

function getPsychicState(state: GameState): PsychicState {
  return state.psychicState ?? { usages: [], activeEffects: [] };
}

function setPsychicState(state: GameState, psychicState: PsychicState): GameState {
  return { ...state, psychicState };
}

function chooseBestTargetNumber(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );
  if (validValues.length === 0) {
    return null;
  }

  return Math.min(...validValues);
}

function getModelInvulnerableSave(_unit: UnitState, model: ModelState): number | null {
  const modifierSave = chooseBestTargetNumber(
    model.modifiers
      .filter((modifier) => modifier.characteristic.toLowerCase() === 'invulnsave')
      .map((modifier) => modifier.value),
  );

  return chooseBestTargetNumber([
    getModelInvulnSave(model.unitProfileId, model.profileModelName),
    modifierSave,
  ]);
}

function unitProfileHasTrait(profileId: string, traitName: string): boolean {
  const profile = lookupUnitProfile(profileId);
  if (!profile) {
    return false;
  }

  return profile.traits.some((trait) => trait.value.toLowerCase() === traitName.toLowerCase());
}

function getWargearOptionDisciplineId(model: ModelState, optionIndex: number): string | null {
  const profile = lookupUnitProfile(model.unitProfileId);
  const option = profile?.wargearOptions?.[optionIndex];
  if (!option) {
    return null;
  }

  const addedDiscipline = option.adds.find((entry) => DISCIPLINE_IDS.has(entry));
  if (addedDiscipline) {
    return addedDiscipline;
  }

  const normalizedDescription = normalizeDisciplineToken(option.description);
  const discipline = findDisciplineByName(normalizedDescription);
  return discipline?.id ?? null;
}

export function getModelPsychicDisciplineIds(model: ModelState): string[] {
  const disciplineIds = new Set<string>();

  for (const wargearId of model.equippedWargear) {
    if (DISCIPLINE_IDS.has(wargearId)) {
      disciplineIds.add(wargearId);
      continue;
    }

    const match = wargearId.match(WARGEAR_OPTION_MARKER);
    if (!match) {
      continue;
    }

    const optionIndex = Number(match[1]);
    if (!Number.isFinite(optionIndex)) {
      continue;
    }

    const disciplineId = getWargearOptionDisciplineId(model, optionIndex);
    if (disciplineId) {
      disciplineIds.add(disciplineId);
    }
  }

  return [...disciplineIds];
}

export function getModelPsychicDisciplines(model: ModelState): PsychicDisciplineDefinition[] {
  return getModelPsychicDisciplineIds(model)
    .map((disciplineId) => PSYCHIC_DISCIPLINES[disciplineId])
    .filter((discipline): discipline is PsychicDisciplineDefinition => discipline !== undefined);
}

export function modelHasPsychicDiscipline(model: ModelState, disciplineId: string): boolean {
  return getModelPsychicDisciplineIds(model).includes(disciplineId);
}

export function modelHasPsychicTrait(state: GameState, model: ModelState): boolean {
  if (unitProfileHasTrait(model.unitProfileId, 'Psyker')) {
    return true;
  }

  const found = findModel(state, model.id);
  if (!found) {
    return false;
  }

  const legion = getUnitLegion(state, found.unit.id);
  if (!legion) {
    return false;
  }

  const passiveResult = applyLegionTactica(legion, PipelineHook.Passive, {
    state,
    unit: found.unit,
    effects: getTacticaEffectsForLegion(legion),
    hook: PipelineHook.Passive,
    model,
    entireUnitHasTactica: true,
  } as any);

  return passiveResult.grantPsykerTrait === true;
}

export function modelHasGrantedPsychicTrait(
  model: ModelState,
  grantedTrait: string,
): boolean {
  return getModelPsychicDisciplines(model).some((discipline) =>
    discipline.grantedTrait.toLowerCase() === grantedTrait.toLowerCase(),
  );
}

export function getModelPsychicPower(
  model: ModelState,
  powerId: string,
): PsychicPowerDefinition | undefined {
  return getModelPsychicDisciplines(model)
    .flatMap((discipline) => discipline.powers)
    .find((power) => power.id === powerId);
}

export function getModelPsychicReaction(
  model: ModelState,
  reactionId: string,
): PsychicReactionDefinition | undefined {
  return getModelPsychicDisciplines(model)
    .flatMap((discipline) => discipline.reactions)
    .find((reaction) => reaction.id === reactionId);
}

export function getModelPsychicGambit(
  model: ModelState,
  gambitId: string,
): PsychicGambitDefinition | undefined {
  return getModelPsychicDisciplines(model)
    .flatMap((discipline) => discipline.gambits)
    .find((gambit) => gambit.id === gambitId);
}

export function getModelPsychicRangedWeapon(
  model: ModelState,
  weaponId: string,
): RangedWeaponProfile | undefined {
  const matchingWeapon = getModelPsychicDisciplines(model)
    .flatMap((discipline) => discipline.weapons)
    .find((weapon) => weapon.id === weaponId || weapon.weaponProfileId === weaponId);

  if (!matchingWeapon) {
    return undefined;
  }

  const profile = getPsychicWeaponProfile(matchingWeapon.weaponProfileId);
  if (!profile || !('range' in profile)) {
    return undefined;
  }

  return profile as RangedWeaponProfile;
}

export function getModelPsychicMeleeWeapon(
  model: ModelState,
  weaponId: string,
): MeleeWeaponProfile | undefined {
  const matchingWeapon = getModelPsychicDisciplines(model)
    .flatMap((discipline) => discipline.weapons)
    .find((weapon) => weapon.id === weaponId || weapon.weaponProfileId === weaponId);

  if (!matchingWeapon) {
    return undefined;
  }

  const profile = getPsychicWeaponProfile(matchingWeapon.weaponProfileId);
  if (!profile || !('initiativeModifier' in profile)) {
    return undefined;
  }

  return profile as MeleeWeaponProfile;
}

export function getCurrentModelWillpower(
  state: GameState,
  unit: UnitState,
  model: ModelState,
): number {
  const legion = getUnitLegion(state, unit.id);
  const legionBonus = legion
    ? applyLegionTactica(legion, PipelineHook.Passive, {
        state,
        unit,
        effects: getTacticaEffectsForLegion(legion),
        hook: PipelineHook.Passive,
        model,
        entireUnitHasTactica: true,
      } as any).willpowerBonus ?? 0
    : 0;

  const tranquillityPenalty = getActivePsychicEffects(state, unit.id, 'tranquillity').length > 0 ? 2 : 0;
  const baseValue = getModelWillpower(model.unitProfileId, model.profileModelName) + legionBonus - tranquillityPenalty;
  return Math.max(0, Math.round(getEffectiveNumericCharacteristic(baseValue, 'WP', unit, model)));
}

function getPsychicUsageKeyMatches(
  state: GameState,
  unitId: string,
  kind: 'power' | 'reaction',
): boolean {
  return getPsychicState(state).usages.some((usage) =>
    usage.unitId === unitId &&
    usage.kind === kind &&
    usage.battleTurn === state.currentBattleTurn &&
    usage.turnOwnerPlayerIndex === state.activePlayerIndex,
  );
}

export function unitHasUsedPsychicPower(state: GameState, unitId: string): boolean {
  return getPsychicUsageKeyMatches(state, unitId, 'power');
}

export function unitHasUsedPsychicReaction(state: GameState, unitId: string): boolean {
  return getPsychicUsageKeyMatches(state, unitId, 'reaction');
}

export function recordPsychicUsage(
  state: GameState,
  unitId: string,
  kind: 'power' | 'reaction',
): GameState {
  const psychicState = getPsychicState(state);
  return setPsychicState(state, {
    ...psychicState,
    usages: [
      ...psychicState.usages,
      {
        unitId,
        kind,
        battleTurn: state.currentBattleTurn,
        turnOwnerPlayerIndex: state.activePlayerIndex,
      },
    ],
  });
}

export function addActivePsychicEffect(
  state: GameState,
  effect: ActivePsychicEffect,
): GameState {
  const psychicState = getPsychicState(state);
  return setPsychicState(state, {
    ...psychicState,
    activeEffects: [
      ...psychicState.activeEffects.filter((existing) => existing.id !== effect.id),
      effect,
    ],
  });
}

export function removeActivePsychicEffect(
  state: GameState,
  effectId: string,
): GameState {
  const psychicState = getPsychicState(state);
  return setPsychicState(state, {
    ...psychicState,
    activeEffects: psychicState.activeEffects.filter((effect) => effect.id !== effectId),
  });
}

export function getActivePsychicEffects(
  state: GameState,
  targetUnitId: string,
  sourcePowerId?: string,
): ActivePsychicEffect[] {
  return getPsychicState(state).activeEffects.filter((effect) =>
    effect.targetUnitId === targetUnitId &&
    (sourcePowerId ? effect.sourcePowerId === sourcePowerId : true),
  );
}

export function expirePsychicEffectsAtTurnStart(state: GameState): GameState {
  const psychicState = getPsychicState(state);
  return setPsychicState(state, {
    ...psychicState,
    activeEffects: psychicState.activeEffects.filter((effect) =>
      !(effect.expiry.type === 'startOfPlayerTurn' && effect.expiry.playerIndex === state.activePlayerIndex),
    ),
  });
}

export function expireEndOfShootingAttackEffects(state: GameState): GameState {
  const psychicState = getPsychicState(state);
  return setPsychicState(state, {
    ...psychicState,
    activeEffects: psychicState.activeEffects.filter((effect) => effect.expiry.type !== 'endOfShootingAttack'),
  });
}

export function getPsychicWeaponStrengthModifier(
  state: GameState,
  unitId: string,
): number {
  return getActivePsychicEffects(state, unitId, 'tranquillity').length > 0 ? -1 : 0;
}

export function unitCanUsePsychicAbilities(_state: GameState, unit: UnitState): boolean {
  if (unit.isInReserves) {
    return false;
  }
  if (!unit.isDeployed) {
    return false;
  }
  if (unit.embarkedOnId !== null) {
    return false;
  }
  return true;
}

function selectResistanceFocus(unit: UnitState, state: GameState): { model: ModelState; targetNumber: number } | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return null;
  }

  const eligibleLeaders = aliveModels.filter((model) =>
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Sergeant) ||
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Command) ||
    lookupModelDefinition(model.unitProfileId, model.profileModelName)?.modelType === ModelType.Paragon,
  );

  const pool = eligibleLeaders.length > 0 ? eligibleLeaders : aliveModels;
  const sorted = [...pool].sort((left, right) => {
    const leftWillpower = getCurrentModelWillpower(state, unit, left);
    const rightWillpower = getCurrentModelWillpower(state, unit, right);
    return eligibleLeaders.length > 0
      ? rightWillpower - leftWillpower
      : leftWillpower - rightWillpower;
  });

  const model = sorted[0];
  return {
    model,
    targetNumber: getCurrentModelWillpower(state, unit, model),
  };
}

export function resolveManifestationCheck(
  state: GameState,
  focusModelId: string,
  dice: { roll2D6: () => [number, number] },
  ignorePerils: boolean = false,
): PsychicCheckResult | null {
  const found = findModel(state, focusModelId);
  if (!found) {
    return null;
  }

  const targetNumber = getCurrentModelWillpower(state, found.unit, found.model);
  if (targetNumber <= 0) {
    return {
      focusUnitId: found.unit.id,
      focusModelId,
      targetNumber,
      dice: null,
      total: null,
      passed: false,
      perilsValue: null,
    };
  }

  const checkDice = dice.roll2D6();
  const total = checkDice[0] + checkDice[1];
  const isDouble = checkDice[0] === checkDice[1];
  const passed = checkDice[0] === 1 && checkDice[1] === 1
    ? true
    : checkDice[0] === 6 && checkDice[1] === 6
      ? false
      : total <= targetNumber;

  return {
    focusUnitId: found.unit.id,
    focusModelId,
    targetNumber,
    dice: checkDice,
    total,
    passed,
    perilsValue: !ignorePerils && isDouble ? checkDice[0] : null,
  };
}

export function resolveResistanceCheck(
  state: GameState,
  targetUnitId: string,
  dice: { roll2D6: () => [number, number] },
): PsychicCheckResult | null {
  const unit = findUnit(state, targetUnitId);
  if (!unit) {
    return null;
  }

  const focus = selectResistanceFocus(unit, state);
  if (!focus) {
    return null;
  }

  if (focus.targetNumber <= 0) {
    return {
      focusUnitId: unit.id,
      focusModelId: focus.model.id,
      targetNumber: focus.targetNumber,
      dice: null,
      total: null,
      passed: false,
      perilsValue: null,
    };
  }

  const checkDice = dice.roll2D6();
  const total = checkDice[0] + checkDice[1];
  const isDouble = checkDice[0] === checkDice[1];
  const passed = checkDice[0] === 1 && checkDice[1] === 1
    ? true
    : checkDice[0] === 6 && checkDice[1] === 6
      ? false
      : total <= focus.targetNumber;

  return {
    focusUnitId: unit.id,
    focusModelId: focus.model.id,
    targetNumber: focus.targetNumber,
    dice: checkDice,
    total,
    passed,
    perilsValue: isDouble ? checkDice[0] : null,
  };
}

function applyWarpRuptureToUnit(
  state: GameState,
  unitId: string,
  wounds: number,
  dice: { rollD6: () => number },
): GameState {
  let currentState = state;

  for (let index = 0; index < wounds; index++) {
    const unit = findUnit(currentState, unitId);
    if (!unit) {
      break;
    }

    const targetModel = getAliveModels(unit)[0];
    if (!targetModel) {
      break;
    }

    const invulnerableSave = getModelInvulnerableSave(unit, targetModel);
    if (invulnerableSave !== null) {
      const saveRoll = dice.rollD6();
      if (saveRoll >= invulnerableSave) {
        continue;
      }
    }

    currentState = updateUnitInGameState(currentState, unit.id, (updatedUnit) =>
      updateModelInUnit(updatedUnit, targetModel.id, (model) => applyWoundsToModel(model, 1)),
    );
  }

  return currentState;
}

export function applyPerilsOfTheWarp(
  state: GameState,
  unitId: string,
  perilsValue: number,
  dice: { rollD6: () => number },
): GameState {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return state;
  }

  if (perilsValue === 1 || perilsValue === 6) {
    const resistanceFocus = selectResistanceFocus(unit, state);
    const selectedWillpower = resistanceFocus
      ? getCurrentModelWillpower(state, unit, resistanceFocus.model)
      : 0;
    const wounds = Math.max(1, 13 - selectedWillpower);
    return applyWarpRuptureToUnit(state, unitId, wounds, dice);
  }

  return updateUnitInGameState(state, unitId, (targetUnit) => addStatus(targetUnit, TacticalStatus.Stunned));
}

export function modelHasLOSToUnit(
  state: GameState,
  modelId: string,
  targetUnitId: string,
): boolean {
  const found = findModel(state, modelId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!found || !targetUnit || !found.unit.isDeployed || !targetUnit.isDeployed) {
    return false;
  }

  const blockingVehicles = getInterveningVehicleShapes(state, new Set<string>([found.unit.id, targetUnitId]));
  const modelShape = getModelShape(found.model);

  return getAliveModels(targetUnit).some((targetModel) =>
    hasLOS(modelShape, getModelShape(targetModel), state.terrain, blockingVehicles),
  );
}

export function modelIsWithinRangeOfUnit(
  state: GameState,
  modelId: string,
  targetUnitId: string,
  range: number,
): boolean {
  const found = findModel(state, modelId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!found || !targetUnit) {
    return false;
  }

  const sourceShape = getModelShape(found.model);
  return getAliveModels(targetUnit).some((targetModel) =>
    distanceShapes(sourceShape, getModelShape(targetModel)) <= range,
  );
}

export function getFirstAvailablePsychicFocus(
  state: GameState,
  unitId: string,
  predicate: (model: ModelState) => boolean,
): ModelState | null {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return null;
  }

  return getAliveModels(unit).find(predicate) ?? null;
}

export function getBestAvailablePsychicFocus(
  state: GameState,
  unitId: string,
  predicate: (model: ModelState) => boolean,
): ModelState | null {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return null;
  }

  const matchingModels = getAliveModels(unit).filter(predicate);
  if (matchingModels.length === 0) {
    return null;
  }

  return [...matchingModels].sort((left, right) =>
    getCurrentModelWillpower(state, unit, right) - getCurrentModelWillpower(state, unit, left),
  )[0] ?? null;
}

export function unitHasEligiblePsychicReaction(
  state: GameState,
  unitId: string,
  reactionId: string,
): boolean {
  const unit = findUnit(state, unitId);
  if (!unit || !unitCanUsePsychicAbilities(state, unit) || unitHasUsedPsychicReaction(state, unitId)) {
    return false;
  }

  return getAliveModels(unit).some((model) => getModelPsychicReaction(model, reactionId) !== undefined);
}

export function getPsychicPowerPlayerIndex(state: GameState, focusModelId: string): number | null {
  const found = findModel(state, focusModelId);
  if (!found) {
    return null;
  }

  return findUnitPlayerIndex(state, found.unit.id) ?? null;
}
