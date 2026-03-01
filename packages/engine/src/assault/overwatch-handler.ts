/**
 * Overwatch Reaction Handler
 * Implements the Overwatch reaction triggered during the Charge Sub-Phase (Step 4).
 *
 * Reference: HH_Rules_Battle.md — "Overwatch Reaction"
 * Reference: HH_Principles.md — "Reaction Allotments, Core Reactions"
 *
 * Overwatch flow:
 * 1. When a charge is declared, the target unit may react with Overwatch
 *    (if the reactive player has reaction allotment remaining).
 * 2. The target unit fires at full BS (not Snap Shots) with any ranged weapon
 *    at the charging unit.
 * 3. No Cover Tests or Shrouded Damage Mitigation allowed against Overwatch wounds.
 * 4. The reacting unit is marked as having reacted and the allotment is decremented.
 * 5. If all charging models are destroyed → charge ends immediately.
 *
 * Trigger conditions:
 * - Reactive player has reactionAllotmentRemaining > 0
 * - Target unit can react: not already reacted, not Stunned, not Routed,
 *   not locked in combat, deployed, not embarked
 * - Target unit must not already be locked in combat with other units
 */

import type {
  GameState,
  UnitState,
} from '@hh/types';
import { CoreReaction } from '@hh/types';
import type { GameEvent, OverwatchTriggeredEvent, OverwatchResolvedEvent } from '../types';
import {
  findUnit,
  findUnitArmy,
  findUnitPlayerIndex,
  canUnitReact,
  hasReactionAllotment,
  getAliveModels,
  isUnitDestroyed,
} from '../game-queries';
import {
  updateUnitInGameState,
  updateArmyByIndex,
  setAwaitingReaction,
} from '../state-helpers';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of checking for Overwatch trigger eligibility.
 */
export interface OverwatchCheckResult {
  /** Whether Overwatch can be triggered */
  canOverwatch: boolean;
  /** Unit IDs eligible to use Overwatch */
  eligibleUnitIds: string[];
  /** Events emitted */
  events: GameEvent[];
}

/**
 * Result of executing an Overwatch reaction.
 */
export interface OverwatchExecutionResult {
  /** Updated game state after Overwatch */
  state: GameState;
  /** Events emitted during Overwatch */
  events: GameEvent[];
  /** Whether the charger was wiped out by Overwatch */
  chargerWipedOut: boolean;
}

/**
 * Restrictions that apply to an Overwatch action.
 */
export interface OverwatchRestrictions {
  /** Whether the unit fires at full BS (always true for Overwatch) */
  fullBallisticSkill: boolean;
  /** Whether any ranged weapon can be used (always true for Overwatch) */
  anyRangedWeapon: boolean;
  /** Whether Cover saves are blocked (always true for Overwatch) */
  noCoverSaves: boolean;
  /** Whether Shrouded damage mitigation is blocked (always true for Overwatch) */
  noShrouded: boolean;
  /** Whether this is an Overwatch reaction */
  isOverwatch: boolean;
}

// ─── checkOverwatchTrigger ──────────────────────────────────────────────────

/**
 * Check if Overwatch can be triggered when a charge is declared.
 *
 * The check verifies:
 * 1. The target unit (charged at) exists and has alive models.
 * 2. The charging unit exists and has alive models.
 * 3. The target unit's army (reactive player) has reaction allotments remaining.
 * 4. The target unit passes the canUnitReact eligibility check.
 * 5. The target unit is not already locked in combat with other units.
 *
 * @param state - Current game state
 * @param chargingUnitId - Unit that is charging (Overwatch target)
 * @param targetUnitId - Unit being charged (potential Overwatch user)
 * @returns Whether Overwatch is possible and which units are eligible
 */
export function checkOverwatchTrigger(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
): OverwatchCheckResult {
  const noTrigger: OverwatchCheckResult = {
    canOverwatch: false,
    eligibleUnitIds: [],
    events: [],
  };

  // Find the target unit (the one that was charged and could use Overwatch)
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) {
    return noTrigger;
  }

  // Target unit must have alive models
  const targetAliveModels = getAliveModels(targetUnit);
  if (targetAliveModels.length === 0) {
    return noTrigger;
  }

  // Find the charging unit (the one that will be the Overwatch target)
  const chargingUnit = findUnit(state, chargingUnitId);
  if (!chargingUnit) {
    return noTrigger;
  }

  // Charging unit must have alive models
  const chargingAliveModels = getAliveModels(chargingUnit);
  if (chargingAliveModels.length === 0) {
    return noTrigger;
  }

  // Find the army the target unit belongs to (the reactive player's army)
  const targetArmy = findUnitArmy(state, targetUnitId);
  if (!targetArmy) {
    return noTrigger;
  }

  // Check that the reactive player has reaction allotments remaining
  if (!hasReactionAllotment(targetArmy)) {
    return noTrigger;
  }

  // Check that the target unit is eligible to react
  if (!canUnitReact(targetUnit)) {
    return noTrigger;
  }

  // Target unit must not already be locked in combat with other units
  if (targetUnit.isLockedInCombat) {
    return noTrigger;
  }

  // Target unit is eligible for Overwatch
  const eligibleUnitIds = [targetUnitId];

  // Emit the OverwatchTriggeredEvent
  const triggerEvent: OverwatchTriggeredEvent = {
    type: 'overwatchTriggered',
    chargingUnitId,
    targetUnitId,
    eligibleUnitIds,
  };

  return {
    canOverwatch: true,
    eligibleUnitIds,
    events: [triggerEvent],
  };
}

