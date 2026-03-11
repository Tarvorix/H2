// @hh/engine — Missions module barrel export

// ─── Objective Queries ──────────────────────────────────────────────────────
export {
  OBJECTIVE_CONTROL_RANGE,
  canModelHoldObjective,
  getModelsWithinObjectiveRange,
  calculateTacticalStrength,
  getObjectiveController,
  getControlledObjectives,
  getUnitObjectiveRuleSummary,
  resolveObjectiveControlForScoring,
} from './objective-queries';
export type { ObjectiveControlResult, ObjectiveScoringResolution } from './objective-queries';

// ─── Mission State Helpers ──────────────────────────────────────────────────
export {
  initializeMissionState,
  updateMissionState,
  recordObjectiveScored,
  recordVanguardBonus,
  hasVanguardBonusForObjective,
  applyWindowOfOpportunity,
  markSecondaryAchieved,
  recordTurnStartVP,
  setAssaultPhaseObjectiveSnapshot,
  addObjective,
  markFirstTurnCompleted,
  markFirstStrikeAchieved,
} from './mission-state';

export {
  captureAssaultPhaseObjectiveSnapshot,
  recordAssaultPhaseObjectiveSnapshot,
  awardVanguardBonusForDestroyedUnits,
  awardVanguardBonusForCombatObjectiveUnits,
} from './vanguard-bonus';

// ─── Secondary Objectives ───────────────────────────────────────────────────
export {
  checkSlayTheWarlord,
  checkGiantKiller,
  checkLastManStanding,
  checkFirstStrike,
  evaluateSecondaryObjectives,
  updateSecondaryTrackingOnDestruction,
} from './secondary-objectives';

// ─── Victory Handler ────────────────────────────────────────────────────────
export {
  handleVictorySubPhase,
  checkSuddenDeath,
  applyCounterOffensive,
  handleSeizeTheInitiative,
} from './victory-handler';
