/**
 * Save Resolution Tests
 * Reference: HH_Rules_Battle.md — Step 9: Saving Throws
 */

import { describe, it, expect } from 'vitest';
import { FixedDiceProvider } from '../dice';
import { resolveSaves } from './save-resolution';
import type { WoundResult } from './shooting-types';

// ─── Helper: Create a basic wound result ────────────────────────────────────

function makeWound(overrides: Partial<WoundResult> = {}): WoundResult {
  return {
    diceRoll: 4,
    targetNumber: 4,
    isWound: true,
    strength: 4,
    ap: null,
    damage: 1,
    isBreaching: false,
    isShred: false,
    isPoisoned: false,
    isCriticalWound: false,
    isRendingWound: false,
    isPrecision: false,
    specialRules: [],
    ...overrides,
  };
}

// ─── resolveSaves ───────────────────────────────────────────────────────────

describe('resolveSaves', () => {
  it('Sv3+ vs AP5 wound: armour save available (AP5 does not block 3+), saves on 3+', () => {
    // AP 5 blocks saves of 5+ and 6+ only (AP <= Save).
    // AP 5 vs Sv3+: 5 > 3, so armour save is NOT blocked.
    // Wait — the rule is: AP blocks if AP value <= modelSave.
    // AP 5, modelSave 3: 5 <= 3 is FALSE, so armour save is AVAILABLE.
    const wounds = [makeWound({ ap: 5 })];

    // Roll 3 → saves on 3+ → save passed
    const dice = new FixedDiceProvider([3]);
    const result = resolveSaves(3, null, null, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('armour');
    expect(result.saveResults[0].targetNumber).toBe(3);
    expect(result.saveResults[0].passed).toBe(true);
    expect(result.unsavedWounds).toHaveLength(0);
  });

  it('Sv3+ vs AP2 wound: no armour save available (AP2 blocks 3+)', () => {
    // AP 2 vs Sv3+: 2 <= 3 is TRUE, so armour save is BLOCKED.
    // No invuln or cover, so wound goes through automatically.
    const wounds = [makeWound({ ap: 2 })];

    const dice = new FixedDiceProvider([]);
    const result = resolveSaves(3, null, null, wounds, dice);

    expect(result.saveResults).toHaveLength(0); // No save attempt
    expect(result.unsavedWounds).toHaveLength(1); // Wound goes through
    expect(dice.rollsUsed).toBe(0); // No dice rolled
  });

  it('Invulnerable 5+ vs AP1: invulnerable NOT affected by AP, saves on 5+', () => {
    // AP 1 blocks armour save of 3+: 1 <= 3 is TRUE.
    // But invulnerable save 5+ is NOT affected by AP.
    const wounds = [makeWound({ ap: 1 })];

    // Roll 5 → saves on 5+ → save passed
    const dice = new FixedDiceProvider([5]);
    const result = resolveSaves(3, 5, null, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('invulnerable');
    expect(result.saveResults[0].targetNumber).toBe(5);
    expect(result.saveResults[0].passed).toBe(true);
    expect(result.unsavedWounds).toHaveLength(0);
  });

  it('Cover 4+ save available: saves on 4+', () => {
    // No armour save (null), no invuln, but cover 4+
    const wounds = [makeWound({ ap: 2 })];

    // Roll 4 → saves on 4+ → save passed
    const dice = new FixedDiceProvider([4]);
    const result = resolveSaves(null, null, 4, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('cover');
    expect(result.saveResults[0].targetNumber).toBe(4);
    expect(result.saveResults[0].passed).toBe(true);
    expect(result.unsavedWounds).toHaveLength(0);
  });

  it('Best save auto-selected: Sv3+ available and Inv5+ available, uses Sv3+ (better)', () => {
    // AP null means armour save always available
    // Sv3+ (target 3) vs Inv5+ (target 5) → 3+ is better
    const wounds = [makeWound({ ap: null })];

    // Roll 3 → saves on 3+ → save passed
    const dice = new FixedDiceProvider([3]);
    const result = resolveSaves(3, 5, null, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('armour');
    expect(result.saveResults[0].targetNumber).toBe(3);
    expect(result.saveResults[0].passed).toBe(true);
  });

  it('when armour is blocked by AP, falls back to invulnerable save', () => {
    // AP 2 blocks Sv3+ (2 <= 3), so falls back to Inv5+
    const wounds = [makeWound({ ap: 2 })];

    // Roll 4 → fails 5+ invuln → wound goes through
    const dice = new FixedDiceProvider([4]);
    const result = resolveSaves(3, 5, null, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('invulnerable');
    expect(result.saveResults[0].targetNumber).toBe(5);
    expect(result.saveResults[0].passed).toBe(false);
    expect(result.unsavedWounds).toHaveLength(1);
  });

  it('no saves available at all: wound passes through automatically', () => {
    // AP 1, no armour (null), no invuln, no cover
    const wounds = [makeWound({ ap: 1 })];

    const dice = new FixedDiceProvider([]);
    const result = resolveSaves(null, null, null, wounds, dice);

    expect(result.saveResults).toHaveLength(0);
    expect(result.unsavedWounds).toHaveLength(1);
    expect(dice.rollsUsed).toBe(0);
  });

  it('failed save: wound goes to unsavedWounds', () => {
    // AP null, Sv3+, roll 2 → fails 3+
    const wounds = [makeWound({ ap: null })];

    const dice = new FixedDiceProvider([2]);
    const result = resolveSaves(3, null, null, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].passed).toBe(false);
    expect(result.unsavedWounds).toHaveLength(1);
  });

  it('multiple wounds resolved independently', () => {
    const wounds = [
      makeWound({ ap: null }),
      makeWound({ ap: null }),
      makeWound({ ap: null }),
    ];

    // Roll 3 → pass, Roll 1 → fail, Roll 5 → pass
    const dice = new FixedDiceProvider([3, 1, 5]);
    const result = resolveSaves(3, null, null, wounds, dice);

    expect(result.saveResults).toHaveLength(3);
    expect(result.saveResults[0].passed).toBe(true);
    expect(result.saveResults[1].passed).toBe(false);
    expect(result.saveResults[2].passed).toBe(true);
    expect(result.unsavedWounds).toHaveLength(1);
  });

  it('selects cover save over invulnerable when cover is better', () => {
    // AP 2 blocks Sv3+ (2 <= 3), Inv5+ available, cover 4+ available
    // Cover 4+ is better than Inv5+, so cover should be selected
    const wounds = [makeWound({ ap: 2 })];

    const dice = new FixedDiceProvider([4]);
    const result = resolveSaves(3, 5, 4, wounds, dice);

    expect(result.saveResults).toHaveLength(1);
    expect(result.saveResults[0].saveType).toBe('cover');
    expect(result.saveResults[0].targetNumber).toBe(4);
    expect(result.saveResults[0].passed).toBe(true);
  });

  it('emits SavingThrowRollEvent for each save attempt', () => {
    const wounds = [makeWound({ ap: null })];
    const dice = new FixedDiceProvider([3]);
    const result = resolveSaves(3, null, null, wounds, dice);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'savingThrowRoll',
      saveType: 'armour',
      roll: 3,
      targetNumber: 3,
      passed: true,
    });
  });
});
