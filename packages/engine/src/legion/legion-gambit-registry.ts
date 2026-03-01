/**
 * Legion Gambit Registry
 *
 * Maps legion-specific gambit definitions to engine-compatible GambitEffect objects.
 * Each legion gets one (or two for Space Wolves) gambits that can be selected
 * alongside the 9 core Challenge Gambits during the Face-Off step.
 *
 * The registry converts LegionGambitDefinition (structured data from @hh/data)
 * into GambitEffect (engine format from assault-types.ts), plus stores extended
 * properties for legion-specific mechanics that go beyond the core GambitEffect interface.
 *
 * Flow:
 * 1. At engine init, registerAllLegionGambits() converts and stores all definitions.
 * 2. During Face-Off, getAvailableLegionGambits(legion) returns names for that legion.
 * 3. selectGambit() looks up effects via getLegionGambitEffect(name).
 * 4. Extended properties are queried via getLegionGambitDefinition(name) for
 *    mechanics like onDeathAutoHit, predictionMechanic, etc.
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "GAMBIT" subsections
 */

import { LegionFaction } from '@hh/types';
import type { LegionGambitDefinition } from '@hh/types';
import { getLegionGambitsForLegion as getLegionGambitsFromData, findLegionGambit } from '@hh/data';
import type { GambitEffect } from '../assault/assault-types';

// ─── Registry State ──────────────────────────────────────────────────────────

/**
 * Map of legion gambit name → GambitEffect.
 * Keyed by gambit name (the display name, e.g., 'Sword of the Order').
 */
const legionGambitEffects = new Map<string, GambitEffect>();

/**
 * Map of legion gambit name → LegionGambitDefinition (for extended properties).
 */
const legionGambitDefinitions = new Map<string, LegionGambitDefinition>();

/**
 * Map of legion faction → array of gambit names available to that legion.
 */
const legionGambitsByFaction = new Map<string, string[]>();

// ─── Conversion ──────────────────────────────────────────────────────────────

/**
 * Convert a LegionGambitDefinition into a GambitEffect.
 * Maps overlapping fields; legion-specific extended fields are accessed
 * separately via getLegionGambitDefinition().
 */
