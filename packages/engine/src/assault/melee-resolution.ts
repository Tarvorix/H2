/**
 * Melee Resolution Pipeline
 * Implements melee-specific hit/wound/save/damage resolution.
 * Reuses the shooting pipeline patterns where possible.
 *
 * Key differences from shooting:
 * - Hit tests use meleeHitTable(attackerWS, defenderWS) instead of BS
 * - No Cover saves in melee
 * - Vehicles always use rear armour
 * - Precision hits on natural 6
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase
 * Reference: HH_Principles.md — Melee Hit Tests, Wound Tests
 * Reference: HH_Tables.md — Melee Hit Table, Wound Table
 */

import type { DiceProvider } from '../types';
import { meleeHitTable, woundTable } from '../tables';
import type { MeleeHitResult, MeleeWoundResult, MeleeStrikeGroup } from './assault-types';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of resolving all melee hits for a strike group.
 */
export interface MeleeHitTestResult {
  /** All hit test results */
  hits: MeleeHitResult[];
  /** Number of successful hits */
  totalHits: number;
  /** Number of critical hits */
  criticalHits: number;
  /** Number of rending hits */
  rendingHits: number;
  /** Number of precision hits */
  precisionHits: number;
}

/**
 * Result of resolving all melee wounds for a set of hits.
 */
export interface MeleeWoundTestResult {
  /** All wound test results */
  wounds: MeleeWoundResult[];
  /** Number of successful wounds */
  totalWounds: number;
  /** Number of breaching wounds */
  breachingWounds: number;
}

/**
 * Result of resolving saves against melee wounds.
 */
export interface MeleeSaveResult {
  /** Number of unsaved wounds */
  unsavedWounds: number;
  /** Number of saved wounds */
  savedWounds: number;
  /** The wound results that failed saves (unsaved) */
  unsavedWoundResults: MeleeWoundResult[];
}

/**
 * Result of resolving melee damage.
 */
export interface MeleeDamageResult {
  /** Total wounds applied */
  totalWoundsApplied: number;
  /** Model IDs of casualties */
  casualties: string[];
}

// ─── Melee Hit Tests ────────────────────────────────────────────────────────

/**
 * Resolve melee hit tests for a strike group.
 * Uses meleeHitTable(attackerWS, defenderWS) to determine target number.
 *
 * Special rules processed on hit:
 * - Natural 6: always hits
 * - Natural 1: always misses
 * - Rending (X): hit roll >= X counts as auto-wound
 * - Critical Hit (X): hit roll >= X counts as auto-wound + bonus damage
 * - Precision: natural 6 allows choosing target model
 *
 * @param strikeGroup - The melee strike group with attack details
 * @param defenderMajorityWS - Majority WS of the defending unit
 * @param dice - Dice provider
 * @param rendingThreshold - Rending threshold (0 = no rending)
 * @param criticalThreshold - Critical Hit threshold (0 = no critical)
 * @returns MeleeHitTestResult
 */
export function resolveMeleeHitTests(
  strikeGroup: MeleeStrikeGroup,
  defenderMajorityWS: number,
  dice: DiceProvider,
  rendingThreshold: number = 0,
  criticalThreshold: number = 0,
): MeleeHitTestResult {
  const targetNumber = meleeHitTable(strikeGroup.weaponSkill, defenderMajorityWS);
  const hits: MeleeHitResult[] = [];
  let totalHits = 0;
  let criticalHits = 0;
  let rendingHits = 0;
  let precisionHits = 0;

  for (let i = 0; i < strikeGroup.totalAttacks; i++) {
    const roll = dice.rollD6();

    // Natural 1 always misses
    if (roll === 1) {
      hits.push(createHitResult(roll, targetNumber, false, false, false, false, strikeGroup));
      continue;
    }

    // Natural 6 always hits
    const isHit = roll === 6 || roll >= targetNumber;

    if (!isHit) {
      hits.push(createHitResult(roll, targetNumber, false, false, false, false, strikeGroup));
      continue;
    }

    // Check special hit properties
    const isCritical = criticalThreshold > 0 && roll >= criticalThreshold;
    const isRending = rendingThreshold > 0 && roll >= rendingThreshold;
    const isPrecision = roll === 6; // Natural 6 in melee

    hits.push(createHitResult(roll, targetNumber, true, isCritical, isRending, isPrecision, strikeGroup));

    totalHits++;
    if (isCritical) criticalHits++;
    if (isRending) rendingHits++;
    if (isPrecision) precisionHits++;
  }

  return { hits, totalHits, criticalHits, rendingHits, precisionHits };
}

