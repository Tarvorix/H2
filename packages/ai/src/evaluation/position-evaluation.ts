/**
 * Position Evaluation
 *
 * Scores movement destinations for the tactical AI.
 * Considers objectives, cover, firing lanes, and threat avoidance.
 */

import type { GameState, Position } from '@hh/types';
// MovementScore type is available from types but used by callers, not internally
import { getUnitCentroid, getEnemyDeployedUnits } from '../helpers/unit-queries';
import { distanceBetween } from '../helpers/movement-destination';

// ─── Scoring Constants ───────────────────────────────────────────────────────

/** Bonus for moving toward objectives */
const OBJECTIVE_PROXIMITY_WEIGHT = 2.0;

/** Bonus for maintaining distance from enemy melee threats */
const THREAT_AVOIDANCE_BONUS = 15;
const THREAT_AVOIDANCE_DISTANCE = 14; // Ideal distance to maintain from enemy melee

/** Bonus for being at good shooting range (12-24") */
const SHOOTING_RANGE_BONUS = 10;
const SHOOTING_RANGE_MIN = 12;
const SHOOTING_RANGE_MAX = 24;

/** Penalty for moving too close to the battlefield edge */
const EDGE_PROXIMITY_PENALTY = -10;
const EDGE_PROXIMITY_THRESHOLD = 3; // inches from edge

// ─── Position Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a potential movement destination for the tactical AI.
 *
 * @param state - Current game state
 * @param unitId - The unit being moved
 * @param candidatePos - The position to evaluate
 * @param playerIndex - AI player index
 * @returns Score (higher = better position)
 */
export function evaluateMovementDestination(
  state: GameState,
  _unitId: string,
  candidatePos: Position,
  playerIndex: number,
): number {
  let score = 0;

  // Objective proximity
  score += evaluateObjectiveProximity(state, candidatePos);

  // Threat avoidance — stay away from enemy melee units
  score += evaluateThreatAvoidance(state, candidatePos, playerIndex);

  // Shooting range — try to be at optimal shooting distance
  score += evaluateShootingRange(state, candidatePos, playerIndex);

  // Edge proximity penalty
  score += evaluateEdgeProximity(state, candidatePos);

  return score;
}

/**
 * Find the best movement position from a set of candidates.
 *
 * @param state - Current game state
 * @param unitId - The unit being moved
 * @param candidates - Candidate positions to evaluate
 * @param playerIndex - AI player index
 * @returns The best position, or the first candidate if none score well
 */
