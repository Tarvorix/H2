/**
 * Charge Validator Tests
 * Tests for charge eligibility and target validation in the Assault Phase.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Steps 1-2
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
  validateChargeEligibility,
  validateChargeTarget,
  isDisorderedCharge,
  MAX_CHARGE_RANGE,
} from './charge-validator';

const TACTICAL_BASE_DIAMETER_INCHES = 32 / 25.4;

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
  // Default: player 0 has unit at x=10, player 1 has unit at x=18 (8" apart — within charge range)
  const army0Units = [
    createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 11),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-1', {
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 11),
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

// ─── validateChargeEligibility ──────────────────────────────────────────────

describe('validateChargeEligibility', () => {
  it('should pass for a valid charging unit', () => {
    const state = createGameState();
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail if charging unit is not found', () => {
    const state = createGameState();
    const result = validateChargeEligibility(state, 'nonexistent');
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('CHARGER_NOT_FOUND');
  });

  it('should fail if charging unit does not belong to the active player', () => {
    const state = createGameState({ activePlayerIndex: 1 });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_NOT_ACTIVE_PLAYER')).toBe(true);
  });

  it('should fail if charging unit is not deployed', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', { isDeployed: false });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_NOT_DEPLOYED')).toBe(true);
  });

  it('should fail if charging unit is embarked on a transport', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', { embarkedOnId: 'transport-1' });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_EMBARKED')).toBe(true);
  });

  it('should fail if charging unit Rushed this turn', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      movementState: UnitMovementState.Rushed,
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_RUSHED')).toBe(true);
  });

  it('should fail if charging unit is locked in combat', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_LOCKED_IN_COMBAT')).toBe(true);
  });

  it('should fail if charging unit is Pinned', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      statuses: [TacticalStatus.Pinned],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_PINNED')).toBe(true);
  });

  it('should fail if charging unit is Routed', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      statuses: [TacticalStatus.Routed],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_ROUTED')).toBe(true);
  });

  it('should fail if charging unit has no alive models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10, true),
        createModel('u0-m1', 10, 11, true),
      ],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CHARGER_NO_ALIVE_MODELS')).toBe(true);
  });

  it('should accumulate multiple errors', () => {
    const state = createGameState({ activePlayerIndex: 1 });
    state.armies[0].units[0] = createUnit('unit-0', {
      movementState: UnitMovementState.Rushed,
      isLockedInCombat: true,
      statuses: [TacticalStatus.Pinned],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(false);
    // Should have errors for: not active player, rushed, locked in combat, pinned
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('should pass if unit has Suppressed status (can charge, but disordered)', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      statuses: [TacticalStatus.Suppressed],
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 11),
      ],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    // Suppressed doesn't prevent charging — it just makes it disordered
    expect(result.valid).toBe(true);
  });

  it('should pass if unit has Stunned status (can charge, but disordered)', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      statuses: [TacticalStatus.Stunned],
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 11),
      ],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    // Stunned doesn't prevent charging — it just makes it disordered
    expect(result.valid).toBe(true);
  });

  it('should allow a unit that has moved normally to charge', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      movementState: UnitMovementState.Moved,
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 11),
      ],
    });
    const result = validateChargeEligibility(state, 'unit-0');
    expect(result.valid).toBe(true);
  });
});

// ─── validateChargeTarget ───────────────────────────────────────────────────

describe('validateChargeTarget', () => {
  it('should pass for a valid target within charge range', () => {
    const state = createGameState();
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.closestDistance).toBeCloseTo(8 - TACTICAL_BASE_DIAMETER_INCHES, 6);
    expect(result.modelsWithLOS.length).toBeGreaterThan(0);
  });

  it('should fail if target unit is not found', () => {
    const state = createGameState();
    const result = validateChargeTarget(state, 'unit-0', 'nonexistent');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_NOT_FOUND')).toBe(true);
  });

  it('should fail if target is a friendly unit', () => {
    // Add a second unit to army 0 and try to charge it
    const state = createGameState();
    const friendlyUnit = createUnit('unit-0b', {
      models: [
        createModel('u0b-m0', 15, 10),
        createModel('u0b-m1', 15, 11),
      ],
    });
    state.armies[0].units.push(friendlyUnit);

    const result = validateChargeTarget(state, 'unit-0', 'unit-0b');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_IS_FRIENDLY')).toBe(true);
  });

  it('should fail if target is not deployed', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      isDeployed: false,
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_NOT_DEPLOYED')).toBe(true);
  });

  it('should fail if target is embarked on a transport', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      embarkedOnId: 'transport-1',
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_EMBARKED')).toBe(true);
  });

  it('should fail if target is in reserves', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      isInReserves: true,
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_IN_RESERVES')).toBe(true);
  });

  it('should fail if target has no alive models', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 18, 10, true),
        createModel('u1-m1', 18, 11, true),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_DESTROYED')).toBe(true);
  });

  it('should fail if target is out of charge range (> 12")', () => {
    const state = createGameState();
    // Place target just beyond a 12" base-to-base charge.
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 10 + MAX_CHARGE_RANGE + TACTICAL_BASE_DIAMETER_INCHES + 0.1, 10),
        createModel('u1-m1', 10 + MAX_CHARGE_RANGE + TACTICAL_BASE_DIAMETER_INCHES + 0.1, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_OUT_OF_CHARGE_RANGE')).toBe(true);
  });

  it('should pass if target is exactly at 12" range', () => {
    const state = createGameState();
    // Place target at exactly 12" base-to-base.
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 10 + MAX_CHARGE_RANGE + TACTICAL_BASE_DIAMETER_INCHES, 10),
        createModel('u1-m1', 10 + MAX_CHARGE_RANGE + TACTICAL_BASE_DIAMETER_INCHES, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.closestDistance).toBeCloseTo(12, 6);
  });

  it('should report disordered if charging unit has a status', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      statuses: [TacticalStatus.Suppressed],
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.isDisordered).toBe(true);
  });

  it('should report not disordered if charging unit has no statuses', () => {
    const state = createGameState();
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.isDisordered).toBe(false);
  });

  it('should include model IDs with LOS in the result', () => {
    const state = createGameState();
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.modelsWithLOS).toContain('u0-m0');
    expect(result.modelsWithLOS).toContain('u0-m1');
  });

  it('should include closest distance in the result', () => {
    const state = createGameState();
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.closestDistance).toBeCloseTo(8 - TACTICAL_BASE_DIAMETER_INCHES, 6);
  });

  it('should pass for a charge at 1" range', () => {
    const state = createGameState();
    // Place target at exactly 1" base-to-base.
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 10 + 1 + TACTICAL_BASE_DIAMETER_INCHES, 10),
        createModel('u1-m1', 10 + 1 + TACTICAL_BASE_DIAMETER_INCHES, 11),
      ],
    });
    const result = validateChargeTarget(state, 'unit-0', 'unit-1');
    expect(result.valid).toBe(true);
    expect(result.closestDistance).toBeCloseTo(1, 6);
  });
});

// ─── isDisorderedCharge ─────────────────────────────────────────────────────

describe('isDisorderedCharge', () => {
  it('should return false for a unit with no statuses', () => {
    const unit = createUnit('u0');
    expect(isDisorderedCharge(unit)).toBe(false);
  });

  it('should return true if unit has Suppressed status', () => {
    const unit = createUnit('u0', { statuses: [TacticalStatus.Suppressed] });
    expect(isDisorderedCharge(unit)).toBe(true);
  });

  it('should return true if unit has Stunned status', () => {
    const unit = createUnit('u0', { statuses: [TacticalStatus.Stunned] });
    expect(isDisorderedCharge(unit)).toBe(true);
  });

  it('should return true if unit has multiple statuses', () => {
    const unit = createUnit('u0', {
      statuses: [TacticalStatus.Suppressed, TacticalStatus.Stunned],
    });
    expect(isDisorderedCharge(unit)).toBe(true);
  });
});

// ─── MAX_CHARGE_RANGE constant ──────────────────────────────────────────────

describe('MAX_CHARGE_RANGE', () => {
  it('should be 12 inches', () => {
    expect(MAX_CHARGE_RANGE).toBe(12);
  });
});
