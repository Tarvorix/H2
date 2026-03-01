/**
 * Hit Resolution — Shooting Pipeline Step 6
 * Reference: HH_Rules_Battle.md — Step 6: Make Hit Tests
 * Reference: HH_Principles.md — Ranged Hit Table, Snap Shots, Critical Hits, Precision, Rending
 *
 * Resolves all hit tests for a fire group:
 * 1. Calculate total dice to roll (sum of firepower across all attacks)
 * 2. Get target number from rangedHitTable or snapShotTable
 * 3. Handle auto-hit (BS10+), auto-fail (BS1 snap shots)
 * 4. Roll dice, compare to target number
 * 5. Determine critical, precision, rending status on each hit
 * 6. Process Gets Hot (natural 1s wound firing model)
 */

import type { SpecialRuleRef } from '@hh/types';
import type { DiceProvider, GameEvent, GetsHotEvent } from '../types';
import type { FireGroup, HitResult } from './shooting-types';
import { rangedHitTable, snapShotTable } from '../tables';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of resolving all hit tests for a fire group.
 */
export interface FireGroupHitResolutionResult {
  /** All hit results (both hits and misses) */
  hits: HitResult[];
  /** Events emitted during resolution */
  events: GameEvent[];
}

/**
 * Result of processing Gets Hot for a fire group.
 */
