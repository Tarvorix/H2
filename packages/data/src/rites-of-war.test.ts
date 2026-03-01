/**
 * Tests for Rite of War Data
 * Reference: HH_Legiones_Astartes.md — all legion "Rite of War" sections
 */

import { describe, it, expect } from 'vitest';
import { LegionFaction, Allegiance } from '@hh/types';
import {
  RITES_OF_WAR,
  findRiteOfWar,
  getRitesForLegion,
} from './rites-of-war';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Rite of War database integrity', () => {
  it('has 20 rites (18 standard + 2 Hereticus)', () => {
    expect(RITES_OF_WAR.length).toBe(20);
  });

  it('every rite has a unique id', () => {
    const ids = RITES_OF_WAR.map(r => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every rite has required fields', () => {
    for (const r of RITES_OF_WAR) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.legion).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(Array.isArray(r.benefits)).toBe(true);
      expect(r.benefits.length).toBeGreaterThan(0);
      expect(Array.isArray(r.restrictions)).toBe(true);
      expect(r.restrictions.length).toBeGreaterThan(0);
      expect(r.tacticaId).toBeTruthy();
      expect(r.advancedReactionId).toBeTruthy();
      expect(r.gambitId).toBeTruthy();
      expect(r.primeAdvantage).toBeDefined();
      expect(r.primeAdvantage.name).toBeTruthy();
      expect(r.primeAdvantage.description).toBeTruthy();
      expect(Array.isArray(r.primeAdvantage.effects)).toBe(true);
      expect(r.primeAdvantage.effects.length).toBeGreaterThan(0);
      expect(Array.isArray(r.additionalDetachments)).toBe(true);
    }
  });

  it('all 18 legions have at least one rite', () => {
    for (const legion of Object.values(LegionFaction)) {
      const rites = getRitesForLegion(legion);
      expect(rites.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every benefit has type and description', () => {
    for (const r of RITES_OF_WAR) {
      for (const b of r.benefits) {
        expect(b.type).toBeTruthy();
        expect(b.description).toBeTruthy();
        expect(b.effect).toBeDefined();
      }
    }
  });

  it('every restriction has type and description', () => {
    for (const r of RITES_OF_WAR) {
      for (const res of r.restrictions) {
        expect(res.type).toBeTruthy();
        expect(res.description).toBeTruthy();
        expect(res.restriction).toBeDefined();
      }
    }
  });
});

// ─── Cross-Reference Integrity ───────────────────────────────────────────────

describe('Cross-reference integrity', () => {
  it('every tacticaId is a non-empty string', () => {
    for (const r of RITES_OF_WAR) {
      expect(r.tacticaId.length).toBeGreaterThan(0);
    }
  });

  it('every advancedReactionId is a non-empty string', () => {
    for (const r of RITES_OF_WAR) {
      expect(r.advancedReactionId.length).toBeGreaterThan(0);
    }
  });

  it('every gambitId is a non-empty string', () => {
    for (const r of RITES_OF_WAR) {
      expect(r.gambitId.length).toBeGreaterThan(0);
    }
  });
});

// ─── Per-Legion Spot Checks ──────────────────────────────────────────────────

describe('Dark Angels — The Hexagrammaton', () => {
  it('has correct id and name', () => {
    const r = findRiteOfWar('dark-angels-hexagrammaton')!;
    expect(r.name).toBe('The Hexagrammaton');
    expect(r.legion).toBe(LegionFaction.DarkAngels);
  });

  it('references correct tactica, reaction, and gambit', () => {
    const r = findRiteOfWar('dark-angels-hexagrammaton')!;
    expect(r.tacticaId).toBe('dark-angels-tactica');
    expect(r.advancedReactionId).toBe('da-vengeance');
    expect(r.gambitId).toBe('da-sword-of-order');
  });

  it('has multiple additional detachments (6 Wings)', () => {
    const r = findRiteOfWar('dark-angels-hexagrammaton')!;
    expect(r.additionalDetachments.length).toBeGreaterThanOrEqual(5);
  });

  it('has Paladin of the Hekatonystika prime advantage', () => {
    const r = findRiteOfWar('dark-angels-hexagrammaton')!;
    expect(r.primeAdvantage.name).toBe('Paladin of the Hekatonystika');
  });
});

describe("Emperor's Children — The Flawless Host", () => {
  it('references correct tactica, reaction, and gambit', () => {
    const r = findRiteOfWar('emperors-children-flawless-host')!;
    expect(r.tacticaId).toBe('emperors-children-tactica');
    expect(r.advancedReactionId).toBe('ec-perfect-counter');
    expect(r.gambitId).toBe('ec-paragon');
  });
});

describe('Iron Warriors — The Iron Cage', () => {
  it('has correct basic properties', () => {
    const r = findRiteOfWar('iron-warriors-iron-cage')!;
    expect(r.name).toBe('The Iron Cage');
    expect(r.legion).toBe(LegionFaction.IronWarriors);
    expect(r.tacticaId).toBe('iron-warriors-tactica');
  });
});

describe('White Scars rite', () => {
  it('exists and has correct legion', () => {
    const rites = getRitesForLegion(LegionFaction.WhiteScars);
    expect(rites.length).toBeGreaterThanOrEqual(1);
    expect(rites[0].legion).toBe(LegionFaction.WhiteScars);
    expect(rites[0].tacticaId).toBe('white-scars-tactica');
  });
});

describe('Space Wolves rite', () => {
  it('exists and has correct legion', () => {
    const rites = getRitesForLegion(LegionFaction.SpaceWolves);
    expect(rites.length).toBeGreaterThanOrEqual(1);
    expect(rites[0].legion).toBe(LegionFaction.SpaceWolves);
  });
});

