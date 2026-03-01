/**
 * Army Validation Tests.
 */

import { describe, it, expect } from 'vitest';
import { BattlefieldRole, DetachmentType, LegionFaction, Allegiance } from '@hh/types';
import type { ArmyList, ArmyListDetachment, ArmyListUnit } from '@hh/types';
import {
  validateArmyList,
  validatePrimaryDetachment,
  validatePointsLimit,
  validateLordOfWarCap,
  validateWarlordPointsThreshold,
  validateAlliedDetachment,
  validateMandatorySlots,
  validateDetachmentCounts,
  validateUnitEligibility,
  validateWarlordDesignation,
  validateArmyListForMvp,
  validateMvpFactionScope,
  validateUnitProfilesExist,
} from './validation';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<ArmyListUnit> = {}): ArmyListUnit {
  return {
    id: 'unit-1',
    profileId: 'tactical-squad',
    modelCount: 10,
    selectedOptions: [],
    totalPoints: 150,
    battlefieldRole: BattlefieldRole.Troops,
    ...overrides,
  };
}

function makeDetachment(overrides: Partial<ArmyListDetachment> = {}): ArmyListDetachment {
  return {
    id: 'det-primary',
    detachmentTemplateId: 'crusade-primary',
    type: DetachmentType.Primary,
    faction: LegionFaction.SonsOfHorus,
    units: [],
    ...overrides,
  };
}

function makeValidArmy(overrides: Partial<ArmyList> = {}): ArmyList {
  return {
    playerName: 'Test Player',
    pointsLimit: 2000,
    totalPoints: 1800,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    detachments: [
      makeDetachment({
        units: [
          makeUnit({
            id: 'hc-1',
            battlefieldRole: BattlefieldRole.HighCommand,
            totalPoints: 200,
          }),
          makeUnit({
            id: 'cmd-1',
            battlefieldRole: BattlefieldRole.Command,
            totalPoints: 150,
          }),
          makeUnit({
            id: 'troops-1',
            battlefieldRole: BattlefieldRole.Troops,
            totalPoints: 150,
          }),
          makeUnit({
            id: 'troops-2',
            battlefieldRole: BattlefieldRole.Troops,
            totalPoints: 150,
          }),
        ],
      }),
    ],
    ...overrides,
  };
}

// ─── validateArmyList (master) ───────────────────────────────────────────────

describe('validateArmyList', () => {
  it('returns valid for a legal army', () => {
    const result = validateArmyList(makeValidArmy());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid if no Primary detachment', () => {
    const result = validateArmyList(
      makeValidArmy({ detachments: [] }),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Primary Detachment'))).toBe(true);
  });
});

// ─── validatePrimaryDetachment ───────────────────────────────────────────────

describe('validatePrimaryDetachment', () => {
  it('error when no Primary detachment', () => {
    const army = makeValidArmy({ detachments: [] });
    const errors = validatePrimaryDetachment(army);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('exactly one Primary');
  });

  it('error when multiple Primary detachments', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({ id: 'primary-1' }),
        makeDetachment({ id: 'primary-2' }),
      ],
    });
    const errors = validatePrimaryDetachment(army);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 Primary');
  });

  it('no error for exactly one Primary', () => {
    const errors = validatePrimaryDetachment(makeValidArmy());
    expect(errors).toHaveLength(0);
  });

  it('does not treat Warlord or Lord of War detachments as additional Primary detachments', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          id: 'primary-main',
          detachmentTemplateId: 'crusade-primary',
        }),
        makeDetachment({
          id: 'warlord-det',
          detachmentTemplateId: 'warlord-detachment',
          type: DetachmentType.Primary,
        }),
        makeDetachment({
          id: 'low-det',
          detachmentTemplateId: 'lord-of-war-detachment',
          type: DetachmentType.Primary,
        }),
      ],
    });

    const errors = validatePrimaryDetachment(army);
    expect(errors).toHaveLength(0);
  });
});

// ─── validatePointsLimit ─────────────────────────────────────────────────────

describe('validatePointsLimit', () => {
  it('error when over points limit', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [makeUnit({ totalPoints: 2100 })],
        }),
      ],
    });
    const errors = validatePointsLimit(army);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('exceeds');
  });

  it('no error when under limit', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [makeUnit({ totalPoints: 1800 })],
        }),
      ],
    });
    expect(validatePointsLimit(army)).toHaveLength(0);
  });

  it('no error when exactly at limit', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [makeUnit({ totalPoints: 2000 })],
        }),
      ],
    });
    expect(validatePointsLimit(army)).toHaveLength(0);
  });
});

// ─── validateLordOfWarCap ────────────────────────────────────────────────────

