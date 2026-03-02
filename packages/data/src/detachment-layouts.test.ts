/**
 * Detachment Layout Tests
 * Validates all 14 standard detachment templates and rite conversion.
 */

import { describe, it, expect } from 'vitest';
import { BattlefieldRole, DetachmentType, LegionFaction } from '@hh/types';
import type { RiteOfWarDefinition } from '@hh/types';
import {
  CRUSADE_PRIMARY,
  WARLORD_DETACHMENT,
  LORD_OF_WAR_DETACHMENT,
  ALLIED_DETACHMENT,
  ARMOURED_FIST,
  TACTICAL_SUPPORT,
  ARMOURED_SUPPORT,
  HEAVY_SUPPORT,
  COMBAT_PIONEER,
  SHOCK_ASSAULT,
  FIRST_STRIKE,
  COMBAT_RETINUE,
  OFFICER_CADRE,
  ARMY_VANGUARD,
  ALL_DETACHMENT_TEMPLATES,
  AUXILIARY_TEMPLATES,
  APEX_TEMPLATES,
  findDetachmentTemplate,
  getAuxiliaryTemplates,
  getApexTemplates,
  buildRiteDetachmentTemplates,
} from './detachment-layouts';

// ─── Helper ──────────────────────────────────────────────────────────────────

function countRoleSlots(
  template: { slots: { role: BattlefieldRole }[] },
  role: BattlefieldRole,
): number {
  return template.slots.filter((s) => s.role === role).length;
}

// ─── Crusade Primary ─────────────────────────────────────────────────────────

