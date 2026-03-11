/**
 * Morale Handler — Shooting Pipeline Step 12
 * Reference: HH_Rules_Battle.md — Morale Sub-Phase
 *
 * Implements the Shooting Morale Sub-Phase — resolving all pending morale/status
 * checks that were accumulated during the shooting attack.
 *
 * Resolution Order:
 * 1. Resolve Routed checks first (panic, panicRule)
 * 2. If a unit fails and becomes Routed, skip all other checks for that unit
 * 3. Then resolve status checks (pinning, suppressive, stun, coherency)
 * 4. Apply all statuses to the game state at end of sub-phase
 *
 * Check Mechanics:
 * - Panic (25% casualties): Roll 2d6 vs Leadership (default 7). Fail = Routed
 * - PanicRule(X): Roll 2d6 vs Leadership - X. Fail = Routed
 * - Pinning(X): Roll 2d6 vs Cool (default 7) - X. Fail = Pinned
 * - Suppressive(X): Roll 2d6 vs Cool (default 7) - X. Fail = Suppressed
 * - Stun(X): Roll 2d6 vs Cool (default 7) - X. Fail = Stunned
 * - Coherency: Roll 2d6 vs Cool (default 7). Fail = Suppressed
 */

import type { GameState } from '@hh/types';
import { TacticalStatus, PipelineHook } from '@hh/types';
import type {
  DiceProvider,
  GameEvent,
  PanicCheckEvent,
  StatusCheckEvent,
} from '../types';
import type { PendingMoraleCheck, MoraleCheckType } from './shooting-types';
import { updateUnitInGameState, addStatus } from '../state-helpers';
import { findUnit, getAliveModels, getUnitLegion } from '../game-queries';
import { getTacticaEffectsForLegion } from '@hh/data';
import { applyLegionTactica } from '../legion';
import { getModelLeadership, getModelCool } from '../profile-lookup';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default Leadership value when not specified on the unit profile */
const DEFAULT_LEADERSHIP = 7;

/** Default Cool value when not specified on the unit profile */
const DEFAULT_COOL = 7;

function isIgnoredByFlameStatusImmunity(
  state: GameState,
  unit: ReturnType<typeof findUnit>,
  check: PendingMoraleCheck,
): boolean {
  if (!unit || !check.weaponTraits || check.weaponTraits.length === 0) {
    return false;
  }

  const unitLegion = getUnitLegion(state, check.unitId);
  if (!unitLegion) {
    return false;
  }

  const effects = getTacticaEffectsForLegion(unitLegion);
  const tacticaResult = applyLegionTactica(unitLegion, PipelineHook.OnCasualty, {
    state,
    unit,
    effects,
    hook: PipelineHook.OnCasualty,
    isAttacker: false,
    weaponTraits: check.weaponTraits,
    entireUnitHasTactica: true,
  } as any);

  const immunityTrait = tacticaResult.panicImmunityFromTrait;
  if (!immunityTrait) {
    return false;
  }

  return check.weaponTraits.some(
    (trait) => trait.toLowerCase() === immunityTrait.toLowerCase(),
  );
}

// ─── Result Type ────────────────────────────────────────────────────────────

/**
 * Result of resolving the Morale Sub-Phase.
 */
export interface MoraleResolutionResult {
  /** Updated game state with statuses applied */
  state: GameState;
  /** Events emitted during resolution */
  events: GameEvent[];
  /** Unit IDs that became Routed */
  routedUnitIds: string[];
  /** Unit IDs that became Pinned */
  pinnedUnitIds: string[];
  /** Unit IDs that became Suppressed */
  suppressedUnitIds: string[];
  /** Unit IDs that became Stunned */
  stunnedUnitIds: string[];
}

// ─── Main Morale Resolution ─────────────────────────────────────────────────

/**
 * Resolve all pending morale checks for the Morale Sub-Phase.
 *
 * Resolution order:
 * 1. First, resolve all Routed checks (panic, panicRule)
 * 2. For units that fail and become Routed, skip any remaining checks
 * 3. Then resolve status checks (pinning, suppressive, stun, coherency)
 * 4. Apply all statuses to the game state
 *
 * @param state - Current game state
 * @param pendingChecks - All pending morale checks from the shooting attack
 * @param unitSizesAtStart - Unit sizes at attack start (for panic event)
 * @param casualtiesPerUnit - Map of unitId -> casualties suffered (for panic event)
 * @param dice - Dice provider for rolling
 * @returns Updated state with statuses applied
 */
