/**
 * Movement Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { TerrainType } from '@hh/types';
import type { TerrainPiece, ModelState } from '@hh/types';
import {
  BASE_32MM_DIAMETER,
  createCircleBase,
  createRectTerrain,
} from '@hh/geometry';
import type { ModelShape } from '@hh/geometry';
import {
  computeTerrainPenalty,
  isInDangerousTerrain,
  pathCrossesImpassable,
  pathEntersExclusionZone,
  validateModelMove,
  validateCoherencyAfterMove,
  getEffectiveMovement,
  DIFFICULT_TERRAIN_PENALTY,
} from './movement-validator';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(
  id: string,
  x: number,
  y: number,
  unitProfileId = 'tactical',
  profileModelName = 'Legionary',
): ModelState {
  return {
    id,
    profileModelName,
    unitProfileId,
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function makeCircle(x: number, y: number, baseMM = 32): ModelShape {
  return createCircleBase({ x, y }, baseMM);
}

function makeDifficultTerrain(x: number, y: number, w: number, h: number): TerrainPiece {
  return createRectTerrain(
    'diff-1', 'Difficult Area', TerrainType.Difficult,
    { x, y }, w, h, true, false,
  );
}

function makeDangerousTerrain(x: number, y: number, w: number, h: number): TerrainPiece {
  return createRectTerrain(
    'dang-1', 'Dangerous Area', TerrainType.Dangerous,
    { x, y }, w, h, true, true,
  );
}

function makeImpassableTerrain(x: number, y: number, w: number, h: number): TerrainPiece {
  return createRectTerrain(
    'imp-1', 'Impassable Wall', TerrainType.Impassable,
    { x, y }, w, h, false, false,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeTerrainPenalty', () => {
  it('should return 0 on open ground', () => {
    expect(computeTerrainPenalty({ x: 10, y: 10 }, [])).toBe(0);
  });

  it('should return 2 when ending in difficult terrain', () => {
    const terrain = [makeDifficultTerrain(5, 5, 10, 10)];
    expect(computeTerrainPenalty({ x: 10, y: 10 }, terrain)).toBe(DIFFICULT_TERRAIN_PENALTY);
  });

  it('should return 2 when ending in dangerous terrain', () => {
    const terrain = [makeDangerousTerrain(5, 5, 10, 10)];
    expect(computeTerrainPenalty({ x: 10, y: 10 }, terrain)).toBe(DIFFICULT_TERRAIN_PENALTY);
  });

  it('should return 0 when not in terrain', () => {
    const terrain = [makeDifficultTerrain(20, 20, 5, 5)];
    expect(computeTerrainPenalty({ x: 5, y: 5 }, terrain)).toBe(0);
  });

  it('should return 0 for impassable terrain (separate check)', () => {
    const terrain: TerrainPiece[] = [{
      id: 'imp',
      name: 'Wall',
      type: TerrainType.Impassable,
      shape: { kind: 'rectangle', topLeft: { x: 5, y: 5 }, width: 10, height: 10 },
      isDifficult: false,
      isDangerous: false,
    }];
    // Impassable isn't "difficult" — it's blocked entirely
    expect(computeTerrainPenalty({ x: 10, y: 10 }, terrain)).toBe(0);
  });

  it('should detect terrain with isDifficult flag regardless of type', () => {
    const terrain: TerrainPiece[] = [{
      id: 'lt',
      name: 'Light Rubble',
      type: TerrainType.LightArea,
      shape: { kind: 'rectangle', topLeft: { x: 0, y: 0 }, width: 20, height: 20 },
      isDifficult: true,
      isDangerous: false,
    }];
    expect(computeTerrainPenalty({ x: 10, y: 10 }, terrain)).toBe(DIFFICULT_TERRAIN_PENALTY);
  });
});

describe('isInDangerousTerrain', () => {
  it('should return false on open ground', () => {
    expect(isInDangerousTerrain({ x: 10, y: 10 }, [])).toBe(false);
  });

  it('should return true in dangerous terrain', () => {
    const terrain = [makeDangerousTerrain(5, 5, 10, 10)];
    expect(isInDangerousTerrain({ x: 10, y: 10 }, terrain)).toBe(true);
  });

  it('should return false in difficult (non-dangerous) terrain', () => {
    const terrain = [makeDifficultTerrain(5, 5, 10, 10)];
    expect(isInDangerousTerrain({ x: 10, y: 10 }, terrain)).toBe(false);
  });

  it('should detect isDangerous flag on any terrain type', () => {
    const terrain: TerrainPiece[] = [{
      id: 'lt',
      name: 'Toxic Pool',
      type: TerrainType.LightArea,
      shape: { kind: 'rectangle', topLeft: { x: 0, y: 0 }, width: 20, height: 20 },
      isDifficult: false,
      isDangerous: true,
    }];
    expect(isInDangerousTerrain({ x: 10, y: 10 }, terrain)).toBe(true);
  });
});

describe('pathCrossesImpassable', () => {
  it('should return false with no impassable terrain', () => {
    expect(pathCrossesImpassable({ x: 0, y: 0 }, { x: 10, y: 10 }, [])).toBe(false);
  });

  it('should return false when path avoids impassable terrain', () => {
    const terrain = [makeImpassableTerrain(20, 20, 5, 5)];
    expect(pathCrossesImpassable({ x: 0, y: 0 }, { x: 10, y: 0 }, terrain)).toBe(false);
  });

  it('should return true when path crosses impassable terrain', () => {
    const terrain = [makeImpassableTerrain(4, 0, 2, 2)];
    expect(pathCrossesImpassable({ x: 0, y: 1 }, { x: 10, y: 1 }, terrain)).toBe(true);
  });

  it('should return false for zero-length path', () => {
    const terrain = [makeImpassableTerrain(0, 0, 5, 5)];
    expect(pathCrossesImpassable({ x: 10, y: 10 }, { x: 10, y: 10 }, terrain)).toBe(false);
  });

  it('should detect impassable at start of path', () => {
    const terrain = [makeImpassableTerrain(0, 0, 2, 2)];
    expect(pathCrossesImpassable({ x: 1, y: 1 }, { x: 10, y: 10 }, terrain)).toBe(true);
  });

  it('should detect impassable at end of path', () => {
    const terrain = [makeImpassableTerrain(9, 9, 2, 2)];
    expect(pathCrossesImpassable({ x: 0, y: 0 }, { x: 10, y: 10 }, terrain)).toBe(true);
  });
});

describe('pathEntersExclusionZone', () => {
  it('should return false when endpoint is clear', () => {
    const enemies = [makeCircle(20, 20)];
    expect(pathEntersExclusionZone({ x: 0, y: 0 }, { x: 5, y: 5 }, enemies)).toBe(false);
  });

  it('should return true when endpoint is in exclusion zone', () => {
    const enemies = [makeCircle(5, 5)];
    // 32mm base radius ≈ 0.63". Exclusion zone = base edge + 1".
    // Position 5.5, 5 is within 1" of enemy base edge
    expect(pathEntersExclusionZone({ x: 0, y: 5 }, { x: 5.5, y: 5 }, enemies)).toBe(true);
  });
});

describe('validateModelMove', () => {
  const bfWidth = 72;
  const bfHeight = 48;

  it('should accept valid move within range on open ground', () => {
    const model = createModel('m1', 10, 10);
    const errors = validateModelMove(
      model, { x: 17, y: 10 }, 7, [], [], [], bfWidth, bfHeight,
    );
    expect(errors).toHaveLength(0);
  });

  it('should reject move that exceeds movement range', () => {
    const model = createModel('m1', 10, 10);
    const errors = validateModelMove(
      model, { x: 20, y: 10 }, 7, [], [], [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'EXCEEDS_MOVEMENT')).toBe(true);
  });

  it('should reject move into impassable terrain', () => {
    const model = createModel('m1', 10, 10);
    const terrain = [makeImpassableTerrain(14, 8, 4, 4)];
    const errors = validateModelMove(
      model, { x: 16, y: 10 }, 7, terrain, [], [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'IN_IMPASSABLE_TERRAIN')).toBe(true);
  });

  it('should reject move through impassable terrain', () => {
    const model = createModel('m1', 10, 10);
    const terrain = [makeImpassableTerrain(12, 9, 2, 2)];
    const errors = validateModelMove(
      model, { x: 17, y: 10 }, 7, terrain, [], [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'PATH_CROSSES_IMPASSABLE')).toBe(true);
  });

  it('should reject move into enemy exclusion zone', () => {
    const model = createModel('m1', 10, 10);
    const enemies = [makeCircle(18, 10)];
    // Moving to 17, 10 is within 1" of enemy at 18, 10 (32mm base ~0.63" radius)
    // dist = 1", but edge-to-edge is 1 - 0.63 = 0.37" < 1"
    const errors = validateModelMove(
      model, { x: 17, y: 10 }, 7, [], enemies, [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'IN_EXCLUSION_ZONE')).toBe(true);
  });

  it('should reject move out of battlefield bounds', () => {
    const model = createModel('m1', 5, 5);
    const errors = validateModelMove(
      model, { x: -1, y: 5 }, 10, [], [], [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'OUT_OF_BOUNDS')).toBe(true);
  });

  it('should use the moving model base size instead of a fixed 32mm default for overlap checks', () => {
    const model = createModel(
      'contemptor-0',
      10,
      10,
      'contemptor-dreadnought',
      'Contemptor Dreadnought',
    );
    // Center spacing 1.5" overlaps a 60mm base against 32mm, but not 32mm vs 32mm.
    const friendlyShapes = [makeCircle(13.5, 10, 32)];
    const errors = validateModelMove(
      model, { x: 12, y: 10 }, 7, [], [], friendlyShapes, bfWidth, bfHeight,
    );

    expect(errors.some((error) => error.code === 'BASE_OVERLAP')).toBe(true);
  });

  it('should allow friendly bases to touch without counting as overlap', () => {
    const model = createModel('m1', 10, 10);
    const friendlyShapes = [makeCircle(12 + BASE_32MM_DIAMETER, 10, 32)];
    const errors = validateModelMove(
      model, { x: 12, y: 10 }, 7, [], [], friendlyShapes, bfWidth, bfHeight,
    );

    expect(errors.some((error) => error.code === 'BASE_OVERLAP')).toBe(false);
  });

  it('should account for difficult terrain penalty in range check', () => {
    const model = createModel('m1', 10, 10);
    const terrain = [makeDifficultTerrain(14, 8, 6, 6)];
    // M=7, terrain penalty=2, effective=5. Moving 6" into difficult terrain should fail
    const errors = validateModelMove(
      model, { x: 16, y: 10 }, 7, terrain, [], [], bfWidth, bfHeight,
    );
    expect(errors.some(e => e.code === 'EXCEEDS_MOVEMENT')).toBe(true);
  });

  it('should allow move within effective range in difficult terrain', () => {
    const model = createModel('m1', 10, 10);
    const terrain = [makeDifficultTerrain(12, 8, 6, 6)];
    // M=7, terrain penalty=2, effective=5. Moving 4" into difficult terrain should work
    const errors = validateModelMove(
      model, { x: 14, y: 10 }, 7, terrain, [], [], bfWidth, bfHeight,
    );
    expect(errors).toHaveLength(0);
  });

  it('should return multiple errors simultaneously', () => {
    const model = createModel('m1', 10, 10);
    const terrain = [makeImpassableTerrain(14, 8, 4, 4)];
    // Move too far, into impassable, through impassable
    const errors = validateModelMove(
      model, { x: 16, y: 10 }, 3, terrain, [], [], bfWidth, bfHeight,
    );
    expect(errors.length).toBeGreaterThan(1);
  });
});

describe('validateCoherencyAfterMove', () => {
  it('should pass for a single model', () => {
    const shapes = [makeCircle(10, 10)];
    const result = validateCoherencyAfterMove(shapes);
    expect(result.isCoherent).toBe(true);
  });

  it('should pass for models within 2" of each other', () => {
    // 32mm bases with centers 2.5" apart: edge-to-edge = 2.5 - 2*0.63 = 1.24" < 2"
    const shapes = [
      makeCircle(10, 10),
      makeCircle(12.5, 10),
      makeCircle(15, 10),
    ];
    const result = validateCoherencyAfterMove(shapes);
    expect(result.isCoherent).toBe(true);
  });

  it('should fail for models too far apart', () => {
    // 10" gap: edge-to-edge = 10 - 2*0.63 = 8.74" > 2"
    const shapes = [
      makeCircle(0, 0),
      makeCircle(10, 0),
    ];
    const result = validateCoherencyAfterMove(shapes);
    expect(result.isCoherent).toBe(false);
  });

  it('should identify disconnected models', () => {
    const shapes = [
      makeCircle(0, 0),
      makeCircle(2, 0), // within 2" of first
      makeCircle(20, 0), // too far from both
    ];
    const result = validateCoherencyAfterMove(shapes);
    expect(result.isCoherent).toBe(false);
    expect(result.incoherentModelIndices).toContain(2);
  });
});

describe('getEffectiveMovement', () => {
  it('should return full movement on open ground', () => {
    expect(getEffectiveMovement(7, { x: 10, y: 10 }, [])).toBe(7);
  });

  it('should reduce by 2 in difficult terrain', () => {
    const terrain = [makeDifficultTerrain(5, 5, 10, 10)];
    expect(getEffectiveMovement(7, { x: 10, y: 10 }, terrain)).toBe(5);
  });

  it('should not go below 0', () => {
    const terrain = [makeDifficultTerrain(5, 5, 10, 10)];
    expect(getEffectiveMovement(1, { x: 10, y: 10 }, terrain)).toBe(0);
  });
});

describe('Integration: 10 Marines move 7" open ground', () => {
  it('should validate all moves and maintain coherency', () => {
    // 10 Marines in a line, 1.5" apart, moving 7" forward
    const models: ModelState[] = [];
    for (let i = 0; i < 10; i++) {
      models.push(createModel(`m${i}`, 10 + i * 1.5, 24));
    }

    // Move all models 7" forward (y direction)
    const newPositions = models.map(m => ({
      x: m.position.x,
      y: m.position.y + 7,
    }));

    // Validate each move
    for (let i = 0; i < 10; i++) {
      const errors = validateModelMove(
        models[i], newPositions[i], 7, [], [], [], 72, 48,
      );
      expect(errors).toHaveLength(0);
    }

    // Check coherency after movement
    const shapes = newPositions.map(p => makeCircle(p.x, p.y));
    const coherency = validateCoherencyAfterMove(shapes);
    expect(coherency.isCoherent).toBe(true);
  });
});

describe('Integration: Model attempts to move within 1" of enemy', () => {
  it('should block move ending within 1" of enemy', () => {
    const model = createModel('m1', 10, 24);
    const enemy = makeCircle(14, 24, 32);
    // Try to move to 13.5, 24 — very close to enemy at 14
    // Edge-to-edge: |13.5 - 14| - 2 * 0.63 = 0.5 - 1.26 < 0 (overlapping!)
    const errors = validateModelMove(
      model, { x: 13.5, y: 24 }, 7, [], [enemy], [], 72, 48,
    );
    expect(errors.some(e => e.code === 'IN_EXCLUSION_ZONE')).toBe(true);
  });
});

describe('Integration: Unit enters difficult terrain', () => {
  it('should reduce effective movement by 2" in difficult terrain', () => {
    const model = createModel('m1', 10, 24);
    const terrain = [makeDifficultTerrain(14, 20, 10, 10)];

    // Move 7" would reach 17, but effective is 5" in difficult terrain
    // So move to 15 (5" away) should pass
    const validErrors = validateModelMove(
      model, { x: 15, y: 24 }, 7, terrain, [], [], 72, 48,
    );
    expect(validErrors).toHaveLength(0);

    // Move to 16 (6" away) with effective 5" should fail
    const invalidErrors = validateModelMove(
      model, { x: 16, y: 24 }, 7, terrain, [], [], 72, 48,
    );
    expect(invalidErrors.some(e => e.code === 'EXCEEDS_MOVEMENT')).toBe(true);
  });
});
