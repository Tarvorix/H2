import { describe, it, expect } from 'vitest';
import { TerrainType } from '@hh/types';
import type { TerrainPiece } from '@hh/types';
import {
  computeMovementEnvelope,
  isWithinMovementRange,
  isInExclusionZone,
  isInImpassableTerrain,
} from './movement-envelope';
import { createCircleBaseInches, createRectHull } from './shapes';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const impassableTerrain: TerrainPiece = {
  id: 'impassable-1',
  name: 'Lava Pool',
  type: TerrainType.Impassable,
  shape: {
    kind: 'circle',
    center: { x: 25, y: 20 },
    radius: 3,
  },
  isDifficult: false,
  isDangerous: false,
};

const difficultTerrain: TerrainPiece = {
  id: 'difficult-1',
  name: 'Rubble Field',
  type: TerrainType.MediumArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 18, y: 15 },
    width: 5,
    height: 5,
  },
  isDifficult: true,
  isDangerous: false,
};

const dangerousTerrain: TerrainPiece = {
  id: 'dangerous-1',
  name: 'Radiation Zone',
  type: TerrainType.Dangerous,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 28, y: 15 },
    width: 4,
    height: 4,
  },
  isDifficult: false,
  isDangerous: true,
};

const farTerrain: TerrainPiece = {
  id: 'far-1',
  name: 'Distant Ruins',
  type: TerrainType.HeavyArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 60, y: 40 },
    width: 4,
    height: 4,
  },
  isDifficult: false,
  isDangerous: false,
};

// ─── computeMovementEnvelope ──────────────────────────────────────────────────

