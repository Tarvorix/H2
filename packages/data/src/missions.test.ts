/**
 * Mission and Deployment Map Data Tests.
 * Validates the 3 deployment maps, 3 core missions, and lookup functions.
 */

import { describe, it, expect } from 'vitest';
import {
  DeploymentMap,
  SecondaryObjectiveType,
  MissionSpecialRule,
} from '@hh/types';
import {
  SEARCH_AND_DESTROY,
  HAMMER_AND_ANVIL,
  DAWN_OF_WAR,
  ALL_DEPLOYMENT_MAPS,
  findDeploymentMap,
  findDeploymentMapByType,
  HEART_OF_BATTLE,
  CRUCIBLE_OF_WAR,
  TAKE_AND_HOLD,
  ALL_MISSIONS,
  findMission,
  findMissionByName,
  STANDARD_BATTLEFIELD_WIDTH,
  STANDARD_BATTLEFIELD_HEIGHT,
  SEIZE_THE_INITIATIVE_TARGET,
  SUDDEN_DEATH_BONUS_VP,
} from './missions';

// ─── Deployment Maps ─────────────────────────────────────────────────────────

describe('Deployment Maps', () => {
  it('there are 3 deployment maps', () => {
    expect(ALL_DEPLOYMENT_MAPS).toHaveLength(3);
  });

  it('all maps have unique IDs', () => {
    const ids = ALL_DEPLOYMENT_MAPS.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  describe('Search and Destroy', () => {
    it('has correct type', () => {
      expect(SEARCH_AND_DESTROY.type).toBe(DeploymentMap.SearchAndDestroy);
    });

    it('generates two triangular zones', () => {
      const [zoneA, zoneB] = SEARCH_AND_DESTROY.getZones(72, 48);
      expect(zoneA.playerIndex).toBe(0);
      expect(zoneB.playerIndex).toBe(1);
      // Triangular zones have 3 vertices
      expect(zoneA.vertices).toHaveLength(3);
      expect(zoneB.vertices).toHaveLength(3);
    });

    it('Zone A is bottom-left corner', () => {
      const [zoneA] = SEARCH_AND_DESTROY.getZones(72, 48);
      // Should include origin corner (0,0)
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 0 });
      // Extends 24" along each edge
      expect(zoneA.vertices).toContainEqual({ x: 24, y: 0 });
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 24 });
    });

    it('Zone B is top-right corner', () => {
      const [, zoneB] = SEARCH_AND_DESTROY.getZones(72, 48);
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 48 });
      expect(zoneB.vertices).toContainEqual({ x: 48, y: 48 });
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 24 });
    });
  });

  describe('Hammer and Anvil', () => {
    it('has correct type', () => {
      expect(HAMMER_AND_ANVIL.type).toBe(DeploymentMap.HammerAndAnvil);
    });

    it('generates two rectangular zones along long edges', () => {
      const [zoneA, zoneB] = HAMMER_AND_ANVIL.getZones(72, 48);
      expect(zoneA.vertices).toHaveLength(4);
      expect(zoneB.vertices).toHaveLength(4);
    });

    it('Zone A spans bottom edge, 12" deep', () => {
      const [zoneA] = HAMMER_AND_ANVIL.getZones(72, 48);
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 0 });
      expect(zoneA.vertices).toContainEqual({ x: 72, y: 0 });
      expect(zoneA.vertices).toContainEqual({ x: 72, y: 12 });
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 12 });
    });

    it('Zone B spans top edge, 12" deep', () => {
      const [, zoneB] = HAMMER_AND_ANVIL.getZones(72, 48);
      expect(zoneB.vertices).toContainEqual({ x: 0, y: 36 });
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 36 });
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 48 });
      expect(zoneB.vertices).toContainEqual({ x: 0, y: 48 });
    });
  });

  describe('Dawn of War', () => {
    it('has correct type', () => {
      expect(DAWN_OF_WAR.type).toBe(DeploymentMap.DawnOfWar);
    });

    it('generates two rectangular zones along short edges', () => {
      const [zoneA, zoneB] = DAWN_OF_WAR.getZones(72, 48);
      expect(zoneA.vertices).toHaveLength(4);
      expect(zoneB.vertices).toHaveLength(4);
    });

    it('Zone A spans left edge, 12" deep', () => {
      const [zoneA] = DAWN_OF_WAR.getZones(72, 48);
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 0 });
      expect(zoneA.vertices).toContainEqual({ x: 12, y: 0 });
      expect(zoneA.vertices).toContainEqual({ x: 12, y: 48 });
      expect(zoneA.vertices).toContainEqual({ x: 0, y: 48 });
    });

    it('Zone B spans right edge, 12" deep', () => {
      const [, zoneB] = DAWN_OF_WAR.getZones(72, 48);
      expect(zoneB.vertices).toContainEqual({ x: 60, y: 0 });
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 0 });
      expect(zoneB.vertices).toContainEqual({ x: 72, y: 48 });
      expect(zoneB.vertices).toContainEqual({ x: 60, y: 48 });
    });
  });

  describe('zones scale with battlefield size', () => {
    it('Hammer and Anvil scales to larger battlefield', () => {
      const [zoneA, zoneB] = HAMMER_AND_ANVIL.getZones(96, 64);
      // Zone A: bottom edge of wider battlefield
      expect(zoneA.vertices).toContainEqual({ x: 96, y: 0 });
      // Zone B: top edge at height 64
      expect(zoneB.vertices).toContainEqual({ x: 96, y: 64 });
    });
  });
});