function convertToGambitEffect(def: LegionGambitDefinition): GambitEffect {
  return {
    name: def.name,
    extraFocusDie: def.extraFocusDie ?? false,
    discardDie: def.discardDie ?? null,
    wsModifier: def.wsModifier ?? 0,
    fixedAttacks: def.fixedAttacks ?? 0,
    bonusAttacksRoll: (def.bonusAttacksRoll as 'D3' | null) ?? null,
    bonusAttackFixedDamage: def.bonusAttackFixedDamage ?? null,
    strengthModifier: def.strengthModifier ?? 0,
    damageModifier: def.damageModifier ?? 0,
    blocksOutsideSupportFocus: def.gainsOutsideSupport === false,
    outsideSupportToAttacks: def.outsideSupportToAttacks ?? false,
    firstChooserOnly: def.firstFaceOffOnly ?? false,
    blocksOpponentGambit: false, // Only core Feint blocks opponent gambit
    allowsWithdraw: def.canEndChallengeNoCRP ?? false,
    grantsNextRoundAdvantage: def.grantsNextRoundAdvantage ?? false,
    missesGrantFocusBonus: def.missesGrantFocusBonus ?? false,
    swapStatsWithEnemy: def.swapStatsWithEnemy ?? false,
    crpBonusPerSelection: def.crpBonusPerSelection ?? 0,
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register a single legion gambit definition.
 * Converts it to a GambitEffect and stores both the effect and the definition.
 */
export function registerLegionGambit(def: LegionGambitDefinition): void {
  const effect = convertToGambitEffect(def);
  legionGambitEffects.set(def.name, effect);
  legionGambitDefinitions.set(def.name, def);

  // Add to faction lookup
  const factionKey = def.legion;
  const existing = legionGambitsByFaction.get(factionKey) ?? [];
  if (!existing.includes(def.name)) {
    legionGambitsByFaction.set(factionKey, [...existing, def.name]);
  }
}

/**
 * Register all 21 legion gambit definitions from @hh/data.
 * Called once during engine initialization.
 */
export function registerAllLegionGambits(): void {
  // Import all legion gambit definitions from each legion's data
  const allLegions: LegionFaction[] = [
    LegionFaction.DarkAngels,
    LegionFaction.EmperorsChildren,
    LegionFaction.IronWarriors,
    LegionFaction.WhiteScars,
    LegionFaction.SpaceWolves,
    LegionFaction.ImperialFists,
    LegionFaction.NightLords,
    LegionFaction.BloodAngels,
    LegionFaction.IronHands,
    LegionFaction.WorldEaters,
    LegionFaction.Ultramarines,
    LegionFaction.DeathGuard,
    LegionFaction.ThousandSons,
    LegionFaction.SonsOfHorus,
    LegionFaction.WordBearers,
    LegionFaction.Salamanders,
    LegionFaction.RavenGuard,
    LegionFaction.AlphaLegion,
  ];

  for (const legion of allLegions) {
    const gambits = getLegionGambitsFromData(legion);
    for (const gambit of gambits) {
      registerLegionGambit(gambit);
    }
  }
}

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Get the GambitEffect for a legion gambit by its name.
 * Returns null if not a registered legion gambit.
 */
export function getLegionGambitEffect(gambitName: string): GambitEffect | null {
  return legionGambitEffects.get(gambitName) ?? null;
}

/**
 * Get the full LegionGambitDefinition for extended properties.
 * Returns undefined if not a registered legion gambit.
 */
export function getLegionGambitDefinition(gambitName: string): LegionGambitDefinition | undefined {
  return legionGambitDefinitions.get(gambitName);
}

/**
 * Get the LegionGambitDefinition by gambit ID (not name).
 * Returns undefined if not found.
 */
export function getLegionGambitById(gambitId: string): LegionGambitDefinition | undefined {
  return findLegionGambit(gambitId);
}

/**
 * Check if a gambit name is a legion gambit.
 */
export function isLegionGambit(gambitName: string): boolean {
  return legionGambitEffects.has(gambitName);
}

/**
 * Get all available legion gambit names for a specific legion.
 * Returns an empty array if the legion has no gambits registered.
 */
export function getAvailableLegionGambits(legion: LegionFaction): string[] {
  return legionGambitsByFaction.get(legion) ?? [];
}

/**
 * Get all registered legion gambit names (for diagnostics/testing).
 */
export function getRegisteredLegionGambits(): string[] {
  return Array.from(legionGambitEffects.keys());
}

/**
 * Clear all registered legion gambits (for testing).
 */
export function clearLegionGambitRegistry(): void {
  legionGambitEffects.clear();
  legionGambitDefinitions.clear();
  legionGambitsByFaction.clear();
}

// ─── Extended Gambit Mechanics Helpers ────────────────────────────────────────

/**
 * Get the focus roll modifier for a legion gambit (e.g., EC Paragon +2).
 * Returns 0 if no modifier.
 */
export function getLegionGambitFocusModifier(gambitName: string): number {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.focusRollModifier ?? 0;
}

/**
 * Check if a legion gambit excludes Combat Initiative from the focus roll.
 * (e.g., IF A Wall Unyielding).
 */
export function doesGambitExcludeCombatInitiative(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.excludeCombatInitiative ?? false;
}

/**
 * Check if a legion gambit replaces the focus roll with a characteristic.
 * (e.g., TS Prophetic Duellist replaces with WP).
 */
export function getGambitReplaceCharacteristic(gambitName: string): 'WP' | 'WS' | 'BS' | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.replaceWithCharacteristic;
}

/**
 * Get the prediction mechanic for a legion gambit.
 * (e.g., WS Path of the Warrior).
 */
export function getGambitPredictionMechanic(gambitName: string): LegionGambitDefinition['predictionMechanic'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.predictionMechanic;
}

/**
 * Get the on-death auto-hit data for a legion gambit.
 * (e.g., IW Spiteful Demise).
 */
export function getGambitOnDeathAutoHit(gambitName: string): LegionGambitDefinition['onDeathAutoHit'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.onDeathAutoHit;
}

/**
 * Check if a legion gambit grants excess wounds spill.
 * (e.g., WE Violent Overkill).
 */
export function doesGambitSpillExcessWounds(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.excessWoundsSpill ?? false;
}

/**
 * Check if a legion gambit prevents the enemy from choosing Glory.
 * (e.g., SW Wolves of Fenris).
 */
export function doesGambitPreventGloryChoice(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.preventGloryChoice ?? false;
}

/**
 * Get the on-kill unit bonus for a legion gambit.
 * (e.g., SW Saga of the Warrior: +1 Attacks next Fight).
 */
export function getGambitOnKillBonus(gambitName: string): LegionGambitDefinition['onKillUnitBonus'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.onKillUnitBonus;
}

/**
 * Check if a legion gambit allows model swap.
 * (e.g., NL Nostraman Courage).
 */
export function doesGambitAllowModelSwap(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.allowModelSwap ?? false;
}

/**
 * Get the self-damage for focus bonus mechanic.
 * (e.g., Sal Duty is Sacrifice).
 */
export function getGambitSelfDamage(gambitName: string): LegionGambitDefinition['selfDamageForFocusBonus'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.selfDamageForFocusBonus;
}

/**
 * Get the willpower check mechanic for a legion gambit.
 * (e.g., WB Beseech the Gods).
 */
export function getGambitWillpowerCheck(gambitName: string): LegionGambitDefinition['willpowerCheck'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.willpowerCheck;
}

/**
 * Check if a legion gambit uses the test attack mechanic.
 * (e.g., RG Decapitation Strike).
 */
export function doesGambitUseTestAttack(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.testAttackMechanic ?? false;
}

/**
 * Get the attacks modifier for a legion gambit.
 * (e.g., DA Sword of the Order: -1).
 */
export function getLegionGambitAttacksModifier(gambitName: string): number {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.attacksModifier ?? 0;
}

/**
 * Get the weapon special rule granted by a legion gambit.
 * (e.g., DA Sword of the Order grants Critical Hit 6+).
 */
export function getGambitGrantedSpecialRule(gambitName: string): LegionGambitDefinition['grantWeaponSpecialRule'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.grantWeaponSpecialRule;
}

/**
 * Get the weapon special rule improvement for a legion gambit.
 * (e.g., DA Sword of the Order improves Critical Hit by +1).
 */
export function getGambitImprovedSpecialRule(gambitName: string): LegionGambitDefinition['improveWeaponSpecialRule'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.improveWeaponSpecialRule;
}

/**
 * Get the trait effect granted by a legion gambit.
 * (e.g., SoH Merciless Strike grants Phage(T)).
 */
export function getGambitTraitEffect(gambitName: string): LegionGambitDefinition['grantTraitEffect'] | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.grantTraitEffect;
}

