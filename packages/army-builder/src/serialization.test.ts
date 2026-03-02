/**
 * Army Serialization Tests.
 */

import { describe, it, expect } from 'vitest';
import {
  Allegiance,
  BattlefieldRole,
  DetachmentType,
  LegionFaction,
  SpecialFaction,
} from '@hh/types';
import type { ArmyList } from '@hh/types';
import {
  exportArmyList,
  importArmyList,
  validateArmyListStructure,
  ARMY_LIST_SCHEMA_VERSION,
} from './serialization';

// ─── Test Fixture ────────────────────────────────────────────────────────────

function makeValidArmy(): ArmyList {
  return {
    playerName: 'Test Player',
    pointsLimit: 2000,
    totalPoints: 1500,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    detachments: [
      {
        id: 'det-1',
        detachmentTemplateId: 'crusade-primary',
        type: DetachmentType.Primary,
        faction: LegionFaction.SonsOfHorus,
        units: [
          {
            id: 'unit-1',
            profileId: 'tactical-squad',
            modelCount: 10,
            selectedOptions: [],
            totalPoints: 150,
            battlefieldRole: BattlefieldRole.Troops,
          },
        ],
      },
    ],
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

describe('exportArmyList', () => {
  it('produces valid JSON', () => {
    const json = exportArmyList(makeValidArmy());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes schema version', () => {
    const json = exportArmyList(makeValidArmy());
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(ARMY_LIST_SCHEMA_VERSION);
  });

  it('includes army list data', () => {
    const army = makeValidArmy();
    const json = exportArmyList(army);
    const parsed = JSON.parse(json);
    expect(parsed.armyList.playerName).toBe('Test Player');
    expect(parsed.armyList.faction).toBe(LegionFaction.SonsOfHorus);
  });
});

// ─── Import ──────────────────────────────────────────────────────────────────

describe('importArmyList', () => {
  it('round-trips an army list', () => {
    const army = makeValidArmy();
    const json = exportArmyList(army);
    const result = importArmyList(json);
    expect(result.errors).toHaveLength(0);
    expect(result.armyList).toEqual(army);
  });

  it('rejects invalid JSON', () => {
    const result = importArmyList('not valid json');
    expect(result.armyList).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Invalid JSON');
  });

  it('rejects non-object', () => {
    const result = importArmyList('"just a string"');
    expect(result.armyList).toBeNull();
    expect(result.errors[0]).toContain('expected an object');
  });

  it('rejects missing schema version', () => {
    const json = JSON.stringify({ armyList: makeValidArmy() });
    const result = importArmyList(json);
    expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects unsupported schema version', () => {
    const json = JSON.stringify({
      schemaVersion: ARMY_LIST_SCHEMA_VERSION + 10,
      armyList: makeValidArmy(),
    });
    const result = importArmyList(json);
    expect(result.errors.some((e) => e.includes('Unsupported schema'))).toBe(true);
  });

  it('rejects missing armyList field', () => {
    const json = JSON.stringify({ schemaVersion: 1 });
    const result = importArmyList(json);
    expect(result.errors.some((e) => e.includes('armyList'))).toBe(true);
  });

  it('migrates schema v1 army payloads to schema v2 fields', () => {
    const v1Payload = {
      schemaVersion: 1,
      armyList: makeValidArmy(),
    };

    const result = importArmyList(JSON.stringify(v1Payload));
    expect(result.errors).toHaveLength(0);
    expect(result.armyList).not.toBeNull();
    expect(result.armyList!.doctrine).toBeUndefined();
    expect(result.armyList!.detachments[0].units[0].originLegion).toBe(LegionFaction.SonsOfHorus);
  });
});

// ─── Structure Validation ────────────────────────────────────────────────────

describe('validateArmyListStructure', () => {
  it('returns no errors for valid structure', () => {
    const errors = validateArmyListStructure(makeValidArmy() as unknown as Record<string, unknown>);
    expect(errors).toHaveLength(0);
  });

  it('catches missing playerName', () => {
    const army = makeValidArmy() as unknown as Record<string, unknown>;
    delete army.playerName;
    const errors = validateArmyListStructure(army);
    expect(errors.some((e) => e.includes('playerName'))).toBe(true);
  });

  it('catches invalid faction', () => {
    const army = { ...makeValidArmy(), faction: 'Invalid Legion' } as unknown as Record<string, unknown>;
    const errors = validateArmyListStructure(army);
    expect(errors.some((e) => e.includes('faction'))).toBe(true);
  });

  it('accepts special faction values', () => {
    const army = {
      ...makeValidArmy(),
      faction: SpecialFaction.Blackshields,
      detachments: [{
        ...makeValidArmy().detachments[0],
        faction: SpecialFaction.Blackshields,
      }],
    } as unknown as Record<string, unknown>;
    const errors = validateArmyListStructure(army);
    expect(errors).toHaveLength(0);
  });

  it('catches invalid allegiance', () => {
    const army = { ...makeValidArmy(), allegiance: 'Neutral' } as unknown as Record<string, unknown>;
    const errors = validateArmyListStructure(army);
    expect(errors.some((e) => e.includes('allegiance'))).toBe(true);
  });

  it('catches invalid detachment structure', () => {
    const army = {
      ...makeValidArmy(),
      detachments: [{ notAnId: true }],
    } as unknown as Record<string, unknown>;
    const errors = validateArmyListStructure(army);
    expect(errors.some((e) => e.includes('detachments[0]'))).toBe(true);
  });

  it('catches invalid unit structure', () => {
    const army = {
      ...makeValidArmy(),
      detachments: [{
        id: 'det-1',
        detachmentTemplateId: 'crusade-primary',
        type: DetachmentType.Primary,
        faction: LegionFaction.SonsOfHorus,
        units: [{ notAnId: true }],
      }],
    } as unknown as Record<string, unknown>;
    const errors = validateArmyListStructure(army);
    expect(errors.some((e) => e.includes('units[0]'))).toBe(true);
  });
});
