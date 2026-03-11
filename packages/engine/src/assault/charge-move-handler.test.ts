/**
 * Charge Roll & Move Handler Tests
 * Tests for the Charge Roll and Charge Move (Step 5 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 5
 */

import { describe, it, expect } from 'vitest';
import { checkCoherency, STANDARD_COHERENCY_RANGE } from '@hh/geometry';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  TacticalStatus,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import type { DiceProvider } from '../types';
import { getModelShapeAtPosition } from '../model-shapes';
import {
  resolveChargeRoll,
  resolveChargeMove,
  DEFAULT_COOL,
} from './charge-move-handler';

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

/** Fixed dice provider for deterministic testing */
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

// ─── resolveChargeRoll ──────────────────────────────────────────────────────

describe('resolveChargeRoll', () => {
  it('should roll 2d6 and take the higher value', () => {
    const dice = createDiceProvider([3, 5]);
    const result = resolveChargeRoll(dice);

    expect(result.diceValues).toEqual([3, 5]);
    expect(result.chargeRoll).toBe(5);
    expect(result.discardedDie).toBe(3);
  });

  it('should handle equal dice values', () => {
    const dice = createDiceProvider([4, 4]);
    const result = resolveChargeRoll(dice);

    expect(result.chargeRoll).toBe(4);
    expect(result.discardedDie).toBe(4);
  });

  it('should handle maximum roll (6,6)', () => {
    const dice = createDiceProvider([6, 6]);
    const result = resolveChargeRoll(dice);

    expect(result.chargeRoll).toBe(6);
    expect(result.discardedDie).toBe(6);
  });

  it('should handle minimum roll (1,1)', () => {
    const dice = createDiceProvider([1, 1]);
    const result = resolveChargeRoll(dice);

    expect(result.chargeRoll).toBe(1);
    expect(result.discardedDie).toBe(1);
  });

  it('should discard the lower die when first is higher', () => {
    const dice = createDiceProvider([6, 2]);
    const result = resolveChargeRoll(dice);

    expect(result.chargeRoll).toBe(6);
    expect(result.discardedDie).toBe(2);
  });

  it('should discard the lower die when second is higher', () => {
    const dice = createDiceProvider([1, 5]);
    const result = resolveChargeRoll(dice);

    expect(result.chargeRoll).toBe(5);
    expect(result.discardedDie).toBe(1);
  });
});

// ─── resolveChargeMove — Successful Charges ─────────────────────────────────

describe('resolveChargeMove — successful charges', () => {
  it('should succeed when charge roll >= distance', () => {
    const state = createGameState();
    // Distance = 8", charge roll = 6 (need to roll >= 8, so [6,2] = 6 fails)
    // Use [5,6] = 6 which still < 8, so let's use distance of 5
    // Place units 5" apart for easier testing
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10),
        createModel('u0-m1', 10, 12),
      ],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 15, 10),
        createModel('u1-m1', 15, 12),
      ],
    });

    const dice = createDiceProvider([5, 6]); // Charge roll = 6, distance = 5
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 5);

    expect(result.chargeSucceeded).toBe(true);
    expect(result.chargeRoll.chargeRoll).toBe(6);
    expect(result.gainedStunned).toBe(false);
  });

  it('should lock units in combat on successful charge', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10),
      ],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 15, 10),
      ],
    });

    const dice = createDiceProvider([6, 5]); // Charge roll = 6, distance = 5
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 5);

    expect(result.chargeSucceeded).toBe(true);

    // Both units should be locked in combat
    const chargingUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'unit-1')!;

    expect(chargingUnit.isLockedInCombat).toBe(true);
    expect(targetUnit.isLockedInCombat).toBe(true);
    expect(chargingUnit.engagedWithUnitIds).toContain('unit-1');
    expect(targetUnit.engagedWithUnitIds).toContain('unit-0');
  });

  it('should move models toward the target on successful charge', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [createModel('u0-m0', 10, 10)],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 15, 10)],
    });

    const dice = createDiceProvider([6, 5]); // Charge roll = 6
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 5);

    const movedModel = result.state.armies[0].units
      .find(u => u.id === 'unit-0')!
      .models.find(m => m.id === 'u0-m0')!;

    // Model should have moved toward the target
    expect(movedModel.position.x).toBeGreaterThan(10);
  });

  it('should keep remaining charging models coherent when the first charger surges ahead', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 0, 0),
        createModel('u0-m1', 0, 3),
        createModel('u0-m2', 0, 6),
      ],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 7, 0)],
    });

    const dice = createDiceProvider([6, 5]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 6);
    const updatedUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    const shapes = updatedUnit.models.map((model) => getModelShapeAtPosition(model, model.position));

    expect(result.chargeSucceeded).toBe(true);
    expect(checkCoherency(shapes, STANDARD_COHERENCY_RANGE).isCoherent).toBe(true);
  });

  it('should succeed when charge roll equals distance exactly', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [createModel('u0-m0', 10, 10)],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 14, 10)],
    });

    const dice = createDiceProvider([4, 3]); // Charge roll = 4, distance = 4
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 4);

    expect(result.chargeSucceeded).toBe(true);
  });

  it('should generate chargeSucceeded event', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [createModel('u0-m0', 10, 10)],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 13, 10)],
    });

    const dice = createDiceProvider([4, 3]); // Charge roll = 4, distance = 3
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 3);

    expect(result.chargeSucceeded).toBe(true);
    const succeededEvents = result.events.filter(e => e.type === 'chargeSucceeded');
    expect(succeededEvents.length).toBe(1);
  });

  it('should generate chargeRoll event', () => {
    const state = createGameState();
    const dice = createDiceProvider([5, 6]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 5);

    const rollEvents = result.events.filter(e => e.type === 'chargeRoll');
    expect(rollEvents.length).toBe(1);
  });
});

