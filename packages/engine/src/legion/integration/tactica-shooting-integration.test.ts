/**
 * Shooting Tactica Integration Tests
 *
 * Tests the full chain: registerAllLegionTacticas() populates the registry,
 * applyLegionTactica() dispatches to the correct handler, and the handler
 * returns the expected LegionTacticaResult based on a realistic
 * ShootingTacticaContext.
 *
 * Unlike the unit tests in shooting-tacticas.test.ts which register only
 * shooting tacticas, these integration tests use registerAllLegionTacticas()
 * to ensure no cross-category registration conflicts and that the full
 * registry works end-to-end.
 *
 * Reference: HH_Legiones_Astartes.md — shooting-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  registerAllLegionTacticas,
  applyLegionTactica,
} from '../legion-tactica-registry';
import type { ShootingTacticaContext } from '../legion-tactica-registry';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
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
    profileId: 'tactical-squad',
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

function makeShootingContext(overrides: Partial<ShootingTacticaContext>): ShootingTacticaContext {
  return {
    state: makeMinimalGameState(),
    unit: makeMinimalUnit('u1'),
    effects: [],
    hook: PipelineHook.PreHit,
    isAttacker: true,
    isSnapShot: false,
    firerIsStationary: true,
    firerMoveDistance: 0,
    distanceToTarget: 12,
    weaponTraits: [],
    fireGroupDiceCount: 1,
    weaponSpecialRules: [],
    entireUnitHasTactica: true,
    ...overrides,
  };
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Shooting Tactica Integration Tests', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerAllLegionTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPERIAL FISTS (VII) — Disciplined Fire
  // Full chain: registerAllLegionTacticas → applyLegionTactica(ImperialFists, PreHit)
  // Rule: +1 to hit for Bolt/Auto fire groups with 5+ dice (attacker only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Imperial Fists — Disciplined Fire (Integration)', () => {
    const effects = getLegionTacticaEffects('imperial-fists-tactica');

    it('should grant +1 hit modifier when attacking with Bolt trait and exactly 5 dice', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should grant +1 hit modifier when attacking with Auto trait and 7 dice', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Auto'],
        fireGroupDiceCount: 7,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should grant +1 hit modifier when Bolt trait is mixed with other traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Rapid Fire', 'Bolt', 'Heavy'],
        fireGroupDiceCount: 10,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should not grant bonus when fire group has only 4 dice (below minimum)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 4,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not grant bonus when fire group has only 1 die', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 1,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not grant bonus when weapon has Melta trait instead of Bolt/Auto', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Melta'],
        fireGroupDiceCount: 6,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not grant bonus when weapon has Plasma trait instead of Bolt/Auto', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Plasma', 'Rapid Fire'],
        fireGroupDiceCount: 8,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not grant bonus when unit is the defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should handle case-insensitive Bolt trait matching', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should handle case-insensitive Auto trait matching', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['AUTO'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should not produce any other result fields besides hitModifier', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
      expect(result.forceSnapShots).toBeUndefined();
      expect(result.countsAsStationary).toBeUndefined();
      expect(result.incomingStrengthModifier).toBeUndefined();
      expect(result.minimumWoundRoll).toBeUndefined();
      expect(result.virtualRangeIncrease).toBeUndefined();
      expect(result.volleyFullBS).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SONS OF HORUS (XVI) — Merciless Fighters
  // Full chain: registerAllLegionTacticas → applyLegionTactica(SonsOfHorus, PreHit)
  // Rule: Volley attacks fire at full BS (not snap shots), attacker only
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sons of Horus — Merciless Fighters (Integration)', () => {
    const effects = getLegionTacticaEffects('sons-of-horus-tactica');

    it('should return volleyFullBS true when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should not apply volleyFullBS when unit is the defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBeUndefined();
    });

    it('should apply regardless of weapon traits (Heavy, Melta, Las, etc.)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Heavy', 'Melta'],
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should apply regardless of fire group dice count', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        fireGroupDiceCount: 1,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should apply regardless of distance to target', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        distanceToTarget: 48,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RAVEN GUARD (XIX) — By Wing and Talon
  // Full chain: registerAllLegionTacticas → applyLegionTactica(RavenGuard, PreHit)
  // Rule: Force snap shots at 18"+ range (defensive, requires entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Raven Guard — By Wing and Talon (Integration)', () => {
    const effects = getLegionTacticaEffects('raven-guard-tactica');

    it('should force snap shots when defender at exactly 18" range with entire unit', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 18,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBe(true);
    });

    it('should force snap shots when defender at 24" range', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 24,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBe(true);
    });

    it('should force snap shots at maximum table range (48")', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 48,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBe(true);
    });

    it('should not force snap shots at 17" range (below threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 17,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should not force snap shots at close range (6")', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 6,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should not apply when unit is the attacker (offensive context)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        distanceToTarget: 24,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should not apply when not entire unit has the tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 24,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ALPHA LEGION (XX) — Mutable Tactics
  // Full chain: registerAllLegionTacticas → applyLegionTactica(AlphaLegion, PreHit)
  // Rule: +2" virtual distance for enemy range calculations (defensive)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Alpha Legion — Mutable Tactics (Integration)', () => {
    const effects = getLegionTacticaEffects('alpha-legion-tactica');

    it('should grant +2 virtual range increase when defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 14,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should not apply virtual range increase when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        distanceToTarget: 14,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBeUndefined();
    });

    it('should apply regardless of weapon traits on the incoming attack', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        weaponTraits: ['Las', 'Heavy', 'Ordnance'],
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should apply at point-blank range (0")', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 0,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should apply at maximum table range (48")', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 48,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IRON HANDS (X) — Inviolate Armour
  // Full chain: registerAllLegionTacticas → applyLegionTactica(IronHands, PreWound)
  // Rule: -1 to incoming ranged Strength for wound tests (defensive, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Iron Hands — Inviolate Armour (Integration)', () => {
    const effects = getLegionTacticaEffects('iron-hands-tactica');

    it('should grant -1 incoming strength modifier when defender with entire unit', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBe(-1);
    });

    it('should not apply when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: true,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBeUndefined();
    });

    it('should not apply when not entire unit has the tactica (mixed squad)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBeUndefined();
    });

    it('should apply regardless of weapon traits (Plasma, Melta, Bolt, etc.)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: ['Plasma', 'Rapid Fire'],
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBe(-1);
    });

    it('should apply regardless of fire group dice count', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: true,
        fireGroupDiceCount: 20,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBe(-1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALAMANDERS (XVIII) — Strength of Will
  // Full chain: registerAllLegionTacticas → applyLegionTactica(Salamanders, OnWound)
  // Rule: Wound rolls of 1 or 2 always fail (defensive, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Salamanders — Strength of Will (OnWound Integration)', () => {
    const effects = getLegionTacticaEffects('salamanders-tactica');

    it('should set minimumWoundRoll to 2 when defender with entire unit', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBe(2);
    });

    it('should not apply when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: true,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBeUndefined();
    });

    it('should not apply when not entire unit has the tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBeUndefined();
    });

    it('should apply regardless of incoming weapon traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: ['Las', 'Heavy', 'Ordnance'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBe(2);
    });

    it('should apply regardless of distance to target', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: true,
        distanceToTarget: 1,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALAMANDERS (XVIII) — Strength of Will (OnCasualty)
  // Full chain: registerAllLegionTacticas → applyLegionTactica(Salamanders, OnCasualty)
  // Rule: Immune to Panic from Flame weapons (defensive, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Salamanders — Strength of Will (OnCasualty Integration)', () => {
    const effects = getLegionTacticaEffects('salamanders-tactica');

    it('should grant Flame panic immunity when weapon has Flame trait', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: ['Flame', 'Assault'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBe('Flame');
    });

    it('should not grant panic immunity when weapon has Bolt trait (not Flame)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: ['Bolt', 'Rapid Fire'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBeUndefined();
    });

    it('should not grant panic immunity when not entire unit has the tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: false,
        entireUnitHasTactica: false,
        weaponTraits: ['Flame'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBeUndefined();
    });

    it('should not grant panic immunity when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: true,
        entireUnitHasTactica: true,
        weaponTraits: ['Flame'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBeUndefined();
    });

    it('should handle case-insensitive flame trait matching', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: ['flame'],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBe('Flame');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEATH GUARD (XIV) — Remorseless Advance
  // Full chain: registerAllLegionTacticas → applyLegionTactica(DeathGuard, PreHit)
  // Rule: Heavy weapons count as stationary after moving <=4" (attacker only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Death Guard — Remorseless Advance (Integration)', () => {
    const effects = getLegionTacticaEffects('death-guard-tactica');

    it('should count as stationary when moved exactly 4" (at threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 4,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });

    it('should count as stationary when moved 2" (well within threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 2,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });

    it('should count as stationary when moved 0" but not flagged as stationary', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 0,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });

    it('should not count as stationary when moved 5" (exceeds threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 5,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBeUndefined();
    });

    it('should not count as stationary when moved 10" (far exceeds threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 10,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBeUndefined();
    });

    it('should not apply when firer is already stationary (redundant)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: true,
        firerMoveDistance: 0,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBeUndefined();
    });

    it('should not apply when unit is the defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        firerIsStationary: false,
        firerMoveDistance: 3,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-LEGION ISOLATION & REGISTRY INTEGRITY
  // Ensures that registering all tacticas does not cause cross-contamination
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-Legion Isolation (Integration)', () => {
    it('should not apply Imperial Fists hit bonus when querying Sons of Horus', () => {
      const ifEffects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects: ifEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not apply Raven Guard snap shots when querying Alpha Legion', () => {
      const rgEffects = getLegionTacticaEffects('raven-guard-tactica');
      const ctx = makeShootingContext({
        effects: rgEffects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 24,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      // Alpha Legion handler returns virtualRangeIncrease, not forceSnapShots
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should return empty result for Imperial Fists at OnWound hook (no handler registered)', () => {
      const ctx = makeShootingContext({
        effects: getLegionTacticaEffects('imperial-fists-tactica'),
        hook: PipelineHook.OnWound,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.OnWound, ctx);
      expect(result).toEqual({});
    });

    it('should return empty result for Sons of Horus at PreWound hook (no handler registered)', () => {
      const ctx = makeShootingContext({
        effects: getLegionTacticaEffects('sons-of-horus-tactica'),
        hook: PipelineHook.PreWound,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreWound, ctx);
      expect(result).toEqual({});
    });

    it('should return empty result for Iron Hands at PreHit hook (registered at PreWound only for shooting)', () => {
      const ctx = makeShootingContext({
        effects: getLegionTacticaEffects('iron-hands-tactica'),
        hook: PipelineHook.PreHit,
        isAttacker: false,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreHit, ctx);
      expect(result.incomingStrengthModifier).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTRY RESET CORRECTNESS
  // Verifies that clearLegionTacticaRegistry + registerAllLegionTacticas
  // produces a consistent state across repeated invocations
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registry Reset Correctness (Integration)', () => {
    it('should produce identical results after clear and re-register', () => {
      const ifEffects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects: ifEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });

      // First pass (already registered in beforeEach)
      const result1 = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);

      // Clear and re-register
      clearLegionTacticaRegistry();
      registerAllLegionTacticas();

      // Second pass
      const result2 = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);

      expect(result1).toEqual(result2);
      expect(result1.hitModifier).toBe(1);
    });

    it('should lazily re-register tacticas after a clear when apply is invoked again', () => {
      clearLegionTacticaRegistry();

      const ifEffects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects: ifEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });

      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REALISTIC SCENARIO TESTS
  // Simulate game-like conditions with multiple context fields set
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Realistic Scenario Tests (Integration)', () => {
    it('Imperial Fists: 10-man tactical squad firing bolters at 12" (5 bolt dice)', () => {
      const ifEffects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects: ifEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 12,
        weaponTraits: ['Bolt', 'Rapid Fire'],
        fireGroupDiceCount: 10,
        weaponSpecialRules: [],
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('Imperial Fists: 5-man squad firing heavy bolter at range (still Bolt trait, 3 dice - below min)', () => {
      const ifEffects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects: ifEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 30,
        weaponTraits: ['Bolt', 'Heavy'],
        fireGroupDiceCount: 3,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('Death Guard: heavy weapon team moves 3" then fires lascannon', () => {
      const dgEffects = getLegionTacticaEffects('death-guard-tactica');
      const ctx = makeShootingContext({
        effects: dgEffects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        isSnapShot: false,
        firerIsStationary: false,
        firerMoveDistance: 3,
        distanceToTarget: 24,
        weaponTraits: ['Las', 'Heavy'],
        fireGroupDiceCount: 1,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });

    it('Raven Guard: defending against autocannon fire at 24"', () => {
      const rgEffects = getLegionTacticaEffects('raven-guard-tactica');
      const ctx = makeShootingContext({
        effects: rgEffects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 24,
        weaponTraits: ['Auto', 'Heavy'],
        fireGroupDiceCount: 4,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBe(true);
    });

    it('Iron Hands: defending against multi-melta at close range', () => {
      const ihEffects = getLegionTacticaEffects('iron-hands-tactica');
      const ctx = makeShootingContext({
        effects: ihEffects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 6,
        weaponTraits: ['Melta', 'Heavy'],
        fireGroupDiceCount: 1,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBe(-1);
    });

    it('Salamanders: defending against flamer wound test (rolls of 1-2 fail)', () => {
      const salEffects = getLegionTacticaEffects('salamanders-tactica');
      const ctx = makeShootingContext({
        effects: salEffects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 8,
        weaponTraits: ['Flame', 'Assault'],
        fireGroupDiceCount: 3,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBe(2);
    });

    it('Alpha Legion: defending against long-range bombardment (effective range +2")', () => {
      const alEffects = getLegionTacticaEffects('alpha-legion-tactica');
      const ctx = makeShootingContext({
        effects: alEffects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        isSnapShot: false,
        firerIsStationary: true,
        firerMoveDistance: 0,
        distanceToTarget: 34,
        weaponTraits: ['Ordnance', 'Heavy'],
        fireGroupDiceCount: 1,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });
  });
});
