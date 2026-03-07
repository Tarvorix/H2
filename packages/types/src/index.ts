// @hh/types — Shared type definitions for HH-Digital

// Characteristics
export type {
  ModelCharacteristics,
  VehicleCharacteristics,
  SavingThrow,
} from './characteristics';

// Enumerations
export {
  ModelType,
  ModelSubType,
  BattlefieldRole,
  Allegiance,
  LegionFaction,
  SpecialFaction,
  TacticalStatus,
  TerrainType,
  Phase,
  SubPhase,
  PipelineHook,
  VehicleFacing,
  BlastSize,
  CoreReaction,
  PsychicDiscipline,
  PsychicPowerType,
  ChallengeGambit,
  DetachmentType,
  AftermathOption,
} from './enums';

// Weapons
export type {
  RangedWeaponProfile,
  MeleeWeaponProfile,
  StatModifier,
  StatReference,
  StatModifierOp,
  RangeBand,
  SpecialRuleRef,
  WeaponEntry,
} from './weapons';
// WeaponTrait is a type alias re-exported for convenience
export type { WeaponTrait, ArmyFaction } from './enums';

// Special Rules
export type {
  SpecialRuleDefinition,
  SpecialRuleParameterType,
  SpecialRuleCategory,
  PsychicPowerDefinition,
  PsychicWeaponDefinition,
  PsychicReactionDefinition,
  PsychicGambitDefinition,
  PsychicDisciplineDefinition,
} from './special-rules';

// Units
export type {
  UnitProfile,
  ModelDefinition,
  WargearOption,
  UnitTrait,
  AccessPoint,
  DedicatedWeapon,
  RangedWeaponInline,
  MeleeWeaponInline,
} from './units';

// Game State
export type {
  Position,
  BattlefieldDimensions,
  TerrainPiece,
  TerrainShape,
  ModelState,
  CharacteristicModifier,
  ModifierExpiry,
  UnitState,
  ArmyState,
  DiceRoll,
  RollEvent,
  RollType,
  GameState,
  PendingReaction,
  TurnHistoryEntry,
  GameCommand,
  MoveModelCommand,
  MoveUnitCommand,
  DeclareShootingCommand,
  ResolveShootingCasualtiesCommand,
  DeclareChargeCommand,
  DeclareChallengeCommand,
  SelectGambitCommand,
  SelectReactionCommand,
  DeclineReactionCommand,
  EndPhaseCommand,
  EndSubPhaseCommand,
  SelectTargetModelCommand,
  PlaceBlastMarkerCommand,
  PlaceTerrainCommand,
  RemoveTerrainCommand,
  DeployUnitCommand,
  ReservesTestCommand,
  RushUnitCommand,
  EmbarkCommand,
  DisembarkCommand,
  SelectWargearOptionCommand,
  // Shooting attack sub-types
  ShootingAttackState,
  ShootingStepType,
  ShootingWeaponAssignment,
  BlastPlacement,
  TemplatePlacement,
  ShootingFireGroup,
  ShootingHitResult,
  ShootingWoundResult,
  ShootingPenetratingHit,
  ShootingGlancingHit,
  ShootingMoraleCheck,
  // Assault attack sub-types
  AssaultAttackState,
  AssaultChargeStep,
  AssaultCombatState,
  AssaultChallengeState,
  // Assault commands
  AcceptChallengeCommand,
  DeclineChallengeCommand,
  DeclareWeaponsCommand,
  SelectAftermathCommand,
  ResolveFightCommand,
} from './game-state';
export { UnitMovementState } from './game-state';

// Army Building
export type {
  ForceOrgSlot,
  DetachmentDefinition,
  RiteOfWar,
  ArmyList,
  ArmyListDetachment,
  ArmyListUnit,
  SelectedWargearOption,
  ArmyValidationResult,
  ArmyValidationError,
  BlackshieldsDoctrine,
  ShatteredLegionsDoctrine,
  ArmyDoctrine,
  LegionTactica,
  AdvancedReaction,
} from './army-building';

// Mission Types (Phase 8)
export {
  DeploymentMap,
  SecondaryObjectiveType,
  MissionSpecialRule,
} from './mission-types';
export type {
  DeploymentZone,
  DeploymentMapDefinition,
  ObjectiveMarker,
  ObjectivePlacementRule,
  SecondaryObjective,
  MissionDefinition,
  ObjectiveScoringEntry,
  FirstStrikeTracking,
  MissionState,
} from './mission-types';

// Legion Rules (Phase 7)
export { LegionTacticaEffectType } from './legion-rules';
export type {
  LegionTacticaEffect,
  LegionTacticaCondition,
  AdvancedReactionTrigger,
  AdvancedReactionDefinition,
  AdvancedReactionUsage,
  LegionTacticaState,
  LegionGambitDefinition,
  RiteOfWarBenefit,
  RiteOfWarRestriction,
  RiteOfWarDefinition,
} from './legion-rules';
