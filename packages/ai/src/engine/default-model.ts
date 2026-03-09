import { hashStableValue } from '@hh/engine';
import type { NNUEModel } from '../types';
import { GAMEPLAY_FEATURE_DIMENSION, GAMEPLAY_FEATURE_VERSION } from './feature-extractor';

export const DEFAULT_GAMEPLAY_NNUE_MODEL_ID = 'gameplay-default-v1';

function buildDefaultGameplayModel(): NNUEModel {
  const featureImportances = [
    14, 15, 11, 15, 14,
    9, 11, 6, 8, 10,
    5, 5, 7, 9, 8,
    5, 6, 9, 6, 7,
    12, 9, 7, 4, 3,
  ];
  const hiddenSize = GAMEPLAY_FEATURE_DIMENSION * 2;
  const hiddenWeights = new Int8Array(hiddenSize * GAMEPLAY_FEATURE_DIMENSION);
  const hiddenBiases = new Int16Array(hiddenSize);

  for (let featureIndex = 0; featureIndex < GAMEPLAY_FEATURE_DIMENSION; featureIndex++) {
    hiddenWeights[(featureIndex * 2 * GAMEPLAY_FEATURE_DIMENSION) + featureIndex] = 16;
    hiddenWeights[(((featureIndex * 2) + 1) * GAMEPLAY_FEATURE_DIMENSION) + featureIndex] = -16;
  }

  const outputWeights = new Int8Array(hiddenSize);
  const outputBiases = new Int16Array([0]);
  for (let featureIndex = 0; featureIndex < featureImportances.length; featureIndex++) {
    outputWeights[featureIndex * 2] = featureImportances[featureIndex];
    outputWeights[(featureIndex * 2) + 1] = -featureImportances[featureIndex];
  }

  const hiddenLayer = {
    inputSize: GAMEPLAY_FEATURE_DIMENSION,
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
      modelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
      modelKind: 'gameplay',
      schemaVersion: 1,
      featureVersion: GAMEPLAY_FEATURE_VERSION,
      weightsChecksum,
    },
    inputSize: GAMEPLAY_FEATURE_DIMENSION,
    hiddenLayer,
    outputLayer,
  };
}

export const DEFAULT_GAMEPLAY_NNUE_MODEL = buildDefaultGameplayModel();
