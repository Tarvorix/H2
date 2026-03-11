import type { GameState, ModelState, UnitState } from '@hh/types';
import type { StatModifier } from '@hh/types';
import { findLegionWeapon, findWeapon, isMeleeWeapon } from '@hh/data';
import type { GameEvent } from '../types';
import {
  findUnitPlayerIndex,
  getAliveModels,
  getDistanceBetween,
  getEngagedModels,
  getUnitMajorityToughness,
} from '../game-queries';
import {
  getModelSave,
} from '../profile-lookup';
import type { CombatState, InitiativeStep, MeleeStrikeGroup } from './assault-types';
import { determineCombats } from './fight-handler';
import {
  getCurrentModelAttacks,
  getCurrentModelInitiative,
  getCurrentModelStrength,
  getCurrentModelWS,
} from '../runtime-characteristics';
import { getModelPsychicMeleeWeapon, getPsychicWeaponStrengthModifier } from '../psychic/psychic-runtime';

interface ResolvedMeleeWeaponProfile {
  id: string;
  name: string;
  initiativeModifier: StatModifier;
  attacksModifier: StatModifier;
  strengthModifier: StatModifier;
  ap: number | null;
  damage: number;
  specialRules: { name: string; value?: string }[];
  isPsychicWeapon: boolean;
}

function createCombatKey(combat: Pick<CombatState, 'activePlayerUnitIds' | 'reactivePlayerUnitIds'>): string {
  return `${[...combat.activePlayerUnitIds].sort().join('|')}::${[...combat.reactivePlayerUnitIds].sort().join('|')}`;
}

