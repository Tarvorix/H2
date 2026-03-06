/**
 * @hh/ai — AI Opponent Package
 *
 * Provides Basic (random) and Tactical (heuristic) AI strategies
 * that generate GameCommand objects for the engine.
 */

// Types
export {
  AIStrategyTier,
  type AIPlayerConfig,
  type AIDeploymentFormation,
  type AITurnContext,
  type AIStrategy,
  type DeploymentCommand,
  type TargetScore,
  type MovementScore,
  type StrategyMode,
} from './types';

// Controller
export {
  createStrategy,
  createTurnContext,
  shouldAIAct,
  generateNextCommand,
  generateDeploymentCommand,
} from './ai-controller';

// Strategies
export { BasicStrategy } from './strategy/basic-strategy';
export { TacticalStrategy } from './strategy/tactical-strategy';

// Phase Handlers
export { generatePhaseControlCommand, isAutoAdvanceSubPhase } from './phases/phase-control-ai';
export { generateMovementCommand } from './phases/movement-ai';
export { generateShootingCommand } from './phases/shooting-ai';
export { generateAssaultCommand } from './phases/assault-ai';
export { generateReactionCommand } from './phases/reaction-ai';

// Deployment
export { generateDeploymentPlacement } from './deployment/deployment-ai';

// Evaluation
export { evaluateUnitThreat, rankUnitsByThreat } from './evaluation/threat-evaluation';
export { prioritizeShootingTargets, prioritizeChargeTargets } from './evaluation/target-priority';
export {
  evaluateMovementDestination,
  findBestMovePosition,
  generateCandidatePositions,
} from './evaluation/position-evaluation';

// Helpers
export {
  getMovableUnits,
  getShootableUnits,
  getChargeableUnits,
  getReservesUnits,
  getValidShootingTargets,
  getValidChargeTargets,
  getUnitEquippedWeapons,
  getModelMovementCharacteristic,
  getUnitCentroid,
  getEnemyDeployedUnits,
  findOwnedUnit,
} from './helpers/unit-queries';

export {
  clampToBattlefield,
  distanceBetween,
  calculateRandomMovePosition,
  calculateDirectionalMovePosition,
  spreadModelsAroundCentroid,
  generateLineFormation,
} from './helpers/movement-destination';

export {
  selectWeaponsForAttack,
  hasWeaponsInRange,
  estimateExpectedDamage,
  type WeaponAssignment,
} from './helpers/weapon-selection';
