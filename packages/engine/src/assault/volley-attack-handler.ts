/**
 * Volley Attack Handler
 * Implements Volley Attacks (Step 4 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 4
 */

import type { GameState } from '@hh/types';
import { PipelineHook } from '@hh/types';
import { getTacticaEffectsForLegion } from '@hh/data';
import type { DiceProvider, GameEvent } from '../types';
import {
  findUnit,
  getAliveModels,
  isUnitDestroyed,
  getUnitLegion,
} from '../game-queries';
import { applyLegionTactica } from '../legion';
import { executeOutOfPhaseShootingAttack } from '../shooting/out-of-phase-shooting';

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

function shouldVolleyAtFullBS(state: GameState, attackerUnitId: string): boolean {
  const attackingUnit = findUnit(state, attackerUnitId);
  const legion = getUnitLegion(state, attackerUnitId);
  if (!attackingUnit || !legion) {
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

  const attack = executeOutOfPhaseShootingAttack(
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
        weaponProfile.traits.some((trait) => trait.toLowerCase() === 'assault'),
    },
  );

  if (!attack.accepted) {
    return {
      state,
      events,
      casualtiesInflicted: 0,
    };
  }

  return {
    state: attack.state,
    events: [...events, ...attack.events],
    casualtiesInflicted: attack.casualtiesInflicted,
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
      shouldVolleyAtFullBS(currentState, chargingUnitId),
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
      shouldVolleyAtFullBS(currentState, targetUnitId),
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
