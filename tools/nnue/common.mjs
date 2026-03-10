import fs from 'node:fs';
import path from 'node:path';
import {
  AIStrategyTier,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  GAMEPLAY_FEATURE_DIMENSION,
  GAMEPLAY_FEATURE_VERSION,
  createTurnContext,
  deserializeNNUEModel,
  extractGameplayFeatures,
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
  registerNNUEModel,
  serializeNNUEModel,
} from '../../packages/ai/dist/index.js';
import {
  buildFallbackCommand,
  createHeadlessGameState,
  createHeadlessGameStateFromArmyLists,
  createReplayArtifact,
  getCurated2000PointArmyLists,
  runHeadlessMatch,
} from '../../packages/headless/dist/index.js';
import {
  Allegiance,
  LegionFaction,
} from '../../packages/types/dist/index.js';
import {
  RandomDiceProvider,
  hashGameState,
  hashStableValue,
  processCommand,
} from '../../packages/engine/dist/index.js';

export {
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  GAMEPLAY_FEATURE_DIMENSION,
  GAMEPLAY_FEATURE_VERSION,
};

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function toInt(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toFloat(value, fallback) {
  if (value === undefined || value === null || value === true) return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderProgressBar(completed, total, width = 24) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, completed / safeTotal));
  const filled = Math.round(ratio * width);
  return `${'='.repeat(filled)}${'-'.repeat(Math.max(0, width - filled))}`;
}

export function createProgressReporter({
  label,
  total,
  width = 24,
  stream = process.stderr,
}) {
  const startedAt = Date.now();
  const isTTY = Boolean(stream?.isTTY);
  let lastLineLength = 0;
  let lastNonTTYPercent = -1;
  let currentCompleted = 0;

  function buildLine(completed, detail = '') {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 100;
    const elapsedMs = Date.now() - startedAt;
    const avgPerItem = completed > 0 ? elapsedMs / completed : 0;
    const remainingMs = completed > 0 ? avgPerItem * Math.max(0, total - completed) : 0;
    const suffix = detail ? ` ${detail}` : '';
    return `${label} [${renderProgressBar(completed, total, width)}] ${completed}/${total} ${percent}% elapsed ${formatDuration(elapsedMs)} eta ${formatDuration(remainingMs)}${suffix}`;
  }

  function writeLine(line, forceNewline = false) {
    if (!stream) return;
    if (isTTY && !forceNewline) {
      const padded = line.padEnd(lastLineLength, ' ');
      stream.write(`\r${padded}`);
      lastLineLength = Math.max(lastLineLength, line.length);
      return;
    }
    stream.write(`${line}\n`);
    lastLineLength = 0;
  }

  writeLine(buildLine(0, 'starting'));

  return {
    tick(detail = '') {
      currentCompleted = Math.min(total, currentCompleted + 1);
      const line = buildLine(currentCompleted, detail);
      if (isTTY) {
        writeLine(line);
        return;
      }

      const percent = total > 0 ? Math.round((currentCompleted / total) * 100) : 100;
      if (percent >= lastNonTTYPercent + 5 || currentCompleted === total) {
        writeLine(line, true);
        lastNonTTYPercent = percent;
      }
    },
    finish(detail = 'done', completedOverride = null) {
      const completed = typeof completedOverride === 'number'
        ? Math.max(0, Math.min(total, completedOverride))
        : total;
      const line = buildLine(completed, detail);
      writeLine(line, true);
    },
  };
}

export function ensureDir(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

export function resolveFromCwd(filePath) {
  return path.resolve(process.cwd(), filePath);
}

export function writeJson(filePath, payload) {
  const absolutePath = resolveFromCwd(filePath);
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
}

export function writeJsonLines(filePath, rows) {
  const absolutePath = resolveFromCwd(filePath);
  ensureDir(path.dirname(absolutePath));
  const output = rows.map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(absolutePath, `${output}${rows.length > 0 ? '\n' : ''}`, 'utf8');
  return absolutePath;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveFromCwd(filePath), 'utf8'));
}

export function readJsonLines(filePaths) {
  const rows = [];
  for (const filePath of filePaths) {
    const absolutePath = resolveFromCwd(filePath);
    if (!fs.existsSync(absolutePath)) continue;
    const lines = fs.readFileSync(absolutePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      rows.push(JSON.parse(line));
    }
  }
  return rows;
}

