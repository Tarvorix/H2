import { describe, it, expect } from 'vitest';
import {
  segmentSegmentIntersection,
  segmentCircleIntersection,
  segmentPolygonIntersection,
  segmentRectIntersection,
  externalTangentLines,
  internalTangentLines,
  allTangentLines,
  circleToRectRays,
  rectToRectRays,
  chordLengthThroughPolygon,
  chordLengthThroughCircle,
  pointInPolygon,
  pointInCircle,
  pointInRect,
  segmentIntersectsRect,
} from './intersection';
import { createCircleBaseInches, createRectHull } from './shapes';
import { vec2Distance } from './vec2';

// ─── Segment-Segment Intersection ────────────────────────────────────────────

describe('segmentSegmentIntersection', () => {
  it('perpendicular crossing segments intersect at origin', () => {
    const result = segmentSegmentIntersection(
      { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: -1 }, { x: 0, y: 1 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(0, 10);
    expect(result!.y).toBeCloseTo(0, 10);
  });

  it('intersecting segments at non-origin', () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5, 10);
    expect(result!.y).toBeCloseTo(5, 10);
  });

  it('parallel segments do not intersect', () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 1 }, { x: 10, y: 1 },
    );
    expect(result).toBeNull();
  });

  it('non-overlapping colinear segments do not intersect', () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 5, y: 0 },
      { x: 10, y: 0 }, { x: 15, y: 0 },
    );
    expect(result).toBeNull();
  });

  it('segments that miss each other do not intersect', () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 5, y: 0 },
      { x: 6, y: -1 }, { x: 6, y: 1 },
    );
    expect(result).toBeNull();
  });

  it('T-intersection at endpoint', () => {
    const result = segmentSegmentIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 5, y: -5 }, { x: 5, y: 0 },
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5, 10);
    expect(result!.y).toBeCloseTo(0, 10);
  });
});

// ─── Segment-Circle Intersection ─────────────────────────────────────────────

describe('segmentCircleIntersection', () => {
  const unitCircle = createCircleBaseInches({ x: 0, y: 0 }, 1);

  it('horizontal segment through center: 2 intersections', () => {
    const hits = segmentCircleIntersection({ x: -5, y: 0 }, { x: 5, y: 0 }, unitCircle);
    expect(hits).toHaveLength(2);
    expect(hits[0].x).toBeCloseTo(-1, 10);
    expect(hits[1].x).toBeCloseTo(1, 10);
  });

  it('tangent segment: 1 intersection', () => {
    const hits = segmentCircleIntersection({ x: -5, y: 1 }, { x: 5, y: 1 }, unitCircle);
    expect(hits).toHaveLength(1);
    expect(hits[0].y).toBeCloseTo(1, 10);
  });

  it('segment misses circle: 0 intersections', () => {
    const hits = segmentCircleIntersection({ x: -5, y: 5 }, { x: 5, y: 5 }, unitCircle);
    expect(hits).toHaveLength(0);
  });

  it('segment entirely inside circle: 0 intersections', () => {
    const hits = segmentCircleIntersection({ x: -0.3, y: 0 }, { x: 0.3, y: 0 }, unitCircle);
    expect(hits).toHaveLength(0);
  });

  it('segment starts inside, exits circle: 1 intersection', () => {
    const hits = segmentCircleIntersection({ x: 0, y: 0 }, { x: 5, y: 0 }, unitCircle);
    expect(hits).toHaveLength(1);
    expect(hits[0].x).toBeCloseTo(1, 10);
  });
});

// ─── Segment-Polygon Intersection ────────────────────────────────────────────

