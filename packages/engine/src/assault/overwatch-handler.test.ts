/**
 * Overwatch Reaction Handler Tests
 * Tests for the Overwatch reaction during the Charge Sub-Phase.
 * Reference: HH_Rules_Battle.md — "Overwatch Reaction"
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  TacticalStatus,
  CoreReaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  checkOverwatchTrigger,
  offerOverwatch,
  resolveOverwatch,
  declineOverwatch,
  getOverwatchRestrictions,
} from './overwatch-handler';

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

// ─── checkOverwatchTrigger ──────────────────────────────────────────────────

describe('checkOverwatchTrigger', () => {
  it('should trigger when target unit is eligible', () => {
    const state = createGameState();
    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');

    expect(result.canOverwatch).toBe(true);
    expect(result.eligibleUnitIds).toEqual(['unit-1']);
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('overwatchTriggered');
  });

  it('should not trigger if target unit not found', () => {
    const state = createGameState();
    const result = checkOverwatchTrigger(state, 'unit-0', 'nonexistent');

    expect(result.canOverwatch).toBe(false);
    expect(result.eligibleUnitIds).toHaveLength(0);
  });

  it('should not trigger if charging unit not found', () => {
    const state = createGameState();
    const result = checkOverwatchTrigger(state, 'nonexistent', 'unit-1');

    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit has no alive models', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      models: [
        createModel('u1-m0', 18, 10, true),
        createModel('u1-m1', 18, 12, true),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if charging unit has no alive models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10, true),
        createModel('u0-m1', 10, 12, true),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if reactive player has no reaction allotment', () => {
    const state = createGameState();
    state.armies[1].reactionAllotmentRemaining = 0;

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit has already reacted', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      hasReactedThisTurn: true,
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit is Stunned', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      statuses: [TacticalStatus.Stunned],
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit is Routed', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      statuses: [TacticalStatus.Routed],
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit is locked in combat with other units', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['other-unit'],
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit is embarked', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      embarkedOnId: 'transport-1',
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });

  it('should not trigger if target unit is not deployed', () => {
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-1', {
      isDeployed: false,
      models: [
        createModel('u1-m0', 18, 10),
        createModel('u1-m1', 18, 12),
      ],
    });

    const result = checkOverwatchTrigger(state, 'unit-0', 'unit-1');
    expect(result.canOverwatch).toBe(false);
  });
});

// ─── offerOverwatch ─────────────────────────────────────────────────────────

describe('offerOverwatch', () => {
  it('should set awaitingReaction on the game state', () => {
    const state = createGameState();
    const result = offerOverwatch(state, 'unit-0', ['unit-1']);

    expect(result.awaitingReaction).toBe(true);
    expect(result.pendingReaction).toBeDefined();
    expect(result.pendingReaction!.reactionType).toBe(CoreReaction.Overwatch);
    expect(result.pendingReaction!.eligibleUnitIds).toEqual(['unit-1']);
    expect(result.pendingReaction!.triggerSourceUnitId).toBe('unit-0');
  });
});

// ─── resolveOverwatch ───────────────────────────────────────────────────────

describe('resolveOverwatch', () => {
  it('should mark the reacting unit as having reacted', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Charge',
        triggerSourceUnitId: 'unit-0',
      },
    });

    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    const reactedUnit = result.state.armies[1].units.find(u => u.id === 'unit-1')!;
    expect(reactedUnit.hasReactedThisTurn).toBe(true);
  });

  it('should decrement the army reaction allotment', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Charge',
        triggerSourceUnitId: 'unit-0',
      },
    });

    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    expect(result.state.armies[1].reactionAllotmentRemaining).toBe(0);
  });

  it('should clear the awaiting reaction state', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Charge',
        triggerSourceUnitId: 'unit-0',
      },
    });

    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    expect(result.state.awaitingReaction).toBe(false);
    expect(result.state.pendingReaction).toBeUndefined();
  });

  it('should generate overwatchResolved event with accepted=true', () => {
    const state = createGameState({
      awaitingReaction: true,
    });

    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    const resolvedEvents = result.events.filter(e => e.type === 'overwatchResolved');
    expect(resolvedEvents.length).toBe(1);
    const event = resolvedEvents[0] as { accepted: boolean };
    expect(event.accepted).toBe(true);
  });

  it('should report chargerWipedOut=false if charger still has alive models', () => {
    const state = createGameState();
    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    expect(result.chargerWipedOut).toBe(false);
  });

  it('should report chargerWipedOut=true if charger has no alive models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-0', {
      models: [
        createModel('u0-m0', 10, 10, true),
        createModel('u0-m1', 10, 12, true),
      ],
    });

    const result = resolveOverwatch(state, 'unit-1', 'unit-0');

    expect(result.chargerWipedOut).toBe(true);
  });
});

// ─── declineOverwatch ───────────────────────────────────────────────────────

describe('declineOverwatch', () => {
  it('should clear the awaiting reaction state', () => {
    const state = createGameState({
      awaitingReaction: true,
      pendingReaction: {
        reactionType: CoreReaction.Overwatch,
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'Charge',
        triggerSourceUnitId: 'unit-0',
      },
    });

    const result = declineOverwatch(state, 'unit-0');

    expect(result.state.awaitingReaction).toBe(false);
    expect(result.state.pendingReaction).toBeUndefined();
  });

  it('should generate overwatchResolved event with accepted=false', () => {
    const state = createGameState({
      awaitingReaction: true,
    });

    const result = declineOverwatch(state, 'unit-0');

    const resolvedEvents = result.events.filter(e => e.type === 'overwatchResolved');
    expect(resolvedEvents.length).toBe(1);
    const event = resolvedEvents[0] as { accepted: boolean };
    expect(event.accepted).toBe(false);
  });

  it('should not mark any unit as having reacted', () => {
    const state = createGameState({
      awaitingReaction: true,
    });

    const result = declineOverwatch(state, 'unit-0');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'unit-1')!;
    expect(targetUnit.hasReactedThisTurn).toBe(false);
  });

  it('should not decrement reaction allotment', () => {
    const state = createGameState({
      awaitingReaction: true,
    });

    const result = declineOverwatch(state, 'unit-0');

    expect(result.state.armies[1].reactionAllotmentRemaining).toBe(1);
  });
});

// ─── getOverwatchRestrictions ───────────────────────────────────────────────

describe('getOverwatchRestrictions', () => {
  it('should return full BS (not snap shots)', () => {
    const unit = createUnit('u');
    const restrictions = getOverwatchRestrictions(unit);

    expect(restrictions.fullBallisticSkill).toBe(true);
  });

  it('should allow any ranged weapon', () => {
    const unit = createUnit('u');
    const restrictions = getOverwatchRestrictions(unit);

    expect(restrictions.anyRangedWeapon).toBe(true);
  });

  it('should block cover saves', () => {
    const unit = createUnit('u');
    const restrictions = getOverwatchRestrictions(unit);

    expect(restrictions.noCoverSaves).toBe(true);
  });

  it('should block shrouded damage mitigation', () => {
    const unit = createUnit('u');
    const restrictions = getOverwatchRestrictions(unit);

    expect(restrictions.noShrouded).toBe(true);
  });

  it('should mark as Overwatch', () => {
    const unit = createUnit('u');
    const restrictions = getOverwatchRestrictions(unit);

    expect(restrictions.isOverwatch).toBe(true);
  });
});
