/**
 * @hh/ai — AI Opponent Package
 *
 * Provides Basic (random), Tactical (heuristic), and Engine (search + NNUE)
 * AI strategies that generate GameCommand objects for the engine.
 */

// Types
export {
  AIStrategyTier,
  type AIPlayerConfig,
  type ShadowAlphaConfig,
  type AIDeploymentFormation,
  type AITurnContext,
  type AIStrategy,
  type DeploymentCommand,
  type QueuedCommandStep,
  type MacroAction,
  type AlphaDiagnosticSummary,
  type AlphaAIDiagnostics,
  type AIDiagnostics,
  type SearchConfig,
  type SearchResult,
  type AlphaEncodedStateToken,
  type AlphaEncodedAction,
  type AlphaTransformerHyperparameters,
  type AlphaTrainingMetadata,
  type SerializedAlphaTensor,
  type SerializedAlphaModelManifest,
  type SerializedAlphaModel,
  type AlphaTensor,
  type AlphaModel,
  type AlphaSearchConfig,
  type AlphaSearchResult,
  type AlphaReplayBufferEntry,
  type QuantizedLayer,
  type NNUEModelManifest,
  type NNUEModel,
  type SerializedNNUEModel,
  type Evaluator,
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
  getTurnContextDiagnostics,
  getTurnContextError,
  getTurnContextQueuedPlan,
} from './ai-controller';

// Strategies
export { BasicStrategy } from './strategy/basic-strategy';
export { TacticalStrategy } from './strategy/tactical-strategy';
export { EngineStrategy } from './strategy/engine-strategy';
export { AlphaStrategy } from './strategy/alpha-strategy';

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

// Engine Search + NNUE
export {
  GAMEPLAY_FEATURE_DIMENSION,
  GAMEPLAY_FEATURE_VERSION,
  extractGameplayFeatures,
} from './engine/feature-extractor';
export {
  ROSTER_FEATURE_DIMENSION,
  ROSTER_FEATURE_VERSION,
  extractRosterFeatures,
} from './engine/roster-feature-extractor';
export {
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  getNNUEModel,
  listNNUEModels,
  registerNNUEModel,
  resolveNNUEModel,
  validateNNUEModel,
} from './engine/model-registry';
export {
  NNUEEvaluator,
  RosterNNUEEvaluator,
  evaluateRosterArmyList,
} from './engine/evaluator';
export { searchBestAction } from './engine/search';
export { generateMacroActions, isRealDecisionNode, type SearchNodeState } from './engine/candidate-generator';
export { serializeNNUEModel, deserializeNNUEModel } from './engine/serialization';

// Alpha Transformer + PUCT
export {
  DEFAULT_ALPHA_MODEL_ID,
  getAlphaModel,
  listAlphaModels,
  registerAlphaModel,
  resolveAlphaModel,
  validateAlphaModel,
} from './alpha/model-registry';
export {
  DEFAULT_ALPHA_MODEL,
  DEFAULT_ALPHA_MODEL_PROMOTED_ID,
  materializeDefaultAlphaModel,
} from './alpha/default-model';
export {
  createFreshAlphaModel,
  alphaForwardPass,
  buildAlphaTensorShapeMap,
  buildAlphaBatchInputs,
  clearAlphaTensorCache,
} from './alpha/inference';
export {
  createAlphaAdamOptimizer,
  createAlphaTrainableModel,
  disposeAlphaTrainableModel,
  trainAlphaBatch,
  exportTrainedAlphaModel,
  type AlphaTrainableModel,
  type AlphaTrainingBatch,
  type AlphaTrainingLosses,
} from './alpha/training';
export { computePUCTScore } from './alpha/puct';
export { sampleMacroActionTransition } from './alpha/chance-handling';
export { searchAlphaBestAction } from './alpha/search';
export { encodeAlphaState, estimateAlphaValueTargets } from './alpha/state-encoder';
export { encodeAlphaActions } from './alpha/action-encoder';
export { serializeAlphaModel, deserializeAlphaModel } from './alpha/serialization';

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
