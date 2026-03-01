import { describe, it, expect } from 'vitest';
import {
  blastOverlap,
  isModelHitByBlast,
  createStandardTemplate,
  getTemplateVertices,
  templateOverlap,
  applyScatter,
  randomScatter,
  blastSizeToRadius,
} from './blast-template';
import { createCircleBaseInches, createRectHull } from './shapes';

// ─── Blast Marker Overlap ────────────────────────────────────────────────────

describe('blastOverlap', () => {
  it('blast on cluster of 5 models: hits models within blast radius', () => {
    // 3" blast (radius 1.5") centered at (5, 5)
    const models = [
      createCircleBaseInches({ x: 5, y: 5 }, 0.5),       // at center — hit
      createCircleBaseInches({ x: 5, y: 6 }, 0.5),       // 1" away — hit (1 < 1.5+0.5)
      createCircleBaseInches({ x: 5, y: 7 }, 0.5),       // 2" away — hit (2 <= 1.5+0.5)
      createCircleBaseInches({ x: 5, y: 8 }, 0.5),       // 3" away — miss (3 > 2)
      createCircleBaseInches({ x: 5, y: 3 }, 0.5),       // 2" away — hit
    ];
    const hits = blastOverlap({ x: 5, y: 5 }, 1.5, models);
    expect(hits).toContain(0);
    expect(hits).toContain(1);
    expect(hits).toContain(2);
    expect(hits).not.toContain(3);
    expect(hits).toContain(4);
    expect(hits).toHaveLength(4);
  });

  it('blast misses all models', () => {
    const models = [
      createCircleBaseInches({ x: 20, y: 20 }, 0.5),
      createCircleBaseInches({ x: 30, y: 30 }, 0.5),
    ];
    const hits = blastOverlap({ x: 0, y: 0 }, 1.5, models);
    expect(hits).toHaveLength(0);
  });

  it('5" large blast (radius 2.5")', () => {
    const models = [
      createCircleBaseInches({ x: 10, y: 10 }, 0.63), // at center
      createCircleBaseInches({ x: 12, y: 10 }, 0.63), // 2" away — hit (2 < 2.5+0.63)
      createCircleBaseInches({ x: 14, y: 10 }, 0.63), // 4" away — miss (4 > 3.13)
    ];
    const hits = blastOverlap({ x: 10, y: 10 }, 2.5, models);
    expect(hits).toContain(0);
    expect(hits).toContain(1);
    expect(hits).not.toContain(2);
  });

  it('blast partially overlapping a base counts as hit', () => {
    // Model at exactly blast radius + model radius distance — just touching
    const model = createCircleBaseInches({ x: 2, y: 0 }, 0.5);
    const hits = blastOverlap({ x: 0, y: 0 }, 1.5, [model]);
    expect(hits).toContain(0); // 2 <= 1.5 + 0.5 = 2.0
  });
});

describe('isModelHitByBlast', () => {
  it('vehicle hull hit by blast', () => {
    const vehicle = createRectHull({ x: 5, y: 5 }, 4, 2, 0);
    // Blast centered at (0, 5) with radius 3.5 — vehicle nearest edge at x=3
    // Distance from (0,5) to nearest edge = 3, which is < 3.5
    expect(isModelHitByBlast({ x: 0, y: 5 }, 3.5, vehicle)).toBe(true);
  });

  it('vehicle hull missed by blast', () => {
    const vehicle = createRectHull({ x: 20, y: 20 }, 4, 2, 0);
    expect(isModelHitByBlast({ x: 0, y: 0 }, 1.5, vehicle)).toBe(false);
  });
});

// ─── Template Weapon Overlap ─────────────────────────────────────────────────