describe('Imperial Fists rite', () => {
  it('references correct reaction and gambit', () => {
    const rites = getRitesForLegion(LegionFaction.ImperialFists);
    const r = rites[0];
    expect(r.advancedReactionId).toBe('if-bastion-of-fire');
    expect(r.gambitId).toBe('if-wall-unyielding');
  });
});

describe('Blood Angels rite', () => {
  it('has correct cross-references', () => {
    const rites = getRitesForLegion(LegionFaction.BloodAngels);
    const r = rites[0];
    expect(r.tacticaId).toBe('blood-angels-tactica');
    expect(r.advancedReactionId).toBe('ba-wrath-of-angels');
    expect(r.gambitId).toBe('ba-red-thirst');
  });
});

describe('Ultramarines rite', () => {
  it('has correct cross-references', () => {
    const rites = getRitesForLegion(LegionFaction.Ultramarines);
    const r = rites[0];
    expect(r.tacticaId).toBe('ultramarines-tactica');
    expect(r.advancedReactionId).toBe('um-retribution-strike');
    expect(r.gambitId).toBe('um-aegis-of-wisdom');
  });
});

describe('Alpha Legion rite', () => {
  it('has correct cross-references', () => {
    const rites = getRitesForLegion(LegionFaction.AlphaLegion);
    const r = rites[0];
    expect(r.tacticaId).toBe('alpha-legion-tactica');
    expect(r.advancedReactionId).toBe('al-smoke-and-mirrors');
    expect(r.gambitId).toBe('al-i-am-alpharius');
  });
});

// ─── Hereticus Rites ─────────────────────────────────────────────────────────

describe("Emperor's Children Hereticus rite", () => {
  it('exists with Traitor allegiance requirement', () => {
    const rites = getRitesForLegion(LegionFaction.EmperorsChildren);
    const hereticus = rites.find(r => r.isHereticus);
    expect(hereticus).toBeDefined();
    expect(hereticus!.requiredAllegiance).toBe(Allegiance.Traitor);
    expect(hereticus!.isHereticus).toBe(true);
  });

  it('references Hereticus tactica, reaction, and gambit', () => {
    const rites = getRitesForLegion(LegionFaction.EmperorsChildren);
    const hereticus = rites.find(r => r.isHereticus)!;
    expect(hereticus.tacticaId).toBe('emperors-children-hereticus-tactica');
    expect(hereticus.advancedReactionId).toBe('ec-h-twisted-desire');
    expect(hereticus.gambitId).toBe('ec-h-stupefied-gambit');
  });
});

describe('World Eaters Hereticus rite', () => {
  it('exists with Traitor allegiance requirement', () => {
    const rites = getRitesForLegion(LegionFaction.WorldEaters);
    const hereticus = rites.find(r => r.isHereticus);
    expect(hereticus).toBeDefined();
    expect(hereticus!.requiredAllegiance).toBe(Allegiance.Traitor);
    expect(hereticus!.isHereticus).toBe(true);
  });

  it('references Hereticus tactica, reaction, and gambit', () => {
    const rites = getRitesForLegion(LegionFaction.WorldEaters);
    const hereticus = rites.find(r => r.isHereticus)!;
    expect(hereticus.tacticaId).toBe('world-eaters-hereticus-tactica');
    expect(hereticus.advancedReactionId).toBe('we-h-furious-charge');
    expect(hereticus.gambitId).toBe('we-h-nails-gambit');
  });
});

// ─── Additional Detachments ──────────────────────────────────────────────────

describe('Additional detachments', () => {
  it('detachments have name, type, description, and slots', () => {
    for (const r of RITES_OF_WAR) {
      for (const d of r.additionalDetachments) {
        expect(d.name).toBeTruthy();
        expect(d.type).toBeTruthy();
        expect(d.description).toBeTruthy();
        expect(Array.isArray(d.slots)).toBe(true);
        expect(d.slots.length).toBeGreaterThan(0);
      }
    }
  });

  it('Dark Angels has the most additional detachments (6 Wings)', () => {
    const da = findRiteOfWar('dark-angels-hexagrammaton')!;
    const maxDetachments = Math.max(...RITES_OF_WAR.map(r => r.additionalDetachments.length));
    expect(da.additionalDetachments.length).toBe(maxDetachments);
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findRiteOfWar', () => {
  it('returns rite by exact id', () => {
    const r = findRiteOfWar('dark-angels-hexagrammaton');
    expect(r).toBeDefined();
    expect(r!.name).toBe('The Hexagrammaton');
  });

  it('returns undefined for non-existent id', () => {
    expect(findRiteOfWar('nonexistent')).toBeUndefined();
  });
});

describe('getRitesForLegion', () => {
  it('returns 1 rite for most legions', () => {
    expect(getRitesForLegion(LegionFaction.DarkAngels).length).toBe(1);
    expect(getRitesForLegion(LegionFaction.IronWarriors).length).toBe(1);
    expect(getRitesForLegion(LegionFaction.Ultramarines).length).toBe(1);
  });

  it("returns 2 rites for Emperor's Children (base + Hereticus)", () => {
    expect(getRitesForLegion(LegionFaction.EmperorsChildren).length).toBe(2);
  });

  it('returns 2 rites for World Eaters (base + Hereticus)', () => {
    expect(getRitesForLegion(LegionFaction.WorldEaters).length).toBe(2);
  });

  it('returns empty array for invalid legion', () => {
    expect(getRitesForLegion('invalid' as LegionFaction)).toEqual([]);
  });
});
