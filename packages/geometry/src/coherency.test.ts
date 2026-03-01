import { describe, it, expect } from 'vitest';
import { checkCoherency, isUnitCoherent } from './coherency';
import { createCircleBaseInches, createRectHull } from './shapes';
import type { ModelShape } from './shapes';

// ─── Helper ──────────────────────────────────────────────────────────────────

// Standard 32mm base radius in inches: 16mm / 25.4 ≈ 0.6299"
const BASE_RADIUS = 0.6299;

/**
 * Create a line of infantry models along the x-axis with a given edge-to-edge spacing.
 * Edge spacing = center spacing - 2 * radius
 * So center spacing = edgeSpacing + 2 * radius
 */
function createLine(count: number, edgeSpacing: number, startX: number = 0, y: number = 10): ModelShape[] {
  const centerSpacing = edgeSpacing + 2 * BASE_RADIUS;
  return Array.from({ length: count }, (_, i) =>
    createCircleBaseInches({ x: startX + i * centerSpacing, y }, BASE_RADIUS),
  );
}

// ─── Trivial Cases ────────────────────────────────────────────────────────────

describe('checkCoherency — trivial cases', () => {
  it('empty unit → coherent', () => {
    const result = checkCoherency([], 2);
    expect(result.isCoherent).toBe(true);
    expect(result.coherentModelIndices).toHaveLength(0);
    expect(result.incoherentModelIndices).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it('single model → coherent', () => {
    const models = [createCircleBaseInches({ x: 10, y: 10 }, BASE_RADIUS)];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
    expect(result.coherentModelIndices).toEqual([0]);
    expect(result.incoherentModelIndices).toHaveLength(0);
  });
});

// ─── Two Models ───────────────────────────────────────────────────────────────

describe('checkCoherency — two models', () => {
  it('two models within 2" (edge-to-edge) → coherent', () => {
    const models = createLine(2, 1.5); // 1.5" edge spacing < 2"
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toEqual([0, 1]);
  });

  it('two models exactly at 2" → coherent (within EPSILON)', () => {
    const models = createLine(2, 2.0); // 2.0" edge spacing = 2"
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
  });

  it('two models beyond 2" → incoherent', () => {
    const models = createLine(2, 2.5); // 2.5" edge spacing > 2"
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(false);
    expect(result.coherentModelIndices).toEqual([0]);
    expect(result.incoherentModelIndices).toEqual([1]);
    expect(result.links).toHaveLength(0);
  });

  it('two models in base contact → coherent', () => {
    // Base contact: edge distance = 0, so center distance = 2 * radius
    const models = [
      createCircleBaseInches({ x: 10, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 10 + 2 * BASE_RADIUS, y: 10 }, BASE_RADIUS),
    ];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
  });
});

// ─── 10-Man Squad ─────────────────────────────────────────────────────────────

describe('checkCoherency — 10-man squad', () => {
  it('10 models in line 1.9" apart (edge-to-edge) → coherent', () => {
    const models = createLine(10, 1.9);
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
    expect(result.coherentModelIndices).toHaveLength(10);
    expect(result.incoherentModelIndices).toHaveLength(0);
    // Should have 9 links (each adjacent pair)
    expect(result.links.length).toBeGreaterThanOrEqual(9);
  });

  it('10 models with one at 2.1" from nearest → incoherent', () => {
    // First 9 at 1.5" spacing, then 10th model at 2.1" from model 9
    const models: ModelShape[] = [];
    const centerSpacing1 = 1.5 + 2 * BASE_RADIUS;
    for (let i = 0; i < 9; i++) {
      models.push(createCircleBaseInches({ x: i * centerSpacing1, y: 10 }, BASE_RADIUS));
    }
    // Last model: edge distance = 2.1" from model 8
    const lastX = 8 * centerSpacing1 + 2.1 + 2 * BASE_RADIUS;
    models.push(createCircleBaseInches({ x: lastX, y: 10 }, BASE_RADIUS));

    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(false);
    expect(result.incoherentModelIndices).toContain(9);
  });
});

// ─── Chain Connectivity ───────────────────────────────────────────────────────

describe('checkCoherency — chain connectivity', () => {
  it('A–B–C chain where A-C > range but A-B and B-C in range → coherent', () => {
    // A at (0, 10), B at (3.2, 10), C at (6.4, 10)
    // Edge A-B: 3.2 - 2*0.6299 = 1.94" < 2" ✓
    // Edge B-C: 3.2 - 2*0.6299 = 1.94" < 2" ✓
    // Edge A-C: 6.4 - 2*0.6299 = 5.14" > 2" ✗ (but connected through B)
    const models = [
      createCircleBaseInches({ x: 0, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 3.2, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 6.4, y: 10 }, BASE_RADIUS),
    ];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
    expect(result.coherentModelIndices).toHaveLength(3);
  });
});

// ─── Triangle Formation ───────────────────────────────────────────────────────

describe('checkCoherency — formations', () => {
  it('three models in triangle, all within range → coherent', () => {
    // Equilateral-ish triangle with 1.5" edge spacing
    const models = [
      createCircleBaseInches({ x: 10, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 12, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 11, y: 11.5 }, BASE_RADIUS),
    ];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
    // All 3 pairs should be linked
    expect(result.links).toHaveLength(3);
  });

  it('disconnected subgroup: 3 models + 1 far away → incoherent', () => {
    const models = [
      createCircleBaseInches({ x: 10, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 12, y: 10 }, BASE_RADIUS),
      createCircleBaseInches({ x: 11, y: 11.5 }, BASE_RADIUS),
      createCircleBaseInches({ x: 50, y: 50 }, BASE_RADIUS), // far away
    ];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(false);
    expect(result.coherentModelIndices).toEqual([0, 1, 2]);
    expect(result.incoherentModelIndices).toEqual([3]);
  });
});

// ─── Skirmish Coherency ──────────────────────────────────────────────────────

describe('checkCoherency — skirmish range', () => {
  it('models 2.5" apart: incoherent at 2" range', () => {
    const models = createLine(3, 2.5);
    expect(checkCoherency(models, 2).isCoherent).toBe(false);
  });

  it('models 2.5" apart: coherent at 3" range', () => {
    const models = createLine(3, 2.5);
    expect(checkCoherency(models, 3).isCoherent).toBe(true);
  });

  it('models 3.1" apart: incoherent at 3" range', () => {
    const models = createLine(3, 3.1);
    expect(checkCoherency(models, 3).isCoherent).toBe(false);
  });
});

// ─── isUnitCoherent Convenience ───────────────────────────────────────────────

describe('isUnitCoherent', () => {
  it('standard coherency (2") — coherent squad', () => {
    const models = createLine(5, 1.5);
    expect(isUnitCoherent(models)).toBe(true);
  });

  it('standard coherency (2") — incoherent squad', () => {
    const models = createLine(5, 2.5);
    expect(isUnitCoherent(models)).toBe(false);
  });

  it('skirmish coherency (3") — coherent at 2.5" spacing', () => {
    const models = createLine(5, 2.5);
    expect(isUnitCoherent(models, true)).toBe(true);
  });

  it('skirmish coherency (3") — incoherent at 3.5" spacing', () => {
    const models = createLine(5, 3.5);
    expect(isUnitCoherent(models, true)).toBe(false);
  });
});

// ─── Vehicle Models ───────────────────────────────────────────────────────────

describe('checkCoherency — mixed shapes', () => {
  it('circle and rect within range → coherent', () => {
    // Infantry at (10, 10) radius 0.63
    // Vehicle at (13, 10) width=4, height=2 → left edge at x=11
    // Edge distance: 11 - (10 + 0.63) = 0.37" < 2" ✓
    const models: ModelShape[] = [
      createCircleBaseInches({ x: 10, y: 10 }, 0.63),
      createRectHull({ x: 13, y: 10 }, 4, 2, 0),
    ];
    const result = checkCoherency(models, 2);
    expect(result.isCoherent).toBe(true);
  });
});
