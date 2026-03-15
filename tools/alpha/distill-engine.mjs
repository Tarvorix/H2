import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FixedDiceProvider,
  hashGameState,
  processCommand,
} from '../../packages/engine/dist/index.js';
import {
  buildFallbackCommand,
  createReplayArtifact,
  loadReplayArtifact,
} from '../../packages/headless/dist/index.js';
import { generatePhaseControlCommand } from '../../packages/ai/dist/index.js';
import {
  ALPHA_DISTILL_ROOT,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  RecordingDiceProvider,
  createInitialStateFromSetupOptions,
  createDefaultSetupOptions,
  createDistillSample,
  createEnginePlayerConfig,
  createProgressReporter,
  encodeReplayBufferEntry,
  ensureDir,
  parseArgs,
  readJson,
  toInt,
  writeJson,
  writeJsonLines,
} from './common.mjs';
import { searchAlphaTeacherBestAction } from './teacher-engine-search.mjs';

function splitCommaSeparated(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function persistReplayBufferEntry(entry, replayArtifactPath, sampleIndex) {
  const encoded = encodeReplayBufferEntry(entry);
  const {
    state: _state,
    actions: _actions,
    ...persisted
  } = encoded;

  return {
    ...persisted,
    replayArtifactPath,
    sampleIndex,
  };
}

function normalizeFinalOutcome(finalState, rootPlayerIndex) {
  const winnerPlayerIndex = finalState?.winnerPlayerIndex ?? null;
  if (winnerPlayerIndex === null) {
    return 0;
  }
  return winnerPlayerIndex === rootPlayerIndex ? 1 : -1;
}

function collectReplayInputSpecs(args) {
  if (typeof args.input === 'string') {
    return splitCommaSeparated(args.input);
  }

  const manifestSpecs = typeof args['input-manifest'] === 'string'
    ? splitCommaSeparated(args['input-manifest'])
    : [];
  const replaySpecs = typeof args['input-replay'] === 'string'
    ? splitCommaSeparated(args['input-replay'])
    : [];

  return [...manifestSpecs, ...replaySpecs];
}

function inferReplayBaseSeed(matchIndex, playerIndex) {
  return 1000 + (matchIndex * 2) + playerIndex;
}

function parseReplaySources(inputSpecs) {
  const sources = [];

  for (const spec of inputSpecs) {
    const absolutePath = path.resolve(process.cwd(), spec);
    const parsed = readJson(absolutePath);

    if (
      parsed
      && typeof parsed === 'object'
      && Array.isArray(parsed.matches)
    ) {
      const manifest = parsed;
      manifest.matches.forEach((match, matchIndex) => {
        if (!match || typeof match !== 'object') {
          return;
        }

        const replayArtifactPath = typeof match.replayArtifactPath === 'string'
          ? path.resolve(process.cwd(), match.replayArtifactPath)
          : null;
        if (!replayArtifactPath) {
          return;
        }

        sources.push({
          sourceType: 'manifest',
          manifestPath: absolutePath,
          manifestMatchIndex: matchIndex,
          manifestModelId: typeof manifest.modelId === 'string' ? manifest.modelId : null,
          manifestTimeBudgetMs: typeof manifest.timeBudgetMs === 'number' ? manifest.timeBudgetMs : null,
          manifestMaxDepthSoft: typeof manifest.maxDepthSoft === 'number' ? manifest.maxDepthSoft : null,
          manifestRolloutCount: typeof manifest.rolloutCount === 'number' ? manifest.rolloutCount : null,
          matchId: typeof match.matchId === 'string'
            ? match.matchId
            : `imported-replay-${sources.length + 1}`,
          replayArtifactPath,
          terminatedReason: typeof match.terminatedReason === 'string' ? match.terminatedReason : null,
          errorMessage: typeof match.errorMessage === 'string' ? match.errorMessage : null,
        });
      });
      continue;
    }

    if (
      parsed
      && typeof parsed === 'object'
      && parsed.schemaVersion === 1
      && Array.isArray(parsed.steps)
      && parsed.initialState
    ) {
      sources.push({
        sourceType: 'replay',
        manifestPath: null,
        manifestMatchIndex: 0,
        manifestModelId: null,
        manifestTimeBudgetMs: null,
        manifestMaxDepthSoft: null,
        manifestRolloutCount: null,
        matchId: typeof parsed.metadata?.matchId === 'string'
          ? parsed.metadata.matchId
          : `imported-replay-${sources.length + 1}`,
        replayArtifactPath: absolutePath,
        terminatedReason: typeof parsed.metadata?.terminatedReason === 'string'
          ? parsed.metadata.terminatedReason
          : null,
        errorMessage: null,
      });
      continue;
    }

    throw new Error(
      `Alpha distill input "${spec}" is neither a replay artifact nor a selfplay manifest with "matches[].replayArtifactPath".`,
    );
  }

  return sources;
}

function createImportedTeacherConfig(args, source, playerIndex) {
  const explicitModelId = typeof args.model === 'string'
    ? String(args.model)
    : null;
  const explicitTimeBudgetMs = args['time-budget-ms'] !== undefined
    ? toInt(args['time-budget-ms'], 250)
    : null;
  const explicitMaxDepthSoft = args['max-depth-soft'] !== undefined
    ? toInt(args['max-depth-soft'], 4)
    : null;
  const explicitRolloutCount = args['rollout-count'] !== undefined
    ? toInt(args['rollout-count'], 1)
    : null;
  const explicitBaseSeed = args['base-seed'] !== undefined
    ? toInt(args['base-seed'], 1337 + playerIndex)
    : null;

  return createEnginePlayerConfig(playerIndex, {
    nnueModelId: explicitModelId ?? source.manifestModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    timeBudgetMs: explicitTimeBudgetMs ?? source.manifestTimeBudgetMs ?? 250,
    baseSeed: explicitBaseSeed ?? inferReplayBaseSeed(source.manifestMatchIndex, playerIndex),
    ...(explicitMaxDepthSoft !== null || source.manifestMaxDepthSoft !== null
      ? { maxDepthSoft: explicitMaxDepthSoft ?? source.manifestMaxDepthSoft }
      : {}),
    ...(explicitRolloutCount !== null || source.manifestRolloutCount !== null
      ? { rolloutCount: explicitRolloutCount ?? source.manifestRolloutCount }
      : {}),
  });
}

function getDecisionPlayerIndex(state) {
  return state.awaitingReaction
    ? (state.activePlayerIndex === 0 ? 1 : 0)
    : state.activePlayerIndex;
}

function createTeacherContext() {
  return {
    actedUnitIds: new Set(),
    queuedPlan: [],
    lastPhase: null,
    lastSubPhase: null,
  };
}

function maybeResetTeacherContext(context, state) {
  if (context.lastPhase !== state.currentPhase || context.lastSubPhase !== state.currentSubPhase) {
    context.actedUnitIds.clear();
    context.queuedPlan = [];
    context.lastPhase = state.currentPhase;
    context.lastSubPhase = state.currentSubPhase;
  }
}

function consumeQueuedPlan(context, state) {
  const nextStep = context.queuedPlan[0];
  if (!nextStep) return null;

  const matches = (
    nextStep.expectedStateFingerprint === hashGameState(state)
    && nextStep.phase === state.currentPhase
    && nextStep.subPhase === state.currentSubPhase
    && nextStep.decisionOwner === getDecisionPlayerIndex(state)
  );
  if (!matches) {
    context.queuedPlan = [];
    return null;
  }

  context.queuedPlan = context.queuedPlan.slice(1);
  return nextStep.command;
}

function createReplayFromHistory(initialState, commandHistory, diceSequence, matchId, terminatedReason) {
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

function runFastDistillMatch({
  matchId,
  setupOptions,
  aiPlayers,
  maxCommands = 2000,
  fallbackTimeBudgetMs = 250,
  fallbackRolloutCount = 1,
  fallbackMaxDepthSoft = null,
}) {
  const initialState = createInitialStateFromSetupOptions(setupOptions);
  const configByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, config]));
  const contextByPlayer = new Map(aiPlayers.map((config) => [config.playerIndex, createTeacherContext()]));
  const dice = new RecordingDiceProvider();
  const commandHistory = [];
  const observed = [];
  let state = initialState;
  let step = 0;

  const buildEarlyResult = (terminatedReason, errorMessage) => {
    const replay = createReplayFromHistory(
      initialState,
      commandHistory,
      dice.getSequence(),
      matchId,
      terminatedReason,
    );
    return {
      initialState,
      finalState: state,
      commandHistory,
      diceSequence: dice.getSequence(),
      replay,
      observed: observed.map((entry) => ({
        ...entry,
        finalOutcome: normalizeFinalOutcome(state, entry.rootPlayerIndex),
        finalStateHash: replay.finalStateHash,
      })),
      terminatedReason,
      errorMessage,
    };
  };

  while (step < maxCommands && !state.isGameOver) {
    const decisionPlayer = getDecisionPlayerIndex(state);
    const config = configByPlayer.get(decisionPlayer);
    const context = contextByPlayer.get(decisionPlayer);
    if (!config || !context || !config.enabled) {
      return buildEarlyResult('no-ai-controller', null);
    }

    maybeResetTeacherContext(context, state);
    const actedUnitIdsBefore = new Set(context.actedUnitIds);
    const queuedCommand = consumeQueuedPlan(context, state);
    const phaseControlCommand = generatePhaseControlCommand(state, decisionPlayer);

    let command = null;
    let diagnostics = null;
    let pendingObservedSample = null;
    if (queuedCommand) {
      command = queuedCommand;
    } else if (phaseControlCommand) {
      command = phaseControlCommand;
    } else {
      let search = null;
      try {
        search = searchAlphaTeacherBestAction(state, config, context.actedUnitIds);
      } catch (error) {
        return buildEarlyResult(
          'ai-error',
          error instanceof Error ? error.message : String(error),
        );
      }

      diagnostics = search.diagnostics;
      if (search.bestAction) {
        pendingObservedSample = createDistillSample(state, decisionPlayer, config, {
          actedUnitIds: actedUnitIdsBefore,
          actions: search.rootActions,
          selectedMacroActionId: search.bestAction.id,
          searchScore: search.score ?? 0,
          sourceModelId: search.diagnostics?.modelId ?? config.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
        });

        context.queuedPlan = search.queuedPlan;
        search.bestAction.actorIds.forEach((actorId) => context.actedUnitIds.add(actorId));
        command = search.bestAction.commands[0] ?? null;
      }
    }

    const fallbackCommand = buildFallbackCommand(state);
    const resolvedCommand = command ?? fallbackCommand;
    if (!resolvedCommand) {
      return buildEarlyResult('no-command-generated', null);
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
      return buildEarlyResult(
        'command-rejected',
        result.errors.map((entry) => entry.message).join('; '),
      );
    }

    if (pendingObservedSample && !recoveredWithFallback) {
      observed.push({
        ...pendingObservedSample,
        sourceMatchId: matchId,
        sourceStep: step,
        teacherTimeBudgetMs: config.timeBudgetMs ?? fallbackTimeBudgetMs,
        teacherRolloutCount: config.rolloutCount ?? fallbackRolloutCount,
        teacherMaxDepthSoft: config.maxDepthSoft ?? fallbackMaxDepthSoft,
      });
    }

    state = result.state;
  }

  const replay = createReplayFromHistory(
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
      finalOutcome: normalizeFinalOutcome(state, entry.rootPlayerIndex),
      finalStateHash: replay.finalStateHash,
    })),
    terminatedReason: state.isGameOver ? 'game-over' : 'max-commands',
    errorMessage: null,
  };
}

