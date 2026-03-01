import { describe, it, expect } from 'vitest';
import {
  createInfantryLine,
  createInfantryLineEdgeSpacing,
  createInfantryGrid,
  createVehicle,
  createRhino,
  createLandRaider,
  createRectTerrain,
  createCircleTerrain,
  createPolygonTerrain,
  createOpenFieldScenario,
  createTerrainScenario,
  createVehicleScenario,
  createCoherencyTestScenario,
  createBlastTestScenario,
} from './scenario';
import { TerrainType } from '@hh/types';
import { BASE_32MM_RADIUS } from './constants';

// ─── Infantry Line Builders ──────────────────────────────────────────────────

describe('createInfantryLine', () => {
  it('creates the correct number of models', () => {
    const line = createInfantryLine(5, { x: 10, y: 10 }, 2);
    expect(line).toHaveLength(5);
  });

  it('first model is at origin', () => {
    const line = createInfantryLine(3, { x: 10, y: 20 }, 2);
    expect(line[0].center.x).toBeCloseTo(10);
    expect(line[0].center.y).toBeCloseTo(20);
  });

  it('models are spaced correctly along x (direction=0)', () => {
    const line = createInfantryLine(3, { x: 0, y: 0 }, 3);
    expect(line[0].center.x).toBeCloseTo(0);
    expect(line[1].center.x).toBeCloseTo(3);
    expect(line[2].center.x).toBeCloseTo(6);
  });

  it('models have correct base radius', () => {
    const line = createInfantryLine(2, { x: 0, y: 0 }, 2, 0.5);
    expect(line[0].radius).toBeCloseTo(0.5);
    expect(line[1].radius).toBeCloseTo(0.5);
  });

  it('direction parameter works (PI/2 = up)', () => {
    const line = createInfantryLine(3, { x: 10, y: 10 }, 2, BASE_32MM_RADIUS, Math.PI / 2);
    expect(line[0].center.y).toBeCloseTo(10);
    expect(line[1].center.y).toBeCloseTo(12);
    expect(line[2].center.y).toBeCloseTo(14);
    // x should stay approximately the same
    expect(line[1].center.x).toBeCloseTo(10, 5);
  });
});

describe('createInfantryLineEdgeSpacing', () => {
  it('edge spacing translates to correct center spacing', () => {
    const edgeSpacing = 1.5;
    const radius = BASE_32MM_RADIUS;
    const line = createInfantryLineEdgeSpacing(3, { x: 0, y: 0 }, edgeSpacing, radius);
    const expectedCenterSpacing = edgeSpacing + 2 * radius;
    expect(line[1].center.x).toBeCloseTo(expectedCenterSpacing, 4);
    expect(line[2].center.x).toBeCloseTo(2 * expectedCenterSpacing, 4);
  });
});

describe('createInfantryGrid', () => {
  it('creates rows × cols models', () => {
    const grid = createInfantryGrid(3, 4, { x: 0, y: 0 }, 2, 2);
    expect(grid).toHaveLength(12);
  });

  it('grid positions are correct', () => {
    const grid = createInfantryGrid(2, 2, { x: 10, y: 20 }, 3, 4);
    // Row 0, Col 0
    expect(grid[0].center.x).toBeCloseTo(10);
    expect(grid[0].center.y).toBeCloseTo(20);
    // Row 0, Col 1
    expect(grid[1].center.x).toBeCloseTo(13);
    expect(grid[1].center.y).toBeCloseTo(20);
    // Row 1, Col 0
    expect(grid[2].center.x).toBeCloseTo(10);
    expect(grid[2].center.y).toBeCloseTo(24);
    // Row 1, Col 1
    expect(grid[3].center.x).toBeCloseTo(13);
    expect(grid[3].center.y).toBeCloseTo(24);
  });
});

// ─── Vehicle Builders ────────────────────────────────────────────────────────

