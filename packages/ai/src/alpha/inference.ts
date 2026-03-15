import * as tf from '@tensorflow/tfjs';
import type {
  AlphaEncodedAction,
  AlphaEncodedStateToken,
  AlphaModel,
  AlphaTrainingMetadata,
  AlphaTransformerHyperparameters,
} from '../types';
import {
  ALPHA_ACTION_FEATURE_DIMENSION,
  ALPHA_COORDINATE_FEATURE_DIMENSION,
  ALPHA_STATE_FEATURE_DIMENSION,
  ALPHA_TOKEN_SCHEMA_VERSION,
  ALPHA_ACTION_SCHEMA_VERSION,
  ALPHA_MODEL_SCHEMA_VERSION,
  ALPHA_MAX_ACTION_TOKENS,
  ALPHA_MAX_STATE_TOKENS,
  buildFourierCoordinateFeatures,
  calculateAlphaWeightsChecksum,
  defaultAlphaModelHyperparameters,
  getTokenTypeIndex,
  hashToUnitInterval,
} from './common';

export interface AlphaForwardPassResult {
  policyLogits: number[][];
  policyPriors: number[][];
  value: number[];
  vpDelta: number[];
  tacticalSwing: number[];
}

export interface AlphaBatchTensors {
  stateFeatures: tf.Tensor3D;
  stateCoordinates: tf.Tensor3D;
  stateTokenTypes: tf.Tensor2D;
  stateMask: tf.Tensor2D;
  actionFeatures: tf.Tensor3D;
  actionMask: tf.Tensor2D;
}

const TENSOR_CACHE = new Map<string, Map<string, tf.Tensor>>();