// ─── resolveChargeMove — Failed Charges ─────────────────────────────────────

describe('resolveChargeMove — failed charges', () => {
  it('should fail when charge roll < distance', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      2, 3,  // Charge roll = 3, distance = 8 → fails
      3, 4,  // Cool Check: 3+4 = 7 → pass (default CL=7)
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    expect(result.chargeSucceeded).toBe(false);
    expect(result.chargeRoll.chargeRoll).toBe(3);
  });

  it('should not move models on failed charge', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      1, 2,  // Charge roll = 2
      3, 4,  // Cool Check = 7
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    expect(result.chargeSucceeded).toBe(false);

    // Models should not have moved
    const model = result.state.armies[0].units
      .find(u => u.id === 'unit-0')!
      .models.find(m => m.id === 'u0-m0')!;

    expect(model.position.x).toBe(10);
    expect(model.position.y).toBe(10);
  });

  it('should not lock units in combat on failed charge', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      1, 2,
      3, 4,
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    const chargingUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    expect(chargingUnit.isLockedInCombat).toBe(false);
  });

  it('should apply Stunned on failed Cool Check after failed charge', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      1, 2,  // Charge roll = 2, distance = 8 → fails
      6, 6,  // Cool Check: 6+6 = 12, CL=7 → fails (12 > 7)
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    expect(result.chargeSucceeded).toBe(false);
    expect(result.gainedStunned).toBe(true);

    const chargingUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    expect(chargingUnit.statuses).toContain(TacticalStatus.Stunned);
  });

  it('should not apply Stunned on passed Cool Check after failed charge', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      1, 2,  // Charge roll = 2 → fails
      3, 3,  // Cool Check: 3+3 = 6, CL=7 → passes (6 <= 7)
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    expect(result.chargeSucceeded).toBe(false);
    expect(result.gainedStunned).toBe(false);

    const chargingUnit = result.state.armies[0].units.find(u => u.id === 'unit-0')!;
    expect(chargingUnit.statuses).not.toContain(TacticalStatus.Stunned);
  });

  it('should generate chargeFailed event', () => {
    const state = createGameState();
    const dice = createDiceProvider([1, 2, 3, 4]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    const failedEvents = result.events.filter(e => e.type === 'chargeFailed');
    expect(failedEvents.length).toBe(1);
  });

  it('should generate coolCheck event on failed charge', () => {
    const state = createGameState();
    const dice = createDiceProvider([1, 2, 3, 4]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    const coolEvents = result.events.filter(e => e.type === 'coolCheck');
    expect(coolEvents.length).toBe(1);
  });

  it('should use custom Cool value for Cool Check', () => {
    const state = createGameState();
    const dice = createDiceProvider([
      1, 2,  // Charge roll = 2
      4, 5,  // Cool Check: 4+5 = 9, CL=10 → passes (9 <= 10)
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8, 10);

    expect(result.gainedStunned).toBe(false);
  });
});

// ─── resolveChargeMove — Edge Cases ─────────────────────────────────────────

describe('resolveChargeMove — edge cases', () => {
  it('should handle units not found gracefully', () => {
    const state = createGameState();
    const dice = createDiceProvider([5, 6]);

    const result = resolveChargeMove(state, 'nonexistent', 'unit-1', dice, 5);

    // Should succeed based on roll but not crash
    expect(result.chargeRoll.chargeRoll).toBe(6);
  });

  it('should handle charge at very close range (1")', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [createModel('u0-m0', 10, 10)],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 11, 10)],
    });

    const dice = createDiceProvider([1, 1]); // Charge roll = 1, distance = 1
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 1);

    expect(result.chargeSucceeded).toBe(true);
  });

  it('should handle charge at maximum range (12")', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [createModel('u0-m0', 10, 10)],
    });
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [createModel('u1-m0', 22, 10)],
    });

    const dice = createDiceProvider([
      3, 5,  // Charge roll = 5, distance = 12 → fails
      6, 5,  // Cool Check
    ]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 12);

    expect(result.chargeSucceeded).toBe(false);
  });

  it('should report the distance to target in the result', () => {
    const state = createGameState();
    const dice = createDiceProvider([5, 6]);
    const result = resolveChargeMove(state, 'unit-0', 'unit-1', dice, 8);

    expect(result.distanceToTarget).toBe(8);
  });
});

// ─── DEFAULT_COOL constant ──────────────────────────────────────────────────

describe('DEFAULT_COOL', () => {
  it('should be 7', () => {
    expect(DEFAULT_COOL).toBe(7);
  });
});
