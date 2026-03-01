/**
 * Assault Special Rules Registry & Handlers
 * Reference: HH_Armoury.md — assault/melee-related special rules
 *
 * Each rule is implemented as an AssaultRuleHandler, keyed by rule name
 * and PipelineHook. The registry allows multiple hooks per rule name.
 *
 * Assault-specific rules: Impact, Reaping Blow, Duellist's Edge, Detonation, Hatred, Fear
 * Reused from shooting: Rending, Critical Hit, Breaching, Feel No Pain, Poisoned, Force, Shred
 */

import type { SpecialRuleRef } from '@hh/types';
import { PipelineHook } from '@hh/types';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Context available to all assault rule handlers.
 */
export interface AssaultRuleContext {
  /** The special rule ref that triggered this handler */
  ruleRef: SpecialRuleRef;
  /** The pipeline hook point where this handler is executing */
  hook: PipelineHook;
  /** Whether this is a charge attack (for Impact rule) */
  isChargeAttack: boolean;
  /** Whether this is a challenge (for Reaping Blow exclusion) */
  isChallenge: boolean;
  /** Whether the attacker is outnumbered (for Reaping Blow) */
  isOutnumbered: boolean;
  /** Number of friendly models in combat (for Reaping Blow Bulky count) */
  friendlyModelCount: number;
  /** Number of enemy models in combat (for Reaping Blow) */
  enemyModelCount: number;
  /** Whether the target is a vehicle */
  targetIsVehicle: boolean;
  /** Whether the target is immobile */
  targetIsImmobile: boolean;
}

/**
 * Result of applying an assault rule at a specific hook point.
 */
export interface AssaultRuleResult {
  // ─── PreHit / OnHit modifications ─────────
  /** Whether to re-roll failed hit tests */
  rerollFailedHits?: boolean;

  // ─── OnHit modifications ─────────────────
  /** Auto-wound on hit roll >= X (Rending) */
  rendingThreshold?: number;
  /** Auto-wound + bonus damage on hit roll >= X (Critical Hit) */
  criticalHitThreshold?: number;
  /** Critical Hit bonus damage */
  criticalBonusDamage?: number;
  /** Whether this is a precision hit (choose target model) */
  isPrecision?: boolean;

  // ─── PreWound / OnWound modifications ─────
  /** Override AP value (Breaching forces AP to 2 on wound roll >= X) */
  breachingThreshold?: number;
  /** Override AP value when Breaching triggers */
  overrideAP?: number;
  /** Bonus damage from Shred or Critical */
  bonusDamage?: number;
  /** Auto-wound regardless of S/T (Poisoned on X+) */
  poisonedThreshold?: number;
  /** Whether Poisoned affects vehicles (it doesn't) */
  poisonedAffectsVehicles?: boolean;
  /** Re-roll failed wound tests */
  rerollFailedWounds?: boolean;
  /** Bonus to wound roll (Hatred: +1) */
  woundRollBonus?: number;

  // ─── PreSave modifications ────────────────
  /** AP modifier */
  apModifier?: number;

  // ─── PreDamage modifications ──────────────
  /** Damage mitigation threshold (Feel No Pain: roll X+ to discard wound) */
  damageMitigationThreshold?: number;

  // ─── Assault-specific modifications ────────
  /** Bonus attacks (Reaping Blow: +X Attacks when outnumbered) */
  bonusAttacks?: number;
  /** Bonus to Focus Roll (Duellist's Edge: +X) */
  focusRollBonus?: number;
  /** Whether the weapon is restricted to vehicle/immobile targets only (Detonation) */
  restrictedToVehicles?: boolean;
  /** Characteristic bonus from Impact (e.g., +1 to S, WS, etc.) */
  impactCharacteristic?: string;
  /** Impact bonus value */
  impactBonus?: number;
  /** Fear modifier to LD/WP/CL/IN */
  fearModifier?: number;
  /** Force multiplication characteristic */
  forceCharacteristic?: string;
  /** Force Willpower check required */
  forceRequiresWPCheck?: boolean;
}

