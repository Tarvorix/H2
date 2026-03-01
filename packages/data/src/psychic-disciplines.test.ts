/**
 * Tests for Psychic Disciplines Database
 * Validates all 6 core psychic disciplines from HH_Armoury.md
 */

import { describe, it, expect } from 'vitest';
import type { RangedWeaponProfile, MeleeWeaponProfile } from '@hh/types';
import {
  PSYCHIC_DISCIPLINES,
  PSYCHIC_WEAPON_PROFILES,
  getDisciplineIds,
  findDiscipline,
  findDisciplineByName,
  getPsychicWeaponProfile,
  isPsychicMeleeWeapon,
  isPsychicRangedWeapon,
} from './psychic-disciplines';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Psychic Disciplines — Database Integrity', () => {
  it('has exactly 6 disciplines', () => {
    expect(Object.keys(PSYCHIC_DISCIPLINES)).toHaveLength(6);
  });

  it('has all 6 expected disciplines', () => {
    const ids = getDisciplineIds();
    expect(ids).toContain('biomancy');
    expect(ids).toContain('pyromancy');
    expect(ids).toContain('telekinesis');
    expect(ids).toContain('divination');
    expect(ids).toContain('telepathy');
    expect(ids).toContain('thaumaturgy');
  });

  it('every discipline has an id matching its key', () => {
    for (const [key, disc] of Object.entries(PSYCHIC_DISCIPLINES)) {
      expect(disc.id).toBe(key);
    }
  });

  it('every discipline has a name and description', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      expect(disc.name).toBeTruthy();
      expect(disc.description).toBeTruthy();
    }
  });

  it('every discipline has a granted trait', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      expect(disc.grantedTrait).toBeTruthy();
    }
  });

  it('every discipline has at least one granted special rule', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      expect(disc.grantedSpecialRules.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every discipline has arrays for weapons, powers, reactions, and gambits', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      expect(Array.isArray(disc.weapons)).toBe(true);
      expect(Array.isArray(disc.powers)).toBe(true);
      expect(Array.isArray(disc.reactions)).toBe(true);
      expect(Array.isArray(disc.gambits)).toBe(true);
    }
  });

  it('every weapon references a valid weapon profile', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const weapon of disc.weapons) {
        expect(PSYCHIC_WEAPON_PROFILES[weapon.weaponProfileId]).toBeDefined();
      }
    }
  });

  it('every weapon has discipline field matching its parent discipline', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const weapon of disc.weapons) {
        expect(weapon.discipline).toBe(disc.name);
      }
    }
  });

  it('every power has discipline field matching its parent discipline', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const power of disc.powers) {
        expect(power.discipline).toBe(disc.name);
      }
    }
  });

  it('every reaction has discipline field matching its parent discipline', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const reaction of disc.reactions) {
        expect(reaction.discipline).toBe(disc.name);
      }
    }
  });

  it('every gambit has discipline field matching its parent discipline', () => {
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const gambit of disc.gambits) {
        expect(gambit.discipline).toBe(disc.name);
      }
    }
  });

  it('has exactly 5 psychic weapon profiles', () => {
    expect(Object.keys(PSYCHIC_WEAPON_PROFILES)).toHaveLength(5);
  });
});

