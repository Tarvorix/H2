/**
 * Allegiance System Tests
 *
 * Tests for default allegiance mapping, canonical allegiance checks,
 * legion-by-allegiance queries, rite availability, army validation,
 * and the isAllegianceValid convenience function.
 *
 * Reference: HH_Core.md — "Allegiance"
 * Reference: HH_Legiones_Astartes.md — per-legion allegiance defaults
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LegionFaction, Allegiance } from '@hh/types';
import type { ArmyList } from '@hh/types';
import {
  getDefaultAllegiance,
  isCanonicallyLoyalist,
  isCanonicallyTraitor,
  getLegionsForAllegiance,
  getLoyalistLegions,
  getTraitorLegions,
  isRiteAvailableForAllegiance,
  validateAllegiance,
  isAllegianceValid,
} from './allegiance';
import { registerAllRitesOfWar, clearRiteOfWarRegistry } from './rite-of-war-registry';
import { DetachmentType } from '@hh/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMinimalArmyList(overrides: Partial<ArmyList> = {}): ArmyList {
  return {
    playerName: 'Test Player',
    pointsLimit: 3000,
    totalPoints: 2500,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    detachments: [
      {
        type: DetachmentType.Primary,
        faction: LegionFaction.DarkAngels,
        units: [],
      },
    ],
    ...overrides,
  };
}

// ─── Canonical Allegiance Lists ──────────────────────────────────────────────

const LOYALIST_LEGIONS: LegionFaction[] = [
  LegionFaction.DarkAngels,       // I
  LegionFaction.WhiteScars,       // V
  LegionFaction.SpaceWolves,      // VI
  LegionFaction.ImperialFists,    // VII
  LegionFaction.BloodAngels,      // IX
  LegionFaction.IronHands,        // X
  LegionFaction.Ultramarines,     // XIII
  LegionFaction.Salamanders,      // XVIII
  LegionFaction.RavenGuard,       // XIX
];

const TRAITOR_LEGIONS: LegionFaction[] = [
  LegionFaction.EmperorsChildren, // III
  LegionFaction.IronWarriors,     // IV
  LegionFaction.NightLords,       // VIII
  LegionFaction.WorldEaters,      // XII
  LegionFaction.DeathGuard,       // XIV
  LegionFaction.ThousandSons,     // XV
  LegionFaction.SonsOfHorus,      // XVI
  LegionFaction.WordBearers,      // XVII
  LegionFaction.AlphaLegion,      // XX
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Allegiance System', () => {
  // ─── getDefaultAllegiance ──────────────────────────────────────────────────

  describe('getDefaultAllegiance', () => {
    it('should return Loyalist for all 9 canonically Loyalist legions', () => {
      for (const legion of LOYALIST_LEGIONS) {
        expect(getDefaultAllegiance(legion)).toBe(Allegiance.Loyalist);
      }
    });

    it('should return Traitor for all 9 canonically Traitor legions', () => {
      for (const legion of TRAITOR_LEGIONS) {
        expect(getDefaultAllegiance(legion)).toBe(Allegiance.Traitor);
      }
    });

    it('should map all 18 legions (no legion is missed)', () => {
      const allLegions = Object.values(LegionFaction);
      expect(allLegions.length).toBe(18);

      for (const legion of allLegions) {
        const allegiance = getDefaultAllegiance(legion);
        expect([Allegiance.Loyalist, Allegiance.Traitor]).toContain(allegiance);
      }
    });
  });

  // ─── isCanonicallyLoyalist / isCanonicallyTraitor ──────────────────────────

  describe('isCanonicallyLoyalist and isCanonicallyTraitor', () => {
    it('should return true for Loyalist legions and false for Traitor legions via isCanonicallyLoyalist', () => {
      for (const legion of LOYALIST_LEGIONS) {
        expect(isCanonicallyLoyalist(legion)).toBe(true);
        expect(isCanonicallyTraitor(legion)).toBe(false);
      }
    });

    it('should return true for Traitor legions and false for Loyalist legions via isCanonicallyTraitor', () => {
      for (const legion of TRAITOR_LEGIONS) {
        expect(isCanonicallyTraitor(legion)).toBe(true);
        expect(isCanonicallyLoyalist(legion)).toBe(false);
      }
    });

    it('should be mutually exclusive for every legion', () => {
      const allLegions = Object.values(LegionFaction);
      for (const legion of allLegions) {
        const loyalist = isCanonicallyLoyalist(legion);
        const traitor = isCanonicallyTraitor(legion);
        // Exactly one must be true
        expect(loyalist !== traitor).toBe(true);
      }
    });
  });

  // ─── getLegionsForAllegiance / getLoyalistLegions / getTraitorLegions ───────

  describe('getLegionsForAllegiance, getLoyalistLegions, getTraitorLegions', () => {
    it('should return exactly 9 Loyalist legions', () => {
      const loyalist = getLegionsForAllegiance(Allegiance.Loyalist);
      expect(loyalist.length).toBe(9);
      for (const legion of LOYALIST_LEGIONS) {
        expect(loyalist).toContain(legion);
      }
    });

    it('should return exactly 9 Traitor legions', () => {
      const traitor = getLegionsForAllegiance(Allegiance.Traitor);
      expect(traitor.length).toBe(9);
      for (const legion of TRAITOR_LEGIONS) {
        expect(traitor).toContain(legion);
      }
    });

    it('should have getLoyalistLegions match getLegionsForAllegiance(Loyalist)', () => {
      const fromAllegiance = getLegionsForAllegiance(Allegiance.Loyalist);
      const fromHelper = getLoyalistLegions();
      expect(fromHelper).toEqual(fromAllegiance);
    });

    it('should have getTraitorLegions match getLegionsForAllegiance(Traitor)', () => {
      const fromAllegiance = getLegionsForAllegiance(Allegiance.Traitor);
      const fromHelper = getTraitorLegions();
      expect(fromHelper).toEqual(fromAllegiance);
    });

    it('should have no overlap between Loyalist and Traitor legion lists', () => {
      const loyalist = getLoyalistLegions();
      const traitor = getTraitorLegions();
      const overlap = loyalist.filter(l => traitor.includes(l));
      expect(overlap).toEqual([]);
    });

    it('should cover all 18 legions between Loyalist and Traitor', () => {
      const loyalist = getLoyalistLegions();
      const traitor = getTraitorLegions();
      const combined = [...loyalist, ...traitor];
      expect(combined.length).toBe(18);
      for (const legion of Object.values(LegionFaction)) {
        expect(combined).toContain(legion);
      }
    });
  });

  // ─── isRiteAvailableForAllegiance ──────────────────────────────────────────

  describe('isRiteAvailableForAllegiance', () => {
    beforeEach(() => {
      clearRiteOfWarRegistry();
      registerAllRitesOfWar();
    });

    it('should allow standard (non-Hereticus) rites for Loyalist allegiance', () => {
      expect(isRiteAvailableForAllegiance('dark-angels-hexagrammaton', Allegiance.Loyalist)).toBe(true);
    });

    it('should allow standard (non-Hereticus) rites for Traitor allegiance', () => {
      expect(isRiteAvailableForAllegiance('dark-angels-hexagrammaton', Allegiance.Traitor)).toBe(true);
    });

    it('should allow Hereticus rites for Traitor allegiance', () => {
      expect(isRiteAvailableForAllegiance('emperors-children-hereticus', Allegiance.Traitor)).toBe(true);
      expect(isRiteAvailableForAllegiance('world-eaters-hereticus', Allegiance.Traitor)).toBe(true);
    });

    it('should deny Hereticus rites for Loyalist allegiance', () => {
      expect(isRiteAvailableForAllegiance('emperors-children-hereticus', Allegiance.Loyalist)).toBe(false);
      expect(isRiteAvailableForAllegiance('world-eaters-hereticus', Allegiance.Loyalist)).toBe(false);
    });

    it('should return true for an unregistered rite ID (no rite found, no restrictions to check)', () => {
      // When a rite is not registered, isHereticusRite returns false and getRiteOfWar returns undefined
      // so neither guard blocks — returns true
      expect(isRiteAvailableForAllegiance('nonexistent-rite', Allegiance.Loyalist)).toBe(true);
      expect(isRiteAvailableForAllegiance('nonexistent-rite', Allegiance.Traitor)).toBe(true);
    });
  });

  // ─── validateAllegiance ────────────────────────────────────────────────────

  describe('validateAllegiance', () => {
    beforeEach(() => {
      clearRiteOfWarRegistry();
      registerAllRitesOfWar();
    });

    it('should return no errors for a valid Loyalist army without a rite', () => {
      const army = makeMinimalArmyList({
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Loyalist,
      });
      const errors = validateAllegiance(army);
      expect(errors).toEqual([]);
    });

    it('should return no errors for a valid Traitor army without a rite', () => {
      const army = makeMinimalArmyList({
        faction: LegionFaction.SonsOfHorus,
        allegiance: Allegiance.Traitor,
      });
      const errors = validateAllegiance(army);
      expect(errors).toEqual([]);
    });

    it('should return no errors for a Traitor army with a Hereticus rite', () => {
      const army = makeMinimalArmyList({
        faction: LegionFaction.EmperorsChildren,
        allegiance: Allegiance.Traitor,
        riteOfWar: 'emperors-children-hereticus',
      });
      const errors = validateAllegiance(army);
      expect(errors).toEqual([]);
    });

    it('should return an error for a Loyalist army with a Hereticus rite', () => {
      const army = makeMinimalArmyList({
        faction: LegionFaction.EmperorsChildren,
        allegiance: Allegiance.Loyalist,
        riteOfWar: 'emperors-children-hereticus',
      });
      const errors = validateAllegiance(army);
      expect(errors.length).toBe(1);
      expect(errors[0].severity).toBe('error');
      expect(errors[0].scope).toBe('army');
      expect(errors[0].message).toContain('requires Traitor allegiance');
    });

    it('should return an error for an invalid allegiance value', () => {
      const army = makeMinimalArmyList({
        allegiance: 'Neutral' as Allegiance,
      });
      const errors = validateAllegiance(army);
      expect(errors.length).toBe(1);
      expect(errors[0].severity).toBe('error');
      expect(errors[0].message).toContain('Invalid allegiance');
    });

    it('should allow any legion to play as non-canonical allegiance (no error)', () => {
      // Dark Angels (canonically Loyalist) playing as Traitor — no allegiance error
      const army = makeMinimalArmyList({
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Traitor,
      });
      const errors = validateAllegiance(army);
      expect(errors).toEqual([]);
    });
  });

  // ─── isAllegianceValid ─────────────────────────────────────────────────────

  describe('isAllegianceValid', () => {
    beforeEach(() => {
      clearRiteOfWarRegistry();
      registerAllRitesOfWar();
    });

    it('should return true for any faction with Loyalist allegiance (no rite)', () => {
      for (const legion of Object.values(LegionFaction)) {
        expect(isAllegianceValid(legion, Allegiance.Loyalist)).toBe(true);
      }
    });

    it('should return true for any faction with Traitor allegiance (no rite)', () => {
      for (const legion of Object.values(LegionFaction)) {
        expect(isAllegianceValid(legion, Allegiance.Traitor)).toBe(true);
      }
    });

    it('should return false for an invalid allegiance value', () => {
      expect(isAllegianceValid(LegionFaction.DarkAngels, 'Neutral' as Allegiance)).toBe(false);
    });

    it('should return true for a Traitor faction with a Hereticus rite', () => {
      expect(
        isAllegianceValid(LegionFaction.EmperorsChildren, Allegiance.Traitor, 'emperors-children-hereticus'),
      ).toBe(true);
    });

    it('should return false for a Loyalist allegiance with a Hereticus rite', () => {
      expect(
        isAllegianceValid(LegionFaction.EmperorsChildren, Allegiance.Loyalist, 'emperors-children-hereticus'),
      ).toBe(false);
    });

    it('should return true for a standard rite with either allegiance', () => {
      expect(
        isAllegianceValid(LegionFaction.DarkAngels, Allegiance.Loyalist, 'dark-angels-hexagrammaton'),
      ).toBe(true);
      expect(
        isAllegianceValid(LegionFaction.DarkAngels, Allegiance.Traitor, 'dark-angels-hexagrammaton'),
      ).toBe(true);
    });
  });
});
