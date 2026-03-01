/**
 * Legion-specific rule types for Phase 7.
 * These types enable the engine to process legion tacticas, advanced reactions,
 * legion gambits, and rites of war with structured, machine-parseable data.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections
 */

import type {
  Phase,
  SubPhase,
  TacticalStatus,
  LegionFaction,
  Allegiance,
} from './enums';

// ─── Legion Tactica Effect Types ────────────────────────────────────────────

/**
 * Identifies a specific legion tactica effect for the engine.
 * Each maps to a concrete modification in the combat/movement/morale pipeline.
 */
export enum LegionTacticaEffectType {
  // ─── Dark Angels (I) ───
  /** Leadership characteristic never modified below this value */
  MinimumLeadership = 'MINIMUM_LEADERSHIP',
  /** Fear (X) can only reduce LD/WP/CL/IN by this maximum */
  MaxFearReduction = 'MAX_FEAR_REDUCTION',

  // ─── Emperor's Children (III) ───
  /** +N Combat Initiative on charge turn */
  ChargeInitiativeBonus = 'CHARGE_INITIATIVE_BONUS',

  // ─── Iron Warriors (IV) ───
  /** Ignore negative LD/Cool modifiers from specified status-inflicting rules */
  IgnoreStatusMoraleMods = 'IGNORE_STATUS_MORALE_MODS',

  // ─── White Scars (V) ───
  /** Optional +N Movement at start of controlling player's turn */
  OptionalMovementBonus = 'OPTIONAL_MOVEMENT_BONUS',

  // ─── Space Wolves (VI) ───
  /** +N inches to set-up move distance (capped at max) */
  SetupMoveBonus = 'SETUP_MOVE_BONUS',

  // ─── Imperial Fists (VII) ───
  /** +N to hit for fire groups with specified traits AND minimum dice count */
  TraitFireGroupHitBonus = 'TRAIT_FIRE_GROUP_HIT_BONUS',

  // ─── Night Lords (VIII) ───
  /** +N WS in melee when any enemy in combat has a tactical status */
  MeleeWSBonusVsStatus = 'MELEE_WS_BONUS_VS_STATUS',

  // ─── Blood Angels (IX) ───
  /** +N Strength on charge turn */
  ChargeStrengthBonus = 'CHARGE_STRENGTH_BONUS',

  // ─── Iron Hands (X) ───
  /** -N to incoming ranged Strength for wound tests (defensive) */
  IncomingRangedStrengthReduction = 'INCOMING_RANGED_STRENGTH_REDUCTION',

  // ─── World Eaters (XII) ───
  /** +N Attacks on charge turn */
  ChargeAttacksBonus = 'CHARGE_ATTACKS_BONUS',

  // ─── Ultramarines (XIII) ───
  /** First reaction each turn costs N less (minimum 0) */
  ReactionCostReduction = 'REACTION_COST_REDUCTION',

  // ─── Death Guard (XIV) ───
  /** Heavy weapons count as stationary after moving ≤N inches */
  HeavyAfterLimitedMove = 'HEAVY_AFTER_LIMITED_MOVE',
  /** Ignore difficult terrain movement penalty */
  IgnoreDifficultTerrainPenalty = 'IGNORE_DIFFICULT_TERRAIN_PENALTY',

  // ─── Thousand Sons (XV) ───
  /** +N to base Willpower characteristic */
  WillpowerBonus = 'WILLPOWER_BONUS',
  /** All models gain Psyker trait */
  GrantPsykerTrait = 'GRANT_PSYKER_TRAIT',

  // ─── Sons of Horus (XVI) ───
  /** Volley attacks fire at full BS instead of snap shots */
  VolleyFullBS = 'VOLLEY_FULL_BS',

  // ─── Word Bearers (XVII) ───
  /** +N Combat Resolution Points in Resolution Sub-Phase */
  CombatResolutionBonus = 'COMBAT_RESOLUTION_BONUS',

  // ─── Salamanders (XVIII) ───
  /** Wound test rolls of N or less always fail (regardless of S/T) */
  MinimumWoundRoll = 'MINIMUM_WOUND_ROLL',
  /** Immune to Panic (X) from weapons with specified trait */
  PanicImmunityFromTrait = 'PANIC_IMMUNITY_FROM_TRAIT',