function isArmyListSetupOptions(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.armyLists) &&
    value.armyLists.length === 2,
  );
}

function createInitialStateFromSetupOptions(setupOptions) {
  if (isArmyListSetupOptions(setupOptions)) {
    return createHeadlessGameStateFromArmyLists(setupOptions);
  }
  return createHeadlessGameState(setupOptions);
}

export function createDefaultSetupOptions(overrides = {}) {
  const {
    matchIndex = 0,
    ...restOverrides
  } = overrides;
  const curatedArmyLists = getCurated2000PointArmyLists();

  if (curatedArmyLists.length >= 2) {
    const left = curatedArmyLists[matchIndex % curatedArmyLists.length];
    const right = curatedArmyLists[(matchIndex + 1) % curatedArmyLists.length];

    return {
      missionId: 'heart-of-battle',
      maxBattleTurns: 4,
      armyLists: [left.armyList, right.armyList],
      ...restOverrides,
    };
  }

  return {
    missionId: 'heart-of-battle',
    maxBattleTurns: 4,
    armies: [
      {
        playerName: 'Engine Alpha',
        faction: LegionFaction.SonsOfHorus,
        allegiance: Allegiance.Traitor,
        units: [
          { profileId: 'techmarine', modelCount: 1, isWarlord: true },
          { profileId: 'tactical-squad', modelCount: 10 },
        ],
      },
      {
        playerName: 'Engine Beta',
        faction: LegionFaction.DarkAngels,
        allegiance: Allegiance.Loyalist,
        units: [
          { profileId: 'techmarine', modelCount: 1, isWarlord: true },
          { profileId: 'tactical-squad', modelCount: 10 },
        ],
      },
    ],
    ...restOverrides,
  };
}

export function createMirroredGateSetupOptions(matchIndex, overrides = {}) {
  const {
    pairIndex = Math.floor(matchIndex / 2),
    swapSides = (matchIndex % 2) === 1,
    ...restOverrides
  } = overrides;
  const curatedArmyLists = getCurated2000PointArmyLists();

  if (curatedArmyLists.length >= 2) {
    const leftBase = curatedArmyLists[pairIndex % curatedArmyLists.length];
    const rightBase = curatedArmyLists[(pairIndex + 1) % curatedArmyLists.length];
    const [left, right] = swapSides
      ? [rightBase, leftBase]
      : [leftBase, rightBase];

    return {
      missionId: 'heart-of-battle',
      maxBattleTurns: 4,
      armyLists: [left.armyList, right.armyList],
      ...restOverrides,
    };
  }

  const fallback = createDefaultSetupOptions({
    matchIndex: pairIndex,
    ...restOverrides,
  });

  if (!swapSides) {
    return fallback;
  }

  if (Array.isArray(fallback.armyLists)) {
    return {
      ...fallback,
      armyLists: [fallback.armyLists[1], fallback.armyLists[0]],
    };
  }

  if (Array.isArray(fallback.armies)) {
    return {
      ...fallback,
      armies: [fallback.armies[1], fallback.armies[0]],
    };
  }

  return fallback;
}

export function createEnginePlayerConfig(playerIndex, overrides = {}) {
  const {
    timeBudgetMs: requestedTimeBudgetMs,
    maxDepthSoft: requestedMaxDepthSoft,
    ...restOverrides
  } = overrides;
  const timeBudgetMs = requestedTimeBudgetMs ?? 100;
  const maxDepthSoft = requestedMaxDepthSoft ?? (timeBudgetMs <= 600 ? 3 : 4);

  return {
    enabled: true,
    playerIndex,
    strategyTier: AIStrategyTier.Engine,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    timeBudgetMs,
    nnueModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    baseSeed: 1337 + playerIndex,
    rolloutCount: 1,
    maxDepthSoft,
    diagnosticsEnabled: true,
    ...restOverrides,
  };
}

