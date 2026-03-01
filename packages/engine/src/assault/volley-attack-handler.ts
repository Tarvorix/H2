/**
 * Volley Attack Handler
 * Implements Volley Attacks (Step 4 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 4
 *
 * Volley Attacks occur during the charge before the charge roll.
 * The charging unit volleys first (Assault-trait weapons only, all Snap Shots),
 * then the target unit volleys (Assault-trait weapons only, all Snap Shots).
 *
 * Either side may choose not to volley.
 * Volley attacks cannot inflict tactical statuses (Pinning, Suppressive, etc.).
 *
 * If Overwatch reaction is accepted, the target fires at full BS with any
 * weapon instead of snap-shot volley. No Cover/Shrouded saves allowed
 * against Overwatch wounds.
 *
 * If one side is wiped out by volley attacks, the charge ends.
 */

import type { GameState } from '@hh/types';
import { PipelineHook } from '@hh/types';
import { getTacticaEffectsForLegion } from '@hh/data';
import type { DiceProvider, GameEvent } from '../types';
import { findUnit, getAliveModels, isUnitDestroyed, getUnitLegion } from '../game-queries';
import { applyLegionTactica } from '../legion';

// ─── Volley Result ──────────────────────────────────────────────────────────

/**
 * Result of resolving volley attacks.
 */
export interface VolleyAttackResult {
  /** The updated game state */
  state: GameState;
  /** Events generated during the volley attacks */
  events: GameEvent[];
  /** Whether the charging unit was wiped out */
  chargerWipedOut: boolean;
  /** Whether the target unit was wiped out */
  targetWipedOut: boolean;
  /** Number of casualties inflicted on the target by the charger's volley */
  chargerCasualtiesInflicted: number;
  /** Number of casualties inflicted on the charger by the target's volley */
  targetCasualtiesInflicted: number;
  /** Whether the volley was skipped (disordered charge or other reason) */
  skipped: boolean;
}

// ─── Resolve Volley Attacks ─────────────────────────────────────────────────

/**
 * Resolves Volley Attacks (Step 4 of the Charge Sub-Phase).
 *
 * Procedure:
 * 1. Skip if target is already locked in another combat
 * 2. Skip charger's volley if Disordered
 * 3. Charging unit volleys first (Assault-trait weapons only, all Snap Shots)
 * 4. Target unit volleys (Assault-trait weapons only, all Snap Shots)
 * 5. Volley attacks cannot inflict statuses (Pinning, Suppressive, etc.)
 * 6. If one side wiped → charge ends
 *
 * Note: The actual shooting resolution (hit tests, wound tests, saves, damage)
 * reuses the shooting pipeline modules. This handler orchestrates the volley
 * sequence and tracks casualties.
 *
 * For now, this implements a simplified volley attack that resolves
 * snap-shot attacks using the dice provider. The full integration with the
 * shooting pipeline will be wired in Step 17 (Command Processor Integration).
 *
 * @param state - Current game state
 * @param chargingUnitId - ID of the charging unit
 * @param targetUnitId - ID of the target unit
 * @param isDisordered - Whether this is a disordered charge
 * @param dice - Dice provider for rolling
 * @param chargerVolley - Whether the charger chooses to volley
 * @param targetVolley - Whether the target chooses to volley
 * @returns VolleyAttackResult with updated state and events
 */
