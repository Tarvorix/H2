/**
 * Tests for Legion Advanced Reaction Data
 * Reference: HH_Legiones_Astartes.md — all 18 legion "Advanced Reaction" subsections
 */

import { describe, it, expect } from 'vitest';
import { LegionFaction, Phase, SubPhase, Allegiance } from '@hh/types';
import {
  LEGION_ADVANCED_REACTIONS,
  findAdvancedReaction,
  getAdvancedReactionsForLegion,
} from './legion-advanced-reactions';

// ─── Database Integrity ──────────────────────────────────────────────────────

describe('Legion advanced reaction database integrity', () => {
  it('has 20 reactions (18 standard + 2 Hereticus)', () => {
    expect(LEGION_ADVANCED_REACTIONS.length).toBe(20);
  });

  it('every reaction has a unique id', () => {
    const ids = LEGION_ADVANCED_REACTIONS.map(r => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every reaction has required fields', () => {
    for (const r of LEGION_ADVANCED_REACTIONS) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.legion).toBeTruthy();
      expect(r.triggerPhase).toBeTruthy();
      expect(r.triggerCondition).toBeDefined();
      expect(typeof r.cost).toBe('number');
      expect(r.cost).toBe(1); // all reactions cost 1
      expect(typeof r.oncePerBattle).toBe('boolean');
      expect(r.description).toBeTruthy();
      expect(Array.isArray(r.conditions)).toBe(true);
      expect(r.conditions.length).toBeGreaterThan(0);
      expect(Array.isArray(r.effects)).toBe(true);
      expect(r.effects.length).toBeGreaterThan(0);
    }
  });

  it('all 18 legions have at least one reaction', () => {
    for (const legion of Object.values(LegionFaction)) {
      const reactions = getAdvancedReactionsForLegion(legion);
      expect(reactions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every triggerPhase is a valid Phase', () => {
    const validPhases = new Set(Object.values(Phase));
    for (const r of LEGION_ADVANCED_REACTIONS) {
      expect(validPhases.has(r.triggerPhase)).toBe(true);
    }
  });

  it('every triggerSubPhase (when set) is a valid SubPhase', () => {
    const validSubPhases = new Set(Object.values(SubPhase));
    for (const r of LEGION_ADVANCED_REACTIONS) {
      if (r.triggerSubPhase) {
        expect(validSubPhases.has(r.triggerSubPhase)).toBe(true);
      }
    }
  });
});

// ─── Trigger Condition Coverage ──────────────────────────────────────────────

describe('Trigger condition types', () => {
  it('has reactions with afterEnemyMoveWithinRange trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'afterEnemyMoveWithinRange'
    );
    expect(matched.length).toBeGreaterThanOrEqual(2); // WS Chasing Wind, IF Bastion of Fire
  });

  it('has reactions with duringShootingAttackStep trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'duringShootingAttackStep'
    );
    expect(matched.length).toBeGreaterThanOrEqual(8);
  });

  it('has reactions with duringChargeStep trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'duringChargeStep'
    );
    expect(matched.length).toBeGreaterThanOrEqual(4);
  });

  it('has reactions with afterLastInitiativeStep trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'afterLastInitiativeStep'
    );
    expect(matched.length).toBe(1); // DA Vengeance
  });

  it('has reactions with onChallengeDeclaration trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'onChallengeDeclaration'
    );
    expect(matched.length).toBe(1); // SoH Warrior Pride
  });

  it('has reactions with afterVolleyAttacks trigger', () => {
    const matched = LEGION_ADVANCED_REACTIONS.filter(
      r => r.triggerCondition.type === 'afterVolleyAttacks'
    );
    expect(matched.length).toBe(1); // WE-H Furious Charge
  });
});

// ─── Once-per-Battle vs Repeatable ───────────────────────────────────────────

