import fs from 'node:fs';
import path from 'node:path';
import { ALPHA_TENSORFLOW_BACKEND } from './tfjs-node-bootstrap.mjs';
import {
  AIStrategyTier,
  DEFAULT_ALPHA_MODEL_ID,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  createAlphaAdamOptimizer,
  createAlphaTrainableModel,
  createFreshAlphaModel,
  createTurnContext,
  deserializeAlphaModel,
  disposeAlphaTrainableModel,
  encodeAlphaActions,
  encodeAlphaState,
  estimateAlphaValueTargets,
  exportTrainedAlphaModel,
  getAlphaModel,
  generateMacroActions,
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
  getTurnContextQueuedPlan,
  listAlphaModels,
  registerAlphaModel,
  searchBestAction,
  serializeAlphaModel,
  trainAlphaBatch,
  validateAlphaModel,
} from '../../packages/ai/dist/index.js';
import { getStateFingerprint } from '../../packages/ai/dist/state-utils.js';
import {
  buildFallbackCommand,
  createHeadlessGameState,
  createHeadlessGameStateFromArmyLists,
  createReplayArtifact,
} from '../../packages/headless/dist/index.js';
import {
  RandomDiceProvider,
  processCommand,
} from '../../packages/engine/dist/index.js';
import {
  createProgressReporter,
  createDefaultSetupOptions,
  createEnginePlayerConfig,
  createMirroredGateSetupOptions,
  ensureDir,
  parseArgs,
  readJson,
  readJsonLines,
  resolveFromCwd,
  toFloat,
  toInt,
  writeJson,
  writeJsonLines,
} from '../nnue/common.mjs';

export {
  createProgressReporter,
  DEFAULT_ALPHA_MODEL_ID,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  createDefaultSetupOptions,
  createEnginePlayerConfig,
  createMirroredGateSetupOptions,
  ensureDir,
  parseArgs,
  readJson,
  readJsonLines,
  resolveFromCwd,
  toFloat,
  toInt,
  writeJson,
  writeJsonLines,
};
export {
  createTurnContext,
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
  getTurnContextQueuedPlan,
  createFreshAlphaModel,
  createAlphaAdamOptimizer,
  createAlphaTrainableModel,
  disposeAlphaTrainableModel,
  exportTrainedAlphaModel,
  getAlphaModel,
  listAlphaModels,
  registerAlphaModel,
  serializeAlphaModel,
  trainAlphaBatch,
  validateAlphaModel,
};

export const ALPHA_TMP_ROOT = path.join('tmp', 'alpha');
export const ALPHA_DISTILL_ROOT = path.join(ALPHA_TMP_ROOT, 'distill');
export const ALPHA_SELFPLAY_ROOT = path.join(ALPHA_TMP_ROOT, 'selfplay');
export const ALPHA_TRAIN_ROOT = path.join(ALPHA_TMP_ROOT, 'train');
export const ALPHA_GATE_ROOT = path.join(ALPHA_TMP_ROOT, 'gate');
export const ALPHA_PROMOTION_ARCHIVE_ROOT = path.join('archive', 'alpha', 'promotions');
export const DEFAULT_ALPHA_MODEL_OVERRIDE_FILE = path.join(
  'packages',
  'ai',
  'src',
  'alpha',
  'default-alpha-model-override.ts',
);

export class RecordingDiceProvider {
  constructor(delegate = new RandomDiceProvider()) {
    this.delegate = delegate;
    this.recorded = [];
  }

  rollD6() {
    const value = this.delegate.rollD6();
    this.recorded.push(value);
    return value;
  }

  rollMultipleD6(count) {
    return Array.from({ length: count }, () => this.rollD6());
  }

  roll2D6() {
    return [this.rollD6(), this.rollD6()];
  }

  rollD3() {
    return Math.ceil(this.rollD6() / 2);
  }

  rollScatter() {
    return {
      direction: this.rollD6(),
      distance: this.rollD6(),
    };
  }

  getSequence() {
    return [...this.recorded];
  }
}

export function createInitialStateFromSetupOptions(setupOptions) {
  if (setupOptions && Array.isArray(setupOptions.armyLists)) {
    return createHeadlessGameStateFromArmyLists(setupOptions);
  }
  return createHeadlessGameState(setupOptions);
}