class RecordingDiceProvider {
  constructor(delegate) {
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

export function runInstrumentedMatch({
  matchId,
  setupOptions,
  aiPlayers,
  maxCommands = 2000,
}) {
  const initialState = createInitialStateFromSetupOptions(setupOptions);
  const stateByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, config]));
  const contextByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, createTurnContext()]));
  const dice = new RecordingDiceProvider(new RandomDiceProvider());
  const samples = [];
  const commandHistory = [];
  const createReplay = (terminatedReason) => createReplayArtifact(
    initialState,
    commandHistory.map((entry) => ({
      command: entry.command,
      actingPlayerIndex: entry.actingPlayerIndex,
    })),
    dice.getSequence(),
    {
      matchId,
      terminatedReason,
    },
  );
  const buildEarlyResult = (terminatedReason, errorMessage) => ({
    initialState,
    finalState: state,
    commandHistory,
    diceSequence: dice.getSequence(),
    replay: createReplay(terminatedReason),
    // Aborted/self-play-invalid games should be recorded for diagnostics,
    // but they should not contribute unlabeled samples to the training corpus.
    samples: [],
    terminatedReason,
    errorMessage,
  });

  let state = initialState;
  let step = 0;

  while (step < maxCommands) {
    if (state.isGameOver) break;

    const decisionPlayer = state.awaitingReaction
      ? (state.activePlayerIndex === 0 ? 1 : 0)
      : state.activePlayerIndex;
    const config = stateByPlayer.get(decisionPlayer);
    const context = contextByPlayer.get(decisionPlayer);
    if (!config || !context || !config.enabled) {
      return buildEarlyResult('no-ai-controller', null);
    }

    let command = null;
    let diagnostics = null;
    try {
      command = generateNextCommand(state, config, context);
      diagnostics = getTurnContextDiagnostics(context);
    } catch (error) {
      return buildEarlyResult(
        'ai-error',
        getTurnContextError(context) ?? (error instanceof Error ? error.message : String(error)),
      );
    }

    const resolvedCommand = command ?? buildFallbackCommand(state);
    if (!resolvedCommand) {
      return buildEarlyResult('no-command-generated', null);
    }

    if (config.strategyTier === AIStrategyTier.Engine) {
      samples.push({
        matchId,
        sampleIndex: samples.length + 1,
        playerIndex: decisionPlayer,
        replayStep: step + 1,
        stateHash: hashGameState(state),
        currentBattleTurn: state.currentBattleTurn,
        currentPhase: state.currentPhase,
        currentSubPhase: state.currentSubPhase,
        features: Array.from(extractGameplayFeatures(state, decisionPlayer)),
        searchValue: diagnostics?.score ?? null,
        modelId: config.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
        baseSeed: config.baseSeed ?? null,
        rolloutCount: config.rolloutCount ?? 1,
        selectedCommandType: resolvedCommand.type,
        selectedMacroActionId: diagnostics?.selectedMacroActionId ?? null,
        selectedMacroActionLabel: diagnostics?.selectedMacroActionLabel ?? null,
        principalVariation: diagnostics?.principalVariation ?? [],
      });
    }

    step += 1;
    const result = processCommand(state, resolvedCommand, dice);
    commandHistory.push({
      step,
      command: resolvedCommand,
      actingPlayerIndex: decisionPlayer,
      accepted: result.accepted,
      errorMessages: result.errors.map((entry) => entry.message),
      eventCount: result.events.length,
      battleTurn: result.state.currentBattleTurn,
      phase: result.state.currentPhase,
      subPhase: result.state.currentSubPhase,
      aiDiagnostics: diagnostics,
    });

    if (!result.accepted) {
      return buildEarlyResult(
        'command-rejected',
        result.errors.map((entry) => entry.message).join('; '),
      );
    }

    state = result.state;
  }

  const winnerPlayerIndex = state.winnerPlayerIndex;
  const finalOutcomeByPlayer = {
    0: winnerPlayerIndex === null ? 0 : (winnerPlayerIndex === 0 ? 1 : -1),
    1: winnerPlayerIndex === null ? 0 : (winnerPlayerIndex === 1 ? 1 : -1),
  };

  const replay = createReplay(state.isGameOver ? 'game-over' : 'max-commands');

  const finalizedSamples = samples.map((sample) => ({
    ...sample,
    finalOutcome: finalOutcomeByPlayer[sample.playerIndex] ?? 0,
    finalStateHash: replay.finalStateHash,
    replayMatchId: matchId,
  }));

  return {
    initialState,
    finalState: state,
    commandHistory,
    diceSequence: dice.getSequence(),
    replay,
    samples: finalizedSamples,
    terminatedReason: state.isGameOver ? 'game-over' : 'max-commands',
    errorMessage: null,
  };
}

