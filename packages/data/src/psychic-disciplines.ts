/**
 * Psychic Disciplines Database — All 6 core psychic disciplines from HH_Armoury.md
 * Reference: HH_Armoury.md — "PSYCHIC DISCIPLINES" / "Core Disciplines"
 *
 * Each discipline grants:
 * - One or more Special Rules
 * - One or more Psychic Weapons (resolved through normal shooting/melee pipeline)
 * - Zero or more Psychic Powers (Blessings/Curses, manifested via Willpower Check)
 * - Zero or more Psychic Reactions (require reaction allotment + Manifestation Check)
 * - Zero or more Psychic Gambits (used in Challenge Sub-Phase)
 * - A Trait (e.g., 'Biomancer', 'Pyromancer', etc.)
 */

import type {
  PsychicDisciplineDefinition,
  RangedWeaponProfile,
  MeleeWeaponProfile,
  SpecialRuleRef,
} from '@hh/types';

// ─── Helper: Parse special rule string like "Breaching (4+)" ──────────────────

function parseSpecialRule(str: string): SpecialRuleRef {
  const match = str.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), value: match[2].trim() };
  }
  return { name: str.trim() };
}

function parseRules(rules: string[]): SpecialRuleRef[] {
  return rules.filter(r => r !== '-' && r !== '').map(parseSpecialRule);
}

// ─── Psychic Weapon Profiles ─────────────────────────────────────────────────
// These are the actual weapon stat profiles referenced by PsychicWeaponDefinition.
// They are stored here and exported for cross-referencing.

export const PSYCHIC_WEAPON_PROFILES: Record<string, RangedWeaponProfile | MeleeWeaponProfile> = {
  // ── Biomancy: Biomantic Slam (Melee) ──
  'biomantic-slam': {
    id: 'biomantic-slam',
    name: 'Biomantic Slam',
    initiativeModifier: 3,
    attacksModifier: 1,
    strengthModifier: 12,
    ap: 2,
    damage: 2,
    specialRules: parseRules(['Armourbane', 'Force (Damage)']),
    traits: ['Melee', 'Psychic'],
  } as MeleeWeaponProfile,

  // ── Pyromancy: Wildfire (Ranged) ──
  'wildfire': {
    id: 'wildfire',
    name: 'Wildfire',
    range: 18,
    hasTemplate: false,
    firepower: 1,
    rangedStrength: 4,
    ap: 4,
    damage: 1,
    specialRules: parseRules(['Panic (1)', 'Blast (5")', 'Force (Strength)']),
    traits: ['Ranged', 'Psychic'],
  } as RangedWeaponProfile,

  // ── Pyromancy: Conflagration (Ranged, used in Melee) ──
  'conflagration': {
    id: 'conflagration',
    name: 'Conflagration',
    range: -1,
    hasTemplate: false,
    firepower: 6, // 6+D3, stored as base 6; the +D3 is noted in special rules context
    rangedStrength: 5,
    ap: 4,
    damage: 1,
    specialRules: parseRules(['Deflagrate (5)']),
    traits: ['Melee', 'Psychic'],
    firepowerVariable: '6+D3',
  } as RangedWeaponProfile & { firepowerVariable: string },

  // ── Telekinesis: Immovable Force (Ranged) ──
  'immovable-force': {
    id: 'immovable-force',
    name: 'Immovable Force',
    range: 18,
    hasTemplate: false,
    firepower: 3,
    rangedStrength: 6,
    ap: 4,
    damage: 1,
    specialRules: parseRules(['Pinning (2)', 'Force (Firepower)']),
    traits: ['Ranged', 'Psychic'],
  } as RangedWeaponProfile,

  // ── Telepathy: Cursed Whispers (Ranged) ──
  'cursed-whispers': {
    id: 'cursed-whispers',
    name: 'Cursed Whispers',
    range: 18,
    hasTemplate: false,
    firepower: 2, // 2D6, stored as base 2; the D6 multiplier noted in context
    rangedStrength: 3,
    ap: null,
    damage: 1,
    specialRules: parseRules(['Stun (-)']),
    traits: ['Ranged', 'Psychic'],
    firepowerVariable: '2D6',
  } as RangedWeaponProfile & { firepowerVariable: string },
};

// ─── Psychic Disciplines Dictionary ──────────────────────────────────────────

