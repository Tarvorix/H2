/**
 * Rite of War Registry Tests
 *
 * Tests for all registry functions: registration, lookup, component links,
 * Hereticus & allegiance, validation, availability, and descriptions.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections + 2 Hereticus rites
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerRiteOfWar,
  registerAllRitesOfWar,
  clearRiteOfWarRegistry,
  getRiteOfWar,
  getRiteOfWarByName,
  getRitesForLegion,
  getRiteDefinitionsForLegion,
  getRegisteredRitesOfWar,
  isRiteOfWarRegistered,
  getRiteRequiredAllegiance,
  isHereticusRite,
  getRiteTacticaId,
  getRiteAdvancedReactionId,
  getRiteGambitId,
  getRitePrimeAdvantage,
  getRiteAdditionalDetachments,
  getRiteMinimumPoints,
  validateRiteOfWar,
  isRiteAvailableFor,
  getRiteBenefitDescriptions,
  getRiteRestrictionDescriptions,
} from './rite-of-war-registry';
import { LegionFaction, Allegiance } from '@hh/types';
import type { ArmyList, RiteOfWarDefinition } from '@hh/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArmyList(overrides: Partial<ArmyList> = {}): ArmyList {
  return {
    playerName: 'Test Player',
    pointsLimit: 3000,
    totalPoints: 2500,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    detachments: [],
    ...overrides,
  };
}

/**
 * Create a minimal RiteOfWarDefinition for isolated registration tests.
 */
