import * as tf from '@tensorflow/tfjs';
import type {
  AlphaEncodedAction,
  AlphaEncodedStateToken,
  AlphaModel,
  AlphaTrainingMetadata,
  AlphaTransformerHyperparameters,
} from '../types';
import { calculateAlphaWeightsChecksum } from './common';
import { type AlphaBatchTensors, buildAlphaBatchInputs } from './inference';

export interface AlphaTrainableModel {
  manifest: AlphaModel['manifest'];
  variables: Map<string, tf.Variable>;
}

export interface AlphaTrainingBatch {
  states: AlphaEncodedStateToken[][];
  actions: AlphaEncodedAction[][];
  policyTargets: number[][];
  valueTargets: number[];
  vpDeltaTargets: number[];
  tacticalSwingTargets: number[];
}

export interface AlphaTrainingLosses {
  totalLoss: number;
  policyLoss: number;
  valueLoss: number;
  vpLoss: number;
  tacticalSwingLoss: number;
  entropyLoss: number;
  weightDecayLoss: number;
}

export function createAlphaAdamOptimizer(learningRate: number): tf.Optimizer {
  return tf.train.adam(learningRate);
}

function linear3d(input: tf.Tensor3D, kernel: tf.Tensor2D, bias: tf.Tensor1D): tf.Tensor3D {
  const [batch, length, width] = input.shape;
  return input
    .reshape([batch * length, width])
    .matMul(kernel)
    .add(bias)
    .reshape([batch, length, kernel.shape[1]]);
}

function linear2d(input: tf.Tensor2D, kernel: tf.Tensor2D, bias: tf.Tensor1D): tf.Tensor2D {
  return input.matMul(kernel).add(bias) as tf.Tensor2D;
}

function layerNorm(input: tf.Tensor, gamma: tf.Tensor1D, beta: tf.Tensor1D): tf.Tensor {
  const mean = input.mean(-1, true);
  const variance = input.sub(mean).square().mean(-1, true);
  const normalized = input.sub(mean).div(variance.add(1e-5).sqrt());
  return normalized.mul(gamma).add(beta);
}

function gelu(input: tf.Tensor): tf.Tensor {
  const half = tf.scalar(0.5);
  const one = tf.scalar(1);
  const invSqrt2 = tf.scalar(Math.sqrt(0.5));
  return input.mul(half).mul(one.add(tf.erf(input.mul(invSqrt2))));
}

function applyDropout(input: tf.Tensor, rate: number, training: boolean): tf.Tensor {
  if (!training || rate <= 0) return input;
  const keepProbability = 1 - rate;
  const mask = tf.randomUniform(input.shape, 0, 1, 'float32')
    .greaterEqual(tf.scalar(rate))
    .toFloat()
    .div(tf.scalar(keepProbability));
  return input.mul(mask);
}

function splitHeads(input: tf.Tensor3D, heads: number): tf.Tensor4D {
  const [batch, length, width] = input.shape;
  const headWidth = width / heads;
  return input.reshape([batch, length, heads, headWidth]).transpose([0, 2, 1, 3]);
}

function combineHeads(input: tf.Tensor4D): tf.Tensor3D {
  const [batch, heads, length, headWidth] = input.shape;
  return input.transpose([0, 2, 1, 3]).reshape([batch, length, heads * headWidth]);
}

