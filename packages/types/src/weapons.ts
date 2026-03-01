/**
 * Weapon profile type definitions.
 * Reference: HH_Principles.md — "Wargear Characteristics"
 * Reference: HH_Legiones_Astartes.md — weapon tables
 */

import type { WeaponTrait } from './enums';

/**
 * A ranged weapon profile.
 *
 * Example — Bolter:
 *   { name: "Bolter", range: 24, firepower: 2, rangedStrength: 4, ap: 5, damage: 1,
 *     specialRules: [], traits: ["Bolt"] }
 *
 * Example — Lascannon:
 *   { name: "Lascannon", range: 48, firepower: 1, rangedStrength: 9, ap: 2, damage: 1,
 *     specialRules: ["Heavy (D)", "Armourbane"], traits: ["Las"] }
 */
export interface RangedWeaponProfile {
  /** Unique identifier for this weapon profile */
  id: string;
  /** Display name */
  name: string;
  /**
   * Range in inches. Special values:
   * - 0 or null = cannot make ranged attacks
   * - "Template" encoded as 0 with hasTemplate: true
   */
  range: number;
  /** Whether this weapon uses a template (flame weapons) */
  hasTemplate: boolean;
  /** Firepower — number of dice rolled per attack */
  firepower: number;
  /** Ranged Strength — used for wound tests / armour penetration */
  rangedStrength: number;
  /** Armour Penetration — modifies target's armour save. Lower is better. null = no AP ('-') */
  ap: number | null;
  /** Damage — wounds/HP removed per unsaved wound */
  damage: number;
  /** Special rules attached to this weapon (references to special rules dictionary) */
  specialRules: SpecialRuleRef[];
  /** Weapon traits (family + usage type) */
  traits: WeaponTrait[];
  /** For multi-profile weapons, the parent weapon ID */
  parentWeaponId?: string;
  /** For range-dependent profiles (e.g., conversion beamers), the range band */
  rangeBand?: RangeBand;
}

/**
 * A melee weapon profile.
 *
 * IM/AM/SM can be:
 * - A fixed number (e.g., 1 for Power Fist IM)
 * - A stat reference string ('I', 'A', 'S') meaning "use model's stat"
 * - A modifier string ('+1', '+2', '-1', 'x2') meaning "modify model's stat"
 *
 * Example — Chainsword:
 *   { name: "Chainsword", initiativeModifier: "I", attacksModifier: "A",
 *     strengthModifier: "S", ap: 5, damage: 1, specialRules: [], traits: ["Chain"] }
 *
 * Example — Power Fist:
 *   { name: "Power Fist", initiativeModifier: 1, attacksModifier: "A",
 *     strengthModifier: "x2", ap: 2, damage: 2, specialRules: ["Unwieldy"], traits: ["Power"] }
 */
export interface MeleeWeaponProfile {
  /** Unique identifier for this weapon profile */
  id: string;
  /** Display name */
  name: string;
  /** Initiative Modifier — modifies model's I for combat initiative */
  initiativeModifier: StatModifier;
  /** Attacks Modifier — modifies model's A for number of attacks */
  attacksModifier: StatModifier;
  /** Strength Modifier — modifies model's S for wound tests */
  strengthModifier: StatModifier;
  /** Armour Penetration. null = no AP ('-') */
  ap: number | null;
  /** Damage — wounds removed per unsaved wound */
  damage: number;
  /** Special rules attached to this weapon */
  specialRules: SpecialRuleRef[];
  /** Weapon traits (family type) */
  traits: WeaponTrait[];
  /** For multi-profile weapons, the parent weapon ID */
  parentWeaponId?: string;
}

/**
 * Stat modifier for melee weapon characteristics (IM, AM, SM).
 *
 * Reference: HH_Principles.md — "Characteristics That Modify Other Characteristics"
 *
 * Can be:
 * - A fixed number: replaces the model's stat entirely (e.g., IM: 1 for Power Fist)
 * - A stat reference: 'I', 'A', or 'S' meaning use model's current value
 * - A modifier: '+N', '-N', or 'xN' meaning add/subtract/multiply model's stat
 */
export type StatModifier = number | StatReference | StatModifierOp;

/**
 * Reference to a model's base characteristic.
 */
export type StatReference = 'I' | 'A' | 'S';

/**
 * A modifier operation applied to a model characteristic.
 */
export interface StatModifierOp {
  /** The operation type */
  op: 'add' | 'subtract' | 'multiply';
  /** The operand value */
  value: number;
}

/**
 * Range band for weapons with range-dependent profiles (e.g., conversion beamers).
 */
export interface RangeBand {
  /** Minimum range (exclusive, except 0 which is inclusive) */
  min: number;
  /** Maximum range (inclusive) */
  max: number;
}

/**
 * A reference to a special rule with optional parameter value.
 * This is how weapons and units reference rules from the special rules dictionary.
 *
 * Examples:
 * - { name: "Armourbane" }                    — non-variable rule
 * - { name: "Heavy", value: "D" }             — variable rule with characteristic
 * - { name: "Breaching", value: "4+" }         — variable rule with target number
 * - { name: "Blast", value: '3"' }             — variable rule with size
 * - { name: "Pinning", value: "1" }            — variable rule with numeric value
 * - { name: "Melta", value: "6" }              — variable rule with numeric value
 */
export interface SpecialRuleRef {
  /** The base name of the special rule (without the (X) parameter) */
  name: string;
  /** The value of X for variable special rules, or undefined for non-variable rules */
  value?: string;
}

/**
 * A weapon entry that may contain multiple profiles.
 * Used for weapons like the Missile Launcher (Frag + Krak) or
 * range-dependent weapons like the Conversion Beamer.
 */
export interface WeaponEntry {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Weapon category */
  category: 'ranged' | 'melee';
  /** Individual profiles — one for simple weapons, multiple for multi-profile */
  profiles: (RangedWeaponProfile | MeleeWeaponProfile)[];
  /** Flavor text / description */
  description?: string;
}
