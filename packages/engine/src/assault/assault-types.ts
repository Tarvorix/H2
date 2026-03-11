/**
 * Assault Phase Internal Types
 * Engine-internal types for assault state tracking and resolution.
 *
 * Reference: HH_Rules_Battle.md — "Assault Phase"
 * Reference: HH_Principles.md — "Melee Hit Tests", "Reactions"
 */

import type { Position } from '@hh/types';
import type { TacticalStatus } from '@hh/types';

// ─── Charge State ───────────────────────────────────────────────────────────

/**
 * Current step in the charge procedure.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Steps 1-5
 */
export type ChargeStep =
  | 'DECLARING'
  | 'CHECKING_RANGE'
  | 'SETUP_MOVE'
  | 'VOLLEY_ATTACKS'
  | 'AWAITING_OVERWATCH'
  | 'CHARGE_ROLL'
  | 'CHARGE_MOVE'
  | 'COMPLETE'
  | 'FAILED';

/**
 * State of an in-progress charge.
 * Stored on GameState.assaultAttackState during the Charge Sub-Phase.
 */
export interface ChargeState {
  /** ID of the charging unit */
  chargingUnitId: string;
  /** ID of the target unit */
  targetUnitId: string;
  /** Player index of the charger (active player) */
  chargerPlayerIndex: number;
  /** Current step in the charge procedure */
  chargeStep: ChargeStep;
  /** Set-up move distance (from I+M table) */
  setupMoveDistance: number;
  /** Charge roll result (2d6, discard lowest) */
  chargeRoll: number;
  /** Whether this is a Disordered Charge */
  isDisordered: boolean;
  /** Whether the charge completed via set-up move base contact */
  chargeCompleteViaSetup: boolean;
  /** Whether Overwatch has been offered/resolved */
  overwatchResolved: boolean;
  /** Distance between closest models (for charge roll comparison) */
  closestDistance: number;
  /** IDs of models with LOS to target */
  modelsWithLOS: string[];
}

// ─── Combat State ──────────────────────────────────────────────────────────

/**
 * Tracks an active combat in the Fight/Resolution sub-phases.
 * A combat may involve multiple units per side.
 */
export interface CombatState {
  /** Unique combat identifier */
  combatId: string;
  /** Unit IDs on the active player's side */
  activePlayerUnitIds: string[];
  /** Unit IDs on the reactive player's side */
  reactivePlayerUnitIds: string[];
  /** Initiative steps for this combat, sorted highest to lowest */
  initiativeSteps: InitiativeStep[];
  /** Index of the current initiative step being resolved */
  currentInitiativeStepIndex: number;
  /** Combat Resolution Points for active player's side */
  activePlayerCRP: number;
  /** Combat Resolution Points for reactive player's side */
  reactivePlayerCRP: number;
  /** Challenge state (if a challenge is active within this combat) */
  challengeState: ChallengeState | null;
  /** Melee weapon declarations per model for the fight step. */
  weaponDeclarations?: { modelId: string; weaponId: string }[];
  /** Model IDs of casualties on the active player's side */
  activePlayerCasualties: string[];
  /** Model IDs of casualties on the reactive player's side */
  reactivePlayerCasualties: string[];
  /** Unit IDs that have already completed an aftermath choice in Resolution. */
  aftermathResolvedUnitIds?: string[];
  /** Whether this combat has been fully resolved */
  resolved: boolean;
  /** Whether one side was completely wiped (massacre) */
  isMassacre: boolean;
  /** Player index that won the massacre (if applicable) */
  massacreWinnerPlayerIndex: number | null;
}

// ─── Challenge State ────────────────────────────────────────────────────────

/**
 * Current step in the challenge procedure.
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 1-5
 */
export type ChallengeStep =
  | 'DECLARE'
  | 'FACE_OFF'
  | 'FOCUS'
  | 'STRIKE'
  | 'GLORY';

/**
 * Tracks a challenge within a combat.
 */
