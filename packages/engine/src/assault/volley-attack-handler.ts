/**
 * Volley Attack Handler
 * Implements Volley Attacks (Step 4 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 4
 */

import type { GameState } from '@hh/types';
import { PipelineHook } from '@hh/types';
import { findWeapon, getTacticaEffectsForLegion } from '@hh/data';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import {
  findUnit,
  getDistanceBetween,
  getAliveModels,
  isUnitDestroyed,
  getUnitLegion,
} from '../game-queries';
import { applyLegionTactica } from '../legion';
import { executeOutOfPhaseShootingAttack } from '../shooting/out-of-phase-shooting';
import { handleShootingAttack } from '../phases/shooting-phase';

export interface VolleyAttackResult {
  state: GameState;
  events: GameEvent[];
  chargerWipedOut: boolean;
  targetWipedOut: boolean;
  chargerCasualtiesInflicted: number;
  targetCasualtiesInflicted: number;
  skipped: boolean;
}

interface SingleVolleyResult {
  state: GameState;
  events: GameEvent[];
  casualtiesInflicted: number;
}

const FRAG_GRENADE_RANGE = findWeapon('frag-grenades') && 'range' in findWeapon('frag-grenades')!
  ? (findWeapon('frag-grenades') as { range: number }).range
  : 6;

function unitHasFragGrenades(state: GameState, unitId: string): boolean {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return false;
  }

  return getAliveModels(unit).some((model) => model.equippedWargear.includes('frag-grenades'));
}

function executeNormalVolleyAttack(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  fullBS: boolean,
) {
  return executeOutOfPhaseShootingAttack(
    state,
    attackerUnitId,
    targetUnitId,
    dice,
    {
      forceSnapShots: !fullBS,
      forceNoSnapShots: fullBS,
      allowReturnFireTrigger: false,
      suppressMoraleAndStatusChecks: true,
      weaponFilter: ({ weaponProfile }) =>
        weaponProfile.traits.some((trait) => trait.toLowerCase() === 'assault') &&
        !weaponProfile.traits.some((trait) => trait.toLowerCase() === 'grenade'),
    },
  );
}

function executeFragGrenadeVolleyAttack(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  fullBS: boolean,
) {
  const attackerUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!attackerUnit || !targetUnit) {
    return {
      state,
      events: [],
      accepted: true,
      fired: false,
      casualtiesInflicted: 0,
    };
  }
  const targetModels = getAliveModels(targetUnit);
  let selectedModelId: string | null = null;
  let selectedTargetPosition: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const model of getAliveModels(attackerUnit)) {
    if (!model.equippedWargear.includes('frag-grenades')) {
      continue;
    }

    for (const targetModel of targetModels) {
      const distance = getDistanceBetween(model.position, targetModel.position);
      if (distance <= FRAG_GRENADE_RANGE && distance < bestDistance) {
        bestDistance = distance;
        selectedModelId = model.id;
        selectedTargetPosition = targetModel.position;
      }
    }
  }

  if (!selectedModelId || !selectedTargetPosition) {
    return {
      state,
      events: [],
      accepted: true,
      fired: false,
      casualtiesInflicted: 0,
    };
  }

  return executeVolleyShootingCommand(
    state,
    targetUnitId,
    {
      type: 'declareShooting',
      attackingUnitId: attackerUnitId,
      targetUnitId,
      weaponSelections: [{ modelId: selectedModelId, weaponId: 'frag-grenades' }],
      blastPlacements: [{
        sourceModelIds: [selectedModelId],
        position: selectedTargetPosition,
      }],
      templatePlacements: [],
    },
    dice,
    {
      // Frag grenades are a distinct single-shot substitute attack, not a snap-shot volley.
      forceSnapShots: false,
      forceNoSnapShots: true,
      allowReturnFireTrigger: false,
      suppressMoraleAndStatusChecks: true,
    },
  );
}

function executeVolleyShootingCommand(
  state: GameState,
  targetUnitId: string,
  command: import('@hh/types').DeclareShootingCommand,
  dice: DiceProvider,
  options: {
    forceSnapShots: boolean;
    forceNoSnapShots: boolean;
    allowReturnFireTrigger: boolean;
    suppressMoraleAndStatusChecks: boolean;
  },
) {
  const priorShootingAttackState = state.shootingAttackState;
  const targetBefore = findUnit(state, targetUnitId);
  const aliveBefore = targetBefore ? getAliveModels(targetBefore).length : 0;
  const result: CommandResult = handleShootingAttack(state, command, dice, {
    allowOutOfPhaseAttack: true,
    allowNonActiveAttacker: true,
    ignoreRushedRestriction: true,
    ignoreHasShotRestriction: true,
    persistShootingAttackState: false,
    consumeShootingAction: false,
    ...options,
  });

  if (!result.accepted) {
    return {
      state: {
        ...result.state,
        shootingAttackState: priorShootingAttackState,
      },
      events: result.events,
      accepted: false,
      fired: true,
      casualtiesInflicted: 0,
    };
  }

  const restoredState = {
    ...result.state,
    shootingAttackState: priorShootingAttackState,
  };
  const targetAfter = findUnit(restoredState, targetUnitId);
  const aliveAfter = targetAfter ? getAliveModels(targetAfter).length : 0;

  return {
    state: restoredState,
    events: result.events,
    accepted: true,
    fired: true,
    casualtiesInflicted: Math.max(0, aliveBefore - aliveAfter),
  };
}

function unitHasNoVolleyAttacksModifier(state: GameState, unitId: string): boolean {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return false;
  }

  if (unit.modifiers.some((modifier) => modifier.characteristic === 'NoVolleyAttacks' && modifier.value > 0)) {
    return true;
  }

  return getAliveModels(unit).some((model) =>
    model.modifiers.some((modifier) => modifier.characteristic === 'NoVolleyAttacks' && modifier.value > 0),
  );
}

