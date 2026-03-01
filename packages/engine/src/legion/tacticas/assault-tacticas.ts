/**
 * Assault-Related Legion Tactica Handlers
 *
 * Registered at PipelineHook.OnCharge, PreHit, OnDamage as appropriate.
 *
 * Reference: HH_Legiones_Astartes.md — each legion's tactica description
 */

import { LegionFaction, PipelineHook, LegionTacticaEffectType } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';
import {
  registerLegionTactica,
} from '../legion-tactica-registry';
import type {
  AssaultTacticaContext,
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
// EMPEROR'S CHILDREN (III) — Martial Pride
// OnCharge: +1 Combat Initiative on charge turn
// ═══════════════════════════════════════════════════════════════════════════════

function emperorsChildrenOnCharge(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.ChargeInitiativeBonus);
  if (!effect) return {};

  // Only applies on charge turn
  if (effect.conditions?.onChargeTurn && !context.isChargeTurn) return {};

  return { combatInitiativeModifier: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOOD ANGELS (IX) — Encarmine Fury
// OnCharge: +1 Strength on charge turn
// ═══════════════════════════════════════════════════════════════════════════════

function bloodAngelsOnCharge(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.ChargeStrengthBonus);
  if (!effect) return {};

  if (effect.conditions?.onChargeTurn && !context.isChargeTurn) return {};

  return { meleeStrengthModifier: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD EATERS (XII) — Berserker Assault
// OnCharge: +1 Attacks on charge turn
// ═══════════════════════════════════════════════════════════════════════════════

function worldEatersOnCharge(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.ChargeAttacksBonus);
  if (!effect) return {};

  if (effect.conditions?.onChargeTurn && !context.isChargeTurn) return {};

  return { meleeAttacksModifier: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NIGHT LORDS (VIII) — A Talent for Murder
// PreHit: +1 WS in melee when any enemy in combat has a tactical status
// ═══════════════════════════════════════════════════════════════════════════════

function nightLordsPreHit(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.MeleeWSBonusVsStatus);
  if (!effect) return {};

  // Check if any enemy unit in this combat has one of the required statuses
  const requiredStatuses = effect.conditions?.targetHasStatus;
  if (!requiredStatuses || requiredStatuses.length === 0) return {};

  let enemyHasStatus = false;
  for (const enemyUnit of context.enemyUnits) {
    for (const status of requiredStatuses) {
      if (enemyUnit.statuses.includes(status)) {
        enemyHasStatus = true;
        break;
      }
    }
    if (enemyHasStatus) break;
  }

  if (!enemyHasStatus) return {};

  return { meleeWSModifier: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORD BEARERS (XVII) — True Believers
// OnDamage: +1 CRP in combat resolution
// ═══════════════════════════════════════════════════════════════════════════════

function wordBearersOnDamage(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.CombatResolutionBonus);
  if (!effect) return {};

  return { crpBonus: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all assault-related legion tacticas.
 */
export function registerAssaultTacticas(): void {
  // Emperor's Children — +1 Combat Initiative on charge
  registerLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, emperorsChildrenOnCharge as any);

  // Blood Angels — +1 Strength on charge
  registerLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, bloodAngelsOnCharge as any);

  // World Eaters — +1 Attacks on charge
  registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, worldEatersOnCharge as any);

  // Night Lords — +1 WS vs models with tactical status
  registerLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, nightLordsPreHit as any);

  // Word Bearers — +1 CRP in combat resolution
  registerLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, wordBearersOnDamage as any);
}
