/**
 * Rite of War data definitions for all 18 Legiones Astartes + 2 Hereticus rites.
 *
 * Each Rite of War bundles together:
 *  - A Legion Tactica (passive army-wide rule)
 *  - An Advanced Reaction (phase-interrupting ability)
 *  - A Legion Gambit (challenge-specific ability)
 *  - A Prime Advantage (upgrade for a unit filling a Prime Force Org Slot)
 *  - Additional Detachments (Auxiliary/Apex detachments unique to the legion)
 *  - Benefits and Restrictions (structured for army builder validation)
 *
 * Reference: HH_Legiones_Astartes.md — all legion "Rite of War" sections
 */

import { LegionFaction, Allegiance } from '@hh/types';
import type { RiteOfWarDefinition } from '@hh/types';

// ═══════════════════════════════════════════════════════════════════════════════
// I — DARK ANGELS: The Hexagrammaton
// ═══════════════════════════════════════════════════════════════════════════════

const darkAngelsRite: RiteOfWarDefinition = {
  id: 'dark-angels-hexagrammaton',
  name: 'The Hexagrammaton',
  legion: LegionFaction.DarkAngels,
  description:
    'The Dark Angels are organised into six specialised Wings of the Hexagrammaton, each with a ' +
    'distinct tactical role. This Rite of War reflects the full panoply of the First Legion, with ' +
    'access to dedicated Ironwing, Dreadwing, Stormwing, Deathwing, Ravenwing, and Firewing formations.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with the Dark Angels trait gain the Resolve of the First tactica',
      effect: { tacticaId: 'dark-angels-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Paladin of the Hekatonystika Prime Advantage available',
      effect: { primeAdvantageName: 'Paladin of the Hekatonystika' },
    },
    {
      type: 'armyModifier',
      description: 'Vengeance of the First Legion Advanced Reaction available',
      effect: { advancedReactionId: 'da-vengeance' },
    },
    {
      type: 'armyModifier',
      description: 'Sword of the Order Gambit available during Challenges',
      effect: { gambitId: 'da-sword-of-order' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'dark-angels-tactica',
  advancedReactionId: 'da-vengeance',
  gambitId: 'da-sword-of-order',
  primeAdvantage: {
    name: 'Paladin of the Hekatonystika',
    description:
      'A Centurion or Centurion with Jump Pack with the Dark Angels trait filling a Prime slot ' +
      'gains enhanced combat abilities and a Terranic greatsword.',
    effects: [
      'One model in the Unit gains +1 to base Weapon Skill',
      'Must exchange bolter for a Terranic greatsword (Free)',
      'Gains the Order Exemplars Special Rule',
      'Terminator variant: exchanges power weapon for Terranic greatsword instead',
    ],
  },
  additionalDetachments: [
    {
      name: 'Ironwing Gauntlet',
      type: 'Auxiliary',
      description: 'Armoured force from the Ironwing, providing tactically flexible tanks and transports.',
      slots: ['Command', 'Troops', 'Troops', 'Armour', 'Armour', 'Armour', 'Heavy Transport', 'Transport', 'Transport'],
    },
    {
      name: 'Dreadwing Cadre',
      type: 'Auxiliary',
      description: 'Specialists in utter annihilation. Support Slots limited to Dreadwing Interemptor or Rapier Battery Units.',
      slots: ['Command', 'Troops', 'Support', 'Support', 'Heavy Assault'],
    },
    {
      name: 'Stormwing Muster',
      type: 'Auxiliary',
      description: 'Heavy infantry formation practising the First Legion\'s earliest doctrines.',
      slots: ['Command', 'Troops', 'Troops', 'Troops', 'Support', 'Heavy Assault'],
    },
    {
      name: 'Deathwing Conclave',
      type: 'Auxiliary',
      description: 'Elite fighting division of the deadliest and most experienced warriors.',
      slots: ['Command', 'Retinue', 'Elites', 'Heavy Assault', 'Heavy Transport'],
    },
    {
      name: 'Ravenwing Lance',
      type: 'Auxiliary',
      description: 'Fleet and deadly fast attack formation. Recon limited to Outrider Squadron Units.',
      slots: ['Command', 'Fast Attack', 'Fast Attack', 'Recon', 'Recon'],
    },
    {
      name: 'Firewing Echelon',
      type: 'Auxiliary',
      description: 'Hunter-killer formation. Elites Slots limited to Seeker Squad Units.',
      slots: ['Command', 'Elites', 'Elites', 'Recon', 'Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// III — EMPEROR'S CHILDREN: The Flawless Host
// ═══════════════════════════════════════════════════════════════════════════════

const emperorsChildrenRite: RiteOfWarDefinition = {
  id: 'emperors-children-flawless-host',
  name: 'The Flawless Host',
  legion: LegionFaction.EmperorsChildren,
  description:
    'The Emperor\'s Children strive for perfection in all things. Their battle doctrine favours ' +
    'speed and precision, with elite warriors leading devastating shock assaults.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with the Emperor\'s Children trait gain +1 Combat Initiative on charge',
      effect: { tacticaId: 'emperors-children-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Phoenix Warden Prime Advantage available',
      effect: { primeAdvantageName: 'Phoenix Warden' },
    },
    {
      type: 'armyModifier',
      description: 'Perfect Counter Advanced Reaction available',
      effect: { advancedReactionId: 'ec-perfect-counter' },
    },
    {
      type: 'armyModifier',
      description: 'Paragon of Excellence Gambit available during Challenges',
      effect: { gambitId: 'ec-paragon' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'emperors-children-tactica',
  advancedReactionId: 'ec-perfect-counter',
  gambitId: 'ec-paragon',
  primeAdvantage: {
    name: 'Phoenix Warden',
    description:
      'A Tartaros Centurion with the Emperor\'s Children trait filling a Prime slot gains enhanced ' +
      'combat equipment and skills.',
    effects: [
      'Must exchange combi-bolter and power weapon for a Phoenix power spear (Free)',
      'Gains the Skill Unmatched Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Primacy Wing',
      type: 'Auxiliary',
      description: 'Elite bladesmen supported by fast-moving support elements.',
      slots: ['Command', 'Retinue', 'Elites', 'Elites', 'Fast Attack', 'Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// III-H — EMPEROR'S CHILDREN: Legiones Hereticus
// ═══════════════════════════════════════════════════════════════════════════════

const emperorsChildrenHereticusRite: RiteOfWarDefinition = {
  id: 'emperors-children-hereticus',
  name: 'Legiones Hereticus (Emperor\'s Children)',
  legion: LegionFaction.EmperorsChildren,
  requiredAllegiance: Allegiance.Traitor,
  isHereticus: true,
  description:
    'The fallen Emperor\'s Children have become debased and twisted degenerates. Units may choose ' +
    'to become Stupefied after being targeted by a Shooting Attack, gaining FNP and +1 Strength ' +
    'but losing reactions and shooting accuracy.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Emperor\'s Children models gain the Stupefied Status option tactica',
      effect: { tacticaId: 'emperors-children-hereticus-tactica' },
    },
    {
      type: 'armyModifier',
      description: 'Twisted Desire Advanced Reaction available',
      effect: { advancedReactionId: 'ec-h-twisted-desire' },
    },
    {
      type: 'armyModifier',
      description: 'Stupefied Grandeur Gambit available during Challenges',
      effect: { gambitId: 'ec-h-stupefied-gambit' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'Requires Traitor Allegiance',
      restriction: { allegiance: Allegiance.Traitor },
    },
  ],
  tacticaId: 'emperors-children-hereticus-tactica',
  advancedReactionId: 'ec-h-twisted-desire',
  gambitId: 'ec-h-stupefied-gambit',
  primeAdvantage: {
    name: 'Phoenix Warden',
    description: 'Same as standard Emperor\'s Children rite — Phoenix Warden Prime Advantage.',
    effects: [
      'Must exchange combi-bolter and power weapon for a Phoenix power spear (Free)',
      'Gains the Skill Unmatched Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Brotherhood of the Phoenix',
      type: 'Auxiliary',
      description:
        'Selected instead of a Warlord Detachment. Must include a Fulgrim Transfigured Unit. ' +
        'High Command and Command Units do not grant additional Auxiliary or Apex Detachments. ' +
        'Requires 3,000+ Points.',
      slots: ['Warlord', 'High Command', 'Command', 'Retinue', 'Elites', 'Elites', 'Fast Attack'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// IV — IRON WARRIORS: The Iron Cage
// ═══════════════════════════════════════════════════════════════════════════════

const ironWarriorsRite: RiteOfWarDefinition = {
  id: 'iron-warriors-iron-cage',
  name: 'The Iron Cage',
  legion: LegionFaction.IronWarriors,
  description:
    'The Iron Warriors specialise in siege warfare and attrition, using murderous firepower as their ' +
    'principal weapon. They favour heavy armour and fortifications over personal valor.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with the Iron Warriors trait ignore negative LD/Cool modifiers from status-inflicting rules',
      effect: { tacticaId: 'iron-warriors-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'The Unfavoured Prime Advantage available',
      effect: { primeAdvantageName: 'The Unfavoured' },
    },
    {
      type: 'armyModifier',
      description: 'Bitter Fury Advanced Reaction available',
      effect: { advancedReactionId: 'iw-bitter-fury' },
    },
    {
      type: 'armyModifier',
      description: 'Spiteful Demise Gambit available during Challenges',
      effect: { gambitId: 'iw-spiteful-demise' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'iron-warriors-tactica',
  advancedReactionId: 'iw-bitter-fury',
  gambitId: 'iw-spiteful-demise',
  primeAdvantage: {
    name: 'The Unfavoured',
    description:
      'A unit with the Iron Warriors trait composed only of Infantry models filling a Prime slot ' +
      'gains Expendable status.',
    effects: [
      'All models in the Unit gain the Expendable (1) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'The Ironfire Cohort',
      type: 'Auxiliary',
      description: 'Siege doctrine for rapid capture of strongholds. Armour Slots must be filled with Arquitor Bombard Units.',
      slots: ['Command', 'Troops', 'Troops', 'Armour', 'Armour', 'Support'],
    },
    {
      name: 'The Hammer of Olympia',
      type: 'Apex',
      description:
        'Unyielding close-range attack formation. May only be selected if the Army also contains ' +
        'a Warsmith or Perturabo Unit.',
      slots: ['Command', 'Retinue', 'Troops', 'Troops', 'Heavy Assault', 'Heavy Assault', 'Heavy Transport', 'Armour'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// V — WHITE SCARS: The Steppe Brotherhood
// ═══════════════════════════════════════════════════════════════════════════════

const whiteScarsRite: RiteOfWarDefinition = {
  id: 'white-scars-steppe-brotherhood',
  name: 'The Steppe Brotherhood',
  legion: LegionFaction.WhiteScars,
  description:
    'The White Scars excel at hit-and-run warfare and rapid manoeuvring. Their warriors possess ' +
    'an innate ability to spring into action and cross the battlefield at speed.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with the White Scars trait gain optional +2 Movement at start of controlling player\'s turn',
      effect: { tacticaId: 'white-scars-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'The Sagyar Mazan Prime Advantage available',
      effect: { primeAdvantageName: 'The Sagyar Mazan' },
    },
    {
      type: 'armyModifier',
      description: 'Chasing the Wind Advanced Reaction available',
      effect: { advancedReactionId: 'ws-chasing-wind' },
    },
    {
      type: 'armyModifier',
      description: 'Path of the Warrior Gambit available during Challenges',
      effect: { gambitId: 'ws-path-of-warrior' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'white-scars-tactica',
  advancedReactionId: 'ws-chasing-wind',
  gambitId: 'ws-path-of-warrior',
  primeAdvantage: {
    name: 'The Sagyar Mazan',
    description:
      'A unit with the White Scars trait composed only of Infantry or Cavalry models filling a ' +
      'Prime slot gains expendable status as penitent warriors seeking honourable death.',
    effects: [
      'All models in the Unit gain the Expendable (2) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Chogorian Warband',
      type: 'Auxiliary',
      description:
        'Mounted formation for harrying campaigns or lightning strike warfare. Fast Attack limited ' +
        'to Scimitar Jetbike Squadron Units. Recon limited to Outrider Squadron Units.',
      slots: ['Command', 'Troops', 'Fast Attack', 'Fast Attack', 'Recon', 'Recon', 'Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VI — SPACE WOLVES: Rout of the Vlka Fenryka
// ═══════════════════════════════════════════════════════════════════════════════

const spaceWolvesRite: RiteOfWarDefinition = {
  id: 'space-wolves-rout',
  name: 'Rout of the Vlka Fenryka',
  legion: LegionFaction.SpaceWolves,
  description:
    'The Space Wolves are relentless hunters who stalk their prey before striking with savage fury. ' +
    'Their warriors make longer set-up moves and fight with unmatched ferocity.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with the Space Wolves trait add +2" to Set-up Move distance (max 6")',
      effect: { tacticaId: 'space-wolves-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Pack Thegn Prime Advantage available',
      effect: { primeAdvantageName: 'Pack Thegn' },
    },
    {
      type: 'armyModifier',
      description: 'Bestial Savagery Advanced Reaction available',
      effect: { advancedReactionId: 'sw-bestial-savagery' },
    },
    {
      type: 'armyModifier',
      description: 'Wolves of Fenris and Saga of the Warrior Gambits available during Challenges',
      effect: { gambitIds: ['sw-wolves-of-fenris', 'sw-saga-of-warrior'] },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'space-wolves-tactica',
  advancedReactionId: 'sw-bestial-savagery',
  gambitId: 'sw-wolves-of-fenris',
  primeAdvantage: {
    name: 'Pack Thegn',
    description:
      'An Optae with the Space Wolves trait filling a Prime slot gains enhanced combat abilities ' +
      'and access to frost weapons.',
    effects: [
      'Base Attacks and Weapon Skill modified by +1',
      'May exchange power sword for one frost sword or frost axe (Free), or frost claw (+5 Points)',
    ],
  },
  additionalDetachments: [
    {
      name: 'Bloodied Claw',
      type: 'Auxiliary',
      description:
        'All-out frontal assault formation combining rapid skirmishers and heavy assault. ' +
        'Troops Slots limited to Grey Slayer Pack Units.',
      slots: ['Command', 'Troops', 'Troops', 'Heavy Assault', 'Heavy Assault', 'Fast Attack'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VII — IMPERIAL FISTS: The Stone Gauntlet
// ═══════════════════════════════════════════════════════════════════════════════

const imperialFistsRite: RiteOfWarDefinition = {
  id: 'imperial-fists-stone-gauntlet',
  name: 'The Stone Gauntlet',
  legion: LegionFaction.ImperialFists,
  description:
    'The Imperial Fists are masters of defensive warfare. Their precision with bolt and auto weapons ' +
    'is unmatched, and their Siege Gauntlet formations provide interlocking defence with calculated ' +
    'bursts of aggression.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with Imperial Fists trait gain +1 to Hit with Bolt/Auto fire groups of 5+ dice',
      effect: { tacticaId: 'imperial-fists-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Castellan Prime Advantage available',
      effect: { primeAdvantageName: 'Castellan' },
    },
    {
      type: 'armyModifier',
      description: 'Bastion of Fire Advanced Reaction available',
      effect: { advancedReactionId: 'if-bastion-of-fire' },
    },
    {
      type: 'armyModifier',
      description: 'A Wall Unyielding Gambit available during Challenges',
      effect: { gambitId: 'if-wall-unyielding' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'imperial-fists-tactica',
  advancedReactionId: 'if-bastion-of-fire',
  gambitId: 'if-wall-unyielding',
  primeAdvantage: {
    name: 'Castellan',
    description:
      'A Centurion with the Imperial Fists trait filling a Prime slot gains an augury scanner and ' +
      'must exchange their bolter for a heavy weapon.',
    effects: [
      'Gains an augury scanner',
      'Cannot select any Centurion listed options',
      'Must exchange bolter for one of: heavy bolter, autocannon, or Iliastus assault cannon (Free)',
    ],
  },
  additionalDetachments: [
    {
      name: 'Siege Gauntlet',
      type: 'Auxiliary',
      description:
        'Interlocking defence with boarding-shield equipped troops and fire support. ' +
        'Troops Slots limited to Breacher Squad Units.',
      slots: ['Command', 'Troops', 'Troops', 'Troops', 'Support', 'Heavy Assault'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VIII — NIGHT LORDS: Terror Assault
// ═══════════════════════════════════════════════════════════════════════════════

const nightLordsRite: RiteOfWarDefinition = {
  id: 'night-lords-terror-assault',
  name: 'Terror Assault',
  legion: LegionFaction.NightLords,
  description:
    'The Night Lords specialise in terror assault tactics conducted under conditions of darkness. ' +
    'They gain combat bonuses against units with tactical statuses and fight with pragmatic self-preservation.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with Night Lords trait gain +1 WS in melee when any enemy in combat has a tactical status',
      effect: { tacticaId: 'night-lords-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Atramentar Prime Advantage available',
      effect: { primeAdvantageName: 'Atramentar' },
    },
    {
      type: 'armyModifier',
      description: 'Better Part of Valour Advanced Reaction available',
      effect: { advancedReactionId: 'nl-better-part' },
    },
    {
      type: 'armyModifier',
      description: 'Nostraman Courage Gambit available during Challenges',
      effect: { gambitId: 'nl-nostraman-courage' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'night-lords-tactica',
  advancedReactionId: 'nl-better-part',
  gambitId: 'nl-nostraman-courage',
  primeAdvantage: {
    name: 'Atramentar',
    description:
      'Terminator models with the Night Lords trait filling a Prime slot gain deep strike and impact ' +
      'capabilities for devastating surprise assaults.',
    effects: [
      'Models gain the Deep Strike Special Rule',
      'Models gain the Impact (I) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Terror Assault',
      type: 'Auxiliary',
      description: 'Infamous terror assault formation. Troops Slots must be filled with Terror Squad Units.',
      slots: ['Command', 'Troops', 'Troops', 'Elites', 'Fast Attack'],
    },
    {
      name: 'Atramentar Hunt',
      type: 'Apex',
      description:
        'The First Company of the Night Lords. Retinue limited to Cataphractii/Tartaros Command Squads. ' +
        'Heavy Assault limited to Cataphractii/Tartaros Terminator Squads. Only Atramentar Prime Advantage allowed.',
      slots: ['Command', 'Retinue', 'Retinue', 'Heavy Assault', 'Heavy Assault', 'Heavy Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// IX — BLOOD ANGELS: Day of Revelation
// ═══════════════════════════════════════════════════════════════════════════════

const bloodAngelsRite: RiteOfWarDefinition = {
  id: 'blood-angels-day-of-revelation',
  name: 'Day of Revelation',
  legion: LegionFaction.BloodAngels,
  description:
    'The Blood Angels deliver devastating shock assaults, their righteous fury unleashed with ' +
    'terrifying strength when they charge into the enemy.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with Blood Angels trait gain +1 Strength on charge turn',
      effect: { tacticaId: 'blood-angels-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Revenants Prime Advantage available',
      effect: { primeAdvantageName: 'Revenants' },
    },
    {
      type: 'armyModifier',
      description: 'Wrath of Angels Advanced Reaction available',
      effect: { advancedReactionId: 'ba-wrath-of-angels' },
    },
    {
      type: 'armyModifier',
      description: 'Thrall of the Red Thirst Gambit available during Challenges',
      effect: { gambitId: 'ba-red-thirst' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'blood-angels-tactica',
  advancedReactionId: 'ba-wrath-of-angels',
  gambitId: 'ba-red-thirst',
  primeAdvantage: {
    name: 'Revenants',
    description:
      'A unit with the Blood Angels trait filling a Prime slot gains the ability to strike fear ' +
      'into the enemy.',
    effects: [
      'Models in the Unit gain the Fear (1) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Revelation Host',
      type: 'Auxiliary',
      description:
        'Assault-focused formation of red-armoured warriors descending from on-high. Troops limited ' +
        'to Assault Squad Units. Elites limited to Dawnbreaker Cohort or Veteran Assault Squad Units.',
      slots: ['Command', 'Troops', 'Troops', 'Elites', 'Elites', 'Fast Attack'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// X — IRON HANDS: The Head of the Gorgon
// ═══════════════════════════════════════════════════════════════════════════════

const ironHandsRite: RiteOfWarDefinition = {
  id: 'iron-hands-head-of-gorgon',
  name: 'The Head of the Gorgon',
  legion: LegionFaction.IronHands,
  description:
    'The Iron Hands are masters of armoured warfare, combining heavy armour with cyber-augmented ' +
    'warriors. Their innate resilience reduces incoming shooting strength.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with Iron Hands trait impose -1 to incoming ranged Strength for wound tests',
      effect: { tacticaId: 'iron-hands-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'The Iron-clad Prime Advantage available',
      effect: { primeAdvantageName: 'The Iron-clad' },
    },
    {
      type: 'armyModifier',
      description: 'Spite of the Gorgon Advanced Reaction available',
      effect: { advancedReactionId: 'ih-spite-of-gorgon' },
    },
    {
      type: 'armyModifier',
      description: 'Legion of One Gambit available during Challenges',
      effect: { gambitId: 'ih-legion-of-one' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'iron-hands-tactica',
  advancedReactionId: 'ih-spite-of-gorgon',
  gambitId: 'ih-legion-of-one',
  primeAdvantage: {
    name: 'The Iron-clad',
    description:
      'A unit with the Iron Hands trait and the Command Battlefield Role filling a Prime slot ' +
      'adds an extra War Engine slot to its detachment.',
    effects: [
      'Add one additional War-Engine Battlefield Role Slot to the detachment',
      'A Unit selected to fill that Slot gains the Champion Sub-Type if it did not already have it',
      'This Prime Advantage can only be selected once per Army',
    ],
  },
  additionalDetachments: [
    {
      name: 'Spearhead Phalanx',
      type: 'Auxiliary',
      description:
        'Armoured warfare formation combining heavy armour with transported troops. Heavy Transport ' +
        'limited to Land Raider Carrier or Spartan Units.',
      slots: ['Command', 'Troops', 'Troops', 'Armour', 'Heavy Transport', 'Heavy Transport'],
    },
    {
      name: 'Medusan Vanguard',
      type: 'Apex',
      description:
        'Terminator and Dreadnought spearhead assault. Command limited to Praevian Unit. Requires ' +
        'Army to include an Iron Father or Ferrus Manus Unit.',
      slots: ['Command', 'Retinue', 'Heavy Assault', 'Heavy Assault', 'War-Engine', 'Heavy Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII — WORLD EATERS: The Berserker Assault
// ═══════════════════════════════════════════════════════════════════════════════

const worldEatersRite: RiteOfWarDefinition = {
  id: 'world-eaters-berserker-assault',
  name: 'The Berserker Assault',
  legion: LegionFaction.WorldEaters,
  description:
    'The World Eaters are savage berserkers whose fury is fuelled by bloodshed. They gain extra ' +
    'attacks on the charge and overwhelm their enemies with unrelenting violence.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle models with World Eaters trait gain +1 Attacks on charge turn',
      effect: { tacticaId: 'world-eaters-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Chain-bonded Prime Advantage available',
      effect: { primeAdvantageName: 'Chain-bonded' },
    },
    {
      type: 'armyModifier',
      description: 'Brutal Tide Advanced Reaction available',
      effect: { advancedReactionId: 'we-brutal-tide' },
    },
    {
      type: 'armyModifier',
      description: 'Violent Overkill Gambit available during Challenges',
      effect: { gambitId: 'we-violent-overkill' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'world-eaters-tactica',
  advancedReactionId: 'we-brutal-tide',
  gambitId: 'we-violent-overkill',
  primeAdvantage: {
    name: 'Chain-bonded',
    description:
      'A unit with World Eaters trait and Command Battlefield Role filling a Prime slot selects ' +
      'another Command unit. One model from each unit gains the Chain-brothers Special Rule.',
    effects: [
      'Select another Unit with World Eaters trait and Command Battlefield Role from your Army',
      'One model in each unit gains the Chain-brothers Special Rule',
      'While within Unit Coherency of each other: +1 to Hit Tests in the Assault Phase',
      'Chain-brothers in the same Combat (including during Challenges) count as in Unit Coherency',
      'Can only be selected once per Army',
    ],
  },
  additionalDetachments: [
    {
      name: 'Berserker Cadre',
      type: 'Auxiliary',
      description: 'Wave after wave of chainaxe-wielding warriors. Heavy Assault limited to Rampager Squad Units.',
      slots: ['Command', 'Troops', 'Troops', 'Heavy Assault', 'Heavy Assault', 'Heavy Assault'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII-H — WORLD EATERS: Legiones Hereticus
// ═══════════════════════════════════════════════════════════════════════════════

const worldEatersHereticusRite: RiteOfWarDefinition = {
  id: 'world-eaters-hereticus',
  name: 'Legiones Hereticus (World Eaters)',
  legion: LegionFaction.WorldEaters,
  requiredAllegiance: Allegiance.Traitor,
  isHereticus: true,
  description:
    'The corrupted World Eaters have been driven deep into madness by the Butcher\'s Nails. Units ' +
    'may choose to become Lost to the Nails when they fail a Leadership Check, gaining bonuses ' +
    'but being forced to charge.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle World Eaters models gain the Lost to the Nails status option tactica',
      effect: { tacticaId: 'world-eaters-hereticus-tactica' },
    },
    {
      type: 'armyModifier',
      description: 'Furious Charge Advanced Reaction available',
      effect: { advancedReactionId: 'we-h-furious-charge' },
    },
    {
      type: 'armyModifier',
      description: 'Skull Trophy Gambit available during Challenges',
      effect: { gambitId: 'we-h-nails-gambit' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'Requires Traitor Allegiance',
      restriction: { allegiance: Allegiance.Traitor },
    },
  ],
  tacticaId: 'world-eaters-hereticus-tactica',
  advancedReactionId: 'we-h-furious-charge',
  gambitId: 'we-h-nails-gambit',
  primeAdvantage: {
    name: 'Chain-bonded',
    description: 'Same as standard World Eaters rite — Chain-bonded Prime Advantage.',
    effects: [
      'Select another Unit with World Eaters trait and Command Battlefield Role from your Army',
      'One model in each unit gains the Chain-brothers Special Rule',
      'While within Unit Coherency of each other: +1 to Hit Tests in the Assault Phase',
      'Can only be selected once per Army',
    ],
  },
  additionalDetachments: [
    {
      name: 'Sons of Bodt',
      type: 'Auxiliary',
      description:
        'Warriors created at the World Eaters\' recruitment centre, driven to battle under ' +
        'butcher-surgeon supervision. Support Slots limited to Apothecary Units.',
      slots: ['Command', 'Troops', 'Troops', 'Support', 'Support', 'Heavy Assault'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIII — ULTRAMARINES: Logos Lectora
// ═══════════════════════════════════════════════════════════════════════════════

const ultramarinesRite: RiteOfWarDefinition = {
  id: 'ultramarines-logos-lectora',
  name: 'Logos Lectora',
  legion: LegionFaction.Ultramarines,
  description:
    'The Ultramarines employ sophisticated command and control protocols through interlocking ' +
    'formations. Once per turn, they may reduce the cost of a Reaction by 1 for units with this rule.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Ultramarines models: once per turn, modify Reaction Point cost by -1 (min 0)',
      effect: { tacticaId: 'ultramarines-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Logisticae Prime Advantage available',
      effect: { primeAdvantageName: 'Logisticae' },
    },
    {
      type: 'armyModifier',
      description: 'Retribution Strike Advanced Reaction available',
      effect: { advancedReactionId: 'um-retribution-strike' },
    },
    {
      type: 'armyModifier',
      description: 'Aegis of Wisdom Gambit available during Challenges',
      effect: { gambitId: 'um-aegis-of-wisdom' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'ultramarines-tactica',
  advancedReactionId: 'um-retribution-strike',
  gambitId: 'um-aegis-of-wisdom',
  primeAdvantage: {
    name: 'Logisticae',
    description:
      'A unit with the Ultramarines trait and Command Battlefield Role filling a Prime slot ' +
      'adds an extra Transport/Heavy Transport slot with increased capacity.',
    effects: [
      'Add one additional Transport or Heavy Transport Battlefield Role Slot to the Detachment',
      'Modify the Transport Capacity of a Unit selected to fill that Slot by +2',
    ],
  },
  additionalDetachments: [
    {
      name: 'Primus Demi Company',
      type: 'Apex',
      description: 'Standardised flexible strike force. Command Slot limited to Optae Unit.',
      slots: ['Command', 'Retinue', 'Troops', 'Troops', 'Elites', 'Support', 'Armour', 'Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIV — DEATH GUARD: The Reaping
// ═══════════════════════════════════════════════════════════════════════════════

const deathGuardRite: RiteOfWarDefinition = {
  id: 'death-guard-the-reaping',
  name: 'The Reaping',
  legion: LegionFaction.DeathGuard,
  description:
    'The Death Guard advance relentlessly, leveraging their unnatural resilience. Heavy weapons ' +
    'can fire on the move, and they ignore difficult terrain penalties.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Death Guard models: Heavy weapons benefit after moving ≤4", ignore difficult terrain penalty',
      effect: { tacticaId: 'death-guard-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Unnatural Resilience Prime Advantage available',
      effect: { primeAdvantageName: 'Unnatural Resilience' },
    },
    {
      type: 'armyModifier',
      description: 'Barbaran Endurance Advanced Reaction available',
      effect: { advancedReactionId: 'dg-barbaran-endurance' },
    },
    {
      type: 'armyModifier',
      description: 'Steadfast Resilience Gambit available during Challenges',
      effect: { gambitId: 'dg-steadfast-resilience' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'death-guard-tactica',
  advancedReactionId: 'dg-barbaran-endurance',
  gambitId: 'dg-steadfast-resilience',
  primeAdvantage: {
    name: 'Unnatural Resilience',
    description:
      'A Centurion or Cataphractii Centurion with the Death Guard trait filling a Prime slot ' +
      'gains additional wounds and damage reduction.',
    effects: [
      'Base Wounds characteristic modified by +1',
      'Gains the Eternal Warrior (2) Special Rule',
      'Can only be selected once per Army',
    ],
  },
  additionalDetachments: [
    {
      name: 'Reaping Host',
      type: 'Auxiliary',
      description:
        'Heavily reinforced attack column suited to urban warfare. Deliberately slow moving and ' +
        'utterly murderous. Troops Slots may NOT be used to select Assault Squad Units.',
      slots: ['Command', 'Troops', 'Troops', 'Troops', 'Support', 'Support', 'Armour'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XV — THOUSAND SONS: The Great Crusade
// ═══════════════════════════════════════════════════════════════════════════════

const thousandSonsRite: RiteOfWarDefinition = {
  id: 'thousand-sons-great-crusade',
  name: 'The Great Crusade',
  legion: LegionFaction.ThousandSons,
  description:
    'The Thousand Sons are warrior-scholars who combine psychic mastery with martial prowess. All ' +
    'models gain the Psyker trait and enhanced Willpower.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Thousand Sons models gain +1 Willpower and the Psyker Trait',
      effect: { tacticaId: 'thousand-sons-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Telekine Shift Prime Advantage available',
      effect: { primeAdvantageName: 'Telekine Shift' },
    },
    {
      type: 'armyModifier',
      description: 'Fortress of the Mind Advanced Reaction available',
      effect: { advancedReactionId: 'ts-fortress-of-mind' },
    },
    {
      type: 'armyModifier',
      description: 'Prophetic Duellist Gambit available during Challenges',
      effect: { gambitId: 'ts-prophetic-duellist' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'thousand-sons-tactica',
  advancedReactionId: 'ts-fortress-of-mind',
  gambitId: 'ts-prophetic-duellist',
  primeAdvantage: {
    name: 'Telekine Shift',
    description:
      'A Troops unit with the Thousand Sons trait filling a Prime slot gains the ability to ' +
      'use telekinesis for enhanced movement.',
    effects: [
      'Models gain the Telekine Shift Special Rule',
      'When making a Rush Move, may make a Willpower Check',
      'If passed: gains Antigrav Sub-Type and Move Through Cover until end of Movement Phase',
      'If failed: the Unit may not Move during the current Movement Phase',
    ],
  },
  additionalDetachments: [
    {
      name: 'Prosperine Convocation',
      type: 'Auxiliary',
      description: 'Mixed psychic formation practising balance and calm for controlled warfare.',
      slots: ['Command', 'Troops', 'Troops', 'Elites', 'Support', 'Armour'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVI — SONS OF HORUS: The Long March
// ═══════════════════════════════════════════════════════════════════════════════

const sonsOfHorusRite: RiteOfWarDefinition = {
  id: 'sons-of-horus-long-march',
  name: 'The Long March',
  legion: LegionFaction.SonsOfHorus,
  description:
    'The Sons of Horus are ever on the offensive, unleashing fire even as they close for the kill. ' +
    'Their Volley Attacks are made at full Ballistic Skill rather than as Snap Shots.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Sons of Horus models make Volley Attacks at full BS (not Snap Shots)',
      effect: { tacticaId: 'sons-of-horus-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Martial Supremacy Prime Advantage available',
      effect: { primeAdvantageName: 'Martial Supremacy' },
    },
    {
      type: 'armyModifier',
      description: 'Warrior Pride Advanced Reaction available',
      effect: { advancedReactionId: 'soh-warrior-pride' },
    },
    {
      type: 'armyModifier',
      description: 'Merciless Strike Gambit available during Challenges',
      effect: { gambitId: 'soh-merciless-strike' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'sons-of-horus-tactica',
  advancedReactionId: 'soh-warrior-pride',
  gambitId: 'soh-merciless-strike',
  primeAdvantage: {
    name: 'Martial Supremacy',
    description:
      'A unit with the Sons of Horus trait and Elites Battlefield Role filling a Prime slot ' +
      'gains a champion with duelling expertise.',
    effects: [
      'One model in the Unit gains the Champion Sub-Type',
      'That model gains the Duellist\'s Edge (1) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Supremacy Cadre',
      type: 'Auxiliary',
      description: 'Heavy assault troops and experienced line forces for brutal close-quarters warfare.',
      slots: ['Command', 'Troops', 'Troops', 'Heavy Assault', 'Heavy Assault', 'Elites'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVII — WORD BEARERS: Pillar of Faith
// ═══════════════════════════════════════════════════════════════════════════════

const wordBearersRite: RiteOfWarDefinition = {
  id: 'word-bearers-pillar-of-faith',
  name: 'Pillar of Faith',
  legion: LegionFaction.WordBearers,
  description:
    'The Word Bearers\' zealous faith makes them resolute even in defeat. They score additional ' +
    'Combat Resolution Points simply by having Word Bearers in combat.',
  benefits: [
    {
      type: 'specialRule',
      description: 'Word Bearers score 1 additional CRP in Resolution Sub-Phase if any friendly models in combat have the Word Bearers trait',
      effect: { tacticaId: 'word-bearers-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Zealous Assault Prime Advantage available',
      effect: { primeAdvantageName: 'Zealous Assault' },
    },
    {
      type: 'armyModifier',
      description: 'Glorious Martyrdom Advanced Reaction available',
      effect: { advancedReactionId: 'wb-glorious-martyrdom' },
    },
    {
      type: 'armyModifier',
      description: 'Beseech the Gods Gambit available during Challenges',
      effect: { gambitId: 'wb-beseech-the-gods' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'word-bearers-tactica',
  advancedReactionId: 'wb-glorious-martyrdom',
  gambitId: 'wb-beseech-the-gods',
  primeAdvantage: {
    name: 'Zealous Assault',
    description:
      'A Troops unit with the Word Bearers trait filling a Prime slot gains impact capability ' +
      'reflecting their fervour in battle.',
    effects: [
      'Models in the Unit gain the Impact (S) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Exalted Conclave',
      type: 'Apex',
      description:
        'Warp-blessed warriors accompanying the highest ranking commanders. Requires Traitor Allegiance. ' +
        'Only the True Believers Prime Advantage can be selected for Battlefield Role Slots.',
      slots: ['Command', 'Retinue', 'Elites', 'Elites', 'Support', 'Heavy Assault'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVIII — SALAMANDERS: Covenant of Fire
// ═══════════════════════════════════════════════════════════════════════════════

const salamandersRite: RiteOfWarDefinition = {
  id: 'salamanders-covenant-of-fire',
  name: 'Covenant of Fire',
  legion: LegionFaction.Salamanders,
  description:
    'The Salamanders possess preternatural vitality and resilience. Wound tests against them fail ' +
    'on unmodified 1-2, and they are immune to Panic from Flame weapons.',
  benefits: [
    {
      type: 'specialRule',
      description: 'Wound Tests fail on unmodified 1-2; immune to Panic (X) from Flame Trait weapons',
      effect: { tacticaId: 'salamanders-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Duty Before Death Prime Advantage available',
      effect: { primeAdvantageName: 'Duty Before Death' },
    },
    {
      type: 'armyModifier',
      description: 'Selfless Burden Advanced Reaction available',
      effect: { advancedReactionId: 'sal-selfless-burden' },
    },
    {
      type: 'armyModifier',
      description: 'Duty is Sacrifice Gambit available during Challenges',
      effect: { gambitId: 'sal-duty-is-sacrifice' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'salamanders-tactica',
  advancedReactionId: 'sal-selfless-burden',
  gambitId: 'sal-duty-is-sacrifice',
  primeAdvantage: {
    name: 'Duty Before Death',
    description:
      'A Troops unit with the Salamanders trait filling a Prime slot gains damage mitigation ' +
      'reflecting their legendary resilience.',
    effects: [
      'Models in the Unit gain the Feel No Pain (6+) Special Rule',
    ],
  },
  additionalDetachments: [
    {
      name: 'Immolation Covenant',
      type: 'Auxiliary',
      description:
        'Siege tanks and short-range assault support backed by flame-equipped Predators. ' +
        'Armour Slots limited to Predator or Vindicator Units.',
      slots: ['Command', 'Troops', 'Support', 'Support', 'Armour', 'Armour'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIX — RAVEN GUARD: Shadow Warfare
// ═══════════════════════════════════════════════════════════════════════════════

const ravenGuardRite: RiteOfWarDefinition = {
  id: 'raven-guard-shadow-warfare',
  name: 'Shadow Warfare',
  legion: LegionFaction.RavenGuard,
  description:
    'The Raven Guard possess an innate ability to go unseen, forcing enemies to use Snap Shots ' +
    'at longer ranges. They specialise in precision strikes against key targets.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Raven Guard models: attacks must be Snap Shots when attacker is 18"+ away',
      effect: { tacticaId: 'raven-guard-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Wraiths Prime Advantage available',
      effect: { primeAdvantageName: 'Wraiths' },
    },
    {
      type: 'armyModifier',
      description: 'Shadow Veil Advanced Reaction available',
      effect: { advancedReactionId: 'rg-shadow-veil' },
    },
    {
      type: 'armyModifier',
      description: 'Decapitation Strike Gambit available during Challenges',
      effect: { gambitId: 'rg-decapitation-strike' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'raven-guard-tactica',
  advancedReactionId: 'rg-shadow-veil',
  gambitId: 'rg-decapitation-strike',
  primeAdvantage: {
    name: 'Wraiths',
    description:
      'A Troops unit with the Raven Guard trait filling a Prime slot gains the Wraiths Special Rule, ' +
      'allowing them to disorder incoming charges through psychic camouflage.',
    effects: [
      'Models gain the Wraiths Special Rule',
      'After making a Rush Move, may make a Willpower Check',
      'If passed: any Charges targeting the Unit in the following Player Turn are Disordered',
      'If failed: the Unit gains the Stunned Tactical Status instead',
    ],
  },
  additionalDetachments: [
    {
      name: 'Decapitation Cadre',
      type: 'Auxiliary',
      description:
        'Precision strikes against key targets. Recon limited to Reconnaissance Squad Units. ' +
        'Elites limited to Veteran Assault Squad or Dark Fury Squad Units.',
      slots: ['Command', 'Elites', 'Elites', 'Recon', 'Recon', 'Fast Attack'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XX — ALPHA LEGION: Hydra Dominatus
// ═══════════════════════════════════════════════════════════════════════════════

const alphaLegionRite: RiteOfWarDefinition = {
  id: 'alpha-legion-hydra-dominatus',
  name: 'Hydra Dominatus',
  legion: LegionFaction.AlphaLegion,
  description:
    'The Alpha Legion operates through deception and misdirection. Their models count as 2" further ' +
    'away for enemy range calculations, and their false flag operations allow recruiting from other legions.',
  benefits: [
    {
      type: 'specialRule',
      description: 'All non-Vehicle Alpha Legion models considered +2" further away for enemy range calculations',
      effect: { tacticaId: 'alpha-legion-tactica' },
    },
    {
      type: 'primeAdvantage',
      description: 'Rewards of Treachery Prime Advantage available',
      effect: { primeAdvantageName: 'Rewards of Treachery' },
    },
    {
      type: 'armyModifier',
      description: 'Smoke and Mirrors Advanced Reaction available',
      effect: { advancedReactionId: 'al-smoke-and-mirrors' },
    },
    {
      type: 'armyModifier',
      description: 'I Am Alpharius Gambit available during Challenges',
      effect: { gambitId: 'al-i-am-alpharius' },
    },
  ],
  restrictions: [
    {
      type: 'allegianceRequired',
      description: 'No allegiance restriction (can be Loyalist or Traitor)',
      restriction: { allegiance: null },
    },
  ],
  tacticaId: 'alpha-legion-tactica',
  advancedReactionId: 'al-smoke-and-mirrors',
  gambitId: 'al-i-am-alpharius',
  primeAdvantage: {
    name: 'Rewards of Treachery',
    description:
      'A Command unit with the Alpha Legion trait filling a Prime slot allows adding extra ' +
      'Battlefield Role Slots that can be filled with units from other Legiones Astartes factions.',
    effects: [
      'Add one additional Battlefield Role Slot to the Detachment (any role except High Command, Command, Warlord, or Lord of War)',
      'Can be selected for multiple Units in the same Detachment for multiple additional Slots',
      'Each Unit filling such a Slot must be from the Legiones Astartes Army List',
      'Must NOT have the Alpha Legion Faction Trait on their Unit Profile',
      'Must NOT include models with the Unique Sub-Type',
      'All models in those Units have their Faction Trait replaced with Alpha Legion',
    ],
  },
  additionalDetachments: [
    {
      name: 'Headhunter Leviathal',
      type: 'Auxiliary',
      description:
        'Elite covert operations formation. Elites Slots limited to Seeker Squad or Headhunter ' +
        'Kill Team Units.',
      slots: ['Command', 'Elites', 'Elites', 'Recon', 'Recon', 'Transport'],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED ARRAY + UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All 20 Rite of War definitions.
 * 18 standard (one per legion) + 2 Hereticus (EC-H, WE-H).
 */
export const RITES_OF_WAR: RiteOfWarDefinition[] = [
  darkAngelsRite,
  emperorsChildrenRite,
  emperorsChildrenHereticusRite,
  ironWarriorsRite,
  whiteScarsRite,
  spaceWolvesRite,
  imperialFistsRite,
  nightLordsRite,
  bloodAngelsRite,
  ironHandsRite,
  worldEatersRite,
  worldEatersHereticusRite,
  ultramarinesRite,
  deathGuardRite,
  thousandSonsRite,
  sonsOfHorusRite,
  wordBearersRite,
  salamandersRite,
  ravenGuardRite,
  alphaLegionRite,
];

/** Index by id for fast lookup */
const RITES_BY_ID: Record<string, RiteOfWarDefinition> = {};
for (const rite of RITES_OF_WAR) {
  RITES_BY_ID[rite.id] = rite;
}

/**
 * Look up a Rite of War by its unique ID.
 */
export function findRiteOfWar(id: string): RiteOfWarDefinition | undefined {
  return RITES_BY_ID[id];
}

/**
 * Get all Rites of War available to a specific legion.
 * This includes both standard and Hereticus rites for legions that have them.
 */
export function getRitesForLegion(legion: LegionFaction): RiteOfWarDefinition[] {
  return RITES_OF_WAR.filter(r => r.legion === legion);
}
