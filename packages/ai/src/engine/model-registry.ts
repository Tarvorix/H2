import { hashStableValue } from '@hh/engine';
import type { NNUEModel, NNUEModelManifest } from '../types';
import { DEFAULT_GAMEPLAY_NNUE_MODEL, DEFAULT_GAMEPLAY_NNUE_MODEL_ID } from './default-model';
import { GAMEPLAY_FEATURE_DIMENSION, GAMEPLAY_FEATURE_VERSION } from './feature-extractor';
import { DEFAULT_ROSTER_NNUE_MODEL, DEFAULT_ROSTER_NNUE_MODEL_ID } from './roster-default-model';
import { ROSTER_FEATURE_DIMENSION, ROSTER_FEATURE_VERSION } from './roster-feature-extractor';

const registeredModels = new Map<string, NNUEModel>([
  [DEFAULT_GAMEPLAY_NNUE_MODEL_ID, DEFAULT_GAMEPLAY_NNUE_MODEL],
  [DEFAULT_ROSTER_NNUE_MODEL_ID, DEFAULT_ROSTER_NNUE_MODEL],
]);

const modelRequirements: Record<NNUEModelManifest['modelKind'], {
  featureVersion: number;
  inputSize: number;
}> = {
  gameplay: {
    featureVersion: GAMEPLAY_FEATURE_VERSION,
    inputSize: GAMEPLAY_FEATURE_DIMENSION,
  },
  roster: {
    featureVersion: ROSTER_FEATURE_VERSION,
    inputSize: ROSTER_FEATURE_DIMENSION,
  },
};

function calculateWeightsChecksum(model: NNUEModel): string {
  return hashStableValue({
    hiddenWeights: Array.from(model.hiddenLayer.weights),
    hiddenBiases: Array.from(model.hiddenLayer.biases),
    outputWeights: Array.from(model.outputLayer.weights),
    outputBiases: Array.from(model.outputLayer.biases),
    hiddenWeightScale: model.hiddenLayer.weightScale,
    hiddenBiasScale: model.hiddenLayer.biasScale,
    outputWeightScale: model.outputLayer.weightScale,
    outputBiasScale: model.outputLayer.biasScale,
  });
}

export function validateNNUEModel(
  model: NNUEModel,
  expectedKind?: NNUEModelManifest['modelKind'],
): void {
  if (expectedKind && model.manifest.modelKind !== expectedKind) {
    throw new Error(`NNUE model "${model.manifest.modelId}" is not a ${expectedKind} model.`);
  }

  const requirements = modelRequirements[model.manifest.modelKind];
  if (!requirements) {
    throw new Error(`NNUE model "${model.manifest.modelId}" has unsupported model kind "${model.manifest.modelKind}".`);
  }
  if (model.manifest.schemaVersion !== 1) {
    throw new Error(`NNUE model "${model.manifest.modelId}" has unsupported schema version ${model.manifest.schemaVersion}.`);
  }
  if (model.manifest.featureVersion !== requirements.featureVersion) {
    throw new Error(`NNUE model "${model.manifest.modelId}" has unsupported feature version ${model.manifest.featureVersion}.`);
  }
  if (model.inputSize !== requirements.inputSize) {
    throw new Error(
      `NNUE model "${model.manifest.modelId}" expects ${model.inputSize} features, but ${model.manifest.modelKind} extraction emits ${requirements.inputSize}.`,
    );
  }

  const expectedHiddenWeights = model.hiddenLayer.inputSize * model.hiddenLayer.outputSize;
  const expectedOutputWeights = model.outputLayer.inputSize * model.outputLayer.outputSize;
  if (model.hiddenLayer.weights.length !== expectedHiddenWeights) {
    throw new Error(`NNUE model "${model.manifest.modelId}" has an invalid hidden-layer weight payload.`);
  }
  if (model.outputLayer.weights.length !== expectedOutputWeights) {
    throw new Error(`NNUE model "${model.manifest.modelId}" has an invalid output-layer weight payload.`);
  }

  const checksum = calculateWeightsChecksum(model);
  if (checksum !== model.manifest.weightsChecksum) {
    throw new Error(`NNUE model "${model.manifest.modelId}" checksum mismatch.`);
  }
}

export function registerNNUEModel(model: NNUEModel): void {
  validateNNUEModel(model);
  registeredModels.set(model.manifest.modelId, model);
}

export function listNNUEModels(expectedKind?: NNUEModelManifest['modelKind']): string[] {
  return [...registeredModels.values()]
    .filter((model) => !expectedKind || model.manifest.modelKind === expectedKind)
    .map((model) => model.manifest.modelId)
    .sort((left, right) => left.localeCompare(right));
}

export function getNNUEModel(
  modelId: string,
  expectedKind?: NNUEModelManifest['modelKind'],
): NNUEModel | null {
  const model = registeredModels.get(modelId) ?? null;
  if (!model) return null;
  if (expectedKind && model.manifest.modelKind !== expectedKind) return null;
  return model;
}

export function resolveNNUEModel(
  modelId: string,
  expectedKind?: NNUEModelManifest['modelKind'],
): NNUEModel {
  const model = getNNUEModel(modelId, expectedKind);
  if (!model) {
    const available = listNNUEModels(expectedKind);
    throw new Error(`Unknown NNUE model "${modelId}". Available models: ${available.join(', ')}`);
  }
  validateNNUEModel(model, expectedKind);
  return model;
}

export { DEFAULT_GAMEPLAY_NNUE_MODEL_ID };
export { DEFAULT_ROSTER_NNUE_MODEL_ID };