// ─── Deployment Map Lookups ──────────────────────────────────────────────────

describe('Deployment Map Lookups', () => {
  it('findDeploymentMap by ID', () => {
    expect(findDeploymentMap('search-and-destroy')).toBe(SEARCH_AND_DESTROY);
    expect(findDeploymentMap('hammer-and-anvil')).toBe(HAMMER_AND_ANVIL);
    expect(findDeploymentMap('dawn-of-war')).toBe(DAWN_OF_WAR);
  });

  it('findDeploymentMap returns undefined for unknown ID', () => {
    expect(findDeploymentMap('unknown')).toBeUndefined();
  });

  it('findDeploymentMapByType by enum', () => {
    expect(findDeploymentMapByType(DeploymentMap.SearchAndDestroy)).toBe(SEARCH_AND_DESTROY);
    expect(findDeploymentMapByType(DeploymentMap.HammerAndAnvil)).toBe(HAMMER_AND_ANVIL);
    expect(findDeploymentMapByType(DeploymentMap.DawnOfWar)).toBe(DAWN_OF_WAR);
  });
});

// ─── Core Missions ───────────────────────────────────────────────────────────

describe('Core Missions', () => {
  it('there are 3 missions', () => {
    expect(ALL_MISSIONS).toHaveLength(3);
  });

  it('all missions have unique IDs', () => {
    const ids = ALL_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  describe('Heart of Battle', () => {
    it('uses a fixed centre objective plus alternating flank placement', () => {
      expect(HEART_OF_BATTLE.objectivePlacement.kind).toBe('center-fixed-alternating');
    });

    it('has a fixed 3VP centre and two player-placed 1VP flank objectives', () => {
      const placement = HEART_OF_BATTLE.objectivePlacement;
      if (placement.kind !== 'center-fixed-alternating') throw new Error('Expected center-fixed-alternating');
      expect(placement.fixedObjectives).toHaveLength(1);
      expect(placement.count).toBe(2);
      expect(placement.vpValue).toBe(1);
      expect(placement.edgeBuffer).toBe(6);
      expect(placement.minimumSpacing).toBe(6);
      expect(placement.minimumDistanceFromFixedObjectives).toBe(12);

      const center = placement.fixedObjectives.find((o) => o.vpValue === 3);
      expect(center).toBeDefined();
      expect(center!.position).toEqual({ x: 36, y: 24 }); // center of 72x48
    });

    it('has correct secondary VP values (all 3)', () => {
      const secondaries = HEART_OF_BATTLE.secondaryObjectives;
      expect(secondaries).toHaveLength(4);
      for (const s of secondaries) {
        expect(s.vpValue).toBe(3);
      }
    });

    it('has Reserves, Counter Offensive, Seize the Initiative', () => {
      expect(HEART_OF_BATTLE.specialRules).toContain(MissionSpecialRule.Reserves);
      expect(HEART_OF_BATTLE.specialRules).toContain(MissionSpecialRule.CounterOffensive);
      expect(HEART_OF_BATTLE.specialRules).toContain(MissionSpecialRule.SeizeTheInitiative);
      expect(HEART_OF_BATTLE.specialRules).not.toContain(MissionSpecialRule.WindowOfOpportunity);
    });

    it('uses Search and Destroy deployment', () => {
      expect(HEART_OF_BATTLE.deploymentMap).toBe(DeploymentMap.SearchAndDestroy);
    });
  });

  describe('Crucible of War', () => {
    it('uses alternating objective placement', () => {
      expect(CRUCIBLE_OF_WAR.objectivePlacement.kind).toBe('alternating');
    });

    it('has 4 objectives worth 2VP each', () => {
      const placement = CRUCIBLE_OF_WAR.objectivePlacement;
      if (placement.kind !== 'alternating') throw new Error('Expected alternating');
      expect(placement.count).toBe(4);
      expect(placement.vpValue).toBe(2);
    });

    it('requires 12" spacing between objectives and from edges', () => {
      const placement = CRUCIBLE_OF_WAR.objectivePlacement;
      if (placement.kind !== 'alternating') throw new Error('Expected alternating');
      expect(placement.minimumSpacing).toBe(12);
      expect(placement.edgeBuffer).toBe(12);
    });

    it('First Strike is worth 4VP (highest secondary)', () => {
      const firstStrike = CRUCIBLE_OF_WAR.secondaryObjectives.find(
        (s) => s.type === SecondaryObjectiveType.FirstStrike,
      );
      expect(firstStrike?.vpValue).toBe(4);
    });

    it('Slay the Warlord, Giant Killer, Last Man Standing worth 2VP', () => {
      const others = CRUCIBLE_OF_WAR.secondaryObjectives.filter(
        (s) => s.type !== SecondaryObjectiveType.FirstStrike,
      );
      for (const s of others) {
        expect(s.vpValue).toBe(2);
      }
    });

    it('uses Hammer and Anvil deployment', () => {
      expect(CRUCIBLE_OF_WAR.deploymentMap).toBe(DeploymentMap.HammerAndAnvil);
    });
  });

  describe('Take and Hold', () => {
    it('uses alternating objective placement', () => {
      expect(TAKE_AND_HOLD.objectivePlacement.kind).toBe('alternating');
    });

    it('has 2 objectives worth 3VP each, 18" apart and 12" from edges', () => {
      const placement = TAKE_AND_HOLD.objectivePlacement;
      if (placement.kind !== 'alternating') throw new Error('Expected alternating');
      expect(placement.count).toBe(2);
      expect(placement.vpValue).toBe(3);
      expect(placement.minimumSpacing).toBe(18);
      expect(placement.edgeBuffer).toBe(12);
    });

    it('has Window of Opportunity special rule', () => {
      expect(TAKE_AND_HOLD.specialRules).toContain(MissionSpecialRule.WindowOfOpportunity);
    });

    it('Giant Killer and Last Man Standing worth 4VP (highest)', () => {
      const gk = TAKE_AND_HOLD.secondaryObjectives.find(
        (s) => s.type === SecondaryObjectiveType.GiantKiller,
      );
      const lms = TAKE_AND_HOLD.secondaryObjectives.find(
        (s) => s.type === SecondaryObjectiveType.LastManStanding,
      );
      expect(gk?.vpValue).toBe(4);
      expect(lms?.vpValue).toBe(4);
    });

    it('Slay the Warlord and First Strike worth 2VP', () => {
      const stw = TAKE_AND_HOLD.secondaryObjectives.find(
        (s) => s.type === SecondaryObjectiveType.SlayTheWarlord,
      );
      const fs = TAKE_AND_HOLD.secondaryObjectives.find(
        (s) => s.type === SecondaryObjectiveType.FirstStrike,
      );
      expect(stw?.vpValue).toBe(2);
      expect(fs?.vpValue).toBe(2);
    });

    it('uses Dawn of War deployment', () => {
      expect(TAKE_AND_HOLD.deploymentMap).toBe(DeploymentMap.DawnOfWar);
    });
  });
});

// ─── Mission Lookups ─────────────────────────────────────────────────────────

describe('Mission Lookups', () => {
  it('findMission by ID', () => {
    expect(findMission('heart-of-battle')).toBe(HEART_OF_BATTLE);
    expect(findMission('crucible-of-war')).toBe(CRUCIBLE_OF_WAR);
    expect(findMission('take-and-hold')).toBe(TAKE_AND_HOLD);
  });

  it('findMission returns undefined for unknown ID', () => {
    expect(findMission('unknown')).toBeUndefined();
  });

  it('findMissionByName by name', () => {
    expect(findMissionByName('The Heart of Battle')).toBe(HEART_OF_BATTLE);
    expect(findMissionByName('The Crucible of War')).toBe(CRUCIBLE_OF_WAR);
    expect(findMissionByName('Take and Hold')).toBe(TAKE_AND_HOLD);
  });

  it('findMissionByName returns undefined for unknown name', () => {
    expect(findMissionByName('Unknown Mission')).toBeUndefined();
  });
});

// ─── All missions have 4 secondary objectives ───────────────────────────────

describe('Mission Secondary Objectives', () => {
  it('every mission has all 4 secondary objective types', () => {
    for (const mission of ALL_MISSIONS) {
      const types = mission.secondaryObjectives.map((s) => s.type);
      expect(types).toContain(SecondaryObjectiveType.SlayTheWarlord);
      expect(types).toContain(SecondaryObjectiveType.GiantKiller);
      expect(types).toContain(SecondaryObjectiveType.LastManStanding);
      expect(types).toContain(SecondaryObjectiveType.FirstStrike);
    }
  });

  it('no secondary has VP value of 0 or negative', () => {
    for (const mission of ALL_MISSIONS) {
      for (const s of mission.secondaryObjectives) {
        expect(s.vpValue).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Constants ───────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('standard battlefield is 72x48 (6x4 feet)', () => {
    expect(STANDARD_BATTLEFIELD_WIDTH).toBe(72);
    expect(STANDARD_BATTLEFIELD_HEIGHT).toBe(48);
  });

  it('Seize the Initiative target is 6', () => {
    expect(SEIZE_THE_INITIATIVE_TARGET).toBe(6);
  });

  it('Sudden Death bonus is 3 VP', () => {
    expect(SUDDEN_DEATH_BONUS_VP).toBe(3);
  });
});
