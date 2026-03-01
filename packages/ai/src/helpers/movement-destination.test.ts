/**
 * Movement Destination Tests
 *
 * Tests for movement calculation helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  clampToBattlefield,
  distanceBetween,
  calculateRandomMovePosition,
  calculateDirectionalMovePosition,
  spreadModelsAroundCentroid,
  generateLineFormation,
} from './movement-destination';

// ─── clampToBattlefield Tests ────────────────────────────────────────────────

describe('clampToBattlefield', () => {
  it('returns the position unchanged if within bounds', () => {
    const result = clampToBattlefield({ x: 36, y: 24 }, 72, 48);
    expect(result).toEqual({ x: 36, y: 24 });
  });

  it('clamps x to edge margin on left', () => {
    const result = clampToBattlefield({ x: -5, y: 24 }, 72, 48);
    expect(result.x).toBe(0.5);
    expect(result.y).toBe(24);
  });

  it('clamps x to edge margin on right', () => {
    const result = clampToBattlefield({ x: 80, y: 24 }, 72, 48);
    expect(result.x).toBe(71.5);
    expect(result.y).toBe(24);
  });

  it('clamps y to edge margin on top', () => {
    const result = clampToBattlefield({ x: 36, y: -5 }, 72, 48);
    expect(result.x).toBe(36);
    expect(result.y).toBe(0.5);
  });

  it('clamps y to edge margin on bottom', () => {
    const result = clampToBattlefield({ x: 36, y: 55 }, 72, 48);
    expect(result.x).toBe(36);
    expect(result.y).toBe(47.5);
  });

  it('clamps both x and y when out of bounds', () => {
    const result = clampToBattlefield({ x: -1, y: 100 }, 72, 48);
    expect(result).toEqual({ x: 0.5, y: 47.5 });
  });
});

// ─── distanceBetween Tests ───────────────────────────────────────────────────

describe('distanceBetween', () => {
  it('returns 0 for same position', () => {
    expect(distanceBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('calculates horizontal distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
  });

  it('calculates vertical distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(10);
  });

  it('calculates diagonal distance (3-4-5 triangle)', () => {
    const dist = distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(dist).toBe(5);
  });
});

// ─── calculateRandomMovePosition Tests ───────────────────────────────────────

describe('calculateRandomMovePosition', () => {
  it('returns a position within battlefield bounds', () => {
    for (let i = 0; i < 20; i++) {
      const pos = calculateRandomMovePosition({ x: 36, y: 24 }, 7, 72, 48);
      expect(pos.x).toBeGreaterThanOrEqual(0.5);
      expect(pos.x).toBeLessThanOrEqual(71.5);
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('returns a position within max distance of current', () => {
    const current = { x: 36, y: 24 };
    for (let i = 0; i < 20; i++) {
      const pos = calculateRandomMovePosition(current, 7, 72, 48);
      const dist = distanceBetween(current, pos);
      expect(dist).toBeLessThanOrEqual(7 + 0.01);
    }
  });
});

// ─── calculateDirectionalMovePosition Tests ──────────────────────────────────

describe('calculateDirectionalMovePosition', () => {
  it('moves directly to the target if within max distance', () => {
    const result = calculateDirectionalMovePosition(
      { x: 10, y: 10 },
      { x: 12, y: 10 },
      7,
      72,
      48,
    );
    expect(result.x).toBeCloseTo(12, 1);
    expect(result.y).toBeCloseTo(10, 1);
  });

  it('moves max distance toward the target if beyond range', () => {
    const result = calculateDirectionalMovePosition(
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      7,
      72,
      48,
    );
    expect(result.x).toBeCloseTo(17, 1);
    expect(result.y).toBeCloseTo(10, 1);
  });

  it('handles diagonal movement', () => {
    const result = calculateDirectionalMovePosition(
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      10,
      200,
      200,
    );
    const dist = distanceBetween({ x: 0, y: 0 }, result);
    expect(dist).toBeCloseTo(10, 1);
  });

  it('clamps result to battlefield', () => {
    const result = calculateDirectionalMovePosition(
      { x: 70, y: 10 },
      { x: 100, y: 10 },
      10,
      72,
      48,
    );
    expect(result.x).toBeLessThanOrEqual(71.5);
  });
});

// ─── spreadModelsAroundCentroid Tests ───────────────────────────────────────

describe('spreadModelsAroundCentroid', () => {
  it('returns empty array for 0 models', () => {
    const result = spreadModelsAroundCentroid({ x: 36, y: 24 }, 0, 5, 72, 48);
    expect(result).toEqual([]);
  });

  it('returns centroid for 1 model', () => {
    const result = spreadModelsAroundCentroid({ x: 36, y: 24 }, 1, 5, 72, 48);
    expect(result.length).toBe(1);
    expect(result[0].x).toBeCloseTo(36, 1);
    expect(result[0].y).toBeCloseTo(24, 1);
  });

  it('returns correct number of positions', () => {
    const result = spreadModelsAroundCentroid({ x: 36, y: 24 }, 5, 10, 72, 48);
    expect(result.length).toBe(5);
  });

  it('all positions are within battlefield bounds', () => {
    const result = spreadModelsAroundCentroid({ x: 2, y: 2 }, 10, 5, 72, 48);
    for (const pos of result) {
      expect(pos.x).toBeGreaterThanOrEqual(0.5);
      expect(pos.x).toBeLessThanOrEqual(71.5);
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(47.5);
    }
  });
});

// ─── generateLineFormation Tests ─────────────────────────────────────────────

describe('generateLineFormation', () => {
  it('returns empty array for 0 models', () => {
    const result = generateLineFormation(0, 0, 12, 72, 48);
    expect(result).toEqual([]);
  });

  it('returns correct number of positions', () => {
    const result = generateLineFormation(5, 0, 12, 72, 48);
    expect(result.length).toBe(5);
  });

  it('positions are within the y zone range', () => {
    const result = generateLineFormation(5, 2, 12, 72, 48, 0.5);
    for (const pos of result) {
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(12);
    }
  });

  it('positions are within battlefield bounds', () => {
    const result = generateLineFormation(10, 36, 47, 72, 48, 0.5);
    for (const pos of result) {
      expect(pos.x).toBeGreaterThanOrEqual(0.5);
      expect(pos.x).toBeLessThanOrEqual(71.5);
      expect(pos.y).toBeGreaterThanOrEqual(0.5);
      expect(pos.y).toBeLessThanOrEqual(47.5);
    }
  });

  it('uses preferredY to position the line within the zone', () => {
    const resultFront = generateLineFormation(3, 1, 12, 72, 48, 0.0);
    const resultBack = generateLineFormation(3, 1, 12, 72, 48, 1.0);

    // Front should be near y=1
    expect(resultFront[0].y).toBeLessThanOrEqual(2);
    // Back should be near y=12
    expect(resultBack[0].y).toBeCloseTo(12, 1);
  });
});
