/**
 * Charge Roll & Move Handler
 * Implements the Charge Roll and Charge Move (Step 5 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 5
 *
 * Charge Roll: Roll 2d6, discard the lowest → charge roll value.
 * If the charge roll >= distance to target → charge succeeds.
 * If the charge roll < distance → charge fails.
 *
 * On success: Models move toward the target, achieving base contact.
 *             Both units become Locked in Combat.
 * On failure: Unit does not move. Make Cool Check; if failed → Stunned.
 */

import type { GameState, ModelState } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import type { DiceProvider, GameEvent } from '../types';
import {
  findUnit,
  getAliveModels,
  getDistanceBetween,
} from '../game-queries';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  lockUnitsInCombat,
  addStatus,
} from '../state-helpers';
import { moveToward } from './setup-move-handler';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default Cool value for standard Space Marine models */
export const DEFAULT_COOL = 7;

// ─── Charge Roll Result ─────────────────────────────────────────────────────

/**
 * Result of a charge roll.
 */
export interface ChargeRollResult {
  /** The two d6 values rolled */
  diceValues: [number, number];
  /** The charge roll value (higher of the two dice) */
  chargeRoll: number;
  /** The discarded die (lower of the two) */
  discardedDie: number;
}

/**
 * Result of resolving the charge move.
 */
export interface ChargeMoveResult {
  /** The updated game state */
  state: GameState;
  /** Events generated during the charge move */
  events: GameEvent[];
  /** Whether the charge succeeded */
  chargeSucceeded: boolean;
  /** The charge roll result */
  chargeRoll: ChargeRollResult;
  /** Distance to target that was needed */
  distanceToTarget: number;
  /** Whether the unit gained Stunned (from failed Cool Check after failed charge) */
  gainedStunned: boolean;
}

// ─── Resolve Charge Roll ────────────────────────────────────────────────────

/**
 * Roll 2d6, discard the lowest → charge roll value.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 5
 *
 * @param dice - Dice provider for rolling
 * @returns ChargeRollResult with dice values and charge roll
 */
export function resolveChargeRoll(dice: DiceProvider): ChargeRollResult {
  const [die1, die2] = dice.roll2D6();
  const chargeRoll = Math.max(die1, die2);
  const discardedDie = Math.min(die1, die2);

  return {
    diceValues: [die1, die2],
    chargeRoll,
    discardedDie,
  };
}

// ─── Resolve Charge Move ────────────────────────────────────────────────────

/**
 * Resolves the charge move (Step 5 of the Charge Sub-Phase).
 *
 * Procedure:
 * 1. Roll 2d6, discard lowest → charge roll
 * 2. Calculate distance from closest charging model to closest target model
 * 3. If charge roll < distance → charge fails
 *    - Unit does not move
 *    - Make Cool Check; if failed → unit gains Stunned
 * 4. If charge roll >= distance → charge succeeds
 *    - Initial charger (closest model) moves first toward nearest target
 *    - Remaining models follow, maintaining coherency
 *    - Models end in base contact with target
 *    - Both units become Locked in Combat
 *
 * @param state - Current game state
 * @param chargingUnitId - ID of the charging unit
 * @param targetUnitId - ID of the target unit
 * @param dice - Dice provider for rolling
 * @param closestDistance - Pre-calculated closest distance (from validation)
 * @param coolValue - Cool characteristic for failed charge check (default: 7)
 * @returns ChargeMoveResult with updated state and events
 */