describe('Once-per-battle tracking', () => {
  it('most standard reactions are once per battle', () => {
    const oncePerBattle = LEGION_ADVANCED_REACTIONS.filter(r => r.oncePerBattle);
    expect(oncePerBattle.length).toBeGreaterThanOrEqual(14);
  });

  it('Night Lords Better Part of Valour is NOT once per battle', () => {
    const nl = findAdvancedReaction('nl-better-part')!;
    expect(nl.oncePerBattle).toBe(false);
  });

  it('Sons of Horus Warrior Pride is NOT once per battle', () => {
    const soh = findAdvancedReaction('soh-warrior-pride')!;
    expect(soh.oncePerBattle).toBe(false);
  });

  it('Alpha Legion Smoke and Mirrors is NOT once per battle', () => {
    const al = findAdvancedReaction('al-smoke-and-mirrors')!;
    expect(al.oncePerBattle).toBe(false);
  });

  it('Hereticus reactions are NOT once per battle', () => {
    const ecH = findAdvancedReaction('ec-h-twisted-desire')!;
    const weH = findAdvancedReaction('we-h-furious-charge')!;
    expect(ecH.oncePerBattle).toBe(false);
    expect(weH.oncePerBattle).toBe(false);
  });
});

// ─── Per-Legion Spot Checks ──────────────────────────────────────────────────

describe('Dark Angels — Vengeance of the First Legion', () => {
  it('triggers after last initiative step in Assault/Fight', () => {
    const r = findAdvancedReaction('da-vengeance')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerSubPhase).toBe(SubPhase.Fight);
    expect(r.triggerCondition.type).toBe('afterLastInitiativeStep');
    expect(r.oncePerBattle).toBe(true);
  });
});

