/**
 * Wound Resolution Tests
 * Reference: HH_Rules_Battle.md — Step 7: Resolve Wound Tests
 */

import { describe, it, expect } from 'vitest';
import { FixedDiceProvider } from '../dice';
import { resolveWoundTests, getMajorityToughness } from './wound-resolution';
import type { HitResult } from './shooting-types';

// ─── Helper: Create a basic hit result ──────────────────────────────────────

function makeHit(overrides: Partial<HitResult> = {}): HitResult {
  return {
    diceRoll: 4,
    targetNumber: 4,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    isAutoHit: false,
    sourceModelId: 'model-1',
    weaponStrength: 4,
    weaponAP: 5,
    weaponDamage: 1,
    specialRules: [],
    ...overrides,
  };
}

// ─── getMajorityToughness ───────────────────────────────────────────────────

describe('getMajorityToughness', () => {
  it('should return the single toughness value when all models have the same T', () => {
    expect(getMajorityToughness([4, 4, 4, 4, 4])).toBe(4);
  });

  it('should return the most common toughness value', () => {
    // Three T4, two T5 → T4 is majority
    expect(getMajorityToughness([4, 4, 4, 5, 5])).toBe(4);
  });

  it('should return the highest value on a tie', () => {
    // Two T4, two T5 → tie, highest wins → T5
    expect(getMajorityToughness([4, 4, 5, 5])).toBe(5);
  });

  it('should handle a single model', () => {
    expect(getMajorityToughness([6])).toBe(6);
  });

  it('should throw on empty array', () => {
    expect(() => getMajorityToughness([])).toThrow('Cannot determine majority toughness from empty array');
  });
});

// ─── resolveWoundTests ──────────────────────────────────────────────────────

