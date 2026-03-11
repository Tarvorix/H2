/**
 * Shooting-Phase Advanced Reaction Handler Tests
 *
 * Tests all 10 shooting-phase advanced reaction handlers individually.
 * Each handler is accessed via the registry after calling registerShootingReactions().
 *
 * Reference: HH_Legiones_Astartes.md — each legion's "Advanced Reaction" subsection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, AdvancedReactionDefinition } from '@hh/types';
import { LegionFaction, Phase, SubPhase, TacticalStatus } from '@hh/types';
import { Allegiance, UnitMovementState } from '@hh/types';
import { findAdvancedReaction } from '@hh/data';
import { FixedDiceProvider } from '../../dice';
import type { AdvancedReactionContext, AdvancedReactionResult } from '../advanced-reaction-registry';
import {
  registerAdvancedReaction,
  getAdvancedReactionHandler,
  clearAdvancedReactionRegistry,
} from '../advanced-reaction-registry';
import { registerShootingReactions } from './shooting-reactions';
import type { ModelState, UnitState, ArmyState, Position } from '@hh/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(id: string, position: Position, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'test-profile',
    position,
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['bolter'],
    isWarlord: false,
    ...overrides,
  };
}

function makeUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'test-profile',
    models,
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

function makeArmy(playerIndex: number, units: UnitState[], overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex}`,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
    ...overrides,
  } as ArmyState;
}

function makeGameState(army0Units: UnitState[], army1Units: UnitState[]): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [
      makeArmy(0, army0Units),
      makeArmy(1, army1Units),
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
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
  } as GameState;
}

function makeContext(
  state: GameState,
  reactionId: string,
  reactingUnitId: string,
  triggerSourceUnitId: string,
  playerIndex: number = 1,
): AdvancedReactionContext {
  const definition = findAdvancedReaction(reactionId)!;
  return {
    state,
    reactionId,
    reactingUnitId,
    triggerSourceUnitId,
    playerIndex,
    definition,
  };
}

/**
 * Invoke a registered handler by ID with the given context and dice provider.
 */