// ─── Melee Wound Tests ──────────────────────────────────────────────────────

/**
 * Resolve melee wound tests for a set of hits.
 * Uses woundTable(strength, toughness) to determine target number.
 *
 * Special rules processed on wound:
 * - Rending hits: auto-wound (skip wound roll)
 * - Critical hits: auto-wound + bonus damage
 * - Poisoned (X): wound on X+ regardless of T
 * - Breaching (X): wound roll >= X, AP becomes 2
 * - Shred: re-roll failed wound tests
 * - Hatred: +1 to wound roll
 *
 * @param hits - Successful hit results
 * @param defenderToughness - Defender's Toughness value
 * @param dice - Dice provider
 * @param poisonedThreshold - Poisoned threshold (0 = not poisoned)
 * @param breachingThreshold - Breaching threshold (0 = no breaching)
 * @param hasShred - Whether to re-roll failed wounds
 * @param woundRollBonus - Bonus to wound roll (e.g., Hatred +1)
 * @returns MeleeWoundTestResult
 */
export function resolveMeleeWoundTests(
  hits: MeleeHitResult[],
  defenderToughness: number,
  dice: DiceProvider,
  poisonedThreshold: number = 0,
  breachingThreshold: number = 0,
  hasShred: boolean = false,
  woundRollBonus: number = 0,
): MeleeWoundTestResult {
  const wounds: MeleeWoundResult[] = [];
  let totalWounds = 0;
  let breachingWounds = 0;

  for (const hit of hits) {
    if (!hit.isHit) continue;

    // Rending and Critical auto-wound
    if (hit.isRending || hit.isCritical) {
      const wound = createAutoWound(hit, hit.isCritical);
      wounds.push(wound);
      totalWounds++;
      continue;
    }

    // Determine target number
    let target: number;
    if (poisonedThreshold > 0) {
      target = poisonedThreshold;
    } else {
      const tableResult = woundTable(hit.weaponStrength, defenderToughness);
      if (tableResult === null) {
        // Cannot wound (S too low vs T)
        wounds.push(createMissedWound(0, 7, hit));
        continue;
      }
      target = tableResult;
    }

    // Roll to wound
    let roll = dice.rollD6();
    let effectiveRoll = roll + woundRollBonus;

    // Natural 1 always fails
    if (roll === 1) {
      // Shred re-roll
      if (hasShred) {
        roll = dice.rollD6();
        effectiveRoll = roll + woundRollBonus;
        if (roll === 1 || effectiveRoll < target) {
          wounds.push(createMissedWound(roll, target, hit));
          continue;
        }
      } else {
        wounds.push(createMissedWound(roll, target, hit));
        continue;
      }
    } else if (effectiveRoll < target) {
      // Shred re-roll on failure
      if (hasShred) {
        roll = dice.rollD6();
        effectiveRoll = roll + woundRollBonus;
        if (roll === 1 || effectiveRoll < target) {
          wounds.push(createMissedWound(roll, target, hit));
          continue;
        }
      } else {
        wounds.push(createMissedWound(roll, target, hit));
        continue;
      }
    }

    // Wound succeeded
    let ap = hit.weaponAP;
    let isBreaching = false;

    // Check Breaching
    if (breachingThreshold > 0 && roll >= breachingThreshold) {
      ap = 2;
      isBreaching = true;
      breachingWounds++;
    }

    wounds.push({
      diceRoll: roll,
      targetNumber: target,
      isWound: true,
      strength: hit.weaponStrength,
      ap,
      damage: hit.weaponDamage,
      isBreaching,
      isShred: hasShred,
      isPoisoned: poisonedThreshold > 0,
      isCriticalWound: false,
      isRendingWound: false,
      isPrecision: hit.isPrecision,
      specialRules: hit.specialRules,
    });
    totalWounds++;
  }

  return { wounds, totalWounds, breachingWounds };
}

// ─── Melee Saves ────────────────────────────────────────────────────────────

