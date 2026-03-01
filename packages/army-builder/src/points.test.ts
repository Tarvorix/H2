/**
 * Points Calculation Tests.
 */

import { describe, it, expect } from 'vitest';
import { BattlefieldRole, DetachmentType, LegionFaction } from '@hh/types';
import type { UnitProfile, ArmyListUnit, ArmyListDetachment } from '@hh/types';
import {
  calculateUnitPoints,
  calculateArmyTotalPoints,
  isOverPointsLimit,
  calculateLordOfWarCap,
  getLordOfWarAndWarlordPoints,
  isOverLordOfWarCap,
  getAlliedPointsCap,
  getAlliedPoints,
  isOverAlliedCap,
} from './points';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UnitProfile> = {}): UnitProfile {
  return {
    id: 'test-unit',
    name: 'Test Unit',
    basePoints: 100,
    battlefieldRole: BattlefieldRole.Troops,
    modelDefinitions: [],
    minModels: 5,
    maxModels: 10,
    pointsPerAdditionalModel: 15,
    defaultWargear: [],
    wargearOptions: [
      {
        type: 'add',
        description: 'Power sword',
        adds: ['power-sword'],
        pointsCost: 10,
        scope: 'one-model',
      },
      {
        type: 'exchange',
        description: 'Upgrade to heavy bolter',
        removes: ['bolter'],
        adds: ['heavy-bolter'],
        pointsCost: 5,
        scope: 'any-model',
      },
    ],
    specialRules: [],
    traits: [],
    ...overrides,
  } as UnitProfile;
}

function makeUnit(
  overrides: Partial<ArmyListUnit> = {},
): ArmyListUnit {
  return {
    id: 'unit-1',
    profileId: 'test-unit',
    modelCount: 5,
    selectedOptions: [],
    totalPoints: 100,
    battlefieldRole: BattlefieldRole.Troops,
    ...overrides,
  };
}

function makeDetachment(
  overrides: Partial<ArmyListDetachment> = {},
): ArmyListDetachment {
  return {
    id: 'det-1',
    detachmentTemplateId: 'crusade-primary',
    type: DetachmentType.Primary,
    faction: LegionFaction.SonsOfHorus,
    units: [],
    ...overrides,
  };
}

// ─── calculateUnitPoints ─────────────────────────────────────────────────────

describe('calculateUnitPoints', () => {
  it('returns base points for minimum model count', () => {
    const profile = makeProfile({ basePoints: 100, minModels: 5 });
    expect(calculateUnitPoints(profile, 5)).toBe(100);
  });

  it('adds per-model cost for additional models', () => {
    const profile = makeProfile({
      basePoints: 100,
      minModels: 5,
      pointsPerAdditionalModel: 15,
    });
    expect(calculateUnitPoints(profile, 7)).toBe(100 + 2 * 15); // 130
  });

  it('adds wargear option costs', () => {
    const profile = makeProfile({ basePoints: 100 });
    const options = [{ optionIndex: 0, count: 1 }]; // 1x power sword = 10pts
    expect(calculateUnitPoints(profile, 5, options)).toBe(110);
  });

  it('multiplies wargear cost by count', () => {
    const profile = makeProfile({ basePoints: 100 });
    const options = [{ optionIndex: 1, count: 3 }]; // 3x heavy bolter upgrade = 15pts
    expect(calculateUnitPoints(profile, 5, options)).toBe(115);
  });

  it('combines additional models and wargear costs', () => {
    const profile = makeProfile({
      basePoints: 100,
      minModels: 5,
      pointsPerAdditionalModel: 15,
    });
    const options = [
      { optionIndex: 0, count: 1 }, // 10pts
      { optionIndex: 1, count: 2 }, // 10pts
    ];
    expect(calculateUnitPoints(profile, 8, options)).toBe(
      100 + 3 * 15 + 10 + 10, // 165
    );
  });

  it('ignores invalid option indices', () => {
    const profile = makeProfile({ basePoints: 100 });
    const options = [{ optionIndex: 99, count: 1 }];
    expect(calculateUnitPoints(profile, 5, options)).toBe(100);
  });

  it('handles zero additional models', () => {
    const profile = makeProfile({
      basePoints: 50,
      minModels: 1,
      pointsPerAdditionalModel: 25,
    });
    expect(calculateUnitPoints(profile, 1)).toBe(50);
  });

  it('does not subtract points if model count is below minimum', () => {
    const profile = makeProfile({
      basePoints: 100,
      minModels: 5,
      pointsPerAdditionalModel: 15,
    });
    // Model count below minimum — additional models = max(0, 3-5) = 0
    expect(calculateUnitPoints(profile, 3)).toBe(100);
  });
});

// ─── calculateArmyTotalPoints ────────────────────────────────────────────────