export function createAlphaPlayerConfig(playerIndex, overrides = {}) {
  const {
    timeBudgetMs = 600,
    maxSimulations = 256,
    alphaModelId = DEFAULT_ALPHA_MODEL_ID,
    baseSeed = 9001 + playerIndex,
    diagnosticsEnabled = true,
    ...restOverrides
  } = overrides;

  return {
    enabled: true,
    playerIndex,
    strategyTier: AIStrategyTier.Alpha,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    timeBudgetMs,
    maxSimulations,
    alphaModelId,
    baseSeed,
    diagnosticsEnabled,
    ...restOverrides,
  };
}

export function loadAlphaModelFromFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return deserializeAlphaModel(JSON.parse(fs.readFileSync(absolutePath, 'utf8')));
}

export function registerAlphaModelFromFile(filePath) {
  const model = loadAlphaModelFromFile(filePath);
  registerAlphaModel(model);
  return model;
}

export function createAlphaTrainingSeedModel(modelId, trainingMetadata) {
  return createFreshAlphaModel(modelId, trainingMetadata);
}

export function createAlphaOptimizer(learningRate) {
  return createAlphaAdamOptimizer(learningRate);
}

export function trainAlphaModelBatches(baseModel, batches, options = {}) {
  const optimizer = options.optimizer ?? createAlphaOptimizer(options.learningRate ?? 1e-4);
  const trainable = createAlphaTrainableModel(baseModel);
  try {
    const losses = [];
    for (const batch of batches) {
      losses.push(trainAlphaBatch(trainable, batch, optimizer, options));
    }

    return {
      model: exportTrainedAlphaModel(trainable, options.trainingMetadata),
      losses,
    };
  } finally {
    optimizer.dispose?.();
  }
}

function buildReplay(initialState, commandHistory, diceSequence, matchId, terminatedReason) {
  return createReplayArtifact(
    initialState,
    commandHistory.map((entry) => ({
      command: entry.command,
      actingPlayerIndex: entry.actingPlayerIndex,
    })),
    diceSequence,
    {
      matchId,
      terminatedReason,
    },
  );
}

