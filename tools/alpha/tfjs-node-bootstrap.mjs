import * as tf from '@tensorflow/tfjs-node';

await tf.setBackend('tensorflow');
await tf.ready();

export const ALPHA_TENSORFLOW_BACKEND = {
  backend: tf.getBackend(),
  platform: 'node',
  package: '@tensorflow/tfjs-node',
};