function createFallbackWeapon(): ResolvedMeleeWeaponProfile {
  return {
    id: 'basic-close-combat-weapon',
    name: 'Close Combat Attack',
    initiativeModifier: 'I',
    attacksModifier: 'A',
    strengthModifier: { op: 'subtract', value: 1 },
    ap: null,
    damage: 1,
    specialRules: [],
    isPsychicWeapon: false,
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

function scoreWeapon(weapon: ResolvedMeleeWeaponProfile): number {
  const apScore = weapon.ap === null ? 0 : (10 - weapon.ap);
  const specialRuleScore = weapon.specialRules.length * 0.25;
  return (weapon.damage * 10) + apScore + specialRuleScore;
}

function resolveMeleeWeaponProfile(
  model: ModelState,
  declaredWeaponId: string | null,
): ResolvedMeleeWeaponProfile {
  const candidateIds = declaredWeaponId
    ? [declaredWeaponId, ...model.equippedWargear.filter((weaponId) => weaponId !== declaredWeaponId)]
    : [...model.equippedWargear];

  const meleeWeapons: ResolvedMeleeWeaponProfile[] = [];
  for (const weaponId of candidateIds) {
    const weapon = findWeapon(weaponId) ?? findLegionWeapon(weaponId);
    if (!weapon || !isMeleeWeapon(weapon)) {
      continue;
    }

    meleeWeapons.push({
      id: weapon.id,
      name: weapon.name,
      initiativeModifier: weapon.initiativeModifier,
      attacksModifier: weapon.attacksModifier,
      strengthModifier: weapon.strengthModifier,
      ap: weapon.ap,
      damage: weapon.damage,
      specialRules: [...weapon.specialRules],
      isPsychicWeapon: false,
    });
  }
  meleeWeapons.sort((left, right) => scoreWeapon(right) - scoreWeapon(left));

  if (declaredWeaponId) {
    const psychicWeapon = getModelPsychicMeleeWeapon(model, declaredWeaponId);
    if (psychicWeapon) {
      meleeWeapons.unshift({
        id: psychicWeapon.id,
        name: psychicWeapon.name,
        initiativeModifier: psychicWeapon.initiativeModifier,
        attacksModifier: psychicWeapon.attacksModifier,
        strengthModifier: psychicWeapon.strengthModifier,
        ap: psychicWeapon.ap,
        damage: psychicWeapon.damage,
        specialRules: [...psychicWeapon.specialRules],
        isPsychicWeapon: true,
      });
    }
  }

  if (declaredWeaponId) {
    const declared = meleeWeapons.find((weapon) => weapon.id === declaredWeaponId);
    if (declared) {
      return declared;
    }
  }

  return meleeWeapons[0] ?? createFallbackWeapon();
}

function chooseTargetUnitId(
  unitEnemies: UnitState[],
  attackerModel: ModelState,
): string | null {
  let bestTargetId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const enemyUnit of unitEnemies) {
    for (const enemyModel of getAliveModels(enemyUnit)) {
      const distance = getDistanceBetween(attackerModel.position, enemyModel.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTargetId = enemyUnit.id;
      }
    }
  }

  return bestTargetId;
}

function buildStrikeGroupsForCombat(
  state: GameState,
  combat: CombatState,
): InitiativeStep[] {
  const strikeGroupsByKey = new Map<string, MeleeStrikeGroup>();
  let strikeGroupIndex = 0;

  const sideDescriptors: Array<{
    attackerUnitIds: string[];
    defenderUnitIds: string[];
    attackerPlayerIndex: 0 | 1;
  }> = [
    {
      attackerUnitIds: combat.activePlayerUnitIds,
      defenderUnitIds: combat.reactivePlayerUnitIds,
      attackerPlayerIndex: state.activePlayerIndex as 0 | 1,
    },
    {
      attackerUnitIds: combat.reactivePlayerUnitIds,
      defenderUnitIds: combat.activePlayerUnitIds,
      attackerPlayerIndex: (state.activePlayerIndex === 0 ? 1 : 0) as 0 | 1,
    },
  ];

  for (const side of sideDescriptors) {
    const defenderUnits = side.defenderUnitIds
      .map((unitId) => state.armies.flatMap((army) => army.units).find((unit) => unit.id === unitId))
      .filter((unit): unit is UnitState => unit !== undefined);

    for (const attackerUnitId of side.attackerUnitIds) {
      const attackerUnit = state.armies
        .flatMap((army) => army.units)
        .find((unit) => unit.id === attackerUnitId);
      if (!attackerUnit) {
        continue;
      }

      const engagedModels = getEngagedModels(state, attackerUnitId, side.defenderUnitIds);
      const declaredSelections = combat.weaponDeclarations ?? [];

      for (const attackerModel of engagedModels) {
        const declaredWeaponId = declaredSelections.find((selection) => selection.modelId === attackerModel.id)?.weaponId ?? null;
        const weapon = resolveMeleeWeaponProfile(attackerModel, declaredWeaponId);
        const targetUnitId = chooseTargetUnitId(defenderUnits, attackerModel);
        if (!targetUnitId) {
          continue;
        }

        const initiativeValue = Math.max(
          1,
          resolveStatModifier(
            getCurrentModelInitiative(attackerUnit, attackerModel),
            weapon.initiativeModifier,
          ),
        );
        const totalAttacks = Math.max(
          1,
          resolveStatModifier(
            getCurrentModelAttacks(attackerUnit, attackerModel),
            weapon.attacksModifier,
          ),
        );
        const weaponStrength = Math.max(
          1,
          resolveStatModifier(
            getCurrentModelStrength(attackerUnit, attackerModel),
            weapon.strengthModifier,
          ),
        ) + (weapon.isPsychicWeapon ? getPsychicWeaponStrengthModifier(state, attackerUnit.id) : 0);
        const weaponSkill = getCurrentModelWS(attackerUnit, attackerModel);
        const key = [
          initiativeValue,
          targetUnitId,
          weapon.id,
          weaponSkill,
          weaponStrength,
          weapon.ap ?? 'na',
          weapon.damage,
          side.attackerPlayerIndex,
        ].join(':');

        const existing = strikeGroupsByKey.get(key);
        if (existing) {
          existing.attackerModelIds.push(attackerModel.id);
          existing.totalAttacks += totalAttacks;
          continue;
        }

        strikeGroupsByKey.set(key, {
          index: strikeGroupIndex++,
          weaponName: weapon.name,
          attackerModelIds: [attackerModel.id],
          targetUnitId,
          weaponSkill,
          combatInitiative: initiativeValue,
          totalAttacks,
          weaponStrength,
          weaponAP: weapon.ap,
          weaponDamage: weapon.damage,
          specialRules: [...weapon.specialRules],
          hits: [],
          wounds: [],
          penetratingHits: [],
          glancingHits: [],
          resolved: false,
          attackerPlayerIndex: side.attackerPlayerIndex,
        });
      }
    }
  }

  const stepsByInitiative = new Map<number, InitiativeStep>();
  for (const strikeGroup of strikeGroupsByKey.values()) {
    const existingStep = stepsByInitiative.get(strikeGroup.combatInitiative);
    if (existingStep) {
      existingStep.modelIds.push(...strikeGroup.attackerModelIds);
      existingStep.strikeGroups.push(strikeGroup);
      continue;
    }

    stepsByInitiative.set(strikeGroup.combatInitiative, {
      initiativeValue: strikeGroup.combatInitiative,
      modelIds: [...strikeGroup.attackerModelIds],
      strikeGroups: [strikeGroup],
      resolved: false,
    });
  }

  return [...stepsByInitiative.values()]
    .sort((left, right) => right.initiativeValue - left.initiativeValue)
    .map((step) => ({
      ...step,
      modelIds: [...new Set(step.modelIds)],
    }));
}

export function syncActiveCombats(state: GameState): {
  state: GameState;
  combats: CombatState[];
  events: GameEvent[];
} {
  const existingByKey = new Map(
    (state.activeCombats ?? []).map((combat) => [createCombatKey(combat as CombatState), combat as CombatState]),
  );
  const determined = determineCombats(state);

  const combats = determined.combats.map((combat) => {
    const previous = existingByKey.get(createCombatKey(combat));
    if (!previous) {
      return {
        ...combat,
        weaponDeclarations: [],
        aftermathResolvedUnitIds: [],
      };
    }

    return {
      ...combat,
      initiativeSteps: previous.initiativeSteps ?? combat.initiativeSteps,
      currentInitiativeStepIndex: previous.currentInitiativeStepIndex ?? combat.currentInitiativeStepIndex,
      activePlayerCRP: previous.activePlayerCRP,
      reactivePlayerCRP: previous.reactivePlayerCRP,
      challengeState: previous.challengeState,
      weaponDeclarations: previous.weaponDeclarations ?? [],
      activePlayerCasualties: previous.activePlayerCasualties,
      reactivePlayerCasualties: previous.reactivePlayerCasualties,
      aftermathResolvedUnitIds: previous.aftermathResolvedUnitIds ?? [],
      resolved: previous.resolved,
      isMassacre: previous.isMassacre,
      massacreWinnerPlayerIndex: previous.massacreWinnerPlayerIndex,
    };
  });

  return {
    state: {
      ...state,
      activeCombats: combats,
    },
    combats,
    events: [],
  };
}

export function findCombatIndex(
  combats: CombatState[],
  unitIds: string[],
): number {
  return combats.findIndex((combat) => unitIds.every((unitId) =>
    combat.activePlayerUnitIds.includes(unitId) || combat.reactivePlayerUnitIds.includes(unitId),
  ));
}

export function prepareCombatForFight(
  state: GameState,
  combat: CombatState,
): CombatState {
  return {
    ...combat,
    initiativeSteps: buildStrikeGroupsForCombat(state, combat),
    currentInitiativeStepIndex: 0,
  };
}

export function getCombatWinnerState(
  combat: CombatState,
  unitId: string,
): { isWinner: boolean; isLoser: boolean; isDraw: boolean } {
  const isActiveUnit = combat.activePlayerUnitIds.includes(unitId);
  const isWinner = (isActiveUnit && combat.activePlayerCRP > combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP > combat.activePlayerCRP);
  const isLoser = (isActiveUnit && combat.activePlayerCRP < combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP < combat.activePlayerCRP);
  const isDraw = combat.activePlayerCRP === combat.reactivePlayerCRP;

  return { isWinner, isLoser, isDraw };
}

export function getPendingAftermathUnitIds(
  state: GameState,
  combat: CombatState,
): string[] {
  const resolvedUnitIds = new Set(combat.aftermathResolvedUnitIds ?? []);
  const allUnits = state.armies.flatMap((army) => army.units);
  const activeAlive = combat.activePlayerUnitIds.filter((unitId) => {
    const unit = allUnits.find((candidate) => candidate.id === unitId);
    return unit ? getAliveModels(unit).length > 0 : false;
  });
  const reactiveAlive = combat.reactivePlayerUnitIds.filter((unitId) => {
    const unit = allUnits.find((candidate) => candidate.id === unitId);
    return unit ? getAliveModels(unit).length > 0 : false;
  });
  const activeWon = combat.activePlayerCRP > combat.reactivePlayerCRP;
  const reactiveWon = combat.reactivePlayerCRP > combat.activePlayerCRP;

  const orderedUnitIds = activeWon
    ? [...reactiveAlive, ...activeAlive]
    : reactiveWon
      ? [...activeAlive, ...reactiveAlive]
      : [...activeAlive, ...reactiveAlive];

  return orderedUnitIds.filter((unitId) => !resolvedUnitIds.has(unitId));
}

export function getChallengeDecisionPlayerIndex(
  state: GameState,
): 0 | 1 | null {
  const combats = state.activeCombats as CombatState[] | undefined;
  if (!combats || combats.length === 0) {
    return state.activePlayerIndex as 0 | 1;
  }

  for (const combat of combats) {
    if (!combat.challengeState) {
      continue;
    }

    const challengerPlayerIndex = findUnitPlayerIndex(state, combat.challengeState.challengerUnitId);
    const challengedPlayerIndex = findUnitPlayerIndex(state, combat.challengeState.challengedUnitId);
    if (challengerPlayerIndex === undefined || challengedPlayerIndex === undefined) {
      continue;
    }

    if (combat.challengeState.currentStep === 'DECLARE') {
      return challengedPlayerIndex as 0 | 1;
    }

    if (combat.challengeState.currentStep === 'FACE_OFF') {
      if (combat.challengeState.challengerGambit === null) {
        return challengerPlayerIndex as 0 | 1;
      }
      if (combat.challengeState.challengedGambit === null) {
        return challengedPlayerIndex as 0 | 1;
      }
    }
  }

  return state.activePlayerIndex as 0 | 1;
}

export function getResolutionDecisionPlayerIndex(
  state: GameState,
): 0 | 1 | null {
  const combats = state.activeCombats as CombatState[] | undefined;
  if (!combats || combats.length === 0) {
    return state.activePlayerIndex as 0 | 1;
  }

  for (const combat of combats) {
    const pendingUnitIds = getPendingAftermathUnitIds(state, combat);
    if (pendingUnitIds.length === 0) {
      continue;
    }

    const playerIndex = findUnitPlayerIndex(state, pendingUnitIds[0]);
    if (playerIndex !== undefined) {
      return playerIndex as 0 | 1;
    }
  }

  return state.activePlayerIndex as 0 | 1;
}

export function getMajorityArmourSave(state: GameState, unitId: string): number | null {
  const unit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === unitId);
  if (!unit) {
    return null;
  }

  const saveCounts = new Map<number, number>();
  for (const model of getAliveModels(unit)) {
    const save = getModelSave(model.unitProfileId, model.profileModelName);
    if (save === null) {
      continue;
    }
    saveCounts.set(save, (saveCounts.get(save) ?? 0) + 1);
  }

  let bestSave: number | null = null;
  let bestCount = -1;
  for (const [save, count] of saveCounts) {
    if (count > bestCount || (count === bestCount && (bestSave === null || save < bestSave))) {
      bestCount = count;
      bestSave = save;
    }
  }

  return bestSave;
}

export function getTargetDurability(
  state: GameState,
  unitId: string,
): { toughness: number; armourSave: number | null } {
  const unit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === unitId);
  return {
    toughness: unit ? getUnitMajorityToughness(unit) : 0,
    armourSave: getMajorityArmourSave(state, unitId),
  };
}
