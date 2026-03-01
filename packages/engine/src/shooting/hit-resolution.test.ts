/**
 * Tests for Hit Resolution — Shooting Pipeline Step 6
 * Reference: HH_Rules_Battle.md — Step 6: Make Hit Tests
 * Reference: HH_Principles.md — Ranged Hit Table, Snap Shots, Critical, Precision, Rending, Gets Hot
 */

import { describe, it, expect } from 'vitest';
import { FixedDiceProvider } from '../dice';
import {
  resolveFireGroupHits,
  processGetsHot,
  getSpecialRuleValue,
} from './hit-resolution';
import type { FireGroup, ResolvedWeaponProfile, FireGroupAttack } from './shooting-types';
import type { SpecialRuleRef } from '@hh/types';
import type { HitTestRollEvent } from '../types';

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Create a minimal ResolvedWeaponProfile for testing.
 */
function makeWeaponProfile(overrides: Partial<ResolvedWeaponProfile> = {}): ResolvedWeaponProfile {
  return {
    id: 'test-weapon',
    name: 'Test Weapon',
    range: 24,
    hasTemplate: false,
    firepower: 1,
    rangedStrength: 4,
    ap: 5,
    damage: 1,
    specialRules: [],
    traits: [],
    ...overrides,
  };
}

/**
 * Create a minimal FireGroupAttack for testing.
 */
function makeAttack(overrides: Partial<FireGroupAttack> = {}): FireGroupAttack {
  return {
    modelId: 'model-1',
    firepower: 1,
    ballisticSkill: 4,
    weaponProfile: makeWeaponProfile(),
    isSnapShot: false,
    ...overrides,
  };
}

/**
 * Create a minimal FireGroup for testing.
 */
function makeFireGroup(overrides: Partial<FireGroup> = {}): FireGroup {
  const attacks = overrides.attacks ?? [makeAttack()];
  const weaponProfile = overrides.weaponProfile ?? makeWeaponProfile();
  const specialRules = overrides.specialRules ?? weaponProfile.specialRules;

  return {
    index: 0,
    weaponName: 'Test Weapon',
    ballisticSkill: 4,
    isSnapShot: false,
    attacks,
    totalFirepower: attacks.reduce((sum, a) => sum + a.firepower, 0),
    specialRules,
    traits: [],
    weaponProfile,
    hits: [],
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    isPrecisionGroup: false,
    isDeflagrateGroup: false,
    ...overrides,
  };
}

// ─── getSpecialRuleValue Tests ──────────────────────────────────────────────

describe('getSpecialRuleValue', () => {
  it('extracts numeric value from "4+" format', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Precision', value: '4+' }];
    expect(getSpecialRuleValue(rules, 'Precision')).toBe(4);
  });

  it('extracts numeric value from "6+" format', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Rending', value: '6+' }];
    expect(getSpecialRuleValue(rules, 'Rending')).toBe(6);
  });

  it('extracts numeric value without "+" suffix', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Rending', value: '5' }];
    expect(getSpecialRuleValue(rules, 'Rending')).toBe(5);
  });

  it('returns null when rule is not present', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Rapid Fire' }];
    expect(getSpecialRuleValue(rules, 'Precision')).toBeNull();
  });

  it('returns null when rule has no value', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Gets Hot' }];
    expect(getSpecialRuleValue(rules, 'Gets Hot')).toBeNull();
  });

  it('returns null for empty rules array', () => {
    expect(getSpecialRuleValue([], 'Precision')).toBeNull();
  });

  it('is case-insensitive for rule name lookup', () => {
    const rules: SpecialRuleRef[] = [{ name: 'precision', value: '4+' }];
    expect(getSpecialRuleValue(rules, 'Precision')).toBe(4);
  });

  it('returns null for non-numeric value', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Blast', value: '3"' }];
    expect(getSpecialRuleValue(rules, 'Blast')).toBeNull();
  });

  it('handles value with whitespace', () => {
    const rules: SpecialRuleRef[] = [{ name: 'Precision', value: ' 4+ ' }];
    expect(getSpecialRuleValue(rules, 'Precision')).toBe(4);
  });
});

// ─── BS4 Normal Hit Test ────────────────────────────────────────────────────

