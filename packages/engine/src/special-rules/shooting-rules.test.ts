/**
 * Shooting Special Rules Registry — Tests
 *
 * Covers:
 *  1. Registry: register, get, has, clear, getRegisteredNames
 *  2. Gets Hot handler returns getsHot: true
 *  3. Twin-linked at OnHit returns rerollFailedHits: true
 *  4. Poisoned(4+) returns autoWound with threshold 4
 *  5. Breaching(4+) returns overrideAP: 2
 *  6. Shred(6+) returns bonusDamage: 1
 *  7. Ignores Cover returns ignoresCover: true
 *  8. Shrouded(4+) returns damageMitigationThreshold: 4
 *  9. Armourbane returns armourbane: true
 * 10. Exoshock(4+) returns exoshockThreshold: 4
 * 11. Sunder returns rerollFailedAP: true
 * 12. Pinning(3) returns pinningModifier: 3
 * 13. Suppressive(2) returns suppressiveModifier: 2
 * 14. Stun(1) returns stunModifier: 1
 * 15. Panic(2) returns panicModifier: 2
 * 16. applyShootingRules merges results from multiple rules
 * 17. applyShootingRules skips rules not registered at the given hook
 * 18. registerAllShootingRules registers all rules
 * 19. Case-insensitive lookup
 * 20. Rule with no value (Gets Hot, Armourbane) works correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineHook } from '@hh/types';
import type { SpecialRuleRef } from '@hh/types';
import {
  registerShootingRule,
  getShootingRule,
  hasShootingRule,
  getRegisteredShootingRuleNames,
  clearShootingRegistry,
  applyShootingRules,
  registerAllShootingRules,
} from './shooting-rules';
import type { ShootingRuleHandler, ShootingRuleContext } from './shooting-rules';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a ShootingRuleContext for testing with sensible defaults.
 */
function makeContext(overrides?: Partial<ShootingRuleContext>): ShootingRuleContext {
  return {
    ruleRef: { name: 'Test' },
    hook: PipelineHook.OnHit,
    isSnapShot: false,
    isReturnFire: false,
    firerIsStationary: true,
    ...overrides,
  };
}

/**
 * Build the base context used by applyShootingRules (omitting ruleRef and hook).
 */
