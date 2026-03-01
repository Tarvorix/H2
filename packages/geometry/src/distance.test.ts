import { describe, it, expect } from 'vitest';
import {
  distanceCircleToCircle,
  distanceCircleToRect,
  distanceRectToRect,
  distanceShapes,
  areInBaseContact,
  distanceRoundUp,
  isWithinRange,
} from './distance';
import {
  createCircleBase,
  createCircleBaseInches,
  createRectHull,
} from './shapes';
import { MM_TO_INCHES, EPSILON } from './constants';

// ─── Circle-to-Circle Distance ───────────────────────────────────────────────

describe('distanceCircleToCircle', () => {
  it('two 32mm bases 10" center-to-center: edge distance = 10 - 2*radius', () => {
    // 32mm diameter = 16mm radius = 16/25.4 inches radius ≈ 0.62992"
    const radius = (32 * MM_TO_INCHES) / 2;
    const a = createCircleBase({ x: 0, y: 0 }, 32);
    const b = createCircleBase({ x: 10, y: 0 }, 32);
    const expected = 10 - 2 * radius; // ≈ 8.740157
    expect(distanceCircleToCircle(a, b)).toBeCloseTo(expected, 4);
  });

  it('two unit circles 5" apart center-to-center', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    expect(distanceCircleToCircle(a, b)).toBeCloseTo(3, 10);
  });

  it('touching circles return distance 0', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 2, y: 0 }, 1);
    expect(distanceCircleToCircle(a, b)).toBeCloseTo(0, 10);
  });

  it('overlapping circles return distance 0', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 1, y: 0 }, 1);
    expect(distanceCircleToCircle(a, b)).toBe(0);
  });

  it('same position circles return distance 0', () => {
    const a = createCircleBaseInches({ x: 5, y: 5 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 5 }, 1);
    expect(distanceCircleToCircle(a, b)).toBe(0);
  });

  it('diagonal distance is correct', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 3, y: 4 }, 1);
    // Center distance = 5, edge distance = 5 - 1 - 1 = 3
    expect(distanceCircleToCircle(a, b)).toBeCloseTo(3, 10);
  });

  it('different-sized bases', () => {
    const a = createCircleBase({ x: 0, y: 0 }, 25); // 25mm
    const b = createCircleBase({ x: 5, y: 0 }, 60); // 60mm
    const radiusA = (25 * MM_TO_INCHES) / 2;
    const radiusB = (60 * MM_TO_INCHES) / 2;
    const expected = 5 - radiusA - radiusB;
    expect(distanceCircleToCircle(a, b)).toBeCloseTo(expected, 4);
  });
});

// ─── Circle-to-Rectangle Distance ────────────────────────────────────────────