export interface GetsHotResolutionResult {
  /** Gets Hot events emitted (one per affected model) */
  getsHotEvents: GetsHotEvent[];
  /** Wounds distributed to models from Gets Hot */
  modelWounds: { modelId: string; wounds: number }[];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Extract a numeric value from a special rule like "Precision (4+)" or "Rending (6+)".
 * Looks up the rule by name in the special rules array and parses the value string.
 *
 * @param specialRules - Array of special rule references on the weapon
 * @param ruleName - Name of the rule to look up (case-insensitive)
 * @returns The parsed numeric threshold, or null if the rule is not present or has no value
 *
 * Examples:
 *   getSpecialRuleValue([{ name: "Precision", value: "4+" }], "Precision") → 4
 *   getSpecialRuleValue([{ name: "Rending", value: "6+" }], "Rending") → 6
 *   getSpecialRuleValue([{ name: "Rapid Fire" }], "Precision") → null
 */
export function getSpecialRuleValue(
  specialRules: SpecialRuleRef[],
  ruleName: string,
): number | null {
  const rule = specialRules.find(
    (r) => r.name.toLowerCase() === ruleName.toLowerCase(),
  );
  if (!rule || rule.value === undefined || rule.value === null) {
    return null;
  }

  // Strip whitespace, then trailing '+', then validate as purely numeric
  // Handles: "4+", "6+", "4", "6", " 4+ "
  // Rejects values like '3"' (Blast size) that contain non-numeric characters
  const trimmed = rule.value.trim();
  const stripped = trimmed.replace(/\+$/, '');

  // Ensure the remaining value is purely numeric (digits only)
  if (!/^\d+$/.test(stripped)) {
    return null;
  }

  return parseInt(stripped, 10);
}

/**
 * Check if a special rule is present by name (case-insensitive).
 *
 * @param specialRules - Array of special rule references
 * @param ruleName - Name to search for
 * @returns true if the rule is found
 */
function hasSpecialRule(
  specialRules: SpecialRuleRef[],
  ruleName: string,
): boolean {
  return specialRules.some(
    (r) => r.name.toLowerCase() === ruleName.toLowerCase(),
  );
}

// ─── Hit Resolution ─────────────────────────────────────────────────────────

/**
 * Build the mapping from roll index to the attack (model) that contributed it.
 * Each attack contributes `firepower` number of dice, so we expand the attacks
 * array into a flat list matching the dice indices.
 *
 * @param fireGroup - The fire group to build the roll-to-attack mapping for
 * @returns Array of attack indices, one per die roll
 */
function buildRollToAttackMapping(fireGroup: FireGroup): number[] {
  const mapping: number[] = [];
  for (let attackIdx = 0; attackIdx < fireGroup.attacks.length; attackIdx++) {
    const attack = fireGroup.attacks[attackIdx];
    for (let i = 0; i < attack.firepower; i++) {
      mapping.push(attackIdx);
    }
  }
  return mapping;
}

/**
 * Resolve all hit tests for a fire group.
 *
 * Reference: HH_Principles.md — Ranged Hit Table, Snap Shots
 * Reference: HH_Rules_Battle.md — Step 6: Make Hit Tests
 *
 * Process:
 * 1. Calculate total dice = sum of firepower across all attacks
 * 2. Look up target number from rangedHitTable(BS) or snapShotTable(BS) if snap shots
 * 3. Handle auto-hit (BS10+): all hits succeed, treated as natural 6
 * 4. Handle auto-fail (BS1 snap shots): all miss, no dice rolled
 * 5. Roll dice and compare each to target number
 * 6. For each successful hit, check for:
 *    - Critical: criticalOn is set and roll >= criticalOn
 *    - Precision: weapon has Precision(X) and roll >= X (NOT on snap shots, blast, template, barrage)
 *    - Rending: weapon has Rending(X) and roll >= X (before modifiers)
 *
 * @param fireGroup - The fire group to resolve hits for
 * @param dice - Dice provider for rolling
 * @returns Hit results and game events
 */
export function resolveFireGroupHits(
  fireGroup: FireGroup,
  dice: DiceProvider,
  hitModifier: number = 0,  // Legion tactica hit modifier (e.g., Imperial Fists +1 for Bolt/Auto with 5+ dice)
): FireGroupHitResolutionResult {
  const totalFirepower = fireGroup.totalFirepower;
  const bs = fireGroup.ballisticSkill;
  const isSnapShot = fireGroup.isSnapShot;
  const specialRules = fireGroup.specialRules;
  const weaponProfile = fireGroup.weaponProfile;

  // Look up hit table
  const hitTableResult = isSnapShot
    ? snapShotTable(bs)
    : rangedHitTable(bs);

  const { targetNumber, autoHit, autoFail, criticalOn } = hitTableResult;

  // Build the mapping from roll index → attack index
  const rollToAttack = buildRollToAttackMapping(fireGroup);

  // Extract special rule thresholds
  const precisionValue = getSpecialRuleValue(specialRules, 'Precision');
  const rendingValue = getSpecialRuleValue(specialRules, 'Rending');

  // Determine if precision can trigger
  // Precision cannot trigger on: snap shots, blast, template, barrage
  const hasBlast = hasSpecialRule(specialRules, 'Blast');
  const hasTemplate = weaponProfile.hasTemplate;
  const hasBarrage = hasSpecialRule(specialRules, 'Barrage');
  const precisionCanTrigger =
    precisionValue !== null &&
    !isSnapShot &&
    !hasBlast &&
    !hasTemplate &&
    !hasBarrage;

  // ─── Auto-fail: BS1 snap shots ─────────────────────────────────────────
  if (autoFail) {
    // All attacks automatically miss — no dice rolled
    const hits: HitResult[] = [];
    for (let i = 0; i < totalFirepower; i++) {
      const attackIdx = rollToAttack[i];
      const attack = fireGroup.attacks[attackIdx];
      hits.push({
        diceRoll: 0,
        targetNumber,
        isHit: false,
        isCritical: false,
        isPrecision: false,
        isRending: false,
        isAutoHit: false,
        sourceModelId: attack.modelId,
        weaponStrength: weaponProfile.rangedStrength,
        weaponAP: weaponProfile.ap,
        weaponDamage: weaponProfile.damage,
        specialRules: [...weaponProfile.specialRules],
      });
    }

    const events: GameEvent[] = [
      {
        type: 'hitTestRoll',
        fireGroupIndex: fireGroup.index,
        rolls: [],
        targetNumber,
        isSnapShot,
        hits: 0,
        misses: totalFirepower,
        criticals: 0,
        precisionHits: 0,
        rendingHits: 0,
      },
    ];

    return { hits, events };
  }

  // ─── Auto-hit: BS10+ ──────────────────────────────────────────────────
  if (autoHit) {
    // All attacks automatically hit — count as natural 6
    const hits: HitResult[] = [];
    for (let i = 0; i < totalFirepower; i++) {
      const attackIdx = rollToAttack[i];
      const attack = fireGroup.attacks[attackIdx];

      // Auto-hits count as natural 6 for purposes of special rules
      const effectiveRoll = 6;

      const isPrecision = precisionCanTrigger && effectiveRoll >= precisionValue!;
      const isRending = rendingValue !== null && effectiveRoll >= rendingValue;

      hits.push({
        diceRoll: effectiveRoll,
        targetNumber,
        isHit: true,
        isCritical: false, // Auto-hits don't have critical (BS10+ has no criticalOn)
        isPrecision,
        isRending,
        isAutoHit: true,
        sourceModelId: attack.modelId,
        weaponStrength: weaponProfile.rangedStrength,
        weaponAP: weaponProfile.ap,
        weaponDamage: weaponProfile.damage,
        specialRules: [...weaponProfile.specialRules],
      });
    }

    const precisionCount = hits.filter((h) => h.isPrecision).length;
    const rendingCount = hits.filter((h) => h.isRending).length;

    const events: GameEvent[] = [
      {
        type: 'hitTestRoll',
        fireGroupIndex: fireGroup.index,
        rolls: hits.map((h) => h.diceRoll),
        targetNumber,
        isSnapShot,
        hits: totalFirepower,
        misses: 0,
        criticals: 0,
        precisionHits: precisionCount,
        rendingHits: rendingCount,
      },
    ];

    return { hits, events };
  }

  // ─── Normal resolution: roll dice ──────────────────────────────────────

  // Apply legion tactica hit modifier (positive = easier to hit)
  const effectiveTargetNumber = Math.max(2, Math.min(6, targetNumber - hitModifier));

  const rolls = dice.rollMultipleD6(totalFirepower);
  const hits: HitResult[] = [];

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const attackIdx = rollToAttack[i];
    const attack = fireGroup.attacks[attackIdx];

    const isHit = roll >= effectiveTargetNumber;

    // Critical: only if the hit table provides a criticalOn threshold and roll meets it
    // Critical also requires the roll to be a hit
    const isCritical = isHit && criticalOn !== null && roll >= criticalOn;

    // Precision: only on successful hits, not snap shots/blast/template/barrage
    const isPrecision = isHit && precisionCanTrigger && roll >= precisionValue!;

    // Rending: only on successful hits, natural roll >= Rending(X) threshold
    const isRending = isHit && rendingValue !== null && roll >= rendingValue;

    hits.push({
      diceRoll: roll,
      targetNumber,
      isHit,
      isCritical,
      isPrecision,
      isRending,
      isAutoHit: false,
      sourceModelId: attack.modelId,
      weaponStrength: weaponProfile.rangedStrength,
      weaponAP: weaponProfile.ap,
      weaponDamage: weaponProfile.damage,
      specialRules: [...weaponProfile.specialRules],
    });
  }

