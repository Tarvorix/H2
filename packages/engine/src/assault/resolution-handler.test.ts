/**
 * Resolution Handler Tests
 * Tests for Combat Resolution Points, winner determination, panic checks,
 * massacre detection, challenge return, and the full resolution pipeline.
 * Reference: HH_Rules_Battle.md — Resolution Sub-Phase Steps 1-3
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  TacticalStatus,
  UnitMovementState,
  Allegiance,
  LegionFaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, Position } from '@hh/types';
import type { DiceProvider } from '../types';
import {
  returnChallengeParticipants,
  calculateCombatResolutionPoints,
  determineWinner,
  resolvePanicCheck,
  checkMassacre,
  resolveCombatResolution,
} from './resolution-handler';
import type { CombatState, ChallengeState } from './assault-types';

// ─── Deterministic Dice Provider ──────────────────────────────────────────────

function createDiceProvider(rolls: number[]): DiceProvider {
  let index = 0;
  return {
    rollD6: () => rolls[index++] ?? 1,
    rollMultipleD6: (count: number) => {
      const result: number[] = [];
      for (let i = 0; i < count; i++) {
        result.push(rolls[index++] ?? 1);
      }
      return result;
    },
    roll2D6: () => {
      const d1 = rolls[index++] ?? 1;
      const d2 = rolls[index++] ?? 1;
      return [d1, d2] as [number, number];
    },
    rollD3: () => rolls[index++] ?? 1,
    rollScatter: () => ({ direction: rolls[index++] ?? 1, distance: rolls[index++] ?? 1 }),
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(
  id: string,
  pos: Position,
  wounds: number = 1,
  destroyed: boolean = false,
): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: pos,
    currentWounds: wounds,
    isDestroyed: destroyed,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function createUnit(
  id: string,
  models: ModelState[],
  statuses: TacticalStatus[] = [],
): UnitState {
  return {
    id,
    profileId: 'tactical',
    models,
    statuses,
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: true,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
  };
}

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.Ultramarines,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createGameState(armies: [ArmyState, ArmyState]): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies,
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Resolution,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
  };
}

function createCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    combatId: 'combat-1',
    activePlayerUnitIds: ['unit-a'],
    reactivePlayerUnitIds: ['unit-b'],
    initiativeSteps: [],
    currentInitiativeStepIndex: 0,
    activePlayerCRP: 0,
    reactivePlayerCRP: 0,
    challengeState: null,
    activePlayerCasualties: [],
    reactivePlayerCasualties: [],
    resolved: false,
    isMassacre: false,
    massacreWinnerPlayerIndex: null,
    ...overrides,
  };
}

function createChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return {
    challengerId: 'challenger-m1',
    challengedId: 'challenged-m1',
    challengerUnitId: 'unit-a',
    challengedUnitId: 'unit-b',
    challengerPlayerIndex: 0,
    challengedPlayerIndex: 1,
    currentStep: 'GLORY',
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: null,
    focusRolls: null,
    challengerWoundsInflicted: 0,
    challengedWoundsInflicted: 0,
    round: 1,
    challengerCRP: 0,
    challengedCRP: 0,
    challengerWeaponId: null,
    challengedWeaponId: null,
    guardUpFocusBonus: {},
    testTheFoeAdvantage: {},
    tauntAndBaitSelections: {},
    withdrawChosen: {},
    ...overrides,
  };
}

// ─── calculateCombatResolutionPoints ─────────────────────────────────────────

describe('calculateCombatResolutionPoints', () => {
  it('returns 0-0 CRP when no casualties, equal models, no challenge', () => {
    const combat = createCombatState({
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
      challengeState: null,
    });

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    expect(result.activePlayerCRP).toBe(0);
    expect(result.reactivePlayerCRP).toBe(0);
    expect(result.activeBreakdown.enemyModelsKilled).toBe(0);
    expect(result.activeBreakdown.modelMajority).toBe(0);
    expect(result.activeBreakdown.challengeCRP).toBe(0);
    expect(result.reactiveBreakdown.enemyModelsKilled).toBe(0);
    expect(result.reactiveBreakdown.modelMajority).toBe(0);
    expect(result.reactiveBreakdown.challengeCRP).toBe(0);
  });

  it('awards +1 per enemy model killed on reactive side (active casualties = reactive CRP)', () => {
    // Active player lost 3 models => reactive player gets 3 CRP from kills
    const combat = createCombatState({
      activePlayerCasualties: ['m1', 'm2', 'm3'],
      reactivePlayerCasualties: [],
    });

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    expect(result.reactivePlayerCRP).toBe(3);
    expect(result.reactiveBreakdown.enemyModelsKilled).toBe(3);
    expect(result.activePlayerCRP).toBe(0);
    expect(result.activeBreakdown.enemyModelsKilled).toBe(0);
  });

  it('awards +1 per enemy model killed on active side (reactive casualties = active CRP)', () => {
    // Reactive player lost 2 models => active player gets 2 CRP from kills
    const combat = createCombatState({
      activePlayerCasualties: [],
      reactivePlayerCasualties: ['m1', 'm2'],
    });

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    expect(result.activePlayerCRP).toBe(2);
    expect(result.activeBreakdown.enemyModelsKilled).toBe(2);
    expect(result.reactivePlayerCRP).toBe(0);
  });

  it('awards +1 model majority to active player when active has more models', () => {
    const combat = createCombatState();

    const result = calculateCombatResolutionPoints(combat, 8, 5);

    expect(result.activeBreakdown.modelMajority).toBe(1);
    expect(result.reactiveBreakdown.modelMajority).toBe(0);
    expect(result.activePlayerCRP).toBe(1);
    expect(result.reactivePlayerCRP).toBe(0);
  });

  it('awards +1 model majority to reactive player when reactive has more models', () => {
    const combat = createCombatState();

    const result = calculateCombatResolutionPoints(combat, 3, 7);

    expect(result.reactiveBreakdown.modelMajority).toBe(1);
    expect(result.activeBreakdown.modelMajority).toBe(0);
    expect(result.reactivePlayerCRP).toBe(1);
    expect(result.activePlayerCRP).toBe(0);
  });

  it('no model majority when equal models', () => {
    const combat = createCombatState();

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    expect(result.activeBreakdown.modelMajority).toBe(0);
    expect(result.reactiveBreakdown.modelMajority).toBe(0);
  });

  it('includes challenge CRP for challenger on active side', () => {
    const combat = createCombatState({
      challengeState: createChallengeState({
        challengerUnitId: 'unit-a', // active side
        challengedUnitId: 'unit-b',
        challengerCRP: 2,
        challengedCRP: 1,
      }),
    });

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    // Challenger is on active side: active gets challengerCRP, reactive gets challengedCRP
    expect(result.activeBreakdown.challengeCRP).toBe(2);
    expect(result.reactiveBreakdown.challengeCRP).toBe(1);
    expect(result.activePlayerCRP).toBe(2);
    expect(result.reactivePlayerCRP).toBe(1);
  });

  it('includes challenge CRP for challenger on reactive side', () => {
    const combat = createCombatState({
      challengeState: createChallengeState({
        challengerUnitId: 'unit-b', // reactive side
        challengedUnitId: 'unit-a',
        challengerCRP: 3,
        challengedCRP: 0,
      }),
    });

    const result = calculateCombatResolutionPoints(combat, 5, 5);

    // Challenger is on reactive side: active gets challengedCRP, reactive gets challengerCRP
    expect(result.activeBreakdown.challengeCRP).toBe(0);
    expect(result.reactiveBreakdown.challengeCRP).toBe(3);
    expect(result.activePlayerCRP).toBe(0);
    expect(result.reactivePlayerCRP).toBe(3);
  });

  it('combines all CRP sources correctly', () => {
    // Active killed 1 reactive model (active gets 1 from kills)
    // Reactive killed 2 active models (reactive gets 2 from kills)
    // Active has model majority (active gets 1)
    // Challenge: challenger on active side with CRP 1, challenged CRP 0
    const combat = createCombatState({
      activePlayerCasualties: ['am1', 'am2'],
      reactivePlayerCasualties: ['rm1'],
      challengeState: createChallengeState({
        challengerUnitId: 'unit-a',
        challengedUnitId: 'unit-b',
        challengerCRP: 1,
        challengedCRP: 0,
      }),
    });

    // Active has 7 models, reactive has 4 models => active has majority
    const result = calculateCombatResolutionPoints(combat, 7, 4);

    // Active: 1 (kills) + 1 (majority) + 1 (challenge) = 3
    expect(result.activeBreakdown.enemyModelsKilled).toBe(1);
    expect(result.activeBreakdown.modelMajority).toBe(1);
    expect(result.activeBreakdown.challengeCRP).toBe(1);
    expect(result.activeBreakdown.total).toBe(3);
    expect(result.activePlayerCRP).toBe(3);

    // Reactive: 2 (kills) + 0 (majority) + 0 (challenge) = 2
    expect(result.reactiveBreakdown.enemyModelsKilled).toBe(2);
    expect(result.reactiveBreakdown.modelMajority).toBe(0);
    expect(result.reactiveBreakdown.challengeCRP).toBe(0);
    expect(result.reactiveBreakdown.total).toBe(2);
    expect(result.reactivePlayerCRP).toBe(2);
  });

  it('handles zero casualties with model majority only', () => {
    const combat = createCombatState({
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
      challengeState: null,
    });

    const result = calculateCombatResolutionPoints(combat, 10, 3);

    expect(result.activePlayerCRP).toBe(1);
    expect(result.reactivePlayerCRP).toBe(0);
    expect(result.activeBreakdown.enemyModelsKilled).toBe(0);
    expect(result.activeBreakdown.modelMajority).toBe(1);
    expect(result.activeBreakdown.total).toBe(1);
  });
});

// ─── determineWinner ────────────────────────────────────────────────────────

describe('determineWinner', () => {
  it('active player wins when active CRP > reactive CRP', () => {
    const result = determineWinner(5, 3, 0);

    expect(result.winnerPlayerIndex).toBe(0);
    expect(result.loserPlayerIndex).toBe(1);
    expect(result.isDraw).toBe(false);
  });

  it('reactive player wins when reactive CRP > active CRP', () => {
    const result = determineWinner(2, 6, 0);

    expect(result.winnerPlayerIndex).toBe(1);
    expect(result.loserPlayerIndex).toBe(0);
    expect(result.isDraw).toBe(false);
  });

  it('draw when CRP are equal', () => {
    const result = determineWinner(4, 4, 0);

    expect(result.winnerPlayerIndex).toBeNull();
    expect(result.loserPlayerIndex).toBeNull();
    expect(result.isDraw).toBe(true);
  });

  it('calculates correct CRP difference', () => {
    const result = determineWinner(7, 3, 0);

    expect(result.crpDifference).toBe(4);
  });

  it('draw has crpDifference of 0', () => {
    const result = determineWinner(5, 5, 0);

    expect(result.crpDifference).toBe(0);
    expect(result.isDraw).toBe(true);
  });

  it('uses provided activePlayerIndex for winner determination', () => {
    // Active player index is 1 instead of 0
    const result = determineWinner(5, 3, 1);

    expect(result.winnerPlayerIndex).toBe(1);
    expect(result.loserPlayerIndex).toBe(0);
    expect(result.isDraw).toBe(false);
    expect(result.crpDifference).toBe(2);
  });
});

// ─── resolvePanicCheck ──────────────────────────────────────────────────────

describe('resolvePanicCheck', () => {
  it('passes when roll <= leadership - crpDifference', () => {
    // Leadership 8, CRP diff 2 => target = 6
    // Roll 2d6: 2+3 = 5, which is <= 6 => pass
    const dice = createDiceProvider([2, 3]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    // Losing player is player 1 (reactive side)
    const result = resolvePanicCheck(state, combat, 1, 2, dice, 8);

    expect(result.passed).toBe(true);
    expect(result.roll).toBe(5);
    expect(result.targetNumber).toBe(6);
    expect(result.skipped).toBe(false);
  });

  it('fails when roll > leadership - crpDifference', () => {
    // Leadership 8, CRP diff 2 => target = 6
    // Roll 2d6: 4+4 = 8, which is > 6 => fail
    const dice = createDiceProvider([4, 4]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 2, dice, 8);

    expect(result.passed).toBe(false);
    expect(result.roll).toBe(8);
    expect(result.targetNumber).toBe(6);
    expect(result.skipped).toBe(false);
  });

  it('applies Routed to all losing units on failure', () => {
    // Roll 2d6: 6+6 = 12, which is > any target => fail
    const dice = createDiceProvider([6, 6]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    // Losing player is player 1 (reactive side = unit-b)
    const result = resolvePanicCheck(state, combat, 1, 3, dice, 8);

    expect(result.passed).toBe(false);

    // Find unit-b in the updated state and check for Routed status
    const updatedUnitB = result.state.armies[1].units.find(u => u.id === 'unit-b');
    expect(updatedUnitB).toBeDefined();
    expect(updatedUnitB!.statuses).toContain(TacticalStatus.Routed);
  });

  it('does not apply Routed on success', () => {
    // Roll 2d6: 1+1 = 2, which is <= any target => pass
    const dice = createDiceProvider([1, 1]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 1, dice, 8);

    expect(result.passed).toBe(true);

    const updatedUnitB = result.state.armies[1].units.find(u => u.id === 'unit-b');
    expect(updatedUnitB).toBeDefined();
    expect(updatedUnitB!.statuses).not.toContain(TacticalStatus.Routed);
  });

  it('skips when all losing models already Routed', () => {
    const dice = createDiceProvider([]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    // Unit-b is already Routed
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })], [TacticalStatus.Routed]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 3, dice, 8);

    expect(result.skipped).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.roll).toBe(0);
    expect(result.targetNumber).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it('uses the losing side unit leadership when not specified', () => {
    // Lone tactical legionary is Ld 7, CRP diff 1 => target = 6.
    // Roll 2d6: 3+3 = 6, which is <= 6 => pass.
    const dice = createDiceProvider([3, 3]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 1, dice);

    expect(result.targetNumber).toBe(6);
    expect(result.passed).toBe(true);
    expect(result.roll).toBe(6);
  });

  it('skips the panic check when no losing unit can be resolved', () => {
    const dice = createDiceProvider([3, 4]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [])]);
    const combat = createCombatState({
      reactivePlayerUnitIds: ['missing-unit'],
    });

    const result = resolvePanicCheck(state, combat, 1, 1, dice);

    expect(result.skipped).toBe(true);
    expect(result.targetNumber).toBe(0);
    expect(result.roll).toBe(0);
  });

  it('target number never goes below 2', () => {
    // Leadership 8, CRP diff 10 => would be -2, clamped to 2
    // Roll 2d6: 1+1 = 2, which is <= 2 => pass
    const dice = createDiceProvider([1, 1]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 10, dice, 8);

    expect(result.targetNumber).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('generates coolCheck event', () => {
    const dice = createDiceProvider([3, 2]);
    const unitA = createUnit('unit-a', [createModel('a1', { x: 0, y: 0 })]);
    const unitB = createUnit('unit-b', [createModel('b1', { x: 5, y: 0 })]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolvePanicCheck(state, combat, 1, 1, dice, 8);

    expect(result.events).toHaveLength(1);
    const event = result.events[0];
    expect(event.type).toBe('coolCheck');
    expect((event as any).roll).toBe(5);
    expect((event as any).target).toBe(7);
    expect((event as any).passed).toBe(true);
  });
});

// ─── checkMassacre ──────────────────────────────────────────────────────────

describe('checkMassacre', () => {
  it('returns massacre when active side wiped, reactive alive', () => {
    // All active models destroyed, reactive models alive
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }, 0, true),
      createModel('a2', { x: 1, y: 0 }, 0, true),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }, 1, false),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = checkMassacre(state, combat);

    expect(result.isMassacre).toBe(true);
    // Reactive player wins (player 1)
    expect(result.winnerPlayerIndex).toBe(1);
  });

  it('returns massacre when reactive side wiped, active alive', () => {
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }, 1, false),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }, 0, true),
      createModel('b2', { x: 6, y: 0 }, 0, true),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = checkMassacre(state, combat);

    expect(result.isMassacre).toBe(true);
    // Active player wins (player 0)
    expect(result.winnerPlayerIndex).toBe(0);
  });

  it('returns massacre with null winner when both sides wiped (mutual destruction)', () => {
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }, 0, true),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }, 0, true),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = checkMassacre(state, combat);

    expect(result.isMassacre).toBe(true);
    expect(result.winnerPlayerIndex).toBeNull();
  });

  it('returns no massacre when both sides have alive models', () => {
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }, 1, false),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }, 1, false),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = checkMassacre(state, combat);

    expect(result.isMassacre).toBe(false);
    expect(result.winnerPlayerIndex).toBeNull();
  });
});

// ─── returnChallengeParticipants ─────────────────────────────────────────────

describe('returnChallengeParticipants', () => {
  it('returns state unchanged when no challenge', () => {
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState({ challengeState: null });

    const result = returnChallengeParticipants(state, combat);

    expect(result.state).toBe(state); // Same reference — no changes
    expect(result.events).toHaveLength(0);
  });

  it('moves surviving challenger toward friendly unit', () => {
    // Challenger at (10, 10), friendly model at (2, 2) in same unit
    const challengerModel = createModel('challenger-m1', { x: 10, y: 10 });
    const friendlyModel = createModel('a2', { x: 2, y: 2 });
    const unitA = createUnit('unit-a', [challengerModel, friendlyModel]);

    const challengedModel = createModel('challenged-m1', { x: 15, y: 15 });
    const unitB = createUnit('unit-b', [challengedModel]);

    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState({
      challengeState: createChallengeState({
        challengerId: 'challenger-m1',
        challengedId: 'challenged-m1',
        challengerUnitId: 'unit-a',
        challengedUnitId: 'unit-b',
      }),
    });

    const result = returnChallengeParticipants(state, combat);

    // The challenger should have been moved toward friendly model
    const updatedUnitA = result.state.armies[0].units.find(u => u.id === 'unit-a');
    const updatedChallenger = updatedUnitA!.models.find(m => m.id === 'challenger-m1');

    // The distance between (10,10) and (2,2) is ~11.31, which is > 2
    // so the model should have been moved closer to (2,2)
    const dist = Math.sqrt(
      (updatedChallenger!.position.x - 2) ** 2 + (updatedChallenger!.position.y - 2) ** 2,
    );
    // Should be moved to ~1" from the friendly model
    expect(dist).toBeLessThanOrEqual(1.1);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    expect(result.events[0].type).toBe('pileInMove');
  });

  it('moves surviving challenged toward friendly unit', () => {
    const challengerModel = createModel('challenger-m1', { x: 0, y: 0 });
    const unitA = createUnit('unit-a', [challengerModel]);

    const challengedModel = createModel('challenged-m1', { x: 12, y: 12 });
    const friendlyModel = createModel('b2', { x: 3, y: 3 });
    const unitB = createUnit('unit-b', [challengedModel, friendlyModel]);

    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState({
      challengeState: createChallengeState({
        challengerId: 'challenger-m1',
        challengedId: 'challenged-m1',
        challengerUnitId: 'unit-a',
        challengedUnitId: 'unit-b',
      }),
    });

    const result = returnChallengeParticipants(state, combat);

    const updatedUnitB = result.state.armies[1].units.find(u => u.id === 'unit-b');
    const updatedChallenged = updatedUnitB!.models.find(m => m.id === 'challenged-m1');

    // The distance between (12,12) and (3,3) is ~12.73, which is > 2
    // so the model should have been moved closer to (3,3)
    const dist = Math.sqrt(
      (updatedChallenged!.position.x - 3) ** 2 + (updatedChallenged!.position.y - 3) ** 2,
    );
    expect(dist).toBeLessThanOrEqual(1.1);
    // At least the challenged model produced a pile-in event
    const pileInEvents = result.events.filter(e => e.type === 'pileInMove');
    expect(pileInEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('does not move destroyed models', () => {
    // Challenger is destroyed, challenged is alive
    const challengerModel = createModel('challenger-m1', { x: 10, y: 10 }, 0, true);
    const friendlyModelA = createModel('a2', { x: 2, y: 2 });
    const unitA = createUnit('unit-a', [challengerModel, friendlyModelA]);

    const challengedModel = createModel('challenged-m1', { x: 15, y: 15 }, 0, true);
    const friendlyModelB = createModel('b2', { x: 20, y: 20 });
    const unitB = createUnit('unit-b', [challengedModel, friendlyModelB]);

    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState({
      challengeState: createChallengeState({
        challengerId: 'challenger-m1',
        challengedId: 'challenged-m1',
        challengerUnitId: 'unit-a',
        challengedUnitId: 'unit-b',
      }),
    });

    const result = returnChallengeParticipants(state, combat);

    // No pile-in events should be generated for destroyed models
    expect(result.events).toHaveLength(0);

    // Positions should remain unchanged
    const updatedChallenger = result.state.armies[0].units
      .find(u => u.id === 'unit-a')!.models
      .find(m => m.id === 'challenger-m1');
    expect(updatedChallenger!.position).toEqual({ x: 10, y: 10 });

    const updatedChallenged = result.state.armies[1].units
      .find(u => u.id === 'unit-b')!.models
      .find(m => m.id === 'challenged-m1');
    expect(updatedChallenged!.position).toEqual({ x: 15, y: 15 });
  });
});

// ─── resolveCombatResolution ─────────────────────────────────────────────────

describe('resolveCombatResolution', () => {
  it('runs full pipeline: CRP -> winner -> panic check', () => {
    const dice = createDiceProvider([5, 5]); // 2d6 = 10 for panic check
    // Active has 3 alive models in unit-a
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }),
      createModel('a2', { x: 1, y: 0 }),
      createModel('a3', { x: 2, y: 0 }),
    ]);
    // Reactive has 2 alive models in unit-b
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }),
      createModel('b2', { x: 6, y: 0 }),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    // Active killed 2 reactive models, reactive killed 0 active models
    const combat = createCombatState({
      reactivePlayerCasualties: ['rc1', 'rc2'],
      activePlayerCasualties: [],
    });

    const result = resolveCombatResolution(state, combat, dice);

    // CRP: active gets 2 (kills) + 1 (majority, 3 vs 2) = 3, reactive gets 0
    expect(result.crpResult.activePlayerCRP).toBe(3);
    expect(result.crpResult.reactivePlayerCRP).toBe(0);

    // Winner: active player wins
    expect(result.winnerResult.winnerPlayerIndex).toBe(0);
    expect(result.winnerResult.loserPlayerIndex).toBe(1);
    expect(result.winnerResult.isDraw).toBe(false);
    expect(result.winnerResult.crpDifference).toBe(3);

    // Panic check should have been run for loser (player 1)
    expect(result.panicCheckResult).not.toBeNull();
    expect(result.panicCheckResult!.roll).toBe(10); // 5+5
    expect(result.panicCheckResult!.targetNumber).toBe(4); // 7 - 3 = 4
    expect(result.panicCheckResult!.passed).toBe(false); // 10 > 5

    expect(result.isMassacre).toBe(false);
  });

  it('skips panic check on draw', () => {
    const dice = createDiceProvider([]);
    // Equal models, no casualties => draw
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }),
      createModel('a2', { x: 1, y: 0 }),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }),
      createModel('b2', { x: 6, y: 0 }),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState({
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
    });

    const result = resolveCombatResolution(state, combat, dice);

    expect(result.winnerResult.isDraw).toBe(true);
    expect(result.panicCheckResult).toBeNull();
    expect(result.isMassacre).toBe(false);
  });

  it('handles massacre (skips CRP, generates event)', () => {
    const dice = createDiceProvider([]);
    // Active side all destroyed
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }, 0, true),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }, 1, false),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    const combat = createCombatState();

    const result = resolveCombatResolution(state, combat, dice);

    expect(result.isMassacre).toBe(true);
    // CRP should be zeroed out on massacre
    expect(result.crpResult.activePlayerCRP).toBe(0);
    expect(result.crpResult.reactivePlayerCRP).toBe(0);
    // Winner is reactive player (player 1)
    expect(result.winnerResult.winnerPlayerIndex).toBe(1);
    // No panic check on massacre
    expect(result.panicCheckResult).toBeNull();

    // Should have a combatResolution event
    const crEvent = result.events.find(e => e.type === 'combatResolution');
    expect(crEvent).toBeDefined();
    expect((crEvent as any).combatId).toBe('combat-1');
    expect((crEvent as any).winnerPlayerIndex).toBe(1);
  });

  it('generates combatResolution event with correct values', () => {
    const dice = createDiceProvider([1, 1]); // 2d6 = 2 for panic check (will pass)
    const unitA = createUnit('unit-a', [
      createModel('a1', { x: 0, y: 0 }),
      createModel('a2', { x: 1, y: 0 }),
    ]);
    const unitB = createUnit('unit-b', [
      createModel('b1', { x: 5, y: 0 }),
    ]);
    const state = createGameState([createArmy(0, [unitA]), createArmy(1, [unitB])]);
    // Active killed 1 reactive model, reactive killed 1 active model
    const combat = createCombatState({
      reactivePlayerCasualties: ['rc1'],
      activePlayerCasualties: ['ac1'],
    });

    const result = resolveCombatResolution(state, combat, dice);

    // Active CRP: 1 (kill) + 1 (majority: 2 vs 1) = 2
    // Reactive CRP: 1 (kill) + 0 = 1
    const crEvent = result.events.find(e => e.type === 'combatResolution');
    expect(crEvent).toBeDefined();
    expect((crEvent as any).activePlayerCRP).toBe(2);
    expect((crEvent as any).reactivePlayerCRP).toBe(1);
    expect((crEvent as any).winnerPlayerIndex).toBe(0);
    expect((crEvent as any).crpDifference).toBe(1);
    expect((crEvent as any).combatId).toBe('combat-1');
  });
});
