/**
 * Armour Penetration — Shooting Pipeline Step 7b
 * Reference: HH_Rules_Battle.md — Step 7: Resolve Armour Penetration (vehicle targets)
 * Reference: HH_Principles.md — Armour Penetration, Armourbane, Sunder
 *
 * Resolves armour penetration tests for each successful hit against vehicle targets:
 * 1. For each hit, roll d6 and add weapon strength
 * 2. Compare total to the vehicle's armour value (AV) on the targeted facing
 * 3. Determine result:
 *    - total < AV = miss (discard)
 *    - total = AV = glancing hit
 *    - total > AV = penetrating hit
 * 4. Handle special rules:
 *    - Armourbane: glancing hits count as penetrating
 *    - Sunder: re-roll failed armour penetration rolls (total < AV)
 */

import type { SpecialRuleRef } from '@hh/types';
import { VehicleFacing } from '@hh/types';
import type { DiceProvider, GameEvent, ArmourPenetrationRollEvent } from '../types';
import type { HitResult, PenetratingHitResult, GlancingHit } from './shooting-types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of resolving armour penetration tests for a set of hits against a vehicle.
 */
export interface ArmourPenetrationResult {
  /** Penetrating hit results (total > AV, or promoted from glancing via Armourbane) */
  penetratingHits: PenetratingHitResult[];
  /** Glancing hit results (total = AV, not promoted by Armourbane) */
  glancingHits: GlancingHit[];
  /** Events emitted during resolution */
  events: GameEvent[];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Check if a special rule is present by name (case-insensitive).
 */
function hasRule(specialRules: SpecialRuleRef[], ruleName: string): boolean {
  return specialRules.some(
    (r) => r.name.toLowerCase() === ruleName.toLowerCase(),
  );
}

// ─── Armour Penetration Resolution ──────────────────────────────────────────

/**
 * Resolve armour penetration tests for a set of successful hits against a vehicle target.
 *
 * Reference: HH_Rules_Battle.md — Step 7: Armour Penetration
 * Reference: HH_Principles.md — Armour Values, Glancing/Penetrating Hits
 *
 * Process for each hit:
 * 1. Roll d6
 * 2. Calculate total = d6 + weaponStrength
 * 3. Compare to armourValue (AV) of the targeted facing:
 *    - total < AV → miss (discard). If Sunder is present, re-roll the d6.
 *    - total = AV → glancing hit. If Armourbane is present, promote to penetrating.
 *    - total > AV → penetrating hit.
 *
 * @param hits - Array of successful hit results (only hits where isHit === true)
 * @param armourValue - The armour value of the targeted vehicle facing
 * @param facing - Which vehicle facing is being targeted
 * @param dice - Dice provider for rolling
 * @returns Penetrating hits, glancing hits, and game events
 */
export function resolveArmourPenetration(
  hits: HitResult[],
  armourValue: number,
  facing: VehicleFacing,
  dice: DiceProvider,
): ArmourPenetrationResult {
  const penetratingHits: PenetratingHitResult[] = [];
  const glancingHits: GlancingHit[] = [];
  const allRolls: number[] = [];
  let penetratingCount = 0;
  let glancingCount = 0;
  let missCount = 0;

  // Track representative strength for the event
  const representativeStrength = hits.length > 0 ? hits[0].weaponStrength : 0;

  for (const hit of hits) {
    const specialRules = hit.specialRules;
    const weaponStrength = hit.weaponStrength;
    const weaponDamage = hit.weaponDamage;

    const hasArmourbane = hasRule(specialRules, 'Armourbane');
    const hasSunder = hasRule(specialRules, 'Sunder');

    // Roll d6 for armour penetration
    let roll = dice.rollD6();
    allRolls.push(roll);
    let total = roll + weaponStrength;

    // Sunder: re-roll failed armour penetration rolls (total < AV)
    if (hasSunder && total < armourValue) {
      roll = dice.rollD6();
      allRolls.push(roll);
      total = roll + weaponStrength;
    }

    if (total > armourValue) {
      // Penetrating hit
      penetratingHits.push({
        diceRoll: roll,
        strength: weaponStrength,
        total,
        armourValue,
        facing,
        isPenetrating: true,
        damage: weaponDamage,
        specialRules: [...specialRules],
      });
      penetratingCount++;
    } else if (total === armourValue) {
      if (hasArmourbane) {
        // Armourbane: glancing hits count as penetrating
        penetratingHits.push({
          diceRoll: roll,
          strength: weaponStrength,
          total,
          armourValue,
          facing,
          isPenetrating: true,
          damage: weaponDamage,
          specialRules: [...specialRules],
        });
        penetratingCount++;
      } else {
        // Glancing hit — set aside for Vehicle Damage Table in Step 11
        // Note: glancingHits need vehicleModelId and vehicleUnitId,
        // which are not available from the hit itself. The caller must
        // fill these in. We use empty strings as placeholders that the
        // pipeline orchestrator will populate.
        glancingHits.push({
          facing,
          vehicleModelId: '', // Caller must fill in
          vehicleUnitId: '', // Caller must fill in
        });
        glancingCount++;
      }
    } else {
      // Miss (total < AV) — discard
      missCount++;
    }
  }

  // Build event
  const events: GameEvent[] = [
    {
      type: 'armourPenetrationRoll',
      fireGroupIndex: 0, // Caller should update this if needed
      rolls: allRolls,
      strength: representativeStrength,
      armourValue,
      facing,
      penetrating: penetratingCount,
      glancing: glancingCount,
      misses: missCount,
    } as ArmourPenetrationRollEvent,
  ];

  return { penetratingHits, glancingHits, events };
}