  // ─── Raven Guard (XIX) ───
  /** Force all attacks to snap shots at ≥N inches range (defensive) */
  ForceSnapShotsAtRange = 'FORCE_SNAP_SHOTS_AT_RANGE',

  // ─── Alpha Legion (XX) ───
  /** Model considered +N inches further away for enemy range calculations */
  VirtualRangeIncrease = 'VIRTUAL_RANGE_INCREASE',

  // ─── Hereticus Rites ───
  /** Emperor's Children: Stupefied status option after being shot */
  StupefiedStatusOption = 'STUPEFIED_STATUS_OPTION',
  /** World Eaters: Lost to the Nails status option after failed LD check */
  LostToTheNailsStatusOption = 'LOST_TO_NAILS_STATUS_OPTION',
}

/**
 * A structured effect for engine processing.
 * Each tactica has one or more of these effects.
 */
export interface LegionTacticaEffect {
  /** Which effect type this is */
  type: LegionTacticaEffectType;
  /** Numeric value for the effect (e.g., +1, 6, 18) */
  value?: number;
  /** Maximum cap for the effect (e.g., setup move max 6") */
  maxValue?: number;
  /** Conditions that must be met for this effect to apply */
  conditions?: LegionTacticaCondition;
}

/**
 * Conditions for when a tactica effect applies.
 */
export interface LegionTacticaCondition {
  /** Only applies during this phase */
  phase?: Phase;
  /** Only applies during this sub-phase */
  subPhase?: SubPhase;
  /** Only applies on the turn the unit charged */
  onChargeTurn?: boolean;
  /** Only applies when the fire group has one of these weapon traits */
  requiresWeaponTrait?: string[];
  /** Only applies when the fire group has at least this many dice */
  requiresFireGroupMinDice?: number;
  /** Only applies when any enemy model in combat has one of these statuses */
  targetHasStatus?: TacticalStatus[];
  /** Only applies when the unit has moved no more than this distance */
  maxMoveDistance?: number;
  /** Only applies when the attack comes from at least this range */
  minimumRange?: number;
  /** Only applies to non-Vehicle models */
  nonVehicleOnly?: boolean;
  /** The weapon trait that triggers panic immunity */
  immunityTriggerTrait?: string;
  /** Whether the effect applies to the entire unit (all models must have the rule) */
  requiresEntireUnit?: boolean;
}

// ─── Advanced Reaction Types ────────────────────────────────────────────────

/**
 * Trigger type for an advanced reaction.
 * Each variant maps to a specific point in the game flow.
 */
export type AdvancedReactionTrigger =
  | { type: 'afterEnemyMoveWithinRange'; range: number; requiresLOS: boolean }
  | { type: 'duringShootingAttackStep'; step: number }
  | { type: 'afterShootingAttackResolved' }
  | { type: 'duringChargeStep'; step: number }
  | { type: 'afterLastInitiativeStep' }
  | { type: 'onChallengeDeclaration' }
  | { type: 'afterVolleyAttacks' };

/**
 * Full definition of an advanced reaction with machine-parseable fields.
 * The actual handler logic lives in the engine; this is the data definition.
 */
export interface AdvancedReactionDefinition {
  /** Unique identifier (e.g., 'vengeance-of-the-first') */
  id: string;
  /** Display name (e.g., 'Vengeance of the First Legion') */
  name: string;
  /** Which legion provides this reaction */
  legion: LegionFaction;
  /** Which phase this reaction can be used in */
  triggerPhase: Phase;
  /** Which sub-phase within the phase */
  triggerSubPhase?: SubPhase;
  /** What triggers this reaction */
  triggerCondition: AdvancedReactionTrigger;
  /** Reaction point cost (always 1 for all known reactions) */
  cost: number;
  /** Whether this can only be used once per battle */
  oncePerBattle: boolean;
  /** Human-readable description of the reaction */
  description: string;
  /** Human-readable conditions for eligibility */
  conditions: string[];
  /** Human-readable effects when the reaction is taken */
  effects: string[];
  /** Whether this requires a specific allegiance (e.g., Hereticus reactions require Traitor) */
  requiredAllegiance?: Allegiance;
  /** Whether this is from a Hereticus rite */
  isHereticus?: boolean;
}

/**
 * Tracks usage of advanced reactions for once-per-battle enforcement.
 */
