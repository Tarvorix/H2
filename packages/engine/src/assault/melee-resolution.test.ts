/**
 * Tests for Melee Resolution Pipeline
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase
 * Reference: HH_Principles.md — Melee Hit Tests, Wound Tests
 * Reference: HH_Tables.md — Melee Hit Table, Wound Table
 */

import { describe, it, expect } from 'vitest';
import { FixedDiceProvider } from '../dice';
import {
  resolveMeleeHitTests,
  resolveMeleeWoundTests,
  resolveMeleeSaves,
  resolveMeleeDamage,
  resolveMeleePipeline,
} from './melee-resolution';
import type { MeleeStrikeGroup, MeleeHitResult } from './assault-types';

// ─── Test Helpers ───────────────────────────────────────────────────────────

/**
 * Create a minimal MeleeStrikeGroup for testing.
 */
function createStrikeGroup(overrides: Partial<MeleeStrikeGroup> = {}): MeleeStrikeGroup {
  return {
    index: 0,
    weaponName: 'Chainsword',
    attackerModelIds: ['model-1'],
    targetUnitId: 'target-unit',
    weaponSkill: 4,
    combatInitiative: 4,
    totalAttacks: 3,
    weaponStrength: 4,
    weaponAP: null,
    weaponDamage: 1,
    specialRules: [],
    hits: [],
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    attackerPlayerIndex: 0,
    ...overrides,
  };
}

/**
 * Create a successful MeleeHitResult for wound test inputs.
 */
function createHit(overrides: Partial<MeleeHitResult> = {}): MeleeHitResult {
  return {
    diceRoll: 4,
    targetNumber: 4,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    sourceModelId: 'model-1',
    weaponStrength: 4,
    weaponAP: null,
    weaponDamage: 1,
    specialRules: [],
    ...overrides,
  };
}

// ─── resolveMeleeHitTests ─────────────────────────────────────────────────

