/**
 * Armour Penetration Tests
 * Reference: HH_Rules_Battle.md — Step 7: Resolve Armour Penetration (vehicles)
 */

import { describe, it, expect } from 'vitest';
import { VehicleFacing } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import { resolveArmourPenetration } from './armour-penetration';
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
    weaponStrength: 9,
    weaponAP: null,
    weaponDamage: 1,
    specialRules: [],
    ...overrides,
  };
}

// ─── resolveArmourPenetration ───────────────────────────────────────────────

describe('resolveArmourPenetration', () => {
  it('S9 vs AV11: roll 2 (total 11 = glancing), roll 3 (total 12 = penetrating)', () => {
    const hits = [
      makeHit({ weaponStrength: 9 }),
      makeHit({ weaponStrength: 9 }),
    ];

    // Roll 2 → 2+9=11 = AV11 → glancing
    // Roll 3 → 3+9=12 > AV11 → penetrating
    const dice = new FixedDiceProvider([2, 3]);
    const result = resolveArmourPenetration(hits, 11, VehicleFacing.Front, dice);

    expect(result.glancingHits).toHaveLength(1);
    expect(result.glancingHits[0].facing).toBe(VehicleFacing.Front);

    expect(result.penetratingHits).toHaveLength(1);
    expect(result.penetratingHits[0].isPenetrating).toBe(true);
    expect(result.penetratingHits[0].total).toBe(12);
    expect(result.penetratingHits[0].armourValue).toBe(11);
    expect(result.penetratingHits[0].facing).toBe(VehicleFacing.Front);
  });

  it('Armourbane: glancing hit (total = AV) becomes penetrating', () => {
    const hits = [
      makeHit({
        weaponStrength: 9,
        specialRules: [{ name: 'Armourbane' }],
      }),
    ];

    // Roll 2 → 2+9=11 = AV11 → would be glancing, but Armourbane promotes to penetrating
    const dice = new FixedDiceProvider([2]);
    const result = resolveArmourPenetration(hits, 11, VehicleFacing.Front, dice);

    expect(result.glancingHits).toHaveLength(0);
    expect(result.penetratingHits).toHaveLength(1);
    expect(result.penetratingHits[0].isPenetrating).toBe(true);
    expect(result.penetratingHits[0].total).toBe(11);
  });

  it('Sunder: failed roll (total < AV) gets re-rolled', () => {
    const hits = [
      makeHit({
        weaponStrength: 9,
        specialRules: [{ name: 'Sunder' }],
      }),
    ];

    // First roll: 1 → 1+9=10 < AV11 → fail, Sunder triggers re-roll
    // Re-roll: 3 → 3+9=12 > AV11 → penetrating
    const dice = new FixedDiceProvider([1, 3]);
    const result = resolveArmourPenetration(hits, 11, VehicleFacing.Front, dice);

    expect(result.penetratingHits).toHaveLength(1);
    expect(result.penetratingHits[0].total).toBe(12);
    expect(result.glancingHits).toHaveLength(0);
  });

  it('S4 vs AV14: impossible to penetrate (max d6+4=10 < 14), all miss', () => {
    const hits = [
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
      makeHit({ weaponStrength: 4 }),
    ];

    // Best possible: 6+4=10 < AV14 → all miss
    const dice = new FixedDiceProvider([6, 5, 4]);
    const result = resolveArmourPenetration(hits, 14, VehicleFacing.Front, dice);

    expect(result.penetratingHits).toHaveLength(0);
    expect(result.glancingHits).toHaveLength(0);

    // Check event
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'armourPenetrationRoll',
      misses: 3,
    });
  });

  it('miss when total < AV (no special rules)', () => {
    const hits = [
      makeHit({ weaponStrength: 9 }),
    ];

    // Roll 1 → 1+9=10 < AV11 → miss
    const dice = new FixedDiceProvider([1]);
    const result = resolveArmourPenetration(hits, 11, VehicleFacing.Side, dice);

    expect(result.penetratingHits).toHaveLength(0);
    expect(result.glancingHits).toHaveLength(0);
  });

  it('emits an ArmourPenetrationRollEvent', () => {
    const hits = [makeHit({ weaponStrength: 9 })];
    const dice = new FixedDiceProvider([3]);
    const result = resolveArmourPenetration(hits, 11, VehicleFacing.Rear, dice);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'armourPenetrationRoll',
      strength: 9,
      armourValue: 11,
      facing: VehicleFacing.Rear,
    });
  });

  it('Sunder re-roll still fails if re-roll is also below AV', () => {
    const hits = [
      makeHit({
        weaponStrength: 9,
        specialRules: [{ name: 'Sunder' }],
      }),
    ];

    // First roll: 1 → 1+9=10 < AV12 → fail, Sunder triggers re-roll
    // Re-roll: 1 → 1+9=10 < AV12 → still fail
    const dice = new FixedDiceProvider([1, 1]);
    const result = resolveArmourPenetration(hits, 12, VehicleFacing.Front, dice);

    expect(result.penetratingHits).toHaveLength(0);
    expect(result.glancingHits).toHaveLength(0);
  });
});