/**
 * An assault rule handler function.
 */
export type AssaultRuleHandler = (
  context: AssaultRuleContext,
) => AssaultRuleResult;

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Parse a numeric value from a SpecialRuleRef's value field.
 * Handles values like "4+", "6+", "3", "2", etc.
 */
function parseRuleValue(ruleRef: SpecialRuleRef): number | null {
  if (!ruleRef.value) return null;
  const stripped = ruleRef.value.trim().replace(/\+$/, '');
  if (!/^\d+$/.test(stripped)) return null;
  return parseInt(stripped, 10);
}

/**
 * Parse a string characteristic from a SpecialRuleRef's value field.
 * For Impact(S), Impact(WS), etc.
 */
function parseCharacteristic(ruleRef: SpecialRuleRef): string | null {
  if (!ruleRef.value) return null;
  const val = ruleRef.value.trim().toUpperCase();
  const validChars = ['S', 'WS', 'BS', 'T', 'W', 'I', 'A', 'LD'];
  return validChars.includes(val) ? val : null;
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Two-level registry: rule name (lowercase) -> PipelineHook -> handler.
 */
const assaultRuleRegistry = new Map<string, Map<PipelineHook, AssaultRuleHandler>>();

/**
 * Register an assault rule handler at a specific hook point.
 */
export function registerAssaultRule(
  name: string,
  hook: PipelineHook,
  handler: AssaultRuleHandler,
): void {
  const key = name.toLowerCase();
  let hookMap = assaultRuleRegistry.get(key);
  if (!hookMap) {
    hookMap = new Map<PipelineHook, AssaultRuleHandler>();
    assaultRuleRegistry.set(key, hookMap);
  }
  hookMap.set(hook, handler);
}

/**
 * Get an assault rule handler for a name and hook.
 */
export function getAssaultRule(
  name: string,
  hook: PipelineHook,
): AssaultRuleHandler | undefined {
  return assaultRuleRegistry.get(name.toLowerCase())?.get(hook);
}

/**
 * Check if an assault rule is registered for a name and hook.
 */
export function hasAssaultRule(name: string, hook: PipelineHook): boolean {
  return assaultRuleRegistry.get(name.toLowerCase())?.has(hook) ?? false;
}

/**
 * Get all registered assault rule names.
 */
export function getRegisteredAssaultRuleNames(): string[] {
  return Array.from(assaultRuleRegistry.keys());
}

/**
 * Clear the assault registry (for testing).
 */
export function clearAssaultRegistry(): void {
  assaultRuleRegistry.clear();
}

/**
 * Apply all matching assault rules for a given hook point and set of special rules.
 * Merges results from all matching handlers into a single AssaultRuleResult.
 */
export function applyAssaultRules(
  hook: PipelineHook,
  specialRules: SpecialRuleRef[],
  context: Omit<AssaultRuleContext, 'ruleRef' | 'hook'>,
): AssaultRuleResult {
  const merged: AssaultRuleResult = {};

  for (const ruleRef of specialRules) {
    const handler = getAssaultRule(ruleRef.name, hook);
    if (!handler) continue;

    const result = handler({ ...context, ruleRef, hook });

    // Merge results — later rules override earlier ones for the same field
    if (result.rerollFailedHits !== undefined) merged.rerollFailedHits = result.rerollFailedHits;
    if (result.rendingThreshold !== undefined) merged.rendingThreshold = result.rendingThreshold;
    if (result.criticalHitThreshold !== undefined) merged.criticalHitThreshold = result.criticalHitThreshold;
    if (result.criticalBonusDamage !== undefined) merged.criticalBonusDamage = result.criticalBonusDamage;
    if (result.isPrecision !== undefined) merged.isPrecision = result.isPrecision;
    if (result.breachingThreshold !== undefined) merged.breachingThreshold = result.breachingThreshold;
    if (result.overrideAP !== undefined) merged.overrideAP = result.overrideAP;
    if (result.bonusDamage !== undefined) merged.bonusDamage = (merged.bonusDamage ?? 0) + result.bonusDamage;
    if (result.poisonedThreshold !== undefined) merged.poisonedThreshold = result.poisonedThreshold;
    if (result.poisonedAffectsVehicles !== undefined) merged.poisonedAffectsVehicles = result.poisonedAffectsVehicles;
    if (result.rerollFailedWounds !== undefined) merged.rerollFailedWounds = result.rerollFailedWounds;
    if (result.woundRollBonus !== undefined) merged.woundRollBonus = (merged.woundRollBonus ?? 0) + result.woundRollBonus;
    if (result.apModifier !== undefined) merged.apModifier = (merged.apModifier ?? 0) + result.apModifier;
    if (result.damageMitigationThreshold !== undefined) merged.damageMitigationThreshold = result.damageMitigationThreshold;
    if (result.bonusAttacks !== undefined) merged.bonusAttacks = (merged.bonusAttacks ?? 0) + result.bonusAttacks;
    if (result.focusRollBonus !== undefined) merged.focusRollBonus = (merged.focusRollBonus ?? 0) + result.focusRollBonus;
    if (result.restrictedToVehicles !== undefined) merged.restrictedToVehicles = result.restrictedToVehicles;
    if (result.impactCharacteristic !== undefined) merged.impactCharacteristic = result.impactCharacteristic;
    if (result.impactBonus !== undefined) merged.impactBonus = result.impactBonus;
    if (result.fearModifier !== undefined) merged.fearModifier = (merged.fearModifier ?? 0) + result.fearModifier;
    if (result.forceCharacteristic !== undefined) merged.forceCharacteristic = result.forceCharacteristic;
    if (result.forceRequiresWPCheck !== undefined) merged.forceRequiresWPCheck = result.forceRequiresWPCheck;
  }

  return merged;
}

// ─── Rule Implementations ────────────────────────────────────────────────────

// ─── Impact (X) ──────────────────────────────────────────────────────────────
// On successful charge, +1 to characteristic X for melee attacks that phase.
// The value X is the characteristic to boost (e.g., "S" for +1 Strength).

function handleImpactPreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  if (!ctx.isChargeAttack) return {};
  const characteristic = parseCharacteristic(ctx.ruleRef);
  if (!characteristic) return {};
  return {
    impactCharacteristic: characteristic,
    impactBonus: 1,
  };
}