describe('resolveFireGroupHits — BS4 normal hit test', () => {
  it('rolls [3,4,5,2,1,6] at BS4 (3+): 4 hits (3,4,5,6), 2 misses (2,1)', () => {
    const dice = new FixedDiceProvider([3, 4, 5, 2, 1, 6]);

    // 6 models each with firepower 1
    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 6; i++) {
      attacks.push(makeAttack({
        modelId: `model-${i + 1}`,
        firepower: 1,
        ballisticSkill: 4,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      isSnapShot: false,
      attacks,
      totalFirepower: 6,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // Total 6 hit results
    expect(result.hits).toHaveLength(6);

    // Successful hits: rolls 3, 4, 5, 6 (>= 3)
    const successfulHits = result.hits.filter((h) => h.isHit);
    expect(successfulHits).toHaveLength(4);
    expect(successfulHits.map((h) => h.diceRoll).sort()).toEqual([3, 4, 5, 6]);

    // Misses: rolls 2, 1 (< 3)
    const misses = result.hits.filter((h) => !h.isHit);
    expect(misses).toHaveLength(2);
    expect(misses.map((h) => h.diceRoll).sort()).toEqual([1, 2]);

    // All hits have target number 3
    result.hits.forEach((h) => {
      expect(h.targetNumber).toBe(3);
    });

    // No critical, precision, or rending on standard BS4 weapon
    successfulHits.forEach((h) => {
      expect(h.isCritical).toBe(false);
      expect(h.isPrecision).toBe(false);
      expect(h.isRending).toBe(false);
      expect(h.isAutoHit).toBe(false);
    });

    // Event emitted
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as HitTestRollEvent;
    expect(event.type).toBe('hitTestRoll');
    expect(event.hits).toBe(4);
    expect(event.misses).toBe(2);
    expect(event.criticals).toBe(0);
    expect(event.precisionHits).toBe(0);
    expect(event.rendingHits).toBe(0);
    expect(event.targetNumber).toBe(3);
    expect(event.isSnapShot).toBe(false);
    expect(event.rolls).toEqual([3, 4, 5, 2, 1, 6]);
  });

  it('carries weapon strength, AP, and damage onto hit results', () => {
    const dice = new FixedDiceProvider([4]);
    const wp = makeWeaponProfile({ rangedStrength: 7, ap: 2, damage: 3 });
    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks: [makeAttack({ firepower: 1, weaponProfile: wp })],
      totalFirepower: 1,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);
    expect(result.hits[0].weaponStrength).toBe(7);
    expect(result.hits[0].weaponAP).toBe(2);
    expect(result.hits[0].weaponDamage).toBe(3);
  });

  it('carries source model ID on each hit result', () => {
    const dice = new FixedDiceProvider([4, 5]);
    const attacks = [
      makeAttack({ modelId: 'marine-alpha', firepower: 1 }),
      makeAttack({ modelId: 'marine-beta', firepower: 1 }),
    ];
    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 2,
    });

    const result = resolveFireGroupHits(fireGroup, dice);
    expect(result.hits[0].sourceModelId).toBe('marine-alpha');
    expect(result.hits[1].sourceModelId).toBe('marine-beta');
  });
});

// ─── BS4 Snap Shot ──────────────────────────────────────────────────────────

describe('resolveFireGroupHits — BS4 snap shot', () => {
  it('rolls [5,4,3,6] at BS4 snap shot (5+): 2 hits (5,6), 2 misses (4,3)', () => {
    const dice = new FixedDiceProvider([5, 4, 3, 6]);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `model-${i + 1}`,
        firepower: 1,
        ballisticSkill: 4,
        isSnapShot: true,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      isSnapShot: true,
      attacks,
      totalFirepower: 4,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    expect(result.hits).toHaveLength(4);

    const successfulHits = result.hits.filter((h) => h.isHit);
    expect(successfulHits).toHaveLength(2);
    expect(successfulHits.map((h) => h.diceRoll).sort()).toEqual([5, 6]);

    const misses = result.hits.filter((h) => !h.isHit);
    expect(misses).toHaveLength(2);
    expect(misses.map((h) => h.diceRoll).sort()).toEqual([3, 4]);

    // All have snap shot target number (BS4 snap = 5+)
    result.hits.forEach((h) => {
      expect(h.targetNumber).toBe(5);
    });

    // Event
    const event = result.events[0] as HitTestRollEvent;
    expect(event.isSnapShot).toBe(true);
    expect(event.targetNumber).toBe(5);
    expect(event.hits).toBe(2);
    expect(event.misses).toBe(2);
  });
});

