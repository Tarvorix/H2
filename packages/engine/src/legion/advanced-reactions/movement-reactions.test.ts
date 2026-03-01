/**
 * Movement-Phase Advanced Reaction Handler Tests
 *
 * Tests the two movement-triggered advanced reaction handlers:
 *
 * 1. White Scars — "Chasing the Wind" (ws-chasing-wind)
 *    Each alive model in the reacting unit moves up to 7" toward the nearest
 *    model in the trigger source unit.
 *
 * 2. Imperial Fists — "Bastion of Fire" (if-bastion-of-fire)
 *    Each alive model in the reacting unit fires at the trigger source unit.
 *    Hit on 4+ (BS 4), Wound on 4+ (S4 vs T4), 1 damage per wound.
 *
 * Reference: HH_Legiones_Astartes.md — White Scars & Imperial Fists
 *            "Advanced Reaction" subsections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAdvancedReactionRegistry,
  getAdvancedReactionHandler,
  hasAdvancedReactionHandler,
} from '../advanced-reaction-registry';
import type { AdvancedReactionContext } from '../advanced-reaction-registry';
import { registerMovementReactions } from './movement-reactions';
import { findAdvancedReaction } from '@hh/data';
import {
  LegionFaction,
  Phase,
  SubPhase,
  Allegiance,
  UnitMovementState,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import { FixedDiceProvider } from '../../dice';
import type { ModelMovedEvent } from '../../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(id: string, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'test-profile',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['boltgun'],
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

function makeArmy(playerIndex: number, faction: LegionFaction, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex}`,
    faction,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
  } as ArmyState;
}

function makeGameState(
  activeArmy: ArmyState,
  reactiveArmy: ArmyState,
): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [activeArmy, reactiveArmy],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Movement-Phase Advanced Reactions', () => {
  beforeEach(() => {
    clearAdvancedReactionRegistry();
    registerMovementReactions();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registerMovementReactions', () => {
    it('should register the ws-chasing-wind handler', () => {
      expect(hasAdvancedReactionHandler('ws-chasing-wind')).toBe(true);
      expect(getAdvancedReactionHandler('ws-chasing-wind')).toBeDefined();
    });

    it('should register the if-bastion-of-fire handler', () => {
      expect(hasAdvancedReactionHandler('if-bastion-of-fire')).toBe(true);
      expect(getAdvancedReactionHandler('if-bastion-of-fire')).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WHITE SCARS (V) — Chasing the Wind
  //
  // Each alive model in the reacting unit moves up to 7" toward the nearest
  // model in the trigger source (enemy) unit.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('White Scars — Chasing the Wind', () => {
    const reactionId = 'ws-chasing-wind';

    it('should return success:false when the reacting unit is not found', () => {
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, []);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, []);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'nonexistent-unit', 'trigger-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should return success:false when the trigger unit is not found', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, []);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'nonexistent-trigger');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should return success:false when the reacting unit has no alive models', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 }, isDestroyed: true, currentWounds: 0 }),
        makeModel('m2', { position: { x: 1, y: 0 }, isDestroyed: true, currentWounds: 0 }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should move all alive models toward the nearest enemy model', () => {
      // Reacting unit at x=0, enemy at x=10 — distance 10"
      // Models should move 7" toward the enemy (from x=0 to x=7)
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
        makeModel('m2', { position: { x: 0, y: 1 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);

      // Both models should have moved
      const movedEvents = result.events.filter(e => e.type === 'modelMoved');
      expect(movedEvents).toHaveLength(2);

      // m1 at (0,0) moving toward e1 at (10,0) — straight horizontal, moves 7
      const m1Event = movedEvents.find(e => (e as ModelMovedEvent).modelId === 'm1') as ModelMovedEvent;
      expect(m1Event.toPosition.x).toBeCloseTo(7, 1);
      expect(m1Event.toPosition.y).toBeCloseTo(0, 1);
    });

    it('should move models up to 7" (movement distance limit)', () => {
      // Reacting unit at (0,0), enemy at (20,0) — distance 20"
      // Model should move exactly 7"
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 20, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const movedEvent = result.events[0] as ModelMovedEvent;
      expect(movedEvent.distanceMoved).toBeCloseTo(7, 5);
      expect(movedEvent.toPosition.x).toBeCloseTo(7, 5);
      expect(movedEvent.toPosition.y).toBeCloseTo(0, 5);
    });

    it('should not overshoot when closer than 7"', () => {
      // Reacting unit at (0,0), enemy at (3,0) — distance 3"
      // Model should move only 3" to reach the enemy, not 7"
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 3, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const movedEvent = result.events[0] as ModelMovedEvent;
      // Should move exactly 3" (the distance to the enemy), not 7"
      expect(movedEvent.distanceMoved).toBeCloseTo(3, 5);
      expect(movedEvent.toPosition.x).toBeCloseTo(3, 5);
      expect(movedEvent.toPosition.y).toBeCloseTo(0, 5);
    });

    it('should emit modelMoved events for each moved model', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
        makeModel('m2', { position: { x: 1, y: 0 } }),
        makeModel('m3', { position: { x: 2, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 20, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      // All 3 models should produce modelMoved events
      const movedEvents = result.events.filter(e => e.type === 'modelMoved');
      expect(movedEvents).toHaveLength(3);
      // All events should be for the reacting unit
      for (const event of movedEvents) {
        expect((event as ModelMovedEvent).unitId).toBe('ws-unit');
      }
    });

    it('should emit events with correct fromPosition and toPosition', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 5, y: 3 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 15, y: 3 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const movedEvent = result.events[0] as ModelMovedEvent;
      // fromPosition should be the original position
      expect(movedEvent.fromPosition).toEqual({ x: 5, y: 3 });
      // toPosition should be 7" toward (15,3) from (5,3) — straight horizontal
      expect(movedEvent.toPosition.x).toBeCloseTo(12, 5);
      expect(movedEvent.toPosition.y).toBeCloseTo(3, 5);
    });

    it('should emit events with correct distanceMoved', () => {
      // Place model at origin, enemy at (10,0) — model moves 7" along x-axis
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const movedEvent = result.events[0] as ModelMovedEvent;
      expect(movedEvent.distanceMoved).toBeCloseTo(7, 5);
    });

    it('should update model positions in the returned state', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      // Find the reacting unit in the updated state
      const updatedReactiveArmy = result.state.armies[1];
      const updatedUnit = updatedReactiveArmy.units.find(u => u.id === 'ws-unit')!;
      const updatedModel = updatedUnit.models.find(m => m.id === 'm1')!;
      // m1 should have moved from (0,0) toward (10,0) by 7"
      expect(updatedModel.position.x).toBeCloseTo(7, 5);
      expect(updatedModel.position.y).toBeCloseTo(0, 5);
    });

    it('should not move toward dead enemy models', () => {
      // Place one alive enemy at (10,0) and one dead enemy at (3,0)
      // The model should move toward (10,0), not toward (3,0)
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e-dead', { position: { x: 3, y: 0 }, isDestroyed: true, currentWounds: 0 }),
        makeModel('e-alive', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const movedEvent = result.events[0] as ModelMovedEvent;
      // Should move toward (10,0) not (3,0)
      // From (0,0) toward (10,0) by 7" = (7,0)
      expect(movedEvent.toPosition.x).toBeCloseTo(7, 5);
      expect(movedEvent.toPosition.y).toBeCloseTo(0, 5);
    });

    it('should handle a single model reacting unit', () => {
      const reactingUnit = makeUnit('ws-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.WhiteScars, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'ws-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      const movedEvent = result.events[0] as ModelMovedEvent;
      expect(movedEvent.type).toBe('modelMoved');
      expect(movedEvent.modelId).toBe('m1');
      expect(movedEvent.unitId).toBe('ws-unit');
      expect(movedEvent.distanceMoved).toBeCloseTo(7, 5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPERIAL FISTS (VII) — Bastion of Fire
  //
  // Each alive model in the reacting unit fires at the trigger source unit.
  // Hit on 4+ (BS 4), Wound on 4+ (S4 vs T4), 1 damage per wound.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Imperial Fists — Bastion of Fire', () => {
    const reactionId = 'if-bastion-of-fire';

    it('should return success:false when the reacting unit is not found', () => {
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, []);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, []);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'nonexistent-unit', 'trigger-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should return success:false when the trigger unit is not found', () => {
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, []);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'nonexistent-trigger');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should return success:false when there are no alive shooters', () => {
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 }, isDestroyed: true, currentWounds: 0 }),
        makeModel('m2', { position: { x: 1, y: 0 }, isDestroyed: true, currentWounds: 0 }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([]);

      const result = handler(context, dice);

      expect(result.success).toBe(false);
      expect(result.events).toHaveLength(0);
    });

    it('should hit on a roll of 4+ (BS 4 threshold)', () => {
      // Single shooter, dice: [4] for hit, [4] for wound
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      // Roll 4 to hit (passes), roll 4 to wound (passes)
      const dice = new FixedDiceProvider([4, 4]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      // Should have a fireGroupResolved event with totalHits >= 1
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent).toBeDefined();
      expect(fireGroupEvent.totalHits).toBe(1);
    });

    it('should miss on a hit roll of 3 (below BS 4 threshold)', () => {
      // Single shooter, dice: [3] for hit — miss, no wound roll
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      // Roll 3 to hit — miss
      const dice = new FixedDiceProvider([3]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent).toBeDefined();
      expect(fireGroupEvent.totalHits).toBe(0);
      expect(fireGroupEvent.totalWounds).toBe(0);
      // No damageApplied events
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents).toHaveLength(0);
    });

    it('should wound on a wound roll of 4+ (S4 vs T4)', () => {
      // Single shooter: hit roll 4 (hit), wound roll 4 (wound)
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([4, 4]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent.totalHits).toBe(1);
      expect(fireGroupEvent.totalWounds).toBe(1);
    });

    it('should fail to wound on a wound roll of 3 (below S4 vs T4 threshold)', () => {
      // Single shooter: hit roll 4 (hit), wound roll 3 (fail)
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 } }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      // Roll 4 to hit (passes), roll 3 to wound (fails)
      const dice = new FixedDiceProvider([4, 3]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent.totalHits).toBe(1);
      expect(fireGroupEvent.totalWounds).toBe(0);
      // No damage applied since wound failed
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents).toHaveLength(0);
    });

    it('should apply damage to the first alive model in the target unit', () => {
      // Single shooter: hit roll 4, wound roll 4 — applies 1 damage to first alive target
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 }, currentWounds: 2 }),
        makeModel('e2', { position: { x: 11, y: 0 }, currentWounds: 2 }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([4, 4]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      // Damage should be applied to e1 (first alive model)
      const damageEvent = result.events.find(e => e.type === 'damageApplied') as any;
      expect(damageEvent).toBeDefined();
      expect(damageEvent.modelId).toBe('e1');
      expect(damageEvent.unitId).toBe('enemy-unit');
      expect(damageEvent.woundsLost).toBe(1);
      expect(damageEvent.remainingWounds).toBe(1); // 2 - 1 = 1
      expect(damageEvent.destroyed).toBe(false);

      // Verify state was updated
      const updatedTriggerUnit = result.state.armies[0].units.find(u => u.id === 'enemy-unit')!;
      const updatedE1 = updatedTriggerUnit.models.find(m => m.id === 'e1')!;
      expect(updatedE1.currentWounds).toBe(1);
      expect(updatedE1.isDestroyed).toBe(false);
    });

    it('should emit a damageApplied event when damage is dealt', () => {
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 }, currentWounds: 1 }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([4, 4]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const damageEvent = result.events.find(e => e.type === 'damageApplied') as any;
      expect(damageEvent).toBeDefined();
      expect(damageEvent.type).toBe('damageApplied');
      expect(damageEvent.modelId).toBe('e1');
      expect(damageEvent.unitId).toBe('enemy-unit');
      expect(damageEvent.woundsLost).toBe(1);
      expect(damageEvent.damageSource).toBe('Bastion of Fire');
    });

    it('should emit a casualtyRemoved event when a model is destroyed', () => {
      // Target model has 1 wound, so 1 damage destroys it
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 }, currentWounds: 1 }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      const dice = new FixedDiceProvider([4, 4]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);

      // Verify damageApplied shows destroyed
      const damageEvent = result.events.find(e => e.type === 'damageApplied') as any;
      expect(damageEvent.destroyed).toBe(true);
      expect(damageEvent.remainingWounds).toBe(0);

      // Verify casualtyRemoved event
      const casualtyEvent = result.events.find(e => e.type === 'casualtyRemoved') as any;
      expect(casualtyEvent).toBeDefined();
      expect(casualtyEvent.modelId).toBe('e1');
      expect(casualtyEvent.unitId).toBe('enemy-unit');

      // Verify the model is destroyed in the updated state
      const updatedUnit = result.state.armies[0].units.find(u => u.id === 'enemy-unit')!;
      const updatedModel = updatedUnit.models.find(m => m.id === 'e1')!;
      expect(updatedModel.isDestroyed).toBe(true);
      expect(updatedModel.currentWounds).toBe(0);
    });

    it('should emit a fireGroupResolved summary event with correct totalHits and totalWounds', () => {
      // 2 shooters: first hits and wounds, second misses
      // Dice: [4, 4, 2] — shooter1 hits(4) wounds(4), shooter2 misses(2)
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
        makeModel('m2', { position: { x: 1, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 }, currentWounds: 2 }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      // Shooter 1: hit(4), wound(4); Shooter 2: miss(2)
      const dice = new FixedDiceProvider([4, 4, 2]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent).toBeDefined();
      expect(fireGroupEvent.type).toBe('fireGroupResolved');
      expect(fireGroupEvent.totalHits).toBe(1);
      expect(fireGroupEvent.totalWounds).toBe(1);
      expect(fireGroupEvent.weaponName).toBe('Bastion of Fire (Reaction)');
      expect(fireGroupEvent.fireGroupIndex).toBe(0);
      expect(fireGroupEvent.totalPenetrating).toBe(0);
      expect(fireGroupEvent.totalGlancing).toBe(0);
    });

    it('should handle multiple shooters firing independently with a dice sequence', () => {
      // 3 shooters firing at 2 enemy models with 1 wound each
      // Dice: [6, 5, 4, 4, 5, 6]
      // Shooter 1: hit(6), wound(5) -> wound on e1, e1 destroyed
      // Shooter 2: hit(4), wound(4) -> wound on e2, e2 destroyed
      // Shooter 3: hit(5), wound(6) -> no alive targets left, wound counted but damage applied breaks
      const reactingUnit = makeUnit('if-unit', [
        makeModel('m1', { position: { x: 0, y: 0 } }),
        makeModel('m2', { position: { x: 1, y: 0 } }),
        makeModel('m3', { position: { x: 2, y: 0 } }),
      ]);
      const triggerUnit = makeUnit('enemy-unit', [
        makeModel('e1', { position: { x: 10, y: 0 }, currentWounds: 1 }),
        makeModel('e2', { position: { x: 11, y: 0 }, currentWounds: 1 }),
      ]);
      const activeArmy = makeArmy(0, LegionFaction.DarkAngels, [triggerUnit]);
      const reactiveArmy = makeArmy(1, LegionFaction.ImperialFists, [reactingUnit]);
      const state = makeGameState(activeArmy, reactiveArmy);
      const handler = getAdvancedReactionHandler(reactionId)!;
      const context = makeContext(state, reactionId, 'if-unit', 'enemy-unit');
      // Shooter 1: hit(6), wound(5) — hits and wounds e1 (destroyed)
      // Shooter 2: hit(4), wound(4) — hits and wounds e2 (destroyed)
      // Shooter 3: hit(5), wound(6) — hits and wounds, but no alive targets left -> break
      const dice = new FixedDiceProvider([6, 5, 4, 4, 5, 6]);

      const result = handler(context, dice);

      expect(result.success).toBe(true);

      // Check the fireGroupResolved event
      const fireGroupEvent = result.events.find(e => e.type === 'fireGroupResolved') as any;
      expect(fireGroupEvent).toBeDefined();
      // All 3 shooters hit
      expect(fireGroupEvent.totalHits).toBe(3);
      // First two wounds apply, third wounds but no target so it still increments
      // then breaks. Let's trace the code:
      // Shooter 1: hitRoll=6>=4 (hit), totalHits=1, woundRoll=5>=4 (wound), totalWounds=1, apply to e1
      // Shooter 2: hitRoll=4>=4 (hit), totalHits=2, woundRoll=4>=4 (wound), totalWounds=2, apply to e2
      // Shooter 3: hitRoll=5>=4 (hit), totalHits=3, woundRoll=6>=4 (wound), totalWounds=3,
      //   but aliveTargets.length===0 -> break
      // Actually, totalWounds increments BEFORE the alive check, so totalWounds=3
      // but the break happens after the totalWounds++ and before applying damage
      expect(fireGroupEvent.totalWounds).toBe(3);

      // Two models should be destroyed
      const casualtyEvents = result.events.filter(e => e.type === 'casualtyRemoved');
      expect(casualtyEvents).toHaveLength(2);
      expect((casualtyEvents[0] as any).modelId).toBe('e1');
      expect((casualtyEvents[1] as any).modelId).toBe('e2');

      // Verify damage events — only 2 because 3rd wound had no target
      const damageEvents = result.events.filter(e => e.type === 'damageApplied');
      expect(damageEvents).toHaveLength(2);

      // Verify state: both enemy models destroyed
      const updatedTriggerUnit = result.state.armies[0].units.find(u => u.id === 'enemy-unit')!;
      expect(updatedTriggerUnit.models.every(m => m.isDestroyed)).toBe(true);
    });
  });
});
