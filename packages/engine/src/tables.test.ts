/**
 * Tests for Combat Lookup Tables
 * Reference: HH_Tables.md
 */

import { describe, it, expect } from 'vitest';
import { meleeHitTable, woundTable, rangedHitTable, snapShotTable } from './tables';

// ─── Melee Hit Table Tests ────────────────────────────────────────────────────

describe('meleeHitTable', () => {
  it('WS4 vs WS4 → 4+ (equal skill)', () => {
    expect(meleeHitTable(4, 4)).toBe(4);
  });

  it('WS1 vs WS1 → 4+ (equal lowest skill)', () => {
    expect(meleeHitTable(1, 1)).toBe(4);
  });

  it('WS10 vs WS10 → 4+ (equal highest skill)', () => {
    expect(meleeHitTable(10, 10)).toBe(4);
  });

  it('WS1 vs WS10 → 6+ (worst vs best)', () => {
    expect(meleeHitTable(1, 10)).toBe(6);
  });

  it('WS10 vs WS1 → 2+ (best vs worst)', () => {
    expect(meleeHitTable(10, 1)).toBe(2);
  });

  it('WS5 vs WS4 → 3+ (slight advantage)', () => {
    expect(meleeHitTable(5, 4)).toBe(3);
  });

  it('WS4 vs WS5 → 4+ (slight disadvantage)', () => {
    expect(meleeHitTable(4, 5)).toBe(4);
  });

  it('WS2 vs WS1 → 2+ (low skill advantage)', () => {
    expect(meleeHitTable(2, 1)).toBe(2);
  });

  it('WS3 vs WS6 → 6+', () => {
    expect(meleeHitTable(3, 6)).toBe(6);
  });

  it('WS6 vs WS3 → 2+', () => {
    expect(meleeHitTable(6, 3)).toBe(2);
  });

  it('WS7 vs WS7 → 4+', () => {
    expect(meleeHitTable(7, 7)).toBe(4);
  });

  it('WS8 vs WS5 → 3+', () => {
    expect(meleeHitTable(8, 5)).toBe(3);
  });

  it('WS1 vs WS2 → 6+', () => {
    expect(meleeHitTable(1, 2)).toBe(6);
  });

  // Clamping behavior
  it('WS0 clamps to WS1 → treats as WS1 vs WS4', () => {
    expect(meleeHitTable(0, 4)).toBe(meleeHitTable(1, 4));
  });

  it('WS15 clamps to WS10 → treats as WS10 vs WS4', () => {
    expect(meleeHitTable(15, 4)).toBe(meleeHitTable(10, 4));
  });

  // Full row verification for WS4 attacker (from table)
  it('WS4 attacker full row', () => {
    expect(meleeHitTable(4, 1)).toBe(2);
    expect(meleeHitTable(4, 2)).toBe(2);
    expect(meleeHitTable(4, 3)).toBe(3);
    expect(meleeHitTable(4, 4)).toBe(4);
    expect(meleeHitTable(4, 5)).toBe(4);
    expect(meleeHitTable(4, 6)).toBe(5);
    expect(meleeHitTable(4, 7)).toBe(5);
    expect(meleeHitTable(4, 8)).toBe(5);
    expect(meleeHitTable(4, 9)).toBe(6);
    expect(meleeHitTable(4, 10)).toBe(6);
  });

  // Verify the table is symmetrically structured (not mathematically symmetric)
  it('diagonal entries are all 4+', () => {
    for (let ws = 1; ws <= 10; ws++) {
      expect(meleeHitTable(ws, ws)).toBe(4);
    }
  });
});

// ─── Wound Table Tests ────────────────────────────────────────────────────────

