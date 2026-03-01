/**
 * Tests for Special Rules Dictionary
 * Reference: HH_Armoury.md
 */

import { describe, it, expect } from 'vitest';
import { PipelineHook } from '@hh/types';
import { SPECIAL_RULES, findSpecialRule, getSpecialRulesByHook, getSpecialRulesByCategory } from './special-rules';

describe('SPECIAL_RULES dictionary', () => {
  it('contains at least 50 core special rules', () => {
    expect(Object.keys(SPECIAL_RULES).length).toBeGreaterThanOrEqual(50);
  });

  it('every rule has a unique id', () => {
    const ids = Object.keys(SPECIAL_RULES);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every rule has required fields', () => {
    for (const rule of Object.values(SPECIAL_RULES)) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(typeof rule.isVariable).toBe('boolean');
      expect(Array.isArray(rule.hooks)).toBe(true);
      expect(rule.hooks.length).toBeGreaterThan(0);
      expect(rule.category).toBeTruthy();
    }
  });

  it('variable rules have a parameterType', () => {
    for (const rule of Object.values(SPECIAL_RULES)) {
      if (rule.isVariable) {
        expect(rule.parameterType).toBeTruthy();
      }
    }
  });

  it('non-variable rules do not have a parameterType', () => {
    for (const rule of Object.values(SPECIAL_RULES)) {
      if (!rule.isVariable) {
        expect(rule.parameterType).toBeUndefined();
      }
    }
  });
});

