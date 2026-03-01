/**
 * Tests for Legion-Specific Weapon Database
 * Reference: HH_Legiones_Astartes.md — legion-specific weapon tables
 */

import { describe, it, expect } from 'vitest';
import type { RangedWeaponProfile, MeleeWeaponProfile } from '@hh/types';
import {
  DARK_ANGELS_WEAPONS,
  EMPERORS_CHILDREN_WEAPONS,
  IRON_WARRIORS_WEAPONS,
  WHITE_SCARS_WEAPONS,
  SPACE_WOLVES_WEAPONS,
  IMPERIAL_FISTS_WEAPONS,
  NIGHT_LORDS_WEAPONS,
  BLOOD_ANGELS_WEAPONS,
  IRON_HANDS_WEAPONS,
  WORLD_EATERS_WEAPONS,
  ULTRAMARINES_WEAPONS,
  DEATH_GUARD_WEAPONS,
  THOUSAND_SONS_WEAPONS,
  SONS_OF_HORUS_WEAPONS,
  WORD_BEARERS_WEAPONS,
  SALAMANDERS_WEAPONS,
  RAVEN_GUARD_WEAPONS,
  ALPHA_LEGION_WEAPONS,
  ALL_LEGION_WEAPONS,
  findLegionWeapon,
  findLegionWeaponByName,
} from './legion-weapons';

// ─── Type Guards ─────────────────────────────────────────────────────────────

function isRanged(w: RangedWeaponProfile | MeleeWeaponProfile): w is RangedWeaponProfile {
  return 'range' in w && 'firepower' in w;
}

function isMelee(w: RangedWeaponProfile | MeleeWeaponProfile): w is MeleeWeaponProfile {
  return 'initiativeModifier' in w && 'attacksModifier' in w;
}

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Legion weapon database integrity', () => {
  it('has all 18 legion weapon arrays', () => {
    expect(DARK_ANGELS_WEAPONS.length).toBeGreaterThan(0);
    expect(EMPERORS_CHILDREN_WEAPONS.length).toBeGreaterThan(0);
    expect(IRON_WARRIORS_WEAPONS.length).toBeGreaterThan(0);
    expect(WHITE_SCARS_WEAPONS.length).toBeGreaterThan(0);
    expect(SPACE_WOLVES_WEAPONS.length).toBeGreaterThan(0);
    expect(IMPERIAL_FISTS_WEAPONS.length).toBeGreaterThan(0);
    expect(NIGHT_LORDS_WEAPONS.length).toBeGreaterThan(0);
    expect(BLOOD_ANGELS_WEAPONS.length).toBeGreaterThan(0);
    expect(IRON_HANDS_WEAPONS.length).toBeGreaterThan(0);
    expect(WORLD_EATERS_WEAPONS.length).toBeGreaterThan(0);
    expect(ULTRAMARINES_WEAPONS.length).toBeGreaterThan(0);
    expect(DEATH_GUARD_WEAPONS.length).toBeGreaterThan(0);
    expect(THOUSAND_SONS_WEAPONS.length).toBeGreaterThan(0);
    expect(SONS_OF_HORUS_WEAPONS.length).toBeGreaterThan(0);
    expect(WORD_BEARERS_WEAPONS.length).toBeGreaterThan(0);
    expect(SALAMANDERS_WEAPONS.length).toBeGreaterThan(0);
    expect(RAVEN_GUARD_WEAPONS.length).toBeGreaterThan(0);
    expect(ALPHA_LEGION_WEAPONS.length).toBeGreaterThan(0);
  });

  it('ALL_LEGION_WEAPONS contains the sum of all per-legion arrays', () => {
    const expected =
      DARK_ANGELS_WEAPONS.length +
      EMPERORS_CHILDREN_WEAPONS.length +
      IRON_WARRIORS_WEAPONS.length +
      WHITE_SCARS_WEAPONS.length +
      SPACE_WOLVES_WEAPONS.length +
      IMPERIAL_FISTS_WEAPONS.length +
      NIGHT_LORDS_WEAPONS.length +
      BLOOD_ANGELS_WEAPONS.length +
      IRON_HANDS_WEAPONS.length +
      WORLD_EATERS_WEAPONS.length +
      ULTRAMARINES_WEAPONS.length +
      DEATH_GUARD_WEAPONS.length +
      THOUSAND_SONS_WEAPONS.length +
      SONS_OF_HORUS_WEAPONS.length +
      WORD_BEARERS_WEAPONS.length +
      SALAMANDERS_WEAPONS.length +
      RAVEN_GUARD_WEAPONS.length +
      ALPHA_LEGION_WEAPONS.length;
    expect(ALL_LEGION_WEAPONS.length).toBe(expected);
  });

  it('has at least 70 total legion weapon profiles', () => {
    expect(ALL_LEGION_WEAPONS.length).toBeGreaterThanOrEqual(70);
  });

  it('every weapon has a unique id', () => {
    const ids = ALL_LEGION_WEAPONS.map(w => w.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every weapon has required base fields', () => {
    for (const weapon of ALL_LEGION_WEAPONS) {
      expect(weapon.id).toBeTruthy();
      expect(weapon.name).toBeTruthy();
      expect(typeof weapon.damage).toBe('number');
      expect(weapon.damage).toBeGreaterThan(0);
      expect(Array.isArray(weapon.specialRules)).toBe(true);
      expect(Array.isArray(weapon.traits)).toBe(true);
    }
  });

  it('every ranged weapon has correct ranged fields', () => {
    const ranged = ALL_LEGION_WEAPONS.filter(isRanged);
    expect(ranged.length).toBeGreaterThan(0);
    for (const w of ranged) {
      expect(typeof w.range).toBe('number');
      expect(typeof w.hasTemplate).toBe('boolean');
      expect(typeof w.firepower).toBe('number');
      expect(w.firepower).toBeGreaterThan(0);
      expect(typeof w.rangedStrength).toBe('number');
      expect(w.rangedStrength).toBeGreaterThan(0);
    }
  });

  it('every melee weapon has correct melee fields', () => {
    const meleeWeapons = ALL_LEGION_WEAPONS.filter(isMelee);
    expect(meleeWeapons.length).toBeGreaterThan(0);
    for (const w of meleeWeapons) {
      expect(w.initiativeModifier).toBeDefined();
      expect(w.attacksModifier).toBeDefined();
      expect(w.strengthModifier).toBeDefined();
    }
  });

  it('template weapons have range 0 and hasTemplate true', () => {
    const templates = ALL_LEGION_WEAPONS.filter(isRanged).filter(w => w.hasTemplate);
    for (const w of templates) {
      expect(w.range).toBe(0);
    }
  });
});