export interface AdvancedReactionUsage {
  /** The reaction ID that was used */
  reactionId: string;
  /** Which player used it */
  playerIndex: number;
  /** Which battle turn it was used in */
  battleTurn: number;
}

/**
 * Per-army, per-turn state for legion tactica tracking.
 * Reset at the start of each player turn.
 */
export interface LegionTacticaState {
  /** Ultramarines: has the -1 reaction cost discount been used this turn? */
  reactionDiscountUsedThisTurn: boolean;
  /** White Scars: was the +2 Movement bonus activated this turn? */
  movementBonusActiveThisTurn: boolean;
  /** Generic per-turn flags for any tactica that needs per-turn tracking */
  perTurnFlags: Record<string, boolean>;
}

// ─── Legion Gambit Types ────────────────────────────────────────────────────

/**
 * Definition of a legion-specific challenge gambit.
 * Extends the core gambit system with legion-specific mechanics.
 */
export interface LegionGambitDefinition {
  /** Unique identifier (e.g., 'sword-of-the-order') */
  id: string;
  /** Display name (e.g., 'Sword of the Order') */
  name: string;
  /** Which legion this gambit belongs to */
  legion: LegionFaction;
  /** Human-readable description */
  description: string;

  // ─── Availability Conditions ───
  /** Whether this can only be selected in the first Face-Off step */
  firstFaceOffOnly?: boolean;
  /** Whether this can only be used once per challenge */
  oncePerChallenge?: boolean;
  /** Requires a weapon with one of these traits */
  requiresWeaponTrait?: string[];
  /** Requires a weapon matching one of these name patterns */
  requiresWeaponNamePattern?: string[];

  // ─── Focus Roll Modifications ───
  /** Modifier to the Focus Roll result */
  focusRollModifier?: number;
  /** Whether to roll an extra focus die */
  extraFocusDie?: boolean;
  /** Whether to discard the lowest or highest die */
  discardDie?: 'lowest' | 'highest';
  /** Whether Combat Initiative is excluded from the Focus Roll */
  excludeCombatInitiative?: boolean;
  /** Whether to ignore negative modifiers from wounds */
  ignoreWoundNegativeModifiers?: boolean;
  /** Whether to ignore all negative modifiers (only apply positives) */
  ignoreAllNegativeModifiers?: boolean;
  /** Replace Focus Roll result with a characteristic value */
  replaceWithCharacteristic?: 'WP' | 'WS' | 'BS';
  /** Prediction mechanic (White Scars: predict high/low) */
  predictionMechanic?: {
    /** Predict the die result range */
    ranges: { name: string; min: number; max: number }[];
    /** Effect when prediction is correct */
    onCorrect: 'ignoreAllNegativeModifiers';
  };

  // ─── Outside Support Modifications ───
  /** Whether to gain Outside Support bonus */
  gainsOutsideSupport?: boolean;
  /** Multiplier for own Outside Support bonus (default 1) */
  outsideSupportMultiplier?: number;
  /** Maximum opponent Outside Support bonus */
  maxOpponentOutsideSupport?: number;
  /** Alternative Outside Support: +1 per friendly model with specific sub-type on battlefield */
  alternativeOutsideSupportSubType?: string;
  /** Whether Outside Support goes to attacks instead of focus roll (Grandstand-like) */
  outsideSupportToAttacks?: boolean;

  // ─── Strike Modifications ───
  /** Modifier to Attacks characteristic */
  attacksModifier?: number;
  /** Fixed number of attacks (overrides normal) */
  fixedAttacks?: number;
  /** Roll for bonus attacks (e.g., 'D3') */
  bonusAttacksRoll?: string;
  /** Fixed damage for bonus attacks */
  bonusAttackFixedDamage?: number;
  /** Modifier to WS */
  wsModifier?: number;
  /** Modifier to Strength */
  strengthModifier?: number;
  /** Modifier to Damage */
  damageModifier?: number;
  /** Whether to swap WS/A with enemy values */
  swapStatsWithEnemy?: boolean;
  /** Grant a special rule on weapons (e.g., Critical Hit) */
  grantWeaponSpecialRule?: { name: string; value?: string };
  /** Improve existing special rule threshold (e.g., Critical Hit improves by +1) */
  improveWeaponSpecialRule?: { name: string; improvement: number };
  /** Grant a trait-like effect (e.g., Phage(T)) */
  grantTraitEffect?: { name: string; value?: string };
  /** Grant Eternal Warrior during strike */
  grantEternalWarrior?: number;
  /** Set enemy Combat Initiative to a fixed value */
  setEnemyCombatInitiative?: number;

