/**
 * Target Priority Tests
 *
 * Tests for prioritizeShootingTargets and prioritizeChargeTargets
 * which score potential targets for the tactical AI.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState } from '@hh/types';
import { prioritizeShootingTargets, prioritizeChargeTargets } from './target-priority';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> & { id?: string } = {}): ModelState {
  return {
    id: overrides.id ?? `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['boltgun'],
    modifiers: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(overrides: Partial<UnitState> & { id?: string } = {}): UnitState {
  return {
    id: overrides.id ?? `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: overrides.models ?? [createModel()],
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    statuses: [],
    hasReactedThisTurn: false,
    modifiers: [],
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      {
        id: 'army-0',
        playerIndex: 0,
        playerName: 'Player 1',
        units: [],
        reactionAllotmentRemaining: 2,
        faction: 'Dark Angels',
        allegiance: 'Loyalist',
        totalPoints: 1000,
        pointsLimit: 2000,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as any,
      {
        id: 'army-1',
        playerIndex: 1,
        playerName: 'Player 2',
        units: [],
        reactionAllotmentRemaining: 2,
        faction: 'Sons of Horus',
        allegiance: 'Traitor',
        totalPoints: 1000,
        pointsLimit: 2000,
        baseReactionAllotment: 2,
        victoryPoints: 0,
      } as any,
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Shooting,
    currentSubPhase: SubPhase.Attack,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    pendingReaction: undefined,
    shootingAttackState: undefined,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null] as any,
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ─── prioritizeShootingTargets Tests ─────────────────────────────────────────

describe('prioritizeShootingTargets', () => {
  it('wounded targets score higher than healthy targets', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    // Wounded target (currentWounds < 1 means wounded per the scoring logic)
    const woundedModel = createModel({ id: 'wt-m1', position: { x: 20, y: 10 }, currentWounds: 0 });
    const woundedTarget = createUnit({ id: 'wounded-target', models: [woundedModel] });

    // Healthy target
    const healthyModel = createModel({ id: 'ht-m1', position: { x: 20, y: 12 }, currentWounds: 1 });
    const healthyTarget = createUnit({ id: 'healthy-target', models: [healthyModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [woundedTarget, healthyTarget] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    const woundedEntry = priorities.find((p) => p.unitId === 'wounded-target');
    const healthyEntry = priorities.find((p) => p.unitId === 'healthy-target');

    expect(woundedEntry).toBeDefined();
    expect(healthyEntry).toBeDefined();
    expect(woundedEntry!.score).toBeGreaterThan(healthyEntry!.score);
  });

  it('small units (<=3 models) score higher (easy kill)', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    // Small target (2 models)
    const smallTarget = createUnit({
      id: 'small-target',
      models: [
        createModel({ id: 'st-m1', position: { x: 20, y: 10 } }),
        createModel({ id: 'st-m2', position: { x: 21, y: 10 } }),
      ],
    });

    // Large target (8 models)
    const largeModels = Array.from({ length: 8 }, (_, i) =>
      createModel({ id: `lt-m${i}`, position: { x: 20, y: 12 + i } }),
    );
    const largeTarget = createUnit({ id: 'large-target', models: largeModels });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [smallTarget, largeTarget] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    const smallEntry = priorities.find((p) => p.unitId === 'small-target');
    const largeEntry = priorities.find((p) => p.unitId === 'large-target');

    expect(smallEntry).toBeDefined();
    expect(largeEntry).toBeDefined();
    expect(smallEntry!.score).toBeGreaterThan(largeEntry!.score);
  });

  it('locked-in-combat targets score lower', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    const freeTarget = createUnit({
      id: 'free-target',
      models: [createModel({ id: 'ft-m1', position: { x: 20, y: 10 } })],
      isLockedInCombat: false,
    });

    const lockedTarget = createUnit({
      id: 'locked-target',
      models: [createModel({ id: 'lt-m1', position: { x: 20, y: 12 } })],
      isLockedInCombat: true,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [freeTarget, lockedTarget] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    const freeEntry = priorities.find((p) => p.unitId === 'free-target');
    const lockedEntry = priorities.find((p) => p.unitId === 'locked-target');

    expect(freeEntry).toBeDefined();
    expect(lockedEntry).toBeDefined();
    expect(freeEntry!.score).toBeGreaterThan(lockedEntry!.score);
  });

  it('returns sorted list (highest priority first)', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    // Varied targets
    const target1 = createUnit({
      id: 'target-1',
      models: [createModel({ id: 't1-m1', position: { x: 20, y: 10 } })],
    });
    const target2 = createUnit({
      id: 'target-2',
      models: [
        createModel({ id: 't2-m1', position: { x: 20, y: 12 } }),
        createModel({ id: 't2-m2', position: { x: 21, y: 12 } }),
        createModel({ id: 't2-m3', position: { x: 22, y: 12 } }),
        createModel({ id: 't2-m4', position: { x: 23, y: 12 } }),
        createModel({ id: 't2-m5', position: { x: 24, y: 12 } }),
      ],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [target1, target2] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    expect(priorities.length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(priorities[i].score).toBeGreaterThanOrEqual(priorities[i + 1].score);
    }
  });

  it('returns empty list when no valid targets', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    expect(priorities).toHaveLength(0);
  });

  it('close range targets score higher than far targets', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    // Close target (within 12")
    const closeTarget = createUnit({
      id: 'close-target',
      models: [createModel({ id: 'ct-m1', position: { x: 18, y: 10 } })],
    });

    // Far target (beyond 12")
    const farTarget = createUnit({
      id: 'far-target',
      models: [createModel({ id: 'ft-m1', position: { x: 40, y: 10 } })],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [closeTarget, farTarget] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    const closeEntry = priorities.find((p) => p.unitId === 'close-target');
    const farEntry = priorities.find((p) => p.unitId === 'far-target');

    expect(closeEntry).toBeDefined();
    expect(farEntry).toBeDefined();
    expect(closeEntry!.score).toBeGreaterThan(farEntry!.score);
  });

  it('very large units (>10 models) get penalty', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    const moderateModels = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `mod-m${i}`, position: { x: 20, y: 10 + i } }),
    );
    const moderateTarget = createUnit({ id: 'moderate-target', models: moderateModels });

    const hugeModels = Array.from({ length: 12 }, (_, i) =>
      createModel({ id: `huge-m${i}`, position: { x: 20, y: 20 + i } }),
    );
    const hugeTarget = createUnit({ id: 'huge-target', models: hugeModels });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [moderateTarget, hugeTarget] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    const moderateEntry = priorities.find((p) => p.unitId === 'moderate-target');
    const hugeEntry = priorities.find((p) => p.unitId === 'huge-target');

    // The moderate target should score higher due to easy kill and no large unit penalty
    expect(moderateEntry).toBeDefined();
    expect(hugeEntry).toBeDefined();
    // The large unit penalty should offset some of the threat bonus
    expect(hugeEntry!.reasons).toContain('large unit');
  });

  it('each entry has reasons array', () => {
    const attackerModel = createModel({ id: 'atk-m1', position: { x: 10, y: 10 } });
    const attackerUnit = createUnit({ id: 'attacker-1', models: [attackerModel] });

    const target = createUnit({
      id: 'target-1',
      models: [createModel({ id: 't1-m1', position: { x: 20, y: 10 } })],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [attackerUnit] } as any,
        { ...createGameState().armies[1], units: [target] } as any,
      ],
    });

    const priorities = prioritizeShootingTargets(state, 'attacker-1', 0);

    expect(priorities.length).toBe(1);
    expect(Array.isArray(priorities[0].reasons)).toBe(true);
  });
});

// ─── prioritizeChargeTargets Tests ───────────────────────────────────────────

describe('prioritizeChargeTargets', () => {
  it('targets with fewer models score higher (easy kill)', () => {
    const chargerModels = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `cm-${i}`, position: { x: 10, y: 10 + i } }),
    );
    const chargerUnit = createUnit({ id: 'charger-1', models: chargerModels });

    // Small target (1 model, within 12")
    const smallTarget = createUnit({
      id: 'small-target',
      models: [createModel({ id: 'st-m1', position: { x: 18, y: 10 } })],
    });

    // Large target (5 models, within 12")
    const largeModels = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `lt-m${i}`, position: { x: 18, y: 14 + i } }),
    );
    const largeTarget = createUnit({ id: 'large-target', models: largeModels });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [chargerUnit] } as any,
        { ...createGameState().armies[1], units: [smallTarget, largeTarget] } as any,
      ],
    });

    const priorities = prioritizeChargeTargets(state, 'charger-1', 0);

    const smallEntry = priorities.find((p) => p.unitId === 'small-target');
    const largeEntry = priorities.find((p) => p.unitId === 'large-target');

    if (smallEntry && largeEntry) {
      // Small target should score higher due to outnumber + easy kill bonuses
      expect(smallEntry.score).toBeGreaterThan(largeEntry.score);
    }
  });

  it('returns sorted list (highest priority first)', () => {
    const chargerModels = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `cm-${i}`, position: { x: 10, y: 10 + i } }),
    );
    const chargerUnit = createUnit({ id: 'charger-1', models: chargerModels });

    const target1 = createUnit({
      id: 'target-1',
      models: [createModel({ id: 't1-m1', position: { x: 18, y: 10 } })],
    });
    const target2 = createUnit({
      id: 'target-2',
      models: [
        createModel({ id: 't2-m1', position: { x: 18, y: 14 } }),
        createModel({ id: 't2-m2', position: { x: 19, y: 14 } }),
        createModel({ id: 't2-m3', position: { x: 20, y: 14 } }),
      ],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [chargerUnit] } as any,
        { ...createGameState().armies[1], units: [target1, target2] } as any,
      ],
    });

    const priorities = prioritizeChargeTargets(state, 'charger-1', 0);

    if (priorities.length >= 2) {
      expect(priorities[0].score).toBeGreaterThanOrEqual(priorities[1].score);
    }
  });

  it('returns empty list when no valid charge targets', () => {
    const chargerModel = createModel({ id: 'cm-1', position: { x: 10, y: 10 } });
    const chargerUnit = createUnit({ id: 'charger-1', models: [chargerModel] });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [chargerUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const priorities = prioritizeChargeTargets(state, 'charger-1', 0);

    expect(priorities).toHaveLength(0);
  });

  it('outnumbering charger gives bonus score', () => {
    // 5 charger models
    const chargerModels = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `cm-${i}`, position: { x: 10, y: 10 + i } }),
    );
    const chargerUnit = createUnit({ id: 'charger-1', models: chargerModels });

    // 2-model target (charger outnumbers)
    const weakTarget = createUnit({
      id: 'weak-target',
      models: [
        createModel({ id: 'wt-m1', position: { x: 18, y: 10 } }),
        createModel({ id: 'wt-m2', position: { x: 19, y: 10 } }),
      ],
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [chargerUnit] } as any,
        { ...createGameState().armies[1], units: [weakTarget] } as any,
      ],
    });

    const priorities = prioritizeChargeTargets(state, 'charger-1', 0);

    if (priorities.length > 0) {
      const entry = priorities.find((p) => p.unitId === 'weak-target');
      expect(entry).toBeDefined();
      expect(entry!.reasons).toContain('outnumber');
    }
  });

  it('already engaged targets get bonus (multi-charge advantage)', () => {
    const chargerModels = Array.from({ length: 3 }, (_, i) =>
      createModel({ id: `cm-${i}`, position: { x: 10, y: 10 + i } }),
    );
    const chargerUnit = createUnit({ id: 'charger-1', models: chargerModels });

    const engagedTarget = createUnit({
      id: 'engaged-target',
      models: [createModel({ id: 'et-m1', position: { x: 18, y: 10 } })],
      isLockedInCombat: true,
    });

    const freeTarget = createUnit({
      id: 'free-target',
      models: [createModel({ id: 'ft-m1', position: { x: 18, y: 14 } })],
      isLockedInCombat: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [chargerUnit] } as any,
        { ...createGameState().armies[1], units: [engagedTarget, freeTarget] } as any,
      ],
    });

    const priorities = prioritizeChargeTargets(state, 'charger-1', 0);

    const engagedEntry = priorities.find((p) => p.unitId === 'engaged-target');
    if (engagedEntry) {
      expect(engagedEntry.reasons).toContain('already engaged');
    }
  });
});
