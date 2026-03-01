/**
 * Rite of War Enforcement Tests.
 */

import { describe, it, expect } from 'vitest';
import { Allegiance, BattlefieldRole, DetachmentType, LegionFaction } from '@hh/types';
import type { ArmyList, ArmyListDetachment, ArmyListUnit, RiteOfWarDefinition } from '@hh/types';
import { RITES_OF_WAR, findRiteOfWar } from '@hh/data';
import {
  isRiteAvailable,
  validateRiteOfWarRestrictions,
  getRiteDetachmentTemplates,
  getRiteDetachmentTemplatesById,
  filterUnitsForRite,
} from './rite-enforcement';

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
    faction: LegionFaction.DarkAngels,
    units: [],
    ...overrides,
  };
}

function makeArmy(overrides: Partial<ArmyList> = {}): ArmyList {
  return {
    playerName: 'Test Player',
    pointsLimit: 2000,
    totalPoints: 1500,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    detachments: [makeDetachment()],
    ...overrides,
  };
}

const mockRite: RiteOfWarDefinition = {
  id: 'test-rite',
  name: 'Test Rite',
  legion: LegionFaction.DarkAngels,
  description: 'A test rite',
  benefits: [],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No restriction',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'test-tactica',
  advancedReactionId: 'test-reaction',
  gambitId: 'test-gambit',
  primeAdvantageName: 'Test Prime',
  primeAdvantage: { name: 'Test Prime', description: 'Test', effects: [] },
  additionalDetachments: [
    {
      name: 'Test Det',
      type: 'Auxiliary',
      description: 'Test detachment',
      slots: ['Troops', 'Troops', 'Command'],
    },
  ],
};

// ─── isRiteAvailable ─────────────────────────────────────────────────────────

describe('isRiteAvailable', () => {
  it('returns true when faction matches and no restrictions fail', () => {
    expect(
      isRiteAvailable(mockRite, LegionFaction.DarkAngels, Allegiance.Loyalist, 2000),
    ).toBe(true);
  });

  it('returns false when faction does not match', () => {
    expect(
      isRiteAvailable(mockRite, LegionFaction.WorldEaters, Allegiance.Loyalist, 2000),
    ).toBe(false);
  });

  it('returns false when below minimum points', () => {
    const riteWithMin: RiteOfWarDefinition = {
      ...mockRite,
      minimumPoints: 3000,
    };
    expect(
      isRiteAvailable(riteWithMin, LegionFaction.DarkAngels, Allegiance.Loyalist, 2000),
    ).toBe(false);
  });

  it('returns true when at minimum points', () => {
    const riteWithMin: RiteOfWarDefinition = {
      ...mockRite,
      minimumPoints: 2000,
    };
    expect(
      isRiteAvailable(riteWithMin, LegionFaction.DarkAngels, Allegiance.Loyalist, 2000),
    ).toBe(true);
  });

  it('returns false when allegiance restriction is not met', () => {
    const riteWithAllegiance: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'allegianceRequired',
          description: 'Must be Traitor',
          restriction: { allegiance: Allegiance.Traitor },
        },
      ],
    };
    expect(
      isRiteAvailable(riteWithAllegiance, LegionFaction.DarkAngels, Allegiance.Loyalist, 2000),
    ).toBe(false);
  });

  it('returns true when allegiance restriction is met', () => {
    const riteWithAllegiance: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'allegianceRequired',
          description: 'Must be Loyalist',
          restriction: { allegiance: Allegiance.Loyalist },
        },
      ],
    };
    expect(
      isRiteAvailable(riteWithAllegiance, LegionFaction.DarkAngels, Allegiance.Loyalist, 2000),
    ).toBe(true);
  });
});

// ─── validateRiteOfWarRestrictions ───────────────────────────────────────────

