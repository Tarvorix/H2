/**
 * Victory Handler Tests.
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
import { SUDDEN_DEATH_BONUS_VP, SEIZE_THE_INITIATIVE_TARGET } from '@hh/data';
import type { DiceProvider } from '../types';
import {
  handleVictorySubPhase,
  checkSuddenDeath,
  applyCounterOffensive,
  handleSeizeTheInitiative,
} from './victory-handler';

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

function makeArmy(playerIndex: number, units: UnitState[], vp: number = 0): ArmyState {
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
    victoryPoints: vp,
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
  overrides: Partial<GameState> = {},
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
    missionState: makeMissionState(),
    ...overrides,
  } as GameState;
}

function makeDice(results: number[]): DiceProvider {
  let idx = 0;
  return {
    rollD6: () => results[idx++] ?? 1,
    rollMultipleD6: (count: number) => {
      const r: number[] = [];
      for (let i = 0; i < count; i++) r.push(results[idx++] ?? 1);
      return r;
    },
    roll2D6: () => [results[idx++] ?? 1, results[idx++] ?? 1] as [number, number],
    rollD3: () => results[idx++] ?? 1,
    rollScatter: () => ({ direction: results[idx++] ?? 0, distance: results[idx++] ?? 0 }),
  };
}

// ─── checkSuddenDeath ───────────────────────────────────────────────────────

describe('checkSuddenDeath', () => {
  it('returns triggered=false when both players have models', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
    );
    const result = checkSuddenDeath(state);
    expect(result.triggered).toBe(false);
    expect(result.survivingPlayerIndex).toBeNull();
  });

  it('returns triggered=true with player 1 surviving when player 0 has no models', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { isDestroyed: true })])],
      [makeUnit('u2', [makeModel('m2')])],
    );
    const result = checkSuddenDeath(state);
    expect(result.triggered).toBe(true);
    expect(result.survivingPlayerIndex).toBe(1);
  });

  it('returns triggered=true with player 0 surviving when player 1 has no models', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2', { isDestroyed: true })])],
    );
    const result = checkSuddenDeath(state);
    expect(result.triggered).toBe(true);
    expect(result.survivingPlayerIndex).toBe(0);
  });

  it('returns triggered=true with null survivor when both wiped out', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { isDestroyed: true })])],
      [makeUnit('u2', [makeModel('m2', { isDestroyed: true })])],
    );
    const result = checkSuddenDeath(state);
    expect(result.triggered).toBe(true);
    expect(result.survivingPlayerIndex).toBeNull();
  });

  it('ignores models in reserves (they do not count)', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')], { isInReserves: true })],
      [makeUnit('u2', [makeModel('m2')])],
    );
    const result = checkSuddenDeath(state);
    expect(result.triggered).toBe(true);
    expect(result.survivingPlayerIndex).toBe(1);
  });
});

// ─── applyCounterOffensive ──────────────────────────────────────────────────

describe('applyCounterOffensive', () => {
  it('does not apply when no VP at turn start recorded', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
    );
    const result = applyCounterOffensive(state, { vpAtTurnStart: [] });
    expect(result.applied).toBe(false);
  });

  it('doubles VP for player 0 when they had ≤50% of player 1 VP at last turn start', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        armies: [makeArmy(0, [makeUnit('u1', [makeModel('m1')])], 8), makeArmy(1, [makeUnit('u2', [makeModel('m2')])], 10)],
      },
    );
    // Player 0 had 2 VP, player 1 had 6 VP at start of last turn => 2 ≤ 3 (50% of 6) = true
    const result = applyCounterOffensive(state, { vpAtTurnStart: [[2, 6]] });
    expect(result.applied).toBe(true);
    expect(result.playerIndex).toBe(0);
    expect(result.originalVP).toBe(8);
    expect(result.newVP).toBe(16);
  });

  it('doubles VP for player 1 when they had ≤50% of player 0 VP at last turn start', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        armies: [makeArmy(0, [makeUnit('u1', [makeModel('m1')])], 10), makeArmy(1, [makeUnit('u2', [makeModel('m2')])], 5)],
      },
    );
    // Player 1 had 1 VP, player 0 had 8 VP => 1 ≤ 4 (50% of 8) = true
    const result = applyCounterOffensive(state, { vpAtTurnStart: [[8, 1]] });
    expect(result.applied).toBe(true);
    expect(result.playerIndex).toBe(1);
    expect(result.originalVP).toBe(5);
    expect(result.newVP).toBe(10);
  });

  it('does not apply when VP difference is not ≤50%', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        armies: [makeArmy(0, [makeUnit('u1', [makeModel('m1')])], 5), makeArmy(1, [makeUnit('u2', [makeModel('m2')])], 6)],
      },
    );
    // Player 0 had 4 VP, player 1 had 6 VP => 4 > 3 (50% of 6) = false
    const result = applyCounterOffensive(state, { vpAtTurnStart: [[4, 6]] });
    expect(result.applied).toBe(false);
  });

  it('does not apply when opponent had 0 VP at turn start', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
    );
    // Player 0 had 0 VP, player 1 had 0 VP => 0 > 0 is false for both checks
    const result = applyCounterOffensive(state, { vpAtTurnStart: [[0, 0]] });
    expect(result.applied).toBe(false);
  });

  it('uses the last entry when multiple VP snapshots exist', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        armies: [makeArmy(0, [makeUnit('u1', [makeModel('m1')])], 12), makeArmy(1, [makeUnit('u2', [makeModel('m2')])], 3)],
      },
    );
    // Turn 1: [0, 0], Turn 2: [5, 10], Turn 3: [10, 2] => use last: 2 ≤ 5 (50% of 10) = true
    const result = applyCounterOffensive(state, {
      vpAtTurnStart: [[0, 0], [5, 10], [10, 2]],
    });
    expect(result.applied).toBe(true);
    expect(result.playerIndex).toBe(1);
  });
});

// ─── handleSeizeTheInitiative ───────────────────────────────────────────────

describe('handleSeizeTheInitiative', () => {
  it('does nothing when Seize the Initiative is not an active special rule', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
    );
    const dice = makeDice([6]);
    const result = handleSeizeTheInitiative(state, dice);
    expect(result.events).toHaveLength(0);
    expect(result.state.firstPlayerIndex).toBe(0);
  });

  it('does nothing when no mission state', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      { missionState: null },
    );
    const dice = makeDice([6]);
    const result = handleSeizeTheInitiative(state, dice);
    expect(result.events).toHaveLength(0);
  });

  it('swaps first player on success (roll >= target)', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        missionState: makeMissionState({
          activeSpecialRules: [MissionSpecialRule.SeizeTheInitiative],
        }),
        firstPlayerIndex: 0,
        activePlayerIndex: 0,
      },
    );
    const dice = makeDice([SEIZE_THE_INITIATIVE_TARGET]); // Exactly meets target
    const result = handleSeizeTheInitiative(state, dice);
    expect(result.events).toHaveLength(1);
    expect(result.state.firstPlayerIndex).toBe(1); // Player 1 seizes
    expect(result.state.activePlayerIndex).toBe(1);
  });

  it('does not swap on failure (roll < target)', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        missionState: makeMissionState({
          activeSpecialRules: [MissionSpecialRule.SeizeTheInitiative],
        }),
        firstPlayerIndex: 0,
        activePlayerIndex: 0,
      },
    );
    const dice = makeDice([SEIZE_THE_INITIATIVE_TARGET - 1]); // One below target
    const result = handleSeizeTheInitiative(state, dice);
    expect(result.events).toHaveLength(1);
    expect(result.state.firstPlayerIndex).toBe(0); // Unchanged
  });

  it('emits a seizeTheInitiative event with correct data', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      {
        missionState: makeMissionState({
          activeSpecialRules: [MissionSpecialRule.SeizeTheInitiative],
        }),
        firstPlayerIndex: 0,
      },
    );
    const dice = makeDice([3]);
    const result = handleSeizeTheInitiative(state, dice);
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as unknown as { type: string; playerIndex: number; roll: number; target: number; success: boolean };
    expect(event.type).toBe('seizeTheInitiative');
    expect(event.playerIndex).toBe(1); // Second player attempts
    expect(event.roll).toBe(3);
    expect(event.target).toBe(SEIZE_THE_INITIATIVE_TARGET);
    expect(event.success).toBe(false);
  });
});

// ─── handleVictorySubPhase ──────────────────────────────────────────────────

describe('handleVictorySubPhase', () => {
  it('returns unchanged state when no mission state', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1')])],
      [makeUnit('u2', [makeModel('m2')])],
      { missionState: null },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.accepted).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.state).toEqual(state);
  });

  it('scores primary objectives for the active player', () => {
    // Player 0 has a model within 3" of the center objective
    const model = makeModel('m1', { position: { x: 36, y: 24 } });
    const state = makeState(
      [makeUnit('u1', [model])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 60, y: 40 } })])],
      { activePlayerIndex: 0 },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    // Player 0 should score 3 VP for controlling the center objective
    expect(result.state.armies[0].victoryPoints).toBe(3);
    // Check that objective scored event was emitted
    const scoredEvents = result.events.filter(
      (e) => (e as unknown as { type: string }).type === 'objectiveScored',
    );
    expect(scoredEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not score objectives for the non-active player', () => {
    // Player 1 controls the objective, but player 0 is active
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 36, y: 24 } })])],
      { activePlayerIndex: 0 },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    // Player 0 gets no VP (they don't control the objective)
    expect(result.state.armies[0].victoryPoints).toBe(0);
  });

  it('triggers Sudden Death and awards bonus VP when enemy has no models', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 36, y: 24 } })])],
      [makeUnit('u2', [makeModel('m2', { isDestroyed: true })])],
      {
        activePlayerIndex: 1,
        // Make it second player's turn at end of battle turn
        firstPlayerIndex: 0,
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    // Sudden death triggered — player 0 survives, gets bonus VP
    const suddenDeathEvents = result.events.filter(
      (e) => (e as unknown as { type: string }).type === 'suddenDeath',
    );
    expect(suddenDeathEvents.length).toBe(1);
    expect(result.state.armies[0].victoryPoints).toBeGreaterThanOrEqual(SUDDEN_DEATH_BONUS_VP);
  });

  it('ends the game at the last battle turn when both players have had their turn', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])],
      {
        currentBattleTurn: 4,
        maxBattleTurns: 4,
        activePlayerIndex: 1,  // Second player's turn (end of battle turn)
        firstPlayerIndex: 0,
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.isGameOver).toBe(true);
    const gameOverEvents = result.events.filter(
      (e) => (e as unknown as { type: string }).type === 'gameOver',
    );
    expect(gameOverEvents.length).toBe(1);
  });

  it('does NOT end the game at the last battle turn during the first player turn', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])],
      {
        currentBattleTurn: 4,
        maxBattleTurns: 4,
        activePlayerIndex: 0,  // First player's turn (not end of battle turn yet)
        firstPlayerIndex: 0,
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.isGameOver).toBe(false);
  });

  it('applies Window of Opportunity after scoring', () => {
    const model = makeModel('m1', { position: { x: 36, y: 24 } });
    const state = makeState(
      [makeUnit('u1', [model])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 60, y: 40 } })])],
      {
        activePlayerIndex: 0,
        missionState: makeMissionState({
          activeSpecialRules: [MissionSpecialRule.WindowOfOpportunity],
        }),
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    // Objective should have reduced VP after scoring
    const obj = result.state.missionState!.objectives.find((o) => o.id === 'obj-1');
    expect(obj!.currentVpValue).toBe(2); // Was 3, reduced by 1
    // Should have WoO event
    const wooEvents = result.events.filter(
      (e) => (e as unknown as { type: string }).type === 'windowOfOpportunity',
    );
    expect(wooEvents.length).toBe(1);
  });

  it('applies Counter Offensive at game end when applicable', () => {
    // Player 0 had ≤50% of player 1's VP at the last turn start
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])],
      {
        currentBattleTurn: 4,
        maxBattleTurns: 4,
        activePlayerIndex: 1,
        firstPlayerIndex: 0,
        armies: [
          makeArmy(0, [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])], 3),
          makeArmy(1, [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])], 10),
        ],
        missionState: makeMissionState({
          activeSpecialRules: [MissionSpecialRule.CounterOffensive],
          vpAtTurnStart: [[1, 8]], // Player 0 had 1 VP, player 1 had 8 VP => 1 ≤ 4 (50% of 8)
        }),
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.isGameOver).toBe(true);
    // Player 0's VP should be doubled
    const coEvents = result.events.filter(
      (e) => (e as unknown as { type: string }).type === 'counterOffensiveActivated',
    );
    expect(coEvents.length).toBe(1);
  });

  it('determines winner based on final VP totals', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])],
      {
        currentBattleTurn: 4,
        maxBattleTurns: 4,
        activePlayerIndex: 1,
        firstPlayerIndex: 0,
        armies: [
          makeArmy(0, [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])], 10),
          makeArmy(1, [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])], 5),
        ],
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.isGameOver).toBe(true);
    expect(result.state.winnerPlayerIndex).toBe(0); // Player 0 has more VP
  });

  it('results in a draw when VP are equal', () => {
    const state = makeState(
      [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])],
      {
        currentBattleTurn: 4,
        maxBattleTurns: 4,
        activePlayerIndex: 1,
        firstPlayerIndex: 0,
        armies: [
          makeArmy(0, [makeUnit('u1', [makeModel('m1', { position: { x: 60, y: 40 } })])], 5),
          makeArmy(1, [makeUnit('u2', [makeModel('m2', { position: { x: 10, y: 10 } })])], 5),
        ],
      },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.isGameOver).toBe(true);
    expect(result.state.winnerPlayerIndex).toBeNull(); // Draw
  });

  it('records scoring history when objectives are scored', () => {
    const model = makeModel('m1', { position: { x: 36, y: 24 } });
    const state = makeState(
      [makeUnit('u1', [model])],
      [makeUnit('u2', [makeModel('m2', { position: { x: 60, y: 40 } })])],
      { activePlayerIndex: 0 },
    );
    const dice = makeDice([]);
    const result = handleVictorySubPhase(state, dice);
    expect(result.state.missionState!.scoringHistory.length).toBeGreaterThanOrEqual(1);
    expect(result.state.missionState!.scoringHistory[0].playerIndex).toBe(0);
    expect(result.state.missionState!.scoringHistory[0].vpScored).toBe(3);
  });
});