export function resolveShootingMorale(
  state: GameState,
  pendingChecks: PendingMoraleCheck[],
  unitSizesAtStart: Record<string, number>,
  casualtiesPerUnit: Map<string, number>,
  dice: DiceProvider,
): MoraleResolutionResult {
  const events: GameEvent[] = [];
  const routedUnitIds: string[] = [];
  const pinnedUnitIds: string[] = [];
  const suppressedUnitIds: string[] = [];
  const stunnedUnitIds: string[] = [];
  let currentState = state;

  // If no pending checks, return immediately with no changes
  if (pendingChecks.length === 0) {
    return {
      state: currentState,
      events,
      routedUnitIds,
      pinnedUnitIds,
      suppressedUnitIds,
      stunnedUnitIds,
    };
  }

  // Separate checks into rout checks and status checks
  const routChecks = pendingChecks.filter(
    (c) => c.checkType === 'panic' || c.checkType === 'panicRule',
  );
  const statusChecks = pendingChecks.filter(
    (c) =>
      c.checkType !== 'panic' && c.checkType !== 'panicRule',
  );

  // ─── Phase 1: Resolve Rout Checks ──────────────────────────────────────

  for (const check of routChecks) {
    // Verify the unit still exists
    const unit = findUnit(currentState, check.unitId);
    if (!unit) {
      continue;
    }

    if (isIgnoredByFlameStatusImmunity(currentState, unit, check)) {
      continue;
    }

    // Use real Leadership from the first alive model's profile
    const aliveModels = getAliveModels(unit);
    const refModel = aliveModels[0];
    let effectiveLeadership = refModel ? getModelLeadership(refModel.unitProfileId, refModel.profileModelName) : DEFAULT_LEADERSHIP;
    const unitLegion = getUnitLegion(currentState, check.unitId);
    if (unitLegion) {
      const effects = getTacticaEffectsForLegion(unitLegion);
      const tacticaResult = applyLegionTactica(unitLegion, PipelineHook.Passive, {
        state: currentState,
        unit,
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
      } as any);
      if (tacticaResult.minimumLeadership !== undefined) {
        effectiveLeadership = Math.max(effectiveLeadership, tacticaResult.minimumLeadership);
      }
    }

    if (check.checkType === 'panic') {
      // Panic check: Roll 2d6 vs Leadership
      const result = makePanicCheck(dice, check.modifier, effectiveLeadership);

      // Emit PanicCheckEvent
      const panicEvent: PanicCheckEvent = {
        type: 'panicCheck',
        unitId: check.unitId,
        roll: result.roll,
        target: result.target,
        modifier: check.modifier,
        passed: result.passed,
        casualtiesCount: casualtiesPerUnit.get(check.unitId) ?? 0,
        unitSizeAtStart: unitSizesAtStart[check.unitId] ?? 0,
      };
      events.push(panicEvent);

      // If failed, unit becomes Routed
      if (!result.passed) {
        routedUnitIds.push(check.unitId);
        currentState = updateUnitInGameState(
          currentState,
          check.unitId,
          (u) => addStatus(u, TacticalStatus.Routed),
        );
      }
    } else if (check.checkType === 'panicRule') {
      // PanicRule(X): Roll 2d6 vs Leadership - X
      const result = makePanicCheck(dice, check.modifier, effectiveLeadership);

      // Emit StatusCheckEvent with checkType 'panicRule'
      const statusEvent: StatusCheckEvent = {
        type: 'statusCheck',
        unitId: check.unitId,
        checkType: 'panicRule',
        roll: result.roll,
        target: result.target,
        modifier: check.modifier,
        passed: result.passed,
        statusApplied: result.passed ? undefined : TacticalStatus.Routed,
      };
      events.push(statusEvent);

      // If failed, unit becomes Routed
      if (!result.passed) {
        routedUnitIds.push(check.unitId);
        currentState = updateUnitInGameState(
          currentState,
          check.unitId,
          (u) => addStatus(u, TacticalStatus.Routed),
        );
      }
    }
  }

  // ─── Phase 2: Resolve Status Checks ────────────────────────────────────
  // Skip status checks for units that are already Routed

  for (const check of statusChecks) {
    // If the unit was routed in Phase 1, skip all remaining checks for it
    if (routedUnitIds.includes(check.unitId)) {
      continue;
    }

    // Verify the unit still exists
    const unit = findUnit(currentState, check.unitId);
    if (!unit) {
      continue;
    }

    if (isIgnoredByFlameStatusImmunity(currentState, unit, check)) {
      continue;
    }

    // Use real Cool from the first alive model's profile
    const coolAliveModels = getAliveModels(unit);
    const coolRefModel = coolAliveModels[0];
    let effectiveCool = coolRefModel ? getModelCool(coolRefModel.unitProfileId, coolRefModel.profileModelName) : DEFAULT_COOL;
    let ignoreModifiers = false;
    const unitLegion = getUnitLegion(currentState, check.unitId);
    if (unitLegion) {
      const effects = getTacticaEffectsForLegion(unitLegion);
      const tacticaResult = applyLegionTactica(unitLegion, PipelineHook.OnMorale, {
        state: currentState,
        unit,
        effects,
        hook: PipelineHook.OnMorale,
        entireUnitHasTactica: true,
      } as any);
      if (tacticaResult.ignoreStatusMoraleMods) {
        ignoreModifiers = true;
      }
    }

    // Resolve the status check
    const effectiveModifier = ignoreModifiers ? 0 : check.modifier;
    const result = makeStatusCheck(dice, effectiveModifier, effectiveCool);

    // Determine what status to apply on failure
    const failureStatus = getFailureStatus(check.checkType);

    if (check.checkType === 'coherency') {
      // Coherency checks emit a StatusCheckEvent with checkType 'suppressive'
      // since coherency failure results in Suppressed status and there is no
      // 'coherency' value in the StatusCheckEvent.checkType union
      const statusEvent: StatusCheckEvent = {
        type: 'statusCheck',
        unitId: check.unitId,
        checkType: 'suppressive',
        roll: result.roll,
        target: result.target,
        modifier: check.modifier,
        passed: result.passed,
        statusApplied: result.passed ? undefined : failureStatus,
      };
      events.push(statusEvent);
    } else {
      // Standard status checks: pinning, suppressive, stun
      const statusEvent: StatusCheckEvent = {
        type: 'statusCheck',
        unitId: check.unitId,
        checkType: check.checkType as 'pinning' | 'suppressive' | 'stun',
        roll: result.roll,
        target: result.target,
        modifier: check.modifier,
        passed: result.passed,
        statusApplied: result.passed ? undefined : failureStatus,
      };
      events.push(statusEvent);
    }

    // If failed, apply the status
    if (!result.passed) {
      currentState = updateUnitInGameState(
        currentState,
        check.unitId,
        (u) => addStatus(u, failureStatus),
      );

      // Track which unit IDs got which status
      switch (failureStatus) {
        case TacticalStatus.Pinned:
          pinnedUnitIds.push(check.unitId);
          break;
        case TacticalStatus.Suppressed:
          suppressedUnitIds.push(check.unitId);
          break;
        case TacticalStatus.Stunned:
          stunnedUnitIds.push(check.unitId);
          break;
        case TacticalStatus.Routed:
          // This shouldn't happen for status checks, but handle defensively
          routedUnitIds.push(check.unitId);
          break;
      }
    }
  }

  return {
    state: currentState,
    events,
    routedUnitIds,
    pinnedUnitIds,
    suppressedUnitIds,
    stunnedUnitIds,
  };
}