export function runAlphaInstrumentedMatch({
  matchId,
  setupOptions,
  aiPlayers,
  maxCommands = 2000,
  onDecision = null,
}) {
  const initialState = createInitialStateFromSetupOptions(setupOptions);
  const configByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, config]));
  const contextByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, createTurnContext()]));
  const dice = new RecordingDiceProvider(new RandomDiceProvider());
  const commandHistory = [];
  const observed = [];

  let state = initialState;
  let step = 0;

  while (step < maxCommands && !state.isGameOver) {
    const decisionPlayer = state.awaitingReaction
      ? (state.activePlayerIndex === 0 ? 1 : 0)
      : state.activePlayerIndex;
    const config = configByPlayer.get(decisionPlayer);
    const context = contextByPlayer.get(decisionPlayer);
    if (!config || !context || !config.enabled) {
      break;
    }

    const preDecisionFingerprint = getStateFingerprint(state);
    const actedUnitIdsBeforeDecision = new Set(context.actedUnitIds);
    const queuedPlanHead = context.queuedPlan[0] ?? null;
    const willUseQueuedPlan = Boolean(
      queuedPlanHead
      && queuedPlanHead.expectedStateFingerprint === preDecisionFingerprint
      && queuedPlanHead.decisionOwner === decisionPlayer
      && queuedPlanHead.phase === state.currentPhase
      && queuedPlanHead.subPhase === state.currentSubPhase,
    );

    let command = null;
    let diagnostics = null;
    try {
      command = generateNextCommand(state, config, context);
      diagnostics = getTurnContextDiagnostics(context);
    } catch (error) {
      return {
        initialState,
        finalState: state,
        commandHistory,
        diceSequence: dice.getSequence(),
        replay: buildReplay(initialState, commandHistory, dice.getSequence(), matchId, 'ai-error'),
        observed,
        terminatedReason: 'ai-error',
        errorMessage: getTurnContextError(context) ?? (error instanceof Error ? error.message : String(error)),
      };
    }

    const fallbackCommand = buildFallbackCommand(state);
    const resolvedCommand = command ?? fallbackCommand;
    if (!resolvedCommand) {
      break;
    }

    let executedCommand = resolvedCommand;
    let result = processCommand(state, resolvedCommand, dice);
    let recoveredWithFallback = false;

    if (!result.accepted && command && fallbackCommand && fallbackCommand.type !== resolvedCommand.type) {
      const fallbackResult = processCommand(state, fallbackCommand, dice);
      if (fallbackResult.accepted) {
        executedCommand = fallbackCommand;
        result = fallbackResult;
        recoveredWithFallback = true;
      }
    }

    step += 1;
    commandHistory.push({
      step,
      command: executedCommand,
      actingPlayerIndex: decisionPlayer,
      accepted: result.accepted,
      errorMessages: result.errors.map((entry) => entry.message),
      eventCount: result.events.length,
      battleTurn: result.state.currentBattleTurn,
      phase: result.state.currentPhase,
      subPhase: result.state.currentSubPhase,
      aiDiagnostics: recoveredWithFallback ? null : diagnostics,
    });

    if (!result.accepted) {
      return {
        initialState,
        finalState: state,
        commandHistory,
        diceSequence: dice.getSequence(),
        replay: buildReplay(initialState, commandHistory, dice.getSequence(), matchId, 'command-rejected'),
        observed,
        terminatedReason: 'command-rejected',
        errorMessage: result.errors.map((entry) => entry.message).join('; '),
      };
    }

    if (onDecision && command && !recoveredWithFallback) {
      const snapshot = onDecision({
        matchId,
        step,
        state,
        playerIndex: decisionPlayer,
        config,
        context,
        diagnostics,
        command: executedCommand,
        actedUnitIdsBeforeDecision,
        usedQueuedPlan: willUseQueuedPlan,
      });
      if (snapshot !== null && snapshot !== undefined) {
        observed.push(snapshot);
      }
    }

    state = result.state;
  }

  const winnerPlayerIndex = state.winnerPlayerIndex;
  const replay = buildReplay(
    initialState,
    commandHistory,
    dice.getSequence(),
    matchId,
    state.isGameOver ? 'game-over' : 'max-commands',
  );

  return {
    initialState,
    finalState: state,
    commandHistory,
    diceSequence: dice.getSequence(),
    replay,
    observed: observed.map((entry) => ({
      ...entry,
      finalOutcome: winnerPlayerIndex === null
        ? 0
        : (winnerPlayerIndex === entry.playerIndex ? 1 : -1),
      finalStateHash: replay.finalStateHash,
    })),
    terminatedReason: state.isGameOver ? 'game-over' : 'max-commands',
    errorMessage: null,
  };
}

export function createDistillSample(state, playerIndex, engineConfig, options = {}) {
  const macroConfig = {
    timeBudgetMs: engineConfig.timeBudgetMs ?? 100,
    nnueModelId: engineConfig.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    baseSeed: engineConfig.baseSeed ?? 1337,
    rolloutCount: Math.max(1, engineConfig.rolloutCount ?? 1),
    maxDepthSoft: Math.max(1, engineConfig.maxDepthSoft ?? 3),
    diagnosticsEnabled: Boolean(engineConfig.diagnosticsEnabled),
    maxRootActions: (engineConfig.timeBudgetMs ?? 100) <= 600 ? 20 : 24,
    maxActionsPerUnit: (engineConfig.timeBudgetMs ?? 100) <= 600 ? 4 : 5,
    aspirationWindow: 35,
    maxAutoAdvanceSteps: 8,
  };
  const node = {
    state,
    actedUnitIds: new Set(options.actedUnitIds ?? []),
  };
  const actions = Array.isArray(options.actions)
    ? options.actions
    : generateMacroActions(node, playerIndex, macroConfig, { includeAdvanceCommands: true });
  const preselectedActionId = typeof options.selectedMacroActionId === 'string'
    ? options.selectedMacroActionId
    : null;
  const search = preselectedActionId
    ? null
    : searchBestAction(state, engineConfig, new Set(options.actedUnitIds ?? []));
  const bestActionId = preselectedActionId ?? (search?.bestAction?.id ?? null);
  if (!bestActionId || actions.length === 0) {
    return null;
  }

  const policyTarget = actions.map((action) => Number(action.id === bestActionId));
  const normalization = policyTarget.reduce((sum, value) => sum + value, 0);
  const normalizedPolicy = normalization > 0
    ? policyTarget.map((value) => value / normalization)
    : policyTarget;
  const alphaTargets = estimateAlphaValueTargets(state, playerIndex);

  return {
    state,
    rootPlayerIndex: playerIndex,
    actions,
    policyTarget: normalizedPolicy,
    valueTarget: Math.tanh(((options.searchScore ?? search?.score ?? 0)) / 250),
    vpDeltaTarget: alphaTargets.vpDelta,
    tacticalSwingTarget: alphaTargets.tacticalSwing,
    source: 'distill',
    sourceModelId: options.sourceModelId ?? search?.diagnostics?.modelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  };
}