describe('vehicle builders', () => {
  it('createVehicle creates a rect hull', () => {
    const v = createVehicle({ x: 20, y: 20 }, 4, 2, 0);
    expect(v.kind).toBe('rect');
    expect(v.width).toBe(4);
    expect(v.height).toBe(2);
    expect(v.rotation).toBe(0);
  });

  it('createRhino creates a 4x2 hull', () => {
    const r = createRhino({ x: 10, y: 10 });
    expect(r.width).toBe(4);
    expect(r.height).toBe(2);
  });

  it('createLandRaider creates a 5x3 hull', () => {
    const lr = createLandRaider({ x: 10, y: 10 });
    expect(lr.width).toBe(5);
    expect(lr.height).toBe(3);
  });

  it('vehicle rotation is applied', () => {
    const v = createVehicle({ x: 20, y: 20 }, 4, 2, Math.PI / 4);
    expect(v.rotation).toBeCloseTo(Math.PI / 4);
  });
});

// ─── Terrain Builders ────────────────────────────────────────────────────────

describe('terrain builders', () => {
  it('createRectTerrain creates rectangle terrain', () => {
    const t = createRectTerrain('t1', 'Wall', TerrainType.HeavyArea, { x: 10, y: 10 }, 5, 3);
    expect(t.id).toBe('t1');
    expect(t.name).toBe('Wall');
    expect(t.type).toBe(TerrainType.HeavyArea);
    expect(t.shape.kind).toBe('rectangle');
    if (t.shape.kind === 'rectangle') {
      expect(t.shape.width).toBe(5);
      expect(t.shape.height).toBe(3);
    }
    expect(t.isDifficult).toBe(false);
    expect(t.isDangerous).toBe(false);
  });

  it('createCircleTerrain creates circle terrain', () => {
    const t = createCircleTerrain('c1', 'Crater', TerrainType.LightArea, { x: 20, y: 20 }, 3, false, true);
    expect(t.shape.kind).toBe('circle');
    if (t.shape.kind === 'circle') {
      expect(t.shape.radius).toBe(3);
    }
    expect(t.isDangerous).toBe(true);
  });

  it('createPolygonTerrain creates polygon terrain', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    const t = createPolygonTerrain('p1', 'Ruins', TerrainType.MediumArea, vertices, true);
    expect(t.shape.kind).toBe('polygon');
    if (t.shape.kind === 'polygon') {
      expect(t.shape.vertices).toHaveLength(4);
    }
    expect(t.isDifficult).toBe(true);
  });
});

// ─── Preset Scenarios ────────────────────────────────────────────────────────

describe('preset scenarios', () => {
  it('createOpenFieldScenario has two 10-model squads', () => {
    const s = createOpenFieldScenario();
    expect(s.player1Models).toHaveLength(10);
    expect(s.player2Models).toHaveLength(10);
    expect(s.terrain).toHaveLength(0);
    expect(s.battlefieldWidth).toBe(72);
    expect(s.battlefieldHeight).toBe(48);
  });

  it('createTerrainScenario has terrain pieces', () => {
    const s = createTerrainScenario();
    expect(s.player1Models).toHaveLength(10);
    expect(s.player2Models).toHaveLength(10);
    expect(s.terrain.length).toBeGreaterThan(0);
  });

  it('createVehicleScenario has vehicles and infantry', () => {
    const s = createVehicleScenario();
    expect(s.player1Models.length).toBeGreaterThan(5); // 5 infantry + 2 vehicles
    expect(s.player2Models.length).toBeGreaterThan(5); // 5 infantry + 2 vehicles
    const p1Vehicles = s.player1Models.filter(m => m.kind === 'rect');
    expect(p1Vehicles.length).toBe(2);
  });

  it('createCoherencyTestScenario creates 10 models', () => {
    const s = createCoherencyTestScenario(1.5);
    expect(s.player1Models).toHaveLength(10);
    expect(s.player2Models).toHaveLength(0);
  });

  it('createBlastTestScenario creates 3x3 grid', () => {
    const s = createBlastTestScenario();
    expect(s.player2Models).toHaveLength(9);
  });
});