export const PSYCHIC_DISCIPLINES: Record<string, PsychicDisciplineDefinition> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // BIOMANCY
  // ═══════════════════════════════════════════════════════════════════════════

  'biomancy': {
    id: 'biomancy',
    name: 'Biomancy',
    description: 'Biomancers are the masters of flesh-craft, the ability to empower and enhance living creatures. They can harden flesh till it can resist bolt and blade like armour, or swell muscle till even the lowliest recruit can tear apart the foe with ease. Those that train in these arts are often bellicose and intransigent warriors, unwilling to turn aside from the simplest and most straightforward solutions. When a biomancer sets forth to war, those in their path tremble.',
    grantedSpecialRules: [
      { name: 'Impact', value: 'Strength' },
    ],
    grantedTrait: 'Biomancer',
    weapons: [
      {
        id: 'biomantic-slam',
        name: 'Biomantic Slam',
        discipline: 'Biomancy',
        weaponProfileId: 'biomantic-slam',
        description: 'Channelling the power of the Warp itself, a trained biomancer can rend steel and smash ceramite with their bare hands. Such is their fury that neither warriors of flesh, nor engines of iron can stand before them.',
      },
    ],
    powers: [
      {
        id: 'biomantic-rage',
        name: 'Biomantic Rage',
        discipline: 'Biomancy',
        powerType: 'Blessing',
        phase: 'Charge Sub-Phase',
        description: 'Those blessed by the powers of biomancy are temporarily remade, their physiques swollen and warped for strength and resilience far beyond the merely human. It is not only their strength that swells, but also their rage. Under the effects of a biomancers influence even the most veteran warriors are lost to fury and bloodshed. This Power is used in the Charge Sub-Phase to add a bonus to a Unit\'s Strength and Toughness.',
        effects: 'If the Manifestation Check is successful, then no Volley Attack may be made for the Target Unit, but all Models in the Target Unit gain a bonus of +2 to their Strength and Toughness Characteristics. The effects last until the end of the current Assault Phase.',
      },
    ],
    reactions: [],
    gambits: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PYROMANCY
  // ═══════════════════════════════════════════════════════════════════════════

  'pyromancy': {
    id: 'pyromancy',
    name: 'Pyromancy',
    description: 'Pyromancy is the essence of destruction and death. It is havoc given form, gleeful and wanton in its profligacy. On the battlefield a pyromancer is a walking engine of chaos, sowing doom with every step and reaping a toll of lives with each gesture. They serve no purpose other than to kill the enemy. Those that train as pyromancers are ever eager for the fight, but see no other path than the complete and utter destruction of the foe. To a pyromancer there is no such thing as collateral damage, and only when there is naught before them but ash does their ardour cool.',
    grantedSpecialRules: [
      { name: 'Explodes', value: '4+' },
    ],
    grantedTrait: 'Pyromancer',
    weapons: [
      {
        id: 'wildfire',
        name: 'Wildfire',
        discipline: 'Pyromancy',
        weaponProfileId: 'wildfire',
        description: 'With a snap of their fingers or sweep of their arms, a pyromancer can cause the very air to ignite in a storm of flame hot enough to burn flesh and sear metal.',
      },
      {
        id: 'conflagration',
        name: 'Conflagration',
        discipline: 'Pyromancy',
        weaponProfileId: 'conflagration',
        description: 'In the heart of a melee, a pyromancer cares not for the subtle interplay of blades, and instead simply sows flame and cinder with wild abandon.',
      },
    ],
    powers: [],
    reactions: [],
    gambits: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEKINESIS
  // ═══════════════════════════════════════════════════════════════════════════

  'telekinesis': {
    id: 'telekinesis',
    name: 'Telekinesis',
    description: 'Telekinesis is the art of defence, of invisible force that binds and protects. On the battlefield a Telekine is immovable and implacable, tenacious in their duty to their comrades and the cause of victory. They command invisible force to shield their allies from harm, deflecting even the most formidable bombardment, or to slow the foe and hold them in place so that others might destroy them. Patient and determined warriors, many telekines are students of strategy as well as simple destruction and are considered among the more stable of their kind.',
    grantedSpecialRules: [
      { name: 'Shrouded', value: '4+' },
    ],
    grantedTrait: 'Telekine',
    weapons: [
      {
        id: 'immovable-force',
        name: 'Immovable Force',
        discipline: 'Telekinesis',
        weaponProfileId: 'immovable-force',
        description: 'By force of will a telekine can bind the foe with invisible chains, leashing them to the spot and making them easy prey for allied guns.',
      },
    ],
    powers: [],
    reactions: [
      {
        id: 'force-barrier',
        name: 'Force Barrier',
        discipline: 'Telekinesis',
        phase: 'Shooting Phase / Assault Phase',
        cost: 1,
        description: 'An invisible shield that no blast or beam can penetrate, by means of this power a telekine keeps their allies safe from harm and confounds the brute tactics of the foe. This Power can be used in either the Shooting or Assault Phase and grants a Shrouded Damage Mitigation Test.',
        effects: 'If the Manifestation Check is successful, then all Models in the Target Unit gain a 3+ Shrouded Damage Mitigation Test against any wounds inflicted during a Volley or Shooting Attack. The effects last until the end of the Sub-Phase in which it was declared.',
      },
    ],
    gambits: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIVINATION
  // ═══════════════════════════════════════════════════════════════════════════

  'divination': {
    id: 'divination',
    name: 'Divination',
    description: 'By means of the fickle powers of the Warp, a Diviner parts the veil of time to glimpse what might be. By this power they guide their attacks and those of their allies, ensuring they strike home when and where they are most needed. Taciturn and secretive, diviners are obsessed with the consequences of each action, lest they taint the very future they seek to create. In battle they stalk key foes and critical struggles, seeking the perfect moment for them to change the flow of the battle at the point of a single well-placed blade or bolt.',
    grantedSpecialRules: [
      { name: 'Duellist\'s Edge', value: '2' },
    ],
    grantedTrait: 'Diviner',
    weapons: [],
    powers: [
      {
        id: 'foresights-blessing',
        name: 'Foresight\'s Blessing',
        discipline: 'Divination',
        powerType: 'Blessing',
        phase: 'Shooting Phase',
        description: 'In a glance, a diviner can sense where to direct fire to best harm the foe. It matters not if the foe hides, flees or stands defiant, for their future has already been decided. This Power is used as part of a Shooting Attack to grant a Unit the Precision (5+) Special Rule.',
        effects: 'If the Manifestation Check is successful, then all Models in the Target Unit gain the Precision (5+) Special Rule. The effects last until the end of the Shooting Attack being resolved.',
      },
    ],
    reactions: [],
    gambits: [
      {
        id: 'every-strike-foreseen',
        name: 'Every Strike Foreseen',
        discipline: 'Divination',
        description: 'If this Gambit is selected, the Controlling Player must make a Willpower Check for the Model using this Gambit. If the Check is successful then in the Strike Step of the Challenge any Flit Tests made for this Model are successful on a result of 2+ regardless of the Weapon Skill Characteristics of the Models involved in the Challenge. If the Willpower Check is not successful then Flit Tests are made as normal. Note that this Willpower Check cannot inflict Perils of the Warp.',
        effects: 'On successful Willpower Check, Flit Tests succeed on 2+ regardless of WS in the Challenge Strike Step. This Willpower Check cannot inflict Perils of the Warp.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEPATHY
  // ═══════════════════════════════════════════════════════════════════════════

  'telepathy': {
    id: 'telepathy',
    name: 'Telepathy',
    description: 'Telepaths are masters of the invisible realms of thought and emotion, and when they go to war no armour can stay their wrath. The foe\'s every flaw and fear is laid bare before them, to be exploited in combat in the cause of victory. In battle they deal not in blood and death, but in terror and confusion, controlling the enemy rather than simply slaughtering them. Telepaths are arrogant and domineering warriors, for there is no secret that can be hidden from them.',
    grantedSpecialRules: [
      { name: 'Fear', value: '1' },
    ],
    grantedTrait: 'Telepath',
    weapons: [
      {
        id: 'cursed-whispers',
        name: 'Cursed Whispers',
        discipline: 'Telepathy',
        weaponProfileId: 'cursed-whispers',
        description: 'Subtle manipulation of the foe\'s fear can leave them confused and distracted, chasing ghosts even as the telepath\'s allies draw close.',
      },
    ],
    powers: [
      {
        id: 'mind-burst',
        name: 'Mind-burst',
        discipline: 'Telepathy',
        powerType: 'Curse',
        phase: 'Movement Phase',
        description: 'Brute force stimulation of terror within the psyche of the foe can be more devastating than any artillery bombardment. By means of such tools does the telepath steer the foe to defeat. This Power is used in the Movement Phase and can force the target to Fall Back or become Routed.',
        effects: 'If the Resistance Check is failed, then all Statuses are removed from all Models in the Target Unit, and then the Target Unit must immediately make a Fall Back Move. Once that Fall Back Move has been resolved, a Leadership Check must be made for the Target Unit by its Controlling Player, this Check may not be modified by any effect or Special Rule. If the Leadership Check is successful, then there is no further effect, if it is unsuccessful then all Models in the Target Unit gain the Routed Status. Regardless of whether the Resistance Check succeeds or fails, the Unit that includes the Focus of this Psychic Power may not make a move or Rush in this Movement Phase.',
      },
    ],
    reactions: [],
    gambits: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // THAUMATURGY
  // ═══════════════════════════════════════════════════════════════════════════

  'thaumaturgy': {
    id: 'thaumaturgy',
    name: 'Thaumaturgy',
    description: 'Thaumaturgy is the scholar\'s art, a discipline dedicated to understanding and calming the fury of the Warp. In battle, these warriors seek to restore that which the Warp has undone and to contain the worst excesses of its manifestations. Surpassing the stumbling skills of the surgeon, they can return the dead to life and banish the unnatural back to the depths of the Warp. Yet, these cautious warriors are ever mindful of the cost of any use of the aetheric powers at their command, and only set forth their true power when no other choice remains. Of all the clades of the Imperium\'s psykers, thaumaturges are the most knowledgeable, an obsession that in this Dark Age has seen them grow in importance.',
    grantedSpecialRules: [
      { name: 'Hatred', value: 'Psykers' },
    ],
    grantedTrait: 'Thaumaturge',
    weapons: [],
    powers: [
      {
        id: 'tranquillity',
        name: 'Tranquillity',
        discipline: 'Thaumaturgy',
        powerType: 'Curse',
        phase: 'Start Phase (Effects Sub-Phase)',
        description: 'It takes a rare talent to seal the breaches in the Warp that other psykers create, yet on the battlefields of the Horus Heresy this can mean the difference between victory and defeat. For if the Warp is calmed, then the enemy\'s psykers find their power withered and lessened. This Power is used in the Start Phase and makes it harder for the Target Unit to use Psychic Powers, Psychic Reactions or to attack with Psychic Weapons.',
        effects: 'If the Resistance Check is failed, then all Models in the Target Unit suffer a penalty of -2 to their Willpower Characteristic when attempting to Manifest any Psychic Power or Psychic Reaction. If any Model in the Target Unit makes attacks with a Weapon that has the Psychic Trait, then the Strength Characteristic of all Hits inflicted is reduced by 1. The effects last until the start of the Active Player\'s next Turn as the Active Player.',
      },
    ],
    reactions: [
      {
        id: 'resurrection',
        name: 'Resurrection',
        discipline: 'Thaumaturgy',
        phase: 'Shooting Phase',
        cost: 1,
        description: 'The ultimate art of the thaumaturge, and one they are loath to employ in any but the most dire of situations. Only at the very point of death can it be halted, and only with great risk can it be reversed. Thus, only the most valued warriors are deemed worthy of such an invidious salvation. This Power can be used in the Shooting Phase and can return a single Casualty to the Unit with all Wounds restored.',
        effects: 'If the Manifestation Check is successful then, before any Models in the Target Unit are Removed as Casualties, the Controlling Player of the Target Unit must select one Model being Removed as a Casualty and roll a Dice. If the Dice roll for the chosen Model is equal to or higher than a \'4\', then that Model is not Removed as a Casualty and is returned to play in Unit Coherency with its Unit and with its Wounds Characteristic set to its Base Value. This Psychic Reaction has no effect on Models that do not have a Wounds Characteristic and if the result of the Manifestation Check causes Perils of the Warp, then this instance of Perils of the Warp is resolved after any Models are returned to the Unit.',
      },
    ],
    gambits: [],
  },
};

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Get all discipline IDs.
 */
export function getDisciplineIds(): string[] {
  return Object.keys(PSYCHIC_DISCIPLINES);
}

/**
 * Find a psychic discipline by its ID.
 */
export function findDiscipline(id: string): PsychicDisciplineDefinition | undefined {
  return PSYCHIC_DISCIPLINES[id];
}

/**
 * Find a psychic discipline by its display name (case-insensitive).
 */
export function findDisciplineByName(name: string): PsychicDisciplineDefinition | undefined {
  const lower = name.toLowerCase();
  return Object.values(PSYCHIC_DISCIPLINES).find(d => d.name.toLowerCase() === lower);
}

/**
 * Get the weapon profile for a psychic weapon by its profile ID.
 */
export function getPsychicWeaponProfile(profileId: string): RangedWeaponProfile | MeleeWeaponProfile | undefined {
  return PSYCHIC_WEAPON_PROFILES[profileId];
}

/**
 * Check if a psychic weapon profile is a melee weapon.
 */
export function isPsychicMeleeWeapon(profileId: string): boolean {
  const profile = PSYCHIC_WEAPON_PROFILES[profileId];
  if (!profile) return false;
  return 'initiativeModifier' in profile;
}

/**
 * Check if a psychic weapon profile is a ranged weapon.
 */
export function isPsychicRangedWeapon(profileId: string): boolean {
  const profile = PSYCHIC_WEAPON_PROFILES[profileId];
  if (!profile) return false;
  return 'range' in profile;
}
