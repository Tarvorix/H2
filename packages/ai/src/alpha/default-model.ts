import type { AlphaModel, SerializedAlphaModel } from '../types';
import { calculateAlphaWeightsChecksum, DEFAULT_ALPHA_MODEL_ID, deserializeAlphaModel } from './common';
import { DEFAULT_ALPHA_MODEL_OVERRIDE } from './default-alpha-model-override';

export const DEFAULT_ALPHA_MODEL_PROMOTED_ID = DEFAULT_ALPHA_MODEL_ID;

function normalizeDefaultAlphaModelId(serialized: SerializedAlphaModel): SerializedAlphaModel {
  const normalized = {
    ...serialized,
    manifest: {
      ...serialized.manifest,
      modelId: DEFAULT_ALPHA_MODEL_PROMOTED_ID,
    },
  };
  return {
    ...normalized,
    manifest: {
      ...normalized.manifest,
      weightsChecksum: calculateAlphaWeightsChecksum(normalized),
    },
  };
}

export function materializeDefaultAlphaModel(
  serializedOverride: SerializedAlphaModel | null = DEFAULT_ALPHA_MODEL_OVERRIDE,
): AlphaModel | null {
  if (!serializedOverride) return null;
  return deserializeAlphaModel(normalizeDefaultAlphaModelId(serializedOverride));
}

export const DEFAULT_ALPHA_MODEL = materializeDefaultAlphaModel();
