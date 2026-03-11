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
    unitProfileId: 'tactical-squad',
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
    profileId: 'tactical-squad',
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
  // Two units locked in combat, each with a real Champion profile entry.
  const army0Units = [
    createUnit('unit-0', {
      profileId: 'praetorian-command-squad',
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
      models: [
        createModel('u0-champion', 10, 10, {
          profileModelName: 'Chosen Champion',
          unitProfileId: 'praetorian-command-squad',
        }),
        createModel('u0-chosen', 10, 12, {
          profileModelName: 'Chosen',
          unitProfileId: 'praetorian-command-squad',
        }),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-1', {
      profileId: 'praetorian-command-squad',
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
      models: [
        createModel('u1-champion', 11, 10, {
          profileModelName: 'Chosen Champion',
          unitProfileId: 'praetorian-command-squad',
        }),
        createModel('u1-chosen', 11, 12, {
          profileModelName: 'Chosen',
          unitProfileId: 'praetorian-command-squad',
        }),
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
  it('should find champion subtype as eligible challenger', () => {
    const state = createCombatGameState();
    const result = getEligibleChallengers(state, 'unit-0');

    expect(result.hasEligibleChallengers).toBe(true);
    expect(result.eligibleChallengerIds).toContain('u0-champion');
  });

  it('should not include regular models', () => {
    const state = createCombatGameState();
    const result = getEligibleChallengers(state, 'unit-0');

    expect(result.eligibleChallengerIds).not.toContain('u0-chosen');
  });

  it('should find Paragon warlord as eligible challenger', () => {
    const state = createCombatGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      profileId: 'alpharius',
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
      models: [createModel('u0-warlord', 10, 10, {
        profileModelName: 'Alpharius',
        unitProfileId: 'alpharius',
        isWarlord: true,
      })],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      profileId: 'legion-champion',
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
      models: [createModel('u1-champion', 11, 10, {
        profileModelName: 'Legion Champion',
        unitProfileId: 'legion-champion',
      })],
    });

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(true);
    expect(result.eligibleChallengerIds).toContain('u0-warlord');
  });

  it('should not treat Sergeant subtype alone as challenge-eligible', () => {
    const state = createCombatGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      profileId: 'tactical-squad',
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
      models: [createModel('u0-sergeant', 10, 10, {
        profileModelName: 'Sergeant',
        unitProfileId: 'tactical-squad',
        isWarlord: true,
      })],
    });

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(false);
  });

  it('should return empty if unit is not locked in combat', () => {
    const state = createCombatGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      isLockedInCombat: false,
      models: [
        createModel('u0-champion', 10, 10, {
          profileModelName: 'Chosen Champion',
          unitProfileId: 'praetorian-command-squad',
        }),
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
      createModel('u0-champion', 10, 10, {
        profileModelName: 'Chosen Champion',
        unitProfileId: 'praetorian-command-squad',
        isDestroyed: true,
        currentWounds: 0,
      }),
    ];

    const result = getEligibleChallengers(state, 'unit-0');
    expect(result.hasEligibleChallengers).toBe(false);
  });
});

// ─── declareChallenge ───────────────────────────────────────────────────────

describe('declareChallenge', () => {
  it('should successfully declare a challenge between eligible models', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'u0-champion', 'u1-champion');

    expect(result.valid).toBe(true);
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('challengeDeclared');
  });

  it('should fail if challenger model not found', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'nonexistent', 'u1-champion');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should fail if target model not found', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'u0-champion', 'nonexistent');

    expect(result.valid).toBe(false);
  });

  it('should fail if challenger is not eligible', () => {
    const state = createCombatGameState();
    const result = declareChallenge(state, 'u0-chosen', 'u1-champion');

    expect(result.valid).toBe(false);
  });

  it('should fail if units are not engaged', () => {
    const state = createCombatGameState();
    // Remove engagement
    state.armies[0].units[0].engagedWithUnitIds = [];

    const result = declareChallenge(state, 'u0-champion', 'u1-champion');
    expect(result.valid).toBe(false);
  });

  it('should fail if challenger is not active player', () => {
    const state = createCombatGameState();
    state.activePlayerIndex = 1;

    const result = declareChallenge(state, 'u0-champion', 'u1-champion');
    expect(result.valid).toBe(false);
  });
});

// ─── acceptChallenge ────────────────────────────────────────────────────────

describe('acceptChallenge', () => {
  it('should accept a challenge with a valid model', () => {
    const state = createCombatGameState();
    const declared = declareChallenge(state, 'u0-champion', 'u1-champion');
    const result = acceptChallenge(declared.state, 'u1-champion', 'u0-champion');

    expect(result.accepted).toBe(true);
    expect(result.challengedModelId).toBe('u1-champion');
  });

  it('should fail if challenged model not found', () => {
    const state = createCombatGameState();
    const declared = declareChallenge(state, 'u0-champion', 'u1-champion');
    const result = acceptChallenge(declared.state, 'nonexistent', 'u0-champion');

    expect(result.accepted).toBe(false);
  });
});

// ─── declineChallenge ───────────────────────────────────────────────────────

describe('declineChallenge', () => {
  it('should apply Disgraced to an eligible model in the declining unit', () => {
    const state = createCombatGameState();
    const declared = declareChallenge(state, 'u0-champion', 'u1-champion');
    const result = declineChallenge(declared.state, 'u0-champion', 'unit-1');

    expect(result.accepted).toBe(false);
    expect(result.disgracedModelId).toBe('u1-champion');
    expect(result.events.some(e => e.type === 'disgracedApplied')).toBe(true);
    expect(result.events.some(e => e.type === 'challengeDeclined')).toBe(true);
  });

  it('should apply WS and LD modifiers via Disgraced', () => {
    const state = createCombatGameState();
    const declared = declareChallenge(state, 'u0-champion', 'u1-champion');
    const result = declineChallenge(declared.state, 'u0-champion', 'unit-1');

    // Find the disgraced model and check for modifiers
    const disgracedModel = result.state.armies[1].units[0].models.find(
      m => m.id === 'u1-champion',
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
    const declared = declareChallenge(state, 'u0-champion', 'u1-champion');
    const result = declineChallenge(declared.state, 'u0-champion', 'nonexistent');

    expect(result.accepted).toBe(false);
    expect(result.disgracedModelId).toBeUndefined();
  });
});

// ─── getEligibleAcceptors ───────────────────────────────────────────────────

describe('getEligibleAcceptors', () => {
  it('should return eligible models for accepting', () => {
    const state = createCombatGameState();
    const result = getEligibleAcceptors(state, 'unit-1');

    expect(result).toContain('u1-champion');
    expect(result).not.toContain('u1-chosen');
  });

  it('should return empty for unit not found', () => {
    const state = createCombatGameState();
    const result = getEligibleAcceptors(state, 'nonexistent');

    expect(result).toHaveLength(0);
  });
});
