/**
 * Mission State Helpers.
 * Immutable update functions for MissionState.
 *
 * Reference: HH_Battle_AOD.md — "Victory Points", "Window of Opportunity",
 *   "Secondary Objectives"
 */

import type {
  MissionState,
  MissionDefinition,
  ObjectiveMarker,
  ObjectiveScoringEntry,
  SecondaryObjective,
  DeploymentMapDefinition,
} from '@hh/types';
import {
  SecondaryObjectiveType,
  MissionSpecialRule,
} from '@hh/types';

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Create an initial MissionState from a mission definition and deployment map.
 *
 * @param mission - The mission definition
 * @param deploymentMapDef - The deployment map definition
 * @param battlefieldWidth - Battlefield width in inches (default 72)
 * @param battlefieldHeight - Battlefield height in inches (default 48)
 * @param objectives - Pre-placed objectives (for fixed placement missions)
 * @returns Initial MissionState
 */
export function initializeMissionState(
  mission: MissionDefinition,
  deploymentMapDef: DeploymentMapDefinition,
  battlefieldWidth: number = 72,
  battlefieldHeight: number = 48,
  objectives?: ObjectiveMarker[],
): MissionState {
  const zones = deploymentMapDef.getZones(battlefieldWidth, battlefieldHeight);

  // Generate objectives from fixed placement if none provided
  let missionObjectives: ObjectiveMarker[];
  if (objectives) {
    missionObjectives = objectives;
  } else if (mission.objectivePlacement.kind === 'fixed') {
    missionObjectives = mission.objectivePlacement.objectives.map((obj, i) => ({
      id: `obj-${i}`,
      position: obj.position,
      vpValue: obj.vpValue,
      currentVpValue: obj.vpValue,
      isRemoved: false,
      label: obj.label,
    }));
  } else {
    // Alternating/symmetric missions need player placement — start with empty
    missionObjectives = [];
  }

  const secondaryObjectives: SecondaryObjective[] = mission.secondaryObjectives.map((s) => ({
    type: s.type,
    vpValue: s.vpValue,
    achievedByPlayer: null,
  }));

  return {
    missionId: mission.id,
    deploymentMap: mission.deploymentMap,
    deploymentZones: zones,
    objectives: missionObjectives,
    secondaryObjectives,
    activeSpecialRules: [...mission.specialRules],
    firstStrikeTracking: {
      player0FirstTurnCompleted: false,
      player1FirstTurnCompleted: false,
      player0Achieved: false,
      player1Achieved: false,
    },
    scoringHistory: [],
    vpAtTurnStart: [],
  };
}

// ─── Immutable Updates ───────────────────────────────────────────────────────

/**
 * Immutably update the mission state.
 *
 * @param state - Current mission state
 * @param updater - Function that returns partial updates
 * @returns New mission state with updates applied
 */
export function updateMissionState(
  state: MissionState,
  updater: (s: MissionState) => Partial<MissionState>,
): MissionState {
  return { ...state, ...updater(state) };
}

/**
 * Record an objective scoring entry in the mission state.
 *
 * @param missionState - Current mission state
 * @param entry - The scoring entry to record
 * @returns New mission state with entry added
 */
export function recordObjectiveScored(
  missionState: MissionState,
  entry: ObjectiveScoringEntry,
): MissionState {
  return {
    ...missionState,
    scoringHistory: [...missionState.scoringHistory, entry],
  };
}

/**
 * Apply Window of Opportunity to an objective after it is scored.
 * Reduces the objective's currentVpValue by 1. If it reaches 0, marks it as removed.
 *
 * Reference: HH_Battle_AOD.md — "Window of Opportunity"
 *
 * @param missionState - Current mission state
 * @param objectiveId - The objective that was scored
 * @returns New mission state with objective value reduced
 */
export function applyWindowOfOpportunity(
  missionState: MissionState,
  objectiveId: string,
): MissionState {
  if (!missionState.activeSpecialRules.includes(MissionSpecialRule.WindowOfOpportunity)) {
    return missionState;
  }

  const newObjectives = missionState.objectives.map((obj) => {
    if (obj.id !== objectiveId) return obj;

    const newValue = Math.max(0, obj.currentVpValue - 1);
    return {
      ...obj,
      currentVpValue: newValue,
      isRemoved: newValue === 0,
    };
  });

  return {
    ...missionState,
    objectives: newObjectives,
  };
}

/**
 * Mark a secondary objective as achieved by a player.
 *
 * @param missionState - Current mission state
 * @param type - The secondary objective type
 * @param playerIndex - The player who achieved it
 * @returns New mission state with secondary marked
 */
export function markSecondaryAchieved(
  missionState: MissionState,
  type: SecondaryObjectiveType,
  playerIndex: number,
): MissionState {
  const newSecondaries = missionState.secondaryObjectives.map((s) => {
    if (s.type !== type) return s;
    // Only mark if not already achieved
    if (s.achievedByPlayer !== null) return s;
    return { ...s, achievedByPlayer: playerIndex };
  });

  return {
    ...missionState,
    secondaryObjectives: newSecondaries,
  };
}

/**
 * Record VP totals at the start of a battle turn (for Counter Offensive tracking).
 *
 * @param missionState - Current mission state
 * @param player0VP - Player 0's VP total at turn start
 * @param player1VP - Player 1's VP total at turn start
 * @returns New mission state with VP snapshot recorded
 */
export function recordTurnStartVP(
  missionState: MissionState,
  player0VP: number,
  player1VP: number,
): MissionState {
  return {
    ...missionState,
    vpAtTurnStart: [...missionState.vpAtTurnStart, [player0VP, player1VP]],
  };
}

/**
 * Add an objective to the mission state (for alternating/symmetric placement).
 *
 * @param missionState - Current mission state
 * @param objective - The objective to add
 * @returns New mission state with objective added
 */
export function addObjective(
  missionState: MissionState,
  objective: ObjectiveMarker,
): MissionState {
  return {
    ...missionState,
    objectives: [...missionState.objectives, objective],
  };
}

/**
 * Update First Strike tracking when a player completes their first turn.
 *
 * @param missionState - Current mission state
 * @param playerIndex - The player completing their first turn
 * @returns New mission state
 */
export function markFirstTurnCompleted(
  missionState: MissionState,
  playerIndex: number,
): MissionState {
  const tracking = { ...missionState.firstStrikeTracking };
  if (playerIndex === 0) {
    tracking.player0FirstTurnCompleted = true;
  } else {
    tracking.player1FirstTurnCompleted = true;
  }
  return { ...missionState, firstStrikeTracking: tracking };
}

/**
 * Mark First Strike as achieved for a player.
 *
 * @param missionState - Current mission state
 * @param playerIndex - The player who achieved First Strike
 * @returns New mission state
 */
export function markFirstStrikeAchieved(
  missionState: MissionState,
  playerIndex: number,
): MissionState {
  const tracking = { ...missionState.firstStrikeTracking };
  if (playerIndex === 0) {
    tracking.player0Achieved = true;
  } else {
    tracking.player1Achieved = true;
  }
  return { ...missionState, firstStrikeTracking: tracking };
}