describe('resolveMeleeHitTests', () => {
  it('hits on target number (WS4 vs WS4 = need 4+, roll 4 → hit)', () => {
    // WS4 vs WS4 → target 4, roll 4 → hit
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeHitTests(group, 4, dice);

    expect(result.totalHits).toBe(1);
    expect(result.hits[0].isHit).toBe(true);
    expect(result.hits[0].diceRoll).toBe(4);
    expect(result.hits[0].targetNumber).toBe(4);
  });

  it('misses below target number (roll 3 with target 4 → miss)', () => {
    // WS4 vs WS4 → target 4, roll 3 → miss
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([3]);

    const result = resolveMeleeHitTests(group, 4, dice);

    expect(result.totalHits).toBe(0);
    expect(result.hits[0].isHit).toBe(false);
    expect(result.hits[0].diceRoll).toBe(3);
  });

  it('natural 6 always hits regardless of WS', () => {
    // WS1 vs WS10 → target 6, roll 6 → always hits
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 1 });
    const dice = new FixedDiceProvider([6]);

    const result = resolveMeleeHitTests(group, 10, dice);

    expect(result.totalHits).toBe(1);
    expect(result.hits[0].isHit).toBe(true);
    expect(result.hits[0].diceRoll).toBe(6);
  });

  it('natural 1 always misses regardless of WS', () => {
    // WS10 vs WS1 → target 2, roll 1 → always misses
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 10 });
    const dice = new FixedDiceProvider([1]);

    const result = resolveMeleeHitTests(group, 1, dice);

    expect(result.totalHits).toBe(0);
    expect(result.hits[0].isHit).toBe(false);
    expect(result.hits[0].diceRoll).toBe(1);
  });

  it('counts total hits correctly', () => {
    // WS4 vs WS4 → target 4, rolls: 4(hit), 2(miss), 6(hit), 1(miss), 5(hit)
    const group = createStrikeGroup({ totalAttacks: 5, weaponSkill: 4 });
    const dice = new FixedDiceProvider([4, 2, 6, 1, 5]);

    const result = resolveMeleeHitTests(group, 4, dice);

    expect(result.totalHits).toBe(3);
    expect(result.hits).toHaveLength(5);
    expect(result.hits[0].isHit).toBe(true);  // roll 4
    expect(result.hits[1].isHit).toBe(false); // roll 2
    expect(result.hits[2].isHit).toBe(true);  // roll 6
    expect(result.hits[3].isHit).toBe(false); // roll 1
    expect(result.hits[4].isHit).toBe(true);  // roll 5
  });

  it('handles WS4 vs WS3 (target 3+)', () => {
    // WS4 vs WS3 → target 3, roll 3 → hit
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([3]);

    const result = resolveMeleeHitTests(group, 3, dice);

    expect(result.totalHits).toBe(1);
    expect(result.hits[0].isHit).toBe(true);
    expect(result.hits[0].targetNumber).toBe(3);
  });

  it('handles WS3 vs WS5 (target 5+)', () => {
    // WS3 vs WS5 → target 5, roll 4 → miss
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 3 });
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeHitTests(group, 5, dice);

    expect(result.totalHits).toBe(0);
    expect(result.hits[0].isHit).toBe(false);
    expect(result.hits[0].targetNumber).toBe(5);
  });

  it('marks precision on natural 6', () => {
    // WS4 vs WS4 → target 4, roll 6 → hit with precision
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([6]);

    const result = resolveMeleeHitTests(group, 4, dice);

    expect(result.totalHits).toBe(1);
    expect(result.precisionHits).toBe(1);
    expect(result.hits[0].isPrecision).toBe(true);
  });

  it('marks rending when roll >= threshold (threshold 6, roll 6)', () => {
    // WS4 vs WS4 → target 4, roll 6 with rending threshold 6 → rending hit
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([6]);

    const result = resolveMeleeHitTests(group, 4, dice, 6, 0);

    expect(result.totalHits).toBe(1);
    expect(result.rendingHits).toBe(1);
    expect(result.hits[0].isRending).toBe(true);
  });

  it('marks critical when roll >= threshold', () => {
    // WS4 vs WS4 → target 4, roll 6 with critical threshold 6 → critical hit
    const group = createStrikeGroup({ totalAttacks: 1, weaponSkill: 4 });
    const dice = new FixedDiceProvider([6]);

    const result = resolveMeleeHitTests(group, 4, dice, 0, 6);

    expect(result.totalHits).toBe(1);
    expect(result.criticalHits).toBe(1);
    expect(result.hits[0].isCritical).toBe(true);
  });

  it('rending hits are counted separately', () => {
    // 3 attacks: rolls [6, 4, 5], rending on 5+
    // Roll 6: hit + rending, Roll 4: hit (not rending), Roll 5: hit + rending
    const group = createStrikeGroup({ totalAttacks: 3, weaponSkill: 4 });
    const dice = new FixedDiceProvider([6, 4, 5]);

    const result = resolveMeleeHitTests(group, 4, dice, 5, 0);

    expect(result.totalHits).toBe(3);
    expect(result.rendingHits).toBe(2);
    expect(result.hits[0].isRending).toBe(true);  // roll 6 >= 5
    expect(result.hits[1].isRending).toBe(false); // roll 4 < 5
    expect(result.hits[2].isRending).toBe(true);  // roll 5 >= 5
  });

  it('critical hits are counted separately', () => {
    // 3 attacks: rolls [6, 3, 5], critical on 5+
    // Roll 6: hit + critical, Roll 3: miss, Roll 5: hit + critical
    const group = createStrikeGroup({ totalAttacks: 3, weaponSkill: 4 });
    const dice = new FixedDiceProvider([6, 3, 5]);

    const result = resolveMeleeHitTests(group, 4, dice, 0, 5);

    expect(result.totalHits).toBe(2);
    expect(result.criticalHits).toBe(2);
    expect(result.hits[0].isCritical).toBe(true);  // roll 6 >= 5
    expect(result.hits[1].isCritical).toBe(false);  // roll 3 is a miss
    expect(result.hits[2].isCritical).toBe(true);   // roll 5 >= 5
  });
});