// ─── Individual Check Resolution ────────────────────────────────────────────

/**
 * Resolve a single panic check (25% casualties threshold).
 * Roll 2d6 vs Leadership (default 7).
 * If the roll is greater than the target, the check FAILS.
 * (Roll must be <= target to pass)
 *
 * @param dice - Dice provider
 * @param modifier - Modifier to subtract from leadership
 * @param leadership - Unit's leadership value (default 7)
 * @returns { roll, target, passed }
 */
export function makePanicCheck(
  dice: DiceProvider,
  modifier: number,
  leadership: number = DEFAULT_LEADERSHIP,
): { roll: number; target: number; passed: boolean } {
  const die1 = dice.rollD6();
  const die2 = dice.rollD6();
  const roll = die1 + die2;

  // Target is Leadership - modifier (minimum 2, since 2d6 always rolls at least 2)
  const target = Math.max(2, leadership - modifier);

  // Roll must be <= target to pass
  const passed = roll <= target;

  return { roll, target, passed };
}

/**
 * Resolve a status check (Pinning, Suppressive, Stun, Coherency).
 * Roll 2d6 vs Cool (default 7) - modifier.
 * If the roll is greater than the target, the check FAILS.
 *
 * @param dice - Dice provider
 * @param modifier - Modifier to subtract from cool
 * @param cool - Unit's cool value (default 7)
 * @returns { roll, target, passed }
 */
export function makeStatusCheck(
  dice: DiceProvider,
  modifier: number,
  cool: number = DEFAULT_COOL,
): { roll: number; target: number; passed: boolean } {
  const die1 = dice.rollD6();
  const die2 = dice.rollD6();
  const roll = die1 + die2;

  // Target is Cool - modifier (minimum 2, since 2d6 always rolls at least 2)
  const target = Math.max(2, cool - modifier);

  // Roll must be <= target to pass
  const passed = roll <= target;

  return { roll, target, passed };
}

// ─── Status Mapping ─────────────────────────────────────────────────────────

/**
 * Map a MoraleCheckType to the TacticalStatus that gets applied on failure.
 *
 * @param checkType - The type of morale check
 * @returns The TacticalStatus to apply on failure
 */
export function getFailureStatus(checkType: MoraleCheckType): TacticalStatus {
  switch (checkType) {
    case 'panic':
      return TacticalStatus.Routed;
    case 'panicRule':
      return TacticalStatus.Routed;
    case 'pinning':
      return TacticalStatus.Pinned;
    case 'suppressive':
      return TacticalStatus.Suppressed;
    case 'stun':
      return TacticalStatus.Stunned;
    case 'coherency':
      return TacticalStatus.Suppressed;
  }
}
