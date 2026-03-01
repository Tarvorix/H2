/**
 * Hereticus Legion Tactica Handler Tests
 *
 * Tests each hereticus handler individually via registerHereticusTacticas()
 * and applyLegionTactica() with appropriate LegionTacticaContext.
 *
 * Reference: HH_Legiones_Astartes.md — EC Legiones Hereticus, WE Legiones Hereticus
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
  getRegisteredLegionTacticas,
  hasLegionTactica,
} from '../legion-tactica-registry';
import type { LegionTacticaContext } from '../legion-tactica-registry';
import { registerHereticusTacticas } from './hereticus-tacticas';
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

function makeHereticusContext(overrides: Partial<LegionTacticaContext>): LegionTacticaContext {
  return {
    state: makeMinimalGameState(),
    unit: makeMinimalUnit('u1'),
    effects: [],
    hook: PipelineHook.Passive,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Hereticus Legion Tacticas', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerHereticusTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPEROR'S CHILDREN HERETICUS — Stupefied
  // After being shot, controlling player may choose Stupefied tactical status.
  // All other statuses removed. Gains FNP (6+), +1S.
  // Cannot gain other statuses. Cannot declare Reactions. Must Snap Shot.
  // Removed by Cool Check in End Phase.
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Emperor's Children Hereticus — Stupefied", () => {
    it('should return empty when no matching effect is present (no StupefiedStatusOption effect)', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBeUndefined();
    });

    it('should return empty when effects array is empty', () => {
      const ctx = makeHereticusContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBeUndefined();
    });

    it('should return stupefiedStatusOption true when StupefiedStatusOption effect is present', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBe(true);
    });

    it('should return true regardless of effect value (boolean, not numeric)', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption, 99)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBe(true);
    });

    it('should not set any other result fields', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBe(true);
      expect(result.lostToTheNailsStatusOption).toBeUndefined();
      expect(result.hitModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.movementBonus).toBeUndefined();
      expect(result.minimumLeadership).toBeUndefined();
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should work with additional unrelated effects in the array', () => {
      const ctx = makeHereticusContext({
        effects: [
          makeEffect(LegionTacticaEffectType.MinimumLeadership, 6),
          makeEffect(LegionTacticaEffectType.StupefiedStatusOption),
          makeEffect(LegionTacticaEffectType.WillpowerBonus, 1),
        ],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD EATERS HERETICUS — Lost to the Nails
  // After failed LD check, controlling player may choose Lost to the Nails status.
  // All other statuses removed. +1" setup move, +1A.
  // LD/CL/WP set to 10 (if lower).
  // Must Charge closest enemy within 12" at start of Charge Sub-Phase.
  // Recovers if no enemies within 12".
  // ═══════════════════════════════════════════════════════════════════════════

  describe('World Eaters Hereticus — Lost to the Nails', () => {
    it('should return empty when no matching effect is present (no LostToTheNailsStatusOption effect)', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBeUndefined();
    });

    it('should return empty when effects array is empty', () => {
      const ctx = makeHereticusContext({
        effects: [],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBeUndefined();
    });

    it('should return lostToTheNailsStatusOption true when LostToTheNailsStatusOption effect is present', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBe(true);
    });

    it('should return true regardless of effect value (boolean, not numeric)', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption, 42)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBe(true);
    });

    it('should not set any other result fields', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBe(true);
      expect(result.stupefiedStatusOption).toBeUndefined();
      expect(result.hitModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.movementBonus).toBeUndefined();
      expect(result.minimumLeadership).toBeUndefined();
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should work with additional unrelated effects in the array', () => {
      const ctx = makeHereticusContext({
        effects: [
          makeEffect(LegionTacticaEffectType.MaxFearReduction, 1),
          makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption),
          makeEffect(LegionTacticaEffectType.GrantPsykerTrait),
        ],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration', () => {
    it('should register Emperor\'s Children at the Passive hook', () => {
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive)).toBe(true);
    });

    it('should register World Eaters at the Passive hook', () => {
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive)).toBe(true);
    });

    it('should include both hereticus tactica registrations in the registry', () => {
      const registered = getRegisteredLegionTacticas();
      const hereticusEntries = registered.filter(
        r =>
          (r.legion === LegionFaction.EmperorsChildren && r.hook === PipelineHook.Passive) ||
          (r.legion === LegionFaction.WorldEaters && r.hook === PipelineHook.Passive),
      );
      expect(hereticusEntries).toHaveLength(2);
    });

    it('should not register Emperor\'s Children at non-Passive hooks', () => {
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge)).toBe(false);
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnMorale)).toBe(false);
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.PreHit)).toBe(false);
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnDamage)).toBe(false);
      expect(hasLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Movement)).toBe(false);
    });

    it('should not register World Eaters at non-Passive hooks', () => {
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge)).toBe(false);
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnMorale)).toBe(false);
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.PreHit)).toBe(false);
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnDamage)).toBe(false);
      expect(hasLegionTactica(LegionFaction.WorldEaters, PipelineHook.Movement)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration via applyLegionTactica
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Integration via applyLegionTactica', () => {
    it('should return stupefiedStatusOption when applying EC Hereticus at Passive hook', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBe(true);
      expect(result.lostToTheNailsStatusOption).toBeUndefined();
    });

    it('should return lostToTheNailsStatusOption when applying WE Hereticus at Passive hook', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption)],
        hook: PipelineHook.Passive,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBe(true);
      expect(result.stupefiedStatusOption).toBeUndefined();
    });

    it('should not have EC Hereticus interfere with WE results (separate legions)', () => {
      // EC with both effects — only StupefiedStatusOption should apply
      const ctxEC = makeHereticusContext({
        effects: [
          makeEffect(LegionTacticaEffectType.StupefiedStatusOption),
          makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption),
        ],
        hook: PipelineHook.Passive,
      });
      const resultEC = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctxEC);
      expect(resultEC.stupefiedStatusOption).toBe(true);
      // EC handler does not look for LostToTheNailsStatusOption
      expect(resultEC.lostToTheNailsStatusOption).toBeUndefined();

      // WE with both effects — only LostToTheNailsStatusOption should apply
      const ctxWE = makeHereticusContext({
        effects: [
          makeEffect(LegionTacticaEffectType.StupefiedStatusOption),
          makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption),
        ],
        hook: PipelineHook.Passive,
      });
      const resultWE = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctxWE);
      expect(resultWE.lostToTheNailsStatusOption).toBe(true);
      // WE handler does not look for StupefiedStatusOption
      expect(resultWE.stupefiedStatusOption).toBeUndefined();
    });

    it('should return empty for an unrelated legion at Passive hook', () => {
      const ctx = makeHereticusContext({
        effects: [
          makeEffect(LegionTacticaEffectType.StupefiedStatusOption),
          makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption),
        ],
        hook: PipelineHook.Passive,
      });
      // DarkAngels has no hereticus handler registered (only hereticus tacticas are registered in beforeEach)
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.Passive, ctx);
      expect(result).toEqual({});
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-legion isolation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation', () => {
    it('should not apply EC handler for World Eaters', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.StupefiedStatusOption)],
        hook: PipelineHook.Passive,
      });
      // WE handler looks for LostToTheNailsStatusOption, not StupefiedStatusOption
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctx);
      expect(result.stupefiedStatusOption).toBeUndefined();
    });

    it('should not apply WE handler for Emperor\'s Children', () => {
      const ctx = makeHereticusContext({
        effects: [makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption)],
        hook: PipelineHook.Passive,
      });
      // EC handler looks for StupefiedStatusOption, not LostToTheNailsStatusOption
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctx);
      expect(result.lostToTheNailsStatusOption).toBeUndefined();
    });

    it('should have no interference between EC and WE when both effects are present', () => {
      const effects = [
        makeEffect(LegionTacticaEffectType.StupefiedStatusOption),
        makeEffect(LegionTacticaEffectType.LostToTheNailsStatusOption),
      ];

      // EC only picks up Stupefied
      const ctxEC = makeHereticusContext({ effects, hook: PipelineHook.Passive });
      const resultEC = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.Passive, ctxEC);
      expect(resultEC.stupefiedStatusOption).toBe(true);
      expect(resultEC.lostToTheNailsStatusOption).toBeUndefined();

      // WE only picks up Lost to the Nails
      const ctxWE = makeHereticusContext({ effects, hook: PipelineHook.Passive });
      const resultWE = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.Passive, ctxWE);
      expect(resultWE.lostToTheNailsStatusOption).toBe(true);
      expect(resultWE.stupefiedStatusOption).toBeUndefined();
    });
  });
});