function multiHeadAttention(
  queryInput: tf.Tensor3D,
  keyValueInput: tf.Tensor3D,
  keyMask: tf.Tensor2D,
  heads: number,
  qKernel: tf.Tensor2D,
  qBias: tf.Tensor1D,
  kKernel: tf.Tensor2D,
  kBias: tf.Tensor1D,
  vKernel: tf.Tensor2D,
  vBias: tf.Tensor1D,
  oKernel: tf.Tensor2D,
  oBias: tf.Tensor1D,
): tf.Tensor3D {
  const q = splitHeads(linear3d(queryInput, qKernel, qBias), heads);
  const k = splitHeads(linear3d(keyValueInput, kKernel, kBias), heads);
  const v = splitHeads(linear3d(keyValueInput, vKernel, vBias), heads);
  const depth = Math.max(1, q.shape[3]);
  let scores = tf.matMul(q, k, false, true).div(tf.scalar(Math.sqrt(depth)));

  const expandedMask = keyMask.expandDims(1).expandDims(1);
  scores = scores.add(tf.scalar(-1e9).mul(tf.scalar(1).sub(expandedMask)));

  const weights = tf.softmax(scores, -1);
  const context = tf.matMul(weights, v) as tf.Tensor4D;
  return linear3d(combineHeads(context), oKernel, oBias);
}

function maskedMean(input: tf.Tensor3D, mask: tf.Tensor2D): tf.Tensor2D {
  const weights = mask.expandDims(-1);
  const total = input.mul(weights).sum(1);
  const count = weights.sum(1).maximum(tf.scalar(1));
  return total.div(count) as tf.Tensor2D;
}

function variable(trainable: AlphaTrainableModel, name: string): tf.Variable {
  const entry = trainable.variables.get(name);
  if (!entry) {
    throw new Error(`Trainable Alpha variable "${name}" is missing.`);
  }
  return entry;
}

