// @hh/engine — Pure logic rules engine (no UI dependencies)

// ─── Tables ──────────────────────────────────────────────────────────────────
export {
  meleeHitTable,
  woundTable,
  rangedHitTable,
  snapShotTable,
} from './tables';
export type { RangedHitResult } from './tables';

// ─── Engine Types ────────────────────────────────────────────────────────────
export type {
  DiceProvider,
  ValidationError,
  GameEvent,
  CommandResult,
  PhaseState,
  ModelMovedEvent,
  UnitRushedEvent,
  ReservesTestEvent,
  ReservesEntryEvent,
  DangerousTerrainTestEvent,
  RoutMoveEvent,
  EmbarkEvent,
  DisembarkEvent,
  EmergencyDisembarkEvent,
  RepositionTriggeredEvent,
  RepositionExecutedEvent,
  PhaseAdvancedEvent,
  SubPhaseAdvancedEvent,
  PlayerTurnAdvancedEvent,
  BattleTurnAdvancedEvent,
  StatusAppliedEvent,
  StatusRemovedEvent,
  LeadershipCheckEvent,
  CoolCheckEvent,
  UnitDestroyedEvent,
  GameOverEvent,
  // Shooting Phase Events
  ShootingAttackDeclaredEvent,
  FireGroupResolvedEvent,
  HitTestRollEvent,
  WoundTestRollEvent,
  ArmourPenetrationRollEvent,
  SavingThrowRollEvent,
  DamageMitigationRollEvent,
  DamageAppliedEvent,
  VehicleDamageRollEvent,
  CasualtyRemovedEvent,
  ReturnFireTriggeredEvent,
  BlastMarkerPlacedEvent,
  TemplatePlacedEvent,
  ScatterRollEvent,
  DeflagrateHitsEvent,
  GetsHotEvent,
  PanicCheckEvent,
  StatusCheckEvent,
  // Assault Phase Events
  ChargeDeclaredEvent,
  SetupMoveEvent,
  VolleyAttackEvent,
  ChargeRollEvent,
  ChargeFailedEvent,
  ChargeSucceededEvent,
  ChallengeDeclaredEvent,
  ChallengeDeclinedEvent,
  DisgracedAppliedEvent,
  GambitSelectedEvent,
  FocusRollEvent,
  ChallengeStrikeEvent,
  ChallengeGloryEvent,
  CombatDeclaredEvent,
  InitiativeStepResolvedEvent,
  MeleeHitTestRollEvent,
  MeleeWoundTestRollEvent,
  PileInMoveEvent,
  CombatResolutionEvent,
  AftermathSelectedEvent,
  PursueRollEvent,
  ConsolidateMoveEvent,
  DisengageMoveEvent,
  GunDownEvent,
  AssaultFallBackEvent,
  OverwatchTriggeredEvent,
  OverwatchResolvedEvent,
  AdvancedReactionDeclaredEvent,
  AdvancedReactionResolvedEvent,
  // Mission / Victory Events
  ObjectiveScoredEvent,
  SecondaryAchievedEvent,
  CounterOffensiveActivatedEvent,
  SeizeTheInitiativeEvent,
  WindowOfOpportunityEvent,
  SuddenDeathEvent,
} from './types';

// ─── Dice ────────────────────────────────────────────────────────────────────
export { RandomDiceProvider, FixedDiceProvider } from './dice';

// ─── Replay / Determinism ───────────────────────────────────────────────────
export {
  stableStringify,
  hashStableValue,
  hashGameState,
  replayCommands,
} from './replay';
export type {
  ReplayCommandStepResult,
  ReplayExecutionOptions,
  ReplayExecutionResult,
} from './replay';

// ─── State Helpers ───────────────────────────────────────────────────────────
export {
  updateActiveArmy,
  updateReactiveArmy,
  updateArmyByIndex,
  updateUnit,
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setPhaseState,
  addStatus,
  removeStatus,
  hasStatus,
  setMovementState,
  setAwaitingReaction,
  addLogEntry,
  embarkUnit,
  disembarkUnit,
  setInReserves,
  setDeployed,
  setGameOver,
  setShootingAttackState,
  clearShootingAttackState,
  updateShootingAttackState,
  applyWoundsToModel,
  // Assault State Helpers
  setAssaultAttackState,
  clearAssaultAttackState,
  updateAssaultAttackState,
  setActiveCombats,
  clearActiveCombats,
  updateCombat,
  lockUnitsInCombat,
  unlockFromCombat,
  applyDisgraced,
  initializeLegionTacticaState,
  recordAdvancedReactionUsed,
  resetPerTurnLegionState,
  applyStupefied,
  applyLostToTheNails,
} from './state-helpers';