// ─── Reaping Blow (X) ────────────────────────────────────────────────────────
// If outnumbered in combat, +X Attacks. No effect in Challenges.
// Bulky(X) counts as X models for the outnumber comparison.

function handleReapingBlowPreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  if (ctx.isChallenge) return {};
  if (!ctx.isOutnumbered) return {};
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { bonusAttacks: value };
}

// ─── Duellist's Edge (X) ─────────────────────────────────────────────────────
// +X to Focus Roll in Challenge Step 3.

function handleDuellistsEdgePreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  if (!ctx.isChallenge) return {};
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { focusRollBonus: value };
}

// ─── Detonation ──────────────────────────────────────────────────────────────
// Melee weapon only usable against vehicle-only/immobile units.

function handleDetonationPreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  if (!ctx.targetIsVehicle && !ctx.targetIsImmobile) {
    return { restrictedToVehicles: true };
  }
  return {};
}

// ─── Hatred (X) ──────────────────────────────────────────────────────────────
// +1 to Wound Tests against specified type/trait in combat.
// For simplicity, we always apply the bonus; the caller should check type matching.

function handleHatredOnWound(_ctx: AssaultRuleContext): AssaultRuleResult {
  // Hatred grants +1 to wound roll
  return { woundRollBonus: 1 };
}

// ─── Fear (X) ────────────────────────────────────────────────────────────────
// -X to LD/WP/CL/IN for models within 12" of Fear model.

function handleFearPreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { fearModifier: -value };
}

