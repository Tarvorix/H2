import { describe, it, expect } from 'vitest';
import {
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Negate,
  vec2Dot,
  vec2Cross,
  vec2LengthSq,
  vec2Length,
  vec2DistanceSq,
  vec2Distance,
  vec2Normalize,
  vec2Perpendicular,
  vec2PerpendicularCW,
  vec2Rotate,
  vec2Lerp,
  vec2Angle,
  vec2AngleOf,
  vec2Equal,
  approxZero,
  approxEqual,
  clamp,
  projectPointOntoSegment,
  closestPointOnSegment,
} from './vec2';
import { EPSILON } from './constants';

// ─── Basic Arithmetic ────────────────────────────────────────────────────────

describe('vec2Add', () => {
  it('adds two positive vectors', () => {
    const result = vec2Add({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(result.x).toBe(4);
    expect(result.y).toBe(6);
  });

  it('adds negative values', () => {
    const result = vec2Add({ x: -1, y: 3 }, { x: 2, y: -5 });
    expect(result.x).toBe(1);
    expect(result.y).toBe(-2);
  });

  it('identity: adding zero vector', () => {
    const result = vec2Add({ x: 5, y: 7 }, { x: 0, y: 0 });
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
  });
});

describe('vec2Sub', () => {
  it('subtracts two vectors', () => {
    const result = vec2Sub({ x: 5, y: 7 }, { x: 2, y: 3 });
    expect(result.x).toBe(3);
    expect(result.y).toBe(4);
  });

  it('subtracting from self gives zero', () => {
    const v = { x: 3.5, y: -2.1 };
    const result = vec2Sub(v, v);
    expect(Math.abs(result.x)).toBeLessThan(EPSILON);
    expect(Math.abs(result.y)).toBeLessThan(EPSILON);
  });
});

describe('vec2Scale', () => {
  it('scales a vector by a positive scalar', () => {
    const result = vec2Scale({ x: 2, y: 3 }, 4);
    expect(result.x).toBe(8);
    expect(result.y).toBe(12);
  });

  it('scales by zero gives zero vector', () => {
    const result = vec2Scale({ x: 100, y: -50 }, 0);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('scales by negative reverses direction', () => {
    const result = vec2Scale({ x: 3, y: -2 }, -1);
    expect(result.x).toBe(-3);
    expect(result.y).toBe(2);
  });
});

describe('vec2Negate', () => {
  it('negates a vector', () => {
    const result = vec2Negate({ x: 3, y: -4 });
    expect(result.x).toBe(-3);
    expect(result.y).toBe(4);
  });

  it('negating zero vector gives zero', () => {
    const result = vec2Negate({ x: 0, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });
});

// ─── Products ────────────────────────────────────────────────────────────────

describe('vec2Dot', () => {
  it('computes dot product of orthogonal vectors as zero', () => {
    expect(vec2Dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
  });

  it('computes dot product of parallel vectors', () => {
    expect(vec2Dot({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(25);
  });

  it('computes dot product of anti-parallel vectors as negative', () => {
    expect(vec2Dot({ x: 1, y: 0 }, { x: -1, y: 0 })).toBe(-1);
  });
});

describe('vec2Cross', () => {
  it('cross product of parallel vectors is zero', () => {
    expect(vec2Cross({ x: 2, y: 0 }, { x: 3, y: 0 })).toBe(0);
  });

  it('cross product positive when b is CCW from a', () => {
    expect(vec2Cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
  });

  it('cross product negative when b is CW from a', () => {
    expect(vec2Cross({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
  });
});

// ─── Length & Distance ───────────────────────────────────────────────────────

describe('vec2LengthSq', () => {
  it('computes squared length', () => {
    expect(vec2LengthSq({ x: 3, y: 4 })).toBe(25);
  });

  it('zero vector has zero squared length', () => {
    expect(vec2LengthSq({ x: 0, y: 0 })).toBe(0);
  });
});

describe('vec2Length', () => {
  it('computes 3-4-5 triangle hypotenuse', () => {
    expect(vec2Length({ x: 3, y: 4 })).toBe(5);
  });

  it('unit vector along x-axis has length 1', () => {
    expect(vec2Length({ x: 1, y: 0 })).toBe(1);
  });

  it('zero vector has length 0', () => {
    expect(vec2Length({ x: 0, y: 0 })).toBe(0);
  });
});

describe('vec2DistanceSq', () => {
  it('computes squared distance between points', () => {
    expect(vec2DistanceSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });

  it('distance from point to itself is zero', () => {
    expect(vec2DistanceSq({ x: 5, y: 7 }, { x: 5, y: 7 })).toBe(0);
  });
});

describe('vec2Distance', () => {
  it('computes distance between two points', () => {
    expect(vec2Distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('computes distance between non-origin points', () => {
    expect(vec2Distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
  });

  it('distance is symmetric', () => {
    const a = { x: 2, y: 3 };
    const b = { x: 7, y: 11 };
    expect(vec2Distance(a, b)).toBeCloseTo(vec2Distance(b, a), 10);
  });
});

// ─── Normalization ───────────────────────────────────────────────────────────

describe('vec2Normalize', () => {
  it('normalizes a vector to unit length', () => {
    const result = vec2Normalize({ x: 3, y: 4 });
    expect(result.x).toBeCloseTo(0.6, 10);
    expect(result.y).toBeCloseTo(0.8, 10);
    expect(vec2Length(result)).toBeCloseTo(1, 10);
  });

  it('normalizing a unit vector returns itself', () => {
    const result = vec2Normalize({ x: 1, y: 0 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('normalizing zero vector returns zero vector', () => {
    const result = vec2Normalize({ x: 0, y: 0 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('normalizing near-zero vector returns zero vector', () => {
    const result = vec2Normalize({ x: 1e-15, y: 1e-15 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

// ─── Rotation & Perpendicular ────────────────────────────────────────────────

describe('vec2Perpendicular', () => {
  it('rotates (1,0) to (0,1) (CCW)', () => {
    const result = vec2Perpendicular({ x: 1, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('rotates (0,1) to (-1,0) (CCW)', () => {
    const result = vec2Perpendicular({ x: 0, y: 1 });
    expect(result.x).toBeCloseTo(-1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('perpendicular vector is orthogonal (dot product = 0)', () => {
    const v = { x: 3, y: 7 };
    const perp = vec2Perpendicular(v);
    expect(vec2Dot(v, perp)).toBeCloseTo(0, 10);
  });

  it('perpendicular preserves length', () => {
    const v = { x: 3, y: 4 };
    const perp = vec2Perpendicular(v);
    expect(vec2Length(perp)).toBeCloseTo(vec2Length(v), 10);
  });
});

describe('vec2PerpendicularCW', () => {
  it('rotates (1,0) to (0,-1) (CW)', () => {
    const result = vec2PerpendicularCW({ x: 1, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(-1, 10);
  });
});

describe('vec2Rotate', () => {
  it('rotating by 0 radians does nothing', () => {
    const result = vec2Rotate({ x: 5, y: 3 }, 0);
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(3, 10);
  });

  it('rotating (1,0) by PI/2 gives (0,1)', () => {
    const result = vec2Rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('rotating (1,0) by PI gives (-1,0)', () => {
    const result = vec2Rotate({ x: 1, y: 0 }, Math.PI);
    expect(result.x).toBeCloseTo(-1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('rotating (1,0) by -PI/2 gives (0,-1)', () => {
    const result = vec2Rotate({ x: 1, y: 0 }, -Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(-1, 10);
  });

  it('full rotation (2*PI) returns to start', () => {
    const v = { x: 3, y: 7 };
    const result = vec2Rotate(v, 2 * Math.PI);
    expect(result.x).toBeCloseTo(v.x, 10);
    expect(result.y).toBeCloseTo(v.y, 10);
  });

  it('rotation preserves length', () => {
    const v = { x: 3, y: 4 };
    const result = vec2Rotate(v, 1.23);
    expect(vec2Length(result)).toBeCloseTo(vec2Length(v), 10);
  });
});

// ─── Interpolation ───────────────────────────────────────────────────────────

describe('vec2Lerp', () => {
  it('t=0 returns start point', () => {
    const result = vec2Lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('t=1 returns end point', () => {
    const result = vec2Lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 1);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
  });

  it('t=0.5 returns midpoint', () => {
    const result = vec2Lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('works with non-origin start', () => {
    const result = vec2Lerp({ x: 2, y: 4 }, { x: 10, y: 20 }, 0.25);
    expect(result.x).toBe(4);
    expect(result.y).toBe(8);
  });
});

// ─── Angles ──────────────────────────────────────────────────────────────────

describe('vec2Angle', () => {
  it('angle from origin to (1,0) is 0', () => {
    expect(vec2Angle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 10);
  });

  it('angle from origin to (0,1) is PI/2', () => {
    expect(vec2Angle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10);
  });

  it('angle from origin to (-1,0) is PI', () => {
    expect(vec2Angle({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(Math.PI, 10);
  });

  it('angle from origin to (0,-1) is -PI/2', () => {
    expect(vec2Angle({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe('vec2AngleOf', () => {
  it('angle of (1,0) is 0', () => {
    expect(vec2AngleOf({ x: 1, y: 0 })).toBeCloseTo(0, 10);
  });

  it('angle of (0,1) is PI/2', () => {
    expect(vec2AngleOf({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10);
  });
});

// ─── Comparison ──────────────────────────────────────────────────────────────

describe('vec2Equal', () => {
  it('identical vectors are equal', () => {
    expect(vec2Equal({ x: 5, y: 3 }, { x: 5, y: 3 })).toBe(true);
  });

  it('slightly different vectors within epsilon are equal', () => {
    expect(vec2Equal({ x: 5, y: 3 }, { x: 5 + EPSILON / 2, y: 3 - EPSILON / 2 })).toBe(true);
  });

  it('vectors differing by more than epsilon are not equal', () => {
    expect(vec2Equal({ x: 5, y: 3 }, { x: 5.001, y: 3 })).toBe(false);
  });

  it('custom epsilon works', () => {
    expect(vec2Equal({ x: 5, y: 3 }, { x: 5.01, y: 3.01 }, 0.02)).toBe(true);
  });
});

describe('approxZero', () => {
  it('zero is approximately zero', () => {
    expect(approxZero(0)).toBe(true);
  });

  it('EPSILON/2 is approximately zero', () => {
    expect(approxZero(EPSILON / 2)).toBe(true);
  });

  it('1 is not approximately zero', () => {
    expect(approxZero(1)).toBe(false);
  });
});

describe('approxEqual', () => {
  it('same values are equal', () => {
    expect(approxEqual(5, 5)).toBe(true);
  });

  it('values within epsilon are equal', () => {
    expect(approxEqual(5, 5 + EPSILON / 2)).toBe(true);
  });

  it('different values are not equal', () => {
    expect(approxEqual(5, 6)).toBe(false);
  });
});

// ─── Utility ─────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('value within range is unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('value below min is clamped to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('value above max is clamped to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('value equal to min is unchanged', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('value equal to max is unchanged', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('projectPointOntoSegment', () => {
  it('point at segment start returns t=0', () => {
    const t = projectPointOntoSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBeCloseTo(0, 10);
  });

  it('point at segment end returns t=1', () => {
    const t = projectPointOntoSegment({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBeCloseTo(1, 10);
  });

  it('point at midpoint returns t=0.5', () => {
    const t = projectPointOntoSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBeCloseTo(0.5, 10);
  });

  it('point beyond segment end returns t>1', () => {
    const t = projectPointOntoSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBeCloseTo(1.5, 10);
  });
});

describe('closestPointOnSegment', () => {
  it('closest point when projection is on segment', () => {
    const result = closestPointOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('closest point when projection is before segment start', () => {
    const result = closestPointOnSegment({ x: -5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('closest point when projection is past segment end', () => {
    const result = closestPointOnSegment({ x: 15, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(10, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('closest point on diagonal segment', () => {
    const result = closestPointOnSegment({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 });
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(5, 10);
  });
});
