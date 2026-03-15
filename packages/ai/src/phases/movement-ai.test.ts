/**
 * Movement AI Tests
 *
 * Tests for AI movement command generation.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import { getEnemyModelShapes, validateModelMove } from '@hh/engine';
import type { GameState, UnitState, ModelState, ArmyState } from '@hh/types';
import type { AITurnContext } from '../types';
import { generateMovementCommand } from './movement-ai';
import { getModelMovementCharacteristic } from '../helpers/unit-queries';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
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

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: [createModel()],
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

function createContext(): AITurnContext {
  return {
    actedUnitIds: new Set(),
    movedModelIds: new Set(),
    currentMovingUnitId: null,
    lastPhase: null,
    lastSubPhase: null,
  };
}

// ─── Move Sub-Phase Tests ────────────────────────────────────────────────────

describe('generateMovementCommand — Move sub-phase', () => {
  it('returns null when no movable units exist', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');
    expect(result).toBeNull();
  });

  it('generates a moveUnit command for the first movable unit', () => {
    const m1 = createModel({ id: 'model-1', position: { x: 10, y: 10 } });
    const unit = createUnit({ id: 'unit-1', models: [m1], movementState: UnitMovementState.Stationary });
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('moveUnit');
    expect((result as any).unitId).toBe('unit-1');
    expect((result as any).modelPositions).toHaveLength(1);
    expect((result as any).modelPositions[0].modelId).toBe('model-1');
  });

  it('marks moved units as acted in context', () => {
    const unit = createUnit({ id: 'unit-1', movementState: UnitMovementState.Stationary });
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    generateMovementCommand(state, 0, ctx, 'basic');

    expect(ctx.actedUnitIds.has('unit-1')).toBe(true);
  });

  it('skips units already marked as acted and moves the next unit', () => {
    const unit1 = createUnit({ id: 'unit-1', models: [createModel({ id: 'model-1' })], movementState: UnitMovementState.Stationary });
    const unit2 = createUnit({ id: 'unit-2', models: [createModel({ id: 'model-2' })], movementState: UnitMovementState.Stationary });
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit1, unit2] });

    const ctx = createContext();
    ctx.actedUnitIds.add('unit-1');

    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('moveUnit');
    expect((result as any).unitId).toBe('unit-2');
  });

  it('moves translated model positions within battlefield bounds', () => {
    const m1 = createModel({ id: 'model-1', position: { x: 70, y: 46 } });
    const unit = createUnit({ id: 'unit-1', models: [m1], movementState: UnitMovementState.Stationary });
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    const pos = (result as any).modelPositions[0].position;
    expect(pos.x).toBeGreaterThanOrEqual(0.5);
    expect(pos.x).toBeLessThanOrEqual(71.5);
    expect(pos.y).toBeGreaterThanOrEqual(0.5);
    expect(pos.y).toBeLessThanOrEqual(47.5);
  });

  it('continues a declared rush with a rush moveUnit command', () => {
    const m1 = createModel({ id: 'model-1', position: { x: 10, y: 10 } });
    const unit = createUnit({ id: 'unit-1', models: [m1], movementState: UnitMovementState.RushDeclared });
    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: 'moveUnit',
      unitId: 'unit-1',
      isRush: true,
    });
  });
});

// ─── Reserves Sub-Phase Tests ──────────────────────────────────────────────

describe('generateMovementCommand — Reserves sub-phase', () => {
  it('returns reservesTest for units in reserves', () => {
    const unit = createUnit({ id: 'reserves-unit', isInReserves: true, isDeployed: false });
    const state = createGameState({ currentSubPhase: SubPhase.Reserves });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('reservesTest');
    expect((result as any).unitId).toBe('reserves-unit');
  });

  it('returns null when no reserves units remain', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Reserves });
    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).toBeNull();
  });

  it('marks reserves units as acted', () => {
    const unit = createUnit({ id: 'reserves-unit', isInReserves: true, isDeployed: false });
    const state = createGameState({ currentSubPhase: SubPhase.Reserves });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });

    const ctx = createContext();
    generateMovementCommand(state, 0, ctx, 'basic');

    expect(ctx.actedUnitIds.has('reserves-unit')).toBe(true);
  });
});

// ─── Tactical Movement Tests ──────────────────────────────────────────────

describe('generateMovementCommand — Tactical strategy', () => {
  it('generates a moveUnit command with tactical strategy', () => {
    const m1 = createModel({ id: 'model-1', position: { x: 10, y: 10 } });
    const unit = createUnit({ id: 'unit-1', models: [m1], movementState: UnitMovementState.Stationary });
    const enemyModel = createModel({ id: 'enemy-m1', position: { x: 50, y: 40 } });
    const enemyUnit = createUnit({ id: 'enemy-1', models: [enemyModel], isDeployed: true });

    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });
    state.armies[1] = createArmy({ playerIndex: 1, units: [enemyUnit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'tactical');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('moveUnit');
  });

  it('avoids ending a tactical move within the enemy exclusion zone', () => {
    const mover = createModel({ id: 'model-1', position: { x: 10, y: 10 } });
    const unit = createUnit({
      id: 'unit-1',
      models: [mover],
      movementState: UnitMovementState.Stationary,
    });
    const enemyModel = createModel({ id: 'enemy-m1', position: { x: 14, y: 10 } });
    const enemyUnit = createUnit({ id: 'enemy-1', models: [enemyModel], isDeployed: true });

    const state = createGameState({ currentSubPhase: SubPhase.Move });
    state.armies[0] = createArmy({ playerIndex: 0, units: [unit] });
    state.armies[1] = createArmy({ playerIndex: 1, units: [enemyUnit] });

    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'tactical');

    expect(result).not.toBeNull();
    expect(result!.type).toBe('moveUnit');

    const targetPosition = (result as any).modelPositions[0].position;
    const errors = validateModelMove(
      mover,
      targetPosition,
      getModelMovementCharacteristic(mover),
      state.terrain,
      getEnemyModelShapes(state, 0),
      [],
      state.battlefield.width,
      state.battlefield.height,
    );

    expect(errors).toEqual([]);
    expect(targetPosition.x).toBeLessThan(enemyModel.position.x);
  });

  it('returns null for non-movement sub-phases', () => {
    const state = createGameState({ currentSubPhase: SubPhase.Attack });
    const ctx = createContext();
    const result = generateMovementCommand(state, 0, ctx, 'basic');

    expect(result).toBeNull();
  });
});
