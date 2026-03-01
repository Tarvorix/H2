/**
 * Hereticus Legion Tactica Handlers
 *
 * Emperor's Children Hereticus: Stupefied status option
 * World Eaters Hereticus: Lost to the Nails status option
 *
 * These are not part of the standard pipeline — they trigger after specific
 * game events (being shot, failing LD check). Registered at Passive hook
 * for availability checking.
 *
 * Reference: HH_Legiones_Astartes.md — EC Legiones Hereticus, WE Legiones Hereticus
 */

import { LegionFaction, PipelineHook, LegionTacticaEffectType } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';
import {
  registerLegionTactica,
} from '../legion-tactica-registry';
import type {
  LegionTacticaContext,
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
// EMPEROR'S CHILDREN HERETICUS — Stupefied
// After being shot, controlling player may choose Stupefied tactical status.
// All other statuses removed. Gains FNP (6+), +1S.
// Cannot gain other statuses. Cannot declare Reactions. Must Snap Shot.
// Removed by Cool Check in End Phase.
// ═══════════════════════════════════════════════════════════════════════════════

function emperorsChildrenHereticusPassive(context: LegionTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.StupefiedStatusOption);
  if (!effect) return {};

  return { stupefiedStatusOption: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD EATERS HERETICUS — Lost to the Nails
// After failed LD check, controlling player may choose Lost to the Nails status.
// All other statuses removed. +1" setup move, +1A.
// LD/CL/WP set to 10 (if lower).
// Must Charge closest enemy within 12" at start of Charge Sub-Phase.
// Recovers if no enemies within 12".
// ═══════════════════════════════════════════════════════════════════════════════

function worldEatersHereticusPassive(context: LegionTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.LostToTheNailsStatusOption);
  if (!effect) return {};

  return { lostToTheNailsStatusOption: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register Hereticus legion tacticas.
 */
export function registerHereticusTacticas(): void {
  // EC Hereticus — Stupefied status option (Passive for availability check)
  registerLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, emperorsChildrenHereticusPassive);

  // WE Hereticus — Lost to the Nails status option (Passive for availability check)
  registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, worldEatersHereticusPassive);
}
