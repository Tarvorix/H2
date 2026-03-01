/**
 * Damage Resolution — Shooting Pipeline Step 9 (continued)
 * Reference: HH_Rules_Battle.md — Step 9: Apply Damage
 * Reference: HH_Principles.md — Damage, Shrouded, Damage Mitigation
 *
 * Applies damage from unsaved wounds to target models:
 * 1. Apply each wound's damage value sequentially to the target model
 * 2. If the model reaches 0 wounds, it is destroyed
 * 3. Remaining damage from a wound that destroys a model is LOST
 *    (cannot overflow to the next model)
 * 4. Handle Shrouded(X) damage mitigation: roll d6, on X+ the wound is discarded
 *    (in addition to saving throws, not instead of)
 *    Can only be used for shooting wounds, NOT melee
 */

import type { DiceProvider, GameEvent, DamageMitigationRollEvent } from '../types';
import type { WoundResult } from './shooting-types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of applying a single wound's damage to a model.
 */
export interface DamageApplicationResult {
  /** Remaining wounds on the model after damage */
  remainingWounds: number;
  /** Whether the model was destroyed */
  destroyed: boolean;
}

/**
 * Result of resolving all damage against a target model.
 */
export interface DamageResolutionResult {
  /** Final remaining wounds on the model */
  finalWounds: number;
  /** Whether the model was destroyed */
  destroyed: boolean;
  /** Total damage actually applied (may be less than total damage if model was destroyed) */
  totalDamageApplied: number;
}

/**
 * Result of handling damage mitigation (Shrouded).
 */
export interface DamageMitigationResult {
  /** Wounds that were discarded by the mitigation */
  mitigatedWounds: WoundResult[];
  /** Wounds that passed through the mitigation */
  remainingWounds: WoundResult[];
  /** Events emitted during resolution */
  events: GameEvent[];
}

// ─── Damage Application ─────────────────────────────────────────────────────

/**
 * Apply damage from a single wound to a model.
 *
 * Reference: HH_Principles.md — Damage
 *
 * Reduces the model's current wounds by the damage value.
 * If wounds reach 0 or below, the model is destroyed.
 *
 * @param modelCurrentWounds - The model's current wound count
 * @param damageValue - The damage value of the wound
 * @returns Remaining wounds and whether the model is destroyed
 */
export function applyDamageToModel(
  modelCurrentWounds: number,
  damageValue: number,
): DamageApplicationResult {
  const remainingWounds = Math.max(0, modelCurrentWounds - damageValue);
  const destroyed = remainingWounds <= 0;

  return { remainingWounds, destroyed };
}

// ─── Damage Resolution ──────────────────────────────────────────────────────

/**
 * Resolve all damage from unsaved wounds against a target model.
 *
 * Reference: HH_Rules_Battle.md — Step 9: Apply Damage
 *
 * Applies each wound's damage value sequentially:
 * - If the model reaches 0 wounds during damage application, it is destroyed
 * - Remaining damage from a wound that destroys a model is LOST
 *   (cannot overflow to the next model)
 * - Once destroyed, no further wounds are applied
 *
 * @param unsavedWounds - Array of wounds that failed their saving throw
 * @param targetModelId - ID of the model receiving the damage
 * @param modelCurrentWounds - The model's current wound count before damage
 * @returns Final wound status and total damage applied
 */
export function resolveDamage(
  unsavedWounds: WoundResult[],
  _targetModelId: string,
  modelCurrentWounds: number,
): DamageResolutionResult {
  let currentWounds = modelCurrentWounds;
  let totalDamageApplied = 0;
  let destroyed = false;

  for (const wound of unsavedWounds) {
    if (destroyed) {
      // Model already destroyed — remaining wounds are lost
      break;
    }

    const damageValue = wound.damage;
    const result = applyDamageToModel(currentWounds, damageValue);

    // Track the actual damage applied (not the damage value, but how much the model lost)
    const actualDamage = currentWounds - result.remainingWounds;
    totalDamageApplied += actualDamage;

    currentWounds = result.remainingWounds;
    destroyed = result.destroyed;
  }

  return {
    finalWounds: currentWounds,
    destroyed,
    totalDamageApplied,
  };
}

// ─── Damage Mitigation ──────────────────────────────────────────────────────

/**
 * Handle damage mitigation via Shrouded(X) or similar rules.
 *
 * Reference: HH_Armoury.md — Shrouded(X)
 *
 * Shrouded(X): For each wound, roll d6. On a result of X+, the wound is discarded.
 * This is IN ADDITION to any saving throw (not instead of).
 * Can only be used for shooting wounds, NOT melee wounds.
 *
 * @param wounds - Array of wounds to attempt mitigation on
 * @param mitigationRule - Name of the mitigation rule (e.g., "Shrouded")
 * @param mitigationValue - The threshold value (e.g., 4 for Shrouded(4+))
 * @param dice - Dice provider for rolling
 * @returns Mitigated wounds, remaining wounds, and game events
 */
export function handleDamageMitigation(
  wounds: WoundResult[],
  mitigationRule: string,
  mitigationValue: number,
  dice: DiceProvider,
): DamageMitigationResult {
  const mitigatedWounds: WoundResult[] = [];
  const remainingWounds: WoundResult[] = [];
  const events: GameEvent[] = [];

  for (const wound of wounds) {
    // Only process wounds that actually wounded
    if (!wound.isWound) {
      remainingWounds.push(wound);
      continue;
    }

    // Roll d6 for damage mitigation
    const roll = dice.rollD6();
    const passed = roll >= mitigationValue;

    // Emit damage mitigation event
    const modelId = wound.assignedToModelId ?? '';
    events.push({
      type: 'damageMitigationRoll',
      modelId,
      mitigationType: mitigationRule,
      roll,
      targetNumber: mitigationValue,
      passed,
    } as DamageMitigationRollEvent);

    if (passed) {
      // Wound is discarded (mitigated)
      mitigatedWounds.push(wound);
    } else {
      // Wound passes through
      remainingWounds.push(wound);
    }
  }

  return { mitigatedWounds, remainingWounds, events };
}
