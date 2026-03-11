/**
 * Passive/Morale-Related Legion Tactica Handlers
 *
 * Registered at PipelineHook.Passive and PipelineHook.OnMorale as appropriate.
 *
 * Reference: HH_Legiones_Astartes.md — each legion's tactica description
 */

import { LegionFaction, PipelineHook, LegionTacticaEffectType } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';
import {
  registerLegionTactica,
} from '../legion-tactica-registry';
import type {
  MoraleTacticaContext,
  LegionTacticaResult,
} from '../legion-tactica-registry';

// ─── Helper: Find effect of a given type ────────────────────────────────────

function findEffect(
  effects: LegionTacticaEffect[],
  type: LegionTacticaEffectType,
): LegionTacticaEffect | undefined {
  return effects.find(e => e.type === type);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DARK ANGELS (I) — Resolve of the First (Passive part)
// Passive: Leadership never modified below 6
// ═══════════════════════════════════════════════════════════════════════════════

function darkAngelsPassiveLeadership(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.MinimumLeadership);
  if (!effect) return {};

  return { minimumLeadership: effect.value ?? 6 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DARK ANGELS (I) — Resolve of the First (Fear part)
// Passive: Fear (X) can only reduce LD/WP/CL/IN by maximum of 1
// ═══════════════════════════════════════════════════════════════════════════════

function darkAngelsPassiveFear(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.MaxFearReduction);
  if (!effect) return {};

  return { maxFearReduction: effect.value ?? 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IRON WARRIORS (IV) — Iron Within
// OnMorale: Ignore negative LD/Cool modifiers from Panic/Pinning/Stun/Suppressive
// ═══════════════════════════════════════════════════════════════════════════════

function ironWarriorsOnMorale(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.IgnoreStatusMoraleMods);
  if (!effect) return {};

  return { ignoreStatusMoraleMods: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THOUSAND SONS (XV) — Arcane Mastery (Willpower part)
// Passive: +1 to Willpower characteristic
// ═══════════════════════════════════════════════════════════════════════════════

function thousandSonsPassiveWillpower(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.WillpowerBonus);
  if (!effect) return {};

  return { willpowerBonus: effect.value ?? 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THOUSAND SONS (XV) — Arcane Mastery (Psyker part)
// Passive: All models gain Psyker trait
// ═══════════════════════════════════════════════════════════════════════════════

function thousandSonsPassivePsyker(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.GrantPsykerTrait);
  if (!effect) return {};

  return { grantPsykerTrait: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ULTRAMARINES (XIII) — Tactical Flexibility
// Passive: First reaction each turn costs -1 (minimum 0)
// ═══════════════════════════════════════════════════════════════════════════════

function ultramarinesPassive(context: MoraleTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.ReactionCostReduction);
  if (!effect) return {};

  // Requires entire unit to have this tactica
  if (effect.conditions?.requiresEntireUnit && !context.entireUnitHasTactica) return {};

  // Check if the discount has already been used this turn
  const playerIndex = context.state.armies.findIndex(a =>
    a.units.some(u => u.id === context.unit.id),
  );
  if (playerIndex === -1) return {};

  const tacticaState = context.state.legionTacticaState?.[playerIndex];
  if (tacticaState && tacticaState.reactionDiscountUsedThisTurn) return {};

  return { reactionCostReduction: effect.value ?? 1 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all passive/morale-related legion tacticas.
 */
export function registerPassiveTacticas(): void {
  // Dark Angels — LD never below 6
  registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, darkAngelsPassiveLeadership as any);

  // Dark Angels — Fear max reduction 1
  registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, darkAngelsPassiveFear as any);

  // Iron Warriors — Ignore morale mods from status rules
  registerLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, ironWarriorsOnMorale as any);

  // Thousand Sons — +1 Willpower
  registerLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, thousandSonsPassiveWillpower as any);

  // Thousand Sons — Grant Psyker trait
  registerLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, thousandSonsPassivePsyker as any);

  // Ultramarines — -1 reaction cost once per turn
  registerLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ultramarinesPassive as any);
}
