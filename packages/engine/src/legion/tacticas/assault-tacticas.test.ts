/**
 * Assault Legion Tactica Handler Tests
 *
 * Tests each assault handler individually via registerAssaultTacticas()
 * and applyLegionTactica() with appropriate AssaultTacticaContext.
 *
 * Reference: HH_Legiones_Astartes.md — assault-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
} from '../legion-tactica-registry';
import type { AssaultTacticaContext } from '../legion-tactica-registry';
import { registerAssaultTacticas } from './assault-tacticas';
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
    gameId: 'test',
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Assault Legion Tacticas', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerAssaultTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPEROR'S CHILDREN (III) — Martial Pride
  // OnCharge: +1 Combat Initiative on charge turn
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Emperor's Children — Martial Pride", () => {
    const effects = getLegionTacticaEffects('emperors-children-tactica');

    it('should grant +1 combatInitiativeModifier on charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBe(1);
    });

    it('should not grant bonus when not charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should not affect meleeStrengthModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should not affect meleeAttacksModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should apply regardless of challenge status', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOOD ANGELS (IX) — Encarmine Fury
  // OnCharge: +1 Strength on charge turn
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Blood Angels — Encarmine Fury', () => {
    const effects = getLegionTacticaEffects('blood-angels-tactica');

    it('should grant +1 meleeStrengthModifier on charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBe(1);
    });

    it('should not grant bonus when not charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should not affect combatInitiativeModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should not affect meleeAttacksModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should apply regardless of enemy units present', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD EATERS (XII) — Berserker Assault
  // OnCharge: +1 Attacks on charge turn
  // ═══════════════════════════════════════════════════════════════════════════

  describe('World Eaters — Berserker Assault', () => {
    const effects = getLegionTacticaEffects('world-eaters-tactica');

    it('should grant +1 meleeAttacksModifier on charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBe(1);
    });

    it('should not grant bonus when not charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should not affect combatInitiativeModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should not affect meleeStrengthModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeStrengthModifier).toBeUndefined();
    });

    it('should apply regardless of challenge status', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: true,
      });
      const result = applyLegionTactica(LegionFaction.WorldEaters, PipelineHook.OnCharge, ctx);
      expect(result.meleeAttacksModifier).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NIGHT LORDS (VIII) — A Talent for Murder
  // PreHit: +1 WS when enemy has a tactical status
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Night Lords — A Talent for Murder', () => {
    const effects = getLegionTacticaEffects('night-lords-tactica');

    it('should grant +1 meleeWSModifier when enemy unit has Pinned status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy unit has Suppressed status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Suppressed];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy unit has Stunned status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Stunned];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant +1 meleeWSModifier when enemy unit has Routed status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Routed];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should not grant bonus when enemy has no status', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not grant bonus when no enemy units present', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should grant bonus when at least one of multiple enemy units has a status', () => {
      const enemyUnit1 = makeMinimalUnit('enemy-1');
      enemyUnit1.statuses = [];
      const enemyUnit2 = makeMinimalUnit('enemy-2');
      enemyUnit2.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit1, enemyUnit2],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should grant bonus when enemy has multiple statuses', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned, TacticalStatus.Suppressed];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBe(1);
    });

    it('should not grant bonus when enemy only has non-qualifying status (Stupefied)', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Stupefied];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not grant bonus when enemy only has non-qualifying status (LostToTheNails)', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.LostToTheNails];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not affect combatInitiativeModifier', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.NightLords, PipelineHook.PreHit, ctx);
      expect(result.combatInitiativeModifier).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WORD BEARERS (XVII) — True Believers
  // OnDamage: +1 CRP in combat resolution (always, no conditions)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Word Bearers — True Believers', () => {
    const effects = getLegionTacticaEffects('word-bearers-tactica');

    it('should grant +1 crpBonus always', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should grant +1 crpBonus regardless of charge turn', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should grant +1 crpBonus on charge turn too', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should grant +1 crpBonus in a challenge', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
        isChallenge: true,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should not affect meleeWSModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });

    it('should not affect meleeAttacksModifier', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should grant +1 crpBonus with enemy units present', () => {
      const enemyUnit = makeMinimalUnit('enemy-1');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });

    it('should grant +1 crpBonus with no enemy units', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnDamage,
        enemyUnits: [],
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.OnDamage, ctx);
      expect(result.crpBonus).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-legion isolation checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation', () => {
    it('should not apply Emperor\'s Children handler for Blood Angels', () => {
      const effects = getLegionTacticaEffects('emperors-children-tactica');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnCharge, ctx);
      // Blood Angels returns meleeStrengthModifier, not combatInitiativeModifier
      // But with EC effects, Blood Angels handler won't find ChargeStrengthBonus effect
      expect(result.combatInitiativeModifier).toBeUndefined();
    });

    it('should not apply World Eaters handler for Emperor\'s Children', () => {
      const effects = getLegionTacticaEffects('world-eaters-tactica');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.EmperorsChildren, PipelineHook.OnCharge, ctx);
      // EC handler looks for ChargeInitiativeBonus, not ChargeAttacksBonus
      expect(result.meleeAttacksModifier).toBeUndefined();
    });

    it('should return empty result for a legion with no assault handler at a given hook', () => {
      const ctx = makeAssaultContext({
        effects: [],
        hook: PipelineHook.OnDamage,
      });
      const result = applyLegionTactica(LegionFaction.BloodAngels, PipelineHook.OnDamage, ctx);
      expect(result).toEqual({});
    });

    it('should not apply Night Lords PreHit handler for Word Bearers', () => {
      const effects = getLegionTacticaEffects('night-lords-tactica');
      const enemyUnit = makeMinimalUnit('enemy-1');
      enemyUnit.statuses = [TacticalStatus.Pinned];
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.PreHit,
        enemyUnits: [enemyUnit],
      });
      const result = applyLegionTactica(LegionFaction.WordBearers, PipelineHook.PreHit, ctx);
      expect(result.meleeWSModifier).toBeUndefined();
    });
  });
});
