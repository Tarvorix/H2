import { describe, it, expect } from 'vitest';
import { TerrainType } from '@hh/types';
import type { TerrainPiece } from '@hh/types';
import {
  pointInTerrainShape,
  pointInTerrain,
  modelInTerrain,
  getTerrainAtPoint,
  terrainChordLength,
  getTerrainVertices,
} from './terrain';
import { createCircleBaseInches, createRectHull } from './shapes';

// ─── Test Terrain Fixtures ───────────────────────────────────────────────────

const polygonTerrain: TerrainPiece = {
  id: 'poly-1',
  name: 'Ruined Building',
  type: TerrainType.MediumArea,
  shape: {
    kind: 'polygon',
    vertices: [
      { x: 10, y: 10 },
      { x: 14, y: 10 },
      { x: 14, y: 14 },
      { x: 10, y: 14 },
    ],
  },
  isDifficult: true,
  isDangerous: false,
};

const circleTerrain: TerrainPiece = {
  id: 'circle-1',
  name: 'Crater',
  type: TerrainType.LightArea,
  shape: {
    kind: 'circle',
    center: { x: 20, y: 20 },
    radius: 3,
  },
  isDifficult: false,
  isDangerous: true,
};

const rectTerrain: TerrainPiece = {
  id: 'rect-1',
  name: 'Wall',
  type: TerrainType.HeavyArea,
  shape: {
    kind: 'rectangle',
    topLeft: { x: 30, y: 5 },
    width: 6,
    height: 2,
  },
  isDifficult: false,
  isDangerous: false,
};

// ─── Point-in-TerrainShape ───────────────────────────────────────────────────

describe('pointInTerrainShape', () => {
  it('point inside polygon terrain', () => {
    expect(pointInTerrainShape({ x: 12, y: 12 }, polygonTerrain.shape)).toBe(true);
  });

  it('point outside polygon terrain', () => {
    expect(pointInTerrainShape({ x: 5, y: 5 }, polygonTerrain.shape)).toBe(false);
  });

  it('point inside circle terrain', () => {
    expect(pointInTerrainShape({ x: 20, y: 20 }, circleTerrain.shape)).toBe(true);
  });

  it('point outside circle terrain', () => {
    expect(pointInTerrainShape({ x: 0, y: 0 }, circleTerrain.shape)).toBe(false);
  });

  it('point inside rectangle terrain', () => {
    expect(pointInTerrainShape({ x: 33, y: 6 }, rectTerrain.shape)).toBe(true);
  });

  it('point outside rectangle terrain', () => {
    expect(pointInTerrainShape({ x: 0, y: 0 }, rectTerrain.shape)).toBe(false);
  });
});

// ─── Point-in-Terrain ────────────────────────────────────────────────────────

describe('pointInTerrain', () => {
  it('delegates to shape check', () => {
    expect(pointInTerrain({ x: 12, y: 12 }, polygonTerrain)).toBe(true);
    expect(pointInTerrain({ x: 0, y: 0 }, polygonTerrain)).toBe(false);
  });
});

// ─── Model-in-Terrain ────────────────────────────────────────────────────────

describe('modelInTerrain', () => {
  it('infantry model center inside terrain', () => {
    const model = createCircleBaseInches({ x: 12, y: 12 }, 0.63);
    expect(modelInTerrain(model, polygonTerrain)).toBe(true);
  });

  it('infantry model center outside terrain', () => {
    const model = createCircleBaseInches({ x: 5, y: 5 }, 0.63);
    expect(modelInTerrain(model, polygonTerrain)).toBe(false);
  });

  it('vehicle hull center inside terrain', () => {
    const vehicle = createRectHull({ x: 12, y: 12 }, 4, 2, 0);
    expect(modelInTerrain(vehicle, polygonTerrain)).toBe(true);
  });

  it('vehicle hull center outside terrain', () => {
    const vehicle = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(modelInTerrain(vehicle, polygonTerrain)).toBe(false);
  });
});

// ─── Get Terrain at Point ────────────────────────────────────────────────────

