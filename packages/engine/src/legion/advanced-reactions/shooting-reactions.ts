/**
 * Shooting-Phase Advanced Reaction Handlers
 *
 * 10 legion-specific advanced reactions that trigger during the Shooting Phase.
 * Each handler receives an AdvancedReactionContext and DiceProvider,
 * validates state, applies mechanical effects immutably,
 * emits relevant GameEvents, and returns an AdvancedReactionResult.
 *
 * Reference: HH_Legiones_Astartes.md — each legion's "Advanced Reaction" subsection
 */

import type { GameState, Position } from '@hh/types';
import { TacticalStatus, Phase } from '@hh/types';
import type { DiceProvider, GameEvent } from '../../types';
import type { AdvancedReactionContext, AdvancedReactionResult } from '../advanced-reaction-registry';
import { registerAdvancedReaction } from '../advanced-reaction-registry';
import { findUnit, getAliveModels, getDistanceBetween, getClosestModelDistance } from '../../game-queries';
import { updateUnitInGameState, updateModelInUnit, moveModel, applyWoundsToModel, addStatus, removeStatus } from '../../state-helpers';

// ─── Geometry Helpers ────────────────────────────────────────────────────────

/**
 * Move a position toward another position, up to a maximum distance.
 * Returns the new position. If already within maxDistance, returns the target.
 */
function moveToward(from: Position, to: Position, maxDistance: number): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return from;
  if (dist <= maxDistance) return { x: to.x, y: to.y };
  const ratio = maxDistance / dist;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

/**
 * Move a position away from another position, up to a maximum distance.
 * Returns the new position. If positions overlap, moves along +X axis.
 */
function moveAway(from: Position, awayFrom: Position, maxDistance: number): Position {
  const dx = from.x - awayFrom.x;
  const dy = from.y - awayFrom.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return { x: from.x + maxDistance, y: from.y };
  const ratio = maxDistance / dist;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

/**
 * Get the center position of a unit (average of all alive model positions).
 */
function getUnitCenter(state: GameState, unitId: string): Position | null {
  const unit = findUnit(state, unitId);
  if (!unit) return null;
  const alive = getAliveModels(unit);
  if (alive.length === 0) return null;
  let sumX = 0;
  let sumY = 0;
  for (const model of alive) {
    sumX += model.position.x;
    sumY += model.position.y;
  }
  return { x: sumX / alive.length, y: sumY / alive.length };
}

/**
 * Find the nearest alive model in the target unit to a given position.
 * Returns the model's position, or null if no alive models exist.
 */
function findNearestModelPosition(state: GameState, targetUnitId: string, from: Position): Position | null {
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) return null;
  const alive = getAliveModels(targetUnit);
  if (alive.length === 0) return null;

  let nearest = alive[0].position;
  let minDist = getDistanceBetween(from, nearest);
  for (let i = 1; i < alive.length; i++) {
    const d = getDistanceBetween(from, alive[i].position);
    if (d < minDist) {
      minDist = d;
      nearest = alive[i].position;
    }
  }
  return nearest;
}

// ─── Shooting Attack Helper ─────────────────────────────────────────────────

/**
 * Perform a simplified shooting attack from one unit to another.
 * For each alive model in the attacker unit:
 *   - Roll to hit: d6, hits on 4+ (BS4 default)
 *   - Each model fires 1 + fpBonus shots
 * For each hit:
 *   - Roll to wound: d6, wounds on 4+ (S4 vs T4 default)
 * For each wound:
 *   - Apply 1 damage to a random alive model in the target unit
 *
 * @param state - Current game state
 * @param attackerUnitId - ID of the unit performing the shooting
 * @param targetUnitId - ID of the unit being shot at
 * @param dice - Dice provider
 * @param fpBonus - Additional firepower per model (default 0)
 * @returns Updated state, events, and hit/wound totals
 */
