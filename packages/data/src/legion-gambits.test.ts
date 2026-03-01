/**
 * Tests for Legion Gambit Data
 * Reference: HH_Legiones_Astartes.md — all legion "GAMBIT" subsections
 */

import { describe, it, expect } from 'vitest';
import { LegionFaction } from '@hh/types';
import {
  LEGION_GAMBITS,
  findLegionGambit,
  getLegionGambitsForLegion,
} from './legion-gambits';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Legion gambit database integrity', () => {
  it('has 21 gambits (18 standard + SW second + 2 Hereticus)', () => {
    expect(LEGION_GAMBITS.length).toBe(21);
  });

  it('every gambit has a unique id', () => {
    const ids = LEGION_GAMBITS.map(g => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every gambit has required fields', () => {
    for (const g of LEGION_GAMBITS) {
      expect(g.id).toBeTruthy();
      expect(g.name).toBeTruthy();
      expect(g.legion).toBeTruthy();
      expect(g.description).toBeTruthy();
    }
  });

  it('all 18 legions have at least one gambit', () => {
    for (const legion of Object.values(LegionFaction)) {
      const gambits = getLegionGambitsForLegion(legion);
      expect(gambits.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Per-Legion Spot Checks ──────────────────────────────────────────────────

describe('Dark Angels — Sword of the Order', () => {
  it('requires sword weapons', () => {
    const g = findLegionGambit('da-sword-of-order')!;
    expect(g.requiresWeaponTrait).toContain('Sword of the Order');
    expect(g.requiresWeaponNamePattern).toBeDefined();
    expect(g.requiresWeaponNamePattern!.length).toBeGreaterThan(0);
  });

  it('modifies attacks by -1 and grants Critical Hit', () => {
    const g = findLegionGambit('da-sword-of-order')!;
    expect(g.attacksModifier).toBe(-1);
    expect(g.grantWeaponSpecialRule).toEqual({ name: 'Critical Hit', value: '6+' });
    expect(g.improveWeaponSpecialRule).toEqual({ name: 'Critical Hit', improvement: 1 });
  });
});

describe("Emperor's Children — Paragon of Excellence", () => {
  it('is first face-off only with +2 focus roll', () => {
    const g = findLegionGambit('ec-paragon')!;
    expect(g.firstFaceOffOnly).toBe(true);
    expect(g.focusRollModifier).toBe(2);
  });
});

describe('Iron Warriors — Spiteful Demise', () => {
  it('has on-death auto-hit with S6 AP4 D2 Breaching', () => {
    const g = findLegionGambit('iw-spiteful-demise')!;
    expect(g.onDeathAutoHit).toBeDefined();
    expect(g.onDeathAutoHit!.strength).toBe(6);
    expect(g.onDeathAutoHit!.ap).toBe(4);
    expect(g.onDeathAutoHit!.damage).toBe(2);
    expect(g.onDeathAutoHit!.specialRules).toBeDefined();
    expect(g.onDeathAutoHit!.specialRules!.some(r => r.name === 'Breaching')).toBe(true);
  });
});

describe('White Scars — Path of the Warrior', () => {
  it('has prediction mechanic with Strike Low/High ranges', () => {
    const g = findLegionGambit('ws-path-of-warrior')!;
    expect(g.predictionMechanic).toBeDefined();
    expect(g.predictionMechanic!.ranges.length).toBe(2);
    expect(g.predictionMechanic!.ranges[0].name).toBe('Strike Low');
    expect(g.predictionMechanic!.ranges[0].min).toBe(1);
    expect(g.predictionMechanic!.ranges[0].max).toBe(3);
    expect(g.predictionMechanic!.ranges[1].name).toBe('Strike High');
    expect(g.predictionMechanic!.ranges[1].min).toBe(4);
    expect(g.predictionMechanic!.ranges[1].max).toBe(6);
    expect(g.predictionMechanic!.onCorrect).toBe('ignoreAllNegativeModifiers');
  });
});

describe('Space Wolves — Wolves of Fenris', () => {
  it('prevents glory choice (fight to the death)', () => {
    const g = findLegionGambit('sw-wolves-of-fenris')!;
    expect(g.preventGloryChoice).toBe(true);
  });
});

describe('Space Wolves — Saga of the Warrior', () => {
  it('grants unit +1 attacks on kill', () => {
    const g = findLegionGambit('sw-saga-of-warrior')!;
    expect(g.onKillUnitBonus).toBeDefined();
    expect(g.onKillUnitBonus!.attacksModifier).toBe(1);
    expect(g.onKillUnitBonus!.duration).toBe('nextFightSubPhase');
  });
});

describe('Space Wolves has two gambits', () => {
  it('has 2 standard gambits', () => {
    const gambits = getLegionGambitsForLegion(LegionFaction.SpaceWolves);
    expect(gambits.length).toBe(2);
    expect(gambits.some(g => g.id === 'sw-wolves-of-fenris')).toBe(true);
    expect(gambits.some(g => g.id === 'sw-saga-of-warrior')).toBe(true);
  });
});

describe('Imperial Fists — A Wall Unyielding', () => {
  it('excludes combat initiative and grants eternal warrior', () => {
    const g = findLegionGambit('if-wall-unyielding')!;
    expect(g.excludeCombatInitiative).toBe(true);
    expect(g.grantEternalWarrior).toBe(1);
  });
});

describe('Night Lords — Nostraman Courage', () => {
  it('is once per challenge and allows model swap', () => {
    const g = findLegionGambit('nl-nostraman-courage')!;
    expect(g.oncePerChallenge).toBe(true);
    expect(g.allowModelSwap).toBe(true);
  });
});

describe('Blood Angels — Thrall of the Red Thirst', () => {
  it('has +1 damage, no outside support, ignores wound negative modifiers', () => {
    const g = findLegionGambit('ba-red-thirst')!;
    expect(g.damageModifier).toBe(1);
    expect(g.gainsOutsideSupport).toBe(false);
    expect(g.ignoreWoundNegativeModifiers).toBe(true);
  });
});

describe('Iron Hands — Legion of One', () => {
  it('doubles own outside support and caps opponent at +2', () => {
    const g = findLegionGambit('ih-legion-of-one')!;
    expect(g.outsideSupportMultiplier).toBe(2);
    expect(g.maxOpponentOutsideSupport).toBe(2);
  });
});

describe('World Eaters — Violent Overkill', () => {
  it('spills excess wounds to other models', () => {
    const g = findLegionGambit('we-violent-overkill')!;
    expect(g.excessWoundsSpill).toBe(true);
  });
});

describe('Ultramarines — Aegis of Wisdom', () => {
  it('replaces outside support with Command sub-type count', () => {
    const g = findLegionGambit('um-aegis-of-wisdom')!;
    expect(g.gainsOutsideSupport).toBe(false);
    expect(g.alternativeOutsideSupportSubType).toBe('Command');
  });
});

describe('Thousand Sons — Prophetic Duellist', () => {
  it('replaces focus roll with WP characteristic', () => {
    const g = findLegionGambit('ts-prophetic-duellist')!;
    expect(g.replaceWithCharacteristic).toBe('WP');
  });
});

describe('Sons of Horus — Merciless Strike', () => {
  it('is first face-off only and grants Phage(T)', () => {
    const g = findLegionGambit('soh-merciless-strike')!;
    expect(g.firstFaceOffOnly).toBe(true);
    expect(g.grantTraitEffect).toEqual({ name: 'Phage', value: 'T' });
  });
});

describe('Word Bearers — Beseech the Gods', () => {
  it('is first face-off only with willpower check', () => {
    const g = findLegionGambit('wb-beseech-the-gods')!;
    expect(g.firstFaceOffOnly).toBe(true);
    expect(g.willpowerCheck).toBeDefined();
    expect(g.willpowerCheck!.passEffect.strength).toBe(1);
    expect(g.willpowerCheck!.passEffect.attacks).toBe(1);
    expect(g.willpowerCheck!.failEffect.wound.ap).toBe(2);
    expect(g.willpowerCheck!.failEffect.wound.savesAllowed).toBe(false);
  });
});

describe('Salamanders — Duty is Sacrifice', () => {
  it('has self-damage mechanic for focus bonus (max 3 wounds)', () => {
    const g = findLegionGambit('sal-duty-is-sacrifice')!;
    expect(g.selfDamageForFocusBonus).toBeDefined();
    expect(g.selfDamageForFocusBonus!.maxWounds).toBe(3);
    expect(g.selfDamageForFocusBonus!.ap).toBe(5);
    expect(g.selfDamageForFocusBonus!.damage).toBe(1);
    expect(g.selfDamageForFocusBonus!.allowedSaves).toEqual(['armour', 'invulnerable', 'damageMitigation']);
  });
});

describe('Raven Guard — Decapitation Strike', () => {
  it('is once per challenge with test attack mechanic', () => {
    const g = findLegionGambit('rg-decapitation-strike')!;
    expect(g.oncePerChallenge).toBe(true);
    expect(g.testAttackMechanic).toBe(true);
  });
});

describe('Alpha Legion — I Am Alpharius', () => {
  it('is first face-off only and sets enemy CI to 1', () => {
    const g = findLegionGambit('al-i-am-alpharius')!;
    expect(g.firstFaceOffOnly).toBe(true);
    expect(g.setEnemyCombatInitiative).toBe(1);
  });
});

// ─── Hereticus Gambits ───────────────────────────────────────────────────────

describe("Emperor's Children Hereticus — Stupefied Grandeur", () => {
  it('doubles outside support', () => {
    const g = findLegionGambit('ec-h-stupefied-gambit')!;
    expect(g.outsideSupportMultiplier).toBe(2);
    expect(g.legion).toBe(LegionFaction.EmperorsChildren);
  });
});

describe('World Eaters Hereticus — Skull Trophy', () => {
  it('grants +2 CRP on kill', () => {
    const g = findLegionGambit('we-h-nails-gambit')!;
    expect(g.crpBonusOnKill).toBe(2);
    expect(g.legion).toBe(LegionFaction.WorldEaters);
  });
});

// ─── Gambit Feature Categorization ───────────────────────────────────────────

describe('First face-off only gambits', () => {
  it('includes EC Paragon, SoH Merciless Strike, WB Beseech, AL I Am Alpharius', () => {
    const firstFaceOff = LEGION_GAMBITS.filter(g => g.firstFaceOffOnly);
    expect(firstFaceOff.length).toBe(4);
    const ids = firstFaceOff.map(g => g.id);
    expect(ids).toContain('ec-paragon');
    expect(ids).toContain('soh-merciless-strike');
    expect(ids).toContain('wb-beseech-the-gods');
    expect(ids).toContain('al-i-am-alpharius');
  });
});

describe('Once per challenge gambits', () => {
  it('includes NL Nostraman Courage and RG Decapitation Strike', () => {
    const oncePerChallenge = LEGION_GAMBITS.filter(g => g.oncePerChallenge);
    expect(oncePerChallenge.length).toBe(2);
    const ids = oncePerChallenge.map(g => g.id);
    expect(ids).toContain('nl-nostraman-courage');
    expect(ids).toContain('rg-decapitation-strike');
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findLegionGambit', () => {
  it('returns gambit by exact id', () => {
    const g = findLegionGambit('da-sword-of-order');
    expect(g).toBeDefined();
    expect(g!.name).toBe('Sword of the Order');
  });

  it('returns undefined for non-existent id', () => {
    expect(findLegionGambit('nonexistent')).toBeUndefined();
  });
});

describe('getLegionGambitsForLegion', () => {
  it('returns 1 gambit for most legions', () => {
    expect(getLegionGambitsForLegion(LegionFaction.DarkAngels).length).toBe(1);
    expect(getLegionGambitsForLegion(LegionFaction.IronWarriors).length).toBe(1);
    expect(getLegionGambitsForLegion(LegionFaction.Ultramarines).length).toBe(1);
  });

  it('returns 2 gambits for Space Wolves', () => {
    expect(getLegionGambitsForLegion(LegionFaction.SpaceWolves).length).toBe(2);
  });

  it("returns 2 gambits for Emperor's Children (base + Hereticus)", () => {
    const gambits = getLegionGambitsForLegion(LegionFaction.EmperorsChildren);
    expect(gambits.length).toBe(2);
  });

  it('returns 2 gambits for World Eaters (base + Hereticus)', () => {
    const gambits = getLegionGambitsForLegion(LegionFaction.WorldEaters);
    expect(gambits.length).toBe(2);
  });

  it('returns empty array for invalid legion', () => {
    expect(getLegionGambitsForLegion('invalid' as LegionFaction)).toEqual([]);
  });
});
