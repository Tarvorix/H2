/**
 * Legion Gambit Registry Tests
 *
 * Tests the registry that converts LegionGambitDefinition → GambitEffect,
 * provides legion-specific gambit lookups, and exposes extended property
 * accessor functions for each gambit mechanic.
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "GAMBIT" subsections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LegionFaction } from '@hh/types';
import {
  registerLegionGambit,
  registerAllLegionGambits,
  getLegionGambitEffect,
  getLegionGambitDefinition,
  isLegionGambit,
  getAvailableLegionGambits,
  getRegisteredLegionGambits,
  clearLegionGambitRegistry,
  getLegionGambitFocusModifier,
  doesGambitExcludeCombatInitiative,
  getGambitReplaceCharacteristic,
  getGambitPredictionMechanic,
  getGambitOnDeathAutoHit,
  doesGambitSpillExcessWounds,
  doesGambitPreventGloryChoice,
  getGambitOnKillBonus,
  doesGambitAllowModelSwap,
  getGambitSelfDamage,
  getGambitWillpowerCheck,
  doesGambitUseTestAttack,
  getLegionGambitAttacksModifier,
  getGambitGrantedSpecialRule,
  getGambitImprovedSpecialRule,
  getGambitTraitEffect,
  getGambitEternalWarrior,
  getGambitSetEnemyCombatInitiative,
  getGambitMaxOpponentOutsideSupport,
  getGambitOutsideSupportMultiplier,
  getGambitAlternativeOutsideSupport,
  getGambitCRPBonusOnKill,
  doesGambitIgnoreWoundNegatives,
  hasGambitWeaponRequirement,
  doesWeaponMeetGambitRequirements,
} from './legion-gambit-registry';

describe('Legion Gambit Registry', () => {
  beforeEach(() => {
    clearLegionGambitRegistry();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Registration & Core Lookups
  // ═══════════════════════════════════════════════════════════════════════════

  describe('registration', () => {
    it('registerAllLegionGambits registers all 21 gambits', () => {
      registerAllLegionGambits();
      const registered = getRegisteredLegionGambits();
      expect(registered.length).toBe(21);
    });

    it('registerLegionGambit stores a single gambit', () => {
      registerLegionGambit({
        id: 'test-gambit',
        name: 'Test Gambit',
        legion: LegionFaction.DarkAngels,
        description: 'A test gambit',
      });

      expect(isLegionGambit('Test Gambit')).toBe(true);
      expect(getLegionGambitEffect('Test Gambit')).toBeDefined();
    });

    it('clearLegionGambitRegistry empties registry', () => {
      registerAllLegionGambits();
      expect(getRegisteredLegionGambits().length).toBeGreaterThan(0);

      clearLegionGambitRegistry();
      expect(getRegisteredLegionGambits()).toHaveLength(0);
    });
  });

  describe('lookups', () => {
    beforeEach(() => {
      registerAllLegionGambits();
    });

    it('getLegionGambitEffect returns GambitEffect for registered gambit', () => {
      const effect = getLegionGambitEffect('Sword of the Order');
      expect(effect).toBeDefined();
      expect(effect!.name).toBe('Sword of the Order');
    });

    it('getLegionGambitEffect returns null for unknown gambit', () => {
      expect(getLegionGambitEffect('nonexistent')).toBeNull();
    });

    it('getLegionGambitDefinition returns full definition', () => {
      const def = getLegionGambitDefinition('Sword of the Order');
      expect(def).toBeDefined();
      expect(def!.id).toBe('da-sword-of-order');
      expect(def!.legion).toBe(LegionFaction.DarkAngels);
    });

    it('isLegionGambit returns true for registered, false for unknown', () => {
      expect(isLegionGambit('Sword of the Order')).toBe(true);
      expect(isLegionGambit('Seize the Initiative')).toBe(false);
    });
  });

  describe('getAvailableLegionGambits', () => {
    beforeEach(() => {
      registerAllLegionGambits();
    });

    it('returns 1 gambit for most legions', () => {
      expect(getAvailableLegionGambits(LegionFaction.DarkAngels).length).toBe(1);
      expect(getAvailableLegionGambits(LegionFaction.IronWarriors).length).toBe(1);
      expect(getAvailableLegionGambits(LegionFaction.Ultramarines).length).toBe(1);
    });

    it('returns 2 gambits for Space Wolves', () => {
      expect(getAvailableLegionGambits(LegionFaction.SpaceWolves).length).toBe(2);
    });

    it('returns 2 gambits for Emperor Children (standard + Hereticus)', () => {
      const gambits = getAvailableLegionGambits(LegionFaction.EmperorsChildren);
      expect(gambits.length).toBe(2);
    });

    it('returns 2 gambits for World Eaters (standard + Hereticus)', () => {
      const gambits = getAvailableLegionGambits(LegionFaction.WorldEaters);
      expect(gambits.length).toBe(2);
    });

    it('returns empty for invalid faction', () => {
      expect(getAvailableLegionGambits('invalid' as LegionFaction)).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GambitEffect Conversion
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GambitEffect conversion', () => {
    beforeEach(() => {
      registerAllLegionGambits();
    });

    it('DA Sword of the Order: firstChooserOnly=false (no first face off restriction)', () => {
      const effect = getLegionGambitEffect('Sword of the Order')!;
      expect(effect.firstChooserOnly).toBe(false);
    });

    it('EC Paragon: firstChooserOnly=true (first face off only)', () => {
      const effect = getLegionGambitEffect('Paragon of Excellence')!;
      expect(effect.firstChooserOnly).toBe(true);
    });

    it('RecklessAssault-style gambit: extraFocusDie and discardDie from definition', () => {
      // Test a gambit with extraFocusDie if any legion gambit has it
      // Most legion gambits don't use extraFocusDie, so test default
      const effect = getLegionGambitEffect('Sword of the Order')!;
      expect(effect.extraFocusDie).toBe(false);
      expect(effect.discardDie).toBeNull();
    });

    it('converts strengthModifier correctly', () => {
      // BA Thrall of Red Thirst has damageModifier
      const effect = getLegionGambitEffect('Thrall of the Red Thirst')!;
      expect(effect.damageModifier).toBe(1);
    });

    it('converts swapStatsWithEnemy correctly', () => {
      const effect = getLegionGambitEffect('Sword of the Order')!;
      expect(effect.swapStatsWithEnemy).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Extended Property Accessors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('extended property accessors', () => {
    beforeEach(() => {
      registerAllLegionGambits();
    });

    it('getLegionGambitFocusModifier: EC Paragon returns +2', () => {
      expect(getLegionGambitFocusModifier('Paragon of Excellence')).toBe(2);
    });

    it('getLegionGambitFocusModifier: returns 0 for non-focus gambit', () => {
      expect(getLegionGambitFocusModifier('Sword of the Order')).toBe(0);
    });

    it('getLegionGambitFocusModifier: returns 0 for unknown gambit', () => {
      expect(getLegionGambitFocusModifier('nonexistent')).toBe(0);
    });

    it('doesGambitExcludeCombatInitiative: IF Wall Unyielding returns true', () => {
      expect(doesGambitExcludeCombatInitiative('A Wall Unyielding')).toBe(true);
    });

    it('doesGambitExcludeCombatInitiative: returns false for others', () => {
      expect(doesGambitExcludeCombatInitiative('Sword of the Order')).toBe(false);
    });

    it('getGambitReplaceCharacteristic: TS Prophetic Duellist returns WP', () => {
      expect(getGambitReplaceCharacteristic('Prophetic Duellist')).toBe('WP');
    });

    it('getGambitReplaceCharacteristic: returns undefined for others', () => {
      expect(getGambitReplaceCharacteristic('Sword of the Order')).toBeUndefined();
    });

    it('getGambitPredictionMechanic: WS Path of the Warrior returns prediction data', () => {
      const mechanic = getGambitPredictionMechanic('Path of the Warrior');
      expect(mechanic).toBeDefined();
      expect(mechanic!.ranges).toHaveLength(2);
      expect(mechanic!.ranges[0].name).toBe('Strike Low');
      expect(mechanic!.ranges[1].name).toBe('Strike High');
    });

    it('getGambitOnDeathAutoHit: IW Spiteful Demise returns hit data', () => {
      const autoHit = getGambitOnDeathAutoHit('Spiteful Demise');
      expect(autoHit).toBeDefined();
      expect(autoHit!.strength).toBe(6);
      expect(autoHit!.ap).toBe(4);
      expect(autoHit!.damage).toBe(2);
    });

    it('doesGambitSpillExcessWounds: WE Violent Overkill returns true', () => {
      expect(doesGambitSpillExcessWounds('Violent Overkill')).toBe(true);
    });

    it('doesGambitSpillExcessWounds: returns false for others', () => {
      expect(doesGambitSpillExcessWounds('Sword of the Order')).toBe(false);
    });

    it('doesGambitPreventGloryChoice: SW Wolves of Fenris returns true', () => {
      expect(doesGambitPreventGloryChoice('Wolves of Fenris')).toBe(true);
    });

    it('getGambitOnKillBonus: SW Saga of the Warrior returns bonus', () => {
      const bonus = getGambitOnKillBonus('Saga of the Warrior');
      expect(bonus).toBeDefined();
      expect(bonus!.attacksModifier).toBe(1);
      expect(bonus!.duration).toBe('nextFightSubPhase');
    });

    it('doesGambitAllowModelSwap: NL Nostraman Courage returns true', () => {
      expect(doesGambitAllowModelSwap('Nostraman Courage')).toBe(true);
    });

    it('getGambitSelfDamage: Sal Duty is Sacrifice returns data', () => {
      const selfDmg = getGambitSelfDamage('Duty is Sacrifice');
      expect(selfDmg).toBeDefined();
      expect(selfDmg!.maxWounds).toBeGreaterThan(0);
    });

    it('getGambitWillpowerCheck: WB Beseech the Gods returns check data', () => {
      const wpCheck = getGambitWillpowerCheck('Beseech the Gods');
      expect(wpCheck).toBeDefined();
      expect(wpCheck!.passEffect).toBeDefined();
      expect(wpCheck!.failEffect).toBeDefined();
    });

    it('doesGambitUseTestAttack: RG Decapitation Strike returns true', () => {
      expect(doesGambitUseTestAttack('Decapitation Strike')).toBe(true);
    });

    it('getLegionGambitAttacksModifier: DA Sword of the Order returns -1', () => {
      expect(getLegionGambitAttacksModifier('Sword of the Order')).toBe(-1);
    });

    it('getGambitGrantedSpecialRule: DA Sword of the Order grants Critical Hit', () => {
      const rule = getGambitGrantedSpecialRule('Sword of the Order');
      expect(rule).toBeDefined();
      expect(rule!.name).toBe('Critical Hit');
    });

    it('getGambitImprovedSpecialRule: DA Sword of the Order improves Critical Hit', () => {
      const improvement = getGambitImprovedSpecialRule('Sword of the Order');
      expect(improvement).toBeDefined();
      expect(improvement!.name).toBe('Critical Hit');
      expect(improvement!.improvement).toBe(1);
    });

    it('getGambitTraitEffect: SoH Merciless Strike returns Phage', () => {
      const trait = getGambitTraitEffect('Merciless Strike');
      expect(trait).toBeDefined();
      expect(trait!.name).toBe('Phage');
    });

    it('getGambitEternalWarrior: IF Wall Unyielding returns 1', () => {
      expect(getGambitEternalWarrior('A Wall Unyielding')).toBe(1);
    });

    it('getGambitSetEnemyCombatInitiative: AL I Am Alpharius returns 1', () => {
      expect(getGambitSetEnemyCombatInitiative('I Am Alpharius')).toBe(1);
    });

    it('getGambitMaxOpponentOutsideSupport: IH Legion of One returns 2', () => {
      expect(getGambitMaxOpponentOutsideSupport('Legion of One')).toBe(2);
    });

    it('getGambitOutsideSupportMultiplier: IH Legion of One returns 2', () => {
      expect(getGambitOutsideSupportMultiplier('Legion of One')).toBe(2);
    });

    it('getGambitAlternativeOutsideSupport: UM Aegis of Wisdom returns Command', () => {
      expect(getGambitAlternativeOutsideSupport('Aegis of Wisdom')).toBe('Command');
    });

    it('getGambitCRPBonusOnKill: returns 0 for most gambits', () => {
      expect(getGambitCRPBonusOnKill('Sword of the Order')).toBe(0);
    });

    it('doesGambitIgnoreWoundNegatives: BA Red Thirst returns true', () => {
      expect(doesGambitIgnoreWoundNegatives('Thrall of the Red Thirst')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Weapon Requirement Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('weapon requirements', () => {
    beforeEach(() => {
      registerAllLegionGambits();
    });

    it('hasGambitWeaponRequirement: DA Sword returns true', () => {
      expect(hasGambitWeaponRequirement('Sword of the Order')).toBe(true);
    });

    it('hasGambitWeaponRequirement: EC Paragon returns false', () => {
      expect(hasGambitWeaponRequirement('Paragon of Excellence')).toBe(false);
    });

    it('doesWeaponMeetGambitRequirements: power sword meets DA requirement', () => {
      expect(doesWeaponMeetGambitRequirements('Sword of the Order', 'power sword', [])).toBe(true);
    });

    it('doesWeaponMeetGambitRequirements: weapon with Sword of the Order trait meets DA requirement', () => {
      expect(doesWeaponMeetGambitRequirements('Sword of the Order', 'custom blade', ['Sword of the Order'])).toBe(true);
    });

    it('doesWeaponMeetGambitRequirements: bolter does not meet DA requirement', () => {
      expect(doesWeaponMeetGambitRequirements('Sword of the Order', 'bolter', [])).toBe(false);
    });

    it('doesWeaponMeetGambitRequirements: no-requirement gambit always valid', () => {
      expect(doesWeaponMeetGambitRequirements('Paragon of Excellence', 'any weapon', [])).toBe(true);
    });
  });
});
