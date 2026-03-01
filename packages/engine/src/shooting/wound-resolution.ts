/**
 * Wound Resolution — Shooting Pipeline Step 7a
 * Reference: HH_Rules_Battle.md — Step 7: Resolve Wound Tests (non-vehicle targets)
 * Reference: HH_Principles.md — Wound Table, Poisoned, Breaching, Shred, Rending, Critical Hits
 *
 * Resolves wound tests for each successful hit against non-vehicle targets:
 * 1. For each hit, look up wound target number from woundTable(S, T)
 * 2. Roll d6 and compare to target number
 * 3. Handle special wound effects:
 *    - Rending hits: auto-wound (no roll), treated as roll of 6
 *    - Critical hits: auto-wound, +1 damage
 *    - Poisoned(X): if roll >= X, wound regardless of S/T comparison
 *    - Breaching(X): if wound roll >= X, AP becomes 2
 *    - Shred(X): if wound roll >= X, damage +1
 */

import type { SpecialRuleRef } from '@hh/types';
import type { DiceProvider, GameEvent, WoundTestRollEvent } from '../types';
import type { HitResult, WoundResult } from './shooting-types';
import { woundTable } from '../tables';
import { getSpecialRuleValue } from './hit-resolution';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of resolving all wound tests for a set of hits.
 */