// ─── Biomancy ────────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Biomancy', () => {
  const biomancy = PSYCHIC_DISCIPLINES['biomancy'];

  it('has correct name and trait', () => {
    expect(biomancy.name).toBe('Biomancy');
    expect(biomancy.grantedTrait).toBe('Biomancer');
  });

  it('grants Impact(Strength) special rule', () => {
    expect(biomancy.grantedSpecialRules).toHaveLength(1);
    expect(biomancy.grantedSpecialRules[0].name).toBe('Impact');
    expect(biomancy.grantedSpecialRules[0].value).toBe('Strength');
  });

  it('has 1 weapon: Biomantic Slam', () => {
    expect(biomancy.weapons).toHaveLength(1);
    expect(biomancy.weapons[0].name).toBe('Biomantic Slam');
    expect(biomancy.weapons[0].weaponProfileId).toBe('biomantic-slam');
  });

  it('has 1 power: Biomantic Rage', () => {
    expect(biomancy.powers).toHaveLength(1);
    expect(biomancy.powers[0].name).toBe('Biomantic Rage');
    expect(biomancy.powers[0].powerType).toBe('Blessing');
    expect(biomancy.powers[0].phase).toBe('Charge Sub-Phase');
  });

  it('Biomantic Rage grants +2 Strength and Toughness', () => {
    const power = biomancy.powers[0];
    expect(power.effects).toContain('+2');
    expect(power.effects).toContain('Strength');
    expect(power.effects).toContain('Toughness');
  });

  it('has no reactions or gambits', () => {
    expect(biomancy.reactions).toHaveLength(0);
    expect(biomancy.gambits).toHaveLength(0);
  });

  it('Biomantic Slam weapon profile is correct', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['biomantic-slam'] as MeleeWeaponProfile;
    expect(profile.name).toBe('Biomantic Slam');
    expect(profile.initiativeModifier).toBe(3);
    expect(profile.attacksModifier).toBe(1);
    expect(profile.strengthModifier).toBe(12);
    expect(profile.ap).toBe(2);
    expect(profile.damage).toBe(2);
    expect(profile.traits).toContain('Melee');
    expect(profile.traits).toContain('Psychic');
  });

  it('Biomantic Slam has Armourbane and Force(Damage) special rules', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['biomantic-slam'] as MeleeWeaponProfile;
    const ruleNames = profile.specialRules.map(r => r.name);
    expect(ruleNames).toContain('Armourbane');
    expect(ruleNames).toContain('Force');
    const forceRule = profile.specialRules.find(r => r.name === 'Force');
    expect(forceRule?.value).toBe('Damage');
  });
});

// ─── Pyromancy ───────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Pyromancy', () => {
  const pyromancy = PSYCHIC_DISCIPLINES['pyromancy'];

  it('has correct name and trait', () => {
    expect(pyromancy.name).toBe('Pyromancy');
    expect(pyromancy.grantedTrait).toBe('Pyromancer');
  });

  it('grants Explodes(4+) special rule', () => {
    expect(pyromancy.grantedSpecialRules).toHaveLength(1);
    expect(pyromancy.grantedSpecialRules[0].name).toBe('Explodes');
    expect(pyromancy.grantedSpecialRules[0].value).toBe('4+');
  });

  it('has 2 weapons: Wildfire and Conflagration', () => {
    expect(pyromancy.weapons).toHaveLength(2);
    const names = pyromancy.weapons.map(w => w.name);
    expect(names).toContain('Wildfire');
    expect(names).toContain('Conflagration');
  });

  it('has no powers, reactions, or gambits', () => {
    expect(pyromancy.powers).toHaveLength(0);
    expect(pyromancy.reactions).toHaveLength(0);
    expect(pyromancy.gambits).toHaveLength(0);
  });

  it('Wildfire weapon profile is correct', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['wildfire'] as RangedWeaponProfile;
    expect(profile.name).toBe('Wildfire');
    expect(profile.range).toBe(18);
    expect(profile.firepower).toBe(1);
    expect(profile.rangedStrength).toBe(4);
    expect(profile.ap).toBe(4);
    expect(profile.damage).toBe(1);
    expect(profile.traits).toContain('Ranged');
    expect(profile.traits).toContain('Psychic');
  });

  it('Wildfire has Panic(1), Blast(5"), and Force(Strength) special rules', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['wildfire'] as RangedWeaponProfile;
    const ruleNames = profile.specialRules.map(r => r.name);
    expect(ruleNames).toContain('Panic');
    expect(ruleNames).toContain('Blast');
    expect(ruleNames).toContain('Force');
    expect(profile.specialRules.find(r => r.name === 'Panic')?.value).toBe('1');
    expect(profile.specialRules.find(r => r.name === 'Blast')?.value).toBe('5"');
    expect(profile.specialRules.find(r => r.name === 'Force')?.value).toBe('Strength');
  });

  it('Conflagration weapon profile is correct', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['conflagration'] as RangedWeaponProfile;
    expect(profile.name).toBe('Conflagration');
    expect(profile.range).toBe(-1);
    expect(profile.firepower).toBe(6);
    expect(profile.rangedStrength).toBe(5);
    expect(profile.ap).toBe(4);
    expect(profile.damage).toBe(1);
    expect(profile.traits).toContain('Melee');
    expect(profile.traits).toContain('Psychic');
  });

  it('Conflagration has Deflagrate(5) special rule', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['conflagration'] as RangedWeaponProfile;
    const deflagrate = profile.specialRules.find(r => r.name === 'Deflagrate');
    expect(deflagrate).toBeDefined();
    expect(deflagrate?.value).toBe('5');
  });
});

