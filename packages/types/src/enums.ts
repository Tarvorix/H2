/**
 * All enumerations used across the HH-Digital type system.
 */

// ─── Model Types ──────────────────────────────────────────────────────────────

/**
 * Primary model type. Every model has exactly one primary type.
 * Reference: HH_Principles.md — "Model Types", HH_Core.md — "Model"
 */
export enum ModelType {
  Infantry = 'Infantry',
  Vehicle = 'Vehicle',
  Walker = 'Walker',
  Cavalry = 'Cavalry',
  Automata = 'Automata',
  Primarch = 'Primarch',
  Paragon = 'Paragon',
  Knight = 'Knight',
  Titan = 'Titan',
  Building = 'Building',
}

/**
 * Model sub-types. A model can have zero or more sub-types.
 * Reference: HH_Core.md, datasheets
 */
export enum ModelSubType {
  /** Line troops — can hold objectives with bonus */
  Line = 'Line',
  /** Heavy — certain movement/shooting restrictions */
  Heavy = 'Heavy',
  /** Skirmish — extended coherency */
  Skirmish = 'Skirmish',
  /** Command — HQ-type model */
  Command = 'Command',
  /** Sergeant — squad leader model */
  Sergeant = 'Sergeant',
  /** Unique — one per army */
  Unique = 'Unique',
  /** Light — reduced capacity on transports */
  Light = 'Light',
  /** Transport — can carry other models */
  Transport = 'Transport',
  /** Fast — vehicle sub-type for fast vehicles */
  Fast = 'Fast',
  /** Heavy — vehicle sub-type */
  HeavyVehicle = 'HeavyVehicle',
  /** Super-Heavy — super-heavy vehicles */
  SuperHeavy = 'SuperHeavy',
  /** Flyer — aircraft */
  Flyer = 'Flyer',
  /** Hover — flyer sub-type */
  Hover = 'Hover',
  /** Antigrav — jetbikes etc. */
  Antigrav = 'Antigrav',
  /** Dreadnought — walker sub-type */
  Dreadnought = 'Dreadnought',
  /** Jump — jump pack infantry */
  Jump = 'Jump',
  /** Jet — jet pack infantry */
  Jet = 'Jet',
  /** Mounted — bike/jetbike cavalry */
  Mounted = 'Mounted',
  /** Daemon — daemonic entities */
  Daemon = 'Daemon',
  /** Psyker — can use psychic powers */
  Psyker = 'Psyker',
  /** Corrupted — tainted by the warp */
  Corrupted = 'Corrupted',
}

// ─── Battlefield Roles ────────────────────────────────────────────────────────

/**
 * Battlefield Role — determines which Force Org slot a unit fills.
 * Reference: HH_Battle_AOD.md — "14 Battlefield Roles"
 */
export enum BattlefieldRole {
  Warlord = 'Warlord',
  HighCommand = 'High Command',
  Command = 'Command',
  Retinue = 'Retinue',
  Elites = 'Elites',
  WarEngine = 'War-Engine',
  Troops = 'Troops',
  Support = 'Support',
  LordOfWar = 'Lord of War',
  Transport = 'Transport',
  HeavyAssault = 'Heavy Assault',
  HeavyTransport = 'Heavy Transport',
  Armour = 'Armour',
  Recon = 'Recon',
  FastAttack = 'Fast Attack',
}

// ─── Allegiance & Faction ─────────────────────────────────────────────────────

/**
 * The two sides of the Horus Heresy.
 * Reference: HH_Core.md — "Allegiance"
 */
export enum Allegiance {
  Loyalist = 'Loyalist',
  Traitor = 'Traitor',
}

/**
 * All 18 Legiones Astartes Factions.
 * Reference: HH_Legiones_Astartes.md
 */
