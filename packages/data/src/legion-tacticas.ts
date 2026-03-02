/**
 * Legion Tactica data definitions for all 18 Legiones Astartes + 2 Hereticus tacticas.
 *
 * Each tactica has:
 *  - A human-readable LegionTactica object (id, name, description, effects[])
 *  - A structured LegionTacticaEffect[] for engine processing
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections
 */

import { LegionFaction, TacticalStatus } from '@hh/types';
import type { ArmyFaction } from '@hh/types';
import { LegionTacticaEffectType } from '@hh/types';
import type { LegionTactica } from '@hh/types';
import type { LegionTacticaEffect } from '@hh/types';

// ─── Individual Tactica Definitions ──────────────────────────────────────────

// 1. Dark Angels (I)
const darkAngelsTactica: LegionTactica = {
  id: 'dark-angels-tactica',
  legion: LegionFaction.DarkAngels,
  name: 'Resolve of the First',
  description:
    'The Leadership characteristic of models with this rule is never modified below 6. ' +
    'In addition, any Fear (X) effect can only reduce LD, WP, CL, or IN by a maximum of 1.',
  effects: [
    'Leadership characteristic never modified below 6',
    'Fear (X) can only reduce LD/WP/CL/IN by a maximum of 1',
  ],
};

const darkAngelsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.MinimumLeadership,
    value: 6,
  },
  {
    type: LegionTacticaEffectType.MaxFearReduction,
    value: 1,
  },
];

// 2. Emperor's Children (III)
const emperorsChildrenTactica: LegionTactica = {
  id: 'emperors-children-tactica',
  legion: LegionFaction.EmperorsChildren,
  name: 'Martial Pride',
  description:
    'On a turn in which this model charges, it gains +1 to its Combat Initiative characteristic.',
  effects: ['+1 Combat Initiative on charge turn'],
};

const emperorsChildrenTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.ChargeInitiativeBonus,
    value: 1,
    conditions: {
      onChargeTurn: true,
    },
  },
];

// 3. Iron Warriors (IV)
const ironWarriorsTactica: LegionTactica = {
  id: 'iron-warriors-tactica',
  legion: LegionFaction.IronWarriors,
  name: 'Iron Within',
  description:
    'Models with this rule ignore any negative Leadership or Cool modifiers caused by ' +
    'Panic (X), Pinning (X), Stun (X), and Suppressive (X) effects.',
  effects: [
    'Ignore negative LD/Cool modifiers from Panic (X), Pinning (X), Stun (X), and Suppressive (X)',
  ],
};

const ironWarriorsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.IgnoreStatusMoraleMods,
  },
];

// 4. White Scars (V)
const whiteScarsTactica: LegionTactica = {
  id: 'white-scars-tactica',
  legion: LegionFaction.WhiteScars,
  name: 'Born in the Saddle',
  description:
    'At the start of the controlling player\'s turn, models with this rule may choose to ' +
    'increase their Movement characteristic by +2 for that turn.',
  effects: ['Optional +2 Movement at start of controlling player\'s turn'],
};

const whiteScarsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.OptionalMovementBonus,
    value: 2,
  },
];

// 5. Space Wolves (VI)
const spaceWolvesTactica: LegionTactica = {
  id: 'space-wolves-tactica',
  legion: LegionFaction.SpaceWolves,
  name: 'Howl of the Death Wolf',
  description:
    'Models with this rule must add +2" to their set-up move distance, to a maximum of 6".',
  effects: ['+2" to set-up move distance (maximum 6")'],
};

const spaceWolvesTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.SetupMoveBonus,
    value: 2,
    maxValue: 6,
  },
];

// 6. Imperial Fists (VII)
const imperialFistsTactica: LegionTactica = {
  id: 'imperial-fists-tactica',
  legion: LegionFaction.ImperialFists,
  name: 'Disciplined Fire',
  description:
    'Fire groups composed of weapons with the Bolt or Auto trait that contain 5 or more ' +
    'dice gain +1 to their Hit Tests.',
  effects: [
    '+1 to Hit Tests for fire groups with 5+ dice and Bolt or Auto weapon trait',
  ],
};

const imperialFistsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.TraitFireGroupHitBonus,
    value: 1,
    conditions: {
      requiresWeaponTrait: ['Bolt', 'Auto'],
      requiresFireGroupMinDice: 5,
    },
  },
];

// 7. Night Lords (VIII)
const nightLordsTactica: LegionTactica = {
  id: 'night-lords-tactica',
  legion: LegionFaction.NightLords,
  name: 'A Talent for Murder',
  description:
    'In melee combat, models with this rule gain +1 WS when any enemy model in the same ' +
    'combat has a tactical status (Pinned, Suppressed, Stunned, or Routed).',
  effects: [
    '+1 WS in melee when any enemy in combat has a tactical status (Pinned, Suppressed, Stunned, or Routed)',
  ],
};

const nightLordsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.MeleeWSBonusVsStatus,
    value: 1,
    conditions: {
      targetHasStatus: [
        TacticalStatus.Pinned,
        TacticalStatus.Suppressed,
        TacticalStatus.Stunned,
        TacticalStatus.Routed,
      ],
    },
  },
];

// 8. Blood Angels (IX)
const bloodAngelsTactica: LegionTactica = {
  id: 'blood-angels-tactica',
  legion: LegionFaction.BloodAngels,
  name: 'Encarmine Fury',
  description:
    'On a turn in which this model charges, it gains +1 to its Strength characteristic.',
  effects: ['+1 Strength on charge turn'],
};

const bloodAngelsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.ChargeStrengthBonus,
    value: 1,
    conditions: {
      onChargeTurn: true,
    },
  },
];

// 9. Iron Hands (X)
const ironHandsTactica: LegionTactica = {
  id: 'iron-hands-tactica',
  legion: LegionFaction.IronHands,
  name: 'Inviolate Armour',
  description:
    'When resolving wound tests from ranged attacks against a unit in which all models have ' +
    'this rule, reduce the incoming Strength by 1 (to a minimum of 1).',
  effects: [
    '-1 to incoming ranged Strength for wound tests (only if entire unit has this rule)',
  ],
};

const ironHandsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.IncomingRangedStrengthReduction,
    value: 1,
    conditions: {
      requiresEntireUnit: true,
    },
  },
];

// 10. World Eaters (XII)
const worldEatersTactica: LegionTactica = {
  id: 'world-eaters-tactica',
  legion: LegionFaction.WorldEaters,
  name: 'Berserker Assault',
  description:
    'On a turn in which this model charges, it gains +1 to its Attacks characteristic.',
  effects: ['+1 Attacks on charge turn'],
};

const worldEatersTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.ChargeAttacksBonus,
    value: 1,
    conditions: {
      onChargeTurn: true,
    },
  },
];

// 11. Ultramarines (XIII)
const ultramarinesTactica: LegionTactica = {
  id: 'ultramarines-tactica',
  legion: LegionFaction.Ultramarines,
  name: 'Tactical Flexibility',
  description:
    'Once per turn, a unit in which all models have this rule may reduce the reaction point ' +
    'cost of a single reaction by 1 (to a minimum of 0).',
  effects: [
    'Once per turn, reduce reaction cost by 1 (minimum 0) for units entirely composed of models with this rule',
  ],
};

const ultramarinesTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.ReactionCostReduction,
    value: 1,
    conditions: {
      requiresEntireUnit: true,
    },
  },
];

// 12. Death Guard (XIV)
const deathGuardTactica: LegionTactica = {
  id: 'death-guard-tactica',
  legion: LegionFaction.DeathGuard,
  name: 'Remorseless Advance',
  description:
    'Models with this rule that have moved 4" or less treat Heavy weapons as stationary ' +
    'for the purposes of shooting. In addition, they ignore any movement penalty from ' +
    'difficult terrain.',
  effects: [
    'Heavy weapons count as stationary after moving 4" or less',
    'Ignore difficult terrain movement penalty',
  ],
};

const deathGuardTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.HeavyAfterLimitedMove,
    value: 4,
  },
  {
    type: LegionTacticaEffectType.IgnoreDifficultTerrainPenalty,
  },
];

// 13. Thousand Sons (XV)
const thousandSonsTactica: LegionTactica = {
  id: 'thousand-sons-tactica',
  legion: LegionFaction.ThousandSons,
  name: 'Arcane Mastery',
  description:
    'Models with this rule gain +1 to their Willpower characteristic. In addition, all ' +
    'models with this rule gain the Psyker trait.',
  effects: ['+1 Willpower', 'All models gain Psyker trait'],
};

const thousandSonsTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.WillpowerBonus,
    value: 1,
  },
  {
    type: LegionTacticaEffectType.GrantPsykerTrait,
  },
];

// 14. Sons of Horus (XVI)
const sonsOfHorusTactica: LegionTactica = {
  id: 'sons-of-horus-tactica',
  legion: LegionFaction.SonsOfHorus,
  name: 'Merciless Fighters',
  description:
    'When making Volley attacks, models with this rule fire at their full Ballistic Skill ' +
    'rather than as snap shots.',
  effects: ['Volley attacks at full BS (not snap shots)'],
};

const sonsOfHorusTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.VolleyFullBS,
  },
];

// 15. Word Bearers (XVII)
const wordBearersTactica: LegionTactica = {
  id: 'word-bearers-tactica',
  legion: LegionFaction.WordBearers,
  name: 'True Believers',
  description:
    'During combat resolution, a unit gains +1 CRP if any friendly model in the combat ' +
    'has the Word Bearers trait.',
  effects: ['+1 CRP in combat resolution when any friendly model has Word Bearers trait'],
};

const wordBearersTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.CombatResolutionBonus,
    value: 1,
  },
];

// 16. Salamanders (XVIII)
const salamandersTactica: LegionTactica = {
  id: 'salamanders-tactica',
  legion: LegionFaction.Salamanders,
  name: 'Strength of Will',
  description:
    'In a unit where all models have this rule, wound test rolls of 1 or 2 targeting the ' +
    'unit always fail regardless of the Strength vs Toughness comparison. In addition, ' +
    'such units are immune to Panic caused by weapons with the Flame trait.',
  effects: [
    'Wound test rolls of 1 or 2 always fail (entire unit must have this rule)',
    'Immune to Panic from Flame weapons (entire unit must have this rule)',
  ],
};

const salamandersTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.MinimumWoundRoll,
    value: 2,
    conditions: {
      requiresEntireUnit: true,
    },
  },
  {
    type: LegionTacticaEffectType.PanicImmunityFromTrait,
    conditions: {
      immunityTriggerTrait: 'Flame',
      requiresEntireUnit: true,
    },
  },
];

// 17. Raven Guard (XIX)
const ravenGuardTactica: LegionTactica = {
  id: 'raven-guard-tactica',
  legion: LegionFaction.RavenGuard,
  name: 'By Wing and Talon',
  description:
    'In a unit where all models have this rule, all ranged attacks targeting the unit at a ' +
    'range of 18" or more must be resolved as snap shots.',
  effects: [
    'All ranged attacks must be snap shots at 18"+ range (entire unit must have this rule)',
  ],
};

const ravenGuardTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.ForceSnapShotsAtRange,
    value: 18,
    conditions: {
      requiresEntireUnit: true,
    },
  },
];

// 18. Alpha Legion (XX)
const alphaLegionTactica: LegionTactica = {
  id: 'alpha-legion-tactica',
  legion: LegionFaction.AlphaLegion,
  name: 'Mutable Tactics',
  description:
    'Models with this rule are considered to be +2" further away for the purposes of enemy ' +
    'range calculations, including shooting, charges, and reactions.',
  effects: [
    '+2" virtual distance for enemy range calculations (shooting, charges, reactions)',
  ],
};

const alphaLegionTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.VirtualRangeIncrease,
    value: 2,
  },
];

// 19. Emperor's Children Hereticus
const emperorsChildrenHereticusTactica: LegionTactica = {
  id: 'emperors-children-hereticus-tactica',
  legion: LegionFaction.EmperorsChildren,
  name: 'Stupefied',
  description:
    'After a unit with this rule is targeted by a shooting attack, the controlling player ' +
    'may choose to apply the Stupefied tactical status to that unit.',
  effects: ['After being shot, may choose Stupefied tactical status'],
};

const emperorsChildrenHereticusTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.StupefiedStatusOption,
  },
];

