/**
 * Shooting-Related Legion Tactica Handlers
 *
 * Registered at PipelineHook.PreHit, PreWound, OnWound, OnCasualty as appropriate.
 *
 * Reference: HH_Legiones_Astartes.md — each legion's tactica description
 */

import { LegionFaction, PipelineHook, LegionTacticaEffectType } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';
import {
  registerLegionTactica,
} from '../legion-tactica-registry';
import type {
  ShootingTacticaContext,
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
// IMPERIAL FISTS (VII) — Disciplined Fire
// PreHit: +1 to hit for fire groups with Bolt/Auto trait and 5+ dice
// ═══════════════════════════════════════════════════════════════════════════════

function imperialFistsPreHit(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.TraitFireGroupHitBonus);
  if (!effect || !effect.conditions) return {};

  // Only applies when this unit is the attacker
  if (!context.isAttacker) return {};

  // Check required weapon traits (Bolt OR Auto)
  const requiredTraits = effect.conditions.requiresWeaponTrait;
  if (!requiredTraits) return {};
  const hasRequiredTrait = context.weaponTraits.some(t =>
    requiredTraits.some(req => t.toLowerCase() === req.toLowerCase()),
  );
  if (!hasRequiredTrait) return {};

  // Check minimum fire group dice count
  const minDice = effect.conditions.requiresFireGroupMinDice;
  if (minDice !== undefined && context.fireGroupDiceCount < minDice) return {};

  return { hitModifier: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SONS OF HORUS (XVI) — Merciless Fighters
// PreHit: Volley attacks fire at full BS (not snap shots)
// ═══════════════════════════════════════════════════════════════════════════════

function sonsOfHorusPreHit(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.VolleyFullBS);
  if (!effect) return {};

  // Only applies when this unit is the attacker
  if (!context.isAttacker) return {};

  return { volleyFullBS: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAVEN GUARD (XIX) — By Wing and Talon
// PreHit: Force snap shots at 18"+ range (defensive — applies to incoming attacks)
// ═══════════════════════════════════════════════════════════════════════════════

function ravenGuardPreHit(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.ForceSnapShotsAtRange);
  if (!effect) return {};

  // This is a defensive tactica — applies when this unit is the DEFENDER
  if (context.isAttacker) return {};

  // Requires entire unit to have this tactica
  if (effect.conditions?.requiresEntireUnit && !context.entireUnitHasTactica) return {};

  // Check if the attack is from at least the required range
  const minRange = effect.value ?? 18;
  if (context.distanceToTarget < minRange) return {};

  return { forceSnapShots: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALPHA LEGION (XX) — Mutable Tactics
// PreHit: +2" virtual distance for enemy range calculations (defensive)
// ═══════════════════════════════════════════════════════════════════════════════

function alphaLegionPreHit(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.VirtualRangeIncrease);
  if (!effect) return {};

  // Defensive tactica — applies when this unit is the DEFENDER
  if (context.isAttacker) return {};

  return { virtualRangeIncrease: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IRON HANDS (X) — Inviolate Armour
// PreWound: -1 to incoming ranged Strength for wound tests (defensive)
// ═══════════════════════════════════════════════════════════════════════════════

function ironHandsPreWound(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.IncomingRangedStrengthReduction);
  if (!effect) return {};

  // Defensive tactica — applies when this unit is the DEFENDER
  if (context.isAttacker) return {};

  // Requires entire unit to have this tactica
  if (effect.conditions?.requiresEntireUnit && !context.entireUnitHasTactica) return {};

  return { incomingStrengthModifier: -(effect.value ?? 0) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALAMANDERS (XVIII) — Strength of Will
// OnWound: Wound test rolls of 1 or 2 always fail (defensive)
// ═══════════════════════════════════════════════════════════════════════════════

function salamandersOnWound(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.MinimumWoundRoll);
  if (!effect) return {};

  // Defensive tactica
  if (context.isAttacker) return {};

  // Requires entire unit to have this tactica
  if (effect.conditions?.requiresEntireUnit && !context.entireUnitHasTactica) return {};

  return { minimumWoundRoll: effect.value ?? 2 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALAMANDERS (XVIII) — Strength of Will (Part 2)
// OnCasualty: Immune to Panic from Flame weapons
// ═══════════════════════════════════════════════════════════════════════════════

function salamandersOnCasualty(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.PanicImmunityFromTrait);
  if (!effect) return {};

  // Defensive tactica
  if (context.isAttacker) return {};

  // Requires entire unit to have this tactica
  if (effect.conditions?.requiresEntireUnit && !context.entireUnitHasTactica) return {};

  const immunityTrait = effect.conditions?.immunityTriggerTrait;
  if (!immunityTrait) return {};

  // Check if the attacking weapon has the triggering trait
  const hasFlame = context.weaponTraits.some(t => t.toLowerCase() === immunityTrait.toLowerCase());
  if (!hasFlame) return {};

  return { panicImmunityFromTrait: immunityTrait };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEATH GUARD (XIV) — Remorseless Advance
// PreHit: Heavy weapons count as stationary after moving ≤4"
// ═══════════════════════════════════════════════════════════════════════════════

function deathGuardPreHit(context: ShootingTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.HeavyAfterLimitedMove);
  if (!effect) return {};

  // Only applies when this unit is the attacker
  if (!context.isAttacker) return {};

  // Only applies if the unit has moved within the threshold
  const maxMove = effect.value ?? 4;
  if (context.firerMoveDistance > maxMove) return {};

  // Only matters if the unit isn't already stationary
  if (context.firerIsStationary) return {};

  return { countsAsStationary: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all shooting-related legion tacticas.
 */
export function registerShootingTacticas(): void {
  // Imperial Fists — +1 hit for Bolt/Auto fire groups with 5+ dice
  registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, imperialFistsPreHit as any);

  // Sons of Horus — Volley at full BS
  registerLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, sonsOfHorusPreHit as any);

  // Raven Guard — Force snap shots at 18"+ (defensive)
  registerLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ravenGuardPreHit as any);

  // Alpha Legion — +2" virtual range (defensive)
  registerLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, alphaLegionPreHit as any);

  // Iron Hands — -1 incoming ranged Strength (defensive)
  registerLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ironHandsPreWound as any);

  // Salamanders — Wound rolls 1-2 always fail (defensive)
  registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, salamandersOnWound as any);

  // Salamanders — Immune to Panic from Flame (defensive)
  registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, salamandersOnCasualty as any);

  // Death Guard — Heavy weapons stationary after ≤4" move
  registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, deathGuardPreHit as any);
}
