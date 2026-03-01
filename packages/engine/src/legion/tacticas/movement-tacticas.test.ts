/**
 * Movement Legion Tactica Handler Tests
 *
 * Tests each movement handler individually via registerMovementTacticas()
 * and applyLegionTactica() with appropriate MovementTacticaContext / AssaultTacticaContext.
 *
 * Reference: HH_Legiones_Astartes.md — movement-related legion tacticas
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearLegionTacticaRegistry,
  applyLegionTactica,
  getRegisteredLegionTacticas,
  hasLegionTactica,
} from '../legion-tactica-registry';
import type { MovementTacticaContext, AssaultTacticaContext } from '../legion-tactica-registry';
import { registerMovementTacticas } from './movement-tacticas';
import {
  LegionFaction,
  PipelineHook,
  Phase,
  SubPhase,
  Allegiance,
  UnitMovementState,
} from '@hh/types';
import type { GameState, ArmyState, UnitState } from '@hh/types';
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

function makeMovementContext(overrides: Partial<MovementTacticaContext>): MovementTacticaContext {
  return {
    state: makeMinimalGameState(),
    unit: makeMinimalUnit('u1'),
    effects: [],
    hook: PipelineHook.Movement,
    moveDistance: 0,
    entireUnitHasTactica: true,
    ...overrides,
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

describe('Movement Legion Tacticas', () => {
  beforeEach(() => {
    clearLegionTacticaRegistry();
    registerMovementTacticas();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WHITE SCARS (V) — Born in the Saddle
  // Movement: Optional +2 Movement when activated at turn start
  // ═══════════════════════════════════════════════════════════════════════════

  describe('White Scars — Born in the Saddle', () => {
    const effects = getLegionTacticaEffects('white-scars-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMovementContext({
        effects: [],
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should return empty when unit is not found in any army', () => {
      const state = makeMinimalGameState();
      // Unit 'u1' is not in any army's units array (both armies have empty units)
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should return empty when legionTacticaState is missing for the player', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState = [] as any;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should return empty when movementBonusActiveThisTurn is false', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = false;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should return empty when movementBonusActiveThisTurn is undefined', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      (state.legionTacticaState[0] as any).movementBonusActiveThisTurn = undefined;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should return movementBonus of 2 when movementBonusActiveThisTurn is true', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBe(2);
    });

    it('should use the effect.value for the bonus amount', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      // White Scars effect value is 2
      expect(result.movementBonus).toBe(2);
    });

    it('should default to 0 when effect.value is not specified', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      // Provide a synthetic effect without a value
      const effectsWithoutValue = [
        { type: effects[0].type } as any,
      ];
      const ctx = makeMovementContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBe(0);
    });

    it('should work correctly for player index 1', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[1].units = [unit];
      state.legionTacticaState[1].movementBonusActiveThisTurn = true;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBe(2);
    });

    it('should not grant bonus for player 1 when only player 0 has it active', () => {
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[1].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      state.legionTacticaState[1].movementBonusActiveThisTurn = false;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE WOLVES (VI) — Howl of the Death Wolf
  // OnCharge: +2" to set-up move distance (max 6")
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Space Wolves — Howl of the Death Wolf', () => {
    const effects = getLegionTacticaEffects('space-wolves-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeAssaultContext({
        effects: [],
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBeUndefined();
      expect(result.setupMoveMax).toBeUndefined();
    });

    it('should return setupMoveBonus and setupMoveMax when effect is present', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBe(2);
      expect(result.setupMoveMax).toBe(6);
    });

    it('should use effect.value for the bonus amount', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      // Space Wolves effect value is 2
      expect(result.setupMoveBonus).toBe(2);
    });

    it('should use effect.maxValue for the max cap', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      // Space Wolves effect maxValue is 6
      expect(result.setupMoveMax).toBe(6);
    });

    it('should default to 0 when effect.value is not specified', () => {
      const effectsWithoutValue = [
        { type: effects[0].type, maxValue: effects[0].maxValue } as any,
      ];
      const ctx = makeAssaultContext({
        effects: effectsWithoutValue,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBe(0);
    });

    it('should set setupMoveMax to undefined when effect.maxValue is not specified', () => {
      const effectsWithoutMaxValue = [
        { type: effects[0].type, value: effects[0].value } as any,
      ];
      const ctx = makeAssaultContext({
        effects: effectsWithoutMaxValue,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBe(2);
      expect(result.setupMoveMax).toBeUndefined();
    });

    it('should apply regardless of charge turn status', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: false,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBe(2);
      expect(result.setupMoveMax).toBe(6);
    });

    it('should not affect movementBonus', () => {
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.movementBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DEATH GUARD (XIV) — Remorseless Advance (Movement part)
  // Movement: Ignore difficult terrain movement penalty
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Death Guard — Remorseless Advance (Movement)', () => {
    const effects = getLegionTacticaEffects('death-guard-tactica');

    it('should return empty when no matching effect is present', () => {
      const ctx = makeMovementContext({
        effects: [],
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.ignoresDifficultTerrain).toBeUndefined();
    });

    it('should return ignoresDifficultTerrain true when effect is present', () => {
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.ignoresDifficultTerrain).toBe(true);
    });

    it('should return ignoresDifficultTerrain regardless of effect value', () => {
      // The Death Guard IgnoreDifficultTerrainPenalty effect has no value — boolean result
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.ignoresDifficultTerrain).toBe(true);
    });

    it('should apply regardless of moveDistance', () => {
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        moveDistance: 10,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.ignoresDifficultTerrain).toBe(true);
    });

    it('should not affect movementBonus', () => {
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBeUndefined();
    });

    it('should not affect setupMoveBonus', () => {
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.setupMoveBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Registration', () => {
    it('should register White Scars at the Movement hook', () => {
      expect(hasLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement)).toBe(true);
    });

    it('should register Space Wolves at the OnCharge hook', () => {
      expect(hasLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge)).toBe(true);
    });

    it('should register Death Guard at the Movement hook', () => {
      expect(hasLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement)).toBe(true);
    });

    it('should include all three movement tacticas in the registry', () => {
      const registered = getRegisteredLegionTacticas();
      const movementEntries = registered.filter(
        r =>
          (r.legion === LegionFaction.WhiteScars && r.hook === PipelineHook.Movement) ||
          (r.legion === LegionFaction.SpaceWolves && r.hook === PipelineHook.OnCharge) ||
          (r.legion === LegionFaction.DeathGuard && r.hook === PipelineHook.Movement),
      );
      expect(movementEntries).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Integration via applyLegionTactica
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Integration via applyLegionTactica', () => {
    it('should apply White Scars Movement tactica end-to-end', () => {
      const effects = getLegionTacticaEffects('white-scars-tactica');
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.Movement, ctx);
      expect(result.movementBonus).toBe(2);
      expect(result.ignoresDifficultTerrain).toBeUndefined();
      expect(result.setupMoveBonus).toBeUndefined();
    });

    it('should apply Space Wolves OnCharge tactica end-to-end', () => {
      const effects = getLegionTacticaEffects('space-wolves-tactica');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBe(2);
      expect(result.setupMoveMax).toBe(6);
      expect(result.movementBonus).toBeUndefined();
      expect(result.ignoresDifficultTerrain).toBeUndefined();
    });

    it('should apply Death Guard Movement tactica end-to-end', () => {
      const effects = getLegionTacticaEffects('death-guard-tactica');
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        moveDistance: 3,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      expect(result.ignoresDifficultTerrain).toBe(true);
      expect(result.movementBonus).toBeUndefined();
      expect(result.setupMoveBonus).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cross-legion isolation checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Cross-legion isolation', () => {
    it('should not apply White Scars handler for Death Guard at Movement hook', () => {
      const effects = getLegionTacticaEffects('white-scars-tactica');
      const state = makeMinimalGameState();
      const unit = makeMinimalUnit('u1');
      state.armies[0].units = [unit];
      state.legionTacticaState[0].movementBonusActiveThisTurn = true;
      const ctx = makeMovementContext({
        effects,
        hook: PipelineHook.Movement,
        unit,
        state,
      });
      const result = applyLegionTactica(LegionFaction.DeathGuard, PipelineHook.Movement, ctx);
      // Death Guard handler looks for IgnoreDifficultTerrainPenalty, not OptionalMovementBonus
      expect(result.movementBonus).toBeUndefined();
    });

    it('should not apply Space Wolves handler for White Scars at OnCharge hook', () => {
      const effects = getLegionTacticaEffects('space-wolves-tactica');
      const ctx = makeAssaultContext({
        effects,
        hook: PipelineHook.OnCharge,
      });
      // White Scars has no OnCharge handler
      const result = applyLegionTactica(LegionFaction.WhiteScars, PipelineHook.OnCharge, ctx);
      expect(result.setupMoveBonus).toBeUndefined();
    });

    it('should return empty result for a legion with no movement handler at a given hook', () => {
      const ctx = makeMovementContext({
        effects: [],
        hook: PipelineHook.Movement,
      });
      const result = applyLegionTactica(LegionFaction.SpaceWolves, PipelineHook.Movement, ctx);
      expect(result).toEqual({});
    });
  });
});