function importReplaySamples(args, outDir, shardSize, inputSpecs) {
  const replaySources = parseReplaySources(inputSpecs)
    .filter((source) => source.terminatedReason !== 'ai-error' && source.terminatedReason !== 'no-ai-controller');

  const allSamples = [];
  const matches = [];
  const progress = createProgressReporter({
    label: 'alpha-distill',
    total: replaySources.length,
  });

  for (const source of replaySources) {
    const artifact = loadReplayArtifact(source.replayArtifactPath);
    const dice = new FixedDiceProvider([...artifact.diceSequence]);
    const replayArtifactPath = path.resolve(process.cwd(), source.replayArtifactPath);
    let state = artifact.initialState;
    const observed = [];

    for (let stepIndex = 0; stepIndex < artifact.steps.length; stepIndex++) {
      const replayStep = artifact.steps[stepIndex];
      const playerIndex = typeof replayStep.actingPlayerIndex === 'number'
        ? replayStep.actingPlayerIndex
        : (state.awaitingReaction ? (state.activePlayerIndex === 0 ? 1 : 0) : state.activePlayerIndex);
      const teacherConfig = createImportedTeacherConfig(args, source, playerIndex);
      const sample = createDistillSample(state, playerIndex, teacherConfig);
      if (sample) {
        observed.push({
          ...sample,
          sourceMatchId: source.matchId,
          sourceStep: replayStep.step ?? (stepIndex + 1),
          teacherTimeBudgetMs: teacherConfig.timeBudgetMs ?? source.manifestTimeBudgetMs ?? 250,
          teacherRolloutCount: teacherConfig.rolloutCount ?? source.manifestRolloutCount ?? 1,
          teacherMaxDepthSoft: teacherConfig.maxDepthSoft ?? source.manifestMaxDepthSoft ?? null,
          finalOutcome: normalizeFinalOutcome(artifact.finalState, sample.rootPlayerIndex),
          finalStateHash: artifact.finalStateHash,
        });
      }

      const result = processCommand(state, replayStep.command, dice);
      const actualStateHash = hashGameState(result.state);
      if (result.accepted !== replayStep.accepted) {
        throw new Error(
          `Replay acceptance mismatch while importing "${source.replayArtifactPath}" at step ${stepIndex + 1}.`,
        );
      }
      if (actualStateHash !== replayStep.stateHash) {
        throw new Error(
          `Replay state hash mismatch while importing "${source.replayArtifactPath}" at step ${stepIndex + 1}.`,
        );
      }
      state = result.state;
    }

    if (hashGameState(state) !== artifact.finalStateHash) {
      throw new Error(`Replay final hash mismatch while importing "${source.replayArtifactPath}".`);
    }

    const persistedRows = observed.map((entry, observedIndex) => persistReplayBufferEntry(
      entry,
      replayArtifactPath,
      allSamples.length + observedIndex + 1,
    ));
    allSamples.push(...persistedRows);

    matches.push({
      matchId: source.matchId,
      replayArtifactPath,
      terminatedReason: source.terminatedReason,
      errorMessage: source.errorMessage,
      sampleCount: persistedRows.length,
      finalStateHash: artifact.finalStateHash,
      sourceManifestPath: source.manifestPath,
      sourceType: source.sourceType,
      sourceManifestMatchIndex: source.manifestMatchIndex,
    });

    progress.tick(`import ${source.matchId} samples=${persistedRows.length} end=${source.terminatedReason ?? 'unknown'}`);
  }

  const shardPaths = [];
  for (let index = 0; index < allSamples.length; index += shardSize) {
    const shardRows = allSamples.slice(index, index + shardSize);
    const shardNumber = Math.floor(index / shardSize) + 1;
    const shardPath = path.join(outDir, `distill-shard-${String(shardNumber).padStart(3, '0')}.jsonl`);
    writeJsonLines(shardPath, shardRows);
    shardPaths.push(path.resolve(process.cwd(), shardPath));
  }

  const teacherModelIds = [...new Set(matches
    .map((match) => {
      const row = allSamples.find((sample) => sample.sourceMatchId === match.matchId);
      return typeof row?.sourceModelId === 'string' ? row.sourceModelId : null;
    })
    .filter((value) => typeof value === 'string' && value.length > 0))];
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'distill',
    importMode: 'existing-replays',
    teacherModelId: teacherModelIds.length === 1 ? teacherModelIds[0] : null,
    teacherModelIds,
    matchCount: matches.length,
    sampleCount: allSamples.length,
    shardPaths,
    matches,
    inputSpecs: inputSpecs.map((spec) => path.resolve(process.cwd(), spec)),
  };

  const manifestPath = writeJson(path.join(outDir, 'manifest.json'), manifest);
  progress.finish(`samples=${allSamples.length} shards=${shardPaths.length}`);

  return {
    outDir,
    manifestPath,
    teacherModelId: manifest.teacherModelId,
    teacherModelIds,
    matchCount: matches.length,
    sampleCount: allSamples.length,
    shardCount: shardPaths.length,
    importMode: 'existing-replays',
  };
}

