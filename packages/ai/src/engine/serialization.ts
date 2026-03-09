import type { NNUEModel, SerializedNNUEModel } from '../types';

export function serializeNNUEModel(model: NNUEModel): SerializedNNUEModel {
  return {
    manifest: model.manifest,
    inputSize: model.inputSize,
    hiddenLayer: {
      inputSize: model.hiddenLayer.inputSize,
      outputSize: model.hiddenLayer.outputSize,
      weightScale: model.hiddenLayer.weightScale,
      biasScale: model.hiddenLayer.biasScale,
      weights: Array.from(model.hiddenLayer.weights),
      biases: Array.from(model.hiddenLayer.biases),
    },
    outputLayer: {
      inputSize: model.outputLayer.inputSize,
      outputSize: model.outputLayer.outputSize,
      weightScale: model.outputLayer.weightScale,
      biasScale: model.outputLayer.biasScale,
      weights: Array.from(model.outputLayer.weights),
      biases: Array.from(model.outputLayer.biases),
    },
  };
}

export function deserializeNNUEModel(serialized: SerializedNNUEModel): NNUEModel {
  return {
    manifest: serialized.manifest,
    inputSize: serialized.inputSize,
    hiddenLayer: {
      inputSize: serialized.hiddenLayer.inputSize,
      outputSize: serialized.hiddenLayer.outputSize,
      weightScale: serialized.hiddenLayer.weightScale,
      biasScale: serialized.hiddenLayer.biasScale,
      weights: new Int8Array(serialized.hiddenLayer.weights),
      biases: new Int16Array(serialized.hiddenLayer.biases),
    },
    outputLayer: {
      inputSize: serialized.outputLayer.inputSize,
      outputSize: serialized.outputLayer.outputSize,
      weightScale: serialized.outputLayer.weightScale,
      biasScale: serialized.outputLayer.biasScale,
      weights: new Int8Array(serialized.outputLayer.weights),
      biases: new Int16Array(serialized.outputLayer.biases),
    },
  };
}
