/**
 * Tests for Legion Tactica Data
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections
 */

import { describe, it, expect } from 'vitest';
import { LegionFaction, LegionTacticaEffectType, TacticalStatus } from '@hh/types';
import {
  LEGION_TACTICAS,
  LEGION_TACTICA_EFFECTS,
  findLegionTactica,
  getLegionTacticaEffects,
} from './legion-tacticas';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Legion tactica database integrity', () => {
  it('has 20 tacticas (18 base + 2 Hereticus)', () => {
    expect(LEGION_TACTICAS.length).toBe(20);
  });

  it('every tactica has a unique id', () => {
    const ids = LEGION_TACTICAS.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every tactica has required fields', () => {
    for (const t of LEGION_TACTICAS) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.legion).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.effects)).toBe(true);
      expect(t.effects.length).toBeGreaterThan(0);
    }
  });

  it('every tactica has matching structured effects', () => {
    for (const t of LEGION_TACTICAS) {
      const effects = LEGION_TACTICA_EFFECTS[t.id];
      expect(effects).toBeDefined();
      expect(Array.isArray(effects)).toBe(true);
      expect(effects.length).toBeGreaterThan(0);
    }
  });

  it('all 18 legions have at least one tactica', () => {
    for (const legion of Object.values(LegionFaction)) {
      const t = findLegionTactica(legion);
      expect(t).toBeDefined();
    }
  });

  it('structured effects have valid LegionTacticaEffectType values', () => {
    const validTypes = new Set(Object.values(LegionTacticaEffectType));
    for (const effects of Object.values(LEGION_TACTICA_EFFECTS)) {
      for (const e of effects) {
        expect(validTypes.has(e.type)).toBe(true);
      }
    }
  });
});

// ─── Per-Legion Spot Checks ──────────────────────────────────────────────────

describe('Dark Angels tactica — Resolve of the First', () => {
  it('has correct name and legion', () => {
    const t = findLegionTactica(LegionFaction.DarkAngels)!;
    expect(t.name).toBe('Resolve of the First');
    expect(t.legion).toBe(LegionFaction.DarkAngels);
  });

  it('has MinimumLeadership(6) and MaxFearReduction(1) effects', () => {
    const effects = getLegionTacticaEffects('dark-angels-tactica');
    expect(effects.length).toBe(2);
    expect(effects[0].type).toBe(LegionTacticaEffectType.MinimumLeadership);
    expect(effects[0].value).toBe(6);
    expect(effects[1].type).toBe(LegionTacticaEffectType.MaxFearReduction);
    expect(effects[1].value).toBe(1);
  });
});