describe('woundTable', () => {
  it('S4 vs T4 → 4+ (equal)', () => {
    expect(woundTable(4, 4)).toBe(4);
  });

  it('S8 vs T4 → 2+ (double strength)', () => {
    expect(woundTable(8, 4)).toBe(2);
  });

  it('S3 vs T7 → impossible (null)', () => {
    expect(woundTable(3, 7)).toBeNull();
  });

  it('S1 vs T5 → impossible (null)', () => {
    expect(woundTable(1, 5)).toBeNull();
  });

  it('S4 vs T3 → 3+ (one higher)', () => {
    expect(woundTable(4, 3)).toBe(3);
  });

  it('S3 vs T4 → 5+ (one lower)', () => {
    expect(woundTable(3, 4)).toBe(5);
  });

  it('S6 vs T4 → 2+ (two higher)', () => {
    expect(woundTable(6, 4)).toBe(2);
  });

  it('S4 vs T6 → 6+ (two lower)', () => {
    expect(woundTable(4, 6)).toBe(6);
  });

  it('S1 vs T1 → 4+ (equal, lowest)', () => {
    expect(woundTable(1, 1)).toBe(4);
  });

  it('S10 vs T10 → 4+ (equal, highest)', () => {
    expect(woundTable(10, 10)).toBe(4);
  });

  it('S10 vs T1 → 2+ (maximum advantage)', () => {
    expect(woundTable(10, 1)).toBe(2);
  });

  it('S1 vs T10 → impossible (null)', () => {
    expect(woundTable(1, 10)).toBeNull();
  });

  // Edge cases at the impossible boundary
  it('S1 vs T4 → 6+ (just barely woundable)', () => {
    expect(woundTable(1, 4)).toBe(6);
  });

  it('S2 vs T5 → 6+ (just barely woundable)', () => {
    expect(woundTable(2, 5)).toBe(6);
  });

  it('S3 vs T6 → 6+ (just barely woundable)', () => {
    expect(woundTable(3, 6)).toBe(6);
  });

  // Verify the impossible diagonal (S vs T where T is 4+ higher)
  it('impossible wounds: S <= T-4', () => {
    expect(woundTable(1, 5)).toBeNull();
    expect(woundTable(1, 6)).toBeNull();
    expect(woundTable(2, 6)).toBeNull();
    expect(woundTable(2, 7)).toBeNull();
    expect(woundTable(3, 7)).toBeNull();
    expect(woundTable(3, 8)).toBeNull();
    expect(woundTable(4, 8)).toBeNull();
    expect(woundTable(4, 9)).toBeNull();
    expect(woundTable(5, 9)).toBeNull();
    expect(woundTable(5, 10)).toBeNull();
    expect(woundTable(6, 10)).toBeNull();
  });

  // Full row verification for S4 (from table)
  it('S4 full row', () => {
    expect(woundTable(4, 1)).toBe(2);
    expect(woundTable(4, 2)).toBe(2);
    expect(woundTable(4, 3)).toBe(3);
    expect(woundTable(4, 4)).toBe(4);
    expect(woundTable(4, 5)).toBe(5);
    expect(woundTable(4, 6)).toBe(6);
    expect(woundTable(4, 7)).toBe(6);
    expect(woundTable(4, 8)).toBeNull();
    expect(woundTable(4, 9)).toBeNull();
    expect(woundTable(4, 10)).toBeNull();
  });

  // Extrapolation for values > 10
  it('S12 vs T10 → 2+ (extrapolated)', () => {
    expect(woundTable(12, 10)).toBe(2);
  });

  it('S11 vs T10 → 3+ (extrapolated)', () => {
    expect(woundTable(11, 10)).toBe(3);
  });

  it('S10 vs T14 → impossible (extrapolated)', () => {
    expect(woundTable(10, 14)).toBeNull();
  });

  it('S10 vs T12 → 6+ (extrapolated)', () => {
    expect(woundTable(10, 12)).toBe(6);
  });
});

// ─── Ranged Hit Table Tests ───────────────────────────────────────────────────

