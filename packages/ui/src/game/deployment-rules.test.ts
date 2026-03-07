import { describe, expect, it } from 'vitest';
import { DeploymentMap } from '@hh/types';
import { DAWN_OF_WAR, SEARCH_AND_DESTROY } from '@hh/data';
import {
  buildDeploymentFormationForZone,
  isPointInDeploymentZone,
} from './deployment-rules';

describe('deployment-rules', () => {
  it('builds Dawn of War line formations inside the short-edge deployment zone', () => {
    const [zone] = DAWN_OF_WAR.getZones(72, 48);

    const positions = buildDeploymentFormationForZone(
      10,
      { x: 4, y: 24 },
      DeploymentMap.DawnOfWar,
      0,
      72,
      48,
      zone,
      'line',
    );

    expect(positions).toHaveLength(10);
    expect(new Set(positions.map((position) => position.x))).toHaveLength(1);
    expect(new Set(positions.map((position) => position.y)).size).toBeGreaterThan(1);
    expect(positions.every((position) => isPointInDeploymentZone(position, zone))).toBe(true);
  });

  it('rotates Dawn of War line formations when requested', () => {
    const [zone] = DAWN_OF_WAR.getZones(72, 48);

    const positions = buildDeploymentFormationForZone(
      10,
      { x: 6, y: 24 },
      DeploymentMap.DawnOfWar,
      0,
      72,
      48,
      zone,
      'line',
      { rotationQuarterTurns: 1, spacingInches: 1.3 },
    );

    expect(positions).toHaveLength(10);
    expect(new Set(positions.map((position) => position.y))).toHaveLength(1);
    expect(new Set(positions.map((position) => position.x)).size).toBeGreaterThan(1);
    expect(positions.every((position) => isPointInDeploymentZone(position, zone))).toBe(true);
  });

  it('fits Search and Destroy block formations inside the diagonal corner zone', () => {
    const [zone] = SEARCH_AND_DESTROY.getZones(72, 48);

    const positions = buildDeploymentFormationForZone(
      10,
      { x: 6, y: 6 },
      DeploymentMap.SearchAndDestroy,
      0,
      72,
      48,
      zone,
      'block',
      { spacingInches: 1.3 },
    );

    expect(positions).toHaveLength(10);
    expect(positions.every((position) => isPointInDeploymentZone(position, zone))).toBe(true);
  });

  it('finds a legal in-zone anchor for large line formations clicked near the edge', () => {
    const [zone] = DAWN_OF_WAR.getZones(72, 48);

    const positions = buildDeploymentFormationForZone(
      22,
      { x: 2, y: 0.5 },
      DeploymentMap.DawnOfWar,
      0,
      72,
      48,
      zone,
      'line',
      { spacingInches: 1.3 },
    );

    expect(positions).toHaveLength(22);
    expect(positions.every((position) => isPointInDeploymentZone(position, zone))).toBe(true);
  });
});