export interface WoundResolutionResult {
  /** All wound results (both successes and failures) */
  wounds: WoundResult[];
  /** Events emitted during resolution */
  events: GameEvent[];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Parse a special rule value by name from an array of special rule references.
 * Delegates to the shared getSpecialRuleValue helper from hit-resolution.
 *
 * @param specialRules - Array of special rule references
 * @param ruleName - Name of the rule to look up (case-insensitive)
 * @returns The parsed numeric threshold, or null if not present
 */
function getRuleValue(specialRules: SpecialRuleRef[], ruleName: string): number | null {
  return getSpecialRuleValue(specialRules, ruleName);
}

// ─── Majority Toughness ─────────────────────────────────────────────────────

/**
 * Determine the majority Toughness of a target unit.
 *
 * Reference: HH_Core.md — "Majority Toughness"
 * The majority toughness is the toughness value shared by the most models in the unit.
 * If there is a tie in count, the highest toughness value among the tied values wins.
 *
 * @param toughnessValues - Array of toughness values for all models in the target unit
 * @returns The majority toughness value
 */
export function getMajorityToughness(toughnessValues: number[]): number {
  if (toughnessValues.length === 0) {
    throw new Error('Cannot determine majority toughness from empty array');
  }

  // Count occurrences of each toughness value
  const countMap = new Map<number, number>();
  for (const t of toughnessValues) {
    countMap.set(t, (countMap.get(t) ?? 0) + 1);
  }

  // Find the maximum count
  let maxCount = 0;
  for (const count of countMap.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  // Among all values with the maximum count, pick the highest
  let majorityT = 0;
  for (const [toughness, count] of countMap) {
    if (count === maxCount && toughness > majorityT) {
      majorityT = toughness;
    }
  }

  return majorityT;
}

// ─── Wound Resolution ───────────────────────────────────────────────────────

/**
 * Resolve wound tests for a set of successful hits against a non-vehicle target.
 *
 * Reference: HH_Rules_Battle.md — Step 7: Resolve Wound Tests
 * Reference: HH_Principles.md — Wound Table, special rules
 *
 * Process for each hit:
 * 1. If the hit is a Rending hit → auto-wound (no roll needed), treated as roll of 6
 * 2. If the hit is a Critical hit → auto-wound, +1 damage
 * 3. Otherwise, look up wound target from woundTable(weaponStrength, majorityToughness)
 * 4. Roll d6:
 *    a. If Poisoned(X) and roll >= X → wound regardless of S/T
 *    b. If roll >= wound target → wound
 *    c. Otherwise → fail
 * 5. If wound succeeded:
 *    a. If Breaching(X) and wound roll >= X → AP becomes 2
 *    b. If Shred(X) and wound roll >= X → damage +1
 *
 * @param hits - Array of successful hit results (only hits where isHit === true should be passed)
 * @param majorityToughness - The majority toughness of the target unit
 * @param dice - Dice provider for rolling
 * @returns Wound results and game events
 */
export function resolveWoundTests(
  hits: HitResult[],
  majorityToughness: number,
  dice: DiceProvider,
  strengthModifier: number = 0,    // Modify weapon strength (e.g., Iron Hands -1 incoming S for defense)
  minimumWoundRoll: number = 0,    // Minimum roll to wound (e.g., Salamanders wound rolls 1-2 always fail)
): WoundResolutionResult {
  const wounds: WoundResult[] = [];
  const allRolls: number[] = [];
  let woundCount = 0;
  let failureCount = 0;
  let breachingCount = 0;
  let shredCount = 0;

  // Track first hit's strength for the event (representative)
  const representativeStrength = hits.length > 0 ? hits[0].weaponStrength : 0;

  for (const hit of hits) {
    const specialRules = hit.specialRules;
    const weaponStrength = hit.weaponStrength;
    const weaponAP = hit.weaponAP;
    const weaponDamage = hit.weaponDamage;

    // Extract special rule thresholds
    const poisonedValue = getRuleValue(specialRules, 'Poisoned');
    const breachingValue = getRuleValue(specialRules, 'Breaching');
    const shredValue = getRuleValue(specialRules, 'Shred');

    // ─── Rending hits: auto-wound ────────────────────────────────────
    if (hit.isRending) {
      // Rending hits auto-wound with no roll needed, treated as roll of 6
      const effectiveRoll = 6;
      let ap = weaponAP;
      let damage = weaponDamage;
      let isBreaching = false;
      let isShred = false;

      // Breaching can still trigger on the effective roll of 6
      if (breachingValue !== null && effectiveRoll >= breachingValue) {
        ap = 2;
        isBreaching = true;
        breachingCount++;
      }

      // Shred can still trigger on the effective roll of 6
      if (shredValue !== null && effectiveRoll >= shredValue) {
        damage += 1;
        isShred = true;
        shredCount++;
      }

      wounds.push({
        diceRoll: -1,
        targetNumber: 0,
        isWound: true,
        strength: weaponStrength,
        ap,
        damage,
        isBreaching,
        isShred,
        isPoisoned: false,
        isCriticalWound: false,
        isRendingWound: true,
        isPrecision: hit.isPrecision,
        specialRules: [...specialRules],
      });
      woundCount++;
      continue;
    }

    // ─── Critical hits: auto-wound + 1 damage ───────────────────────
    if (hit.isCritical) {
      // Critical hits auto-wound with +1 damage, treated as roll of 6
      const effectiveRoll = 6;
      let ap = weaponAP;
      let damage = weaponDamage + 1; // Critical = +1 damage
      let isBreaching = false;
      let isShred = false;

      // Breaching can still trigger on the effective roll of 6
      if (breachingValue !== null && effectiveRoll >= breachingValue) {
        ap = 2;
        isBreaching = true;
        breachingCount++;
      }

      // Shred can still trigger on the effective roll of 6
      if (shredValue !== null && effectiveRoll >= shredValue) {
        damage += 1;
        isShred = true;
        shredCount++;
      }

      wounds.push({
        diceRoll: -1,
        targetNumber: 0,
        isWound: true,
        strength: weaponStrength,
        ap,
        damage,
        isBreaching,
        isShred,
        isPoisoned: false,
        isCriticalWound: true,
        isRendingWound: false,
        isPrecision: hit.isPrecision,
        specialRules: [...specialRules],
      });
      woundCount++;
      continue;
    }

    // ─── Normal wound resolution: roll d6 ───────────────────────────
    // Apply legion tactica strength modifier (e.g., Iron Hands -1 incoming S)
    const effectiveStrength = Math.max(1, weaponStrength + strengthModifier);
    const woundTarget = woundTable(effectiveStrength, majorityToughness);
    const roll = dice.rollD6();
    allRolls.push(roll);

    let isWound = false;
    let isPoisoned = false;

    // Check Poisoned first: if roll >= X, wound regardless of S/T
    if (poisonedValue !== null && roll >= poisonedValue) {
      isWound = true;
      isPoisoned = true;
    }
    // Normal wound check: if the wound is possible and roll meets target
    else if (woundTarget !== null && roll >= woundTarget) {
      isWound = true;
    }

    // Salamanders tactica: wound rolls below minimum always fail
    if (minimumWoundRoll > 0 && roll <= minimumWoundRoll) {
      isWound = false;
      isPoisoned = false;
    }

    let ap = weaponAP;
    let damage = weaponDamage;
    let isBreaching = false;
    let isShred = false;

    if (isWound) {
      // Breaching(X): if wound roll (before modifiers) >= X, AP becomes 2
      if (breachingValue !== null && roll >= breachingValue) {
        ap = 2;
        isBreaching = true;
        breachingCount++;
      }

      // Shred(X): if wound roll >= X, damage +1
      if (shredValue !== null && roll >= shredValue) {
        damage += 1;
        isShred = true;
        shredCount++;
      }

      woundCount++;
    } else {
      failureCount++;
    }

    wounds.push({
      diceRoll: roll,
      targetNumber: woundTarget ?? 7, // 7 = impossible (would need 7+ on d6)
      isWound,
      strength: weaponStrength,
      ap,
      damage,
      isBreaching,
      isShred,
      isPoisoned,
      isCriticalWound: false,
      isRendingWound: false,
      isPrecision: hit.isPrecision,
      specialRules: [...specialRules],
    });
  }

  // Build event
  const woundTarget = woundTable(representativeStrength, majorityToughness);
  const events: GameEvent[] = [
    {
      type: 'woundTestRoll',
      fireGroupIndex: 0, // Caller should update this if needed
      rolls: allRolls,
      targetNumber: woundTarget ?? 7,
      strength: representativeStrength,
      toughness: majorityToughness,
      wounds: woundCount,
      failures: failureCount,
      breachingWounds: breachingCount,
      shredWounds: shredCount,
    } as WoundTestRollEvent,
  ];

  return { wounds, events };
}
