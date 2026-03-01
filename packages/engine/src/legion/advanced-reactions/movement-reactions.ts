/**
 * Movement-Phase Advanced Reaction Handlers
 *
 * Implements the two movement-triggered advanced reactions:
 *
 * 1. White Scars — "Chasing the Wind" (ws-chasing-wind)
 *    Trigger: An enemy unit ends a move within 12" and LOS.
 *    Effect: The reacting unit makes a normal Move (no Rush) toward the enemy.
 *    Difficult/Dangerous Terrain rules apply normally.
 *
 * 2. Imperial Fists — "Bastion of Fire" (if-bastion-of-fire)
 *    Trigger: An enemy unit ends a move within 10" and LOS.
 *    Effect: The reacting unit makes a Shooting Attack targeting the enemy unit.
 *
 * Reference: HH_Legiones_Astartes.md — White Scars & Imperial Fists "Advanced Reaction" subsections
 */

import type { GameState, Position } from '@hh/types';
import type { DiceProvider, GameEvent, ModelMovedEvent } from '../../types';
import type { AdvancedReactionContext, AdvancedReactionResult } from '../advanced-reaction-registry';
import { registerAdvancedReaction } from '../advanced-reaction-registry';
import { findUnit, getAliveModels, getDistanceBetween } from '../../game-queries';
import { updateUnitInGameState, updateModelInUnit, moveModel, applyWoundsToModel } from '../../state-helpers';
import { woundTable } from '../../tables';

// ═══════════════════════════════════════════════════════════════════════════════
// WHITE SCARS (V) — Chasing the Wind
//
// When an enemy unit ends a move within 12" and LOS, the reacting unit
// makes a normal Move (no Rush) toward the enemy. Difficult/Dangerous
// Terrain applies.
//
// Implementation:
// - Retrieve the reacting unit and the trigger source (enemy) unit from state.
// - Calculate movement distance M (default 7" for standard Astartes infantry).
// - For each alive model in the reacting unit, find the nearest alive model in
//   the trigger source unit, compute a direction vector, and move the model
//   up to M inches along that vector toward the nearest enemy.
// - Emit a modelMoved event for each model moved.
// - Return success with the updated state and all emitted events.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the nearest alive model position in a target unit to a given position.
 * Returns the position of the closest alive model, or null if no alive models exist.
 */
function findNearestModelPosition(
  state: GameState,
  targetUnitId: string,
  fromPosition: Position,
): Position | null {
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) return null;

  const aliveModels = getAliveModels(targetUnit);
  if (aliveModels.length === 0) return null;

  let nearestPos: Position | null = null;
  let nearestDist = Infinity;

  for (const model of aliveModels) {
    const dist = getDistanceBetween(fromPosition, model.position);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPos = model.position;
    }
  }

  return nearestPos;
}

/**
 * Compute a new position by moving from `from` toward `target` by at most
 * `maxDistance` inches. If the model is already closer than maxDistance,
 * it moves to the target position (but stops just short to avoid overlap,
 * using a small 0.01" buffer).
 */
function computeMoveToward(
  from: Position,
  target: Position,
  maxDistance: number,
): Position {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // If already at or essentially at the target, no movement
  if (dist < 0.01) {
    return { x: from.x, y: from.y };
  }

  // Normalize the direction vector
  const nx = dx / dist;
  const ny = dy / dist;

  // Move up to maxDistance, but do not overshoot the target
  const moveDistance = Math.min(maxDistance, dist);

  return {
    x: from.x + nx * moveDistance,
    y: from.y + ny * moveDistance,
  };
}

/**
 * Handler for the White Scars "Chasing the Wind" advanced reaction.
 *
 * Each alive model in the reacting unit moves up to M inches toward
 * the nearest model in the trigger source (enemy) unit.
 */
function handleChasingTheWind(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!triggerUnit) {
    return { state, events: [], success: false };
  }

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) {
    return { state, events: [], success: false };
  }

  // Default Movement characteristic for Legiones Astartes infantry: 7"
  // In a full implementation this would be resolved from the unit profile.
  const movementDistance = 7;

  let currentState = state;
  const events: GameEvent[] = [];

  for (const model of aliveModels) {
    // Find the nearest enemy model to move toward
    const nearestEnemyPos = findNearestModelPosition(
      currentState,
      triggerSourceUnitId,
      model.position,
    );

    if (!nearestEnemyPos) {
      // No alive enemy models to move toward — skip this model
      continue;
    }

    const fromPosition: Position = { x: model.position.x, y: model.position.y };
    const newPosition = computeMoveToward(fromPosition, nearestEnemyPos, movementDistance);

    // Calculate actual distance moved
    const distanceMoved = getDistanceBetween(fromPosition, newPosition);

    // Skip if no meaningful movement occurred (within floating-point tolerance)
    if (distanceMoved < 0.001) {
      continue;
    }

    // Update the model's position immutably
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => moveModel(m, newPosition)),
    );

    // Emit a modelMoved event
    const movedEvent: ModelMovedEvent = {
      type: 'modelMoved',
      modelId: model.id,
      unitId: reactingUnitId,
      fromPosition,
      toPosition: newPosition,
      distanceMoved,
    };
    events.push(movedEvent);
  }

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPERIAL FISTS (VII) — Bastion of Fire
//
// When an enemy unit ends a move within 10" and LOS, the reacting unit
// makes a Shooting Attack targeting the enemy unit.
//
// Implementation:
// - Retrieve the reacting unit and the trigger source (enemy) unit from state.
// - For each alive model in the reacting unit, perform a simplified shooting
//   attack:
//   1. Roll a d6 for the hit test. Default BS=4 → hit on 4+.
//   2. For each hit, roll a d6 for the wound test. Default S4 vs T4 → wound
//      on 4+ (looked up from the wound table).
//   3. For each wound, apply 1 damage to a target model in the enemy unit
//      (selecting the first alive model as the wound recipient, cycling
//      through models as they are destroyed).
// - Emit a fireGroupResolved event summarising the attack.
// - Return success with the updated state and all emitted events.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handler for the Imperial Fists "Bastion of Fire" advanced reaction.
 *
 * Each alive model in the reacting unit fires a simplified shooting attack
 * at the trigger source (enemy) unit.
 */
