import type { AlphaModel, SerializedAlphaModelManifest } from '../types';
import { calculateAlphaWeightsChecksum, DEFAULT_ALPHA_MODEL_ID } from './common';
import { DEFAULT_ALPHA_MODEL } from './default-model';
import { buildAlphaTensorShapeMap } from './inference';

const registeredModels = new Map<string, AlphaModel>();

if (DEFAULT_ALPHA_MODEL) {
  registeredModels.set(DEFAULT_ALPHA_MODEL_ID, DEFAULT_ALPHA_MODEL);
}

function equalShape(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateAlphaModel(model: AlphaModel): void {
  const manifest = model.manifest;
  if (manifest.modelFamily !== 'alpha-transformer') {
    throw new Error(`Alpha model "${manifest.modelId}" has unsupported family "${manifest.modelFamily}".`);
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Alpha model "${manifest.modelId}" has unsupported schema version ${manifest.schemaVersion}.`);
  }
  if (manifest.tokenSchemaVersion !== 1) {
    throw new Error(`Alpha model "${manifest.modelId}" has unsupported token schema version ${manifest.tokenSchemaVersion}.`);
  }
  if (manifest.actionSchemaVersion !== 1) {
    throw new Error(`Alpha model "${manifest.modelId}" has unsupported action schema version ${manifest.actionSchemaVersion}.`);
  }

  const expectedShapes = buildAlphaTensorShapeMap(manifest.hyperparameters);
  for (const [name, shape] of Object.entries(expectedShapes)) {
    const tensor = model.tensors[name];
    if (!tensor) {
      throw new Error(`Alpha model "${manifest.modelId}" is missing tensor "${name}".`);
    }
    if (!equalShape(tensor.shape, shape)) {
      throw new Error(`Alpha model "${manifest.modelId}" tensor "${name}" has invalid shape ${tensor.shape.join('x')} (expected ${shape.join('x')}).`);
    }
  }

  const checksum = calculateAlphaWeightsChecksum(model);
  if (checksum !== manifest.weightsChecksum) {
    throw new Error(`Alpha model "${manifest.modelId}" checksum mismatch.`);
  }
}

export function registerAlphaModel(model: AlphaModel): void {
  validateAlphaModel(model);
  registeredModels.set(model.manifest.modelId, model);
}

export function listAlphaModels(): string[] {
  return [...registeredModels.keys()].sort((left, right) => left.localeCompare(right));
}

export function getAlphaModel(modelId: string): AlphaModel | null {
  return registeredModels.get(modelId) ?? null;
}

export function resolveAlphaModel(modelId: string): AlphaModel {
  const model = getAlphaModel(modelId);
  if (!model) {
    throw new Error(`Unknown Alpha model "${modelId}". Available Alpha models: ${listAlphaModels().join(', ')}`);
  }
  validateAlphaModel(model);
  return model;
}

export type { SerializedAlphaModelManifest };
export { DEFAULT_ALPHA_MODEL_ID };