// ─── Game Queries ────────────────────────────────────────────────────────────
export {
  getActiveArmy,
  getReactiveArmy,
  getReactivePlayerIndex,
  findUnit,
  findUnitArmy,
  findUnitPlayerIndex,
  findModel,
  findModelUnitId,
  canUnitMove,
  canUnitRush,
  canUnitReact,
  hasReactionAllotment,
  getAliveModels,
  isUnitDestroyed,
  getUnitsWithStatus,
  getUnitsInReserves,
  getDeployedUnits,
  getModelShape,
  getEnemyModelShapes,
  getUnitModelShapes,
  getArmyModelShapes,
  getRoutedUnits,
  isMovementPhase,
  isSubPhase,
  isShootingPhase,
  canUnitShoot,
  getUnitMajorityToughness,
  isVehicleUnit,
  hasActiveShootingAttack,
  // Assault Phase Queries
  isAssaultPhase,
  hasActiveAssaultAttack,
  canUnitCharge,
  isDisorderedCharge,
  getLockedInCombatUnits,
  getCombatParticipants,
  isModelInBaseContact,
  getEngagedModels,
  getMajorityWS,
  getCombatInitiative,
  getDistanceBetween,
  getClosestModelDistance,
  hasLOSToUnit,
  getModelsWithLOSToUnit,
  getUnitLegion,
  hasAdvancedReactionBeenUsed,
  isEntireUnitLegion,
  getUnitMovementState,
  hasUnitMoved,
} from './game-queries';

// ─── State Machine ───────────────────────────────────────────────────────────
export {
  PLAYER_TURN_SEQUENCE,
  findSequenceIndex,
  getNextPhaseState,
  advanceSubPhase,
  advancePhase,
  advancePlayerTurn,
  advanceBattleTurn,
  initializeGamePhase,
} from './state-machine';

// ─── Phase UX ────────────────────────────────────────────────────────────────
export type {
  PhaseUxMode,
  PhaseUxState,
  PhaseUxBlocker,
  PhaseUxStatus,
} from './phase-ux';
export { getPhaseUxStatus } from './phase-ux';

// ─── Command Processor ──────────────────────────────────────────────────────
export { processCommand, getValidCommands } from './command-processor';

// ─── Movement Phase ──────────────────────────────────────────────────────────
export {
  // Movement validation
  validateModelMove,
  validateCoherencyAfterMove,
  computeTerrainPenalty,
  isInDangerousTerrain,
  pathCrossesImpassable,
  pathEntersExclusionZone,
  getEffectiveMovement,
  DIFFICULT_TERRAIN_PENALTY,
  // Move handler
  handleMoveModel,
  handleMoveUnit,
  handleRushUnit,
  handleDangerousTerrainTest,
  DEFAULT_MOVEMENT,
  MOVE_DEFAULT_INITIATIVE,
  // Reserves handler
  handleReservesTest,
  handleReservesEntry,
  RESERVES_TARGET_NUMBER,
  EDGE_BUFFER,
  DEEP_STRIKE_ENEMY_EXCLUSION,
  DEEP_STRIKE_EDGE_BUFFER,
  // Rout handler
  handleRoutSubPhase,
  computeFallBackDirection,
  computeFallBackDistance,
  // Embark/Disembark handler
  handleEmbark,
  handleDisembark,
  handleEmergencyDisembark,
  ACCESS_POINT_RANGE,
  DEFAULT_TRANSPORT_CAPACITY,
  EMBARK_DEFAULT_COOL,
  // Reposition handler
  checkRepositionTrigger,
  handleRepositionReaction,
  REPOSITION_TRIGGER_RANGE,
  REPOSITION_DEFAULT_INITIATIVE,
} from './movement';

// ─── Special Rules ───────────────────────────────────────────────────────────
export {
  registerMovementRule,
  getMovementRule,
  hasMovementRule,
  getRegisteredRuleNames,
  clearRegistry,
  applyMovementRules,
  registerAllMovementRules,
} from './special-rules';
export type { MovementRuleContext, MovementRuleResult, MovementRuleHandler } from './special-rules';

// ─── Phase Stubs ─────────────────────────────────────────────────────────────
export { handleStartPhase } from './phases/start-phase';
export { handleShootingAttack, handleShootingMorale } from './phases/shooting-phase';
export {
  handleCharge,
  handleDeclareChallenge,
  handleAcceptChallenge,
  handleDeclineChallenge,
  handleSelectGambit,
  handleFight,
  handleResolution,
  handleSelectAftermath,
} from './phases/assault-phase';
export { handleEndEffects, handleStatusCleanup, handleVictoryCheck } from './phases/end-phase';

