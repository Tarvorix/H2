import { describe, expect, it } from 'vitest';
import {
  buildUnitDeploymentFormation,
  type DeploymentFormationPreset,
} from './deployment-formations';

function countRows(
  preset: DeploymentFormationPreset,
  modelCount: number,
): number[] {
  const positions = buildUnitDeploymentFormation(
    modelCount,
    { x: 24, y: 6 },
    0,
    72,
    48,
    12,
    preset,
  );

  const rows = new Map<number, number>();
  for (const position of positions) {
    rows.set(position.y, (rows.get(position.y) ?? 0) + 1);
  }

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1]);
}

describe('buildUnitDeploymentFormation', () => {
  it('builds a single-rank line formation', () => {
    expect(countRows('line', 10)).toEqual([10]);
  });

  it('builds a two-rank formation', () => {
    expect(countRows('double-rank', 10)).toEqual([5, 5]);
  });

  it('builds a square-ish block formation', () => {
    expect(countRows('block', 10)).toEqual([4, 4, 2]);
  });

  it('builds a single-file column formation', () => {
    expect(countRows('column', 4)).toEqual([1, 1, 1, 1]);
  });

  it('clamps formations so they remain inside the deployment zone and battlefield', () => {
    const positions = buildUnitDeploymentFormation(
      10,
      { x: 1, y: 11.8 },
      0,
      72,
      48,
      12,
      'line',
    );

    expect(positions).toHaveLength(10);
    for (const position of positions) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(72);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(12);
    }
  });
});
