/**
 * Basic Strategy Tests
 *
 * Tests for the BasicStrategy class which implements the random-action
 * AI strategy. Verifies delegation to phase handlers, auto-advance,
 * and deployment command generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, PendingReaction, AssaultCombatState } from '@hh/types';
import { BasicStrategy } from './basic-strategy';
import type { AITurnContext } from '../types';

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
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
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

function createTurnContext(): AITurnContext {
  return {
    actedUnitIds: new Set<string>(),
    movedModelIds: new Set<string>(),
    currentMovingUnitId: null,
    lastPhase: null as any,
    lastSubPhase: null as any,
  };
}

// ─── Auto-Advance Sub-Phase Tests ────────────────────────────────────────────

describe('BasicStrategy.generateNextCommand — auto-advance sub-phases', () => {
  it('returns endSubPhase for StartEffects sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.Start,
      currentSubPhase: SubPhase.StartEffects,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for Rout sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Rout,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for ShootingMorale sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.ShootingMorale,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for EndEffects sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.EndEffects,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for Statuses sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Statuses,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for Victory sub-phase', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Victory,
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });
});

// ─── Reaction Tests ──────────────────────────────────────────────────────────

describe('BasicStrategy.generateNextCommand — reactions', () => {
  it('returns reaction command when awaiting reaction', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Reposition',
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'test',
        triggerSourceUnitId: 'enemy-1',
        isAdvancedReaction: false,
      } as PendingReaction,
    });
    const context = createTurnContext();

    // Player 1 is the reactive player (active is 0)
    const command = strategy.generateNextCommand(state, 1, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('selectReaction');
  });

  it('returns declineReaction when awaitingReaction but AI is not reactive player', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'Reposition',
        eligibleUnitIds: ['unit-1'],
        triggerDescription: 'test',
        triggerSourceUnitId: 'enemy-1',
        isAdvancedReaction: false,
      } as PendingReaction,
    });
    const context = createTurnContext();

    // Player 0 is the active player, not the reactive player
    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('declineReaction');
  });
});

// ─── Phase Delegation Tests ──────────────────────────────────────────────────

describe('BasicStrategy.generateNextCommand — phase delegation', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    mathRandomSpy.mockRestore();
  });

  it('delegates to movement handler in Movement phase', () => {
    const strategy = new BasicStrategy();
    const model = createModel({ id: 'model-a', position: { x: 10, y: 10 } });
    const unit = createUnit({
      id: 'unit-1',
      models: [model],
      movementState: UnitMovementState.Stationary,
    });

    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('moveModel');
  });

  it('delegates to shooting handler in Shooting phase', () => {
    const strategy = new BasicStrategy();
    const shooterModel = createModel({ id: 'shooter-m1', position: { x: 10, y: 10 }, equippedWargear: ['boltgun'] });
    const shooterUnit = createUnit({
      id: 'shooter-1',
      models: [shooterModel],
      movementState: UnitMovementState.Stationary,
    });

    const targetModel = createModel({ id: 'target-m1', position: { x: 20, y: 10 } });
    const targetUnit = createUnit({ id: 'target-1', models: [targetModel], isDeployed: true });

    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
      armies: [
        { ...createGameState().armies[0], units: [shooterUnit] } as any,
        { ...createGameState().armies[1], units: [targetUnit] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('delegates to assault handler in Assault phase (Fight sub-phase)', () => {
    const strategy = new BasicStrategy();
    const combat: AssaultCombatState = {
      combatId: 'combat-1',
      activePlayerUnitIds: ['unit-1'],
      reactivePlayerUnitIds: ['unit-2'],
      activePlayerCRP: 0,
      reactivePlayerCRP: 0,
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
      resolved: false,
      isMassacre: false,
      challengeState: null,
    };

    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Fight,
      activeCombats: [combat],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('resolveFight');
  });

  it('returns endSubPhase when phase handler returns null', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        { ...createGameState().armies[0], units: [] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });

  it('returns endSubPhase for unrecognized phases (e.g., Start with non-auto sub-phase)', () => {
    const strategy = new BasicStrategy();
    const state = createGameState({
      currentPhase: Phase.Start,
      currentSubPhase: SubPhase.Move, // Not a real combination, but tests default
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    // Start phase delegates to default which returns null -> endSubPhase
    expect(command).not.toBeNull();
    expect(command!.type).toBe('endSubPhase');
  });
});

// ─── Deployment Tests ────────────────────────────────────────────────────────

describe('BasicStrategy.generateDeploymentCommand', () => {
  it('returns placement for undeployed unit', () => {
    const strategy = new BasicStrategy();
    const model1 = createModel({ id: 'model-a', position: { x: 0, y: 0 } });
    const model2 = createModel({ id: 'model-b', position: { x: 0, y: 0 } });
    const unit = createUnit({
      id: 'unit-1',
      models: [model1, model2],
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).not.toBeNull();
    expect(deploymentCmd!.unitId).toBe('unit-1');
    expect(deploymentCmd!.modelPositions).toHaveLength(2);
    expect(deploymentCmd!.modelPositions[0].modelId).toBe('model-a');
    expect(deploymentCmd!.modelPositions[1].modelId).toBe('model-b');
  });

  it('returns null when all units deployed', () => {
    const strategy = new BasicStrategy();
    const unit = createUnit({
      id: 'unit-1',
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    // unit-1 is already in the deployed list
    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, ['unit-1'], 12);

    expect(deploymentCmd).toBeNull();
  });

  it('skips reserves units in deployment', () => {
    const strategy = new BasicStrategy();
    const reserveUnit = createUnit({
      id: 'reserve-1',
      isDeployed: false,
      isInReserves: true,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [reserveUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).toBeNull();
  });

  it('deployment positions have valid coordinates within battlefield', () => {
    const strategy = new BasicStrategy();
    const models = Array.from({ length: 5 }, (_, i) =>
      createModel({ id: `model-${i}`, position: { x: 0, y: 0 } }),
    );
    const unit = createUnit({
      id: 'unit-1',
      models,
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).not.toBeNull();
    for (const mp of deploymentCmd!.modelPositions) {
      expect(mp.position.x).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.x).toBeLessThanOrEqual(71.5);
      expect(mp.position.y).toBeGreaterThanOrEqual(0.5);
      expect(mp.position.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('model positions count matches alive models', () => {
    const strategy = new BasicStrategy();
    const aliveModel = createModel({ id: 'alive-1', position: { x: 0, y: 0 } });
    const destroyedModel = createModel({ id: 'dead-1', position: { x: 0, y: 0 }, isDestroyed: true });
    const unit = createUnit({
      id: 'unit-1',
      models: [aliveModel, destroyedModel],
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).not.toBeNull();
    // Only 1 alive model
    expect(deploymentCmd!.modelPositions).toHaveLength(1);
    expect(deploymentCmd!.modelPositions[0].modelId).toBe('alive-1');
  });
});