/**
 * Resolve saving throws against melee wounds.
 * Key difference from shooting: NO Cover saves in melee.
 *
 * @param wounds - Wound results to save against
 * @param armorSave - Model's base armor save (e.g., 3 for 3+)
 * @param invulnerableSave - Model's invulnerable save (0 = none)
 * @param dice - Dice provider
 * @param feelNoPainThreshold - FNP threshold (0 = no FNP)
 * @returns MeleeSaveResult
 */
export function resolveMeleeSaves(
  wounds: MeleeWoundResult[],
  armorSave: number,
  invulnerableSave: number,
  dice: DiceProvider,
  feelNoPainThreshold: number = 0,
): MeleeSaveResult {
  let unsavedWounds = 0;
  let savedWounds = 0;
  const unsavedWoundResults: MeleeWoundResult[] = [];

  for (const wound of wounds) {
    if (!wound.isWound) continue;

    // Calculate effective armor save (modified by AP)
    let effectiveSave = armorSave;
    if (wound.ap !== null && wound.ap > 0) {
      effectiveSave = armorSave + wound.ap; // AP makes save harder
    }

    // Use the better of armor save or invulnerable save
    let bestSave = effectiveSave;
    if (invulnerableSave > 0 && invulnerableSave < effectiveSave) {
      bestSave = invulnerableSave;
    }

    // Roll save
    const saveRoll = dice.rollD6();
    const saved = bestSave <= 6 && saveRoll >= bestSave;

    if (saved) {
      savedWounds++;
      continue;
    }

    // Feel No Pain check
    if (feelNoPainThreshold > 0) {
      const fnpRoll = dice.rollD6();
      if (fnpRoll >= feelNoPainThreshold) {
        savedWounds++;
        continue;
      }
    }

    // Wound gets through
    unsavedWounds++;
    unsavedWoundResults.push(wound);
  }

  return { unsavedWounds, savedWounds, unsavedWoundResults };
}

// ─── Melee Damage ───────────────────────────────────────────────────────────

/**
 * Resolve melee damage application.
 * Applies unsaved wounds to target models.
 *
 * @param unsavedWounds - Wound results that passed through saves
 * @param targetModelWounds - Map of model ID → current wounds
 * @returns MeleeDamageResult
 */
export function resolveMeleeDamage(
  unsavedWounds: MeleeWoundResult[],
  targetModelWounds: Map<string, number>,
): MeleeDamageResult {
  let totalWoundsApplied = 0;
  const casualties: string[] = [];
  const remainingWounds = new Map(targetModelWounds);

  for (const wound of unsavedWounds) {
    // Find the target model (assigned or first available)
    const targetId = wound.assignedToModelId
      ?? findTargetModel(remainingWounds);

    if (!targetId) continue;

    const currentWounds = remainingWounds.get(targetId);
    if (currentWounds === undefined || currentWounds <= 0) continue;

    const damage = wound.damage;
    const newWounds = Math.max(0, currentWounds - damage);
    remainingWounds.set(targetId, newWounds);
    totalWoundsApplied += Math.min(damage, currentWounds);

    if (newWounds <= 0) {
      casualties.push(targetId);
    }
  }

  return { totalWoundsApplied, casualties };
}

// ─── Full Melee Pipeline ────────────────────────────────────────────────────

/**
 * Full melee resolution pipeline options.
 */
export interface MeleePipelineOptions {
  /** Defender's majority WS */
  defenderWS: number;
  /** Defender's majority Toughness */
  defenderToughness: number;
  /** Defender's armor save */
  armorSave: number;
  /** Defender's invulnerable save (0 = none) */
  invulnerableSave: number;
  /** Target model wounds map */
  targetModelWounds: Map<string, number>;
  /** Rending threshold (0 = none) */
  rendingThreshold?: number;
  /** Critical Hit threshold (0 = none) */
  criticalThreshold?: number;
  /** Poisoned threshold (0 = none) */
  poisonedThreshold?: number;
  /** Breaching threshold (0 = none) */
  breachingThreshold?: number;
  /** Has Shred */
  hasShred?: boolean;
  /** Wound roll bonus (Hatred) */
  woundRollBonus?: number;
  /** Feel No Pain threshold (0 = none) */
  feelNoPainThreshold?: number;
}

/**
 * Full melee resolution pipeline result.
 */
