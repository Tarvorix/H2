import type { ArmyList, GameState } from '@hh/types';
import type { Evaluator, NNUEModel, QuantizedLayer } from '../types';
import { resolveNNUEModel } from './model-registry';
import { extractGameplayFeatures } from './feature-extractor';
import { extractRosterFeatures } from './roster-feature-extractor';

function runQuantizedLayer(
  layer: QuantizedLayer,
  inputs: Float32Array,
  activation: 'relu' | 'identity',
): Float32Array {
  const outputs = new Float32Array(layer.outputSize);

  for (let outputIndex = 0; outputIndex < layer.outputSize; outputIndex++) {
    let sum = layer.biases[outputIndex] / layer.biasScale;
    const rowOffset = outputIndex * layer.inputSize;
    for (let inputIndex = 0; inputIndex < layer.inputSize; inputIndex++) {
      sum += (layer.weights[rowOffset + inputIndex] / layer.weightScale) * inputs[inputIndex];
    }
    outputs[outputIndex] = activation === 'relu' ? Math.max(0, sum) : sum;
  }

  return outputs;
}

function runQuantizedModel(model: NNUEModel, features: Float32Array): number {
  const hidden = runQuantizedLayer(model.hiddenLayer, features, 'relu');
  const output = runQuantizedLayer(model.outputLayer, hidden, 'identity');
  return output[0] * 100;
}

export class NNUEEvaluator implements Evaluator {
  readonly model: NNUEModel;

  constructor(modelId: string) {
    this.model = resolveNNUEModel(modelId, 'gameplay');
  }

  evaluate(state: GameState, playerIndex: number): number {
    const features = extractGameplayFeatures(state, playerIndex);
    return runQuantizedModel(this.model, features);
  }
}

export class RosterNNUEEvaluator {
  readonly model: NNUEModel;

  constructor(modelId: string) {
    this.model = resolveNNUEModel(modelId, 'roster');
  }

  evaluate(armyList: ArmyList): number {
    return runQuantizedModel(this.model, extractRosterFeatures(armyList));
  }
}

export function evaluateRosterArmyList(armyList: ArmyList, modelId: string): number {
  return new RosterNNUEEvaluator(modelId).evaluate(armyList);
}