describe("Emperor's Children — Perfect Counter", () => {
  it('triggers during charge step 3', () => {
    const r = findAdvancedReaction('ec-perfect-counter')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerSubPhase).toBe(SubPhase.Charge);
    expect(r.triggerCondition).toEqual({ type: 'duringChargeStep', step: 3 });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Iron Warriors — Bitter Fury', () => {
  it('triggers during shooting attack step 3', () => {
    const r = findAdvancedReaction('iw-bitter-fury')!;
    expect(r.triggerPhase).toBe(Phase.Shooting);
    expect(r.triggerCondition).toEqual({ type: 'duringShootingAttackStep', step: 3 });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('White Scars — Chasing the Wind', () => {
  it('triggers when enemy moves within 12" with LOS', () => {
    const r = findAdvancedReaction('ws-chasing-wind')!;
    expect(r.triggerPhase).toBe(Phase.Movement);
    expect(r.triggerCondition).toEqual({ type: 'afterEnemyMoveWithinRange', range: 12, requiresLOS: true });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Imperial Fists — Bastion of Fire', () => {
  it('triggers when enemy moves within 10" with LOS', () => {
    const r = findAdvancedReaction('if-bastion-of-fire')!;
    expect(r.triggerPhase).toBe(Phase.Movement);
    expect(r.triggerCondition).toEqual({ type: 'afterEnemyMoveWithinRange', range: 10, requiresLOS: true });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Night Lords — Better Part of Valour', () => {
  it('triggers during charge step 4, not once per battle', () => {
    const r = findAdvancedReaction('nl-better-part')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerCondition).toEqual({ type: 'duringChargeStep', step: 4 });
    expect(r.oncePerBattle).toBe(false);
  });
});

describe('Blood Angels — Wrath of Angels', () => {
  it('triggers during shooting attack step 4', () => {
    const r = findAdvancedReaction('ba-wrath-of-angels')!;
    expect(r.triggerPhase).toBe(Phase.Shooting);
    expect(r.triggerCondition).toEqual({ type: 'duringShootingAttackStep', step: 4 });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Iron Hands — Spite of the Gorgon', () => {
  it('triggers during charge step 3', () => {
    const r = findAdvancedReaction('ih-spite-of-gorgon')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerCondition).toEqual({ type: 'duringChargeStep', step: 3 });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Ultramarines — Retribution Strike', () => {
  it('triggers during shooting attack step 3', () => {
    const r = findAdvancedReaction('um-retribution-strike')!;
    expect(r.triggerPhase).toBe(Phase.Shooting);
    expect(r.triggerCondition).toEqual({ type: 'duringShootingAttackStep', step: 3 });
    expect(r.oncePerBattle).toBe(true);
  });
});

describe('Sons of Horus — Warrior Pride', () => {
  it('triggers on challenge declaration', () => {
    const r = findAdvancedReaction('soh-warrior-pride')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerSubPhase).toBe(SubPhase.Challenge);
    expect(r.triggerCondition.type).toBe('onChallengeDeclaration');
    expect(r.oncePerBattle).toBe(false);
  });
});

describe('Alpha Legion — Smoke and Mirrors', () => {
  it('triggers during shooting attack step 3, not once per battle', () => {
    const r = findAdvancedReaction('al-smoke-and-mirrors')!;
    expect(r.triggerPhase).toBe(Phase.Shooting);
    expect(r.triggerCondition).toEqual({ type: 'duringShootingAttackStep', step: 3 });
    expect(r.oncePerBattle).toBe(false);
  });
});

// ─── Hereticus Reactions ─────────────────────────────────────────────────────

describe("Emperor's Children Hereticus — Twisted Desire", () => {
  it('requires Traitor allegiance and is Hereticus', () => {
    const r = findAdvancedReaction('ec-h-twisted-desire')!;
    expect(r.requiredAllegiance).toBe(Allegiance.Traitor);
    expect(r.isHereticus).toBe(true);
    expect(r.oncePerBattle).toBe(false);
  });

  it('triggers during charge step 2', () => {
    const r = findAdvancedReaction('ec-h-twisted-desire')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerCondition).toEqual({ type: 'duringChargeStep', step: 2 });
  });
});

describe('World Eaters Hereticus — Furious Charge', () => {
  it('requires Traitor allegiance and is Hereticus', () => {
    const r = findAdvancedReaction('we-h-furious-charge')!;
    expect(r.requiredAllegiance).toBe(Allegiance.Traitor);
    expect(r.isHereticus).toBe(true);
    expect(r.oncePerBattle).toBe(false);
  });

  it('triggers after volley attacks', () => {
    const r = findAdvancedReaction('we-h-furious-charge')!;
    expect(r.triggerPhase).toBe(Phase.Assault);
    expect(r.triggerCondition.type).toBe('afterVolleyAttacks');
  });
});

// ─── Lookup Functions ────────────────────────────────────────────────────────

describe('findAdvancedReaction', () => {
  it('returns reaction by exact id', () => {
    const r = findAdvancedReaction('da-vengeance');
    expect(r).toBeDefined();
    expect(r!.name).toBe('Vengeance of the First Legion');
  });

  it('returns undefined for non-existent id', () => {
    expect(findAdvancedReaction('nonexistent')).toBeUndefined();
  });
});

describe('getAdvancedReactionsForLegion', () => {
  it('returns 1 reaction for most legions', () => {
    expect(getAdvancedReactionsForLegion(LegionFaction.DarkAngels).length).toBe(1);
    expect(getAdvancedReactionsForLegion(LegionFaction.IronWarriors).length).toBe(1);
    expect(getAdvancedReactionsForLegion(LegionFaction.Ultramarines).length).toBe(1);
  });

  it("returns 2 reactions for Emperor's Children (base + Hereticus)", () => {
    const reactions = getAdvancedReactionsForLegion(LegionFaction.EmperorsChildren);
    expect(reactions.length).toBe(2);
    expect(reactions.some(r => r.id === 'ec-perfect-counter')).toBe(true);
    expect(reactions.some(r => r.id === 'ec-h-twisted-desire')).toBe(true);
  });

  it('returns 2 reactions for World Eaters (base + Hereticus)', () => {
    const reactions = getAdvancedReactionsForLegion(LegionFaction.WorldEaters);
    expect(reactions.length).toBe(2);
    expect(reactions.some(r => r.id === 'we-brutal-tide')).toBe(true);
    expect(reactions.some(r => r.id === 'we-h-furious-charge')).toBe(true);
  });

  it('returns empty array for invalid legion', () => {
    expect(getAdvancedReactionsForLegion('invalid' as LegionFaction)).toEqual([]);
  });
});

// ─── Phase Distribution ─────────────────────────────────────────────────────

describe('Phase distribution', () => {
  it('has reactions in Movement phase', () => {
    const movement = LEGION_ADVANCED_REACTIONS.filter(r => r.triggerPhase === Phase.Movement);
    expect(movement.length).toBeGreaterThanOrEqual(2); // WS Chasing Wind, IF Bastion of Fire
  });

  it('has reactions in Shooting phase', () => {
    const shooting = LEGION_ADVANCED_REACTIONS.filter(r => r.triggerPhase === Phase.Shooting);
    expect(shooting.length).toBeGreaterThanOrEqual(8);
  });

  it('has reactions in Assault phase', () => {
    const assault = LEGION_ADVANCED_REACTIONS.filter(r => r.triggerPhase === Phase.Assault);
    expect(assault.length).toBeGreaterThanOrEqual(8);
  });
});