// ─── offerOverwatch ─────────────────────────────────────────────────────────

/**
 * Set the game state to await an Overwatch reaction decision from the reactive player.
 *
 * @param state - Current game state
 * @param chargingUnitId - Unit that is charging
 * @param eligibleUnitIds - Units eligible to use Overwatch
 * @returns Updated game state with awaitingReaction set
 */
export function offerOverwatch(
  state: GameState,
  chargingUnitId: string,
  eligibleUnitIds: string[],
): GameState {
  return setAwaitingReaction(state, true, {
    reactionType: CoreReaction.Overwatch,
    isAdvancedReaction: false,
    eligibleUnitIds,
    triggerDescription: `Charge declared by unit ${chargingUnitId}`,
    triggerSourceUnitId: chargingUnitId,
  });
}

// ─── resolveOverwatch ───────────────────────────────────────────────────────

/**
 * Execute an Overwatch reaction.
 *
 * The target unit fires at the charging unit at full BS with any ranged weapon.
 * No Cover or Shrouded saves are allowed.
 *
 * After firing:
 * - The reacting unit is marked as having reacted
 * - The army's reaction allotment is decremented
 * - If all charging models are destroyed, the charge ends
 *
 * Note: The actual shooting resolution (hit tests, wound tests, saves, damage)
 * will be handled by the shooting pipeline when fully integrated (Step 17).
 * This function handles the Overwatch-specific state changes.
 *
 * @param state - Current game state
 * @param reactingUnitId - Unit using Overwatch (the charged target)
 * @param chargingUnitId - Unit that is charging (Overwatch target)
 * @returns OverwatchExecutionResult with updated state and events
 */
export function resolveOverwatch(
  state: GameState,
  reactingUnitId: string,
  chargingUnitId: string,
): OverwatchExecutionResult {
  const events: GameEvent[] = [];

  let newState = state;

  // Mark the unit as having reacted
  newState = markUnitReactedOverwatch(newState, reactingUnitId);

  // Clear the awaiting reaction state
  newState = setAwaitingReaction(newState, false);

  // Generate event
  const resolvedEvent: OverwatchResolvedEvent = {
    type: 'overwatchResolved',
    reactingUnitId,
    chargingUnitId,
    accepted: true,
  };
  events.push(resolvedEvent);

  // Check if charger was wiped out
  const chargingUnit = findUnit(newState, chargingUnitId);
  const chargerWipedOut = chargingUnit ? isUnitDestroyed(chargingUnit) : false;

  return {
    state: newState,
    events,
    chargerWipedOut,
  };
}

// ─── declineOverwatch ───────────────────────────────────────────────────────

/**
 * Decline an Overwatch reaction.
 * Clears the awaiting reaction state without firing.
 *
 * @param state - Current game state
 * @param chargingUnitId - Unit that is charging
 * @returns Updated game state with reaction cleared
 */
export function declineOverwatch(
  state: GameState,
  chargingUnitId: string,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  let newState = setAwaitingReaction(state, false);

  const resolvedEvent: OverwatchResolvedEvent = {
    type: 'overwatchResolved',
    reactingUnitId: '',
    chargingUnitId,
    accepted: false,
  };
  events.push(resolvedEvent);

  return { state: newState, events };
}

// ─── getOverwatchRestrictions ───────────────────────────────────────────────

/**
 * Get Overwatch restrictions for a unit.
 * Returns information about what constraints apply to an Overwatch action.
 *
 * Restrictions:
 * - The unit fires at full Ballistic Skill (not Snap Shots)
 * - Any ranged weapon can be used (not just Assault-trait)
 * - No Cover saves are allowed against Overwatch wounds
 * - No Shrouded damage mitigation against Overwatch wounds
 *
 * @param _unit - The unit using Overwatch
 * @returns Restrictions object describing what constraints apply
 */
export function getOverwatchRestrictions(
  _unit: UnitState,
): OverwatchRestrictions {
  return {
    fullBallisticSkill: true,
    anyRangedWeapon: true,
    noCoverSaves: true,
    noShrouded: true,
    isOverwatch: true,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Mark a unit as having reacted via Overwatch and decrement the army's reaction allotment.
 *
 * @param state - Current game state
 * @param unitId - Unit that used Overwatch
 * @returns Updated game state
 */
function markUnitReactedOverwatch(
  state: GameState,
  unitId: string,
): GameState {
  const playerIndex = findUnitPlayerIndex(state, unitId);
  if (playerIndex === undefined) {
    return state;
  }

  // Mark the unit as having reacted this turn
  let newState = updateUnitInGameState(state, unitId, unit => ({
    ...unit,
    hasReactedThisTurn: true,
  }));

  // Decrement the army's reaction allotment remaining
  newState = updateArmyByIndex(newState, playerIndex, army => ({
    ...army,
    reactionAllotmentRemaining: Math.max(0, army.reactionAllotmentRemaining - 1),
  }));

  return newState;
}
