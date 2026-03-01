/**
 * Assault Special Rules Registry — Tests
 *
 * Covers:
 *  1. Registry: register, get, has, clear, getRegisteredNames
 *  2. applyAssaultRules: empty result, single rule, multi-rule merge, additive fields
 *  3. Impact rule: charge attacks, characteristic parsing
 *  4. Reaping Blow rule: outnumbered, challenge exclusion
 *  5. Duellist's Edge rule: challenge bonus
 *  6. Detonation rule: vehicle restriction
 *  7. Hatred rule: wound roll bonus
 *  8. Fear rule: negative modifier
 *  9. Rending rule: threshold parsing, default
 * 10. Critical Hit rule: threshold and bonus damage
 * 11. Breaching rule: threshold and AP override
 * 12. Feel No Pain rule: damage mitigation threshold
 * 13. Poisoned rule: threshold, no vehicle effect
 * 14. Force rule: characteristic and WP check
 * 15. Shred rule: reroll failed wounds
 * 16. Precision rule: isPrecision
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineHook } from '@hh/types';
import type { SpecialRuleRef } from '@hh/types';
import {
  registerAssaultRule,
  getAssaultRule,
  hasAssaultRule,
  getRegisteredAssaultRuleNames,
  clearAssaultRegistry,
  applyAssaultRules,
  registerAllAssaultRules,
} from './assault-rules';
import type { AssaultRuleContext } from './assault-rules';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build an AssaultRuleContext for testing with sensible defaults.
 */
function createContext(overrides: Partial<AssaultRuleContext> = {}): AssaultRuleContext {
  return {
    ruleRef: { name: 'Test' },
    hook: PipelineHook.PreHit,
    isChargeAttack: false,
    isChallenge: false,
    isOutnumbered: false,
    friendlyModelCount: 5,
    enemyModelCount: 5,
    targetIsVehicle: false,
    targetIsImmobile: false,
    ...overrides,
  };
}

/**
 * Build the base context used by applyAssaultRules (omitting ruleRef and hook).
 */
