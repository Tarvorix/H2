import { describe, it, expect } from 'vitest';
import {
  createCircleBase,
  createCircleBaseInches,
  createRectHull,
  getRectCorners,
  getRectEdges,
  closestPointOnCircle,
  closestPointOnRect,
  closestPointOnShape,
  getShapeBounds,
  pointInAABB,
  aabbOverlap,
  pointInCircleBase,
  pointInRectHull,
  pointInShape,
} from './shapes';
import { MM_TO_INCHES } from './constants';
import { vec2Distance } from './vec2';

// ─── Factory Functions ───────────────────────────────────────────────────────

describe('createCircleBase', () => {
  it('creates a 32mm base with correct radius in inches', () => {
    const base = createCircleBase({ x: 10, y: 20 }, 32);
    expect(base.kind).toBe('circle');
    expect(base.center.x).toBe(10);
    expect(base.center.y).toBe(20);
    expect(base.radius).toBeCloseTo(32 * MM_TO_INCHES / 2, 10);
    // 32mm diameter = 16mm radius = 0.6299 inches
    expect(base.radius).toBeCloseTo(0.62992, 4);
  });

  it('creates a 25mm base', () => {
    const base = createCircleBase({ x: 0, y: 0 }, 25);
    expect(base.radius).toBeCloseTo(25 * MM_TO_INCHES / 2, 10);
  });

  it('creates a 40mm base', () => {
    const base = createCircleBase({ x: 0, y: 0 }, 40);
    expect(base.radius).toBeCloseTo(40 * MM_TO_INCHES / 2, 10);
  });

  it('creates a 60mm base', () => {
    const base = createCircleBase({ x: 0, y: 0 }, 60);
    expect(base.radius).toBeCloseTo(60 * MM_TO_INCHES / 2, 10);
  });
});

describe('createCircleBaseInches', () => {
  it('creates a base with inches radius directly', () => {
    const base = createCircleBaseInches({ x: 5, y: 5 }, 1.5);
    expect(base.radius).toBe(1.5);
  });
});

describe('createRectHull', () => {
  it('creates a vehicle hull', () => {
    const hull = createRectHull({ x: 24, y: 12 }, 4.5, 2.5, Math.PI / 2);
    expect(hull.kind).toBe('rect');
    expect(hull.center.x).toBe(24);
    expect(hull.center.y).toBe(12);
    expect(hull.width).toBe(4.5);
    expect(hull.height).toBe(2.5);
    expect(hull.rotation).toBe(Math.PI / 2);
  });
});

// ─── Rectangle Corners & Edges ───────────────────────────────────────────────

describe('getRectCorners', () => {
  it('returns correct corners for an unrotated rectangle', () => {
    const hull = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const [fl, fr, rr, rl] = getRectCorners(hull);

    // Front-left (x=+2, y=+1)
    expect(fl.x).toBeCloseTo(2, 10);
    expect(fl.y).toBeCloseTo(1, 10);
    // Front-right (x=+2, y=-1)
    expect(fr.x).toBeCloseTo(2, 10);
    expect(fr.y).toBeCloseTo(-1, 10);
    // Rear-right (x=-2, y=-1)
    expect(rr.x).toBeCloseTo(-2, 10);
    expect(rr.y).toBeCloseTo(-1, 10);
    // Rear-left (x=-2, y=+1)
    expect(rl.x).toBeCloseTo(-2, 10);
    expect(rl.y).toBeCloseTo(1, 10);
  });

  it('returns correct corners for a 90-degree rotated rectangle', () => {
    const hull = createRectHull({ x: 0, y: 0 }, 4, 2, Math.PI / 2);
    const [fl, fr, rr, rl] = getRectCorners(hull);

    // After 90° CCW rotation:
    // (2, 1) -> (-1, 2)
    expect(fl.x).toBeCloseTo(-1, 10);
    expect(fl.y).toBeCloseTo(2, 10);
    // (2, -1) -> (1, 2)
    expect(fr.x).toBeCloseTo(1, 10);
    expect(fr.y).toBeCloseTo(2, 10);
    // (-2, -1) -> (1, -2)
    expect(rr.x).toBeCloseTo(1, 10);
    expect(rr.y).toBeCloseTo(-2, 10);
    // (-2, 1) -> (-1, -2)
    expect(rl.x).toBeCloseTo(-1, 10);
    expect(rl.y).toBeCloseTo(-2, 10);
  });

  it('returns corners offset by center position', () => {
    const hull = createRectHull({ x: 10, y: 20 }, 4, 2, 0);
    const [fl, _fr, rr, _rl] = getRectCorners(hull);

    expect(fl.x).toBeCloseTo(12, 10);
    expect(fl.y).toBeCloseTo(21, 10);
    expect(rr.x).toBeCloseTo(8, 10);
    expect(rr.y).toBeCloseTo(19, 10);
  });
});

