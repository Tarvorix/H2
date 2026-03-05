/**
 * Tactical Strategy Tests
 *
 * Tests for the TacticalStrategy class which implements the heuristic-based
 * AI strategy. Verifies delegation to phase handlers with 'tactical' mode,
 * auto-advance, and role-based deployment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Phase, SubPhase, UnitMovementState } from '@hh/types';
import type { GameState, UnitState, ModelState, PendingReaction, AssaultCombatState } from '@hh/types';
import { TacticalStrategy } from './tactical-strategy';
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

describe('TacticalStrategy.generateNextCommand — auto-advance sub-phases', () => {
  it('returns endSubPhase for StartEffects sub-phase', () => {
    const strategy = new TacticalStrategy();
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
    const strategy = new TacticalStrategy();
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
    const strategy = new TacticalStrategy();
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
    const strategy = new TacticalStrategy();
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
    const strategy = new TacticalStrategy();
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
    const strategy = new TacticalStrategy();
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

describe('TacticalStrategy.generateNextCommand — reactions', () => {
  it('returns reaction command when awaiting reaction with sufficient allotment', () => {
    const strategy = new TacticalStrategy();
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
    // Tactical strategy with allotment=2 (>1) should accept Reposition
    expect(command!.type).toBe('selectReaction');
  });

  it('accepts reaction when allotment is low but still legal', () => {
    const strategy = new TacticalStrategy();
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
      armies: [
        { ...createGameState().armies[0], reactionAllotmentRemaining: 2 } as any,
        { ...createGameState().armies[1], reactionAllotmentRemaining: 1 } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 1, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('selectReaction');
  });

  it('returns declineReaction when AI is not reactive player', () => {
    const strategy = new TacticalStrategy();
    const state = createGameState({
      activePlayerIndex: 0,
      awaitingReaction: true,
      pendingReaction: {
        reactionType: 'ReturnFire',
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

describe('TacticalStrategy.generateNextCommand — phase delegation', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    mathRandomSpy.mockRestore();
  });

  it('delegates to movement handler in Movement phase', () => {
    const strategy = new TacticalStrategy();
    const model = createModel({ id: 'model-a', position: { x: 10, y: 10 } });
    const unit = createUnit({
      id: 'unit-1',
      models: [model],
      movementState: UnitMovementState.Stationary,
    });

    const enemyModel = createModel({ id: 'enemy-m1', position: { x: 50, y: 30 } });
    const enemyUnit = createUnit({ id: 'enemy-1', models: [enemyModel] });

    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        { ...createGameState().armies[0], units: [unit] } as any,
        { ...createGameState().armies[1], units: [enemyUnit] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('moveUnit');
  });

  it('delegates to shooting handler in Shooting phase', () => {
    const strategy = new TacticalStrategy();
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

  it('delegates to assault handler in Assault phase', () => {
    const strategy = new TacticalStrategy();
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

  it('returns endSubPhase when phase handler returns null (no more actions)', () => {
    const strategy = new TacticalStrategy();
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

  it('tactical movement moves toward enemy units', () => {
    const strategy = new TacticalStrategy();
    const friendlyModel = createModel({ id: 'model-a', position: { x: 10, y: 10 } });
    const friendlyUnit = createUnit({
      id: 'unit-1',
      models: [friendlyModel],
      movementState: UnitMovementState.Stationary,
    });

    const enemyModel = createModel({ id: 'enemy-m1', position: { x: 60, y: 40 } });
    const enemyUnit = createUnit({ id: 'enemy-1', models: [enemyModel] });

    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
      armies: [
        { ...createGameState().armies[0], units: [friendlyUnit] } as any,
        { ...createGameState().armies[1], units: [enemyUnit] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('moveUnit');
    const pos = (command as any).modelPositions[0].position;
    // Should move toward enemy (x=60, y=40) from (x=10, y=10)
    expect(pos.x).toBeGreaterThan(10);
    expect(pos.y).toBeGreaterThan(10);
  });

  it('tactical assault resolution picks Consolidate', () => {
    const strategy = new TacticalStrategy();
    const lockedUnit = createUnit({
      id: 'locked-1',
      isLockedInCombat: true,
    });

    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Resolution,
      armies: [
        { ...createGameState().armies[0], units: [lockedUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });
    const context = createTurnContext();

    const command = strategy.generateNextCommand(state, 0, context);

    expect(command).not.toBeNull();
    expect(command!.type).toBe('selectAftermath');
    expect((command as any).option).toBe('Consolidate');
  });
});

// ─── Deployment Tests ────────────────────────────────────────────────────────

describe('TacticalStrategy.generateDeploymentCommand', () => {
  it('returns placement for undeployed unit', () => {
    const strategy = new TacticalStrategy();
    const model1 = createModel({ id: 'model-a', position: { x: 0, y: 0 }, equippedWargear: ['boltgun'] });
    const model2 = createModel({ id: 'model-b', position: { x: 0, y: 0 }, equippedWargear: ['boltgun'] });
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
  });

  it('returns null when all units deployed', () => {
    const strategy = new TacticalStrategy();
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

    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, ['unit-1'], 12);

    expect(deploymentCmd).toBeNull();
  });

  it('ranged units deploy toward back of zone (tactical)', () => {
    const strategy = new TacticalStrategy();
    // Ranged unit: models with weapons
    const rangedModels = Array.from({ length: 3 }, (_, i) =>
      createModel({ id: `model-${i}`, position: { x: 0, y: 0 }, equippedWargear: ['boltgun', 'missile-launcher'] }),
    );
    const rangedUnit = createUnit({
      id: 'ranged-unit',
      models: rangedModels,
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [rangedUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    // Player 0 deploys at y=1 to y=12
    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).not.toBeNull();
    // Ranged units with avg >= 1 weapon per model get preferredY=0.8 (toward back)
    // For player 0, zone is y=1 to y=12. 0.8 * (12-1) + 1 = ~9.8
    for (const mp of deploymentCmd!.modelPositions) {
      // Should be toward the back of the zone (higher y)
      expect(mp.position.y).toBeGreaterThan(5);
    }
  });

  it('melee units deploy toward front of zone (tactical)', () => {
    const strategy = new TacticalStrategy();
    // Melee unit: models with no ranged weapons
    const meleeModels = Array.from({ length: 3 }, (_, i) =>
      createModel({ id: `model-${i}`, position: { x: 0, y: 0 }, equippedWargear: [] }),
    );
    const meleeUnit = createUnit({
      id: 'melee-unit',
      models: meleeModels,
      isDeployed: false,
      isInReserves: false,
    });

    const state = createGameState({
      armies: [
        { ...createGameState().armies[0], units: [meleeUnit] } as any,
        { ...createGameState().armies[1], units: [] } as any,
      ],
    });

    // Player 0 deploys at y=1 to y=12
    const deploymentCmd = strategy.generateDeploymentCommand(state, 0, [], 12);

    expect(deploymentCmd).not.toBeNull();
    // Melee units with avg < 1 weapon per model get preferredY=0.2 (toward front)
    // For player 0, zone is y=1 to y=12. 0.2 * (12-1) + 1 = ~3.2
    for (const mp of deploymentCmd!.modelPositions) {
      // Should be toward the front of the zone (lower y)
      expect(mp.position.y).toBeLessThan(7);
    }
  });

  it('skips reserves units during deployment', () => {
    const strategy = new TacticalStrategy();
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

  it('model positions count matches alive models', () => {
    const strategy = new TacticalStrategy();
    const aliveModels = Array.from({ length: 4 }, (_, i) =>
      createModel({ id: `alive-${i}`, position: { x: 0, y: 0 } }),
    );
    const destroyedModel = createModel({ id: 'dead-1', position: { x: 0, y: 0 }, isDestroyed: true });
    const unit = createUnit({
      id: 'unit-1',
      models: [...aliveModels, destroyedModel],
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
    expect(deploymentCmd!.modelPositions).toHaveLength(4);
  });

  it('all deployment positions are within battlefield bounds', () => {
    const strategy = new TacticalStrategy();
    const models = Array.from({ length: 10 }, (_, i) =>
      createModel({ id: `model-${i}`, position: { x: 0, y: 0 }, equippedWargear: ['boltgun'] }),
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
});
