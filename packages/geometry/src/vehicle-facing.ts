/**
 * Vehicle Armour Facing Determination
 * Reference: HH_Principles.md — "Vehicles and Damage"
 *
 * A vehicle's hull is a rectangle. Drawing diagonal lines through the hull's
 * corners divides space into four sectors: Front, two Sides, and Rear.
 * The front face is the short edge in the direction the vehicle faces
 * (determined by the hull's rotation). A line from the attacker to where
 * it contacts the vehicle determines which facing is struck.
 *
 * If the attack origin lies exactly on a diagonal boundary (ambiguous),
 * the defender chooses — the default implementation resolves to Side.
 */

import type { Position } from '@hh/types';
import { VehicleFacing } from '@hh/types';
import { EPSILON } from './constants';
import { vec2Sub, vec2Normalize, vec2Dot } from './vec2';
import type { RectHull } from './shapes';
import { getRectCorners } from './shapes';

// ─── Arc Boundary Computation ────────────────────────────────────────────────

/**
 * Compute the angular boundaries (in radians, world-space) of the vehicle's
 * armour arcs. The angles are measured from the positive x-axis and account
 * for the hull's rotation.
 *
 * The four boundary lines correspond to the diagonals of the hull rectangle.
 * - frontLeftAngle / frontRightAngle: boundaries between Front and Side arcs
 * - rearLeftAngle / rearRightAngle: boundaries between Side and Rear arcs
 *
 * All angles are in the range (-PI, PI].
 *
 * @param vehicle - The rectangular vehicle hull
 * @returns Object containing the four boundary angles
 */
export function getVehicleArcBoundaries(vehicle: RectHull): {
  frontLeftAngle: number;
  frontRightAngle: number;
  rearLeftAngle: number;
  rearRightAngle: number;
} {
  // Get hull corners in world space: [FL, FR, RR, RL]
  const [fl, fr, rr, rl] = getRectCorners(vehicle);

  // Compute angles from vehicle center to each corner
  const frontLeftAngle = Math.atan2(fl.y - vehicle.center.y, fl.x - vehicle.center.x);
  const frontRightAngle = Math.atan2(fr.y - vehicle.center.y, fr.x - vehicle.center.x);
  const rearRightAngle = Math.atan2(rr.y - vehicle.center.y, rr.x - vehicle.center.x);
  const rearLeftAngle = Math.atan2(rl.y - vehicle.center.y, rl.x - vehicle.center.x);

  return {
    frontLeftAngle,
    frontRightAngle,
    rearLeftAngle,
    rearRightAngle,
  };
}

// ─── Vehicle Facing Determination ────────────────────────────────────────────

/**
 * Determine which armour facing of a vehicle is targeted by an attack.
 * Uses hull corner diagonals to divide space into front/side/rear sectors.
 *
 * Algorithm:
 * 1. Compute the vehicle's forward direction vector from its rotation.
 * 2. Compute the vector from the vehicle center to the attack origin.
 * 3. Calculate the absolute angle between the forward direction and the attack vector.
 * 4. Use the hull's aspect ratio (half-width / half-height) to compute the diagonal angle.
 * 5. Map the angle to Front, Side, or Rear sector.
 *
 * For a rectangle with half-width `hw` (along facing) and half-height `hh` (perpendicular):
 * - The diagonal angle from the forward axis = atan2(hh, hw)
 * - Front sector: absolute angle from forward < diagonalAngle
 * - Rear sector: absolute angle from forward > PI - diagonalAngle
 * - Side sector: everything else
 *
 * If the attack origin is exactly on a diagonal boundary (within EPSILON),
 * the defender chooses. The default resolution is Side (most common defender choice).
 *
 * Reference: HH_Principles.md — "Vehicles and Damage"
 *
 * @param vehicle - The rectangular vehicle hull
 * @param attackOrigin - World-space position of the attacker
 * @returns The VehicleFacing (Front, Side, or Rear) struck by the attack
 */
export function determineVehicleFacing(vehicle: RectHull, attackOrigin: Position): VehicleFacing {
  // Step 1: Get the vehicle's forward direction from its rotation
  // rotation = 0 means facing right (+x). The forward direction is a unit vector
  // at the hull's rotation angle.
  const forward: Position = { x: Math.cos(vehicle.rotation), y: Math.sin(vehicle.rotation) };

  // Step 2: Compute the vector from the vehicle center to the attack origin
  const toAttacker = vec2Sub(attackOrigin, vehicle.center);

  // Handle degenerate case: attacker is exactly at vehicle center
  // Default to Front (attacker is "inside" the vehicle)
  const toAttackerNorm = vec2Normalize(toAttacker);
  if (Math.abs(toAttackerNorm.x) < EPSILON && Math.abs(toAttackerNorm.y) < EPSILON) {
    return VehicleFacing.Front;
  }

  // Step 3: Calculate the absolute angle between forward and the attack vector
  // Using dot product: cos(theta) = dot(forward, toAttackerNorm)
  // The absolute angle is what matters for sector determination.
  const dotProduct = vec2Dot(forward, toAttackerNorm);
  // Clamp to [-1, 1] to handle floating-point errors in acos
  const clampedDot = Math.max(-1, Math.min(1, dotProduct));
  const absAngle = Math.acos(clampedDot);

  // Step 4: Compute the diagonal angle from the forward axis
  // Width is along the facing direction, height is perpendicular
  const hw = vehicle.width / 2;
  const hh = vehicle.height / 2;
  const diagonalAngle = Math.atan2(hh, hw);

  // Step 5: Map angle to facing sector
  // Front sector: angle < diagonalAngle
  // Rear sector: angle > PI - diagonalAngle
  // Side sector: everything in between
  // Boundary cases (on a diagonal): default to Side (defender's choice)

  const frontBoundary = diagonalAngle;
  const rearBoundary = Math.PI - diagonalAngle;

  // Check for boundary cases (attacker lies exactly on a diagonal line)
  if (Math.abs(absAngle - frontBoundary) < EPSILON) {
    // On the front/side diagonal boundary — defender chooses, default to Side
    return VehicleFacing.Side;
  }

  if (Math.abs(absAngle - rearBoundary) < EPSILON) {
    // On the side/rear diagonal boundary — defender chooses, default to Side
    return VehicleFacing.Side;
  }

  // Determine sector
  if (absAngle < frontBoundary) {
    return VehicleFacing.Front;
  }

  if (absAngle > rearBoundary) {
    return VehicleFacing.Rear;
  }

  return VehicleFacing.Side;
}
