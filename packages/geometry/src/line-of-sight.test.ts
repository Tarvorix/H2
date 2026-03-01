import { describe, it, expect } from 'vitest';
import { checkLOS, hasLOS } from './line-of-sight';
import { createCircleBaseInches, createRectHull } from './shapes';
import { TerrainType } from '@hh/types';
import type { TerrainPiece } from '@hh/types';

// ─── Test Terrain Fixtures ───────────────────────────────────────────────────

const heavyTerrain: TerrainPiece = {
  id: 'heavy-1',
  name: 'Fortified Bunker',
  type: TerrainType.HeavyArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 14, y: 8 },
    width: 4,
    height: 6,
  },
  isDifficult: false,
  isDangerous: false,
};

const lightTerrain: TerrainPiece = {
  id: 'light-1',
  name: 'Scattered Brush',
  type: TerrainType.LightArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 14, y: 8 },
    width: 4,
    height: 6,
  },
  isDifficult: false,
  isDangerous: false,
};

const narrowMediumTerrain: TerrainPiece = {
  id: 'medium-narrow',
  name: 'Thin Ruins',
  type: TerrainType.MediumArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 15, y: 5 },
    width: 2,
    height: 12,
  },
  isDifficult: true,
  isDangerous: false,
};

const wideMediumTerrain: TerrainPiece = {
  id: 'medium-wide',
  name: 'Dense Forest',
  type: TerrainType.MediumArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 13, y: 5 },
    width: 6,
    height: 12,
  },
  isDifficult: true,
  isDangerous: false,
};

const terrainPiece: TerrainPiece = {
  id: 'piece-1',
  name: 'Solid Wall',
  type: TerrainType.TerrainPiece,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 14, y: 8 },
    width: 4,
    height: 6,
  },
  isDifficult: false,
  isDangerous: false,
};

const impassableTerrain: TerrainPiece = {
  id: 'impassable-1',
  name: 'Lava Pool',
  type: TerrainType.Impassable,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 14, y: 8 },
    width: 4,
    height: 6,
  },
  isDifficult: false,
  isDangerous: false,
};

// ─── Open Field (No Obstructions) ────────────────────────────────────────────

describe('LOS — Open Field', () => {
  it('two infantry in open field have LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    expect(hasLOS(a, b, [], [])).toBe(true);
  });

  it('infantry and vehicle in open field have LOS', () => {
    const infantry = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const vehicle = createRectHull({ x: 25, y: 10 }, 4, 2, 0);
    expect(hasLOS(infantry, vehicle, [], [])).toBe(true);
  });

  it('two vehicles in open field have LOS', () => {
    const a = createRectHull({ x: 10, y: 10 }, 4, 2, 0);
    const b = createRectHull({ x: 30, y: 10 }, 4, 2, 0);
    expect(hasLOS(a, b, [], [])).toBe(true);
  });

  it('checkLOS returns rays with diagnostic info in open field', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const result = checkLOS(a, b, [], []);
    expect(result.hasLOS).toBe(true);
    expect(result.rays.length).toBeGreaterThan(0);
    // All rays should be unblocked
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(false);
    }
  });
});

// ─── Base Contact ─────────────────────────────────────────────────────────────

describe('LOS — Base Contact', () => {
  it('models in base contact always have LOS', () => {
    // Two 32mm bases touching: center distance = 0.63 + 0.63 = 1.26"
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 11.26, y: 10 }, 0.63);
    expect(hasLOS(a, b, [heavyTerrain], [])).toBe(true);
  });

  it('base contact LOS ignores all terrain', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 11.26, y: 10 }, 0.63);
    const result = checkLOS(a, b, [heavyTerrain, impassableTerrain, terrainPiece], []);
    expect(result.hasLOS).toBe(true);
    // No rays generated — base contact shortcut
    expect(result.rays).toHaveLength(0);
  });
});

// ─── Heavy Area Terrain ───────────────────────────────────────────────────────