describe('getTerrainAtPoint', () => {
  const allTerrain = [polygonTerrain, circleTerrain, rectTerrain];

  it('point in polygon terrain returns it', () => {
    const result = getTerrainAtPoint({ x: 12, y: 12 }, allTerrain);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('poly-1');
  });

  it('point in no terrain returns empty', () => {
    const result = getTerrainAtPoint({ x: 50, y: 50 }, allTerrain);
    expect(result).toHaveLength(0);
  });

  it('point in overlapping terrain returns multiple', () => {
    // Create two overlapping terrains
    const overlap1: TerrainPiece = {
      id: 'ov1',
      name: 'Area 1',
      type: TerrainType.LightArea,
      shape: { kind: 'circle', center: { x: 0, y: 0 }, radius: 5 },
      isDifficult: false,
      isDangerous: false,
    };
    const overlap2: TerrainPiece = {
      id: 'ov2',
      name: 'Area 2',
      type: TerrainType.MediumArea,
      shape: { kind: 'circle', center: { x: 3, y: 0 }, radius: 5 },
      isDifficult: true,
      isDangerous: false,
    };
    const result = getTerrainAtPoint({ x: 2, y: 0 }, [overlap1, overlap2]);
    expect(result).toHaveLength(2);
  });
});

// ─── Terrain Chord Length ────────────────────────────────────────────────────

describe('terrainChordLength', () => {
  it('ray through polygon terrain: correct chord length', () => {
    // 4" wide polygon terrain from x=10 to x=14
    const chord = terrainChordLength({ x: 0, y: 12 }, { x: 20, y: 12 }, polygonTerrain);
    expect(chord).toBeCloseTo(4, 4);
  });

  it('ray missing terrain: chord = 0', () => {
    const chord = terrainChordLength({ x: 0, y: 0 }, { x: 20, y: 0 }, polygonTerrain);
    expect(chord).toBeCloseTo(0, 10);
  });

  it('ray through circle terrain: correct chord', () => {
    // Circle at (20,20) radius 3 — ray through center
    const chord = terrainChordLength({ x: 10, y: 20 }, { x: 30, y: 20 }, circleTerrain);
    expect(chord).toBeCloseTo(6, 4); // diameter
  });

  it('ray through rectangle terrain: correct chord', () => {
    // Rectangle at (30,5) width=6, height=2
    const chord = terrainChordLength({ x: 25, y: 6 }, { x: 40, y: 6 }, rectTerrain);
    expect(chord).toBeCloseTo(6, 4);
  });

  it('Medium Area <3": would not block LOS', () => {
    // 2" wide Medium terrain
    const narrowMedium: TerrainPiece = {
      id: 'narrow',
      name: 'Thin Ruins',
      type: TerrainType.MediumArea,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 10, y: 0 },
        width: 2,
        height: 10,
      },
      isDifficult: true,
      isDangerous: false,
    };
    const chord = terrainChordLength({ x: 0, y: 5 }, { x: 20, y: 5 }, narrowMedium);
    expect(chord).toBeCloseTo(2, 4);
    expect(chord).toBeLessThan(3);
  });

  it('Medium Area >3": would block LOS', () => {
    // 5" wide Medium terrain
    const wideMedium: TerrainPiece = {
      id: 'wide',
      name: 'Dense Forest',
      type: TerrainType.MediumArea,
      shape: {
        kind: 'rectangle',
        topLeft: { x: 8, y: 0 },
        width: 5,
        height: 10,
      },
      isDifficult: true,
      isDangerous: false,
    };
    const chord = terrainChordLength({ x: 0, y: 5 }, { x: 20, y: 5 }, wideMedium);
    expect(chord).toBeCloseTo(5, 4);
    expect(chord).toBeGreaterThan(3);
  });
});

// ─── Get Terrain Vertices ────────────────────────────────────────────────────

describe('getTerrainVertices', () => {
  it('polygon shape returns vertices directly', () => {
    const vertices = getTerrainVertices(polygonTerrain.shape);
    expect(vertices).toHaveLength(4);
    expect(vertices[0]).toEqual({ x: 10, y: 10 });
  });

  it('circle shape returns 32-sided polygon', () => {
    const vertices = getTerrainVertices(circleTerrain.shape);
    expect(vertices).toHaveLength(32);
  });

  it('rectangle shape returns 4 corners', () => {
    const vertices = getTerrainVertices(rectTerrain.shape);
    expect(vertices).toHaveLength(4);
    expect(vertices[0]).toEqual({ x: 30, y: 5 });
    expect(vertices[1]).toEqual({ x: 36, y: 5 });
  });
});
