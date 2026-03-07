/**
 * Shooting Pipeline Types
 * All interfaces and types specific to the shooting attack resolution pipeline.
 * Reference: HH_Rules_Battle.md — Shooting Phase Steps 1-11
 */

import type { Position } from '@hh/types';
import type { SpecialRuleRef, RangedWeaponProfile } from '@hh/types';
import { VehicleFacing } from '@hh/types';

// ─── Shooting Step Enum ──────────────────────────────────────────────────────

/**
 * Tracks which step of the 11-step shooting pipeline we're in.
 */
export enum ShootingStep {
  /** Steps 1-4: Declaring attack, validating target, weapons, forming fire groups */
  DECLARING = 'DECLARING',
  /** Step 5-6: Resolving hit tests for current fire group */
  RESOLVING_HITS = 'RESOLVING_HITS',
  /** Step 7: Resolving wound tests or armour penetration for current fire group */
  RESOLVING_WOUNDS = 'RESOLVING_WOUNDS',
  /** Step 8: Defender selects target model for wounds */
  AWAITING_TARGET_SELECTION = 'AWAITING_TARGET_SELECTION',
  /** Step 9: Resolving saving throws and damage */
  RESOLVING_SAVES = 'RESOLVING_SAVES',
  /** Step 10: Moving to next fire group */
  NEXT_FIRE_GROUP = 'NEXT_FIRE_GROUP',
  /** Before Step 11: Checking for Return Fire reaction */
  AWAITING_RETURN_FIRE = 'AWAITING_RETURN_FIRE',
  /** Step 11: Removing casualties and rolling vehicle damage table */
  REMOVING_CASUALTIES = 'REMOVING_CASUALTIES',
  /** Attack fully resolved */
  COMPLETE = 'COMPLETE',
}

// ─── Fire Group Types ────────────────────────────────────────────────────────

/**
 * A single attack contribution from one model in a fire group.
 */
export interface FireGroupAttack {
  /** ID of the model making this attack */
  modelId: string;
  /** Firepower contributed by this model's weapon */
  firepower: number;
  /** Ballistic Skill of this model */
  ballisticSkill: number;
  /** The resolved weapon profile being fired */
  weaponProfile: ResolvedWeaponProfile;
  /** Whether this model must fire as snap shots */
  isSnapShot: boolean;
}

/**
 * A resolved weapon profile with all data needed for attack resolution.
 * This is the weapon data at resolution time, not the static profile.
 */
export interface ResolvedWeaponProfile {
  /** Weapon ID for reference */
  id: string;
  /** Weapon name */
  name: string;
  /** Range in inches */
  range: number;
  /** Whether this is a template weapon */
  hasTemplate: boolean;
  /** Firepower characteristic */
  firepower: number;
  /** Ranged Strength */
  rangedStrength: number;
  /** Armour Penetration value (null = no AP) */
  ap: number | null;
  /** Damage per wound */
  damage: number;
  /** Special rules on this weapon */
  specialRules: SpecialRuleRef[];
  /** Weapon traits (Bolt, Assault, Heavy, etc.) */
  traits: string[];
}

/**
 * A fire group — attacks grouped by weapon name, profile, and BS.
 * Reference: HH_Rules_Battle.md Step 4
 */
export interface FireGroup {
  /** Index of this fire group in the attack's fire group list */
  index: number;
  /** Unit currently being resolved by this fire group. Defaults to the declared target unit. */
  targetUnitId?: string;
  /** Weapon name that defines this group */
  weaponName: string;
  /** Weapon profile name (for multi-profile weapons) */
  profileName?: string;
  /** Ballistic Skill for this group (all attacks share same BS) */
  ballisticSkill: number;
  /** Whether all attacks in this group are snap shots */
  isSnapShot: boolean;
  /** Individual attack contributions */
  attacks: FireGroupAttack[];
  /** Total firepower of all attacks in this group */
  totalFirepower: number;
  /** Special rules that apply to this fire group's weapons */
  specialRules: SpecialRuleRef[];
  /** Weapon traits */
  traits: string[];
  /** Resolved weapon profile (representative for the group) */
  weaponProfile: ResolvedWeaponProfile;