export interface ChallengeState {
  /** Model ID of the challenger */
  challengerId: string;
  /** Model ID of the challenged */
  challengedId: string;
  /** Unit ID of the challenger's unit */
  challengerUnitId: string;
  /** Unit ID of the challenged's unit */
  challengedUnitId: string;
  /** Player index of the challenger */
  challengerPlayerIndex: number;
  /** Player index of the challenged */
  challengedPlayerIndex: number;
  /** Current step in the challenge procedure */
  currentStep: ChallengeStep;
  /** Gambit selected by the challenger */
  challengerGambit: string | null;
  /** Gambit selected by the challenged */
  challengedGambit: string | null;
  /** Player index that has Challenge Advantage (null if none yet) */
  challengeAdvantagePlayerIndex: number | null;
  /** Focus roll results: [challenger total, challenged total] */
  focusRolls: [number, number] | null;
  /** Wounds inflicted by challenger */
  challengerWoundsInflicted: number;
  /** Wounds inflicted by challenged */
  challengedWoundsInflicted: number;
  /** Current round of the challenge (1-based) */
  round: number;
  /** CRP earned by challenger */
  challengerCRP: number;
  /** CRP earned by challenged */
  challengedCRP: number;
  /** Weapon selected by challenger */
  challengerWeaponId: string | null;
  /** Weapon selected by challenged */
  challengedWeaponId: string | null;
  /** Guard Up bonus tracker: accumulated focus bonus for next round */
  guardUpFocusBonus: { [playerIndex: number]: number };
  /** Test the Foe: if true, this player gets auto Challenge Advantage next round */
  testTheFoeAdvantage: { [playerIndex: number]: boolean };
  /** Taunt and Bait selection count (for CRP bonus) */
  tauntAndBaitSelections: { [playerIndex: number]: number };
  /** Whether the Withdraw gambit was chosen (can end challenge without CRP) */
  withdrawChosen: { [playerIndex: number]: boolean };
}

// ─── Strike Group (Melee) ──────────────────────────────────────────────────

/**
 * A group of melee attacks with the same weapon and initiative.
 * Parallel to shooting FireGroup.
 */
export interface MeleeStrikeGroup {
  /** Index for ordering */
  index: number;
  /** Weapon name */
  weaponName: string;
  /** Attacking model IDs */
  attackerModelIds: string[];
  /** Target unit ID */
  targetUnitId: string;
  /** Weapon Skill of attacker(s) */
  weaponSkill: number;
  /** Combat Initiative value for this group */
  combatInitiative: number;
  /** Total number of attacks */
  totalAttacks: number;
  /** Weapon Strength (resolved from SM modifier) */
  weaponStrength: number;
  /** Weapon AP */
  weaponAP: number | null;
  /** Weapon Damage */
  weaponDamage: number;
  /** Weapon special rules */
  specialRules: { name: string; value?: string }[];
  /** Hit test results */
  hits: MeleeHitResult[];
  /** Wound test results */
  wounds: MeleeWoundResult[];
  /** Penetrating hits (for vehicles) */
  penetratingHits: MeleePenetratingHit[];
  /** Glancing hits (for vehicles) */
  glancingHits: MeleeGlancingHit[];
  /** Whether this group has been resolved */
  resolved: boolean;
  /** Player index of the attacker */
  attackerPlayerIndex: number;
}

// ─── Initiative Step ────────────────────────────────────────────────────────

/**
 * One initiative step in the fight sequence.
 * Models with the same Combat Initiative value fight simultaneously.
 */
export interface InitiativeStep {
  /** The initiative value for this step */
  initiativeValue: number;
  /** Model IDs fighting at this initiative value (all sides) */
  modelIds: string[];
  /** Strike groups for this step */
  strikeGroups: MeleeStrikeGroup[];
  /** Whether this step has been fully resolved */
  resolved: boolean;
}

// ─── Melee Hit/Wound Result Types ──────────────────────────────────────────

/**
 * Result of a melee hit test.
 */
export interface MeleeHitResult {
  /** The dice roll value */
  diceRoll: number;
  /** Target number needed to hit */
  targetNumber: number;
  /** Whether this was a hit */
  isHit: boolean;
  /** Whether this was a critical hit (natural 6, or Critical Hit(X) rule) */
  isCritical: boolean;
  /** Whether this was a precision hit */
  isPrecision: boolean;
  /** Whether this was a rending hit */
  isRending: boolean;
  /** Source model ID */
  sourceModelId: string;
  /** Weapon strength */
  weaponStrength: number;
  /** Weapon AP */
  weaponAP: number | null;
  /** Weapon damage */
  weaponDamage: number;
  /** Special rules on the weapon */
  specialRules: { name: string; value?: string }[];
}

/**
 * Result of a melee wound test.
 */
export interface MeleeWoundResult {
  /** The dice roll value */
  diceRoll: number;
  /** Target number needed to wound */
  targetNumber: number;
  /** Whether a wound was inflicted */
  isWound: boolean;
  /** Strength used */
  strength: number;
  /** AP value (may be modified by Breaching) */
  ap: number | null;
  /** Damage value (may be modified by Shred, Critical) */
  damage: number;
  /** Whether this wound is Breaching */
  isBreaching: boolean;
  /** Whether Shred was applied */
  isShred: boolean;
  /** Whether Poisoned was used */
  isPoisoned: boolean;
  /** Whether this is a Critical wound */
  isCriticalWound: boolean;
  /** Whether this is a Rending wound */
  isRendingWound: boolean;
  /** Whether this is a Precision wound */
  isPrecision: boolean;
  /** Special rules */
  specialRules: { name: string; value?: string }[];
  /** Model ID this wound is assigned to */
  assignedToModelId?: string;
}

/**
 * Penetrating hit result against a vehicle in melee.
 */
