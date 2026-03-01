/**
 * Mission State Helper Tests.
 */

import { describe, it, expect } from 'vitest';
import type { ObjectiveMarker, MissionState, MissionDefinition } from '@hh/types';
import {
  DeploymentMap,
  SecondaryObjectiveType,
  MissionSpecialRule,
} from '@hh/types';
import { HEART_OF_BATTLE, SEARCH_AND_DESTROY } from '@hh/data';
import {
  initializeMissionState,
  updateMissionState,
  recordObjectiveScored,
  applyWindowOfOpportunity,
  markSecondaryAchieved,
  recordTurnStartVP,
  addObjective,
  markFirstTurnCompleted,
  markFirstStrikeAchieved,
} from './mission-state';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeMissionState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    missionId: 'test-mission',
    deploymentMap: DeploymentMap.SearchAndDestroy,
    deploymentZones: [
      { playerIndex: 0, vertices: [{ x: 0, y: 0 }] },
      { playerIndex: 1, vertices: [{ x: 72, y: 48 }] },
    ],
    objectives: [
      {
        id: 'obj-1',
        position: { x: 36, y: 24 },
        vpValue: 3,
        currentVpValue: 3,
        isRemoved: false,
        label: 'Center',
      },
    ],
    secondaryObjectives: [
      { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 3, achievedByPlayer: null },
      { type: SecondaryObjectiveType.FirstStrike, vpValue: 3, achievedByPlayer: null },
    ],
    activeSpecialRules: [MissionSpecialRule.WindowOfOpportunity],
    firstStrikeTracking: {
      player0FirstTurnCompleted: false,
      player1FirstTurnCompleted: false,
      player0Achieved: false,
      player1Achieved: false,
    },
    scoringHistory: [],
    vpAtTurnStart: [],
    ...overrides,
  };
}

// ─── initializeMissionState ──────────────────────────────────────────────────

describe('initializeMissionState', () => {
  it('creates mission state from Heart of Battle', () => {
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY);
    expect(state.missionId).toBe('heart-of-battle');
    expect(state.deploymentMap).toBe(DeploymentMap.SearchAndDestroy);
    expect(state.deploymentZones).toHaveLength(2);
  });

  it('generates fixed objectives from mission definition', () => {
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY);
    expect(state.objectives).toHaveLength(3);
    expect(state.objectives[0].vpValue).toBe(3);
    expect(state.objectives[0].currentVpValue).toBe(3);
    expect(state.objectives[0].isRemoved).toBe(false);
  });

  it('includes secondary objectives', () => {
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY);
    expect(state.secondaryObjectives).toHaveLength(4);
    expect(state.secondaryObjectives.every((s) => s.achievedByPlayer === null)).toBe(true);
  });

  it('copies special rules from mission', () => {
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY);
    expect(state.activeSpecialRules).toContain(MissionSpecialRule.Reserves);
    expect(state.activeSpecialRules).toContain(MissionSpecialRule.CounterOffensive);
  });

  it('uses provided objectives when given', () => {
    const customObjectives: ObjectiveMarker[] = [
      { id: 'custom-1', position: { x: 20, y: 20 }, vpValue: 5, currentVpValue: 5, isRemoved: false, label: 'Custom' },
    ];
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY, 72, 48, customObjectives);
    expect(state.objectives).toHaveLength(1);
    expect(state.objectives[0].id).toBe('custom-1');
  });

  it('initializes empty scoring history', () => {
    const state = initializeMissionState(HEART_OF_BATTLE, SEARCH_AND_DESTROY);
    expect(state.scoringHistory).toEqual([]);
    expect(state.vpAtTurnStart).toEqual([]);
  });
});

// ─── updateMissionState ──────────────────────────────────────────────────────

describe('updateMissionState', () => {
  it('immutably updates mission state', () => {
    const original = makeMissionState();
    const updated = updateMissionState(original, () => ({ missionId: 'updated' }));
    expect(updated.missionId).toBe('updated');
    expect(original.missionId).toBe('test-mission');
  });
});

// ─── recordObjectiveScored ───────────────────────────────────────────────────

describe('recordObjectiveScored', () => {
  it('adds scoring entry to history', () => {
    const state = makeMissionState();
    const updated = recordObjectiveScored(state, {
      battleTurn: 1,
      playerIndex: 0,
      objectiveId: 'obj-1',
      vpScored: 3,
      source: 'Center',
    });
    expect(updated.scoringHistory).toHaveLength(1);
    expect(updated.scoringHistory[0].vpScored).toBe(3);
    // Original unchanged
    expect(state.scoringHistory).toHaveLength(0);
  });
});

