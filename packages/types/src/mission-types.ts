/**
 * Mission, deployment, and objective types.
 * Reference: HH_Battle_AOD.md — "Missions", "Deployment Maps", "Objectives", "Victory Conditions"
 */

import type { Position } from './game-state';

// ─── Deployment Maps ─────────────────────────────────────────────────────────

/**
 * The three core deployment map types.
 * Each defines how the two deployment zones are arranged on the 72"x48" battlefield.
 * Reference: HH_Battle_AOD.md — "Deployment Maps"
 */
export enum DeploymentMap {
  /** Diagonal corners — triangular deployment zones in opposite corners */
  SearchAndDestroy = 'Search and Destroy',
  /** Long edges — deployment zones along the long (72") edges */
  HammerAndAnvil = 'Hammer and Anvil',
  /** Short edges — deployment zones along the short (48") edges */
  DawnOfWar = 'Dawn of War',
}

/**
 * A deployment zone on the battlefield.
 * Defined as a polygon (array of vertices) that forms the zone boundary.
 */
export interface DeploymentZone {
  /** Which player this zone belongs to (0 or 1) */
  playerIndex: number;
  /** Polygon vertices defining the zone boundary (clockwise) */
  vertices: Position[];
}

/**
 * A deployment map definition with zone generation.
 */
export interface DeploymentMapDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Deployment map type */
  type: DeploymentMap;
  /** Description of the deployment layout */
  description: string;
  /**
   * Generate deployment zones for a given battlefield size.
   * @param width - Battlefield width in inches (default 72)
   * @param height - Battlefield height in inches (default 48)
   * @returns Array of two deployment zones (one per player)
   */
  getZones: (width: number, height: number) => [DeploymentZone, DeploymentZone];
}

// ─── Objectives ──────────────────────────────────────────────────────────────

/**
 * An objective marker on the battlefield.
 * Reference: HH_Battle_AOD.md — "Objective Markers"
 */
export interface ObjectiveMarker {
  /** Unique identifier */
  id: string;
  /** Position on the battlefield */
  position: Position;
  /** Base VP value when scored */
  vpValue: number;
  /** Current VP value (may be reduced by Window of Opportunity) */
  currentVpValue: number;
  /** Whether this objective has been removed from play */
  isRemoved: boolean;
  /** Display label (e.g., "Primary Alpha", "Flank West") */
  label: string;
}

/**
 * How objectives are placed for a mission.
 * Discriminated union: fixed positions, alternating player placement, or symmetric.
 */
export type ObjectivePlacementRule =
  | {
      /** Fixed positions defined by the mission */
      kind: 'fixed';
      /** Pre-defined objective positions and values */
      objectives: { position: Position; vpValue: number; label: string }[];
    }
  | {
      /** Players alternate placing objectives */
      kind: 'alternating';
      /** Number of objectives to place */
      count: number;
      /** VP value for each objective */
      vpValue: number;
      /** Minimum distance between objectives (inches) */
      minimumSpacing: number;
      /** Minimum distance from battlefield edges (inches) */
      edgeBuffer: number;
    }
  | {
      /** Symmetrically placed objectives */
      kind: 'symmetric';
      /** Number of objectives per pair (placed symmetrically) */
      pairsCount: number;
      /** VP value for each objective */
      vpValue: number;
      /** Distance between objectives in each pair (inches) */
      separationDistance: number;
    };

// ─── Secondary Objectives ────────────────────────────────────────────────────

/**
 * The four secondary objective types.
 * Reference: HH_Battle_AOD.md — "Secondary Objectives"
 */
export enum SecondaryObjectiveType {
  /** Destroy the enemy Warlord's unit */
  SlayTheWarlord = 'Slay the Warlord',
  /** Destroy an enemy Lord of War or Warlord-role unit */
  GiantKiller = 'Giant Killer',
  /** Have more non-routed units remaining at game end */
  LastManStanding = 'Last Man Standing',
  /** Destroy an enemy unit in your first active Player Turn */
  FirstStrike = 'First Strike',
}