describe('validateRiteOfWarRestrictions', () => {
  it('returns no errors for army meeting all restrictions', () => {
    const army = makeArmy();
    const errors = validateRiteOfWarRestrictions(army, mockRite);
    expect(errors).toHaveLength(0);
  });

  it('returns error for excluded unit', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'excludeUnit',
          description: 'No tactical squads',
          restriction: { unitProfileId: 'tactical-squad' },
        },
      ],
    };
    const army = makeArmy({
      detachments: [
        makeDetachment({
          units: [makeUnit({ profileId: 'tactical-squad' })],
        }),
      ],
    });
    const errors = validateRiteOfWarRestrictions(army, rite);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('prohibits unit');
  });

  it('returns error for excluded role', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'excludeRole',
          description: 'No Heavy Assault',
          restriction: { role: BattlefieldRole.HeavyAssault },
        },
      ],
    };
    const army = makeArmy({
      detachments: [
        makeDetachment({
          units: [
            makeUnit({ battlefieldRole: BattlefieldRole.HeavyAssault }),
          ],
        }),
      ],
    });
    const errors = validateRiteOfWarRestrictions(army, rite);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('prohibits');
  });

  it('returns error for missing required unit', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'requireUnit',
          description: 'Must include Praetor',
          restriction: { unitProfileId: 'praetor' },
        },
      ],
    };
    const army = makeArmy();
    const errors = validateRiteOfWarRestrictions(army, rite);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requires unit');
  });

  it('no error when required unit is present', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'requireUnit',
          description: 'Must include Praetor',
          restriction: { unitProfileId: 'praetor' },
        },
      ],
    };
    const army = makeArmy({
      detachments: [
        makeDetachment({
          units: [makeUnit({ profileId: 'praetor' })],
        }),
      ],
    });
    const errors = validateRiteOfWarRestrictions(army, rite);
    expect(errors).toHaveLength(0);
  });

  it('returns error for required role not met', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'requireRole',
          description: 'Must have 2 Troops',
          restriction: { role: BattlefieldRole.Troops, count: 2 },
        },
      ],
    };
    const army = makeArmy({
      detachments: [
        makeDetachment({
          units: [makeUnit({ battlefieldRole: BattlefieldRole.Troops })],
        }),
      ],
    });
    const errors = validateRiteOfWarRestrictions(army, rite);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requires at least 2');
  });
});

// ─── getRiteDetachmentTemplates ──────────────────────────────────────────────

describe('getRiteDetachmentTemplates', () => {
  it('returns templates from rite additional detachments', () => {
    const templates = getRiteDetachmentTemplates(mockRite);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Test Det');
    expect(templates[0].slots).toHaveLength(3);
  });

  it('returns empty for rite with no additional detachments', () => {
    const emptyRite: RiteOfWarDefinition = {
      ...mockRite,
      additionalDetachments: [],
    };
    expect(getRiteDetachmentTemplates(emptyRite)).toHaveLength(0);
  });
});

describe('getRiteDetachmentTemplatesById', () => {
  it('returns templates for a known rite ID', () => {
    // Dark Angels rite should exist
    const daRite = RITES_OF_WAR[0];
    const templates = getRiteDetachmentTemplatesById(daRite.id);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown rite ID', () => {
    expect(getRiteDetachmentTemplatesById('nonexistent')).toEqual([]);
  });
});

// ─── filterUnitsForRite ──────────────────────────────────────────────────────

describe('filterUnitsForRite', () => {
  it('filters out excluded units', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'excludeUnit',
          description: 'No tactical squads',
          restriction: { unitProfileId: 'tactical-squad' },
        },
      ],
    };
    const units = [
      makeUnit({ id: 'u1', profileId: 'tactical-squad' }),
      makeUnit({ id: 'u2', profileId: 'assault-squad' }),
    ];
    const filtered = filterUnitsForRite(units, rite);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].profileId).toBe('assault-squad');
  });

  it('filters out excluded roles', () => {
    const rite: RiteOfWarDefinition = {
      ...mockRite,
      restrictions: [
        {
          type: 'excludeRole',
          description: 'No Fast Attack',
          restriction: { role: BattlefieldRole.FastAttack },
        },
      ],
    };
    const units = [
      makeUnit({ id: 'u1', battlefieldRole: BattlefieldRole.FastAttack }),
      makeUnit({ id: 'u2', battlefieldRole: BattlefieldRole.Troops }),
    ];
    const filtered = filterUnitsForRite(units, rite);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].battlefieldRole).toBe(BattlefieldRole.Troops);
  });

  it('passes through all units when no excludes', () => {
    const units = [makeUnit({ id: 'u1' }), makeUnit({ id: 'u2' })];
    const filtered = filterUnitsForRite(units, mockRite);
    expect(filtered).toHaveLength(2);
  });
});
