/**
 * Challenge Handler Tests
 * Tests for Challenge declaration, acceptance, and declining.
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 1-2
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  TacticalStatus,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  getEligibleChallengers,
  declareChallenge,
  acceptChallenge,
  declineChallenge,
  getEligibleAcceptors,
} from './challenge-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x = 0, y = 0, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createModel(`${id}-m0`), createModel(`${id}-m1`)],
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

function createCombatGameState(): GameState {
  // Two units locked in combat, each with a sergeant
  const army0Units = [
    createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
      models: [
        createModel('u0-sgt', 10, 10, { profileModelName: 'Sergeant', isWarlord: false }),
        createModel('u0-m1', 10, 12),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
      models: [
        createModel('u1-sgt', 11, 10, { profileModelName: 'Sergeant', isWarlord: false }),
        createModel('u1-m1', 11, 12),
      ],
    }),
  ];

  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createArmy(0, army0Units), createArmy(1, army1Units)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Challenge,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
  };
}

// ─── getEligibleChallengers ─────────────────────────────────────────────────

describe('getEligibleChallengers', () => {
  it('should find sergeant as eligible challenger', () => {
    const state = createCombatGameState();
    const result = getEligibleChallengers(state, 'unit-0');

    expect(result.hasEligibleChallengers).toBe(true);
    expect(result.eligibleChallengerIds).toContain('u0-sgt');
  });

  it('should not include regular models', () => {
    const state = createCombatGameState();
    const result = getEligibleChallengers(state, 'unit-0');

    expect(result.eligibleChallengerIds).not.toContain('u0-m1');
  });

  it('should find warlord as eligible challenger', () => {
    const state = createCombatGameState();
    state.armies[0].units[0].models[0] = createModel('u0-warlord', 10, 10, {
      profileModelName: 'Praetor',
      isWarlord: true,
    });

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(true);
    expect(result.eligibleChallengerIds).toContain('u0-warlord');
  });

  it('should return empty if unit is not locked in combat', () => {
    const state = createCombatGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      isLockedInCombat: false,
      models: [
        createModel('u0-sgt', 10, 10, { profileModelName: 'Sergeant' }),
      ],
    });

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(false);
  });

  it('should return empty if unit is Routed', () => {
    const state = createCombatGameState();
    state.armies[0].units[0].statuses = [TacticalStatus.Routed];

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(false);
  });

  it('should return empty if unit not found', () => {
    const state = createCombatGameState();
    const result = getEligibleChallengers(state, 'nonexistent');
    expect(result.hasEligibleChallengers).toBe(false);
  });

  it('should return empty if all models are destroyed', () => {
    const state = createCombatGameState();
    state.armies[0].units[0].models = [
      createModel('u0-sgt', 10, 10, { profileModelName: 'Sergeant', isDestroyed: true, currentWounds: 0 }),
    ];

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(false);
  });
});

// ─── declareChallenge ───────────────────────────────────────────────────────

describe('declareChallenge', () => {
  it('should successfully declare a challenge between eligible models', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'u0-sgt', 'u1-sgt');

    expect(result.valid).toBe(true);
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('challengeDeclared');
  });

  it('should fail if challenger model not found', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'nonexistent', 'u1-sgt');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fail if target model not found', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'u0-sgt', 'nonexistent');

    expect(result.valid).toBe(false);
  });

  it('should fail if challenger is not eligible', () => {
    const state = createCombatGameState();
    // u0-m1 is a regular Legionary, not eligible
    const result = declareChallenge(state, 'u0-m1', 'u1-sgt');

    expect(result.valid).toBe(false);
  });

  it('should fail if units are not engaged', () => {
    const state = createCombatGameState();
    // Remove engagement
    state.armies[0].units[0].engagedWithUnitIds = [];

    const result = declareChallenge(state, 'u0-sgt', 'u1-sgt');
    expect(result.valid).toBe(false);
  });

  it('should fail if challenger is not active player', () => {
    const state = createCombatGameState();
    state.activePlayerIndex = 1;

    const result = declareChallenge(state, 'u0-sgt', 'u1-sgt');
    expect(result.valid).toBe(false);
  });
});

// ─── acceptChallenge ────────────────────────────────────────────────────────

describe('acceptChallenge', () => {
  it('should accept a challenge with a valid model', () => {
    const state = createCombatGameState();
    const result = acceptChallenge(state, 'u1-sgt', 'u0-sgt');

    expect(result.accepted).toBe(true);
    expect(result.challengedModelId).toBe('u1-sgt');
  });

  it('should fail if challenged model not found', () => {
    const state = createCombatGameState();
    const result = acceptChallenge(state, 'nonexistent', 'u0-sgt');

    expect(result.accepted).toBe(false);
  });
});

// ─── declineChallenge ───────────────────────────────────────────────────────

describe('declineChallenge', () => {
  it('should apply Disgraced to an eligible model in the declining unit', () => {
    const state = createCombatGameState();
    const result = declineChallenge(state, 'u0-sgt', 'unit-1');

    expect(result.accepted).toBe(false);
    expect(result.disgracedModelId).toBe('u1-sgt');
    expect(result.events.some(e => e.type === 'disgracedApplied')).toBe(true);
    expect(result.events.some(e => e.type === 'challengeDeclined')).toBe(true);
  });

  it('should apply WS and LD modifiers via Disgraced', () => {
    const state = createCombatGameState();
    const result = declineChallenge(state, 'u0-sgt', 'unit-1');

    // Find the disgraced model and check for modifiers
    const disgracedModel = result.state.armies[1].units[0].models.find(
      m => m.id === 'u1-sgt',
    )!;

    const wsModifier = disgracedModel.modifiers.find(
      mod => mod.characteristic === 'WS' && mod.source === 'Disgraced',
    );
    const ldModifier = disgracedModel.modifiers.find(
      mod => mod.characteristic === 'LD' && mod.source === 'Disgraced',
    );

    expect(wsModifier).toBeDefined();
    expect(wsModifier!.operation).toBe('multiply');
    expect(wsModifier!.value).toBe(0.5);
    expect(ldModifier).toBeDefined();
    expect(ldModifier!.operation).toBe('multiply');
    expect(ldModifier!.value).toBe(0.5);
  });

  it('should handle unit not found', () => {
    const state = createCombatGameState();
    const result = declineChallenge(state, 'u0-sgt', 'nonexistent');

    expect(result.accepted).toBe(false);
    expect(result.disgracedModelId).toBeUndefined();
  });
});

// ─── getEligibleAcceptors ───────────────────────────────────────────────────

describe('getEligibleAcceptors', () => {
  it('should return eligible models for accepting', () => {
    const state = createCombatGameState();
    const result = getEligibleAcceptors(state, 'unit-1');

    expect(result).toContain('u1-sgt');
    expect(result).not.toContain('u1-m1');
  });

  it('should return empty for unit not found', () => {
    const state = createCombatGameState();
    const result = getEligibleAcceptors(state, 'nonexistent');

    expect(result).toHaveLength(0);
  });
});
