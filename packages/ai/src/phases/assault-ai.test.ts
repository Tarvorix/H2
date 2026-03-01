/**
 * Assault AI Tests
 *
 * Tests for AI assault command generation.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import type { AITurnContext } from '../types';
import { generateAssaultCommand } from './assault-ai';

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
    units: [],
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
      createArmy({ playerIndex: 0, units: [] }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [],
      }),
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Charge,
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

function createContext(): AITurnContext {
  return {
    actedUnitIds: new Set(),
    movedModelIds: new Set(),
    currentMovingUnitId: null,
    lastPhase: null,
    lastSubPhase: null,
  };
}

// ─── Charge Sub-Phase Tests ────────────────────────────────────────────────

describe('generateAssaultCommand — Charge sub-phase', () => {
  it('returns null when no chargeable units exist', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Charge });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });

  it('marks units as acted when they have no charge targets', () => {
    const unit = createUnit({ id: 'charger-1' });
    const state = createGameState({ currentSubPhase: SubPhase.Charge });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });
    // No enemy units in range

    const ctx = createContext();
    generateAssaultCommand(state, 0, ctx, 'basic');

    expect(ctx.actedUnitIds.has('charger-1')).toBe(true);
  });

  it('skips already acted units', () => {
    const unit = createUnit({ id: 'charger-1' });
    const state = createGameState({ currentSubPhase: SubPhase.Charge });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    ctx.actedUnitIds.add('charger-1');

    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });
});

// ─── Challenge Sub-Phase Tests ─────────────────────────────────────────────

describe('generateAssaultCommand — Challenge sub-phase', () => {
  it('returns null when no active combats', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Challenge });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });

  it('selects gambit when challenge in FACE_OFF step', () => {
    const state = createGameState({
      currentSubPhase: SubPhase.Challenge,
      activeCombats: [
        {
          combatId: 'combat-1',
          activePlayerUnitIds: ['unit-a'],
          reactivePlayerUnitIds: ['unit-b'],
          challengeState: {
            currentStep: 'FACE_OFF',
            challengerId: 'model-a',
            challengedId: 'model-b',
            challengerGambit: null,
            challengedGambit: null,
          },
        },
      ] as any,
    });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');

    if (result) {
      expect(result.type).toBe('selectGambit');
      expect((result as any).modelId).toBe('model-a');
      expect(['SeizeTheInitiative', 'PressTheAttack', 'Guard']).toContain((result as any).gambit);
    }
  });

  it('tactical strategy picks PressTheAttack gambit', () => {
    const state = createGameState({
      currentSubPhase: SubPhase.Challenge,
      activeCombats: [
        {
          combatId: 'combat-1',
          activePlayerUnitIds: ['unit-a'],
          reactivePlayerUnitIds: ['unit-b'],
          challengeState: {
            currentStep: 'FACE_OFF',
            challengerId: 'model-a',
            challengedId: 'model-b',
            challengerGambit: null,
            challengedGambit: null,
          },
        },
      ] as any,
    });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'tactical');

    if (result) {
      expect(result.type).toBe('selectGambit');
      expect((result as any).gambit).toBe('PressTheAttack');
    }
  });
});

// ─── Fight Sub-Phase Tests ─────────────────────────────────────────────────

describe('generateAssaultCommand — Fight sub-phase', () => {
  it('returns null when no active combats', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Fight });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });

  it('generates resolveFight for active combats', () => {
    const state = createGameState({
      currentSubPhase: SubPhase.Fight,
      activeCombats: [
        {
          combatId: 'combat-1',
          activePlayerUnitIds: ['unit-a'],
          reactivePlayerUnitIds: ['unit-b'],
        },
      ] as any,
    });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('resolveFight');
    expect((result as any).combatId).toBe('combat-1');
  });

  it('skips already-resolved combats', () => {
    const state = createGameState({
      currentSubPhase: SubPhase.Fight,
      activeCombats: [
        {
          combatId: 'combat-1',
          activePlayerUnitIds: ['unit-a'],
          reactivePlayerUnitIds: ['unit-b'],
        },
      ] as any,
    });
    const ctx = createContext();
    ctx.actedUnitIds.add('combat-1');

    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });
});

// ─── Resolution Sub-Phase Tests ────────────────────────────────────────────

describe('generateAssaultCommand — Resolution sub-phase', () => {
  it('returns null when no locked-in-combat units', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Resolution });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });

  it('generates selectAftermath for units in combat', () => {
    const unit = createUnit({ id: 'combat-unit', isLockedInCombat: true });
    const state = createGameState({ currentSubPhase: SubPhase.Resolution });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectAftermath');
    expect((result as any).unitId).toBe('combat-unit');
    expect(['Pursue', 'Consolidate', 'Disengage', 'Hold']).toContain((result as any).option);
  });

  it('tactical strategy selects Consolidate', () => {
    const unit = createUnit({ id: 'combat-unit', isLockedInCombat: true });
    const state = createGameState({ currentSubPhase: SubPhase.Resolution });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'tactical');

    expect(result).not.toBeNull();
    expect((result as any).option).toBe('Consolidate');
  });

  it('marks units as acted after generating aftermath command', () => {
    const unit = createUnit({ id: 'combat-unit', isLockedInCombat: true });
    const state = createGameState({ currentSubPhase: SubPhase.Resolution });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    generateAssaultCommand(state, 0, ctx, 'basic');

    expect(ctx.actedUnitIds.has('combat-unit')).toBe(true);
  });
});

// ─── Non-Assault Sub-Phase Tests ───────────────────────────────────────────

describe('generateAssaultCommand — non-assault sub-phases', () => {
  it('returns null for Move sub-phase', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    const ctx = createContext();
    const result = generateAssaultCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });
});
