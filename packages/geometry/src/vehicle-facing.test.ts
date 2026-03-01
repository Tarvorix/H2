import { describe, it, expect } from 'vitest';
import { VehicleFacing } from '@hh/types';
import { determineVehicleFacing, getVehicleArcBoundaries } from './vehicle-facing';
import { createRectHull } from './shapes';

// ─── Standard Vehicle Fixture ─────────────────────────────────────────────────

// A standard vehicle hull: 4" wide (along facing), 2" tall (perpendicular), facing right (+x)
// Diagonal angle = atan2(1, 2) ≈ 26.57° from forward axis
// Front sector: |angle| < 26.57°
// Rear sector: |angle| > 180 - 26.57 = 153.43°
// Side sector: 26.57° < |angle| < 153.43°
const standardVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, 0);

// ─── Facing from Cardinal Directions ──────────────────────────────────────────

describe('determineVehicleFacing — cardinal directions', () => {
  it('attack from directly in front → Front', () => {
    // Attacker directly in front (to the right of the vehicle, facing direction)
    expect(determineVehicleFacing(standardVehicle, { x: 30, y: 20 })).toBe(VehicleFacing.Front);
  });

  it('attack from directly behind → Rear', () => {
    // Attacker directly behind (to the left)
    expect(determineVehicleFacing(standardVehicle, { x: 10, y: 20 })).toBe(VehicleFacing.Rear);
  });

  it('attack from directly above → Side', () => {
    // Attacker directly above (90° from forward)
    expect(determineVehicleFacing(standardVehicle, { x: 20, y: 30 })).toBe(VehicleFacing.Side);
  });

  it('attack from directly below → Side', () => {
    // Attacker directly below (270° / -90° from forward)
    expect(determineVehicleFacing(standardVehicle, { x: 20, y: 10 })).toBe(VehicleFacing.Side);
  });
});

// ─── Facing from Angled Directions ────────────────────────────────────────────

describe('determineVehicleFacing — angled attacks', () => {
  it('~10° off center front → Front', () => {
    // Small angle from forward axis → should be Front
    // Offset y slightly: atan2(1, 10) ≈ 5.7° < 26.57°
    expect(determineVehicleFacing(standardVehicle, { x: 30, y: 21 })).toBe(VehicleFacing.Front);
  });

  it('~20° off center front → Front', () => {
    // atan2(3.64, 10) ≈ 20° < 26.57°
    expect(determineVehicleFacing(standardVehicle, { x: 30, y: 23.64 })).toBe(VehicleFacing.Front);
  });

  it('~10° off center rear → Rear', () => {
    // Attack from behind with slight offset: atan2(1, -10) ≈ 174.3° > 153.43°
    expect(determineVehicleFacing(standardVehicle, { x: 10, y: 21 })).toBe(VehicleFacing.Rear);
  });

  it('45° angle from forward axis → Side (for 4x2 hull)', () => {
    // For a 4x2 hull, diagonal angle ≈ 26.57°
    // 45° > 26.57° and 45° < 153.43° → Side
    expect(determineVehicleFacing(standardVehicle, { x: 30, y: 30 })).toBe(VehicleFacing.Side);
  });

  it('135° angle from forward axis → Side', () => {
    // Behind and to the side: 135° is between 26.57° and 153.43° → Side
    expect(determineVehicleFacing(standardVehicle, { x: 10, y: 30 })).toBe(VehicleFacing.Side);
  });
});

// ─── Rotated Vehicle ──────────────────────────────────────────────────────────