describe('validateLordOfWarCap', () => {
  it('error when LoW units exceed 25%', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [
            makeUnit({
              id: 'low-1',
              battlefieldRole: BattlefieldRole.LordOfWar,
              totalPoints: 600,
            }),
          ],
        }),
      ],
    });
    const errors = validateLordOfWarCap(army);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('25% cap');
  });

  it('no error when LoW units are under 25%', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [
            makeUnit({
              id: 'low-1',
              battlefieldRole: BattlefieldRole.LordOfWar,
              totalPoints: 400,
            }),
          ],
        }),
      ],
    });
    expect(validateLordOfWarCap(army)).toHaveLength(0);
  });
});

// ─── validateWarlordPointsThreshold ──────────────────────────────────────────

describe('validateWarlordPointsThreshold', () => {
  it('error when Warlord role units at < 3000 points', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment({
          units: [
            makeUnit({ battlefieldRole: BattlefieldRole.Warlord }),
          ],
        }),
      ],
    });
    const errors = validateWarlordPointsThreshold(army);
    expect(errors.some((e) => e.message.includes('3,000+'))).toBe(true);
  });

  it('no error at 3000+ points with Warlord units', () => {
    const army = makeValidArmy({
      pointsLimit: 3000,
      detachments: [
        makeDetachment({
          units: [
            makeUnit({ battlefieldRole: BattlefieldRole.Warlord }),
          ],
        }),
      ],
    });
    expect(validateWarlordPointsThreshold(army)).toHaveLength(0);
  });

  it('error when Warlord Detachment at < 3000 points', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'warlord-det',
          detachmentTemplateId: 'warlord-detachment',
        }),
      ],
    });
    const errors = validateWarlordPointsThreshold(army);
    expect(errors.some((e) => e.message.includes('Warlord Detachment'))).toBe(true);
  });
});

// ─── validateAlliedDetachment ────────────────────────────────────────────────

describe('validateAlliedDetachment', () => {
  it('error when Allied faction matches Primary', () => {
    const army = makeValidArmy({
      faction: LegionFaction.SonsOfHorus,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'allied-det',
          detachmentTemplateId: 'allied-detachment',
          type: DetachmentType.Allied,
          faction: LegionFaction.SonsOfHorus, // Same as primary!
        }),
      ],
    });
    const errors = validateAlliedDetachment(army);
    expect(errors.some((e) => e.message.includes('different faction'))).toBe(true);
  });

  it('error when Allied points exceed 50%', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'allied-det',
          detachmentTemplateId: 'allied-detachment',
          type: DetachmentType.Allied,
          faction: LegionFaction.WorldEaters,
          units: [makeUnit({ totalPoints: 1100 })],
        }),
      ],
    });
    const errors = validateAlliedDetachment(army);
    expect(errors.some((e) => e.message.includes('50% cap'))).toBe(true);
  });

  it('no error for valid Allied detachment', () => {
    const army = makeValidArmy({
      pointsLimit: 2000,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'allied-det',
          detachmentTemplateId: 'allied-detachment',
          type: DetachmentType.Allied,
          faction: LegionFaction.WorldEaters,
          units: [makeUnit({ totalPoints: 500 })],
        }),
      ],
    });
    const errors = validateAlliedDetachment(army);
    expect(errors).toHaveLength(0);
  });

  it('no error when no Allied detachments', () => {
    expect(validateAlliedDetachment(makeValidArmy())).toHaveLength(0);
  });
});

// ─── validateMandatorySlots ──────────────────────────────────────────────────

describe('validateMandatorySlots', () => {
  it('error when mandatory HC slot is empty', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [makeUnit({ battlefieldRole: BattlefieldRole.Troops })],
        }),
      ],
    });
    const errors = validateMandatorySlots(army);
    expect(errors.some((e) => e.message.includes('mandatory'))).toBe(true);
  });

  it('no error when mandatory HC slot is filled', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [makeUnit({ battlefieldRole: BattlefieldRole.HighCommand })],
        }),
      ],
    });
    expect(validateMandatorySlots(army)).toHaveLength(0);
  });
});

// ─── validateDetachmentCounts ────────────────────────────────────────────────

describe('validateDetachmentCounts', () => {
  it('error when more Auxiliary than unlocked', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [], // No Command/HC filled = 0 unlocked
        }),
        makeDetachment({
          id: 'aux-1',
          detachmentTemplateId: 'armoured-fist',
          type: DetachmentType.Auxiliary,
          units: [],
        }),
      ],
    });
    const errors = validateDetachmentCounts(army);
    expect(errors.some((e) => e.message.includes('Auxiliary'))).toBe(true);
  });

  it('no error when Auxiliary count matches unlocked', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [
            makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
          ],
        }),
        makeDetachment({
          id: 'aux-1',
          detachmentTemplateId: 'armoured-fist',
          type: DetachmentType.Auxiliary,
          units: [],
        }),
      ],
    });
    const errors = validateDetachmentCounts(army);
    expect(errors.filter((e) => e.message.includes('Auxiliary'))).toHaveLength(0);
  });
});

