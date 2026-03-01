/**
 * Mission and Deployment Map Data.
 * Defines the 3 core deployment maps and 3 core missions.
 *
 * Reference: HH_Battle_AOD.md — "Deployment Maps", "Core Missions",
 *   "Secondary Objectives", "Mission Special Rules", "Sudden Death"
 *
 * Battlefield: 4' x 6' = 72" x 48"
 * All missions: 4 Battle Turns
 */

import {
  DeploymentMap,
  SecondaryObjectiveType,
  MissionSpecialRule,
} from '@hh/types';
import type {
  DeploymentMapDefinition,
  DeploymentZone,
  MissionDefinition,
} from '@hh/types';

// ─── Deployment Map Definitions ──────────────────────────────────────────────

/**
 * Search and Destroy — diagonal deployment.
 * Triangular deployment zones in opposite corners of the battlefield.
 * Each zone is a triangle formed by two edges and the diagonal.
 * Zone depth: 24" from each corner along both edges.
 */
export const SEARCH_AND_DESTROY: DeploymentMapDefinition = {
  id: 'search-and-destroy',
  name: 'Search and Destroy',
  type: DeploymentMap.SearchAndDestroy,
  description:
    'Diagonal deployment with triangular zones in opposite corners. ' +
    'Each player deploys in a corner triangle extending 24" along each edge.',
  getZones(width: number, height: number): [DeploymentZone, DeploymentZone] {
    // Player 0 (Zone A): bottom-left corner triangle
    const zoneA: DeploymentZone = {
      playerIndex: 0,
      vertices: [
        { x: 0, y: 0 },
        { x: 24, y: 0 },
        { x: 0, y: 24 },
      ],
    };
    // Player 1 (Zone B): top-right corner triangle
    const zoneB: DeploymentZone = {
      playerIndex: 1,
      vertices: [
        { x: width, y: height },
        { x: width - 24, y: height },
        { x: width, y: height - 24 },
      ],
    };
    return [zoneA, zoneB];
  },
};

/**
 * Hammer and Anvil — long edge deployment.
 * Deployment zones along the two 72" (long) edges.
 * Each zone is 12" deep from the long edge.
 */
export const HAMMER_AND_ANVIL: DeploymentMapDefinition = {
  id: 'hammer-and-anvil',
  name: 'Hammer and Anvil',
  type: DeploymentMap.HammerAndAnvil,
  description:
    'Long edge deployment. Each player deploys within 12" of their long edge (72" side).',
  getZones(width: number, _height: number): [DeploymentZone, DeploymentZone] {
    // Player 0 (Zone A): bottom edge, 12" deep
    const zoneA: DeploymentZone = {
      playerIndex: 0,
      vertices: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: 12 },
        { x: 0, y: 12 },
      ],
    };
    // Player 1 (Zone B): top edge, 12" deep
    const zoneB: DeploymentZone = {
      playerIndex: 1,
      vertices: [
        { x: 0, y: _height - 12 },
        { x: width, y: _height - 12 },
        { x: width, y: _height },
        { x: 0, y: _height },
      ],
    };
    return [zoneA, zoneB];
  },
};

/**
 * Dawn of War — short edge deployment.
 * Deployment zones along the two 48" (short) edges.
 * Each zone is 12" deep from the short edge.
 */
export const DAWN_OF_WAR: DeploymentMapDefinition = {
  id: 'dawn-of-war',
  name: 'Dawn of War',
  type: DeploymentMap.DawnOfWar,
  description:
    'Short edge deployment. Each player deploys within 12" of their short edge (48" side).',
  getZones(_width: number, height: number): [DeploymentZone, DeploymentZone] {
    // Player 0 (Zone A): left edge, 12" deep
    const zoneA: DeploymentZone = {
      playerIndex: 0,
      vertices: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: height },
        { x: 0, y: height },
      ],
    };
    // Player 1 (Zone B): right edge, 12" deep
    const zoneB: DeploymentZone = {
      playerIndex: 1,
      vertices: [
        { x: _width - 12, y: 0 },
        { x: _width, y: 0 },
        { x: _width, y: height },
        { x: _width - 12, y: height },
      ],
    };
    return [zoneA, zoneB];
  },
};

/** All deployment map definitions */
export const ALL_DEPLOYMENT_MAPS: DeploymentMapDefinition[] = [
  SEARCH_AND_DESTROY,
  HAMMER_AND_ANVIL,
  DAWN_OF_WAR,
];

/**
 * Find a deployment map definition by ID.
 */
export function findDeploymentMap(id: string): DeploymentMapDefinition | undefined {
  return ALL_DEPLOYMENT_MAPS.find((m) => m.id === id);
}

/**
 * Find a deployment map definition by type enum.
 */
export function findDeploymentMapByType(type: DeploymentMap): DeploymentMapDefinition | undefined {
  return ALL_DEPLOYMENT_MAPS.find((m) => m.type === type);
}

// ─── Core Mission Definitions ────────────────────────────────────────────────

/**
 * Mission 1: The Heart of Battle — "The Storm's Centre"
 *
 * Objectives:
 * - 1 central marker worth 3 VP (placed at exact center of battlefield)
 * - 2 side markers worth 1 VP each (placed at least 12" from center, 6" from edges)
 *
 * Secondary VP values: Slay the Warlord 3, Giant Killer 3, Last Man Standing 3, First Strike 3
 * Special Rules: Reserves, Counter Offensive, Seize the Initiative
 * Game Length: 4 Battle Turns
 */
