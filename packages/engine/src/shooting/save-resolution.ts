/**
 * Save Resolution — Shooting Pipeline Step 9
 * Reference: HH_Rules_Battle.md — Step 9: Saving Throws
 * Reference: HH_Principles.md — Armour Saves, Invulnerable Saves, Cover Saves
 *
 * Resolves saving throws for each wound allocated to a model:
 * 1. Determine available saves:
 *    - Armour Save: roll d6 >= modelSave. BLOCKED if wound's AP value <= modelSave numerically.
 *      (AP 2 blocks saves of 2+, 3+, 4+, 5+, 6+. AP null means armour always works.)
 *    - Invulnerable Save: roll d6 >= modelInvuln. NOT affected by AP.
 *    - Cover Save: roll d6 >= coverSave. NOT affected by AP. Not available in melee.
 * 2. Only ONE save per wound — auto-select the best available (lowest target number).
 * 3. Roll d6 and compare to the selected save's target number.
 */

import type { DiceProvider, GameEvent, SavingThrowRollEvent } from '../types';
import type { WoundResult, SaveResult, AvailableSave } from './shooting-types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of resolving saving throws for a set of wounds.
 */
export interface SaveResolutionResult {
  /** All save attempt results */
  saveResults: SaveResult[];
  /** Wounds that were NOT saved (failed saves or no save available) */
  unsavedWounds: WoundResult[];
  /** Events emitted during resolution */
  events: GameEvent[];
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Determine if an armour save is blocked by a weapon's AP value.
 *
 * AP blocks the armour save if the AP value is numerically equal to or lower than
 * the model's save value. For example:
 * - AP 2 blocks saves of 2+, 3+, 4+, 5+, 6+ (AP <= Save)
 * - AP 5 blocks saves of 5+, 6+ only
 * - AP null ('-') means no AP, so armour save is always available
 *
 * @param ap - The wound's AP value (number or null)
 * @param modelSave - The model's armour save target number (e.g., 3 for 3+)
 * @returns true if the armour save is blocked
 */
function isArmourSaveBlocked(ap: number | null, modelSave: number): boolean {
  // AP null ('-') means the weapon has no AP, armour always works
  if (ap === null) {
    return false;
  }
  // AP value numerically <= modelSave means the save is blocked
  // AP 2 blocks 2+, 3+, 4+, 5+, 6+ (because 2 <= 2, 2 <= 3, etc.)
  // AP 5 blocks 5+, 6+ (because 5 <= 5, 5 <= 6)
  return ap <= modelSave;
}

/**
 * Get all available saves for a wound against a specific model.
 *
 * @param modelSave - The model's armour save target number (e.g., 3 for 3+), or null if no save
 * @param modelInvuln - The model's invulnerable save target number, or null if none
 * @param coverSave - Cover save target number, or null if no cover
 * @param woundAP - The wound's AP value
 * @returns Array of available saves, sorted by target number (best first)
 */
function getAvailableSaves(
  modelSave: number | null,
  modelInvuln: number | null,
  coverSave: number | null,
  woundAP: number | null,
): AvailableSave[] {
  const saves: AvailableSave[] = [];

  // Armour Save — blocked if AP <= modelSave
  if (modelSave !== null && !isArmourSaveBlocked(woundAP, modelSave)) {
    saves.push({
      saveType: 'armour',
      targetNumber: modelSave,
      source: 'Armour Save',
    });
  }

  // Invulnerable Save — NOT affected by AP
  if (modelInvuln !== null) {
    saves.push({
      saveType: 'invulnerable',
      targetNumber: modelInvuln,
      source: 'Invulnerable Save',
    });
  }

  // Cover Save — NOT affected by AP, not available in melee (but this is shooting)
  if (coverSave !== null) {
    saves.push({
      saveType: 'cover',
      targetNumber: coverSave,
      source: 'Cover Save',
    });
  }

  // Sort by target number (lowest = best)
  saves.sort((a, b) => a.targetNumber - b.targetNumber);

  return saves;
}

// ─── Save Resolution ────────────────────────────────────────────────────────

/**
 * Resolve saving throws for a set of wounds allocated to a model.
 *
 * Reference: HH_Rules_Battle.md — Step 9: Saving Throws
 *
 * For each wound:
 * 1. Determine available saves based on model characteristics and wound AP
 * 2. Auto-select the best available save (lowest target number)
 * 3. Roll d6 — if roll >= target number, save is passed (wound negated)
 * 4. If no save is available, the wound automatically goes through
 *
 * Only ONE save attempt per wound. The best save is automatically selected.
 *
 * @param modelSave - The model's armour save target number (e.g., 3 for 3+), or null if no save
 * @param modelInvuln - The model's invulnerable save target number, or null if none
 * @param coverSave - Cover save target number, or null if no cover
 * @param wounds - Array of wound results to resolve saves for
 * @param dice - Dice provider for rolling
 * @returns Save results, unsaved wounds, and game events
 */
export function resolveSaves(
  modelSave: number | null,
  modelInvuln: number | null,
  coverSave: number | null,
  wounds: WoundResult[],
  dice: DiceProvider,
): SaveResolutionResult {
  const saveResults: SaveResult[] = [];
  const unsavedWounds: WoundResult[] = [];
  const events: GameEvent[] = [];

  for (const wound of wounds) {
    // Only process wounds that actually wounded
    if (!wound.isWound) {
      continue;
    }

    // Get available saves for this wound
    const availableSaves = getAvailableSaves(
      modelSave,
      modelInvuln,
      coverSave,
      wound.ap,
    );

    if (availableSaves.length === 0) {
      // No save available — wound goes through automatically
      unsavedWounds.push(wound);
      continue;
    }

    // Auto-select best save (first in sorted array = lowest target number)
    const bestSave = availableSaves[0];

    // Roll d6
    const roll = dice.rollD6();
    const passed = roll >= bestSave.targetNumber;

    // Record the save result
    const modelId = wound.assignedToModelId ?? '';
    saveResults.push({
      diceRoll: roll,
      targetNumber: bestSave.targetNumber,
      saveType: bestSave.saveType,
      passed,
      modelId,
    });

    // Emit event
    events.push({
      type: 'savingThrowRoll',
      modelId,
      saveType: bestSave.saveType as 'armour' | 'invulnerable' | 'cover',
      roll,
      targetNumber: bestSave.targetNumber,
      passed,
      weaponAP: wound.ap,
    } as SavingThrowRollEvent);

    if (!passed) {
      // Failed save — wound goes through
      unsavedWounds.push(wound);
    }
  }

  return { saveResults, unsavedWounds, events };
}
