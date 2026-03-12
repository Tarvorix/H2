import { describe, expect, it } from 'vitest';
import { serializeNNUEModel } from './serialization';
import {
  DEFAULT_GAMEPLAY_NNUE_MODEL,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  materializeDefaultGameplayModel,
} from './default-model';

describe('default gameplay model materialization', () => {
  it('uses the built-in default id even when loading promoted override weights', () => {
    const serialized = serializeNNUEModel(DEFAULT_GAMEPLAY_NNUE_MODEL);
    const promoted = materializeDefaultGameplayModel({
      ...serialized,
      manifest: {
        ...serialized.manifest,
        modelId: 'candidate-promoted-via-gate',
      },
    });

    expect(promoted.manifest.modelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(promoted.manifest.modelKind).toBe('gameplay');
    expect(Array.from(promoted.outputLayer.weights)).toEqual(Array.from(DEFAULT_GAMEPLAY_NNUE_MODEL.outputLayer.weights));
  });
});
