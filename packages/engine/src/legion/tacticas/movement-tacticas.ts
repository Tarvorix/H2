/**
 * Movement-Related Legion Tactica Handlers
 *
 * Registered at PipelineHook.Movement and PipelineHook.OnCharge as appropriate.
 *
 * Reference: HH_Legiones_Astartes.md — each legion's tactica description
 */

import { LegionFaction, PipelineHook, LegionTacticaEffectType } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';
import {
  registerLegionTactica,
} from '../legion-tactica-registry';
import type {
  MovementTacticaContext,
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
// WHITE SCARS (V) — Born in the Saddle
// Movement: Optional +2 Movement when activated at turn start
// ═══════════════════════════════════════════════════════════════════════════════

function whiteScarsMovement(context: MovementTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.OptionalMovementBonus);
  if (!effect) return {};

  // Check if the bonus was activated this turn via legionTacticaState
  const playerIndex = context.state.armies.findIndex(a =>
    a.units.some(u => u.id === context.unit.id),
  );
  if (playerIndex === -1) return {};

  const tacticaState = context.state.legionTacticaState[playerIndex];
  if (!tacticaState || !tacticaState.movementBonusActiveThisTurn) return {};

  return { movementBonus: effect.value ?? 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPACE WOLVES (VI) — Howl of the Death Wolf
// OnCharge: +2" to set-up move distance (max 6")
// ═══════════════════════════════════════════════════════════════════════════════

function spaceWolvesOnCharge(context: AssaultTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.SetupMoveBonus);
  if (!effect) return {};

  return {
    setupMoveBonus: effect.value ?? 0,
    setupMoveMax: effect.maxValue,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEATH GUARD (XIV) — Remorseless Advance (Movement part)
// Movement: Ignore difficult terrain movement penalty
// ═══════════════════════════════════════════════════════════════════════════════

function deathGuardMovement(context: MovementTacticaContext): LegionTacticaResult {
  const effect = findEffect(context.effects, LegionTacticaEffectType.IgnoreDifficultTerrainPenalty);
  if (!effect) return {};

  return { ignoresDifficultTerrain: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all movement-related legion tacticas.
 */
export function registerMovementTacticas(): void {
  // White Scars — +2 Movement when activated
  registerLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, whiteScarsMovement as any);

  // Space Wolves — +2" setup move (max 6")
  registerLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, spaceWolvesOnCharge as any);

  // Death Guard — Ignore difficult terrain penalty
  registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, deathGuardMovement as any);
}