export enum LegionFaction {
  DarkAngels = 'Dark Angels',
  EmperorsChildren = "Emperor's Children",
  IronWarriors = 'Iron Warriors',
  WhiteScars = 'White Scars',
  SpaceWolves = 'Space Wolves',
  ImperialFists = 'Imperial Fists',
  NightLords = 'Night Lords',
  BloodAngels = 'Blood Angels',
  IronHands = 'Iron Hands',
  WorldEaters = 'World Eaters',
  Ultramarines = 'Ultramarines',
  DeathGuard = 'Death Guard',
  ThousandSons = 'Thousand Sons',
  SonsOfHorus = 'Sons of Horus',
  WordBearers = 'Word Bearers',
  Salamanders = 'Salamanders',
  RavenGuard = 'Raven Guard',
  AlphaLegion = 'Alpha Legion',
}

/**
 * Non-legion factions built from supplemental army rules.
 */
export enum SpecialFaction {
  Blackshields = 'Blackshields',
  ShatteredLegions = 'Shattered Legions',
}

/**
 * Any playable army faction.
 */
export type ArmyFaction = LegionFaction | SpecialFaction;

// ─── Tactical Statuses ────────────────────────────────────────────────────────

/**
 * Tactical statuses that can be applied to units.
 * Reference: HH_Principles.md — "Tactical Statuses"
 *
 * Universal effects of ALL statuses:
 * - Charges count as Disordered
 * - Combat Initiative forced to 1
 * - Cannot hold/claim/contest objectives
 * - Cannot benefit from being Stationary
 */
export enum TacticalStatus {
  /** Cannot move, rush, or charge. Removed by Cool Check in End Phase. */
  Pinned = 'Pinned',
  /** All shooting becomes Snap Shots. Removed by Cool Check in End Phase. */
  Suppressed = 'Suppressed',
  /** Cannot declare Reactions. Removed by Cool Check in End Phase. */
  Stunned = 'Stunned',
  /** Must Fall Back, cannot hold objectives. Removed by Leadership Check in End Phase. */
  Routed = 'Routed',
  /**
   * Emperor's Children Hereticus — Stupefied.
   * All other Tactical Statuses removed. Gains Feel No Pain (6+), +1 Strength.
   * Cannot gain other Tactical Statuses. Cannot declare Reactions. Must Snap Shot.
   * Removed by Cool Check in End Phase.
   * Reference: HH_Legiones_Astartes.md — Emperor's Children Legiones Hereticus
   */
  Stupefied = 'Stupefied',
  /**
   * World Eaters Hereticus — Lost to the Nails.
   * All other Tactical Statuses removed. +1" to Set-up Move, +1 Attacks.
   * Leadership/Cool/Willpower set to 10 (if lower).
   * Must Charge closest enemy unit within 12" at start of Charge Sub-Phase.
   * Recovers if no enemies within 12".
   * Reference: HH_Legiones_Astartes.md — World Eaters Legiones Hereticus
   */
  LostToTheNails = 'LostToTheNails',
}

// ─── Terrain ──────────────────────────────────────────────────────────────────

/**
 * Terrain types that affect movement, LOS, and cover.
 * Reference: HH_Principles.md — "Terrain"
 */
export enum TerrainType {
  /** Never blocks LOS, no movement penalty */
  LightArea = 'Light Area',
  /** Blocks LOS if ray passes through >3". Grants cover. */
  MediumArea = 'Medium Area',
  /** Always blocks LOS */
  HeavyArea = 'Heavy Area',
  /** Solid object — always blocks LOS */
  TerrainPiece = 'Terrain Piece',
  /** Requires Dangerous Terrain test when moved through */
  Dangerous = 'Dangerous',
  /** Halves movement through it */
  Difficult = 'Difficult',
  /** Cannot be moved through */
  Impassable = 'Impassable',
}

// ─── Game Phases ──────────────────────────────────────────────────────────────

/**
 * Main phases of a Player Turn.
 * Reference: HH_Rules_Battle.md — "Turn Sequence"
 */
