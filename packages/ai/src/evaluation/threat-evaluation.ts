/**
 * Threat Evaluation
 *
 * Scores enemy units by threat level for tactical AI decision-making.
 * Higher scores indicate units that pose a greater threat to the AI's army.
 */

import type { GameState } from '@hh/types';
import { getAliveModels, getDeployedUnits, canUnitCharge } from '@hh/engine';
import type { TargetScore } from '../types';
import { getUnitCentroid, getEnemyDeployedUnits } from '../helpers/unit-queries';

// ─── Scoring Constants ───────────────────────────────────────────────────────

/** Bonus per alive model (more models = more attacks = more threat) */
const MODEL_COUNT_WEIGHT = 5;

/** Proximity bonus — closer enemies are bigger threats */
const PROXIMITY_BONUS_THRESHOLD = 12; // inches
const PROXIMITY_BONUS = 20;

/** Extra threat for units that can charge this turn */
const CHARGE_THREAT_BONUS = 25;

/** Bonus for units with many equipped weapons */
const WEAPON_COUNT_WEIGHT = 3;

/** Maximum threat score (prevents runaway values) */
const MAX_THREAT_SCORE = 100;

// ─── Threat Evaluation ──────────────────────────────────────────────────────

/**
 * Evaluate the threat level of a single enemy unit.
 *
 * @param state - Current game state
 * @param evaluatingPlayerIndex - The AI player evaluating threats
 * @param enemyUnitId - The enemy unit to evaluate
 * @returns Threat score (higher = more threatening)
 */
export function evaluateUnitThreat(
  state: GameState,
  evaluatingPlayerIndex: number,
  enemyUnitId: string,
): number {
  const enemyIndex = evaluatingPlayerIndex === 0 ? 1 : 0;
  const enemy = state.armies[enemyIndex].units.find((u) => u.id === enemyUnitId);
  if (!enemy) return 0;

  const aliveModels = getAliveModels(enemy);
  if (aliveModels.length === 0) return 0;

  let score = 0;
  const reasons: string[] = [];

  // Model count — more models = more threat
  score += aliveModels.length * MODEL_COUNT_WEIGHT;
  reasons.push(`${aliveModels.length} alive models`);

  // Weapon count — models with weapons pose more threat
  const totalWeapons = aliveModels.reduce(
    (acc, m) => acc + m.equippedWargear.length,
    0,
  );
  score += totalWeapons * WEAPON_COUNT_WEIGHT;

  // Proximity — closer enemies are bigger threats
  const friendlyArmy = state.armies[evaluatingPlayerIndex];
  const friendlyUnits = getDeployedUnits(friendlyArmy);
  const enemyCentroid = getUnitCentroid(enemy);

  if (enemyCentroid && friendlyUnits.length > 0) {
    let minDist = Infinity;
    for (const friendly of friendlyUnits) {
      const friendlyCentroid = getUnitCentroid(friendly);
      if (!friendlyCentroid) continue;
      const dx = enemyCentroid.x - friendlyCentroid.x;
      const dy = enemyCentroid.y - friendlyCentroid.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }

    if (minDist <= PROXIMITY_BONUS_THRESHOLD) {
      score += PROXIMITY_BONUS;
      reasons.push(`within ${PROXIMITY_BONUS_THRESHOLD}" of friendly`);
    }
  }

  // Charge capability — units that can charge are immediate threats
  if (canUnitCharge(enemy)) {
    score += CHARGE_THREAT_BONUS;
    reasons.push('can charge');
  }

  return Math.min(score, MAX_THREAT_SCORE);
}

/**
 * Rank all enemy units by threat level.
 *
 * @param state - Current game state
 * @param playerIndex - The AI player evaluating threats
 * @returns Sorted array of TargetScore (highest threat first)
 */
export function rankUnitsByThreat(
  state: GameState,
  playerIndex: number,
): TargetScore[] {
  const enemies = getEnemyDeployedUnits(state, playerIndex);

  const scores: TargetScore[] = enemies.map((enemy) => ({
    unitId: enemy.id,
    score: evaluateUnitThreat(state, playerIndex, enemy.id),
    reasons: [],
  }));

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}
