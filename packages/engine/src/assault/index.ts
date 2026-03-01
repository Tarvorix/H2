// @hh/engine/assault — Assault Phase modules barrel export

// ─── Assault Types ──────────────────────────────────────────────────────────
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
} from './assault-types';

export {
  calculateSetupMoveDistance,
  BASIC_CLOSE_COMBAT_WEAPON,
} from './assault-types';

// ─── Charge Validator ───────────────────────────────────────────────────────
export type {
  ChargeValidationResult,
  ChargeValidationData,
} from './charge-validator';

export {
  validateChargeEligibility,
  validateChargeTarget,
  isDisorderedCharge,
  MAX_CHARGE_RANGE,
} from './charge-validator';

// ─── Setup Move Handler ─────────────────────────────────────────────────────
export type { SetupMoveResult } from './setup-move-handler';

export {
  resolveSetupMove,
  moveToward,
  DEFAULT_INITIATIVE,
  DEFAULT_MOVEMENT,
} from './setup-move-handler';

// ─── Volley Attack Handler ──────────────────────────────────────────────────
export type { VolleyAttackResult } from './volley-attack-handler';

export {
  resolveVolleyAttacks,
  shouldUseOverwatch,
} from './volley-attack-handler';

// ─── Charge Move Handler ───────────────────────────────────────────────────
export type { ChargeRollResult, ChargeMoveResult } from './charge-move-handler';

export {
  resolveChargeRoll,
  resolveChargeMove,
  DEFAULT_COOL,
} from './charge-move-handler';

// ─── Overwatch Handler ──────────────────────────────────────────────────────
export type {
  OverwatchCheckResult,
  OverwatchExecutionResult,
  OverwatchRestrictions,
} from './overwatch-handler';

export {
  checkOverwatchTrigger,
  offerOverwatch,
  resolveOverwatch,
  declineOverwatch,
  getOverwatchRestrictions,
} from './overwatch-handler';

// ─── Challenge Handler ─────────────────────────────────────────────────────
export type {
  ChallengeEligibilityResult,
  ChallengeDeclareResult,
  ChallengeResponseResult,
} from './challenge-handler';

export {
  getEligibleChallengers,
  declareChallenge,
  acceptChallenge,
  declineChallenge,
  getEligibleAcceptors,
} from './challenge-handler';

// ─── Gambit Handler ────────────────────────────────────────────────────────
export type { FocusRollResult } from './gambit-handler';

export {
  GAMBIT_EFFECTS,
  selectGambit,
  resolveFocusRoll,
  getGambitEffect,
  getAvailableGambits,
} from './gambit-handler';

// ─── Challenge Strike Handler ──────────────────────────────────────────────
export type {
  ChallengeStrikeResult,
  ChallengeGloryResult,
} from './challenge-strike-handler';

export {
  resolveChallengeStrike,
  resolveChallengeGlory,
} from './challenge-strike-handler';

// ─── Fight Handler ────────────────────────────────────────────────────────
export type {
  DetermineCombatsResult,
  ModelCombatSetup,
} from './fight-handler';

export {
  determineCombats,
  declareWeaponsAndSetInitiativeSteps,
  getCombatInitiativeScore,
} from './fight-handler';

// ─── Initiative Step Handler ──────────────────────────────────────────────
export type { InitiativeStepResult } from './initiative-step-handler';

export {
  resolveInitiativeStep,
  resolveStrikeGroupHits,
  resolveStrikeGroupWounds,
  resolveStrikeGroupSaves,
} from './initiative-step-handler';

// ─── Pile-In Handler ──────────────────────────────────────────────────────
export type {
  PileInResult,
  FinalPileInResult,
} from './pile-in-handler';

export {
  resolvePileIn,
  resolveFinalPileIn,
  getModelsNeedingPileIn,
  DEFAULT_PILE_IN_INITIATIVE,
} from './pile-in-handler';

// ─── Resolution Handler ──────────────────────────────────────────────────
export type {
  ReturnChallengeResult,
  CRPResult,
  CRPBreakdown,
  CombatWinnerResult,
  PanicCheckResult,
  MassacreCheckResult,
  CombatResolutionResult,
} from './resolution-handler';

export {
  returnChallengeParticipants,
  calculateCombatResolutionPoints,
  determineWinner,
  resolvePanicCheck,
  checkMassacre,
  resolveCombatResolution,
  DEFAULT_LEADERSHIP,
} from './resolution-handler';

// ─── Aftermath Handler ───────────────────────────────────────────────────
export type { AftermathSelectionResult } from './aftermath-handler';

export {
  getAvailableAftermathOptions,
  resolveAftermathOption,
  BOARD_EDGE_Y,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} from './aftermath-handler';

// ─── Melee Resolution Pipeline ───────────────────────────────────────────
export type {
  MeleeHitTestResult,
  MeleeWoundTestResult,
  MeleeSaveResult,
  MeleeDamageResult,
  MeleePipelineOptions,
  MeleePipelineResult,
} from './melee-resolution';

export {
  resolveMeleeHitTests,
  resolveMeleeWoundTests,
  resolveMeleeSaves,
  resolveMeleeDamage,
  resolveMeleePipeline,
} from './melee-resolution';
