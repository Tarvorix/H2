/**
 * Deployment AI Tests
 *
 * Tests for the generateDeploymentPlacement function which handles
 * pre-game unit deployment for the AI player.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import { generateDeploymentPlacement } from './deployment-ai';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['boltgun'],
    modifiers: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: [createModel()],
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: false,
    engagedWithUnitIds: [],
    statuses: [],
    hasReactedThisTurn: false,
    modifiers: [],
    ...overrides,
  };
}

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: 'Dark Angels' as ArmyState['faction'],
    allegiance: 'Loyalist' as ArmyState['allegiance'],
    units: [],
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0, units: [] }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: 'Sons of Horus' as ArmyState['faction'],
        allegiance: 'Traitor' as ArmyState['allegiance'],
        units: [],
      }),
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ─── Basic Deployment Tests ──────────────────────────────────────────────────

describe('generateDeploymentPlacement — basic', () => {
  it('returns DeploymentCommand for first undeployed unit', () => {
    const model1 = createModel({ id: 'model-1' });
    const model2 = createModel({ id: 'model-2' });
    const unit = createUnit({ id: 'unit-1', models: [model1, model2] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).not.toBeNull();
    expect(result!.unitId).toBe('unit-1');
    expect(result!.modelPositions).toHaveLength(2);
    expect(result!.modelPositions[0].modelId).toBe('model-1');
    expect(result!.modelPositions[1].modelId).toBe('model-2');
  });

  it('returns null when all units deployed', () => {
    const unit = createUnit({ id: 'unit-1' });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    // unit-1 already in deployed list
    const result = generateDeploymentPlacement(state, 0, ['unit-1'], 12, 'basic');

    expect(result).toBeNull();
  });

  it('returns null when no units exist', () => {
    const state = createGameState();

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).toBeNull();
  });

  it('excludes reserves units from deployment', () => {
    const reserveUnit = createUnit({ id: 'reserve-1', isInReserves: true });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [reserveUnit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).toBeNull();
  });

  it('excludes units with all destroyed models', () => {
    const destroyedModel = createModel({ id: 'dead-1', isDestroyed: true });
    const deadUnit = createUnit({ id: 'dead-unit', models: [destroyedModel] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [deadUnit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).toBeNull();
  });

  it('model positions have correct count matching alive models', () => {
    const alive1 = createModel({ id: 'alive-1' });
    const alive2 = createModel({ id: 'alive-2' });
    const alive3 = createModel({ id: 'alive-3' });
    const dead = createModel({ id: 'dead-1', isDestroyed: true });
    const unit = createUnit({ id: 'unit-1', models: [alive1, alive2, alive3, dead] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).not.toBeNull();
    expect(result!.modelPositions).toHaveLength(3);
    const modelIds = result!.modelPositions.map((mp) => mp.modelId);
    expect(modelIds).toContain('alive-1');
    expect(modelIds).toContain('alive-2');
    expect(modelIds).toContain('alive-3');
    expect(modelIds).not.toContain('dead-1');
  });

  it('positions models within battlefield bounds', () => {
    const models = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `model-${i}` }),
    );
    const unit = createUnit({ id: 'unit-1', models });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'basic');

    expect(result).not.toBeNull();
    for (const mp of result!.modelPositions) {
      expect(mp.position.x).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.x).toBeLessThanOrEqual(71.5);
      expect(mp.position.y).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.y).toBeLessThanOrEqual(47.5);
    }
  });
});

// ─── Deployment Zone Bounds Tests ────────────────────────────────────────────

describe('generateDeploymentPlacement — deployment zones', () => {
  it('Player 0: deployment zone y positions are between 1 and depth', () => {
    const model = createModel({ id: 'model-1' });
    const unit = createUnit({ id: 'unit-1', models: [model] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const depth = 12;
    const result = generateDeploymentPlacement(state, 0, [], depth, 'basic');

    expect(result).not.toBeNull();
    for (const mp of result!.modelPositions) {
      // For player 0: zoneMinY=1, zoneMaxY=depth=12
      // Position at preferredY=0.5 means y = 1 + (12-1)*0.5 = 6.5
      expect(mp.position.y).toBeGreaterThanOrEqual(1);
      expect(mp.position.y).toBeLessThanOrEqual(depth);
    }
  });

  it('Player 1: deployment zone y positions are between (height-depth) and (height-1)', () => {
    const model = createModel({ id: 'model-1' });
    const unit = createUnit({ id: 'unit-1', models: [model] });
    const state = createGameState({ battlefield: { width: 72, height: 48 } });
    state.armies[1] = createArmy({
      playerIndex: 1,
      playerName: 'Player 2',
      faction: 'Sons of Horus' as ArmyState['faction'],
      allegiance: 'Traitor' as ArmyState['allegiance'],
      units: [unit],
    });

    const depth = 12;
    const result = generateDeploymentPlacement(state, 1, [], depth, 'basic');

    expect(result).not.toBeNull();
    for (const mp of result!.modelPositions) {
      // For player 1: zoneMinY=48-12=36, zoneMaxY=48-1=47
      expect(mp.position.y).toBeGreaterThanOrEqual(48 - depth);
      expect(mp.position.y).toBeLessThanOrEqual(48 - 1);
    }
  });

  it('basic strategy places in middle of zone (preferredY=0.5)', () => {
    const model = createModel({ id: 'model-1' });
    const unit = createUnit({ id: 'unit-1', models: [model] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const depth = 12;
    const result = generateDeploymentPlacement(state, 0, [], depth, 'basic');

    expect(result).not.toBeNull();
    // For player 0 with preferredY=0.5: y = 1 + (12-1)*0.5 = 6.5
    const y = result!.modelPositions[0].position.y;
    expect(y).toBeCloseTo(6.5, 0);
  });
});

// ─── Tactical Deployment Tests ───────────────────────────────────────────────

describe('generateDeploymentPlacement — tactical', () => {
  it('ranged units deploy toward back of zone', () => {
    // Ranged unit: models with >= 1 weapon on average
    const models = Array.from({ length: 3 }, (_, i) =>
      createModel({ id: `model-${i}`, equippedWargear: ['boltgun', 'missile-launcher'] }),
    );
    const unit = createUnit({ id: 'ranged-unit', models });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const depth = 12;
    const result = generateDeploymentPlacement(state, 0, [], depth, 'tactical');

    expect(result).not.toBeNull();
    // Tactical ranged: preferredY=0.8, y = 1 + (12-1)*0.8 = 9.8
    for (const mp of result!.modelPositions) {
      // Should be in the back half of the zone
      const zoneMidpoint = 1 + (depth - 1) * 0.5;
      expect(mp.position.y).toBeGreaterThan(zoneMidpoint);
    }
  });

  it('melee units deploy toward front of zone', () => {
    // Melee unit: models with no ranged weapons
    const models = Array.from({ length: 3 }, (_, i) =>
      createModel({ id: `model-${i}`, equippedWargear: [] }),
    );
    const unit = createUnit({ id: 'melee-unit', models });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const depth = 12;
    const result = generateDeploymentPlacement(state, 0, [], depth, 'tactical');

    expect(result).not.toBeNull();
    // Tactical melee: preferredY=0.2, y = 1 + (12-1)*0.2 = 3.2
    for (const mp of result!.modelPositions) {
      // Should be in the front half of the zone
      const zoneMidpoint = 1 + (depth - 1) * 0.5;
      expect(mp.position.y).toBeLessThan(zoneMidpoint);
    }
  });

  it('tactical deployment returns correct unit ID', () => {
    const model = createModel({ id: 'model-1', equippedWargear: ['boltgun'] });
    const unit = createUnit({ id: 'tac-unit-1', models: [model] });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'tactical');

    expect(result).not.toBeNull();
    expect(result!.unitId).toBe('tac-unit-1');
  });

  it('tactical deployment model positions are within bounds', () => {
    const models = Array.from({ length: 10 }, (_, i) =>
      createModel({ id: `model-${i}`, equippedWargear: ['boltgun'] }),
    );
    const unit = createUnit({ id: 'unit-1', models });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const result = generateDeploymentPlacement(state, 0, [], 12, 'tactical');

    expect(result).not.toBeNull();
    for (const mp of result!.modelPositions) {
      expect(mp.position.x).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.x).toBeLessThanOrEqual(71.5);
      expect(mp.position.y).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('deploys first undeployed unit from the list', () => {
    const deployed = createUnit({ id: 'deployed-1', isDeployed: false });
    const undeployed = createUnit({ id: 'undeployed-1', isDeployed: false });
    const state = createGameState();
    state.armies[0] = createArmy({ playerIndex: 0, units: [deployed, undeployed] });

    // deployed-1 is already in the deployedUnitIds list
    const result = generateDeploymentPlacement(state, 0, ['deployed-1'], 12, 'tactical');

    expect(result).not.toBeNull();
    expect(result!.unitId).toBe('undeployed-1');
  });
});