export interface MeleePenetratingHit {
  /** Dice roll */
  diceRoll: number;
  /** Strength used */
  strength: number;
  /** Total (dice + strength) */
  total: number;
  /** Armour value hit (always rear in melee) */
  armourValue: number;
  /** Whether this is penetrating */
  isPenetrating: boolean;
  /** Damage to apply */
  damage: number;
  /** Special rules */
  specialRules: { name: string; value?: string }[];
  /** Assigned to model ID */
  assignedToModelId?: string;
}

/**
 * Glancing hit against a vehicle in melee.
 */
export interface MeleeGlancingHit {
  /** Vehicle model ID */
  vehicleModelId: string;
  /** Vehicle unit ID */
  vehicleUnitId: string;
}

// ─── Set-up Move Table ──────────────────────────────────────────────────────

/**
 * Set-up Move distance lookup.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 3
 *
 * | I + M Total | Move |
 * |-------------|------|
 * | 1-6         | 1"   |
 * | 7-9         | 2"   |
 * | 10-11       | 3"   |
 * | 12-13       | 4"   |
 * | 14-19       | 5"   |
 * | 20+         | 6"   |
 */
export function calculateSetupMoveDistance(initiative: number, movement: number): number {
  const total = initiative + movement;
  if (total <= 6) return 1;
  if (total <= 9) return 2;
  if (total <= 11) return 3;
  if (total <= 13) return 4;
  if (total <= 19) return 5;
  return 6;
}

// ─── Basic Close Combat Profile ─────────────────────────────────────────────

/**
 * The fallback melee weapon profile used when a model has no melee weapon.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Step 2
 *
 * IM=1, AM=A (use model's attacks), SM=S-1, AP=none, D=none
 */
export const BASIC_CLOSE_COMBAT_WEAPON = {
  name: 'Close Combat Attack',
  initiativeModifier: 1 as number | string, // Fixed value 1
  attackModifier: 'A' as number | string, // Use model's Attacks
  strengthModifier: 'S-1' as number | string, // Use model's Strength - 1
  ap: null as number | null,
  damage: 1,
  specialRules: [] as { name: string; value?: string }[],
};

// ─── Gambit Effect Types ────────────────────────────────────────────────────

/**
 * Effect definition for a Challenge Gambit.
 */
export interface GambitEffect {
  /** Gambit name (matches ChallengeGambit enum value) */
  name: string;
  /** Whether this gambit adds an extra focus die */
  extraFocusDie: boolean;
  /** Whether to discard the lowest or highest extra die ('lowest' for Seize, 'highest' for Grandstand/Finishing) */
  discardDie: 'lowest' | 'highest' | null;
  /** Modifier to Weapon Skill */
  wsModifier: number;
  /** Fixed number of attacks (overrides; 0 means no override) */
  fixedAttacks: number;
  /** Bonus attacks (additive, e.g., Flurry of Blows uses D3) */
  bonusAttacksRoll: 'D3' | null;
  /** Fixed damage on bonus attack hits (from Flurry of Blows: Damage 1) */
  bonusAttackFixedDamage: number | null;
  /** Modifier to Strength */
  strengthModifier: number;
  /** Modifier to Damage */
  damageModifier: number;
  /** Whether outside support is blocked for focus roll */
  blocksOutsideSupportFocus: boolean;
  /** Whether outside support value goes to attacks instead of focus */
  outsideSupportToAttacks: boolean;
  /** Whether this gambit can only be chosen by the first chooser */
  firstChooserOnly: boolean;
  /** Whether this gambit allows naming a blocked gambit for opponent */
  blocksOpponentGambit: boolean;
  /** Whether this gambit allows ending challenge with no CRP */
  allowsWithdraw: boolean;
  /** Whether surviving grants auto Challenge Advantage next round */
  grantsNextRoundAdvantage: boolean;
  /** Whether each enemy miss grants +1 to next focus roll */
  missesGrantFocusBonus: boolean;
  /** Whether WS/A become enemy's values */
  swapStatsWithEnemy: boolean;
  /** CRP bonus per selection if winner */
  crpBonusPerSelection: number;
}

// ─── Aftermath Types ────────────────────────────────────────────────────────

/**
 * Result of an aftermath option being executed.
 */
export interface AftermathResult {
  /** Updated positions for models (if any movement occurred) */
  modelMoves: { modelId: string; from: Position; to: Position }[];
  /** Whether the unit is still locked in combat after this aftermath */
  stillLockedInCombat: boolean;
  /** Whether Routed status was applied */
  routedApplied: boolean;
  /** Status changes applied */
  statusChanges: { unitId: string; status: TacticalStatus; applied: boolean }[];
  /** Whether a pursue caught a fleeing unit */
  pursueCaught: boolean;
  /** The pursue roll result (if pursue was chosen) */
  pursueRoll: number;
}