export enum Phase {
  Start = 'Start',
  Movement = 'Movement',
  Shooting = 'Shooting',
  Assault = 'Assault',
  End = 'End',
}

/**
 * Sub-phases within each main phase.
 * Reference: HH_Rules_Battle.md — "Full Player Turn Sub-Phase Order"
 */
export enum SubPhase {
  // Start Phase
  StartEffects = 'StartEffects',
  // Movement Phase
  Reserves = 'Reserves',
  Move = 'Move',
  Rout = 'Rout',
  // Shooting Phase
  Attack = 'Attack',
  ShootingMorale = 'ShootingMorale',
  // Assault Phase
  Charge = 'Charge',
  Challenge = 'Challenge',
  Fight = 'Fight',
  Resolution = 'Resolution',
  // End Phase
  EndEffects = 'EndEffects',
  Statuses = 'Statuses',
  Victory = 'Victory',
}

// ─── Pipeline Hooks ───────────────────────────────────────────────────────────

/**
 * Hook points in the combat resolution pipeline where special rules can intervene.
 * Reference: HH_Digital_Design_Document.md § 4.2 — "Special Rules dictionary"
 */
export enum PipelineHook {
  /** Before hit tests are rolled (e.g., Barrage ignoring LOS) */
  PreHit = 'PreHit',
  /** When hit tests resolve (e.g., Precision Shots, Critical Hit) */
  OnHit = 'OnHit',
  /** Before wound tests are rolled (e.g., Poisoned overriding S vs T) */
  PreWound = 'PreWound',
  /** When wound tests resolve (e.g., Rending, Breaching, Instant Death) */
  OnWound = 'OnWound',
  /** Before saving throws (e.g., AP modification, cover) */
  PreSave = 'PreSave',
  /** When saving throws resolve (e.g., Invulnerable save interactions) */
  OnSave = 'OnSave',
  /** Before damage is applied (e.g., Feel No Pain, Shrouded) */
  PreDamage = 'PreDamage',
  /** When damage is applied (e.g., Armourbane, Eternal Warrior reducing damage) */
  OnDamage = 'OnDamage',
  /** When a casualty is removed (e.g., Pinning, Suppressive, Stun status application) */
  OnCasualty = 'OnCasualty',
  /** During movement resolution (e.g., Deep Strike, Outflank, Scout, Infiltrate) */
  Movement = 'Movement',
  /** Passive effects always active (e.g., Bulky, Fearless, Eternal Warrior) */
  Passive = 'Passive',
  /** During charge resolution (e.g., Impact, Fast charge bonus) */
  OnCharge = 'OnCharge',
  /** During morale/panic checks (e.g., Fear, Panic) */
  OnMorale = 'OnMorale',
  /** Army building / deployment restrictions (e.g., Support Unit, Line) */
  ArmyBuilding = 'ArmyBuilding',
  /** During the Focus Roll step of Challenges (e.g., Duellist's Edge) */
  OnFocusRoll = 'OnFocusRoll',
}

// ─── Vehicle Facing ───────────────────────────────────────────────────────────

/**
 * Vehicle armour facings for determining which armour value to use.
 * Reference: HH_Principles.md — "Vehicles and Damage"
 */
export enum VehicleFacing {
  Front = 'Front',
  Side = 'Side',
  Rear = 'Rear',
}

// ─── Weapon Trait Families ────────────────────────────────────────────────────

/**
 * Weapon trait values that identify the weapon family and usage type.
 * Reference: HH_Legiones_Astartes.md — weapon tables, HH_Principles.md — "Traits"
 *
 * Usage traits (how the weapon can be used):
 * - Assault: can fire after moving, can charge after firing
 * - Heavy: bonus when stationary (specific characteristic varies)
 * - Ordnance: powerful vehicle weapons
 * - Pistol: can fire in close combat, counts as assault weapon
 * - Rapid Fire: bonus shots at half range (handled via FP doubling)
 *
 * Family traits (what kind of weapon it is):
 * - Bolt, Chain, Flame, Force, Graviton, Las, Melta, Missile, Plasma, Power, Volkite, etc.
 */
