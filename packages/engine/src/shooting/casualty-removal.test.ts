/**
 * Casualty Removal Tests
 * Reference: HH_Rules_Battle.md — Step 11: Remove Casualties
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  removeCasualties,
  checkPanicThreshold,
  countCasualtiesPerUnit,
  trackMoraleChecks,
} from './casualty-removal';
import type { MoraleCheckType } from './shooting-types';

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
    currentSubPhase: SubPhase.Attack,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── removeCasualties ─────────────────────────────────────────────────────

describe('removeCasualties', () => {
  it('removes a single casualty: model marked destroyed, event emitted', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(state, ['tgt-m0'], unitSizesAtStart);

    // Model should be marked as destroyed
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    const destroyedModel = targetUnit.models.find(m => m.id === 'tgt-m0')!;
    expect(destroyedModel.isDestroyed).toBe(true);
    expect(destroyedModel.currentWounds).toBe(0);

    // Other model should be unaffected
    const aliveModel = targetUnit.models.find(m => m.id === 'tgt-m1')!;
    expect(aliveModel.isDestroyed).toBe(false);
    expect(aliveModel.currentWounds).toBe(1);

    // Should emit a CasualtyRemovedEvent
    const casualtyEvents = result.events.filter(e => e.type === 'casualtyRemoved');
    expect(casualtyEvents).toHaveLength(1);
    expect(casualtyEvents[0]).toMatchObject({
      type: 'casualtyRemoved',
      modelId: 'tgt-m0',
      unitId: 'target',
    });

    // Unit not completely destroyed
    expect(result.destroyedUnitIds).toHaveLength(0);
  });

  it('removes multiple casualties from the same unit: all marked destroyed', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(state, ['tgt-m0', 'tgt-m1'], unitSizesAtStart);

    // Both models should be destroyed
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.models[0].isDestroyed).toBe(true);
    expect(targetUnit.models[0].currentWounds).toBe(0);
    expect(targetUnit.models[1].isDestroyed).toBe(true);
    expect(targetUnit.models[1].currentWounds).toBe(0);

    // Should emit two CasualtyRemovedEvents
    const casualtyEvents = result.events.filter(e => e.type === 'casualtyRemoved');
    expect(casualtyEvents).toHaveLength(2);
  });

  it('unit completely destroyed: UnitDestroyedEvent emitted', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(state, ['tgt-m0', 'tgt-m1'], unitSizesAtStart);

    // Unit should be in the destroyedUnitIds list
    expect(result.destroyedUnitIds).toContain('target');

    // Should emit a UnitDestroyedEvent
    const unitDestroyedEvents = result.events.filter(e => e.type === 'unitDestroyed');
    expect(unitDestroyedEvents).toHaveLength(1);
    expect(unitDestroyedEvents[0]).toMatchObject({
      type: 'unitDestroyed',
      unitId: 'target',
    });
  });

  it('casualties from multiple units: correct tracking per unit', () => {
    // Create state with two target units
    const army1Units = [
      createUnit('target-a', {
        models: [
          createModel('ta-m0', 36, 20),
          createModel('ta-m1', 38, 20),
          createModel('ta-m2', 40, 20),
        ],
      }),
      createUnit('target-b', {
        models: [
          createModel('tb-m0', 36, 30),
          createModel('tb-m1', 38, 30),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const unitSizesAtStart: Record<string, number> = {
      'target-a': 3,
      'target-b': 2,
    };

    // Remove 1 from target-a and 1 from target-b
    const result = removeCasualties(
      state,
      ['ta-m0', 'tb-m0'],
      unitSizesAtStart,
    );

    // Events should include casualties from both units
    const casualtyEvents = result.events.filter(e => e.type === 'casualtyRemoved');
    expect(casualtyEvents).toHaveLength(2);

    const unitIds = casualtyEvents.map(e => (e as { unitId: string }).unitId);
    expect(unitIds).toContain('target-a');
    expect(unitIds).toContain('target-b');

    // Neither unit fully destroyed
    expect(result.destroyedUnitIds).toHaveLength(0);
  });

  it('empty casualty list: no changes', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(state, [], unitSizesAtStart);

    // State should be unchanged
    expect(result.state).toEqual(state);
    expect(result.events).toHaveLength(0);
    expect(result.destroyedUnitIds).toHaveLength(0);
    expect(result.pendingMoraleChecks).toHaveLength(0);
  });

  it('duplicate model IDs in casualty list: handle gracefully (only process once)', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    // Pass the same model ID twice
    const result = removeCasualties(
      state,
      ['tgt-m0', 'tgt-m0'],
      unitSizesAtStart,
    );

    // Should only emit one CasualtyRemovedEvent for tgt-m0
    const casualtyEvents = result.events.filter(e => e.type === 'casualtyRemoved');
    expect(casualtyEvents).toHaveLength(1);
    expect(casualtyEvents[0]).toMatchObject({
      type: 'casualtyRemoved',
      modelId: 'tgt-m0',
      unitId: 'target',
    });

    // Model should be destroyed
    const targetUnit = result.state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetUnit.models[0].isDestroyed).toBe(true);

    // Other model untouched
    expect(targetUnit.models[1].isDestroyed).toBe(false);
  });

  it('model already destroyed in state: skip silently, no duplicate events', () => {
    // Create state where tgt-m0 is already destroyed
    const army1Units = [
      createUnit('target', {
        models: [
          createModel('tgt-m0', 36, 24, true), // Already destroyed
          createModel('tgt-m1', 38, 24),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(state, ['tgt-m0'], unitSizesAtStart);

    // No CasualtyRemovedEvent should be emitted since model was already destroyed
    expect(result.events).toHaveLength(0);
    expect(result.destroyedUnitIds).toHaveLength(0);
  });

  it('nonexistent model ID: skip silently', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    const result = removeCasualties(
      state,
      ['nonexistent-model'],
      unitSizesAtStart,
    );

    // No events, no changes
    expect(result.events).toHaveLength(0);
    expect(result.destroyedUnitIds).toHaveLength(0);
  });

  it('destroyed units do NOT get pending morale checks', () => {
    const state = createGameState();
    const unitSizesAtStart: Record<string, number> = { target: 2 };

    // Destroy both models in target (100% casualties >= 25%)
    const result = removeCasualties(
      state,
      ['tgt-m0', 'tgt-m1'],
      unitSizesAtStart,
    );

    // Unit is completely destroyed
    expect(result.destroyedUnitIds).toContain('target');

    // Destroyed units should NOT have pending morale checks
    const moraleForTarget = result.pendingMoraleChecks.filter(
      c => c.unitId === 'target',
    );
    expect(moraleForTarget).toHaveLength(0);
  });

  it('surviving unit with >= 25% casualties gets a panic check', () => {
    // Create a 4-model unit and kill 1 (25% exactly)
    const army1Units = [
      createUnit('target', {
        models: [
          createModel('tgt-m0', 36, 20),
          createModel('tgt-m1', 38, 20),
          createModel('tgt-m2', 40, 20),
          createModel('tgt-m3', 42, 20),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const unitSizesAtStart: Record<string, number> = { target: 4 };

    // Kill 1 of 4 models (25% = threshold)
    const result = removeCasualties(state, ['tgt-m0'], unitSizesAtStart);

    // Should have a panic check for the surviving unit
    const panicChecks = result.pendingMoraleChecks.filter(
      c => c.unitId === 'target' && c.checkType === 'panic',
    );
    expect(panicChecks).toHaveLength(1);
  });

  it('surviving unit with < 25% casualties gets no panic check', () => {
    // Create a 10-model unit and kill 2 (20%)
    const models: ModelState[] = [];
    for (let i = 0; i < 10; i++) {
      models.push(createModel(`tgt-m${i}`, 36 + i * 2, 20));
    }

    const army1Units = [
      createUnit('target', { models }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const unitSizesAtStart: Record<string, number> = { target: 10 };

    // Kill 2 of 10 models (20% < 25%)
    const result = removeCasualties(state, ['tgt-m0', 'tgt-m1'], unitSizesAtStart);

    // Should NOT have a panic check
    const panicChecks = result.pendingMoraleChecks.filter(
      c => c.unitId === 'target' && c.checkType === 'panic',
    );
    expect(panicChecks).toHaveLength(0);
  });
});

// ─── checkPanicThreshold ──────────────────────────────────────────────────

describe('checkPanicThreshold', () => {
  it('3 casualties from 10-model unit (30% >= 25%): panic check needed', () => {
    expect(checkPanicThreshold(3, 10)).toBe(true);
  });

  it('2 casualties from 10-model unit (20% < 25%): no panic check', () => {
    expect(checkPanicThreshold(2, 10)).toBe(false);
  });

  it('3 casualties from 12-model unit (25% = 25%): panic check needed (exact threshold)', () => {
    expect(checkPanicThreshold(3, 12)).toBe(true);
  });

  it('1 casualty from 4-model unit (25% = 25%): panic check needed', () => {
    expect(checkPanicThreshold(1, 4)).toBe(true);
  });

  it('1 casualty from 5-model unit (20% < 25%): no panic check', () => {
    expect(checkPanicThreshold(1, 5)).toBe(false);
  });

  it('0 casualties: no panic check', () => {
    expect(checkPanicThreshold(0, 10)).toBe(false);
  });

  it('unit size 0 at start: no panic check', () => {
    expect(checkPanicThreshold(1, 0)).toBe(false);
  });

  it('unit size 1, 1 casualty (100% >= 25%): panic check needed', () => {
    expect(checkPanicThreshold(1, 1)).toBe(true);
  });

  it('2 casualties from 7-model unit (28.6% >= 25%): panic check needed', () => {
    // 2/7 = ~28.6% which is >= 25%
    // Using integer arithmetic: 2*4=8 >= 7, true
    expect(checkPanicThreshold(2, 7)).toBe(true);
  });

  it('negative casualties: no panic check', () => {
    expect(checkPanicThreshold(-1, 10)).toBe(false);
  });
});

// ─── countCasualtiesPerUnit ──────────────────────────────────────────────

describe('countCasualtiesPerUnit', () => {
  it('correctly maps models to their units', () => {
    const state = createGameState();

    const counts = countCasualtiesPerUnit(state, ['tgt-m0', 'tgt-m1']);

    expect(counts.get('target')).toBe(2);
    expect(counts.size).toBe(1);
  });

  it('models from different units: separate counts', () => {
    const army1Units = [
      createUnit('target-a', {
        models: [
          createModel('ta-m0', 36, 20),
          createModel('ta-m1', 38, 20),
        ],
      }),
      createUnit('target-b', {
        models: [
          createModel('tb-m0', 36, 30),
          createModel('tb-m1', 38, 30),
        ],
      }),
    ];

    const state = createGameState({
      armies: [
        createArmy(0, [createUnit('attacker')]),
        createArmy(1, army1Units),
      ],
    });

    const counts = countCasualtiesPerUnit(state, ['ta-m0', 'tb-m0', 'tb-m1']);

    expect(counts.get('target-a')).toBe(1);
    expect(counts.get('target-b')).toBe(2);
    expect(counts.size).toBe(2);
  });

  it('empty casualty list: empty map', () => {
    const state = createGameState();

    const counts = countCasualtiesPerUnit(state, []);

    expect(counts.size).toBe(0);
  });

  it('nonexistent model IDs: skipped', () => {
    const state = createGameState();

    const counts = countCasualtiesPerUnit(state, ['nonexistent-1', 'nonexistent-2']);

    expect(counts.size).toBe(0);
  });

  it('duplicate model IDs: counted only once', () => {
    const state = createGameState();

    const counts = countCasualtiesPerUnit(state, ['tgt-m0', 'tgt-m0', 'tgt-m0']);

    expect(counts.get('target')).toBe(1);
  });

  it('models from both armies', () => {
    const state = createGameState();

    const counts = countCasualtiesPerUnit(state, ['atk-m0', 'tgt-m0']);

    expect(counts.get('attacker')).toBe(1);
    expect(counts.get('target')).toBe(1);
    expect(counts.size).toBe(2);
  });
});

// ─── trackMoraleChecks ──────────────────────────────────────────────────

describe('trackMoraleChecks', () => {
  it('panic check generated when >= 25% casualties', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 3);

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, new Map());

    const panicChecks = checks.filter(c => c.checkType === 'panic');
    expect(panicChecks).toHaveLength(1);
    expect(panicChecks[0].unitId).toBe('unit-a');
    expect(panicChecks[0].modifier).toBe(0);
  });

  it('no panic check when < 25% casualties', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 2);

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, new Map());

    const panicChecks = checks.filter(c => c.checkType === 'panic');
    expect(panicChecks).toHaveLength(0);
  });

  it('weapon morale rules added for Pinning', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 1);

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const weaponMoraleRules = new Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>();
    weaponMoraleRules.set('unit-a', [
      { checkType: 'pinning', modifier: 3, source: 'Pinning (3) from Heavy Bolter' },
    ]);

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, weaponMoraleRules);

    const pinningChecks = checks.filter(c => c.checkType === 'pinning');
    expect(pinningChecks).toHaveLength(1);
    expect(pinningChecks[0].modifier).toBe(3);
    expect(pinningChecks[0].source).toBe('Pinning (3) from Heavy Bolter');
  });

  it('weapon morale rules added for Suppressive', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 1);

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const weaponMoraleRules = new Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>();
    weaponMoraleRules.set('unit-a', [
      { checkType: 'suppressive', modifier: 2, source: 'Suppressive (2) from Autocannon' },
    ]);

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, weaponMoraleRules);

    const suppressiveChecks = checks.filter(c => c.checkType === 'suppressive');
    expect(suppressiveChecks).toHaveLength(1);
    expect(suppressiveChecks[0].modifier).toBe(2);
    expect(suppressiveChecks[0].source).toBe('Suppressive (2) from Autocannon');
  });

  it('multiple weapon rules for the same unit', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 1);

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const weaponMoraleRules = new Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>();
    weaponMoraleRules.set('unit-a', [
      { checkType: 'pinning', modifier: 3, source: 'Pinning (3) from Heavy Bolter' },
      { checkType: 'suppressive', modifier: 2, source: 'Suppressive (2) from Autocannon' },
    ]);

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, weaponMoraleRules);

    // Should have both weapon rules (no panic since 1/10 = 10%)
    const pinning = checks.filter(c => c.checkType === 'pinning');
    const suppressive = checks.filter(c => c.checkType === 'suppressive');
    expect(pinning).toHaveLength(1);
    expect(suppressive).toHaveLength(1);
  });

  it('weapon rules for unit not in casualties map still included', () => {
    const casualtiesPerUnit = new Map<string, number>();
    // No casualties for unit-b

    const unitSizesAtStart: Record<string, number> = { 'unit-b': 5 };

    const weaponMoraleRules = new Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>();
    weaponMoraleRules.set('unit-b', [
      { checkType: 'pinning', modifier: 4, source: 'Pinning (4) from Missile Launcher' },
    ]);

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, weaponMoraleRules);

    // Should include the pinning check even without casualties
    const pinning = checks.filter(c => c.checkType === 'pinning');
    expect(pinning).toHaveLength(1);
    expect(pinning[0].unitId).toBe('unit-b');
  });

  it('both panic and weapon rules for the same unit', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 3); // 3/10 = 30% >= 25% => panic

    const unitSizesAtStart: Record<string, number> = { 'unit-a': 10 };

    const weaponMoraleRules = new Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>();
    weaponMoraleRules.set('unit-a', [
      { checkType: 'pinning', modifier: 3, source: 'Pinning (3) from Heavy Bolter' },
    ]);

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, weaponMoraleRules);

    const panic = checks.filter(c => c.checkType === 'panic');
    const pinning = checks.filter(c => c.checkType === 'pinning');
    expect(panic).toHaveLength(1);
    expect(pinning).toHaveLength(1);
  });

  it('multiple units with different casualties', () => {
    const casualtiesPerUnit = new Map<string, number>();
    casualtiesPerUnit.set('unit-a', 3); // 3/10 = 30% => panic
    casualtiesPerUnit.set('unit-b', 1); // 1/10 = 10% => no panic

    const unitSizesAtStart: Record<string, number> = {
      'unit-a': 10,
      'unit-b': 10,
    };

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, new Map());

    const panicA = checks.filter(c => c.unitId === 'unit-a' && c.checkType === 'panic');
    const panicB = checks.filter(c => c.unitId === 'unit-b' && c.checkType === 'panic');
    expect(panicA).toHaveLength(1);
    expect(panicB).toHaveLength(0);
  });

  it('no casualties, no weapon rules: empty result', () => {
    const casualtiesPerUnit = new Map<string, number>();
    const unitSizesAtStart: Record<string, number> = {};

    const checks = trackMoraleChecks(casualtiesPerUnit, unitSizesAtStart, new Map());

    expect(checks).toHaveLength(0);
  });
});
