import { describe, expect, it } from 'vitest';
import { serializeAlphaModel } from './serialization';
import {
  DEFAULT_ALPHA_MODEL_ID,
} from './common';
import { createFreshAlphaModel } from './inference';
import { materializeDefaultAlphaModel } from './default-model';
import { validateAlphaModel } from './model-registry';

describe('default alpha model materialization', () => {
  it('uses the built-in default id when loading promoted override weights', () => {
    const alphaModel = createFreshAlphaModel('alpha-candidate-materialize-test', {
      trainedAt: '2026-03-13T00:00:00.000Z',
      datasetName: 'alpha-default-model-test',
      datasetSize: 1,
      epochs: 1,
      optimizer: 'adam',
      learningRate: 1e-4,
      notes: 'default model materialization test',
    });
    const serialized = serializeAlphaModel(alphaModel);
    const promoted = materializeDefaultAlphaModel({
      ...serialized,
      manifest: {
        ...serialized.manifest,
        modelId: 'alpha-candidate-promoted-via-gate',
      },
    });

    expect(() => validateAlphaModel(promoted!)).not.toThrow();
    expect(promoted?.manifest.modelId).toBe(DEFAULT_ALPHA_MODEL_ID);
    expect(promoted?.manifest.modelFamily).toBe('alpha-transformer');
    expect(promoted?.manifest.weightsChecksum).not.toBe(serialized.manifest.weightsChecksum);
  });
});