function createBaseContext(
  overrides: Partial<Omit<AssaultRuleContext, 'ruleRef' | 'hook'>> = {},
): Omit<AssaultRuleContext, 'ruleRef' | 'hook'> {
  return {
    isChargeAttack: false,
    isChallenge: false,
    isOutnumbered: false,
    friendlyModelCount: 5,
    enemyModelCount: 5,
    targetIsVehicle: false,
    targetIsImmobile: false,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Assault Rules Registry', () => {
  beforeEach(() => {
    clearAssaultRegistry();
    registerAllAssaultRules();
  });

  // ── Registry Functions ───────────────────────────────────────────────────

  describe('registry functions', () => {
    beforeEach(() => {
      clearAssaultRegistry();
    });

    it('should register a handler and retrieve it with getAssaultRule', () => {
      const handler = () => ({ bonusAttacks: 1 });
      registerAssaultRule('TestRule', PipelineHook.PreHit, handler);
      const retrieved = getAssaultRule('TestRule', PipelineHook.PreHit);
      expect(retrieved).toBe(handler);
    });

    it('should return true from hasAssaultRule for registered rules', () => {
      registerAssaultRule('TestRule', PipelineHook.PreHit, () => ({}));
      expect(hasAssaultRule('TestRule', PipelineHook.PreHit)).toBe(true);
    });

    it('should return false from hasAssaultRule for unregistered rules', () => {
      expect(hasAssaultRule('Nonexistent', PipelineHook.PreHit)).toBe(false);
    });

    it('should return false from hasAssaultRule for wrong hook', () => {
      registerAssaultRule('TestRule', PipelineHook.PreHit, () => ({}));
      expect(hasAssaultRule('TestRule', PipelineHook.OnWound)).toBe(false);
    });

    it('should return all registered names from getRegisteredAssaultRuleNames', () => {
      registerAssaultRule('Alpha', PipelineHook.PreHit, () => ({}));
      registerAssaultRule('Beta', PipelineHook.OnHit, () => ({}));
      registerAssaultRule('Gamma', PipelineHook.OnWound, () => ({}));
      const names = getRegisteredAssaultRuleNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    });

    it('should remove all entries on clearAssaultRegistry', () => {
      registerAssaultRule('A', PipelineHook.PreHit, () => ({}));
      registerAssaultRule('B', PipelineHook.OnHit, () => ({}));
      clearAssaultRegistry();
      expect(getRegisteredAssaultRuleNames()).toHaveLength(0);
      expect(hasAssaultRule('A', PipelineHook.PreHit)).toBe(false);
      expect(hasAssaultRule('B', PipelineHook.OnHit)).toBe(false);
    });

    it('should be case-insensitive for lookup', () => {
      registerAssaultRule('Impact', PipelineHook.PreHit, () => ({ impactBonus: 1 }));
      expect(hasAssaultRule('impact', PipelineHook.PreHit)).toBe(true);
      expect(hasAssaultRule('IMPACT', PipelineHook.PreHit)).toBe(true);
      expect(getAssaultRule('impact', PipelineHook.PreHit)).toBeDefined();
    });

    it('should register all 14 rules with registerAllAssaultRules', () => {
      registerAllAssaultRules();
      const names = getRegisteredAssaultRuleNames();
      expect(names).toHaveLength(14);
      expect(names).toContain('impact');
      expect(names).toContain('reaping blow');
      expect(names).toContain("duellist's edge");
      expect(names).toContain('detonation');
      expect(names).toContain('hatred');
      expect(names).toContain('fear');
      expect(names).toContain('rending');
      expect(names).toContain('critical hit');
      expect(names).toContain('breaching');
      expect(names).toContain('feel no pain');
      expect(names).toContain('poisoned');
      expect(names).toContain('force');
      expect(names).toContain('shred');
      expect(names).toContain('precision');
    });
  });

  // ── applyAssaultRules ────────────────────────────────────────────────────

  describe('applyAssaultRules', () => {
    it('should return empty result when no matching rules', () => {
      const ruleRefs: SpecialRuleRef[] = [{ name: 'NonExistent' }];
      const result = applyAssaultRules(PipelineHook.PreHit, ruleRefs, createBaseContext());
      expect(result).toEqual({});
    });

    it('should return empty result for empty rule list', () => {
      const result = applyAssaultRules(PipelineHook.PreHit, [], createBaseContext());
      expect(result).toEqual({});
    });

    it('should apply single matching rule', () => {
      const ruleRefs: SpecialRuleRef[] = [{ name: 'Impact', value: 'S' }];
      const result = applyAssaultRules(
        PipelineHook.PreHit,
        ruleRefs,
        createBaseContext({ isChargeAttack: true }),
      );
      expect(result.impactCharacteristic).toBe('S');
      expect(result.impactBonus).toBe(1);
    });

    it('should merge results from multiple matching rules', () => {
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Impact', value: 'S' },
        { name: 'Fear', value: '2' },
      ];
      const result = applyAssaultRules(
        PipelineHook.PreHit,
        ruleRefs,
        createBaseContext({ isChargeAttack: true }),
      );
      expect(result.impactCharacteristic).toBe('S');
      expect(result.impactBonus).toBe(1);
      expect(result.fearModifier).toBe(-2);
    });

    it('should accumulate bonusDamage additively across rules', () => {
      clearAssaultRegistry();
      registerAssaultRule('DamageA', PipelineHook.OnWound, () => ({ bonusDamage: 1 }));
      registerAssaultRule('DamageB', PipelineHook.OnWound, () => ({ bonusDamage: 2 }));
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'DamageA' },
        { name: 'DamageB' },
      ];
      const result = applyAssaultRules(PipelineHook.OnWound, ruleRefs, createBaseContext());
      expect(result.bonusDamage).toBe(3);
    });

    it('should accumulate woundRollBonus additively across rules', () => {
      clearAssaultRegistry();
      registerAssaultRule('WoundA', PipelineHook.OnWound, () => ({ woundRollBonus: 1 }));
      registerAssaultRule('WoundB', PipelineHook.OnWound, () => ({ woundRollBonus: 2 }));
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'WoundA' },
        { name: 'WoundB' },
      ];
      const result = applyAssaultRules(PipelineHook.OnWound, ruleRefs, createBaseContext());
      expect(result.woundRollBonus).toBe(3);
    });

    it('should accumulate bonusAttacks additively across rules', () => {
      clearAssaultRegistry();
      registerAssaultRule('AttackA', PipelineHook.PreHit, () => ({ bonusAttacks: 2 }));
      registerAssaultRule('AttackB', PipelineHook.PreHit, () => ({ bonusAttacks: 3 }));
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'AttackA' },
        { name: 'AttackB' },
      ];
      const result = applyAssaultRules(PipelineHook.PreHit, ruleRefs, createBaseContext());
      expect(result.bonusAttacks).toBe(5);
    });

    it('should skip rules not registered at the given hook', () => {
      // Impact is at PreHit, not OnHit
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Impact', value: 'S' },
        { name: 'Rending', value: '5+' },
      ];
      const result = applyAssaultRules(
        PipelineHook.OnHit,
        ruleRefs,
        createBaseContext({ isChargeAttack: true }),
      );
      expect(result.impactCharacteristic).toBeUndefined();
      expect(result.rendingThreshold).toBe(5);
    });
  });

  // ── Impact Rule ──────────────────────────────────────────────────────────

  describe('Impact rule', () => {
    it('should return impactCharacteristic and impactBonus=1 on charge attack', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'S' },
        isChargeAttack: true,
      }));
      expect(result.impactCharacteristic).toBe('S');
      expect(result.impactBonus).toBe(1);
    });

    it('should return empty when not a charge attack', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'S' },
        isChargeAttack: false,
      }));
      expect(result).toEqual({});
    });

    it('should parse characteristic from ruleRef value (S)', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'S' },
        isChargeAttack: true,
      }));
      expect(result.impactCharacteristic).toBe('S');
    });

    it('should parse characteristic from ruleRef value (WS)', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'WS' },
        isChargeAttack: true,
      }));
      expect(result.impactCharacteristic).toBe('WS');
    });

    it('should parse characteristic from ruleRef value (T)', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'T' },
        isChargeAttack: true,
      }));
      expect(result.impactCharacteristic).toBe('T');
    });

    it('should return empty for invalid characteristic', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact', value: 'INVALID' },
        isChargeAttack: true,
      }));
      expect(result).toEqual({});
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Impact', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Impact' },
        isChargeAttack: true,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Reaping Blow Rule ────────────────────────────────────────────────────

  describe('Reaping Blow rule', () => {
    it('should return bonusAttacks=X when outnumbered', () => {
      const handler = getAssaultRule('Reaping Blow', PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Reaping Blow', value: '2' },
        isOutnumbered: true,
        isChallenge: false,
      }));
      expect(result.bonusAttacks).toBe(2);
    });

    it('should return empty when not outnumbered', () => {
      const handler = getAssaultRule('Reaping Blow', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Reaping Blow', value: '2' },
        isOutnumbered: false,
        isChallenge: false,
      }));
      expect(result).toEqual({});
    });

    it('should return empty during a challenge', () => {
      const handler = getAssaultRule('Reaping Blow', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Reaping Blow', value: '2' },
        isOutnumbered: true,
        isChallenge: true,
      }));
      expect(result).toEqual({});
    });

    it('should parse value from ruleRef', () => {
      const handler = getAssaultRule('Reaping Blow', PipelineHook.PreHit)!;
      const result3 = handler(createContext({
        ruleRef: { name: 'Reaping Blow', value: '3' },
        isOutnumbered: true,
      }));
      expect(result3.bonusAttacks).toBe(3);

      const result1 = handler(createContext({
        ruleRef: { name: 'Reaping Blow', value: '1' },
        isOutnumbered: true,
      }));
      expect(result1.bonusAttacks).toBe(1);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Reaping Blow', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Reaping Blow' },
        isOutnumbered: true,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Duellist's Edge Rule ─────────────────────────────────────────────────

  describe("Duellist's Edge rule", () => {
    it('should return focusRollBonus=X during challenge', () => {
      const handler = getAssaultRule("Duellist's Edge", PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: "Duellist's Edge", value: '1' },
        isChallenge: true,
      }));
      expect(result.focusRollBonus).toBe(1);
    });

    it('should return empty when not in challenge', () => {
      const handler = getAssaultRule("Duellist's Edge", PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: "Duellist's Edge", value: '1' },
        isChallenge: false,
      }));
      expect(result).toEqual({});
    });

    it('should parse value from ruleRef', () => {
      const handler = getAssaultRule("Duellist's Edge", PipelineHook.PreHit)!;
      const result2 = handler(createContext({
        ruleRef: { name: "Duellist's Edge", value: '2' },
        isChallenge: true,
      }));
      expect(result2.focusRollBonus).toBe(2);

      const result3 = handler(createContext({
        ruleRef: { name: "Duellist's Edge", value: '3' },
        isChallenge: true,
      }));
      expect(result3.focusRollBonus).toBe(3);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule("Duellist's Edge", PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: "Duellist's Edge" },
        isChallenge: true,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Detonation Rule ──────────────────────────────────────────────────────

  describe('Detonation rule', () => {
    it('should return restrictedToVehicles when target is not vehicle or immobile', () => {
      const handler = getAssaultRule('Detonation', PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Detonation' },
        targetIsVehicle: false,
        targetIsImmobile: false,
      }));
      expect(result.restrictedToVehicles).toBe(true);
    });

    it('should return empty when target is vehicle', () => {
      const handler = getAssaultRule('Detonation', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Detonation' },
        targetIsVehicle: true,
        targetIsImmobile: false,
      }));
      expect(result).toEqual({});
    });

    it('should return empty when target is immobile', () => {
      const handler = getAssaultRule('Detonation', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Detonation' },
        targetIsVehicle: false,
        targetIsImmobile: true,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Hatred Rule ──────────────────────────────────────────────────────────

  describe('Hatred rule', () => {
    it('should return woundRollBonus=1 on OnWound hook', () => {
      const handler = getAssaultRule('Hatred', PipelineHook.OnWound)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Hatred' },
        hook: PipelineHook.OnWound,
      }));
      expect(result.woundRollBonus).toBe(1);
    });

    it('should always return woundRollBonus=1 regardless of context', () => {
      const handler = getAssaultRule('Hatred', PipelineHook.OnWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Hatred', value: 'Infantry' },
        hook: PipelineHook.OnWound,
        isChargeAttack: true,
        isChallenge: true,
      }));
      expect(result.woundRollBonus).toBe(1);
    });
  });

  // ── Fear Rule ────────────────────────────────────────────────────────────

  describe('Fear rule', () => {
    it('should return negative fearModifier based on value', () => {
      const handler = getAssaultRule('Fear', PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Fear', value: '2' },
      }));
      expect(result.fearModifier).toBe(-2);
    });

    it('should parse value from ruleRef', () => {
      const handler = getAssaultRule('Fear', PipelineHook.PreHit)!;
      const result1 = handler(createContext({
        ruleRef: { name: 'Fear', value: '1' },
      }));
      expect(result1.fearModifier).toBe(-1);

      const result3 = handler(createContext({
        ruleRef: { name: 'Fear', value: '3' },
      }));
      expect(result3.fearModifier).toBe(-3);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Fear', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Fear' },
      }));
      expect(result).toEqual({});
    });
  });

  // ── Rending Rule ─────────────────────────────────────────────────────────

  describe('Rending rule', () => {
    it('should return rendingThreshold from value', () => {
      const handler = getAssaultRule('Rending', PipelineHook.OnHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Rending', value: '5+' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.rendingThreshold).toBe(5);
    });

    it('should default to 6 when no value', () => {
      const handler = getAssaultRule('Rending', PipelineHook.OnHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Rending' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.rendingThreshold).toBe(6);
    });

    it('should parse different threshold values', () => {
      const handler = getAssaultRule('Rending', PipelineHook.OnHit)!;
      const result4 = handler(createContext({
        ruleRef: { name: 'Rending', value: '4+' },
        hook: PipelineHook.OnHit,
      }));
      expect(result4.rendingThreshold).toBe(4);
    });
  });

  // ── Critical Hit Rule ────────────────────────────────────────────────────

  describe('Critical Hit rule', () => {
    it('should return criticalHitThreshold and criticalBonusDamage=1', () => {
      const handler = getAssaultRule('Critical Hit', PipelineHook.OnHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Critical Hit', value: '5+' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.criticalHitThreshold).toBe(5);
      expect(result.criticalBonusDamage).toBe(1);
    });

    it('should default to threshold 6 when no value', () => {
      const handler = getAssaultRule('Critical Hit', PipelineHook.OnHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Critical Hit' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.criticalHitThreshold).toBe(6);
      expect(result.criticalBonusDamage).toBe(1);
    });

    it('should parse different threshold values', () => {
      const handler = getAssaultRule('Critical Hit', PipelineHook.OnHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Critical Hit', value: '4+' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.criticalHitThreshold).toBe(4);
      expect(result.criticalBonusDamage).toBe(1);
    });
  });

  // ── Breaching Rule ───────────────────────────────────────────────────────

  describe('Breaching rule', () => {
    it('should return breachingThreshold and overrideAP=2', () => {
      const handler = getAssaultRule('Breaching', PipelineHook.OnWound)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Breaching', value: '4+' },
        hook: PipelineHook.OnWound,
      }));
      expect(result.breachingThreshold).toBe(4);
      expect(result.overrideAP).toBe(2);
    });

    it('should parse different threshold values', () => {
      const handler = getAssaultRule('Breaching', PipelineHook.OnWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Breaching', value: '6+' },
        hook: PipelineHook.OnWound,
      }));
      expect(result.breachingThreshold).toBe(6);
      expect(result.overrideAP).toBe(2);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Breaching', PipelineHook.OnWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Breaching' },
        hook: PipelineHook.OnWound,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Feel No Pain Rule ────────────────────────────────────────────────────

  describe('Feel No Pain rule', () => {
    it('should return damageMitigationThreshold from value', () => {
      const handler = getAssaultRule('Feel No Pain', PipelineHook.PreDamage)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Feel No Pain', value: '5+' },
        hook: PipelineHook.PreDamage,
      }));
      expect(result.damageMitigationThreshold).toBe(5);
    });

    it('should parse different threshold values', () => {
      const handler = getAssaultRule('Feel No Pain', PipelineHook.PreDamage)!;
      const result = handler(createContext({
        ruleRef: { name: 'Feel No Pain', value: '4+' },
        hook: PipelineHook.PreDamage,
      }));
      expect(result.damageMitigationThreshold).toBe(4);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Feel No Pain', PipelineHook.PreDamage)!;
      const result = handler(createContext({
        ruleRef: { name: 'Feel No Pain' },
        hook: PipelineHook.PreDamage,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Poisoned Rule ────────────────────────────────────────────────────────

  describe('Poisoned rule', () => {
    it('should return poisonedThreshold and poisonedAffectsVehicles=false', () => {
      const handler = getAssaultRule('Poisoned', PipelineHook.PreWound)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Poisoned', value: '4+' },
        hook: PipelineHook.PreWound,
      }));
      expect(result.poisonedThreshold).toBe(4);
      expect(result.poisonedAffectsVehicles).toBe(false);
    });

    it('should parse different threshold values', () => {
      const handler = getAssaultRule('Poisoned', PipelineHook.PreWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Poisoned', value: '3+' },
        hook: PipelineHook.PreWound,
      }));
      expect(result.poisonedThreshold).toBe(3);
      expect(result.poisonedAffectsVehicles).toBe(false);
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Poisoned', PipelineHook.PreWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Poisoned' },
        hook: PipelineHook.PreWound,
      }));
      expect(result).toEqual({});
    });
  });

  // ── Force Rule ───────────────────────────────────────────────────────────

  describe('Force rule', () => {
    it('should return forceCharacteristic and forceRequiresWPCheck=true', () => {
      const handler = getAssaultRule('Force', PipelineHook.PreHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Force', value: 'S' },
      }));
      expect(result.forceCharacteristic).toBe('S');
      expect(result.forceRequiresWPCheck).toBe(true);
    });

    it('should parse different characteristics', () => {
      const handler = getAssaultRule('Force', PipelineHook.PreHit)!;

      const resultWS = handler(createContext({
        ruleRef: { name: 'Force', value: 'WS' },
      }));
      expect(resultWS.forceCharacteristic).toBe('WS');
      expect(resultWS.forceRequiresWPCheck).toBe(true);

      const resultT = handler(createContext({
        ruleRef: { name: 'Force', value: 'T' },
      }));
      expect(resultT.forceCharacteristic).toBe('T');
      expect(resultT.forceRequiresWPCheck).toBe(true);
    });

    it('should return empty for invalid characteristic', () => {
      const handler = getAssaultRule('Force', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Force', value: 'INVALID' },
      }));
      expect(result).toEqual({});
    });

    it('should return empty when no value is provided', () => {
      const handler = getAssaultRule('Force', PipelineHook.PreHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Force' },
      }));
      expect(result).toEqual({});
    });
  });

  // ── Shred Rule ───────────────────────────────────────────────────────────

  describe('Shred rule', () => {
    it('should return rerollFailedWounds=true', () => {
      const handler = getAssaultRule('Shred', PipelineHook.OnWound)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Shred' },
        hook: PipelineHook.OnWound,
      }));
      expect(result.rerollFailedWounds).toBe(true);
    });

    it('should always return rerollFailedWounds regardless of context', () => {
      const handler = getAssaultRule('Shred', PipelineHook.OnWound)!;
      const result = handler(createContext({
        ruleRef: { name: 'Shred' },
        hook: PipelineHook.OnWound,
        isChargeAttack: true,
        isChallenge: true,
        targetIsVehicle: true,
      }));
      expect(result.rerollFailedWounds).toBe(true);
    });
  });

  // ── Precision Rule ───────────────────────────────────────────────────────

  describe('Precision rule', () => {
    it('should return isPrecision=true', () => {
      const handler = getAssaultRule('Precision', PipelineHook.OnHit)!;
      expect(handler).toBeDefined();
      const result = handler(createContext({
        ruleRef: { name: 'Precision' },
        hook: PipelineHook.OnHit,
      }));
      expect(result.isPrecision).toBe(true);
    });

    it('should always return isPrecision regardless of context', () => {
      const handler = getAssaultRule('Precision', PipelineHook.OnHit)!;
      const result = handler(createContext({
        ruleRef: { name: 'Precision' },
        hook: PipelineHook.OnHit,
        isChargeAttack: true,
        isChallenge: true,
        isOutnumbered: true,
      }));
      expect(result.isPrecision).toBe(true);
    });
  });
});