// ─── Per-Legion Spot Checks ──────────────────────────────────────────────────

describe('Dark Angels weapons', () => {
  it('has Calibanite warblade with correct stats', () => {
    const w = findLegionWeapon('calibanite-warblade') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(isMelee(w)).toBe(true);
    expect(w.ap).toBe(3);
    expect(w.damage).toBe(1);
    expect(w.specialRules.some(r => r.name === 'Breaching' && r.value === '5+')).toBe(true);
    expect(w.traits).toContain('Sword of the Order');
  });

  it('has Terranic greatsword', () => {
    const w = findLegionWeapon('terranic-greatsword') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.ap).toBe(3);
    expect(w.damage).toBe(2);
    expect(w.traits).toContain('Sword of the Order');
  });

  it('has Calibanite charge-blade (multi-profile)', () => {
    const uncharged = findLegionWeapon('calibanite-charge-blade-uncharged');
    const charged = findLegionWeapon('calibanite-charge-blade-charged');
    expect(uncharged).toBeDefined();
    expect(charged).toBeDefined();
    expect(uncharged!.parentWeaponId).toBe('calibanite-charge-blade');
    expect(charged!.parentWeaponId).toBe('calibanite-charge-blade');
  });

  it('has Plasma burner (multi-profile)', () => {
    const sustained = findLegionWeapon('plasma-burner-sustained');
    const maximal = findLegionWeapon('plasma-burner-maximal');
    expect(sustained).toBeDefined();
    expect(maximal).toBeDefined();
    expect(isRanged(sustained!)).toBe(true);
    expect((sustained as RangedWeaponProfile).hasTemplate).toBe(true);
  });
});

describe("Emperor's Children weapons", () => {
  it('has Sonic lance with Template and Breaching', () => {
    const w = findLegionWeapon('sonic-lance') as RangedWeaponProfile;
    expect(w).toBeDefined();
    expect(w.hasTemplate).toBe(true);
    expect(w.traits).toContain('Sonic');
    expect(w.specialRules.some(r => r.name === 'Breaching')).toBe(true);
  });

  it('has Phoenix power spear with Impact', () => {
    const w = findLegionWeapon('phoenix-power-spear') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Impact')).toBe(true);
  });
});