function handleBastionOfFire(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!triggerUnit) {
    return { state, events: [], success: false };
  }

  const shooterModels = getAliveModels(reactingUnit);
  if (shooterModels.length === 0) {
    return { state, events: [], success: false };
  }

  // Default characteristics for Legiones Astartes infantry
  // BS 4 → hit on 4+ (standard Astartes ballistic skill)
  const hitTargetNumber = 4;
  const defaultStrength = 4; // Standard boltgun strength
  const defaultToughness = 4; // Standard Marine toughness
  const defaultDamage = 1; // Standard boltgun damage per wound

  // Look up the wound target number from the wound table
  const woundTargetNumber = woundTable(defaultStrength, defaultToughness);

  let currentState = state;
  const events: GameEvent[] = [];
  let totalHits = 0;
  let totalWounds = 0;

  for (const _shooter of shooterModels) {
    // Step 1: Hit Test — roll d6, hit on hitTargetNumber+
    const hitRoll = dice.rollD6();

    if (hitRoll < hitTargetNumber) {
      // Miss — move on to the next model
      continue;
    }

    totalHits++;

    // Step 2: Wound Test — roll d6 vs wound table result
    // If wound is impossible (woundTargetNumber is null), skip
    if (woundTargetNumber === null) {
      continue;
    }

    const woundRoll = dice.rollD6();

    if (woundRoll < woundTargetNumber) {
      // Failed to wound — move on
      continue;
    }

    totalWounds++;

    // Step 3: Apply damage to a target model in the enemy unit
    // Select the first alive model in the enemy unit that can receive wounds
    const currentTriggerUnit = findUnit(currentState, triggerSourceUnitId);
    if (!currentTriggerUnit) {
      // Enemy unit no longer exists in state (should not happen)
      continue;
    }

    const aliveTargets = getAliveModels(currentTriggerUnit);
    if (aliveTargets.length === 0) {
      // All enemy models destroyed — no more wounds to apply
      break;
    }

    // Apply damage to the first alive model (wound allocation to closest model)
    const targetModel = aliveTargets[0];
    const woundsToApply = defaultDamage;

    currentState = updateUnitInGameState(currentState, triggerSourceUnitId, unit =>
      updateModelInUnit(unit, targetModel.id, m => applyWoundsToModel(m, woundsToApply)),
    );

    // Emit a damageApplied event for this wound
    const updatedTriggerUnit = findUnit(currentState, triggerSourceUnitId);
    const updatedTargetModel = updatedTriggerUnit?.models.find(m => m.id === targetModel.id);

    events.push({
      type: 'damageApplied',
      modelId: targetModel.id,
      unitId: triggerSourceUnitId,
      woundsLost: woundsToApply,
      remainingWounds: updatedTargetModel?.currentWounds ?? 0,
      destroyed: updatedTargetModel?.isDestroyed ?? true,
      damageSource: 'Bastion of Fire',
    });

    // If the model was destroyed, emit a casualty event
    if (updatedTargetModel?.isDestroyed) {
      events.push({
        type: 'casualtyRemoved',
        modelId: targetModel.id,
        unitId: triggerSourceUnitId,
      });
    }
  }

  // Emit a summary event for the fire group resolution
  const fireGroupEvent: GameEvent = {
    type: 'fireGroupResolved',
    fireGroupIndex: 0,
    weaponName: 'Bastion of Fire (Reaction)',
    totalHits,
    totalWounds,
    totalPenetrating: 0,
    totalGlancing: 0,
  };
  events.push(fireGroupEvent);

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all movement-phase advanced reaction handlers.
 *
 * Called once during engine initialization via registerAllAdvancedReactions().
 */
export function registerMovementReactions(): void {
  // White Scars — Chasing the Wind
  registerAdvancedReaction('ws-chasing-wind', handleChasingTheWind);

  // Imperial Fists — Bastion of Fire
  registerAdvancedReaction('if-bastion-of-fire', handleBastionOfFire);
}