function rerunTeacherMatches(args, outDir, shardSize) {
  const matchCount = toInt(args.matches, 6);
  const modelId = typeof args.model === 'string'
    ? String(args.model)
    : DEFAULT_GAMEPLAY_NNUE_MODEL_ID;
  const timeBudgetMs = toInt(args['time-budget-ms'], 250);
  const maxCommands = toInt(args['max-commands'], 2000);
  const maxDepthSoft = args['max-depth-soft'] !== undefined
    ? toInt(args['max-depth-soft'], 4)
    : undefined;
  const rolloutCount = args['rollout-count'] !== undefined
    ? toInt(args['rollout-count'], 1)
    : undefined;
  const explicitSetupOptions = typeof args.setup === 'string'
    ? readJson(String(args.setup))
    : null;

  const allSamples = [];
  const matches = [];
  const progress = createProgressReporter({
    label: 'alpha-distill',
    total: matchCount,
  });

  for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
    const matchId = `alpha-distill-${Date.now()}-${matchIndex + 1}`;
    const setupOptions = explicitSetupOptions
      ? {
        ...explicitSetupOptions,
        firstPlayerIndex: matchIndex % 2,
      }
      : createDefaultSetupOptions({
        matchIndex,
        firstPlayerIndex: matchIndex % 2,
      });

    const result = runFastDistillMatch({
      matchId,
      setupOptions,
      aiPlayers: [
        createEnginePlayerConfig(0, {
          timeBudgetMs,
          nnueModelId: modelId,
          baseSeed: 1000 + (matchIndex * 2),
          ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
          ...(rolloutCount !== undefined ? { rolloutCount } : {}),
        }),
        createEnginePlayerConfig(1, {
          timeBudgetMs,
          nnueModelId: modelId,
          baseSeed: 1001 + (matchIndex * 2),
          ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
          ...(rolloutCount !== undefined ? { rolloutCount } : {}),
        }),
      ],
      maxCommands,
      fallbackTimeBudgetMs: timeBudgetMs,
      fallbackRolloutCount: rolloutCount ?? 1,
      fallbackMaxDepthSoft: maxDepthSoft ?? null,
    });

    const replayPath = path.join(outDir, 'replays', `${matchId}.json`);
    writeJson(replayPath, result.replay);
    const replayArtifactPath = path.resolve(process.cwd(), replayPath);

    const persistedRows = result.observed.map((entry, observedIndex) => persistReplayBufferEntry(
      entry,
      replayArtifactPath,
      allSamples.length + observedIndex + 1,
    ));
    allSamples.push(...persistedRows);

    matches.push({
      matchId,
      replayArtifactPath,
      terminatedReason: result.terminatedReason,
      errorMessage: result.errorMessage,
      sampleCount: persistedRows.length,
      finalStateHash: result.replay.finalStateHash,
    });

    progress.tick(`match ${matchIndex + 1}/${matchCount} samples=${persistedRows.length} end=${result.terminatedReason}`);
  }

  const shardPaths = [];
  for (let index = 0; index < allSamples.length; index += shardSize) {
    const shardRows = allSamples.slice(index, index + shardSize);
    const shardNumber = Math.floor(index / shardSize) + 1;
    const shardPath = path.join(outDir, `distill-shard-${String(shardNumber).padStart(3, '0')}.jsonl`);
    writeJsonLines(shardPath, shardRows);
    shardPaths.push(path.resolve(process.cwd(), shardPath));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'distill',
    importMode: 'rerun',
    teacherModelId: modelId,
    matchCount,
    sampleCount: allSamples.length,
    shardPaths,
    matches,
    timeBudgetMs,
    maxCommands,
    maxDepthSoft: maxDepthSoft ?? null,
    rolloutCount: rolloutCount ?? null,
  };

  const manifestPath = writeJson(path.join(outDir, 'manifest.json'), manifest);
  progress.finish(`samples=${allSamples.length} shards=${shardPaths.length}`);

  return {
    outDir,
    manifestPath,
    teacherModelId: modelId,
    matchCount,
    sampleCount: allSamples.length,
    shardCount: shardPaths.length,
    importMode: 'rerun',
  };
}

export function distillEngineTeacherData(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const outDir = args['out-dir']
    ? path.resolve(process.cwd(), String(args['out-dir']))
    : path.resolve(process.cwd(), ALPHA_DISTILL_ROOT);
  const shardSize = toInt(args['shard-size'], 256);
  const inputSpecs = collectReplayInputSpecs(args);

  ensureDir(outDir);
  ensureDir(path.join(outDir, 'replays'));

  if (inputSpecs.length > 0) {
    return importReplaySamples(args, outDir, shardSize, inputSpecs);
  }

  return rerunTeacherMatches(args, outDir, shardSize);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const summary = distillEngineTeacherData();
  console.log(JSON.stringify(summary, null, 2));
}
