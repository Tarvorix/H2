/**
 * Set-up Move Handler Tests
 * Tests for the Set-up Move mechanic (Step 3 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 3
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, Position } from '@hh/types';
import {
  resolveSetupMove,
  moveToward,
  DEFAULT_INITIATIVE,
  DEFAULT_MOVEMENT,
} from './setup-move-handler';
import { calculateSetupMoveDistance } from './assault-types';

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
  const army0Units = [
    createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 12),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-1', {
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
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
    currentSubPhase: SubPhase.Charge,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── calculateSetupMoveDistance ──────────────────────────────────────────────

describe('calculateSetupMoveDistance', () => {
  it('should return 1" for I+M total of 1-6', () => {
    expect(calculateSetupMoveDistance(1, 1)).toBe(1); // Total 2
    expect(calculateSetupMoveDistance(2, 3)).toBe(1); // Total 5
    expect(calculateSetupMoveDistance(3, 3)).toBe(1); // Total 6
  });

  it('should return 2" for I+M total of 7-9', () => {
    expect(calculateSetupMoveDistance(3, 4)).toBe(2); // Total 7
    expect(calculateSetupMoveDistance(4, 4)).toBe(2); // Total 8
    expect(calculateSetupMoveDistance(4, 5)).toBe(2); // Total 9
  });

  it('should return 3" for I+M total of 10-11', () => {
    expect(calculateSetupMoveDistance(4, 6)).toBe(3); // Total 10
    expect(calculateSetupMoveDistance(4, 7)).toBe(3); // Total 11
  });

  it('should return 4" for I+M total of 12-13', () => {
    expect(calculateSetupMoveDistance(5, 7)).toBe(4); // Total 12
    expect(calculateSetupMoveDistance(6, 7)).toBe(4); // Total 13
  });

  it('should return 5" for I+M total of 14-19', () => {
    expect(calculateSetupMoveDistance(7, 7)).toBe(5); // Total 14
    expect(calculateSetupMoveDistance(9, 7)).toBe(5); // Total 16
    expect(calculateSetupMoveDistance(9, 10)).toBe(5); // Total 19
  });

  it('should return 6" for I+M total of 20+', () => {
    expect(calculateSetupMoveDistance(10, 10)).toBe(6); // Total 20
    expect(calculateSetupMoveDistance(10, 15)).toBe(6); // Total 25
  });

  it('should return correct distance for standard Marine stats (I=4, M=7)', () => {
    // I(4) + M(7) = 11 → 3"
    expect(calculateSetupMoveDistance(4, 7)).toBe(3);
  });
});

// ─── resolveSetupMove ───────────────────────────────────────────────────────

describe('resolveSetupMove', () => {
  it('should skip set-up move for disordered charges', () => {
    const state = createGameState();
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', true);

    expect(result.skipped).toBe(true);
    expect(result.chargeCompleteViaSetup).toBe(false);
    expect(result.setupMoveDistance).toBe(0);
    expect(result.events).toHaveLength(0);
    // State should be unchanged
    expect(result.state).toBe(state);
  });

  it('should move models toward the target', () => {
    const state = createGameState();
    // Default I=4, M=7 → setup distance = 3"
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);

    expect(result.skipped).toBe(false);
    expect(result.setupMoveDistance).toBe(3); // I(4)+M(7)=11 → 3"

    // Models should have moved toward the target
    const updatedUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    const updatedModel0 = updatedUnit.models.find(m => m.id === 'u0-m0')!;
    // Model was at x=10, target at x=18, should have moved 3" toward target
    expect(updatedModel0.position.x).toBeGreaterThan(10);
    expect(updatedModel0.position.x).toBeLessThanOrEqual(13);
  });

  it('should generate setup move events', () => {
    const state = createGameState();
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].type).toBe('setupMove');
  });

  it('should achieve base contact if target is close enough', () => {
    // Place charging unit very close to target (within setup move distance)
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 16.5, 10), // ~1.5" from target at x=18
        createModel('u0-m1', 16.5, 12),
      ],
    });

    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);

    // With I=4+M=7=11 → 3" setup move, and only ~1.5" away,
    // the initial mover should achieve base contact
    expect(result.chargeCompleteViaSetup).toBe(true);
  });

  it('should not achieve base contact if target is far away', () => {
    // Target is 8" away, setup move is 3"
    const state = createGameState();
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);

    // 8" - 3" = 5" remaining, so no base contact
    expect(result.chargeCompleteViaSetup).toBe(false);
  });

  it('should move the closest model first (initial mover)', () => {
    const state = createGameState();
    // u0-m0 at (10,10), u0-m1 at (12,10) — m1 is closer to target at (18,10)
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 12, 10), // Closer to target
      ],
    });

    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);

    // First event should be for the closest model (u0-m1)
    expect(result.events.length).toBeGreaterThan(0);
    const firstEvent = result.events[0] as { modelId: string };
    expect(firstEvent.modelId).toBe('u0-m1');
  });

  it('should use custom initiative and movement values', () => {
    const state = createGameState();
    // I=1, M=1 → total 2 → 1" setup move
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false, 1, 1);

    expect(result.setupMoveDistance).toBe(1);
  });

  it('should handle unit not found gracefully', () => {
    const state = createGameState();
    const result = resolveSetupMove(state, 'nonexistent', 'unit-1', false);

    expect(result.chargeCompleteViaSetup).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('should handle target unit not found gracefully', () => {
    const state = createGameState();
    const result = resolveSetupMove(state, 'unit-0', 'nonexistent', false);

    expect(result.chargeCompleteViaSetup).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('should handle units with no alive models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10, true),
        createModel('u0-m1', 10, 12, true),
      ],
    });

    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false);
    expect(result.chargeCompleteViaSetup).toBe(false);
  });

  it('should use higher I+M for faster units', () => {
    const state = createGameState();
    // I=5, M=9 → total 14 → 5" setup move
    const result = resolveSetupMove(state, 'unit-0', 'unit-1', false, 5, 9);

    expect(result.setupMoveDistance).toBe(5);
  });
});

// ─── moveToward ─────────────────────────────────────────────────────────────

describe('moveToward', () => {
  it('should move toward target along x axis', () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 10, y: 0 };
    const result = moveToward(from, to, 3);

    expect(result.x).toBeCloseTo(3, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('should move toward target along y axis', () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 0, y: 10 };
    const result = moveToward(from, to, 5);

    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(5, 5);
  });

  it('should move toward target diagonally', () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 3, y: 4 }; // Distance = 5
    const result = moveToward(from, to, 5);

    // Should stop at base contact distance from target
    // Target is 5" away, base contact ~1.26", so should move ~3.74"
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
  });

  it('should not overshoot the target', () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 2, y: 0 };
    const result = moveToward(from, to, 10);

    // Should stop at base contact distance, not overshoot
    expect(result.x).toBeLessThanOrEqual(2);
    expect(result.x).toBeGreaterThan(0);
  });

  it('should not move if already at the target', () => {
    const from: Position = { x: 5, y: 5 };
    const to: Position = { x: 5, y: 5 };
    const result = moveToward(from, to, 3);

    expect(result.x).toBe(5);
    expect(result.y).toBe(5);
  });

  it('should move in correct direction (negative x)', () => {
    const from: Position = { x: 10, y: 0 };
    const to: Position = { x: 0, y: 0 };
    const result = moveToward(from, to, 3);

    expect(result.x).toBeCloseTo(7, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('should move in correct direction (negative y)', () => {
    const from: Position = { x: 0, y: 10 };
    const to: Position = { x: 0, y: 0 };
    const result = moveToward(from, to, 4);

    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(6, 5);
  });

  it('should handle very small distances', () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 100, y: 0 };
    const result = moveToward(from, to, 0.5);

    expect(result.x).toBeCloseTo(0.5, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});

// ─── DEFAULT constants ──────────────────────────────────────────────────────

describe('DEFAULT constants', () => {
  it('DEFAULT_INITIATIVE should be 4', () => {
    expect(DEFAULT_INITIATIVE).toBe(4);
  });

  it('DEFAULT_MOVEMENT should be 7', () => {
    expect(DEFAULT_MOVEMENT).toBe(7);
  });
});