function makeBaseContext(
  overrides?: Partial<Omit<ShootingRuleContext, 'ruleRef' | 'hook'>>,
): Omit<ShootingRuleContext, 'ruleRef' | 'hook'> {
  return {
    isSnapShot: false,
    isReturnFire: false,
    firerIsStationary: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Shooting Rules Registry', () => {
  beforeEach(() => {
    clearShootingRegistry();
  });

  // ── 1. Registry CRUD ──────────────────────────────────────────────────────

  describe('Registry operations', () => {
    it('should register a rule handler at a specific hook', () => {
      const handler: ShootingRuleHandler = () => ({ getsHot: true });
      registerShootingRule('TestRule', PipelineHook.OnHit, handler);
      expect(hasShootingRule('TestRule', PipelineHook.OnHit)).toBe(true);
    });

    it('should retrieve a registered handler', () => {
      const handler: ShootingRuleHandler = () => ({ getsHot: true });
      registerShootingRule('TestRule', PipelineHook.OnHit, handler);
      const retrieved = getShootingRule('TestRule', PipelineHook.OnHit);
      expect(retrieved).toBe(handler);
    });

    it('should return undefined for unregistered rule', () => {
      expect(getShootingRule('Nonexistent', PipelineHook.OnHit)).toBeUndefined();
    });

    it('should return false for has on unregistered rule', () => {
      expect(hasShootingRule('Nonexistent', PipelineHook.OnHit)).toBe(false);
    });

    it('should return false for has on wrong hook', () => {
      const handler: ShootingRuleHandler = () => ({ getsHot: true });
      registerShootingRule('TestRule', PipelineHook.OnHit, handler);
      expect(hasShootingRule('TestRule', PipelineHook.PreWound)).toBe(false);
    });

    it('should list all registered rule names', () => {
      registerShootingRule('Alpha', PipelineHook.OnHit, () => ({}));
      registerShootingRule('Beta', PipelineHook.PreWound, () => ({}));
      registerShootingRule('Gamma', PipelineHook.OnCasualty, () => ({}));
      const names = getRegisteredShootingRuleNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    });

    it('should clear all registered rules', () => {
      registerShootingRule('A', PipelineHook.OnHit, () => ({}));
      registerShootingRule('B', PipelineHook.PreWound, () => ({}));
      clearShootingRegistry();
      expect(getRegisteredShootingRuleNames()).toHaveLength(0);
      expect(hasShootingRule('A', PipelineHook.OnHit)).toBe(false);
    });

    it('should allow a rule to be registered at multiple hooks', () => {
      registerShootingRule('Multi', PipelineHook.OnHit, () => ({ rerollFailedHits: true }));
      registerShootingRule('Multi', PipelineHook.PreWound, () => ({ rerollFailedWounds: true }));
      expect(hasShootingRule('Multi', PipelineHook.OnHit)).toBe(true);
      expect(hasShootingRule('Multi', PipelineHook.PreWound)).toBe(true);
    });
  });

  // ── 19. Case-insensitive lookup ───────────────────────────────────────────

  describe('Case-insensitive lookup', () => {
    it('should find rules regardless of case', () => {
      registerShootingRule('Gets Hot', PipelineHook.OnHit, () => ({ getsHot: true }));
      expect(hasShootingRule('gets hot', PipelineHook.OnHit)).toBe(true);
      expect(hasShootingRule('GETS HOT', PipelineHook.OnHit)).toBe(true);
      expect(hasShootingRule('Gets Hot', PipelineHook.OnHit)).toBe(true);
    });

    it('should retrieve handlers with any casing', () => {
      const handler: ShootingRuleHandler = () => ({ getsHot: true });
      registerShootingRule('Gets Hot', PipelineHook.OnHit, handler);
      expect(getShootingRule('gets hot', PipelineHook.OnHit)).toBe(handler);
      expect(getShootingRule('GETS HOT', PipelineHook.OnHit)).toBe(handler);
    });
  });

  // ── Individual Rule Handler Tests ─────────────────────────────────────────

  describe('Built-in rule handlers', () => {
    beforeEach(() => {
      registerAllShootingRules();
    });

    // ── 2. Gets Hot ───────────────────────────────────────────────────────

    describe('Gets Hot', () => {
      it('should return getsHot: true at OnHit', () => {
        const handler = getShootingRule('Gets Hot', PipelineHook.OnHit)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({ ruleRef: { name: 'Gets Hot' } }));
        expect(result.getsHot).toBe(true);
      });

      // ── 20. Rule with no value works correctly ──────────────────────
      it('should work correctly with no value', () => {
        const handler = getShootingRule('Gets Hot', PipelineHook.OnHit)!;
        const result = handler(makeContext({ ruleRef: { name: 'Gets Hot' } }));
        expect(result.getsHot).toBe(true);
      });
    });

    // ── 3. Twin-linked OnHit ──────────────────────────────────────────────

    describe('Twin-linked (OnHit)', () => {
      it('should return rerollFailedHits: true at OnHit', () => {
        const handler = getShootingRule('Twin-linked', PipelineHook.OnHit)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({ ruleRef: { name: 'Twin-linked' } }));
        expect(result.rerollFailedHits).toBe(true);
      });
    });

    // ── Twin-linked PreWound ──────────────────────────────────────────────

    describe('Twin-linked (PreWound)', () => {
      it('should return rerollFailedWounds: true at PreWound', () => {
        const handler = getShootingRule('Twin-linked', PipelineHook.PreWound)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Twin-linked' },
          hook: PipelineHook.PreWound,
        }));
        expect(result.rerollFailedWounds).toBe(true);
      });
    });

    // ── 4. Poisoned(4+) ──────────────────────────────────────────────────

    describe('Poisoned', () => {
      it('should return autoWound with threshold 4 for Poisoned(4+)', () => {
        const handler = getShootingRule('Poisoned', PipelineHook.PreWound)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Poisoned', value: '4+' },
          hook: PipelineHook.PreWound,
        }));
        expect(result.autoWound).toBe(true);
        expect(result.poisonedThreshold).toBe(4);
        expect(result.poisonedAffectsVehicles).toBe(false);
      });

      it('should default to threshold 4 when no value provided', () => {
        const handler = getShootingRule('Poisoned', PipelineHook.PreWound)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Poisoned' },
          hook: PipelineHook.PreWound,
        }));
        expect(result.poisonedThreshold).toBe(4);
      });

      it('should parse threshold from different values', () => {
        const handler = getShootingRule('Poisoned', PipelineHook.PreWound)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Poisoned', value: '3+' },
          hook: PipelineHook.PreWound,
        }));
        expect(result.poisonedThreshold).toBe(3);
      });
    });

    // ── 5. Breaching(4+) ─────────────────────────────────────────────────

    describe('Breaching', () => {
      it('should return overrideAP: 2 for Breaching(4+)', () => {
        const handler = getShootingRule('Breaching', PipelineHook.OnWound)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Breaching', value: '4+' },
          hook: PipelineHook.OnWound,
        }));
        expect(result.overrideAP).toBe(2);
      });
    });

    // ── 6. Shred(6+) ────────────────────────────────────────────────────

    describe('Shred', () => {
      it('should return bonusDamage: 1 for Shred(6+)', () => {
        const handler = getShootingRule('Shred', PipelineHook.OnWound)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Shred', value: '6+' },
          hook: PipelineHook.OnWound,
        }));
        expect(result.bonusDamage).toBe(1);
      });
    });

    // ── 7. Ignores Cover ────────────────────────────────────────────────

    describe('Ignores Cover', () => {
      it('should return ignoresCover: true at PreSave', () => {
        const handler = getShootingRule('Ignores Cover', PipelineHook.PreSave)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Ignores Cover' },
          hook: PipelineHook.PreSave,
        }));
        expect(result.ignoresCover).toBe(true);
      });
    });

    // ── 8. Shrouded(4+) ─────────────────────────────────────────────────

    describe('Shrouded', () => {
      it('should return damageMitigationThreshold: 4 for Shrouded(4+)', () => {
        const handler = getShootingRule('Shrouded', PipelineHook.PreDamage)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Shrouded', value: '4+' },
          hook: PipelineHook.PreDamage,
        }));
        expect(result.damageMitigationThreshold).toBe(4);
      });

      it('should parse different thresholds', () => {
        const handler = getShootingRule('Shrouded', PipelineHook.PreDamage)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Shrouded', value: '5+' },
          hook: PipelineHook.PreDamage,
        }));
        expect(result.damageMitigationThreshold).toBe(5);
      });

      it('should default to 4 when no value provided', () => {
        const handler = getShootingRule('Shrouded', PipelineHook.PreDamage)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Shrouded' },
          hook: PipelineHook.PreDamage,
        }));
        expect(result.damageMitigationThreshold).toBe(4);
      });
    });

    // ── 9. Armourbane ───────────────────────────────────────────────────

    describe('Armourbane', () => {
      it('should return armourbane: true at PreDamage', () => {
        const handler = getShootingRule('Armourbane', PipelineHook.PreDamage)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Armourbane' },
          hook: PipelineHook.PreDamage,
        }));
        expect(result.armourbane).toBe(true);
      });

      // ── 20. Rule with no value works correctly (Armourbane) ──────────
      it('should work correctly with no value', () => {
        const handler = getShootingRule('Armourbane', PipelineHook.PreDamage)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Armourbane' },
          hook: PipelineHook.PreDamage,
        }));
        expect(result.armourbane).toBe(true);
      });
    });

    // ── 10. Exoshock(4+) ────────────────────────────────────────────────

    describe('Exoshock', () => {
      it('should return exoshockThreshold: 4 for Exoshock(4+)', () => {
        const handler = getShootingRule('Exoshock', PipelineHook.OnDamage)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Exoshock', value: '4+' },
          hook: PipelineHook.OnDamage,
        }));
        expect(result.exoshockThreshold).toBe(4);
      });

      it('should parse different thresholds', () => {
        const handler = getShootingRule('Exoshock', PipelineHook.OnDamage)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Exoshock', value: '5+' },
          hook: PipelineHook.OnDamage,
        }));
        expect(result.exoshockThreshold).toBe(5);
      });
    });

    // ── 11. Sunder ──────────────────────────────────────────────────────

    describe('Sunder', () => {
      it('should return rerollFailedAP: true at OnDamage', () => {
        const handler = getShootingRule('Sunder', PipelineHook.OnDamage)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Sunder' },
          hook: PipelineHook.OnDamage,
        }));
        expect(result.rerollFailedAP).toBe(true);
      });
    });

    // ── 12. Pinning(3) ──────────────────────────────────────────────────

    describe('Pinning', () => {
      it('should return pinningModifier: 3 for Pinning(3)', () => {
        const handler = getShootingRule('Pinning', PipelineHook.OnCasualty)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Pinning', value: '3' },
          hook: PipelineHook.OnCasualty,
        }));
        expect(result.pinningModifier).toBe(3);
      });

      it('should default to 0 when no value provided', () => {
        const handler = getShootingRule('Pinning', PipelineHook.OnCasualty)!;
        const result = handler(makeContext({
          ruleRef: { name: 'Pinning' },
          hook: PipelineHook.OnCasualty,
        }));
        expect(result.pinningModifier).toBe(0);
      });
    });

    // ── 13. Suppressive(2) ──────────────────────────────────────────────

    describe('Suppressive', () => {
      it('should return suppressiveModifier: 2 for Suppressive(2)', () => {
        const handler = getShootingRule('Suppressive', PipelineHook.OnCasualty)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Suppressive', value: '2' },
          hook: PipelineHook.OnCasualty,
        }));
        expect(result.suppressiveModifier).toBe(2);
      });
    });

    // ── 14. Stun(1) ─────────────────────────────────────────────────────

    describe('Stun', () => {
      it('should return stunModifier: 1 for Stun(1)', () => {
        const handler = getShootingRule('Stun', PipelineHook.OnCasualty)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Stun', value: '1' },
          hook: PipelineHook.OnCasualty,
        }));
        expect(result.stunModifier).toBe(1);
      });
    });

    // ── 15. Panic(2) ────────────────────────────────────────────────────

    describe('Panic', () => {
      it('should return panicModifier: 2 for Panic(2)', () => {
        const handler = getShootingRule('Panic', PipelineHook.OnCasualty)!;
        expect(handler).toBeDefined();
        const result = handler(makeContext({
          ruleRef: { name: 'Panic', value: '2' },
          hook: PipelineHook.OnCasualty,
        }));
        expect(result.panicModifier).toBe(2);
      });
    });
  });

  // ── 16. applyShootingRules merges results ─────────────────────────────────

  describe('applyShootingRules', () => {
    beforeEach(() => {
      registerAllShootingRules();
    });

    it('should merge results from multiple rules at the same hook', () => {
      // Gets Hot and Twin-linked both fire at OnHit
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Gets Hot' },
        { name: 'Twin-linked' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.OnHit, makeBaseContext());
      expect(result.getsHot).toBe(true);
      expect(result.rerollFailedHits).toBe(true);
    });

    it('should merge results from multiple OnCasualty rules', () => {
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Pinning', value: '3' },
        { name: 'Suppressive', value: '2' },
        { name: 'Stun', value: '1' },
        { name: 'Panic', value: '2' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.OnCasualty, makeBaseContext());
      expect(result.pinningModifier).toBe(3);
      expect(result.suppressiveModifier).toBe(2);
      expect(result.stunModifier).toBe(1);
      expect(result.panicModifier).toBe(2);
    });

    it('should accumulate bonusDamage from multiple rules', () => {
      // Register two custom rules that both contribute bonusDamage
      registerShootingRule('CustomShred1', PipelineHook.OnWound, () => ({ bonusDamage: 1 }));
      registerShootingRule('CustomShred2', PipelineHook.OnWound, () => ({ bonusDamage: 2 }));

      const ruleRefs: SpecialRuleRef[] = [
        { name: 'CustomShred1' },
        { name: 'CustomShred2' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.OnWound, makeBaseContext());
      expect(result.bonusDamage).toBe(3);
    });

    // ── 17. Skip rules not registered at the given hook ─────────────────

    it('should skip rules not registered at the given hook', () => {
      // Gets Hot is at OnHit, not at PreWound
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Gets Hot' },
        { name: 'Poisoned', value: '4+' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.PreWound, makeBaseContext());
      // Gets Hot should be skipped (not registered at PreWound)
      expect(result.getsHot).toBeUndefined();
      // Poisoned should be applied
      expect(result.autoWound).toBe(true);
      expect(result.poisonedThreshold).toBe(4);
    });

    it('should skip completely unregistered rules', () => {
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'NonExistentRule' },
        { name: 'Gets Hot' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.OnHit, makeBaseContext());
      expect(result.getsHot).toBe(true);
    });

    it('should return empty result for no rules', () => {
      const result = applyShootingRules([], PipelineHook.OnHit, makeBaseContext());
      expect(result).toEqual({});
    });

    it('should return empty result when no rules match the hook', () => {
      const ruleRefs: SpecialRuleRef[] = [
        { name: 'Gets Hot' },
      ];
      const result = applyShootingRules(ruleRefs, PipelineHook.OnCasualty, makeBaseContext());
      expect(result).toEqual({});
    });

    it('should pass baseContext fields through to handlers', () => {
      // Register a custom handler that reads context fields
      registerShootingRule('ContextCheck', PipelineHook.OnHit, (ctx) => {
        return {
          bsModifier: ctx.isSnapShot ? -1 : 0,
          ignoresLOS: ctx.firerIsStationary,
        };
      });

      // Test with isSnapShot: true — handler should produce bsModifier: -1
      const ruleRefs: SpecialRuleRef[] = [{ name: 'ContextCheck' }];
      const result = applyShootingRules(
        ruleRefs,
        PipelineHook.OnHit,
        makeBaseContext({ isSnapShot: true, firerIsStationary: false }),
      );
      expect(result.bsModifier).toBe(-1);
      // ignoresLOS is false from handler, which is not merged (boolean OR: false = not set)
      expect(result.ignoresLOS).toBeUndefined();

      // Test with firerIsStationary: true — handler should produce ignoresLOS: true
      const result2 = applyShootingRules(
        ruleRefs,
        PipelineHook.OnHit,
        makeBaseContext({ isSnapShot: false, firerIsStationary: true }),
      );
      expect(result2.bsModifier).toBe(0);
      expect(result2.ignoresLOS).toBe(true);
    });
  });

  // ── 18. registerAllShootingRules registers all rules ──────────────────────

  describe('registerAllShootingRules', () => {
    it('should register all built-in rules', () => {
      registerAllShootingRules();
      const names = getRegisteredShootingRuleNames();

      // Verify all expected rules are registered
      expect(names).toContain('gets hot');
      expect(names).toContain('twin-linked');
      expect(names).toContain('poisoned');
      expect(names).toContain('breaching');
      expect(names).toContain('shred');
      expect(names).toContain('ignores cover');
      expect(names).toContain('shrouded');
      expect(names).toContain('armourbane');
      expect(names).toContain('exoshock');
      expect(names).toContain('sunder');
      expect(names).toContain('pinning');
      expect(names).toContain('suppressive');
      expect(names).toContain('stun');
      expect(names).toContain('panic');
    });

    it('should register Gets Hot at OnHit', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Gets Hot', PipelineHook.OnHit)).toBe(true);
    });

    it('should register Twin-linked at both OnHit and PreWound', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Twin-linked', PipelineHook.OnHit)).toBe(true);
      expect(hasShootingRule('Twin-linked', PipelineHook.PreWound)).toBe(true);
    });

    it('should register Poisoned at PreWound', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Poisoned', PipelineHook.PreWound)).toBe(true);
    });

    it('should register Breaching at OnWound', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Breaching', PipelineHook.OnWound)).toBe(true);
    });

    it('should register Shred at OnWound', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Shred', PipelineHook.OnWound)).toBe(true);
    });

    it('should register Ignores Cover at PreSave', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Ignores Cover', PipelineHook.PreSave)).toBe(true);
    });

    it('should register Shrouded at PreDamage', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Shrouded', PipelineHook.PreDamage)).toBe(true);
    });

    it('should register Armourbane at PreDamage', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Armourbane', PipelineHook.PreDamage)).toBe(true);
    });

    it('should register Exoshock at OnDamage', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Exoshock', PipelineHook.OnDamage)).toBe(true);
    });

    it('should register Sunder at OnDamage', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Sunder', PipelineHook.OnDamage)).toBe(true);
    });

    it('should register all OnCasualty rules', () => {
      registerAllShootingRules();
      expect(hasShootingRule('Pinning', PipelineHook.OnCasualty)).toBe(true);
      expect(hasShootingRule('Suppressive', PipelineHook.OnCasualty)).toBe(true);
      expect(hasShootingRule('Stun', PipelineHook.OnCasualty)).toBe(true);
      expect(hasShootingRule('Panic', PipelineHook.OnCasualty)).toBe(true);
    });
  });
});
