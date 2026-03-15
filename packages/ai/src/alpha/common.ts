import type { BattlefieldDimensions, Position } from '@hh/types';
import { hashStableValue } from '@hh/engine';
import type {
  AIPlayerConfig,
  AlphaModel,
  AlphaSearchConfig,
  AlphaTensor,
  SerializedAlphaModel,
  SerializedAlphaTensor,
} from '../types';
import { AIStrategyTier } from '../types';

export const ALPHA_TOKEN_SCHEMA_VERSION = 1;
export const ALPHA_ACTION_SCHEMA_VERSION = 1;
export const ALPHA_MODEL_SCHEMA_VERSION = 1;
export const DEFAULT_ALPHA_MODEL_ID = 'alpha-default-v1';
export const ALPHA_STATE_FEATURE_DIMENSION = 96;
export const ALPHA_ACTION_FEATURE_DIMENSION = 96;
export const ALPHA_COORDINATE_FEATURE_DIMENSION = 16;
export const ALPHA_MODEL_WIDTH = 256;
export const ALPHA_LAYER_COUNT = 6;
export const ALPHA_ATTENTION_HEADS = 8;
export const ALPHA_FFN_WIDTH = 1024;
export const ALPHA_DROPOUT_RATE = 0.1;
export const ALPHA_MAX_STATE_TOKENS = 96;
export const ALPHA_MAX_ACTION_TOKENS = 32;
export const ALPHA_BATCH_SIZE = 8;
export const ALPHA_BALANCED_TIME_BUDGET_MS = 600;
export const ALPHA_BALANCED_MAX_SIMULATIONS = 256;
export const ALPHA_TOURNAMENT_TIME_BUDGET_MS = 1500;
export const ALPHA_TOURNAMENT_MAX_SIMULATIONS = 640;
export const ALPHA_SELFPLAY_DEFAULT_SIMULATIONS = 800;

const TOKEN_TYPE_ORDER = ['global', 'unit', 'objective', 'terrain', 'context'] as const;

export function getTokenTypeIndex(tokenType: typeof TOKEN_TYPE_ORDER[number]): number {
  return TOKEN_TYPE_ORDER.indexOf(tokenType);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return fallback;
  }
  return numerator / denominator;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

export function tanhScaled(value: number, scale: number): number {
  return Math.tanh(value / Math.max(1e-6, scale));
}

export function softmax(logits: number[], temperature = 1): number[] {
  if (logits.length === 0) return [];
  const scaledTemperature = Math.max(1e-6, temperature);
  const maxLogit = Math.max(...logits);
  const exps = logits.map((logit) => Math.exp((logit - maxLogit) / scaledTemperature));
  const total = sum(exps);
  if (total <= 0 || !Number.isFinite(total)) {
    return Array.from({ length: logits.length }, () => 1 / logits.length);
  }
  return exps.map((entry) => entry / total);
}

export function shannonEntropy(probabilities: number[]): number {
  return probabilities.reduce((total, probability) => {
    if (probability <= 0) return total;
    return total - (probability * Math.log(probability + 1e-12));
  }, 0);
}