describe('segmentPolygonIntersection', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('segment through square: 2 intersections', () => {
    const hits = segmentPolygonIntersection({ x: -1, y: 2 }, { x: 5, y: 2 }, square);
    expect(hits).toHaveLength(2);
  });

  it('segment misses polygon: 0 intersections', () => {
    const hits = segmentPolygonIntersection({ x: -1, y: 5 }, { x: 5, y: 5 }, square);
    expect(hits).toHaveLength(0);
  });

  it('segment touches corner: 1 intersection', () => {
    const hits = segmentPolygonIntersection({ x: -1, y: -1 }, { x: 1, y: 1 }, square);
    // Segment enters at (0,0) corner
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Segment-Rectangle Intersection ──────────────────────────────────────────

describe('segmentRectIntersection', () => {
  it('segment through unrotated rect: 2 intersections', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const hits = segmentRectIntersection({ x: -5, y: 0 }, { x: 5, y: 0 }, rect);
    expect(hits).toHaveLength(2);
  });

  it('segment misses rect: 0 intersections', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const hits = segmentRectIntersection({ x: -5, y: 5 }, { x: 5, y: 5 }, rect);
    expect(hits).toHaveLength(0);
  });

  it('segment through rotated rect', () => {
    const rect = createRectHull({ x: 0, y: 0 }, 4, 2, Math.PI / 4);
    const hits = segmentRectIntersection({ x: -5, y: 0 }, { x: 5, y: 0 }, rect);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Tangent Lines ───────────────────────────────────────────────────────────

describe('externalTangentLines', () => {
  it('two equal-radius separated circles: 2 external tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const tangents = externalTangentLines(c1, c2);
    expect(tangents).toHaveLength(2);

    // Tangent lines should be parallel to the center line for equal radii
    for (const t of tangents) {
      // Start should be on c1 boundary
      expect(vec2Distance(t.start, c1.center)).toBeCloseTo(c1.radius, 4);
      // End should be on c2 boundary
      expect(vec2Distance(t.end, c2.center)).toBeCloseTo(c2.radius, 4);
    }
  });

  it('two different-radius separated circles: 2 external tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 2);
    const c2 = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const tangents = externalTangentLines(c1, c2);
    expect(tangents).toHaveLength(2);
  });

  it('concentric circles: 0 tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 2);
    const c2 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const tangents = externalTangentLines(c1, c2);
    expect(tangents).toHaveLength(0);
  });

  it('one circle inside another: 0 tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 5);
    const c2 = createCircleBaseInches({ x: 1, y: 0 }, 1);
    const tangents = externalTangentLines(c1, c2);
    expect(tangents).toHaveLength(0);
  });
});

describe('internalTangentLines', () => {
  it('two separated circles: 2 internal tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const tangents = internalTangentLines(c1, c2);
    expect(tangents).toHaveLength(2);
  });

  it('overlapping circles: 0 internal tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 1, y: 0 }, 1);
    const tangents = internalTangentLines(c1, c2);
    expect(tangents).toHaveLength(0);
  });

  it('touching circles: 0 internal tangents', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 2, y: 0 }, 1);
    const tangents = internalTangentLines(c1, c2);
    expect(tangents).toHaveLength(0);
  });
});

describe('allTangentLines', () => {
  it('two well-separated circles: 5 rays (2 ext + 2 int + 1 center)', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 10, y: 0 }, 1);
    const rays = allTangentLines(c1, c2);
    expect(rays).toHaveLength(5);
  });

  it('touching circles: 3 rays (2 ext + 0 int + 1 center)', () => {
    const c1 = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const c2 = createCircleBaseInches({ x: 2, y: 0 }, 1);
    const rays = allTangentLines(c1, c2);
    expect(rays).toHaveLength(3);
  });
});

// ─── Circle to Rect Rays ─────────────────────────────────────────────────────

describe('circleToRectRays', () => {
  it('generates multiple rays from circle to rect', () => {
    const circle = createCircleBaseInches({ x: 0, y: 0 }, 1);
    const rect = createRectHull({ x: 10, y: 0 }, 4, 2, 0);
    const rays = circleToRectRays(circle, rect);
    expect(rays.length).toBeGreaterThan(0);

    // All start points should be on or near circle boundary
    for (const ray of rays) {
      const distFromCenter = vec2Distance(ray.start, circle.center);
      expect(distFromCenter).toBeCloseTo(circle.radius, 2);
    }
  });
});

// ─── Rect to Rect Rays ──────────────────────────────────────────────────────

describe('rectToRectRays', () => {
  it('generates rays between two rects', () => {
    const a = createRectHull({ x: 0, y: 0 }, 4, 2, 0);
    const b = createRectHull({ x: 20, y: 0 }, 4, 2, 0);
    const rays = rectToRectRays(a, b);
    // 8 points on A x 8 points on B + 1 center-to-center = 65
    expect(rays).toHaveLength(65);
  });
});

// ─── Chord Length Through Polygon ────────────────────────────────────────────

