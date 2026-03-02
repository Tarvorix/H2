/**
 * Army building types.
 * Reference: HH_Battle_AOD.md — "Armies In The Age Of Darkness"
 */

import type {
  Allegiance,
  ArmyFaction,
  LegionFaction,
  BattlefieldRole,
  DetachmentType,
} from './enums';

/**
 * A Force Organisation Chart slot.
 * Represents one position in the chart that a unit can fill.
 */
export interface ForceOrgSlot {
  /** Unique identifier within this chart */
  id: string;
  /** Which battlefield role this slot accepts */
  role: BattlefieldRole;
  /** Whether this is a Prime Slot (provides bonuses when filled) */
  isPrime: boolean;
  /** The unit filling this slot (null if empty) */
  filledByUnitId: string | null;
}

/**
 * A detachment in army construction.
 * Reference: HH_Battle_AOD.md — "Detachment Types"
 */
export interface DetachmentDefinition {
  /** Unique identifier */
  id: string;
  /** Detachment type */
  type: DetachmentType;
  /** Faction for this detachment */
  faction: LegionFaction;
  /** Allegiance */
  allegiance: Allegiance;
  /** Available Force Org slots */
  slots: ForceOrgSlot[];
}

/**
 * A Rite of War — army-wide modification with restrictions.
 * Reference: HH_Legiones_Astartes.md — per-legion Rites of War
 */
export interface RiteOfWar {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Which legion this belongs to (null if universal) */
  legionFaction: LegionFaction | null;
  /** Description */
  description: string;
  /** Benefits granted */
  benefits: string[];
  /** Restrictions imposed */
  restrictions: string[];
  /** Minimum points limit required to use this Rite of War */
  minimumPoints?: number;
}

/**
 * A complete army list for validation.
 */
export interface ArmyList {
  /** Player name */
  playerName: string;
  /** Points limit */
  pointsLimit: number;
  /** Total points used */
  totalPoints: number;
  /** Primary faction */
  faction: ArmyFaction;
  /** Allegiance */
  allegiance: Allegiance;
  /** Faction doctrine payload (if any) */
  doctrine?: ArmyDoctrine;
  /** Rite of War (if any) */
  riteOfWar?: string;
  /** Detachments */
  detachments: ArmyListDetachment[];
  /** Warlord unit ID */
  warlordUnitId?: string;
}

/**
 * A detachment within an army list.
 */
export interface ArmyListDetachment {
  /** Unique identifier within the army list */
  id: string;
  /** Reference to the DetachmentTemplate ID this was created from */
  detachmentTemplateId: string;
  /** Detachment type */
  type: DetachmentType;
  /** Faction */
  faction: ArmyFaction;
  /** Parent detachment for linked detachment rules (Auxiliary/Apex inheritance, etc.) */
  parentDetachmentId?: string;
  /** Units in this detachment */
  units: ArmyListUnit[];
  /** Doctrine payload selected specifically for this detachment */
  doctrine?: ArmyDoctrine;
}

/**
 * A unit entry in an army list.
 */
export interface ArmyListUnit {
  /** Unique ID in this army list */
  id: string;
  /** Reference to UnitProfile ID */
  profileId: string;
  /** Number of models selected */
  modelCount: number;
  /** Selected wargear options (indices into the profile's wargearOptions array) */
  selectedOptions: SelectedWargearOption[];
  /** Total points cost for this unit (base + models + options) */
  totalPoints: number;
  /** Which Force Org slot this fills */
  battlefieldRole: BattlefieldRole;
  /** Original legion lineage for faction-mixing rules (e.g. Shattered Legions). */
  originLegion?: LegionFaction;
}

export interface BlackshieldsDoctrine {
  kind: 'blackshields';
  /**
   * Oath IDs selected for this detachment. Primary detachment usually has 2,
   * Allied usually has 1, and linked Auxiliary/Apex detachments inherit.
   */
  oathIds: string[];
  /** Optional legion selected for Panoply of Old and similar oath effects. */
  selectedLegionForArmoury?: LegionFaction;
}

export interface ShatteredLegionsDoctrine {
  kind: 'shatteredLegions';
  /** Exactly 2 or 3 legions selected for Mutable Tactics. */
  selectedLegions: LegionFaction[];
  /**
   * Prime slot links for Exemplars of the Legion:
   * key = prime command unit id, value = added slot legion lineage.
   */
  exemplarLegionByPrimeUnitId?: Record<string, LegionFaction>;
}

export type ArmyDoctrine =
  | BlackshieldsDoctrine
  | ShatteredLegionsDoctrine;

/**
 * A wargear option selection within an army list unit.
 */
export interface SelectedWargearOption {
  /** Index into the UnitProfile.wargearOptions array */
  optionIndex: number;
  /** How many models take this option */
  count: number;
  /** Which specific model IDs take this option (for limited scope options) */
  modelIndices?: number[];
}

/**
 * Validation result for an army list.
 */
export interface ArmyValidationResult {
  /** Whether the army is legal */
  isValid: boolean;
  /** List of validation errors */
  errors: ArmyValidationError[];
  /** List of warnings (legal but potentially unintended) */
  warnings: string[];
}

export interface ArmyValidationError {
  /** Error severity */
  severity: 'error' | 'warning';
  /** Which part of the army has the error */
  scope: 'army' | 'detachment' | 'unit';
  /** Identifier of the problematic element */
  elementId?: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Legion Tactica — passive rules for a specific legion.
 * Reference: HH_Legiones_Astartes.md — per-legion sections
 */
export interface LegionTactica {
  /** Unique identifier */
  id: string;
  /** Legion this applies to */
  legion: ArmyFaction;
  /** Display name */
  name: string;
  /** Description of the effects */
  description: string;
  /** The specific rules effects (parsed for engine use) */
  effects: string[];
}

/**
 * Legion Advanced Reaction definition.
 * Reference: HH_Legiones_Astartes.md — "Advanced Reactions"
 */
export interface AdvancedReaction {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Which legion provides this reaction */
  legion: ArmyFaction;
  /** Which phase this reaction can be used in */
  triggerPhase: string;
  /** Description of the reaction */
  description: string;
  /** Conditions that must be met to use this reaction */
  conditions: string[];
  /** Effects when the reaction is taken */
  effects: string[];
}
