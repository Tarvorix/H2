/**
 * Combat Lookup Tables
 * Reference: HH_Tables.md — Melee Hit Table, Wound Table, Ranged Hit Table
 *
 * These encode the three core lookup tables used for all combat resolution.
 */

// ─── Melee Hit Table ──────────────────────────────────────────────────────────

/**
 * Melee Hit Table — Attacker's WS vs Defender's WS → target number on d6.
 * Reference: HH_Tables.md — "Melee Hit Table (Attacker's WS vs Defender's WS)"
 *
 * The table is 10x10 (WS 1-10 for both attacker and defender).
 * Values represent the minimum d6 roll needed to hit.
 *
 * Row = attacker WS (index 0 = WS1), Column = defender WS (index 0 = WS1)
 */
const MELEE_HIT_TABLE: number[][] = [
  // Def: 1   2   3   4   5   6   7   8   9  10
  /*  1 */ [4, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  /*  2 */ [2, 4, 5, 6, 6, 6, 6, 6, 6, 6],
  /*  3 */ [2, 3, 4, 5, 5, 6, 6, 6, 6, 6],
  /*  4 */ [2, 2, 3, 4, 4, 5, 5, 5, 6, 6],
  /*  5 */ [2, 2, 3, 3, 4, 4, 5, 5, 5, 6],
  /*  6 */ [2, 2, 2, 3, 3, 4, 4, 5, 5, 5],
  /*  7 */ [2, 2, 2, 3, 3, 3, 4, 4, 5, 5],
  /*  8 */ [2, 2, 2, 2, 3, 3, 3, 4, 5, 5],
  /*  9 */ [2, 2, 2, 2, 2, 3, 3, 3, 4, 5],
  /* 10 */ [2, 2, 2, 2, 2, 3, 3, 3, 3, 4],
];

/**
 * Look up the melee hit target number from the WS vs WS table.
 *
 * @param attackerWS - Attacker's current Weapon Skill (1-10+)
 * @param defenderWS - Defender's current Weapon Skill (1-10+)
 * @returns Target number on d6 (2-6). A roll of this value or higher is a hit.
 *
 * WS values above 10 are clamped to 10 (the table doesn't go higher).
 * WS values below 1 are clamped to 1.
 */
export function meleeHitTable(attackerWS: number, defenderWS: number): number {
  const attIdx = Math.max(0, Math.min(9, Math.floor(attackerWS) - 1));
  const defIdx = Math.max(0, Math.min(9, Math.floor(defenderWS) - 1));
  return MELEE_HIT_TABLE[attIdx][defIdx];
}

// ─── Wound Table ──────────────────────────────────────────────────────────────

/**
 * Wound Table — Weapon Strength vs Target Toughness → target number on d6.
 * Reference: HH_Tables.md — "Wound Table (Weapon's Strength vs Target's Toughness)"
 *
 * A value of 0 means the wound is impossible (cannot wound).
 * Row = Strength (index 0 = S1), Column = Toughness (index 0 = T1)
 */
const WOUND_TABLE: (number | null)[][] = [
  // T:    1     2     3     4     5     6     7     8     9    10
  /* S1 */ [4, 5, 6, 6, null, null, null, null, null, null],
  /* S2 */ [3, 4, 5, 6, 6, null, null, null, null, null],
  /* S3 */ [2, 3, 4, 5, 6, 6, null, null, null, null],
  /* S4 */ [2, 2, 3, 4, 5, 6, 6, null, null, null],
  /* S5 */ [2, 2, 2, 3, 4, 5, 6, 6, null, null],
  /* S6 */ [2, 2, 2, 2, 3, 4, 5, 6, 6, null],
  /* S7 */ [2, 2, 2, 2, 2, 3, 4, 5, 6, 6],
  /* S8 */ [2, 2, 2, 2, 2, 2, 3, 4, 5, 6],
  /* S9 */ [2, 2, 2, 2, 2, 2, 2, 3, 4, 5],
  /* S10 */[2, 2, 2, 2, 2, 2, 2, 2, 3, 4],
];

/**
 * Look up the wound target number from the S vs T table.
 *
 * @param strength - Weapon's Strength (1-10+)
 * @param toughness - Target's Toughness (1-10+)
 * @returns Target number on d6 (2-6) or null if the wound is impossible.
 *
 * S or T values above 10 are extrapolated using the pattern:
 * - Each point of S advantage reduces the target number by 1 (min 2)
 * - Each point of T advantage increases the target number by 1
 * - If the difference exceeds the table's range, wound is impossible (null)
 *
 * The pattern from the table:
 * - S == T → 4+
 * - S = T+1 → 3+
 * - S = T+2 or more → 2+
 * - S = T-1 → 5+
 * - S = T-2 → 6+
 * - S = T-3 → 6+ (capped)
 * - S <= T-4 (T is double or more of S) → impossible
 *
 * Actually checking the table more carefully:
 * - S >= T+2 → 2+
 * - S = T+1 → 3+
 * - S = T → 4+
 * - S = T-1 → 5+
 * - S = T-2 or T-3 → 6+
 * - S <= T-4 → impossible (null)
 */
export function woundTable(strength: number, toughness: number): number | null {
  // For values within the 1-10 table range, use direct lookup
  if (strength >= 1 && strength <= 10 && toughness >= 1 && toughness <= 10) {
    const sIdx = Math.floor(strength) - 1;
    const tIdx = Math.floor(toughness) - 1;
    return WOUND_TABLE[sIdx][tIdx];
  }

  // For values outside the table, extrapolate using the difference pattern
  const diff = Math.floor(strength) - Math.floor(toughness);

  if (diff >= 2) return 2;
  if (diff === 1) return 3;
  if (diff === 0) return 4;
  if (diff === -1) return 5;
  if (diff === -2 || diff === -3) return 6;
  // diff <= -4: impossible
  return null;
}

// ─── Ranged Hit Table ─────────────────────────────────────────────────────────

/**
 * Result of a ranged hit table lookup.
 */
export interface RangedHitResult {
  /** Target number on d6 to hit (2-6). If autoHit is true, this is irrelevant. */
  targetNumber: number;
  /** Whether hits are automatic (BS 10+) */
  autoHit: boolean;
  /** Whether hits auto-fail (BS 1 snap shots) */
  autoFail: boolean;
  /**
   * Critical hit threshold — if the natural roll is >= this value,
   * the hit becomes a Critical Hit (additional effects).
   * Only applies for BS 6-9 (critical on 6+, 5+, 4+, 3+ respectively).
   * Null means no critical hits on this profile.
   */
  criticalOn: number | null;
}

/**
 * Look up the ranged hit result from the BS table.
 * Reference: HH_Tables.md — "Ranged Hit Table (Ballistic Skill)"
 *
 * | BS | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
 * | Target | 6+ | 5+ | 4+ | 3+ | 2+ | C6+ | C5+ | C4+ | C3+ | A |
 *
 * Key: CX+ = hits on 2+ with Critical Hit on X+, A = automatic hit (counts as natural 6)
 *
 * @param ballisticSkill - Model's current Ballistic Skill (0-10+)
 * @returns Hit resolution parameters
 */
export function rangedHitTable(ballisticSkill: number): RangedHitResult {
  const bs = Math.floor(ballisticSkill);

  if (bs <= 0) {
    return { targetNumber: 7, autoHit: false, autoFail: true, criticalOn: null };
  }

  if (bs >= 10) {
    // BS 10+: Automatic hit (counts as natural 6)
    return { targetNumber: 2, autoHit: true, autoFail: false, criticalOn: null };
  }

  if (bs >= 6) {
    // BS 6-9: hits on 2+ with Critical on (13 - BS)+
    // BS6 → C6+, BS7 → C5+, BS8 → C4+, BS9 → C3+
    const criticalThreshold = 12 - bs; // BS6→6, BS7→5, BS8→4, BS9→3
    return { targetNumber: 2, autoHit: false, autoFail: false, criticalOn: criticalThreshold };
  }

  // BS 1-5: standard target numbers
  // BS1→6+, BS2→5+, BS3→4+, BS4→3+, BS5→2+
  const targetNumber = 7 - bs;
  return { targetNumber, autoHit: false, autoFail: false, criticalOn: null };
}

/**
 * Look up snap shot target number for a given BS.
 * Reference: HH_Tables.md — "Ranged Hit Table" Snap Shots row
 *
 * | BS | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
 * | Snap | F | 6+ | 6+ | 5+ | 5+ | 4+ | 4+ | 3+ | 3+ | 2+ |
 *
 * Key: F = automatic fail
 *
 * @param ballisticSkill - Model's current Ballistic Skill
 * @returns Hit resolution parameters for snap shots
 */
export function snapShotTable(ballisticSkill: number): RangedHitResult {
  const bs = Math.floor(ballisticSkill);

  if (bs <= 1) {
    return { targetNumber: 7, autoHit: false, autoFail: true, criticalOn: null };
  }

  if (bs >= 10) {
    return { targetNumber: 2, autoHit: false, autoFail: false, criticalOn: null };
  }

  // BS 2-9 snap shot target numbers
  // BS2→6, BS3→6, BS4→5, BS5→5, BS6→4, BS7→4, BS8→3, BS9→3
  const snapTargets: Record<number, number> = {
    2: 6, 3: 6, 4: 5, 5: 5, 6: 4, 7: 4, 8: 3, 9: 3,
  };

  return {
    targetNumber: snapTargets[bs],
    autoHit: false,
    autoFail: false,
    criticalOn: null, // No critical hits on snap shots
  };
}