describe('determineVehicleFacing — rotated vehicle', () => {
  it('vehicle facing up (PI/2): attack from above → Front', () => {
    const upVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, Math.PI / 2);
    // Facing up means front is in +y direction
    expect(determineVehicleFacing(upVehicle, { x: 20, y: 30 })).toBe(VehicleFacing.Front);
  });

  it('vehicle facing up (PI/2): attack from below → Rear', () => {
    const upVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, Math.PI / 2);
    expect(determineVehicleFacing(upVehicle, { x: 20, y: 10 })).toBe(VehicleFacing.Rear);
  });

  it('vehicle facing up (PI/2): attack from the side → Side', () => {
    const upVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, Math.PI / 2);
    expect(determineVehicleFacing(upVehicle, { x: 30, y: 20 })).toBe(VehicleFacing.Side);
  });

  it('vehicle facing left (PI): attack from left → Front', () => {
    const leftVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, Math.PI);
    // Facing left means front is in -x direction
    expect(determineVehicleFacing(leftVehicle, { x: 10, y: 20 })).toBe(VehicleFacing.Front);
  });

  it('vehicle facing left (PI): attack from right → Rear', () => {
    const leftVehicle = createRectHull({ x: 20, y: 20 }, 4, 2, Math.PI);
    expect(determineVehicleFacing(leftVehicle, { x: 30, y: 20 })).toBe(VehicleFacing.Rear);
  });
});

// ─── Degenerate Case ──────────────────────────────────────────────────────────

describe('determineVehicleFacing — degenerate', () => {
  it('attacker at vehicle center → Front', () => {
    expect(determineVehicleFacing(standardVehicle, { x: 20, y: 20 })).toBe(VehicleFacing.Front);
  });
});

// ─── Different Aspect Ratios ──────────────────────────────────────────────────

describe('determineVehicleFacing — different hull shapes', () => {
  it('square hull (4x4): 45° → Side (boundary defaults to Side)', () => {
    // Square hull: diagonal angle = atan2(2, 2) = 45°
    // Exactly on boundary → default to Side
    const squareHull = createRectHull({ x: 20, y: 20 }, 4, 4, 0);
    expect(determineVehicleFacing(squareHull, { x: 30, y: 30 })).toBe(VehicleFacing.Side);
  });

  it('narrow hull (2x4): 30° → Front (diagonal ≈ 63.4°)', () => {
    // Narrow hull: width=2 (facing), height=4 (perpendicular)
    // Diagonal angle = atan2(2, 1) ≈ 63.4°
    // 30° < 63.4° → Front
    const narrowHull = createRectHull({ x: 20, y: 20 }, 2, 4, 0);
    // atan2(5.77, 10) ≈ 30°
    expect(determineVehicleFacing(narrowHull, { x: 30, y: 25.77 })).toBe(VehicleFacing.Front);
  });
});

// ─── Arc Boundaries ───────────────────────────────────────────────────────────

describe('getVehicleArcBoundaries', () => {
  it('returns 4 boundary angles', () => {
    const boundaries = getVehicleArcBoundaries(standardVehicle);
    expect(typeof boundaries.frontLeftAngle).toBe('number');
    expect(typeof boundaries.frontRightAngle).toBe('number');
    expect(typeof boundaries.rearLeftAngle).toBe('number');
    expect(typeof boundaries.rearRightAngle).toBe('number');
  });

  it('front angles are within expected range for unrotated 4x2 hull', () => {
    const boundaries = getVehicleArcBoundaries(standardVehicle);
    // For a 4x2 hull facing right, front-left corner is at (+2, +1) relative to center
    // Angle should be atan2(1, 2) ≈ 0.4636 rad ≈ 26.57°
    expect(boundaries.frontLeftAngle).toBeCloseTo(Math.atan2(1, 2), 4);
    // Front-right corner at (+2, -1)
    expect(boundaries.frontRightAngle).toBeCloseTo(Math.atan2(-1, 2), 4);
  });

  it('rear angles are within expected range for unrotated 4x2 hull', () => {
    const boundaries = getVehicleArcBoundaries(standardVehicle);
    // Rear-right corner at (-2, -1)
    expect(boundaries.rearRightAngle).toBeCloseTo(Math.atan2(-1, -2), 4);
    // Rear-left corner at (-2, +1)
    expect(boundaries.rearLeftAngle).toBeCloseTo(Math.atan2(1, -2), 4);
  });
});
