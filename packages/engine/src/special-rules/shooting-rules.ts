/**
 * Shooting Special Rules Registry & Handlers
 * Reference: HH_Armoury.md — shooting-related special rules
 *
 * Each rule is implemented as a ShootingRuleHandler, keyed by rule name
 * and PipelineHook. The registry allows multiple hooks per rule name
 * (e.g., Twin-linked hooks into both OnHit and PreWound).
 *
 * The applyShootingRules function merges results from all matching
 * handlers for a given hook point and set of weapon special rule refs.
 */

import type { SpecialRuleRef } from '@hh/types';
import { PipelineHook } from '@hh/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Context available to all shooting rule handlers.
 */
export interface ShootingRuleContext {
  /** The special rule ref that triggered this handler */
  ruleRef: SpecialRuleRef;
  /** The pipeline hook point where this handler is executing */
  hook: PipelineHook;
  /** Whether the attack is a snap shot */
  isSnapShot: boolean;
  /** Whether this is a Return Fire attack */
  isReturnFire: boolean;
  /** Whether the firing unit counts as Stationary */
  firerIsStationary: boolean;
}

/**
 * Result of applying a shooting rule at a specific hook point.
 */
export interface ShootingRuleResult {
  // ─── PreHit / OnHit modifications ─────────
  /** Override BS modifier (e.g., Skyfire ignores snap shot penalty vs Flyers) */
  bsModifier?: number;
  /** Whether this weapon ignores LOS (Barrage) */
  ignoresLOS?: boolean;
  /** Whether to re-roll failed hit tests (Twin-linked) */
  rerollFailedHits?: boolean;

  // ─── OnHit modifications ─────────────────
  /** Whether Gets Hot triggers (natural 1s wound firing model) */
  getsHot?: boolean;

  // ─── PreWound / OnWound modifications ─────
  /** Override AP value (Breaching forces AP to 2) */
  overrideAP?: number;
  /** Bonus damage (Shred, Critical add damage) */
  bonusDamage?: number;
  /** Auto-wound regardless of S/T (Poisoned) */
  autoWound?: boolean;
  /** Poisoned threshold (wound on X+ regardless of S/T) */
  poisonedThreshold?: number;
  /** Whether Poisoned affects vehicles (it doesn't) */
  poisonedAffectsVehicles?: boolean;
  /** Re-roll failed wound tests (Twin-linked for wounds context) */
  rerollFailedWounds?: boolean;

  // ─── PreSave modifications ────────────────
  /** Whether to ignore cover saves */
  ignoresCover?: boolean;
  /** AP modifier from Heavy(X) when stationary */
  apModifier?: number;

  // ─── PreDamage modifications ──────────────
  /** Damage mitigation threshold (Shrouded: roll X+ to discard wound) */
  damageMitigationThreshold?: number;
  /** Armourbane: glancing hits count as penetrating */
  armourbane?: boolean;

  // ─── OnDamage modifications ───────────────
  /** Additional HP on penetrating hit (Exoshock: roll X+) */
  exoshockThreshold?: number;
  /** Re-roll failed AP rolls (Sunder) */
  rerollFailedAP?: boolean;

  // ─── OnCasualty modifications ─────────────
  /** Pinning check modifier (Pinning(X)) */
  pinningModifier?: number;
  /** Suppressive check modifier (Suppressive(X)) */
  suppressiveModifier?: number;
  /** Stun check modifier — triggers on HITS not wounds (Stun(X)) */
  stunModifier?: number;
  /** Panic rule modifier (Panic(X)) */
  panicModifier?: number;

  // ─── Weapon trait modifications ───────────
  /** Rapid Fire: double firepower at half range */
  rapidFire?: boolean;
  /** Heavy: snap shots if moved, +AP when stationary */
  heavy?: boolean;
  /** Ordnance: x2 to characteristic when stationary */
  ordnance?: boolean;
}

/**
 * A shooting rule handler function.
 */
export type ShootingRuleHandler = (
  context: ShootingRuleContext,
) => ShootingRuleResult;

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Parse a numeric value from a SpecialRuleRef's value field.
 * Handles values like "4+", "6+", "3", "2", etc.
 *
 * @param ruleRef - The special rule reference to parse
 * @returns The parsed numeric value, or null if parsing fails
 */
