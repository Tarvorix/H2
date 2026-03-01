/**
 * Assault Tactica Integration Tests
 *
 * Validates that assault-related Legion Tacticas correctly modify the assault
 * pipeline when invoked through the full registry (registerAllLegionTacticas).
 * Unlike the unit tests in assault-tacticas.test.ts, these tests:
 *  - Register ALL tacticas (not just assault), ensuring no cross-domain interference
 *  - Test that multiple legions' tacticas don't interfere with each other
 *  - Test charge bonuses don't apply when the unit hasn't charged
 *  - Test edge cases (no enemy units, enemies without qualifying statuses, etc.)
 *
 * Reference: HH_Legiones_Astartes.md — assault-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
  registerAllLegionTacticas,
} from '../legion-tactica-registry';
import type { AssaultTacticaContext } from '../legion-tactica-registry';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
  TacticalStatus,
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
    gameId: 'integration-test',
    battlefield: { width: 48, height: 48 },
    terrain: [],
    armies: [makeMinimalArmy(0), makeMinimalArmy(1)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Fight,
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

function makeAssaultContext(overrides: Partial<AssaultTacticaContext>): AssaultTacticaContext {
  return {
    state: makeMinimalGameState(),
    unit: makeMinimalUnit('u1'),
    effects: [],
    hook: PipelineHook.OnCharge,
    isChargeTurn: false,
    isChallenge: false,
    enemyUnits: [],
    entireUnitHasTactica: true,
    ...overrides,
  };
}

// ─── Pre-loaded effect arrays (from @hh/data) ──────────────────────────────

const ecEffects = getLegionTacticaEffects('emperors-children-tactica');
const baEffects = getLegionTacticaEffects('blood-angels-tactica');
const weEffects = getLegionTacticaEffects('world-eaters-tactica');
const nlEffects = getLegionTacticaEffects('night-lords-tactica');
const wbEffects = getLegionTacticaEffects('word-bearers-tactica');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Assault Tactica Integration Tests', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerAllLegionTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. EMPEROR'S CHILDREN (III) — Martial Pride — OnCharge: +1 Initiative
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Emperor's Children — Martial Pride (full registry)", () => {
    it('should grant +1 combatInitiativeModifier on charge turn through full registry', () => {
      const ctx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBe(1);
    });

    it('should return no charge bonus when unit has not charged', () => {
      const ctx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should not produce any melee strength or attacks modifiers on charge', () => {
      const ctx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.meleeWSModifier).toBeUndefined();
      expect(result.crpBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. BLOOD ANGELS (IX) — Encarmine Fury — OnCharge: +1 Strength
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Blood Angels — Encarmine Fury (full registry)', () => {
    it('should grant +1 meleeStrengthModifier on charge turn through full registry', () => {
      const ctx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBe(1);
    });

    it('should return no charge bonus when unit has not charged', () => {
      const ctx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should not produce combat initiative or attacks modifiers on charge', () => {
      const ctx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.meleeWSModifier).toBeUndefined();
      expect(result.crpBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. WORLD EATERS (XII) — Berserker Assault — OnCharge: +1 Attacks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('World Eaters — Berserker Assault (full registry)', () => {
    it('should grant +1 meleeAttacksModifier on charge turn through full registry', () => {
      const ctx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBe(1);
    });

    it('should return no charge bonus when unit has not charged', () => {
      const ctx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should not produce combat initiative or strength modifiers on charge', () => {
      const ctx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeWSModifier).toBeUndefined();
      expect(result.crpBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. NIGHT LORDS (VIII) — A Talent for Murder — PreHit: +1 WS vs status
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Night Lords — A Talent for Murder (full registry)', () => {
    it('should grant +1 meleeWSModifier when enemy has Pinned status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy has Suppressed status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Suppressed];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy has Stunned status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Stunned];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy has Routed status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Routed];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should not grant bonus when enemy has no status at all', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not grant bonus when no enemy units are present in combat', () => {
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not grant bonus when enemy only has Stupefied (non-qualifying) status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Stupefied];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not grant bonus when enemy only has LostToTheNails (non-qualifying) status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.LostToTheNails];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should grant bonus when second enemy unit has qualifying status but first does not', () => {
      const enemyUnit1 = makeMinimalUnit('enemy-1');
      enemyUnit1.statuses = [];
      const enemyUnit2 = makeMinimalUnit('enemy-2');
      enemyUnit2.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit1, enemyUnit2],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. WORD BEARERS (XVII) — True Believers — OnDamage: +1 CRP
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Word Bearers — True Believers (full registry)', () => {
    it('should grant +1 crpBonus through full registry', () => {
      const ctx = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should grant +1 crpBonus regardless of charge status', () => {
      const ctxNoCharge = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
        isChargeTurn: false,
      });
      const resultNoCharge = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctxNoCharge);
      expect(resultNoCharge.crpBonus).toBe(1);

      const ctxCharge = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
        isChargeTurn: true,
      });
      const resultCharge = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctxCharge);
      expect(resultCharge.crpBonus).toBe(1);
    });

    it('should not produce any melee stat modifiers', () => {
      const ctx = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.meleeWSModifier).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Cross-Legion Isolation — full registry
  //    When the full registry is loaded, a legion's assault handler must ONLY
  //    fire for that specific legion, never for another.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation (full registry)', () => {
    it('should not apply EC charge bonus when queried for Blood Angels OnCharge', () => {
      const ctx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      // BA handler looks for ChargeStrengthBonus, EC effects have ChargeInitiativeBonus
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should not apply WE charge bonus when queried for EC OnCharge', () => {
      const ctx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      // EC handler looks for ChargeInitiativeBonus, WE effects have ChargeAttacksBonus
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should not apply BA charge bonus when queried for World Eaters OnCharge', () => {
      const ctx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      // WE handler looks for ChargeAttacksBonus, BA effects have ChargeStrengthBonus
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should return empty result for a legion with no assault handler at the queried hook', () => {
      const ctx = makeAssaultContext({
        effects: [],
        hook: PipelineHook.OnDamage,
      });
      // Blood Angels have no OnDamage handler
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnDamage, ctx);
      expect(result).toEqual({});
    });

    it('should not apply Night Lords PreHit bonus when queried for Word Bearers PreHit', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      // Word Bearers have no PreHit handler at all
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not apply Word Bearers OnDamage bonus when queried for Night Lords OnDamage', () => {
      const ctx = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
      });
      // Night Lords have no OnDamage handler
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Charge Condition Enforcement
  //    All three OnCharge tacticas (EC, BA, WE) must be strictly gated by
  //    isChargeTurn. We test them side by side to be thorough.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Charge condition enforcement across all OnCharge legions', () => {
    it('should produce no assault modifiers for EC when isChargeTurn is false', () => {
      const ctx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should produce no assault modifiers for BA when isChargeTurn is false', () => {
      const ctx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should produce no assault modifiers for WE when isChargeTurn is false', () => {
      const ctx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Multi-legion Same-Scenario
  //    Simulate the same battlefield scenario and ensure each legion ONLY
  //    gets its own bonus and nothing from another legion's handler.
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Multi-legion same-scenario: identical context, different legions', () => {
    it('should yield distinct results for EC, BA, and WE given the same charge context', () => {
      // Provide a combined effects array that contains all three charge effects
      const combinedEffects: LegionTacticaEffect[] = [...ecEffects, ...baEffects, ...weEffects];

      const baseCtx: Partial<AssaultTacticaContext> = {
        effects: combinedEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      };

      const ecResult = applyLegionTactica(
        LegionFaction.EmperorsChildren,
        PipelineHook.OnCharge,
        makeAssaultContext(baseCtx),
      );
      const baResult = applyLegionTactica(
        LegionFaction.BloodAngels,
        PipelineHook.OnCharge,
        makeAssaultContext(baseCtx),
      );
      const weResult = applyLegionTactica(
        LegionFaction.WorldEaters,
        PipelineHook.OnCharge,
        makeAssaultContext(baseCtx),
      );

      // EC should ONLY have combatInitiativeModifier
      expect(ecResult.combatInitiativeModifier).toBe(1);
      expect(ecResult.meleeStrengthModifier).toBeUndefined();
      expect(ecResult.meleeAttacksModifier).toBeUndefined();

      // BA should ONLY have meleeStrengthModifier
      expect(baResult.meleeStrengthModifier).toBe(1);
      expect(baResult.combatInitiativeModifier).toBeUndefined();
      expect(baResult.meleeAttacksModifier).toBeUndefined();

      // WE should ONLY have meleeAttacksModifier
      expect(weResult.meleeAttacksModifier).toBe(1);
      expect(weResult.combatInitiativeModifier).toBeUndefined();
      expect(weResult.meleeStrengthModifier).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('should return empty result for a non-assault legion queried at OnCharge', () => {
      // Dark Angels have no OnCharge handler (they have Passive only)
      const ctx = makeAssaultContext({
        effects: getLegionTacticaEffects('dark-angels-tactica'),
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.DarkAngels, PipelineHook.OnCharge, ctx);
      expect(result).toEqual({});
    });

    it('should return empty result for Ultramarines queried at OnCharge', () => {
      // Ultramarines have Passive only, no OnCharge handler
      const ctx = makeAssaultContext({
        effects: getLegionTacticaEffects('ultramarines-tactica'),
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.Ultramarines, PipelineHook.OnCharge, ctx);
      expect(result).toEqual({});
    });

    it('should handle empty effects array gracefully for all assault legions', () => {
      const emptyEffects: LegionTacticaEffect[] = [];

      // EC with no effects
      const ecCtx = makeAssaultContext({ effects: emptyEffects, hook: PipelineHook.OnCharge, isChargeTurn: true });
      const ecResult = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ecCtx);
      expect(ecResult.combatInitiativeModifier).toBeUndefined();

      // BA with no effects
      const baCtx = makeAssaultContext({ effects: emptyEffects, hook: PipelineHook.OnCharge, isChargeTurn: true });
      const baResult = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, baCtx);
      expect(baResult.meleeStrengthModifier).toBeUndefined();

      // WE with no effects
      const weCtx = makeAssaultContext({ effects: emptyEffects, hook: PipelineHook.OnCharge, isChargeTurn: true });
      const weResult = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, weCtx);
      expect(weResult.meleeAttacksModifier).toBeUndefined();

      // NL with no effects
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const nlCtx = makeAssaultContext({ effects: emptyEffects, hook: PipelineHook.PreHit, enemyUnits: [enemyUnit] });
      const nlResult = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, nlCtx);
      expect(nlResult.meleeWSModifier).toBeUndefined();

      // WB with no effects
      const wbCtx = makeAssaultContext({ effects: emptyEffects, hook: PipelineHook.OnDamage });
      const wbResult = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, wbCtx);
      expect(wbResult.crpBonus).toBeUndefined();
    });

    it('should work correctly when isChallenge is true (charge bonuses still apply)', () => {
      const ecCtx = makeAssaultContext({
        effects: ecEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: true,
      });
      const ecResult = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ecCtx);
      expect(ecResult.combatInitiativeModifier).toBe(1);

      const baCtx = makeAssaultContext({
        effects: baEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: true,
      });
      const baResult = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, baCtx);
      expect(baResult.meleeStrengthModifier).toBe(1);

      const weCtx = makeAssaultContext({
        effects: weEffects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: true,
      });
      const weResult = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, weCtx);
      expect(weResult.meleeAttacksModifier).toBe(1);
    });

    it('should not grant NL bonus when multiple enemies all have only non-qualifying statuses', () => {
      const enemy1 = makeMinimalUnit('enemy-1');
      enemy1.statuses = [TacticalStatus.Stupefied];
      const enemy2 = makeMinimalUnit('enemy-2');
      enemy2.statuses = [TacticalStatus.LostToTheNails];
      const enemy3 = makeMinimalUnit('enemy-3');
      enemy3.statuses = [];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemy1, enemy2, enemy3],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should grant NL bonus when one enemy among many has a qualifying status mixed with non-qualifying', () => {
      const enemy1 = makeMinimalUnit('enemy-1');
      enemy1.statuses = [TacticalStatus.Stupefied];
      const enemy2 = makeMinimalUnit('enemy-2');
      enemy2.statuses = [TacticalStatus.Pinned, TacticalStatus.LostToTheNails];
      const ctx = makeAssaultContext({
        effects: nlEffects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemy1, enemy2],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant WB CRP bonus even during a challenge with enemy units present', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects: wbEffects,
        hook: PipelineHook.OnDamage,
        isChallenge: true,
        isChargeTurn: true,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should return no assault modifiers for shooting-only legions at their own hooks', () => {
      // Imperial Fists are shooting-only (PreHit) -- query their hook but check for assault fields
      const ctx = makeAssaultContext({
        effects: getLegionTacticaEffects('imperial-fists-tactica'),
        hook: PipelineHook.PreHit,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
      expect(result.meleeStrengthModifier).toBeUndefined();
      expect(result.meleeAttacksModifier).toBeUndefined();
      expect(result.meleeWSModifier).toBeUndefined();
      expect(result.crpBonus).toBeUndefined();
    });
  });
});