describe('chordLengthThroughPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('segment passes straight through: chord = 4"', () => {
    const chord = chordLengthThroughPolygon({ x: -1, y: 2 }, { x: 5, y: 2 }, square);
    expect(chord).toBeCloseTo(4, 4);
  });

  it('segment passes through corner to corner: diagonal', () => {
    const chord = chordLengthThroughPolygon({ x: -1, y: -1 }, { x: 5, y: 5 }, square);
    // From (0,0) to (4,4): diagonal = sqrt(32) ≈ 5.657
    expect(chord).toBeCloseTo(Math.sqrt(32), 4);
  });

  it('segment misses polygon: chord = 0', () => {
    const chord = chordLengthThroughPolygon({ x: -1, y: 5 }, { x: 5, y: 5 }, square);
    expect(chord).toBeCloseTo(0, 10);
  });

  it('segment entirely inside polygon: chord = full segment length', () => {
    const chord = chordLengthThroughPolygon({ x: 1, y: 1 }, { x: 3, y: 3 }, square);
    expect(chord).toBeCloseTo(Math.sqrt(8), 4);
  });

  it('segment partially inside: correct chord', () => {
    const chord = chordLengthThroughPolygon({ x: 2, y: 2 }, { x: 6, y: 2 }, square);
    // From (2,2) inside to (4,2) boundary = 2"
    expect(chord).toBeCloseTo(2, 4);
  });

  it('Medium Area Terrain chord <3": would allow LOS', () => {
    // 2" wide terrain block
    const narrowTerrain = [
      { x: 5, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 10 },
      { x: 5, y: 10 },
    ];
    const chord = chordLengthThroughPolygon({ x: 0, y: 5 }, { x: 10, y: 5 }, narrowTerrain);
    expect(chord).toBeCloseTo(2, 4);
    expect(chord).toBeLessThan(3);
  });

  it('Medium Area Terrain chord >3": would block LOS', () => {
    // 4" wide terrain block
    const wideTerrain = [
      { x: 3, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 10 },
      { x: 3, y: 10 },
    ];
    const chord = chordLengthThroughPolygon({ x: 0, y: 5 }, { x: 10, y: 5 }, wideTerrain);
    expect(chord).toBeCloseTo(4, 4);
    expect(chord).toBeGreaterThan(3);
  });
});

// ─── Chord Length Through Circle ─────────────────────────────────────────────

describe('chordLengthThroughCircle', () => {
  it('segment through circle center: chord = diameter', () => {
    const circle = createCircleBaseInches({ x: 5, y: 5 }, 2);
    const chord = chordLengthThroughCircle({ x: 0, y: 5 }, { x: 10, y: 5 }, circle);
    expect(chord).toBeCloseTo(4, 4); // diameter = 2*radius = 4
  });

  it('segment misses circle: chord = 0', () => {
    const circle = createCircleBaseInches({ x: 5, y: 5 }, 1);
    const chord = chordLengthThroughCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, circle);
    expect(chord).toBeCloseTo(0, 10);
  });

  it('segment tangent to circle: chord ≈ 0', () => {
    const circle = createCircleBaseInches({ x: 5, y: 1 }, 1);
    const chord = chordLengthThroughCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, circle);
    expect(chord).toBeCloseTo(0, 4);
  });

  it('segment entirely inside circle: chord = segment length', () => {
    const circle = createCircleBaseInches({ x: 5, y: 5 }, 5);
    const chord = chordLengthThroughCircle({ x: 4, y: 5 }, { x: 6, y: 5 }, circle);
    expect(chord).toBeCloseTo(2, 4);
  });
});

// ─── Point in Polygon ────────────────────────────────────────────────────────

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it('point inside polygon', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
  });

  it('point outside polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(false);
  });

  it('point near boundary but outside', () => {
    expect(pointInPolygon({ x: -0.1, y: 2 }, square)).toBe(false);
  });

  it('concave polygon: point inside concavity is outside', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    // Point in the "notch" of the L
    expect(pointInPolygon({ x: 3, y: 3 }, lShape)).toBe(false);
    // Point in the body of the L
    expect(pointInPolygon({ x: 1, y: 1 }, lShape)).toBe(true);
  });

  it('triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 10 }, triangle)).toBe(false);
  });
});

// ─── Point in Circle ─────────────────────────────────────────────────────────

describe('pointInCircle', () => {
  it('center is inside', () => {
    expect(pointInCircle({ x: 5, y: 5 }, { x: 5, y: 5 }, 2)).toBe(true);
  });

  it('point on boundary is inside', () => {
    expect(pointInCircle({ x: 7, y: 5 }, { x: 5, y: 5 }, 2)).toBe(true);
  });

  it('point outside is not inside', () => {
    expect(pointInCircle({ x: 10, y: 5 }, { x: 5, y: 5 }, 2)).toBe(false);
  });
});

// ─── Point in Rect ───────────────────────────────────────────────────────────

describe('pointInRect', () => {
  it('point inside rect', () => {
    expect(pointInRect({ x: 5, y: 5 }, { x: 0, y: 0 }, 10, 10)).toBe(true);
  });

  it('point on boundary is inside', () => {
    expect(pointInRect({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, 10)).toBe(true);
  });

  it('point outside rect', () => {
    expect(pointInRect({ x: 15, y: 5 }, { x: 0, y: 0 }, 10, 10)).toBe(false);
  });
});

// ─── Segment Intersects Rect ─────────────────────────────────────────────────

describe('segmentIntersectsRect', () => {
  it('segment through rect returns true', () => {
    const rect = createRectHull({ x: 5, y: 5 }, 4, 2, 0);
    expect(segmentIntersectsRect({ x: 0, y: 5 }, { x: 10, y: 5 }, rect)).toBe(true);
  });

  it('segment missing rect returns false', () => {
    const rect = createRectHull({ x: 5, y: 5 }, 4, 2, 0);
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 10, y: 0 }, rect)).toBe(false);
  });
});