function parseRuleValue(ruleRef: SpecialRuleRef): number | null {
  if (!ruleRef.value) return null;
  const stripped = ruleRef.value.trim().replace(/\+$/, '');
  if (!/^\d+$/.test(stripped)) return null;
  return parseInt(stripped, 10);
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Two-level registry: rule name (lowercase) -> PipelineHook -> handler.
 * This allows a single rule to register handlers at multiple hook points.
 */
const shootingRuleRegistry = new Map<string, Map<PipelineHook, ShootingRuleHandler>>();

/**
 * Register a shooting rule handler at a specific hook point.
 *
 * @param name - The rule name (case-insensitive)
 * @param hook - The pipeline hook point where this handler fires
 * @param handler - The handler function
 */
export function registerShootingRule(
  name: string,
  hook: PipelineHook,
  handler: ShootingRuleHandler,
): void {
  const key = name.toLowerCase();
  let hookMap = shootingRuleRegistry.get(key);
  if (!hookMap) {
    hookMap = new Map<PipelineHook, ShootingRuleHandler>();
    shootingRuleRegistry.set(key, hookMap);
  }
  hookMap.set(hook, handler);
}

/**
 * Get a shooting rule handler for a name and hook.
 *
 * @param name - The rule name (case-insensitive)
 * @param hook - The pipeline hook point to look up
 * @returns The handler function, or undefined if not registered
 */
export function getShootingRule(
  name: string,
  hook: PipelineHook,
): ShootingRuleHandler | undefined {
  const hookMap = shootingRuleRegistry.get(name.toLowerCase());
  if (!hookMap) return undefined;
  return hookMap.get(hook);
}

/**
 * Check if a rule is registered at a specific hook.
 *
 * @param name - The rule name (case-insensitive)
 * @param hook - The pipeline hook point to check
 * @returns true if a handler is registered for this name and hook
 */
export function hasShootingRule(name: string, hook: PipelineHook): boolean {
  const hookMap = shootingRuleRegistry.get(name.toLowerCase());
  if (!hookMap) return false;
  return hookMap.has(hook);
}

/**
 * Get all registered shooting rule names.
 *
 * @returns Array of lowercase rule names
 */
export function getRegisteredShootingRuleNames(): string[] {
  return Array.from(shootingRuleRegistry.keys());
}

/**
 * Clear all registered shooting rules (for testing).
 */
export function clearShootingRegistry(): void {
  shootingRuleRegistry.clear();
}

/**
 * Apply all applicable shooting rules at a given hook point.
 * Merges results from all matching rules.
 *
 * For boolean fields, true wins (OR merge).
 * For numeric fields, later rules override earlier ones (last-write-wins),
 * except bonusDamage which accumulates.
 *
 * @param ruleRefs - Array of special rule references on the weapon
 * @param hook - The pipeline hook point to execute
 * @param baseContext - Partial context (ruleRef and hook will be filled per rule)
 * @returns Merged result from all applicable handlers
 */
export function applyShootingRules(
  ruleRefs: SpecialRuleRef[],
  hook: PipelineHook,
  baseContext: Omit<ShootingRuleContext, 'ruleRef' | 'hook'>,
): ShootingRuleResult {
  const merged: ShootingRuleResult = {};

  for (const ruleRef of ruleRefs) {
    const handler = getShootingRule(ruleRef.name, hook);
    if (!handler) continue;

    const context: ShootingRuleContext = {
      ...baseContext,
      ruleRef,
      hook,
    };

    const result = handler(context);

    // ─── PreHit / OnHit ─────────────────────
    if (result.bsModifier !== undefined) {
      merged.bsModifier = result.bsModifier;
    }
    if (result.ignoresLOS) {
      merged.ignoresLOS = true;
    }
    if (result.rerollFailedHits) {
      merged.rerollFailedHits = true;
    }

    // ─── OnHit ──────────────────────────────
    if (result.getsHot) {
      merged.getsHot = true;
    }

    // ─── PreWound / OnWound ─────────────────
    if (result.overrideAP !== undefined) {
      merged.overrideAP = result.overrideAP;
    }
    if (result.bonusDamage !== undefined) {
      merged.bonusDamage = (merged.bonusDamage ?? 0) + result.bonusDamage;
    }
    if (result.autoWound) {
      merged.autoWound = true;
    }
    if (result.poisonedThreshold !== undefined) {
      merged.poisonedThreshold = result.poisonedThreshold;
    }
    if (result.poisonedAffectsVehicles !== undefined) {
      merged.poisonedAffectsVehicles = result.poisonedAffectsVehicles;
    }
    if (result.rerollFailedWounds) {
      merged.rerollFailedWounds = true;
    }

    // ─── PreSave ────────────────────────────
    if (result.ignoresCover) {
      merged.ignoresCover = true;
    }
    if (result.apModifier !== undefined) {
      merged.apModifier = result.apModifier;
    }

    // ─── PreDamage ──────────────────────────
    if (result.damageMitigationThreshold !== undefined) {
      merged.damageMitigationThreshold = result.damageMitigationThreshold;
    }
    if (result.armourbane) {
      merged.armourbane = true;
    }

    // ─── OnDamage ───────────────────────────
    if (result.exoshockThreshold !== undefined) {
      merged.exoshockThreshold = result.exoshockThreshold;
    }
    if (result.rerollFailedAP) {
      merged.rerollFailedAP = true;
    }

    // ─── OnCasualty ─────────────────────────
    if (result.pinningModifier !== undefined) {
      merged.pinningModifier = result.pinningModifier;
    }
    if (result.suppressiveModifier !== undefined) {
      merged.suppressiveModifier = result.suppressiveModifier;
    }
    if (result.stunModifier !== undefined) {
      merged.stunModifier = result.stunModifier;
    }
    if (result.panicModifier !== undefined) {
      merged.panicModifier = result.panicModifier;
    }

    // ─── Weapon trait modifications ─────────
    if (result.rapidFire) {
      merged.rapidFire = true;
    }
    if (result.heavy) {
      merged.heavy = true;
    }
    if (result.ordnance) {
      merged.ordnance = true;
    }
  }

  return merged;
}

// ─── Built-in Rule Handlers ──────────────────────────────────────────────────

// ── OnHit hooks ──────────────────────────────────────────────────────────────

/**
 * Gets Hot: Natural 1s on the hit roll wound the firing model instead.
 * Hook: OnHit
 * Reference: HH_Armoury.md — "Gets Hot"
 */
const getsHotHandler: ShootingRuleHandler = (_context) => {
  return { getsHot: true };
};

/**
 * Twin-linked (OnHit): Re-roll failed hit tests.
 * Hook: OnHit
 * Reference: HH_Armoury.md — "Twin-linked"
 */
const twinLinkedOnHitHandler: ShootingRuleHandler = (_context) => {
  return { rerollFailedHits: true };
};

// ── PreWound hooks ───────────────────────────────────────────────────────────

/**
 * Poisoned (X+): Wounds on X+ regardless of Strength vs Toughness comparison.
 * Does NOT affect vehicles.
 * Hook: PreWound
 * Reference: HH_Armoury.md — "Poisoned"
 */
const poisonedPreWoundHandler: ShootingRuleHandler = (context) => {
  const threshold = parseRuleValue(context.ruleRef);
  return {
    autoWound: true,
    poisonedThreshold: threshold ?? 4,
    poisonedAffectsVehicles: false,
  };
};

/**
 * Twin-linked (PreWound): Re-roll failed wound tests.
 * Hook: PreWound
 * Reference: HH_Armoury.md — "Twin-linked"
 */
const twinLinkedPreWoundHandler: ShootingRuleHandler = (_context) => {
  return { rerollFailedWounds: true };
};

// ── OnWound hooks ────────────────────────────────────────────────────────────

/**
 * Breaching (X+): When the wound roll is >= X, the wound's AP is forced to 2.
 * The handler signals the capability; the actual threshold check happens
 * in wound-resolution where the individual wound roll is known.
 * Hook: OnWound
 * Reference: HH_Armoury.md — "Breaching"
 */
const breachingOnWoundHandler: ShootingRuleHandler = (_context) => {
  return { overrideAP: 2 };
};

/**
 * Shred (X+): When the wound roll is >= X, the wound deals +1 bonus damage.
 * The handler signals the capability; the actual threshold check happens
 * in wound-resolution where the individual wound roll is known.
 * Hook: OnWound
 * Reference: HH_Armoury.md — "Shred"
 */
const shredOnWoundHandler: ShootingRuleHandler = (_context) => {
  return { bonusDamage: 1 };
};

// ── PreSave hooks ────────────────────────────────────────────────────────────

/**
 * Ignores Cover: Target does not benefit from cover saves.
 * Hook: PreSave
 * Reference: HH_Armoury.md — "Ignores Cover"
 */
const ignoresCoverPreSaveHandler: ShootingRuleHandler = (_context) => {
  return { ignoresCover: true };
};

// ── PreDamage hooks ──────────────────────────────────────────────────────────

/**
 * Shrouded (X+): Before damage is applied, roll a d6. On X+, the wound is discarded.
 * Hook: PreDamage
 * Reference: HH_Armoury.md — "Shrouded"
 */
const shroudedPreDamageHandler: ShootingRuleHandler = (context) => {
  const threshold = parseRuleValue(context.ruleRef);
  return { damageMitigationThreshold: threshold ?? 4 };
};

/**
 * Armourbane: Glancing hits count as penetrating hits against vehicles.
 * Hook: PreDamage
 * Reference: HH_Armoury.md — "Armourbane"
 */
const armourbanePreDamageHandler: ShootingRuleHandler = (_context) => {
  return { armourbane: true };
};

// ── OnDamage hooks ───────────────────────────────────────────────────────────

/**
 * Exoshock (X+): On a penetrating hit, roll a d6. On X+, deal +1 additional HP damage.
 * Hook: OnDamage
 * Reference: HH_Armoury.md — "Exoshock"
 */
const exoshockOnDamageHandler: ShootingRuleHandler = (context) => {
  const threshold = parseRuleValue(context.ruleRef);
  return { exoshockThreshold: threshold ?? 4 };
};

/**
 * Sunder: Re-roll failed armour penetration rolls against vehicles.
 * Hook: OnDamage
 * Reference: HH_Armoury.md — "Sunder"
 */
const sunderOnDamageHandler: ShootingRuleHandler = (_context) => {
  return { rerollFailedAP: true };
};

// ── OnCasualty hooks ─────────────────────────────────────────────────────────

/**
 * Pinning (X): After casualties are removed, target unit must make a Pinning check
 * modified by X. On failure, the unit gains the Pinned status.
 * Hook: OnCasualty
 * Reference: HH_Armoury.md — "Pinning"
 */
const pinningOnCasualtyHandler: ShootingRuleHandler = (context) => {
  const modifier = parseRuleValue(context.ruleRef);
  return { pinningModifier: modifier ?? 0 };
};

/**
 * Suppressive (X): After casualties, target must make a Suppressive check
 * modified by X. On failure, the unit gains the Suppressed status.
 * Hook: OnCasualty
 * Reference: HH_Armoury.md — "Suppressive"
 */
const suppressiveOnCasualtyHandler: ShootingRuleHandler = (context) => {
  const modifier = parseRuleValue(context.ruleRef);
  return { suppressiveModifier: modifier ?? 0 };
};

/**
 * Stun (X): Triggers on HITS (not wounds). Target must make a Stun check
 * modified by X. On failure, the unit gains the Stunned status.
 * Hook: OnCasualty
 * Reference: HH_Armoury.md — "Stun"
 */
const stunOnCasualtyHandler: ShootingRuleHandler = (context) => {
  const modifier = parseRuleValue(context.ruleRef);
  return { stunModifier: modifier ?? 0 };
};

/**
 * Panic (X): After casualties, target must make a Panic check
 * modified by X. On failure, the unit gains the Routed status.
 * Hook: OnCasualty
 * Reference: HH_Armoury.md — "Panic"
 */
const panicOnCasualtyHandler: ShootingRuleHandler = (context) => {
  const modifier = parseRuleValue(context.ruleRef);
  return { panicModifier: modifier ?? 0 };
};

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register all built-in shooting special rules with the registry.
 * Call this once at engine initialization.
 */
export function registerAllShootingRules(): void {
  // ── OnHit hooks ────────────────────────────
  registerShootingRule('Gets Hot', PipelineHook.OnHit, getsHotHandler);
  registerShootingRule('Twin-linked', PipelineHook.OnHit, twinLinkedOnHitHandler);

  // ── PreWound hooks ─────────────────────────
  registerShootingRule('Poisoned', PipelineHook.PreWound, poisonedPreWoundHandler);
  registerShootingRule('Twin-linked', PipelineHook.PreWound, twinLinkedPreWoundHandler);

  // ── OnWound hooks ──────────────────────────
  registerShootingRule('Breaching', PipelineHook.OnWound, breachingOnWoundHandler);
  registerShootingRule('Shred', PipelineHook.OnWound, shredOnWoundHandler);

  // ── PreSave hooks ──────────────────────────
  registerShootingRule('Ignores Cover', PipelineHook.PreSave, ignoresCoverPreSaveHandler);

  // ── PreDamage hooks ────────────────────────
  registerShootingRule('Shrouded', PipelineHook.PreDamage, shroudedPreDamageHandler);
  registerShootingRule('Armourbane', PipelineHook.PreDamage, armourbanePreDamageHandler);

  // ── OnDamage hooks ─────────────────────────
  registerShootingRule('Exoshock', PipelineHook.OnDamage, exoshockOnDamageHandler);
  registerShootingRule('Sunder', PipelineHook.OnDamage, sunderOnDamageHandler);

  // ── OnCasualty hooks ───────────────────────
  registerShootingRule('Pinning', PipelineHook.OnCasualty, pinningOnCasualtyHandler);
  registerShootingRule('Suppressive', PipelineHook.OnCasualty, suppressiveOnCasualtyHandler);
  registerShootingRule('Stun', PipelineHook.OnCasualty, stunOnCasualtyHandler);
  registerShootingRule('Panic', PipelineHook.OnCasualty, panicOnCasualtyHandler);
}