function runTrainableForward(
  trainable: AlphaTrainableModel,
  batch: AlphaBatchTensors,
  hyperparameters: AlphaTransformerHyperparameters,
  training: boolean,
): {
  policyLogits: tf.Tensor2D;
  policyPriors: tf.Tensor2D;
  value: tf.Tensor1D;
  vpDelta: tf.Tensor1D;
  tacticalSwing: tf.Tensor1D;
} {
  const width = hyperparameters.modelWidth;
  const stateEmbedded = linear3d(
    batch.stateFeatures,
    variable(trainable, 'stateProjection/kernel') as tf.Tensor2D,
    variable(trainable, 'stateProjection/bias') as tf.Tensor1D,
  )
    .add(linear3d(
      batch.stateCoordinates,
      variable(trainable, 'coordinateProjection/kernel') as tf.Tensor2D,
      variable(trainable, 'coordinateProjection/bias') as tf.Tensor1D,
    ))
    .add(tf.gather(variable(trainable, 'tokenTypeEmbedding') as tf.Tensor2D, batch.stateTokenTypes))
    .mul(batch.stateMask.expandDims(-1)) as tf.Tensor3D;

  let encoded = stateEmbedded;
  for (let layerIndex = 0; layerIndex < hyperparameters.layerCount; layerIndex++) {
    const prefix = `encoder/${layerIndex}`;
    const ln1 = layerNorm(
      encoded,
      variable(trainable, `${prefix}/ln1/gamma`) as tf.Tensor1D,
      variable(trainable, `${prefix}/ln1/beta`) as tf.Tensor1D,
    ) as tf.Tensor3D;
    const attn = multiHeadAttention(
      ln1,
      ln1,
      batch.stateMask,
      hyperparameters.attentionHeads,
      variable(trainable, `${prefix}/attn/qKernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/attn/qBias`) as tf.Tensor1D,
      variable(trainable, `${prefix}/attn/kKernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/attn/kBias`) as tf.Tensor1D,
      variable(trainable, `${prefix}/attn/vKernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/attn/vBias`) as tf.Tensor1D,
      variable(trainable, `${prefix}/attn/oKernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/attn/oBias`) as tf.Tensor1D,
    );
    encoded = encoded.add(applyDropout(attn, hyperparameters.dropoutRate, training)) as tf.Tensor3D;

    const normalized = layerNorm(
      encoded,
      variable(trainable, `${prefix}/ln2/gamma`) as tf.Tensor1D,
      variable(trainable, `${prefix}/ln2/beta`) as tf.Tensor1D,
    ) as tf.Tensor3D;
    const ffn1 = linear3d(
      normalized,
      variable(trainable, `${prefix}/ffn/dense1/kernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/ffn/dense1/bias`) as tf.Tensor1D,
    );
    const ffn2 = linear3d(
      gelu(ffn1) as tf.Tensor3D,
      variable(trainable, `${prefix}/ffn/dense2/kernel`) as tf.Tensor2D,
      variable(trainable, `${prefix}/ffn/dense2/bias`) as tf.Tensor1D,
    );
    encoded = encoded.add(applyDropout(ffn2, hyperparameters.dropoutRate, training)).mul(batch.stateMask.expandDims(-1)) as tf.Tensor3D;
  }

  const globalToken = encoded.slice([0, 0, 0], [encoded.shape[0], 1, width]).reshape([encoded.shape[0], width]) as tf.Tensor2D;
  const pooled = globalToken.add(maskedMean(encoded, batch.stateMask)) as tf.Tensor2D;
  const valueNorm = layerNorm(
    pooled,
    variable(trainable, 'value/ln/gamma') as tf.Tensor1D,
    variable(trainable, 'value/ln/beta') as tf.Tensor1D,
  ) as tf.Tensor2D;
  const valueHidden = gelu(linear2d(
    valueNorm,
    variable(trainable, 'value/dense/kernel') as tf.Tensor2D,
    variable(trainable, 'value/dense/bias') as tf.Tensor1D,
  )) as tf.Tensor2D;
  const value = tf.tanh(linear2d(
    valueHidden,
    variable(trainable, 'value/headValue/kernel') as tf.Tensor2D,
    variable(trainable, 'value/headValue/bias') as tf.Tensor1D,
  )).reshape([encoded.shape[0]]) as tf.Tensor1D;
  const vpDelta = tf.tanh(linear2d(
    valueHidden,
    variable(trainable, 'value/headVp/kernel') as tf.Tensor2D,
    variable(trainable, 'value/headVp/bias') as tf.Tensor1D,
  )).reshape([encoded.shape[0]]) as tf.Tensor1D;
  const tacticalSwing = tf.tanh(linear2d(
    valueHidden,
    variable(trainable, 'value/headSwing/kernel') as tf.Tensor2D,
    variable(trainable, 'value/headSwing/bias') as tf.Tensor1D,
  )).reshape([encoded.shape[0]]) as tf.Tensor1D;

  const actionEmbedded = linear3d(
    batch.actionFeatures,
    variable(trainable, 'actionProjection/kernel') as tf.Tensor2D,
    variable(trainable, 'actionProjection/bias') as tf.Tensor1D,
  ).mul(batch.actionMask.expandDims(-1)) as tf.Tensor3D;
  const actionNorm = layerNorm(
    actionEmbedded,
    variable(trainable, 'policy/actionLn/gamma') as tf.Tensor1D,
    variable(trainable, 'policy/actionLn/beta') as tf.Tensor1D,
  ) as tf.Tensor3D;
  const stateNorm = layerNorm(
    encoded,
    variable(trainable, 'policy/stateLn/gamma') as tf.Tensor1D,
    variable(trainable, 'policy/stateLn/beta') as tf.Tensor1D,
  ) as tf.Tensor3D;
  const cross = multiHeadAttention(
    actionNorm,
    stateNorm,
    batch.stateMask,
    hyperparameters.attentionHeads,
    variable(trainable, 'policy/cross/qKernel') as tf.Tensor2D,
    variable(trainable, 'policy/cross/qBias') as tf.Tensor1D,
    variable(trainable, 'policy/cross/kKernel') as tf.Tensor2D,
    variable(trainable, 'policy/cross/kBias') as tf.Tensor1D,
    variable(trainable, 'policy/cross/vKernel') as tf.Tensor2D,
    variable(trainable, 'policy/cross/vBias') as tf.Tensor1D,
    variable(trainable, 'policy/cross/oKernel') as tf.Tensor2D,
    variable(trainable, 'policy/cross/oBias') as tf.Tensor1D,
  );
  const repeatedGlobal = globalToken.expandDims(1).tile([1, batch.actionFeatures.shape[1], 1]);
  const policyHidden = gelu(linear3d(
    tf.concat([actionEmbedded, cross, repeatedGlobal], -1) as tf.Tensor3D,
    variable(trainable, 'policy/context/kernel') as tf.Tensor2D,
    variable(trainable, 'policy/context/bias') as tf.Tensor1D,
  )) as tf.Tensor3D;

  const policyLogits = linear3d(
    policyHidden,
    variable(trainable, 'policy/logit/kernel') as tf.Tensor2D,
    variable(trainable, 'policy/logit/bias') as tf.Tensor1D,
  ).reshape([encoded.shape[0], batch.actionFeatures.shape[1]]) as tf.Tensor2D;
  const maskedLogits = policyLogits.add(tf.scalar(-1e9).mul(tf.scalar(1).sub(batch.actionMask))) as tf.Tensor2D;
  const policyPriors = tf.softmax(maskedLogits, -1);

  return {
    policyLogits: maskedLogits,
    policyPriors,
    value,
    vpDelta,
    tacticalSwing,
  };
}