// ─── resolveMeleeWoundTests ───────────────────────────────────────────────

describe('resolveMeleeWoundTests', () => {
  it('wounds on target number (S4 vs T4 = need 4+, roll 4 → wound)', () => {
    const hits = [createHit({ weaponStrength: 4 })];
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeWoundTests(hits, 4, dice);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].diceRoll).toBe(4);
    expect(result.wounds[0].targetNumber).toBe(4);
  });

  it('misses below target number', () => {
    // S4 vs T4 → need 4+, roll 3 → fail
    const hits = [createHit({ weaponStrength: 4 })];
    const dice = new FixedDiceProvider([3]);

    const result = resolveMeleeWoundTests(hits, 4, dice);

    expect(result.totalWounds).toBe(0);
    expect(result.wounds[0].isWound).toBe(false);
    expect(result.wounds[0].diceRoll).toBe(3);
  });

  it('natural 1 always fails to wound', () => {
    // S5 vs T4 → need 3+, but roll 1 always fails
    const hits = [createHit({ weaponStrength: 5 })];
    const dice = new FixedDiceProvider([1]);

    const result = resolveMeleeWoundTests(hits, 4, dice);

    expect(result.totalWounds).toBe(0);
    expect(result.wounds[0].isWound).toBe(false);
    expect(result.wounds[0].diceRoll).toBe(1);
  });

  it('rending hit auto-wounds (skip wound roll)', () => {
    const hits = [createHit({ isRending: true })];
    const dice = new FixedDiceProvider([]); // No dice should be consumed

    const result = resolveMeleeWoundTests(hits, 4, dice);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isRendingWound).toBe(true);
    expect(result.wounds[0].diceRoll).toBe(0); // No wound roll made
    expect(dice.rollsUsed).toBe(0);
  });

  it('critical hit auto-wounds with +1 damage', () => {
    const hits = [createHit({ isCritical: true, weaponDamage: 1 })];
    const dice = new FixedDiceProvider([]); // No dice should be consumed

    const result = resolveMeleeWoundTests(hits, 4, dice);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isCriticalWound).toBe(true);
    expect(result.wounds[0].damage).toBe(2); // 1 base + 1 critical bonus
    expect(dice.rollsUsed).toBe(0);
  });

  it('poisoned wounds on threshold regardless of T', () => {
    // S3 vs T8 → normally impossible (null from table), but poisoned 4+ overrides
    const hits = [createHit({ weaponStrength: 3 })];
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeWoundTests(hits, 8, dice, 4);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isPoisoned).toBe(true);
    expect(result.wounds[0].targetNumber).toBe(4);
  });

  it('breaching overrides AP to 2 on roll >= threshold', () => {
    // S4 vs T4 → need 4+, roll 6, breaching on 6+ → AP becomes 2
    const hits = [createHit({ weaponStrength: 4, weaponAP: null })];
    const dice = new FixedDiceProvider([6]);

    const result = resolveMeleeWoundTests(hits, 4, dice, 0, 6);

    expect(result.totalWounds).toBe(1);
    expect(result.breachingWounds).toBe(1);
    expect(result.wounds[0].isBreaching).toBe(true);
    expect(result.wounds[0].ap).toBe(2);
  });

  it('shred re-rolls failed wound tests', () => {
    // S4 vs T4 → need 4+
    // First roll: 2 (fail) → re-roll with Shred: 5 (success)
    const hits = [createHit({ weaponStrength: 4 })];
    const dice = new FixedDiceProvider([2, 5]);

    const result = resolveMeleeWoundTests(hits, 4, dice, 0, 0, true);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
    expect(result.wounds[0].isShred).toBe(true);
    expect(dice.rollsUsed).toBe(2); // First roll + re-roll
  });

  it('wound roll bonus (Hatred) adds to roll', () => {
    // S4 vs T4 → need 4+, roll 3 + 1 bonus = effective 4 → wound
    const hits = [createHit({ weaponStrength: 4 })];
    const dice = new FixedDiceProvider([3]);

    const result = resolveMeleeWoundTests(hits, 4, dice, 0, 0, false, 1);

    expect(result.totalWounds).toBe(1);
    expect(result.wounds[0].isWound).toBe(true);
  });
});

