// Shooting pipeline barrel export

// Types
export type {
  FireGroupAttack,
  ResolvedWeaponProfile,
  FireGroup,
  HitResult,
  WoundResult,
  PenetratingHitResult,
  GlancingHit,
  SaveResult,
  SaveType,
  AvailableSave,
  WeaponAssignment,
  PendingMoraleCheck,
  MoraleCheckType,
  ShootingAttackState as InternalShootingAttackState,
} from './shooting-types';
export { ShootingStep, resolveWeaponFromData } from './shooting-types';

// Validator
export { validateShootingTarget, validateAttackerEligibility, filterModelsWithLOS, checkWeaponRange, determineTargetFacing } from './shooting-validator';

// Weapon Declaration
export { validateWeaponAssignments, determineSnapShots, resolveWeaponAssignment } from './weapon-declaration';

// Fire Groups
export { formFireGroups, splitPrecisionHits } from './fire-groups';

// Hit Resolution
export { resolveFireGroupHits, processGetsHot, getSpecialRuleValue } from './hit-resolution';
export type { FireGroupHitResolutionResult, GetsHotResolutionResult } from './hit-resolution';

// Wound Resolution
export { resolveWoundTests, getMajorityToughness } from './wound-resolution';
export type { WoundResolutionResult } from './wound-resolution';

// Armour Penetration
export { resolveArmourPenetration } from './armour-penetration';
export type { ArmourPenetrationResult } from './armour-penetration';

// Target Model Selection
export { autoSelectTargetModel, getValidTargetModels } from './target-model-selection';
export type { TargetModelInfo } from './target-model-selection';

// Save Resolution
export { resolveSaves } from './save-resolution';
export type { SaveResolutionResult } from './save-resolution';

// Damage Resolution
export { applyDamageToModel, resolveDamage, handleDamageMitigation } from './damage-resolution';
export type { DamageApplicationResult, DamageResolutionResult, DamageMitigationResult } from './damage-resolution';

// Vehicle Damage
export { resolveVehicleDamageTable, vehicleDamageTableResult, statusToResultString } from './vehicle-damage';
export type { VehicleDamageResult } from './vehicle-damage';

// Casualty Removal
export { removeCasualties, checkPanicThreshold, countCasualtiesPerUnit, trackMoraleChecks } from './casualty-removal';
export type { CasualtyRemovalResult } from './casualty-removal';

// Morale Handler
export { resolveShootingMorale, makePanicCheck, makeStatusCheck, getFailureStatus } from './morale-handler';
export type { MoraleResolutionResult } from './morale-handler';

// Return Fire
export { checkReturnFireTrigger, isDefensiveWeapon, markUnitReacted, getReturnFireRestrictions } from './return-fire-handler';
export type { ReturnFireCheckResult, ReturnFireExecutionResult, ReturnFireRestrictions } from './return-fire-handler';