describe('Iron Warriors weapons', () => {
  it('has Graviton crusher with Armourbane', () => {
    const w = findLegionWeapon('graviton-crusher') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Armourbane')).toBe(true);
    expect(w.traits).toContain('Graviton');
  });

  it('has Shrapnel bolter', () => {
    const w = findLegionWeapon('shrapnel-bolter') as RangedWeaponProfile;
    expect(w).toBeDefined();
    expect(w.range).toBe(18);
    expect(w.firepower).toBe(2);
    expect(w.traits).toContain('Bolt');
  });
});

describe('Space Wolves weapons', () => {
  it('has 5 weapons (fenrisian axe, frost sword/axe/claw, great frost blade)', () => {
    expect(SPACE_WOLVES_WEAPONS.length).toBe(5);
  });

  it('Frost claw has Shred and Breaching', () => {
    const w = findLegionWeapon('frost-claw') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Breaching' && r.value === '4+')).toBe(true);
    expect(w.specialRules.some(r => r.name === 'Shred')).toBe(true);
  });
});

describe('Imperial Fists weapons', () => {
  it('has Solarite power gauntlet with Critical Hit', () => {
    const w = findLegionWeapon('solarite-power-gauntlet') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.ap).toBe(2);
    expect(w.damage).toBe(2);
    expect(w.specialRules.some(r => r.name === 'Critical Hit')).toBe(true);
  });

  it('has Iliastus assault cannon (multi-profile)', () => {
    const sustained = findLegionWeapon('iliastus-assault-cannon-sustained') as RangedWeaponProfile;
    const maximal = findLegionWeapon('iliastus-assault-cannon-maximal') as RangedWeaponProfile;
    expect(sustained).toBeDefined();
    expect(maximal).toBeDefined();
    expect(sustained.firepower).toBe(3);
    expect(maximal.firepower).toBe(5);
    expect(maximal.specialRules.some(r => r.name === 'Overload')).toBe(true);
  });
});

describe('Blood Angels weapons', () => {
  it('has Inferno pistol with Melta', () => {
    const w = findLegionWeapon('inferno-pistol') as RangedWeaponProfile;
    expect(w).toBeDefined();
    expect(w.range).toBe(6);
    expect(w.rangedStrength).toBe(8);
    expect(w.traits).toContain('Melta');
  });

  it('has all 4 Perdition weapons', () => {
    expect(findLegionWeapon('blade-of-perdition')).toBeDefined();
    expect(findLegionWeapon('axe-of-perdition')).toBeDefined();
    expect(findLegionWeapon('maul-of-perdition')).toBeDefined();
    expect(findLegionWeapon('spear-of-perdition')).toBeDefined();
  });

  it('Perdition weapons have Aflame', () => {
    for (const id of ['blade-of-perdition', 'axe-of-perdition', 'maul-of-perdition', 'spear-of-perdition']) {
      const w = findLegionWeapon(id)!;
      expect(w.specialRules.some(r => r.name === 'Aflame')).toBe(true);
    }
  });
});

describe('World Eaters weapons', () => {
  it('has Excoriator chainaxe with Chain trait', () => {
    const w = findLegionWeapon('excoriator-chainaxe') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.traits).toContain('Chain');
    expect(w.specialRules.some(r => r.name === 'Breaching')).toBe(true);
  });

  it('has Barb-hook lash with Phage', () => {
    const w = findLegionWeapon('barb-hook-lash') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Phage')).toBe(true);
  });
});

describe('Thousand Sons weapons', () => {
  it('has Achea force sword with Force and Psychic trait', () => {
    const w = findLegionWeapon('achea-force-sword') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Force')).toBe(true);
    expect(w.traits).toContain('Psychic');
  });

  it('has Prosperine Arcana psychic weapons', () => {
    expect(findLegionWeapon('raptora-crushing-force')).toBeDefined();
    expect(findLegionWeapon('pyrae-burning-grasp')).toBeDefined();
    expect(findLegionWeapon('pavoni-bloodboil')).toBeDefined();
    expect(findLegionWeapon('athanaean-emanation-of-dread')).toBeDefined();
  });
});

