/**
 * Legion Tactica Registry
 *
 * Parallel to the special-rules registries, but keyed by (LegionFaction, PipelineHook)
 * instead of (ruleName, PipelineHook). Tacticas are unit-level effects checked via
 * the unit's Faction Trait, applied AFTER weapon special rules in the pipeline.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections
 */

import type {
  GameState,
  UnitState,
  ModelState,
  LegionTacticaEffect,
  SpecialRuleRef,
} from '@hh/types';
import { LegionFaction, PipelineHook } from '@hh/types';

// ─── Context Types ──────────────────────────────────────────────────────────

/**
 * Base context for all legion tactica handlers.
 * Provides access to game state and the unit applying the tactica.
 */
export interface LegionTacticaContext {
  /** Current game state (read-only) */
  state: GameState;
  /** The unit to which the tactica applies */
  unit: UnitState;
  /** The structured effects defined for this tactica */
  effects: LegionTacticaEffect[];
  /** Which pipeline hook is being evaluated */
  hook: PipelineHook;
}

/**
 * Extended context for shooting pipeline hooks.
 */
export interface ShootingTacticaContext extends LegionTacticaContext {
  /** Whether the unit is the attacker (true) or defender (false) */
  isAttacker: boolean;
  /** Whether this is a snap shot */
  isSnapShot: boolean;
  /** Whether the firer counts as stationary */
  firerIsStationary: boolean;
  /** How far the firer has moved this turn (in inches) */
  firerMoveDistance: number;
  /** Distance to target (in inches) */
  distanceToTarget: number;
  /** Weapon traits for the current fire group */
  weaponTraits: string[];
  /** Number of dice in the current fire group */
  fireGroupDiceCount: number;
  /** Special rules on the weapon being fired */
  weaponSpecialRules: SpecialRuleRef[];
  /** Whether all models in the unit share the same legion tactica */
  entireUnitHasTactica: boolean;
}

/**
 * Extended context for assault pipeline hooks.
 */
export interface AssaultTacticaContext extends LegionTacticaContext {
  /** Whether this is a charge turn for the unit */
  isChargeTurn: boolean;
  /** Whether this is a challenge */
  isChallenge: boolean;
  /** The enemy units in this combat */
  enemyUnits: UnitState[];
  /** Whether all models in the unit share the same legion tactica */
  entireUnitHasTactica: boolean;
}

/**
 * Extended context for movement pipeline hooks.
 */
export interface MovementTacticaContext extends LegionTacticaContext {
  /** How far the unit has moved so far this turn */
  moveDistance: number;
  /** Whether all models in the unit share the same legion tactica */
  entireUnitHasTactica: boolean;
}

/**
 * Extended context for morale/passive pipeline hooks.
 */
export interface MoraleTacticaContext extends LegionTacticaContext {
  /** The specific model being checked (if applicable) */
  model?: ModelState;
  /** Whether all models in the unit share the same legion tactica */
  entireUnitHasTactica: boolean;
  /** The incoming Fear (X) value (if applicable) */
  incomingFearValue?: number;
  /** The weapon trait that caused the morale check (if applicable) */
  triggeringWeaponTrait?: string;
}

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result from a legion tactica handler.
 * Fields are optional — only set when the tactica modifies something.
 */
export interface LegionTacticaResult {
  // ─── Shooting Modifiers ───
  /** Hit test modifier (e.g., Imperial Fists +1 for Bolt fire groups) */
  hitModifier?: number;
  /** Whether to force snap shots (e.g., Raven Guard at 18"+) */
  forceSnapShots?: boolean;
  /** Whether the unit counts as stationary for heavy weapons (e.g., Death Guard) */
  countsAsStationary?: boolean;
  /** Wound test modifier (incoming strength reduction, e.g., Iron Hands -1) */
  incomingStrengthModifier?: number;
  /** Minimum wound roll (wounds below this always fail, e.g., Salamanders 2) */
  minimumWoundRoll?: number;
  /** Virtual range increase for enemy calculations (e.g., Alpha Legion +2") */
  virtualRangeIncrease?: number;
  /** Whether volley attacks use full BS (e.g., Sons of Horus) */
  volleyFullBS?: boolean;

  // ─── Assault Modifiers ───
  /** Combat Initiative modifier (e.g., Emperor's Children +1) */
  combatInitiativeModifier?: number;
  /** Strength modifier in melee (e.g., Blood Angels +1 on charge) */
  meleeStrengthModifier?: number;
  /** Attacks modifier in melee (e.g., World Eaters +1 on charge) */
  meleeAttacksModifier?: number;
  /** Weapon Skill modifier in melee (e.g., Night Lords +1 vs status) */
  meleeWSModifier?: number;
  /** Combat Resolution Points bonus (e.g., Word Bearers +1) */
  crpBonus?: number;

  // ─── Movement Modifiers ───
  /** Movement bonus in inches (e.g., White Scars +2) */
  movementBonus?: number;
  /** Setup move bonus in inches (e.g., Space Wolves +2, max 6) */
  setupMoveBonus?: number;
  /** Maximum setup move distance (e.g., Space Wolves cap at 6") */
  setupMoveMax?: number;
  /** Whether to ignore difficult terrain penalty (e.g., Death Guard) */
  ignoresDifficultTerrain?: boolean;

