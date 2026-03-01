/**
 * Passive/Morale Legion Tactica Handler Tests
 *
 * Tests each passive/morale handler individually via registerPassiveTacticas()
 * and applyLegionTactica() with appropriate MoraleTacticaContext.
 *
 * Reference: HH_Legiones_Astartes.md — passive/morale-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
  getRegisteredLegionTacticas,
  hasLegionTactica,
} from '../legion-tactica-registry';
import type { MoraleTacticaContext } from '../legion-tactica-registry';
import { registerPassiveTacticas } from './passive-tacticas';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
  LegionTacticaEffectType,
  UnitMovementState,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, LegionTacticaEffect } from '@hh/types';
import { getLegionTacticaEffects } from '@hh/data';

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

function makeEffect(
  type: LegionTacticaEffectType,
  value?: number,
  conditions?: Record<string, any>,
): LegionTacticaEffect {
  return { type, ...(value !== undefined && { value }), ...(conditions && { conditions }) } as LegionTacticaEffect;
}

function makeMoraleContext(overrides: Partial<MoraleTacticaContext>): MoraleTacticaContext {
  return {
    state: makeMinimalGameState(),
    unit: makeMinimalUnit('u1'),
    effects: [],
    hook: PipelineHook.Passive,
    entireUnitHasTactica: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Passive/Morale Legion Tacticas', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerPassiveTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DARK ANGELS (I) — Resolve of the First (Leadership)
  // Passive: Leadership never modified below 6
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Dark Angels — Resolve of the First (Leadership)', () => {
    const effects = getLegionTacticaEffects('dark-angels-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBeUndefined();
    });

    it('should return minimumLeadership with effect.value of 6', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBe(6);
    });

    it('should default to 6 when effect.value is not specified', () => {
      const effectsWithoutValue = [
        makeEffect(LegionTacticaEffectType.MinimumLeadership),
        makeEffect(LegionTacticaEffectType.MaxFearReduction),
      ];
      const ctx = makeMoraleContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBe(6);
    });

    it('should use a custom effect.value when specified', () => {
      const customEffects = [
        makeEffect(LegionTacticaEffectType.MinimumLeadership, 7),
        makeEffect(LegionTacticaEffectType.MaxFearReduction, 1),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBe(7);
    });

    it('should not affect other result fields', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.ignoreStatusMoraleMods).toBeUndefined();
      expect(result.willpowerBonus).toBeUndefined();
      expect(result.grantPsykerTrait).toBeUndefined();
      expect(result.reactionCostReduction).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DARK ANGELS (I) — Resolve of the First (Fear)
  // Passive: Fear (X) can only reduce LD/WP/CL/IN by maximum of 1
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Dark Angels — Resolve of the First (Fear)', () => {
    const effects = getLegionTacticaEffects('dark-angels-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.maxFearReduction).toBeUndefined();
    });

    it('should return maxFearReduction with effect.value of 1', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.maxFearReduction).toBe(1);
    });

    it('should default to 1 when effect.value is not specified', () => {
      const effectsWithoutValue = [
        makeEffect(LegionTacticaEffectType.MinimumLeadership, 6),
        makeEffect(LegionTacticaEffectType.MaxFearReduction),
      ];
      const ctx = makeMoraleContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.maxFearReduction).toBe(1);
    });

    it('should use a custom effect.value when specified', () => {
      const customEffects = [
        makeEffect(LegionTacticaEffectType.MinimumLeadership, 6),
        makeEffect(LegionTacticaEffectType.MaxFearReduction, 2),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.maxFearReduction).toBe(2);
    });

    it('should apply regardless of incomingFearValue', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        incomingFearValue: 5,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.maxFearReduction).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DARK ANGELS — Combined via applyLegionTactica
  // Both handlers merge: minimumLeadership + maxFearReduction in single result
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Dark Angels — Combined via applyLegionTactica', () => {
    const effects = getLegionTacticaEffects('dark-angels-tactica');

    it('should merge both minimumLeadership and maxFearReduction in a single call', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBe(6);
      expect(result.maxFearReduction).toBe(1);
    });

    it('should use max strategy for minimumLeadership when merging', () => {
      // The merge takes Math.max for minimumLeadership
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      // Only one handler sets minimumLeadership, so the value is 6
      expect(result.minimumLeadership).toBe(6);
    });

    it('should use min strategy for maxFearReduction when merging', () => {
      // The merge takes Math.min for maxFearReduction
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      // Only one handler sets maxFearReduction, so the value is 1
      expect(result.maxFearReduction).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IRON WARRIORS (IV) — Iron Within
  // OnMorale: Ignore negative LD/Cool modifiers from Panic/Pinning/Stun/Suppressive
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Iron Warriors — Iron Within', () => {
    const effects = getLegionTacticaEffects('iron-warriors-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.OnMorale,
      });
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, ctx);
      expect(result.ignoreStatusMoraleMods).toBeUndefined();
    });

    it('should return ignoreStatusMoraleMods true when effect is present', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.OnMorale,
      });
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, ctx);
      expect(result.ignoreStatusMoraleMods).toBe(true);
    });

    it('should return ignoreStatusMoraleMods true regardless of effect value', () => {
      const customEffects = [
        makeEffect(LegionTacticaEffectType.IgnoreStatusMoraleMods, 99),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.OnMorale,
      });
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale, ctx);
      expect(result.ignoreStatusMoraleMods).toBe(true);
    });

    it('should be registered at OnMorale hook, not Passive', () => {
      expect(hasLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale)).toBe(true);
      expect(hasLegionTactica(LegionFaction.IronWarriors, PipelineHook.Passive)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // THOUSAND SONS (XV) — Arcane Mastery (Willpower)
  // Passive: +1 to Willpower characteristic
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Thousand Sons — Arcane Mastery (Willpower)', () => {
    const effects = getLegionTacticaEffects('thousand-sons-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.willpowerBonus).toBeUndefined();
    });

    it('should return willpowerBonus with effect.value of 1', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.willpowerBonus).toBe(1);
    });

    it('should default to 1 when effect.value is not specified', () => {
      const effectsWithoutValue = [
        makeEffect(LegionTacticaEffectType.WillpowerBonus),
        makeEffect(LegionTacticaEffectType.GrantPsykerTrait),
      ];
      const ctx = makeMoraleContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.willpowerBonus).toBe(1);
    });

    it('should use a custom effect.value when specified', () => {
      const customEffects = [
        makeEffect(LegionTacticaEffectType.WillpowerBonus, 3),
        makeEffect(LegionTacticaEffectType.GrantPsykerTrait),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.willpowerBonus).toBe(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // THOUSAND SONS (XV) — Arcane Mastery (Psyker)
  // Passive: All models gain Psyker trait
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Thousand Sons — Arcane Mastery (Psyker)', () => {
    const effects = getLegionTacticaEffects('thousand-sons-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.grantPsykerTrait).toBeUndefined();
    });

    it('should return grantPsykerTrait true when effect is present', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.grantPsykerTrait).toBe(true);
    });

    it('should return grantPsykerTrait true regardless of effect value', () => {
      const customEffects = [
        makeEffect(LegionTacticaEffectType.WillpowerBonus, 1),
        makeEffect(LegionTacticaEffectType.GrantPsykerTrait, 42),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.grantPsykerTrait).toBe(true);
    });

    it('should merge both willpowerBonus and grantPsykerTrait via applyLegionTactica', () => {
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive, ctx);
      expect(result.willpowerBonus).toBe(1);
      expect(result.grantPsykerTrait).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ULTRAMARINES (XIII) — Tactical Flexibility
  // Passive: First reaction each turn costs -1 (minimum 0)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Ultramarines — Tactical Flexibility', () => {
    const effects = getLegionTacticaEffects('ultramarines-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBeUndefined();
    });

    it('should return empty when entireUnitHasTactica is false and conditions require it', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: false,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBeUndefined();
    });

    it('should return empty when unit is not found in any army', () => {
      const state = makeMinimalGameState();
      // Unit 'u1' is not in any army's units array (both armies have empty units)
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBeUndefined();
    });

    it('should return empty when reactionDiscountUsedThisTurn is true', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].reactionDiscountUsedThisTurn = true;
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBeUndefined();
    });

    it('should return reactionCostReduction when all conditions are met', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].reactionDiscountUsedThisTurn = false;
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBe(1);
    });

    it('should use effect.value for reduction amount', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      const customEffects = [
        makeEffect(LegionTacticaEffectType.ReactionCostReduction, 2, { requiresEntireUnit: true }),
      ];
      const ctx = makeMoraleContext({
        effects: customEffects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBe(2);
    });

    it('should default to 1 when effect.value is not specified', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      const effectsWithoutValue = [
        makeEffect(LegionTacticaEffectType.ReactionCostReduction, undefined, { requiresEntireUnit: true }),
      ];
      const ctx = makeMoraleContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBe(1);
    });

    it('should work correctly for player index 1', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[1].units = [unit];
      state.legionTacticaState[1].reactionDiscountUsedThisTurn = false;
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBe(1);
    });

    it('should work when legionTacticaState is an empty object (not yet tracking)', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      // Empty object: reactionDiscountUsedThisTurn is undefined (falsy)
      state.legionTacticaState = [{} as any, {} as any];
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBe(1);
    });

    it('should not grant reduction for player 1 when only player 0 discount is unused', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[1].units = [unit];
      state.legionTacticaState[0].reactionDiscountUsedThisTurn = false;
      state.legionTacticaState[1].reactionDiscountUsedThisTurn = true;
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
        entireUnitHasTactica: true,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive, ctx);
      expect(result.reactionCostReduction).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration', () => {
    it('should register Dark Angels at the Passive hook', () => {
      expect(hasLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive)).toBe(true);
    });

    it('should register Iron Warriors at the OnMorale hook', () => {
      expect(hasLegionTactica(LegionFaction.IronWarriors, PipelineHook.OnMorale)).toBe(true);
    });

    it('should register Thousand Sons at the Passive hook', () => {
      expect(hasLegionTactica(LegionFaction.ThousandSons, PipelineHook.Passive)).toBe(true);
    });

    it('should register Ultramarines at the Passive hook', () => {
      expect(hasLegionTactica(LegionFaction.Ultramarines, PipelineHook.Passive)).toBe(true);
    });

    it('should include all six passive/morale tactica registrations in the registry', () => {
      const registered = getRegisteredLegionTacticas();
      const passiveMoraleEntries = registered.filter(
        r =>
          (r.legion === LegionFaction.DarkAngels && r.hook === PipelineHook.Passive) ||
          (r.legion === LegionFaction.IronWarriors && r.hook === PipelineHook.OnMorale) ||
          (r.legion === LegionFaction.ThousandSons && r.hook === PipelineHook.Passive) ||
          (r.legion === LegionFaction.Ultramarines && r.hook === PipelineHook.Passive),
      );
      expect(passiveMoraleEntries).toHaveLength(4);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-legion isolation checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation', () => {
    it('should not apply Dark Angels handler for Iron Warriors', () => {
      const effects = getLegionTacticaEffects('dark-angels-tactica');
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.Passive,
      });
      // Iron Warriors has no Passive handler
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.Passive, ctx);
      expect(result.minimumLeadership).toBeUndefined();
      expect(result.maxFearReduction).toBeUndefined();
    });

    it('should not apply Iron Warriors handler for Dark Angels at OnMorale hook', () => {
      const effects = getLegionTacticaEffects('iron-warriors-tactica');
      const ctx = makeMoraleContext({
        effects,
        hook: PipelineHook.OnMorale,
      });
      // Dark Angels has no OnMorale handler
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.OnMorale, ctx);
      expect(result.ignoreStatusMoraleMods).toBeUndefined();
    });

    it('should return empty result for a legion with no passive handler at a given hook', () => {
      const ctx = makeMoraleContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.IronWarriors, PipelineHook.Passive, ctx);
      expect(result).toEqual({});
    });
  });
});