describe('LOS — Heavy Area Terrain', () => {
  it('Heavy Area Terrain between models blocks LOS', () => {
    // Model A at x=10, Model B at x=22, heavy terrain at x=14-18
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [heavyTerrain], [])).toBe(false);
  });

  it('checkLOS marks rays as blocked by heavy_area', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [heavyTerrain], []);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(true);
      expect(ray.blockingReason).toBe('heavy_area');
    }
  });

  it('Heavy Area Terrain off to the side does not block LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 2 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 2 }, 0.63);
    // Heavy terrain is at y=8-14, models are at y=2
    expect(hasLOS(a, b, [heavyTerrain], [])).toBe(true);
  });
});

// ─── Light Area Terrain ───────────────────────────────────────────────────────

describe('LOS — Light Area Terrain', () => {
  it('Light Area Terrain never blocks LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [lightTerrain], [])).toBe(true);
  });

  it('checkLOS rays through Light terrain are unblocked', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [lightTerrain], []);
    expect(result.hasLOS).toBe(true);
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(false);
    }
  });
});

// ─── Medium Area Terrain ──────────────────────────────────────────────────────

describe('LOS — Medium Area Terrain', () => {
  it('Medium Area <3" chord: LOS exists (cover only)', () => {
    // Narrow medium terrain (2" wide) at x=15-17
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [narrowMediumTerrain], [])).toBe(true);
  });

  it('Medium Area >3" chord: LOS blocked', () => {
    // Wide medium terrain (6" wide) at x=13-19
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [wideMediumTerrain], [])).toBe(false);
  });

  it('checkLOS marks rays blocked by medium_area_chord', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [wideMediumTerrain], []);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      if (ray.isBlocked) {
        expect(ray.blockingReason).toBe('medium_area_chord');
      }
    }
  });
});

// ─── Terrain Piece ────────────────────────────────────────────────────────────

describe('LOS — Terrain Piece', () => {
  it('Terrain Piece always blocks LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [terrainPiece], [])).toBe(false);
  });

  it('checkLOS marks rays blocked by terrain_piece', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [terrainPiece], []);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(true);
      expect(ray.blockingReason).toBe('terrain_piece');
    }
  });
});

// ─── Impassable Terrain ───────────────────────────────────────────────────────

describe('LOS — Impassable Terrain', () => {
  it('Impassable terrain always blocks LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [impassableTerrain], [])).toBe(false);
  });

  it('checkLOS marks rays blocked by impassable', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [impassableTerrain], []);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(true);
      expect(ray.blockingReason).toBe('impassable');
    }
  });
});

// ─── Vehicle Hull Blocking ────────────────────────────────────────────────────

describe('LOS — Vehicle Hull Blocking', () => {
  it('vehicle hull between two infantry blocks LOS', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const blockingVehicle = createRectHull({ x: 16, y: 10 }, 4, 2, 0);
    expect(hasLOS(a, b, [], [blockingVehicle])).toBe(false);
  });

  it('vehicle hull off to the side does not block', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const farVehicle = createRectHull({ x: 16, y: 25 }, 4, 2, 0);
    expect(hasLOS(a, b, [], [farVehicle])).toBe(true);
  });

  it('checkLOS marks rays blocked by vehicle', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const blockingVehicle = createRectHull({ x: 16, y: 10 }, 4, 2, 0);
    const result = checkLOS(a, b, [], [blockingVehicle]);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      expect(ray.isBlocked).toBe(true);
      expect(ray.blockingReason).toBe('vehicle');
    }
  });
});

// ─── Mixed Terrain Scenarios ──────────────────────────────────────────────────

describe('LOS — Mixed Terrain', () => {
  it('light terrain + heavy terrain: heavy blocks', () => {
    const a = createCircleBaseInches({ x: 5, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 25, y: 11 }, 0.63);
    expect(hasLOS(a, b, [lightTerrain, heavyTerrain], [])).toBe(false);
  });

  it('narrow medium + vehicle hull: vehicle blocks', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const blockingVehicle = createRectHull({ x: 16, y: 10 }, 4, 2, 0);
    expect(hasLOS(a, b, [narrowMediumTerrain], [blockingVehicle])).toBe(false);
  });
});

// ─── Dangerous/Difficult Terrain (Never Blocks) ──────────────────────────────

