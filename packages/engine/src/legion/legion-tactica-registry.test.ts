/**
 * Legion Tactica Registry Tests
 *
 * Tests for the registry functions: register, get, has, clear, list,
 * apply (with result merging), and bulk registration of all 18 legions.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerLegionTactica,
  getLegionTacticaHandlers,
  hasLegionTactica,
  clearLegionTacticaRegistry,
  getRegisteredLegionTacticas,
  applyLegionTactica,
  registerAllLegionTacticas,
} from './legion-tactica-registry';
import type {
  LegionTacticaHandler,
  LegionTacticaResult,
  ShootingTacticaContext,
} from './legion-tactica-registry';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
  UnitMovementState,
} from '@hh/types';
import type { GameState, ArmyState, UnitState } from '@hh/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMinimalArmy(playerIndex: number): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex}`,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units: [],
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
  } as ArmyState;
}

function makeMinimalGameState(): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [makeMinimalArmy(0), makeMinimalArmy(1)],
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

function makeMinimalUnit(id: string): UnitState {
  return {
    id,
    profileId: 'test-profile',
    models: [],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Legion Tactica Registry', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
  });

  // ─── registerLegionTactica ─────────────────────────────────────────────────

  describe('registerLegionTactica', () => {
    it('should register a handler for a legion and hook', () => {
      const handler: LegionTacticaHandler = () => ({});
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler);
      expect(hasLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive)).toBe(true);
    });

    it('should allow registering multiple handlers for the same legion and hook', () => {
      const handler1: LegionTacticaHandler = () => ({ minimumLeadership: 6 });
      const handler2: LegionTacticaHandler = () => ({ maxFearReduction: 1 });
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler1);
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler2);
      const handlers = getLegionTacticaHandlers(LegionFaction.DarkAngels, PipelineHook.Passive);
      expect(handlers.length).toBe(2);
    });

    it('should allow registering handlers for different hooks on the same legion', () => {
      const handler1: LegionTacticaHandler = () => ({});
      const handler2: LegionTacticaHandler = () => ({});
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, handler1);
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, handler2);
      expect(hasLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit)).toBe(true);
      expect(hasLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement)).toBe(true);
    });

    it('should allow registering handlers for different legions', () => {
      const handler1: LegionTacticaHandler = () => ({});
      const handler2: LegionTacticaHandler = () => ({});
      registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, handler1);
      registerLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, handler2);
      expect(hasLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit)).toBe(true);
      expect(hasLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit)).toBe(true);
    });
  });

  // ─── getLegionTacticaHandlers ──────────────────────────────────────────────

  describe('getLegionTacticaHandlers', () => {
    it('should return handlers for a registered legion and hook', () => {
      const handler: LegionTacticaHandler = () => ({ hitModifier: 1 });
      registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, handler);
      const handlers = getLegionTacticaHandlers(LegionFaction.ImperialFists, PipelineHook.PreHit);
      expect(handlers.length).toBe(1);
      expect(handlers[0]).toBe(handler);
    });

    it('should return empty array for unregistered legion', () => {
      const handlers = getLegionTacticaHandlers(LegionFaction.AlphaLegion, PipelineHook.PreHit);
      expect(handlers).toEqual([]);
    });

    it('should return empty array for unregistered hook on a registered legion', () => {
      const handler: LegionTacticaHandler = () => ({});
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler);
      const handlers = getLegionTacticaHandlers(LegionFaction.DarkAngels, PipelineHook.PreHit);
      expect(handlers).toEqual([]);
    });

    it('should return all handlers in registration order', () => {
      const handler1: LegionTacticaHandler = () => ({ minimumLeadership: 6 });
      const handler2: LegionTacticaHandler = () => ({ maxFearReduction: 1 });
      const handler3: LegionTacticaHandler = () => ({ willpowerBonus: 1 });
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler1);
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler2);
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, handler3);
      const handlers = getLegionTacticaHandlers(LegionFaction.DarkAngels, PipelineHook.Passive);
      expect(handlers.length).toBe(3);
      expect(handlers[0]).toBe(handler1);
      expect(handlers[1]).toBe(handler2);
      expect(handlers[2]).toBe(handler3);
    });
  });

  // ─── hasLegionTactica ──────────────────────────────────────────────────────

  describe('hasLegionTactica', () => {
    it('should return true when handlers exist', () => {
      registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, () => ({}));
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge)).toBe(true);
    });

    it('should return false when no handlers exist for the legion', () => {
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge)).toBe(false);
    });

    it('should return false when no handlers exist for the hook', () => {
      registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, () => ({}));
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.PreHit)).toBe(false);
    });
  });

  // ─── clearLegionTacticaRegistry ────────────────────────────────────────────

  describe('clearLegionTacticaRegistry', () => {
    it('should remove all registered handlers', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({}));
      registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, () => ({}));
      registerLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, () => ({}));

      clearLegionTacticaRegistry();

      expect(hasLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive)).toBe(false);
      expect(hasLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit)).toBe(false);
      expect(hasLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit)).toBe(false);
    });

    it('should result in empty registered list', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({}));
      clearLegionTacticaRegistry();
      expect(getRegisteredLegionTacticas()).toEqual([]);
    });

    it('should allow re-registration after clearing', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({}));
      clearLegionTacticaRegistry();
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({ minimumLeadership: 7 }));
      expect(hasLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive)).toBe(true);
      const handlers = getLegionTacticaHandlers(LegionFaction.DarkAngels, PipelineHook.Passive);
      expect(handlers.length).toBe(1);
    });
  });

  // ─── getRegisteredLegionTacticas ───────────────────────────────────────────

  describe('getRegisteredLegionTacticas', () => {
    it('should return empty array when nothing is registered', () => {
      expect(getRegisteredLegionTacticas()).toEqual([]);
    });

    it('should return all registered legion-hook pairs', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({}));
      registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, () => ({}));
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, () => ({}));
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, () => ({}));

      const registered = getRegisteredLegionTacticas();
      expect(registered.length).toBe(4);
      expect(registered).toContainEqual({ legion: LegionFaction.DarkAngels, hook: PipelineHook.Passive });
      expect(registered).toContainEqual({ legion: LegionFaction.ImperialFists, hook: PipelineHook.PreHit });
      expect(registered).toContainEqual({ legion: LegionFaction.DeathGuard, hook: PipelineHook.PreHit });
      expect(registered).toContainEqual({ legion: LegionFaction.DeathGuard, hook: PipelineHook.Movement });
    });

    it('should not duplicate entries when multiple handlers share the same legion+hook', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({ minimumLeadership: 6 }));
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({ maxFearReduction: 1 }));

      const registered = getRegisteredLegionTacticas();
      const darkAngelsPassive = registered.filter(
        r => r.legion === LegionFaction.DarkAngels && r.hook === PipelineHook.Passive,
      );
      expect(darkAngelsPassive.length).toBe(1);
    });
  });

  // ─── applyLegionTactica ────────────────────────────────────────────────────

  describe('applyLegionTactica', () => {
    it('should return empty result when no handlers are registered', () => {
      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.PreHit,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.PreHit, context);
      expect(result).toEqual({});
    });

    it('should return the result from a single handler', () => {
      registerLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, () => ({
        hitModifier: 1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.PreHit,
      };
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, context);
      expect(result.hitModifier).toBe(1);
    });

    it('should accumulate numeric fields from multiple handlers', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        hitModifier: 1,
      }));
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        hitModifier: 2,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, context);
      expect(result.hitModifier).toBe(3);
    });

    it('should OR boolean fields from multiple handlers', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        forceSnapShots: false,
      }));
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        forceSnapShots: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, context);
      expect(result.forceSnapShots).toBe(true);
    });

    it('should take the highest minimumWoundRoll (strictest)', () => {
      registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, () => ({
        minimumWoundRoll: 2,
      }));
      registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, () => ({
        minimumWoundRoll: 3,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnWound,
      };
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, context);
      expect(result.minimumWoundRoll).toBe(3);
    });

    it('should take the lowest setupMoveMax (most restrictive)', () => {
      registerLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, () => ({
        setupMoveMax: 6,
      }));
      registerLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, () => ({
        setupMoveMax: 4,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnCharge,
      };
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, context);
      expect(result.setupMoveMax).toBe(4);
    });

    it('should take the lowest maxFearReduction (most restrictive)', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        maxFearReduction: 3,
      }));
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        maxFearReduction: 1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, context);
      expect(result.maxFearReduction).toBe(1);
    });

    it('should take the highest minimumLeadership (strictest)', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        minimumLeadership: 5,
      }));
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({
        minimumLeadership: 6,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, context);
      expect(result.minimumLeadership).toBe(6);
    });

    it('should accumulate incomingStrengthModifier from multiple handlers', () => {
      registerLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, () => ({
        incomingStrengthModifier: -1,
      }));
      registerLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, () => ({
        incomingStrengthModifier: -1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.PreWound,
      };
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, context);
      expect(result.incomingStrengthModifier).toBe(-2);
    });

    it('should accumulate assault modifiers from multiple handlers', () => {
      registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, () => ({
        meleeAttacksModifier: 1,
        meleeStrengthModifier: 1,
        combatInitiativeModifier: 1,
      }));
      registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, () => ({
        meleeAttacksModifier: 1,
        meleeWSModifier: 1,
        crpBonus: 1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnCharge,
      };
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, context);
      expect(result.meleeAttacksModifier).toBe(2);
      expect(result.meleeStrengthModifier).toBe(1);
      expect(result.combatInitiativeModifier).toBe(1);
      expect(result.meleeWSModifier).toBe(1);
      expect(result.crpBonus).toBe(1);
    });

    it('should accumulate movement modifiers and OR ignoresDifficultTerrain', () => {
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, () => ({
        movementBonus: 2,
      }));
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, () => ({
        movementBonus: 1,
        ignoresDifficultTerrain: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Movement,
      };
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, context);
      expect(result.movementBonus).toBe(3);
      expect(result.ignoresDifficultTerrain).toBe(true);
    });

    it('should OR hereticus status option booleans', () => {
      registerLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, () => ({
        stupefiedStatusOption: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, context);
      expect(result.stupefiedStatusOption).toBe(true);
    });

    it('should OR grantPsykerTrait and accumulate willpowerBonus', () => {
      registerLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, () => ({
        willpowerBonus: 1,
      }));
      registerLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, () => ({
        grantPsykerTrait: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, context);
      expect(result.willpowerBonus).toBe(1);
      expect(result.grantPsykerTrait).toBe(true);
    });

    it('should accumulate reactionCostReduction', () => {
      registerLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, () => ({
        reactionCostReduction: 1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, context);
      expect(result.reactionCostReduction).toBe(1);
    });

    it('should accumulate virtualRangeIncrease', () => {
      registerLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, () => ({
        virtualRangeIncrease: 2,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.PreHit,
      };
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, context);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should OR countsAsStationary and volleyFullBS', () => {
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, () => ({
        countsAsStationary: true,
      }));
      registerLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, () => ({
        volleyFullBS: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.PreHit,
      };
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, context);
      expect(result.countsAsStationary).toBe(true);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should take the last panicImmunityFromTrait value', () => {
      registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, () => ({
        panicImmunityFromTrait: 'Flame',
      }));
      registerLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, () => ({
        panicImmunityFromTrait: 'Melta',
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnCasualty,
      };
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, context);
      expect(result.panicImmunityFromTrait).toBe('Melta');
    });

    it('should OR ignoreStatusMoraleMods', () => {
      registerLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, () => ({
        ignoreStatusMoraleMods: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnMorale,
      };
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, context);
      expect(result.ignoreStatusMoraleMods).toBe(true);
    });

    it('should handle handler returning empty object gracefully', () => {
      registerLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, () => ({}));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, context);
      expect(result).toEqual({});
    });

    it('should accumulate setupMoveBonus from multiple handlers', () => {
      registerLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, () => ({
        setupMoveBonus: 2,
      }));
      registerLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, () => ({
        setupMoveBonus: 1,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.OnCharge,
      };
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, context);
      expect(result.setupMoveBonus).toBe(3);
    });

    it('should OR lostToTheNailsStatusOption', () => {
      registerLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, () => ({
        lostToTheNailsStatusOption: true,
      }));

      const context = {
        state: makeMinimalGameState(),
        unit: makeMinimalUnit('u1'),
        effects: [],
        hook: PipelineHook.Passive,
      };
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, context);
      expect(result.lostToTheNailsStatusOption).toBe(true);
    });
  });

  // ─── registerAllLegionTacticas ─────────────────────────────────────────────

  describe('registerAllLegionTacticas', () => {
    it('should populate handlers for all 18 legions', () => {
      registerAllLegionTacticas();

      const allLegions = Object.values(LegionFaction);
      expect(allLegions.length).toBe(18);

      // Every legion should have at least one registered hook
      for (const legion of allLegions) {
        const allHooks = Object.values(PipelineHook);
        let hasAnyHook = false;
        for (const hook of allHooks) {
          if (hasLegionTactica(legion, hook)) {
            hasAnyHook = true;
            break;
          }
        }
        expect(hasAnyHook).toBe(true);
      }
    });

    it('should register shooting tacticas for Imperial Fists at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit)).toBe(true);
    });

    it('should register shooting tacticas for Sons of Horus at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit)).toBe(true);
    });

    it('should register shooting tacticas for Raven Guard at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit)).toBe(true);
    });

    it('should register shooting tacticas for Alpha Legion at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit)).toBe(true);
    });

    it('should register shooting tacticas for Iron Hands at PreWound', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound)).toBe(true);
    });

    it('should register shooting tacticas for Salamanders at OnWound and OnCasualty', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound)).toBe(true);
      expect(hasLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty)).toBe(true);
    });

    it('should register shooting tacticas for Death Guard at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit)).toBe(true);
    });

    it('should register assault tacticas for Emperor\'s Children at OnCharge', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge)).toBe(true);
    });

    it('should register assault tacticas for Blood Angels at OnCharge', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge)).toBe(true);
    });

    it('should register assault tacticas for World Eaters at OnCharge', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge)).toBe(true);
    });

    it('should register assault tacticas for Night Lords at PreHit', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit)).toBe(true);
    });

    it('should register assault tacticas for Word Bearers at OnDamage', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage)).toBe(true);
    });

    it('should register movement tacticas for White Scars at Movement', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement)).toBe(true);
    });

    it('should register movement tacticas for Space Wolves at OnCharge', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge)).toBe(true);
    });

    it('should register movement tacticas for Death Guard at Movement', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement)).toBe(true);
    });

    it('should register passive tacticas for Dark Angels at Passive', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive)).toBe(true);
    });

    it('should register passive tacticas for Iron Warriors at OnMorale', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale)).toBe(true);
    });

    it('should register passive tacticas for Thousand Sons at Passive', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive)).toBe(true);
    });

    it('should register passive tacticas for Ultramarines at Passive', () => {
      registerAllLegionTacticas();
      expect(hasLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive)).toBe(true);
    });

    it('should register hereticus tacticas for Emperor\'s Children at Passive', () => {
      registerAllLegionTacticas();
      // EC has both OnCharge (assault) and Passive (hereticus) registered
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive)).toBe(true);
    });

    it('should register hereticus tacticas for World Eaters at Passive', () => {
      registerAllLegionTacticas();
      // WE has both OnCharge (assault) and Passive (hereticus) registered
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive)).toBe(true);
    });

    it('should produce a substantial number of registered pairs', () => {
      registerAllLegionTacticas();
      const registered = getRegisteredLegionTacticas();
      // At least one per legion (18) but many legions have multiple hooks
      expect(registered.length).toBeGreaterThanOrEqual(18);
    });
  });
});