// ─── BS1 Snap Shot — Auto-Fail ─────────────────────────────────────────────

describe('resolveFireGroupHits — BS1 snap shot (auto-fail)', () => {
  it('BS1 snap shot auto-fails with no dice rolled', () => {
    const dice = new FixedDiceProvider([]); // No dice should be consumed

    const attacks = [
      makeAttack({ modelId: 'model-1', firepower: 1, ballisticSkill: 1, isSnapShot: true }),
      makeAttack({ modelId: 'model-2', firepower: 1, ballisticSkill: 1, isSnapShot: true }),
      makeAttack({ modelId: 'model-3', firepower: 1, ballisticSkill: 1, isSnapShot: true }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 1,
      isSnapShot: true,
      attacks,
      totalFirepower: 3,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 3 are misses
    expect(result.hits).toHaveLength(3);
    result.hits.forEach((h) => {
      expect(h.isHit).toBe(false);
      expect(h.diceRoll).toBe(0); // No actual roll
      expect(h.isAutoHit).toBe(false);
    });

    // No dice were consumed
    expect(dice.rollsUsed).toBe(0);

    // Event shows 0 hits, 3 misses, empty rolls array
    const event = result.events[0] as HitTestRollEvent;
    expect(event.hits).toBe(0);
    expect(event.misses).toBe(3);
    expect(event.rolls).toEqual([]);
  });
});

// ─── BS10+ Auto-Hit ─────────────────────────────────────────────────────────

describe('resolveFireGroupHits — BS10+ (auto-hit)', () => {
  it('BS10 auto-hits all dice as natural 6, no dice rolled', () => {
    const dice = new FixedDiceProvider([]); // No dice should be consumed

    const attacks = [
      makeAttack({ modelId: 'model-1', firepower: 2, ballisticSkill: 10 }),
      makeAttack({ modelId: 'model-2', firepower: 1, ballisticSkill: 10 }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 10,
      isSnapShot: false,
      attacks,
      totalFirepower: 3,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 3 are hits
    expect(result.hits).toHaveLength(3);
    result.hits.forEach((h) => {
      expect(h.isHit).toBe(true);
      expect(h.isAutoHit).toBe(true);
      expect(h.diceRoll).toBe(6); // Counts as natural 6
      expect(h.isCritical).toBe(false); // BS10+ has no criticalOn
    });

    // No dice consumed
    expect(dice.rollsUsed).toBe(0);

    // Source model IDs are correctly mapped
    expect(result.hits[0].sourceModelId).toBe('model-1');
    expect(result.hits[1].sourceModelId).toBe('model-1'); // Second die from model-1 (firepower=2)
    expect(result.hits[2].sourceModelId).toBe('model-2');

    // Event
    const event = result.events[0] as HitTestRollEvent;
    expect(event.hits).toBe(3);
    expect(event.misses).toBe(0);
    expect(event.criticals).toBe(0);
  });

  it('BS12 also auto-hits (BS10+ rule)', () => {
    const dice = new FixedDiceProvider([]);
    const fireGroup = makeFireGroup({
      ballisticSkill: 12,
      attacks: [makeAttack({ firepower: 1, ballisticSkill: 12 })],
      totalFirepower: 1,
    });

    const result = resolveFireGroupHits(fireGroup, dice);
    expect(result.hits[0].isHit).toBe(true);
    expect(result.hits[0].isAutoHit).toBe(true);
  });
});

// ─── BS6 Critical Hits ──────────────────────────────────────────────────────

describe('resolveFireGroupHits — BS6 critical hits', () => {
  it('rolls [2,6,4,3] at BS6 (2+, crit on 6+): all hit, roll 6 is critical', () => {
    const dice = new FixedDiceProvider([2, 6, 4, 3]);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `model-${i + 1}`,
        firepower: 1,
        ballisticSkill: 6,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 6,
      attacks,
      totalFirepower: 4,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 4 hit (2+ target)
    const successfulHits = result.hits.filter((h) => h.isHit);
    expect(successfulHits).toHaveLength(4);

    // Only the roll of 6 is critical (criticalOn = 6 for BS6)
    const criticals = result.hits.filter((h) => h.isCritical);
    expect(criticals).toHaveLength(1);
    expect(criticals[0].diceRoll).toBe(6);

    // Non-6 rolls are not critical
    const nonCriticals = result.hits.filter((h) => h.isHit && !h.isCritical);
    expect(nonCriticals).toHaveLength(3);

    // Event
    const event = result.events[0] as HitTestRollEvent;
    expect(event.criticals).toBe(1);
  });

  it('BS7 has critical on 5+: rolls [5,6,2,4] → 2 criticals', () => {
    const dice = new FixedDiceProvider([5, 6, 2, 4]);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({ modelId: `m-${i}`, firepower: 1, ballisticSkill: 7 }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 7,
      attacks,
      totalFirepower: 4,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 4 hit on 2+
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(4);

    // Rolls 5 and 6 are critical (criticalOn = 5 for BS7)
    const criticals = result.hits.filter((h) => h.isCritical);
    expect(criticals).toHaveLength(2);
    expect(criticals.map((h) => h.diceRoll).sort()).toEqual([5, 6]);
  });

  it('BS8 has critical on 4+: rolls [4,3,6,1] → 2 criticals, 1 miss', () => {
    const dice = new FixedDiceProvider([4, 3, 6, 1]);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({ modelId: `m-${i}`, firepower: 1, ballisticSkill: 8 }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 8,
      attacks,
      totalFirepower: 4,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // Rolls 4, 3, 6 hit (>= 2); roll 1 misses (natural 1 always misses)
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(3);
    expect(result.hits.filter((h) => !h.isHit)).toHaveLength(1);

    // Rolls 4 and 6 are critical (criticalOn = 4 for BS8)
    const criticals = result.hits.filter((h) => h.isCritical);
    expect(criticals).toHaveLength(2);
    expect(criticals.map((h) => h.diceRoll).sort()).toEqual([4, 6]);
  });

  it('BS9 has critical on 3+: rolls [3,2,5] → 2 criticals', () => {
    const dice = new FixedDiceProvider([3, 2, 5]);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 3; i++) {
      attacks.push(makeAttack({ modelId: `m-${i}`, firepower: 1, ballisticSkill: 9 }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 9,
      attacks,
      totalFirepower: 3,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 3 hit on 2+
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(3);

    // Rolls 3 and 5 are critical (criticalOn = 3 for BS9), roll 2 is not
    const criticals = result.hits.filter((h) => h.isCritical);
    expect(criticals).toHaveLength(2);
    expect(criticals.map((h) => h.diceRoll).sort()).toEqual([3, 5]);
  });
});

// ─── Precision Hits ─────────────────────────────────────────────────────────

describe('resolveFireGroupHits — Precision(X)', () => {
  it('Precision(4+): rolls [4,5,2,6] → hits 4,5,6 are precision (2 is a miss)', () => {
    const dice = new FixedDiceProvider([4, 5, 2, 6]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Precision', value: '4+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `model-${i + 1}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // BS4 → 3+: rolls 4,5,6 hit; roll 2 misses
    const successfulHits = result.hits.filter((h) => h.isHit);
    expect(successfulHits).toHaveLength(3);

    // Precision(4+): hits with roll >= 4 are precision: 4, 5, 6
    const precisionHits = result.hits.filter((h) => h.isPrecision);
    expect(precisionHits).toHaveLength(3);
    expect(precisionHits.map((h) => h.diceRoll).sort()).toEqual([4, 5, 6]);

    // Miss (roll 2) should NOT be precision even if roll is irrelevant
    const missResult = result.hits.find((h) => h.diceRoll === 2)!;
    expect(missResult.isHit).toBe(false);
    expect(missResult.isPrecision).toBe(false);

    // Event
    const event = result.events[0] as HitTestRollEvent;
    expect(event.precisionHits).toBe(3);
  });

  it('Precision(6+): only natural 6s are precision hits', () => {
    const dice = new FixedDiceProvider([5, 6, 3, 6]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Precision', value: '6+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // BS4 → 3+: rolls 5, 6, 3, 6 all hit
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(4);

    // Only the two 6s are precision
    const precisionHits = result.hits.filter((h) => h.isPrecision);
    expect(precisionHits).toHaveLength(2);
    expect(precisionHits.every((h) => h.diceRoll === 6)).toBe(true);
  });
});

// ─── Rending Hits ───────────────────────────────────────────────────────────

describe('resolveFireGroupHits — Rending(X)', () => {
  it('Rending(6+): rolls [6,3,4,5] → only roll 6 is rending', () => {
    const dice = new FixedDiceProvider([6, 3, 4, 5]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Rending', value: '6+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `model-${i + 1}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // BS4 → 3+: all 4 hit
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(4);

    // Only roll 6 is rending
    const rendingHits = result.hits.filter((h) => h.isRending);
    expect(rendingHits).toHaveLength(1);
    expect(rendingHits[0].diceRoll).toBe(6);

    // Event
    const event = result.events[0] as HitTestRollEvent;
    expect(event.rendingHits).toBe(1);
  });

  it('Rending(5+): rolls [5,6,3,4] → rolls 5 and 6 are rending', () => {
    const dice = new FixedDiceProvider([5, 6, 3, 4]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Rending', value: '5+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    const rendingHits = result.hits.filter((h) => h.isRending);
    expect(rendingHits).toHaveLength(2);
    expect(rendingHits.map((h) => h.diceRoll).sort()).toEqual([5, 6]);
  });
});

// ─── Gets Hot ───────────────────────────────────────────────────────────────

describe('processGetsHot', () => {
  it('weapon with Gets Hot: rolls [1,3,4,1] → two natural 1s wound firing models', () => {
    const dice = new FixedDiceProvider([1, 3, 4, 1]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Gets Hot' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'plasma-1', firepower: 1, weaponProfile: wp }),
      makeAttack({ modelId: 'plasma-2', firepower: 1, weaponProfile: wp }),
      makeAttack({ modelId: 'plasma-3', firepower: 1, weaponProfile: wp }),
      makeAttack({ modelId: 'plasma-4', firepower: 1, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    // First resolve hits
    const hitResult = resolveFireGroupHits(fireGroup, dice);

    // Then process Gets Hot
    const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);

    // Two models took wounds (plasma-1 rolled 1, plasma-4 rolled 1)
    expect(getsHotResult.modelWounds).toHaveLength(2);

    const wound1 = getsHotResult.modelWounds.find((w) => w.modelId === 'plasma-1');
    const wound4 = getsHotResult.modelWounds.find((w) => w.modelId === 'plasma-4');
    expect(wound1).toBeDefined();
    expect(wound1!.wounds).toBe(1);
    expect(wound4).toBeDefined();
    expect(wound4!.wounds).toBe(1);

    // Two Gets Hot events
    expect(getsHotResult.getsHotEvents).toHaveLength(2);
    expect(getsHotResult.getsHotEvents.every((e) => e.type === 'getsHot')).toBe(true);
  });

  it('weapon without Gets Hot returns empty results', () => {
    const dice = new FixedDiceProvider([1, 1, 1]); // All 1s but no Gets Hot rule

    const attacks = [
      makeAttack({ modelId: 'bolter-1', firepower: 1 }),
      makeAttack({ modelId: 'bolter-2', firepower: 1 }),
      makeAttack({ modelId: 'bolter-3', firepower: 1 }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 3,
      specialRules: [], // No Gets Hot
    });

    const hitResult = resolveFireGroupHits(fireGroup, dice);
    const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);

    expect(getsHotResult.modelWounds).toHaveLength(0);
    expect(getsHotResult.getsHotEvents).toHaveLength(0);
  });

  it('multiple natural 1s from same model stack wounds', () => {
    const dice = new FixedDiceProvider([1, 1, 4]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Gets Hot' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'heavy-plasma', firepower: 3, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 3,
      specialRules,
      weaponProfile: wp,
    });

    const hitResult = resolveFireGroupHits(fireGroup, dice);
    const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);

    // One model took 2 wounds (two natural 1s)
    expect(getsHotResult.modelWounds).toHaveLength(1);
    expect(getsHotResult.modelWounds[0].modelId).toBe('heavy-plasma');
    expect(getsHotResult.modelWounds[0].wounds).toBe(2);
  });

  it('auto-fail (BS1 snap shots) with diceRoll=0 does not trigger Gets Hot', () => {
    const dice = new FixedDiceProvider([]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Gets Hot' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'model-1', firepower: 2, ballisticSkill: 1, isSnapShot: true, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 1,
      isSnapShot: true,
      attacks,
      totalFirepower: 2,
      specialRules,
      weaponProfile: wp,
    });

    const hitResult = resolveFireGroupHits(fireGroup, dice);
    const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);

    // diceRoll is 0 (auto-fail), not a natural 1 → no Gets Hot
    expect(getsHotResult.modelWounds).toHaveLength(0);
  });
});

// ─── Snap Shots Never Trigger Precision ─────────────────────────────────────

describe('resolveFireGroupHits — snap shots never trigger Precision', () => {
  it('Precision(4+) weapon fired as snap shot: no precision even on 6', () => {
    const dice = new FixedDiceProvider([6, 5, 4]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Precision', value: '4+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 3; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 4,
        isSnapShot: true,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      isSnapShot: true,
      attacks,
      totalFirepower: 3,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // BS4 snap = 5+: rolls 6, 5 hit; roll 4 misses
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(2);

    // NO precision hits on snap shots
    expect(result.hits.filter((h) => h.isPrecision)).toHaveLength(0);

    // Event confirms
    const event = result.events[0] as HitTestRollEvent;
    expect(event.precisionHits).toBe(0);
  });

  it('Precision(4+) on Blast weapon does not trigger precision', () => {
    const dice = new FixedDiceProvider([4, 5, 6]);

    const specialRules: SpecialRuleRef[] = [
      { name: 'Precision', value: '4+' },
      { name: 'Blast', value: '3"' },
    ];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 3; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 3,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All hit (BS4 → 3+)
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(3);

    // No precision on Blast weapons
    expect(result.hits.filter((h) => h.isPrecision)).toHaveLength(0);
  });

  it('Precision(4+) on Template weapon does not trigger precision', () => {
    const dice = new FixedDiceProvider([5, 6]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Precision', value: '4+' }];
    const wp = makeWeaponProfile({ specialRules, hasTemplate: true });

    const attacks = [
      makeAttack({ modelId: 'm-0', firepower: 1, weaponProfile: wp }),
      makeAttack({ modelId: 'm-1', firepower: 1, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 2,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // Both hit, but no precision on template weapons
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(2);
    expect(result.hits.filter((h) => h.isPrecision)).toHaveLength(0);
  });

  it('Precision(4+) on Barrage weapon does not trigger precision', () => {
    const dice = new FixedDiceProvider([4, 6]);

    const specialRules: SpecialRuleRef[] = [
      { name: 'Precision', value: '4+' },
      { name: 'Barrage' },
    ];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'm-0', firepower: 1, weaponProfile: wp }),
      makeAttack({ modelId: 'm-1', firepower: 1, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 2,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    expect(result.hits.filter((h) => h.isHit)).toHaveLength(2);
    expect(result.hits.filter((h) => h.isPrecision)).toHaveLength(0);
  });
});

// ─── Multiple Attacks in Fire Group ─────────────────────────────────────────

describe('resolveFireGroupHits — multiple attacks (different models)', () => {
  it('3 models with different firepower contribute dice in order', () => {
    // Model A: firepower 2, Model B: firepower 1, Model C: firepower 3
    // Total: 6 dice
    const dice = new FixedDiceProvider([6, 5, 4, 3, 2, 1]);

    const attacks = [
      makeAttack({ modelId: 'model-A', firepower: 2, ballisticSkill: 4 }),
      makeAttack({ modelId: 'model-B', firepower: 1, ballisticSkill: 4 }),
      makeAttack({ modelId: 'model-C', firepower: 3, ballisticSkill: 4 }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 6,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    expect(result.hits).toHaveLength(6);

    // Verify roll-to-model mapping:
    // Rolls [6, 5] → model-A (firepower 2)
    // Roll  [4]    → model-B (firepower 1)
    // Rolls [3, 2, 1] → model-C (firepower 3)
    expect(result.hits[0].sourceModelId).toBe('model-A');
    expect(result.hits[0].diceRoll).toBe(6);
    expect(result.hits[1].sourceModelId).toBe('model-A');
    expect(result.hits[1].diceRoll).toBe(5);
    expect(result.hits[2].sourceModelId).toBe('model-B');
    expect(result.hits[2].diceRoll).toBe(4);
    expect(result.hits[3].sourceModelId).toBe('model-C');
    expect(result.hits[3].diceRoll).toBe(3);
    expect(result.hits[4].sourceModelId).toBe('model-C');
    expect(result.hits[4].diceRoll).toBe(2);
    expect(result.hits[5].sourceModelId).toBe('model-C');
    expect(result.hits[5].diceRoll).toBe(1);

    // BS4 → 3+: hits are [6,5,4,3], misses are [2,1]
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(4);
    expect(result.hits.filter((h) => !h.isHit)).toHaveLength(2);
  });

  it('10-model squad with bolters (firepower 1 each) rolls 10 dice', () => {
    const rolls = [3, 4, 5, 2, 1, 6, 3, 4, 2, 5];
    const dice = new FixedDiceProvider(rolls);

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 10; i++) {
      attacks.push(makeAttack({
        modelId: `tactical-${i + 1}`,
        firepower: 1,
        ballisticSkill: 4,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 10,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    expect(result.hits).toHaveLength(10);
    expect(dice.rollsUsed).toBe(10);

    // BS4 → 3+: count hits (rolls >= 3)
    const hitsCount = rolls.filter((r) => r >= 3).length;
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(hitsCount);

    // Each model has exactly 1 hit result
    for (let i = 0; i < 10; i++) {
      expect(result.hits[i].sourceModelId).toBe(`tactical-${i + 1}`);
    }
  });
});

// ─── Combined Special Rules ─────────────────────────────────────────────────

describe('resolveFireGroupHits — combined special rules', () => {
  it('weapon with both Precision(4+) and Rending(6+)', () => {
    const dice = new FixedDiceProvider([6, 4, 2, 5]);

    const specialRules: SpecialRuleRef[] = [
      { name: 'Precision', value: '4+' },
      { name: 'Rending', value: '6+' },
    ];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 4; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 4,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks,
      totalFirepower: 4,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // BS4 → 3+: rolls 6, 4, 5 hit; roll 2 misses
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(3);

    // Roll 6: both precision (>=4) and rending (>=6)
    const roll6 = result.hits.find((h) => h.diceRoll === 6)!;
    expect(roll6.isPrecision).toBe(true);
    expect(roll6.isRending).toBe(true);

    // Roll 4: precision (>=4) but not rending (not >=6)
    const roll4 = result.hits.find((h) => h.diceRoll === 4)!;
    expect(roll4.isPrecision).toBe(true);
    expect(roll4.isRending).toBe(false);

    // Roll 5: precision (>=4) but not rending (not >=6)
    const roll5 = result.hits.find((h) => h.diceRoll === 5)!;
    expect(roll5.isPrecision).toBe(true);
    expect(roll5.isRending).toBe(false);

    // Roll 2: miss, neither precision nor rending
    const roll2 = result.hits.find((h) => h.diceRoll === 2)!;
    expect(roll2.isPrecision).toBe(false);
    expect(roll2.isRending).toBe(false);
  });

  it('BS6 critical with Rending(6+): roll 6 is both critical and rending', () => {
    const dice = new FixedDiceProvider([6, 3, 2]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Rending', value: '6+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks: FireGroupAttack[] = [];
    for (let i = 0; i < 3; i++) {
      attacks.push(makeAttack({
        modelId: `m-${i}`,
        firepower: 1,
        ballisticSkill: 6,
        weaponProfile: wp,
      }));
    }

    const fireGroup = makeFireGroup({
      ballisticSkill: 6,
      attacks,
      totalFirepower: 3,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All 3 hit on 2+
    expect(result.hits.filter((h) => h.isHit)).toHaveLength(3);

    // Roll 6 is both critical (BS6 criticalOn=6) and rending (Rending(6+))
    const roll6 = result.hits.find((h) => h.diceRoll === 6)!;
    expect(roll6.isCritical).toBe(true);
    expect(roll6.isRending).toBe(true);

    // Roll 3 is neither
    const roll3 = result.hits.find((h) => h.diceRoll === 3)!;
    expect(roll3.isCritical).toBe(false);
    expect(roll3.isRending).toBe(false);
  });

  it('BS10+ auto-hit with Rending(6+): all auto-hits (nat 6) are rending', () => {
    const dice = new FixedDiceProvider([]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Rending', value: '6+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'm-0', firepower: 2, ballisticSkill: 10, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 10,
      attacks,
      totalFirepower: 2,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // All auto-hit as natural 6
    expect(result.hits).toHaveLength(2);
    result.hits.forEach((h) => {
      expect(h.isAutoHit).toBe(true);
      expect(h.diceRoll).toBe(6);
      expect(h.isRending).toBe(true); // Natural 6 >= 6+
    });
  });

  it('BS10+ auto-hit with Precision(4+): all auto-hits are precision', () => {
    const dice = new FixedDiceProvider([]);

    const specialRules: SpecialRuleRef[] = [{ name: 'Precision', value: '4+' }];
    const wp = makeWeaponProfile({ specialRules });

    const attacks = [
      makeAttack({ modelId: 'm-0', firepower: 2, ballisticSkill: 10, weaponProfile: wp }),
    ];

    const fireGroup = makeFireGroup({
      ballisticSkill: 10,
      attacks,
      totalFirepower: 2,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    result.hits.forEach((h) => {
      expect(h.isAutoHit).toBe(true);
      expect(h.isPrecision).toBe(true); // Natural 6 >= 4+
    });
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('resolveFireGroupHits — edge cases', () => {
  it('firepower 0 produces no hits and no rolls', () => {
    const dice = new FixedDiceProvider([]);

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks: [],
      totalFirepower: 0,
    });

    const result = resolveFireGroupHits(fireGroup, dice);
    expect(result.hits).toHaveLength(0);
    expect(dice.rollsUsed).toBe(0);
  });

  it('natural 1 always misses even at BS5 (target 2+)', () => {
    const dice = new FixedDiceProvider([1]);

    const fireGroup = makeFireGroup({
      ballisticSkill: 5,
      attacks: [makeAttack({ firepower: 1, ballisticSkill: 5 })],
      totalFirepower: 1,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // Natural 1 < 2+ → miss
    expect(result.hits[0].isHit).toBe(false);
    expect(result.hits[0].diceRoll).toBe(1);
  });

  it('special rules are carried forward onto each hit result', () => {
    const dice = new FixedDiceProvider([4]);

    const specialRules: SpecialRuleRef[] = [
      { name: 'Armourbane' },
      { name: 'Rending', value: '6+' },
    ];
    const wp = makeWeaponProfile({ specialRules });

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks: [makeAttack({ firepower: 1, weaponProfile: wp })],
      totalFirepower: 1,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    expect(result.hits[0].specialRules).toEqual(specialRules);
  });

  it('Rending on a miss does not flag as rending', () => {
    const dice = new FixedDiceProvider([2]); // Miss at BS4 (3+)

    const specialRules: SpecialRuleRef[] = [{ name: 'Rending', value: '2+' }];
    const wp = makeWeaponProfile({ specialRules });

    const fireGroup = makeFireGroup({
      ballisticSkill: 4,
      attacks: [makeAttack({ firepower: 1, weaponProfile: wp })],
      totalFirepower: 1,
      specialRules,
      weaponProfile: wp,
    });

    const result = resolveFireGroupHits(fireGroup, dice);

    // Roll 2 misses at BS4 (3+)
    expect(result.hits[0].isHit).toBe(false);
    // Even though 2 >= 2+ for Rending, it's a miss so isRending = false
    expect(result.hits[0].isRending).toBe(false);
  });
});