  // ─── Resolution tracking ─────────────────
  /** Hit test results */
  hits: HitResult[];
  /** Wound test results (vs non-vehicles) */
  wounds: WoundResult[];
  /** Penetrating hit results (vs vehicles) */
  penetratingHits: PenetratingHitResult[];
  /** Glancing hit results (vs vehicles, set aside for Step 11) */
  glancingHits: GlancingHit[];
  /** Whether this fire group has been fully resolved */
  resolved: boolean;
  /** Whether hit resolution has already been converted into final hit entries for this group. */
  hitPoolResolved: boolean;
  /** Whether this is a precision hits fire group (split from parent) */
  isPrecisionGroup: boolean;
  /** Whether this is a deflagrate additional hits group */
  isDeflagrateGroup: boolean;
}

// ─── Hit Results ─────────────────────────────────────────────────────────────

/**
 * Result of a single hit test roll.
 */
export interface HitResult {
  /** The dice roll value (1-6) */
  diceRoll: number;
  /** Target number needed to hit */
  targetNumber: number;
  /** Whether this roll was a successful hit */
  isHit: boolean;
  /** Whether this was a critical hit (BS6+: roll >= criticalOn) */
  isCritical: boolean;
  /** Whether this was a precision hit (roll >= Precision(X)) */
  isPrecision: boolean;
  /** Whether this was a rending hit (roll >= Rending(X)) */
  isRending: boolean;
  /** Whether this was an auto-hit (BS10+) */
  isAutoHit: boolean;
  /** ID of the model that made this attack */
  sourceModelId: string;
  /** Weapon strength for wound resolution */
  weaponStrength: number;
  /** Weapon AP for save resolution */
  weaponAP: number | null;
  /** Weapon damage value */
  weaponDamage: number;
  /** Special rules carried forward from the weapon */
  specialRules: SpecialRuleRef[];
}

// ─── Wound Results ───────────────────────────────────────────────────────────

/**
 * Result of a single wound test roll (vs non-vehicle targets).
 */
export interface WoundResult {
  /** The dice roll value (1-6), or -1 for auto-wounds (rending, critical) */
  diceRoll: number;
  /** Target number needed to wound */
  targetNumber: number;
  /** Whether this roll inflicted a wound */
  isWound: boolean;
  /** Strength of the wound */
  strength: number;
  /** AP of the wound (may be modified by Breaching) */
  ap: number | null;
  /** Damage of the wound (may be modified by Shred, Critical) */
  damage: number;
  /** Whether this is a Breaching wound (AP forced to 2) */
  isBreaching: boolean;
  /** Whether Shred(X) triggered (+1 damage) */
  isShred: boolean;
  /** Whether Poisoned(X) triggered (auto-wound) */
  isPoisoned: boolean;
  /** Whether this came from a critical hit (auto-wound, +1 damage) */
  isCriticalWound: boolean;
  /** Whether this came from a rending hit (auto-wound) */
  isRendingWound: boolean;
  /** Whether this is a precision wound (attacker allocates) */
  isPrecision: boolean;
  /** Special rules on this wound */
  specialRules: SpecialRuleRef[];
  /** ID of model this wound is assigned to (set in Step 8) */
  assignedToModelId?: string;
}

// ─── Vehicle Damage Results ──────────────────────────────────────────────────

/**
 * Result of an armour penetration test (vs vehicles).
 */
export interface PenetratingHitResult {
  /** The dice roll value (1-6) */
  diceRoll: number;
  /** Weapon strength */
  strength: number;
  /** Total roll (d6 + strength) */
  total: number;
  /** Armour value of the targeted facing */
  armourValue: number;
  /** Which facing was targeted */
  facing: VehicleFacing;
  /** Whether this was a penetrating hit (total > AV) */
  isPenetrating: boolean;
  /** Damage of the penetrating hit */
  damage: number;
  /** Special rules on this hit */
  specialRules: SpecialRuleRef[];
  /** ID of model this hit is assigned to (set in Step 8) */
  assignedToModelId?: string;
}

/**
 * A glancing hit result (set aside for Vehicle Damage Table in Step 11).
 */
export interface GlancingHit {
  /** Which facing was hit */
  facing: VehicleFacing;
  /** ID of the vehicle model that was hit */
  vehicleModelId: string;
  /** Unit ID of the vehicle */
  vehicleUnitId: string;
}

// ─── Save Results ────────────────────────────────────────────────────────────

/**
 * Result of a saving throw attempt.
 */
