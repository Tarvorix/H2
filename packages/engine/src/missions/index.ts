// @hh/engine — Missions module barrel export

// ─── Objective Queries ──────────────────────────────────────────────────────
export {
  OBJECTIVE_CONTROL_RANGE,
  canModelHoldObjective,
  getModelsWithinObjectiveRange,
  calculateTacticalStrength,
  getObjectiveController,
  getControlledObjectives,
} from './objective-queries';
export type { ObjectiveControlResult } from './objective-queries';

// ─── Mission State Helpers ──────────────────────────────────────────────────
export {
  initializeMissionState,
  updateMissionState,
  recordObjectiveScored,
  applyWindowOfOpportunity,
  markSecondaryAchieved,
  recordTurnStartVP,
  addObjective,
  markFirstTurnCompleted,
  markFirstStrikeAchieved,
} from './mission-state';

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
