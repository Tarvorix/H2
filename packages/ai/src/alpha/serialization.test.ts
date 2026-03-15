import { describe, expect, it } from 'vitest';
import { createFreshAlphaModel } from './inference';
import { cloneSerializedAlphaModel } from './serialization';
import { serializeAlphaModel } from './common';

describe('alpha serialization', () => {
  it('round-trips a serialized Alpha transformer without changing manifest or weights', () => {
    const model = createFreshAlphaModel('alpha-serialization-test', {
      trainedAt: '2026-03-13T00:00:00.000Z',
      datasetName: 'alpha-serialization-test',
      datasetSize: 4,
      epochs: 2,
      optimizer: 'adam',
      learningRate: 1e-4,
      notes: 'serialization round-trip',
    });

    const cloned = cloneSerializedAlphaModel(serializeAlphaModel(model));

    expect(cloned.manifest).toEqual(model.manifest);
    expect(Object.keys(cloned.tensors).sort((left, right) => left.localeCompare(right)))
      .toEqual(Object.keys(model.tensors).sort((left, right) => left.localeCompare(right)));
    expect(cloned.tensors['stateProjection/kernel']?.shape).toEqual(model.tensors['stateProjection/kernel']?.shape);
    expect(cloned.tensors['policy/logit/kernel']?.dataBase64.length).toBeGreaterThan(0);
  });
});
