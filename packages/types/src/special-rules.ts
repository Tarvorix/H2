/**
 * Special rule definitions.
 * Reference: HH_Armoury.md — "CORE SPECIAL RULES"
 */

import type { PipelineHook } from './enums';

/**
 * A special rule definition in the rules dictionary.
 *
 * Each special rule defines:
 * - Its name and description
 * - Whether it's variable (has an X parameter)
 * - Which pipeline hooks it affects
 *
 * Example — Armourbane:
 *   { id: "armourbane", name: "Armourbane", isVariable: false,
 *     hooks: [PipelineHook.OnDamage],
 *     description: "Glancing Hits count as Penetrating Hits..." }
 *
 * Example — Breaching (X):
 *   { id: "breaching", name: "Breaching", isVariable: true,
 *     parameterType: "targetNumber",
 *     hooks: [PipelineHook.OnWound],
 *     description: "On wound roll >= X, wound becomes AP 2..." }
 */
export interface SpecialRuleDefinition {
  /** Unique identifier (kebab-case) */
  id: string;
  /** Display name (without parameter) */
  name: string;
  /** Full rules text description */
  description: string;
  /** Whether this rule has a variable parameter (X) */
  isVariable: boolean;
  /**
   * What type of parameter X represents.
   * Only present when isVariable is true.
   * - "targetNumber": a d6 target like "4+" or "6+"
   * - "numeric": a plain number like 1, 2, 3
   * - "characteristic": a stat reference like "D", "FP", "RS", "S", "Strength"
   * - "status": a TacticalStatus value
   * - "trait": a Trait value
   * - "distance": a measurement in inches
   */
  parameterType?: SpecialRuleParameterType;
  /** Which points in the resolution pipeline this rule hooks into */
  hooks: PipelineHook[];
  /**
   * Category for organizational purposes.
   * Not used by the engine, just for human readability.
   */
  category: SpecialRuleCategory;
}

export type SpecialRuleParameterType =
  | 'targetNumber'
  | 'numeric'
  | 'characteristic'
  | 'status'
  | 'trait'
  | 'distance';

export type SpecialRuleCategory =
  | 'combat'
  | 'shooting'
  | 'assault'
  | 'movement'
  | 'morale'
  | 'defensive'
  | 'transport'
  | 'deployment'
  | 'army-building'
  | 'psychic'
  | 'passive'
  | 'status-inflicting'
  | 'vehicle';

/**
 * Psychic power definition.
 * Reference: HH_Armoury.md — "PSYCHIC DISCIPLINES"
 */
export interface PsychicPowerDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Full rules text */
  description: string;
  /** Which discipline this power belongs to */
  discipline: string;
  /** Power type: Blessing targets friendlies, Curse targets enemies */
  powerType: 'Blessing' | 'Curse';
  /** The phase in which this power is used */
  phase: string;
  /** Effects applied when the power is successfully manifested */
  effects: string;
}

/**
 * Psychic weapon definition — a weapon granted by a psychic discipline.
 * These are resolved through the normal shooting/melee pipeline but require
 * a Manifestation Check (Willpower Check: 2d6 >= WP) first.
 */
export interface PsychicWeaponDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Which discipline grants this weapon */
  discipline: string;
  /** The weapon profile (ranged or melee) */
  weaponProfileId: string;
  /** Additional rules text */
  description: string;
}

/**
 * Psychic reaction definition — a reaction granted by a psychic discipline.
 * Requires spending reaction allotment + a Manifestation Check.
 * Reference: HH_Armoury.md — "PSYCHIC DISCIPLINES"
 */
export interface PsychicReactionDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Full rules text */
  description: string;
  /** Which discipline grants this reaction */
  discipline: string;
  /** Phase(s) in which this reaction can be used */
  phase: string;
  /** Cost in reaction allotment points */
  cost: number;
  /** Effects applied when the reaction is successfully manifested */
  effects: string;
}

/**
 * Psychic gambit definition — a challenge gambit granted by a psychic discipline.
 * Used during the Challenge Sub-Phase Face-Off step.
 * Reference: HH_Armoury.md — "PSYCHIC DISCIPLINES"
 */
export interface PsychicGambitDefinition {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Full rules text */
  description: string;
  /** Which discipline grants this gambit */
  discipline: string;
  /** Effects applied when the gambit is used */
  effects: string;
}

/**
 * A complete psychic discipline.
 * Reference: HH_Armoury.md
 */
export interface PsychicDisciplineDefinition {
  /** Unique identifier */
  id: string;
  /** Display name (e.g., "Biomancy") */
  name: string;
  /** Description of the discipline */
  description: string;
  /** Psychic weapons granted by this discipline */
  weapons: PsychicWeaponDefinition[];
  /** Psychic powers granted by this discipline */
  powers: PsychicPowerDefinition[];
  /** Psychic reactions granted by this discipline */
  reactions: PsychicReactionDefinition[];
  /** Psychic gambits granted by this discipline */
  gambits: PsychicGambitDefinition[];
  /** Special rules granted by this discipline (e.g., Impact(Strength)) */
  grantedSpecialRules: { name: string; value?: string }[];
  /** Trait granted to psykers with this discipline */
  grantedTrait: string;
}