// ─── Shooting Phase ─────────────────────────────────────────────────────────
export {
  // Shooting pipeline types
  ShootingStep,
  resolveWeaponFromData,
  // Validator
  validateShootingTarget,
  validateAttackerEligibility,
  filterModelsWithLOS,
  checkWeaponRange,
  determineTargetFacing,
  // Weapon Declaration
  validateWeaponAssignments,
  determineSnapShots,
  resolveWeaponAssignment,
  // Fire Groups
  formFireGroups,
  splitPrecisionHits,
  // Hit Resolution
  resolveFireGroupHits,
  processGetsHot,
  getSpecialRuleValue,
  // Wound Resolution
  resolveWoundTests,
  getMajorityToughness,
  // Armour Penetration
  resolveArmourPenetration,
  // Target Model Selection
  autoSelectTargetModel,
  getValidTargetModels,
  // Save Resolution
  resolveSaves,
  // Damage Resolution
  applyDamageToModel,
  resolveDamage,
  handleDamageMitigation,
  // Vehicle Damage
  resolveVehicleDamageTable,
  vehicleDamageTableResult,
  statusToResultString,
  // Casualty Removal
  removeCasualties,
  checkPanicThreshold,
  countCasualtiesPerUnit,
  trackMoraleChecks,
  // Morale
  resolveShootingMorale,
  makePanicCheck,
  makeStatusCheck,
  getFailureStatus,
  // Return Fire
  checkReturnFireTrigger,
  isDefensiveWeapon,
  markUnitReacted,
  getReturnFireRestrictions,
} from './shooting';

// ─── Assault Phase ──────────────────────────────────────────────────────────
export type {
  ChargeStep,
  ChargeState,
  CombatState,
  ChallengeStep,
  ChallengeState,
  MeleeStrikeGroup,
  InitiativeStep,
  MeleeHitResult,
  MeleeWoundResult,
  MeleePenetratingHit,
  MeleeGlancingHit,
  GambitEffect,
  AftermathResult,
  ChargeValidationResult,
  ChargeValidationData,
  SetupMoveResult,
  VolleyAttackResult,
  ChargeRollResult,
  ChargeMoveResult,
  OverwatchCheckResult,
  OverwatchExecutionResult,
  OverwatchRestrictions,
  ChallengeEligibilityResult,
  ChallengeDeclareResult,
  ChallengeResponseResult,
  FocusRollResult,
  ChallengeStrikeResult,
  ChallengeGloryResult,
  DetermineCombatsResult,
  ModelCombatSetup,
  InitiativeStepResult,
  PileInResult,
  FinalPileInResult,
  ReturnChallengeResult,
  CRPResult,
  CRPBreakdown,
  CombatWinnerResult,
  PanicCheckResult,
  MassacreCheckResult,
  CombatResolutionResult,
  AftermathSelectionResult,
  MeleeHitTestResult,
  MeleeWoundTestResult,
  MeleeSaveResult,
  MeleeDamageResult,
  MeleePipelineOptions,
  MeleePipelineResult,
} from './assault';

export {
  calculateSetupMoveDistance,
  BASIC_CLOSE_COMBAT_WEAPON,
  // Charge
  validateChargeEligibility,
  validateChargeTarget,
  MAX_CHARGE_RANGE,
  resolveSetupMove,
  moveToward,
  resolveVolleyAttacks,
  resolveChargeRoll,
  resolveChargeMove,
  DEFAULT_COOL,
  // Overwatch
  checkOverwatchTrigger,
  offerOverwatch,
  resolveOverwatch,
  declineOverwatch,
  getOverwatchRestrictions,
  // Challenge
  getEligibleChallengers,
  declareChallenge,
  acceptChallenge,
  declineChallenge,
  getEligibleAcceptors,
  GAMBIT_EFFECTS,
  selectGambit,
  resolveFocusRoll,
  getGambitEffect,
  getAvailableGambits,
  resolveChallengeStrike,
  resolveChallengeGlory,
  // Fight
  determineCombats,
  declareWeaponsAndSetInitiativeSteps,
  getCombatInitiativeScore,
  resolveInitiativeStep,
  resolveStrikeGroupHits,
  resolveStrikeGroupWounds,
  resolveStrikeGroupSaves,
  resolvePileIn,
  resolveFinalPileIn,
  getModelsNeedingPileIn,
  // Resolution
  returnChallengeParticipants,
  calculateCombatResolutionPoints,
  determineWinner,
  resolvePanicCheck,
  checkMassacre,
  resolveCombatResolution,
  DEFAULT_LEADERSHIP,
  // Aftermath
  getAvailableAftermathOptions,
  resolveAftermathOption,
  // Melee Pipeline
  resolveMeleeHitTests,
  resolveMeleeWoundTests,
  resolveMeleeSaves,
  resolveMeleeDamage,
  resolveMeleePipeline,
} from './assault';

