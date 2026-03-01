/**
 * Game Queries Tests
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
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  getActiveArmy,
  getReactiveArmy,
  getReactivePlayerIndex,
  findUnit,
  findUnitArmy,
  findUnitPlayerIndex,
  findModel,
  findModelUnitId,
  canUnitMove,
  canUnitRush,
  canUnitReact,
  hasReactionAllotment,
  getAliveModels,
  isUnitDestroyed,
  getUnitsWithStatus,
  getUnitsInReserves,
  getDeployedUnits,
  getEnemyModelShapes,
  getUnitModelShapes,
  getRoutedUnits,
  isMovementPhase,
  isSubPhase,
} from './game-queries';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x = 0, y = 0, destroyed = false): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x, y },
    currentWounds: destroyed ? 0 : 1,
    isDestroyed: destroyed,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
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

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, [createUnit('u1'), createUnit('u2')]),
      createArmy(1, [createUnit('u3'), createUnit('u4')]),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getActiveArmy / getReactiveArmy', () => {
  it('should return the correct active army', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    expect(getActiveArmy(state).id).toBe('army-0');
    expect(getReactiveArmy(state).id).toBe('army-1');
  });

  it('should return player 1 as active when index is 1', () => {
    const state = createGameState({ activePlayerIndex: 1 });
    expect(getActiveArmy(state).id).toBe('army-1');
    expect(getReactiveArmy(state).id).toBe('army-0');
  });

  it('getReactivePlayerIndex should return opposite', () => {
    expect(getReactivePlayerIndex(createGameState({ activePlayerIndex: 0 }))).toBe(1);
    expect(getReactivePlayerIndex(createGameState({ activePlayerIndex: 1 }))).toBe(0);
  });
});

describe('findUnit', () => {
  it('should find a unit in army 0', () => {
    const state = createGameState();
    expect(findUnit(state, 'u1')?.id).toBe('u1');
  });

  it('should find a unit in army 1', () => {
    const state = createGameState();
    expect(findUnit(state, 'u3')?.id).toBe('u3');
  });

  it('should return undefined for nonexistent unit', () => {
    const state = createGameState();
    expect(findUnit(state, 'nonexistent')).toBeUndefined();
  });
});

describe('findUnitArmy', () => {
  it('should find the army containing the unit', () => {
    const state = createGameState();
    expect(findUnitArmy(state, 'u1')?.id).toBe('army-0');
    expect(findUnitArmy(state, 'u3')?.id).toBe('army-1');
  });
});

describe('findUnitPlayerIndex', () => {
  it('should return player index for unit', () => {
    const state = createGameState();
    expect(findUnitPlayerIndex(state, 'u1')).toBe(0);
    expect(findUnitPlayerIndex(state, 'u4')).toBe(1);
    expect(findUnitPlayerIndex(state, 'nope')).toBeUndefined();
  });
});

describe('findModel', () => {
  it('should find a model and return context', () => {
    const state = createGameState();
    const result = findModel(state, 'u1-m0');
    expect(result).toBeDefined();
    expect(result!.model.id).toBe('u1-m0');
    expect(result!.unit.id).toBe('u1');
    expect(result!.army.id).toBe('army-0');
  });

  it('should return undefined for nonexistent model', () => {
    const state = createGameState();
    expect(findModel(state, 'fake-model')).toBeUndefined();
  });
});

describe('findModelUnitId', () => {
  it('should find the unit ID for a model', () => {
    const state = createGameState();
    expect(findModelUnitId(state, 'u3-m0')).toBe('u3');
  });
});

describe('canUnitMove', () => {
  it('should allow a normal deployed unit to move', () => {
    expect(canUnitMove(createUnit('u1'))).toBe(true);
  });

  it('should block pinned unit', () => {
    expect(canUnitMove(createUnit('u1', { statuses: [TacticalStatus.Pinned] }))).toBe(false);
  });

  it('should block locked in combat unit', () => {
    expect(canUnitMove(createUnit('u1', { isLockedInCombat: true }))).toBe(false);
  });

  it('should block unit that entered from reserves', () => {
    expect(canUnitMove(createUnit('u1', { movementState: UnitMovementState.EnteredFromReserves }))).toBe(false);
  });

  it('should block undeployed unit', () => {
    expect(canUnitMove(createUnit('u1', { isDeployed: false }))).toBe(false);
  });

  it('should block embarked unit', () => {
    expect(canUnitMove(createUnit('u1', { embarkedOnId: 'transport-1' }))).toBe(false);
  });
});

describe('canUnitRush', () => {
  it('should allow stationary unit to rush', () => {
    expect(canUnitRush(createUnit('u1'))).toBe(true);
  });

  it('should block already-moved unit from rushing', () => {
    expect(canUnitRush(createUnit('u1', { movementState: UnitMovementState.Moved }))).toBe(false);
  });

  it('should block pinned unit from rushing', () => {
    expect(canUnitRush(createUnit('u1', { statuses: [TacticalStatus.Pinned] }))).toBe(false);
  });
});

describe('canUnitReact', () => {
  it('should allow eligible unit to react', () => {
    expect(canUnitReact(createUnit('u1'))).toBe(true);
  });

  it('should block unit that already reacted', () => {
    expect(canUnitReact(createUnit('u1', { hasReactedThisTurn: true }))).toBe(false);
  });

  it('should block stunned unit', () => {
    expect(canUnitReact(createUnit('u1', { statuses: [TacticalStatus.Stunned] }))).toBe(false);
  });

  it('should block routed unit', () => {
    expect(canUnitReact(createUnit('u1', { statuses: [TacticalStatus.Routed] }))).toBe(false);
  });

  it('should block unit locked in combat', () => {
    expect(canUnitReact(createUnit('u1', { isLockedInCombat: true }))).toBe(false);
  });

  it('should block undeployed unit', () => {
    expect(canUnitReact(createUnit('u1', { isDeployed: false }))).toBe(false);
  });

  it('should block embarked unit', () => {
    expect(canUnitReact(createUnit('u1', { embarkedOnId: 'rhino-1' }))).toBe(false);
  });
});

describe('hasReactionAllotment', () => {
  it('should return true when allotment > 0', () => {
    const army = createArmy(0, []);
    expect(hasReactionAllotment(army)).toBe(true);
  });

  it('should return false when allotment is 0', () => {
    const army = { ...createArmy(0, []), reactionAllotmentRemaining: 0 };
    expect(hasReactionAllotment(army)).toBe(false);
  });
});

describe('getAliveModels', () => {
  it('should return only alive models', () => {
    const unit = createUnit('u1', {
      models: [createModel('m0'), createModel('m1', 0, 0, true), createModel('m2')],
    });
    const alive = getAliveModels(unit);
    expect(alive).toHaveLength(2);
    expect(alive.map(m => m.id)).toEqual(['m0', 'm2']);
  });
});

describe('isUnitDestroyed', () => {
  it('should return false if any model alive', () => {
    expect(isUnitDestroyed(createUnit('u1'))).toBe(false);
  });

  it('should return true if all models destroyed', () => {
    const unit = createUnit('u1', {
      models: [createModel('m0', 0, 0, true), createModel('m1', 0, 0, true)],
    });
    expect(isUnitDestroyed(unit)).toBe(true);
  });
});

describe('getUnitsWithStatus', () => {
  it('should return units with the specified status', () => {
    const army = createArmy(0, [
      createUnit('u1', { statuses: [TacticalStatus.Routed] }),
      createUnit('u2'),
      createUnit('u3', { statuses: [TacticalStatus.Routed, TacticalStatus.Suppressed] }),
    ]);
    const routed = getUnitsWithStatus(army, TacticalStatus.Routed);
    expect(routed).toHaveLength(2);
    expect(routed.map(u => u.id)).toEqual(['u1', 'u3']);
  });
});

describe('getUnitsInReserves', () => {
  it('should return units in reserves', () => {
    const army = createArmy(0, [
      createUnit('u1'),
      createUnit('u2', { isInReserves: true }),
    ]);
    const reserves = getUnitsInReserves(army);
    expect(reserves).toHaveLength(1);
    expect(reserves[0].id).toBe('u2');
  });
});

describe('getDeployedUnits', () => {
  it('should return deployed alive units', () => {
    const army = createArmy(0, [
      createUnit('u1'),
      createUnit('u2', { isDeployed: false }),
      createUnit('u3', {
        models: [createModel('m0', 0, 0, true), createModel('m1', 0, 0, true)],
      }),
    ]);
    const deployed = getDeployedUnits(army);
    expect(deployed).toHaveLength(1);
    expect(deployed[0].id).toBe('u1');
  });
});

describe('getEnemyModelShapes', () => {
  it('should return enemy model shapes for player 0', () => {
    const state = createGameState();
    const shapes = getEnemyModelShapes(state, 0);
    // Army 1 has 2 units x 2 models = 4 shapes
    expect(shapes).toHaveLength(4);
  });

  it('should exclude destroyed models', () => {
    const state = createGameState();
    state.armies[1].units[0].models[0].isDestroyed = true;
    const shapes = getEnemyModelShapes(state, 0);
    expect(shapes).toHaveLength(3);
  });

  it('should exclude undeployed units', () => {
    const state = createGameState();
    state.armies[1].units[0].isDeployed = false;
    const shapes = getEnemyModelShapes(state, 0);
    expect(shapes).toHaveLength(2);
  });
});

describe('getUnitModelShapes', () => {
  it('should return shapes for alive models', () => {
    const unit = createUnit('u1', {
      models: [createModel('m0', 5, 5), createModel('m1', 7, 5, true), createModel('m2', 9, 5)],
    });
    const shapes = getUnitModelShapes(unit);
    expect(shapes).toHaveLength(2);
  });
});

describe('getRoutedUnits', () => {
  it('should return routed units in active army', () => {
    const state = createGameState();
    state.armies[0].units[0].statuses.push(TacticalStatus.Routed);
    const routed = getRoutedUnits(state);
    expect(routed).toHaveLength(1);
    expect(routed[0].id).toBe('u1');
  });
});

describe('phase queries', () => {
  it('isMovementPhase should check current phase', () => {
    expect(isMovementPhase(createGameState({ currentPhase: Phase.Movement }))).toBe(true);
    expect(isMovementPhase(createGameState({ currentPhase: Phase.Shooting }))).toBe(false);
  });

  it('isSubPhase should check current sub-phase', () => {
    expect(isSubPhase(createGameState({ currentSubPhase: SubPhase.Move }), SubPhase.Move)).toBe(true);
    expect(isSubPhase(createGameState({ currentSubPhase: SubPhase.Reserves }), SubPhase.Move)).toBe(false);
  });
});