export function buildFeatureVector(values: number[], dimension: number): number[] {
  if (values.length === dimension) return values;
  if (values.length > dimension) return values.slice(0, dimension);
  return [...values, ...Array.from({ length: dimension - values.length }, () => 0)];
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashToUnitInterval(value: string, salt = ''): number {
  return fnv1a(`${salt}:${value}`) / 0xffffffff;
}

export function hashToSigned(value: string, salt = ''): number {
  return (hashToUnitInterval(value, salt) * 2) - 1;
}

export function buildHashedFeatureSlice(value: string, count: number, salt: string): number[] {
  return Array.from({ length: count }, (_, index) => hashToSigned(value, `${salt}:${index}`));
}

function normalizeAxis(value: number, limit: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return clamp(value / limit, 0, 1);
}

export function toRootRelativePosition(
  position: Position,
  battlefield: BattlefieldDimensions,
  rootPlayerIndex: number,
): Position {
  const normalizedX = normalizeAxis(position.x, battlefield.width);
  const normalizedY = normalizeAxis(position.y, battlefield.height);
  if (rootPlayerIndex === 0) {
    return { x: normalizedX, y: normalizedY };
  }
  return {
    x: 1 - normalizedX,
    y: 1 - normalizedY,
  };
}

export function buildFourierCoordinateFeatures(
  position: Position | null,
  battlefield: BattlefieldDimensions,
  rootPlayerIndex: number,
): number[] {
  if (!position) {
    return Array.from({ length: ALPHA_COORDINATE_FEATURE_DIMENSION }, () => 0);
  }

  const relative = toRootRelativePosition(position, battlefield, rootPlayerIndex);
  const frequencies = [1, 2, 4, 8];
  const features: number[] = [relative.x, relative.y];
  for (const frequency of frequencies) {
    features.push(Math.sin(relative.x * Math.PI * frequency));
    features.push(Math.cos(relative.x * Math.PI * frequency));
    features.push(Math.sin(relative.y * Math.PI * frequency));
    features.push(Math.cos(relative.y * Math.PI * frequency));
  }
  return buildFeatureVector(features, ALPHA_COORDINATE_FEATURE_DIMENSION);
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as {
    Buffer?: {
      from(input: Uint8Array): { toString(encoding: 'base64'): string };
    };
  }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const maybeBuffer = (globalThis as {
    Buffer?: {
      from(input: string, encoding: 'base64'): Uint8Array;
    };
  }).Buffer;
  if (maybeBuffer) {
    return new Uint8Array(maybeBuffer.from(encoded, 'base64'));
  }

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeFloat32Array(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  return bytesToBase64(bytes.slice());
}

export function decodeFloat32Array(encoded: string): Float32Array {
  const bytes = base64ToBytes(encoded);
  const copy = bytes.slice();
  return new Float32Array(copy.buffer);
}

export function serializeAlphaTensor(tensor: AlphaTensor): SerializedAlphaTensor {
  return {
    shape: [...tensor.shape],
    dataBase64: encodeFloat32Array(tensor.data),
  };
}

export function deserializeAlphaTensor(serialized: SerializedAlphaTensor): AlphaTensor {
  return {
    shape: [...serialized.shape],
    data: decodeFloat32Array(serialized.dataBase64),
  };
}

export function serializeAlphaModel(model: AlphaModel): SerializedAlphaModel {
  return {
    manifest: model.manifest,
    tensors: Object.fromEntries(
      Object.entries(model.tensors).map(([name, tensor]) => [name, serializeAlphaTensor(tensor)]),
    ),
  };
}

export function deserializeAlphaModel(serialized: SerializedAlphaModel): AlphaModel {
  return {
    manifest: serialized.manifest,
    tensors: Object.fromEntries(
      Object.entries(serialized.tensors).map(([name, tensor]) => [name, deserializeAlphaTensor(tensor)]),
    ),
  };
}

export function calculateAlphaWeightsChecksum(model: AlphaModel | SerializedAlphaModel): string {
  const manifestWithoutChecksum = { ...model.manifest };
  delete (manifestWithoutChecksum as { weightsChecksum?: string }).weightsChecksum;
  return hashStableValue({
    manifest: manifestWithoutChecksum,
    tensors: Object.entries(model.tensors)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, tensor]) => ({
        name,
        shape: tensor.shape,
        dataBase64: 'dataBase64' in tensor ? tensor.dataBase64 : encodeFloat32Array(tensor.data),
      })),
  });
}

export function defaultAlphaModelHyperparameters() {
  return {
    stateFeatureDimension: ALPHA_STATE_FEATURE_DIMENSION,
    actionFeatureDimension: ALPHA_ACTION_FEATURE_DIMENSION,
    coordinateFeatureDimension: ALPHA_COORDINATE_FEATURE_DIMENSION,
    tokenTypeCount: TOKEN_TYPE_ORDER.length,
    modelWidth: ALPHA_MODEL_WIDTH,
    layerCount: ALPHA_LAYER_COUNT,
    attentionHeads: ALPHA_ATTENTION_HEADS,
    feedForwardWidth: ALPHA_FFN_WIDTH,
    dropoutRate: ALPHA_DROPOUT_RATE,
    maxStateTokens: ALPHA_MAX_STATE_TOKENS,
    maxActionTokens: ALPHA_MAX_ACTION_TOKENS,
  };
}

export function createDefaultAlphaSearchConfig(config: AIPlayerConfig): AlphaSearchConfig {
  if (config.strategyTier !== AIStrategyTier.Alpha) {
    throw new Error('Alpha search config requested for a non-Alpha AI player.');
  }

  const timeBudgetMs = config.timeBudgetMs ?? ALPHA_TOURNAMENT_TIME_BUDGET_MS;
  const maxSimulations = config.maxSimulations
    ?? (timeBudgetMs <= ALPHA_BALANCED_TIME_BUDGET_MS
      ? ALPHA_BALANCED_MAX_SIMULATIONS
      : ALPHA_TOURNAMENT_MAX_SIMULATIONS);

  return {
    timeBudgetMs,
    maxSimulations: Math.max(32, maxSimulations),
    alphaModelId: config.alphaModelId ?? DEFAULT_ALPHA_MODEL_ID,
    baseSeed: config.baseSeed ?? 9001,
    diagnosticsEnabled: config.diagnosticsEnabled ?? false,
    batchSize: ALPHA_BATCH_SIZE,
    maxRootActions: timeBudgetMs <= ALPHA_BALANCED_TIME_BUDGET_MS ? 18 : 24,
    maxActionsPerUnit: timeBudgetMs <= ALPHA_BALANCED_TIME_BUDGET_MS ? 4 : 5,
    maxAutoAdvanceSteps: 8,
    puctExploration: 1.35,
    dirichletAlpha: 0.22,
    dirichletEpsilon: 0,
    policyPriorBlend: 0.2,
    valueBlend: 0.15,
    rootTemperature: 1,
    reuseRoots: true,
  };
}
