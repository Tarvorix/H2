/**
 * Phase Control AI Tests
 *
 * Tests for isAutoAdvanceSubPhase and generatePhaseControlCommand.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import { isAutoAdvanceSubPhase, generatePhaseControlCommand } from './phase-control-ai';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['boltgun'],
    modifiers: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: [createModel()],
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    statuses: [],
    hasReactedThisTurn: false,
    modifiers: [],
    ...overrides,
  };
}

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: 'Dark Angels' as ArmyState['faction'],
    allegiance: 'Loyalist' as ArmyState['allegiance'],
    units: [createUnit({ id: 'p0-unit-1' })],
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0 }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [createUnit({ id: 'p1-unit-1' })],
      }),
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ─── isAutoAdvanceSubPhase Tests ────────────────────────────────────────────

describe('isAutoAdvanceSubPhase', () => {
  it('returns true for StartEffects', () => {
    expect(isAutoAdvanceSubPhase(Phase.Start, SubPhase.StartEffects)).toBe(true);
  });

  it('returns true for Rout', () => {
    expect(isAutoAdvanceSubPhase(Phase.Movement, SubPhase.Rout)).toBe(true);
  });

  it('returns true for ShootingMorale', () => {
    expect(isAutoAdvanceSubPhase(Phase.Shooting, SubPhase.ShootingMorale)).toBe(true);
  });

  it('returns true for EndEffects', () => {
    expect(isAutoAdvanceSubPhase(Phase.End, SubPhase.EndEffects)).toBe(true);
  });

  it('returns true for Statuses', () => {
    expect(isAutoAdvanceSubPhase(Phase.End, SubPhase.Statuses)).toBe(true);
  });

  it('returns true for Victory', () => {
    expect(isAutoAdvanceSubPhase(Phase.End, SubPhase.Victory)).toBe(true);
  });

  it('returns false for Move', () => {
    expect(isAutoAdvanceSubPhase(Phase.Movement, SubPhase.Move)).toBe(false);
  });

  it('returns false for Attack', () => {
    expect(isAutoAdvanceSubPhase(Phase.Shooting, SubPhase.Attack)).toBe(false);
  });

  it('returns false for Charge', () => {
    expect(isAutoAdvanceSubPhase(Phase.Assault, SubPhase.Charge)).toBe(false);
  });

  it('returns false for Challenge', () => {
    expect(isAutoAdvanceSubPhase(Phase.Assault, SubPhase.Challenge)).toBe(false);
  });

  it('returns false for Fight', () => {
    expect(isAutoAdvanceSubPhase(Phase.Assault, SubPhase.Fight)).toBe(false);
  });

  it('returns false for Resolution', () => {
    expect(isAutoAdvanceSubPhase(Phase.Assault, SubPhase.Resolution)).toBe(false);
  });

  it('returns false for Reserves', () => {
    expect(isAutoAdvanceSubPhase(Phase.Movement, SubPhase.Reserves)).toBe(false);
  });
});

// ─── generatePhaseControlCommand Tests ──────────────────────────────────────

describe('generatePhaseControlCommand', () => {
  it('returns endSubPhase for auto-advance sub-phases', () => {
    const autoAdvanceSubPhases = [
      { phase: Phase.Start, subPhase: SubPhase.StartEffects },
      { phase: Phase.Movement, subPhase: SubPhase.Rout },
      { phase: Phase.Shooting, subPhase: SubPhase.ShootingMorale },
      { phase: Phase.End, subPhase: SubPhase.EndEffects },
      { phase: Phase.End, subPhase: SubPhase.Statuses },
      { phase: Phase.End, subPhase: SubPhase.Victory },
    ];

    for (const { phase, subPhase } of autoAdvanceSubPhases) {
      const state = createGameState({
        currentPhase: phase,
        currentSubPhase: subPhase,
      });
      const result = generatePhaseControlCommand(state, 0);
      expect(result).toEqual({ type: 'endSubPhase' });
    }
  });

  it('returns null for interactive sub-phases', () => {
    const interactiveSubPhases = [
      { phase: Phase.Movement, subPhase: SubPhase.Move },
      { phase: Phase.Shooting, subPhase: SubPhase.Attack },
      { phase: Phase.Assault, subPhase: SubPhase.Charge },
      { phase: Phase.Assault, subPhase: SubPhase.Challenge },
      { phase: Phase.Assault, subPhase: SubPhase.Fight },
      { phase: Phase.Assault, subPhase: SubPhase.Resolution },
      { phase: Phase.Movement, subPhase: SubPhase.Reserves },
    ];

    for (const { phase, subPhase } of interactiveSubPhases) {
      const state = createGameState({
        currentPhase: phase,
        currentSubPhase: subPhase,
      });
      const result = generatePhaseControlCommand(state, 0);
      expect(result).toBeNull();
    }
  });
});