export interface SaveResult {
  /** The dice roll value (1-6) */
  diceRoll: number;
  /** Target number needed to save */
  targetNumber: number;
  /** Type of save attempted */
  saveType: SaveType;
  /** Whether the save was successful */
  passed: boolean;
  /** ID of the model making the save */
  modelId: string;
}

export type SaveType = 'armour' | 'invulnerable' | 'cover' | 'damageMitigation';

/**
 * Describes an available save option for a model against a wound.
 */
export interface AvailableSave {
  /** Type of save */
  saveType: SaveType;
  /** Target number */
  targetNumber: number;
  /** Source of the save (characteristic, terrain, special rule) */
  source: string;
}

// ─── Weapon Assignment ───────────────────────────────────────────────────────

/**
 * A weapon assignment from the UI — which model fires which weapon.
 */
export interface WeaponAssignment {
  /** ID of the model firing */
  modelId: string;
  /** ID of the weapon being fired */
  weaponId: string;
  /** Profile name for multi-profile weapons (optional) */
  profileName?: string;
}

// ─── Morale Check Tracking ───────────────────────────────────────────────────

/**
 * A pending morale/status check to resolve in the Morale Sub-Phase.
 */
export interface PendingMoraleCheck {
  /** Unit that needs to take the check */
  unitId: string;
  /** Type of check */
  checkType: MoraleCheckType;
  /** Modifier to apply (from Pinning(X), Suppressive(X), etc.) */
  modifier: number;
  /** Source description (e.g., "Pinning (3)" from Heavy Bolter) */
  source: string;
}

export type MoraleCheckType =
  | 'panic'          // 25% casualties → Leadership check → Routed
  | 'pinning'        // Pinning(X) → Cool Check → Pinned
  | 'suppressive'    // Suppressive(X) → Cool Check → Suppressed
  | 'stun'           // Stun(X) → Cool Check → Stunned
  | 'panicRule'      // Panic(X) → Leadership Check → Routed
  | 'coherency';     // Out of coherency → Cool Check → Suppressed

// ─── Shooting Attack State ───────────────────────────────────────────────────

/**
 * Complete state of an in-progress shooting attack.
 * Stored in GameState.shootingAttackState during resolution.
 */
export interface ShootingAttackState {
  /** ID of the attacking unit */
  attackerUnitId: string;
  /** ID of the target unit */
  targetUnitId: string;
  /** Player index of the attacker */
  attackerPlayerIndex: number;
  /** Vehicle facing being targeted (null for non-vehicles) */
  targetFacing: VehicleFacing | null;
  /** Weapon assignments from the declaration */
  weaponAssignments: WeaponAssignment[];
  /** All fire groups formed from the weapon assignments */
  fireGroups: FireGroup[];
  /** Index of the fire group currently being resolved */
  currentFireGroupIndex: number;
  /** Current step in the pipeline */
  currentStep: ShootingStep;

  /** Accumulated glancing hits across all fire groups (for Step 11) */
  accumulatedGlancingHits: GlancingHit[];
  /** Model IDs of casualties set aside for removal in Step 11 */
  accumulatedCasualties: string[];
  /** Unit sizes at start of attack (for 25% panic threshold) */
  unitSizesAtStart: Record<string, number>;

  /** Pending morale checks to resolve after attack */
  pendingMoraleChecks: PendingMoraleCheck[];

  /** Whether Return Fire has been offered/resolved */
  returnFireResolved: boolean;
  /** Whether this is a Return Fire reaction attack (applies restrictions) */
  isReturnFire: boolean;

  /** IDs of models with LOS to target (filtered in Step 2) */
  modelsWithLOS: string[];

  /** Blast marker position (for Blast weapons) */
  blastMarkerPosition?: Position;
  /** Whether blast scattered */
  blastScattered?: boolean;
  /** Models hit by blast/template */
  blastTemplateModelIds?: string[];
}

// ─── Convenience type for resolving weapon from data ─────────────────────────

/**
 * Helper to convert from data package RangedWeaponProfile to our ResolvedWeaponProfile.
 */
export function resolveWeaponFromData(weapon: RangedWeaponProfile): ResolvedWeaponProfile {
  return {
    id: weapon.id,
    name: weapon.name,
    range: weapon.range,
    hasTemplate: weapon.hasTemplate,
    firepower: weapon.firepower,
    rangedStrength: weapon.rangedStrength,
    ap: weapon.ap,
    damage: weapon.damage,
    specialRules: [...weapon.specialRules],
    traits: [...weapon.traits],
  };
}