/**
 * Get the Eternal Warrior value granted by a legion gambit.
 * (e.g., IF A Wall Unyielding: Eternal Warrior 1).
 */
export function getGambitEternalWarrior(gambitName: string): number | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.grantEternalWarrior;
}

/**
 * Get the enemy Combat Initiative override from a legion gambit.
 * (e.g., AL I Am Alpharius: set to 1).
 */
export function getGambitSetEnemyCombatInitiative(gambitName: string): number | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.setEnemyCombatInitiative;
}

/**
 * Get the max opponent Outside Support cap.
 * (e.g., IH Legion of One: cap at +2).
 */
export function getGambitMaxOpponentOutsideSupport(gambitName: string): number | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.maxOpponentOutsideSupport;
}

/**
 * Get the Outside Support multiplier.
 * (e.g., IH Legion of One: 2x, EC-H Stupefied Grandeur: 2x).
 */
export function getGambitOutsideSupportMultiplier(gambitName: string): number {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.outsideSupportMultiplier ?? 1;
}

/**
 * Get the alternative Outside Support sub-type.
 * (e.g., UM Aegis of Wisdom: +1 per Command sub-type).
 */
export function getGambitAlternativeOutsideSupport(gambitName: string): string | undefined {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.alternativeOutsideSupportSubType;
}

/**
 * Get CRP bonus on kill.
 * (e.g., WE-H Skull Trophy: +2 CRP on kill).
 */
export function getGambitCRPBonusOnKill(gambitName: string): number {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.crpBonusOnKill ?? 0;
}

/**
 * Check if a legion gambit ignores wound negative modifiers.
 * (e.g., BA Thrall of the Red Thirst).
 */
export function doesGambitIgnoreWoundNegatives(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  return def?.ignoreWoundNegativeModifiers ?? false;
}

/**
 * Get the enemy Combat Initiative to use as own Toughness.
 * (e.g., DG Steadfast Resilience uses enemy WS as own Toughness).
 */
export function getGambitUseEnemyStatAsToughness(gambitName: string): boolean {
  // DG Steadfast Resilience: "replace Toughness with opponent's base WS for Strike"
  // This is identified by id 'dg-steadfast-resilience'
  const def = legionGambitDefinitions.get(gambitName);
  if (!def) return false;
  return def.id === 'dg-steadfast-resilience';
}

/**
 * Check whether a gambit requires specific weapon traits or name patterns.
 * Returns true if the gambit has weapon requirements.
 */
export function hasGambitWeaponRequirement(gambitName: string): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  if (!def) return false;
  return (def.requiresWeaponTrait?.length ?? 0) > 0 || (def.requiresWeaponNamePattern?.length ?? 0) > 0;
}

/**
 * Check if a weapon meets the requirements for a legion gambit.
 * Used to validate whether a model can select the gambit given their equipped weapon.
 */
export function doesWeaponMeetGambitRequirements(
  gambitName: string,
  weaponName: string,
  weaponTraits: string[],
): boolean {
  const def = legionGambitDefinitions.get(gambitName);
  if (!def) return false;

  // Check trait requirements
  if (def.requiresWeaponTrait && def.requiresWeaponTrait.length > 0) {
    const hasRequiredTrait = def.requiresWeaponTrait.some(t => weaponTraits.includes(t));
    if (hasRequiredTrait) return true;
  }

  // Check name pattern requirements
  if (def.requiresWeaponNamePattern && def.requiresWeaponNamePattern.length > 0) {
    const lowerWeaponName = weaponName.toLowerCase();
    const matchesPattern = def.requiresWeaponNamePattern.some(p =>
      lowerWeaponName.includes(p.toLowerCase()),
    );
    if (matchesPattern) return true;
  }

  // If the gambit has requirements and none matched, disallow
  if (
    (def.requiresWeaponTrait && def.requiresWeaponTrait.length > 0) ||
    (def.requiresWeaponNamePattern && def.requiresWeaponNamePattern.length > 0)
  ) {
    return false;
  }

  // No requirements = always valid
  return true;
}