export type WeaponTrait = string;

// ─── Blast Marker Sizes ──────────────────────────────────────────────────────

/**
 * Standard blast marker sizes in inches.
 * Reference: HH_Core.md — "Blast Marker"
 */
export enum BlastSize {
  Standard = 3,
  Large = 5,
  Massive = 7,
}

// ─── Core Reaction Types ──────────────────────────────────────────────────────

/**
 * The three core reactions available to all armies.
 * Reference: HH_Principles.md — "Reaction Allotments, Core Reactions"
 */
export enum CoreReaction {
  /** Movement Phase — move up to Initiative value */
  Reposition = 'Reposition',
  /** Shooting Phase — shoot back before casualties removed */
  ReturnFire = 'Return Fire',
  /** Assault Phase — fire at full BS instead of snap shot volley */
  Overwatch = 'Overwatch',
}

// ─── Psychic Disciplines ──────────────────────────────────────────────────────

/**
 * The core psychic disciplines.
 * Reference: HH_Armoury.md — "PSYCHIC DISCIPLINES"
 */
export enum PsychicDiscipline {
  Biomancy = 'Biomancy',
  Pyromancy = 'Pyromancy',
  Telepathy = 'Telepathy',
  Telekinesis = 'Telekinesis',
  Divination = 'Divination',
  Thaumaturgy = 'Thaumaturgy',
}

/**
 * Psychic power types.
 * Reference: HH_Armoury.md — psychic disciplines
 */
export enum PsychicPowerType {
  /** Targets friendly units */
  Blessing = 'Blessing',
  /** Targets enemy units (resistance check allowed) */
  Curse = 'Curse',
  /** Used as a weapon attack */
  PsychicWeapon = 'Psychic Weapon',
}

// ─── Challenge Gambits ────────────────────────────────────────────────────────

/**
 * The 9 Gambits available during the Challenge Sub-Phase.
 * Reference: HH_Rules_Battle.md — "Challenge Sub-Phase" (Face-Off step)
 */
export enum ChallengeGambit {
  SeizeTheInitiative = 'Seize the Initiative',
  Feint = 'Feint',
  Guard = 'Guard',
  PressTheAttack = 'Press the Attack',
  RecklessAssault = 'Reckless Assault',
  CautiousAdvance = 'Cautious Advance',
  DefensiveStance = 'Defensive Stance',
  AllOutAttack = 'All Out Attack',
  DeathOrGlory = 'Death or Glory',
}

// ─── Detachment Types ─────────────────────────────────────────────────────────

/**
 * Types of detachments in army construction.
 * Reference: HH_Battle_AOD.md — "Detachment Types"
 */
export enum DetachmentType {
  /** Mandatory — every army must have one */
  Primary = 'Primary',
  /** Allied forces from a different faction */
  Allied = 'Allied',
  /** Auxiliary support */
  Auxiliary = 'Auxiliary',
  /** Apex — lords of war and super-heavies */
  Apex = 'Apex',
}

// ─── Aftermath Options ────────────────────────────────────────────────────────

/**
 * Options available after combat resolution in the Assault Phase.
 * Reference: HH_Rules_Battle.md — "Resolution Sub-Phase"
 */
export enum AftermathOption {
  /** Stay in place, remain locked in combat */
  Hold = 'Hold',
  /** Winner moves away, combat ends */
  Disengage = 'Disengage',
  /** Loser retreats toward board edge */
  FallBack = 'Fall Back',
  /** Winner chases fleeing enemy */
  Pursue = 'Pursue',
  /** Winner shoots at fleeing enemy instead of pursuing */
  GunDown = 'Gun Down',
  /** Winner makes free d6" move */
  Consolidate = 'Consolidate',
}
