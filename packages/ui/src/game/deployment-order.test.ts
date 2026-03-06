import { describe, expect, it } from 'vitest';
import { FixedDiceProvider } from '@hh/engine';
import { rollDeploymentFirstPlayerIndex } from './deployment-order';

describe('rollDeploymentFirstPlayerIndex', () => {
  it('returns the player who loses the deployment roll-off', () => {
    expect(rollDeploymentFirstPlayerIndex(new FixedDiceProvider([2, 5]))).toBe(0);
    expect(rollDeploymentFirstPlayerIndex(new FixedDiceProvider([6, 1]))).toBe(1);
  });

  it('re-rolls ties until one player loses', () => {
    const dice = new FixedDiceProvider([4, 4, 5, 2]);

    expect(rollDeploymentFirstPlayerIndex(dice)).toBe(1);
    expect(dice.rollsUsed).toBe(4);
  });
});