function performSimplifiedShootingAttack(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  fpBonus: number = 0,
): { state: GameState; events: GameEvent[]; totalHits: number; totalWounds: number } {
  const attackerUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!attackerUnit || !targetUnit) {
    return { state, events: [], totalHits: 0, totalWounds: 0 };
  }

  const attackerAlive = getAliveModels(attackerUnit);
  if (attackerAlive.length === 0) {
    return { state, events: [], totalHits: 0, totalWounds: 0 };
  }

  const BS_TARGET = 4; // Default BS4 — hit on 4+
  const WOUND_TARGET = 4; // Default S4 vs T4 — wound on 4+
  const SHOTS_PER_MODEL = 1 + fpBonus;

  let totalHits = 0;
  let totalWounds = 0;
  let currentState = state;
  const events: GameEvent[] = [];

  // Roll hits for all models
  for (const _model of attackerAlive) {
    for (let shot = 0; shot < SHOTS_PER_MODEL; shot++) {
      const hitRoll = dice.rollD6();
      if (hitRoll >= BS_TARGET) {
        totalHits++;
      }
    }
  }

  // Roll wounds for each hit
  for (let i = 0; i < totalHits; i++) {
    const woundRoll = dice.rollD6();
    if (woundRoll >= WOUND_TARGET) {
      totalWounds++;
    }
  }

  // Apply wounds to random alive models in the target unit
  for (let w = 0; w < totalWounds; w++) {
    const currentTargetUnit = findUnit(currentState, targetUnitId);
    if (!currentTargetUnit) break;
    const currentAlive = getAliveModels(currentTargetUnit);
    if (currentAlive.length === 0) break;

    // Pick a random alive model in the target unit
    const randomIndex = Math.floor(Math.abs(dice.rollD6() - 1) * currentAlive.length / 6);
    const targetIndex = Math.min(randomIndex, currentAlive.length - 1);
    const targetModel = currentAlive[targetIndex];

    const woundedModel = applyWoundsToModel(targetModel, 1);

    currentState = updateUnitInGameState(currentState, targetUnitId, unit =>
      updateModelInUnit(unit, targetModel.id, () => woundedModel),
    );

    events.push({
      type: 'damageApplied',
      modelId: targetModel.id,
      unitId: targetUnitId,
      woundsLost: 1,
      remainingWounds: woundedModel.currentWounds,
      destroyed: woundedModel.isDestroyed,
      damageSource: 'advancedReactionShooting',
    });
  }

  return { state: currentState, events, totalHits, totalWounds };
}

// ─── Failure Result Helper ──────────────────────────────────────────────────

/**
 * Create a standard failure result (validation failed, no effects applied).
 */
