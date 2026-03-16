/**
 * Shooting AI
 *
 * Generates shooting commands for the AI during the Shooting phase.
 * Handles target selection, weapon assignment, and casualty resolution.
 */

import type { GameState, GameCommand, UnitState } from '@hh/types';
import { getAliveModels } from '@hh/engine';
import type { AITurnContext, StrategyMode } from '../types';
import {
  getShootableUnits,
  getValidDoorwayShootingTargets,
  getValidShootingTargets,
  type ZoneMortalisDoorwayTarget,
} from '../helpers/unit-queries';
import {
  hasWeaponsInRange,
  hasWeaponsInRangeToDoorway,
  selectWeaponsForAttack,
  selectWeaponsForDoorwayAttack,
} from '../helpers/weapon-selection';

type ShootingTargetCandidate =
  | { kind: 'unit'; unit: UnitState }
  | { kind: 'doorway'; doorway: ZoneMortalisDoorwayTarget };

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate the next shooting command for the AI.
 *
 * @returns A GameCommand or null if no more shooting actions are needed
 */
export function generateShootingCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  // If there's an active shooting attack awaiting casualty resolution, resolve it
  if (state.shootingAttackState) {
    return { type: 'resolveShootingCasualties' };
  }

  // Find the next unit to shoot with
  const shootableUnits = getShootableUnits(state, playerIndex, context.actedUnitIds);
  if (shootableUnits.length === 0) {
    return null; // No more units can shoot
  }

  // Try each shootable unit until we find one with valid targets
  for (const unit of shootableUnits) {
    const unitTargets = getValidShootingTargets(state, unit.id)
      .filter((target) => hasWeaponsInRange(state, unit, target.id))
      .map((target) => ({ kind: 'unit', unit: target } as ShootingTargetCandidate));
    const doorwayTargets = getValidDoorwayShootingTargets(state, unit.id)
      .filter((target) => hasWeaponsInRangeToDoorway(state, unit, target.doorwayId))
      .map((doorway) => ({ kind: 'doorway', doorway } as ShootingTargetCandidate));
    const targets = [...unitTargets, ...doorwayTargets];

    if (targets.length === 0) {
      // No valid targets for this unit — mark as acted and try next
      context.actedUnitIds.add(unit.id);
      continue;
    }

    // Select a target
    const target = selectTarget(state, unit.id, targets, strategy);
    if (!target) {
      context.actedUnitIds.add(unit.id);
      continue;
    }

    const weaponSelections = target.kind === 'unit'
      ? selectWeaponsForAttack(state, unit, target.unit, strategy)
      : selectWeaponsForDoorwayAttack(state, unit, target.doorway.doorwayId, strategy);
    if (weaponSelections.length === 0) {
      context.actedUnitIds.add(unit.id);
      continue;
    }

    // Mark unit as acted
    context.actedUnitIds.add(unit.id);

    return {
      type: 'declareShooting',
      attackingUnitId: unit.id,
      targetUnitId: target.kind === 'unit' ? target.unit.id : target.doorway.doorwayId,
      target: target.kind === 'doorway'
        ? { kind: 'doorway', doorwayId: target.doorway.doorwayId }
        : undefined,
      targetDoorwayId: target.kind === 'doorway' ? target.doorway.doorwayId : undefined,
      weaponSelections,
    };
  }

  // No units could find valid targets
  return null;
}

// ─── Target Selection ────────────────────────────────────────────────────────

/**
 * Select a target for shooting.
 *
 * Basic: random target from valid list
 * Tactical: prioritize wounded/exposed/high-threat targets
 */
function selectTarget(
  state: GameState,
  _attackerUnitId: string,
  validTargets: ShootingTargetCandidate[],
  strategy: StrategyMode,
): ShootingTargetCandidate | null {
  if (validTargets.length === 0) return null;

  if (strategy === 'basic') {
    // Random target
    const idx = Math.floor(Math.random() * validTargets.length);
    return validTargets[idx];
  }

  // Tactical: score each target and pick the best
  let bestTarget = validTargets[0];
  let bestScore = -Infinity;

  for (const target of validTargets) {
    const score = scoreShootingTarget(state, target);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = target;
    }
  }

  return bestTarget;
}

/**
 * Score a potential shooting target for the tactical AI.
 * Higher score = higher priority target.
 */
function scoreShootingTarget(
  _state: GameState,
  target: ShootingTargetCandidate,
): number {
  if (target.kind === 'doorway') {
    return (
      (target.doorway.state === 'closed' ? 14 : 6) +
      ((3 - target.doorway.hullPoints) * 4) +
      target.doorway.width
    );
  }

  const targetUnit = target.unit;
  let score = 0;
  const aliveModels = getAliveModels(targetUnit);

  // Prefer targets with fewer alive models (easier to finish off)
  if (aliveModels.length > 0 && aliveModels.length <= 3) {
    score += 30; // Easy kill bonus
  }

  // Prefer targets that have wounded models (finish them off)
  const hasWounded = aliveModels.some((m) => m.currentWounds < 1);
  if (hasWounded) {
    score += 20;
  }

  // Prefer targets that are in the open (no statuses suggesting cover)
  // (simplified — in full implementation would check terrain)
  score += 10;

  // Penalize targets with many models (harder to destroy)
  if (aliveModels.length > 10) {
    score -= 10;
  }

  // Prefer targets that are locked in combat (can't react)
  if (targetUnit.isLockedInCombat) {
    score -= 5; // Actually penalize — shooting into combat is risky
  }

  return score;
}