export function buildPairedGameplayModel(featureWeights, modelId, outputBias = 0) {
  if (featureWeights.length !== GAMEPLAY_FEATURE_DIMENSION) {
    throw new Error(
      `Gameplay model expected ${GAMEPLAY_FEATURE_DIMENSION} feature weights but received ${featureWeights.length}.`,
    );
  }

  const inputSize = GAMEPLAY_FEATURE_DIMENSION;
  const hiddenSize = inputSize * 2;
  const hiddenWeights = new Int8Array(hiddenSize * inputSize);
  const hiddenBiases = new Int16Array(hiddenSize);

  for (let featureIndex = 0; featureIndex < inputSize; featureIndex++) {
    hiddenWeights[(featureIndex * 2 * inputSize) + featureIndex] = 16;
    hiddenWeights[(((featureIndex * 2) + 1) * inputSize) + featureIndex] = -16;
  }

  const outputWeights = new Int8Array(hiddenSize);
  const outputBiases = new Int16Array([
    Math.max(-1024, Math.min(1024, Math.round(outputBias * 24))),
  ]);
  for (let featureIndex = 0; featureIndex < featureWeights.length; featureIndex++) {
    const quantized = Math.max(-120, Math.min(120, Math.round(featureWeights[featureIndex] * 24)));
    outputWeights[featureIndex * 2] = quantized;
    outputWeights[(featureIndex * 2) + 1] = -quantized;
  }

  const model = {
    manifest: {
      modelId,
      modelKind: 'gameplay',
      schemaVersion: 1,
      featureVersion: GAMEPLAY_FEATURE_VERSION,
      weightsChecksum: '',
    },
    inputSize,
    hiddenLayer: {
      inputSize,
      outputSize: hiddenSize,
      weightScale: 16,
      biasScale: 16,
      weights: hiddenWeights,
      biases: hiddenBiases,
    },
    outputLayer: {
      inputSize: hiddenSize,
      outputSize: 1,
      weightScale: 24,
      biasScale: 24,
      weights: outputWeights,
      biases: outputBiases,
    },
  };

  model.manifest.weightsChecksum = hashStableValue({
    hiddenWeights: Array.from(hiddenWeights),
    hiddenBiases: Array.from(hiddenBiases),
    outputWeights: Array.from(outputWeights),
    outputBiases: Array.from(outputBiases),
    hiddenWeightScale: model.hiddenLayer.weightScale,
    hiddenBiasScale: model.hiddenLayer.biasScale,
    outputWeightScale: model.outputLayer.weightScale,
    outputBiasScale: model.outputLayer.biasScale,
  });

  return model;
}

export function saveSerializedModel(filePath, model, metadata = {}) {
  const serialized = serializeNNUEModel(model);
  return writeJson(filePath, {
    ...serialized,
    metadata,
  });
}

export function loadSerializedModel(filePath) {
  const parsed = readJson(filePath);
  const model = deserializeNNUEModel(parsed);
  registerNNUEModel(model);
  return model;
}

function getDecisionPlayerIndexFromState(state) {
  return state.awaitingReaction
    ? (state.activePlayerIndex === 0 ? 1 : 0)
    : state.activePlayerIndex;
}