export function createAlphaSelfPlaySample(state, playerIndex, alphaConfig, options = {}) {
  const node = {
    state,
    actedUnitIds: new Set(options.actedUnitIds ?? []),
  };
  const macroConfig = {
    timeBudgetMs: alphaConfig.timeBudgetMs ?? 600,
    nnueModelId: alphaConfig.alphaModelId ?? DEFAULT_ALPHA_MODEL_ID,
    baseSeed: alphaConfig.baseSeed ?? 9001,
    rolloutCount: 1,
    maxDepthSoft: 1,
    diagnosticsEnabled: Boolean(alphaConfig.diagnosticsEnabled),
    maxRootActions: (alphaConfig.timeBudgetMs ?? 600) <= 600 ? 18 : 24,
    maxActionsPerUnit: (alphaConfig.timeBudgetMs ?? 600) <= 600 ? 4 : 5,
    aspirationWindow: 0,
    maxAutoAdvanceSteps: 8,
  };
  const actions = generateMacroActions(node, playerIndex, macroConfig, { includeAdvanceCommands: true });
  const preselectedActionId = typeof options.selectedMacroActionId === 'string'
    ? options.selectedMacroActionId
    : null;
  const selectedCommandType = typeof options.selectedCommandType === 'string'
    ? options.selectedCommandType
    : null;
  const matchingCommandActions = selectedCommandType
    ? actions.filter((action) => action.commands[0]?.type === selectedCommandType)
    : [];
  const uniqueCommandMatch = matchingCommandActions.length === 1 ? matchingCommandActions[0] : null;
  const fallbackAction = actions.length === 1 ? actions[0] : null;
  const bestAction = actions.find((action) => action.id === preselectedActionId) ?? uniqueCommandMatch ?? fallbackAction;
  const bestActionId = bestAction?.id ?? null;
  if (!bestActionId || actions.length === 0) {
    return null;
  }

  const policyTarget = actions.map((action) => Number(action.id === bestActionId));
  const normalization = policyTarget.reduce((sum, value) => sum + value, 0);
  const normalizedPolicy = normalization > 0
    ? policyTarget.map((value) => value / normalization)
    : policyTarget;
  const alphaTargets = estimateAlphaValueTargets(state, playerIndex);

  return {
    state,
    rootPlayerIndex: playerIndex,
    actions,
    policyTarget: normalizedPolicy,
    valueTarget: typeof options.valueEstimate === 'number' && (options.rootVisits ?? 0) > 0
      ? options.valueEstimate
      : alphaTargets.value,
    vpDeltaTarget: alphaTargets.vpDelta,
    tacticalSwingTarget: alphaTargets.tacticalSwing,
    source: 'selfplay',
    sourceModelId: options.sourceModelId ?? alphaConfig.alphaModelId ?? DEFAULT_ALPHA_MODEL_ID,
    selectedMacroActionId: bestActionId,
    selectedCommandType: options.selectedCommandType ?? bestAction?.commands[0]?.type ?? null,
    policyEntropy: options.policyEntropy ?? 0,
    rootVisits: options.rootVisits ?? 0,
    nodesExpanded: options.nodesExpanded ?? 0,
    searchTimeMs: options.searchTimeMs ?? 0,
  };
}

export function encodeReplayBufferEntry(entry) {
  return {
    ...entry,
    encodedState: encodeAlphaState(entry.state, entry.rootPlayerIndex),
    encodedActions: encodeAlphaActions(entry.state, entry.rootPlayerIndex, entry.actions),
  };
}