// 20. World Eaters Hereticus
const worldEatersHereticusTactica: LegionTactica = {
  id: 'world-eaters-hereticus-tactica',
  legion: LegionFaction.WorldEaters,
  name: 'Lost to the Nails',
  description:
    'After a model with this rule fails a Leadership check, the controlling player may ' +
    'choose to apply the Lost to the Nails tactical status to its unit.',
  effects: ['After failed LD check, may choose Lost to the Nails tactical status'],
};

const worldEatersHereticusTacticaEffects: LegionTacticaEffect[] = [
  {
    type: LegionTacticaEffectType.LostToTheNailsStatusOption,
  },
];

// ─── Exported Collections ────────────────────────────────────────────────────

/**
 * All 20 Legion Tactica definitions (18 base + 2 Hereticus).
 */
export const LEGION_TACTICAS: LegionTactica[] = [
  darkAngelsTactica,
  emperorsChildrenTactica,
  ironWarriorsTactica,
  whiteScarsTactica,
  spaceWolvesTactica,
  imperialFistsTactica,
  nightLordsTactica,
  bloodAngelsTactica,
  ironHandsTactica,
  worldEatersTactica,
  ultramarinesTactica,
  deathGuardTactica,
  thousandSonsTactica,
  sonsOfHorusTactica,
  wordBearersTactica,
  salamandersTactica,
  ravenGuardTactica,
  alphaLegionTactica,
  emperorsChildrenHereticusTactica,
  worldEatersHereticusTactica,
];

/**
 * Structured effects for each tactica, keyed by tactica id.
 * Used by the engine pipeline to apply mechanical effects.
 */
export const LEGION_TACTICA_EFFECTS: Record<string, LegionTacticaEffect[]> = {
  [darkAngelsTactica.id]: darkAngelsTacticaEffects,
  [emperorsChildrenTactica.id]: emperorsChildrenTacticaEffects,
  [ironWarriorsTactica.id]: ironWarriorsTacticaEffects,
  [whiteScarsTactica.id]: whiteScarsTacticaEffects,
  [spaceWolvesTactica.id]: spaceWolvesTacticaEffects,
  [imperialFistsTactica.id]: imperialFistsTacticaEffects,
  [nightLordsTactica.id]: nightLordsTacticaEffects,
  [bloodAngelsTactica.id]: bloodAngelsTacticaEffects,
  [ironHandsTactica.id]: ironHandsTacticaEffects,
  [worldEatersTactica.id]: worldEatersTacticaEffects,
  [ultramarinesTactica.id]: ultramarinesTacticaEffects,
  [deathGuardTactica.id]: deathGuardTacticaEffects,
  [thousandSonsTactica.id]: thousandSonsTacticaEffects,
  [sonsOfHorusTactica.id]: sonsOfHorusTacticaEffects,
  [wordBearersTactica.id]: wordBearersTacticaEffects,
  [salamandersTactica.id]: salamandersTacticaEffects,
  [ravenGuardTactica.id]: ravenGuardTacticaEffects,
  [alphaLegionTactica.id]: alphaLegionTacticaEffects,
  [emperorsChildrenHereticusTactica.id]: emperorsChildrenHereticusTacticaEffects,
  [worldEatersHereticusTactica.id]: worldEatersHereticusTacticaEffects,
};

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Find the base Legion Tactica for a given legion faction.
 * Returns the first tactica matching the legion (the base tactica, not Hereticus variants).
 */
export function findLegionTactica(
  legion: ArmyFaction,
): LegionTactica | undefined {
  return LEGION_TACTICAS.find((t) => t.legion === legion);
}

/**
 * Get the structured engine effects for a given tactica id.
 * Returns an empty array if the id is not found.
 */
export function getLegionTacticaEffects(
  tacticaId: string,
): LegionTacticaEffect[] {
  return LEGION_TACTICA_EFFECTS[tacticaId] ?? [];
}

/**
 * Get the structured engine effects for a legion's default (base) tactica.
 * Convenience function for pipeline integration — looks up the legion's base
 * tactica and returns its effects. Returns empty array if none found.
 */
export function getTacticaEffectsForLegion(
  legion: ArmyFaction,
): LegionTacticaEffect[] {
  const tactica = findLegionTactica(legion);
  if (!tactica) return [];
  return getLegionTacticaEffects(tactica.id);
}
