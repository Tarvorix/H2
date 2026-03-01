/**
 * State Machine Tests
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState, Allegiance, LegionFaction } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  PLAYER_TURN_SEQUENCE,
  findSequenceIndex,
  getNextPhaseState,
  advanceSubPhase,
  advancePhase,
  advancePlayerTurn,
  advanceBattleTurn,
  initializeGamePhase,
} from './state-machine';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function createUnit(id: string): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createModel(`${id}-m0`)],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
  };
}

function createArmy(playerIndex: number): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units: [createUnit(`p${playerIndex}-u1`)],
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createArmy(0), createArmy(1)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Start,
    currentSubPhase: SubPhase.StartEffects,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PLAYER_TURN_SEQUENCE', () => {
  it('should have 13 entries', () => {
    expect(PLAYER_TURN_SEQUENCE).toHaveLength(13);
  });

  it('should start with Start/StartEffects', () => {
    expect(PLAYER_TURN_SEQUENCE[0]).toEqual({
      phase: Phase.Start,
      subPhase: SubPhase.StartEffects,
    });
  });

  it('should end with End/Victory', () => {
    const last = PLAYER_TURN_SEQUENCE[PLAYER_TURN_SEQUENCE.length - 1];
    expect(last).toEqual({
      phase: Phase.End,
      subPhase: SubPhase.Victory,
    });
  });

  it('should have Movement phase entries in correct order', () => {
    const movementEntries = PLAYER_TURN_SEQUENCE.filter(ps => ps.phase === Phase.Movement);
    expect(movementEntries).toEqual([
      { phase: Phase.Movement, subPhase: SubPhase.Reserves },
      { phase: Phase.Movement, subPhase: SubPhase.Move },
      { phase: Phase.Movement, subPhase: SubPhase.Rout },
    ]);
  });

  it('should have Shooting phase entries in correct order', () => {
    const shootingEntries = PLAYER_TURN_SEQUENCE.filter(ps => ps.phase === Phase.Shooting);
    expect(shootingEntries).toEqual([
      { phase: Phase.Shooting, subPhase: SubPhase.Attack },
      { phase: Phase.Shooting, subPhase: SubPhase.ShootingMorale },
    ]);
  });

  it('should have Assault phase entries in correct order', () => {
    const assaultEntries = PLAYER_TURN_SEQUENCE.filter(ps => ps.phase === Phase.Assault);
    expect(assaultEntries).toEqual([
      { phase: Phase.Assault, subPhase: SubPhase.Charge },
      { phase: Phase.Assault, subPhase: SubPhase.Challenge },
      { phase: Phase.Assault, subPhase: SubPhase.Fight },
      { phase: Phase.Assault, subPhase: SubPhase.Resolution },
    ]);
  });

  it('should have End phase entries in correct order', () => {
    const endEntries = PLAYER_TURN_SEQUENCE.filter(ps => ps.phase === Phase.End);
    expect(endEntries).toEqual([
      { phase: Phase.End, subPhase: SubPhase.EndEffects },
      { phase: Phase.End, subPhase: SubPhase.Statuses },
      { phase: Phase.End, subPhase: SubPhase.Victory },
    ]);
  });
});

describe('findSequenceIndex', () => {
  it('should find Start/StartEffects at index 0', () => {
    expect(findSequenceIndex(Phase.Start, SubPhase.StartEffects)).toBe(0);
  });

  it('should find Movement/Move at index 2', () => {
    expect(findSequenceIndex(Phase.Movement, SubPhase.Move)).toBe(2);
  });

  it('should find End/Victory at last index', () => {
    expect(findSequenceIndex(Phase.End, SubPhase.Victory)).toBe(12);
  });

  it('should return -1 for invalid combination', () => {
    expect(findSequenceIndex(Phase.Start, SubPhase.Move)).toBe(-1);
  });
});

describe('getNextPhaseState', () => {
  it('should return Movement/Reserves after Start/StartEffects', () => {
    expect(getNextPhaseState(Phase.Start, SubPhase.StartEffects)).toEqual({
      phase: Phase.Movement,
      subPhase: SubPhase.Reserves,
    });
  });

  it('should return Movement/Move after Movement/Reserves', () => {
    expect(getNextPhaseState(Phase.Movement, SubPhase.Reserves)).toEqual({
      phase: Phase.Movement,
      subPhase: SubPhase.Move,
    });
  });

  it('should return null at end of sequence', () => {
    expect(getNextPhaseState(Phase.End, SubPhase.Victory)).toBeNull();
  });

  it('should return null for invalid state', () => {
    expect(getNextPhaseState(Phase.Start, SubPhase.Move)).toBeNull();
  });
});

describe('advanceSubPhase', () => {
  it('should advance from Start/StartEffects to Movement/Reserves', () => {
    const state = createGameState();
    const result = advanceSubPhase(state);
    expect(result.state.currentPhase).toBe(Phase.Movement);
    expect(result.state.currentSubPhase).toBe(SubPhase.Reserves);
  });

  it('should emit phaseAdvanced event when changing phases', () => {
    const state = createGameState();
    const result = advanceSubPhase(state);
    expect(result.events.some(e => e.type === 'phaseAdvanced')).toBe(true);
    const phaseEvent = result.events.find(e => e.type === 'phaseAdvanced');
    expect(phaseEvent).toMatchObject({
      fromPhase: Phase.Start,
      toPhase: Phase.Movement,
    });
  });

  it('should emit subPhaseAdvanced event', () => {
    const state = createGameState();
    const result = advanceSubPhase(state);
    expect(result.events.some(e => e.type === 'subPhaseAdvanced')).toBe(true);
  });

  it('should advance within same phase without phaseAdvanced event', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Reserves,
    });
    const result = advanceSubPhase(state);
    expect(result.state.currentPhase).toBe(Phase.Movement);
    expect(result.state.currentSubPhase).toBe(SubPhase.Move);
    expect(result.events.some(e => e.type === 'phaseAdvanced')).toBe(false);
    expect(result.events.some(e => e.type === 'subPhaseAdvanced')).toBe(true);
  });

  it('should advance player turn at end of Victory sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Victory,
      activePlayerIndex: 0,
      firstPlayerIndex: 0,
    });
    const result = advanceSubPhase(state);
    expect(result.state.activePlayerIndex).toBe(1);
    expect(result.state.currentPhase).toBe(Phase.Start);
    expect(result.state.currentSubPhase).toBe(SubPhase.StartEffects);
  });
});

describe('advancePhase', () => {
  it('should skip from Movement/Reserves to Shooting/Attack', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Reserves,
    });
    const result = advancePhase(state);
    expect(result.state.currentPhase).toBe(Phase.Shooting);
    expect(result.state.currentSubPhase).toBe(SubPhase.Attack);
  });

  it('should skip from Start to Movement', () => {
    const state = createGameState();
    const result = advancePhase(state);
    expect(result.state.currentPhase).toBe(Phase.Movement);
    expect(result.state.currentSubPhase).toBe(SubPhase.Reserves);
  });

  it('should skip from Assault to End', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Charge,
    });
    const result = advancePhase(state);
    expect(result.state.currentPhase).toBe(Phase.End);
    expect(result.state.currentSubPhase).toBe(SubPhase.EndEffects);
  });

  it('should advance player turn when skipping past End phase', () => {
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.EndEffects,
      activePlayerIndex: 0,
      firstPlayerIndex: 0,
    });
    const result = advancePhase(state);
    expect(result.state.activePlayerIndex).toBe(1);
  });
});

describe('advancePlayerTurn', () => {
  it('should switch from player 0 to player 1 when player 0 is first', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      firstPlayerIndex: 0,
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Victory,
    });
    const result = advancePlayerTurn(state);
    expect(result.state.activePlayerIndex).toBe(1);
    expect(result.state.currentPhase).toBe(Phase.Start);
    expect(result.state.currentSubPhase).toBe(SubPhase.StartEffects);
  });

  it('should reset the new active player army state', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      firstPlayerIndex: 0,
    });
    // Make player 1's unit appear as if it reacted
    state.armies[1].units[0].hasReactedThisTurn = true;
    state.armies[1].units[0].movementState = UnitMovementState.Moved;
    state.armies[1].reactionAllotmentRemaining = 0;

    const result = advancePlayerTurn(state);
    expect(result.state.armies[1].units[0].hasReactedThisTurn).toBe(false);
    expect(result.state.armies[1].units[0].movementState).toBe(UnitMovementState.Stationary);
    expect(result.state.armies[1].reactionAllotmentRemaining).toBe(1);
  });

  it('should emit playerTurnAdvanced event', () => {
    const state = createGameState({ activePlayerIndex: 0, firstPlayerIndex: 0 });
    const result = advancePlayerTurn(state);
    expect(result.events.some(e => e.type === 'playerTurnAdvanced')).toBe(true);
  });

  it('should advance battle turn after second player finishes', () => {
    const state = createGameState({
      activePlayerIndex: 1,
      firstPlayerIndex: 0,
      currentBattleTurn: 1,
    });
    const result = advancePlayerTurn(state);
    expect(result.state.currentBattleTurn).toBe(2);
    expect(result.state.activePlayerIndex).toBe(0);
  });
});

describe('advanceBattleTurn', () => {
  it('should increment battle turn', () => {
    const state = createGameState({ currentBattleTurn: 1 });
    const result = advanceBattleTurn(state);
    expect(result.state.currentBattleTurn).toBe(2);
  });

  it('should reset to first player', () => {
    const state = createGameState({
      currentBattleTurn: 1,
      firstPlayerIndex: 0,
      activePlayerIndex: 1,
    });
    const result = advanceBattleTurn(state);
    expect(result.state.activePlayerIndex).toBe(0);
  });

  it('should reset to Start/StartEffects', () => {
    const state = createGameState({
      currentBattleTurn: 1,
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Victory,
    });
    const result = advanceBattleTurn(state);
    expect(result.state.currentPhase).toBe(Phase.Start);
    expect(result.state.currentSubPhase).toBe(SubPhase.StartEffects);
  });

  it('should reset both armies', () => {
    const state = createGameState();
    state.armies[0].units[0].movementState = UnitMovementState.Rushed;
    state.armies[1].units[0].hasReactedThisTurn = true;

    const result = advanceBattleTurn(state);
    expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Stationary);
    expect(result.state.armies[1].units[0].hasReactedThisTurn).toBe(false);
  });

  it('should emit battleTurnAdvanced and playerTurnAdvanced events', () => {
    const state = createGameState({ currentBattleTurn: 1 });
    const result = advanceBattleTurn(state);
    expect(result.events.some(e => e.type === 'battleTurnAdvanced')).toBe(true);
    expect(result.events.some(e => e.type === 'playerTurnAdvanced')).toBe(true);
  });

  it('should end game when max turns reached', () => {
    const state = createGameState({
      currentBattleTurn: 4,
      maxBattleTurns: 4,
    });
    const result = advanceBattleTurn(state);
    expect(result.state.isGameOver).toBe(true);
    expect(result.events.some(e => e.type === 'gameOver')).toBe(true);
  });

  it('should determine winner by victory points', () => {
    const state = createGameState({
      currentBattleTurn: 4,
      maxBattleTurns: 4,
    });
    state.armies[0].victoryPoints = 5;
    state.armies[1].victoryPoints = 3;

    const result = advanceBattleTurn(state);
    expect(result.state.winnerPlayerIndex).toBe(0);
  });

  it('should declare draw on equal victory points', () => {
    const state = createGameState({
      currentBattleTurn: 4,
      maxBattleTurns: 4,
    });
    state.armies[0].victoryPoints = 3;
    state.armies[1].victoryPoints = 3;

    const result = advanceBattleTurn(state);
    expect(result.state.winnerPlayerIndex).toBeNull();
  });
});

describe('full turn cycle', () => {
  it('should complete a full player turn from Start to Victory', () => {
    let state = createGameState();
    const phases: string[] = [];

    // Advance through all 13 sub-phases
    for (let i = 0; i < 13; i++) {
      phases.push(`${state.currentPhase}/${state.currentSubPhase}`);
      if (i < 12) {
        // Not the last one — should stay in player 0's turn
        const result = advanceSubPhase(state);
        state = result.state;
      }
    }

    expect(phases).toEqual([
      'Start/StartEffects',
      'Movement/Reserves',
      'Movement/Move',
      'Movement/Rout',
      'Shooting/Attack',
      'Shooting/ShootingMorale',
      'Assault/Charge',
      'Assault/Challenge',
      'Assault/Fight',
      'Assault/Resolution',
      'End/EndEffects',
      'End/Statuses',
      'End/Victory',
    ]);

    // At Victory — advancing should swap to player 1
    expect(state.currentPhase).toBe(Phase.End);
    expect(state.currentSubPhase).toBe(SubPhase.Victory);
    expect(state.activePlayerIndex).toBe(0);

    const result = advanceSubPhase(state);
    expect(result.state.activePlayerIndex).toBe(1);
    expect(result.state.currentPhase).toBe(Phase.Start);
  });

  it('should complete two player turns and advance battle turn', () => {
    let state = createGameState({ firstPlayerIndex: 0 });

    // Player 0's turn: 13 sub-phases
    for (let i = 0; i < 13; i++) {
      const result = advanceSubPhase(state);
      state = result.state;
    }
    // Now it should be player 1's turn
    expect(state.activePlayerIndex).toBe(1);
    expect(state.currentBattleTurn).toBe(1);

    // Player 1's turn: 13 sub-phases
    for (let i = 0; i < 13; i++) {
      const result = advanceSubPhase(state);
      state = result.state;
    }
    // Now battle turn 2 should begin
    expect(state.currentBattleTurn).toBe(2);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.currentPhase).toBe(Phase.Start);
  });

  it('should end game after all battle turns', () => {
    let state = createGameState({ maxBattleTurns: 1, firstPlayerIndex: 0 });

    // Player 0's turn
    for (let i = 0; i < 13; i++) {
      const result = advanceSubPhase(state);
      state = result.state;
    }
    // Player 1's turn
    for (let i = 0; i < 13; i++) {
      const result = advanceSubPhase(state);
      state = result.state;
    }
    expect(state.isGameOver).toBe(true);
  });
});

describe('initializeGamePhase', () => {
  it('should set phase to Start/StartEffects', () => {
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
    });
    const result = initializeGamePhase(state);
    expect(result.currentPhase).toBe(Phase.Start);
    expect(result.currentSubPhase).toBe(SubPhase.StartEffects);
  });
});