  // ─── Passive/Morale Modifiers ───
  /** Minimum Leadership value (never modified below, e.g., Dark Angels 6) */
  minimumLeadership?: number;
  /** Maximum Fear reduction to LD/WP/CL/IN (e.g., Dark Angels 1) */
  maxFearReduction?: number;
  /** Whether to ignore negative LD/Cool mods from status-inflicting rules (e.g., Iron Warriors) */
  ignoreStatusMoraleMods?: boolean;
  /** Willpower bonus (e.g., Thousand Sons +1) */
  willpowerBonus?: number;
  /** Whether all models gain Psyker trait (e.g., Thousand Sons) */
  grantPsykerTrait?: boolean;
  /** Reaction cost reduction (e.g., Ultramarines -1 once per turn) */
  reactionCostReduction?: number;
  /** Whether the unit is immune to Panic from a specific weapon trait (e.g., Salamanders vs Flame) */
  panicImmunityFromTrait?: string;

  // ─── Hereticus Status Options ───
  /** Whether the Stupefied status option is available (EC Hereticus) */
  stupefiedStatusOption?: boolean;
  /** Whether the Lost to the Nails status option is available (WE Hereticus) */
  lostToTheNailsStatusOption?: boolean;
}

// ─── Handler Type ───────────────────────────────────────────────────────────

/**
 * A legion tactica handler function.
 * Takes context for a specific pipeline hook and returns modifications.
 */
export type LegionTacticaHandler = (
  context: LegionTacticaContext | ShootingTacticaContext | AssaultTacticaContext | MovementTacticaContext | MoraleTacticaContext,
) => LegionTacticaResult;

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Two-level registry: LegionFaction → PipelineHook → Handler[]
 * Multiple handlers can be registered for the same legion+hook (e.g., Death Guard
 * has both HeavyAfterLimitedMove and IgnoreDifficultTerrain at Movement hook).
 */
const tacticaRegistry = new Map<LegionFaction, Map<PipelineHook, LegionTacticaHandler[]>>();
let legionTacticasInitialized = false;

/**
 * Register a legion tactica handler for a specific legion and pipeline hook.
 */
export function registerLegionTactica(
  legion: LegionFaction,
  hook: PipelineHook,
  handler: LegionTacticaHandler,
): void {
  if (!tacticaRegistry.has(legion)) {
    tacticaRegistry.set(legion, new Map());
  }
  const hookMap = tacticaRegistry.get(legion)!;
  if (!hookMap.has(hook)) {
    hookMap.set(hook, []);
  }
  hookMap.get(hook)!.push(handler);
}

/**
 * Get all handlers for a specific legion and pipeline hook.
 */
export function getLegionTacticaHandlers(
  legion: LegionFaction,
  hook: PipelineHook,
): LegionTacticaHandler[] {
  return tacticaRegistry.get(legion)?.get(hook) ?? [];
}

/**
 * Check if any handlers are registered for a legion and hook.
 */
export function hasLegionTactica(
  legion: LegionFaction,
  hook: PipelineHook,
): boolean {
  const handlers = tacticaRegistry.get(legion)?.get(hook);
  return handlers !== undefined && handlers.length > 0;
}

/**
 * Clear all registered legion tacticas (for testing).
 */
export function clearLegionTacticaRegistry(): void {
  tacticaRegistry.clear();
  legionTacticasInitialized = false;
}

/**
 * Get all registered legion-hook pairs (for diagnostics/testing).
 */
export function getRegisteredLegionTacticas(): Array<{ legion: LegionFaction; hook: PipelineHook }> {
  const result: Array<{ legion: LegionFaction; hook: PipelineHook }> = [];
  for (const [legion, hookMap] of tacticaRegistry) {
    for (const [hook, handlers] of hookMap) {
      if (handlers.length > 0) {
        result.push({ legion, hook });
      }
    }
  }
  return result;
}

// ─── Apply Function ─────────────────────────────────────────────────────────

/**
 * Apply all registered legion tactica handlers for a given legion and hook.
 * Merges results from all matching handlers.
 *
 * @param legion - The legion whose tacticas to apply
 * @param hook - The pipeline hook point
 * @param context - The handler context (type depends on hook)
 * @returns Merged result of all applied handlers
 */
