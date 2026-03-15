import type { SerializedAlphaModel } from '../types';
import { deserializeAlphaModel, serializeAlphaModel } from './common';

export { serializeAlphaModel, deserializeAlphaModel };

export function cloneSerializedAlphaModel(model: SerializedAlphaModel): SerializedAlphaModel {
  return serializeAlphaModel(deserializeAlphaModel(model));
}