// ─── applyWindowOfOpportunity ────────────────────────────────────────────────

describe('applyWindowOfOpportunity', () => {
  it('reduces objective VP by 1', () => {
    const state = makeMissionState();
    const updated = applyWindowOfOpportunity(state, 'obj-1');
    expect(updated.objectives[0].currentVpValue).toBe(2);
    expect(updated.objectives[0].isRemoved).toBe(false);
  });

  it('removes objective when VP reaches 0', () => {
    const state = makeMissionState({
      objectives: [{
        id: 'obj-1',
        position: { x: 36, y: 24 },
        vpValue: 1,
        currentVpValue: 1,
        isRemoved: false,
        label: 'Center',
      }],
    });
    const updated = applyWindowOfOpportunity(state, 'obj-1');
    expect(updated.objectives[0].currentVpValue).toBe(0);
    expect(updated.objectives[0].isRemoved).toBe(true);
  });

  it('does nothing if Window of Opportunity is not active', () => {
    const state = makeMissionState({ activeSpecialRules: [] });
    const updated = applyWindowOfOpportunity(state, 'obj-1');
    expect(updated.objectives[0].currentVpValue).toBe(3);
  });

  it('does not reduce below 0', () => {
    const state = makeMissionState({
      objectives: [{
        id: 'obj-1',
        position: { x: 36, y: 24 },
        vpValue: 0,
        currentVpValue: 0,
        isRemoved: false,
        label: 'Center',
      }],
    });
    const updated = applyWindowOfOpportunity(state, 'obj-1');
    expect(updated.objectives[0].currentVpValue).toBe(0);
  });
});

// ─── markSecondaryAchieved ───────────────────────────────────────────────────

describe('markSecondaryAchieved', () => {
  it('marks a secondary as achieved by player', () => {
    const state = makeMissionState();
    const updated = markSecondaryAchieved(state, SecondaryObjectiveType.SlayTheWarlord, 0);
    const stw = updated.secondaryObjectives.find(
      (s) => s.type === SecondaryObjectiveType.SlayTheWarlord,
    );
    expect(stw?.achievedByPlayer).toBe(0);
  });

  it('does not overwrite already achieved secondary', () => {
    const state = makeMissionState({
      secondaryObjectives: [
        { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 3, achievedByPlayer: 1 },
      ],
    });
    const updated = markSecondaryAchieved(state, SecondaryObjectiveType.SlayTheWarlord, 0);
    const stw = updated.secondaryObjectives.find(
      (s) => s.type === SecondaryObjectiveType.SlayTheWarlord,
    );
    expect(stw?.achievedByPlayer).toBe(1); // Unchanged
  });
});

// ─── recordTurnStartVP ──────────────────────────────────────────────────────

describe('recordTurnStartVP', () => {
  it('records VP snapshot', () => {
    const state = makeMissionState();
    const updated = recordTurnStartVP(state, 5, 3);
    expect(updated.vpAtTurnStart).toHaveLength(1);
    expect(updated.vpAtTurnStart[0]).toEqual([5, 3]);
  });
});

// ─── addObjective ────────────────────────────────────────────────────────────

describe('addObjective', () => {
  it('adds an objective to the list', () => {
    const state = makeMissionState({ objectives: [] });
    const obj: ObjectiveMarker = {
      id: 'new-obj',
      position: { x: 20, y: 30 },
      vpValue: 2,
      currentVpValue: 2,
      isRemoved: false,
      label: 'New',
    };
    const updated = addObjective(state, obj);
    expect(updated.objectives).toHaveLength(1);
    expect(updated.objectives[0].id).toBe('new-obj');
  });
});

// ─── First Strike Tracking ───────────────────────────────────────────────────

describe('First Strike Tracking', () => {
  it('markFirstTurnCompleted updates player 0', () => {
    const state = makeMissionState();
    const updated = markFirstTurnCompleted(state, 0);
    expect(updated.firstStrikeTracking.player0FirstTurnCompleted).toBe(true);
    expect(updated.firstStrikeTracking.player1FirstTurnCompleted).toBe(false);
  });

  it('markFirstStrikeAchieved updates player 1', () => {
    const state = makeMissionState();
    const updated = markFirstStrikeAchieved(state, 1);
    expect(updated.firstStrikeTracking.player1Achieved).toBe(true);
    expect(updated.firstStrikeTracking.player0Achieved).toBe(false);
  });
});