function invokeHandler(
  reactionId: string,
  context: AdvancedReactionContext,
  dice: FixedDiceProvider,
): AdvancedReactionResult {
  const handler = getAdvancedReactionHandler(reactionId);
  if (!handler) {
    throw new Error(`Handler not registered: ${reactionId}`);
  }
  return handler(context, dice);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Shooting-Phase Advanced Reactions', () => {
  beforeEach(() => {
    clearAdvancedReactionRegistry();
    registerShootingReactions();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SPACE WOLVES — Bestial Savagery (sw-bestial-savagery)
  //
  // Effects:
  // - Grant FNP 5+ to each model in the reacting unit
  // - Each alive model makes a set-up move (up to 3") toward the nearest model
  //   in the trigger source unit
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Space Wolves — Bestial Savagery (sw-bestial-savagery)', () => {
    const REACTION_ID = 'sw-bestial-savagery';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 10 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should add FNP 5+ modifier to all alive models', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      // Check FNP modifier on each model
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const fnpMod = model.modifiers.find(m => m.characteristic === 'FNP');
        expect(fnpMod).toBeDefined();
        expect(fnpMod!.value).toBe(5);
        expect(fnpMod!.operation).toBe('set');
        expect(fnpMod!.source).toBe('Bestial Savagery');
      }
    });

    it('should move models up to 3" toward nearest enemy model', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const movedModel = result.state.armies[1].units.find(u => u.id === 'react-1')!.models[0];
      // Should move 3" toward (10, 0) from (0, 0): new position (3, 0)
      expect(movedModel.position.x).toBeCloseTo(3, 5);
      expect(movedModel.position.y).toBeCloseTo(0, 5);
    });

    it('should emit setupMove events for moved models', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const moveEvents = result.events.filter(e => e.type === 'setupMove');
      expect(moveEvents.length).toBe(2);
      expect(moveEvents[0].modelId).toBe('r1');
      expect(moveEvents[1].modelId).toBe('r2');
    });

    it('should have FNP modifier with correct source and expiry', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const fnpMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'FNP')!;
      expect(fnpMod.source).toBe('Bestial Savagery');
      expect(fnpMod.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
    });

    it('should handle no alive models case', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }, { isDestroyed: true, currentWounds: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. BLOOD ANGELS — Wrath of Angels (ba-wrath-of-angels)
  //
  // Effects:
  // - Each alive model moves toward the nearest model in the attacker unit, up to 7"
  // - If any model ends within 6" of the trigger source unit, attacker makes Cool Check
  //   Roll 2d6, pass on 7 or less. If failed: Pinned.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Blood Angels — Wrath of Angels (ba-wrath-of-angels)', () => {
    const REACTION_ID = 'ba-wrath-of-angels';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should move models up to 7" toward the attacker', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // No dice needed for the move (distance > 6 so no cool check triggered)
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const movedModel = result.state.armies[1].units.find(u => u.id === 'react-1')!.models[0];
      // Model at (0,0) moves 7" toward (20,0) => (7, 0)
      expect(movedModel.position.x).toBeCloseTo(7, 5);
      expect(movedModel.position.y).toBeCloseTo(0, 5);
    });

    it('should apply Pinned status to attacker on failed Cool Check (roll > 7)', () => {
      // Position models so that after a 7" move, the reacting model ends within 6" of enemy
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // After move: r1 moves 7" toward e1 at (10,0), ends at (7,0). Distance to e1 = 3 < 6.
      // Cool Check: 2d6 => 5+4=9 > 7 => FAIL => Pinned
      const dice = new FixedDiceProvider([5, 4]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const enemyUnitState = result.state.armies[0].units.find(u => u.id === 'enemy-1')!;
      expect(enemyUnitState.statuses).toContain(TacticalStatus.Pinned);
    });

    it('should NOT Pin attacker on passed Cool Check (roll <= 7)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // After move: r1 at (7,0), distance to e1(10,0) = 3 < 6 => cool check triggers
      // Cool Check: 2d6 => 3+3=6 <= 7 => PASS => no Pinned
      const dice = new FixedDiceProvider([3, 3]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const enemyUnitState = result.state.armies[0].units.find(u => u.id === 'enemy-1')!;
      expect(enemyUnitState.statuses).not.toContain(TacticalStatus.Pinned);
    });

    it('should emit modelMoved events', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const moveEvents = result.events.filter(e => e.type === 'modelMoved');
      expect(moveEvents.length).toBe(2);
      expect(moveEvents[0].modelId).toBe('r1');
      expect(moveEvents[1].modelId).toBe('r2');
    });

    it('should emit statusApplied event when Pinning succeeds', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Cool Check: 2d6 => 6+5=11 > 7 => FAIL => Pinned
      const dice = new FixedDiceProvider([6, 5]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const statusEvents = result.events.filter(e => e.type === 'statusApplied');
      expect(statusEvents.length).toBe(1);
      expect(statusEvents[0].unitId).toBe('enemy-1');
      expect(statusEvents[0].status).toBe(TacticalStatus.Pinned);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. IRON WARRIORS — Bitter Fury (iw-bitter-fury)
  //
  // Effects:
  // - Reacting unit makes a return fire with +1 FP (2 shots per model)
  // - Roll to hit (4+), roll to wound (4+)
  // - Apply damage to trigger source unit
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Iron Warriors — Bitter Fury (iw-bitter-fury)', () => {
    const REACTION_ID = 'iw-bitter-fury';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should perform shooting attack with hit on 3+ and wound on 4+', () => {
      // 1 model with a bolter (FP2) and +1 FP from Bitter Fury = 3 shots.
      // Hit rolls [3, 2, 2] => 1 hit, wound roll [5] => 1 wound.
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([3, 2, 2, 5]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const targetUnit = result.state.armies[0].units.find(u => u.id === 'enemy-1')!;
      const targetModel = targetUnit.models.find(m => m.id === 'e1')!;
      expect(targetModel.currentWounds).toBe(0);
      expect(targetModel.isDestroyed).toBe(true);
    });

    it('should add +1 FP modifier to the real weapon profile', () => {
      // 1 bolter model becomes FP3 for this reaction and all three shots miss
      // without triggering Overload misfires.
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([2, 2, 2]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      // No damage events should occur
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(0);
    });

    it('should emit fireGroupResolved with correct stats', () => {
      // 1 model, 3 shots: hit rolls [5, 6, 2] => 2 hits, wound rolls [4, 4] => 2 wounds
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }, { currentWounds: 3 }),
        makeModel('e2', { x: 11, y: 0 }, { currentWounds: 3 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([5, 6, 2, 4, 4]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const fgEvent = result.events.find(e => e.type === 'fireGroupResolved');
      expect(fgEvent).toBeDefined();
      expect(fgEvent!.totalHits).toBe(2);
      expect(fgEvent!.totalWounds).toBe(2);
      expect(fgEvent!.weaponName).toBe('Bolter');
    });

    it('should apply damage to target unit models', () => {
      // 1 model, 3 shots: all hit, all wound, but only two targets exist to allocate wounds to
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
        makeModel('e2', { x: 11, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([4, 5, 6, 4, 5, 6]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(2);
    });

    it('should handle multiple shooters', () => {
      // 3 bolter models, +1 FP = 3 shots each = 9 shots total.
      // All miss on rolls of 2 while avoiding Overload misfires.
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
        makeModel('r3', { x: 2, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 10, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([2, 2, 2, 2, 2, 2, 2, 2, 2]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const fgEvent = result.events.find(e => e.type === 'fireGroupResolved');
      expect(fgEvent).toBeDefined();
      expect(fgEvent!.totalHits).toBe(0);
      expect(fgEvent!.totalWounds).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ULTRAMARINES — Retribution Strike (um-retribution-strike)
  //
  // Effects:
  // - A DIFFERENT unit (not the target) shoots the attacker
  // - Same shooting attack mechanic as Bitter Fury but without +1 FP bonus
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Ultramarines — Retribution Strike (um-retribution-strike)', () => {
    const REACTION_ID = 'um-retribution-strike';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should perform shooting at the ATTACKER (trigger source)', () => {
      // 1 bolter model, no FP bonus = 2 shots.
      // Hit rolls [5, 2] => 1 hit, wound [4] => 1 wound.
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const attackerUnit = makeUnit('attacker-1', [
        makeModel('a1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([attackerUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'attacker-1');
      const dice = new FixedDiceProvider([5, 2, 4]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const attackerState = result.state.armies[0].units.find(u => u.id === 'attacker-1')!;
      const attackerModel = attackerState.models.find(m => m.id === 'a1')!;
      expect(attackerModel.currentWounds).toBe(0);
      expect(attackerModel.isDestroyed).toBe(true);
    });

    it('should have hit/wound mechanics work correctly', () => {
      // 1 model, 2 shots: hit rolls [4, 1] => 1 hit, wound [3] => fail
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const attackerUnit = makeUnit('attacker-1', [
        makeModel('a1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([attackerUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'attacker-1');
      const dice = new FixedDiceProvider([4, 1, 3]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const attackerState = result.state.armies[0].units.find(u => u.id === 'attacker-1')!;
      const attackerModel = attackerState.models.find(m => m.id === 'a1')!;
      // No damage should have been dealt
      expect(attackerModel.currentWounds).toBe(1);
      expect(attackerModel.isDestroyed).toBe(false);
    });

    it('should emit fireGroupResolved event', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const attackerUnit = makeUnit('attacker-1', [
        makeModel('a1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([attackerUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'attacker-1');
      // 2 shots: both miss
      const dice = new FixedDiceProvider([2, 1]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const fgEvent = result.events.find(e => e.type === 'fireGroupResolved');
      expect(fgEvent).toBeDefined();
      expect(fgEvent!.weaponName).toBe('Bolter');
    });

    it('should apply damage to attacker models', () => {
      // 2 models in reacting unit => 4 bolter shots, with two hits and two wounds
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const attackerUnit = makeUnit('attacker-1', [
        makeModel('a1', { x: 20, y: 0 }),
        makeModel('a2', { x: 21, y: 0 }),
      ]);
      const state = makeGameState([attackerUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'attacker-1');
      const dice = new FixedDiceProvider([6, 5, 2, 1, 4, 5]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(2);
      // Both damage events target the attacker unit
      for (const ev of damageEvents) {
        expect(ev.unitId).toBe('attacker-1');
      }
    });

    it('should handle all misses gracefully', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const attackerUnit = makeUnit('attacker-1', [
        makeModel('a1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([attackerUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'attacker-1');
      // 1 shot: hit [1] => miss
      const dice = new FixedDiceProvider([1, 2]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const fgEvent = result.events.find(e => e.type === 'fireGroupResolved');
      expect(fgEvent!.totalHits).toBe(0);
      expect(fgEvent!.totalWounds).toBe(0);
      // No damage events
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RAVEN GUARD — Shadow Veil (rg-shadow-veil)
  //
  // Effects:
  // - Each alive model moves up to 4" AWAY from the attacker unit
  // - Add Shrouded(5+) modifier to each model
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Raven Guard — Shadow Veil (rg-shadow-veil)', () => {
    const REACTION_ID = 'rg-shadow-veil';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should move models up to 4" AWAY from attacker', () => {
      // Model at (10, 0), attacker at (20, 0)
      // Moving away means moving in the -X direction
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 10, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const movedModel = result.state.armies[1].units.find(u => u.id === 'react-1')!.models[0];
      // Moving 4" away from (20, 0), starting at (10, 0) => should go to (6, 0)
      expect(movedModel.position.x).toBeCloseTo(6, 5);
      expect(movedModel.position.y).toBeCloseTo(0, 5);
    });

    it('should add Shrouded 5+ modifier to each model', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 10, y: 0 }),
        makeModel('r2', { x: 11, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const shroudedMod = model.modifiers.find(m => m.characteristic === 'Shrouded');
        expect(shroudedMod).toBeDefined();
        expect(shroudedMod!.value).toBe(5);
        expect(shroudedMod!.operation).toBe('set');
      }
    });

    it('should emit modelMoved events', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 10, y: 0 }),
        makeModel('r2', { x: 11, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const moveEvents = result.events.filter(e => e.type === 'modelMoved');
      expect(moveEvents.length).toBe(2);
      expect(moveEvents[0].unitId).toBe('react-1');
      expect(moveEvents[1].unitId).toBe('react-1');
    });

    it('should have Shrouded modifier with correct source', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 10, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const shroudedMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'Shrouded')!;
      expect(shroudedMod.source).toBe('Shadow Veil');
      expect(shroudedMod.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
    });

    it('should handle models that are at the same position as attacker (overlapping)', () => {
      // When positions overlap, moveAway moves along +X axis
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 20, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const movedModel = result.state.armies[1].units.find(u => u.id === 'react-1')!.models[0];
      // moveAway with overlapping positions uses +X axis: (20+4, 0) = (24, 0)
      expect(movedModel.position.x).toBeCloseTo(24, 5);
      expect(movedModel.position.y).toBeCloseTo(0, 5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DEATH GUARD — Barbaran Endurance (dg-barbaran-endurance)
  //
  // Effects:
  // - Remove ALL tactical statuses from the reacting unit
  // - Add FNP 5+ modifier to each model
  // - Add AutoPassChecks modifier to each model
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Death Guard — Barbaran Endurance (dg-barbaran-endurance)', () => {
    const REACTION_ID = 'dg-barbaran-endurance';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should remove all existing statuses (Pinned, Stunned, etc.)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ], {
        statuses: [TacticalStatus.Pinned, TacticalStatus.Stunned],
      });
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      expect(reactUnit.statuses).toHaveLength(0);
    });

    it('should add FNP 5+ modifier to each model', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const fnpMod = model.modifiers.find(m => m.characteristic === 'FNP');
        expect(fnpMod).toBeDefined();
        expect(fnpMod!.value).toBe(5);
        expect(fnpMod!.source).toBe('Barbaran Endurance');
      }
    });

    it('should add AutoPassChecks modifier to each model', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const autoPassMod = model.modifiers.find(m => m.characteristic === 'AutoPassChecks');
        expect(autoPassMod).toBeDefined();
        expect(autoPassMod!.value).toBe(1);
        expect(autoPassMod!.source).toBe('Barbaran Endurance');
        expect(autoPassMod!.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
      }
    });

    it('should emit statusRemoved events for each removed status', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ], {
        statuses: [TacticalStatus.Pinned, TacticalStatus.Suppressed, TacticalStatus.Stunned],
      });
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const removedEvents = result.events.filter(e => e.type === 'statusRemoved');
      expect(removedEvents.length).toBe(3);
      expect(removedEvents[0].status).toBe(TacticalStatus.Pinned);
      expect(removedEvents[1].status).toBe(TacticalStatus.Suppressed);
      expect(removedEvents[2].status).toBe(TacticalStatus.Stunned);
    });

    it('should return success:true even when no statuses to remove', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ], {
        statuses: [],
      });
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      // No statusRemoved events
      const removedEvents = result.events.filter(e => e.type === 'statusRemoved');
      expect(removedEvents.length).toBe(0);
      // But modifiers should still be applied
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const fnpMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'FNP');
      expect(fnpMod).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. THOUSAND SONS — Fortress of the Mind (ts-fortress-of-mind)
  //
  // Effects:
  // - Make a Willpower Check: roll 2d6, pass on 7 or less
  // - If passed: 3+ Invulnerable Save modifier
  // - If failed: 5+ Invulnerable Save modifier
  // - If failed: Warp Rupture (both units suffer D3 wounds)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Thousand Sons — Fortress of the Mind (ts-fortress-of-mind)', () => {
    const REACTION_ID = 'ts-fortress-of-mind';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should add InvulnSave 3+ modifier on successful WP check (roll <= 7)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: 2d6 => 3+3=6 <= 7 => PASS
      const dice = new FixedDiceProvider([3, 3]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const invulnMod = model.modifiers.find(m => m.characteristic === 'InvulnSave');
        expect(invulnMod).toBeDefined();
        expect(invulnMod!.value).toBe(3);
      }
    });

    it('should add InvulnSave 5+ modifier on failed WP check (roll > 7)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }, { currentWounds: 5 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: 2d6 => 5+4=9 > 7 => FAIL
      // Warp Rupture: rollD3 calls rollD6 => need to provide enough dice
      // rollD3 uses Math.ceil(rollD6()/2): 4 => D3=2 => 2 wounds to react unit, 2 wounds to enemy
      // Wound allocation: for each wound, pick random model
      // React unit: 2 wounds but only 1 model with 1W => 1 wound destroys, then currentAlive=0
      // Enemy unit: 2 wounds to e1 (5W): pick rolls
      const dice = new FixedDiceProvider([
        5, 4,   // WP check: 9 => fail
        4,      // rollD3 via rollD6: ceil(4/2)=2 => D3=2
        1,      // Pick reacting unit target (wound 1): model index
        // After first wound, r1 is at 0W/destroyed. Loop breaks (currentAlive.length === 0).
        1,      // Pick enemy unit target (wound 1)
        1,      // Pick enemy unit target (wound 2)
      ]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const invulnMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'InvulnSave');
      expect(invulnMod).toBeDefined();
      expect(invulnMod!.value).toBe(5);
    });

    it('should cause Warp Rupture on failed WP check (damage to both units)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }, { currentWounds: 5 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }, { currentWounds: 5 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: 2d6 => 4+5=9 > 7 => FAIL
      // D3 damage: rollD6 => 2, ceil(2/2)=1 => 1 wound to each unit
      // Reacting unit: pick target roll 1
      // Enemy unit: pick target roll 1
      const dice = new FixedDiceProvider([
        4, 5,   // WP check: 9 => fail
        2,      // D3 via rollD6: ceil(2/2)=1 => 1 wound each
        1,      // Pick reacting unit target
        1,      // Pick enemy unit target
      ]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      // Both units should have taken damage
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(2);

      // One to reacting unit
      const reactDamage = damageEvents.find(e => e.unitId === 'react-1');
      expect(reactDamage).toBeDefined();
      expect(reactDamage!.damageSource).toBe('Warp Rupture (Fortress of the Mind)');

      // One to enemy unit
      const enemyDamage = damageEvents.find(e => e.unitId === 'enemy-1');
      expect(enemyDamage).toBeDefined();
      expect(enemyDamage!.damageSource).toBe('Warp Rupture (Fortress of the Mind)');
    });

    it('should emit correct events for each outcome', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: 2d6 => 2+3=5 <= 7 => PASS (no Warp Rupture)
      const dice = new FixedDiceProvider([2, 3]);
      const result = invokeHandler(REACTION_ID, context, dice);

      // Should have a coolCheck event (WP check repurposed as coolCheck)
      const checkEvents = result.events.filter(e => e.type === 'coolCheck');
      expect(checkEvents.length).toBe(1);
      expect(checkEvents[0].roll).toBe(5);
      expect(checkEvents[0].target).toBe(7);
      expect(checkEvents[0].passed).toBe(true);

      // No damage events on pass
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents.length).toBe(0);
    });

    it('should use dice.roll2D6() for the WP check (consumes 2 dice)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: 2d6 => 1+1=2 <= 7 => PASS
      const dice = new FixedDiceProvider([1, 1]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      // Exactly 2 dice consumed
      expect(dice.rollsUsed).toBe(2);
    });

    it('should have modifiers with correct source string', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // WP check: pass
      const dice = new FixedDiceProvider([3, 4]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const invulnMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'InvulnSave')!;
      expect(invulnMod.source).toBe('Fortress of the Mind');
      expect(invulnMod.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. WORD BEARERS — Glorious Martyrdom (wb-glorious-martyrdom)
  //
  // Effects:
  // - Select the first alive model in the reacting unit as the martyr
  // - Add a MartyrTarget modifier to that model
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Word Bearers — Glorious Martyrdom (wb-glorious-martyrdom)', () => {
    const REACTION_ID = 'wb-glorious-martyrdom';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should add MartyrTarget modifier to first alive model', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
        makeModel('r3', { x: 2, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;

      // First model should have MartyrTarget modifier
      const martyrMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'MartyrTarget');
      expect(martyrMod).toBeDefined();
      expect(martyrMod!.value).toBe(1);

      // Other models should NOT have MartyrTarget modifier
      const r2Mod = reactUnit.models[1].modifiers.find(m => m.characteristic === 'MartyrTarget');
      expect(r2Mod).toBeUndefined();
      const r3Mod = reactUnit.models[2].modifiers.find(m => m.characteristic === 'MartyrTarget');
      expect(r3Mod).toBeUndefined();
    });

    it('should return success:true when a model is found', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
    });

    it('should return success:false when no alive models', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }, { isDestroyed: true, currentWounds: 0 }),
        makeModel('r2', { x: 1, y: 0 }, { isDestroyed: true, currentWounds: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(false);
    });

    it('should have modifier with correct characteristic and source', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const martyrMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'MartyrTarget')!;
      expect(martyrMod.characteristic).toBe('MartyrTarget');
      expect(martyrMod.source).toBe('Glorious Martyrdom');
      expect(martyrMod.operation).toBe('set');
      expect(martyrMod.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ALPHA LEGION — Smoke and Mirrors (al-smoke-and-mirrors)
  //
  // Effects:
  // - Add PrecisionThreshold:6 modifier to each model in the REACTING unit
  //   (Note: from reading the source, the modifier is applied to the reacting unit,
  //    not the attacker)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Alpha Legion — Smoke and Mirrors (al-smoke-and-mirrors)', () => {
    const REACTION_ID = 'al-smoke-and-mirrors';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should add PrecisionThreshold:6 modifier to all models in the reacting unit', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
        makeModel('r3', { x: 2, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const precMod = model.modifiers.find(m => m.characteristic === 'PrecisionThreshold');
        expect(precMod).toBeDefined();
        expect(precMod!.value).toBe(6);
      }
    });

    it('should apply modifier to the reacting unit models (not attacker)', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      // Reacting unit should have the modifier
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      expect(reactUnit.models[0].modifiers.find(m => m.characteristic === 'PrecisionThreshold')).toBeDefined();

      // Enemy unit should NOT have the modifier
      const enemyUnitState = result.state.armies[0].units.find(u => u.id === 'enemy-1')!;
      expect(enemyUnitState.models[0].modifiers.find(m => m.characteristic === 'PrecisionThreshold')).toBeUndefined();
    });

    it('should have modifier with correct source and expiry', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);

      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const precMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'PrecisionThreshold')!;
      expect(precMod.source).toBe('Smoke and Mirrors');
      expect(precMod.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
    });

    it('should return success:true', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. WORLD EATERS — Brutal Tide (we-brutal-tide)
  //
  // Effects:
  // - Add Eternal Warrior (1) modifier to each model
  // - Counter-charge roll: 2d6 (discard lowest), compare to closest distance
  // - If charge roll >= distance: charge succeeds, move models toward enemy
  // - If charge fails: still applies EternalWarrior
  // ═══════════════════════════════════════════════════════════════════════════

  describe('World Eaters — Brutal Tide (we-brutal-tide)', () => {
    const REACTION_ID = 'we-brutal-tide';

    it('should return success:false when reacting unit is missing', () => {
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 20, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], []);
      const context = makeContext(state, REACTION_ID, 'nonexistent-unit', 'enemy-1');
      const dice = new FixedDiceProvider([]);
      const result = invokeHandler(REACTION_ID, context, dice);
      expect(result.success).toBe(false);
    });

    it('should add EternalWarrior modifier to reacting unit models', () => {
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 1, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 5, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 6, 5 => max(6,5)=6, distance from r1 to e1 = 5 => success
      const dice = new FixedDiceProvider([6, 5]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      for (const model of reactUnit.models) {
        const ewMod = model.modifiers.find(m => m.characteristic === 'EternalWarrior');
        expect(ewMod).toBeDefined();
        expect(ewMod!.value).toBe(1);
        expect(ewMod!.source).toBe('Brutal Tide');
        expect(ewMod!.expiresAt).toEqual({ type: 'endOfPhase', phase: Phase.Shooting });
      }
    });

    it('should roll 2d6 and use the best roll for charge distance', () => {
      // Models 8" apart. Charge roll: 2d6 => 3, 6 => max(3,6)=6 < 8 => fail
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 8, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 3, 6 => max=6, need 8 => fail
      const dice = new FixedDiceProvider([3, 6]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);
      const chargeRollEvent = result.events.find(e => e.type === 'chargeRoll');
      expect(chargeRollEvent).toBeDefined();
      expect(chargeRollEvent!.chargeRoll).toBe(6);
      expect(chargeRollEvent!.discardedDie).toBe(3);
      expect(chargeRollEvent!.diceValues).toEqual([3, 6]);

      // Charge should have failed
      const failedEvent = result.events.find(e => e.type === 'chargeFailed');
      expect(failedEvent).toBeDefined();
    });

    it('should succeed counter-charge when best roll >= distance and move models toward attacker', () => {
      // Models 4" apart. Charge roll: 2d6 => 5, 3 => max(5,3)=5 >= 4 => success
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 4, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 5, 3 => max=5 >= 4 => success
      const dice = new FixedDiceProvider([5, 3]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      // chargeSucceeded event should be present
      const successEvent = result.events.find(e => e.type === 'chargeSucceeded');
      expect(successEvent).toBeDefined();
      expect(successEvent!.chargingUnitId).toBe('react-1');
      expect(successEvent!.targetUnitId).toBe('enemy-1');

      // Model should have moved toward the enemy
      const movedModel = result.state.armies[1].units.find(u => u.id === 'react-1')!.models[0];
      // r1 at (0,0) moves toward e1 at (4,0), charge roll = 5, but distance is only 4
      // moveToward returns target position when dist <= maxDistance
      expect(movedModel.position.x).toBeCloseTo(4, 5);
      expect(movedModel.position.y).toBeCloseTo(0, 5);
    });

    it('should still apply EternalWarrior when counter-charge fails', () => {
      // Model centres are 12" apart, but the engine uses base-aware closest distance.
      // With 32mm bases, the live required charge distance is about 10.74".
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 12, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 1, 2 => max=2 < 12 => fail
      const dice = new FixedDiceProvider([1, 2]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      // EternalWarrior should still be applied
      const reactUnit = result.state.armies[1].units.find(u => u.id === 'react-1')!;
      const ewMod = reactUnit.models[0].modifiers.find(m => m.characteristic === 'EternalWarrior');
      expect(ewMod).toBeDefined();

      // chargeFailed event
      const failedEvent = result.events.find(e => e.type === 'chargeFailed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent!.chargeRoll).toBe(2);
      expect(failedEvent!.distanceNeeded).toBeCloseTo(10.74, 2);

      // No chargeMove events on failure
      const chargeMoveEvents = result.events.filter(e => e.type === 'chargeMove');
      expect(chargeMoveEvents.length).toBe(0);
    });

    it('should emit chargeRoll and chargeMove events on success', () => {
      // Models 3" apart. Charge roll: 2d6 => 4, 6 => max=6 >= 3 => success
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
        makeModel('r2', { x: 0, y: 1 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 3, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 4, 6 => max=6 >= closest distance => success
      const dice = new FixedDiceProvider([4, 6]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      // chargeRoll event
      const chargeRollEvent = result.events.find(e => e.type === 'chargeRoll');
      expect(chargeRollEvent).toBeDefined();
      expect(chargeRollEvent!.chargingUnitId).toBe('react-1');
      expect(chargeRollEvent!.targetUnitId).toBe('enemy-1');

      // chargeMove events (one per model)
      const chargeMoveEvents = result.events.filter(e => e.type === 'chargeMove');
      expect(chargeMoveEvents.length).toBe(2);
      expect(chargeMoveEvents[0].modelId).toBe('r1');
      expect(chargeMoveEvents[1].modelId).toBe('r2');
    });

    it('should emit chargeSucceeded on successful counter-charge', () => {
      // Models 2" apart. Charge roll: 2d6 => 6, 6 => max=6 >= 2 => success
      const reactingUnit = makeUnit('react-1', [
        makeModel('r1', { x: 0, y: 0 }),
      ]);
      const enemyUnit = makeUnit('enemy-1', [
        makeModel('e1', { x: 2, y: 0 }),
      ]);
      const state = makeGameState([enemyUnit], [reactingUnit]);
      const context = makeContext(state, REACTION_ID, 'react-1', 'enemy-1');
      // Charge roll: 2d6 => 6, 6 => max=6 >= 2 => success
      const dice = new FixedDiceProvider([6, 6]);
      const result = invokeHandler(REACTION_ID, context, dice);

      expect(result.success).toBe(true);

      const successEvent = result.events.find(e => e.type === 'chargeSucceeded');
      expect(successEvent).toBeDefined();
      expect(successEvent!.chargingUnitId).toBe('react-1');
      expect(successEvent!.targetUnitId).toBe('enemy-1');
      expect(successEvent!.chargeRoll).toBe(6);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration', () => {
    it('should register all 10 shooting reaction handlers', () => {
      const reactionIds = [
        'sw-bestial-savagery',
        'ba-wrath-of-angels',
        'iw-bitter-fury',
        'um-retribution-strike',
        'rg-shadow-veil',
        'dg-barbaran-endurance',
        'ts-fortress-of-mind',
        'wb-glorious-martyrdom',
        'al-smoke-and-mirrors',
        'we-brutal-tide',
      ];
      for (const id of reactionIds) {
        const handler = getAdvancedReactionHandler(id);
        expect(handler).toBeDefined();
      }
    });
  });
});
