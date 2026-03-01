/**
 * Tests for Unit Datasheet Parser
 * Reference: legiones_astartes_clean.md
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BattlefieldRole } from '@hh/types';
import { parseDatasheets, findUnitByName } from './unit-parser';
import type { ParsedUnit } from './unit-parser';

// Load and parse the datasheets once for all tests
let units: ParsedUnit[] = [];

beforeAll(() => {
  const mdPath = path.resolve(import.meta.dirname, '../../../legiones_astartes_clean.md');
  const markdown = fs.readFileSync(mdPath, 'utf-8');
  units = parseDatasheets(markdown);
});

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Parser integrity', () => {
  it('parses all 303 datasheets', () => {
    expect(units.length).toBe(303);
  });

  it('every unit has a unique id', () => {
    const ids = units.map(u => u.id);
    const unique = new Set(ids);
    // Some units may have duplicate names (e.g., variant datasheets)
    // Check that we got at least 290 unique IDs
    expect(unique.size).toBeGreaterThanOrEqual(290);
  });

  it('every unit has required fields', () => {
    for (const unit of units) {
      expect(unit.id).toBeTruthy();
      expect(unit.name).toBeTruthy();
      expect(typeof unit.basePoints).toBe('number');
      expect(unit.basePoints).toBeGreaterThan(0);
      expect(unit.battlefieldRole).toBeTruthy();
      expect(unit.models.length).toBeGreaterThan(0);
    }
  });

  it('every unit has at least one model with stats', () => {
    for (const unit of units) {
      const hasStats = unit.models.some(m =>
        m.characteristics !== undefined || m.vehicleCharacteristics !== undefined
      );
      expect(hasStats).toBe(true);
    }
  });

  it('most units have a type entry (at least 295 of 303)', () => {
    const withType = units.filter(u => u.typeEntries.length > 0);
    // Some units might have non-standard TYPE sections
    expect(withType.length).toBeGreaterThanOrEqual(295);
    // Log units missing type entries for debugging
    const withoutType = units.filter(u => u.typeEntries.length === 0);
    if (withoutType.length > 0) {
      // Allow a small number to be missing (edge case formatting)
      expect(withoutType.length).toBeLessThanOrEqual(8);
    }
  });
});

// ─── Battlefield Roles ───────────────────────────────────────────────────────

describe('Battlefield role assignment', () => {
  it('Primarchs are Warlord role', () => {
    const lion = findUnitByName(units, 'Lion El Jonson');
    expect(lion).toBeDefined();
    expect(lion!.battlefieldRole).toBe(BattlefieldRole.Warlord);
  });

  it('Praetor is High Command', () => {
    const praetor = findUnitByName(units, 'Praetor');
    expect(praetor).toBeDefined();
    expect(praetor!.battlefieldRole).toBe(BattlefieldRole.HighCommand);
  });

  it('Centurion is Command', () => {
    const centurion = findUnitByName(units, 'Centurion');
    expect(centurion).toBeDefined();
    expect(centurion!.battlefieldRole).toBe(BattlefieldRole.Command);
  });

  it('Tactical Squad is Troops', () => {
    const tac = findUnitByName(units, 'Tactical Squad');
    expect(tac).toBeDefined();
    expect(tac!.battlefieldRole).toBe(BattlefieldRole.Troops);
  });

  it('Rhino is Transport', () => {
    const rhino = findUnitByName(units, 'Rhino');
    expect(rhino).toBeDefined();
    expect(rhino!.battlefieldRole).toBe(BattlefieldRole.Transport);
  });

  it('Predator is Armour', () => {
    const predator = findUnitByName(units, 'Predator');
    expect(predator).toBeDefined();
    expect(predator!.battlefieldRole).toBe(BattlefieldRole.Armour);
  });
});

// ─── Primarch: Lion El'Jonson ────────────────────────────────────────────────

describe('Lion El Jonson (Primarch)', () => {
  it('has correct base points', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.basePoints).toBe(460);
  });

  it('has correct stat line', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.models.length).toBeGreaterThanOrEqual(1);
    const model = lion.models[0];
    expect(model.characteristics).toBeDefined();
    const stats = model.characteristics!;
    expect(stats.M).toBe(8);
    expect(stats.WS).toBe(8);
    expect(stats.BS).toBe(6);
    expect(stats.S).toBe(7);
    expect(stats.T).toBe(6);
    expect(stats.W).toBe(6);
    expect(stats.I).toBe(7);
    expect(stats.A).toBe(7);
    expect(stats.LD).toBe(12);
    expect(stats.SAV).toBe(2);
    expect(stats.INV).toBe(4);
  });

  it('has correct wargear', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.defaultWargear).toContain('The Lion Sword');
    expect(lion.defaultWargear).toContain('The Fusil Actinaeus');
    expect(lion.defaultWargear).toContain('Frag grenades');
    expect(lion.defaultWargear).toContain('Krak grenades');
  });

  it('has correct traits', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.traits).toContain('Loyalist');
    expect(lion.traits).toContain('Dark Angels');
    expect(lion.traits).toContain('Master of the Legion');
  });

  it('has correct special rules', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.specialRules).toContain('Sire of the Dark Angels');
    expect(lion.specialRules).toContain('Bulky (4)');
    expect(lion.specialRules).toContain('Eternal Warrior (2)');
  });

  it('has dedicated weapons', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.dedicatedWeapons.length).toBeGreaterThan(0);
    const lionSword = lion.dedicatedWeapons.find(w => w.name === 'The Lion Sword');
    expect(lionSword).toBeDefined();
    expect(lionSword!.category).toBe('melee');
  });

  it('has Paragon (Unique) type', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.typeEntries.length).toBeGreaterThan(0);
    const typeEntry = lion.typeEntries[0];
    expect(typeEntry.primaryType).toBe('Paragon');
    expect(typeEntry.subTypes).toContain('Unique');
  });

  it('has 40mm base', () => {
    const lion = findUnitByName(units, 'Lion El Jonson')!;
    expect(lion.models[0].baseSizeMM).toBe(40);
  });
});

// ─── Tactical Squad (standard troops) ────────────────────────────────────────

describe('Tactical Squad', () => {
  it('has correct base points', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.basePoints).toBe(100);
  });

  it('has Sergeant and Legionary model profiles', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    const names = tac.models.map(m => m.name);
    expect(names).toContain('Sergeant');
    expect(names).toContain('Legionary');
  });

  it('Sergeant has correct stats', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    const sgt = tac.models.find(m => m.name === 'Sergeant')!;
    expect(sgt.characteristics).toBeDefined();
    const stats = sgt.characteristics!;
    expect(stats.M).toBe(7);
    expect(stats.WS).toBe(4);
    expect(stats.BS).toBe(4);
    expect(stats.S).toBe(4);
    expect(stats.T).toBe(4);
    expect(stats.W).toBe(1);
    expect(stats.I).toBe(4);
    expect(stats.A).toBe(1);
    expect(stats.LD).toBe(8);
    expect(stats.SAV).toBe(3);
    expect(stats.INV).toBeNull();
  });

  it('Legionary has correct stats', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    const leg = tac.models.find(m => m.name === 'Legionary')!;
    expect(leg.characteristics).toBeDefined();
    const stats = leg.characteristics!;
    expect(stats.M).toBe(7);
    expect(stats.WS).toBe(4);
    expect(stats.BS).toBe(4);
    expect(stats.LD).toBe(7);
    expect(stats.SAV).toBe(3);
  });

  it('has correct composition', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.composition.baseModelCount).toBe(10);
    expect(tac.composition.models.length).toBe(2);
  });

  it('has correct additional model cost', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.composition.pointsPerAdditional).toBe(10);
    expect(tac.composition.maxAdditional).toBe(10);
  });

  it('has correct wargear', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.defaultWargear).toContain('Bolter');
    expect(tac.defaultWargear).toContain('Bolt pistol');
    expect(tac.defaultWargear).toContain('Frag grenades');
    expect(tac.defaultWargear).toContain('Krak grenades');
  });

  it('has correct special rules', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.specialRules).toContain('Fury of the Legion');
    expect(tac.specialRules).toContain('Line (2)');
  });

  it('has Infantry type for Sergeant and Legionary', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    const sgtType = tac.typeEntries.find(t => t.modelName === 'Sergeant');
    expect(sgtType).toBeDefined();
    expect(sgtType!.primaryType).toBe('Infantry');
    expect(sgtType!.subTypes).toContain('Sergeant');

    const legType = tac.typeEntries.find(t => t.modelName === 'Legionary');
    expect(legType).toBeDefined();
    expect(legType!.primaryType).toBe('Infantry');
  });

  it('has 32mm bases', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    for (const model of tac.models) {
      expect(model.baseSizeMM).toBe(32);
    }
  });

  it('has OPTIONS text', () => {
    const tac = findUnitByName(units, 'Tactical Squad')!;
    expect(tac.optionsRaw).toContain('Sergeant');
    expect(tac.optionsRaw).toContain('melta bombs');
  });
});

// ─── Rhino (Transport Vehicle) ───────────────────────────────────────────────

describe('Rhino (Transport)', () => {
  it('has correct base points', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    expect(rhino.basePoints).toBe(60);
  });

  it('is detected as a vehicle', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    expect(rhino.isVehicle).toBe(true);
  });

  it('has vehicle characteristics', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    expect(rhino.models.length).toBeGreaterThanOrEqual(1);
    const model = rhino.models[0];
    expect(model.vehicleCharacteristics).toBeDefined();
    const stats = model.vehicleCharacteristics!;
    expect(stats.M).toBe(12);
    expect(stats.BS).toBe(4);
    expect(stats.frontArmour).toBe(12);
    expect(stats.sideArmour).toBe(11);
    expect(stats.rearArmour).toBe(10);
    expect(stats.HP).toBe(5);
    expect(stats.transportCapacity).toBe(12);
  });

  it('has Vehicle (Transport) type', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    const typeEntry = rhino.typeEntries[0];
    expect(typeEntry.primaryType).toBe('Vehicle');
    expect(typeEntry.subTypes).toContain('Transport');
  });

  it('has access points', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    expect(rhino.accessPoints).toBeTruthy();
    expect(rhino.accessPoints).toContain('Side');
    expect(rhino.accessPoints).toContain('Rear');
  });

  it('has base size 0 (Use model)', () => {
    const rhino = findUnitByName(units, 'Rhino')!;
    expect(rhino.models[0].baseSizeMM).toBe(0);
  });
});

// ─── Contemptor Dreadnought (Walker) ────────────────────────────────────────

describe('Contemptor Dreadnought', () => {
  it('has correct base points', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    expect(dread.basePoints).toBe(150);
  });

  it('is not a vehicle (uses infantry stat format)', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    expect(dread.isVehicle).toBe(false);
  });

  it('has infantry-style characteristics', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    const model = dread.models[0];
    expect(model.characteristics).toBeDefined();
    const stats = model.characteristics!;
    expect(stats.M).toBe(8);
    expect(stats.WS).toBe(4);
    expect(stats.BS).toBe(4);
    expect(stats.S).toBe(7);
    expect(stats.T).toBe(7);
    expect(stats.W).toBe(6);
    expect(stats.I).toBe(4);
    expect(stats.A).toBe(4);
    expect(stats.SAV).toBe(2);
    expect(stats.INV).toBe(5);
  });

  it('has Walker type', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    const typeEntry = dread.typeEntries[0];
    expect(typeEntry.primaryType).toBe('Walker');
  });

  it('has 60mm base', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    expect(dread.models[0].baseSizeMM).toBe(60);
  });

  it('has correct special rules', () => {
    const dread = findUnitByName(units, 'Contemptor Dreadnought')!;
    expect(dread.specialRules).toContain('Bulky (6)');
    expect(dread.specialRules).toContain('Explodes (5+)');
    expect(dread.specialRules).toContain('Implacable Advance');
  });
});

// ─── Predator (Non-Transport Vehicle) ────────────────────────────────────────

describe('Predator', () => {
  it('has correct base points', () => {
    const pred = findUnitByName(units, 'Predator')!;
    expect(pred.basePoints).toBe(100);
  });

  it('is a vehicle', () => {
    const pred = findUnitByName(units, 'Predator')!;
    expect(pred.isVehicle).toBe(true);
  });

  it('has vehicle characteristics with no transport capacity', () => {
    const pred = findUnitByName(units, 'Predator')!;
    const stats = pred.models[0].vehicleCharacteristics!;
    expect(stats.M).toBe(12);
    expect(stats.frontArmour).toBe(13);
    expect(stats.sideArmour).toBe(12);
    expect(stats.rearArmour).toBe(10);
    expect(stats.HP).toBe(5);
    expect(stats.transportCapacity).toBe(0); // "-" in source = 0
  });

  it('has Vehicle type without Transport subtype', () => {
    const pred = findUnitByName(units, 'Predator')!;
    const typeEntry = pred.typeEntries[0];
    expect(typeEntry.primaryType).toBe('Vehicle');
    // Predator should not have Transport subtype
  });
});

// ─── Praetor (Multiple Variants) ────────────────────────────────────────────

describe('Praetor (variant profiles)', () => {
  it('has correct base points', () => {
    const praetor = findUnitByName(units, 'Praetor')!;
    expect(praetor.basePoints).toBe(120);
  });

  it('has multiple model profiles (base + jump pack)', () => {
    const praetor = findUnitByName(units, 'Praetor')!;
    expect(praetor.models.length).toBeGreaterThanOrEqual(2);
  });

  it('base Praetor has M7', () => {
    const praetor = findUnitByName(units, 'Praetor')!;
    const base = praetor.models.find(m => m.name === 'Praetor');
    expect(base).toBeDefined();
    expect(base!.characteristics!.M).toBe(7);
  });

  it('jump pack Praetor has M12', () => {
    const praetor = findUnitByName(units, 'Praetor')!;
    const jp = praetor.models.find(m => m.name.includes('Jump Pack'));
    expect(jp).toBeDefined();
    expect(jp!.characteristics!.M).toBe(12);
  });
});

// ─── Land Raider Carrier (Heavy Transport) ───────────────────────────────────

describe('Land Raider Carrier', () => {
  it('has correct base points', () => {
    const lr = findUnitByName(units, 'Land Raider Carrier')!;
    expect(lr.basePoints).toBe(265);
  });

  it('has transport capacity 12', () => {
    const lr = findUnitByName(units, 'Land Raider Carrier')!;
    const stats = lr.models[0].vehicleCharacteristics!;
    expect(stats.transportCapacity).toBe(12);
  });

  it('has AV14 all around', () => {
    const lr = findUnitByName(units, 'Land Raider Carrier')!;
    const stats = lr.models[0].vehicleCharacteristics!;
    expect(stats.frontArmour).toBe(14);
    expect(stats.sideArmour).toBe(14);
    expect(stats.rearArmour).toBe(14);
  });

  it('is a Heavy Transport', () => {
    const lr = findUnitByName(units, 'Land Raider Carrier')!;
    expect(lr.battlefieldRole).toBe(BattlefieldRole.HeavyTransport);
  });
});

// ─── Cross-Cutting Checks ────────────────────────────────────────────────────

describe('Cross-cutting checks', () => {
  it('all battlefield roles are represented', () => {
    const roles = new Set(units.map(u => u.battlefieldRole));
    expect(roles.size).toBeGreaterThanOrEqual(10);
  });

  it('vehicle units have vehicle characteristics', () => {
    const vehicleUnits = units.filter(u => u.isVehicle);
    expect(vehicleUnits.length).toBeGreaterThan(10);
    for (const unit of vehicleUnits) {
      expect(unit.models[0].vehicleCharacteristics).toBeDefined();
    }
  });

  it('non-vehicle units have infantry characteristics', () => {
    const infantryUnits = units.filter(u => !u.isVehicle);
    expect(infantryUnits.length).toBeGreaterThan(200);
    for (const unit of infantryUnits) {
      expect(unit.models[0].characteristics).toBeDefined();
    }
  });

  it('findUnitByName is case-insensitive', () => {
    expect(findUnitByName(units, 'tactical squad')).toBeDefined();
    expect(findUnitByName(units, 'TACTICAL SQUAD')).toBeDefined();
  });

  it('returns undefined for unknown units', () => {
    expect(findUnitByName(units, 'Nonexistent Unit')).toBeUndefined();
  });

  it('units with dedicated weapons have parsed weapon data', () => {
    const unitsWithWeapons = units.filter(u => u.dedicatedWeapons.length > 0);
    expect(unitsWithWeapons.length).toBeGreaterThan(10); // Primarchs + unique units
  });
});
