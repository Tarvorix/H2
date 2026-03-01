/**
 * Rule Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerMovementRule,
  getMovementRule,
  hasMovementRule,
  getRegisteredRuleNames,
  clearRegistry,
  applyMovementRules,
} from './rule-registry';
import type { MovementRuleHandler, MovementRuleContext } from './rule-registry';
import { Phase, SubPhase, UnitMovementState, Allegiance, LegionFaction } from '@hh/types';
import type { GameState } from '@hh/types';
import { FixedDiceProvider } from '../dice';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createMockContext(): MovementRuleContext {
  const state: GameState = {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [{
      id: 'a0',
      playerIndex: 0,
      playerName: 'P1',
      faction: LegionFaction.SonsOfHorus,
      allegiance: Allegiance.Traitor,
      units: [],
      totalPoints: 1000,
      pointsLimit: 2000,
      reactionAllotmentRemaining: 1,
      baseReactionAllotment: 1,
      victoryPoints: 0,
    }, {
      id: 'a1',
      playerIndex: 1,
      playerName: 'P2',
      faction: LegionFaction.Ultramarines,
      allegiance: Allegiance.Loyalist,
      units: [],
      totalPoints: 1000,
      pointsLimit: 2000,
      reactionAllotmentRemaining: 1,
      baseReactionAllotment: 1,
      victoryPoints: 0,
    }],
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
  };

  return {
    state,
    unit: {
      id: 'u1',
      profileId: 'tactical',
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
    },
    dice: new FixedDiceProvider([]),
    terrain: [],
    battlefieldWidth: 72,
    battlefieldHeight: 48,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Rule Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('registerMovementRule', () => {
    it('should register a rule handler', () => {
      const handler: MovementRuleHandler = () => ({});
      registerMovementRule('TestRule', handler);
      expect(hasMovementRule('TestRule')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const handler: MovementRuleHandler = () => ({});
      registerMovementRule('TestRule', handler);
      expect(hasMovementRule('testrule')).toBe(true);
      expect(hasMovementRule('TESTRULE')).toBe(true);
    });
  });

  describe('getMovementRule', () => {
    it('should return the registered handler', () => {
      const handler: MovementRuleHandler = () => ({ countsAsStationary: true });
      registerMovementRule('MyRule', handler);
      const retrieved = getMovementRule('MyRule');
      expect(retrieved).toBe(handler);
    });

    it('should return undefined for unregistered rule', () => {
      expect(getMovementRule('NonexistentRule')).toBeUndefined();
    });
  });

  describe('getRegisteredRuleNames', () => {
    it('should return all registered rule names', () => {
      registerMovementRule('Rule1', () => ({}));
      registerMovementRule('Rule2', () => ({}));
      registerMovementRule('Rule3', () => ({}));
      const names = getRegisteredRuleNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('rule1');
      expect(names).toContain('rule2');
      expect(names).toContain('rule3');
    });
  });

  describe('clearRegistry', () => {
    it('should remove all registered rules', () => {
      registerMovementRule('Rule1', () => ({}));
      registerMovementRule('Rule2', () => ({}));
      clearRegistry();
      expect(getRegisteredRuleNames()).toHaveLength(0);
    });
  });

  describe('applyMovementRules', () => {
    it('should merge results from multiple rules', () => {
      registerMovementRule('RuleA', () => ({ countsAsStationary: true }));
      registerMovementRule('RuleB', () => ({ ignoresDifficultTerrain: true }));
      registerMovementRule('RuleC', () => ({ movementBonus: 2 }));

      const context = createMockContext();
      const result = applyMovementRules(
        [{ name: 'RuleA' }, { name: 'RuleB' }, { name: 'RuleC' }],
        context,
      );

      expect(result.countsAsStationary).toBe(true);
      expect(result.ignoresDifficultTerrain).toBe(true);
      expect(result.movementBonus).toBe(2);
    });

    it('should accumulate movement bonuses', () => {
      registerMovementRule('Bonus1', () => ({ movementBonus: 2 }));
      registerMovementRule('Bonus2', () => ({ movementBonus: 3 }));

      const context = createMockContext();
      const result = applyMovementRules(
        [{ name: 'Bonus1' }, { name: 'Bonus2' }],
        context,
      );

      expect(result.movementBonus).toBe(5);
    });

    it('should skip unregistered rules', () => {
      registerMovementRule('Known', () => ({ countsAsStationary: true }));

      const context = createMockContext();
      const result = applyMovementRules(
        [{ name: 'Known' }, { name: 'Unknown' }],
        context,
      );

      expect(result.countsAsStationary).toBe(true);
    });

    it('should pass value parameter to handlers', () => {
      registerMovementRule('WithValue', (_ctx, value) => ({
        movementBonus: typeof value === 'number' ? value : 0,
      }));

      const context = createMockContext();
      const result = applyMovementRules(
        [{ name: 'WithValue', value: 5 }],
        context,
      );

      expect(result.movementBonus).toBe(5);
    });

    it('should return empty result for no rules', () => {
      const context = createMockContext();
      const result = applyMovementRules([], context);
      expect(result.events).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });
});