describe('getRectEdges', () => {
  it('returns 4 edges forming a closed rectangle', () => {
    const hull = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const edges = getRectEdges(hull);

    expect(edges).toHaveLength(4);

    // Each edge's end should be the next edge's start
    for (let i = 0; i < 4; i++) {
      const current = edges[i];
      const next = edges[(i + 1) % 4];
      expect(current.end.x).toBeCloseTo(next.start.x, 10);
      expect(current.end.y).toBeCloseTo(next.start.y, 10);
    }
  });
});

// ─── Closest Point Functions ─────────────────────────────────────────────────

describe('closestPointOnCircle', () => {
  it('returns correct boundary point for external point', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const result = closestPointOnCircle(circle, { x: 5, y: 0 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('returns correct boundary point at 45 degrees', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const result = closestPointOnCircle(circle, { x: 5, y: 5 });
    const expected = Math.SQRT2 / 2; // ~0.707
    expect(result.x).toBeCloseTo(expected, 10);
    expect(result.y).toBeCloseTo(expected, 10);
  });

  it('returns +x boundary point when query is at center', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const result = closestPointOnCircle(circle, { x: 0, y: 0 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('result lies on circle boundary', () => {
    const circle = createCircleBaseInches({ x: 3, y: 7 }, 2);
    const result = closestPointOnCircle(circle, { x: 10, y: 10 });
    expect(vec2Distance(result, circle.center)).toBeCloseTo(circle.radius, 10);
  });
});

describe('closestPointOnRect', () => {
  it('returns correct point for external point to the right', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const result = closestPointOnRect(rect, { x: 10, y: 0 });
    // Closest point is on the front edge at (2, 0)
    expect(result.x).toBeCloseTo(2, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('returns correct corner for external point at diagonal', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const result = closestPointOnRect(rect, { x: 10, y: 10 });
    // Closest point is the front-left corner (2, 1)
    expect(result.x).toBeCloseTo(2, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('handles point inside rectangle — returns nearest edge point', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const result = closestPointOnRect(rect, { x: 0, y: 0.8 });
    // Closest edge from (0, 0.8) is the top edge (y=1), distance 0.2
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('works with rotated rectangle', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, Math.PI / 2);
    // Point to the right, but rect is rotated 90°
    // In local space: point (10, 0) becomes (0, -10) after un-rotating by -90°
    // Closest local point: (0, -1) (clamped to height/2)
    // Rotated back: (-(-1), 0) = ?
    // Actually let's just verify the result is on the rect boundary
    const result = closestPointOnRect(rect, { x: 10, y: 0 });
    // Should be on the right edge of the rotated rect (which is now the top)
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });
});

describe('closestPointOnShape', () => {
  it('dispatches to circle for CircleBase', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const result = closestPointOnShape(circle, { x: 5, y: 0 });
    expect(result.x).toBeCloseTo(1, 10);
  });

  it('dispatches to rect for RectHull', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const result = closestPointOnShape(rect, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(2, 10);
  });
});

// ─── Bounding Box ────────────────────────────────────────────────────────────

describe('getShapeBounds', () => {
  it('returns correct AABB for circle', () => {
    const circle = createCircleBaseInches({ x: 5, y: 10 }, 2);
    const bounds = getShapeBounds(circle);
    expect(bounds.x).toBeCloseTo(3, 10);
    expect(bounds.y).toBeCloseTo(8, 10);
    expect(bounds.width).toBeCloseTo(4, 10);
    expect(bounds.height).toBeCloseTo(4, 10);
  });

  it('returns correct AABB for unrotated rect', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const bounds = getShapeBounds(rect);
    expect(bounds.x).toBeCloseTo(-2, 10);
    expect(bounds.y).toBeCloseTo(-1, 10);
    expect(bounds.width).toBeCloseTo(4, 10);
    expect(bounds.height).toBeCloseTo(2, 10);
  });

  it('returns expanded AABB for rotated rect', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, Math.PI / 4);
    const bounds = getShapeBounds(rect);
    // A 4x2 rect rotated 45° has a larger bounding box
    expect(bounds.width).toBeGreaterThan(4);
    expect(bounds.height).toBeGreaterThan(2);
  });
});

describe('pointInAABB', () => {
  it('point inside AABB returns true', () => {
    expect(pointInAABB({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });

  it('point outside AABB returns false', () => {
    expect(pointInAABB({ x: 15, y: 5 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('point on AABB boundary returns true', () => {
    expect(pointInAABB({ x: 0, y: 0 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
});

describe('aabbOverlap', () => {
  it('overlapping AABBs return true', () => {
    expect(aabbOverlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 5, y: 5, width: 10, height: 10 },
    )).toBe(true);
  });

  it('non-overlapping AABBs return false', () => {
    expect(aabbOverlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 20, width: 10, height: 10 },
    )).toBe(false);
  });

  it('touching AABBs do not overlap (strict inequality)', () => {
    expect(aabbOverlap(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 10, y: 0, width: 10, height: 10 },
    )).toBe(false);
  });
});

// ─── Point Inside Shape ──────────────────────────────────────────────────────

describe('pointInCircleBase', () => {
  it('center point is inside', () => {
    const circle = createCircleBaseInches({ x: 5, y: 5 }, 2);
    expect(pointInCircleBase({ x: 5, y: 5 }, circle)).toBe(true);
  });

  it('point on boundary is inside', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    expect(pointInCircleBase({ x: 1, y: 0 }, circle)).toBe(true);
  });

  it('point outside is not inside', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    expect(pointInCircleBase({ x: 2, y: 0 }, circle)).toBe(false);
  });
});

describe('pointInRectHull', () => {
  it('center point is inside', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(pointInRectHull({ x: 0, y: 0 }, rect)).toBe(true);
  });

  it('point on boundary is inside', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(pointInRectHull({ x: 2, y: 0 }, rect)).toBe(true);
  });

  it('point outside is not inside', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(pointInRectHull({ x: 5, y: 0 }, rect)).toBe(false);
  });

  it('works with rotated rect', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, Math.PI / 2);
    // Rotated 90°: local (1, 0) is now (0, 1) in world space
    expect(pointInRectHull({ x: 0, y: 1.5 }, rect)).toBe(true);
    expect(pointInRectHull({ x: 0, y: 3 }, rect)).toBe(false);
  });
});

describe('pointInShape', () => {
  it('dispatches to circle', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    expect(pointInShape({ x: 0.5, y: 0 }, circle)).toBe(true);
    expect(pointInShape({ x: 2, y: 0 }, circle)).toBe(false);
  });

  it('dispatches to rect', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    expect(pointInShape({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInShape({ x: 5, y: 0 }, rect)).toBe(false);
  });
});