// ─── resolveMeleeSaves ────────────────────────────────────────────────────

describe('resolveMeleeSaves', () => {
  it('saves on armor save roll (3+ save, roll 3 → saved)', () => {
    const wounds = [{
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
    }];
    const dice = new FixedDiceProvider([3]);

    const result = resolveMeleeSaves(wounds, 3, 0, dice);

    expect(result.savedWounds).toBe(1);
    expect(result.unsavedWounds).toBe(0);
  });

  it('fails save below target (3+ save, roll 2 → failed)', () => {
    const wounds = [{
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
    }];
    const dice = new FixedDiceProvider([2]);

    const result = resolveMeleeSaves(wounds, 3, 0, dice);

    expect(result.savedWounds).toBe(0);
    expect(result.unsavedWounds).toBe(1);
    expect(result.unsavedWoundResults).toHaveLength(1);
  });

  it('AP makes save harder (3+ save with AP 2 → need 5+)', () => {
    // Armor save 3 + AP 2 = effective save 5+
    // Roll 5 → saved (5 >= 5)
    const wounds = [{
      diceRoll: 4,
      targetNumber: 4,
      isWound: true,
      strength: 4,
      ap: 2,
      damage: 1,
      isBreaching: false,
      isShred: false,
      isPoisoned: false,
      isCriticalWound: false,
      isRendingWound: false,
      isPrecision: false,
      specialRules: [],
    }];
    const dice = new FixedDiceProvider([5]);

    const result = resolveMeleeSaves(wounds, 3, 0, dice);

    expect(result.savedWounds).toBe(1);
    expect(result.unsavedWounds).toBe(0);
  });

  it('AP makes save harder — fail when roll below modified save', () => {
    // Armor save 3 + AP 2 = effective save 5+
    // Roll 4 → fail (4 < 5)
    const wounds = [{
      diceRoll: 4,
      targetNumber: 4,
      isWound: true,
      strength: 4,
      ap: 2,
      damage: 1,
      isBreaching: false,
      isShred: false,
      isPoisoned: false,
      isCriticalWound: false,
      isRendingWound: false,
      isPrecision: false,
      specialRules: [],
    }];
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeSaves(wounds, 3, 0, dice);

    expect(result.savedWounds).toBe(0);
    expect(result.unsavedWounds).toBe(1);
  });

  it('invulnerable save used when better than modified armor save', () => {
    // Armor save 3 + AP 3 = effective 6+; invulnerable 4+ is better
    // Roll 4 → saved via invulnerable (4 >= 4)
    const wounds = [{
      diceRoll: 4,
      targetNumber: 4,
      isWound: true,
      strength: 4,
      ap: 3,
      damage: 1,
      isBreaching: false,
      isShred: false,
      isPoisoned: false,
      isCriticalWound: false,
      isRendingWound: false,
      isPrecision: false,
      specialRules: [],
    }];
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeSaves(wounds, 3, 4, dice);

    expect(result.savedWounds).toBe(1);
    expect(result.unsavedWounds).toBe(0);
  });

  it('no cover saves in melee (armor only)', () => {
    // resolveMeleeSaves does not take a cover parameter at all,
    // confirming no cover saves in melee — only armor and invulnerable.
    // A wound with no AP, armor save 4+, roll 4 → saved via armor only.
    const wounds = [{
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
    }];
    const dice = new FixedDiceProvider([4]);

    const result = resolveMeleeSaves(wounds, 4, 0, dice);

    expect(result.savedWounds).toBe(1);
    expect(result.unsavedWounds).toBe(0);
  });

  it('Feel No Pain after failed save', () => {
    // Armor save 3+, roll 1 → fail save.
    // FNP 5+, roll 5 → FNP passes, wound is saved.
    const wounds = [{
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
    }];
    const dice = new FixedDiceProvider([1, 5]); // save roll 1 (fail), FNP roll 5 (pass)

    const result = resolveMeleeSaves(wounds, 3, 0, dice, 5);

    expect(result.savedWounds).toBe(1);
    expect(result.unsavedWounds).toBe(0);
  });

  it('counts saved and unsaved correctly', () => {
    // 3 wounds: save rolls [6, 2, 4], armor save 4+
    // Roll 6: saved, Roll 2: failed, Roll 4: saved → 2 saved, 1 unsaved
    const wounds = [
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
      {
        diceRoll: 5, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
    ];
    const dice = new FixedDiceProvider([6, 2, 4]);

    const result = resolveMeleeSaves(wounds, 4, 0, dice);

    expect(result.savedWounds).toBe(2);
    expect(result.unsavedWounds).toBe(1);
    expect(result.unsavedWoundResults).toHaveLength(1);
  });
});

// ─── resolveMeleeDamage ───────────────────────────────────────────────────

describe('resolveMeleeDamage', () => {
  it('applies 1 damage per wound to target models', () => {
    const unsavedWounds = [
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
    ];
    const targetModelWounds = new Map([
      ['target-model-1', 1],
      ['target-model-2', 1],
    ]);

    const result = resolveMeleeDamage(unsavedWounds, targetModelWounds);

    expect(result.totalWoundsApplied).toBe(1);
    expect(result.casualties).toHaveLength(1);
    expect(result.casualties[0]).toBe('target-model-1');
  });

  it('removes model when wounds reach 0', () => {
    const unsavedWounds = [
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
    ];
    const targetModelWounds = new Map([
      ['target-model-1', 1],
    ]);

    const result = resolveMeleeDamage(unsavedWounds, targetModelWounds);

    expect(result.totalWoundsApplied).toBe(1);
    expect(result.casualties).toContain('target-model-1');
  });

  it('multiple wounds target wounded model first', () => {
    // Model-1 has 1W remaining, Model-2 has 2W remaining
    // findTargetModel prefers the model with fewer wounds → Model-1 first
    const unsavedWounds = [
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
    ];
    const targetModelWounds = new Map([
      ['target-model-1', 1],
      ['target-model-2', 2],
    ]);

    const result = resolveMeleeDamage(unsavedWounds, targetModelWounds);

    expect(result.totalWoundsApplied).toBe(2);
    // First wound kills model-1 (1W → 0W), second wound goes to model-2 (2W → 1W)
    expect(result.casualties).toEqual(['target-model-1']);
  });

  it('handles multi-wound models', () => {
    // Single model with 3 wounds, takes 2 damage-1 wounds → 1W remaining, not a casualty
    const unsavedWounds = [
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
      {
        diceRoll: 4, targetNumber: 4, isWound: true, strength: 4, ap: null,
        damage: 1, isBreaching: false, isShred: false, isPoisoned: false,
        isCriticalWound: false, isRendingWound: false, isPrecision: false,
        specialRules: [] as { name: string; value?: string }[],
      },
    ];
    const targetModelWounds = new Map([
      ['target-model-1', 3],
    ]);

    const result = resolveMeleeDamage(unsavedWounds, targetModelWounds);

    expect(result.totalWoundsApplied).toBe(2);
    expect(result.casualties).toHaveLength(0); // 3 - 2 = 1W remaining
  });
});

// ─── resolveMeleePipeline ─────────────────────────────────────────────────

describe('resolveMeleePipeline', () => {
  it('runs full pipeline: hits → wounds → saves → damage', () => {
    // WS4 vs WS4, S4 vs T4, armor save 4+
    // 3 attacks: rolls [4, 6, 2] → 2 hits (4, 6), 1 miss (2)
    // 2 wound rolls: [5, 3] → 1 wound (5 >= 4), 1 fail (3 < 4)
    // 1 save roll: [2] → fail (2 < 4)
    // 1 damage applied to target-model-1 (1W) → casualty
    const group = createStrikeGroup({
      totalAttacks: 3,
      weaponSkill: 4,
      weaponStrength: 4,
      weaponAP: null,
      weaponDamage: 1,
    });

    const dice = new FixedDiceProvider([
      // Hit rolls
      4, 6, 2,
      // Wound rolls (for the 2 hits)
      5, 3,
      // Save roll (for the 1 wound)
      2,
    ]);

    const result = resolveMeleePipeline(group, {
      defenderWS: 4,
      defenderToughness: 4,
      armorSave: 4,
      invulnerableSave: 0,
      targetModelWounds: new Map([['target-model-1', 1]]),
    }, dice);

    expect(result.hitResult.totalHits).toBe(2);
    expect(result.woundResult.totalWounds).toBe(1);
    expect(result.saveResult.unsavedWounds).toBe(1);
    expect(result.damageResult.totalWoundsApplied).toBe(1);
    expect(result.damageResult.casualties).toContain('target-model-1');
  });

  it('pipeline result contains all sub-results', () => {
    // Simple: 1 attack, roll 6 (hit), wound roll 6 (wound), save roll 1 (fail)
    const group = createStrikeGroup({
      totalAttacks: 1,
      weaponSkill: 4,
      weaponStrength: 4,
      weaponDamage: 1,
    });

    const dice = new FixedDiceProvider([
      6,  // hit roll
      6,  // wound roll
      1,  // save roll
    ]);

    const result = resolveMeleePipeline(group, {
      defenderWS: 4,
      defenderToughness: 4,
      armorSave: 3,
      invulnerableSave: 0,
      targetModelWounds: new Map([['target-model-1', 1]]),
    }, dice);

    // Verify all sub-results exist
    expect(result.hitResult).toBeDefined();
    expect(result.woundResult).toBeDefined();
    expect(result.saveResult).toBeDefined();
    expect(result.damageResult).toBeDefined();

    // Verify sub-result types have expected properties
    expect(result.hitResult.hits).toBeDefined();
    expect(result.hitResult.totalHits).toBeDefined();
    expect(result.hitResult.criticalHits).toBeDefined();
    expect(result.hitResult.rendingHits).toBeDefined();
    expect(result.hitResult.precisionHits).toBeDefined();

    expect(result.woundResult.wounds).toBeDefined();
    expect(result.woundResult.totalWounds).toBeDefined();
    expect(result.woundResult.breachingWounds).toBeDefined();

    expect(result.saveResult.unsavedWounds).toBeDefined();
    expect(result.saveResult.savedWounds).toBeDefined();
    expect(result.saveResult.unsavedWoundResults).toBeDefined();

    expect(result.damageResult.totalWoundsApplied).toBeDefined();
    expect(result.damageResult.casualties).toBeDefined();
  });

  it('correctly chains data between stages', () => {
    // 2 attacks, both hit (rolls 5, 4), both wound (rolls 4, 5),
    // first save fails (roll 1), second save passes (roll 6)
    // 1 unsaved wound → 1 damage applied
    const group = createStrikeGroup({
      totalAttacks: 2,
      weaponSkill: 4,
      weaponStrength: 4,
      weaponDamage: 1,
    });

    const dice = new FixedDiceProvider([
      5, 4,  // hit rolls → both hit (5 >= 4, 4 >= 4)
      4, 5,  // wound rolls → both wound (4 >= 4, 5 >= 4)
      1, 6,  // save rolls → first fails (1 < 3), second passes (6 >= 3)
    ]);

    const result = resolveMeleePipeline(group, {
      defenderWS: 4,
      defenderToughness: 4,
      armorSave: 3,
      invulnerableSave: 0,
      targetModelWounds: new Map([
        ['target-model-1', 1],
        ['target-model-2', 1],
      ]),
    }, dice);

    // 2 hits → 2 wounds → 1 unsaved → 1 damage
    expect(result.hitResult.totalHits).toBe(2);
    expect(result.woundResult.totalWounds).toBe(2);
    expect(result.saveResult.unsavedWounds).toBe(1);
    expect(result.saveResult.savedWounds).toBe(1);
    expect(result.damageResult.totalWoundsApplied).toBe(1);
    expect(result.damageResult.casualties).toHaveLength(1);
  });
});
