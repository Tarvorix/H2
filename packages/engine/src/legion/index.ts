/**
 * Legion-Specific Rules Engine
 *
 * Barrel export for all legion rule subsystems:
 * - Legion Tactica Registry (core system)
 * - Tactica Handlers (shooting, assault, movement, passive, hereticus)
 * - Advanced Reaction Registry
 * - Legion Gambit Registry
 * - Rite of War Registry
 * - Allegiance System
 */

// ─── Legion Tactica Registry ────────────────────────────────────────────────
export {
  registerLegionTactica,
  getLegionTacticaHandlers,
  hasLegionTactica,
  clearLegionTacticaRegistry,
  getRegisteredLegionTacticas,
  applyLegionTactica,
  registerAllLegionTacticas,
} from './legion-tactica-registry';

export type {
  LegionTacticaContext,
  ShootingTacticaContext,
  AssaultTacticaContext,
  MovementTacticaContext,
  MoraleTacticaContext,
  LegionTacticaResult,
  LegionTacticaHandler,
} from './legion-tactica-registry';

// ─── Tactica Handler Registration ───────────────────────────────────────────
export { registerShootingTacticas } from './tacticas/shooting-tacticas';
export { registerAssaultTacticas } from './tacticas/assault-tacticas';
export { registerMovementTacticas } from './tacticas/movement-tacticas';
export { registerPassiveTacticas } from './tacticas/passive-tacticas';
export { registerHereticusTacticas } from './tacticas/hereticus-tacticas';

// ─── Advanced Reaction Registry ─────────────────────────────────────────────
export {
  registerAdvancedReaction,
  getAdvancedReactionHandler,
  hasAdvancedReactionHandler,
  clearAdvancedReactionRegistry,
  getRegisteredAdvancedReactions,
  isAdvancedReactionAvailable,
  hasAdvancedReactionBeenUsed,
  checkMovementAdvancedReactionTriggers,
  checkShootingAdvancedReactionTriggers,
  checkAssaultAdvancedReactionTriggers,
  resolveAdvancedReaction,
  registerAllAdvancedReactions,
} from './advanced-reaction-registry';

export type {
  AdvancedReactionContext,
  AdvancedReactionResult,
  AdvancedReactionHandler,
} from './advanced-reaction-registry';

// ─── Advanced Reaction Handler Registration ─────────────────────────────────
export { registerMovementReactions } from './advanced-reactions/movement-reactions';
export { registerShootingReactions } from './advanced-reactions/shooting-reactions';
export { registerAssaultReactions } from './advanced-reactions/assault-reactions';

// ─── Legion Gambit Registry ─────────────────────────────────────────────────
export {
  registerLegionGambit,
  registerAllLegionGambits,
  getLegionGambitEffect,
  getLegionGambitDefinition,
  getLegionGambitById,
  isLegionGambit,
  getAvailableLegionGambits,
  getRegisteredLegionGambits,
  clearLegionGambitRegistry,
  getLegionGambitFocusModifier,
  doesGambitExcludeCombatInitiative,
  getGambitReplaceCharacteristic,
  getGambitPredictionMechanic,
  getGambitOnDeathAutoHit,
  doesGambitSpillExcessWounds,
  doesGambitPreventGloryChoice,
  getGambitOnKillBonus,
  doesGambitAllowModelSwap,
  getGambitSelfDamage,
  getGambitWillpowerCheck,
  doesGambitUseTestAttack,
  getLegionGambitAttacksModifier,
  getGambitGrantedSpecialRule,
  getGambitImprovedSpecialRule,
  getGambitTraitEffect,
  getGambitEternalWarrior,
  getGambitSetEnemyCombatInitiative,
  getGambitMaxOpponentOutsideSupport,
  getGambitOutsideSupportMultiplier,
  getGambitAlternativeOutsideSupport,
  getGambitCRPBonusOnKill,
  doesGambitIgnoreWoundNegatives,
  hasGambitWeaponRequirement,
  doesWeaponMeetGambitRequirements,
} from './legion-gambit-registry';

// ─── Rite of War Registry ──────────────────────────────────────────────────
export {
  registerRiteOfWar,
  registerAllRitesOfWar,
  clearRiteOfWarRegistry,
  getRiteOfWar,
  getRiteOfWarByName,
  getRitesForLegion,
  getRiteDefinitionsForLegion,
  getRegisteredRitesOfWar,
  isRiteOfWarRegistered,
  getRiteRequiredAllegiance,
  isHereticusRite,
  getRiteTacticaId,
  getRiteAdvancedReactionId,
  getRiteGambitId,
  getRitePrimeAdvantage,
  getRiteAdditionalDetachments,
  getRiteMinimumPoints,
  validateRiteOfWar,
  isRiteAvailableFor,
  getRiteBenefitDescriptions,
  getRiteRestrictionDescriptions,
} from './rite-of-war-registry';

// ─── Allegiance System ─────────────────────────────────────────────────────
export {
  getDefaultAllegiance,
  isCanonicallyLoyalist,
  isCanonicallyTraitor,
  getLegionsForAllegiance,
  getLoyalistLegions,
  getTraitorLegions,
  isRiteAvailableForAllegiance,
  validateAllegiance,
  isAllegianceValid,
} from './allegiance';
