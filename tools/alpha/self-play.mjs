import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIStrategyTier } from '../../packages/ai/dist/index.js';
import {
  ALPHA_SELFPLAY_ROOT,
  DEFAULT_ALPHA_MODEL_ID,
  createAlphaPlayerConfig,
  createAlphaTrainingSeedModel,
  createAlphaSelfPlaySample,
  createDefaultSetupOptions,
  createEnginePlayerConfig,
  createProgressReporter,
  encodeReplayBufferEntry,
  ensureDir,
  getAlphaModel,
  parseArgs,
  readJson,
  registerAlphaModel,
  registerAlphaModelFromFile,
  runAlphaInstrumentedMatch,
  toInt,
  validateAlphaModel,
  writeJson,
  writeJsonLines,
} from './common.mjs';

function splitCommaSeparated(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
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

function createTacticalPlayerConfig(playerIndex) {
  return {
    enabled: true,
    playerIndex,
    strategyTier: AIStrategyTier.Tactical,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    diagnosticsEnabled: true,
  };
}

function normalizeCurriculum(value) {
  const parsed = splitCommaSeparated(value);
  const allowedModes = new Set(['mirror', 'tactical', 'engine']);
  const normalized = parsed.filter((entry) => allowedModes.has(entry));
  return normalized.length > 0 ? normalized : ['mirror', 'tactical', 'engine'];
}

function resolveSelfPlayModel(args) {
  const explicitModelId = typeof args.model === 'string'
    ? String(args.model)
    : null;
  const modelFile = typeof args['model-file'] === 'string'
    ? path.resolve(process.cwd(), String(args['model-file']))
    : null;

  if (explicitModelId && modelFile) {
    throw new Error('Alpha self-play accepts either --model <model-id> or --model-file <candidate.json>, not both.');
  }

  if (modelFile) {
    const registered = registerAlphaModelFromFile(modelFile);
    validateAlphaModel(registered);
    return {
      modelId: registered.manifest.modelId,
      modelFilePath: modelFile,
      source: 'file',
    };
  }

  const modelId = explicitModelId ?? DEFAULT_ALPHA_MODEL_ID;
  if (!getAlphaModel(modelId)) {
    registerAlphaModel(createAlphaTrainingSeedModel(modelId, {
      trainedAt: new Date().toISOString(),
      datasetName: `alpha-selfplay-bootstrap-${modelId}`,
      datasetSize: 0,
      epochs: 0,
      optimizer: 'adam',
      learningRate: 0,
      notes: 'bootstrap Alpha model registered so self-play can run before first promotion',
    }));
  }

  return {
    modelId,
    modelFilePath: null,
    source: getAlphaModel(modelId) ? 'registry' : 'bootstrap',
  };
}

export function runAlphaSelfPlay(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const matchCount = toInt(args.matches, 8);
  const outDir = args['out-dir']
    ? path.resolve(process.cwd(), String(args['out-dir']))
    : path.resolve(process.cwd(), ALPHA_SELFPLAY_ROOT);
  const modelSelection = resolveSelfPlayModel(args);
  const modelId = modelSelection.modelId;
  const timeBudgetMs = toInt(args['time-budget-ms'], 600);
  const maxSimulations = toInt(args['max-simulations'], 800);
  const maxCommands = toInt(args['max-commands'], 2000);
  const shardSize = toInt(args['shard-size'], 256);
  const curriculum = normalizeCurriculum(args.curriculum ?? 'mirror,tactical,engine');
  const explicitSetupOptions = typeof args.setup === 'string'
    ? readJson(String(args.setup))
    : null;

  ensureDir(outDir);
  ensureDir(path.join(outDir, 'replays'));

  const allSamples = [];
  const matches = [];
  const curriculumCounts = {
    mirror: 0,
    tactical: 0,
    engine: 0,
  };
  const progress = createProgressReporter({
    label: 'alpha-selfplay',
    total: matchCount,
  });

  for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
    const matchId = `alpha-selfplay-${Date.now()}-${matchIndex + 1}`;
    const mode = curriculum[matchIndex % curriculum.length];
    curriculumCounts[mode] += 1;

    const setupOptions = explicitSetupOptions
      ? {
        ...explicitSetupOptions,
        firstPlayerIndex: matchIndex % 2,
      }
      : createDefaultSetupOptions({
        matchIndex,
        firstPlayerIndex: matchIndex % 2,
      });

    const candidatePlayerIndex = matchIndex % 2;
    let aiPlayers;
    if (mode === 'mirror') {
      aiPlayers = [
        createAlphaPlayerConfig(0, {
          alphaModelId: modelId,
          timeBudgetMs,
          maxSimulations,
          baseSeed: 2000 + (matchIndex * 2),
        }),
        createAlphaPlayerConfig(1, {
          alphaModelId: modelId,
          timeBudgetMs,
          maxSimulations,
          baseSeed: 2001 + (matchIndex * 2),
        }),
      ];
    } else if (mode === 'engine') {
      aiPlayers = candidatePlayerIndex === 0
        ? [
          createAlphaPlayerConfig(0, {
            alphaModelId: modelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 3000 + matchIndex,
          }),
          createEnginePlayerConfig(1, {
            timeBudgetMs,
            baseSeed: 4000 + matchIndex,
          }),
        ]
        : [
          createEnginePlayerConfig(0, {
            timeBudgetMs,
            baseSeed: 4000 + matchIndex,
          }),
          createAlphaPlayerConfig(1, {
            alphaModelId: modelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 3000 + matchIndex,
          }),
        ];
    } else {
      aiPlayers = candidatePlayerIndex === 0
        ? [
          createAlphaPlayerConfig(0, {
            alphaModelId: modelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 5000 + matchIndex,
          }),
          createTacticalPlayerConfig(1),
        ]
        : [
          createTacticalPlayerConfig(0),
          createAlphaPlayerConfig(1, {
            alphaModelId: modelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 5000 + matchIndex,
          }),
        ];
    }

    const result = runAlphaInstrumentedMatch({
      matchId,
      setupOptions,
      aiPlayers,
      maxCommands,
      onDecision: ({
        matchId: observedMatchId,
        step,
        state,
        playerIndex,
        config,
        diagnostics,
        command,
        actedUnitIdsBeforeDecision,
        usedQueuedPlan,
      }) => {
        if (config.strategyTier !== AIStrategyTier.Alpha) {
          return null;
        }

        if (usedQueuedPlan) {
          return null;
        }

        if (diagnostics?.tier !== AIStrategyTier.Alpha) {
          return null;
        }

        const sample = createAlphaSelfPlaySample(state, playerIndex, config, {
          actedUnitIds: actedUnitIdsBeforeDecision,
          selectedMacroActionId: diagnostics.selectedMacroActionId,
          selectedCommandType: diagnostics.selectedCommandType ?? command.type ?? null,
          sourceModelId: diagnostics.modelId,
          valueEstimate: diagnostics.valueEstimate,
          rootVisits: diagnostics.rootVisits,
          nodesExpanded: diagnostics.nodesExpanded,
          policyEntropy: diagnostics.policyEntropy,
          searchTimeMs: diagnostics.searchTimeMs,
        });
        if (!sample) return null;

        return {
          ...sample,
          sourceMatchId: observedMatchId,
          sourceStep: step,
          curriculumMode: mode,
        };
      },
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
      curriculumMode: mode,
      replayArtifactPath,
      terminatedReason: result.terminatedReason,
      errorMessage: result.errorMessage,
      sampleCount: persistedRows.length,
      finalStateHash: result.replay.finalStateHash,
    });

    progress.tick(`match ${matchIndex + 1}/${matchCount} mode=${mode} samples=${persistedRows.length} end=${result.terminatedReason}`);
  }

  const shardPaths = [];
  for (let index = 0; index < allSamples.length; index += shardSize) {
    const shardRows = allSamples.slice(index, index + shardSize);
    const shardNumber = Math.floor(index / shardSize) + 1;
    const shardPath = path.join(outDir, `selfplay-shard-${String(shardNumber).padStart(3, '0')}.jsonl`);
    writeJsonLines(shardPath, shardRows);
    shardPaths.push(path.resolve(process.cwd(), shardPath));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'selfplay',
    modelId,
    modelFilePath: modelSelection.modelFilePath,
    modelSource: modelSelection.source,
    matchCount,
    sampleCount: allSamples.length,
    shardPaths,
    matches,
    curriculum,
    curriculumCounts,
    timeBudgetMs,
    maxSimulations,
    maxCommands,
  };

  const manifestPath = writeJson(path.join(outDir, 'manifest.json'), manifest);
  progress.finish(`samples=${allSamples.length} shards=${shardPaths.length}`);

  return {
    outDir,
    manifestPath,
    modelId,
    modelFilePath: modelSelection.modelFilePath,
    modelSource: modelSelection.source,
    matchCount,
    sampleCount: allSamples.length,
    shardCount: shardPaths.length,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  const summary = runAlphaSelfPlay();
  console.log(JSON.stringify(summary, null, 2));
}
