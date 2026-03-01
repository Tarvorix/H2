/**
 * Volley Attack Handler Tests
 * Tests for Volley Attacks (Step 4 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 4
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  CoreReaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import type { DiceProvider } from '../types';
import { resolveVolleyAttacks, shouldUseOverwatch } from './volley-attack-handler';

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

/** Simple fixed dice provider for testing */
function createDiceProvider(values: number[]): DiceProvider {
  let index = 0;
  return {
    rollD6(): number {
      if (index >= values.length) return 4;
      return values[index++];
    },
    rollMultipleD6(count: number): number[] {
      const results: number[] = [];
      for (let i = 0; i < count; i++) {
        results.push(this.rollD6());
      }
      return results;
    },
    rollD3(): number {
      return Math.ceil(this.rollD6() / 2);
    },
    roll2D6(): [number, number] {
      return [this.rollD6(), this.rollD6()];
    },
    rollScatter(): { direction: number; distance: number } {
      return { direction: 0, distance: this.rollD6() };
    },
  };
}

// ─── resolveVolleyAttacks ───────────────────────────────────────────────────

describe('resolveVolleyAttacks', () => {
  it('should resolve volley attacks for both sides', () => {
    const state = createGameState();
    const dice = createDiceProvider([4, 4, 4, 4]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
    );

    expect(result.skipped).toBe(false);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('should skip charger volley if charge is disordered', () => {
    const state = createGameState();
    const dice = createDiceProvider([4, 4]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      true, // disordered
      dice,
    );

    expect(result.skipped).toBe(false);
    // Only target volley event should exist (charger skipped)
    const volleyEvents = result.events.filter(e => e.type === 'volleyAttack');
    expect(volleyEvents.length).toBe(1);
    // The target still volleys
    const targetVolley = volleyEvents[0] as { attackerUnitId: string };
    expect(targetVolley.attackerUnitId).toBe('unit-1');
  });

  it('should skip if target is already locked in combat', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['other-unit'],
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });
    const dice = createDiceProvider([]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
    );

    expect(result.skipped).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('should skip if charging unit not found', () => {
    const state = createGameState();
    const dice = createDiceProvider([]);

    const result = resolveVolleyAttacks(
      state,
      'nonexistent',
      'unit-1',
      false,
      dice,
    );

    expect(result.skipped).toBe(true);
  });

  it('should skip if target unit not found', () => {
    const state = createGameState();
    const dice = createDiceProvider([]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'nonexistent',
      false,
      dice,
    );

    expect(result.skipped).toBe(true);
  });

  it('should allow charger to decline volley', () => {
    const state = createGameState();
    const dice = createDiceProvider([4, 4]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
      false, // charger declines
      true,  // target volleys
    );

    expect(result.skipped).toBe(false);
    // Only target volley event should exist
    const volleyEvents = result.events.filter(e => e.type === 'volleyAttack');
    expect(volleyEvents.length).toBe(1);
    const targetVolley = volleyEvents[0] as { attackerUnitId: string };
    expect(targetVolley.attackerUnitId).toBe('unit-1');
  });

  it('should allow target to decline volley', () => {
    const state = createGameState();
    const dice = createDiceProvider([4, 4]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
      true,  // charger volleys
      false, // target declines
    );

    expect(result.skipped).toBe(false);
    // Only charger volley event should exist
    const volleyEvents = result.events.filter(e => e.type === 'volleyAttack');
    expect(volleyEvents.length).toBe(1);
    const chargerVolley = volleyEvents[0] as { attackerUnitId: string };
    expect(chargerVolley.attackerUnitId).toBe('unit-0');
  });

  it('should allow both sides to decline volley', () => {
    const state = createGameState();
    const dice = createDiceProvider([]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
      false, // charger declines
      false, // target declines
    );

    expect(result.skipped).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it('should detect target wiped out by charger volley', () => {
    // If all target models are destroyed, report targetWipedOut
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 18, 10, true), // already destroyed
        createModel('u1-m1', 18, 12, true), // already destroyed
      ],
    });
    const dice = createDiceProvider([]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
    );

    // Since target is already destroyed, the charger volley hits a destroyed unit
    // The target should be considered wiped out
    expect(result.targetWipedOut).toBe(true);
  });

  it('should include volley attack event details', () => {
    const state = createGameState();
    const dice = createDiceProvider([4, 4, 4, 4]);

    const result = resolveVolleyAttacks(
      state,
      'unit-0',
      'unit-1',
      false,
      dice,
    );

    const volleyEvents = result.events.filter(e => e.type === 'volleyAttack');
    expect(volleyEvents.length).toBe(2); // One for each side

    const chargerEvent = volleyEvents[0] as {
      attackerUnitId: string;
      targetUnitId: string;
      isSnapShot: boolean;
    };
    expect(chargerEvent.attackerUnitId).toBe('unit-0');
    expect(chargerEvent.targetUnitId).toBe('unit-1');
    expect(chargerEvent.isSnapShot).toBe(true);
  });
});

// ─── shouldUseOverwatch ─────────────────────────────────────────────────────

describe('shouldUseOverwatch', () => {
  it('should return false when no reaction is pending', () => {
    const state = createGameState();
    expect(shouldUseOverwatch(state, 'unit-1')).toBe(false);
  });

  it('should return true when Overwatch reaction is pending for the unit', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Charge declared against unit-1',
        triggerSourceUnitId: 'unit-0',
      },
    });

    expect(shouldUseOverwatch(state, 'unit-1')).toBe(true);
  });

  it('should return false when pending reaction is not Overwatch', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.ReturnFire,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Shooting attack',
        triggerSourceUnitId: 'unit-0',
      },
    });

    expect(shouldUseOverwatch(state, 'unit-1')).toBe(false);
  });

  it('should return false when unit is not in eligible list', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-2'],
        triggerDescription: 'Charge declared',
        triggerSourceUnitId: 'unit-0',
      },
    });

    expect(shouldUseOverwatch(state, 'unit-1')).toBe(false);
  });
});