describe('templateOverlap', () => {
  it('template covers models in its path', () => {
    // Template pointing right from (0,0)
    const template = createStandardTemplate({ x: 0, y: 0 }, 0);

    const models = [
      createCircleBaseInches({ x: 4, y: 0 }, 0.5),   // in the middle of template — hit
      createCircleBaseInches({ x: 7, y: 0 }, 0.5),   // near wide end — hit
      createCircleBaseInches({ x: 4, y: 5 }, 0.5),   // off to the side — miss
      createCircleBaseInches({ x: -2, y: 0 }, 0.5),  // behind template — miss
    ];
    const hits = templateOverlap(template, models);
    expect(hits).toContain(0);
    expect(hits).toContain(1);
    expect(hits).not.toContain(2);
    expect(hits).not.toContain(3);
  });

  it('empty model list returns empty', () => {
    const template = createStandardTemplate({ x: 0, y: 0 }, 0);
    expect(templateOverlap(template, [])).toHaveLength(0);
  });
});

describe('getTemplateVertices', () => {
  it('returns 4 vertices forming a trapezoid', () => {
    const template = createStandardTemplate({ x: 0, y: 0 }, 0);
    const vertices = getTemplateVertices(template);
    expect(vertices).toHaveLength(4);
  });

  it('template pointing right has far end at x ≈ 8"', () => {
    const template = createStandardTemplate({ x: 0, y: 0 }, 0);
    const vertices = getTemplateVertices(template);
    // Far end vertices should have x ≈ 8
    const maxX = Math.max(...vertices.map(v => v.x));
    expect(maxX).toBeCloseTo(8, 1);
  });

  it('template pointing up has far end at y ≈ 8"', () => {
    const template = createStandardTemplate({ x: 0, y: 0 }, Math.PI / 2);
    const vertices = getTemplateVertices(template);
    const maxY = Math.max(...vertices.map(v => v.y));
    expect(maxY).toBeCloseTo(8, 1);
  });
});

// ─── Scatter Mechanic ────────────────────────────────────────────────────────

describe('applyScatter', () => {
  it('HIT result: marker stays in place', () => {
    const result = applyScatter(
      { x: 10, y: 10 },
      { angle: 0, distance: 5, isHit: true },
    );
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
  });

  it('scatter right by 3"', () => {
    const result = applyScatter(
      { x: 10, y: 10 },
      { angle: 0, distance: 3, isHit: false },
    );
    expect(result.x).toBeCloseTo(13, 10);
    expect(result.y).toBeCloseTo(10, 10);
  });

  it('scatter up by 5"', () => {
    const result = applyScatter(
      { x: 10, y: 10 },
      { angle: Math.PI / 2, distance: 5, isHit: false },
    );
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(15, 10);
  });

  it('scatter at 45 degrees by 4"', () => {
    const result = applyScatter(
      { x: 0, y: 0 },
      { angle: Math.PI / 4, distance: 4, isHit: false },
    );
    const expected = 4 * Math.SQRT2 / 2;
    expect(result.x).toBeCloseTo(expected, 10);
    expect(result.y).toBeCloseTo(expected, 10);
  });
});

describe('randomScatter', () => {
  it('returns valid scatter result', () => {
    const result = randomScatter();
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThan(2 * Math.PI);
    expect(result.distance).toBeGreaterThanOrEqual(1);
    expect(result.distance).toBeLessThanOrEqual(6);
    expect(typeof result.isHit).toBe('boolean');
  });

  it('generates varied results (run 100 times)', () => {
    const results = Array.from({ length: 100 }, () => randomScatter());
    const hitCount = results.filter(r => r.isHit).length;
    // Should have roughly 33% hits (2/6 faces), but allow wide margin
    expect(hitCount).toBeGreaterThan(0);
    expect(hitCount).toBeLessThan(100);
  });
});

// ─── Blast Size Helpers ──────────────────────────────────────────────────────

describe('blastSizeToRadius', () => {
  it('3" blast → 1.5" radius', () => {
    expect(blastSizeToRadius(3)).toBe(1.5);
  });

  it('5" blast → 2.5" radius', () => {
    expect(blastSizeToRadius(5)).toBe(2.5);
  });

  it('7" blast → 3.5" radius', () => {
    expect(blastSizeToRadius(7)).toBe(3.5);
  });
});