  // ─── Death/Survival Effects ───
  /** On death, inflict automatic hit on opponent */
  onDeathAutoHit?: {
    strength: number;
    ap: number;
    damage: number;
    specialRules?: { name: string; value?: string }[];
  };
  /** Excess wounds spill to other enemy models in combat */
  excessWoundsSpill?: boolean;
  /** On kill, grant bonus to unit */
  onKillUnitBonus?: {
    attacksModifier?: number;
    /** Applies in the following Fight Sub-Phase */
    duration: 'nextFightSubPhase';
  };
  /** Enemy cannot choose to end challenge (must fight to death) */
  preventGloryChoice?: boolean;
  /** Swap challenger for another model in unit */
  allowModelSwap?: boolean;
  /** Can end challenge with no CRP if model survives (Withdraw-like) */
  canEndChallengeNoCRP?: boolean;

  // ─── Self-Damage Mechanics ───
  /** Take N wounds to gain Focus Roll bonus */
  selfDamageForFocusBonus?: {
    /** Wounds taken = focus bonus granted */
    maxWounds: number;
    /** AP of the self-inflicted wounds */
    ap: number;
    /** Damage per wound */
    damage: number;
    /** What saves are allowed */
    allowedSaves: ('armour' | 'invulnerable' | 'damageMitigation')[];
  };
  /** Willpower check: pass = benefit, fail = penalty */
  willpowerCheck?: {
    passEffect: Record<string, number>;
    failEffect: { wound: { ap: number; damage: number; savesAllowed: boolean } };
  };

  // ─── Decapitation Strike (Raven Guard) ───
  /** Make a single test attack first; if both hit+wound succeed, make remaining attacks */
  testAttackMechanic?: boolean;

  // ─── CRP Modifications ───
  /** Bonus CRP per gambit selection if the model wins */
  crpBonusPerSelection?: number;
  /** Bonus CRP on kill */
  crpBonusOnKill?: number;

  // ─── Multi-Round Effects ───
  /** Grants automatic Challenge Advantage next round if model survives */
  grantsNextRoundAdvantage?: boolean;
  /** Tracks enemy misses for cumulative focus bonus (Guard Up) */
  missesGrantFocusBonus?: boolean;
}

// ─── Rite of War Types ──────────────────────────────────────────────────────

/**
 * A structured Rite of War benefit.
 */
export interface RiteOfWarBenefit {
  /** Type of benefit */
  type: 'additionalSlot' | 'unitModifier' | 'armyModifier' | 'specialRule' | 'primeAdvantage' | 'detachmentModifier';
  /** Human-readable description */
  description: string;
  /** Structured effect data */
  effect: Record<string, unknown>;
}

/**
 * A structured Rite of War restriction.
 */
export interface RiteOfWarRestriction {
  /** Type of restriction */
  type: 'excludeUnit' | 'excludeRole' | 'requireUnit' | 'requireRole' | 'allegianceRequired' | 'minimumPoints' | 'detachmentRestriction';
  /** Human-readable description */
  description: string;
  /** Structured restriction data */
  restriction: Record<string, unknown>;
}

/**
 * Full definition of a Rite of War with structured benefits and restrictions.
 */
export interface RiteOfWarDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Which legion this belongs to */
  legion: LegionFaction;
  /** Required allegiance (null = any) */
  requiredAllegiance?: Allegiance;
  /** Whether this is a Hereticus rite */
  isHereticus?: boolean;
  /** Human-readable description */
  description: string;
  /** Structured benefits */
  benefits: RiteOfWarBenefit[];
  /** Structured restrictions */
  restrictions: RiteOfWarRestriction[];
  /** Minimum points limit to use this rite */
  minimumPoints?: number;
  /** The Legion Tactica associated with this rite */
  tacticaId: string;
  /** The Advanced Reaction associated with this rite */
  advancedReactionId: string;
  /** The Legion Gambit associated with this rite */
  gambitId: string;
  /** Prime Advantage description */
  primeAdvantage: {
    name: string;
    description: string;
    effects: string[];
  };
  /** Additional detachments unlocked by this rite */
  additionalDetachments: {
    name: string;
    type: string;
    description: string;
    slots: string[];
  }[];
}