function buildTrainingTargets(batch: AlphaTrainingBatch, actionCount: number): {
  policyTargets: tf.Tensor2D;
  valueTargets: tf.Tensor1D;
  vpDeltaTargets: tf.Tensor1D;
  tacticalSwingTargets: tf.Tensor1D;
} {
  const policyRows = batch.policyTargets.map((row) => {
    const trimmed = row.slice(0, actionCount);
    if (trimmed.length >= actionCount) return trimmed;
    return [...trimmed, ...Array.from({ length: actionCount - trimmed.length }, () => 0)];
  });

  return {
    policyTargets: tf.tensor2d(policyRows, [policyRows.length, actionCount]),
    valueTargets: tf.tensor1d(batch.valueTargets),
    vpDeltaTargets: tf.tensor1d(batch.vpDeltaTargets),
    tacticalSwingTargets: tf.tensor1d(batch.tacticalSwingTargets),
  };
}

export function createAlphaTrainableModel(baseModel: AlphaModel): AlphaTrainableModel {
  const variables = new Map<string, tf.Variable>();
  for (const [name, tensor] of Object.entries(baseModel.tensors)) {
    variables.set(name, tf.variable(tf.tensor(tensor.data, tensor.shape), true, name));
  }
  return {
    manifest: baseModel.manifest,
    variables,
  };
}

export function disposeAlphaTrainableModel(trainable: AlphaTrainableModel): void {
  for (const variable of trainable.variables.values()) {
    variable.dispose();
  }
  trainable.variables.clear();
}

