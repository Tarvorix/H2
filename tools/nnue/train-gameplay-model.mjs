import path from 'node:path';
import {
  createProgressReporter,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  GAMEPLAY_FEATURE_DIMENSION,
  buildPairedGameplayModel,
  parseArgs,
  readJsonLines,
  saveSerializedModel,
  toFloat,
  toInt,
  writeJson,
} from './common.mjs';

const DEFAULT_FEATURE_WEIGHTS = [
  1.4,
  1.5,
  1.1,
  1.5,
  1.4,
  0.9,
  1.1,
  0.6,
  0.8,
  1.0,
  0.5,
  0.5,
  0.7,
  0.9,
  0.8,
  0.5,
  0.6,
  0.9,
  0.6,
  0.7,
  1.2,
  0.9,
  0.7,
  0.4,
  0.3,
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleSamples(samples, seed) {
  const shuffled = [...samples];
  const nextRandom = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getSampleTarget(sample) {
  return clamp(
    ((sample.searchValue ?? 0) / 120) * 0.25 + (sample.finalOutcome * 0.75),
    -1,
    1,
  );
}

function scoreSample(sample, weights, bias) {
  return sample.features.reduce(
    (sum, feature, index) => sum + (weights[index] * feature),
    bias,
  );
}

function computeMeanAbsoluteError(samples, weights, bias) {
  if (samples.length === 0) return null;

  const absoluteError = samples.reduce((sum, sample) => {
    const error = getSampleTarget(sample) - scoreSample(sample, weights, bias);
    return sum + Math.abs(error);
  }, 0);

  return absoluteError / samples.length;
}

function createPriorWeights(dimension) {
  const priorWeights = DEFAULT_FEATURE_WEIGHTS.slice(0, dimension);
  while (priorWeights.length < dimension) {
    priorWeights.push(0);
  }
  return priorWeights;
}

function splitSamples(samples, validationSplit, shuffleSeed) {
  if (validationSplit <= 0 || samples.length < 2) {
    return {
      trainingSamples: [...samples],
      validationSamples: [],
    };
  }

  const shuffledSamples = shuffleSamples(samples, shuffleSeed);
  const validationCount = Math.min(
    samples.length - 1,
    Math.max(1, Math.round(samples.length * validationSplit)),
  );

  return {
    validationSamples: shuffledSamples.slice(0, validationCount),
    trainingSamples: shuffledSamples.slice(validationCount),
  };
}

function validateGameplaySamples(samples) {
  if (samples.length === 0) {
    throw new Error('No samples were provided to the gameplay trainer.');
  }

  const dimension = samples[0].features.length;
  if (dimension !== GAMEPLAY_FEATURE_DIMENSION) {
    throw new Error(
      `Gameplay trainer expected ${GAMEPLAY_FEATURE_DIMENSION} features per sample but received ${dimension}. Regenerate self-play data with the current feature extractor.`,
    );
  }

  for (const sample of samples) {
    if (sample.features.length !== dimension) {
      throw new Error('Gameplay training samples use inconsistent feature dimensions.');
    }
  }
}

function trainWeights(samples, {
  epochs,
  learningRate,
  l2,
  validationSplit,
  patience,
  minDelta,
  shuffleSeed,
  onEpochComplete,
}) {
  validateGameplaySamples(samples);

  const { trainingSamples, validationSamples } = splitSamples(samples, validationSplit, shuffleSeed);
  const dimension = trainingSamples[0].features.length;
  const priorWeights = createPriorWeights(dimension);
  const weights = [...priorWeights];
  let bias = 0;
  let bestWeights = [...weights];
  let bestBias = bias;
  let bestEpoch = 0;
  let bestMeanAbsoluteError = Number.POSITIVE_INFINITY;
  let epochsWithoutImprovement = 0;
  let epochsCompleted = 0;
  let stoppedEarly = false;
  const history = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const epochSamples = shuffleSamples(trainingSamples, shuffleSeed + epoch + 1);

    for (const sample of epochSamples) {
      const features = sample.features;
      const target = getSampleTarget(sample);
      const prediction = scoreSample(sample, weights, bias);
      const error = target - prediction;

      for (let index = 0; index < dimension; index++) {
        weights[index] += (learningRate * error * features[index])
          - (learningRate * l2 * (weights[index] - priorWeights[index]));
      }
      bias += (learningRate * error) - (learningRate * l2 * bias * 0.25);
    }

    const trainMeanAbsoluteError = computeMeanAbsoluteError(trainingSamples, weights, bias);
    const validationMeanAbsoluteError = computeMeanAbsoluteError(validationSamples, weights, bias);
    const monitoredMeanAbsoluteError = validationMeanAbsoluteError ?? trainMeanAbsoluteError;
    const improved = monitoredMeanAbsoluteError !== null
      && (bestEpoch === 0 || monitoredMeanAbsoluteError < (bestMeanAbsoluteError - minDelta));

    epochsCompleted = epoch + 1;
    history.push({
      epoch: epoch + 1,
      trainMeanAbsoluteError,
      validationMeanAbsoluteError,
    });

    if (improved) {
      bestWeights = [...weights];
      bestBias = bias;
      bestEpoch = epoch + 1;
      bestMeanAbsoluteError = monitoredMeanAbsoluteError;
      epochsWithoutImprovement = 0;
    } else {
      epochsWithoutImprovement += 1;
    }

    if (typeof onEpochComplete === 'function') {
      onEpochComplete({
        epoch: epoch + 1,
        epochs,
        trainMeanAbsoluteError,
        validationMeanAbsoluteError,
        bestEpoch,
        bestMeanAbsoluteError,
      });
    }

    if (validationSamples.length > 0 && epochsWithoutImprovement >= patience) {
      stoppedEarly = true;
      break;
    }
  }

  const finalEpochMetrics = history[history.length - 1] ?? null;

  return {
    weights: validationSamples.length > 0 ? bestWeights : weights,
    bias: validationSamples.length > 0 ? bestBias : bias,
    trainingSampleCount: trainingSamples.length,
    validationSampleCount: validationSamples.length,
    epochsCompleted,
    bestEpoch: validationSamples.length > 0 ? bestEpoch : epochsCompleted,
    stoppedEarly,
    bestMeanAbsoluteError: validationSamples.length > 0
      ? bestMeanAbsoluteError
      : (finalEpochMetrics?.trainMeanAbsoluteError ?? null),
    finalTrainingMeanAbsoluteError: finalEpochMetrics?.trainMeanAbsoluteError ?? null,
    finalValidationMeanAbsoluteError: finalEpochMetrics?.validationMeanAbsoluteError ?? null,
    history,
  };
}

const args = parseArgs(process.argv.slice(2));
const inputArg = args.input;
const inputs = Array.isArray(inputArg)
  ? inputArg
  : typeof inputArg === 'string'
    ? inputArg.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [];
if (inputs.length === 0) {
  throw new Error('Usage: node tools/nnue/train-gameplay-model.mjs --input shard-1.jsonl,shard-2.jsonl [--out candidate-model.json]');
}

const outputPath = typeof args.out === 'string'
  ? args.out
  : path.join('tmp', 'nnue', 'candidate-gameplay-model.json');
const modelId = typeof args['model-id'] === 'string'
  ? args['model-id']
  : `${DEFAULT_GAMEPLAY_NNUE_MODEL_ID}-${path.basename(outputPath, path.extname(outputPath))}-${Date.now()}`;
const epochs = toInt(args.epochs, 30);
const learningRate = toFloat(args['learning-rate'], 0.04);
const l2 = toFloat(args.l2, 0.0005);
const validationSplit = toFloat(args['validation-split'], 0.1);
const patience = toInt(args.patience, 5);
const minDelta = toFloat(args['min-delta'], 0.0005);
const shuffleSeed = toInt(args['shuffle-seed'], 20260309);
if (validationSplit < 0 || validationSplit >= 1) {
  throw new Error('Expected --validation-split to be between 0 (inclusive) and 1 (exclusive).');
}
if (patience < 1) {
  throw new Error('Expected --patience to be at least 1.');
}
const samples = readJsonLines(inputs);
const progress = createProgressReporter({
  label: 'train',
  total: epochs,
});
const trainingResult = trainWeights(samples, {
  epochs,
  learningRate,
  l2,
  validationSplit,
  patience,
  minDelta,
  shuffleSeed,
  onEpochComplete: ({
    epoch,
    trainMeanAbsoluteError,
    validationMeanAbsoluteError,
    bestEpoch,
  }) => {
    const validationDetail = validationMeanAbsoluteError === null
      ? 'val=n/a'
      : `val=${validationMeanAbsoluteError.toFixed(4)}`;
    progress.tick(
      `epoch=${epoch}/${epochs} train=${trainMeanAbsoluteError?.toFixed(4) ?? 'n/a'} ${validationDetail} best=${bestEpoch}`,
    );
  },
});
const { weights, bias } = trainingResult;
const model = buildPairedGameplayModel(weights, modelId, bias);

const outputFile = saveSerializedModel(outputPath, model, {
  trainedAt: new Date().toISOString(),
  sampleCount: samples.length,
  trainingSampleCount: trainingResult.trainingSampleCount,
  validationSampleCount: trainingResult.validationSampleCount,
  epochsRequested: epochs,
  epochsCompleted: trainingResult.epochsCompleted,
  bestEpoch: trainingResult.bestEpoch,
  stoppedEarly: trainingResult.stoppedEarly,
  learningRate,
  l2,
  validationSplit,
  patience,
  minDelta,
  shuffleSeed,
});
const metricsPath = writeJson(`${outputPath}.metrics.json`, {
  modelId,
  sampleCount: samples.length,
  trainingSampleCount: trainingResult.trainingSampleCount,
  validationSampleCount: trainingResult.validationSampleCount,
  epochsRequested: epochs,
  epochsCompleted: trainingResult.epochsCompleted,
  bestEpoch: trainingResult.bestEpoch,
  stoppedEarly: trainingResult.stoppedEarly,
  bestMeanAbsoluteError: trainingResult.bestMeanAbsoluteError,
  finalTrainingMeanAbsoluteError: trainingResult.finalTrainingMeanAbsoluteError,
  finalValidationMeanAbsoluteError: trainingResult.finalValidationMeanAbsoluteError,
  learningRate,
  l2,
  validationSplit,
  patience,
  minDelta,
  shuffleSeed,
  weights,
  bias,
  history: trainingResult.history,
});
progress.finish(
  `sampleCount=${samples.length} train=${trainingResult.trainingSampleCount} val=${trainingResult.validationSampleCount} best=${trainingResult.bestEpoch} earlyStop=${trainingResult.stoppedEarly ? 'yes' : 'no'}`,
  trainingResult.epochsCompleted,
);

console.log(JSON.stringify({
  outputFile,
  metricsPath,
  modelId,
  sampleCount: samples.length,
  trainingSampleCount: trainingResult.trainingSampleCount,
  validationSampleCount: trainingResult.validationSampleCount,
  epochsCompleted: trainingResult.epochsCompleted,
  bestEpoch: trainingResult.bestEpoch,
  stoppedEarly: trainingResult.stoppedEarly,
}, null, 2));