  const successfulHits = hits.filter((h) => h.isHit);
  const criticalCount = successfulHits.filter((h) => h.isCritical).length;
  const precisionCount = successfulHits.filter((h) => h.isPrecision).length;
  const rendingCount = successfulHits.filter((h) => h.isRending).length;

  const events: GameEvent[] = [
    {
      type: 'hitTestRoll',
      fireGroupIndex: fireGroup.index,
      rolls,
      targetNumber,
      isSnapShot,
      hits: successfulHits.length,
      misses: totalFirepower - successfulHits.length,
      criticals: criticalCount,
      precisionHits: precisionCount,
      rendingHits: rendingCount,
    },
  ];

  return { hits, events };
}

// ─── Gets Hot Processing ────────────────────────────────────────────────────

/**
 * Process the "Gets Hot" special rule for a fire group.
 *
 * Reference: HH_Armoury.md — Gets Hot
 * Every natural 1 on a hit test causes 1 wound to the firing model.
 * The wound is applied to the model that fired the shot that produced the natural 1.
 *
 * @param fireGroup - The fire group being resolved
 * @param hitResults - The full array of hit results (including misses)
 * @param _dice - Dice provider (reserved for future wound resolution if needed)
 * @returns Gets Hot events and wound distribution per model
 */
export function processGetsHot(
  fireGroup: FireGroup,
  hitResults: HitResult[],
  _dice: DiceProvider,
): GetsHotResolutionResult {
  const specialRules = fireGroup.specialRules;

  // Only process if the weapon has Gets Hot
  if (!hasSpecialRule(specialRules, 'Gets Hot')) {
    return { getsHotEvents: [], modelWounds: [] };
  }

  // Build the mapping from roll index → attack index
  const rollToAttack = buildRollToAttackMapping(fireGroup);

  // Count natural 1s per model
  const woundsPerModel: Map<string, number> = new Map();

  for (let i = 0; i < hitResults.length; i++) {
    const hitResult = hitResults[i];
    // Natural 1 triggers Gets Hot (auto-fail rolls with diceRoll=0 don't count)
    if (hitResult.diceRoll === 1) {
      const attackIdx = rollToAttack[i];
      const attack = fireGroup.attacks[attackIdx];
      const modelId = attack.modelId;
      const current = woundsPerModel.get(modelId) ?? 0;
      woundsPerModel.set(modelId, current + 1);
    }
  }

  // Build results
  const getsHotEvents: GetsHotEvent[] = [];
  const modelWounds: { modelId: string; wounds: number }[] = [];

  for (const [modelId, wounds] of woundsPerModel) {
    modelWounds.push({ modelId, wounds });
    getsHotEvents.push({
      type: 'getsHot',
      modelId,
      unitId: '', // Unit ID is not directly available from fire group; caller should fill in
      woundsCaused: wounds,
    });
  }

  return { getsHotEvents, modelWounds };
}