describe('resolveWoundTests', () => {
  it('S4 vs T4 wounds on 4+: rolls [4,5,3,2,6,1] produces 3 wounds and 3 failures', () => {
    // S4 vs T4 → wound on 4+ from wound table
    const hits = [
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
    ];

    const dice = new FixedDiceProvider([4, 5, 3, 2, 6, 1]);
    const result = resolveWoundTests(hits, 4, dice);

    // Rolls: 4 (wound), 5 (wound), 3 (fail), 2 (fail), 6 (wound), 1 (fail)
    const wounds = result.wounds.filter((w) => w.isWound);
    const failures = result.wounds.filter((w) => !w.isWound);

    expect(wounds).toHaveLength(3);
    expect(failures).toHaveLength(3);

    // Verify specific rolls
    expect(result.wounds[0].diceRoll).toBe(4);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[1].diceRoll).toBe(5);
    expect(result.wounds[1].isWound).toBe(true);
    expect(result.wounds[2].diceRoll).toBe(3);
    expect(result.wounds[2].isWound).toBe(false);
    expect(result.wounds[3].diceRoll).toBe(2);
    expect(result.wounds[3].isWound).toBe(false);
    expect(result.wounds[4].diceRoll).toBe(6);
    expect(result.wounds[4].isWound).toBe(true);
    expect(result.wounds[5].diceRoll).toBe(1);
    expect(result.wounds[5].isWound).toBe(false);
  });

  it('Rending hit auto-wounds regardless of S/T', () => {
    const hits = [
      makeHit({
        weaponStrength: 3,
        isRending: true,
        specialRules: [{ name: 'Rending', value: '6+' }],
      }),
    ];

    // No dice should be consumed for rending auto-wound
    const dice = new FixedDiceProvider([]);
    const result = resolveWoundTests(hits, 8, dice);

    expect(result.wounds).toHaveLength(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isRendingWound).toBe(true);
    expect(result.wounds[0].diceRoll).toBe(-1); // Auto-wound indicator
    expect(dice.rollsUsed).toBe(0); // No dice consumed
  });

  it('Critical hit auto-wounds with +1 extra damage', () => {
    const hits = [
      makeHit({
        weaponStrength: 4,
        weaponDamage: 1,
        isCritical: true,
      }),
    ];

    // No dice should be consumed for critical auto-wound
    const dice = new FixedDiceProvider([]);
    const result = resolveWoundTests(hits, 4, dice);

    expect(result.wounds).toHaveLength(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isCriticalWound).toBe(true);
    expect(result.wounds[0].damage).toBe(2); // Base 1 + 1 critical = 2
    expect(result.wounds[0].diceRoll).toBe(-1); // Auto-wound indicator
    expect(dice.rollsUsed).toBe(0); // No dice consumed
  });

  it('Poisoned(4+): S3 vs T5 (normally impossible), rolls [4,3,6] where 4 and 6 wound via poisoned', () => {
    // S3 vs T5 → wound table returns 6+ (normally very hard)
    // But Poisoned(4+) means roll >= 4 wounds regardless
    const hits = [
      makeHit({
        weaponStrength: 3,
        specialRules: [{ name: 'Poisoned', value: '4+' }],
      }),
      makeHit({
        weaponStrength: 3,
        specialRules: [{ name: 'Poisoned', value: '4+' }],
      }),
      makeHit({
        weaponStrength: 3,
        specialRules: [{ name: 'Poisoned', value: '4+' }],
      }),
    ];

    const dice = new FixedDiceProvider([4, 3, 6]);
    const result = resolveWoundTests(hits, 5, dice);

    // Roll 4 → >= 4 (Poisoned triggers) → wound
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isPoisoned).toBe(true);

    // Roll 3 → < 4 (Poisoned doesn't trigger), S3 vs T5 needs 6+ → 3 fails
    expect(result.wounds[1].isWound).toBe(false);
    expect(result.wounds[1].isPoisoned).toBe(false);

    // Roll 6 → >= 4 (Poisoned triggers) → wound
    expect(result.wounds[2].isWound).toBe(true);
    expect(result.wounds[2].isPoisoned).toBe(true);
  });

  it('Breaching(4+): wound roll of 5 forces AP to become 2', () => {
    const hits = [
      makeHit({
        weaponStrength: 4,
        weaponAP: 5,
        specialRules: [{ name: 'Breaching', value: '4+' }],
      }),
    ];

    // Roll 5 → wounds (4+ vs T4), and 5 >= 4 so Breaching triggers
    const dice = new FixedDiceProvider([5]);
    const result = resolveWoundTests(hits, 4, dice);

    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isBreaching).toBe(true);
    expect(result.wounds[0].ap).toBe(2); // AP forced to 2
  });

  it('Shred(6+): wound roll of 6 gives +1 damage', () => {
    const hits = [
      makeHit({
        weaponStrength: 4,
        weaponDamage: 1,
        specialRules: [{ name: 'Shred', value: '6+' }],
      }),
    ];

    // Roll 6 → wounds (4+ vs T4), and 6 >= 6 so Shred triggers
    const dice = new FixedDiceProvider([6]);
    const result = resolveWoundTests(hits, 4, dice);

    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isShred).toBe(true);
    expect(result.wounds[0].damage).toBe(2); // Base 1 + 1 shred = 2
  });

  it('Impossible wound (S3 vs T7) with no Poisoned: all fail', () => {
    // S3 vs T7 → wound table returns null (impossible, difference of -4)
    const hits = [
      makeHit({ weaponStrength: 3 }),
      makeHit({ weaponStrength: 3 }),
      makeHit({ weaponStrength: 3 }),
    ];

    const dice = new FixedDiceProvider([6, 6, 6]);
    const result = resolveWoundTests(hits, 7, dice);

    // Even rolling 6s, wound is impossible
    expect(result.wounds[0].isWound).toBe(false);
    expect(result.wounds[0].targetNumber).toBe(7); // Impossible (7+ on d6)
    expect(result.wounds[1].isWound).toBe(false);
    expect(result.wounds[2].isWound).toBe(false);
  });

  it('emits a WoundTestRollEvent', () => {
    const hits = [makeHit({ weaponStrength: 4 })];
    const dice = new FixedDiceProvider([4]);
    const result = resolveWoundTests(hits, 4, dice);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'woundTestRoll',
      strength: 4,
      toughness: 4,
    });
  });
});
