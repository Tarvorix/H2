/**
 * Unit profile type definitions.
 * Reference: HH_Core.md — "Unit Profile"
 * Reference: legiones_astartes_clean.md — 303 datasheets
 */

import type { ModelCharacteristics, VehicleCharacteristics } from './characteristics';
import type {
  ModelType,
  ModelSubType,
  BattlefieldRole,
} from './enums';
import type { SpecialRuleRef } from './weapons';

/**
 * A complete unit profile as parsed from a datasheet.
 *
 * This represents the static data — what the unit IS.
 * Runtime state (current wounds, position, statuses) is tracked separately in UnitState.
 */
export interface UnitProfile {
  /** Unique identifier (kebab-case of name) */
  id: string;
  /** Display name */
  name: string;
  /** Titles/subtitles from the datasheet */
  titles?: string;
  /** Lore/flavor text */
  lore?: string;
  /** Points cost for the base unit */
  basePoints: number;
  /** Battlefield role (which Force Org slot this fills) */
  battlefieldRole: BattlefieldRole;

  // ─── Model Definitions ───────────────────────────────────────────────
  /**
   * The model types that make up this unit.
   * A unit like Tactical Squad has one model type (Space Marine Legionary).
   * A unit like a Command Squad may have multiple (Chosen, Standard Bearer, etc.).
   */
  modelDefinitions: ModelDefinition[];

  // ─── Unit Composition ────────────────────────────────────────────────
  /** Minimum number of models in the unit (at base points) */
  minModels: number;
  /** Maximum number of models the unit can grow to */
  maxModels: number;
  /** Points cost per additional model beyond base composition */
  pointsPerAdditionalModel: number;

  // ─── Wargear ─────────────────────────────────────────────────────────
  /** Default wargear for all models (weapon IDs from weapon database) */
  defaultWargear: string[];
  /** Wargear options — exchanges and additions with point costs */
  wargearOptions: WargearOption[];

  // ─── Rules & Traits ──────────────────────────────────────────────────
  /** Special rules that apply to all models in this unit */
  specialRules: SpecialRuleRef[];
  /** Traits: Faction, Allegiance, and any custom traits */
  traits: UnitTrait[];

  // ─── Type ────────────────────────────────────────────────────────────
  /** Primary model type */
  unitType: ModelType;
  /** Sub-types */
  unitSubTypes: ModelSubType[];

  // ─── Transport ───────────────────────────────────────────────────────
  /** Access points for transports (positions relative to hull) */
  accessPoints?: AccessPoint[];

  // ─── Dedicated Wargear ───────────────────────────────────────────────
  /**
   * Weapon profiles that are unique to this unit and defined on the datasheet
   * rather than in the shared weapon database. Stored inline.
   */
  dedicatedWeapons?: DedicatedWeapon[];
}

/**
 * A model type within a unit, with its characteristic profile.
 * Some units have multiple model types (e.g., a Sergeant model and regular Legionary models).
 */
export interface ModelDefinition {
  /** Display name for this model type (e.g., "Space Marine Legionary", "Legion Sergeant") */
  name: string;
  /** Primary type for this model, if the datasheet provides a model-level entry. */
  modelType?: ModelType;
  /** Sub-types for this model, if the datasheet provides model-level entries. */
  modelSubTypes?: ModelSubType[];
  /** Base size in mm (e.g., 25, 32, 40, 60) */
  baseSizeMM: number;
  /** How many of this model type are in the base unit (before adding extras) */
  countInBase: number;
  /** Whether additional models purchased are of this type */
  isAdditionalModelType: boolean;
  /**
   * Characteristics — either infantry-style or vehicle-style.
   * The discriminator is the unit's ModelType.
   */
  characteristics: ModelCharacteristics | VehicleCharacteristics;
  /** Whether this model is the unit's leader/sergeant type */
  isLeader: boolean;
  /** Default wargear specific to this model type (overrides or adds to unit default) */
  defaultWargear?: string[];
  /** Special rules specific to this model type */
  specialRules?: SpecialRuleRef[];
}