export function resolveChargeMove(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  closestDistance: number,
  coolValue: number = DEFAULT_COOL,
): ChargeMoveResult {
  const events: GameEvent[] = [];

  // Step 1: Roll 2d6, discard lowest
  const chargeRoll = resolveChargeRoll(dice);

  events.push({
    type: 'chargeRoll',
    chargingUnitId,
    targetUnitId,
    diceValues: chargeRoll.diceValues,
    chargeRoll: chargeRoll.chargeRoll,
    discardedDie: chargeRoll.discardedDie,
    distanceNeeded: closestDistance,
  } as GameEvent);

  let newState = state;
  let chargeSucceeded = false;
  let gainedStunned = false;

  if (chargeRoll.chargeRoll < closestDistance) {
    // Step 3: Charge fails
    events.push({
      type: 'chargeFailed',
      chargingUnitId,
      targetUnitId,
      chargeRoll: chargeRoll.chargeRoll,
      distanceNeeded: closestDistance,
    } as GameEvent);

    // Make Cool Check
    const coolCheckResult = resolveCoolCheck(dice, coolValue);

    events.push({
      type: 'coolCheck',
      unitId: chargingUnitId,
      roll: coolCheckResult.roll,
      target: coolValue,
      passed: coolCheckResult.passed,
    } as GameEvent);

    if (!coolCheckResult.passed) {
      // Apply Stunned status
      newState = updateUnitInGameState(newState, chargingUnitId, unit =>
        addStatus(unit, TacticalStatus.Stunned),
      );
      gainedStunned = true;
    }
  } else {
    // Step 4: Charge succeeds
    chargeSucceeded = true;

    events.push({
      type: 'chargeSucceeded',
      chargingUnitId,
      targetUnitId,
      chargeRoll: chargeRoll.chargeRoll,
      distanceNeeded: closestDistance,
    } as GameEvent);

    // Move models into base contact
    newState = moveChargingModels(
      newState,
      chargingUnitId,
      targetUnitId,
      chargeRoll.chargeRoll,
      events,
    );

    // Lock both units in combat
    newState = lockUnitsInCombat(newState, chargingUnitId, targetUnitId);
  }

  return {
    state: newState,
    events,
    chargeSucceeded,
    chargeRoll,
    distanceToTarget: closestDistance,
    gainedStunned,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Resolve a Cool Check (roll 2d6 <= Cool value).
 */
function resolveCoolCheck(
  dice: DiceProvider,
  coolValue: number,
): { roll: number; passed: boolean } {
  const [die1, die2] = dice.roll2D6();
  const roll = die1 + die2;
  return { roll, passed: roll <= coolValue };
}

/**
 * Move all charging models toward the target, achieving base contact.
 * The closest model moves first (initial charger), then remaining models follow.
 */
function moveChargingModels(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
  maxMoveDistance: number,
  events: GameEvent[],
): GameState {
  const chargingUnit = findUnit(state, chargingUnitId);
  const targetUnit = findUnit(state, targetUnitId);

  if (!chargingUnit || !targetUnit) return state;

  const aliveChargers = getAliveModels(chargingUnit);
  const aliveTargets = getAliveModels(targetUnit);

  if (aliveChargers.length === 0 || aliveTargets.length === 0) return state;

  let newState = state;

  // Sort chargers by distance to closest target (closest first)
  const sortedChargers = [...aliveChargers].sort((a, b) => {
    const distA = getMinDistanceToModels(a, aliveTargets);
    const distB = getMinDistanceToModels(b, aliveTargets);
    return distA - distB;
  });

  // Move each charger toward the closest target model
  for (const charger of sortedChargers) {
    const closestTarget = findClosestTarget(charger, aliveTargets);
    if (!closestTarget) continue;

    const newPos = moveToward(charger.position, closestTarget.position, maxMoveDistance);

    newState = updateUnitInGameState(newState, chargingUnitId, unit =>
      updateModelInUnit(unit, charger.id, model => moveModel(model, newPos)),
    );

    events.push({
      type: 'chargeMove' as const,
      chargingUnitId,
      targetUnitId,
      modelId: charger.id,
      from: charger.position,
      to: newPos,
    } as GameEvent);
  }

  return newState;
}

/**
 * Get the minimum distance from a model to any model in a list.
 */
function getMinDistanceToModels(model: ModelState, targets: ModelState[]): number {
  let minDist = Infinity;
  for (const target of targets) {
    const dist = getDistanceBetween(model.position, target.position);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Find the closest target model to a charger.
 */
function findClosestTarget(charger: ModelState, targets: ModelState[]): ModelState | null {
  let minDist = Infinity;
  let closest: ModelState | null = null;
  for (const target of targets) {
    const dist = getDistanceBetween(charger.position, target.position);
    if (dist < minDist) {
      minDist = dist;
      closest = target;
    }
  }
  return closest;
}
