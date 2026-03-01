/**
 * State Helpers Tests
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
  updateActiveArmy,
  updateReactiveArmy,
  updateArmyByIndex,
  updateUnit,
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setPhaseState,
  addStatus,
  removeStatus,
  hasStatus,
  setMovementState,
  setAwaitingReaction,
  addLogEntry,
  embarkUnit,
  disembarkUnit,
  setInReserves,
  setDeployed,
  setGameOver,
} from './state-helpers';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createTestModel(id: string, x = 0, y = 0): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['bolter'],
    isWarlord: false,
  };
}

function createTestUnit(id: string, modelCount = 2): UnitState {
  const models: ModelState[] = [];
  for (let i = 0; i < modelCount; i++) {
    models.push(createTestModel(`${id}-m${i}`, i * 2, 0));
  }
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
  };
}

function createTestArmy(playerIndex: number, unitIds: string[] = ['u1']): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units: unitIds.map(id => createTestUnit(id)),
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createTestGameState(): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createTestArmy(0, ['u1', 'u2']), createTestArmy(1, ['u3', 'u4'])],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    awaitingReaction: false,
    pendingReaction: undefined,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('updateActiveArmy', () => {
  it('should update the active player army', () => {
    const state = createTestGameState();
    const result = updateActiveArmy(state, army => ({
      ...army,
      victoryPoints: 5,
    }));
    expect(result.armies[0].victoryPoints).toBe(5);
    expect(result.armies[1].victoryPoints).toBe(0);
  });

  it('should not mutate the original state', () => {
    const state = createTestGameState();
    const result = updateActiveArmy(state, army => ({
      ...army,
      victoryPoints: 5,
    }));
    expect(state.armies[0].victoryPoints).toBe(0);
    expect(result).not.toBe(state);
  });
});

describe('updateReactiveArmy', () => {
  it('should update the non-active player army', () => {
    const state = createTestGameState();
    const result = updateReactiveArmy(state, army => ({
      ...army,
      victoryPoints: 3,
    }));
    expect(result.armies[0].victoryPoints).toBe(0);
    expect(result.armies[1].victoryPoints).toBe(3);
  });
});

describe('updateArmyByIndex', () => {
  it('should update army at the specified index', () => {
    const state = createTestGameState();
    const result = updateArmyByIndex(state, 1, army => ({
      ...army,
      reactionAllotmentRemaining: 0,
    }));
    expect(result.armies[1].reactionAllotmentRemaining).toBe(0);
    expect(result.armies[0].reactionAllotmentRemaining).toBe(1);
  });
});

describe('updateUnit', () => {
  it('should update the specified unit in an army', () => {
    const army = createTestArmy(0, ['u1', 'u2']);
    const result = updateUnit(army, 'u1', unit => ({
      ...unit,
      movementState: UnitMovementState.Moved,
    }));
    expect(result.units[0].movementState).toBe(UnitMovementState.Moved);
    expect(result.units[1].movementState).toBe(UnitMovementState.Stationary);
  });

  it('should not mutate the original army', () => {
    const army = createTestArmy(0, ['u1']);
    updateUnit(army, 'u1', unit => ({
      ...unit,
      movementState: UnitMovementState.Moved,
    }));
    expect(army.units[0].movementState).toBe(UnitMovementState.Stationary);
  });
});

describe('updateUnitInGameState', () => {
  it('should find and update unit in active army', () => {
    const state = createTestGameState();
    const result = updateUnitInGameState(state, 'u1', unit => ({
      ...unit,
      movementState: UnitMovementState.Rushed,
    }));
    expect(result.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
  });

  it('should find and update unit in reactive army', () => {
    const state = createTestGameState();
    const result = updateUnitInGameState(state, 'u3', unit => ({
      ...unit,
      hasReactedThisTurn: true,
    }));
    expect(result.armies[1].units[0].hasReactedThisTurn).toBe(true);
  });

  it('should return unchanged state if unit not found', () => {
    const state = createTestGameState();
    const result = updateUnitInGameState(state, 'nonexistent', unit => ({
      ...unit,
      movementState: UnitMovementState.Moved,
    }));
    expect(result).toBe(state);
  });
});

describe('updateModelInUnit', () => {
  it('should update the specified model', () => {
    const unit = createTestUnit('u1', 3);
    const result = updateModelInUnit(unit, 'u1-m1', model => ({
      ...model,
      currentWounds: 0,
      isDestroyed: true,
    }));
    expect(result.models[1].currentWounds).toBe(0);
    expect(result.models[1].isDestroyed).toBe(true);
    expect(result.models[0].currentWounds).toBe(1);
  });
});

describe('moveModel', () => {
  it('should update model position', () => {
    const model = createTestModel('m1', 5, 10);
    const result = moveModel(model, { x: 12, y: 15 });
    expect(result.position).toEqual({ x: 12, y: 15 });
    expect(model.position).toEqual({ x: 5, y: 10 }); // original unchanged
  });
});

describe('setPhaseState', () => {
  it('should set both phase and sub-phase', () => {
    const state = createTestGameState();
    const result = setPhaseState(state, Phase.Shooting, SubPhase.Attack);
    expect(result.currentPhase).toBe(Phase.Shooting);
    expect(result.currentSubPhase).toBe(SubPhase.Attack);
  });
});

describe('status helpers', () => {
  it('addStatus should add a status', () => {
    const unit = createTestUnit('u1');
    const result = addStatus(unit, TacticalStatus.Pinned);
    expect(result.statuses).toContain(TacticalStatus.Pinned);
  });

  it('addStatus should not add duplicate', () => {
    let unit = createTestUnit('u1');
    unit = addStatus(unit, TacticalStatus.Pinned);
    const result = addStatus(unit, TacticalStatus.Pinned);
    expect(result.statuses.filter(s => s === TacticalStatus.Pinned)).toHaveLength(1);
  });

  it('removeStatus should remove a status', () => {
    let unit = createTestUnit('u1');
    unit = addStatus(unit, TacticalStatus.Pinned);
    unit = addStatus(unit, TacticalStatus.Suppressed);
    const result = removeStatus(unit, TacticalStatus.Pinned);
    expect(result.statuses).not.toContain(TacticalStatus.Pinned);
    expect(result.statuses).toContain(TacticalStatus.Suppressed);
  });

  it('hasStatus should correctly check', () => {
    const unit = addStatus(createTestUnit('u1'), TacticalStatus.Routed);
    expect(hasStatus(unit, TacticalStatus.Routed)).toBe(true);
    expect(hasStatus(unit, TacticalStatus.Pinned)).toBe(false);
  });
});

describe('setMovementState', () => {
  it('should set movement state', () => {
    const unit = createTestUnit('u1');
    const result = setMovementState(unit, UnitMovementState.Rushed);
    expect(result.movementState).toBe(UnitMovementState.Rushed);
  });
});

describe('setAwaitingReaction', () => {
  it('should set awaiting reaction', () => {
    const state = createTestGameState();
    const pending = {
      reactionType: 'Reposition' as any,
      eligibleUnitIds: ['u3'],
      triggerDescription: 'Enemy moved within 12"',
      triggerSourceUnitId: 'u1',
    };
    const result = setAwaitingReaction(state, true, pending);
    expect(result.awaitingReaction).toBe(true);
    expect(result.pendingReaction).toEqual(pending);
  });

  it('should clear pending reaction when set to false', () => {
    const state = { ...createTestGameState(), awaitingReaction: true };
    const result = setAwaitingReaction(state, false);
    expect(result.awaitingReaction).toBe(false);
    expect(result.pendingReaction).toBeUndefined();
  });
});

describe('addLogEntry', () => {
  it('should append entry to log', () => {
    const state = createTestGameState();
    const entry = {
      id: 'roll-1',
      timestamp: Date.now(),
      type: 'reservesTest' as const,
      dice: [{ value: 4, wasRerolled: false }],
      targetNumber: 3,
      successes: 1,
      failures: 0,
      description: 'Reserves test passed',
    };
    const result = addLogEntry(state, entry);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]).toEqual(entry);
    expect(state.log).toHaveLength(0);
  });
});

describe('embark/disembark helpers', () => {
  it('embarkUnit should set embarked state', () => {
    const unit = createTestUnit('u1');
    const result = embarkUnit(unit, 'transport-1');
    expect(result.embarkedOnId).toBe('transport-1');
    expect(result.isDeployed).toBe(false);
  });

  it('disembarkUnit should clear embarked state', () => {
    let unit = createTestUnit('u1');
    unit = embarkUnit(unit, 'transport-1');
    const result = disembarkUnit(unit);
    expect(result.embarkedOnId).toBeNull();
    expect(result.isDeployed).toBe(true);
  });
});

describe('reserves helpers', () => {
  it('setInReserves should update flag', () => {
    const unit = createTestUnit('u1');
    const result = setInReserves(unit, true);
    expect(result.isInReserves).toBe(true);
  });

  it('setDeployed should update flag', () => {
    const unit = createTestUnit('u1');
    const result = setDeployed(unit, false);
    expect(result.isDeployed).toBe(false);
  });
});

describe('setGameOver', () => {
  it('should mark game as over with winner', () => {
    const state = createTestGameState();
    const result = setGameOver(state, 0);
    expect(result.isGameOver).toBe(true);
    expect(result.winnerPlayerIndex).toBe(0);
  });

  it('should mark game as over with draw', () => {
    const state = createTestGameState();
    const result = setGameOver(state, null);
    expect(result.isGameOver).toBe(true);
    expect(result.winnerPlayerIndex).toBeNull();
  });
});
