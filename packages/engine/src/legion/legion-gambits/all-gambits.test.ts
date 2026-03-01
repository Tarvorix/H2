/**
 * Legion Gambit Integration Tests
 *
 * Tests that legion gambits integrate properly with the existing gambit-handler
 * system: getAvailableGambits includes them, selectGambit accepts them,
 * getGambitEffect returns their effects, and resolveFocusRoll applies their modifiers.
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "GAMBIT" subsections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LegionFaction, ChallengeGambit } from '@hh/types';
import { FixedDiceProvider } from '../../dice';
import {
  getAvailableGambits,
  selectGambit,
  getGambitEffect,
  resolveFocusRoll,
  GAMBIT_EFFECTS,
} from '../../assault/gambit-handler';
import type { ChallengeState } from '../../assault/assault-types';
import {
  registerAllLegionGambits,
  clearLegionGambitRegistry,
  getAvailableLegionGambits,
  getLegionGambitEffect,
  getLegionGambitFocusModifier,
  doesGambitExcludeCombatInitiative,
} from '../legion-gambit-registry';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBaseChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return {
    challengerId: 'challenger-m1',
    challengedId: 'challenged-m1',
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: null,
    focusRolls: [0, 0],
    round: 1,
    currentStep: 'FACE_OFF' as const,
    guardUpFocusBonus: {},
    testTheFoeAdvantage: {},
    tauntAndBaitSelections: {},
    withdrawChosen: {},
    needsReroll: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Legion Gambit Integration with gambit-handler', () => {
  beforeEach(() => {
    clearLegionGambitRegistry();
    registerAllLegionGambits();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAvailableGambits (modified)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAvailableGambits', () => {
    it('returns 9 core gambits when no legion specified', () => {
      const gambits = getAvailableGambits();
      expect(gambits).toHaveLength(9);
      expect(gambits).toContain(ChallengeGambit.SeizeTheInitiative);
      expect(gambits).toContain(ChallengeGambit.DeathOrGlory);
    });

    it('returns 9 core + 1 legion gambit for Dark Angels', () => {
      const gambits = getAvailableGambits(LegionFaction.DarkAngels);
      expect(gambits.length).toBe(10);
      expect(gambits).toContain('Sword of the Order');
    });

    it('returns 9 core + 2 legion gambits for Space Wolves', () => {
      const gambits = getAvailableGambits(LegionFaction.SpaceWolves);
      expect(gambits.length).toBe(11);
      expect(gambits).toContain('Wolves of Fenris');
      expect(gambits).toContain('Saga of the Warrior');
    });

    it('returns 9 core + 2 legion gambits for Emperor Children (standard + Hereticus)', () => {
      const gambits = getAvailableGambits(LegionFaction.EmperorsChildren);
      expect(gambits.length).toBe(11);
      expect(gambits).toContain('Paragon of Excellence');
    });

    it('core gambits always present regardless of legion', () => {
      const gambits = getAvailableGambits(LegionFaction.IronHands);
      expect(gambits).toContain(ChallengeGambit.Guard);
      expect(gambits).toContain(ChallengeGambit.Feint);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // selectGambit (modified)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('selectGambit', () => {
    it('accepts a core gambit', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenger-m1', ChallengeGambit.SeizeTheInitiative, state);
      expect(result.challengeState.challengerGambit).toBe(ChallengeGambit.SeizeTheInitiative);
      expect(result.events).toHaveLength(1);
    });

    it('accepts a legion gambit by name', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenger-m1', 'Sword of the Order', state);
      expect(result.challengeState.challengerGambit).toBe('Sword of the Order');
      expect(result.events).toHaveLength(1);
    });

    it('rejects an unknown gambit', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenger-m1', 'nonexistent', state);
      expect(result.challengeState.challengerGambit).toBeNull();
      expect(result.events).toHaveLength(0);
    });

    it('sets challenged gambit for challenged model', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenged-m1', 'Paragon of Excellence', state);
      expect(result.challengeState.challengedGambit).toBe('Paragon of Excellence');
    });

    it('emits gambitSelected event', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenger-m1', 'Spiteful Demise', state);
      expect(result.events[0]).toEqual({
        type: 'gambitSelected',
        modelId: 'challenger-m1',
        gambit: 'Spiteful Demise',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getGambitEffect (modified)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getGambitEffect', () => {
    it('returns core gambit effect', () => {
      const effect = getGambitEffect(ChallengeGambit.SeizeTheInitiative);
      expect(effect).toBeDefined();
      expect(effect!.extraFocusDie).toBe(true);
    });

    it('returns legion gambit effect', () => {
      const effect = getGambitEffect('Sword of the Order');
      expect(effect).toBeDefined();
      expect(effect!.name).toBe('Sword of the Order');
    });

    it('returns null for unknown gambit', () => {
      expect(getGambitEffect('nonexistent')).toBeNull();
    });

    it('core gambit takes precedence over any legion gambit with same name', () => {
      // Core gambits are checked first in GAMBIT_EFFECTS
      const coreEffect = GAMBIT_EFFECTS[ChallengeGambit.Guard];
      const retrievedEffect = getGambitEffect(ChallengeGambit.Guard);
      expect(retrievedEffect).toBe(coreEffect);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // resolveFocusRoll with Legion Gambits
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resolveFocusRoll with legion gambits', () => {
    it('EC Paragon of Excellence adds +2 to focus roll', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Paragon of Excellence',
        challengedGambit: ChallengeGambit.Guard,
      });

      // Challenger rolls 3, challenged rolls 3
      // Challenger: 3 (roll) + 4 (initiative) + 2 (Paragon) = 9
      // Challenged: 3 (roll) + 4 (initiative) + 0 = 7
      const dice = new FixedDiceProvider([3, 3]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.advantagePlayerIndex).toBe(0); // Challenger wins
      expect(result.challengeState.focusRolls[0]).toBe(9); // 3 + 4 + 2
      expect(result.challengeState.focusRolls[1]).toBe(7); // 3 + 4
    });

    it('IF A Wall Unyielding excludes Combat Initiative', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'A Wall Unyielding',
        challengedGambit: null,
      });

      // Challenger rolls 5, CI is excluded so only 5 + 0 (no CI)
      // Challenged rolls 3, CI is 4 → 3 + 4 = 7
      const dice = new FixedDiceProvider([5, 3]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      // Challenger: 5 + 0 (CI excluded) = 5
      // Challenged: 3 + 4 = 7
      expect(result.challengeState.focusRolls[0]).toBe(5);
      expect(result.challengeState.focusRolls[1]).toBe(7);
      expect(result.advantagePlayerIndex).toBe(1); // Challenged wins
    });

    it('standard legion gambit (no focus modifier) does not affect roll', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Sword of the Order',
        challengedGambit: null,
      });

      // Challenger rolls 4, challenged rolls 4
      // Both have CI 4, no focus modifiers
      const dice = new FixedDiceProvider([4, 4]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls[0]).toBe(8); // 4 + 4
      expect(result.challengeState.focusRolls[1]).toBe(8); // 4 + 4
      expect(result.needsReroll).toBe(true); // Tie
    });

    it('legion gambit with extraFocusDie works correctly', () => {
      // No standard legion gambit has extraFocusDie, but test the path
      // by using a core gambit that does
      const state = makeBaseChallengeState({
        challengerGambit: ChallengeGambit.SeizeTheInitiative,
        challengedGambit: 'Spiteful Demise',
      });

      // Seize: rolls 2d6, keeps highest: [6, 2] → 6
      // Spiteful Demise: no focus effects, standard roll: 4
      const dice = new FixedDiceProvider([6, 2, 4]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls[0]).toBe(10); // 6 + 4
      expect(result.challengeState.focusRolls[1]).toBe(8); // 4 + 4
    });

    it('both players using legion gambits resolves correctly', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Paragon of Excellence', // +2 focus
        challengedGambit: 'A Wall Unyielding', // excludes CI
      });

      // Challenger rolls 3: 3 + 4 (CI) + 2 (Paragon) = 9
      // Challenged rolls 5: 5 + 0 (CI excluded) = 5
      const dice = new FixedDiceProvider([3, 5]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls[0]).toBe(9);
      expect(result.challengeState.focusRolls[1]).toBe(5);
      expect(result.advantagePlayerIndex).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // All 18 Legion Gambits Present
  // ═══════════════════════════════════════════════════════════════════════════

  describe('all legion gambits registered', () => {
    beforeEach(() => {
      clearLegionGambitRegistry();
      registerAllLegionGambits();
    });

    const expectedGambits = [
      { name: 'Sword of the Order', legion: LegionFaction.DarkAngels },
      { name: 'Paragon of Excellence', legion: LegionFaction.EmperorsChildren },
      { name: 'Spiteful Demise', legion: LegionFaction.IronWarriors },
      { name: 'Path of the Warrior', legion: LegionFaction.WhiteScars },
      { name: 'Wolves of Fenris', legion: LegionFaction.SpaceWolves },
      { name: 'Saga of the Warrior', legion: LegionFaction.SpaceWolves },
      { name: 'A Wall Unyielding', legion: LegionFaction.ImperialFists },
      { name: 'Nostraman Courage', legion: LegionFaction.NightLords },
      { name: 'Thrall of the Red Thirst', legion: LegionFaction.BloodAngels },
      { name: 'Legion of One', legion: LegionFaction.IronHands },
      { name: 'Violent Overkill', legion: LegionFaction.WorldEaters },
      { name: 'Aegis of Wisdom', legion: LegionFaction.Ultramarines },
      { name: 'Steadfast Resilience', legion: LegionFaction.DeathGuard },
      { name: 'Prophetic Duellist', legion: LegionFaction.ThousandSons },
      { name: 'Merciless Strike', legion: LegionFaction.SonsOfHorus },
      { name: 'Beseech the Gods', legion: LegionFaction.WordBearers },
      { name: 'Duty is Sacrifice', legion: LegionFaction.Salamanders },
      { name: 'Decapitation Strike', legion: LegionFaction.RavenGuard },
      { name: 'I Am Alpharius', legion: LegionFaction.AlphaLegion },
    ];

    for (const { name, legion } of expectedGambits) {
      it(`${name} is registered and available for ${legion}`, () => {
        expect(getLegionGambitEffect(name)).toBeDefined();
        expect(getAvailableLegionGambits(legion)).toContain(name);
      });
    }
  });
});
