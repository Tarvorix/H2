/**
 * Reposition Reaction Handler Tests
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState, TacticalStatus, Allegiance, LegionFaction, TerrainType } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, TerrainPiece } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import {
  checkRepositionTrigger,
  handleRepositionReaction,
} from './reposition-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x: number, y: number): ModelState {
  return {
    id, profileModelName: 'Legionary', unitProfileId: 'tactical',
    position: { x, y }, currentWounds: 1, isDestroyed: false,
    modifiers: [], equippedWargear: [], isWarlord: false,
  };
}

function createUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id, profileId: 'tactical', models, statuses: [],
    hasReactedThisTurn: false, movementState: UnitMovementState.Stationary,
    isLockedInCombat: false, embarkedOnId: null,
    isInReserves: false, isDeployed: true, engagedWithUnitIds: [], modifiers: [],
    ...overrides,
  };
}

function createArmy(playerIndex: number, units: UnitState[], overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${playerIndex}`, playerIndex, playerName: `P${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus, allegiance: Allegiance.Traitor,
    units, totalPoints: 1000, pointsLimit: 2000,
    reactionAllotmentRemaining: 1, baseReactionAllotment: 1, victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test', battlefield: { width: 72, height: 48 }, terrain: [],
    armies: [createArmy(0, []), createArmy(1, [])],
    currentBattleTurn: 1, maxBattleTurns: 4,
    activePlayerIndex: 0, firstPlayerIndex: 0,
    currentPhase: Phase.Movement, currentSubPhase: SubPhase.Move,
    awaitingReaction: false, isGameOver: false, winnerPlayerIndex: null,
    log: [], turnHistory: [],
    ...overrides,
  };
}

// ─── checkRepositionTrigger Tests ────────────────────────────────────────────

describe('checkRepositionTrigger', () => {
  it('should trigger when reactive unit is within 12" and has LOS', () => {
    // Active player's unit at (30, 24), reactive player's unit at (36, 24) = 6" apart
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(true);
    expect(result.eligibleUnitIds).toContain('reactive-u1');
  });

  it('should not trigger when reactive unit is beyond 12"', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 10, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 24, 24)]); // 14" away

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
    expect(result.eligibleUnitIds).toHaveLength(0);
  });

  it('should not trigger when reactive army has no allotments', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit], { reactionAllotmentRemaining: 0 }),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger for units that already reacted', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      hasReactedThisTurn: true,
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger for stunned units', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      statuses: [TacticalStatus.Stunned],
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger for routed units', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      statuses: [TacticalStatus.Routed],
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger for units locked in combat', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      isLockedInCombat: true,
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger for embarked units', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      embarkedOnId: 'transport-1',
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should not trigger when LOS is blocked by heavy terrain', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    // Place heavy terrain directly between the two units
    const terrain: TerrainPiece[] = [{
      id: 'wall',
      name: 'Wall',
      type: TerrainType.HeavyArea,
      isDifficult: false,
      isDangerous: false,
      shape: {
        kind: 'rectangle' as const,
        topLeft: { x: 32, y: 19 },
        width: 2,
        height: 10,
      },
    }];

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
      terrain,
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(false);
  });

  it('should return multiple eligible units when applicable', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit1 = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);
    const reactiveUnit2 = createUnit('reactive-u2', [createModel('r-m1', 34, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit1, reactiveUnit2]),
      ],
    });

    const result = checkRepositionTrigger(state, 'active-u1');

    expect(result.triggered).toBe(true);
    expect(result.eligibleUnitIds).toHaveLength(2);
    expect(result.eligibleUnitIds).toContain('reactive-u1');
    expect(result.eligibleUnitIds).toContain('reactive-u2');
  });

  it('should not trigger for nonexistent trigger unit', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, []),
        createArmy(1, [createUnit('r-u1', [createModel('r-m0', 36, 24)])]),
      ],
    });

    const result = checkRepositionTrigger(state, 'nonexistent');

    expect(result.triggered).toBe(false);
  });
});

// ─── handleRepositionReaction Tests ──────────────────────────────────────────

describe('handleRepositionReaction', () => {
  it('should move reactive unit models within Initiative range', () => {
    // Active player at (30, 24), reactive player unit at (36, 24)
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [
      createModel('r-m0', 36, 24),
      createModel('r-m1', 39, 24),
    ]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const dice = new FixedDiceProvider([]);
    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } }, // 2" move
      { modelId: 'r-m1', position: { x: 41, y: 24 } }, // 2" move
    ], dice);

    expect(result.accepted).toBe(true);

    const movedUnit = result.state.armies[1].units[0];
    expect(movedUnit.models[0].position).toEqual({ x: 38, y: 24 });
    expect(movedUnit.models[1].position).toEqual({ x: 41, y: 24 });
  });

  it('should reduce available reposition distance when ending in difficult terrain', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);
    const terrain: TerrainPiece[] = [{
      id: 'mud',
      name: 'Mud',
      type: TerrainType.Difficult,
      isDifficult: true,
      isDangerous: false,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 38, y: 22 },
        width: 4,
        height: 4,
      },
    }];

    const state = createGameState({
      activePlayerIndex: 0,
      terrain,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 40, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'EXCEEDS_INITIATIVE')).toBe(true);
  });

  it('should resolve dangerous terrain tests during reposition moves', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);
    const terrain: TerrainPiece[] = [{
      id: 'minefield',
      name: 'Minefield',
      type: TerrainType.Dangerous,
      isDifficult: true,
      isDangerous: true,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 37, y: 22 },
        width: 3,
        height: 4,
      },
    }];

    const state = createGameState({
      activePlayerIndex: 0,
      terrain,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([1]));

    expect(result.accepted).toBe(true);
    expect(result.events.some(e => e.type === 'dangerousTerrainTest')).toBe(true);
    expect(result.events.some(e => e.type === 'damageApplied')).toBe(true);
    expect(result.state.armies[1].units[0].models[0].isDestroyed).toBe(true);
  });

  it('should mark unit as having reacted', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    const movedUnit = result.state.armies[1].units[0];
    expect(movedUnit.hasReactedThisTurn).toBe(true);
    expect(movedUnit.movementState).toBe(UnitMovementState.Moved);
  });

  it('should deduct reaction allotment', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit], { reactionAllotmentRemaining: 2 }),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    expect(result.state.armies[1].reactionAllotmentRemaining).toBe(1);
  });

  it('should reject when model exceeds Initiative range', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    // Try to move 5" (exceeds I4)
    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 41, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'EXCEEDS_INITIATIVE')).toBe(true);
  });

  it('should reject when active player tries to react', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit, reactiveUnit]),
        createArmy(1, []),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_REACTIVE_PLAYER');
  });

  it('should reject when unit has already reacted', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)], {
      hasReactedThisTurn: true,
    });

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_CANNOT_REACT');
  });

  it('should reject when no reaction allotment remaining', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit], { reactionAllotmentRemaining: 0 }),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NO_REACTION_ALLOTMENT');
  });

  it('should reject when model would end out of bounds', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 71, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 74, y: 24 } }, // 3" move, goes off 72" board
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'OUT_OF_BOUNDS')).toBe(true);
  });

  it('should reject when coherency would be broken', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [
      createModel('r-m0', 36, 24),
      createModel('r-m1', 37, 24),
    ]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    // Move one model 4" away from the other (which stays), breaking coherency
    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 36, y: 20 } }, // 4" down, leaving r-m1 at (37,24)
    ], new FixedDiceProvider([]));

    // 5" center-to-center with 32mm (~0.63" radius) bases:
    // edge-to-edge = sqrt((36-37)^2 + (20-24)^2) - 2*0.63 = sqrt(17) - 1.26 = 4.12-1.26 = 2.87" > 2"
    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'COHERENCY_BROKEN')).toBe(true);
  });

  it('should emit repositionExecuted event', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 38, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    expect(result.events.some(e => e.type === 'repositionExecuted')).toBe(true);

    const event = result.events.find(e => e.type === 'repositionExecuted') as any;
    expect(event.reactingUnitId).toBe('reactive-u1');
    expect(event.modelMoves).toHaveLength(1);
    expect(event.modelMoves[0].from).toEqual({ x: 36, y: 24 });
    expect(event.modelMoves[0].to).toEqual({ x: 38, y: 24 });
  });

  it('should reject for nonexistent unit', () => {
    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, []),
        createArmy(1, []),
      ],
    });

    const result = handleRepositionReaction(state, 'nonexistent', [], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('UNIT_NOT_FOUND');
  });

  it('should allow model to stay in place (0" move)', () => {
    const activeUnit = createUnit('active-u1', [createModel('a-m0', 30, 24)]);
    const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

    const state = createGameState({
      activePlayerIndex: 0,
      armies: [
        createArmy(0, [activeUnit]),
        createArmy(1, [reactiveUnit]),
      ],
    });

    // Move 0" (stay in place)
    const result = handleRepositionReaction(state, 'reactive-u1', [
      { modelId: 'r-m0', position: { x: 36, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
  });
});