export function findBestMovePosition(
  state: GameState,
  unitId: string,
  candidates: Position[],
  playerIndex: number,
): Position {
  if (candidates.length === 0) {
    return { x: 36, y: 24 }; // Center of default battlefield
  }

  let bestPos = candidates[0];
  let bestScore = -Infinity;

  for (const pos of candidates) {
    const score = evaluateMovementDestination(state, unitId, pos, playerIndex);
    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return bestPos;
}

/**
 * Generate a set of candidate positions for a unit to evaluate.
 * Creates positions in 8 directions at the maximum movement distance.
 *
 * @param currentPos - Current position
 * @param maxDistance - Maximum movement distance
 * @param battlefieldWidth - Battlefield width
 * @param battlefieldHeight - Battlefield height
 * @returns Array of candidate positions
 */
export function generateCandidatePositions(
  currentPos: Position,
  maxDistance: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position[] {
  const candidates: Position[] = [];
  const directions = 8;

  for (let i = 0; i < directions; i++) {
    const angle = (i * 2 * Math.PI) / directions;
    const pos: Position = {
      x: Math.max(0.5, Math.min(battlefieldWidth - 0.5, currentPos.x + Math.cos(angle) * maxDistance)),
      y: Math.max(0.5, Math.min(battlefieldHeight - 0.5, currentPos.y + Math.sin(angle) * maxDistance)),
    };
    candidates.push(pos);
  }

  // Also consider half-distance positions
  for (let i = 0; i < directions; i++) {
    const angle = (i * 2 * Math.PI) / directions;
    const halfDist = maxDistance / 2;
    const pos: Position = {
      x: Math.max(0.5, Math.min(battlefieldWidth - 0.5, currentPos.x + Math.cos(angle) * halfDist)),
      y: Math.max(0.5, Math.min(battlefieldHeight - 0.5, currentPos.y + Math.sin(angle) * halfDist)),
    };
    candidates.push(pos);
  }

  // Also consider staying in place
  candidates.push({ ...currentPos });

  return candidates;
}

// ─── Sub-Evaluators ──────────────────────────────────────────────────────────

/**
 * Score based on proximity to objectives.
 */
function evaluateObjectiveProximity(state: GameState, pos: Position): number {
  if (!state.missionState?.objectives) return 0;

  let score = 0;
  for (const obj of state.missionState.objectives) {
    if (obj.isRemoved) continue;
    const dist = distanceBetween(pos, obj.position);
    // Closer to objective = higher score (max bonus at 0 distance)
    if (dist <= 3) {
      score += obj.vpValue * OBJECTIVE_PROXIMITY_WEIGHT * 10; // On the objective
    } else if (dist <= 12) {
      score += obj.vpValue * OBJECTIVE_PROXIMITY_WEIGHT * (12 - dist) / 12;
    }
  }

  return score;
}

/**
 * Score based on distance from enemy melee threats.
 * Ranged units want to maintain ~14" distance (out of charge range).
 */
function evaluateThreatAvoidance(
  state: GameState,
  pos: Position,
  playerIndex: number,
): number {
  const enemies = getEnemyDeployedUnits(state, playerIndex);
  if (enemies.length === 0) return 0;

  let score = 0;
  for (const enemy of enemies) {
    const centroid = getUnitCentroid(enemy);
    if (!centroid) continue;

    const dist = distanceBetween(pos, centroid);

    // Ideal distance is THREAT_AVOIDANCE_DISTANCE — close enough to shoot, far enough to avoid charges
    const deviation = Math.abs(dist - THREAT_AVOIDANCE_DISTANCE);
    if (deviation < 2) {
      score += THREAT_AVOIDANCE_BONUS;
    } else if (dist < 6) {
      // Too close — penalty
      score -= 15;
    }
  }

  return score;
}

/**
 * Score based on being at optimal shooting range.
 */
function evaluateShootingRange(
  state: GameState,
  pos: Position,
  playerIndex: number,
): number {
  const enemies = getEnemyDeployedUnits(state, playerIndex);
  if (enemies.length === 0) return 0;

  let score = 0;
  for (const enemy of enemies) {
    const centroid = getUnitCentroid(enemy);
    if (!centroid) continue;

    const dist = distanceBetween(pos, centroid);
    if (dist >= SHOOTING_RANGE_MIN && dist <= SHOOTING_RANGE_MAX) {
      score += SHOOTING_RANGE_BONUS;
    }
  }

  return score;
}

/**
 * Penalize positions too close to the battlefield edge.
 */
function evaluateEdgeProximity(state: GameState, pos: Position): number {
  const bfWidth = state.battlefield?.width ?? 72;
  const bfHeight = state.battlefield?.height ?? 48;

  let penalty = 0;
  if (pos.x < EDGE_PROXIMITY_THRESHOLD) penalty += EDGE_PROXIMITY_PENALTY;
  if (pos.x > bfWidth - EDGE_PROXIMITY_THRESHOLD) penalty += EDGE_PROXIMITY_PENALTY;
  if (pos.y < EDGE_PROXIMITY_THRESHOLD) penalty += EDGE_PROXIMITY_PENALTY;
  if (pos.y > bfHeight - EDGE_PROXIMITY_THRESHOLD) penalty += EDGE_PROXIMITY_PENALTY;

  return penalty;
}
