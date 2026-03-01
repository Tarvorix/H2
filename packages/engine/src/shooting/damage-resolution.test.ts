/**
 * Damage Resolution Tests
 * Reference: HH_Rules_Battle.md — Step 9: Apply Damage
 */

import { describe, it, expect } from 'vitest';
import { FixedDiceProvider } from '../dice';
import {
  applyDamageToModel,
  resolveDamage,
  handleDamageMitigation,
} from './damage-resolution';
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

// ─── applyDamageToModel ─────────────────────────────────────────────────────

describe('applyDamageToModel', () => {
  it('2W model takes D1 wound: 1W remaining, not destroyed', () => {
    const result = applyDamageToModel(2, 1);
    expect(result.remainingWounds).toBe(1);
    expect(result.destroyed).toBe(false);
  });

  it('2W model takes D2 wound: 0W remaining, destroyed', () => {
    const result = applyDamageToModel(2, 2);
    expect(result.remainingWounds).toBe(0);
    expect(result.destroyed).toBe(true);
  });

  it('1W model takes D1 wound: 0W remaining, destroyed', () => {
    const result = applyDamageToModel(1, 1);
    expect(result.remainingWounds).toBe(0);
    expect(result.destroyed).toBe(true);
  });

  it('2W model takes D3 wound: 0W remaining (clamped), destroyed', () => {
    // Overkill damage is lost, wounds don't go negative
    const result = applyDamageToModel(2, 3);
    expect(result.remainingWounds).toBe(0);
    expect(result.destroyed).toBe(true);
  });

  it('3W model takes D1 wound: 2W remaining, not destroyed', () => {
    const result = applyDamageToModel(3, 1);
    expect(result.remainingWounds).toBe(2);
    expect(result.destroyed).toBe(false);
  });
});

// ─── resolveDamage ──────────────────────────────────────────────────────────

describe('resolveDamage', () => {
  it('applies multiple D1 wounds sequentially', () => {
    const wounds = [
      makeWound({ damage: 1 }),
      makeWound({ damage: 1 }),
    ];

    const result = resolveDamage(wounds, 'model-1', 3);

    expect(result.finalWounds).toBe(1);
    expect(result.destroyed).toBe(false);
    expect(result.totalDamageApplied).toBe(2);
  });

  it('model destroyed partway through: remaining wounds are lost', () => {
    const wounds = [
      makeWound({ damage: 2 }),
      makeWound({ damage: 1 }), // This wound should be lost
      makeWound({ damage: 1 }), // This wound should be lost
    ];

    const result = resolveDamage(wounds, 'model-1', 2);

    expect(result.finalWounds).toBe(0);
    expect(result.destroyed).toBe(true);
    // Only 2 damage applied (the first wound's D2), not 4 total
    expect(result.totalDamageApplied).toBe(2);
  });

  it('no wounds: model unchanged', () => {
    const result = resolveDamage([], 'model-1', 3);

    expect(result.finalWounds).toBe(3);
    expect(result.destroyed).toBe(false);
    expect(result.totalDamageApplied).toBe(0);
  });

  it('single wound that exactly kills model', () => {
    const wounds = [makeWound({ damage: 3 })];

    const result = resolveDamage(wounds, 'model-1', 3);

    expect(result.finalWounds).toBe(0);
    expect(result.destroyed).toBe(true);
    expect(result.totalDamageApplied).toBe(3);
  });

  it('overkill damage is capped to actual wounds remaining', () => {
    const wounds = [makeWound({ damage: 5 })];

    const result = resolveDamage(wounds, 'model-1', 2);

    expect(result.finalWounds).toBe(0);
    expect(result.destroyed).toBe(true);
    expect(result.totalDamageApplied).toBe(2); // Only 2 actual damage, not 5
  });
});

// ─── handleDamageMitigation ─────────────────────────────────────────────────

describe('handleDamageMitigation', () => {
  it('Shrouded(4+) damage mitigation: roll 4 discards wound', () => {
    const wounds = [makeWound({ assignedToModelId: 'model-1' })];

    // Roll 4 → >= 4 → wound discarded
    const dice = new FixedDiceProvider([4]);
    const result = handleDamageMitigation(wounds, 'Shrouded', 4, dice);

    expect(result.mitigatedWounds).toHaveLength(1);
    expect(result.remainingWounds).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'damageMitigationRoll',
      mitigationType: 'Shrouded',
      roll: 4,
      targetNumber: 4,
      passed: true,
    });
  });

  it('Shrouded(4+) damage mitigation: roll 3 does not discard wound', () => {
    const wounds = [makeWound({ assignedToModelId: 'model-1' })];

    // Roll 3 → < 4 → wound passes through
    const dice = new FixedDiceProvider([3]);
    const result = handleDamageMitigation(wounds, 'Shrouded', 4, dice);

    expect(result.mitigatedWounds).toHaveLength(0);
    expect(result.remainingWounds).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'damageMitigationRoll',
      passed: false,
    });
  });

  it('multiple wounds: each tested independently', () => {
    const wounds = [
      makeWound({ assignedToModelId: 'model-1' }),
      makeWound({ assignedToModelId: 'model-1' }),
      makeWound({ assignedToModelId: 'model-1' }),
    ];

    // Roll 5 → pass, Roll 2 → fail, Roll 4 → pass
    const dice = new FixedDiceProvider([5, 2, 4]);
    const result = handleDamageMitigation(wounds, 'Shrouded', 4, dice);

    expect(result.mitigatedWounds).toHaveLength(2);
    expect(result.remainingWounds).toHaveLength(1);
    expect(result.events).toHaveLength(3);
  });

  it('non-wound results pass through without mitigation roll', () => {
    const wounds = [
      makeWound({ isWound: false }), // Failed wound test — should pass through
      makeWound({ isWound: true }),   // Actual wound — should be tested
    ];

    // Only 1 die needed (for the actual wound)
    const dice = new FixedDiceProvider([6]);
    const result = handleDamageMitigation(wounds, 'Shrouded', 4, dice);

    // The non-wound goes to remainingWounds without a roll
    // The actual wound is mitigated (roll 6 >= 4)
    expect(result.remainingWounds).toHaveLength(1);
    expect(result.remainingWounds[0].isWound).toBe(false);
    expect(result.mitigatedWounds).toHaveLength(1);
    expect(result.mitigatedWounds[0].isWound).toBe(true);
    expect(result.events).toHaveLength(1); // Only 1 event for the actual wound
    expect(dice.rollsUsed).toBe(1);
  });

  it('Shrouded(5+) requires roll of 5 or higher', () => {
    const wounds = [makeWound()];

    // Roll 4 → < 5 → fails
    const dice = new FixedDiceProvider([4]);
    const result = handleDamageMitigation(wounds, 'Shrouded', 5, dice);

    expect(result.mitigatedWounds).toHaveLength(0);
    expect(result.remainingWounds).toHaveLength(1);
  });
});