/**
 * A secondary objective instance within a mission.
 */
export interface SecondaryObjective {
  /** Which secondary objective type */
  type: SecondaryObjectiveType;
  /** VP value when achieved */
  vpValue: number;
  /** Player index that has achieved this (null if not yet achieved) */
  achievedByPlayer: number | null;
}

// ─── Mission Special Rules ───────────────────────────────────────────────────

/**
 * Special rules that can be active during a mission.
 * Reference: HH_Battle_AOD.md — "Mission Special Rules"
 */
export enum MissionSpecialRule {
  /**
   * Seize the Initiative: At the start of each Battle Turn,
   * the player going second may roll a d6. On a 6, they go first this turn.
   */
  SeizeTheInitiative = 'Seize the Initiative',
  /**
   * Counter Offensive: If at the end of the game you have ≤50% of your
   * opponent's VP (from the start of the last Battle Turn), double your final VP.
   */
  CounterOffensive = 'Counter Offensive',
  /**
   * Reserves: Units may be placed in Reserves during deployment.
   * They enter play via Reserves Tests starting Battle Turn 2.
   */
  Reserves = 'Reserves',
  /**
   * Window of Opportunity: Each time a primary objective is scored,
   * reduce its VP value by 1 (to a minimum of 0). Remove if reduced to 0.
   */
  WindowOfOpportunity = 'Window of Opportunity',
}

// ─── Mission Definition ──────────────────────────────────────────────────────

/**
 * A complete mission definition.
 * Reference: HH_Battle_AOD.md — "Core Missions"
 */
export interface MissionDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the mission */
  description: string;
  /** Which deployment map to use */
  deploymentMap: DeploymentMap;
  /** How objectives are placed */
  objectivePlacement: ObjectivePlacementRule;
  /** Active special rules for this mission */
  specialRules: MissionSpecialRule[];
  /** Secondary objectives available in this mission */
  secondaryObjectives: { type: SecondaryObjectiveType; vpValue: number }[];
}

// ─── Mission Runtime State ───────────────────────────────────────────────────

/**
 * A scoring history entry — records VP awarded during a Victory sub-phase.
 */
export interface ObjectiveScoringEntry {
  /** Battle turn when the VP was scored */
  battleTurn: number;
  /** Which player scored */
  playerIndex: number;
  /** Which objective was scored (null for secondary objectives) */
  objectiveId: string | null;
  /** VP scored in this entry */
  vpScored: number;
  /** Source of the VP (objective label, secondary type, or special rule) */
  source: string;
}

/**
 * First Strike tracking state.
 * Tracks whether each player destroyed an enemy unit in their first active turn.
 */
export interface FirstStrikeTracking {
  /** Whether player 0 has had their first active Player Turn */
  player0FirstTurnCompleted: boolean;
  /** Whether player 1 has had their first active Player Turn */
  player1FirstTurnCompleted: boolean;
  /** Whether player 0 destroyed an enemy unit in their first active turn */
  player0Achieved: boolean;
  /** Whether player 1 destroyed an enemy unit in their first active turn */
  player1Achieved: boolean;
}

/**
 * The complete runtime state of a mission in progress.
 * Stored in GameState.missionState.
 */
export interface MissionState {
  /** ID of the active mission definition */
  missionId: string;
  /** The deployment map type in use */
  deploymentMap: DeploymentMap;
  /** Deployment zones for each player */
  deploymentZones: [DeploymentZone, DeploymentZone];
  /** Objective markers on the battlefield */
  objectives: ObjectiveMarker[];
  /** Secondary objectives for this mission */
  secondaryObjectives: SecondaryObjective[];
  /** Active special rules */
  activeSpecialRules: MissionSpecialRule[];
  /** First Strike tracking state */
  firstStrikeTracking: FirstStrikeTracking;
  /** History of all VP scored */
  scoringHistory: ObjectiveScoringEntry[];
  /** VP totals at the start of each Battle Turn (for Counter Offensive check) */
  vpAtTurnStart: [number, number][];
}