describe('LOS — Non-Blocking Terrain Types', () => {
  it('Dangerous terrain does not block LOS', () => {
    const dangerousTerrain: TerrainPiece = {
      id: 'danger-1',
      name: 'Radiation Zone',
      type: TerrainType.Dangerous,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 14, y: 8 },
        width: 4,
        height: 6,
      },
      isDifficult: false,
      isDangerous: true,
    };
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [dangerousTerrain], [])).toBe(true);
  });

  it('Difficult terrain does not block LOS', () => {
    const difficultTerrain: TerrainPiece = {
      id: 'diff-1',
      name: 'Rubble',
      type: TerrainType.Difficult,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 14, y: 8 },
        width: 4,
        height: 6,
      },
      isDifficult: true,
      isDangerous: false,
    };
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [difficultTerrain], [])).toBe(true);
  });
});

// ─── hasLOS vs checkLOS Consistency ───────────────────────────────────────────

describe('LOS — hasLOS matches checkLOS', () => {
  it('hasLOS agrees with checkLOS.hasLOS (open field)', () => {
    const a = createCircleBaseInches({ x: 10, y: 10 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 10 }, 0.63);
    const full = checkLOS(a, b, [], []);
    const quick = hasLOS(a, b, [], []);
    expect(quick).toBe(full.hasLOS);
  });

  it('hasLOS agrees with checkLOS.hasLOS (blocked)', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const full = checkLOS(a, b, [heavyTerrain], []);
    const quick = hasLOS(a, b, [heavyTerrain], []);
    expect(quick).toBe(full.hasLOS);
  });
});

// ─── Terrain Intersection Details ─────────────────────────────────────────────

describe('LOS — Terrain Intersection Details', () => {
  it('checkLOS records terrain intersections on rays', () => {
    // Narrow medium terrain — LOS exists but rays record the intersection
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [narrowMediumTerrain], []);
    expect(result.hasLOS).toBe(true);
    // At least some rays should have terrain intersections recorded
    const raysWithIntersections = result.rays.filter(r => r.terrainIntersections.length > 0);
    expect(raysWithIntersections.length).toBeGreaterThan(0);
    for (const ray of raysWithIntersections) {
      for (const inter of ray.terrainIntersections) {
        expect(inter.terrainId).toBe('medium-narrow');
        expect(inter.chordLength).toBeGreaterThan(0);
        expect(inter.chordLength).toBeLessThan(3);
      }
    }
  });

  it('blocked rays through wide medium record chord > 3"', () => {
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    const result = checkLOS(a, b, [wideMediumTerrain], []);
    expect(result.hasLOS).toBe(false);
    for (const ray of result.rays) {
      if (ray.terrainIntersections.length > 0) {
        for (const inter of ray.terrainIntersections) {
          expect(inter.chordLength).toBeGreaterThan(3);
        }
      }
    }
  });
});

// ─── Polygon Terrain ──────────────────────────────────────────────────────────

describe('LOS — Polygon Terrain', () => {
  it('polygon heavy terrain blocks LOS', () => {
    const polyHeavy: TerrainPiece = {
      id: 'poly-heavy',
      name: 'Fortification',
      type: TerrainType.HeavyArea,
      shape: {
        kind: 'polygon',
        vertices: [
          { x: 14, y: 8 },
          { x: 18, y: 8 },
          { x: 18, y: 14 },
          { x: 14, y: 14 },
        ],
      },
      isDifficult: false,
      isDangerous: false,
    };
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [polyHeavy], [])).toBe(false);
  });
});

// ─── Circle Terrain ───────────────────────────────────────────────────────────

describe('LOS — Circle Terrain', () => {
  it('circle heavy terrain blocks LOS', () => {
    const circleHeavy: TerrainPiece = {
      id: 'circle-heavy',
      name: 'Crater Bunker',
      type: TerrainType.HeavyArea,
      shape: {
        kind: 'circle',
        center: { x: 16, y: 11 },
        radius: 3,
      },
      isDifficult: false,
      isDangerous: false,
    };
    const a = createCircleBaseInches({ x: 10, y: 11 }, 0.63);
    const b = createCircleBaseInches({ x: 22, y: 11 }, 0.63);
    expect(hasLOS(a, b, [circleHeavy], [])).toBe(false);
  });
});
