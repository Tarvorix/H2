/**
 * Embark/Disembark Handler Tests
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState, TacticalStatus, Allegiance, LegionFaction } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import {
  handleEmbark,
  handleDisembark,
  handleEmergencyDisembark,
} from './embark-disembark-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x: number, y: number): ModelState {
  return {
    id, profileModelName: 'Legionary', unitProfileId: 'tactical',
    position: { x, y }, currentWounds: 1, isDestroyed: false,
    modifiers: [], equippedWargear: [], isWarlord: false,
  };
}

function createUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id, profileId: 'tactical', models, statuses: [],
    hasReactedThisTurn: false, movementState: UnitMovementState.Stationary,
    isLockedInCombat: false, embarkedOnId: null,
    isInReserves: false, isDeployed: true, engagedWithUnitIds: [], modifiers: [],
    ...overrides,
  };
}

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`, playerIndex, playerName: `P${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus, allegiance: Allegiance.Traitor,
    units, totalPoints: 1000, pointsLimit: 2000,
    reactionAllotmentRemaining: 1, baseReactionAllotment: 1, victoryPoints: 0,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test', battlefield: { width: 72, height: 48 }, terrain: [],
    armies: [createArmy(0, []), createArmy(1, [])],
    currentBattleTurn: 1, maxBattleTurns: 4,
    activePlayerIndex: 0, firstPlayerIndex: 0,
    currentPhase: Phase.Movement, currentSubPhase: SubPhase.Move,
    awaitingReaction: false, isGameOver: false, winnerPlayerIndex: null,
    log: [], turnHistory: [],
    ...overrides,
  };
}

// ─── Embark Tests ────────────────────────────────────────────────────────────

describe('handleEmbark', () => {
  it('should embark unit within range of transport', () => {
    const infantryModels = [createModel('i-m0', 10, 10), createModel('i-m1', 11, 10)];
    const infantryUnit = createUnit('infantry', infantryModels);
    const transportModels = [createModel('t-m0', 10.5, 10)];
    const transportUnit = createUnit('transport', transportModels);

    const state = createGameState({
      armies: [
        createArmy(0, [infantryUnit, transportUnit]),
        createArmy(1, []),
      ],
    });

    const dice = new FixedDiceProvider([]);
    const result = handleEmbark(state, 'infantry', 'transport', dice);

    expect(result.accepted).toBe(true);
    const unit = result.state.armies[0].units[0];
    expect(unit.embarkedOnId).toBe('transport');
    expect(unit.isDeployed).toBe(false);
  });

  it('should reject embark when models too far from transport', () => {
    const infantryModels = [createModel('i-m0', 10, 10), createModel('i-m1', 20, 10)]; // m1 is 9.5" away
    const infantryUnit = createUnit('infantry', infantryModels);
    const transportModels = [createModel('t-m0', 10.5, 10)];
    const transportUnit = createUnit('transport', transportModels);

    const state = createGameState({
      armies: [createArmy(0, [infantryUnit, transportUnit]), createArmy(1, [])],
    });

    const dice = new FixedDiceProvider([]);
    const result = handleEmbark(state, 'infantry', 'transport', dice);

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'MODEL_TOO_FAR')).toBe(true);
  });

  it('should reject embark on nonexistent transport', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)]);
    const state = createGameState({ armies: [createArmy(0, [unit]), createArmy(1, [])] });
    const result = handleEmbark(state, 'u1', 'nonexistent', new FixedDiceProvider([]));
    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('TRANSPORT_NOT_FOUND');
  });

  it('should reject embark on enemy transport', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)]);
    const transport = createUnit('t1', [createModel('t-m0', 10, 10)]);
    const state = createGameState({
      armies: [createArmy(0, [unit]), createArmy(1, [transport])],
    });
    const result = handleEmbark(state, 'u1', 't1', new FixedDiceProvider([]));
    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('DIFFERENT_ARMY');
  });

  it('should reject embark when already embarked', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)], { embarkedOnId: 'other' });
    const transport = createUnit('t1', [createModel('t-m0', 10, 10)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });
    const result = handleEmbark(state, 'u1', 't1', new FixedDiceProvider([]));
    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('ALREADY_EMBARKED');
  });

  it('should emit embark event', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)]);
    const transport = createUnit('t1', [createModel('t-m0', 10, 10)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });
    const result = handleEmbark(state, 'u1', 't1', new FixedDiceProvider([]));
    expect(result.events.some(e => e.type === 'embark')).toBe(true);
  });
});

// ─── Disembark Tests ─────────────────────────────────────────────────────────

describe('handleDisembark', () => {
  it('should disembark unit with valid positions', () => {
    const models = [createModel('m0', 0, 0), createModel('m1', 0, 0)];
    const unit = createUnit('u1', models, { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);

    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    const result = handleDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
      { modelId: 'm1', position: { x: 21, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(true);
    const disembarked = result.state.armies[0].units[0];
    expect(disembarked.embarkedOnId).toBeNull();
    expect(disembarked.isDeployed).toBe(true);
    expect(disembarked.movementState).toBe(UnitMovementState.Moved);
    expect(disembarked.models[0].position).toEqual({ x: 19, y: 24 });
    expect(disembarked.models[1].position).toEqual({ x: 21, y: 24 });
  });

  it('should reject disembark when not embarked', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)]);
    const state = createGameState({ armies: [createArmy(0, [unit]), createArmy(1, [])] });
    const result = handleDisembark(state, 'u1', [{ modelId: 'm0', position: { x: 10, y: 10 } }], new FixedDiceProvider([]));
    expect(result.accepted).toBe(false);
    expect(result.errors[0].code).toBe('NOT_EMBARKED');
  });

  it('should reject disembark when positions too far from transport', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    const result = handleDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 30, y: 24 } }, // 10" away
    ], new FixedDiceProvider([]));

    expect(result.accepted).toBe(false);
    expect(result.errors.some(e => e.code === 'PLACEMENT_TOO_FAR')).toBe(true);
  });

  it('should reject disembark with broken coherency', () => {
    const models = [createModel('m0', 0, 0), createModel('m1', 0, 0)];
    const unit = createUnit('u1', models, { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    // Need edge-to-edge > 2". Centers need to be > 2 + 2*0.63 = 3.26" apart
    // Place them 5" apart
    const result2 = handleDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
      { modelId: 'm1', position: { x: 19, y: 19 } }, // 5" away
    ], new FixedDiceProvider([]));

    expect(result2.accepted).toBe(false);
    expect(result2.errors.some(e => e.code === 'COHERENCY_BROKEN')).toBe(true);
  });

  it('should emit disembark event', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    const result = handleDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
    ], new FixedDiceProvider([]));

    expect(result.events.some(e => e.type === 'disembark')).toBe(true);
  });
});

// ─── Emergency Disembark Tests ───────────────────────────────────────────────

describe('handleEmergencyDisembark', () => {
  it('should pass cool check and not pin unit', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    // 2d6 = 3 + 2 = 5 <= 7 (CL), passes
    const dice = new FixedDiceProvider([3, 2]);
    const result = handleEmergencyDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
    ], dice);

    expect(result.accepted).toBe(true);
    const unit2 = result.state.armies[0].units[0];
    expect(unit2.statuses).not.toContain(TacticalStatus.Pinned);
  });

  it('should fail cool check and pin unit', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    // 2d6 = 5 + 5 = 10 > 7 (CL), fails
    const dice = new FixedDiceProvider([5, 5]);
    const result = handleEmergencyDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
    ], dice);

    expect(result.accepted).toBe(true);
    const unit2 = result.state.armies[0].units[0];
    expect(unit2.statuses).toContain(TacticalStatus.Pinned);
  });

  it('should emit cool check and emergency disembark events', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    const dice = new FixedDiceProvider([3, 3]);
    const result = handleEmergencyDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
    ], dice);

    expect(result.events.some(e => e.type === 'coolCheck')).toBe(true);
    expect(result.events.some(e => e.type === 'emergencyDisembark')).toBe(true);
  });

  it('should disembark unit and set moved state', () => {
    const unit = createUnit('u1', [createModel('m0', 0, 0)], { embarkedOnId: 't1', isDeployed: false });
    const transport = createUnit('t1', [createModel('t-m0', 20, 24)]);
    const state = createGameState({ armies: [createArmy(0, [unit, transport]), createArmy(1, [])] });

    const dice = new FixedDiceProvider([2, 2]);
    const result = handleEmergencyDisembark(state, 'u1', [
      { modelId: 'm0', position: { x: 19, y: 24 } },
    ], dice);

    const u = result.state.armies[0].units[0];
    expect(u.embarkedOnId).toBeNull();
    expect(u.isDeployed).toBe(true);
    expect(u.movementState).toBe(UnitMovementState.Moved);
    expect(u.models[0].position).toEqual({ x: 19, y: 24 });
  });

  it('should reject when unit not embarked', () => {
    const unit = createUnit('u1', [createModel('m0', 10, 10)]);
    const state = createGameState({ armies: [createArmy(0, [unit]), createArmy(1, [])] });
    const result = handleEmergencyDisembark(state, 'u1', [{ modelId: 'm0', position: { x: 10, y: 10 } }], new FixedDiceProvider([3, 3]));
    expect(result.accepted).toBe(false);
  });
});
