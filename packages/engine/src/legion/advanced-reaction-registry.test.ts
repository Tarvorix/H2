/**
 * Advanced Reaction Registry Tests
 *
 * Tests for the registry CRUD functions, bulk registration, availability checks,
 * usage tracking, trigger checks (movement, shooting, assault), and resolution.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections, "Advanced Reaction" subsections
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GameState, ArmyState, UnitState, ModelState, AdvancedReactionDefinition, AdvancedReactionUsage } from '@hh/types';
import { LegionFaction, Phase, SubPhase, Allegiance, UnitMovementState } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import {
  registerAdvancedReaction,
  getAdvancedReactionHandler,
  hasAdvancedReactionHandler,
  clearAdvancedReactionRegistry,
  getRegisteredAdvancedReactions,
  registerAllAdvancedReactions,
  isAdvancedReactionAvailable,
  hasAdvancedReactionBeenUsed,
  checkMovementAdvancedReactionTriggers,
  checkShootingAdvancedReactionTriggers,
  checkAssaultAdvancedReactionTriggers,
  resolveAdvancedReaction,
} from './advanced-reaction-registry';
import type { AdvancedReactionHandler, AdvancedReactionResult } from './advanced-reaction-registry';
import { findAdvancedReaction, getAdvancedReactionsForLegion } from '@hh/data';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeModel(id: string, x: number, y: number): ModelState {
  return {
    id,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'test-profile',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function makeUnit(id: string, options?: Partial<UnitState>): UnitState {
  return {
    id,
    profileId: 'test-profile',
    models: [makeModel(`${id}-m1`, 10, 10)],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...options,
  };
}

function makeArmy(playerIndex: number, faction: LegionFaction, allegiance: Allegiance = Allegiance.Loyalist, units: UnitState[] = []): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex}`,
    faction,
    allegiance,
    units,
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
  } as ArmyState;
}

function makeTestState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [
      makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
        makeUnit('active-u1'),
      ]),
      makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
        makeUnit('reactive-u1'),
      ]),
    ],
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
    ...overrides,
  } as GameState;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Advanced Reaction Registry', () => {
  beforeEach(() => {
    clearAdvancedReactionRegistry();
  });

  // ─── Registry CRUD ─────────────────────────────────────────────────────────

  describe('Registry CRUD', () => {
    it('should store a handler via registerAdvancedReaction', () => {
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [],
        success: true,
      });
      registerAdvancedReaction('test-reaction', handler);
      expect(getAdvancedReactionHandler('test-reaction')).toBe(handler);
    });

    it('should return the registered handler via getAdvancedReactionHandler', () => {
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [],
        success: true,
      });
      registerAdvancedReaction('ws-chasing-wind', handler);
      const retrieved = getAdvancedReactionHandler('ws-chasing-wind');
      expect(retrieved).toBe(handler);
    });

    it('should return undefined for an unknown reaction ID via getAdvancedReactionHandler', () => {
      const retrieved = getAdvancedReactionHandler('nonexistent-reaction');
      expect(retrieved).toBeUndefined();
    });

    it('should return true/false via hasAdvancedReactionHandler', () => {
      expect(hasAdvancedReactionHandler('test-reaction')).toBe(false);
      registerAdvancedReaction('test-reaction', (ctx) => ({
        state: ctx.state,
        events: [],
        success: true,
      }));
      expect(hasAdvancedReactionHandler('test-reaction')).toBe(true);
    });

    it('should empty the registry via clearAdvancedReactionRegistry', () => {
      registerAdvancedReaction('reaction-a', (ctx) => ({ state: ctx.state, events: [], success: true }));
      registerAdvancedReaction('reaction-b', (ctx) => ({ state: ctx.state, events: [], success: true }));
      expect(getRegisteredAdvancedReactions().length).toBe(2);

      clearAdvancedReactionRegistry();

      expect(getRegisteredAdvancedReactions().length).toBe(0);
      expect(hasAdvancedReactionHandler('reaction-a')).toBe(false);
      expect(hasAdvancedReactionHandler('reaction-b')).toBe(false);
    });

    it('should return all registered keys via getRegisteredAdvancedReactions', () => {
      registerAdvancedReaction('alpha', (ctx) => ({ state: ctx.state, events: [], success: true }));
      registerAdvancedReaction('beta', (ctx) => ({ state: ctx.state, events: [], success: true }));
      registerAdvancedReaction('gamma', (ctx) => ({ state: ctx.state, events: [], success: true }));

      const keys = getRegisteredAdvancedReactions();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
      expect(keys.length).toBe(3);
    });
  });

  // ─── registerAllAdvancedReactions ──────────────────────────────────────────

  describe('registerAllAdvancedReactions', () => {
    it('should register all 20 expected reactions', () => {
      registerAllAdvancedReactions();
      const registered = getRegisteredAdvancedReactions();
      expect(registered.length).toBe(20);
    });

    it('should include known reaction IDs after registration', () => {
      registerAllAdvancedReactions();
      const registered = getRegisteredAdvancedReactions();

      const expectedIds = [
        'ws-chasing-wind',
        'if-bastion-of-fire',
        'da-vengeance',
        'ec-perfect-counter',
        'iw-bitter-fury',
        'sw-bestial-savagery',
        'nl-better-part',
        'ba-wrath-of-angels',
        'ih-spite-of-gorgon',
        'we-brutal-tide',
        'um-retribution-strike',
        'dg-barbaran-endurance',
        'ts-fortress-of-mind',
        'soh-warrior-pride',
        'wb-glorious-martyrdom',
        'sal-selfless-burden',
        'rg-shadow-veil',
        'al-smoke-and-mirrors',
        'ec-h-twisted-desire',
        'we-h-furious-charge',
      ];

      for (const id of expectedIds) {
        expect(registered).toContain(id);
      }
    });

    it('should be idempotent when called twice', () => {
      registerAllAdvancedReactions();
      const firstRegistration = getRegisteredAdvancedReactions();
      expect(firstRegistration.length).toBe(20);

      registerAllAdvancedReactions();
      const secondRegistration = getRegisteredAdvancedReactions();
      expect(secondRegistration.length).toBe(20);
    });
  });

  // ─── isAdvancedReactionAvailable ───────────────────────────────────────────

  describe('isAdvancedReactionAvailable', () => {
    it('should return false for an unknown reaction ID', () => {
      const state = makeTestState();
      expect(isAdvancedReactionAvailable(state, 'nonexistent-id', 1)).toBe(false);
    });

    it('should return false if army faction does not match the reaction legion', () => {
      // Reactive player (index 1) is White Scars, but we check da-vengeance (Dark Angels)
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(false);
    });

    it('should return false if once-per-battle reaction has already been used', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'da-vengeance', playerIndex: 1, battleTurn: 1 },
        ],
      });
      // da-vengeance is oncePerBattle: true, and has been used by player 1
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(false);
    });

    it('should return false if the army has no reaction allotment remaining', () => {
      const army1 = makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]);
      army1.reactionAllotmentRemaining = 0;
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          army1,
        ],
      });
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(false);
    });

    it('should return false if allegiance does not match requiredAllegiance (Hereticus requiring Traitor)', () => {
      // ec-h-twisted-desire requires Traitor allegiance
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      // Player 1 is Emperor's Children but Loyalist, reaction requires Traitor
      expect(isAdvancedReactionAvailable(state, 'ec-h-twisted-desire', 1)).toBe(false);
    });

    it('should return true when all conditions are met', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      // da-vengeance: legion=DarkAngels, oncePerBattle=true (not used yet), cost=1, no allegiance req
      // Player 1 is Dark Angels with allotment remaining
      expect(isAdvancedReactionAvailable(state, 'da-vengeance', 1)).toBe(true);
    });
  });

  // ─── hasAdvancedReactionBeenUsed ───────────────────────────────────────────

  describe('hasAdvancedReactionBeenUsed', () => {
    it('should return true if the reaction has been used by the specified player', () => {
      const state = makeTestState({
        advancedReactionsUsed: [
          { reactionId: 'da-vengeance', playerIndex: 1, battleTurn: 1 },
        ],
      });
      expect(hasAdvancedReactionBeenUsed(state, 'da-vengeance', 1)).toBe(true);
    });

    it('should return false if the reaction has not been used', () => {
      const state = makeTestState({
        advancedReactionsUsed: [],
      });
      expect(hasAdvancedReactionBeenUsed(state, 'da-vengeance', 1)).toBe(false);
    });
  });

  // ─── checkMovementAdvancedReactionTriggers ─────────────────────────────────

  describe('checkMovementAdvancedReactionTriggers', () => {
    beforeEach(() => {
      registerAllAdvancedReactions();
    });

    it('should return null if no eligible reactive units exist', () => {
      // Reactive player (index 1) is White Scars but unit has already reacted
      const reactedUnit = makeUnit('reactive-u1', { hasReactedThisTurn: true });
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [reactedUnit]),
        ],
      });
      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(result).toBeNull();
    });

    it('should return trigger for White Scars when enemy moves within 12 inches', () => {
      // Active unit at (15, 10), reactive White Scars unit at (10, 10) = 5" apart (within 12")
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('ws-chasing-wind');
      expect(result!.eligibleUnitIds).toContain('reactive-u1');
    });

    it('should return trigger for Imperial Fists when enemy moves within 10 inches', () => {
      // Active unit at (18, 10), reactive Imperial Fists unit at (10, 10) = 8" apart (within 10")
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 18, 10)] }),
          ]),
          makeArmy(1, LegionFaction.ImperialFists, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('if-bastion-of-fire');
      expect(result!.eligibleUnitIds).toContain('reactive-u1');
    });

    it('should return null if reactive army is wrong faction for movement triggers', () => {
      // Reactive player is Iron Warriors (no movement-triggered reactions)
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('reactive-u1', { models: [makeModel('reactive-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(result).toBeNull();
    });

    it('should return null if unit has already reacted this turn', () => {
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('active-u1', { models: [makeModel('active-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [
            makeUnit('reactive-u1', {
              models: [makeModel('reactive-m1', 10, 10)],
              hasReactedThisTurn: true,
            }),
          ]),
        ],
      });
      const result = checkMovementAdvancedReactionTriggers(state, 'active-u1');
      expect(result).toBeNull();
    });
  });

  // ─── checkShootingAdvancedReactionTriggers ─────────────────────────────────

  describe('checkShootingAdvancedReactionTriggers', () => {
    beforeEach(() => {
      registerAllAdvancedReactions();
    });

    it('should return null for a non-matching step', () => {
      // Iron Warriors (iw-bitter-fury) triggers at step 3. Passing step 5.
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 5);
      expect(result).toBeNull();
    });

    it('should return trigger for matching step and legion', () => {
      // Iron Warriors (iw-bitter-fury) triggers at step 3
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);
      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('iw-bitter-fury');
      expect(result!.eligibleUnitIds).toContain('target-u1');
    });

    it('should use a different unit than target for Ultramarines Retribution Strike', () => {
      // um-retribution-strike triggers at step 3, uses a DIFFERENT unit than the target
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.Ultramarines, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
            makeUnit('other-u1', { models: [makeModel('other-m1', 12, 10)] }),
          ]),
        ],
      });
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);
      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('um-retribution-strike');
      // The eligible unit should be the OTHER unit, not the target
      expect(result!.eligibleUnitIds).not.toContain('target-u1');
      expect(result!.eligibleUnitIds).toContain('other-u1');
    });

    it('should return null if target unit cannot react', () => {
      // Blood Angels (ba-wrath-of-angels) triggers at step 4, target must be able to react
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.BloodAngels, Allegiance.Loyalist, [
            makeUnit('target-u1', {
              models: [makeModel('target-m1', 10, 10)],
              hasReactedThisTurn: true, // Cannot react
            }),
          ]),
        ],
      });
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 4);
      expect(result).toBeNull();
    });

    it('should return null if reaction has already been used (once-per-battle)', () => {
      const state = makeTestState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('attacker-u1', { models: [makeModel('attacker-m1', 30, 10)] }),
          ]),
          makeArmy(1, LegionFaction.IronWarriors, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'iw-bitter-fury', playerIndex: 1, battleTurn: 1 },
        ],
      });
      const result = checkShootingAdvancedReactionTriggers(state, 'attacker-u1', 'target-u1', 3);
      expect(result).toBeNull();
    });
  });

  // ─── checkAssaultAdvancedReactionTriggers ──────────────────────────────────

  describe('checkAssaultAdvancedReactionTriggers', () => {
    beforeEach(() => {
      registerAllAdvancedReactions();
    });

    it('should return trigger for matching assault trigger type', () => {
      // ec-perfect-counter triggers at duringChargeStep step 3
      const state = makeTestState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('charger-u1', { models: [makeModel('charger-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkAssaultAdvancedReactionTriggers(
        state,
        'duringChargeStep',
        'charger-u1',
        'target-u1',
        3,
      );
      expect(result).not.toBeNull();
      expect(result!.reactionId).toBe('ec-perfect-counter');
      expect(result!.eligibleUnitIds).toContain('target-u1');
    });

    it('should return null if step does not match', () => {
      // ec-perfect-counter triggers at step 3, pass step 4
      const state = makeTestState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('charger-u1', { models: [makeModel('charger-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
      });
      const result = checkAssaultAdvancedReactionTriggers(
        state,
        'duringChargeStep',
        'charger-u1',
        'target-u1',
        4, // Wrong step for ec-perfect-counter (needs 3)
      );
      expect(result).toBeNull();
    });

    it('should return null if reaction is unavailable', () => {
      // ec-perfect-counter is once-per-battle, already used
      const state = makeTestState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [
            makeUnit('charger-u1', { models: [makeModel('charger-m1', 15, 10)] }),
          ]),
          makeArmy(1, LegionFaction.EmperorsChildren, Allegiance.Loyalist, [
            makeUnit('target-u1', { models: [makeModel('target-m1', 10, 10)] }),
          ]),
        ],
        advancedReactionsUsed: [
          { reactionId: 'ec-perfect-counter', playerIndex: 1, battleTurn: 1 },
        ],
      });
      const result = checkAssaultAdvancedReactionTriggers(
        state,
        'duringChargeStep',
        'charger-u1',
        'target-u1',
        3,
      );
      expect(result).toBeNull();
    });
  });

  // ─── resolveAdvancedReaction ────────────────────────────────────────────────

  describe('resolveAdvancedReaction', () => {
    it('should return error for unknown reaction ID', () => {
      const state = makeTestState();
      const dice = new FixedDiceProvider([]);
      const result = resolveAdvancedReaction(state, 'nonexistent-id', 'reactive-u1', 'active-u1', dice);
      expect(result.accepted).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('UNKNOWN_REACTION');
    });

    it('should return error for unregistered handler', () => {
      // ws-chasing-wind is a known reaction in @hh/data but registry is cleared
      const state = makeTestState();
      const dice = new FixedDiceProvider([]);
      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);
      expect(result.accepted).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('HANDLER_NOT_FOUND');
    });

    it('should record usage, deduct allotment, mark reacted, and clear awaiting on successful resolution', () => {
      // Register a simple handler that returns success
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [],
        success: true,
      });
      registerAdvancedReaction('ws-chasing-wind', handler);

      const state = makeTestState({
        awaitingReaction: true,
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      expect(result.errors.length).toBe(0);

      // Usage was recorded
      expect(result.state.advancedReactionsUsed.length).toBe(1);
      expect(result.state.advancedReactionsUsed[0].reactionId).toBe('ws-chasing-wind');
      expect(result.state.advancedReactionsUsed[0].playerIndex).toBe(1);

      // Allotment was deducted (ws-chasing-wind cost is 1, original was 2)
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(1);

      // Unit marked as reacted
      const reactingUnit = result.state.armies[1].units.find(u => u.id === 'reactive-u1');
      expect(reactingUnit!.hasReactedThisTurn).toBe(true);

      // Awaiting reaction cleared
      expect(result.state.awaitingReaction).toBe(false);
    });

    it('should return accepted:true but not record usage on failed resolution', () => {
      // Register a handler that returns success: false
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [{ type: 'advancedReactionDeclared', reactionId: 'ws-chasing-wind', reactionName: 'Chasing the Wind', reactingUnitId: ctx.reactingUnitId, triggerSourceUnitId: ctx.triggerSourceUnitId, playerIndex: ctx.playerIndex } as any],
        success: false,
      });
      registerAdvancedReaction('ws-chasing-wind', handler);

      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      expect(result.accepted).toBe(true);
      expect(result.errors.length).toBe(0);

      // Usage was NOT recorded (failed resolution does not record usage)
      expect(result.state.advancedReactionsUsed.length).toBe(0);

      // Allotment was NOT deducted
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(2);

      // Unit NOT marked as reacted
      const reactingUnit = result.state.armies[1].units.find(u => u.id === 'reactive-u1');
      expect(reactingUnit!.hasReactedThisTurn).toBe(false);
    });

    it('should emit advancedReactionDeclared and advancedReactionResolved events', () => {
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [],
        success: true,
      });
      registerAdvancedReaction('ws-chasing-wind', handler);

      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('active-u1')]),
          makeArmy(1, LegionFaction.WhiteScars, Allegiance.Loyalist, [makeUnit('reactive-u1')]),
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'ws-chasing-wind', 'reactive-u1', 'active-u1', dice);

      const declaredEvents = result.events.filter(e => e.type === 'advancedReactionDeclared');
      const resolvedEvents = result.events.filter(e => e.type === 'advancedReactionResolved');

      expect(declaredEvents.length).toBe(1);
      expect(resolvedEvents.length).toBe(1);

      const declared = declaredEvents[0] as any;
      expect(declared.reactionId).toBe('ws-chasing-wind');
      expect(declared.reactionName).toBe('Chasing the Wind');
      expect(declared.reactingUnitId).toBe('reactive-u1');
      expect(declared.triggerSourceUnitId).toBe('active-u1');
      expect(declared.playerIndex).toBe(1);

      const resolved = resolvedEvents[0] as any;
      expect(resolved.reactionId).toBe('ws-chasing-wind');
      expect(resolved.success).toBe(true);
    });

    it('should deduct the correct cost from reactionAllotmentRemaining', () => {
      const handler: AdvancedReactionHandler = (ctx, dice) => ({
        state: ctx.state,
        events: [],
        success: true,
      });
      registerAdvancedReaction('da-vengeance', handler);

      // Set up player 1 as Dark Angels with 3 allotment
      const army1 = makeArmy(1, LegionFaction.DarkAngels, Allegiance.Loyalist, [makeUnit('reactive-u1')]);
      army1.reactionAllotmentRemaining = 3;
      const state = makeTestState({
        armies: [
          makeArmy(0, LegionFaction.IronWarriors, Allegiance.Loyalist, [makeUnit('active-u1')]),
          army1,
        ],
      });
      const dice = new FixedDiceProvider([]);

      const result = resolveAdvancedReaction(state, 'da-vengeance', 'reactive-u1', 'active-u1', dice);

      // da-vengeance has cost: 1, so remaining should be 3 - 1 = 2
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(2);
    });
  });
});
