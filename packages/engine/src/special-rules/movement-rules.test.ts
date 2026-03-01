/**
 * Movement Rules Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Phase, SubPhase, UnitMovementState, Allegiance, LegionFaction } from '@hh/types';
import type { GameState } from '@hh/types';
import {
  clearRegistry,
  getMovementRule,
  hasMovementRule,
  applyMovementRules,
} from './rule-registry';
import type { MovementRuleContext } from './rule-registry';
import { registerAllMovementRules } from './movement-rules';
import { FixedDiceProvider } from '../dice';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createContext(): MovementRuleContext {
  const state: GameState = {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [{
      id: 'a0', playerIndex: 0, playerName: 'P1',
      faction: LegionFaction.SonsOfHorus, allegiance: Allegiance.Traitor,
      units: [], totalPoints: 1000, pointsLimit: 2000,
      reactionAllotmentRemaining: 1, baseReactionAllotment: 1, victoryPoints: 0,
    }, {
      id: 'a1', playerIndex: 1, playerName: 'P2',
      faction: LegionFaction.Ultramarines, allegiance: Allegiance.Loyalist,
      units: [], totalPoints: 1000, pointsLimit: 2000,
      reactionAllotmentRemaining: 1, baseReactionAllotment: 1, victoryPoints: 0,
    }],
    currentBattleTurn: 1, maxBattleTurns: 4,
    activePlayerIndex: 0, firstPlayerIndex: 0,
    currentPhase: Phase.Movement, currentSubPhase: SubPhase.Move,
    awaitingReaction: false, isGameOver: false, winnerPlayerIndex: null,
    log: [], turnHistory: [],
  };

  return {
    state,
    unit: {
      id: 'u1', profileId: 'tactical', models: [], statuses: [],
      hasReactedThisTurn: false, movementState: UnitMovementState.Stationary,
      isLockedInCombat: false, embarkedOnId: null,
      isInReserves: false, isDeployed: true, engagedWithUnitIds: [], modifiers: [],
    },
    dice: new FixedDiceProvider([]),
    terrain: [],
    battlefieldWidth: 72,
    battlefieldHeight: 48,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Movement Rules', () => {
  beforeEach(() => {
    clearRegistry();
    registerAllMovementRules();
  });

  describe('registration', () => {
    it('should register all expected rules', () => {
      expect(hasMovementRule('Deep Strike')).toBe(true);
      expect(hasMovementRule('Outflank')).toBe(true);
      expect(hasMovementRule('Infiltrate')).toBe(true);
      expect(hasMovementRule('Scout')).toBe(true);
      expect(hasMovementRule('Fleet')).toBe(true);
      expect(hasMovementRule('Fast')).toBe(true);
      expect(hasMovementRule('Move Through Cover')).toBe(true);
      expect(hasMovementRule('Implacable Advance')).toBe(true);
      expect(hasMovementRule('Antigrav')).toBe(true);
      expect(hasMovementRule('Assault Vehicle')).toBe(true);
      expect(hasMovementRule('Bulky')).toBe(true);
    });
  });

  describe('Deep Strike', () => {
    it('should allow deep strike entry', () => {
      const handler = getMovementRule('Deep Strike')!;
      const result = handler(createContext());
      expect(result.allowsDeepStrike).toBe(true);
    });
  });

  describe('Outflank', () => {
    it('should allow outflank entry', () => {
      const handler = getMovementRule('Outflank')!;
      const result = handler(createContext());
      expect(result.allowsOutflank).toBe(true);
    });
  });

  describe('Fleet', () => {
    it('should allow rush re-roll', () => {
      const handler = getMovementRule('Fleet')!;
      const result = handler(createContext());
      expect(result.canRerollRush).toBe(true);
    });
  });

  describe('Fast', () => {
    it('should add movement bonus from value', () => {
      const handler = getMovementRule('Fast')!;
      const result = handler(createContext(), 2);
      expect(result.movementBonus).toBe(2);
    });

    it('should handle string value', () => {
      const handler = getMovementRule('Fast')!;
      const result = handler(createContext(), '3');
      expect(result.movementBonus).toBe(3);
    });

    it('should default to 0 for missing value', () => {
      const handler = getMovementRule('Fast')!;
      const result = handler(createContext());
      expect(result.movementBonus).toBe(0);
    });
  });

  describe('Move Through Cover', () => {
    it('should ignore difficult and dangerous terrain', () => {
      const handler = getMovementRule('Move Through Cover')!;
      const result = handler(createContext());
      expect(result.ignoresDifficultTerrain).toBe(true);
      expect(result.ignoresDangerousTerrain).toBe(true);
    });
  });

  describe('Implacable Advance', () => {
    it('should count as stationary', () => {
      const handler = getMovementRule('Implacable Advance')!;
      const result = handler(createContext());
      expect(result.countsAsStationary).toBe(true);
    });
  });

  describe('Antigrav', () => {
    it('should ignore difficult and dangerous terrain', () => {
      const handler = getMovementRule('Antigrav')!;
      const result = handler(createContext());
      expect(result.ignoresDifficultTerrain).toBe(true);
      expect(result.ignoresDangerousTerrain).toBe(true);
    });
  });

  describe('Assault Vehicle', () => {
    it('should allow charge after disembark', () => {
      const handler = getMovementRule('Assault Vehicle')!;
      const result = handler(createContext());
      expect(result.canChargeAfterDisembark).toBe(true);
    });
  });

  describe('Bulky', () => {
    it('should set bulky value from parameter', () => {
      const handler = getMovementRule('Bulky')!;
      const result = handler(createContext(), 3);
      expect(result.bulkyValue).toBe(3);
    });

    it('should default to 2 for missing value', () => {
      const handler = getMovementRule('Bulky')!;
      const result = handler(createContext());
      expect(result.bulkyValue).toBe(2);
    });
  });

  describe('Infiltrate', () => {
    it('should return empty result (deployment-only rule)', () => {
      const handler = getMovementRule('Infiltrate')!;
      const result = handler(createContext(), 18);
      expect(result).toEqual({});
    });
  });

  describe('Scout', () => {
    it('should return empty result (pre-game rule)', () => {
      const handler = getMovementRule('Scout')!;
      const result = handler(createContext());
      expect(result).toEqual({});
    });
  });

  describe('Combined rules', () => {
    it('should merge Move Through Cover + Fast(2) + Implacable Advance', () => {
      const ctx = createContext();
      const result = applyMovementRules(
        [
          { name: 'Move Through Cover' },
          { name: 'Fast', value: 2 },
          { name: 'Implacable Advance' },
        ],
        ctx,
      );

      expect(result.ignoresDifficultTerrain).toBe(true);
      expect(result.ignoresDangerousTerrain).toBe(true);
      expect(result.movementBonus).toBe(2);
      expect(result.countsAsStationary).toBe(true);
    });

    it('should merge Deep Strike + Bulky(3)', () => {
      const ctx = createContext();
      const result = applyMovementRules(
        [
          { name: 'Deep Strike' },
          { name: 'Bulky', value: 3 },
        ],
        ctx,
      );

      expect(result.allowsDeepStrike).toBe(true);
      expect(result.bulkyValue).toBe(3);
    });
  });
});
