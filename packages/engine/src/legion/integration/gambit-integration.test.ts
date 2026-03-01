/**
 * Legion Gambit Integration Tests
 *
 * Tests that the legion gambit system integrates correctly with the core gambit
 * system in gambit-handler.ts. Verifies that:
 * 1. Every legion's gambit appears in getAvailableGambits(legion) alongside 9 core gambits.
 * 2. selectGambit works with legion gambits by name.
 * 3. getGambitEffect falls through to the legion registry when core doesn't have it.
 * 4. Focus roll mechanics apply legion-specific modifiers correctly.
 * 5. Cross-reference: all 21 gambits have correct GambitEffect fields.
 * 6. Core + legion coexistence: core gambits always present, not duplicated.
 * 7. Extended properties are accessible for the correct gambits.
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "GAMBIT" subsections
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 2-3
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
  isLegionGambit,
  getRegisteredLegionGambits,
  getLegionGambitFocusModifier,
  doesGambitExcludeCombatInitiative,
  getGambitReplaceCharacteristic,
  getGambitOnDeathAutoHit,
  doesGambitSpillExcessWounds,
  getGambitTraitEffect,
  getGambitEternalWarrior,
  getGambitSetEnemyCombatInitiative,
} from '../legion-gambit-registry';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBaseChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return {
    challengerId: 'challenger-m1',
    challengedId: 'challenged-m1',
    challengerUnitId: 'unit-1',
    challengedUnitId: 'unit-2',
    challengerPlayerIndex: 0,
    challengedPlayerIndex: 1,
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: null,
    focusRolls: [0, 0],
    challengerWoundsInflicted: 0,
    challengedWoundsInflicted: 0,
    round: 1,
    currentStep: 'FACE_OFF' as const,
    challengerCRP: 0,
    challengedCRP: 0,
    challengerWeaponId: null,
    challengedWeaponId: null,
    guardUpFocusBonus: {},
    testTheFoeAdvantage: {},
    tauntAndBaitSelections: {},
    withdrawChosen: {},
    ...overrides,
  };
}

/**
 * All 9 core gambit names from the ChallengeGambit enum.
 */
const ALL_CORE_GAMBIT_NAMES: string[] = [
  ChallengeGambit.SeizeTheInitiative,
  ChallengeGambit.Feint,
  ChallengeGambit.Guard,
  ChallengeGambit.PressTheAttack,
  ChallengeGambit.RecklessAssault,
  ChallengeGambit.CautiousAdvance,
  ChallengeGambit.DefensiveStance,
  ChallengeGambit.AllOutAttack,
  ChallengeGambit.DeathOrGlory,
];

/**
 * Full list of all 21 legion gambits with their owning legion and expected
 * gambit count for that legion.
 */