describe('computeMovementEnvelope', () => {
  it('open field: boundary has ~72 points', () => {
    const model = createCircleBaseInches({ x: 36, y: 24 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [], []);
    // 72-point circle, may gain a few points from clipping but not many
    expect(result.boundary.length).toBeGreaterThanOrEqual(72);
    expect(result.maxDistance).toBe(7);
  });

  it('open field: all boundary points are within maxDistance of model center', () => {
    const model = createCircleBaseInches({ x: 36, y: 24 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [], []);
    for (const point of result.boundary) {
      const dx = point.x - 36;
      const dy = point.y - 24;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeLessThanOrEqual(7 + 0.01);
    }
  });

  it('model near battlefield edge: boundary clipped to bounds', () => {
    // Model at (2, 2) with 7" move — some points would be outside bounds
    const model = createCircleBaseInches({ x: 2, y: 2 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [], []);
    for (const point of result.boundary) {
      expect(point.x).toBeGreaterThanOrEqual(-0.001);
      expect(point.y).toBeGreaterThanOrEqual(-0.001);
      expect(point.x).toBeLessThanOrEqual(72.001);
      expect(point.y).toBeLessThanOrEqual(48.001);
    }
  });

  it('model at corner: boundary heavily clipped', () => {
    const model = createCircleBaseInches({ x: 0, y: 0 }, 0.63);
    const result = computeMovementEnvelope(model, 10, [], []);
    // Should have fewer than 72 points due to clipping (roughly quarter circle + corners)
    expect(result.boundary.length).toBeGreaterThan(0);
    for (const point of result.boundary) {
      expect(point.x).toBeGreaterThanOrEqual(-0.001);
      expect(point.y).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('custom battlefield dimensions respected', () => {
    const model = createCircleBaseInches({ x: 18, y: 12 }, 0.63);
    const result = computeMovementEnvelope(model, 20, [], [], 36, 24);
    for (const point of result.boundary) {
      expect(point.x).toBeLessThanOrEqual(36.001);
      expect(point.y).toBeLessThanOrEqual(24.001);
    }
  });

  it('difficult terrain within envelope → difficultZones populated', () => {
    const model = createCircleBaseInches({ x: 20, y: 17 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [difficultTerrain], []);
    expect(result.difficultZones).toHaveLength(1);
    expect(result.difficultZones[0].id).toBe('difficult-1');
  });

  it('dangerous terrain within envelope → dangerousZones populated', () => {
    const model = createCircleBaseInches({ x: 30, y: 17 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [dangerousTerrain], []);
    expect(result.dangerousZones).toHaveLength(1);
    expect(result.dangerousZones[0].id).toBe('dangerous-1');
  });

  it('impassable terrain within envelope → impassableZones populated', () => {
    const model = createCircleBaseInches({ x: 22, y: 20 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [impassableTerrain], []);
    expect(result.impassableZones).toHaveLength(1);
    expect(result.impassableZones[0].id).toBe('impassable-1');
  });

  it('terrain outside envelope → not included in zones', () => {
    const model = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [farTerrain], []);
    expect(result.difficultZones).toHaveLength(0);
    expect(result.dangerousZones).toHaveLength(0);
    expect(result.impassableZones).toHaveLength(0);
  });

  it('enemy nearby → exclusionZones populated', () => {
    const model = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    const enemy = createCircleBaseInches({ x: 25, y: 20 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [], [enemy]);
    expect(result.exclusionZones).toHaveLength(1);
    expect(result.exclusionZones[0].center).toEqual({ x: 25, y: 20 });
    // radius should be enemy base radius + 1" exclusion
    expect(result.exclusionZones[0].radius).toBeCloseTo(0.63 + 1, 2);
  });

  it('enemy far away → exclusionZones empty', () => {
    const model = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    const enemy = createCircleBaseInches({ x: 50, y: 40 }, 0.63);
    const result = computeMovementEnvelope(model, 7, [], [enemy]);
    expect(result.exclusionZones).toHaveLength(0);
  });

  it('vehicle enemy → exclusionZone uses bounding radius', () => {
    const model = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    const enemyVehicle = createRectHull({ x: 24, y: 20 }, 4, 2, 0);
    const result = computeMovementEnvelope(model, 7, [], [enemyVehicle]);
    expect(result.exclusionZones).toHaveLength(1);
    // Half diagonal of 4x2 = sqrt(4+1) = ~2.236, + 1" exclusion = ~3.236
    expect(result.exclusionZones[0].radius).toBeCloseTo(Math.sqrt(5) + 1, 2);
  });
});

// ─── isWithinMovementRange ────────────────────────────────────────────────────

describe('isWithinMovementRange', () => {
  const model = createCircleBaseInches({ x: 20, y: 20 }, 0.63);

  it('target within range → true', () => {
    expect(isWithinMovementRange(model, { x: 25, y: 20 }, 7)).toBe(true);
  });

  it('target outside range → false', () => {
    expect(isWithinMovementRange(model, { x: 30, y: 20 }, 7)).toBe(false);
  });

  it('target exactly at range → true', () => {
    expect(isWithinMovementRange(model, { x: 27, y: 20 }, 7)).toBe(true);
  });

  it('target at zero distance → true', () => {
    expect(isWithinMovementRange(model, { x: 20, y: 20 }, 7)).toBe(true);
  });
});

// ─── isInExclusionZone ────────────────────────────────────────────────────────

describe('isInExclusionZone', () => {
  it('position within 1" of enemy circle base → true', () => {
    const enemy = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    // Position at (21.5, 20): distance to center = 1.5, edge distance = 1.5 - 0.63 = 0.87 < 1
    expect(isInExclusionZone({ x: 21.5, y: 20 }, [enemy])).toBe(true);
  });

  it('position beyond 1" of enemy circle base → false', () => {
    const enemy = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    // Position at (22, 20): distance to center = 2, edge distance = 2 - 0.63 = 1.37 > 1
    expect(isInExclusionZone({ x: 22, y: 20 }, [enemy])).toBe(false);
  });

  it('position exactly at 1" from enemy edge → false (not strictly less than)', () => {
    const enemy = createCircleBaseInches({ x: 20, y: 20 }, 0.63);
    // Edge distance = exactly 1": center distance = 0.63 + 1 = 1.63
    expect(isInExclusionZone({ x: 21.63, y: 20 }, [enemy])).toBe(false);
  });

  it('position within 1" of enemy rect hull → true', () => {
    const enemy = createRectHull({ x: 20, y: 20 }, 4, 2, 0);
    // Rect hull extends from x=18 to x=22, y=19 to y=21
    // Position at (22.5, 20): distance to nearest edge (x=22) = 0.5 < 1
    expect(isInExclusionZone({ x: 22.5, y: 20 }, [enemy])).toBe(true);
  });

  it('position beyond 1" of enemy rect hull → false', () => {
    const enemy = createRectHull({ x: 20, y: 20 }, 4, 2, 0);
    // Position at (24, 20): distance to nearest edge (x=22) = 2 > 1
    expect(isInExclusionZone({ x: 24, y: 20 }, [enemy])).toBe(false);
  });

  it('multiple enemies, in zone of one → true', () => {
    const enemies = [
      createCircleBaseInches({ x: 10, y: 10 }, 0.63),
      createCircleBaseInches({ x: 20, y: 20 }, 0.63),
    ];
    // Within 1" of second enemy
    expect(isInExclusionZone({ x: 21.5, y: 20 }, enemies)).toBe(true);
  });

  it('no enemies → false', () => {
    expect(isInExclusionZone({ x: 20, y: 20 }, [])).toBe(false);
  });
});

// ─── isInImpassableTerrain ────────────────────────────────────────────────────

describe('isInImpassableTerrain', () => {
  it('position inside impassable terrain → true', () => {
    expect(isInImpassableTerrain({ x: 25, y: 20 }, [impassableTerrain])).toBe(true);
  });

  it('position outside impassable terrain → false', () => {
    expect(isInImpassableTerrain({ x: 10, y: 10 }, [impassableTerrain])).toBe(false);
  });

  it('position inside non-impassable terrain → false', () => {
    expect(isInImpassableTerrain({ x: 20, y: 17 }, [difficultTerrain])).toBe(false);
  });

  it('no terrain → false', () => {
    expect(isInImpassableTerrain({ x: 20, y: 20 }, [])).toBe(false);
  });

  it('position inside one of multiple impassable terrains → true', () => {
    const impassable2: TerrainPiece = {
      id: 'impassable-2',
      name: 'Void Rift',
      type: TerrainType.Impassable,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 40, y: 10 },
        width: 5,
        height: 5,
      },
      isDifficult: false,
      isDangerous: false,
    };
    expect(isInImpassableTerrain({ x: 42, y: 12 }, [impassableTerrain, impassable2])).toBe(true);
  });
});