export interface MeleePipelineResult {
  /** Hit test results */
  hitResult: MeleeHitTestResult;
  /** Wound test results */
  woundResult: MeleeWoundTestResult;
  /** Save results */
  saveResult: MeleeSaveResult;
  /** Damage results */
  damageResult: MeleeDamageResult;
}

/**
 * Run the full melee resolution pipeline for a strike group.
 *
 * @param strikeGroup - The melee strike group
 * @param options - Pipeline options
 * @param dice - Dice provider
 * @returns Full pipeline result
 */
export function resolveMeleePipeline(
  strikeGroup: MeleeStrikeGroup,
  options: MeleePipelineOptions,
  dice: DiceProvider,
): MeleePipelineResult {
  // Step 1: Hit tests
  const hitResult = resolveMeleeHitTests(
    strikeGroup,
    options.defenderWS,
    dice,
    options.rendingThreshold ?? 0,
    options.criticalThreshold ?? 0,
  );

  // Step 2: Wound tests
  const successfulHits = hitResult.hits.filter(h => h.isHit);
  const woundResult = resolveMeleeWoundTests(
    successfulHits,
    options.defenderToughness,
    dice,
    options.poisonedThreshold ?? 0,
    options.breachingThreshold ?? 0,
    options.hasShred ?? false,
    options.woundRollBonus ?? 0,
  );

  // Step 3: Saves (no cover in melee)
  const successfulWounds = woundResult.wounds.filter(w => w.isWound);
  const saveResult = resolveMeleeSaves(
    successfulWounds,
    options.armorSave,
    options.invulnerableSave,
    dice,
    options.feelNoPainThreshold ?? 0,
  );

  // Step 4: Damage
  const damageResult = resolveMeleeDamage(
    saveResult.unsavedWoundResults,
    options.targetModelWounds,
  );

  return { hitResult, woundResult, saveResult, damageResult };
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create a melee hit result.
 */
function createHitResult(
  diceRoll: number,
  targetNumber: number,
  isHit: boolean,
  isCritical: boolean,
  isRending: boolean,
  isPrecision: boolean,
  strikeGroup: MeleeStrikeGroup,
): MeleeHitResult {
  return {
    diceRoll,
    targetNumber,
    isHit,
    isCritical,
    isPrecision,
    isRending,
    sourceModelId: strikeGroup.attackerModelIds[0] ?? '',
    weaponStrength: strikeGroup.weaponStrength,
    weaponAP: strikeGroup.weaponAP,
    weaponDamage: strikeGroup.weaponDamage,
    specialRules: strikeGroup.specialRules,
  };
}

/**
 * Create an auto-wound result (from Rending or Critical).
 */
function createAutoWound(hit: MeleeHitResult, isCritical: boolean): MeleeWoundResult {
  return {
    diceRoll: 0, // No wound roll needed
    targetNumber: 0,
    isWound: true,
    strength: hit.weaponStrength,
    ap: hit.weaponAP,
    damage: isCritical ? hit.weaponDamage + 1 : hit.weaponDamage,
    isBreaching: false,
    isShred: false,
    isPoisoned: false,
    isCriticalWound: isCritical,
    isRendingWound: hit.isRending && !isCritical,
    isPrecision: hit.isPrecision,
    specialRules: hit.specialRules,
  };
}

/**
 * Create a missed wound result.
 */
function createMissedWound(diceRoll: number, targetNumber: number, hit: MeleeHitResult): MeleeWoundResult {
  return {
    diceRoll,
    targetNumber,
    isWound: false,
    strength: hit.weaponStrength,
    ap: hit.weaponAP,
    damage: hit.weaponDamage,
    isBreaching: false,
    isShred: false,
    isPoisoned: false,
    isCriticalWound: false,
    isRendingWound: false,
    isPrecision: false,
    specialRules: hit.specialRules,
  };
}

/**
 * Find the next available target model (one with wounds remaining).
 * Prefers wounded models (fewer remaining wounds first).
 */
function findTargetModel(remainingWounds: Map<string, number>): string | null {
  let best: string | null = null;
  let bestWounds = Infinity;

  for (const [id, wounds] of remainingWounds) {
    if (wounds <= 0) continue;
    if (wounds < bestWounds) {
      bestWounds = wounds;
      best = id;
    }
  }

  return best;
}