describe('specific core special rules', () => {
  it('Armourbane: non-variable, OnDamage hook', () => {
    const rule = SPECIAL_RULES['armourbane'];
    expect(rule.name).toBe('Armourbane');
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.OnDamage);
  });

  it('Breaching: variable (targetNumber), OnWound hook', () => {
    const rule = SPECIAL_RULES['breaching'];
    expect(rule.name).toBe('Breaching');
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('targetNumber');
    expect(rule.hooks).toContain(PipelineHook.OnWound);
  });

  it('Rending: variable (targetNumber), OnWound hook', () => {
    const rule = SPECIAL_RULES['rending'];
    expect(rule.name).toBe('Rending');
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('targetNumber');
    expect(rule.hooks).toContain(PipelineHook.OnWound);
  });

  it('Blast: variable (numeric), OnHit hook', () => {
    const rule = SPECIAL_RULES['blast'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('numeric');
    expect(rule.hooks).toContain(PipelineHook.OnHit);
  });

  it('Heavy: variable (characteristic), PreHit hook', () => {
    const rule = SPECIAL_RULES['heavy'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('characteristic');
    expect(rule.hooks).toContain(PipelineHook.PreHit);
  });

  it('Deep Strike: non-variable, Movement hook', () => {
    const rule = SPECIAL_RULES['deep-strike'];
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.Movement);
  });

  it('Feel No Pain: variable (targetNumber), PreDamage hook', () => {
    const rule = SPECIAL_RULES['feel-no-pain'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('targetNumber');
    expect(rule.hooks).toContain(PipelineHook.PreDamage);
  });

  it('Eternal Warrior: variable (numeric), OnDamage hook', () => {
    const rule = SPECIAL_RULES['eternal-warrior'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('numeric');
    expect(rule.hooks).toContain(PipelineHook.OnDamage);
  });

  it('Pinning: variable (numeric), OnWound + OnMorale hooks', () => {
    const rule = SPECIAL_RULES['pinning'];
    expect(rule.isVariable).toBe(true);
    expect(rule.hooks).toContain(PipelineHook.OnWound);
    expect(rule.hooks).toContain(PipelineHook.OnMorale);
  });

  it('Template: non-variable, OnHit hook', () => {
    const rule = SPECIAL_RULES['template'];
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.OnHit);
  });

  it('Bulky: variable (numeric), Passive hook', () => {
    const rule = SPECIAL_RULES['bulky'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('numeric');
    expect(rule.hooks).toContain(PipelineHook.Passive);
    expect(rule.category).toBe('transport');
  });

  it('Shock: variable (status), OnWound hook', () => {
    const rule = SPECIAL_RULES['shock'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('status');
    expect(rule.hooks).toContain(PipelineHook.OnWound);
  });

  it('Poisoned: variable (targetNumber), PreWound hook', () => {
    const rule = SPECIAL_RULES['poisoned'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('targetNumber');
    expect(rule.hooks).toContain(PipelineHook.PreWound);
  });

  it('Melta: variable (numeric), OnDamage hook', () => {
    const rule = SPECIAL_RULES['melta'];
    expect(rule.isVariable).toBe(true);
    expect(rule.parameterType).toBe('numeric');
    expect(rule.hooks).toContain(PipelineHook.OnDamage);
  });

  it('Overload: variable (numeric), OnHit hook', () => {
    const rule = SPECIAL_RULES['overload'];
    expect(rule.isVariable).toBe(true);
    expect(rule.hooks).toContain(PipelineHook.OnHit);
  });

  it('Implacable Advance: non-variable, Passive hook', () => {
    const rule = SPECIAL_RULES['implacable-advance'];
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.Passive);
  });
});

describe('LA-specific special rules', () => {
  it('Combi: non-variable, PreHit hook', () => {
    const rule = SPECIAL_RULES['combi'];
    expect(rule.name).toBe('Combi');
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.PreHit);
  });

  it('Shot Selector: non-variable, PreHit hook', () => {
    const rule = SPECIAL_RULES['shot-selector'];
    expect(rule.name).toBe('Shot Selector');
    expect(rule.isVariable).toBe(false);
    expect(rule.hooks).toContain(PipelineHook.PreHit);
  });

  it('Slow and Purposeful: non-variable, Passive hook', () => {
    const rule = SPECIAL_RULES['slow-and-purposeful'];
    expect(rule.isVariable).toBe(false);
  });
});

describe('findSpecialRule', () => {
  it('finds by exact ID', () => {
    expect(findSpecialRule('armourbane')?.name).toBe('Armourbane');
  });

  it('finds by name (case-insensitive)', () => {
    expect(findSpecialRule('ARMOURBANE')?.name).toBe('Armourbane');
    expect(findSpecialRule('breaching')?.name).toBe('Breaching');
  });

  it('finds rules with spaces and special chars', () => {
    expect(findSpecialRule("Duellist's Edge")?.name).toBe("Duellist's Edge");
    expect(findSpecialRule('Feel No Pain')?.name).toBe('Feel No Pain');
    expect(findSpecialRule('Move Through Cover')?.name).toBe('Move Through Cover');
  });

  it('returns undefined for unknown rules', () => {
    expect(findSpecialRule('NonexistentRule')).toBeUndefined();
  });
});

describe('getSpecialRulesByHook', () => {
  it('returns multiple rules for OnWound hook', () => {
    const rules = getSpecialRulesByHook(PipelineHook.OnWound);
    expect(rules.length).toBeGreaterThan(5);
    const names = rules.map((r) => r.name);
    expect(names).toContain('Breaching');
    expect(names).toContain('Rending');
    expect(names).toContain('Shred');
  });

  it('returns rules for PreHit hook', () => {
    const rules = getSpecialRulesByHook(PipelineHook.PreHit);
    expect(rules.length).toBeGreaterThan(3);
    const names = rules.map((r) => r.name);
    expect(names).toContain('Barrage');
    expect(names).toContain('Heavy');
  });

  it('returns rules for Movement hook', () => {
    const rules = getSpecialRulesByHook(PipelineHook.Movement);
    const names = rules.map((r) => r.name);
    expect(names).toContain('Deep Strike');
    expect(names).toContain('Outflank');
    expect(names).toContain('Move Through Cover');
  });
});

describe('getSpecialRulesByCategory', () => {
  it('returns shooting rules', () => {
    const rules = getSpecialRulesByCategory('shooting');
    expect(rules.length).toBeGreaterThan(5);
  });

  it('returns defensive rules', () => {
    const rules = getSpecialRulesByCategory('defensive');
    const names = rules.map((r) => r.name);
    expect(names).toContain('Feel No Pain');
    expect(names).toContain('Eternal Warrior');
    expect(names).toContain('Shrouded');
  });

  it('returns status-inflicting rules', () => {
    const rules = getSpecialRulesByCategory('status-inflicting');
    const names = rules.map((r) => r.name);
    expect(names).toContain('Pinning');
    expect(names).toContain('Suppressive');
    expect(names).toContain('Stun');
    expect(names).toContain('Shock');
  });
});
