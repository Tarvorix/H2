import fs from 'node:fs';
import path from 'node:path';
import {
  ALPHA_DISTILL_ROOT,
  ALPHA_SELFPLAY_ROOT,
  ALPHA_TRAIN_ROOT,
  createAlphaOptimizer,
  createAlphaTrainableModel,
  createAlphaTrainingSeedModel,
  createProgressReporter,
  disposeAlphaTrainableModel,
  exportTrainedAlphaModel,
  loadAlphaModelFromFile,
  parseArgs,
  readJson,
  readJsonLines,
  serializeAlphaModel,
  toFloat,
  toInt,
  trainAlphaBatch,
  writeJson,
} from './common.mjs';

function splitCommaSeparated(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleRows(rows, seed) {
  const shuffled = [...rows];
  const nextRandom = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function collectDatasetInputs(args) {
  const explicitInputs = typeof args.input === 'string'
    ? splitCommaSeparated(args.input)
    : [];

  if (explicitInputs.length > 0) {
    return explicitInputs;
  }

  const defaults = [
    path.join(ALPHA_DISTILL_ROOT, 'manifest.json'),
    path.join(ALPHA_SELFPLAY_ROOT, 'manifest.json'),
  ];
  return defaults.filter((candidate) => fs.existsSync(path.resolve(process.cwd(), candidate)));
}

function expandInputFiles(inputSpecs) {
  const expanded = [];
  for (const spec of inputSpecs) {
    const absolutePath = path.resolve(process.cwd(), spec);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Alpha training input "${spec}" does not exist.`);
    }

    if (absolutePath.endsWith('.jsonl')) {
      expanded.push(absolutePath);
      continue;
    }

    const manifest = readJson(absolutePath);
    if (!Array.isArray(manifest.shardPaths)) {
      throw new Error(`Alpha training manifest "${spec}" is missing "shardPaths".`);
    }
    expanded.push(...manifest.shardPaths.map((entry) => path.resolve(process.cwd(), String(entry))));
  }

  return [...new Set(expanded)];
}

function validateRows(rows) {
  if (rows.length === 0) {
    throw new Error('Alpha training requires at least one replay-buffer row.');
  }

  for (const row of rows) {
    if (!Array.isArray(row.encodedState) || row.encodedState.length === 0) {
      throw new Error('Alpha training row is missing encodedState tokens.');
    }
    if (!Array.isArray(row.encodedActions) || row.encodedActions.length === 0) {
      throw new Error('Alpha training row is missing encodedActions.');
    }
    if (!Array.isArray(row.policyTarget) || row.policyTarget.length !== row.encodedActions.length) {
      throw new Error('Alpha training row has a policyTarget/action length mismatch.');
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const inputSpecs = collectDatasetInputs(args);
const inputFiles = expandInputFiles(inputSpecs);
const rows = readJsonLines(inputFiles);
validateRows(rows);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = args['out-dir']
  ? path.resolve(process.cwd(), String(args['out-dir']))
  : path.resolve(process.cwd(), ALPHA_TRAIN_ROOT);
const epochs = toInt(args.epochs, 4);
const batchSize = toInt(args['batch-size'], 8);
const learningRate = toFloat(args['learning-rate'], 1e-4);
const weightDecay = toFloat(args['weight-decay'], 1e-5);
const entropyRegularization = toFloat(args['entropy-regularization'], 5e-4);
const policyWeight = toFloat(args['policy-weight'], 1);
const valueWeight = toFloat(args['value-weight'], 1);
const vpWeight = toFloat(args['vp-weight'], 0.35);
const tacticalSwingWeight = toFloat(args['tactical-swing-weight'], 0.35);
const shuffleSeed = toInt(args.seed, 1337);
const datasetName = typeof args['dataset-name'] === 'string'
  ? String(args['dataset-name'])
  : `alpha-train-${timestamp}`;
const candidateModelId = typeof args['model-id'] === 'string'
  ? String(args['model-id'])
  : `alpha-candidate-${timestamp}`;
const baseModel = typeof args.model === 'string'
  ? loadAlphaModelFromFile(String(args.model))
  : createAlphaTrainingSeedModel(candidateModelId, {
    trainedAt: new Date().toISOString(),
    datasetName,
    datasetSize: rows.length,
    epochs,
    optimizer: 'adam',
    learningRate,
    notes: 'initial alpha training seed model',
  });

const teacherModelIds = [...new Set(rows
  .map((row) => row.sourceModelId)
  .filter((value) => typeof value === 'string' && value.length > 0))];
const trainingMetadata = {
  trainedAt: new Date().toISOString(),
  datasetName,
  datasetSize: rows.length,
  epochs,
  optimizer: 'adam',
  learningRate,
  teacherModelId: teacherModelIds.length === 1 ? teacherModelIds[0] : null,
  selfPlayGames: new Set(rows
    .filter((row) => row.source === 'selfplay')
    .map((row) => row.sourceMatchId)
    .filter((value) => typeof value === 'string' && value.length > 0)).size,
  notes: [
    `batchSize=${batchSize}`,
    `weightDecay=${weightDecay}`,
    `entropyRegularization=${entropyRegularization}`,
    `policyWeight=${policyWeight}`,
    `valueWeight=${valueWeight}`,
    `vpWeight=${vpWeight}`,
    `tacticalSwingWeight=${tacticalSwingWeight}`,
    `shuffleSeed=${shuffleSeed}`,
  ].join(' '),
};

const optimizer = createAlphaOptimizer(learningRate);
const trainable = createAlphaTrainableModel(baseModel);
trainable.manifest = {
  ...trainable.manifest,
  modelId: candidateModelId,
};

const batchesPerEpoch = Math.max(1, Math.ceil(rows.length / batchSize));
const progress = createProgressReporter({
  label: 'alpha-train',
  total: epochs * batchesPerEpoch,
});
const history = [];

try {
  for (let epochIndex = 0; epochIndex < epochs; epochIndex++) {
    const shuffledRows = shuffleRows(rows, shuffleSeed + epochIndex);
    const totals = {
      totalLoss: 0,
      policyLoss: 0,
      valueLoss: 0,
      vpLoss: 0,
      tacticalSwingLoss: 0,
      entropyLoss: 0,
      weightDecayLoss: 0,
    };
    let batchCount = 0;

    for (let start = 0; start < shuffledRows.length; start += batchSize) {
      const batchRows = shuffledRows.slice(start, start + batchSize);
      const losses = trainAlphaBatch(trainable, {
        states: batchRows.map((row) => row.encodedState),
        actions: batchRows.map((row) => row.encodedActions),
        policyTargets: batchRows.map((row) => row.policyTarget),
        valueTargets: batchRows.map((row) => Number(row.valueTarget ?? row.finalOutcome ?? 0)),
        vpDeltaTargets: batchRows.map((row) => Number(row.vpDeltaTarget ?? 0)),
        tacticalSwingTargets: batchRows.map((row) => Number(row.tacticalSwingTarget ?? 0)),
      }, optimizer, {
        weightDecay,
        entropyRegularization,
        policyWeight,
        valueWeight,
        vpWeight,
        tacticalSwingWeight,
      });

      totals.totalLoss += losses.totalLoss;
      totals.policyLoss += losses.policyLoss;
      totals.valueLoss += losses.valueLoss;
      totals.vpLoss += losses.vpLoss;
      totals.tacticalSwingLoss += losses.tacticalSwingLoss;
      totals.entropyLoss += losses.entropyLoss;
      totals.weightDecayLoss += losses.weightDecayLoss;
      batchCount += 1;
      progress.tick(`epoch ${epochIndex + 1}/${epochs} loss=${losses.totalLoss.toFixed(4)}`);
    }

    history.push({
      epoch: epochIndex + 1,
      totalLoss: totals.totalLoss / batchCount,
      policyLoss: totals.policyLoss / batchCount,
      valueLoss: totals.valueLoss / batchCount,
      vpLoss: totals.vpLoss / batchCount,
      tacticalSwingLoss: totals.tacticalSwingLoss / batchCount,
      entropyLoss: totals.entropyLoss / batchCount,
      weightDecayLoss: totals.weightDecayLoss / batchCount,
    });
  }

  const trainedModel = exportTrainedAlphaModel(trainable, trainingMetadata);
  const serializedModel = serializeAlphaModel(trainedModel);

  const modelFileName = typeof args.out === 'string'
    ? String(args.out)
    : path.join(outDir, `${candidateModelId}.json`);
  const summaryFileName = typeof args.summary === 'string'
    ? String(args.summary)
    : path.join(outDir, `${candidateModelId}.summary.json`);

  const modelPath = writeJson(modelFileName, serializedModel);
  const summaryPath = writeJson(summaryFileName, {
    candidateModelId,
    inputSpecs,
    inputFiles,
    sampleCount: rows.length,
    epochs,
    batchSize,
    learningRate,
    weightDecay,
    entropyRegularization,
    policyWeight,
    valueWeight,
    vpWeight,
    tacticalSwingWeight,
    shuffleSeed,
    trainingMetadata,
    history,
    modelPath,
  });

  progress.finish(`epochs=${epochs} finalLoss=${(history[history.length - 1]?.totalLoss ?? 0).toFixed(4)}`);

  console.log(JSON.stringify({
    outDir,
    candidateModelId,
    sampleCount: rows.length,
    modelPath,
    summaryPath,
    epochs,
    batchSize,
  }, null, 2));
} finally {
  optimizer.dispose?.();
  disposeAlphaTrainableModel(trainable);
}