function shouldVolleyAtFullBS(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
): boolean {
  const attackingUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  const legion = getUnitLegion(state, attackerUnitId);
  if (!attackingUnit || !targetUnit || !legion) {
    return false;
  }

  const effects = getTacticaEffectsForLegion(legion);
  const tacticaResult = applyLegionTactica(legion, PipelineHook.PreHit, {
    state,
    unit: attackingUnit,
    effects,
    hook: PipelineHook.PreHit,
    isAttacker: true,
    isSnapShot: true,
    firerIsStationary: false,
    firerMoveDistance: 0,
    distanceToTarget: 0,
    weaponTraits: [],
    fireGroupDiceCount: 0,
    weaponSpecialRules: [],
    isChargeTurn: true,
    isChallenge: false,
    enemyUnits: [targetUnit],
    entireUnitHasTactica: true,
  } as any);

  return tacticaResult.volleyFullBS === true;
}

function resolveSingleVolley(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  fullBS: boolean,
): SingleVolleyResult {
  const attackerUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  const attackerModels = attackerUnit ? getAliveModels(attackerUnit) : [];
  const targetModels = targetUnit ? getAliveModels(targetUnit) : [];

  const events: GameEvent[] = [];
  if (attackerModels.length === 0 || targetModels.length === 0) {
    return {
      state,
      events,
      casualtiesInflicted: 0,
    };
  }

  events.push({
    type: 'volleyAttack',
    attackerUnitId,
    targetUnitId,
    isSnapShot: !fullBS,
    attackerModelCount: attackerModels.length,
    targetModelCount: targetModels.length,
  });

  const attack = executeNormalVolleyAttack(state, attackerUnitId, targetUnitId, dice, fullBS);
  if (!attack.accepted) {
    return {
      state,
      events,
      casualtiesInflicted: 0,
    };
  }

  if (attack.fired) {
    return {
      state: attack.state,
      events: [...events, ...attack.events],
      casualtiesInflicted: attack.casualtiesInflicted,
    };
  }

  if (!unitHasFragGrenades(state, attackerUnitId)) {
    return {
      state,
      events,
      casualtiesInflicted: 0,
    };
  }

  const fragAttack = executeFragGrenadeVolleyAttack(
    state,
    attackerUnitId,
    targetUnitId,
    dice,
    fullBS,
  );
  if (!fragAttack.accepted || !fragAttack.fired) {
    return {
      state,
      events,
      casualtiesInflicted: 0,
    };
  }

  return {
    state: fragAttack.state,
    events: [...events, ...fragAttack.events],
    casualtiesInflicted: fragAttack.casualtiesInflicted,
  };
}

export function resolveVolleyAttacks(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
  isDisordered: boolean,
  dice: DiceProvider,
  chargerVolley: boolean = true,
  targetVolley: boolean = true,
): VolleyAttackResult {
  const chargingUnit = findUnit(state, chargingUnitId);
  const targetUnit = findUnit(state, targetUnitId);

  if (!chargingUnit || !targetUnit || targetUnit.isLockedInCombat) {
    return {
      state,
      events: [],
      chargerWipedOut: false,
      targetWipedOut: false,
      chargerCasualtiesInflicted: 0,
      targetCasualtiesInflicted: 0,
      skipped: true,
    };
  }

  let currentState = state;
  const events: GameEvent[] = [];
  let chargerCasualtiesInflicted = 0;
  let targetCasualtiesInflicted = 0;

  if (!isDisordered && chargerVolley && !unitHasNoVolleyAttacksModifier(currentState, chargingUnitId)) {
    const chargerVolleyResult = resolveSingleVolley(
      currentState,
      chargingUnitId,
      targetUnitId,
      dice,
      shouldVolleyAtFullBS(currentState, chargingUnitId, targetUnitId),
    );
    currentState = chargerVolleyResult.state;
    chargerCasualtiesInflicted += chargerVolleyResult.casualtiesInflicted;
    events.push(...chargerVolleyResult.events);
  }

  const targetAfterChargerVolley = findUnit(currentState, targetUnitId);
  if (targetAfterChargerVolley && isUnitDestroyed(targetAfterChargerVolley)) {
    return {
      state: currentState,
      events,
      chargerWipedOut: false,
      targetWipedOut: true,
      chargerCasualtiesInflicted,
      targetCasualtiesInflicted,
      skipped: false,
    };
  }

  if (targetVolley && !unitHasNoVolleyAttacksModifier(currentState, targetUnitId)) {
    const targetVolleyResult = resolveSingleVolley(
      currentState,
      targetUnitId,
      chargingUnitId,
      dice,
      shouldVolleyAtFullBS(currentState, targetUnitId, chargingUnitId),
    );
    currentState = targetVolleyResult.state;
    targetCasualtiesInflicted += targetVolleyResult.casualtiesInflicted;
    events.push(...targetVolleyResult.events);
  }

  const chargerAfterTargetVolley = findUnit(currentState, chargingUnitId);

  return {
    state: currentState,
    events,
    chargerWipedOut: chargerAfterTargetVolley ? isUnitDestroyed(chargerAfterTargetVolley) : false,
    targetWipedOut: false,
    chargerCasualtiesInflicted,
    targetCasualtiesInflicted,
    skipped: false,
  };
}

export function shouldUseOverwatch(state: GameState, targetUnitId: string): boolean {
  return (
    state.awaitingReaction === true &&
    state.pendingReaction?.reactionType === 'Overwatch' &&
    state.pendingReaction.eligibleUnitIds.includes(targetUnitId)
  );
}