export function trainAlphaBatch(
  trainable: AlphaTrainableModel,
  batch: AlphaTrainingBatch,
  optimizer: tf.Optimizer,
  options: {
    entropyRegularization?: number;
    weightDecay?: number;
    policyWeight?: number;
    valueWeight?: number;
    vpWeight?: number;
    tacticalSwingWeight?: number;
  } = {},
): AlphaTrainingLosses {
  const entropyRegularization = options.entropyRegularization ?? 0.01;
  const weightDecay = options.weightDecay ?? 1e-5;
  const policyWeight = options.policyWeight ?? 1;
  const valueWeight = options.valueWeight ?? 1;
  const vpWeight = options.vpWeight ?? 0.35;
  const tacticalSwingWeight = options.tacticalSwingWeight ?? 0.35;
  const hyperparameters = trainable.manifest.hyperparameters;

  const batchInputs = buildAlphaBatchInputs(batch.states, batch.actions);
  const targets = buildTrainingTargets(batch, batchInputs.actionFeatures.shape[1]);
  const variableList = [...trainable.variables.values()];

  const trackedLosses: {
    policy: tf.Scalar | null;
    value: tf.Scalar | null;
    vp: tf.Scalar | null;
    tacticalSwing: tf.Scalar | null;
    entropy: tf.Scalar | null;
    weightDecay: tf.Scalar | null;
  } = {
    policy: null,
    value: null,
    vp: null,
    tacticalSwing: null,
    entropy: null,
    weightDecay: null,
  };

  const totalLossTensor = optimizer.minimize(() => {
    const output = runTrainableForward(trainable, batchInputs, hyperparameters, true);
    const safePriors = output.policyPriors.add(tf.scalar(1e-8));
    const policyLoss = tf.neg(targets.policyTargets.mul(safePriors.log()).sum(-1).mean()) as tf.Scalar;
    const valueLoss = output.value.sub(targets.valueTargets).square().mean() as tf.Scalar;
    const vpLoss = output.vpDelta.sub(targets.vpDeltaTargets).square().mean() as tf.Scalar;
    const tacticalSwingLoss = output.tacticalSwing.sub(targets.tacticalSwingTargets).square().mean() as tf.Scalar;
    const entropy = output.policyPriors.mul(safePriors.log()).sum(-1).mean().neg() as tf.Scalar;
    const entropyLoss = entropy.mul(tf.scalar(-entropyRegularization)) as tf.Scalar;
    const decay = tf.addN(
      variableList
        .filter((entry) => entry.name.endsWith('kernel'))
        .map((entry) => entry.square().mean()),
    ).mul(tf.scalar(weightDecay)) as tf.Scalar;

    trackedLosses.policy = tf.keep(policyLoss);
    trackedLosses.value = tf.keep(valueLoss);
    trackedLosses.vp = tf.keep(vpLoss);
    trackedLosses.tacticalSwing = tf.keep(tacticalSwingLoss);
    trackedLosses.entropy = tf.keep(entropyLoss);
    trackedLosses.weightDecay = tf.keep(decay);

    return tf.addN([
      policyLoss.mul(tf.scalar(policyWeight)),
      valueLoss.mul(tf.scalar(valueWeight)),
      vpLoss.mul(tf.scalar(vpWeight)),
      tacticalSwingLoss.mul(tf.scalar(tacticalSwingWeight)),
      entropyLoss,
      decay,
    ]) as tf.Scalar;
  }, true, variableList) as tf.Scalar;

  const losses: AlphaTrainingLosses = {
    totalLoss: totalLossTensor.dataSync()[0] ?? 0,
    policyLoss: trackedLosses.policy?.dataSync()[0] ?? 0,
    valueLoss: trackedLosses.value?.dataSync()[0] ?? 0,
    vpLoss: trackedLosses.vp?.dataSync()[0] ?? 0,
    tacticalSwingLoss: trackedLosses.tacticalSwing?.dataSync()[0] ?? 0,
    entropyLoss: trackedLosses.entropy?.dataSync()[0] ?? 0,
    weightDecayLoss: trackedLosses.weightDecay?.dataSync()[0] ?? 0,
  };

  totalLossTensor.dispose();
  trackedLosses.policy?.dispose();
  trackedLosses.value?.dispose();
  trackedLosses.vp?.dispose();
  trackedLosses.tacticalSwing?.dispose();
  trackedLosses.entropy?.dispose();
  trackedLosses.weightDecay?.dispose();
  Object.values(batchInputs).forEach((tensor) => tensor.dispose());
  Object.values(targets).forEach((tensor) => tensor.dispose());

  return losses;
}

export function exportTrainedAlphaModel(
  trainable: AlphaTrainableModel,
  trainingMetadata: AlphaTrainingMetadata,
): AlphaModel {
  const tensors = Object.fromEntries(
    [...trainable.variables.entries()].map(([name, variable]) => [
      name,
      {
        shape: [...variable.shape],
        data: new Float32Array(variable.dataSync()),
      },
    ]),
  );

  const manifest = {
    ...trainable.manifest,
    trainingMetadata,
    weightsChecksum: '',
  };
  const model = {
    manifest,
    tensors,
  };

  return {
    ...model,
    manifest: {
      ...manifest,
      weightsChecksum: calculateAlphaWeightsChecksum(model),
    },
  };
}