// ─── validateUnitEligibility ─────────────────────────────────────────────────

describe('validateUnitEligibility', () => {
  it('error when unit role does not match any template slot', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [
            makeUnit({
              id: 'wrong-role',
              battlefieldRole: BattlefieldRole.LordOfWar, // Not in Crusade Primary
            }),
          ],
        }),
      ],
    });
    const errors = validateUnitEligibility(army);
    expect(errors.some((e) => e.message.includes('no matching slot'))).toBe(true);
  });

  it('no error when unit roles match template slots', () => {
    const errors = validateUnitEligibility(makeValidArmy());
    expect(errors).toHaveLength(0);
  });

  it('error when more units of a role than slots available', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [
            // 5 Troops units, but Crusade Primary only has 4 Troops slots
            makeUnit({ id: 't-1', battlefieldRole: BattlefieldRole.Troops }),
            makeUnit({ id: 't-2', battlefieldRole: BattlefieldRole.Troops }),
            makeUnit({ id: 't-3', battlefieldRole: BattlefieldRole.Troops }),
            makeUnit({ id: 't-4', battlefieldRole: BattlefieldRole.Troops }),
            makeUnit({ id: 't-5', battlefieldRole: BattlefieldRole.Troops }),
          ],
        }),
      ],
    });
    const errors = validateUnitEligibility(army);
    expect(errors.some((e) => e.message.includes('5 Troops units but only 4'))).toBe(true);
  });
});

// ─── validateWarlordDesignation ──────────────────────────────────────────────

describe('validateWarlordDesignation', () => {
  it('error when Warlord Detachment faction differs from Primary', () => {
    const army = makeValidArmy({
      pointsLimit: 3000,
      faction: LegionFaction.SonsOfHorus,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'warlord-det',
          detachmentTemplateId: 'warlord-detachment',
          faction: LegionFaction.WorldEaters, // Different from Primary
        }),
      ],
    });
    const errors = validateWarlordDesignation(army);
    expect(errors.some((e) => e.message.includes('same faction'))).toBe(true);
  });

  it('no error when Warlord Detachment faction matches Primary', () => {
    const army = makeValidArmy({
      pointsLimit: 3000,
      faction: LegionFaction.SonsOfHorus,
      detachments: [
        makeDetachment(),
        makeDetachment({
          id: 'warlord-det',
          detachmentTemplateId: 'warlord-detachment',
          faction: LegionFaction.SonsOfHorus,
        }),
      ],
    });
    expect(validateWarlordDesignation(army)).toHaveLength(0);
  });
});

// ─── HHv2 MVP Scope Validators ──────────────────────────────────────────────

describe('validateMvpFactionScope', () => {
  it('errors when primary faction is outside MVP scope', () => {
    const errors = validateMvpFactionScope(
      makeValidArmy({ faction: LegionFaction.SonsOfHorus }),
    );
    expect(errors.some((e) => e.message.includes('outside HHv2 MVP legion scope'))).toBe(true);
  });

  it('passes when army and detachments are in MVP scope', () => {
    const army = makeValidArmy({
      faction: LegionFaction.DarkAngels,
      detachments: [
        makeDetachment({
          faction: LegionFaction.DarkAngels,
        }),
      ],
    });
    expect(validateMvpFactionScope(army)).toHaveLength(0);
  });
});

describe('validateUnitProfilesExist', () => {
  it('errors for unknown profile IDs', () => {
    const army = makeValidArmy({
      detachments: [
        makeDetachment({
          units: [
            makeUnit({
              id: 'bad-profile',
              profileId: 'non-existent-profile-id',
            }),
          ],
        }),
      ],
    });
    const errors = validateUnitProfilesExist(army);
    expect(errors.some((e) => e.message.includes('unknown or out-of-scope profile ID'))).toBe(true);
  });

  it('passes for existing profile IDs', () => {
    const army = makeValidArmy({
      faction: LegionFaction.DarkAngels,
      detachments: [
        makeDetachment({
          faction: LegionFaction.DarkAngels,
          units: [
            makeUnit({
              id: 'known-profile',
              profileId: 'tactical-squad',
            }),
          ],
        }),
      ],
    });
    expect(validateUnitProfilesExist(army)).toHaveLength(0);
  });
});

describe('validateArmyListForMvp', () => {
  it('returns invalid for non-MVP faction army', () => {
    const result = validateArmyListForMvp(makeValidArmy());
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('MVP legion scope'))).toBe(true);
  });
});