describe('distanceCircleToRect', () => {
  it('circle directly to the right of rect', () => {
    const circle = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    // Rect front edge at x=2, circle left edge at x=10-1=9
    // Distance = 9 - 2 = 7
    expect(distanceCircleToRect(circle, rect)).toBeCloseTo(7, 10);
  });

  it('circle touching rect edge', () => {
    const circle = createCircleBaseInches({ x: 3, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    // Rect front edge at x=2, circle at x=3 with radius 1
    // Distance = (3 - 2) - 1 = 0
    expect(distanceCircleToRect(circle, rect)).toBeCloseTo(0, 10);
  });

  it('circle overlapping rect returns 0', () => {
    const circle = createCircleBaseInches({ x: 2, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(distanceCircleToRect(circle, rect)).toBe(0);
  });

  it('circle above rect', () => {
    const circle = createCircleBaseInches({ x: 0, y: 5 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    // Rect top edge at y=1, circle bottom edge at y=5-1=4
    // Distance = 4 - 1 = 3
    expect(distanceCircleToRect(circle, rect)).toBeCloseTo(3, 10);
  });

  it('circle near corner of rect', () => {
    const circle = createCircleBaseInches({ x: 5, y: 5 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    // Closest rect corner is (2, 1)
    // Distance from circle center to corner = sqrt(9+16) = sqrt(25) = 5 wait...
    // sqrt((5-2)^2 + (5-1)^2) = sqrt(9+16) = 5
    // Edge distance = 5 - 1 = 4
    expect(distanceCircleToRect(circle, rect)).toBeCloseTo(4, 10);
  });
});

// ─── Rectangle-to-Rectangle Distance ─────────────────────────────────────────

describe('distanceRectToRect', () => {
  it('two rects side by side', () => {
    const a = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const b = createRectHull({ x: 10, y: 0 }, 4, 2, 0);
    // A right edge at x=2, B left edge at x=8
    // Distance = 8 - 2 = 6
    expect(distanceRectToRect(a, b)).toBeCloseTo(6, 10);
  });

  it('two rects touching', () => {
    const a = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const b = createRectHull({ x: 4, y: 0 }, 4, 2, 0);
    // A right edge at x=2, B left edge at x=2
    expect(distanceRectToRect(a, b)).toBeCloseTo(0, 5);
  });

  it('two rects overlapping return 0', () => {
    const a = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const b = createRectHull({ x: 2, y: 0 }, 4, 2, 0);
    expect(distanceRectToRect(a, b)).toBe(0);
  });

  it('two rects diagonally apart', () => {
    const a = createRectHull({ x: 0, y: 0 }, 2, 2, 0);
    const b = createRectHull({ x: 10, y: 10 }, 2, 2, 0);
    // Corners: a=(1,1), b=(9,9)
    // Distance = sqrt((9-1)^2 + (9-1)^2) = sqrt(128) ≈ 11.314
    const expected = Math.sqrt(128);
    expect(distanceRectToRect(a, b)).toBeCloseTo(expected, 4);
  });
});

// ─── Shape Dispatcher ────────────────────────────────────────────────────────

describe('distanceShapes', () => {
  it('dispatches circle-circle', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    expect(distanceShapes(a, b)).toBeCloseTo(3, 10);
  });

  it('dispatches circle-rect', () => {
    const circle = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(distanceShapes(circle, rect)).toBeCloseTo(7, 10);
  });

  it('dispatches rect-circle (reversed order)', () => {
    const circle = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(distanceShapes(rect, circle)).toBeCloseTo(7, 10);
  });

  it('dispatches rect-rect', () => {
    const a = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const b = createRectHull({ x: 10, y: 0 }, 4, 2, 0);
    expect(distanceShapes(a, b)).toBeCloseTo(6, 10);
  });

  it('is symmetric: distance(a,b) === distance(b,a)', () => {
    const a = createCircleBase({ x: 3, y: 7 }, 32);
    const b = createCircleBase({ x: 15, y: 22 }, 40);
    expect(distanceShapes(a, b)).toBeCloseTo(distanceShapes(b, a), 10);
  });
});

// ─── Base Contact ────────────────────────────────────────────────────────────

describe('areInBaseContact', () => {
  it('touching circles are in base contact', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 2, y: 0 }, 1);
    expect(areInBaseContact(a, b)).toBe(true);
  });

  it('overlapping circles are in base contact', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 1, y: 0 }, 1);
    expect(areInBaseContact(a, b)).toBe(true);
  });

  it('separated circles are not in base contact', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    expect(areInBaseContact(a, b)).toBe(false);
  });

  it('circle touching rect edge is in base contact', () => {
    const circle = createCircleBaseInches({ x: 3, y: 0 }, 1);
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(areInBaseContact(circle, rect)).toBe(true);
  });
});

// ─── Distance Rounding ───────────────────────────────────────────────────────

describe('distanceRoundUp', () => {
  it('whole numbers stay the same', () => {
    expect(distanceRoundUp(4)).toBe(4);
    expect(distanceRoundUp(12)).toBe(12);
  });

  it('fractional distances round up', () => {
    expect(distanceRoundUp(4.1)).toBe(5);
    expect(distanceRoundUp(4.9)).toBe(5);
    expect(distanceRoundUp(4.01)).toBe(5);
  });

  it('zero returns zero', () => {
    expect(distanceRoundUp(0)).toBe(0);
  });

  it('negative values return zero', () => {
    expect(distanceRoundUp(-1)).toBe(0);
  });

  it('very small fractions round up', () => {
    expect(distanceRoundUp(0.001)).toBe(1);
  });

  it('handles floating-point near-integers correctly', () => {
    // 3.0000000000000004 should be treated as exactly 3
    expect(distanceRoundUp(3 + EPSILON / 2)).toBe(3);
  });
});

// ─── Range Check ─────────────────────────────────────────────────────────────

describe('isWithinRange', () => {
  it('models within range return true', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    // Edge distance = 3
    expect(isWithinRange(a, b, 3)).toBe(true);
    expect(isWithinRange(a, b, 5)).toBe(true);
  });

  it('models outside range return false', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    // Edge distance = 3
    expect(isWithinRange(a, b, 2)).toBe(false);
  });

  it('models at exact range return true', () => {
    const a = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const b = createCircleBaseInches({ x: 5, y: 0 }, 1);
    // Edge distance = 3
    expect(isWithinRange(a, b, 3)).toBe(true);
  });
});
