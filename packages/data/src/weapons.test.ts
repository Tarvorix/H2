/**
 * Tests for Weapon Database
 * Reference: HH_Legiones_Astartes.md weapon tables
 */

import { describe, it, expect } from 'vitest';
import type { StatModifierOp } from '@hh/types';
import {
  BOLT_WEAPONS,
  COMBI_WEAPONS,
  FLAME_WEAPONS,
  GRAVITON_WEAPONS,
  LAS_WEAPONS,
  MELTA_WEAPONS,
  PLASMA_WEAPONS,
  VOLKITE_WEAPONS,
  AUTOCANNON_WEAPONS,
  CHAIN_WEAPONS,
  FORCE_WEAPONS,
  RANGED_WEAPONS,
  MELEE_WEAPONS,
  ALL_WEAPONS,
  findWeapon,
  findWeaponByName,
  isRangedWeapon,
  isMeleeWeapon,
} from './weapons';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Weapon database integrity', () => {
  it('has at least 100 ranged weapon profiles', () => {
    expect(Object.keys(RANGED_WEAPONS).length).toBeGreaterThanOrEqual(100);
  });

  it('has at least 20 melee weapon profiles', () => {
    expect(Object.keys(MELEE_WEAPONS).length).toBeGreaterThanOrEqual(20);
  });

  it('every ranged weapon has a unique id', () => {
    const ids = Object.keys(RANGED_WEAPONS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every melee weapon has a unique id', () => {
    const ids = Object.keys(MELEE_WEAPONS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('no id collision between ranged and melee weapons', () => {
    const rangedIds = new Set(Object.keys(RANGED_WEAPONS));
    const meleeIds = Object.keys(MELEE_WEAPONS);
    for (const id of meleeIds) {
      expect(rangedIds.has(id)).toBe(false);
    }
  });

  it('ALL_WEAPONS contains all ranged and melee weapons', () => {
    const totalExpected =
      Object.keys(RANGED_WEAPONS).length + Object.keys(MELEE_WEAPONS).length;
    expect(Object.keys(ALL_WEAPONS).length).toBe(totalExpected);
  });

  it('every ranged weapon has required fields', () => {
    for (const weapon of Object.values(RANGED_WEAPONS)) {
      expect(weapon.id).toBeTruthy();
      expect(weapon.name).toBeTruthy();
      expect(typeof weapon.range).toBe('number');
      expect(typeof weapon.hasTemplate).toBe('boolean');
      expect(typeof weapon.firepower).toBe('number');
      expect(weapon.firepower).toBeGreaterThan(0);
      expect(typeof weapon.rangedStrength).toBe('number');
      expect(weapon.rangedStrength).toBeGreaterThan(0);
      expect(typeof weapon.damage).toBe('number');
      expect(weapon.damage).toBeGreaterThan(0);
      expect(Array.isArray(weapon.specialRules)).toBe(true);
      expect(Array.isArray(weapon.traits)).toBe(true);
    }
  });

  it('every melee weapon has required fields', () => {
    for (const weapon of Object.values(MELEE_WEAPONS)) {
      expect(weapon.id).toBeTruthy();
      expect(weapon.name).toBeTruthy();
      expect(weapon.initiativeModifier).toBeDefined();
      expect(weapon.attacksModifier).toBeDefined();
      expect(weapon.strengthModifier).toBeDefined();
      expect(typeof weapon.damage).toBe('number');
      expect(weapon.damage).toBeGreaterThan(0);
      expect(Array.isArray(weapon.specialRules)).toBe(true);
      expect(Array.isArray(weapon.traits)).toBe(true);
    }
  });

  it('ranged weapons with hasTemplate have range 0', () => {
    for (const weapon of Object.values(RANGED_WEAPONS)) {
      if (weapon.hasTemplate) {
        expect(weapon.range).toBe(0);
      }
    }
  });

  it('ranged weapons with rangeBand have a parentWeaponId', () => {
    for (const weapon of Object.values(RANGED_WEAPONS)) {
      if (weapon.rangeBand) {
        expect(weapon.parentWeaponId).toBeTruthy();
      }
    }
  });
});

// ─── Weapon Family Arrays ────────────────────────────────────────────────────

describe('Weapon family arrays', () => {
  it('BOLT_WEAPONS all have Bolt trait', () => {
    for (const weapon of BOLT_WEAPONS) {
      expect(weapon.traits).toContain('Bolt');
    }
  });

  it('FLAME_WEAPONS all have Flame trait', () => {
    for (const weapon of FLAME_WEAPONS) {
      expect(weapon.traits).toContain('Flame');
    }
  });

  it('LAS_WEAPONS all have Las trait', () => {
    for (const weapon of LAS_WEAPONS) {
      expect(weapon.traits).toContain('Las');
    }
  });

  it('MELTA_WEAPONS all have Melta trait', () => {
    for (const weapon of MELTA_WEAPONS) {
      expect(weapon.traits).toContain('Melta');
    }
  });

  it('PLASMA_WEAPONS all have Plasma trait', () => {
    for (const weapon of PLASMA_WEAPONS) {
      expect(weapon.traits).toContain('Plasma');
    }
  });

  it('VOLKITE_WEAPONS all have Volkite trait', () => {
    for (const weapon of VOLKITE_WEAPONS) {
      expect(weapon.traits).toContain('Volkite');
    }
  });

  it('GRAVITON_WEAPONS all have Graviton trait', () => {
    for (const weapon of GRAVITON_WEAPONS) {
      expect(weapon.traits).toContain('Graviton');
    }
  });

  it('AUTOCANNON_WEAPONS all have Auto trait', () => {
    for (const weapon of AUTOCANNON_WEAPONS) {
      expect(weapon.traits).toContain('Auto');
    }
  });

  it('CHAIN_WEAPONS all have Chain trait', () => {
    for (const weapon of CHAIN_WEAPONS) {
      expect(weapon.traits).toContain('Chain');
    }
  });

  it('FORCE_WEAPONS all have Force trait', () => {
    for (const weapon of FORCE_WEAPONS) {
      expect(weapon.traits).toContain('Force');
    }
  });

  it('FLAME_WEAPONS all use templates', () => {
    for (const weapon of FLAME_WEAPONS) {
      expect(weapon.hasTemplate).toBe(true);
    }
  });
});

// ─── Specific Ranged Weapon Profiles ─────────────────────────────────────────

describe('Specific ranged weapon profiles', () => {
  it('Bolter: R24, FP2, RS4, AP5, D1, Bolt', () => {
    const weapon = RANGED_WEAPONS['bolter'];
    expect(weapon).toBeDefined();
    expect(weapon.name).toBe('Bolter');
    expect(weapon.range).toBe(24);
    expect(weapon.firepower).toBe(2);
    expect(weapon.rangedStrength).toBe(4);
    expect(weapon.ap).toBe(5);
    expect(weapon.damage).toBe(1);
    expect(weapon.traits).toContain('Bolt');
    expect(weapon.hasTemplate).toBe(false);
  });

  it('Bolt pistol: R12, FP1, RS4, AP5, D1, Pistol, Assault, Bolt', () => {
    const weapon = RANGED_WEAPONS['bolt-pistol'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(12);
    expect(weapon.firepower).toBe(1);
    expect(weapon.rangedStrength).toBe(4);
    expect(weapon.ap).toBe(5);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Pistol')).toBe(true);
    expect(weapon.traits).toContain('Assault');
    expect(weapon.traits).toContain('Bolt');
  });

  it('Heavy bolter: R36, FP3, RS5, AP4, D1, Heavy (FP), Bolt', () => {
    const weapon = RANGED_WEAPONS['heavy-bolter'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(36);
    expect(weapon.firepower).toBe(3);
    expect(weapon.rangedStrength).toBe(5);
    expect(weapon.ap).toBe(4);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Heavy' && r.value === 'FP')).toBe(true);
    expect(weapon.traits).toContain('Bolt');
  });

  it('Lascannon: R48, FP1, RS9, AP2, D1, Heavy (D), Armourbane, Las', () => {
    const weapon = RANGED_WEAPONS['lascannon'];
    expect(weapon).toBeDefined();
    expect(weapon.name).toBe('Lascannon');
    expect(weapon.range).toBe(48);
    expect(weapon.firepower).toBe(1);
    expect(weapon.rangedStrength).toBe(9);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Heavy' && r.value === 'D')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Armourbane')).toBe(true);
    expect(weapon.traits).toContain('Las');
  });

  it('Meltagun: R12, FP1, RS8, AP2, D3, Melta (6), Melta', () => {
    const weapon = RANGED_WEAPONS['meltagun'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(12);
    expect(weapon.firepower).toBe(1);
    expect(weapon.rangedStrength).toBe(8);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(3);
    expect(weapon.specialRules.some(r => r.name === 'Melta' && r.value === '6')).toBe(true);
    expect(weapon.traits).toContain('Melta');
  });

  it('Plasma gun: R24, FP2, RS6, AP4, D1, Breaching (6+), Plasma', () => {
    const weapon = RANGED_WEAPONS['plasma-gun'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(24);
    expect(weapon.firepower).toBe(2);
    expect(weapon.rangedStrength).toBe(6);
    expect(weapon.ap).toBe(4);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Breaching' && r.value === '6+')).toBe(true);
    expect(weapon.traits).toContain('Plasma');
  });

  it('Flamer: Template, FP1, RS4, AP5, D1, Template, Panic (1), Flame', () => {
    const weapon = RANGED_WEAPONS['flamer'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(0);
    expect(weapon.hasTemplate).toBe(true);
    expect(weapon.firepower).toBe(1);
    expect(weapon.rangedStrength).toBe(4);
    expect(weapon.ap).toBe(5);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Template')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Panic' && r.value === '1')).toBe(true);
    expect(weapon.traits).toContain('Flame');
  });

  it('Autocannon: R48, FP2, RS7, AP4, D1, Heavy (FP), Auto', () => {
    const weapon = RANGED_WEAPONS['autocannon'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(48);
    expect(weapon.firepower).toBe(2);
    expect(weapon.rangedStrength).toBe(7);
    expect(weapon.ap).toBe(4);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Heavy' && r.value === 'FP')).toBe(true);
    expect(weapon.traits).toContain('Auto');
  });

  it('Volkite charger: R15, FP2, RS5, AP5, D1, Deflagrate (5), Volkite', () => {
    const weapon = RANGED_WEAPONS['volkite-charger'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(15);
    expect(weapon.firepower).toBe(2);
    expect(weapon.rangedStrength).toBe(5);
    expect(weapon.ap).toBe(5);
    expect(weapon.damage).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Deflagrate' && r.value === '5')).toBe(true);
    expect(weapon.traits).toContain('Volkite');
  });

  it('Graviton gun: R18, FP1, RS6, AP4, D1, Blast (3"), Breaching (6+), Shock (Pinned), Graviton', () => {
    const weapon = RANGED_WEAPONS['graviton-gun'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(18);
    expect(weapon.rangedStrength).toBe(6);
    expect(weapon.ap).toBe(4);
    expect(weapon.specialRules.some(r => r.name === 'Blast' && r.value === '3"')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Breaching' && r.value === '6+')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Shock' && r.value === 'Pinned')).toBe(true);
    expect(weapon.traits).toContain('Graviton');
  });

  it('Nemesis bolter: R48, FP1, RS4, AP5, D1, Heavy (RS), Breaching (5+), Pinning (1), Precision (4+), Bolt', () => {
    const weapon = RANGED_WEAPONS['nemesis-bolter'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(48);
    expect(weapon.firepower).toBe(1);
    expect(weapon.specialRules.some(r => r.name === 'Heavy' && r.value === 'RS')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Breaching' && r.value === '5+')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Pinning' && r.value === '1')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Precision' && r.value === '4+')).toBe(true);
    expect(weapon.traits).toContain('Bolt');
  });

  it('Disintegrator pistol: R12, FP1, RS4, AP3, D2, Pistol, Overload (1), Assault, Disintegrator', () => {
    const weapon = RANGED_WEAPONS['disintegrator-pistol'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(12);
    expect(weapon.ap).toBe(3);
    expect(weapon.damage).toBe(2);
    expect(weapon.specialRules.some(r => r.name === 'Pistol')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Overload' && r.value === '1')).toBe(true);
    expect(weapon.traits).toContain('Assault');
    expect(weapon.traits).toContain('Disintegrator');
  });
});

// ─── Multi-Profile Weapons ───────────────────────────────────────────────────

describe('Multi-profile weapons', () => {
  it('Missile launcher has Frag and Krak profiles with same parentWeaponId', () => {
    const frag = RANGED_WEAPONS['missile-launcher-frag'];
    const krak = RANGED_WEAPONS['missile-launcher-krak'];
    expect(frag).toBeDefined();
    expect(krak).toBeDefined();
    expect(frag.parentWeaponId).toBe('missile-launcher');
    expect(krak.parentWeaponId).toBe('missile-launcher');
    // Frag: blast, lower strength
    expect(frag.rangedStrength).toBe(4);
    expect(frag.specialRules.some(r => r.name === 'Blast' && r.value === '3"')).toBe(true);
    // Krak: higher strength, no blast
    expect(krak.rangedStrength).toBe(8);
    expect(krak.ap).toBe(3);
    expect(krak.damage).toBe(2);
  });

  it('Conversion beam cannon has three range bands', () => {
    const short = RANGED_WEAPONS['conversion-beam-cannon-short'];
    const mid = RANGED_WEAPONS['conversion-beam-cannon-mid'];
    const long = RANGED_WEAPONS['conversion-beam-cannon-long'];
    expect(short).toBeDefined();
    expect(mid).toBeDefined();
    expect(long).toBeDefined();
    expect(short.parentWeaponId).toBe('conversion-beam-cannon');
    expect(mid.parentWeaponId).toBe('conversion-beam-cannon');
    expect(long.parentWeaponId).toBe('conversion-beam-cannon');
    // Strength increases with range
    expect(short.rangedStrength).toBeLessThan(mid.rangedStrength);
    expect(mid.rangedStrength).toBeLessThan(long.rangedStrength);
    // AP improves with range
    expect(short.ap!).toBeGreaterThan(mid.ap!);
    expect(mid.ap!).toBeGreaterThan(long.ap!);
    // Range bands
    expect(short.rangeBand).toEqual({ min: 0, max: 15 });
    expect(mid.rangeBand).toEqual({ min: 15, max: 30 });
    expect(long.rangeBand).toEqual({ min: 30, max: 45 });
  });

  it('Kratos battlecannon has HE, AP, and Flashburn profiles', () => {
    const he = RANGED_WEAPONS['kratos-battlecannon-he'];
    const ap = RANGED_WEAPONS['kratos-battlecannon-ap'];
    const flashburn = RANGED_WEAPONS['kratos-battlecannon-flashburn'];
    expect(he).toBeDefined();
    expect(ap).toBeDefined();
    expect(flashburn).toBeDefined();
    expect(he.parentWeaponId).toBe('kratos-battlecannon');
    expect(ap.parentWeaponId).toBe('kratos-battlecannon');
    expect(flashburn.parentWeaponId).toBe('kratos-battlecannon');
  });
});

// ─── Specific Melee Weapon Profiles ──────────────────────────────────────────

describe('Specific melee weapon profiles', () => {
  it('Chainsword: IM=I, AM=A, SM=S, AP5, D1, Chain', () => {
    const weapon = MELEE_WEAPONS['chainsword'];
    expect(weapon).toBeDefined();
    expect(weapon.name).toBe('Chainsword');
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.attacksModifier).toBe('A');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(5);
    expect(weapon.damage).toBe(1);
    expect(weapon.traits).toContain('Chain');
  });

  it('Chainaxe: IM=I, AM=A, SM=+1, AP4, D1, Chain', () => {
    const weapon = MELEE_WEAPONS['chainaxe'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.attacksModifier).toBe('A');
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('add');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(1);
    expect(weapon.ap).toBe(4);
    expect(weapon.damage).toBe(1);
    expect(weapon.traits).toContain('Chain');
  });

  it('Power fist: IM=1, AM=A, SM=x2, AP2, D2, Power', () => {
    const weapon = MELEE_WEAPONS['power-fist'];
    expect(weapon).toBeDefined();
    expect(weapon.name).toBe('Power fist');
    expect(weapon.initiativeModifier).toBe(1);
    expect(weapon.attacksModifier).toBe('A');
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('multiply');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(2);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(2);
    expect(weapon.traits).toContain('Power');
  });

  it('Power sword: IM=I, AM=A, SM=S, AP3, D1, Power', () => {
    const weapon = MELEE_WEAPONS['power-sword'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.attacksModifier).toBe('A');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(3);
    expect(weapon.damage).toBe(1);
    expect(weapon.traits).toContain('Power');
  });

  it('Power axe: IM=I, AM=A, SM=+1, AP2, D2, Power', () => {
    const weapon = MELEE_WEAPONS['power-axe'];
    expect(weapon).toBeDefined();
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('add');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(1);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(2);
    expect(weapon.traits).toContain('Power');
  });

  it('Thunder hammer: IM=1, AM=A, SM=x2, AP2, D3, Stun (1), Power', () => {
    const weapon = MELEE_WEAPONS['thunder-hammer'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe(1);
    expect(weapon.attacksModifier).toBe('A');
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('multiply');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(2);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(3);
    expect(weapon.specialRules.some(r => r.name === 'Stun' && r.value === '1')).toBe(true);
    expect(weapon.traits).toContain('Power');
  });

  it('Lightning claw: IM=I, AM=A, SM=S, AP3, D1, Shred (5+), Rending (6+), Power', () => {
    const weapon = MELEE_WEAPONS['lightning-claw'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(3);
    expect(weapon.specialRules.some(r => r.name === 'Shred' && r.value === '5+')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Rending' && r.value === '6+')).toBe(true);
    expect(weapon.traits).toContain('Power');
  });

  it('Pair of lightning claws: AM=+1 (bonus attack)', () => {
    const weapon = MELEE_WEAPONS['pair-lightning-claws'];
    expect(weapon).toBeDefined();
    expect((weapon.attacksModifier as StatModifierOp).op).toBe('add');
    expect((weapon.attacksModifier as StatModifierOp).value).toBe(1);
  });

  it('Force sword: IM=I, AM=A, SM=S, AP3, D1, Force (D), Force+Power traits', () => {
    const weapon = MELEE_WEAPONS['force-sword'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(3);
    expect(weapon.specialRules.some(r => r.name === 'Force' && r.value === 'D')).toBe(true);
    expect(weapon.traits).toContain('Force');
    expect(weapon.traits).toContain('Power');
  });

  it('Power maul: IM=+1, AM=A, SM=+2, AP4, D1, Power', () => {
    const weapon = MELEE_WEAPONS['power-maul'];
    expect(weapon).toBeDefined();
    expect((weapon.initiativeModifier as StatModifierOp).op).toBe('add');
    expect((weapon.initiativeModifier as StatModifierOp).value).toBe(1);
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('add');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(2);
    expect(weapon.ap).toBe(4);
    expect(weapon.traits).toContain('Power');
  });

  it('Close combat weapon: IM=I, AM=A, SM=S, AP null, D1', () => {
    const weapon = MELEE_WEAPONS['close-combat-weapon'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.attacksModifier).toBe('A');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBeNull();
    expect(weapon.damage).toBe(1);
  });

  it('Chain fist: IM=1, AM=A, SM=S, AP2, D2, Armourbane, Chain', () => {
    const weapon = MELEE_WEAPONS['chain-fist'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe(1);
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(2);
    expect(weapon.specialRules.some(r => r.name === 'Armourbane')).toBe(true);
    expect(weapon.traits).toContain('Chain');
  });

  it('Paragon blade: IM=I, AM=A, SM=+1, AP2, D2, Rending (4+), Power', () => {
    const weapon = MELEE_WEAPONS['paragon-blade'];
    expect(weapon).toBeDefined();
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('add');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(1);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(2);
    expect(weapon.specialRules.some(r => r.name === 'Rending' && r.value === '4+')).toBe(true);
    expect(weapon.traits).toContain('Power');
  });

  it('Dreadnought close combat weapon: IM=I, AM=A, SM=S, AP2, D2, Power', () => {
    const weapon = MELEE_WEAPONS['dreadnought-close-combat-weapon'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe('I');
    expect(weapon.strengthModifier).toBe('S');
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(2);
    expect(weapon.traits).toContain('Power');
  });

  it('Leviathan siege claw: IM=1, AM=A, SM=x2, AP2, D4, Armourbane, Power', () => {
    const weapon = MELEE_WEAPONS['leviathan-siege-claw'];
    expect(weapon).toBeDefined();
    expect(weapon.initiativeModifier).toBe(1);
    expect((weapon.strengthModifier as StatModifierOp).op).toBe('multiply');
    expect((weapon.strengthModifier as StatModifierOp).value).toBe(2);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(4);
    expect(weapon.specialRules.some(r => r.name === 'Armourbane')).toBe(true);
    expect(weapon.traits).toContain('Power');
  });
});

// ─── Combi Weapons ───────────────────────────────────────────────────────────

describe('Combi weapons', () => {
  it('Combi weapons have Combi special rule', () => {
    for (const weapon of COMBI_WEAPONS) {
      expect(weapon.specialRules.some(r => r.name === 'Combi')).toBe(true);
    }
  });

  it('Combi-flamer secondary has Template and Limited (1)', () => {
    const weapon = RANGED_WEAPONS['combi-flamer-secondary'];
    expect(weapon).toBeDefined();
    expect(weapon.hasTemplate).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Template')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Limited' && r.value === '1')).toBe(true);
  });

  it('Combi-melta secondary has Melta (6) and Limited (1)', () => {
    const weapon = RANGED_WEAPONS['combi-melta-secondary'];
    expect(weapon).toBeDefined();
    expect(weapon.specialRules.some(r => r.name === 'Melta' && r.value === '6')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Limited' && r.value === '1')).toBe(true);
  });
});

// ─── Grenade Weapons ─────────────────────────────────────────────────────────

describe('Grenade weapons', () => {
  it('Frag grenades: R6, FP1, RS3, AP null, D1, Blast (3"), Grenade, Assault', () => {
    const weapon = RANGED_WEAPONS['frag-grenades'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(6);
    expect(weapon.rangedStrength).toBe(3);
    expect(weapon.ap).toBeNull();
    expect(weapon.specialRules.some(r => r.name === 'Blast' && r.value === '3"')).toBe(true);
    expect(weapon.traits).toContain('Grenade');
    expect(weapon.traits).toContain('Assault');
  });

  it('Krak grenades: R6, FP1, RS6, AP4, D2, Grenade, Assault', () => {
    const weapon = RANGED_WEAPONS['krak-grenades'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(6);
    expect(weapon.rangedStrength).toBe(6);
    expect(weapon.ap).toBe(4);
    expect(weapon.damage).toBe(2);
    expect(weapon.traits).toContain('Grenade');
  });

  it('Melta bombs: R0, Detonation, Armourbane, Grenade', () => {
    const weapon = RANGED_WEAPONS['melta-bombs'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(0);
    expect(weapon.rangedStrength).toBe(8);
    expect(weapon.specialRules.some(r => r.name === 'Detonation')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Armourbane')).toBe(true);
    expect(weapon.traits).toContain('Grenade');
  });
});

// ─── Vehicle Weapons ─────────────────────────────────────────────────────────

describe('Vehicle-class weapons', () => {
  it('Turbo-laser destructor: R96, RS12, AP2, D6', () => {
    const weapon = RANGED_WEAPONS['turbo-laser-destructor'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(96);
    expect(weapon.rangedStrength).toBe(12);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(6);
  });

  it('Volcano cannon: R120, RS13, AP2, D12', () => {
    const weapon = RANGED_WEAPONS['volcano-cannon'];
    expect(weapon).toBeDefined();
    expect(weapon.range).toBe(120);
    expect(weapon.rangedStrength).toBe(13);
    expect(weapon.damage).toBe(12);
  });

  it('Demolisher cannon: R24, RS10, AP2, D4, Ordnance (D), Blast (5")', () => {
    const weapon = RANGED_WEAPONS['demolisher-cannon'];
    expect(weapon).toBeDefined();
    expect(weapon.rangedStrength).toBe(10);
    expect(weapon.ap).toBe(2);
    expect(weapon.damage).toBe(4);
    expect(weapon.specialRules.some(r => r.name === 'Ordnance' && r.value === 'D')).toBe(true);
    expect(weapon.specialRules.some(r => r.name === 'Blast' && r.value === '5"')).toBe(true);
  });

  it('Punisher rotary cannon: R36, FP12, RS5, AP4, D1, Suppressive (3)', () => {
    const weapon = RANGED_WEAPONS['punisher-rotary-cannon'];
    expect(weapon).toBeDefined();
    expect(weapon.firepower).toBe(12);
    expect(weapon.rangedStrength).toBe(5);
    expect(weapon.specialRules.some(r => r.name === 'Suppressive' && r.value === '3')).toBe(true);
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findWeapon', () => {
  it('finds a ranged weapon by id', () => {
    const weapon = findWeapon('bolter');
    expect(weapon).toBeDefined();
    expect(weapon!.name).toBe('Bolter');
  });

  it('finds a melee weapon by id', () => {
    const weapon = findWeapon('chainsword');
    expect(weapon).toBeDefined();
    expect(weapon!.name).toBe('Chainsword');
  });

  it('returns undefined for unknown id', () => {
    expect(findWeapon('nonexistent-weapon')).toBeUndefined();
  });
});

describe('findWeaponByName', () => {
  it('finds weapons by exact name (case-insensitive)', () => {
    const results = findWeaponByName('bolter');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(w => w.id === 'bolter')).toBe(true);
  });

  it('finds weapons by uppercase name', () => {
    const results = findWeaponByName('BOLTER');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown name', () => {
    const results = findWeaponByName('Nonexistent Weapon');
    expect(results.length).toBe(0);
  });

  it('finds multiple profiles with same name (e.g., Conversion beam cannon)', () => {
    const results = findWeaponByName('Conversion beam cannon');
    expect(results.length).toBe(3); // short, mid, long
  });
});

describe('isRangedWeapon / isMeleeWeapon', () => {
  it('correctly identifies ranged weapons', () => {
    const bolter = findWeapon('bolter')!;
    expect(isRangedWeapon(bolter)).toBe(true);
    expect(isMeleeWeapon(bolter)).toBe(false);
  });

  it('correctly identifies melee weapons', () => {
    const chainsword = findWeapon('chainsword')!;
    expect(isMeleeWeapon(chainsword)).toBe(true);
    expect(isRangedWeapon(chainsword)).toBe(false);
  });
});