/**
 * A wargear option from a datasheet.
 * Represents an exchange, addition, or upgrade with a points cost.
 *
 * Example — "Any model in this unit may exchange their bolter for a chainsword for free":
 *   { type: "exchange", description: "...", removes: ["bolter"], adds: ["chainsword"],
 *     pointsCost: 0, scope: "any-model" }
 *
 * Example — "One model may take a missile launcher for +15 pts":
 *   { type: "add", description: "...", adds: ["missile-launcher"],
 *     pointsCost: 15, scope: "one-model" }
 */
export interface WargearOption {
  /** Type of option */
  type: 'exchange' | 'add' | 'upgrade';
  /** Raw description text from the datasheet */
  description: string;
  /** Weapon/wargear IDs that are removed (for exchanges) */
  removes?: string[];
  /** Weapon/wargear IDs that are added */
  adds: string[];
  /** Points cost for this option (0 = free, negative = points refund) */
  pointsCost: number;
  /**
   * How many models in the unit can take this option.
   * - "any-model": any number of models
   * - "one-model": only one model in the unit
   * - "all-models": must apply to all models
   * - "leader": only the leader/sergeant model
   * - A number: up to that many models
   */
  scope: 'any-model' | 'one-model' | 'all-models' | 'leader' | number;
  /** Which model types this option applies to (if not all) */
  applicableModelTypes?: string[];
}

/**
 * A trait on a unit profile.
 */
export interface UnitTrait {
  /** Trait category */
  category: 'Faction' | 'Allegiance' | 'Custom';
  /** Trait value. For Faction: legion name. For Allegiance: Loyalist/Traitor. */
  value: string;
}

export type AccessFacing = 'front' | 'rear' | 'left' | 'right';

export type AccessPointGeometry =
  | {
      /** One or more vehicle facings count as access points. */
      kind: 'facings';
      facings: AccessFacing[];
    }
  | {
      /** Every facing on the hull counts as an access point. */
      kind: 'all-facings';
    }
  | {
      /** The full edge of the model's base counts as an access point. */
      kind: 'base-edge';
    }
  | {
      /**
       * If the model has a base, use the full base edge; otherwise treat all
       * hull facings as access points.
       */
      kind: 'base-edge-or-all-facings';
    };

/**
 * A parsed access-point rule on a transport.
 */
export interface AccessPoint {
  /** Original datasheet line for traceability. */
  label: string;
  /** Structured geometry used by the runtime. */
  geometry: AccessPointGeometry;
}

/**
 * A weapon profile that is unique to a specific unit (defined on the datasheet).
 * These are stored inline rather than referencing the shared weapon database.
 */
export interface DedicatedWeapon {
  /** Weapon ID (unique within this unit) */
  id: string;
  /** Display name */
  name: string;
  /** Category */
  category: 'ranged' | 'melee';
  /** The weapon's characteristics — same structure as shared weapons */
  profile: RangedWeaponInline | MeleeWeaponInline;
  /** Description/flavor text */
  description?: string;
}

/**
 * Inline ranged weapon profile (for dedicated weapons on datasheets).
 * Same fields as RangedWeaponProfile but without id/name (those come from DedicatedWeapon).
 */
export interface RangedWeaponInline {
  range: number;
  hasTemplate: boolean;
  firepower: number;
  rangedStrength: number;
  ap: number | null;
  damage: number;
  specialRules: SpecialRuleRef[];
  traits: string[];
  rangeBand?: { min: number; max: number };
}

/**
 * Inline melee weapon profile (for dedicated weapons on datasheets).
 */
export interface MeleeWeaponInline {
  initiativeModifier: number | string | { op: string; value: number };
  attacksModifier: number | string | { op: string; value: number };
  strengthModifier: number | string | { op: string; value: number };
  ap: number | null;
  damage: number;
  specialRules: SpecialRuleRef[];
  traits: string[];
}