// ─── Telekinesis ─────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Telekinesis', () => {
  const telekinesis = PSYCHIC_DISCIPLINES['telekinesis'];

  it('has correct name and trait', () => {
    expect(telekinesis.name).toBe('Telekinesis');
    expect(telekinesis.grantedTrait).toBe('Telekine');
  });

  it('grants Shrouded(4+) special rule', () => {
    expect(telekinesis.grantedSpecialRules).toHaveLength(1);
    expect(telekinesis.grantedSpecialRules[0].name).toBe('Shrouded');
    expect(telekinesis.grantedSpecialRules[0].value).toBe('4+');
  });

  it('has 1 weapon: Immovable Force', () => {
    expect(telekinesis.weapons).toHaveLength(1);
    expect(telekinesis.weapons[0].name).toBe('Immovable Force');
    expect(telekinesis.weapons[0].weaponProfileId).toBe('immovable-force');
  });

  it('has 1 reaction: Force Barrier', () => {
    expect(telekinesis.reactions).toHaveLength(1);
    expect(telekinesis.reactions[0].name).toBe('Force Barrier');
    expect(telekinesis.reactions[0].cost).toBe(1);
    expect(telekinesis.reactions[0].phase).toBe('Shooting Phase / Assault Phase');
  });

  it('Force Barrier grants 3+ Shrouded DMT', () => {
    const reaction = telekinesis.reactions[0];
    expect(reaction.effects).toContain('3+');
    expect(reaction.effects).toContain('Shrouded');
    expect(reaction.effects).toContain('Damage Mitigation Test');
  });

  it('has no powers or gambits', () => {
    expect(telekinesis.powers).toHaveLength(0);
    expect(telekinesis.gambits).toHaveLength(0);
  });

  it('Immovable Force weapon profile is correct', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['immovable-force'] as RangedWeaponProfile;
    expect(profile.name).toBe('Immovable Force');
    expect(profile.range).toBe(18);
    expect(profile.firepower).toBe(3);
    expect(profile.rangedStrength).toBe(6);
    expect(profile.ap).toBe(4);
    expect(profile.damage).toBe(1);
    expect(profile.traits).toContain('Ranged');
    expect(profile.traits).toContain('Psychic');
  });

  it('Immovable Force has Pinning(2) and Force(Firepower) special rules', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['immovable-force'] as RangedWeaponProfile;
    const ruleNames = profile.specialRules.map(r => r.name);
    expect(ruleNames).toContain('Pinning');
    expect(ruleNames).toContain('Force');
    expect(profile.specialRules.find(r => r.name === 'Pinning')?.value).toBe('2');
    expect(profile.specialRules.find(r => r.name === 'Force')?.value).toBe('Firepower');
  });
});

// ─── Divination ──────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Divination', () => {
  const divination = PSYCHIC_DISCIPLINES['divination'];

  it('has correct name and trait', () => {
    expect(divination.name).toBe('Divination');
    expect(divination.grantedTrait).toBe('Diviner');
  });

  it('grants Duellist\'s Edge(2) special rule', () => {
    expect(divination.grantedSpecialRules).toHaveLength(1);
    expect(divination.grantedSpecialRules[0].name).toBe('Duellist\'s Edge');
    expect(divination.grantedSpecialRules[0].value).toBe('2');
  });

  it('has no weapons', () => {
    expect(divination.weapons).toHaveLength(0);
  });

  it('has 1 power: Foresight\'s Blessing', () => {
    expect(divination.powers).toHaveLength(1);
    expect(divination.powers[0].name).toBe('Foresight\'s Blessing');
    expect(divination.powers[0].powerType).toBe('Blessing');
    expect(divination.powers[0].phase).toBe('Shooting Phase');
  });

  it('Foresight\'s Blessing grants Precision(5+)', () => {
    const power = divination.powers[0];
    expect(power.effects).toContain('Precision');
    expect(power.effects).toContain('5+');
  });

  it('has 1 gambit: Every Strike Foreseen', () => {
    expect(divination.gambits).toHaveLength(1);
    expect(divination.gambits[0].name).toBe('Every Strike Foreseen');
  });

  it('Every Strike Foreseen: Flit Tests on 2+ on successful WP check', () => {
    const gambit = divination.gambits[0];
    expect(gambit.effects).toContain('Flit Tests');
    expect(gambit.effects).toContain('2+');
    expect(gambit.effects).toContain('Willpower Check');
  });

  it('has no reactions', () => {
    expect(divination.reactions).toHaveLength(0);
  });
});