describe("Emperor's Children tactica — Martial Pride", () => {
  it('has ChargeInitiativeBonus(1) on charge turn', () => {
    const effects = getLegionTacticaEffects('emperors-children-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.ChargeInitiativeBonus);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.onChargeTurn).toBe(true);
  });
});

describe('Iron Warriors tactica — Iron Within', () => {
  it('has IgnoreStatusMoraleMods effect', () => {
    const effects = getLegionTacticaEffects('iron-warriors-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.IgnoreStatusMoraleMods);
  });
});

describe('White Scars tactica — Born in the Saddle', () => {
  it('has OptionalMovementBonus(2)', () => {
    const effects = getLegionTacticaEffects('white-scars-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.OptionalMovementBonus);
    expect(effects[0].value).toBe(2);
  });
});

describe('Space Wolves tactica — Howl of the Death Wolf', () => {
  it('has SetupMoveBonus(2) with maxValue 6', () => {
    const effects = getLegionTacticaEffects('space-wolves-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.SetupMoveBonus);
    expect(effects[0].value).toBe(2);
    expect(effects[0].maxValue).toBe(6);
  });
});

describe('Imperial Fists tactica — Disciplined Fire', () => {
  it('has TraitFireGroupHitBonus(1) for Bolt/Auto with 5+ dice', () => {
    const effects = getLegionTacticaEffects('imperial-fists-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.TraitFireGroupHitBonus);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.requiresWeaponTrait).toEqual(['Bolt', 'Auto']);
    expect(effects[0].conditions?.requiresFireGroupMinDice).toBe(5);
  });
});

describe('Night Lords tactica — A Talent for Murder', () => {
  it('has MeleeWSBonusVsStatus(1) against tactical statuses', () => {
    const effects = getLegionTacticaEffects('night-lords-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.MeleeWSBonusVsStatus);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.targetHasStatus).toEqual([
      TacticalStatus.Pinned,
      TacticalStatus.Suppressed,
      TacticalStatus.Stunned,
      TacticalStatus.Routed,
    ]);
  });
});

describe('Blood Angels tactica — Encarmine Fury', () => {
  it('has ChargeStrengthBonus(1) on charge turn', () => {
    const effects = getLegionTacticaEffects('blood-angels-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.ChargeStrengthBonus);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.onChargeTurn).toBe(true);
  });
});

describe('Iron Hands tactica — Inviolate Armour', () => {
  it('has IncomingRangedStrengthReduction(1) for entire unit', () => {
    const effects = getLegionTacticaEffects('iron-hands-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.IncomingRangedStrengthReduction);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.requiresEntireUnit).toBe(true);
  });
});

describe('World Eaters tactica — Berserker Assault', () => {
  it('has ChargeAttacksBonus(1) on charge turn', () => {
    const effects = getLegionTacticaEffects('world-eaters-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.ChargeAttacksBonus);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.onChargeTurn).toBe(true);
  });
});

describe('Ultramarines tactica — Tactical Flexibility', () => {
  it('has ReactionCostReduction(1) for entire unit', () => {
    const effects = getLegionTacticaEffects('ultramarines-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.ReactionCostReduction);
    expect(effects[0].value).toBe(1);
    expect(effects[0].conditions?.requiresEntireUnit).toBe(true);
  });
});

describe('Death Guard tactica — Remorseless Advance', () => {
  it('has HeavyAfterLimitedMove(4) and IgnoreDifficultTerrainPenalty', () => {
    const effects = getLegionTacticaEffects('death-guard-tactica');
    expect(effects.length).toBe(2);
    expect(effects[0].type).toBe(LegionTacticaEffectType.HeavyAfterLimitedMove);
    expect(effects[0].value).toBe(4);
    expect(effects[1].type).toBe(LegionTacticaEffectType.IgnoreDifficultTerrainPenalty);
  });
});

describe('Thousand Sons tactica — Arcane Mastery', () => {
  it('has WillpowerBonus(1) and GrantPsykerTrait', () => {
    const effects = getLegionTacticaEffects('thousand-sons-tactica');
    expect(effects.length).toBe(2);
    expect(effects[0].type).toBe(LegionTacticaEffectType.WillpowerBonus);
    expect(effects[0].value).toBe(1);
    expect(effects[1].type).toBe(LegionTacticaEffectType.GrantPsykerTrait);
  });
});

describe('Sons of Horus tactica — Merciless Fighters', () => {
  it('has VolleyFullBS effect', () => {
    const effects = getLegionTacticaEffects('sons-of-horus-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.VolleyFullBS);
  });
});

describe('Word Bearers tactica — True Believers', () => {
  it('has CombatResolutionBonus(1)', () => {
    const effects = getLegionTacticaEffects('word-bearers-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.CombatResolutionBonus);
    expect(effects[0].value).toBe(1);
  });
});

describe('Salamanders tactica — Strength of Will', () => {
  it('has MinimumWoundRoll(2) and PanicImmunityFromTrait for Flame', () => {
    const effects = getLegionTacticaEffects('salamanders-tactica');
    expect(effects.length).toBe(2);
    expect(effects[0].type).toBe(LegionTacticaEffectType.MinimumWoundRoll);
    expect(effects[0].value).toBe(2);
    expect(effects[0].conditions?.requiresEntireUnit).toBe(true);
    expect(effects[1].type).toBe(LegionTacticaEffectType.PanicImmunityFromTrait);
    expect(effects[1].conditions?.immunityTriggerTrait).toBe('Flame');
    expect(effects[1].conditions?.requiresEntireUnit).toBe(true);
  });
});

describe('Raven Guard tactica — By Wing and Talon', () => {
  it('has ForceSnapShotsAtRange(18) for entire unit', () => {
    const effects = getLegionTacticaEffects('raven-guard-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.ForceSnapShotsAtRange);
    expect(effects[0].value).toBe(18);
    expect(effects[0].conditions?.requiresEntireUnit).toBe(true);
  });
});

describe('Alpha Legion tactica — Mutable Tactics', () => {
  it('has VirtualRangeIncrease(2)', () => {
    const effects = getLegionTacticaEffects('alpha-legion-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.VirtualRangeIncrease);
    expect(effects[0].value).toBe(2);
  });
});

// ─── Hereticus Tacticas ──────────────────────────────────────────────────────

describe("Emperor's Children Hereticus — Stupefied", () => {
  it('has StupefiedStatusOption effect', () => {
    const effects = getLegionTacticaEffects('emperors-children-hereticus-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.StupefiedStatusOption);
  });

  it('is associated with Emperor\'s Children', () => {
    const t = LEGION_TACTICAS.find(t => t.id === 'emperors-children-hereticus-tactica')!;
    expect(t.legion).toBe(LegionFaction.EmperorsChildren);
  });
});

describe('World Eaters Hereticus — Lost to the Nails', () => {
  it('has LostToTheNailsStatusOption effect', () => {
    const effects = getLegionTacticaEffects('world-eaters-hereticus-tactica');
    expect(effects.length).toBe(1);
    expect(effects[0].type).toBe(LegionTacticaEffectType.LostToTheNailsStatusOption);
  });

  it('is associated with World Eaters', () => {
    const t = LEGION_TACTICAS.find(t => t.id === 'world-eaters-hereticus-tactica')!;
    expect(t.legion).toBe(LegionFaction.WorldEaters);
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findLegionTactica', () => {
  it('returns the base tactica for a legion', () => {
    const t = findLegionTactica(LegionFaction.DarkAngels);
    expect(t).toBeDefined();
    expect(t!.id).toBe('dark-angels-tactica');
  });

  it('returns undefined for invalid legion', () => {
    expect(findLegionTactica('invalid' as LegionFaction)).toBeUndefined();
  });
});

describe('getLegionTacticaEffects', () => {
  it('returns structured effects for valid tactica id', () => {
    const effects = getLegionTacticaEffects('dark-angels-tactica');
    expect(effects.length).toBe(2);
  });

  it('returns empty array for invalid id', () => {
    expect(getLegionTacticaEffects('nonexistent')).toEqual([]);
  });
});
