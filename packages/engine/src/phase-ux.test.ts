import { describe, it, expect } from 'vitest';
import { Allegiance, LegionFaction, Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { ArmyState, GameState, ModelState, UnitState } from '@hh/types';
import { getPhaseUxStatus } from './phase-ux';

function createModel(id: string): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical-squad',
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
    ...overrides,
  };
}

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, [createUnit('u-0')]),
      createArmy(1, [createUnit('u-1')]),
    ],
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
    advancedReactionsUsed: [],
    legionTacticaState: [
      {
        reactionDiscountUsedThisTurn: false,
        movementBonusActiveThisTurn: false,
        perTurnFlags: {},
      },
      {
        reactionDiscountUsedThisTurn: false,
        movementBonusActiveThisTurn: false,
        perTurnFlags: {},
      },
    ],
    missionState: null,
    ...overrides,
  };
}

describe('getPhaseUxStatus', () => {
  it('marks auto sub-phases as safe to advance', () => {
    const state = createGameState({
      currentPhase: Phase.Start,
      currentSubPhase: SubPhase.StartEffects,
    });
    const status = getPhaseUxStatus(state);

    expect(status.mode).toBe('auto');
    expect(status.state).toBe('auto');
    expect(status.canAutoAdvance).toBe(true);
    expect(status.tacticalActions).toEqual([]);
  });

  it('marks Movement/Move as decision when movable units exist', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const status = getPhaseUxStatus(state);

    expect(status.mode).toBe('decision');
    expect(status.state).toBe('decision');
    expect(status.canAutoAdvance).toBe(false);
    expect(status.tacticalActions).toContain('moveModel');
  });

  it('auto-advances Movement/Move when no move/rush/embark/disembark actions exist', () => {
    const inactiveUnit = createUnit('u-0', {
      isDeployed: false,
      movementState: UnitMovementState.Moved,
    });
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        createArmy(0, [inactiveUnit]),
        createArmy(1, [createUnit('u-1')]),
      ],
    });
    const status = getPhaseUxStatus(state);

    expect(status.state).toBe('auto');
    expect(status.canAutoAdvance).toBe(true);
    expect(status.tacticalActions).toEqual([]);
  });

  it('marks Reserves as decision only when active player has reserve units', () => {
    const reserveUnit = createUnit('u-0', {
      isInReserves: true,
      isDeployed: false,
    });
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Reserves,
      armies: [
        createArmy(0, [reserveUnit]),
        createArmy(1, [createUnit('u-1')]),
      ],
    });
    const status = getPhaseUxStatus(state);

    expect(status.mode).toBe('conditional');
    expect(status.state).toBe('decision');
    expect(status.tacticalActions).toContain('reservesTest');
  });

  it('auto-advances Shooting/Attack when no unit can shoot', () => {
    const rushedUnit = createUnit('u-0', {
      movementState: UnitMovementState.Rushed,
    });
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
      armies: [
        createArmy(0, [rushedUnit]),
        createArmy(1, [createUnit('u-1')]),
      ],
    });
    const status = getPhaseUxStatus(state);

    expect(status.state).toBe('auto');
    expect(status.canAutoAdvance).toBe(true);
  });

  it('blocks automation when awaiting reaction', () => {
    const state = createGameState({
      awaitingReaction: true,
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const status = getPhaseUxStatus(state);

    expect(status.state).toBe('blocked');
    expect(status.blocker).toBe('reactionPending');
    expect(status.canAutoAdvance).toBe(false);
    expect(status.tacticalActions).toContain('selectReaction');
  });

  it('marks conditional assault sub-phases as auto when no unresolved combats exist', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Fight,
      activeCombats: [],
    });
    const status = getPhaseUxStatus(state);

    expect(status.mode).toBe('conditional');
    expect(status.state).toBe('auto');
    expect(status.canAutoAdvance).toBe(true);
  });
});