// ─── Telepathy ───────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Telepathy', () => {
  const telepathy = PSYCHIC_DISCIPLINES['telepathy'];

  it('has correct name and trait', () => {
    expect(telepathy.name).toBe('Telepathy');
    expect(telepathy.grantedTrait).toBe('Telepath');
  });

  it('grants Fear(1) special rule', () => {
    expect(telepathy.grantedSpecialRules).toHaveLength(1);
    expect(telepathy.grantedSpecialRules[0].name).toBe('Fear');
    expect(telepathy.grantedSpecialRules[0].value).toBe('1');
  });

  it('has 1 weapon: Cursed Whispers', () => {
    expect(telepathy.weapons).toHaveLength(1);
    expect(telepathy.weapons[0].name).toBe('Cursed Whispers');
    expect(telepathy.weapons[0].weaponProfileId).toBe('cursed-whispers');
  });

  it('has 1 power: Mind-burst', () => {
    expect(telepathy.powers).toHaveLength(1);
    expect(telepathy.powers[0].name).toBe('Mind-burst');
    expect(telepathy.powers[0].powerType).toBe('Curse');
    expect(telepathy.powers[0].phase).toBe('Movement Phase');
  });

  it('Mind-burst forces Fall Back and potentially Routed', () => {
    const power = telepathy.powers[0];
    expect(power.effects).toContain('Fall Back');
    expect(power.effects).toContain('Routed');
  });

  it('has no reactions or gambits', () => {
    expect(telepathy.reactions).toHaveLength(0);
    expect(telepathy.gambits).toHaveLength(0);
  });

  it('Cursed Whispers weapon profile is correct', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['cursed-whispers'] as RangedWeaponProfile;
    expect(profile.name).toBe('Cursed Whispers');
    expect(profile.range).toBe(18);
    expect(profile.firepower).toBe(2);
    expect(profile.rangedStrength).toBe(3);
    expect(profile.ap).toBeNull();
    expect(profile.damage).toBe(1);
    expect(profile.traits).toContain('Ranged');
    expect(profile.traits).toContain('Psychic');
  });

  it('Cursed Whispers has Stun(-) special rule', () => {
    const profile = PSYCHIC_WEAPON_PROFILES['cursed-whispers'] as RangedWeaponProfile;
    const stun = profile.specialRules.find(r => r.name === 'Stun');
    expect(stun).toBeDefined();
    expect(stun?.value).toBe('-');
  });
});

// ─── Thaumaturgy ─────────────────────────────────────────────────────────────