function failResult(state: GameState): AdvancedReactionResult {
  return { state, events: [], success: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SPACE WOLVES — Bestial Savagery (sw-bestial-savagery)
//
// Effects:
// - Grant FNP 5+ to each model in the reacting unit
// - Each alive model makes a set-up move (up to 3") toward the nearest model
//   in the trigger source unit
// ═══════════════════════════════════════════════════════════════════════════════

function handleBestialSavagery(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];
  const SETUP_MOVE_DISTANCE = 3;

  // Step 1: Add FNP 5+ modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'FNP',
            operation: 'set' as const,
            value: 5,
            source: 'Bestial Savagery',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  // Step 2: Set-up move — each model moves toward the nearest model in the trigger unit
  for (const model of aliveModels) {
    const nearestPos = findNearestModelPosition(currentState, triggerSourceUnitId, model.position);
    if (!nearestPos) continue;

    const newPos = moveToward(model.position, nearestPos, SETUP_MOVE_DISTANCE);
    const distance = getDistanceBetween(model.position, newPos);

    if (distance > 0) {
      const fromPos = { ...model.position };
      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => moveModel(m, newPos)),
      );

      events.push({
        type: 'setupMove',
        chargingUnitId: reactingUnitId,
        targetUnitId: triggerSourceUnitId,
        modelId: model.id,
        from: fromPos,
        to: newPos,
        distance,
      });
    }
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. BLOOD ANGELS — Wrath of Angels (ba-wrath-of-angels)
//
// Effects:
// - Each alive model moves toward the nearest model in the attacker unit, up to 7"
// - If any model ends within 6" of the trigger source unit, the attacker
//   must make a Cool Check (2d6, pass on 7 or less). If failed, Pinned.
// ═══════════════════════════════════════════════════════════════════════════════

function handleWrathOfAngels(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];
  const MOVE_DISTANCE = 7; // Movement characteristic
  const COOL_CHECK_RANGE = 6;
  const COOL_CHECK_TARGET = 7;

  // Step 1: Move each model toward the nearest model in the attacker unit
  for (const model of aliveModels) {
    const nearestPos = findNearestModelPosition(currentState, triggerSourceUnitId, model.position);
    if (!nearestPos) continue;

    const newPos = moveToward(model.position, nearestPos, MOVE_DISTANCE);
    const distance = getDistanceBetween(model.position, newPos);

    if (distance > 0) {
      const fromPos = { ...model.position };
      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => moveModel(m, newPos)),
      );

      events.push({
        type: 'modelMoved',
        modelId: model.id,
        unitId: reactingUnitId,
        fromPosition: fromPos,
        toPosition: newPos,
        distanceMoved: distance,
      });
    }
  }

  // Step 2: Check if any model ended within 6" of the trigger source unit
  const closestDist = getClosestModelDistance(currentState, reactingUnitId, triggerSourceUnitId);
  if (closestDist <= COOL_CHECK_RANGE) {
    // Attacker must make a Cool Check: roll 2d6, pass on 7 or less
    const [d1, d2] = dice.roll2D6();
    const coolRoll = d1 + d2;
    const passed = coolRoll <= COOL_CHECK_TARGET;

    events.push({
      type: 'coolCheck',
      unitId: triggerSourceUnitId,
      roll: coolRoll,
      target: COOL_CHECK_TARGET,
      passed,
    });

    if (!passed) {
      // Failed — add Pinned status to trigger source unit
      currentState = updateUnitInGameState(currentState, triggerSourceUnitId, unit =>
        addStatus(unit, TacticalStatus.Pinned),
      );

      events.push({
        type: 'statusApplied',
        unitId: triggerSourceUnitId,
        status: TacticalStatus.Pinned,
      });
    }
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. IRON WARRIORS — Bitter Fury (iw-bitter-fury)
//
// Effects:
// - The reacting unit makes a return fire shooting attack with +1 FP and
//   Overload(1) (simplified: +1 shot per model from Firepower +1)
// - For each alive model, roll to hit (d6, 4+), with +1 shot per model
// - For each hit, roll to wound (d6, 4+)
// - For each wound, apply 1 damage to a random alive model in the trigger unit
// - Models at 0 wounds can also participate (per rules text)
// ═══════════════════════════════════════════════════════════════════════════════

function handleBitterFury(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  // Note: Models at 0 wounds can also participate — use all models, not just alive
  // However, isDestroyed models have been formally removed. The rules text says
  // "even at 0 wounds", meaning wounded-but-not-destroyed models.
  // We use getAliveModels which filters isDestroyed.
  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  const FP_BONUS = 1; // +1 Firepower from Bitter Fury
  const result = performSimplifiedShootingAttack(
    state,
    reactingUnitId,
    triggerSourceUnitId,
    dice,
    FP_BONUS,
  );

  const events: GameEvent[] = [...result.events];

  events.push({
    type: 'fireGroupResolved',
    fireGroupIndex: 0,
    weaponName: 'Bitter Fury (Return Fire)',
    totalHits: result.totalHits,
    totalWounds: result.totalWounds,
    totalPenetrating: 0,
    totalGlancing: 0,
  });

  return { state: result.state, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ULTRAMARINES — Retribution Strike (um-retribution-strike)
//
// Effects:
// - A DIFFERENT unit (not the target, but the reacting unit selected by the
//   player) shoots the attacker
// - Same shooting attack mechanic as Bitter Fury but without the +1 FP bonus
// ═══════════════════════════════════════════════════════════════════════════════

function handleRetributionStrike(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  const FP_BONUS = 0; // No FP bonus for Retribution Strike
  const result = performSimplifiedShootingAttack(
    state,
    reactingUnitId,
    triggerSourceUnitId,
    dice,
    FP_BONUS,
  );

  const events: GameEvent[] = [...result.events];

  events.push({
    type: 'fireGroupResolved',
    fireGroupIndex: 0,
    weaponName: 'Retribution Strike (Return Fire)',
    totalHits: result.totalHits,
    totalWounds: result.totalWounds,
    totalPenetrating: 0,
    totalGlancing: 0,
  });

  return { state: result.state, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RAVEN GUARD — Shadow Veil (rg-shadow-veil)
//
// Effects:
// - Each alive model moves up to 4" (Initiative characteristic, default 4)
//   AWAY from the trigger source (attacker) unit
// - Add Shrouded(5+) modifier to each model
// ═══════════════════════════════════════════════════════════════════════════════

function handleShadowVeil(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];
  const INITIATIVE_DISTANCE = 4; // Initiative characteristic default

  // Get the attacker unit's center for computing "away from" direction
  const attackerCenter = getUnitCenter(state, triggerSourceUnitId);
  if (!attackerCenter) return failResult(state);

  // Step 1: Move each model away from the attacker
  for (const model of aliveModels) {
    const newPos = moveAway(model.position, attackerCenter, INITIATIVE_DISTANCE);
    const distance = getDistanceBetween(model.position, newPos);

    if (distance > 0) {
      const fromPos = { ...model.position };
      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => moveModel(m, newPos)),
      );

      events.push({
        type: 'modelMoved',
        modelId: model.id,
        unitId: reactingUnitId,
        fromPosition: fromPos,
        toPosition: newPos,
        distanceMoved: distance,
      });
    }
  }

  // Step 2: Add Shrouded(5+) modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'Shrouded',
            operation: 'set' as const,
            value: 5,
            source: 'Shadow Veil',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DEATH GUARD — Barbaran Endurance (dg-barbaran-endurance)
//
// Effects:
// - Remove ALL tactical statuses from the reacting unit
// - Add FNP 5+ modifier to each model
// - Add AutoPassChecks modifier to each model
// ═══════════════════════════════════════════════════════════════════════════════

function handleBarbaranEndurance(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];

  // Step 1: Remove ALL tactical statuses from the reacting unit
  const currentStatuses = [...reactingUnit.statuses];
  if (currentStatuses.length > 0) {
    let updatedUnit = reactingUnit;
    for (const status of currentStatuses) {
      updatedUnit = removeStatus(updatedUnit, status);

      events.push({
        type: 'statusRemoved',
        unitId: reactingUnitId,
        status,
      });
    }

    currentState = updateUnitInGameState(currentState, reactingUnitId, () => updatedUnit);
  }

  // Step 2: Add FNP 5+ modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'FNP',
            operation: 'set' as const,
            value: 5,
            source: 'Barbaran Endurance',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  // Step 3: Add AutoPassChecks modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'AutoPassChecks',
            operation: 'set' as const,
            value: 1,
            source: 'Barbaran Endurance',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. THOUSAND SONS — Fortress of the Mind (ts-fortress-of-mind)
//
// Effects:
// - Make a Willpower Check: roll 2d6, pass on 7 or less (default WP=7)
// - If passed: Add 3+ Invulnerable Save modifier to each model
// - If failed: Add 5+ Invulnerable Save modifier to each model
// - If failed: Both reacting and trigger source units suffer D3 wounds
//   (Warp Rupture)
// ═══════════════════════════════════════════════════════════════════════════════

function handleFortressOfTheMind(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];
  const WP_TARGET = 7; // Default Willpower

  // Step 1: Make a Willpower Check (2d6, pass on 7 or less)
  const [d1, d2] = dice.roll2D6();
  const wpRoll = d1 + d2;
  const passed = wpRoll <= WP_TARGET;

  // Emit the WP check as a coolCheck event (repurposed for WP checks)
  events.push({
    type: 'coolCheck',
    unitId: reactingUnitId,
    roll: wpRoll,
    target: WP_TARGET,
    passed,
  });

  // Step 2: Apply Invulnerable Save modifier
  const invulnValue = passed ? 3 : 5;
  const invulnSource = 'Fortress of the Mind';

  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'InvulnSave',
            operation: 'set' as const,
            value: invulnValue,
            source: invulnSource,
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  // Step 3: If failed, Warp Rupture — both units suffer D3 wounds
  if (!passed) {
    const warpDamage = dice.rollD3();

    // Apply D3 wounds to a random model in the reacting unit
    for (let w = 0; w < warpDamage; w++) {
      const currentReactingUnit = findUnit(currentState, reactingUnitId);
      if (!currentReactingUnit) break;
      const currentAlive = getAliveModels(currentReactingUnit);
      if (currentAlive.length === 0) break;

      const randomIndex = Math.min(
        Math.floor(Math.abs(dice.rollD6() - 1) * currentAlive.length / 6),
        currentAlive.length - 1,
      );
      const targetModel = currentAlive[randomIndex];
      const woundedModel = applyWoundsToModel(targetModel, 1);

      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, targetModel.id, () => woundedModel),
      );

      events.push({
        type: 'damageApplied',
        modelId: targetModel.id,
        unitId: reactingUnitId,
        woundsLost: 1,
        remainingWounds: woundedModel.currentWounds,
        destroyed: woundedModel.isDestroyed,
        damageSource: 'Warp Rupture (Fortress of the Mind)',
      });
    }

    // Apply D3 wounds to a random model in the trigger source unit
    for (let w = 0; w < warpDamage; w++) {
      const currentTriggerUnit = findUnit(currentState, triggerSourceUnitId);
      if (!currentTriggerUnit) break;
      const currentAlive = getAliveModels(currentTriggerUnit);
      if (currentAlive.length === 0) break;

      const randomIndex = Math.min(
        Math.floor(Math.abs(dice.rollD6() - 1) * currentAlive.length / 6),
        currentAlive.length - 1,
      );
      const targetModel = currentAlive[randomIndex];
      const woundedModel = applyWoundsToModel(targetModel, 1);

      currentState = updateUnitInGameState(currentState, triggerSourceUnitId, unit =>
        updateModelInUnit(unit, targetModel.id, () => woundedModel),
      );

      events.push({
        type: 'damageApplied',
        modelId: targetModel.id,
        unitId: triggerSourceUnitId,
        woundsLost: 1,
        remainingWounds: woundedModel.currentWounds,
        destroyed: woundedModel.isDestroyed,
        damageSource: 'Warp Rupture (Fortress of the Mind)',
      });
    }
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. WORD BEARERS — Glorious Martyrdom (wb-glorious-martyrdom)
//
// Effects:
// - Select the first alive model in the reacting unit as the martyr
// - Add a MartyrTarget modifier to mark this model as the only valid target
//   (the shooting pipeline would check for this modifier)
// ═══════════════════════════════════════════════════════════════════════════════

function handleGloriousMartyrdom(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;

  // Select the first alive model as the martyr
  const martyr = aliveModels[0];

  // Add MartyrTarget modifier to the martyr model
  currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
    updateModelInUnit(unit, martyr.id, m => ({
      ...m,
      modifiers: [
        ...m.modifiers,
        {
          characteristic: 'MartyrTarget',
          operation: 'set' as const,
          value: 1,
          source: 'Glorious Martyrdom',
          expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
        },
      ],
    })),
  );

  return { state: currentState, events: [], success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ALPHA LEGION — Smoke and Mirrors (al-smoke-and-mirrors)
//
// Effects:
// - Add a modifier to each model in the reacting unit that forces Precision
//   to only trigger on 6+ (PrecisionThreshold set to 6)
// - This is primarily a state flag — the shooting pipeline would check this
// ═══════════════════════════════════════════════════════════════════════════════

function handleSmokeAndMirrors(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;

  // Add PrecisionThreshold modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'PrecisionThreshold',
            operation: 'set' as const,
            value: 6,
            source: 'Smoke and Mirrors',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  return { state: currentState, events: [], success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. WORLD EATERS — Brutal Tide (we-brutal-tide)
//
// Effects:
// - Add Eternal Warrior (1) modifier to each model
// - After the shooting resolves, make a counter-charge:
//   Roll 2d6 (discard lowest), check against closest distance
// - If charge roll >= closest distance: charge succeeds
//   - Move each model toward nearest enemy model (up to charge roll distance)
// - If charge fails, emit chargeFailed event
// - Return success either way (the reaction was declared)
// ═══════════════════════════════════════════════════════════════════════════════

function handleBrutalTide(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  const triggerUnit = findUnit(state, triggerSourceUnitId);
  if (!reactingUnit || !triggerUnit) return failResult(state);

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) return failResult(state);

  let currentState = state;
  const events: GameEvent[] = [];

  // Step 1: Add Eternal Warrior (1) modifier to each model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'EternalWarrior',
            operation: 'set' as const,
            value: 1,
            source: 'Brutal Tide',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Shooting },
          },
        ],
      })),
    );
  }

  // Step 2: Counter-charge roll — 2d6, discard lowest
  const closestDistance = getClosestModelDistance(currentState, reactingUnitId, triggerSourceUnitId);

  const [d1, d2] = dice.roll2D6();
  const chargeRoll = Math.max(d1, d2); // Discard lowest die
  const discardedDie = Math.min(d1, d2);

  // Emit charge roll event
  events.push({
    type: 'chargeRoll',
    chargingUnitId: reactingUnitId,
    targetUnitId: triggerSourceUnitId,
    diceValues: [d1, d2],
    chargeRoll,
    discardedDie,
    distanceNeeded: closestDistance,
  });

  if (chargeRoll >= closestDistance) {
    // Charge succeeded
    events.push({
      type: 'chargeSucceeded',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });

    // Move each alive model toward the nearest enemy model (up to charge roll distance)
    // Re-query alive models from current state in case any were destroyed
    const currentReactingUnit = findUnit(currentState, reactingUnitId);
    if (currentReactingUnit) {
      const currentAlive = getAliveModels(currentReactingUnit);
      for (const model of currentAlive) {
        const nearestPos = findNearestModelPosition(currentState, triggerSourceUnitId, model.position);
        if (!nearestPos) continue;

        const newPos = moveToward(model.position, nearestPos, chargeRoll);
        const fromPos = { ...model.position };

        currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
          updateModelInUnit(unit, model.id, m => moveModel(m, newPos)),
        );

        events.push({
          type: 'chargeMove',
          chargingUnitId: reactingUnitId,
          targetUnitId: triggerSourceUnitId,
          modelId: model.id,
          from: fromPos,
          to: newPos,
        });
      }
    }
  } else {
    // Charge failed
    events.push({
      type: 'chargeFailed',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });
  }

  return { state: currentState, events, success: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all 10 shooting-phase advanced reaction handlers.
 * Called by registerAllAdvancedReactions() during engine initialization.
 */
export function registerShootingReactions(): void {
  // 1. Space Wolves — Bestial Savagery
  registerAdvancedReaction('sw-bestial-savagery', handleBestialSavagery);

  // 2. Blood Angels — Wrath of Angels
  registerAdvancedReaction('ba-wrath-of-angels', handleWrathOfAngels);

  // 3. Iron Warriors — Bitter Fury
  registerAdvancedReaction('iw-bitter-fury', handleBitterFury);

  // 4. Ultramarines — Retribution Strike
  registerAdvancedReaction('um-retribution-strike', handleRetributionStrike);

  // 5. Raven Guard — Shadow Veil
  registerAdvancedReaction('rg-shadow-veil', handleShadowVeil);

  // 6. Death Guard — Barbaran Endurance
  registerAdvancedReaction('dg-barbaran-endurance', handleBarbaranEndurance);

  // 7. Thousand Sons — Fortress of the Mind
  registerAdvancedReaction('ts-fortress-of-mind', handleFortressOfTheMind);

  // 8. Word Bearers — Glorious Martyrdom
  registerAdvancedReaction('wb-glorious-martyrdom', handleGloriousMartyrdom);

  // 9. Alpha Legion — Smoke and Mirrors
  registerAdvancedReaction('al-smoke-and-mirrors', handleSmokeAndMirrors);

  // 10. World Eaters — Brutal Tide
  registerAdvancedReaction('we-brutal-tide', handleBrutalTide);
}