function product(shape: number[]): number {
  return shape.reduce((total, dimension) => total * dimension, 1);
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function createDeterministicValues(
  shape: number[],
  key: string,
  initializer: 'xavier' | 'zeros' | 'ones',
): Float32Array {
  const size = product(shape);
  if (initializer === 'zeros') {
    return new Float32Array(size);
  }
  if (initializer === 'ones') {
    const values = new Float32Array(size);
    values.fill(1);
    return values;
  }

  const random = xorshift32(Math.max(1, Math.floor(hashToUnitInterval(key) * 0xffffffff)));
  const fanIn = shape.length >= 2 ? shape[0] : shape[shape.length - 1] ?? 1;
  const fanOut = shape.length >= 2 ? shape[shape.length - 1] : shape[0] ?? 1;
  const limit = Math.sqrt(6 / Math.max(1, fanIn + fanOut));
  const values = new Float32Array(size);
  for (let index = 0; index < size; index++) {
    values[index] = ((random() * 2) - 1) * limit;
  }
  return values;
}

export function buildAlphaTensorShapeMap(hyperparameters: AlphaTransformerHyperparameters): Record<string, number[]> {
  const width = hyperparameters.modelWidth;
  const ffn = hyperparameters.feedForwardWidth;
  const shapes: Record<string, number[]> = {
    'stateProjection/kernel': [ALPHA_STATE_FEATURE_DIMENSION, width],
    'stateProjection/bias': [width],
    'coordinateProjection/kernel': [ALPHA_COORDINATE_FEATURE_DIMENSION, width],
    'coordinateProjection/bias': [width],
    'actionProjection/kernel': [ALPHA_ACTION_FEATURE_DIMENSION, width],
    'actionProjection/bias': [width],
    'tokenTypeEmbedding': [hyperparameters.tokenTypeCount, width],
    'value/ln/gamma': [width],
    'value/ln/beta': [width],
    'value/dense/kernel': [width, width * 2],
    'value/dense/bias': [width * 2],
    'value/headValue/kernel': [width * 2, 1],
    'value/headValue/bias': [1],
    'value/headVp/kernel': [width * 2, 1],
    'value/headVp/bias': [1],
    'value/headSwing/kernel': [width * 2, 1],
    'value/headSwing/bias': [1],
    'policy/actionLn/gamma': [width],
    'policy/actionLn/beta': [width],
    'policy/stateLn/gamma': [width],
    'policy/stateLn/beta': [width],
    'policy/cross/qKernel': [width, width],
    'policy/cross/qBias': [width],
    'policy/cross/kKernel': [width, width],
    'policy/cross/kBias': [width],
    'policy/cross/vKernel': [width, width],
    'policy/cross/vBias': [width],
    'policy/cross/oKernel': [width, width],
    'policy/cross/oBias': [width],
    'policy/context/kernel': [width * 3, width],
    'policy/context/bias': [width],
    'policy/logit/kernel': [width, 1],
    'policy/logit/bias': [1],
  };

  for (let layerIndex = 0; layerIndex < hyperparameters.layerCount; layerIndex++) {
    const prefix = `encoder/${layerIndex}`;
    shapes[`${prefix}/ln1/gamma`] = [width];
    shapes[`${prefix}/ln1/beta`] = [width];
    shapes[`${prefix}/ln2/gamma`] = [width];
    shapes[`${prefix}/ln2/beta`] = [width];
    shapes[`${prefix}/attn/qKernel`] = [width, width];
    shapes[`${prefix}/attn/qBias`] = [width];
    shapes[`${prefix}/attn/kKernel`] = [width, width];
    shapes[`${prefix}/attn/kBias`] = [width];
    shapes[`${prefix}/attn/vKernel`] = [width, width];
    shapes[`${prefix}/attn/vBias`] = [width];
    shapes[`${prefix}/attn/oKernel`] = [width, width];
    shapes[`${prefix}/attn/oBias`] = [width];
    shapes[`${prefix}/ffn/dense1/kernel`] = [width, ffn];
    shapes[`${prefix}/ffn/dense1/bias`] = [ffn];
    shapes[`${prefix}/ffn/dense2/kernel`] = [ffn, width];
    shapes[`${prefix}/ffn/dense2/bias`] = [width];
  }

  return shapes;
}

export function createFreshAlphaModel(
  modelId: string,
  trainingMetadata: AlphaTrainingMetadata,
  hyperparameters: AlphaTransformerHyperparameters = defaultAlphaModelHyperparameters(),
): AlphaModel {
  const tensorShapes = buildAlphaTensorShapeMap(hyperparameters);
  const tensors = Object.fromEntries(
    Object.entries(tensorShapes).map(([name, shape]) => {
      const initializer = name.endsWith('/bias')
        ? 'zeros'
        : name.endsWith('/gamma')
          ? 'ones'
          : 'xavier';
      return [
        name,
        {
          shape,
          data: createDeterministicValues(shape, `${modelId}:${name}`, initializer),
        },
      ];
    }),
  );

  const manifest = {
    modelFamily: 'alpha-transformer' as const,
    schemaVersion: ALPHA_MODEL_SCHEMA_VERSION,
    tokenSchemaVersion: ALPHA_TOKEN_SCHEMA_VERSION,
    actionSchemaVersion: ALPHA_ACTION_SCHEMA_VERSION,
    modelId,
    weightsChecksum: '',
    trainingMetadata,
    hyperparameters,
    tokenSortingRules: [
      'global token first',
      'unit tokens sorted by friendly-first priority, strategic value, projected objective value, unit id',
      'objective tokens sorted by current VP descending, then id',
      'terrain tokens sorted by relevance and size, then id',
      'context tokens sorted by pending decision urgency',
    ],
    tokenTruncationRules: [
      `max ${ALPHA_MAX_STATE_TOKENS} state tokens`,
      'always preserve the global token',
      'truncate lower-priority unit, terrain, then context tokens first',
      `max ${ALPHA_MAX_ACTION_TOKENS} action embeddings per decision`,
    ],
  };

  const provisional = { manifest, tensors };
  return {
    ...provisional,
    manifest: {
      ...manifest,
      weightsChecksum: calculateAlphaWeightsChecksum(provisional),
    },
  };
}

function getModelTensorCache(model: AlphaModel): Map<string, tf.Tensor> {
  const cacheKey = `${model.manifest.modelId}:${model.manifest.weightsChecksum}`;
  const cached = TENSOR_CACHE.get(cacheKey);
  if (cached) return cached;

  const tensors = new Map<string, tf.Tensor>();
  for (const [name, tensor] of Object.entries(model.tensors)) {
    tensors.set(name, tf.tensor(tensor.data, tensor.shape));
  }
  TENSOR_CACHE.set(cacheKey, tensors);
  return tensors;
}

function tensorFromCache(cache: Map<string, tf.Tensor>, name: string): tf.Tensor {
  const tensor = cache.get(name);
  if (!tensor) {
    throw new Error(`Alpha model tensor "${name}" is missing.`);
  }
  return tensor;
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

export function buildAlphaBatchInputs(
  states: AlphaEncodedStateToken[][],
  actions: AlphaEncodedAction[][],
): AlphaBatchTensors {
  const batchSize = states.length;
  const maxStateLength = Math.min(ALPHA_MAX_STATE_TOKENS, Math.max(...states.map((entry) => entry.length), 1));
  const maxActionLength = Math.min(ALPHA_MAX_ACTION_TOKENS, Math.max(...actions.map((entry) => entry.length), 1));

  const stateFeatures = new Float32Array(batchSize * maxStateLength * ALPHA_STATE_FEATURE_DIMENSION);
  const stateCoordinates = new Float32Array(batchSize * maxStateLength * ALPHA_COORDINATE_FEATURE_DIMENSION);
  const stateTokenTypes = new Int32Array(batchSize * maxStateLength);
  const stateMask = new Float32Array(batchSize * maxStateLength);
  const actionFeatures = new Float32Array(batchSize * maxActionLength * ALPHA_ACTION_FEATURE_DIMENSION);
  const actionMask = new Float32Array(batchSize * maxActionLength);

  for (let batchIndex = 0; batchIndex < batchSize; batchIndex++) {
    const stateTokens = states[batchIndex].slice(0, maxStateLength);
    const actionTokens = actions[batchIndex].slice(0, maxActionLength);

    for (let tokenIndex = 0; tokenIndex < stateTokens.length; tokenIndex++) {
      const token = stateTokens[tokenIndex];
      const stateOffset = ((batchIndex * maxStateLength) + tokenIndex) * ALPHA_STATE_FEATURE_DIMENSION;
      stateFeatures.set(token.features.slice(0, ALPHA_STATE_FEATURE_DIMENSION), stateOffset);

      const coordinateOffset = ((batchIndex * maxStateLength) + tokenIndex) * ALPHA_COORDINATE_FEATURE_DIMENSION;
      stateCoordinates.set(
        buildFourierCoordinateFeatures(token.position, { width: 1, height: 1 }, 0),
        coordinateOffset,
      );
      stateTokenTypes[(batchIndex * maxStateLength) + tokenIndex] = getTokenTypeIndex(token.tokenType);
      stateMask[(batchIndex * maxStateLength) + tokenIndex] = 1;
    }

    for (let actionIndex = 0; actionIndex < actionTokens.length; actionIndex++) {
      const action = actionTokens[actionIndex];
      const offset = ((batchIndex * maxActionLength) + actionIndex) * ALPHA_ACTION_FEATURE_DIMENSION;
      actionFeatures.set(action.features.slice(0, ALPHA_ACTION_FEATURE_DIMENSION), offset);
      actionMask[(batchIndex * maxActionLength) + actionIndex] = 1;
    }
  }

  return {
    stateFeatures: tf.tensor(stateFeatures, [batchSize, maxStateLength, ALPHA_STATE_FEATURE_DIMENSION]),
    stateCoordinates: tf.tensor(stateCoordinates, [batchSize, maxStateLength, ALPHA_COORDINATE_FEATURE_DIMENSION]),
    stateTokenTypes: tf.tensor(stateTokenTypes, [batchSize, maxStateLength], 'int32'),
    stateMask: tf.tensor(stateMask, [batchSize, maxStateLength]),
    actionFeatures: tf.tensor(actionFeatures, [batchSize, maxActionLength, ALPHA_ACTION_FEATURE_DIMENSION]),
    actionMask: tf.tensor(actionMask, [batchSize, maxActionLength]),
  };
}

export function alphaForwardPass(
  model: AlphaModel,
  states: AlphaEncodedStateToken[][],
  actions: AlphaEncodedAction[][],
  options: { training?: boolean } = {},
): AlphaForwardPassResult {
  const training = options.training ?? false;
  const tensors = getModelTensorCache(model);
  const hyperparameters = model.manifest.hyperparameters;

  return tf.tidy(() => {
    const batch = buildAlphaBatchInputs(states, actions);

    const width = hyperparameters.modelWidth;
    const stateProjectionKernel = tensorFromCache(tensors, 'stateProjection/kernel') as tf.Tensor2D;
    const stateProjectionBias = tensorFromCache(tensors, 'stateProjection/bias') as tf.Tensor1D;
    const coordinateProjectionKernel = tensorFromCache(tensors, 'coordinateProjection/kernel') as tf.Tensor2D;
    const coordinateProjectionBias = tensorFromCache(tensors, 'coordinateProjection/bias') as tf.Tensor1D;
    const actionProjectionKernel = tensorFromCache(tensors, 'actionProjection/kernel') as tf.Tensor2D;
    const actionProjectionBias = tensorFromCache(tensors, 'actionProjection/bias') as tf.Tensor1D;
    const tokenTypeEmbedding = tensorFromCache(tensors, 'tokenTypeEmbedding') as tf.Tensor2D;

    const stateEmbedded = linear3d(batch.stateFeatures, stateProjectionKernel, stateProjectionBias)
      .add(linear3d(batch.stateCoordinates, coordinateProjectionKernel, coordinateProjectionBias))
      .add(tf.gather(tokenTypeEmbedding, batch.stateTokenTypes))
      .mul(batch.stateMask.expandDims(-1));

    let encoded = stateEmbedded as tf.Tensor3D;

    for (let layerIndex = 0; layerIndex < hyperparameters.layerCount; layerIndex++) {
      const prefix = `encoder/${layerIndex}`;
      const ln1Gamma = tensorFromCache(tensors, `${prefix}/ln1/gamma`) as tf.Tensor1D;
      const ln1Beta = tensorFromCache(tensors, `${prefix}/ln1/beta`) as tf.Tensor1D;
      const ln2Gamma = tensorFromCache(tensors, `${prefix}/ln2/gamma`) as tf.Tensor1D;
      const ln2Beta = tensorFromCache(tensors, `${prefix}/ln2/beta`) as tf.Tensor1D;
      const attn = multiHeadAttention(
        layerNorm(encoded, ln1Gamma, ln1Beta) as tf.Tensor3D,
        layerNorm(encoded, ln1Gamma, ln1Beta) as tf.Tensor3D,
        batch.stateMask,
        hyperparameters.attentionHeads,
        tensorFromCache(tensors, `${prefix}/attn/qKernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/attn/qBias`) as tf.Tensor1D,
        tensorFromCache(tensors, `${prefix}/attn/kKernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/attn/kBias`) as tf.Tensor1D,
        tensorFromCache(tensors, `${prefix}/attn/vKernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/attn/vBias`) as tf.Tensor1D,
        tensorFromCache(tensors, `${prefix}/attn/oKernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/attn/oBias`) as tf.Tensor1D,
      );
      encoded = encoded.add(applyDropout(attn, hyperparameters.dropoutRate, training)) as tf.Tensor3D;

      const normalized = layerNorm(encoded, ln2Gamma, ln2Beta) as tf.Tensor3D;
      const ffn1 = linear3d(
        normalized,
        tensorFromCache(tensors, `${prefix}/ffn/dense1/kernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/ffn/dense1/bias`) as tf.Tensor1D,
      );
      const ffn2 = linear3d(
        gelu(ffn1) as tf.Tensor3D,
        tensorFromCache(tensors, `${prefix}/ffn/dense2/kernel`) as tf.Tensor2D,
        tensorFromCache(tensors, `${prefix}/ffn/dense2/bias`) as tf.Tensor1D,
      );
      encoded = encoded.add(applyDropout(ffn2, hyperparameters.dropoutRate, training)).mul(batch.stateMask.expandDims(-1)) as tf.Tensor3D;
    }

    const globalToken = encoded.slice([0, 0, 0], [encoded.shape[0], 1, width]).reshape([encoded.shape[0], width]) as tf.Tensor2D;
    const pooled = globalToken.add(maskedMean(encoded, batch.stateMask)) as tf.Tensor2D;
    const valueNorm = layerNorm(
      pooled,
      tensorFromCache(tensors, 'value/ln/gamma') as tf.Tensor1D,
      tensorFromCache(tensors, 'value/ln/beta') as tf.Tensor1D,
    ) as tf.Tensor2D;
    const valueHidden = gelu(linear2d(
      valueNorm,
      tensorFromCache(tensors, 'value/dense/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'value/dense/bias') as tf.Tensor1D,
    )) as tf.Tensor2D;
    const value = tf.tanh(linear2d(
      valueHidden,
      tensorFromCache(tensors, 'value/headValue/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'value/headValue/bias') as tf.Tensor1D,
    )).reshape([encoded.shape[0]]) as tf.Tensor1D;
    const vpDelta = tf.tanh(linear2d(
      valueHidden,
      tensorFromCache(tensors, 'value/headVp/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'value/headVp/bias') as tf.Tensor1D,
    )).reshape([encoded.shape[0]]) as tf.Tensor1D;
    const tacticalSwing = tf.tanh(linear2d(
      valueHidden,
      tensorFromCache(tensors, 'value/headSwing/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'value/headSwing/bias') as tf.Tensor1D,
    )).reshape([encoded.shape[0]]) as tf.Tensor1D;

    const actionEmbedded = linear3d(batch.actionFeatures, actionProjectionKernel, actionProjectionBias)
      .mul(batch.actionMask.expandDims(-1)) as tf.Tensor3D;
    const actionNorm = layerNorm(
      actionEmbedded,
      tensorFromCache(tensors, 'policy/actionLn/gamma') as tf.Tensor1D,
      tensorFromCache(tensors, 'policy/actionLn/beta') as tf.Tensor1D,
    ) as tf.Tensor3D;
    const stateNorm = layerNorm(
      encoded,
      tensorFromCache(tensors, 'policy/stateLn/gamma') as tf.Tensor1D,
      tensorFromCache(tensors, 'policy/stateLn/beta') as tf.Tensor1D,
    ) as tf.Tensor3D;
    const cross = multiHeadAttention(
      actionNorm,
      stateNorm,
      batch.stateMask,
      hyperparameters.attentionHeads,
      tensorFromCache(tensors, 'policy/cross/qKernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/cross/qBias') as tf.Tensor1D,
      tensorFromCache(tensors, 'policy/cross/kKernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/cross/kBias') as tf.Tensor1D,
      tensorFromCache(tensors, 'policy/cross/vKernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/cross/vBias') as tf.Tensor1D,
      tensorFromCache(tensors, 'policy/cross/oKernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/cross/oBias') as tf.Tensor1D,
    );
    const repeatedGlobal = globalToken.expandDims(1).tile([1, batch.actionFeatures.shape[1], 1]);
    const policyHidden = gelu(linear3d(
      tf.concat([actionEmbedded, cross, repeatedGlobal], -1) as tf.Tensor3D,
      tensorFromCache(tensors, 'policy/context/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/context/bias') as tf.Tensor1D,
    )) as tf.Tensor3D;

    const rawLogits = linear3d(
      policyHidden,
      tensorFromCache(tensors, 'policy/logit/kernel') as tf.Tensor2D,
      tensorFromCache(tensors, 'policy/logit/bias') as tf.Tensor1D,
    ).reshape([encoded.shape[0], batch.actionFeatures.shape[1]]) as tf.Tensor2D;
    const maskedLogits = rawLogits.add(tf.scalar(-1e9).mul(tf.scalar(1).sub(batch.actionMask))) as tf.Tensor2D;
    const policyPriors = tf.softmax(maskedLogits, -1);

    return {
      policyLogits: maskedLogits.arraySync() as number[][],
      policyPriors: policyPriors.arraySync() as number[][],
      value: value.arraySync() as number[],
      vpDelta: vpDelta.arraySync() as number[],
      tacticalSwing: tacticalSwing.arraySync() as number[],
    };
  });
}

export function clearAlphaTensorCache(): void {
  for (const tensorMap of TENSOR_CACHE.values()) {
    for (const tensor of tensorMap.values()) {
      tensor.dispose();
    }
  }
  TENSOR_CACHE.clear();
}