export function classifyHeadlessResult(result, favoredPlayerIndex) {
  const opponentPlayerIndex = favoredPlayerIndex === 0 ? 1 : 0;

  if (result.terminatedReason === 'game-over') {
    if (result.finalState.winnerPlayerIndex === null) {
      return {
        outcome: 'draw',
        reason: 'game-over',
        responsiblePlayerIndex: null,
      };
    }

    return {
      outcome: result.finalState.winnerPlayerIndex === favoredPlayerIndex
        ? 'favored-win'
        : 'favored-loss',
      reason: 'game-over',
      responsiblePlayerIndex: result.finalState.winnerPlayerIndex,
    };
  }

  if (result.terminatedReason === 'command-rejected') {
    const lastRecord = result.commandHistory[result.commandHistory.length - 1] ?? null;
    const actingPlayerIndex = lastRecord?.actingPlayerIndex ?? null;
    if (actingPlayerIndex === favoredPlayerIndex) {
      return {
        outcome: 'favored-loss',
        reason: 'command-rejected',
        responsiblePlayerIndex: actingPlayerIndex,
      };
    }
    if (actingPlayerIndex === opponentPlayerIndex) {
      return {
        outcome: 'favored-win',
        reason: 'command-rejected',
        responsiblePlayerIndex: actingPlayerIndex,
      };
    }
    return {
      outcome: 'aborted',
      reason: 'command-rejected',
      responsiblePlayerIndex: actingPlayerIndex,
    };
  }

  if (result.terminatedReason === 'max-commands') {
    return {
      outcome: 'timeout',
      reason: 'max-commands',
      responsiblePlayerIndex: null,
    };
  }

  if (
    result.terminatedReason === 'ai-error' ||
    result.terminatedReason === 'no-command-generated' ||
    result.terminatedReason === 'no-ai-controller'
  ) {
    const decisionPlayerIndex = getDecisionPlayerIndexFromState(result.finalState);
    if (decisionPlayerIndex === favoredPlayerIndex) {
      return {
        outcome: 'favored-loss',
        reason: result.terminatedReason,
        responsiblePlayerIndex: decisionPlayerIndex,
      };
    }
    if (decisionPlayerIndex === opponentPlayerIndex) {
      return {
        outcome: 'favored-win',
        reason: result.terminatedReason,
        responsiblePlayerIndex: decisionPlayerIndex,
      };
    }
  }

  return {
    outcome: 'aborted',
    reason: result.terminatedReason,
    responsiblePlayerIndex: null,
  };
}

export function runGateMatches({
  matches,
  timeBudgetMs,
  candidateModelId,
  maxDepthSoft,
  rolloutCount,
  setupFactory = (matchIndex) => createMirroredGateSetupOptions(matchIndex, {
    firstPlayerIndex: matchIndex % 2,
  }),
  onMatchComplete,
}) {
  let engineWins = 0;
  let tacticalWins = 0;
  let draws = 0;
  let aborted = 0;
  let timeouts = 0;
  const results = [];

  for (let matchIndex = 0; matchIndex < matches; matchIndex++) {
    const enginePlayerIndex = matchIndex % 2;
    const aiPlayers = [
      enginePlayerIndex === 0
        ? createEnginePlayerConfig(0, {
          timeBudgetMs,
          nnueModelId: candidateModelId,
          baseSeed: 10_000 + matchIndex,
          ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
          ...(rolloutCount !== undefined ? { rolloutCount } : {}),
        })
        : {
          enabled: true,
          playerIndex: 0,
          strategyTier: AIStrategyTier.Tactical,
        },
      enginePlayerIndex === 1
        ? createEnginePlayerConfig(1, {
          timeBudgetMs,
          nnueModelId: candidateModelId,
          baseSeed: 20_000 + matchIndex,
          ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
          ...(rolloutCount !== undefined ? { rolloutCount } : {}),
        })
        : {
          enabled: true,
          playerIndex: 1,
          strategyTier: AIStrategyTier.Tactical,
        },
    ];

    const result = runHeadlessMatch(
      createInitialStateFromSetupOptions(setupFactory(matchIndex)),
      {
        maxCommands: 1500,
        aiPlayers,
      },
    );
    const classification = classifyHeadlessResult(result, enginePlayerIndex);
    if (classification.outcome === 'favored-win') {
      engineWins += 1;
    } else if (classification.outcome === 'favored-loss') {
      tacticalWins += 1;
    } else if (classification.outcome === 'draw') {
      draws += 1;
    } else if (classification.outcome === 'timeout') {
      timeouts += 1;
    } else {
      aborted += 1;
    }

    results.push({
      matchIndex,
      enginePlayerIndex,
      winnerPlayerIndex: result.finalState.winnerPlayerIndex,
      classifiedOutcome: classification.outcome,
      classifiedReason: classification.reason,
      responsiblePlayerIndex: classification.responsiblePlayerIndex,
      terminatedReason: result.terminatedReason,
      errorMessage: result.errorMessage,
      finalStateHash: result.finalStateHash,
    });

    if (typeof onMatchComplete === 'function') {
      onMatchComplete({
        matchIndex,
        enginePlayerIndex,
        result,
        classification,
        totals: {
          engineWins,
          tacticalWins,
          draws,
          aborted,
          timeouts,
        },
      });
    }
  }

  return {
    engineWins,
    tacticalWins,
    draws,
    aborted,
    timeouts,
    winRate: matches > 0 ? engineWins / matches : 0,
    results,
  };
}