describe('Crusade Primary Detachment', () => {
  it('has 12 slots total', () => {
    expect(CRUSADE_PRIMARY.slots).toHaveLength(12);
  });

  it('has correct slot composition', () => {
    expect(countRoleSlots(CRUSADE_PRIMARY, BattlefieldRole.HighCommand)).toBe(1);
    expect(countRoleSlots(CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(3);
    expect(countRoleSlots(CRUSADE_PRIMARY, BattlefieldRole.Troops)).toBe(4);
    expect(countRoleSlots(CRUSADE_PRIMARY, BattlefieldRole.Transport)).toBe(4);
  });

  it('marks Command slots as Prime', () => {
    const commandSlots = CRUSADE_PRIMARY.slots.filter(
      (s) => s.role === BattlefieldRole.Command,
    );
    expect(commandSlots.every((s) => s.isPrime)).toBe(true);
  });

  it('marks Troops slots as Prime', () => {
    const troopSlots = CRUSADE_PRIMARY.slots.filter(
      (s) => s.role === BattlefieldRole.Troops,
    );
    expect(troopSlots.every((s) => s.isPrime)).toBe(true);
  });

  it('does not mark HC slot as mandatory', () => {
    const hcSlot = CRUSADE_PRIMARY.slots.find(
      (s) => s.role === BattlefieldRole.HighCommand,
    );
    expect(hcSlot?.isMandatory).toBe(false);
  });

  it('Transport slots are not Prime', () => {
    const transportSlots = CRUSADE_PRIMARY.slots.filter(
      (s) => s.role === BattlefieldRole.Transport,
    );
    expect(transportSlots.every((s) => !s.isPrime)).toBe(true);
  });

  it('has Primary type', () => {
    expect(CRUSADE_PRIMARY.type).toBe(DetachmentType.Primary);
    expect(CRUSADE_PRIMARY.category).toBe('primary');
  });
});

// ─── Warlord Detachment ──────────────────────────────────────────────────────

describe('Warlord Detachment', () => {
  it('has 5 slots total', () => {
    expect(WARLORD_DETACHMENT.slots).toHaveLength(5);
  });

  it('has correct slot composition', () => {
    expect(countRoleSlots(WARLORD_DETACHMENT, BattlefieldRole.Warlord)).toBe(1);
    expect(countRoleSlots(WARLORD_DETACHMENT, BattlefieldRole.WarEngine)).toBe(1);
    expect(countRoleSlots(WARLORD_DETACHMENT, BattlefieldRole.Retinue)).toBe(1);
    expect(countRoleSlots(WARLORD_DETACHMENT, BattlefieldRole.Transport)).toBe(2);
  });

  it('marks Warlord slot as mandatory', () => {
    const warlordSlot = WARLORD_DETACHMENT.slots.find(
      (s) => s.role === BattlefieldRole.Warlord,
    );
    expect(warlordSlot?.isMandatory).toBe(true);
  });

  it('has warlord category', () => {
    expect(WARLORD_DETACHMENT.category).toBe('warlord');
  });
});

// ─── Lord of War Detachment ──────────────────────────────────────────────────

describe('Lord of War Detachment', () => {
  it('has 2 slots total', () => {
    expect(LORD_OF_WAR_DETACHMENT.slots).toHaveLength(2);
  });

  it('has 2 Lord of War slots', () => {
    expect(countRoleSlots(LORD_OF_WAR_DETACHMENT, BattlefieldRole.LordOfWar)).toBe(2);
  });

  it('has lordOfWar category', () => {
    expect(LORD_OF_WAR_DETACHMENT.category).toBe('lordOfWar');
  });
});

// ─── Allied Detachment ───────────────────────────────────────────────────────

describe('Allied Detachment', () => {
  it('has 6 slots total', () => {
    expect(ALLIED_DETACHMENT.slots).toHaveLength(6);
  });

  it('has correct slot composition', () => {
    expect(countRoleSlots(ALLIED_DETACHMENT, BattlefieldRole.HighCommand)).toBe(1);
    expect(countRoleSlots(ALLIED_DETACHMENT, BattlefieldRole.Command)).toBe(1);
    expect(countRoleSlots(ALLIED_DETACHMENT, BattlefieldRole.Troops)).toBe(2);
    expect(countRoleSlots(ALLIED_DETACHMENT, BattlefieldRole.Transport)).toBe(2);
  });

  it('has Allied type', () => {
    expect(ALLIED_DETACHMENT.type).toBe(DetachmentType.Allied);
    expect(ALLIED_DETACHMENT.category).toBe('allied');
  });
});

// ─── Auxiliary Detachments ───────────────────────────────────────────────────

describe('Auxiliary Detachments', () => {
  it('Armoured Fist has 8 slots (4 Armour + 4 Transport)', () => {
    expect(ARMOURED_FIST.slots).toHaveLength(8);
    expect(countRoleSlots(ARMOURED_FIST, BattlefieldRole.Armour)).toBe(4);
    expect(countRoleSlots(ARMOURED_FIST, BattlefieldRole.Transport)).toBe(4);
  });

  it('Tactical Support has 5 slots (2 Support + 2 Troops + 1 War-Engine)', () => {
    expect(TACTICAL_SUPPORT.slots).toHaveLength(5);
    expect(countRoleSlots(TACTICAL_SUPPORT, BattlefieldRole.Support)).toBe(2);
    expect(countRoleSlots(TACTICAL_SUPPORT, BattlefieldRole.Troops)).toBe(2);
    expect(countRoleSlots(TACTICAL_SUPPORT, BattlefieldRole.WarEngine)).toBe(1);
  });

  it('Armoured Support has 4 slots (2 Armour + 2 Heavy Transport)', () => {
    expect(ARMOURED_SUPPORT.slots).toHaveLength(4);
    expect(countRoleSlots(ARMOURED_SUPPORT, BattlefieldRole.Armour)).toBe(2);
    expect(countRoleSlots(ARMOURED_SUPPORT, BattlefieldRole.HeavyTransport)).toBe(2);
  });

  it('Heavy Support has 1 slot (1 War-Engine)', () => {
    expect(HEAVY_SUPPORT.slots).toHaveLength(1);
    expect(countRoleSlots(HEAVY_SUPPORT, BattlefieldRole.WarEngine)).toBe(1);
  });

  it('Combat Pioneer has 2 slots (1 Elites + 1 Recon)', () => {
    expect(COMBAT_PIONEER.slots).toHaveLength(2);
    expect(countRoleSlots(COMBAT_PIONEER, BattlefieldRole.Elites)).toBe(1);
    expect(countRoleSlots(COMBAT_PIONEER, BattlefieldRole.Recon)).toBe(1);
  });

  it('Shock Assault has 2 slots (2 Heavy Assault)', () => {
    expect(SHOCK_ASSAULT.slots).toHaveLength(2);
    expect(countRoleSlots(SHOCK_ASSAULT, BattlefieldRole.HeavyAssault)).toBe(2);
  });

  it('First Strike has 2 slots (2 Fast Attack)', () => {
    expect(FIRST_STRIKE.slots).toHaveLength(2);
    expect(countRoleSlots(FIRST_STRIKE, BattlefieldRole.FastAttack)).toBe(2);
  });

  it('all auxiliary templates have Auxiliary type', () => {
    for (const template of AUXILIARY_TEMPLATES) {
      expect(template.type).toBe(DetachmentType.Auxiliary);
      expect(template.category).toBe('auxiliary');
    }
  });

  it('there are 7 standard auxiliary templates', () => {
    expect(AUXILIARY_TEMPLATES).toHaveLength(7);
  });
});

// ─── Apex Detachments ────────────────────────────────────────────────────────

describe('Apex Detachments', () => {
  it('Combat Retinue has 3 slots (1 Command + 2 Retinue)', () => {
    expect(COMBAT_RETINUE.slots).toHaveLength(3);
    expect(countRoleSlots(COMBAT_RETINUE, BattlefieldRole.Command)).toBe(1);
    expect(countRoleSlots(COMBAT_RETINUE, BattlefieldRole.Retinue)).toBe(2);
  });

  it('Officer Cadre has 2 slots (1 HC + 1 Command)', () => {
    expect(OFFICER_CADRE.slots).toHaveLength(2);
    expect(countRoleSlots(OFFICER_CADRE, BattlefieldRole.HighCommand)).toBe(1);
    expect(countRoleSlots(OFFICER_CADRE, BattlefieldRole.Command)).toBe(1);
  });

  it('Army Vanguard has 2 slots (2 Recon)', () => {
    expect(ARMY_VANGUARD.slots).toHaveLength(2);
    expect(countRoleSlots(ARMY_VANGUARD, BattlefieldRole.Recon)).toBe(2);
  });

  it('all apex templates have Apex type', () => {
    for (const template of APEX_TEMPLATES) {
      expect(template.type).toBe(DetachmentType.Apex);
      expect(template.category).toBe('apex');
    }
  });

  it('there are 3 standard apex templates', () => {
    expect(APEX_TEMPLATES).toHaveLength(3);
  });
});

// ─── Template Collections ────────────────────────────────────────────────────

describe('Template Collections', () => {
  it('ALL_DETACHMENT_TEMPLATES has 14 entries', () => {
    expect(ALL_DETACHMENT_TEMPLATES).toHaveLength(14);
  });

  it('all templates have unique IDs', () => {
    const ids = ALL_DETACHMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all slots within each template have unique IDs', () => {
    for (const template of ALL_DETACHMENT_TEMPLATES) {
      const slotIds = template.slots.map((s) => s.id);
      expect(new Set(slotIds).size).toBe(slotIds.length);
    }
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('Lookup Functions', () => {
  it('findDetachmentTemplate returns template by ID', () => {
    const result = findDetachmentTemplate('crusade-primary');
    expect(result).toBe(CRUSADE_PRIMARY);
  });

  it('findDetachmentTemplate returns undefined for unknown ID', () => {
    expect(findDetachmentTemplate('unknown')).toBeUndefined();
  });

  it('getAuxiliaryTemplates returns all 7 auxiliaries', () => {
    const result = getAuxiliaryTemplates();
    expect(result).toHaveLength(7);
    expect(result).toEqual(AUXILIARY_TEMPLATES);
  });

  it('getApexTemplates returns all 3 apex templates', () => {
    const result = getApexTemplates();
    expect(result).toHaveLength(3);
    expect(result).toEqual(APEX_TEMPLATES);
  });
});

// ─── Rite of War Conversion ──────────────────────────────────────────────────

describe('buildRiteDetachmentTemplates', () => {
  const mockRite: RiteOfWarDefinition = {
    id: 'test-rite',
    name: 'Test Rite',
    legion: LegionFaction.DarkAngels,
    description: 'A test rite',
    benefits: [],
    restrictions: [],
    tacticaId: 'test-tactica',
    advancedReactionId: 'test-reaction',
    gambitId: 'test-gambit',
    primeAdvantage: {
      name: 'Test Prime',
      description: 'A test prime advantage',
      effects: ['Test effect'],
    },
    additionalDetachments: [
      {
        name: 'Test Detachment',
        type: 'Auxiliary',
        description: 'A test detachment',
        slots: ['Command', 'Troops', 'Troops', 'Armour', 'Transport'],
      },
    ],
  };

  it('converts rite detachments to templates', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test Detachment');
    expect(result[0].type).toBe(DetachmentType.Auxiliary);
    expect(result[0].category).toBe('rite');
  });

  it('maps slot role strings to BattlefieldRole enums', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    const roles = result[0].slots.map((s) => s.role);
    expect(roles).toEqual([
      BattlefieldRole.Command,
      BattlefieldRole.Troops,
      BattlefieldRole.Troops,
      BattlefieldRole.Armour,
      BattlefieldRole.Transport,
    ]);
  });

  it('generates unique slot IDs', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    const slotIds = result[0].slots.map((s) => s.id);
    expect(new Set(slotIds).size).toBe(slotIds.length);
  });

  it('labels duplicate roles with numbers', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    const troopLabels = result[0].slots
      .filter((s) => s.role === BattlefieldRole.Troops)
      .map((s) => s.label);
    expect(troopLabels).toEqual(['Troops 1', 'Troops 2']);
  });

  it('labels single roles without numbers', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    const commandSlot = result[0].slots.find((s) => s.role === BattlefieldRole.Command);
    expect(commandSlot?.label).toBe('Command');
  });

  it('includes source from rite name and legion', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    expect(result[0].source).toContain('Test Rite');
    expect(result[0].source).toContain('Dark Angels');
  });

  it('generates template ID from rite ID and index', () => {
    const result = buildRiteDetachmentTemplates(mockRite);
    expect(result[0].id).toBe('rite-test-rite-det-0');
  });

  it('returns empty array for rite with no additional detachments', () => {
    const emptyRite: RiteOfWarDefinition = {
      ...mockRite,
      additionalDetachments: [],
    };
    expect(buildRiteDetachmentTemplates(emptyRite)).toEqual([]);
  });

  it('handles multiple detachments in one rite', () => {
    const multiRite: RiteOfWarDefinition = {
      ...mockRite,
      additionalDetachments: [
        {
          name: 'Det A',
          type: 'Auxiliary',
          description: 'First',
          slots: ['Troops', 'Troops'],
        },
        {
          name: 'Det B',
          type: 'Apex',
          description: 'Second',
          slots: ['Command', 'Retinue'],
        },
      ],
    };
    const result = buildRiteDetachmentTemplates(multiRite);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Det A');
    expect(result[0].type).toBe(DetachmentType.Auxiliary);
    expect(result[1].name).toBe('Det B');
    expect(result[1].type).toBe(DetachmentType.Apex);
  });
});
