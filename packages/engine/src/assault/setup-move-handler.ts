/**
 * Set-up Move Handler
 * Implements the Set-up Move mechanic (Step 3 of the Charge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Step 3
 *
 * The set-up move allows the charging unit to move a short distance
 * toward the target before the actual charge roll. If any model achieves
 * base-to-base contact during the set-up move, the charge succeeds
 * immediately — Steps 4 and 5 are skipped.
 *
 * Set-up Move distance is determined by an I+M table lookup.
 * The set-up move is skipped entirely for Disordered Charges.
 */

import type { GameState, ModelState, Position } from '@hh/types';
import { checkCoherency, STANDARD_COHERENCY_RANGE } from '@hh/geometry';
import { PipelineHook } from '@hh/types';
import { getTacticaEffectsForLegion } from '@hh/data';
import type { GameEvent } from '../types';
import { getModelShapeAtPosition } from '../model-shapes';
import {
  findUnit,
  getAliveModels,
  getDistanceBetween,
  getUnitLegion,
} from '../game-queries';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
} from '../state-helpers';
import { calculateSetupMoveDistance } from './assault-types';
import { applyLegionTactica } from '../legion';
import {
  getUnitSetupMoveInitiative,
  getUnitSetupMoveMovement,
  unitHasAnyHeavyModel,
} from './unit-characteristics';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default Initiative value for standard Space Marine models */
export const DEFAULT_INITIATIVE = 4;

/** Default Movement value for standard Space Marine models */
export const DEFAULT_MOVEMENT = 7;

/** Base radius in inches (~32mm diameter) */
const BASE_RADIUS_INCHES = 0.63;

/** Two bases touching threshold */
const BASE_CONTACT_THRESHOLD = BASE_RADIUS_INCHES * 2 + 0.01;

// ─── Setup Move Result ──────────────────────────────────────────────────────

/**
 * Result of resolving a set-up move.
 */
export interface SetupMoveResult {
  /** The updated game state */
  state: GameState;
  /** Events generated during the set-up move */
  events: GameEvent[];
  /** Whether the charge succeeded via base contact during the set-up move */
  chargeCompleteViaSetup: boolean;
  /** The set-up move distance used */
  setupMoveDistance: number;
  /** Whether the set-up move was skipped (disordered charge) */
  skipped: boolean;
}

// ─── Resolve Setup Move ─────────────────────────────────────────────────────

/**
 * Resolves the Set-up Move (Step 3 of the Charge Sub-Phase).
 *
 * Procedure:
 * 1. Skip if Disordered charge
 * 2. Calculate set-up move distance from I+M table
 * 3. Find the closest charging model to the target (initial mover)
 * 4. Move the initial mover toward the closest target model, up to the set-up distance
 * 5. If any charging model achieves base contact → charge immediately succeeds
 * 6. Move remaining models toward the target, maintaining coherency
 *
 * Notes:
 * - Ignores difficult terrain movement penalty (dangerous tests still apply)
 * - Model may move within any distance of enemy, may end in base contact with target
 * - Cannot contact non-target enemy units
 *
 * @param state - Current game state
 * @param chargingUnitId - ID of the charging unit
 * @param targetUnitId - ID of the target unit
 * @param isDisordered - Whether this is a disordered charge
 * @param initiative - Average initiative of the charging unit (default: 4)
 * @param movement - Average movement of the charging unit (default: 7)
 * @returns SetupMoveResult with updated state and events
 */
