/**
 * Target Priority
 *
 * Scores potential shooting and charge targets for the tactical AI.
 * Uses heuristics based on unit state, position, and estimated damage.
 */

import type { GameState } from '@hh/types';
import { getAliveModels } from '@hh/engine';
import type { TargetScore } from '../types';
import { getValidShootingTargets, getValidChargeTargets, getUnitCentroid } from '../helpers/unit-queries';
import { evaluateUnitThreat } from './threat-evaluation';

// ─── Scoring Constants ───────────────────────────────────────────────────────

/** Bonus for wounded units (finish them off) */
const WOUNDED_BONUS = 30;

/** Bonus for units with few remaining models (easy kill) */
const EASY_KILL_BONUS = 20;
const EASY_KILL_THRESHOLD = 3; // models or fewer

/** Bonus for high-threat units (from threat evaluation) */
const THREAT_WEIGHT = 0.5;

/** Penalty for units locked in combat (can't shoot into combat safely) */
const LOCKED_IN_COMBAT_PENALTY = -40;

/** Bonus for units that are closer (more likely to hit, better weapon effectiveness) */
const CLOSE_RANGE_BONUS = 15;
const CLOSE_RANGE_THRESHOLD = 12; // inches

/** Penalty for large units (harder to destroy completely) */
const LARGE_UNIT_PENALTY_THRESHOLD = 10; // models
const LARGE_UNIT_PENALTY = -10;

// ─── Shooting Target Priority ────────────────────────────────────────────────

/**
 * Prioritize shooting targets for the tactical AI.
 *
 * @param state - Current game state
 * @param attackerUnitId - The unit that will be shooting
 * @param playerIndex - AI player index
 * @returns Sorted array of TargetScore (highest priority first)
 */
export function prioritizeShootingTargets(
  state: GameState,
  attackerUnitId: string,
  playerIndex: number,
): TargetScore[] {
  const validTargets = getValidShootingTargets(state, attackerUnitId);
  const attackerCentroid = getAttackerCentroid(state, attackerUnitId);

  const scores: TargetScore[] = validTargets.map((target) => {
    let score = 0;
    const reasons: string[] = [];

    const aliveModels = getAliveModels(target);

    // Wounded units — finish them off
    const hasWoundedModels = aliveModels.some((m) => m.currentWounds < 1);
    if (hasWoundedModels) {
      score += WOUNDED_BONUS;
      reasons.push('wounded models');
    }

    // Easy kills — few models remaining
    if (aliveModels.length <= EASY_KILL_THRESHOLD && aliveModels.length > 0) {
      score += EASY_KILL_BONUS;
      reasons.push('easy kill');
    }

    // Threat level
    const threat = evaluateUnitThreat(state, playerIndex, target.id);
    score += threat * THREAT_WEIGHT;
    if (threat > 50) {
      reasons.push('high threat');
    }

    // Locked in combat penalty
    if (target.isLockedInCombat) {
      score += LOCKED_IN_COMBAT_PENALTY;
      reasons.push('locked in combat');
    }

    // Close range bonus
    if (attackerCentroid) {
      const targetCentroid = getUnitCentroid(target);
      if (targetCentroid) {
        const dx = targetCentroid.x - attackerCentroid.x;
        const dy = targetCentroid.y - attackerCentroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= CLOSE_RANGE_THRESHOLD) {
          score += CLOSE_RANGE_BONUS;
          reasons.push('close range');
        }
      }
    }

    // Large unit penalty
    if (aliveModels.length > LARGE_UNIT_PENALTY_THRESHOLD) {
      score += LARGE_UNIT_PENALTY;
      reasons.push('large unit');
    }

    return { unitId: target.id, score, reasons };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

// ─── Charge Target Priority ─────────────────────────────────────────────────

/**
 * Prioritize charge targets for the tactical AI.
 *
 * @param state - Current game state
 * @param chargerUnitId - The unit that will be charging
 * @param playerIndex - AI player index
 * @returns Sorted array of TargetScore (highest priority first)
 */
export function prioritizeChargeTargets(
  state: GameState,
  chargerUnitId: string,
  playerIndex: number,
): TargetScore[] {
  const validTargets = getValidChargeTargets(state, chargerUnitId);

  // Get charger info for comparison
  const charger = state.armies[playerIndex].units.find((u) => u.id === chargerUnitId);
  const chargerModels = charger ? getAliveModels(charger).length : 0;

  const scores: TargetScore[] = validTargets.map((target) => {
    let score = 0;
    const reasons: string[] = [];

    const targetModels = getAliveModels(target).length;

    // Outnumber bonus — we have more models
    if (chargerModels > targetModels) {
      score += 25;
      reasons.push('outnumber');
    } else if (targetModels > chargerModels * 1.5) {
      score -= 20;
      reasons.push('outnumbered');
    }

    // Easy kill bonus — few models remaining
    if (targetModels <= EASY_KILL_THRESHOLD && targetModels > 0) {
      score += EASY_KILL_BONUS;
      reasons.push('easy kill');
    }

    // Threat level — prefer charging high-threat units
    const threat = evaluateUnitThreat(state, playerIndex, target.id);
    score += threat * 0.3;

    // Already engaged bonus — multi-charge advantage
    if (target.isLockedInCombat) {
      score += 15;
      reasons.push('already engaged');
    }

    return { unitId: target.id, score, reasons };
  });

  scores.sort((a, b) => b.score - a.score);

  return scores;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAttackerCentroid(
  state: GameState,
  attackerUnitId: string,
): { x: number; y: number } | null {
  const unit =
    state.armies[0].units.find((u) => u.id === attackerUnitId) ??
    state.armies[1].units.find((u) => u.id === attackerUnitId);
  if (!unit) return null;
  return getUnitCentroid(unit);
}
