import { hashStableValue } from '@hh/engine';
import type { NNUEModel } from '../types';
import { ROSTER_FEATURE_DIMENSION, ROSTER_FEATURE_VERSION } from './roster-feature-extractor';

export const DEFAULT_ROSTER_NNUE_MODEL_ID = 'roster-default-v1';

function buildDefaultRosterModel(): NNUEModel {
  const featureImportances = [16, 10, 4, 9, 10, 12, 8, 7, 5, 11];
  const hiddenSize = ROSTER_FEATURE_DIMENSION * 2;
  const hiddenWeights = new Int8Array(hiddenSize * ROSTER_FEATURE_DIMENSION);
  const hiddenBiases = new Int16Array(hiddenSize);

  for (let featureIndex = 0; featureIndex < ROSTER_FEATURE_DIMENSION; featureIndex++) {
    hiddenWeights[(featureIndex * 2 * ROSTER_FEATURE_DIMENSION) + featureIndex] = 16;
    hiddenWeights[(((featureIndex * 2) + 1) * ROSTER_FEATURE_DIMENSION) + featureIndex] = -16;
  }

  const outputWeights = new Int8Array(hiddenSize);
  const outputBiases = new Int16Array([0]);
  for (let featureIndex = 0; featureIndex < featureImportances.length; featureIndex++) {
    outputWeights[featureIndex * 2] = featureImportances[featureIndex];
    outputWeights[(featureIndex * 2) + 1] = -featureImportances[featureIndex];
  }

  const hiddenLayer = {
    inputSize: ROSTER_FEATURE_DIMENSION,
    outputSize: hiddenSize,
    weightScale: 16,
    biasScale: 16,
    weights: hiddenWeights,
    biases: hiddenBiases,
  };

  const outputLayer = {
    inputSize: hiddenSize,
    outputSize: 1,
    weightScale: 10,
    biasScale: 10,
    weights: outputWeights,
    biases: outputBiases,
  };

  const weightsChecksum = hashStableValue({
    hiddenWeights: Array.from(hiddenWeights),
    hiddenBiases: Array.from(hiddenBiases),
    outputWeights: Array.from(outputWeights),
    outputBiases: Array.from(outputBiases),
    hiddenWeightScale: hiddenLayer.weightScale,
    hiddenBiasScale: hiddenLayer.biasScale,
    outputWeightScale: outputLayer.weightScale,
    outputBiasScale: outputLayer.biasScale,
  });

  return {
    manifest: {
      modelId: DEFAULT_ROSTER_NNUE_MODEL_ID,
      modelKind: 'roster',
      schemaVersion: 1,
      featureVersion: ROSTER_FEATURE_VERSION,
      weightsChecksum,
    },
    inputSize: ROSTER_FEATURE_DIMENSION,
    hiddenLayer,
    outputLayer,
  };
}

export const DEFAULT_ROSTER_NNUE_MODEL = buildDefaultRosterModel();