// Shooting Special Rules
export {
  registerShootingRule,
  getShootingRule,
  hasShootingRule,
  getRegisteredShootingRuleNames,
  clearShootingRegistry,
  applyShootingRules,
  registerAllShootingRules,
} from './special-rules';
export type { ShootingRuleContext, ShootingRuleResult, ShootingRuleHandler } from './special-rules';

// Assault Special Rules
export {
  registerAssaultRule,
  getAssaultRule,
  hasAssaultRule,
  getRegisteredAssaultRuleNames,
  clearAssaultRegistry,
  applyAssaultRules,
  registerAllAssaultRules,
} from './special-rules/assault-rules';
export type { AssaultRuleContext, AssaultRuleResult, AssaultRuleHandler } from './special-rules/assault-rules';

// ─── Legion Rules ──────────────────────────────────────────────────────────
export {
  registerLegionTactica,
  getLegionTacticaHandlers,
  hasLegionTactica,
  clearLegionTacticaRegistry,
  getRegisteredLegionTacticas,
  applyLegionTactica,
  registerAllLegionTacticas,
} from './legion';
export type {
  LegionTacticaContext,
  ShootingTacticaContext,
  AssaultTacticaContext,
  MovementTacticaContext,
  MoraleTacticaContext,
  LegionTacticaResult,
  LegionTacticaHandler,
} from './legion';
export { registerShootingTacticas } from './legion';
export { registerAssaultTacticas } from './legion';
export { registerMovementTacticas } from './legion';
export { registerPassiveTacticas } from './legion';
export { registerHereticusTacticas } from './legion';

// ─── Advanced Reactions ────────────────────────────────────────────────────
export {
  registerAdvancedReaction,
  getAdvancedReactionHandler,
  hasAdvancedReactionHandler,
  clearAdvancedReactionRegistry,
  getRegisteredAdvancedReactions,
  isAdvancedReactionAvailable,
  checkMovementAdvancedReactionTriggers,
  checkShootingAdvancedReactionTriggers,
  checkAssaultAdvancedReactionTriggers,
  resolveAdvancedReaction,
  registerAllAdvancedReactions,
} from './legion';
export type {
  AdvancedReactionContext,
  AdvancedReactionResult,
  AdvancedReactionHandler,
} from './legion';
export { registerMovementReactions } from './legion';
export { registerShootingReactions } from './legion';
export { registerAssaultReactions } from './legion';

// ─── Legion Gambits ────────────────────────────────────────────────────────
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
  // Rite of War Registry
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
  // Allegiance System
  getDefaultAllegiance,
  isCanonicallyLoyalist,
  isCanonicallyTraitor,
  getLegionsForAllegiance,
  getLoyalistLegions,
  getTraitorLegions,
  isRiteAvailableForAllegiance,
  validateAllegiance,
  isAllegianceValid,
} from './legion';

// ─── Profile Lookup ──────────────────────────────────────────────────────────
export {
  lookupUnitProfile,
  lookupModelDefinition,
  getModelCharacteristics,
  getModelStateCharacteristics,
  isVehicleCharacteristics,
  isInfantryCharacteristics,
  isVehicleProfile,
  isVehicleUnitState,
  getUnitSpecialRules,
  unitProfileHasSpecialRule,
  modelHasSpecialRule,
  getModelBaseSizeMM,
  getModelStateBaseSizeMM,
  getModelMovement,
  getModelInitiative,
  getModelToughness,
  getModelWS,
  getModelBS,
  getModelWounds,
  getModelSave,
  getModelInvulnSave,
  getVehicleArmour,
  getModelLeadership,
  getModelCool,
  getModelStrength,
  getModelAttacks,
} from './profile-lookup';

// ─── Missions ───────────────────────────────────────────────────────────────
export {
  // Objective Queries
  OBJECTIVE_CONTROL_RANGE,
  canModelHoldObjective,
  getModelsWithinObjectiveRange,
  calculateTacticalStrength,
  getObjectiveController,
  getControlledObjectives,
  // Mission State Helpers
  initializeMissionState,
  updateMissionState,
  recordObjectiveScored,
  applyWindowOfOpportunity,
  markSecondaryAchieved,
  recordTurnStartVP,
  addObjective,
  markFirstTurnCompleted,
  markFirstStrikeAchieved,
  // Secondary Objectives
  checkSlayTheWarlord,
  checkGiantKiller,
  checkLastManStanding,
  checkFirstStrike,
  evaluateSecondaryObjectives,
  updateSecondaryTrackingOnDestruction,
  // Victory Handler
  handleVictorySubPhase,
  checkSuddenDeath,
  applyCounterOffensive,
  handleSeizeTheInitiative,
} from './missions';
export type { ObjectiveControlResult } from './missions';
