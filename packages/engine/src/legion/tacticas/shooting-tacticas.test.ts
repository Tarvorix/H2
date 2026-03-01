/**
 * Shooting Legion Tactica Handler Tests
 *
 * Tests each shooting handler individually via registerShootingTacticas()
 * and applyLegionTactica() with appropriate ShootingTacticaContext.
 *
 * Reference: HH_Legiones_Astartes.md — shooting-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
} from '../legion-tactica-registry';
import type { ShootingTacticaContext } from '../legion-tactica-registry';
import { registerShootingTacticas } from './shooting-tacticas';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
  UnitMovementState,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, LegionTacticaEffect } from '@hh/types';
import { LEGION_TACTICA_EFFECTS, getLegionTacticaEffects } from '@hh/data';

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Shooting Legion Tacticas', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerShootingTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPERIAL FISTS (VII) — Disciplined Fire
  // PreHit: +1 to hit for Bolt/Auto fire groups with 5+ dice (attacker only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Imperial Fists — Disciplined Fire', () => {
    const effects = getLegionTacticaEffects('imperial-fists-tactica');

    it('should grant +1 hit modifier with Bolt trait and 5 dice', () => {
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

    it('should grant +1 hit modifier with Auto trait and 6 dice', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Auto'],
        fireGroupDiceCount: 6,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should not grant bonus with only 4 dice (below minimum)', () => {
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

    it('should not grant bonus with Melta trait (wrong trait)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Melta'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not grant bonus when defender (defensive context)', () => {
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

    it('should not grant bonus with no weapon traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: [],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBeUndefined();
    });

    it('should grant bonus with Bolt trait among other traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Rapid Fire', 'Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.PreHit, ctx);
      expect(result.hitModifier).toBe(1);
    });

    it('should handle case-insensitive trait matching', () => {
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
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SONS OF HORUS (XVI) — Merciless Fighters
  // PreHit: Volley attacks at full BS (attacker only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sons of Horus — Merciless Fighters', () => {
    const effects = getLegionTacticaEffects('sons-of-horus-tactica');

    it('should return volleyFullBS true when attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should not apply when defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBeUndefined();
    });

    it('should apply regardless of weapon traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Melta', 'Heavy'],
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });

    it('should apply regardless of dice count', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        fireGroupDiceCount: 1,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      expect(result.volleyFullBS).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RAVEN GUARD (XIX) — By Wing and Talon
  // PreHit: Force snap shots at 18"+ (defender, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Raven Guard — By Wing and Talon', () => {
    const effects = getLegionTacticaEffects('raven-guard-tactica');

    it('should force snap shots at 18" range when defender with entire unit', () => {
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

    it('should force snap shots at 24" range', () => {
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

    it('should not apply when unit is the attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        distanceToTarget: 18,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should not apply when not entire unit has tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 18,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should not force snap shots at exactly 0" range', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 0,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.RavenGuard, PipelineHook.PreHit, ctx);
      expect(result.forceSnapShots).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ALPHA LEGION (XX) — Mutable Tactics
  // PreHit: +2" virtual range increase (defender)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Alpha Legion — Mutable Tactics', () => {
    const effects = getLegionTacticaEffects('alpha-legion-tactica');

    it('should grant +2 virtual range increase when defender', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should not apply when attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBeUndefined();
    });

    it('should apply regardless of distance to target', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 6,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });

    it('should apply regardless of weapon traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        weaponTraits: ['Las', 'Heavy'],
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      expect(result.virtualRangeIncrease).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IRON HANDS (X) — Inviolate Armour
  // PreWound: -1 incoming ranged Strength (defender, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Iron Hands — Inviolate Armour', () => {
    const effects = getLegionTacticaEffects('iron-hands-tactica');

    it('should grant -1 incoming strength modifier when defender and entire unit', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBe(-1);
    });

    it('should not apply when not entire unit has tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: false,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBeUndefined();
    });

    it('should not apply when attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreWound,
        isAttacker: true,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.IronHands, PipelineHook.PreWound, ctx);
      expect(result.incomingStrengthModifier).toBeUndefined();
    });

    it('should apply regardless of weapon traits', () => {
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
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALAMANDERS (XVIII) — Strength of Will (OnWound part)
  // OnWound: Wound rolls of 1-2 always fail (defender, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Salamanders — Strength of Will (OnWound)', () => {
    const effects = getLegionTacticaEffects('salamanders-tactica');

    it('should set minimumWoundRoll to 2 when defender and entire unit', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBe(2);
    });

    it('should not apply when not entire unit has tactica', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: false,
        entireUnitHasTactica: false,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBeUndefined();
    });

    it('should not apply when attacker', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnWound,
        isAttacker: true,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnWound, ctx);
      expect(result.minimumWoundRoll).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALAMANDERS (XVIII) — Strength of Will (OnCasualty part)
  // OnCasualty: Immune to Panic from Flame weapons (defender, entire unit)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Salamanders — Strength of Will (OnCasualty)', () => {
    const effects = getLegionTacticaEffects('salamanders-tactica');

    it('should grant panic immunity from Flame trait when weapon has Flame trait', () => {
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

    it('should not apply when not entire unit has tactica', () => {
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

    it('should not apply when attacker', () => {
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

    it('should handle case-insensitive Flame trait matching', () => {
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

    it('should not grant panic immunity when no weapon traits', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.OnCasualty,
        isAttacker: false,
        entireUnitHasTactica: true,
        weaponTraits: [],
      });
      const result = applyLegionTactica(LegionFaction.Salamanders, PipelineHook.OnCasualty, ctx);
      expect(result.panicImmunityFromTrait).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEATH GUARD (XIV) — Remorseless Advance
  // PreHit: Heavy weapons count as stationary after moving ≤4" (attacker)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Death Guard — Remorseless Advance', () => {
    const effects = getLegionTacticaEffects('death-guard-tactica');

    it('should count as stationary when moved 3" (within threshold)', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 3,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });

    it('should count as stationary when moved exactly 4"', () => {
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

    it('should not apply when firer is already stationary', () => {
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

    it('should not apply when unit is defender', () => {
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

    it('should count as stationary when moved 0" but not stationary flag', () => {
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

    it('should count as stationary when moved 1"', () => {
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        firerIsStationary: false,
        firerMoveDistance: 1,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.PreHit, ctx);
      expect(result.countsAsStationary).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-legion isolation checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation', () => {
    it('should not apply Imperial Fists handler for Sons of Horus', () => {
      const effects = getLegionTacticaEffects('imperial-fists-tactica');
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: true,
        weaponTraits: ['Bolt'],
        fireGroupDiceCount: 5,
      });
      const result = applyLegionTactica(LegionFaction.SonsOfHorus, PipelineHook.PreHit, ctx);
      // Sons of Horus handler returns volleyFullBS, not hitModifier
      expect(result.hitModifier).toBeUndefined();
    });

    it('should not apply Raven Guard handler for Alpha Legion', () => {
      const effects = getLegionTacticaEffects('raven-guard-tactica');
      const ctx = makeShootingContext({
        effects,
        hook: PipelineHook.PreHit,
        isAttacker: false,
        distanceToTarget: 18,
        entireUnitHasTactica: true,
      });
      const result = applyLegionTactica(LegionFaction.AlphaLegion, PipelineHook.PreHit, ctx);
      // Alpha Legion handler returns virtualRangeIncrease, not forceSnapShots
      expect(result.forceSnapShots).toBeUndefined();
    });

    it('should return empty result for a legion with no shooting handler at a given hook', () => {
      const ctx = makeShootingContext({
        effects: [],
        hook: PipelineHook.OnWound,
      });
      const result = applyLegionTactica(LegionFaction.ImperialFists, PipelineHook.OnWound, ctx);
      expect(result).toEqual({});
    });
  });
});