export function applyLegionTactica(
  legion: LegionFaction,
  hook: PipelineHook,
  context: LegionTacticaContext | ShootingTacticaContext | AssaultTacticaContext | MovementTacticaContext | MoraleTacticaContext,
): LegionTacticaResult {
  ensureLegionTacticasRegistered();
  const handlers = getLegionTacticaHandlers(legion, hook);
  if (handlers.length === 0) return {};

  const merged: LegionTacticaResult = {};

  for (const handler of handlers) {
    const result = handler(context);

    // ─── Shooting Modifiers (accumulate) ───
    if (result.hitModifier !== undefined) {
      merged.hitModifier = (merged.hitModifier ?? 0) + result.hitModifier;
    }
    if (result.forceSnapShots) {
      merged.forceSnapShots = true;
    }
    if (result.countsAsStationary) {
      merged.countsAsStationary = true;
    }
    if (result.incomingStrengthModifier !== undefined) {
      merged.incomingStrengthModifier = (merged.incomingStrengthModifier ?? 0) + result.incomingStrengthModifier;
    }
    if (result.minimumWoundRoll !== undefined) {
      // Take the highest minimum (strictest)
      merged.minimumWoundRoll = Math.max(merged.minimumWoundRoll ?? 0, result.minimumWoundRoll);
    }
    if (result.virtualRangeIncrease !== undefined) {
      merged.virtualRangeIncrease = (merged.virtualRangeIncrease ?? 0) + result.virtualRangeIncrease;
    }
    if (result.volleyFullBS) {
      merged.volleyFullBS = true;
    }

    // ─── Assault Modifiers (accumulate) ───
    if (result.combatInitiativeModifier !== undefined) {
      merged.combatInitiativeModifier = (merged.combatInitiativeModifier ?? 0) + result.combatInitiativeModifier;
    }
    if (result.meleeStrengthModifier !== undefined) {
      merged.meleeStrengthModifier = (merged.meleeStrengthModifier ?? 0) + result.meleeStrengthModifier;
    }
    if (result.meleeAttacksModifier !== undefined) {
      merged.meleeAttacksModifier = (merged.meleeAttacksModifier ?? 0) + result.meleeAttacksModifier;
    }
    if (result.meleeWSModifier !== undefined) {
      merged.meleeWSModifier = (merged.meleeWSModifier ?? 0) + result.meleeWSModifier;
    }
    if (result.crpBonus !== undefined) {
      merged.crpBonus = (merged.crpBonus ?? 0) + result.crpBonus;
    }

    // ─── Movement Modifiers (accumulate/OR) ───
    if (result.movementBonus !== undefined) {
      merged.movementBonus = (merged.movementBonus ?? 0) + result.movementBonus;
    }
    if (result.setupMoveBonus !== undefined) {
      merged.setupMoveBonus = (merged.setupMoveBonus ?? 0) + result.setupMoveBonus;
    }
    if (result.setupMoveMax !== undefined) {
      // Take the lowest max (most restrictive)
      merged.setupMoveMax = Math.min(merged.setupMoveMax ?? Infinity, result.setupMoveMax);
    }
    if (result.ignoresDifficultTerrain) {
      merged.ignoresDifficultTerrain = true;
    }

    // ─── Passive/Morale Modifiers ───
    if (result.minimumLeadership !== undefined) {
      // Take the highest minimum
      merged.minimumLeadership = Math.max(merged.minimumLeadership ?? 0, result.minimumLeadership);
    }
    if (result.maxFearReduction !== undefined) {
      // Take the lowest max (most restrictive)
      merged.maxFearReduction = Math.min(merged.maxFearReduction ?? Infinity, result.maxFearReduction);
    }
    if (result.ignoreStatusMoraleMods) {
      merged.ignoreStatusMoraleMods = true;
    }
    if (result.willpowerBonus !== undefined) {
      merged.willpowerBonus = (merged.willpowerBonus ?? 0) + result.willpowerBonus;
    }
    if (result.grantPsykerTrait) {
      merged.grantPsykerTrait = true;
    }
    if (result.reactionCostReduction !== undefined) {
      merged.reactionCostReduction = (merged.reactionCostReduction ?? 0) + result.reactionCostReduction;
    }
    if (result.panicImmunityFromTrait !== undefined) {
      merged.panicImmunityFromTrait = result.panicImmunityFromTrait;
    }

    // ─── Hereticus Status Options (OR) ───
    if (result.stupefiedStatusOption) {
      merged.stupefiedStatusOption = true;
    }
    if (result.lostToTheNailsStatusOption) {
      merged.lostToTheNailsStatusOption = true;
    }
  }

  return merged;
}

// ─── Registration ───────────────────────────────────────────────────────────

// Imports for registration are deferred to avoid circular dependencies.
// The registerAllLegionTacticas function is called during engine initialization.

import { registerShootingTacticas } from './tacticas/shooting-tacticas';
import { registerAssaultTacticas } from './tacticas/assault-tacticas';
import { registerMovementTacticas } from './tacticas/movement-tacticas';
import { registerPassiveTacticas } from './tacticas/passive-tacticas';
import { registerHereticusTacticas } from './tacticas/hereticus-tacticas';

/**
 * Register all 18 legion tacticas + 2 Hereticus tacticas.
 * Called once during engine initialization.
 */
export function registerAllLegionTacticas(): void {
  if (legionTacticasInitialized) {
    return;
  }
  registerShootingTacticas();
  registerAssaultTacticas();
  registerMovementTacticas();
  registerPassiveTacticas();
  registerHereticusTacticas();
  legionTacticasInitialized = true;
}

function ensureLegionTacticasRegistered(): void {
  if (legionTacticasInitialized) {
    return;
  }
  if (tacticaRegistry.size > 0) {
    return;
  }
  registerAllLegionTacticas();
}