describe('Psychic Disciplines — Thaumaturgy', () => {
  const thaumaturgy = PSYCHIC_DISCIPLINES['thaumaturgy'];

  it('has correct name and trait', () => {
    expect(thaumaturgy.name).toBe('Thaumaturgy');
    expect(thaumaturgy.grantedTrait).toBe('Thaumaturge');
  });

  it('grants Hatred(Psykers) special rule', () => {
    expect(thaumaturgy.grantedSpecialRules).toHaveLength(1);
    expect(thaumaturgy.grantedSpecialRules[0].name).toBe('Hatred');
    expect(thaumaturgy.grantedSpecialRules[0].value).toBe('Psykers');
  });

  it('has no weapons', () => {
    expect(thaumaturgy.weapons).toHaveLength(0);
  });

  it('has 1 power: Tranquillity', () => {
    expect(thaumaturgy.powers).toHaveLength(1);
    expect(thaumaturgy.powers[0].name).toBe('Tranquillity');
    expect(thaumaturgy.powers[0].powerType).toBe('Curse');
    expect(thaumaturgy.powers[0].phase).toBe('Start Phase (Effects Sub-Phase)');
  });

  it('Tranquillity reduces WP by 2 and Strength by 1 for psychic attacks', () => {
    const power = thaumaturgy.powers[0];
    expect(power.effects).toContain('-2');
    expect(power.effects).toContain('Willpower');
    expect(power.effects).toContain('reduced by 1');
  });

  it('has 1 reaction: Resurrection', () => {
    expect(thaumaturgy.reactions).toHaveLength(1);
    expect(thaumaturgy.reactions[0].name).toBe('Resurrection');
    expect(thaumaturgy.reactions[0].cost).toBe(1);
    expect(thaumaturgy.reactions[0].phase).toBe('Shooting Phase');
  });

  it('Resurrection returns a casualty on 4+', () => {
    const reaction = thaumaturgy.reactions[0];
    expect(reaction.effects).toContain('4');
    expect(reaction.effects).toContain('Casualty');
  });

  it('has no gambits', () => {
    expect(thaumaturgy.gambits).toHaveLength(0);
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('Psychic Disciplines — Lookup Functions', () => {
  it('getDisciplineIds returns all 6 IDs', () => {
    const ids = getDisciplineIds();
    expect(ids).toHaveLength(6);
    expect(ids).toContain('biomancy');
    expect(ids).toContain('pyromancy');
    expect(ids).toContain('telekinesis');
    expect(ids).toContain('divination');
    expect(ids).toContain('telepathy');
    expect(ids).toContain('thaumaturgy');
  });

  it('findDiscipline returns correct discipline by ID', () => {
    const disc = findDiscipline('biomancy');
    expect(disc).toBeDefined();
    expect(disc!.name).toBe('Biomancy');
  });

  it('findDiscipline returns undefined for unknown ID', () => {
    expect(findDiscipline('necromancy')).toBeUndefined();
  });

  it('findDisciplineByName finds by display name (case-insensitive)', () => {
    const disc = findDisciplineByName('PYROMANCY');
    expect(disc).toBeDefined();
    expect(disc!.id).toBe('pyromancy');
  });

  it('findDisciplineByName returns undefined for unknown name', () => {
    expect(findDisciplineByName('Astromancy')).toBeUndefined();
  });

  it('getPsychicWeaponProfile returns correct profile', () => {
    const profile = getPsychicWeaponProfile('wildfire');
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('Wildfire');
  });

  it('getPsychicWeaponProfile returns undefined for unknown ID', () => {
    expect(getPsychicWeaponProfile('nonexistent')).toBeUndefined();
  });

  it('isPsychicMeleeWeapon correctly identifies melee weapons', () => {
    expect(isPsychicMeleeWeapon('biomantic-slam')).toBe(true);
    expect(isPsychicMeleeWeapon('wildfire')).toBe(false);
    expect(isPsychicMeleeWeapon('nonexistent')).toBe(false);
  });

  it('isPsychicRangedWeapon correctly identifies ranged weapons', () => {
    expect(isPsychicRangedWeapon('wildfire')).toBe(true);
    expect(isPsychicRangedWeapon('immovable-force')).toBe(true);
    expect(isPsychicRangedWeapon('biomantic-slam')).toBe(false);
    expect(isPsychicRangedWeapon('nonexistent')).toBe(false);
  });
});

// ─── Cross-Discipline Checks ─────────────────────────────────────────────────

describe('Psychic Disciplines — Cross-Discipline Checks', () => {
  it('all weapon profile IDs are unique', () => {
    const allIds = new Set<string>();
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const weapon of disc.weapons) {
        expect(allIds.has(weapon.id)).toBe(false);
        allIds.add(weapon.id);
      }
    }
  });

  it('all power IDs are unique', () => {
    const allIds = new Set<string>();
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const power of disc.powers) {
        expect(allIds.has(power.id)).toBe(false);
        allIds.add(power.id);
      }
    }
  });

  it('all reaction IDs are unique', () => {
    const allIds = new Set<string>();
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const reaction of disc.reactions) {
        expect(allIds.has(reaction.id)).toBe(false);
        allIds.add(reaction.id);
      }
    }
  });

  it('all gambit IDs are unique', () => {
    const allIds = new Set<string>();
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      for (const gambit of disc.gambits) {
        expect(allIds.has(gambit.id)).toBe(false);
        allIds.add(gambit.id);
      }
    }
  });

  it('total psychic weapons across all disciplines = 5', () => {
    let count = 0;
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      count += disc.weapons.length;
    }
    expect(count).toBe(5);
  });

  it('total psychic powers across all disciplines = 4', () => {
    let count = 0;
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      count += disc.powers.length;
    }
    expect(count).toBe(4);
  });

  it('total psychic reactions across all disciplines = 2', () => {
    let count = 0;
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      count += disc.reactions.length;
    }
    expect(count).toBe(2);
  });

  it('total psychic gambits across all disciplines = 1', () => {
    let count = 0;
    for (const disc of Object.values(PSYCHIC_DISCIPLINES)) {
      count += disc.gambits.length;
    }
    expect(count).toBe(1);
  });

  it('all psychic weapon profiles have Psychic trait', () => {
    for (const profile of Object.values(PSYCHIC_WEAPON_PROFILES)) {
      expect(profile.traits).toContain('Psychic');
    }
  });

  it('each discipline has a unique trait name', () => {
    const traits = Object.values(PSYCHIC_DISCIPLINES).map(d => d.grantedTrait);
    const uniqueTraits = new Set(traits);
    expect(uniqueTraits.size).toBe(traits.length);
  });
});
