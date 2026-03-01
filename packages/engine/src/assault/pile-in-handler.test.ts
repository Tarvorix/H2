/**
 * Pile-In Handler Tests
 * Tests for pile-in movement during the Fight Sub-Phase.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase, Pile-In
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
  resolvePileIn,
  resolveFinalPileIn,
  getModelsNeedingPileIn,
  DEFAULT_PILE_IN_INITIATIVE,
} from './pile-in-handler';
import type { CombatState } from './assault-types';
import type { PileInMoveEvent } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * CONTACT_THRESHOLD from game-queries.ts:
 * BASE_RADIUS_INCHES = 0.63, CONTACT_THRESHOLD = 0.63 * 2 + 0.01 = 1.27
 */
const CONTACT_THRESHOLD = 1.27;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function createModel(id: string, x = 0, y = 0, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
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
    createUnit('unit-a', {
      models: [
        createModel('ua-m0', 0, 0),
        createModel('ua-m1', 0, 1),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-b', {
      models: [
        createModel('ub-m0', 10, 0),
        createModel('ub-m1', 10, 1),
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
    currentSubPhase: SubPhase.Fight,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

function createCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    combatId: 'combat-1',
    activePlayerUnitIds: ['unit-a'],
    reactivePlayerUnitIds: ['unit-b'],
    initiativeSteps: [],
    currentInitiativeStepIndex: 0,
    activePlayerCRP: 0,
    reactivePlayerCRP: 0,
    challengeState: null,
    activePlayerCasualties: [],
    reactivePlayerCasualties: [],
    resolved: false,
    isMassacre: false,
    massacreWinnerPlayerIndex: null,
    ...overrides,
  };
}

// ─── resolvePileIn ──────────────────────────────────────────────────────────

describe('resolvePileIn', () => {
  it('should move model toward closest enemy', () => {
    // Active model at (0,0), enemy models at (10,0) and (10,1)
    // Closest enemy is ub-m0 at (10,0) — distance 10
    const state = createGameState();
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.modelsMoved).toBe(1);
    expect(result.events).toHaveLength(1);

    // Model should have moved toward the enemy (positive x direction)
    const updatedUnit = result.state.armies[0].units.find(u => u.id === 'unit-a')!;
    const updatedModel = updatedUnit.models.find(m => m.id === 'ua-m0')!;
    expect(updatedModel.position.x).toBeGreaterThan(0);
    // Should have moved up to 4 inches toward x=10
    expect(updatedModel.position.x).toBeCloseTo(4, 1);
    expect(updatedModel.position.y).toBeCloseTo(0, 5);
  });

  it('should not move model if no enemy targets exist', () => {
    // All enemy models are destroyed
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-b', {
      models: [
        createModel('ub-m0', 10, 0, { isDestroyed: true, currentWounds: 0 }),
        createModel('ub-m1', 10, 1, { isDestroyed: true, currentWounds: 0 }),
      ],
    });
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.modelsMoved).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state); // State unchanged
  });

  it('should respect initiative distance limit', () => {
    // Model at (0,0), enemy at (10,0), initiative of 2
    // Should move at most 2 inches
    const state = createGameState();
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 2);

    expect(result.modelsMoved).toBe(1);
    const updatedUnit = result.state.armies[0].units.find(u => u.id === 'unit-a')!;
    const updatedModel = updatedUnit.models.find(m => m.id === 'ua-m0')!;
    // Should have moved at most 2 inches
    expect(updatedModel.position.x).toBeLessThanOrEqual(2.01);
    expect(updatedModel.position.x).toBeGreaterThan(0);
  });

  it('should generate PileInMoveEvent', () => {
    const state = createGameState();
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.events).toHaveLength(1);
    const event = result.events[0] as PileInMoveEvent;
    expect(event.type).toBe('pileInMove');
    expect(event.modelId).toBe('ua-m0');
    expect(event.unitId).toBe('unit-a');
    expect(event.from).toEqual({ x: 0, y: 0 });
    expect(event.to.x).toBeGreaterThan(0);
    expect(event.distance).toBeGreaterThan(0);
    expect(event.distance).toBeLessThanOrEqual(4.01);
  });

  it('should not move if model is already close to enemy', () => {
    // Place model very close to enemy — within base contact threshold
    // Base contact threshold ~ 1.27 inches
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 9, 0), // ~1 inch from enemy at (10,0)
        createModel('ua-m1', 0, 1),
      ],
    });
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    // moveToward stops at base contact threshold. Distance from (9,0) to (10,0) is 1
    // which is less than CONTACT_THRESHOLD (~1.27), so moveToward will stop the model
    // near or at its current position (stopDist = max(0, 1 - 1.27) = 0).
    // distanceMoved < 0.001, so the model should not move.
    expect(result.modelsMoved).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it('should handle unit not found in combat sides', () => {
    const state = createGameState();
    const combat = createCombatState({
      activePlayerUnitIds: ['unit-x'],
      reactivePlayerUnitIds: ['unit-y'],
    });

    // unit-a is not in combat sides
    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.modelsMoved).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.state).toBe(state);
  });

  it('should handle destroyed model gracefully', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 0, 0, { isDestroyed: true, currentWounds: 0 }),
        createModel('ua-m1', 0, 1),
      ],
    });
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.modelsMoved).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it('should move reactive player model toward active player enemy', () => {
    // Reactive player model at (10,0), active player model at (0,0)
    const state = createGameState();
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ub-m0', 'unit-b', combat, 4);

    expect(result.modelsMoved).toBe(1);
    const updatedUnit = result.state.armies[1].units.find(u => u.id === 'unit-b')!;
    const updatedModel = updatedUnit.models.find(m => m.id === 'ub-m0')!;
    // Should have moved toward (0,0) — x should be less than 10
    expect(updatedModel.position.x).toBeLessThan(10);
    expect(updatedModel.position.x).toBeCloseTo(6, 1);
  });

  it('should handle unit not found in game state gracefully', () => {
    const state = createGameState();
    const combat = createCombatState({
      activePlayerUnitIds: ['nonexistent-unit'],
      reactivePlayerUnitIds: ['unit-b'],
    });

    const result = resolvePileIn(state, 'ne-m0', 'nonexistent-unit', combat, 4);

    expect(result.modelsMoved).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  it('should move toward the closest of multiple enemies', () => {
    // Active model at (0,0), two enemy models: one at (5,0) and one at (10,0)
    // Should move toward the closer one at (5,0)
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-b', {
      models: [
        createModel('ub-m0', 5, 0),
        createModel('ub-m1', 10, 0),
      ],
    });
    const combat = createCombatState();

    const result = resolvePileIn(state, 'ua-m0', 'unit-a', combat, 4);

    expect(result.modelsMoved).toBe(1);
    const event = result.events[0] as PileInMoveEvent;
    // Moving toward (5,0) from (0,0), should stop at base contact threshold
    // distance is 5, maxDist is 4, so should move 4 inches: final position ~(3.73, 0) due to base contact calc
    // or (4, 0) if target is beyond move range
    // 5 > 4 + 1.27 = 5.27? No, 5 < 5.27, so it's within range and should stop at base contact
    // stopDist = max(0, 5 - 1.27) = 3.73
    expect(event.to.x).toBeCloseTo(3.73, 1);
    expect(event.to.y).toBeCloseTo(0, 5);
  });
});

