/**
 * Core Model Characteristics for non-Vehicle models.
 * Reference: HH_Principles.md — "Core Characteristics"
 *
 * All values are integers. Higher is better for all except SAV and INV
 * where lower is better (and '-' means no save available).
 */
export interface ModelCharacteristics {
  /** Movement — how far the model can move in inches */
  M: number;
  /** Weapon Skill — melee combat ability */
  WS: number;
  /** Ballistic Skill — ranged combat ability */
  BS: number;
  /** Strength — used for melee wound tests */
  S: number;
  /** Toughness — resistance to being wounded */
  T: number;
  /** Wounds — damage capacity before removal */
  W: number;
  /** Initiative — combat order in assault, used for Reposition reaction distance */
  I: number;
  /** Attacks — number of melee attacks */
  A: number;
  /** Leadership — used for morale/panic checks */
  LD: number;
  /** Cool — used to resist tactical statuses (Pinned, Suppressed, etc.) */
  CL: number;
  /** Willpower — used for psychic manifestation/resistance checks */
  WP: number;
  /** Intelligence — used for Battlesmith and other special ability checks */
  IN: number;
  /** Armour Save — target number on d6 to negate a wound (2+ best, null = no save) */
  SAV: SavingThrow;
  /** Invulnerable Save — save that ignores AP modification (null = no invuln) */
  INV: SavingThrow;
}

/**
 * Vehicle Characteristics.
 * Reference: HH_Principles.md — "Vehicle Characteristics"
 *
 * Vehicles use a different stat line than infantry/cavalry.
 */
export interface VehicleCharacteristics {
  /** Movement — how far the vehicle can move in inches */
  M: number;
  /** Ballistic Skill — ranged combat ability */
  BS: number;
  /** Front Armour — armour value on the front facing */
  frontArmour: number;
  /** Side Armour — armour value on the side facings */
  sideArmour: number;
  /** Rear Armour — armour value on the rear facing */
  rearArmour: number;
  /** Hull Points — damage capacity before destruction */
  HP: number;
  /** Transport Capacity — how many models/bulky points can embark (0 = no transport) */
  transportCapacity: number;
}

/**
 * Saving throw value. Either a target number (2-6) with implicit '+',
 * or null meaning no save available ('-' on the datasheet).
 */
export type SavingThrow = number | null;