// ─── Rending (X) ─────────────────────────────────────────────────────────────
// On melee hit roll >= X, auto-wound (reused from shooting pipeline).

function handleRendingOnHit(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return { rendingThreshold: 6 }; // Default: 6+
  return { rendingThreshold: value };
}

// ─── Critical Hit (X) ───────────────────────────────────────────────────────
// On hit roll >= X, auto-wound + Damage +1 (reused from shooting).

function handleCriticalHitOnHit(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return { criticalHitThreshold: 6, criticalBonusDamage: 1 };
  return { criticalHitThreshold: value, criticalBonusDamage: 1 };
}

// ─── Breaching (X) ──────────────────────────────────────────────────────────
// On wound roll >= X, AP becomes 2 (reused from shooting).

function handleBreachingOnWound(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { breachingThreshold: value, overrideAP: 2 };
}

// ─── Feel No Pain (X) ──────────────────────────────────────────────────────
// Damage mitigation after saves: roll X+ to discard wound (reused from shooting).

function handleFeelNoPainPreDamage(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { damageMitigationThreshold: value };
}

// ─── Poisoned (X) ───────────────────────────────────────────────────────────
// Auto-wound on X+ regardless of T (reused from shooting). Does NOT affect vehicles.

function handlePoisonedPreWound(ctx: AssaultRuleContext): AssaultRuleResult {
  const value = parseRuleValue(ctx.ruleRef);
  if (value === null) return {};
  return { poisonedThreshold: value, poisonedAffectsVehicles: false };
}

// ─── Force (X) ──────────────────────────────────────────────────────────────
// Willpower Check to double characteristic X (reused from shooting).

function handleForcePreHit(ctx: AssaultRuleContext): AssaultRuleResult {
  const characteristic = parseCharacteristic(ctx.ruleRef);
  if (!characteristic) return {};
  return { forceCharacteristic: characteristic, forceRequiresWPCheck: true };
}

// ─── Shred ──────────────────────────────────────────────────────────────────
// Re-roll failed wound tests (reused from shooting).

function handleShredOnWound(_ctx: AssaultRuleContext): AssaultRuleResult {
  return { rerollFailedWounds: true };
}

// ─── Precision ──────────────────────────────────────────────────────────────
// On natural 6 to hit, choose target model.

function handlePrecisionOnHit(_ctx: AssaultRuleContext): AssaultRuleResult {
  return { isPrecision: true };
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register all assault-relevant special rules.
 * Call this once at engine initialization.
 */
export function registerAllAssaultRules(): void {
  // Assault-specific rules
  registerAssaultRule('Impact', PipelineHook.PreHit, handleImpactPreHit);
  registerAssaultRule('Reaping Blow', PipelineHook.PreHit, handleReapingBlowPreHit);
  registerAssaultRule("Duellist's Edge", PipelineHook.PreHit, handleDuellistsEdgePreHit);
  registerAssaultRule('Detonation', PipelineHook.PreHit, handleDetonationPreHit);
  registerAssaultRule('Hatred', PipelineHook.OnWound, handleHatredOnWound);
  registerAssaultRule('Fear', PipelineHook.PreHit, handleFearPreHit);

  // Reused rules from shooting (re-registered for assault context)
  registerAssaultRule('Rending', PipelineHook.OnHit, handleRendingOnHit);
  registerAssaultRule('Critical Hit', PipelineHook.OnHit, handleCriticalHitOnHit);
  registerAssaultRule('Breaching', PipelineHook.OnWound, handleBreachingOnWound);
  registerAssaultRule('Feel No Pain', PipelineHook.PreDamage, handleFeelNoPainPreDamage);
  registerAssaultRule('Poisoned', PipelineHook.PreWound, handlePoisonedPreWound);
  registerAssaultRule('Force', PipelineHook.PreHit, handleForcePreHit);
  registerAssaultRule('Shred', PipelineHook.OnWound, handleShredOnWound);
  registerAssaultRule('Precision', PipelineHook.OnHit, handlePrecisionOnHit);
}