describe('Sons of Horus weapons', () => {
  it('has Banestrike bolter with Breaching', () => {
    const w = findLegionWeapon('banestrike-bolter') as RangedWeaponProfile;
    expect(w).toBeDefined();
    expect(w.range).toBe(18);
    expect(w.specialRules.some(r => r.name === 'Breaching')).toBe(true);
    expect(w.traits).toContain('Bolt');
  });

  it('has Carsoran power axe and tabar', () => {
    expect(findLegionWeapon('carsoran-power-axe')).toBeDefined();
    expect(findLegionWeapon('carsoran-power-tabar')).toBeDefined();
  });
});

describe('Salamanders weapons', () => {
  it('has forge-crafted power weapons (5 types)', () => {
    expect(findLegionWeapon('forge-crafted-power-sword')).toBeDefined();
    expect(findLegionWeapon('forge-crafted-power-axe')).toBeDefined();
    expect(findLegionWeapon('forge-crafted-power-maul')).toBeDefined();
    expect(findLegionWeapon('forge-crafted-power-lance')).toBeDefined();
    expect(findLegionWeapon('forge-crafted-thunder-hammer')).toBeDefined();
  });

  it('has forge-crafted flame weapons (3 types)', () => {
    const hf = findLegionWeapon('forge-crafted-hand-flamer') as RangedWeaponProfile;
    const f = findLegionWeapon('forge-crafted-flamer') as RangedWeaponProfile;
    const heavy = findLegionWeapon('forge-crafted-heavy-flamer') as RangedWeaponProfile;
    expect(hf).toBeDefined();
    expect(f).toBeDefined();
    expect(heavy).toBeDefined();
    // All are templates
    expect(hf.hasTemplate).toBe(true);
    expect(f.hasTemplate).toBe(true);
    expect(heavy.hasTemplate).toBe(true);
    // All have Flame trait
    expect(hf.traits).toContain('Flame');
    expect(f.traits).toContain('Flame');
    expect(heavy.traits).toContain('Flame');
    // Forge-crafted flamers have D2
    expect(hf.damage).toBe(2);
    expect(f.damage).toBe(2);
    expect(heavy.damage).toBe(2);
  });
});

describe('Raven Guard weapons', () => {
  it("has Raven's Talon with Impact and Rending", () => {
    const w = findLegionWeapon('ravens-talon') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Impact')).toBe(true);
    expect(w.specialRules.some(r => r.name === 'Rending')).toBe(true);
  });

  it("Pair of Raven's Talons has +2 attacks modifier", () => {
    const w = findLegionWeapon('pair-of-ravens-talons') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.attacksModifier).toEqual({ op: 'add', value: 2 });
  });
});

describe('Alpha Legion weapons', () => {
  it('has Venom spheres with Blast and Poisoned', () => {
    const w = findLegionWeapon('venom-spheres') as RangedWeaponProfile;
    expect(w).toBeDefined();
    expect(w.range).toBe(8);
    expect(w.specialRules.some(r => r.name === 'Blast')).toBe(true);
    expect(w.specialRules.some(r => r.name === 'Poisoned')).toBe(true);
  });

  it('has Power dagger with Breaching', () => {
    const w = findLegionWeapon('power-dagger') as MeleeWeaponProfile;
    expect(w).toBeDefined();
    expect(w.specialRules.some(r => r.name === 'Breaching')).toBe(true);
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findLegionWeapon', () => {
  it('returns weapon by exact id', () => {
    const w = findLegionWeapon('calibanite-warblade');
    expect(w).toBeDefined();
    expect(w!.name).toBe('Calibanite warblade');
  });

  it('returns undefined for non-existent id', () => {
    expect(findLegionWeapon('nonexistent-weapon')).toBeUndefined();
  });
});

describe('findLegionWeaponByName', () => {
  it('returns weapons matching name (case-insensitive)', () => {
    const results = findLegionWeaponByName('Calibanite warblade');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('calibanite-warblade');
  });

  it('returns empty array for non-existent name', () => {
    expect(findLegionWeaponByName('Nonexistent Weapon')).toEqual([]);
  });

  it('is case-insensitive', () => {
    const results = findLegionWeaponByName('CALIBANITE WARBLADE');
    expect(results.length).toBe(1);
  });
});
