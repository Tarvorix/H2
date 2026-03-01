/**
 * Morale Handler Tests — Shooting Pipeline Step 12
 * Reference: HH_Rules_Battle.md — Morale Sub-Phase
 *
 * Tests comprehensive morale sub-phase resolution including:
 * - Panic checks (25% casualties) — leadership-based
 * - PanicRule(X) checks — leadership-based with modifier
 * - Status checks (Pinning, Suppressive, Stun) — cool-based
 * - Coherency checks — cool-based, fails to Suppressed
 * - Resolution order: rout checks first, then status checks
 * - Routed units skip remaining status checks
 * - Multiple units resolved independently
 * - Event emission for all check types
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
import { FixedDiceProvider } from '../dice';
import {
  resolveShootingMorale,
  makePanicCheck,
  makeStatusCheck,
  getFailureStatus,
} from './morale-handler';
import type { PendingMoraleCheck } from './shooting-types';
import type {
  PanicCheckEvent,
  StatusCheckEvent,
} from '../types';

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
    createUnit('attacker', {
      models: [
        createModel('atk-m0', 10, 24),
        createModel('atk-m1', 12, 24),
      ],
    }),
  ];

  const army1Units = [
    createUnit('target', {
      models: [
        createModel('tgt-m0', 36, 24),
        createModel('tgt-m1', 38, 24),
        createModel('tgt-m2', 40, 24),
        createModel('tgt-m3', 42, 24),
      ],
    }),
  ];

  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, army0Units),
      createArmy(1, army1Units),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Shooting,
    currentSubPhase: SubPhase.ShootingMorale,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── makePanicCheck ────────────────────────────────────────────────────────

describe('makePanicCheck', () => {
  it('passes when roll equals leadership (roll 7 vs Leadership 7)', () => {
    // 2d6 = 3 + 4 = 7, target = 7, roll <= target => pass
    const dice = new FixedDiceProvider([3, 4]);
    const result = makePanicCheck(dice, 0, 7);

    expect(result.roll).toBe(7);
    expect(result.target).toBe(7);
    expect(result.passed).toBe(true);
  });

  it('fails when roll exceeds leadership (roll 8 vs Leadership 7)', () => {
    // 2d6 = 4 + 4 = 8, target = 7, roll > target => fail
    const dice = new FixedDiceProvider([4, 4]);
    const result = makePanicCheck(dice, 0, 7);

    expect(result.roll).toBe(8);
    expect(result.target).toBe(7);
    expect(result.passed).toBe(false);
  });

  it('applies modifier to reduce target (PanicRule(2): target = 7-2 = 5)', () => {
    // 2d6 = 3 + 3 = 6, target = 7-2 = 5, roll > target => fail
    const dice = new FixedDiceProvider([3, 3]);
    const result = makePanicCheck(dice, 2, 7);

    expect(result.roll).toBe(6);
    expect(result.target).toBe(5);
    expect(result.passed).toBe(false);
  });

  it('passes PanicRule check when roll is within modified target', () => {
    // 2d6 = 2 + 2 = 4, target = 7-2 = 5, roll <= target => pass
    const dice = new FixedDiceProvider([2, 2]);
    const result = makePanicCheck(dice, 2, 7);

    expect(result.roll).toBe(4);
    expect(result.target).toBe(5);
    expect(result.passed).toBe(true);
  });

  it('uses default leadership of 7 when not specified', () => {
    const dice = new FixedDiceProvider([3, 4]);
    const result = makePanicCheck(dice, 0);

    expect(result.target).toBe(7);
    expect(result.passed).toBe(true);
  });

  it('target cannot go below 2 (minimum target for 2d6)', () => {
    // Modifier of 10 on Leadership 7: target would be -3, clamped to 2
    const dice = new FixedDiceProvider([1, 1]);
    const result = makePanicCheck(dice, 10, 7);

    expect(result.roll).toBe(2);
    expect(result.target).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('roll of exactly 2 passes against minimum target of 2', () => {
    const dice = new FixedDiceProvider([1, 1]);
    const result = makePanicCheck(dice, 10, 7);

    expect(result.roll).toBe(2);
    expect(result.target).toBe(2);
    expect(result.passed).toBe(true);
  });

  it('roll of 3 fails against minimum target of 2', () => {
    const dice = new FixedDiceProvider([1, 2]);
    const result = makePanicCheck(dice, 10, 7);

    expect(result.roll).toBe(3);
    expect(result.target).toBe(2);
    expect(result.passed).toBe(false);
  });
});

// ─── makeStatusCheck ───────────────────────────────────────────────────────

describe('makeStatusCheck', () => {
  it('passes when roll equals cool target', () => {
    // 2d6 = 3 + 4 = 7, target = 7-0 = 7 => pass
    const dice = new FixedDiceProvider([3, 4]);
    const result = makeStatusCheck(dice, 0, 7);

    expect(result.roll).toBe(7);
    expect(result.target).toBe(7);
    expect(result.passed).toBe(true);
  });

  it('fails when roll exceeds cool target', () => {
    // 2d6 = 5 + 4 = 9, target = 7-0 = 7 => fail
    const dice = new FixedDiceProvider([5, 4]);
    const result = makeStatusCheck(dice, 0, 7);

    expect(result.roll).toBe(9);
    expect(result.target).toBe(7);
    expect(result.passed).toBe(false);
  });

  it('applies modifier to reduce target (Pinning(3): target = 7-3 = 4)', () => {
    // 2d6 = 3 + 2 = 5, target = 7-3 = 4, roll > target => fail
    const dice = new FixedDiceProvider([3, 2]);
    const result = makeStatusCheck(dice, 3, 7);

    expect(result.roll).toBe(5);
    expect(result.target).toBe(4);
    expect(result.passed).toBe(false);
  });

  it('passes when roll is within modified target', () => {
    // 2d6 = 2 + 1 = 3, target = 7-3 = 4, roll <= target => pass
    const dice = new FixedDiceProvider([2, 1]);
    const result = makeStatusCheck(dice, 3, 7);

    expect(result.roll).toBe(3);
    expect(result.target).toBe(4);
    expect(result.passed).toBe(true);
  });

  it('uses default cool of 7 when not specified', () => {
    const dice = new FixedDiceProvider([3, 4]);
    const result = makeStatusCheck(dice, 0);

    expect(result.target).toBe(7);
    expect(result.passed).toBe(true);
  });

  it('target cannot go below 2 (minimum target for 2d6)', () => {
    const dice = new FixedDiceProvider([1, 1]);
    const result = makeStatusCheck(dice, 10, 7);

    expect(result.roll).toBe(2);
    expect(result.target).toBe(2);
    expect(result.passed).toBe(true);
  });
});

// ─── getFailureStatus ──────────────────────────────────────────────────────

describe('getFailureStatus', () => {
  it('maps panic to Routed', () => {
    expect(getFailureStatus('panic')).toBe(TacticalStatus.Routed);
  });

  it('maps panicRule to Routed', () => {
    expect(getFailureStatus('panicRule')).toBe(TacticalStatus.Routed);
  });

  it('maps pinning to Pinned', () => {
    expect(getFailureStatus('pinning')).toBe(TacticalStatus.Pinned);
  });

  it('maps suppressive to Suppressed', () => {
    expect(getFailureStatus('suppressive')).toBe(TacticalStatus.Suppressed);
  });

  it('maps stun to Stunned', () => {
    expect(getFailureStatus('stun')).toBe(TacticalStatus.Stunned);
  });

  it('maps coherency to Suppressed', () => {
    expect(getFailureStatus('coherency')).toBe(TacticalStatus.Suppressed);
  });
});

// ─── resolveShootingMorale ─────────────────────────────────────────────────

describe('resolveShootingMorale', () => {
  // ── Test 1: Single panic check — passes ─────────────────────────────────

  it('single panic check passes: unit not routed, no status applied', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check: 1 casualty from 4 models (25%)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>([['target', 1]]);

    // Roll 3 + 4 = 7 vs Leadership 7 => pass
    const dice = new FixedDiceProvider([3, 4]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should NOT be routed
    expect(result.routedUnitIds).toHaveLength(0);

    // No statuses applied
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toHaveLength(0);

    // PanicCheckEvent emitted with passed = true
    const panicEvents = result.events.filter(e => e.type === 'panicCheck') as PanicCheckEvent[];
    expect(panicEvents).toHaveLength(1);
    expect(panicEvents[0].passed).toBe(true);
    expect(panicEvents[0].roll).toBe(7);
    expect(panicEvents[0].target).toBe(7);
    expect(panicEvents[0].casualtiesCount).toBe(1);
    expect(panicEvents[0].unitSizeAtStart).toBe(4);
  });

  // ── Test 2: Single panic check — fails → Routed ────────────────────────

  it('single panic check fails: unit becomes Routed', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check: 1 casualty from 4 models (25%)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>([['target', 1]]);

    // Roll 4 + 4 = 8 vs Leadership 7 => fail
    const dice = new FixedDiceProvider([4, 4]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be routed
    expect(result.routedUnitIds).toContain('target');

    // Routed status applied to unit in game state
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Routed);

    // PanicCheckEvent emitted with passed = false
    const panicEvents = result.events.filter(e => e.type === 'panicCheck') as PanicCheckEvent[];
    expect(panicEvents).toHaveLength(1);
    expect(panicEvents[0].passed).toBe(false);
    expect(panicEvents[0].roll).toBe(8);
    expect(panicEvents[0].target).toBe(7);
  });

  // ── Test 3: PanicRule(2) check with modifier ───────────────────────────

  it('panicRule check with modifier: target is Leadership - modifier', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panicRule',
        modifier: 2,
        source: 'Panic (2) from Volkite Serpenta',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 3 + 3 = 6 vs Leadership 7-2 = 5 => fail (6 > 5)
    const dice = new FixedDiceProvider([3, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be routed
    expect(result.routedUnitIds).toContain('target');

    // StatusCheckEvent emitted for panicRule
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].checkType).toBe('panicRule');
    expect(statusEvents[0].roll).toBe(6);
    expect(statusEvents[0].target).toBe(5);
    expect(statusEvents[0].passed).toBe(false);
    expect(statusEvents[0].statusApplied).toBe(TacticalStatus.Routed);
  });

  // ── Test 4: Pinning check — fails → Pinned ─────────────────────────────

  it('pinning check fails: unit becomes Pinned', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 3,
        source: 'Pinning (3) from Heavy Bolter',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 3 + 2 = 5 vs Cool 7-3 = 4 => fail (5 > 4)
    const dice = new FixedDiceProvider([3, 2]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be pinned
    expect(result.pinnedUnitIds).toContain('target');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Pinned);

    // StatusCheckEvent emitted
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].checkType).toBe('pinning');
    expect(statusEvents[0].passed).toBe(false);
    expect(statusEvents[0].statusApplied).toBe(TacticalStatus.Pinned);
  });

  // ── Test 5: Suppressive check — fails → Suppressed ─────────────────────

  it('suppressive check fails: unit becomes Suppressed', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'suppressive',
        modifier: 2,
        source: 'Suppressive (2) from Autocannon',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 4 + 3 = 7 vs Cool 7-2 = 5 => fail (7 > 5)
    const dice = new FixedDiceProvider([4, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be suppressed
    expect(result.suppressedUnitIds).toContain('target');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Suppressed);

    // StatusCheckEvent emitted
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].checkType).toBe('suppressive');
    expect(statusEvents[0].passed).toBe(false);
    expect(statusEvents[0].statusApplied).toBe(TacticalStatus.Suppressed);
  });

  // ── Test 6: Stun check — fails → Stunned ───────────────────────────────

  it('stun check fails: unit becomes Stunned', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'stun',
        modifier: 1,
        source: 'Stun (1) from Graviton Gun',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 4 + 3 = 7 vs Cool 7-1 = 6 => fail (7 > 6)
    const dice = new FixedDiceProvider([4, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be stunned
    expect(result.stunnedUnitIds).toContain('target');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Stunned);

    // StatusCheckEvent emitted
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].checkType).toBe('stun');
    expect(statusEvents[0].passed).toBe(false);
    expect(statusEvents[0].statusApplied).toBe(TacticalStatus.Stunned);
  });

  // ── Test 7: Status check passes — no status applied ────────────────────

  it('status check passes: no status applied', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2) from Bolter',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 2 + 1 = 3 vs Cool 7-2 = 5 => pass (3 <= 5)
    const dice = new FixedDiceProvider([2, 1]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // No statuses applied
    expect(result.pinnedUnitIds).toHaveLength(0);
    expect(result.suppressedUnitIds).toHaveLength(0);
    expect(result.stunnedUnitIds).toHaveLength(0);
    expect(result.routedUnitIds).toHaveLength(0);

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toHaveLength(0);

    // Event should show passed = true, no statusApplied
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].passed).toBe(true);
    expect(statusEvents[0].statusApplied).toBeUndefined();
  });

  // ── Test 8: Multiple checks for same unit — Routed first, skips remaining

  it('unit routes from panic check: remaining status checks skipped', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check',
      },
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 3,
        source: 'Pinning (3) from Heavy Bolter',
      },
      {
        unitId: 'target',
        checkType: 'suppressive',
        modifier: 2,
        source: 'Suppressive (2) from Autocannon',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>([['target', 1]]);

    // Panic check: Roll 5 + 4 = 9 vs Leadership 7 => fail => Routed
    // The pinning and suppressive dice should NOT be consumed
    const dice = new FixedDiceProvider([5, 4]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be routed only
    expect(result.routedUnitIds).toContain('target');
    expect(result.pinnedUnitIds).toHaveLength(0);
    expect(result.suppressedUnitIds).toHaveLength(0);

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Routed);
    expect(targetUnit.statuses).not.toContain(TacticalStatus.Pinned);
    expect(targetUnit.statuses).not.toContain(TacticalStatus.Suppressed);

    // Only the panic check event should be emitted (status checks skipped)
    const panicEvents = result.events.filter(e => e.type === 'panicCheck');
    const statusEvents = result.events.filter(e => e.type === 'statusCheck');
    expect(panicEvents).toHaveLength(1);
    expect(statusEvents).toHaveLength(0);
  });

  // ── Test 9: Multiple units — each resolved independently ────────────────

  it('multiple units: each resolved independently', () => {
    // Create state with two target units
    const army1Units = [
      createUnit('target-a', {
        models: [
          createModel('ta-m0', 36, 20),
          createModel('ta-m1', 38, 20),
          createModel('ta-m2', 40, 20),
          createModel('ta-m3', 42, 20),
        ],
      }),
      createUnit('target-b', {
        models: [
          createModel('tb-m0', 36, 30),
          createModel('tb-m1', 38, 30),
          createModel('tb-m2', 40, 30),
          createModel('tb-m3', 42, 30),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target-a',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2)',
      },
      {
        unitId: 'target-b',
        checkType: 'suppressive',
        modifier: 1,
        source: 'Suppressive (1)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { 'target-a': 4, 'target-b': 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // target-a Pinning: Roll 6 + 5 = 11 vs Cool 7-2 = 5 => fail
    // target-b Suppressive: Roll 2 + 1 = 3 vs Cool 7-1 = 6 => pass
    const dice = new FixedDiceProvider([6, 5, 2, 1]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // target-a should be pinned
    expect(result.pinnedUnitIds).toContain('target-a');
    const unitA = result.state.armies[1].units.find(u => u.id === 'target-a')!;
    expect(unitA.statuses).toContain(TacticalStatus.Pinned);

    // target-b should NOT be suppressed (passed)
    expect(result.suppressedUnitIds).toHaveLength(0);
    const unitB = result.state.armies[1].units.find(u => u.id === 'target-b')!;
    expect(unitB.statuses).toHaveLength(0);
  });

  // ── Test 10: Empty pending checks — no changes ──────────────────────────

  it('empty pending checks: no changes to state', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [];
    const unitSizesAtStart: Record<string, number> = {};
    const casualtiesPerUnit = new Map<string, number>();
    const dice = new FixedDiceProvider([]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // State should be unchanged
    expect(result.state).toEqual(state);
    expect(result.events).toHaveLength(0);
    expect(result.routedUnitIds).toHaveLength(0);
    expect(result.pinnedUnitIds).toHaveLength(0);
    expect(result.suppressedUnitIds).toHaveLength(0);
    expect(result.stunnedUnitIds).toHaveLength(0);
  });

  // ── Test 11: Coherency check — fails → Suppressed ──────────────────────

  it('coherency check fails: unit becomes Suppressed', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'coherency',
        modifier: 0,
        source: 'Coherency check: out of unit coherency',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 5 + 4 = 9 vs Cool 7-0 = 7 => fail (9 > 7)
    const dice = new FixedDiceProvider([5, 4]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Unit should be suppressed
    expect(result.suppressedUnitIds).toContain('target');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Suppressed);

    // StatusCheckEvent emitted with checkType 'suppressive' (mapped from coherency)
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].passed).toBe(false);
    expect(statusEvents[0].statusApplied).toBe(TacticalStatus.Suppressed);
  });

  // ── Test 12: Resolution order — rout checks first, then status checks ──

  it('resolution order: rout checks resolved before status checks', () => {
    const state = createGameState();

    // Provide checks in reverse order: status check first, then panic check
    // The handler should still resolve the panic check first
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 3,
        source: 'Pinning (3)',
      },
      {
        unitId: 'target',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>([['target', 1]]);

    // Panic check: Roll 3 + 3 = 6 vs Leadership 7 => pass
    // Pinning check: Roll 5 + 5 = 10 vs Cool 7-3 = 4 => fail
    const dice = new FixedDiceProvider([3, 3, 5, 5]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Panic passed, so pinning should still resolve
    expect(result.routedUnitIds).toHaveLength(0);
    expect(result.pinnedUnitIds).toContain('target');

    // First event should be panicCheck, second should be statusCheck
    expect(result.events[0].type).toBe('panicCheck');
    expect(result.events[1].type).toBe('statusCheck');
  });

  // ── Test 13: Events emitted correctly for each check type ───────────────

  it('events emitted correctly for panic check', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>([['target', 2]]);

    // Roll 3 + 3 = 6 vs Leadership 7 => pass
    const dice = new FixedDiceProvider([3, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    const panicEvent = result.events[0] as PanicCheckEvent;
    expect(panicEvent.type).toBe('panicCheck');
    expect(panicEvent.unitId).toBe('target');
    expect(panicEvent.roll).toBe(6);
    expect(panicEvent.target).toBe(7);
    expect(panicEvent.modifier).toBe(0);
    expect(panicEvent.passed).toBe(true);
    expect(panicEvent.casualtiesCount).toBe(2);
    expect(panicEvent.unitSizeAtStart).toBe(4);
  });

  it('events emitted correctly for panicRule check', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panicRule',
        modifier: 1,
        source: 'Panic (1) from Volkite',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 3 + 3 = 6 vs Leadership 7-1 = 6 => pass (6 <= 6)
    const dice = new FixedDiceProvider([3, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    const statusEvent = result.events[0] as StatusCheckEvent;
    expect(statusEvent.type).toBe('statusCheck');
    expect(statusEvent.unitId).toBe('target');
    expect(statusEvent.checkType).toBe('panicRule');
    expect(statusEvent.roll).toBe(6);
    expect(statusEvent.target).toBe(6);
    expect(statusEvent.modifier).toBe(1);
    expect(statusEvent.passed).toBe(true);
    expect(statusEvent.statusApplied).toBeUndefined();
  });

  it('events emitted correctly for pinning check that fails', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 4 + 4 = 8 vs Cool 7-2 = 5 => fail
    const dice = new FixedDiceProvider([4, 4]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    const statusEvent = result.events[0] as StatusCheckEvent;
    expect(statusEvent.type).toBe('statusCheck');
    expect(statusEvent.checkType).toBe('pinning');
    expect(statusEvent.roll).toBe(8);
    expect(statusEvent.target).toBe(5);
    expect(statusEvent.modifier).toBe(2);
    expect(statusEvent.passed).toBe(false);
    expect(statusEvent.statusApplied).toBe(TacticalStatus.Pinned);
  });

  // ── Test 14: getFailureStatus maps each type correctly ──────────────────
  // (Covered in the dedicated getFailureStatus describe block above)

  // ── Test 15: Combined scenario ──────────────────────────────────────────

  it('combined scenario: 3 units — one routes, one gets pinned, one passes all', () => {
    // Create state with three target units
    const army1Units = [
      createUnit('unit-rout', {
        models: [
          createModel('ur-m0', 36, 10),
          createModel('ur-m1', 38, 10),
          createModel('ur-m2', 40, 10),
          createModel('ur-m3', 42, 10),
        ],
      }),
      createUnit('unit-pin', {
        models: [
          createModel('up-m0', 36, 20),
          createModel('up-m1', 38, 20),
          createModel('up-m2', 40, 20),
          createModel('up-m3', 42, 20),
        ],
      }),
      createUnit('unit-pass', {
        models: [
          createModel('upa-m0', 36, 30),
          createModel('upa-m1', 38, 30),
          createModel('upa-m2', 40, 30),
          createModel('upa-m3', 42, 30),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const pendingChecks: PendingMoraleCheck[] = [
      // Rout check: unit-rout has panic check
      {
        unitId: 'unit-rout',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check',
      },
      // Also a pinning check for unit-rout (should be skipped since it routes)
      {
        unitId: 'unit-rout',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2)',
      },
      // Status check: unit-pin has pinning
      {
        unitId: 'unit-pin',
        checkType: 'pinning',
        modifier: 3,
        source: 'Pinning (3) from Heavy Bolter',
      },
      // Status check: unit-pass has suppressive (will pass)
      {
        unitId: 'unit-pass',
        checkType: 'suppressive',
        modifier: 1,
        source: 'Suppressive (1) from Autocannon',
      },
    ];

    const unitSizesAtStart: Record<string, number> = {
      'unit-rout': 4,
      'unit-pin': 4,
      'unit-pass': 4,
    };
    const casualtiesPerUnit = new Map<string, number>([['unit-rout', 1]]);

    // Dice sequence:
    // 1. unit-rout panic: 5 + 5 = 10 vs 7 => FAIL (Routed)
    //    unit-rout pinning is SKIPPED (routed)
    // 2. unit-pin pinning: 3 + 2 = 5 vs 7-3=4 => FAIL (5 > 4, Pinned)
    // 3. unit-pass suppressive: 2 + 2 = 4 vs 7-1=6 => PASS (4 <= 6)
    const dice = new FixedDiceProvider([5, 5, 3, 2, 2, 2]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // unit-rout: Routed
    expect(result.routedUnitIds).toContain('unit-rout');
    const routUnit = result.state.armies[1].units.find(u => u.id === 'unit-rout')!;
    expect(routUnit.statuses).toContain(TacticalStatus.Routed);
    expect(routUnit.statuses).not.toContain(TacticalStatus.Pinned);

    // unit-pin: Pinned
    expect(result.pinnedUnitIds).toContain('unit-pin');
    const pinUnit = result.state.armies[1].units.find(u => u.id === 'unit-pin')!;
    expect(pinUnit.statuses).toContain(TacticalStatus.Pinned);

    // unit-pass: no statuses
    expect(result.suppressedUnitIds).toHaveLength(0);
    const passUnit = result.state.armies[1].units.find(u => u.id === 'unit-pass')!;
    expect(passUnit.statuses).toHaveLength(0);

    // Verify events
    // 1st event: panic check for unit-rout (failed)
    expect(result.events[0].type).toBe('panicCheck');
    expect((result.events[0] as PanicCheckEvent).unitId).toBe('unit-rout');
    expect((result.events[0] as PanicCheckEvent).passed).toBe(false);

    // 2nd event: status check for unit-pin (failed)
    expect(result.events[1].type).toBe('statusCheck');
    expect((result.events[1] as StatusCheckEvent).unitId).toBe('unit-pin');
    expect((result.events[1] as StatusCheckEvent).passed).toBe(false);
    expect((result.events[1] as StatusCheckEvent).statusApplied).toBe(TacticalStatus.Pinned);

    // 3rd event: status check for unit-pass (passed)
    expect(result.events[2].type).toBe('statusCheck');
    expect((result.events[2] as StatusCheckEvent).unitId).toBe('unit-pass');
    expect((result.events[2] as StatusCheckEvent).passed).toBe(true);
    expect((result.events[2] as StatusCheckEvent).statusApplied).toBeUndefined();

    // Total: 3 events (panic skipped the pinning for unit-rout)
    expect(result.events).toHaveLength(3);
  });

  // ── Additional edge case: PanicRule passes ──────────────────────────────

  it('panicRule check passes: unit not routed, status checks still resolve', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'panicRule',
        modifier: 1,
        source: 'Panic (1)',
      },
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // PanicRule: Roll 2 + 2 = 4 vs Leadership 7-1 = 6 => pass
    // Pinning: Roll 5 + 5 = 10 vs Cool 7-2 = 5 => fail
    const dice = new FixedDiceProvider([2, 2, 5, 5]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Not routed, but pinned
    expect(result.routedUnitIds).toHaveLength(0);
    expect(result.pinnedUnitIds).toContain('target');

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).not.toContain(TacticalStatus.Routed);
    expect(targetUnit.statuses).toContain(TacticalStatus.Pinned);
  });

  // ── Additional: Non-existent unit in pending checks ─────────────────────

  it('non-existent unit in pending checks: skipped gracefully', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'nonexistent-unit',
        checkType: 'panic',
        modifier: 0,
        source: 'Panic check',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { 'nonexistent-unit': 4 };
    const casualtiesPerUnit = new Map<string, number>([['nonexistent-unit', 1]]);
    const dice = new FixedDiceProvider([]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // No events, no changes
    expect(result.events).toHaveLength(0);
    expect(result.routedUnitIds).toHaveLength(0);
    expect(result.state).toEqual(state);
  });

  // ── Additional: Coherency check passes ──────────────────────────────────

  it('coherency check passes: no status applied', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'coherency',
        modifier: 0,
        source: 'Coherency check',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Roll 3 + 3 = 6 vs Cool 7-0 = 7 => pass (6 <= 7)
    const dice = new FixedDiceProvider([3, 3]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    expect(result.suppressedUnitIds).toHaveLength(0);

    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toHaveLength(0);

    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(1);
    expect(statusEvents[0].passed).toBe(true);
    expect(statusEvents[0].statusApplied).toBeUndefined();
  });

  // ── Additional: Multiple status checks for same unit ────────────────────

  it('multiple status checks for same unit: all resolved, worst applies', () => {
    const state = createGameState();
    const pendingChecks: PendingMoraleCheck[] = [
      {
        unitId: 'target',
        checkType: 'pinning',
        modifier: 2,
        source: 'Pinning (2)',
      },
      {
        unitId: 'target',
        checkType: 'suppressive',
        modifier: 1,
        source: 'Suppressive (1)',
      },
    ];
    const unitSizesAtStart: Record<string, number> = { target: 4 };
    const casualtiesPerUnit = new Map<string, number>();

    // Pinning: Roll 6 + 6 = 12 vs Cool 7-2 = 5 => fail
    // Suppressive: Roll 6 + 6 = 12 vs Cool 7-1 = 6 => fail
    const dice = new FixedDiceProvider([6, 6, 6, 6]);

    const result = resolveShootingMorale(
      state,
      pendingChecks,
      unitSizesAtStart,
      casualtiesPerUnit,
      dice,
    );

    // Both should be tracked
    expect(result.pinnedUnitIds).toContain('target');
    expect(result.suppressedUnitIds).toContain('target');

    // Both statuses applied
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.statuses).toContain(TacticalStatus.Pinned);
    expect(targetUnit.statuses).toContain(TacticalStatus.Suppressed);

    // Two status check events emitted
    const statusEvents = result.events.filter(e => e.type === 'statusCheck') as StatusCheckEvent[];
    expect(statusEvents).toHaveLength(2);
  });
});