const ALL_LEGION_GAMBITS: {
  name: string;
  legion: LegionFaction;
  expectedCountForLegion: number;
}[] = [
  { name: 'Sword of the Order', legion: LegionFaction.DarkAngels, expectedCountForLegion: 1 },
  { name: 'Paragon of Excellence', legion: LegionFaction.EmperorsChildren, expectedCountForLegion: 2 },
  { name: 'Stupefied Grandeur', legion: LegionFaction.EmperorsChildren, expectedCountForLegion: 2 },
  { name: 'Spiteful Demise', legion: LegionFaction.IronWarriors, expectedCountForLegion: 1 },
  { name: 'Path of the Warrior', legion: LegionFaction.WhiteScars, expectedCountForLegion: 1 },
  { name: 'Wolves of Fenris', legion: LegionFaction.SpaceWolves, expectedCountForLegion: 2 },
  { name: 'Saga of the Warrior', legion: LegionFaction.SpaceWolves, expectedCountForLegion: 2 },
  { name: 'A Wall Unyielding', legion: LegionFaction.ImperialFists, expectedCountForLegion: 1 },
  { name: 'Nostraman Courage', legion: LegionFaction.NightLords, expectedCountForLegion: 1 },
  { name: 'Thrall of the Red Thirst', legion: LegionFaction.BloodAngels, expectedCountForLegion: 1 },
  { name: 'Legion of One', legion: LegionFaction.IronHands, expectedCountForLegion: 1 },
  { name: 'Violent Overkill', legion: LegionFaction.WorldEaters, expectedCountForLegion: 2 },
  { name: 'Skull Trophy', legion: LegionFaction.WorldEaters, expectedCountForLegion: 2 },
  { name: 'Aegis of Wisdom', legion: LegionFaction.Ultramarines, expectedCountForLegion: 1 },
  { name: 'Steadfast Resilience', legion: LegionFaction.DeathGuard, expectedCountForLegion: 1 },
  { name: 'Prophetic Duellist', legion: LegionFaction.ThousandSons, expectedCountForLegion: 1 },
  { name: 'Merciless Strike', legion: LegionFaction.SonsOfHorus, expectedCountForLegion: 1 },
  { name: 'Beseech the Gods', legion: LegionFaction.WordBearers, expectedCountForLegion: 1 },
  { name: 'Duty is Sacrifice', legion: LegionFaction.Salamanders, expectedCountForLegion: 1 },
  { name: 'Decapitation Strike', legion: LegionFaction.RavenGuard, expectedCountForLegion: 1 },
  { name: 'I Am Alpharius', legion: LegionFaction.AlphaLegion, expectedCountForLegion: 1 },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Gambit Integration: Legion Gambits + Core Gambit Handler', () => {
  beforeEach(() => {
    clearLegionGambitRegistry();
    registerAllLegionGambits();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Every legion's gambit appears in getAvailableGambits alongside 9 core
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAvailableGambits includes legion gambits alongside core', () => {
    it('returns exactly 9 core gambits when no legion is specified', () => {
      const gambits = getAvailableGambits();
      expect(gambits).toHaveLength(9);
      for (const core of ALL_CORE_GAMBIT_NAMES) {
        expect(gambits).toContain(core);
      }
    });

    it('returns 9 core + 1 legion gambit for single-gambit legions', () => {
      const singleGambitLegions = [
        LegionFaction.DarkAngels,
        LegionFaction.IronWarriors,
        LegionFaction.WhiteScars,
        LegionFaction.ImperialFists,
        LegionFaction.NightLords,
        LegionFaction.BloodAngels,
        LegionFaction.IronHands,
        LegionFaction.Ultramarines,
        LegionFaction.DeathGuard,
        LegionFaction.ThousandSons,
        LegionFaction.SonsOfHorus,
        LegionFaction.WordBearers,
        LegionFaction.Salamanders,
        LegionFaction.RavenGuard,
        LegionFaction.AlphaLegion,
      ];

      for (const legion of singleGambitLegions) {
        const gambits = getAvailableGambits(legion);
        expect(gambits).toHaveLength(10);
      }
    });

    it('returns 9 core + 2 legion gambits for Space Wolves', () => {
      const gambits = getAvailableGambits(LegionFaction.SpaceWolves);
      expect(gambits).toHaveLength(11);
      expect(gambits).toContain('Wolves of Fenris');
      expect(gambits).toContain('Saga of the Warrior');
    });

    it('returns 9 core + 2 legion gambits for Emperors Children (standard + Hereticus)', () => {
      const gambits = getAvailableGambits(LegionFaction.EmperorsChildren);
      expect(gambits).toHaveLength(11);
      expect(gambits).toContain('Paragon of Excellence');
      expect(gambits).toContain('Stupefied Grandeur');
    });

    it('returns 9 core + 2 legion gambits for World Eaters (standard + Hereticus)', () => {
      const gambits = getAvailableGambits(LegionFaction.WorldEaters);
      expect(gambits).toHaveLength(11);
      expect(gambits).toContain('Violent Overkill');
      expect(gambits).toContain('Skull Trophy');
    });

    it('every legion gambit appears in its own legion getAvailableGambits list', () => {
      for (const { name, legion } of ALL_LEGION_GAMBITS) {
        const gambits = getAvailableGambits(legion);
        expect(gambits).toContain(name);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. selectGambit works with legion gambits by name
  // ═══════════════════════════════════════════════════════════════════════════

  describe('selectGambit with legion gambits', () => {
    it('accepts any legion gambit name for the challenger', () => {
      for (const { name } of ALL_LEGION_GAMBITS) {
        const state = makeBaseChallengeState();
        const result = selectGambit('challenger-m1', name, state);
        expect(result.challengeState.challengerGambit).toBe(name);
        expect(result.events).toHaveLength(1);
        expect(result.events[0]).toEqual({
          type: 'gambitSelected',
          modelId: 'challenger-m1',
          gambit: name,
        });
      }
    });

    it('accepts a legion gambit name for the challenged model', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenged-m1', 'Merciless Strike', state);
      expect(result.challengeState.challengedGambit).toBe('Merciless Strike');
      expect(result.events).toHaveLength(1);
    });

    it('rejects an unknown gambit name that is not core or legion', () => {
      const state = makeBaseChallengeState();
      const result = selectGambit('challenger-m1', 'Nonexistent Gambit', state);
      expect(result.challengeState.challengerGambit).toBeNull();
      expect(result.events).toHaveLength(0);
    });

    it('allows one player to select core and the other legion', () => {
      let state = makeBaseChallengeState();
      const result1 = selectGambit('challenger-m1', ChallengeGambit.Guard, state);
      state = result1.challengeState;
      const result2 = selectGambit('challenged-m1', 'Violent Overkill', state);
      state = result2.challengeState;

      expect(state.challengerGambit).toBe(ChallengeGambit.Guard);
      expect(state.challengedGambit).toBe('Violent Overkill');
    });

    it('allows both players to select different legion gambits', () => {
      let state = makeBaseChallengeState();
      const result1 = selectGambit('challenger-m1', 'Paragon of Excellence', state);
      state = result1.challengeState;
      const result2 = selectGambit('challenged-m1', 'A Wall Unyielding', state);
      state = result2.challengeState;

      expect(state.challengerGambit).toBe('Paragon of Excellence');
      expect(state.challengedGambit).toBe('A Wall Unyielding');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. getGambitEffect falls through to legion registry
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getGambitEffect falls through to legion registry', () => {
    it('returns core gambit effect for core gambit names', () => {
      for (const core of ALL_CORE_GAMBIT_NAMES) {
        const effect = getGambitEffect(core);
        expect(effect).toBeDefined();
        expect(effect).not.toBeNull();
        expect(effect!.name).toBe(core);
      }
    });

    it('returns legion gambit effect when core does not have it', () => {
      const effect = getGambitEffect('Sword of the Order');
      expect(effect).toBeDefined();
      expect(effect).not.toBeNull();
      expect(effect!.name).toBe('Sword of the Order');
    });

    it('falls through for every registered legion gambit', () => {
      for (const { name } of ALL_LEGION_GAMBITS) {
        const effect = getGambitEffect(name);
        expect(effect).toBeDefined();
        expect(effect).not.toBeNull();
        expect(effect!.name).toBe(name);
      }
    });

    it('returns null for names that are neither core nor legion', () => {
      expect(getGambitEffect('Totally Made Up')).toBeNull();
      expect(getGambitEffect('')).toBeNull();
    });

    it('core gambit takes precedence over any hypothetical legion gambit with the same name', () => {
      // Verify by ensuring the GAMBIT_EFFECTS lookup is tried first
      const coreEffect = GAMBIT_EFFECTS[ChallengeGambit.Guard];
      const retrieved = getGambitEffect(ChallengeGambit.Guard);
      expect(retrieved).toBe(coreEffect);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Focus roll mechanics with legion-specific modifiers
  // ═══════════════════════════════════════════════════════════════════════════

  describe('focus roll mechanics with legion gambits', () => {
    it('EC Paragon of Excellence adds +2 to focus roll total', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Paragon of Excellence',
        challengedGambit: ChallengeGambit.Guard,
      });

      // Challenger rolls 3, challenged rolls 3, both CI=4
      // Challenger: 3 + 4 (CI) + 2 (Paragon) = 9
      // Challenged: 3 + 4 (CI) = 7
      const dice = new FixedDiceProvider([3, 3]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(9);
      expect(result.challengeState.focusRolls![1]).toBe(7);
      expect(result.advantagePlayerIndex).toBe(0);
    });

    it('IF A Wall Unyielding excludes Combat Initiative from focus roll', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'A Wall Unyielding',
        challengedGambit: null,
      });

      // Challenger rolls 5, CI excluded -> 5 + 0 = 5
      // Challenged rolls 3, CI = 4 -> 3 + 4 = 7
      const dice = new FixedDiceProvider([5, 3]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(5);
      expect(result.challengeState.focusRolls![1]).toBe(7);
      expect(result.advantagePlayerIndex).toBe(1);
    });

    it('standard legion gambit with no focus modifier does not alter roll', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Spiteful Demise',
        challengedGambit: null,
      });

      // Both roll 4, both CI=4, no focus modifiers
      const dice = new FixedDiceProvider([4, 4]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(8);
      expect(result.challengeState.focusRolls![1]).toBe(8);
      expect(result.needsReroll).toBe(true);
    });

    it('both players using different legion gambits with focus effects', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Paragon of Excellence', // +2 focus modifier
        challengedGambit: 'A Wall Unyielding', // excludes CI
      });

      // Challenger rolls 3: 3 + 4 (CI) + 2 (Paragon) = 9
      // Challenged rolls 6: 6 + 0 (CI excluded) = 6
      const dice = new FixedDiceProvider([3, 6]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(9);
      expect(result.challengeState.focusRolls![1]).toBe(6);
      expect(result.advantagePlayerIndex).toBe(0);
    });

    it('Guard Up bonus from previous round stacks with legion focus modifier', () => {
      const state = makeBaseChallengeState({
        challengerGambit: 'Paragon of Excellence',
        challengedGambit: null,
        guardUpFocusBonus: { 0: 2 }, // +2 from Guard Up
      });

      // Challenger rolls 3: 3 + 4 (CI) + 2 (Paragon) + 2 (Guard Up) = 11
      // Challenged rolls 6: 6 + 4 = 10
      const dice = new FixedDiceProvider([3, 6]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(11);
      expect(result.challengeState.focusRolls![1]).toBe(10);
      expect(result.advantagePlayerIndex).toBe(0);
    });

    it('core gambit with extraFocusDie works alongside challenged legion gambit', () => {
      const state = makeBaseChallengeState({
        challengerGambit: ChallengeGambit.SeizeTheInitiative,
        challengedGambit: 'Violent Overkill',
      });

      // Seize: rolls 2d6, keeps highest: [6, 2] -> 6
      // Violent Overkill: standard roll: 4
      const dice = new FixedDiceProvider([6, 2, 4]);
      const result = resolveFocusRoll(state, dice, 4, 4, 0, 1);

      expect(result.challengeState.focusRolls![0]).toBe(10); // 6 + 4
      expect(result.challengeState.focusRolls![1]).toBe(8);  // 4 + 4
      expect(result.advantagePlayerIndex).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Cross-reference all 21 gambits: correct GambitEffect fields
  // ═══════════════════════════════════════════════════════════════════════════

  describe('all 21 gambits have correct GambitEffect fields', () => {
    it('DA Sword of the Order: attacksModifier mapped to wsModifier=0, blocksOpponentGambit=false', () => {
      const effect = getGambitEffect('Sword of the Order')!;
      expect(effect.name).toBe('Sword of the Order');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.discardDie).toBeNull();
      expect(effect.wsModifier).toBe(0);
      expect(effect.fixedAttacks).toBe(0);
      expect(effect.bonusAttacksRoll).toBeNull();
      expect(effect.strengthModifier).toBe(0);
      expect(effect.damageModifier).toBe(0);
      expect(effect.blocksOpponentGambit).toBe(false);
      expect(effect.firstChooserOnly).toBe(false);
    });

    it('EC Paragon of Excellence: firstChooserOnly=true', () => {
      const effect = getGambitEffect('Paragon of Excellence')!;
      expect(effect.firstChooserOnly).toBe(true);
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.wsModifier).toBe(0);
      expect(effect.blocksOpponentGambit).toBe(false);
    });

    it('IW Spiteful Demise: all standard GambitEffect fields at defaults', () => {
      const effect = getGambitEffect('Spiteful Demise')!;
      expect(effect.name).toBe('Spiteful Demise');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.discardDie).toBeNull();
      expect(effect.wsModifier).toBe(0);
      expect(effect.fixedAttacks).toBe(0);
      expect(effect.strengthModifier).toBe(0);
      expect(effect.damageModifier).toBe(0);
      expect(effect.firstChooserOnly).toBe(false);
      expect(effect.blocksOpponentGambit).toBe(false);
      expect(effect.allowsWithdraw).toBe(false);
    });

    it('WS Path of the Warrior: standard defaults', () => {
      const effect = getGambitEffect('Path of the Warrior')!;
      expect(effect.name).toBe('Path of the Warrior');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.firstChooserOnly).toBe(false);
    });

    it('SW Wolves of Fenris: preventGloryChoice does not affect GambitEffect fields', () => {
      const effect = getGambitEffect('Wolves of Fenris')!;
      expect(effect.name).toBe('Wolves of Fenris');
      expect(effect.blocksOpponentGambit).toBe(false);
      expect(effect.allowsWithdraw).toBe(false);
    });

    it('SW Saga of the Warrior: standard defaults', () => {
      const effect = getGambitEffect('Saga of the Warrior')!;
      expect(effect.name).toBe('Saga of the Warrior');
      expect(effect.fixedAttacks).toBe(0);
      expect(effect.strengthModifier).toBe(0);
    });

    it('IF A Wall Unyielding: standard GambitEffect defaults (CI exclusion is extended)', () => {
      const effect = getGambitEffect('A Wall Unyielding')!;
      expect(effect.name).toBe('A Wall Unyielding');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.wsModifier).toBe(0);
      expect(effect.blocksOpponentGambit).toBe(false);
    });

    it('NL Nostraman Courage: allowsWithdraw=false since canEndChallengeNoCRP is not set', () => {
      const effect = getGambitEffect('Nostraman Courage')!;
      expect(effect.name).toBe('Nostraman Courage');
      expect(effect.allowsWithdraw).toBe(false);
    });

    it('BA Thrall of Red Thirst: damageModifier=1, blocksOutsideSupportFocus=true', () => {
      const effect = getGambitEffect('Thrall of the Red Thirst')!;
      expect(effect.name).toBe('Thrall of the Red Thirst');
      expect(effect.damageModifier).toBe(1);
      expect(effect.blocksOutsideSupportFocus).toBe(true);
    });

    it('IH Legion of One: standard GambitEffect defaults (support mods are extended)', () => {
      const effect = getGambitEffect('Legion of One')!;
      expect(effect.name).toBe('Legion of One');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.strengthModifier).toBe(0);
    });

    it('WE Violent Overkill: standard defaults (excess wounds is extended)', () => {
      const effect = getGambitEffect('Violent Overkill')!;
      expect(effect.name).toBe('Violent Overkill');
      expect(effect.strengthModifier).toBe(0);
      expect(effect.damageModifier).toBe(0);
    });

    it('WE-H Skull Trophy: standard defaults (CRP on kill is extended)', () => {
      const effect = getGambitEffect('Skull Trophy')!;
      expect(effect.name).toBe('Skull Trophy');
      expect(effect.crpBonusPerSelection).toBe(0);
    });

    it('UM Aegis of Wisdom: blocksOutsideSupportFocus=true', () => {
      const effect = getGambitEffect('Aegis of Wisdom')!;
      expect(effect.name).toBe('Aegis of Wisdom');
      expect(effect.blocksOutsideSupportFocus).toBe(true);
    });

    it('DG Steadfast Resilience: all standard defaults', () => {
      const effect = getGambitEffect('Steadfast Resilience')!;
      expect(effect.name).toBe('Steadfast Resilience');
      expect(effect.strengthModifier).toBe(0);
      expect(effect.damageModifier).toBe(0);
    });

    it('TS Prophetic Duellist: all standard defaults (WP replace is extended)', () => {
      const effect = getGambitEffect('Prophetic Duellist')!;
      expect(effect.name).toBe('Prophetic Duellist');
      expect(effect.extraFocusDie).toBe(false);
    });

    it('SoH Merciless Strike: firstChooserOnly=true', () => {
      const effect = getGambitEffect('Merciless Strike')!;
      expect(effect.name).toBe('Merciless Strike');
      expect(effect.firstChooserOnly).toBe(true);
    });

    it('WB Beseech the Gods: firstChooserOnly=true', () => {
      const effect = getGambitEffect('Beseech the Gods')!;
      expect(effect.name).toBe('Beseech the Gods');
      expect(effect.firstChooserOnly).toBe(true);
    });

    it('Sal Duty is Sacrifice: all standard defaults (self-damage is extended)', () => {
      const effect = getGambitEffect('Duty is Sacrifice')!;
      expect(effect.name).toBe('Duty is Sacrifice');
      expect(effect.wsModifier).toBe(0);
      expect(effect.strengthModifier).toBe(0);
    });

    it('RG Decapitation Strike: all standard defaults (test attack is extended)', () => {
      const effect = getGambitEffect('Decapitation Strike')!;
      expect(effect.name).toBe('Decapitation Strike');
      expect(effect.fixedAttacks).toBe(0);
      expect(effect.extraFocusDie).toBe(false);
    });

    it('AL I Am Alpharius: firstChooserOnly=true', () => {
      const effect = getGambitEffect('I Am Alpharius')!;
      expect(effect.name).toBe('I Am Alpharius');
      expect(effect.firstChooserOnly).toBe(true);
    });

    it('EC-H Stupefied Grandeur: standard defaults', () => {
      const effect = getGambitEffect('Stupefied Grandeur')!;
      expect(effect.name).toBe('Stupefied Grandeur');
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.firstChooserOnly).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Core + legion coexistence: no duplication
  // ═══════════════════════════════════════════════════════════════════════════

  describe('core + legion coexistence', () => {
    it('core gambits are never duplicated in getAvailableGambits with any legion', () => {
      const allLegions: LegionFaction[] = [
        LegionFaction.DarkAngels,
        LegionFaction.EmperorsChildren,
        LegionFaction.IronWarriors,
        LegionFaction.WhiteScars,
        LegionFaction.SpaceWolves,
        LegionFaction.ImperialFists,
        LegionFaction.NightLords,
        LegionFaction.BloodAngels,
        LegionFaction.IronHands,
        LegionFaction.WorldEaters,
        LegionFaction.Ultramarines,
        LegionFaction.DeathGuard,
        LegionFaction.ThousandSons,
        LegionFaction.SonsOfHorus,
        LegionFaction.WordBearers,
        LegionFaction.Salamanders,
        LegionFaction.RavenGuard,
        LegionFaction.AlphaLegion,
      ];

      for (const legion of allLegions) {
        const gambits = getAvailableGambits(legion);
        const uniqueGambits = new Set(gambits);
        expect(uniqueGambits.size).toBe(gambits.length);
      }
    });

    it('no legion gambit name collides with a core gambit name', () => {
      const coreNames = new Set(ALL_CORE_GAMBIT_NAMES);
      const legionNames = getRegisteredLegionGambits();
      for (const legionName of legionNames) {
        expect(coreNames.has(legionName)).toBe(false);
      }
    });

    it('isLegionGambit returns false for all core gambits', () => {
      for (const core of ALL_CORE_GAMBIT_NAMES) {
        expect(isLegionGambit(core)).toBe(false);
      }
    });

    it('isLegionGambit returns true for all registered legion gambits', () => {
      for (const { name } of ALL_LEGION_GAMBITS) {
        expect(isLegionGambit(name)).toBe(true);
      }
    });

    it('total gambit count: 9 core + 21 legion = 30 distinct gambits', () => {
      const coreCount = Object.keys(GAMBIT_EFFECTS).length;
      const legionCount = getRegisteredLegionGambits().length;
      expect(coreCount).toBe(9);
      expect(legionCount).toBe(21);
      expect(coreCount + legionCount).toBe(30);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Extended properties accessible for correct gambits
  // ═══════════════════════════════════════════════════════════════════════════

  describe('extended legion gambit properties', () => {
    it('getLegionGambitFocusModifier: EC Paragon returns +2, others return 0', () => {
      expect(getLegionGambitFocusModifier('Paragon of Excellence')).toBe(2);
      expect(getLegionGambitFocusModifier('Sword of the Order')).toBe(0);
      expect(getLegionGambitFocusModifier('Violent Overkill')).toBe(0);
      expect(getLegionGambitFocusModifier('nonexistent')).toBe(0);
    });

    it('doesGambitExcludeCombatInitiative: only IF A Wall Unyielding returns true', () => {
      expect(doesGambitExcludeCombatInitiative('A Wall Unyielding')).toBe(true);
      expect(doesGambitExcludeCombatInitiative('Paragon of Excellence')).toBe(false);
      expect(doesGambitExcludeCombatInitiative('Violent Overkill')).toBe(false);
    });

    it('getGambitOnDeathAutoHit: IW Spiteful Demise has S6 AP4 D2 Breaching(5+)', () => {
      const autoHit = getGambitOnDeathAutoHit('Spiteful Demise');
      expect(autoHit).toBeDefined();
      expect(autoHit!.strength).toBe(6);
      expect(autoHit!.ap).toBe(4);
      expect(autoHit!.damage).toBe(2);
      expect(autoHit!.specialRules).toEqual([{ name: 'Breaching', value: '5+' }]);
    });

    it('getGambitOnDeathAutoHit: returns undefined for gambits without on-death mechanic', () => {
      expect(getGambitOnDeathAutoHit('Sword of the Order')).toBeUndefined();
      expect(getGambitOnDeathAutoHit('Paragon of Excellence')).toBeUndefined();
    });

    it('doesGambitSpillExcessWounds: only WE Violent Overkill returns true', () => {
      expect(doesGambitSpillExcessWounds('Violent Overkill')).toBe(true);
      expect(doesGambitSpillExcessWounds('Skull Trophy')).toBe(false);
      expect(doesGambitSpillExcessWounds('Sword of the Order')).toBe(false);
    });

    it('getGambitTraitEffect: SoH Merciless Strike grants Phage(T)', () => {
      const trait = getGambitTraitEffect('Merciless Strike');
      expect(trait).toBeDefined();
      expect(trait!.name).toBe('Phage');
      expect(trait!.value).toBe('T');
    });

    it('getGambitTraitEffect: returns undefined for gambits without trait effects', () => {
      expect(getGambitTraitEffect('Violent Overkill')).toBeUndefined();
      expect(getGambitTraitEffect('A Wall Unyielding')).toBeUndefined();
    });

    it('getGambitEternalWarrior: IF A Wall Unyielding grants Eternal Warrior 1', () => {
      expect(getGambitEternalWarrior('A Wall Unyielding')).toBe(1);
    });

    it('getGambitEternalWarrior: returns undefined for gambits without Eternal Warrior', () => {
      expect(getGambitEternalWarrior('Sword of the Order')).toBeUndefined();
      expect(getGambitEternalWarrior('Paragon of Excellence')).toBeUndefined();
    });

    it('getGambitSetEnemyCombatInitiative: AL I Am Alpharius sets to 1', () => {
      expect(getGambitSetEnemyCombatInitiative('I Am Alpharius')).toBe(1);
    });

    it('getGambitSetEnemyCombatInitiative: returns undefined for gambits without CI override', () => {
      expect(getGambitSetEnemyCombatInitiative('Sword of the Order')).toBeUndefined();
      expect(getGambitSetEnemyCombatInitiative('Violent Overkill')).toBeUndefined();
    });

    it('getGambitReplaceCharacteristic: TS Prophetic Duellist replaces with WP', () => {
      expect(getGambitReplaceCharacteristic('Prophetic Duellist')).toBe('WP');
    });

    it('getGambitReplaceCharacteristic: returns undefined for gambits without replacement', () => {
      expect(getGambitReplaceCharacteristic('A Wall Unyielding')).toBeUndefined();
      expect(getGambitReplaceCharacteristic('Paragon of Excellence')).toBeUndefined();
    });
  });
});