function makeRiteDefinition(overrides: Partial<RiteOfWarDefinition> = {}): RiteOfWarDefinition {
  return {
    id: 'test-rite',
    name: 'Test Rite',
    legion: LegionFaction.DarkAngels,
    description: 'A test rite of war.',
    benefits: [
      {
        type: 'specialRule',
        description: 'Test benefit one',
        effect: { tacticaId: 'test-tactica' },
      },
      {
        type: 'armyModifier',
        description: 'Test benefit two',
        effect: { advancedReactionId: 'test-reaction' },
      },
    ],
    restrictions: [
      {
        type: 'allegianceRequired',
        description: 'No allegiance restriction',
        restriction: { allegiance: null },
      },
    ],
    tacticaId: 'test-tactica',
    advancedReactionId: 'test-reaction',
    gambitId: 'test-gambit',
    primeAdvantage: {
      name: 'Test Prime',
      description: 'A test prime advantage.',
      effects: ['Effect A', 'Effect B'],
    },
    additionalDetachments: [
      {
        name: 'Test Detachment',
        type: 'Auxiliary',
        description: 'A test detachment.',
        slots: ['Command', 'Troops', 'Troops'],
      },
    ],
    ...overrides,
  };
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('Rite of War Registry', () => {
  beforeEach(() => {
    clearRiteOfWarRegistry();
    registerAllRitesOfWar();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration', () => {
    it('registerAllRitesOfWar registers all 20 rites', () => {
      const registered = getRegisteredRitesOfWar();
      expect(registered).toHaveLength(20);
    });

    it('registerRiteOfWar registers a single rite and makes it retrievable', () => {
      clearRiteOfWarRegistry();
      const customRite = makeRiteDefinition({ id: 'custom-rite', name: 'Custom Rite' });
      registerRiteOfWar(customRite);

      expect(isRiteOfWarRegistered('custom-rite')).toBe(true);
      expect(getRiteOfWar('custom-rite')).toEqual(customRite);
      expect(getRegisteredRitesOfWar()).toHaveLength(1);
    });

    it('registerRiteOfWar does not duplicate IDs in faction list when called twice', () => {
      clearRiteOfWarRegistry();
      const customRite = makeRiteDefinition({ id: 'custom-rite', legion: LegionFaction.IronWarriors });
      registerRiteOfWar(customRite);
      registerRiteOfWar(customRite);

      const factionRites = getRitesForLegion(LegionFaction.IronWarriors);
      expect(factionRites).toHaveLength(1);
      expect(factionRites).toContain('custom-rite');
    });

    it('clearRiteOfWarRegistry empties the registry completely', () => {
      expect(getRegisteredRitesOfWar().length).toBeGreaterThan(0);
      clearRiteOfWarRegistry();
      expect(getRegisteredRitesOfWar()).toHaveLength(0);
      expect(isRiteOfWarRegistered('dark-angels-hexagrammaton')).toBe(false);
      expect(getRitesForLegion(LegionFaction.DarkAngels)).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Lookups
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Lookups', () => {
    it('getRiteOfWar returns the correct definition by ID', () => {
      const rite = getRiteOfWar('dark-angels-hexagrammaton');
      expect(rite).toBeDefined();
      expect(rite!.id).toBe('dark-angels-hexagrammaton');
      expect(rite!.name).toBe('The Hexagrammaton');
      expect(rite!.legion).toBe(LegionFaction.DarkAngels);
    });

    it('getRiteOfWar returns undefined for unknown ID', () => {
      expect(getRiteOfWar('nonexistent-rite')).toBeUndefined();
    });

    it('getRiteOfWarByName returns the correct definition by display name', () => {
      const rite = getRiteOfWarByName('The Hexagrammaton');
      expect(rite).toBeDefined();
      expect(rite!.id).toBe('dark-angels-hexagrammaton');
    });

    it('getRiteOfWarByName returns undefined for unknown name', () => {
      expect(getRiteOfWarByName('Nonexistent Rite Name')).toBeUndefined();
    });

    it('getRitesForLegion returns rite IDs for a legion with one rite', () => {
      const daRites = getRitesForLegion(LegionFaction.DarkAngels);
      expect(daRites).toHaveLength(1);
      expect(daRites).toContain('dark-angels-hexagrammaton');
    });

    it('getRitesForLegion returns multiple rite IDs for legions with Hereticus rites', () => {
      const ecRites = getRitesForLegion(LegionFaction.EmperorsChildren);
      expect(ecRites).toHaveLength(2);
      expect(ecRites).toContain('emperors-children-flawless-host');
      expect(ecRites).toContain('emperors-children-hereticus');
    });

    it('getRitesForLegion returns multiple rite IDs for World Eaters (standard + Hereticus)', () => {
      const weRites = getRitesForLegion(LegionFaction.WorldEaters);
      expect(weRites).toHaveLength(2);
      expect(weRites).toContain('world-eaters-berserker-assault');
      expect(weRites).toContain('world-eaters-hereticus');
    });

    it('getRiteDefinitionsForLegion returns full definitions for a legion', () => {
      const defs = getRiteDefinitionsForLegion(LegionFaction.Ultramarines);
      expect(defs).toHaveLength(1);
      expect(defs[0].id).toBe('ultramarines-logos-lectora');
      expect(defs[0].name).toBe('Logos Lectora');
    });

    it('getRegisteredRitesOfWar returns all 20 rite IDs', () => {
      const ids = getRegisteredRitesOfWar();
      expect(ids).toHaveLength(20);
      expect(ids).toContain('dark-angels-hexagrammaton');
      expect(ids).toContain('emperors-children-hereticus');
      expect(ids).toContain('world-eaters-hereticus');
      expect(ids).toContain('alpha-legion-hydra-dominatus');
    });

    it('isRiteOfWarRegistered returns true for registered rites and false otherwise', () => {
      expect(isRiteOfWarRegistered('ultramarines-logos-lectora')).toBe(true);
      expect(isRiteOfWarRegistered('totally-fake-rite')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Component Links (tactica, reaction, gambit, prime advantage, detachments)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Component Links', () => {
    it('getRiteTacticaId returns the correct tactica ID for Dark Angels', () => {
      expect(getRiteTacticaId('dark-angels-hexagrammaton')).toBe('dark-angels-tactica');
    });

    it('getRiteTacticaId returns the correct tactica ID for Ultramarines', () => {
      expect(getRiteTacticaId('ultramarines-logos-lectora')).toBe('ultramarines-tactica');
    });

    it('getRiteTacticaId returns undefined for unknown rite', () => {
      expect(getRiteTacticaId('nonexistent')).toBeUndefined();
    });

    it('getRiteAdvancedReactionId returns the correct reaction ID', () => {
      expect(getRiteAdvancedReactionId('dark-angels-hexagrammaton')).toBe('da-vengeance');
      expect(getRiteAdvancedReactionId('emperors-children-flawless-host')).toBe('ec-perfect-counter');
      expect(getRiteAdvancedReactionId('iron-warriors-iron-cage')).toBe('iw-bitter-fury');
    });

    it('getRiteAdvancedReactionId returns undefined for unknown rite', () => {
      expect(getRiteAdvancedReactionId('nonexistent')).toBeUndefined();
    });

    it('getRiteGambitId returns the correct gambit ID', () => {
      expect(getRiteGambitId('dark-angels-hexagrammaton')).toBe('da-sword-of-order');
      expect(getRiteGambitId('alpha-legion-hydra-dominatus')).toBe('al-i-am-alpharius');
    });

    it('getRiteGambitId returns undefined for unknown rite', () => {
      expect(getRiteGambitId('nonexistent')).toBeUndefined();
    });

    it('getRitePrimeAdvantage returns structured prime advantage for Dark Angels', () => {
      const prime = getRitePrimeAdvantage('dark-angels-hexagrammaton');
      expect(prime).toBeDefined();
      expect(prime!.name).toBe('Paladin of the Hekatonystika');
      expect(prime!.description).toBeTruthy();
      expect(prime!.effects).toBeInstanceOf(Array);
      expect(prime!.effects.length).toBeGreaterThan(0);
    });

    it('getRitePrimeAdvantage returns undefined for unknown rite', () => {
      expect(getRitePrimeAdvantage('nonexistent')).toBeUndefined();
    });

    it('getRiteAdditionalDetachments returns detachment array for Dark Angels (6 Wings)', () => {
      const detachments = getRiteAdditionalDetachments('dark-angels-hexagrammaton');
      expect(detachments).toHaveLength(6);
      const names = detachments.map(d => d.name);
      expect(names).toContain('Ironwing Gauntlet');
      expect(names).toContain('Dreadwing Cadre');
      expect(names).toContain('Stormwing Muster');
      expect(names).toContain('Deathwing Conclave');
      expect(names).toContain('Ravenwing Lance');
      expect(names).toContain('Firewing Echelon');
    });

    it('getRiteAdditionalDetachments returns empty array for unknown rite', () => {
      expect(getRiteAdditionalDetachments('nonexistent')).toEqual([]);
    });

    it('getRiteMinimumPoints returns undefined for rites without a minimum', () => {
      // Standard rites do not have a minimumPoints field set
      expect(getRiteMinimumPoints('dark-angels-hexagrammaton')).toBeUndefined();
    });

    it('getRiteMinimumPoints returns undefined for unknown rite', () => {
      expect(getRiteMinimumPoints('nonexistent')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Hereticus & Allegiance
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Hereticus & Allegiance', () => {
    it('isHereticusRite returns true for Emperor\'s Children Hereticus', () => {
      expect(isHereticusRite('emperors-children-hereticus')).toBe(true);
    });

    it('isHereticusRite returns true for World Eaters Hereticus', () => {
      expect(isHereticusRite('world-eaters-hereticus')).toBe(true);
    });

    it('isHereticusRite returns false for standard rites', () => {
      expect(isHereticusRite('dark-angels-hexagrammaton')).toBe(false);
      expect(isHereticusRite('emperors-children-flawless-host')).toBe(false);
      expect(isHereticusRite('ultramarines-logos-lectora')).toBe(false);
    });

    it('isHereticusRite returns false for unknown rite', () => {
      expect(isHereticusRite('nonexistent')).toBe(false);
    });

    it('getRiteRequiredAllegiance returns Traitor for EC Hereticus', () => {
      expect(getRiteRequiredAllegiance('emperors-children-hereticus')).toBe(Allegiance.Traitor);
    });

    it('getRiteRequiredAllegiance returns Traitor for WE Hereticus', () => {
      expect(getRiteRequiredAllegiance('world-eaters-hereticus')).toBe(Allegiance.Traitor);
    });

    it('getRiteRequiredAllegiance returns undefined for standard rites (no restriction)', () => {
      expect(getRiteRequiredAllegiance('dark-angels-hexagrammaton')).toBeUndefined();
      expect(getRiteRequiredAllegiance('iron-warriors-iron-cage')).toBeUndefined();
      expect(getRiteRequiredAllegiance('alpha-legion-hydra-dominatus')).toBeUndefined();
    });

    it('getRiteRequiredAllegiance returns undefined for unknown rite', () => {
      expect(getRiteRequiredAllegiance('nonexistent')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. validateRiteOfWar
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validateRiteOfWar', () => {
    it('returns an error for an unregistered rite ID', () => {
      const army = makeArmyList();
      const errors = validateRiteOfWar(army, 'nonexistent-rite');
      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe('error');
      expect(errors[0].scope).toBe('army');
      expect(errors[0].message).toContain('not registered');
    });

    it('returns a faction mismatch error when army faction differs from rite legion', () => {
      const army = makeArmyList({ faction: LegionFaction.Ultramarines });
      const errors = validateRiteOfWar(army, 'dark-angels-hexagrammaton');
      const factionError = errors.find(e => e.message.includes('requires Dark Angels faction'));
      expect(factionError).toBeDefined();
      expect(factionError!.severity).toBe('error');
      expect(factionError!.scope).toBe('army');
    });

    it('returns an allegiance mismatch error for Hereticus rite with Loyalist army', () => {
      const army = makeArmyList({
        faction: LegionFaction.EmperorsChildren,
        allegiance: Allegiance.Loyalist,
      });
      const errors = validateRiteOfWar(army, 'emperors-children-hereticus');
      const allegianceError = errors.find(e => e.message.includes('requires Traitor allegiance'));
      expect(allegianceError).toBeDefined();
      expect(allegianceError!.severity).toBe('error');
    });

    it('returns no errors for a valid army matching faction and allegiance', () => {
      const army = makeArmyList({
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Loyalist,
      });
      const errors = validateRiteOfWar(army, 'dark-angels-hexagrammaton');
      expect(errors).toHaveLength(0);
    });

    it('returns no errors for a Traitor EC army using the Hereticus rite', () => {
      const army = makeArmyList({
        faction: LegionFaction.EmperorsChildren,
        allegiance: Allegiance.Traitor,
      });
      const errors = validateRiteOfWar(army, 'emperors-children-hereticus');
      expect(errors).toHaveLength(0);
    });

    it('returns no errors for a Traitor WE army using the Hereticus rite', () => {
      const army = makeArmyList({
        faction: LegionFaction.WorldEaters,
        allegiance: Allegiance.Traitor,
      });
      const errors = validateRiteOfWar(army, 'world-eaters-hereticus');
      expect(errors).toHaveLength(0);
    });

    it('returns both faction and allegiance errors when both are wrong', () => {
      const army = makeArmyList({
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Loyalist,
      });
      const errors = validateRiteOfWar(army, 'world-eaters-hereticus');
      expect(errors.length).toBeGreaterThanOrEqual(2);
      const factionError = errors.find(e => e.message.includes('requires World Eaters faction'));
      const allegianceError = errors.find(e => e.message.includes('requires Traitor allegiance'));
      expect(factionError).toBeDefined();
      expect(allegianceError).toBeDefined();
    });

    it('validates minimum points when a rite has a minimumPoints threshold', () => {
      // Register a custom rite with a minimumPoints of 2000
      clearRiteOfWarRegistry();
      const minPointsRite = makeRiteDefinition({
        id: 'min-points-rite',
        minimumPoints: 2000,
        restrictions: [],
      });
      registerRiteOfWar(minPointsRite);

      const armyTooSmall = makeArmyList({ pointsLimit: 1500 });
      const errors = validateRiteOfWar(armyTooSmall, 'min-points-rite');
      const minPointsError = errors.find(e => e.message.includes('minimum of 2000 points'));
      expect(minPointsError).toBeDefined();

      const armyLargeEnough = makeArmyList({ pointsLimit: 3000 });
      const noErrors = validateRiteOfWar(armyLargeEnough, 'min-points-rite');
      expect(noErrors).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. isRiteAvailableFor
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isRiteAvailableFor', () => {
    it('returns true for correct faction and any allegiance on a standard rite', () => {
      expect(isRiteAvailableFor('dark-angels-hexagrammaton', LegionFaction.DarkAngels, Allegiance.Loyalist)).toBe(true);
      expect(isRiteAvailableFor('dark-angels-hexagrammaton', LegionFaction.DarkAngels, Allegiance.Traitor)).toBe(true);
    });

    it('returns false for the wrong faction', () => {
      expect(isRiteAvailableFor('dark-angels-hexagrammaton', LegionFaction.Ultramarines, Allegiance.Loyalist)).toBe(false);
      expect(isRiteAvailableFor('ultramarines-logos-lectora', LegionFaction.DarkAngels, Allegiance.Loyalist)).toBe(false);
    });

    it('returns true for a Hereticus rite with correct faction and Traitor allegiance', () => {
      expect(isRiteAvailableFor('emperors-children-hereticus', LegionFaction.EmperorsChildren, Allegiance.Traitor)).toBe(true);
      expect(isRiteAvailableFor('world-eaters-hereticus', LegionFaction.WorldEaters, Allegiance.Traitor)).toBe(true);
    });

    it('returns false for a Hereticus rite with correct faction but Loyalist allegiance', () => {
      expect(isRiteAvailableFor('emperors-children-hereticus', LegionFaction.EmperorsChildren, Allegiance.Loyalist)).toBe(false);
      expect(isRiteAvailableFor('world-eaters-hereticus', LegionFaction.WorldEaters, Allegiance.Loyalist)).toBe(false);
    });

    it('returns false for a Hereticus rite with wrong faction even if Traitor', () => {
      expect(isRiteAvailableFor('emperors-children-hereticus', LegionFaction.WorldEaters, Allegiance.Traitor)).toBe(false);
      expect(isRiteAvailableFor('world-eaters-hereticus', LegionFaction.EmperorsChildren, Allegiance.Traitor)).toBe(false);
    });

    it('returns false for a nonexistent rite ID', () => {
      expect(isRiteAvailableFor('nonexistent', LegionFaction.DarkAngels, Allegiance.Loyalist)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Benefit & Restriction Descriptions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Benefit & Restriction Descriptions', () => {
    it('getRiteBenefitDescriptions returns an array of benefit strings for DA', () => {
      const benefits = getRiteBenefitDescriptions('dark-angels-hexagrammaton');
      expect(benefits).toBeInstanceOf(Array);
      expect(benefits.length).toBeGreaterThan(0);
      // All entries should be non-empty strings
      for (const b of benefits) {
        expect(typeof b).toBe('string');
        expect(b.length).toBeGreaterThan(0);
      }
    });

    it('getRiteBenefitDescriptions returns empty array for unknown rite', () => {
      expect(getRiteBenefitDescriptions('nonexistent')).toEqual([]);
    });

    it('getRiteRestrictionDescriptions returns an array of restriction strings for DA', () => {
      const restrictions = getRiteRestrictionDescriptions('dark-angels-hexagrammaton');
      expect(restrictions).toBeInstanceOf(Array);
      expect(restrictions.length).toBeGreaterThan(0);
      for (const r of restrictions) {
        expect(typeof r).toBe('string');
        expect(r.length).toBeGreaterThan(0);
      }
    });

    it('getRiteRestrictionDescriptions returns empty array for unknown rite', () => {
      expect(getRiteRestrictionDescriptions('nonexistent')).toEqual([]);
    });

    it('Hereticus rites have restriction descriptions mentioning Traitor allegiance', () => {
      const ecRestrictions = getRiteRestrictionDescriptions('emperors-children-hereticus');
      const hasTraitorRestriction = ecRestrictions.some(r => r.toLowerCase().includes('traitor'));
      expect(hasTraitorRestriction).toBe(true);

      const weRestrictions = getRiteRestrictionDescriptions('world-eaters-hereticus');
      const hasTraitorRestrictionWE = weRestrictions.some(r => r.toLowerCase().includes('traitor'));
      expect(hasTraitorRestrictionWE).toBe(true);
    });
  });
});