export const HEART_OF_BATTLE: MissionDefinition = {
  id: 'heart-of-battle',
  name: 'The Heart of Battle',
  description:
    'Players must capture a single high-value central objective or dominate surrounding ' +
    'lesser-value objectives. One central objective worth 3 VP is placed at the exact centre ' +
    'of the battlefield. Two flanking objectives worth 1 VP each are placed at least 12" from ' +
    'the centre and 6" from any battlefield edge.',
  deploymentMap: DeploymentMap.SearchAndDestroy,
  objectivePlacement: {
    kind: 'fixed',
    objectives: [
      { position: { x: 36, y: 24 }, vpValue: 3, label: 'Primary Alpha (Centre)' },
      { position: { x: 18, y: 12 }, vpValue: 1, label: 'Flank West' },
      { position: { x: 54, y: 36 }, vpValue: 1, label: 'Flank East' },
    ],
  },
  specialRules: [
    MissionSpecialRule.Reserves,
    MissionSpecialRule.CounterOffensive,
    MissionSpecialRule.SeizeTheInitiative,
  ],
  secondaryObjectives: [
    { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 3 },
    { type: SecondaryObjectiveType.GiantKiller, vpValue: 3 },
    { type: SecondaryObjectiveType.LastManStanding, vpValue: 3 },
    { type: SecondaryObjectiveType.FirstStrike, vpValue: 3 },
  ],
};

/**
 * Mission 2: The Crucible of War — "Vital Ground"
 *
 * Objectives:
 * - 4 markers worth 2 VP each (alternating placement, 12" from edges, 12" from each other)
 *
 * Secondary VP values: Slay the Warlord 2, Giant Killer 2, Last Man Standing 2, First Strike 4
 * Special Rules: Reserves, Counter Offensive, Seize the Initiative
 * Game Length: 4 Battle Turns
 */
export const CRUCIBLE_OF_WAR: MissionDefinition = {
  id: 'crucible-of-war',
  name: 'The Crucible of War',
  description:
    'Players must capture any of four objective markers to accumulate Victory Points. ' +
    'Objectives are placed by alternating between players, at least 12" from any ' +
    'battlefield edge and 12" from other markers.',
  deploymentMap: DeploymentMap.HammerAndAnvil,
  objectivePlacement: {
    kind: 'alternating',
    count: 4,
    vpValue: 2,
    minimumSpacing: 12,
    edgeBuffer: 12,
  },
  specialRules: [
    MissionSpecialRule.Reserves,
    MissionSpecialRule.CounterOffensive,
    MissionSpecialRule.SeizeTheInitiative,
  ],
  secondaryObjectives: [
    { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 2 },
    { type: SecondaryObjectiveType.GiantKiller, vpValue: 2 },
    { type: SecondaryObjectiveType.LastManStanding, vpValue: 2 },
    { type: SecondaryObjectiveType.FirstStrike, vpValue: 4 },
  ],
};

/**
 * Mission 3: Take and Hold — "Vital Ground"
 *
 * Objectives:
 * - 2 markers worth 3 VP each (symmetric placement, 12" from edges, 18" from each other)
 *
 * Secondary VP values: Slay the Warlord 2, Giant Killer 4, Last Man Standing 4, First Strike 2
 * Special Rules: Reserves, Seize the Initiative, Counter Offensive, Window of Opportunity
 * Game Length: 4 Battle Turns
 */
export const TAKE_AND_HOLD: MissionDefinition = {
  id: 'take-and-hold',
  name: 'Take and Hold',
  description:
    'Players must hold objectives in the middle of the battlefield. Two high-value ' +
    'objective markers are placed at least 12" from any battlefield edge and 18" from ' +
    'each other. The Window of Opportunity special rule reduces objective values each time ' +
    'they are scored.',
  deploymentMap: DeploymentMap.DawnOfWar,
  objectivePlacement: {
    kind: 'symmetric',
    pairsCount: 1,
    vpValue: 3,
    separationDistance: 18,
  },
  specialRules: [
    MissionSpecialRule.Reserves,
    MissionSpecialRule.SeizeTheInitiative,
    MissionSpecialRule.CounterOffensive,
    MissionSpecialRule.WindowOfOpportunity,
  ],
  secondaryObjectives: [
    { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 2 },
    { type: SecondaryObjectiveType.GiantKiller, vpValue: 4 },
    { type: SecondaryObjectiveType.LastManStanding, vpValue: 4 },
    { type: SecondaryObjectiveType.FirstStrike, vpValue: 2 },
  ],
};

/** All core mission definitions */
export const ALL_MISSIONS: MissionDefinition[] = [
  HEART_OF_BATTLE,
  CRUCIBLE_OF_WAR,
  TAKE_AND_HOLD,
];

/**
 * Find a mission definition by ID.
 */
export function findMission(id: string): MissionDefinition | undefined {
  return ALL_MISSIONS.find((m) => m.id === id);
}

/**
 * Find a mission definition by name.
 */
export function findMissionByName(name: string): MissionDefinition | undefined {
  return ALL_MISSIONS.find((m) => m.name === name);
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard battlefield width in inches (6 feet) */
export const STANDARD_BATTLEFIELD_WIDTH = 72;

/** Standard battlefield height in inches (4 feet) */
export const STANDARD_BATTLEFIELD_HEIGHT = 48;

/** Standard game length in Battle Turns */
export const STANDARD_GAME_LENGTH = 4;

/** Objective control range in inches */
export const OBJECTIVE_CONTROL_RANGE = 3;

/** Sudden Death bonus VP for the surviving player */
export const SUDDEN_DEATH_BONUS_VP = 3;

/** Seize the Initiative roll target (on a single d6, must roll this or higher) */
export const SEIZE_THE_INITIATIVE_TARGET = 6;

/** Minimum distance from battlefield edge for objective placement (inches) */
export const OBJECTIVE_EDGE_BUFFER = 6;

/** Minimum deployment distance from enemy models (inches) */
export const DEPLOYMENT_ENEMY_BUFFER = 2;
