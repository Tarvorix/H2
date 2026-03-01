/**
 * Legion Gambit data definitions for all 18 Legiones Astartes + 3 additional gambits.
 *
 * Each gambit is a legion-specific option available during the Face-Off step of
 * the Challenge Sub-Phase. Models with the appropriate legion trait may select
 * their legion's gambit instead of one of the 9 core gambits.
 *
 * The structured fields on LegionGambitDefinition allow the engine to process
 * these without string-parsing. The description field contains the full rules text
 * summary for display.
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "GAMBIT" subsections
 */

import { LegionFaction } from '@hh/types';
import type { LegionGambitDefinition } from '@hh/types';

// ═══════════════════════════════════════════════════════════════════════════════
// I — DARK ANGELS: Sword of the Order
// ═══════════════════════════════════════════════════════════════════════════════

const daSwordOfOrder: LegionGambitDefinition = {
  id: 'da-sword-of-order',
  name: 'Sword of the Order',
  legion: LegionFaction.DarkAngels,
  description:
    'This Gambit may be chosen when using sword Weapons in Challenges. If selected, as long ' +
    'as the model is declared to be using a chainsword, power sword, force sword, paragon blade, ' +
    'or weapon with the Sword of the Order trait, in Step 3 of the Challenge Sub-Phase that ' +
    'weapon\'s Attacks Modifier is modified by -1, and it gains Critical Hit (6+), or improves ' +
    'existing Critical Hit (X) by +1.',
  requiresWeaponTrait: ['Sword of the Order'],
  requiresWeaponNamePattern: ['chainsword', 'power sword', 'force sword', 'paragon blade'],
  attacksModifier: -1,
  grantWeaponSpecialRule: { name: 'Critical Hit', value: '6+' },
  improveWeaponSpecialRule: { name: 'Critical Hit', improvement: 1 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// III — EMPEROR'S CHILDREN: Paragon of Excellence
// ═══════════════════════════════════════════════════════════════════════════════

const ecParagon: LegionGambitDefinition = {
  id: 'ec-paragon',
  name: 'Paragon of Excellence',
  legion: LegionFaction.EmperorsChildren,
  description:
    'This Gambit can only be selected during the first Face-Off Step of a Challenge involving ' +
    'this model. While selected, during the Focus Step the Controlling Player gains a +2 modifier ' +
    'to the Focus Roll.',
  firstFaceOffOnly: true,
  focusRollModifier: 2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// IV — IRON WARRIORS: Spiteful Demise
// ═══════════════════════════════════════════════════════════════════════════════

const iwSpitefulDemise: LegionGambitDefinition = {
  id: 'iw-spiteful-demise',
  name: 'Spiteful Demise',
  legion: LegionFaction.IronWarriors,
  description:
    '"Death is no excuse for incompetence." If this model loses its last Wound during the ' +
    'following Strike Step, the Controlling Player may inflict a single automatic Hit on the ' +
    'opposing model resolved with: S6, AP4, D2, Breaching (5+).',
  onDeathAutoHit: {
    strength: 6,
    ap: 4,
    damage: 2,
    specialRules: [{ name: 'Breaching', value: '5+' }],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// V — WHITE SCARS: Path of the Warrior
// ═══════════════════════════════════════════════════════════════════════════════

const wsPathOfWarrior: LegionGambitDefinition = {
  id: 'ws-path-of-warrior',
  name: 'Path of the Warrior',
  legion: LegionFaction.WhiteScars,
  description:
    'Before making the Focus Roll, the Controlling Player must declare "Strike Low" (predicting ' +
    'result 1-3 before modifiers) or "Strike High" (predicting result 4-6 before modifiers). If ' +
    'the unmodified Focus Roll result matches the prediction, the player may ignore all negative ' +
    'modifiers and only apply positive modifiers to their Focus Roll.',
  predictionMechanic: {
    ranges: [
      { name: 'Strike Low', min: 1, max: 3 },
      { name: 'Strike High', min: 4, max: 6 },
    ],
    onCorrect: 'ignoreAllNegativeModifiers',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VI — SPACE WOLVES: Wolves of Fenris
// ═══════════════════════════════════════════════════════════════════════════════

const swWolvesOfFenris: LegionGambitDefinition = {
  id: 'sw-wolves-of-fenris',
  name: 'Wolves of Fenris',
  legion: LegionFaction.SpaceWolves,
  description:
    'When this Gambit is selected, the Opposing Player may never choose to move to the Glory ' +
    'Step, regardless of who has Challenge Advantage, who is the Active Player, or any other ' +
    'Gambit or Special Rule effects, until one or both models are Removed as Casualties. ' +
    'The Challenge only ends when one or both models die.',
  preventGloryChoice: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// VI — SPACE WOLVES: Saga of the Warrior
// ═══════════════════════════════════════════════════════════════════════════════

const swSagaOfWarrior: LegionGambitDefinition = {
  id: 'sw-saga-of-warrior',
  name: 'Saga of the Warrior',
  legion: LegionFaction.SpaceWolves,
  description:
    'If a model with this Gambit selected is the winner of the Challenge and the opposing model ' +
    'is Removed as a Casualty, all models in the same Unit as the winning model gain +1 to their ' +
    'Attacks characteristic in the following Fight Sub-Phase.',
  onKillUnitBonus: {
    attacksModifier: 1,
    duration: 'nextFightSubPhase',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VII — IMPERIAL FISTS: A Wall Unyielding
// ═══════════════════════════════════════════════════════════════════════════════

const ifWallUnyielding: LegionGambitDefinition = {
  id: 'if-wall-unyielding',
  name: 'A Wall Unyielding',
  legion: LegionFaction.ImperialFists,
  description:
    'While this Gambit is selected, the Controlling Player does not add their Combat Initiative ' +
    'to the result of the Focus Roll, but gains Eternal Warrior (1) for the duration of the ' +
    'Strike Step.',
  excludeCombatInitiative: true,
  grantEternalWarrior: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// VIII — NIGHT LORDS: Nostraman Courage
// ═══════════════════════════════════════════════════════════════════════════════

const nlNostramanCourage: LegionGambitDefinition = {
  id: 'nl-nostraman-courage',
  name: 'Nostraman Courage',
  legion: LegionFaction.NightLords,
  description:
    'This Gambit may only be selected once per Challenge. At the start of the Focus Step, the ' +
    'model\'s Controlling Player may return the model to their Unit. If they do, they must select ' +
    'another model from the Unit (even one not normally eligible for a Challenge). That model ' +
    'replaces the original as the Challenger or Challenged model.',
  oncePerChallenge: true,
  allowModelSwap: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// IX — BLOOD ANGELS: Thrall of the Red Thirst
// ═══════════════════════════════════════════════════════════════════════════════

const baRedThirst: LegionGambitDefinition = {
  id: 'ba-red-thirst',
  name: 'Thrall of the Red Thirst',
  legion: LegionFaction.BloodAngels,
  description:
    'The model may ignore any negative modifiers applied to the Focus Roll for Wounds lost, and ' +
    'each wound inflicted on the opponent has its Damage modified by +1. While selected, the ' +
    'model gains no bonus to the Focus Roll from Outside Support.',
  damageModifier: 1,
  gainsOutsideSupport: false,
  ignoreWoundNegativeModifiers: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// X — IRON HANDS: Legion of One
// ═══════════════════════════════════════════════════════════════════════════════

const ihLegionOfOne: LegionGambitDefinition = {
  id: 'ih-legion-of-one',
  name: 'Legion of One',
  legion: LegionFaction.IronHands,
  description:
    'The model gains double the normal bonus to their Focus Roll from Outside Support. In ' +
    'addition, the opponent can only gain a maximum bonus of +2 from Outside Support.',
  outsideSupportMultiplier: 2,
  maxOpponentOutsideSupport: 2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII — WORLD EATERS: Violent Overkill
// ═══════════════════════════════════════════════════════════════════════════════

const weViolentOverkill: LegionGambitDefinition = {
  id: 'we-violent-overkill',
  name: 'Violent Overkill',
  legion: LegionFaction.WorldEaters,
  description:
    'During the Strike Step, if the other model in the Challenge is Removed as a Casualty, any ' +
    'remaining wounds must be allocated to other eligible enemy models in the same Combat using ' +
    'normal wound allocation rules.',
  excessWoundsSpill: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIII — ULTRAMARINES: Aegis of Wisdom
// ═══════════════════════════════════════════════════════════════════════════════

const umAegisOfWisdom: LegionGambitDefinition = {
  id: 'um-aegis-of-wisdom',
  name: 'Aegis of Wisdom',
  legion: LegionFaction.Ultramarines,
  description:
    'The Controlling Player gains no Outside Support bonus to their Focus Roll. Instead, add ' +
    'a +1 modifier to the Focus Roll for every friendly model with both the Command Sub-Type ' +
    'and the Ultramarines trait on the Battlefield (excluding the model in the Challenge).',
  gainsOutsideSupport: false,
  alternativeOutsideSupportSubType: 'Command',
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIV — DEATH GUARD: Steadfast Resilience
// ═══════════════════════════════════════════════════════════════════════════════

const dgSteadfastResilience: LegionGambitDefinition = {
  id: 'dg-steadfast-resilience',
  name: 'Steadfast Resilience',
  legion: LegionFaction.DeathGuard,
  description:
    'If this Gambit is selected, the Toughness characteristic of the model is replaced with the ' +
    'base Weapon Skill characteristic of the opposing model for the duration of the following ' +
    'Strike Step. This makes tougher warriors proportionally harder to wound.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// XV — THOUSAND SONS: Prophetic Duellist
// ═══════════════════════════════════════════════════════════════════════════════

const tsPropheticDuellist: LegionGambitDefinition = {
  id: 'ts-prophetic-duellist',
  name: 'Prophetic Duellist',
  legion: LegionFaction.ThousandSons,
  description:
    'After the Controlling Player makes their Focus Roll in the Focus Step, they may choose to ' +
    'replace the result of the Focus Roll (after modifiers) with the model\'s Willpower ' +
    'characteristic.',
  replaceWithCharacteristic: 'WP',
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVI — SONS OF HORUS: Merciless Strike
// ═══════════════════════════════════════════════════════════════════════════════

const sohMercilessStrike: LegionGambitDefinition = {
  id: 'soh-merciless-strike',
  name: 'Merciless Strike',
  legion: LegionFaction.SonsOfHorus,
  description:
    'This Gambit can only be selected during the first Face-Off Step. While selected, any weapon ' +
    'this model uses during the Challenge gains the Phage (T) Special Rule for the duration of ' +
    'the Strike Step.',
  firstFaceOffOnly: true,
  grantTraitEffect: { name: 'Phage', value: 'T' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVII — WORD BEARERS: Beseech the Gods
// ═══════════════════════════════════════════════════════════════════════════════

const wbBeseechTheGods: LegionGambitDefinition = {
  id: 'wb-beseech-the-gods',
  name: 'Beseech the Gods',
  legion: LegionFaction.WordBearers,
  description:
    'This Gambit can only be selected during the first Face-Off Step. The Controlling Player ' +
    'immediately makes a Willpower Check. If passed, the model gains +1 Strength and +1 Attacks ' +
    'until the end of the Challenge Sub-Phase. If failed, the model suffers 1 wound with AP 2, ' +
    'Damage 1, against which no saves or Damage Mitigation Rolls may be taken.',
  firstFaceOffOnly: true,
  willpowerCheck: {
    passEffect: { strength: 1, attacks: 1 },
    failEffect: { wound: { ap: 2, damage: 1, savesAllowed: false } },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVIII — SALAMANDERS: Duty is Sacrifice
// ═══════════════════════════════════════════════════════════════════════════════

const salDutyIsSacrifice: LegionGambitDefinition = {
  id: 'sal-duty-is-sacrifice',
  name: 'Duty is Sacrifice',
  legion: LegionFaction.Salamanders,
  description:
    'The Controlling Player can add a bonus of 1, 2, or 3 to their Focus Roll. In the Apply ' +
    'Damage step of the opponent\'s Strike Step, the model suffers a number of wounds equal to ' +
    'the bonus chosen, each with AP 5 and Damage 1, against which only Armour Saves, Invulnerable ' +
    'Saves, and Damage Mitigation rolls can be taken.',
  selfDamageForFocusBonus: {
    maxWounds: 3,
    ap: 5,
    damage: 1,
    allowedSaves: ['armour', 'invulnerable', 'damageMitigation'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIX — RAVEN GUARD: Decapitation Strike
// ═══════════════════════════════════════════════════════════════════════════════

const rgDecapitationStrike: LegionGambitDefinition = {
  id: 'rg-decapitation-strike',
  name: 'Decapitation Strike',
  legion: LegionFaction.RavenGuard,
  description:
    'May be selected once per Challenge. No Focus Roll is made. Instead, at the end of the ' +
    'Focus Step, the Controlling Player makes a single attack. If both the Hit Test and Wound ' +
    'Test succeed, the model may then make the remainder of its attacks (minus the one already ' +
    'made) in the current Strike Step. If either test fails, the model makes no further attacks ' +
    'during this Strike Step.',
  oncePerChallenge: true,
  testAttackMechanic: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// XX — ALPHA LEGION: I Am Alpharius
// ═══════════════════════════════════════════════════════════════════════════════

const alIAmAlpharius: LegionGambitDefinition = {
  id: 'al-i-am-alpharius',
  name: 'I Am Alpharius',
  legion: LegionFaction.AlphaLegion,
  description:
    'This Gambit can only be selected during the first Face-Off Step. The opposing model in the ' +
    'Challenge has its Combat Initiative set to 1 until the end of the Strike Step.',
  firstFaceOffOnly: true,
  setEnemyCombatInitiative: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// III-H — EMPEROR'S CHILDREN HERETICUS GAMBIT
// ═══════════════════════════════════════════════════════════════════════════════

const ecHStupefiedGambit: LegionGambitDefinition = {
  id: 'ec-h-stupefied-gambit',
  name: "Stupefied Grandeur",
  legion: LegionFaction.EmperorsChildren,
  description:
    'The model gains double the normal modifier for Outside Support during the Focus Step. If ' +
    'the Unit this model is part of is Stupefied, add an additional modifier of +1 to the Focus ' +
    'Roll. This Gambit is only available when using the Emperor\'s Children Legiones Hereticus ' +
    'Rite of War (Traitor Allegiance).',
  outsideSupportMultiplier: 2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII-H — WORLD EATERS HERETICUS GAMBIT
// ═══════════════════════════════════════════════════════════════════════════════

const weHNailsGambit: LegionGambitDefinition = {
  id: 'we-h-nails-gambit',
  name: 'Skull Trophy',
  legion: LegionFaction.WorldEaters,
  description:
    'While this Gambit is selected, if the enemy model is Removed as a Casualty during the ' +
    'Strike Step, the Controlling Player gains 2 additional Combat Resolution Points during the ' +
    'subsequent Glory Step. This Gambit is only available when using the World Eaters Legiones ' +
    'Hereticus Rite of War (Traitor Allegiance).',
  crpBonusOnKill: 2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED ARRAY + UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All 21 legion gambit definitions.
 * 18 standard (one per legion, Space Wolves has 2) + 2 Hereticus (EC-H, WE-H).
 */
export const LEGION_GAMBITS: LegionGambitDefinition[] = [
  daSwordOfOrder,
  ecParagon,
  iwSpitefulDemise,
  wsPathOfWarrior,
  swWolvesOfFenris,
  swSagaOfWarrior,
  ifWallUnyielding,
  nlNostramanCourage,
  baRedThirst,
  ihLegionOfOne,
  weViolentOverkill,
  umAegisOfWisdom,
  dgSteadfastResilience,
  tsPropheticDuellist,
  sohMercilessStrike,
  wbBeseechTheGods,
  salDutyIsSacrifice,
  rgDecapitationStrike,
  alIAmAlpharius,
  ecHStupefiedGambit,
  weHNailsGambit,
];

/** Index by id for fast lookup */
const GAMBITS_BY_ID: Record<string, LegionGambitDefinition> = {};
for (const gambit of LEGION_GAMBITS) {
  GAMBITS_BY_ID[gambit.id] = gambit;
}

/**
 * Look up a legion gambit by its unique ID.
 */
export function findLegionGambit(id: string): LegionGambitDefinition | undefined {
  return GAMBITS_BY_ID[id];
}

/**
 * Get all gambits available to a specific legion.
 * This includes all standard gambits for the legion plus any Hereticus gambits.
 */
export function getLegionGambitsForLegion(legion: LegionFaction): LegionGambitDefinition[] {
  return LEGION_GAMBITS.filter(g => g.legion === legion);
}