describe('rangedHitTable', () => {
  it('BS1 → 6+', () => {
    const result = rangedHitTable(1);
    expect(result.targetNumber).toBe(6);
    expect(result.autoHit).toBe(false);
    expect(result.autoFail).toBe(false);
    expect(result.criticalOn).toBeNull();
  });

  it('BS2 → 5+', () => {
    expect(rangedHitTable(2).targetNumber).toBe(5);
  });

  it('BS3 → 4+', () => {
    expect(rangedHitTable(3).targetNumber).toBe(4);
  });

  it('BS4 → 3+', () => {
    expect(rangedHitTable(4).targetNumber).toBe(3);
  });

  it('BS5 → 2+', () => {
    expect(rangedHitTable(5).targetNumber).toBe(2);
  });

  it('BS6 → 2+ with critical on 6+', () => {
    const result = rangedHitTable(6);
    expect(result.targetNumber).toBe(2);
    expect(result.criticalOn).toBe(6);
  });

  it('BS7 → 2+ with critical on 5+', () => {
    const result = rangedHitTable(7);
    expect(result.targetNumber).toBe(2);
    expect(result.criticalOn).toBe(5);
  });

  it('BS8 → 2+ with critical on 4+', () => {
    const result = rangedHitTable(8);
    expect(result.targetNumber).toBe(2);
    expect(result.criticalOn).toBe(4);
  });

  it('BS9 → 2+ with critical on 3+', () => {
    const result = rangedHitTable(9);
    expect(result.targetNumber).toBe(2);
    expect(result.criticalOn).toBe(3);
  });

  it('BS10 → auto hit', () => {
    const result = rangedHitTable(10);
    expect(result.autoHit).toBe(true);
    expect(result.autoFail).toBe(false);
  });

  it('BS10+ (e.g., 12) → auto hit', () => {
    const result = rangedHitTable(12);
    expect(result.autoHit).toBe(true);
  });

  it('BS0 → auto fail', () => {
    const result = rangedHitTable(0);
    expect(result.autoFail).toBe(true);
  });

  // Verify no BS 1-5 has critical hits
  it('BS 1-5 have no critical hit threshold', () => {
    for (let bs = 1; bs <= 5; bs++) {
      expect(rangedHitTable(bs).criticalOn).toBeNull();
    }
  });

  // Verify all BS 6-9 have critical hits
  it('BS 6-9 all have critical hit thresholds', () => {
    for (let bs = 6; bs <= 9; bs++) {
      expect(rangedHitTable(bs).criticalOn).not.toBeNull();
    }
  });
});

// ─── Snap Shot Table Tests ────────────────────────────────────────────────────

describe('snapShotTable', () => {
  it('BS1 → auto fail (F)', () => {
    const result = snapShotTable(1);
    expect(result.autoFail).toBe(true);
  });

  it('BS2 → 6+', () => {
    expect(snapShotTable(2).targetNumber).toBe(6);
  });

  it('BS3 → 6+', () => {
    expect(snapShotTable(3).targetNumber).toBe(6);
  });

  it('BS4 → 5+', () => {
    expect(snapShotTable(4).targetNumber).toBe(5);
  });

  it('BS5 → 5+', () => {
    expect(snapShotTable(5).targetNumber).toBe(5);
  });

  it('BS6 → 4+', () => {
    expect(snapShotTable(6).targetNumber).toBe(4);
  });

  it('BS7 → 4+', () => {
    expect(snapShotTable(7).targetNumber).toBe(4);
  });

  it('BS8 → 3+', () => {
    expect(snapShotTable(8).targetNumber).toBe(3);
  });

  it('BS9 → 3+', () => {
    expect(snapShotTable(9).targetNumber).toBe(3);
  });

  it('BS10+ → 2+', () => {
    expect(snapShotTable(10).targetNumber).toBe(2);
  });

  // Snap shots never have critical hits
  it('snap shots have no critical hit threshold at any BS', () => {
    for (let bs = 1; bs <= 12; bs++) {
      expect(snapShotTable(bs).criticalOn).toBeNull();
    }
  });

  // Snap shots are always worse than normal shots
  it('snap shot target is >= normal target for all BS', () => {
    for (let bs = 1; bs <= 10; bs++) {
      const normal = rangedHitTable(bs);
      const snap = snapShotTable(bs);
      if (!normal.autoHit && !snap.autoFail) {
        expect(snap.targetNumber).toBeGreaterThanOrEqual(normal.targetNumber);
      }
    }
  });
});
