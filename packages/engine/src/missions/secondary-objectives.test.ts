/**
 * Secondary Objectives Tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  MissionState,
} from '@hh/types';
import {
  Phase,
  SubPhase,
  TacticalStatus,
  Allegiance,
  LegionFaction,
  UnitMovementState,
  DeploymentMap,
  SecondaryObjectiveType,
  MissionSpecialRule,
} from '@hh/types';
import {
  checkSlayTheWarlord,
  checkLastManStanding,
  checkFirstStrike,
  evaluateSecondaryObjectives,
  updateSecondaryTrackingOnDestruction,
} from './secondary-objectives';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeModel(id: string, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function makeUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical-squad',
    models,
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...overrides,
  };
}

function makeArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 2000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function makeMissionState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    missionId: 'test',
    deploymentMap: DeploymentMap.SearchAndDestroy,
    deploymentZones: [
      { playerIndex: 0, vertices: [] },
      { playerIndex: 1, vertices: [] },
    ],
    objectives: [],
    secondaryObjectives: [
      { type: SecondaryObjectiveType.SlayTheWarlord, vpValue: 3, achievedByPlayer: null },
      { type: SecondaryObjectiveType.GiantKiller, vpValue: 3, achievedByPlayer: null },
      { type: SecondaryObjectiveType.LastManStanding, vpValue: 3, achievedByPlayer: null },
      { type: SecondaryObjectiveType.FirstStrike, vpValue: 3, achievedByPlayer: null },
    ],
    activeSpecialRules: [],
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

function makeState(
  army0Units: UnitState[],
  army1Units: UnitState[],
  missionState?: MissionState,
): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [makeArmy(0, army0Units), makeArmy(1, army1Units)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.End,
    currentSubPhase: SubPhase.Victory,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    advancedReactionsUsed: [],
    legionTacticaState: [
      { activeTacticaId: null, usedThisTurn: false },
      { activeTacticaId: null, usedThisTurn: false },
    ],
    missionState: missionState ?? makeMissionState(),
  } as GameState;
}

// ─── checkSlayTheWarlord ─────────────────────────────────────────────────────

describe('checkSlayTheWarlord', () => {
  it('returns true when enemy warlord model is destroyed', () => {
    const warlordModel = makeModel('wl-m1', { isWarlord: true, isDestroyed: true });
    const state = makeState(
      [],
      [makeUnit('wl-unit', [warlordModel])],
    );
    expect(checkSlayTheWarlord(state, 0)).toBe(true);
  });

  it('returns false when enemy warlord is alive', () => {
    const warlordModel = makeModel('wl-m1', { isWarlord: true });
    const state = makeState(
      [],
      [makeUnit('wl-unit', [warlordModel])],
    );
    expect(checkSlayTheWarlord(state, 0)).toBe(false);
  });

  it('returns false when no warlord model exists', () => {
    const model = makeModel('m1');
    const state = makeState(
      [],
      [makeUnit('u1', [model])],
    );
    expect(checkSlayTheWarlord(state, 0)).toBe(false);
  });
});

// ─── checkLastManStanding ────────────────────────────────────────────────────

describe('checkLastManStanding', () => {
  it('returns true when player has more non-routed units', () => {
    const state = makeState(
      [
        makeUnit('u1', [makeModel('m1')]),
        makeUnit('u2', [makeModel('m2')]),
      ],
      [
        makeUnit('e1', [makeModel('em1')]),
      ],
    );
    expect(checkLastManStanding(state, 0)).toBe(true);
    expect(checkLastManStanding(state, 1)).toBe(false);
  });

  it('returns false when tied', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('e1', [makeModel('em1')])],
    );
    expect(checkLastManStanding(state, 0)).toBe(false);
    expect(checkLastManStanding(state, 1)).toBe(false);
  });

  it('excludes routed units from count', () => {
    const state = makeState(
      [
        makeUnit('u1', [makeModel('m1')], { statuses: [TacticalStatus.Routed] }),
        makeUnit('u2', [makeModel('m2')]),
      ],
      [
        makeUnit('e1', [makeModel('em1')]),
        makeUnit('e2', [makeModel('em2')]),
      ],
    );
    // Player 0: 1 non-routed, Player 1: 2 non-routed
    expect(checkLastManStanding(state, 0)).toBe(false);
    expect(checkLastManStanding(state, 1)).toBe(true);
  });

  it('excludes fully destroyed units', () => {
    const state = makeState(
      [
        makeUnit('u1', [makeModel('m1')]),
      ],
      [
        makeUnit('e1', [makeModel('em1', { isDestroyed: true })]),
      ],
    );
    expect(checkLastManStanding(state, 0)).toBe(true);
  });

  it('excludes units in reserves', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')], { isInReserves: true })],
      [makeUnit('e1', [makeModel('em1')])],
    );
    expect(checkLastManStanding(state, 0)).toBe(false);
    expect(checkLastManStanding(state, 1)).toBe(true);
  });
});

// ─── checkFirstStrike ────────────────────────────────────────────────────────

describe('checkFirstStrike', () => {
  it('returns true if player achieved First Strike', () => {
    const mission = makeMissionState({
      firstStrikeTracking: {
        player0FirstTurnCompleted: true,
        player1FirstTurnCompleted: false,
        player0Achieved: true,
        player1Achieved: false,
      },
    });
    const state = makeState([], [], mission);
    expect(checkFirstStrike(state, 0)).toBe(true);
    expect(checkFirstStrike(state, 1)).toBe(false);
  });

  it('returns false when no mission state', () => {
    const state = makeState([], []);
    state.missionState = null;
    expect(checkFirstStrike(state, 0)).toBe(false);
  });
});

// ─── evaluateSecondaryObjectives ─────────────────────────────────────────────

describe('evaluateSecondaryObjectives', () => {
  it('awards VP for Slay the Warlord', () => {
    const warlordModel = makeModel('wl', { isWarlord: true, isDestroyed: true });
    const state = makeState(
      [],
      [makeUnit('wl-unit', [warlordModel])],
    );
    const [p0VP, p1VP] = evaluateSecondaryObjectives(state);
    expect(p0VP).toBeGreaterThanOrEqual(3); // Slay the Warlord
  });

  it('awards VP for First Strike', () => {
    const mission = makeMissionState({
      firstStrikeTracking: {
        player0FirstTurnCompleted: true,
        player1FirstTurnCompleted: true,
        player0Achieved: true,
        player1Achieved: false,
      },
    });
    const state = makeState([], [], mission);
    const [p0VP, p1VP] = evaluateSecondaryObjectives(state);
    expect(p0VP).toBe(3); // First Strike
    expect(p1VP).toBe(0);
  });

  it('awards VP for Last Man Standing', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')]), makeUnit('u2', [makeModel('m2')])],
      [makeUnit('e1', [makeModel('em1', { isDestroyed: true })])],
    );
    const [p0VP, p1VP] = evaluateSecondaryObjectives(state);
    // Player 0 has 2 units, player 1 has 0 alive units
    expect(p0VP).toBeGreaterThanOrEqual(3);
  });

  it('does NOT award Last Man Standing during Sudden Death', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [],
    );
    const [p0VP] = evaluateSecondaryObjectives(state, true);
    // Last Man Standing should not fire during Sudden Death
    const mission = state.missionState!;
    const lmsSecondary = mission.secondaryObjectives.find(
      (s) => s.type === SecondaryObjectiveType.LastManStanding,
    );
    // VP would only come from LMS since no other conditions are met
    // But with isSuddenDeath=true, LMS should not award
    expect(p0VP).toBe(0);
  });

  it('returns [0, 0] when no mission state', () => {
    const state = makeState([], []);
    state.missionState = null;
    expect(evaluateSecondaryObjectives(state)).toEqual([0, 0]);
  });
});

// ─── updateSecondaryTrackingOnDestruction ────────────────────────────────────

describe('updateSecondaryTrackingOnDestruction', () => {
  it('marks First Strike for player 0 on first turn', () => {
    const mission = makeMissionState();
    const updated = updateSecondaryTrackingOnDestruction(mission, 0, 1);
    expect(updated.firstStrikeTracking.player0Achieved).toBe(true);
  });

  it('does NOT mark First Strike if first turn already completed', () => {
    const mission = makeMissionState({
      firstStrikeTracking: {
        player0FirstTurnCompleted: true,
        player1FirstTurnCompleted: false,
        player0Achieved: false,
        player1Achieved: false,
      },
    });
    const updated = updateSecondaryTrackingOnDestruction(mission, 0, 2);
    expect(updated.firstStrikeTracking.player0Achieved).toBe(false);
  });

  it('does NOT overwrite existing First Strike achievement', () => {
    const mission = makeMissionState({
      firstStrikeTracking: {
        player0FirstTurnCompleted: false,
        player1FirstTurnCompleted: false,
        player0Achieved: true,
        player1Achieved: false,
      },
    });
    const updated = updateSecondaryTrackingOnDestruction(mission, 0, 1);
    expect(updated.firstStrikeTracking.player0Achieved).toBe(true);
  });
});