export function resolveVolleyAttacks(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
  isDisordered: boolean,
  dice: DiceProvider,
  chargerVolley: boolean = true,
  targetVolley: boolean = true,
): VolleyAttackResult {
  const events: GameEvent[] = [];

  const chargingUnit = findUnit(state, chargingUnitId);
  const targetUnit = findUnit(state, targetUnitId);

  if (!chargingUnit || !targetUnit) {
    return {
      state,
      events,
      chargerWipedOut: false,
      targetWipedOut: false,
      chargerCasualtiesInflicted: 0,
      targetCasualtiesInflicted: 0,
      skipped: true,
    };
  }

  // Skip if target is already locked in another combat
  if (targetUnit.isLockedInCombat) {
    return {
      state,
      events,
      chargerWipedOut: false,
      targetWipedOut: false,
      chargerCasualtiesInflicted: 0,
      targetCasualtiesInflicted: 0,
      skipped: true,
    };
  }

  let newState = state;
  let chargerCasualties = 0;
  let targetCasualties = 0;

  // Check for Sons of Horus volley full BS tactica
  // When the full shooting pipeline is integrated, this will override snap shot BS
  // with the unit's full BS for volley attacks
  let chargerVolleyFullBS = false;
  const chargerLegion = getUnitLegion(state, chargingUnitId);
  if (chargerLegion) {
    const effects = getTacticaEffectsForLegion(chargerLegion);
    const tacticaResult = applyLegionTactica(chargerLegion, PipelineHook.PreHit, {
      state,
      unit: chargingUnit,
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
    if (tacticaResult.volleyFullBS) {
      chargerVolleyFullBS = true;
    }
  }

  // Step 1: Charger's volley (skip if Disordered or choosing not to volley)
  if (!isDisordered && chargerVolley) {
    const chargerVolleyResult = resolveSnapShotVolley(
      newState,
      chargingUnitId,
      targetUnitId,
      dice,
      chargerVolleyFullBS,
    );
    newState = chargerVolleyResult.state;
    targetCasualties += chargerVolleyResult.casualtiesInflicted;
    events.push(...chargerVolleyResult.events);
  }

  // Check if target was wiped out by charger's volley
  const targetAfterChargerVolley = findUnit(newState, targetUnitId);
  if (targetAfterChargerVolley && isUnitDestroyed(targetAfterChargerVolley)) {
    return {
      state: newState,
      events,
      chargerWipedOut: false,
      targetWipedOut: true,
      chargerCasualtiesInflicted: targetCasualties,
      targetCasualtiesInflicted: chargerCasualties,
      skipped: false,
    };
  }

  // Step 2: Target's volley (if choosing to volley)
  if (targetVolley) {
    const targetVolleyResult = resolveSnapShotVolley(
      newState,
      targetUnitId,
      chargingUnitId,
      dice,
    );
    newState = targetVolleyResult.state;
    chargerCasualties += targetVolleyResult.casualtiesInflicted;
    events.push(...targetVolleyResult.events);
  }

  // Check if charger was wiped out by target's volley
  const chargerAfterTargetVolley = findUnit(newState, chargingUnitId);
  const chargerWipedOut = chargerAfterTargetVolley
    ? isUnitDestroyed(chargerAfterTargetVolley)
    : false;

  return {
    state: newState,
    events,
    chargerWipedOut,
    targetWipedOut: false,
    chargerCasualtiesInflicted: targetCasualties,
    targetCasualtiesInflicted: chargerCasualties,
    skipped: false,
  };
}

// ─── Snap Shot Volley ───────────────────────────────────────────────────────

/**
 * Result of a snap-shot volley by a single unit.
 */
interface SnapShotVolleyResult {
  state: GameState;
  events: GameEvent[];
  casualtiesInflicted: number;
}

/**
 * Resolve a snap-shot volley from one unit to another.
 * Uses the shooting pipeline with Snap Shot restrictions:
 * - Only Assault-trait weapons may fire
 * - All attacks are Snap Shots (reduced BS)
 * - Cannot inflict tactical statuses
 *
 * This is a simplified implementation that generates volley attack events.
 * The full shooting pipeline integration will be done when the command
 * processor is wired up (Step 17).
 *
 * @param state - Current game state
 * @param attackerUnitId - ID of the attacking unit
 * @param targetUnitId - ID of the target unit
 * @param dice - Dice provider for rolling
 * @returns SnapShotVolleyResult with updated state and events
 */
function resolveSnapShotVolley(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  _dice: DiceProvider,
  _fullBS: boolean = false,  // Legion tactica: use full BS instead of snap shots (e.g., Sons of Horus)
): SnapShotVolleyResult {
  const events: GameEvent[] = [];
  const attackerUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);

  if (!attackerUnit || !targetUnit) {
    return { state, events, casualtiesInflicted: 0 };
  }

  const attackerModels = getAliveModels(attackerUnit);
  const targetModels = getAliveModels(targetUnit);

  if (attackerModels.length === 0 || targetModels.length === 0) {
    return { state, events, casualtiesInflicted: 0 };
  }

  // Generate a volley attack event summarizing the volley
  // The detailed hit/wound/save resolution would come from the shooting pipeline
  // For now, we track the volley as an event without modifying casualties
  // (casualties from volleys will be resolved through the shooting pipeline
  // when fully integrated in Step 17)
  events.push({
    type: 'volleyAttack',
    attackerUnitId,
    targetUnitId,
    isSnapShot: true,
    attackerModelCount: attackerModels.length,
    targetModelCount: targetModels.length,
  } as GameEvent);

  return {
    state,
    events,
    casualtiesInflicted: 0,
  };
}

// ─── Overwatch Volley ───────────────────────────────────────────────────────

/**
 * Checks if the target unit's volley should be replaced by Overwatch.
 * If Overwatch is used, the target fires at full BS with any weapon
 * instead of snap shots. No Cover/Shrouded saves are allowed.
 *
 * @param state - Current game state
 * @param targetUnitId - ID of the target unit (reactive player)
 * @returns Whether the target should use Overwatch instead of snap-shot volley
 */
export function shouldUseOverwatch(state: GameState, targetUnitId: string): boolean {
  // Overwatch is handled by the reaction system.
  // When awaitingReaction is true and the pending reaction is Overwatch,
  // the reactive player can choose to accept or decline.
  // This check is handled by the overwatch-handler module (Step 6).
  return (
    state.awaitingReaction === true &&
    state.pendingReaction?.reactionType === 'Overwatch' &&
    state.pendingReaction.eligibleUnitIds.includes(targetUnitId)
  );
}
