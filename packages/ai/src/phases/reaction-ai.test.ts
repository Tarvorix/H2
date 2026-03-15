/**
 * Reaction AI Tests
 *
 * Tests for AI reaction decision-making.
 */

import { describe, it, expect } from 'vitest';
import { CoreReaction, Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, ArmyState, ModelState, UnitState } from '@hh/types';
import { generateReactionCommand } from './reaction-ai';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

function createModel(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ModelState> = {},
): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['bolter', 'bolt-pistol', 'frag-grenades', 'krak-grenades'],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(
  id: string,
  models: ModelState[],
  overrides: Partial<UnitState> = {},
): UnitState {
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
        units: [createUnit('unit-1', [createModel('unit-1-m0', 20, 12)])],
        reactionAllotmentRemaining: 2,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateReactionCommand', () => {
  it('returns null when not awaiting reaction', () => {
    const state = createGameState({ awaitingReaction: false });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).toBeNull();
  });

  it('returns null when no pending reaction', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: undefined as any,
    });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).toBeNull();
  });

  it('returns declineReaction when no eligible units', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: [],
      } as any,
    });
    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('returns declineReaction when AI is not the reactive player', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    // Player 0 is active, player 1 is reactive, but we pass playerIndex=0
    const result = generateReactionCommand(state, 0, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('returns declineReaction when no reaction allotment remaining', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 0;

    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('declineReaction');
  });

  it('basic strategy accepts a valid pending reaction', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 2;

    const result = generateReactionCommand(state, 1, 'basic');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy accepts ReturnFire with sufficient allotment', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy still accepts when allotment is low but legal', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 1;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('ReturnFire');
  });

  it('tactical strategy accepts Overwatch reactions', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Overwatch',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('Overwatch');
  });

  it('tactical strategy accepts Reposition reactions', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Reposition',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });
    state.armies[1].reactionAllotmentRemaining = 3;

    const result = generateReactionCommand(state, 1, 'tactical');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('selectReaction');
    expect((result as any).reactionType).toBe('Reposition');
  });

  it('includes stable model positions for move-based reactions', () => {
    const reactingUnit = createUnit('unit-1', [createModel('unit-1-m0', 20, 12)]);
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      armies: [
        createArmy({ playerIndex: 0, units: [] }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: 'Sons of Horus' as ArmyState['faction'],
          allegiance: 'Traitor' as ArmyState['allegiance'],
          units: [reactingUnit],
          reactionAllotmentRemaining: 2,
        }),
      ],
      pendingReaction: {
        reactionType: CoreReaction.Reposition,
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });

    const result = generateReactionCommand(state, 1, 'basic');

    expect(result).toEqual({
      type: 'selectReaction',
      unitId: 'unit-1',
      reactionType: CoreReaction.Reposition,
      modelPositions: [{ modelId: 'unit-1-m0', position: { x: 20, y: 12 } }],
    });
  });

  it('selects a model and weapon for Death or Glory', () => {
    const reactingUnit = createUnit('unit-1', [
      createModel('unit-1-m0', 20, 12, {
        equippedWargear: ['melta-bombs', 'bolt-pistol'],
      }),
    ]);
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      armies: [
        createArmy({ playerIndex: 0, units: [] }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: 'Sons of Horus' as ArmyState['faction'],
          allegiance: 'Traitor' as ArmyState['allegiance'],
          units: [reactingUnit],
          reactionAllotmentRemaining: 2,
        }),
      ],
      pendingReaction: {
        reactionType: 'death-or-glory',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['unit-1'],
      } as any,
    });

    const result = generateReactionCommand(state, 1, 'tactical');

    expect(result).toMatchObject({
      type: 'selectReaction',
      unitId: 'unit-1',
      reactionType: 'death-or-glory',
      reactingModelId: 'unit-1-m0',
      weaponId: 'melta-bombs',
    });
  });

  it('builds legal edge placements for Combat Air Patrol flyers', () => {
    const flyerUnit = createUnit(
      'flyer-unit',
      [
        createModel('flyer-m0', 0, 0, {
          profileModelName: 'Xiphon',
          unitProfileId: 'xiphon-interceptor',
          currentWounds: 5,
          equippedWargear: ['two-centreline-mounted-twin-lascannon', 'centreline-mounted-rotary-missile-launcher'],
        }),
      ],
      {
        profileId: 'xiphon-interceptor',
        isInReserves: true,
        isDeployed: false,
        reserveType: 'aerial',
      },
    );
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      armies: [
        createArmy({ playerIndex: 0, units: [] }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: 'Sons of Horus' as ArmyState['faction'],
          allegiance: 'Traitor' as ArmyState['allegiance'],
          units: [flyerUnit],
          reactionAllotmentRemaining: 2,
        }),
      ],
      pendingReaction: {
        reactionType: 'combat-air-patrol',
        triggeringUnitId: 'trigger-1',
        eligibleUnitIds: ['flyer-unit'],
      } as any,
    });

    const result = generateReactionCommand(state, 1, 'basic');

    expect(result).toMatchObject({
      type: 'selectReaction',
      unitId: 'flyer-unit',
      reactionType: 'combat-air-patrol',
      modelPositions: [{ modelId: 'flyer-m0', position: { x: 36, y: 47.5 } }],
    });
  });
});