// ─── resolveFinalPileIn ─────────────────────────────────────────────────────

describe('resolveFinalPileIn', () => {
  it('should move active player models first, then reactive', () => {
    // Active model at (0,0), reactive model at (10,0)
    // Both far from each other, both need pile-in
    const state = createGameState();
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // Both sides should have models that moved
    // Active player models move first, then reactive player models
    expect(result.events.length).toBeGreaterThan(0);

    // Check that active player model events come before reactive player model events
    const activeEvents = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a',
    );
    const reactiveEvents = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-b',
    );

    if (activeEvents.length > 0 && reactiveEvents.length > 0) {
      const lastActiveIdx = result.events.lastIndexOf(activeEvents[activeEvents.length - 1]);
      const firstReactiveIdx = result.events.indexOf(reactiveEvents[0]);
      expect(lastActiveIdx).toBeLessThan(firstReactiveIdx);
    }
  });

  it('should only move models not in base contact', () => {
    // Place active model already in base contact with enemy
    // ua-m0 at (9.5, 0), enemy at (10, 0) — distance 0.5 < CONTACT_THRESHOLD ~1.27
    // ua-m1 at (0, 1) — far away, needs pile in
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 9.5, 0), // in base contact with ub-m0 at (10,0)
        createModel('ua-m1', 0, 1),   // far away, needs pile-in
      ],
    });
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // ua-m0 should NOT have an event (already in base contact)
    // ua-m1 should have an event (needs to pile in)
    const activeEvents = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a',
    );
    const activeModelIds = activeEvents.map(e => (e as PileInMoveEvent).modelId);
    expect(activeModelIds).not.toContain('ua-m0');
    expect(activeModelIds).toContain('ua-m1');
  });

  it('should skip destroyed models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 0, 0, { isDestroyed: true, currentWounds: 0 }),
        createModel('ua-m1', 0, 1),
      ],
    });
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // Only ua-m1 should have moved (ua-m0 is destroyed)
    const activeEvents = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a',
    );
    const modelIds = activeEvents.map(e => (e as PileInMoveEvent).modelId);
    expect(modelIds).not.toContain('ua-m0');
    // ua-m1 should have moved
    expect(modelIds).toContain('ua-m1');
  });

  it('should handle no models needing pile-in', () => {
    // All models already in base contact
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 9.5, 0),  // in base contact with ub-m0 at (10,0)
        createModel('ua-m1', 9.5, 1),  // in base contact with ub-m1 at (10,1)
      ],
    });
    state.armies[1].units[0] = createUnit('unit-b', {
      models: [
        createModel('ub-m0', 10, 0),  // in base contact with ua-m0
        createModel('ub-m1', 10, 1),  // in base contact with ua-m1
      ],
    });
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    expect(result.events).toHaveLength(0);
    expect(result.totalModelsMoved).toBe(0);
  });

  it('should return correct totalModelsMoved count', () => {
    // Both active models far from enemy — both should move
    const state = createGameState();
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // Both ua-m0 and ua-m1 from active side should move
    // Both ub-m0 and ub-m1 from reactive side should move
    // Total should be 4 (though reactive models might already be close after active moves)
    expect(result.totalModelsMoved).toBeGreaterThanOrEqual(2);
    // Events should match totalModelsMoved
    expect(result.events.length).toBe(result.totalModelsMoved);
  });

  it('should generate events for each model that moves', () => {
    const state = createGameState();
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // Each event should be a PileInMoveEvent
    for (const event of result.events) {
      const pileInEvent = event as PileInMoveEvent;
      expect(pileInEvent.type).toBe('pileInMove');
      expect(pileInEvent.modelId).toBeDefined();
      expect(pileInEvent.unitId).toBeDefined();
      expect(pileInEvent.from).toBeDefined();
      expect(pileInEvent.to).toBeDefined();
      expect(pileInEvent.distance).toBeGreaterThan(0);
    }
  });

  it('should use DEFAULT_PILE_IN_INITIATIVE as the move distance', () => {
    expect(DEFAULT_PILE_IN_INITIATIVE).toBe(4);

    // Model at (0,0), enemy at (20,0) — far away
    // With initiative 4, model should move 4 inches
    const state = createGameState();
    state.armies[1].units[0] = createUnit('unit-b', {
      models: [
        createModel('ub-m0', 20, 0),
        createModel('ub-m1', 20, 1),
      ],
    });
    const combat = createCombatState();

    const result = resolveFinalPileIn(state, combat);

    // Active models should move exactly DEFAULT_PILE_IN_INITIATIVE (4) inches
    const activeEvents = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a',
    );
    for (const evt of activeEvents) {
      const pileInEvent = evt as PileInMoveEvent;
      expect(pileInEvent.distance).toBeCloseTo(DEFAULT_PILE_IN_INITIATIVE, 1);
    }
  });

  it('should handle multiple units per side', () => {
    // Two active units, one reactive unit
    const state = createGameState();
    state.armies[0] = createArmy(0, [
      createUnit('unit-a1', {
        models: [createModel('ua1-m0', 0, 0)],
      }),
      createUnit('unit-a2', {
        models: [createModel('ua2-m0', 0, 5)],
      }),
    ]);
    state.armies[1] = createArmy(1, [
      createUnit('unit-b', {
        models: [
          createModel('ub-m0', 10, 0),
          createModel('ub-m1', 10, 5),
        ],
      }),
    ]);

    const combat = createCombatState({
      activePlayerUnitIds: ['unit-a1', 'unit-a2'],
      reactivePlayerUnitIds: ['unit-b'],
    });

    const result = resolveFinalPileIn(state, combat);

    // Both active units' models and the reactive unit's models should move
    const activeA1Events = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a1',
    );
    const activeA2Events = result.events.filter(
      e => (e as PileInMoveEvent).unitId === 'unit-a2',
    );
    expect(activeA1Events.length).toBeGreaterThanOrEqual(1);
    expect(activeA2Events.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── getModelsNeedingPileIn ─────────────────────────────────────────────────

describe('getModelsNeedingPileIn', () => {
  it('should return models not in base contact with enemies', () => {
    // Active models at (0,0) and (0,1), enemy models at (10,0) and (10,1)
    // All active models are far from enemies
    const state = createGameState();
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.modelId)).toContain('ua-m0');
    expect(result.map(r => r.modelId)).toContain('ua-m1');
  });

  it('should NOT include models already in base contact', () => {
    // ua-m0 at (9.5, 0), enemy ub-m0 at (10, 0) — distance 0.5 < CONTACT_THRESHOLD
    // ua-m1 at (0, 1) — far away
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 10 - CONTACT_THRESHOLD + 0.1, 0), // within threshold
        createModel('ua-m1', 0, 1), // far away
      ],
    });
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    const modelIds = result.map(r => r.modelId);
    expect(modelIds).not.toContain('ua-m0');
    expect(modelIds).toContain('ua-m1');
  });

  it('should NOT include destroyed models', () => {
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 0, 0, { isDestroyed: true, currentWounds: 0 }),
        createModel('ua-m1', 0, 1),
      ],
    });
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    const modelIds = result.map(r => r.modelId);
    expect(modelIds).not.toContain('ua-m0');
    // ua-m1 is alive and far from enemy, should be included
    expect(modelIds).toContain('ua-m1');
  });

  it('should return empty when all models are in base contact', () => {
    // All active models are within base contact of enemies
    const state = createGameState();
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 10 - CONTACT_THRESHOLD + 0.1, 0), // near ub-m0 at (10,0)
        createModel('ua-m1', 10 - CONTACT_THRESHOLD + 0.1, 1), // near ub-m1 at (10,1)
      ],
    });
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    expect(result).toHaveLength(0);
  });

  it('should handle empty unit list', () => {
    const state = createGameState();
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, []);

    expect(result).toHaveLength(0);
  });

  it('should return models with correct modelId and unitId', () => {
    const state = createGameState();
    const combat = createCombatState();

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    for (const entry of result) {
      expect(entry).toHaveProperty('modelId');
      expect(entry).toHaveProperty('unitId');
      expect(entry.unitId).toBe('unit-a');
      expect(typeof entry.modelId).toBe('string');
      expect(typeof entry.unitId).toBe('string');
    }
  });

  it('should handle unit not found in game state', () => {
    const state = createGameState();
    const combat = createCombatState({
      activePlayerUnitIds: ['nonexistent-unit'],
      reactivePlayerUnitIds: ['unit-b'],
    });

    const result = getModelsNeedingPileIn(state, combat, ['nonexistent-unit']);

    expect(result).toHaveLength(0);
  });

  it('should return models from multiple units', () => {
    const state = createGameState();
    state.armies[0] = createArmy(0, [
      createUnit('unit-a1', {
        models: [createModel('ua1-m0', 0, 0)],
      }),
      createUnit('unit-a2', {
        models: [createModel('ua2-m0', 0, 5)],
      }),
    ]);
    const combat = createCombatState({
      activePlayerUnitIds: ['unit-a1', 'unit-a2'],
      reactivePlayerUnitIds: ['unit-b'],
    });

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.modelId)).toContain('ua1-m0');
    expect(result.map(r => r.modelId)).toContain('ua2-m0');
    expect(result.find(r => r.modelId === 'ua1-m0')!.unitId).toBe('unit-a1');
    expect(result.find(r => r.modelId === 'ua2-m0')!.unitId).toBe('unit-a2');
  });

  it('should check base contact against all enemy units', () => {
    // Active model in base contact with one enemy unit but not the other
    // Since the function checks if model is in base contact with ANY enemy unit,
    // being in contact with one is sufficient
    const state = createGameState();
    state.armies[1] = createArmy(1, [
      createUnit('unit-b1', {
        models: [createModel('ub1-m0', 10, 0)],
      }),
      createUnit('unit-b2', {
        models: [createModel('ub2-m0', 20, 0)],
      }),
    ]);
    state.armies[0].units[0] = createUnit('unit-a', {
      models: [
        createModel('ua-m0', 10 - CONTACT_THRESHOLD + 0.1, 0), // in base contact with ub1-m0
        createModel('ua-m1', 5, 0), // not in contact with any
      ],
    });

    const combat = createCombatState({
      activePlayerUnitIds: ['unit-a'],
      reactivePlayerUnitIds: ['unit-b1', 'unit-b2'],
    });

    const result = getModelsNeedingPileIn(state, combat, combat.activePlayerUnitIds);

    const modelIds = result.map(r => r.modelId);
    // ua-m0 is in base contact with ub1-m0, so NOT needing pile-in
    expect(modelIds).not.toContain('ua-m0');
    // ua-m1 is not in base contact with any enemy, needs pile-in
    expect(modelIds).toContain('ua-m1');
  });
});

// ─── DEFAULT_PILE_IN_INITIATIVE ─────────────────────────────────────────────

describe('DEFAULT_PILE_IN_INITIATIVE', () => {
  it('should be 4 (standard Space Marine initiative)', () => {
    expect(DEFAULT_PILE_IN_INITIATIVE).toBe(4);
  });
});