describe('calculateArmyTotalPoints', () => {
  it('sums all unit points', () => {
    const units = [
      makeUnit({ totalPoints: 100 }),
      makeUnit({ totalPoints: 200 }),
      makeUnit({ totalPoints: 150 }),
    ];
    expect(calculateArmyTotalPoints(units)).toBe(450);
  });

  it('returns 0 for empty units array', () => {
    expect(calculateArmyTotalPoints([])).toBe(0);
  });
});

// ─── isOverPointsLimit ───────────────────────────────────────────────────────

describe('isOverPointsLimit', () => {
  it('returns false when under limit', () => {
    expect(isOverPointsLimit(1900, 2000)).toBe(false);
  });

  it('returns false when at exact limit', () => {
    expect(isOverPointsLimit(2000, 2000)).toBe(false);
  });

  it('returns true when over limit', () => {
    expect(isOverPointsLimit(2001, 2000)).toBe(true);
  });
});

// ─── Lord of War Cap ─────────────────────────────────────────────────────────

describe('Lord of War Cap', () => {
  it('calculateLordOfWarCap is 25% rounded up', () => {
    expect(calculateLordOfWarCap(2000)).toBe(500);
    expect(calculateLordOfWarCap(3000)).toBe(750);
    expect(calculateLordOfWarCap(1500)).toBe(375);
    // Non-round numbers round up
    expect(calculateLordOfWarCap(1001)).toBe(251);
  });

  it('getLordOfWarAndWarlordPoints sums LoW and Warlord units', () => {
    const units = [
      makeUnit({ battlefieldRole: BattlefieldRole.LordOfWar, totalPoints: 400 }),
      makeUnit({ battlefieldRole: BattlefieldRole.Warlord, totalPoints: 200 }),
      makeUnit({ battlefieldRole: BattlefieldRole.Troops, totalPoints: 100 }),
    ];
    expect(getLordOfWarAndWarlordPoints(units)).toBe(600);
  });

  it('getLordOfWarAndWarlordPoints ignores non-LoW/Warlord units', () => {
    const units = [
      makeUnit({ battlefieldRole: BattlefieldRole.Troops, totalPoints: 100 }),
      makeUnit({ battlefieldRole: BattlefieldRole.Command, totalPoints: 200 }),
    ];
    expect(getLordOfWarAndWarlordPoints(units)).toBe(0);
  });

  it('isOverLordOfWarCap detects over cap', () => {
    const units = [
      makeUnit({ battlefieldRole: BattlefieldRole.LordOfWar, totalPoints: 600 }),
    ];
    expect(isOverLordOfWarCap(units, 2000)).toBe(true); // cap = 500
    expect(isOverLordOfWarCap(units, 3000)).toBe(false); // cap = 750
  });

  it('isOverLordOfWarCap allows exactly at cap', () => {
    const units = [
      makeUnit({ battlefieldRole: BattlefieldRole.LordOfWar, totalPoints: 500 }),
    ];
    expect(isOverLordOfWarCap(units, 2000)).toBe(false); // cap = 500
  });
});

// ─── Allied Points Cap ───────────────────────────────────────────────────────

describe('Allied Points Cap', () => {
  it('getAlliedPointsCap is 50% rounded up', () => {
    expect(getAlliedPointsCap(2000)).toBe(1000);
    expect(getAlliedPointsCap(3000)).toBe(1500);
    expect(getAlliedPointsCap(1001)).toBe(501);
  });

  it('getAlliedPoints sums units in Allied detachments only', () => {
    const detachments = [
      makeDetachment({
        type: DetachmentType.Primary,
        units: [makeUnit({ totalPoints: 500 })],
      }),
      makeDetachment({
        type: DetachmentType.Allied,
        units: [
          makeUnit({ totalPoints: 200 }),
          makeUnit({ totalPoints: 300 }),
        ],
      }),
    ];
    expect(getAlliedPoints(detachments)).toBe(500);
  });

  it('getAlliedPoints returns 0 when no Allied detachments', () => {
    const detachments = [
      makeDetachment({
        type: DetachmentType.Primary,
        units: [makeUnit({ totalPoints: 1000 })],
      }),
    ];
    expect(getAlliedPoints(detachments)).toBe(0);
  });

  it('isOverAlliedCap detects over cap', () => {
    const detachments = [
      makeDetachment({
        type: DetachmentType.Allied,
        units: [makeUnit({ totalPoints: 1100 })],
      }),
    ];
    expect(isOverAlliedCap(detachments, 2000)).toBe(true); // cap = 1000
  });

  it('isOverAlliedCap allows exactly at cap', () => {
    const detachments = [
      makeDetachment({
        type: DetachmentType.Allied,
        units: [makeUnit({ totalPoints: 1000 })],
      }),
    ];
    expect(isOverAlliedCap(detachments, 2000)).toBe(false); // cap = 1000
  });
});