export function resolveSetupMove(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
  isDisordered: boolean,
  initiative?: number,
  movement?: number,
): SetupMoveResult {
  const events: GameEvent[] = [];

  // Step 1: Skip if Disordered charge
  if (isDisordered) {
    return {
      state,
      events,
      chargeCompleteViaSetup: false,
      setupMoveDistance: 0,
      skipped: true,
    };
  }

  const chargingUnit = findUnit(state, chargingUnitId);
  const targetUnit = findUnit(state, targetUnitId);

  const setupInitiative = initiative ?? (chargingUnit
    ? getUnitSetupMoveInitiative(chargingUnit)
    : DEFAULT_INITIATIVE);
  const setupMovement = movement ?? (chargingUnit
    ? getUnitSetupMoveMovement(chargingUnit)
    : DEFAULT_MOVEMENT);

  // Step 2: Calculate set-up move distance, applying legion tactica bonus (e.g., Space Wolves +2")
  let setupMoveDistance = chargingUnit && unitHasAnyHeavyModel(chargingUnit)
    ? calculateSetupMoveDistance(0, setupMovement)
    : calculateSetupMoveDistance(setupInitiative, setupMovement);

  const chargerLegion = getUnitLegion(state, chargingUnitId);
  if (chargerLegion) {
    const effects = getTacticaEffectsForLegion(chargerLegion);
    const chargingUnit0 = findUnit(state, chargingUnitId);
    if (chargingUnit0) {
      const tacticaResult = applyLegionTactica(chargerLegion, PipelineHook.OnCharge, {
        state,
        unit: chargingUnit0,
        effects,
        hook: PipelineHook.OnCharge,
        isChargeTurn: true,
        isChallenge: false,
        enemyUnits: [],
        entireUnitHasTactica: true,
      });
      if (tacticaResult.setupMoveBonus) {
        setupMoveDistance += tacticaResult.setupMoveBonus;
        if (tacticaResult.setupMoveMax !== undefined) {
          setupMoveDistance = Math.min(setupMoveDistance, tacticaResult.setupMoveMax);
        }
      }
    }
  }

  if (!chargingUnit || !targetUnit) {
    return {
      state,
      events,
      chargeCompleteViaSetup: false,
      setupMoveDistance,
      skipped: false,
    };
  }

  const aliveChargers = getAliveModels(chargingUnit);
  const aliveTargets = getAliveModels(targetUnit);

  if (aliveChargers.length === 0 || aliveTargets.length === 0) {
    return {
      state,
      events,
      chargeCompleteViaSetup: false,
      setupMoveDistance,
      skipped: false,
    };
  }

  // Step 3: Find the closest charging model to any target model (initial mover)
  const { initialMoverId, closestTargetId } = findInitialMover(aliveChargers, aliveTargets);

  // Step 4: Move the initial mover toward the closest target model
  let newState = state;
  let chargeComplete = false;

  const initialMover = aliveChargers.find(m => m.id === initialMoverId)!;
  const closestTarget = aliveTargets.find(m => m.id === closestTargetId)!;
  const newPos = moveToward(initialMover.position, closestTarget.position, setupMoveDistance);

  newState = updateUnitInGameState(newState, chargingUnitId, unit =>
    updateModelInUnit(unit, initialMoverId, model => moveModel(model, newPos)),
  );

  events.push({
    type: 'setupMove',
    chargingUnitId,
    targetUnitId,
    modelId: initialMoverId,
    from: initialMover.position,
    to: newPos,
    distance: setupMoveDistance,
  } as GameEvent);

  // Step 5: Check if the initial mover achieved base contact
  if (isInBaseContactWithUnit(newPos, aliveTargets)) {
    chargeComplete = true;
  }

  const plannedPositions = new Map<string, Position>(
    aliveChargers.map((charger) => {
      if (charger.id === initialMoverId) {
        return [charger.id, newPos] as const;
      }

      const nearestTarget = findClosestModel(charger, aliveTargets);
      return [
        charger.id,
        nearestTarget
          ? moveToward(charger.position, nearestTarget.position, setupMoveDistance)
          : charger.position,
      ] as const;
    }),
  );

  // Step 6: Move remaining models toward the closest target while preserving
  // final coherency against the predicted end positions for the charging unit.
  if (!chargeComplete) {
    const remainingChargers = aliveChargers
      .filter((charger) => charger.id !== initialMoverId)
      .sort((left, right) => {
        const leftTarget = findClosestModel(left, aliveTargets);
        const rightTarget = findClosestModel(right, aliveTargets);
        const leftDistance = leftTarget ? getDistanceBetween(left.position, leftTarget.position) : Infinity;
        const rightDistance = rightTarget ? getDistanceBetween(right.position, rightTarget.position) : Infinity;
        return leftDistance - rightDistance;
      });

    for (const charger of remainingChargers) {
      const chargerStartPosition = charger.position;

      const nearestTarget = findClosestModel(charger, aliveTargets);
      if (!nearestTarget) continue;

      const chargerNewPos = findBestCoherentAdvancePosition(
        aliveChargers,
        charger,
        plannedPositions,
        nearestTarget.position,
        setupMoveDistance,
      );
      plannedPositions.set(charger.id, chargerNewPos);

      newState = updateUnitInGameState(newState, chargingUnitId, unit =>
        updateModelInUnit(unit, charger.id, model => moveModel(model, chargerNewPos)),
      );

      events.push({
        type: 'setupMove',
        chargingUnitId,
        targetUnitId,
        modelId: charger.id,
        from: chargerStartPosition,
        to: chargerNewPos,
        distance: setupMoveDistance,
      } as GameEvent);

      // Check if this model achieved base contact
      if (isInBaseContactWithUnit(chargerNewPos, aliveTargets)) {
        chargeComplete = true;
      }
    }
  }

  return {
    state: newState,
    events,
    chargeCompleteViaSetup: chargeComplete,
    setupMoveDistance,
    skipped: false,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Find the initial mover (closest charging model to any target model)
 * and the closest target model.
 */
function findInitialMover(
  chargers: ModelState[],
  targets: ModelState[],
): { initialMoverId: string; closestTargetId: string } {
  let minDist = Infinity;
  let initialMoverId = chargers[0].id;
  let closestTargetId = targets[0].id;

  for (const charger of chargers) {
    for (const target of targets) {
      const dist = getDistanceBetween(charger.position, target.position);
      if (dist < minDist) {
        minDist = dist;
        initialMoverId = charger.id;
        closestTargetId = target.id;
      }
    }
  }

  return { initialMoverId, closestTargetId };
}

/**
 * Find the closest target model to a given charger model.
 */
function findClosestModel(
  charger: ModelState,
  targets: ModelState[],
): ModelState | null {
  let minDist = Infinity;
  let closest: ModelState | null = null;

  for (const target of targets) {
    const dist = getDistanceBetween(charger.position, target.position);
    if (dist < minDist) {
      minDist = dist;
      closest = target;
    }
  }

  return closest;
}

function findBestCoherentAdvancePosition(
  chargers: ModelState[],
  movingCharger: ModelState,
  plannedPositions: Map<string, Position>,
  targetPosition: Position,
  maxDistance: number,
): Position {
  const startPosition = movingCharger.position;
  const desiredPosition = moveToward(startPosition, targetPosition, maxDistance);
  if (positionsMaintainCoherency(chargers, movingCharger, plannedPositions, desiredPosition)) {
    return desiredPosition;
  }

  const dx = desiredPosition.x - startPosition.x;
  const dy = desiredPosition.y - startPosition.y;
  for (let step = 19; step >= 0; step -= 1) {
    const ratio = step / 20;
    const candidate: Position = {
      x: startPosition.x + dx * ratio,
      y: startPosition.y + dy * ratio,
    };
    if (positionsMaintainCoherency(chargers, movingCharger, plannedPositions, candidate)) {
      return candidate;
    }
  }

  return startPosition;
}

function positionsMaintainCoherency(
  chargers: ModelState[],
  movingCharger: ModelState,
  plannedPositions: Map<string, Position>,
  candidatePosition: Position,
): boolean {
  const shapes = chargers.map((charger) =>
    getModelShapeAtPosition(
      charger,
      charger.id === movingCharger.id
        ? candidatePosition
        : (plannedPositions.get(charger.id) ?? charger.position),
    ),
  );
  return checkCoherency(shapes, STANDARD_COHERENCY_RANGE).isCoherent;
}

/**
 * Move a position toward a target position by a given distance.
 * If the distance to the target is less than the move distance,
 * the position moves to (or just short of) the target.
 */
export function moveToward(from: Position, to: Position, maxDistance: number): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= 0) return from;

  // If the target is within move distance, stop at base contact range
  // (just touching the target's base, not overlapping)
  if (dist <= maxDistance + BASE_CONTACT_THRESHOLD) {
    // Move to base contact (stop just before overlapping)
    const stopDist = Math.max(0, dist - BASE_CONTACT_THRESHOLD);
    const ratio = stopDist / dist;
    return {
      x: from.x + dx * ratio,
      y: from.y + dy * ratio,
    };
  }

  // Move the full distance toward the target
  const ratio = maxDistance / dist;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
}

/**
 * Check if a position is in base-to-base contact with any model in a unit.
 */
function isInBaseContactWithUnit(position: Position, targetModels: ModelState[]): boolean {
  for (const target of targetModels) {
    const dist = getDistanceBetween(position, target.position);
    if (dist <= BASE_CONTACT_THRESHOLD) return true;
  }
  return false;
}
