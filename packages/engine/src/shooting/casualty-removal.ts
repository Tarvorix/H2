/**
 * Casualty Removal — Shooting Pipeline Step 11
 * Reference: HH_Rules_Battle.md — Step 11: Remove Casualties
 *
 * Implements the final step of the shooting attack resolution pipeline:
 * 1. Remove all accumulated casualties from the game state
 * 2. Check if any unit is completely destroyed
 * 3. Track which units need morale checks (for Morale Sub-Phase)
 *
 * Panic threshold: >= 25% of the unit's size at the START of the attack
 * (not current size) were removed as casualties.
 */

import type { GameState } from '@hh/types';
import { updateUnitInGameState, updateModelInUnit } from '../state-helpers';
import { findModel, isUnitDestroyed } from '../game-queries';
import type {
  GameEvent,
  CasualtyRemovedEvent,
  UnitDestroyedEvent,
} from '../types';
import type { PendingMoraleCheck, MoraleCheckType } from './shooting-types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of the casualty removal step.
 */
export interface CasualtyRemovalResult {
  /** Updated game state with casualties removed */
  state: GameState;
  /** Events emitted during removal */
  events: GameEvent[];
  /** Units that were completely destroyed */
  destroyedUnitIds: string[];
  /** Pending morale checks for the morale sub-phase */
  pendingMoraleChecks: PendingMoraleCheck[];
}

export interface CasualtyRemovalOptions {
  /**
   * Emit casualty events even when the model is already marked destroyed in the
   * provided state. Runtime shooting resolution uses this when damage
   * application has already reduced the model to 0 wounds earlier in the same
   * attack, but step 11 still needs to remove the casualty formally.
   */
  emitEventsForAlreadyDestroyedModels?: boolean;
}

// ─── Main Casualty Removal ─────────────────────────────────────────────────

/**
 * Remove all accumulated casualties from the game state.
 *
 * For each casualty model ID:
 * 1. Mark the model as destroyed (isDestroyed = true, currentWounds = 0)
 * 2. Emit CasualtyRemovedEvent
 * 3. Check if the entire unit is destroyed
 * 4. If unit destroyed, emit UnitDestroyedEvent
 *
 * @param state - Current game state
 * @param casualtyModelIds - Array of model IDs to remove as casualties
 * @param unitSizesAtStart - Map of unitId -> unit size at start of attack (for panic threshold)
 * @returns Updated state and events
 */
export function removeCasualties(
  state: GameState,
  casualtyModelIds: string[],
  unitSizesAtStart: Record<string, number>,
  options: CasualtyRemovalOptions = {},
): CasualtyRemovalResult {
  const events: GameEvent[] = [];
  const destroyedUnitIds: string[] = [];
  let currentState = state;

  // Deduplicate model IDs to prevent processing a model twice
  const uniqueModelIds = [...new Set(casualtyModelIds)];

  // Track which units we've already checked for destruction to avoid duplicate events
  const checkedUnitsForDestruction = new Set<string>();
  const appliedCasualtyModelIds: string[] = [];

  for (const modelId of uniqueModelIds) {
    // Find the model and its parent unit in the current state
    const found = findModel(currentState, modelId);
    if (!found) {
      // Model not found in any army — skip silently
      continue;
    }

    const { unit } = found;
    const modelAlreadyDestroyed = found.model.isDestroyed;

    if (modelAlreadyDestroyed && options.emitEventsForAlreadyDestroyedModels !== true) {
      continue;
    }

    appliedCasualtyModelIds.push(modelId);

    if (!modelAlreadyDestroyed) {
      // 1. Mark the model as destroyed if the damage step has not already done so.
      currentState = updateUnitInGameState(currentState, unit.id, (u) =>
        updateModelInUnit(u, modelId, (m) => ({
          ...m,
          currentWounds: 0,
          isDestroyed: true,
        })),
      );
    }

    // 2. Emit CasualtyRemovedEvent
    const casualtyEvent: CasualtyRemovedEvent = {
      type: 'casualtyRemoved',
      modelId,
      unitId: unit.id,
    };
    events.push(casualtyEvent);

    // 3. Check if the entire unit is now destroyed (only once per unit)
    if (!checkedUnitsForDestruction.has(unit.id)) {
      // Re-find the unit in the updated state to check destruction
      const updatedFound = findModel(currentState, modelId);
      if (updatedFound) {
        const updatedUnit = updatedFound.unit;
        if (isUnitDestroyed(updatedUnit)) {
          checkedUnitsForDestruction.add(unit.id);
          destroyedUnitIds.push(unit.id);

          // 4. Emit UnitDestroyedEvent
          const unitDestroyedEvent: UnitDestroyedEvent = {
            type: 'unitDestroyed',
            unitId: unit.id,
            reason: 'All models destroyed by shooting casualties',
          };
          events.push(unitDestroyedEvent);
        }
      }
    }
  }

  // Count casualties per unit for morale check calculation
  const casualtiesPerUnit = countCasualtiesPerUnit(state, appliedCasualtyModelIds);

  // Determine pending morale checks
  // Units that were completely destroyed do NOT need morale checks
  const pendingMoraleChecks = trackMoraleChecks(
    casualtiesPerUnit,
    unitSizesAtStart,
    new Map(), // No weapon morale rules by default — caller can provide
  ).filter((check) => !destroyedUnitIds.includes(check.unitId));

  return {
    state: currentState,
    events,
    destroyedUnitIds,
    pendingMoraleChecks,
  };
}

// ─── Panic Threshold ────────────────────────────────────────────────────────

/**
 * Check if a unit needs a panic check after casualties.
 *
 * Panic threshold: >= 25% of the unit's size at the START of the attack
 * (not current size) were removed as casualties.
 *
 * @param casualtiesFromUnit - Number of casualties from this unit
 * @param unitSizeAtStart - Unit size at the start of the attack
 * @returns Whether a panic check is needed
 */
export function checkPanicThreshold(
  casualtiesFromUnit: number,
  unitSizeAtStart: number,
): boolean {
  // Edge case: if unit size was 0 at start, no panic check possible
  if (unitSizeAtStart <= 0) {
    return false;
  }

  // Edge case: if no casualties, no panic check
  if (casualtiesFromUnit <= 0) {
    return false;
  }

  // Panic threshold: casualties / unitSizeAtStart >= 0.25
  // Using multiplication to avoid floating-point division issues:
  // casualties >= unitSizeAtStart * 0.25
  // casualties * 4 >= unitSizeAtStart
  return casualtiesFromUnit * 4 >= unitSizeAtStart;
}

// ─── Casualties Per Unit ─────────────────────────────────────────────────────

/**
 * Count casualties per unit from a list of casualty model IDs.
 * Uses the game state to determine which unit each model belongs to.
 *
 * @param state - Current game state
 * @param casualtyModelIds - Array of model IDs
 * @returns Map of unitId -> casualty count
 */
export function countCasualtiesPerUnit(
  state: GameState,
  casualtyModelIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();

  // Deduplicate model IDs
  const uniqueModelIds = [...new Set(casualtyModelIds)];

  for (const modelId of uniqueModelIds) {
    const found = findModel(state, modelId);
    if (!found) {
      // Model not found — skip
      continue;
    }

    const unitId = found.unit.id;
    counts.set(unitId, (counts.get(unitId) ?? 0) + 1);
  }

  return counts;
}

// ─── Morale Check Tracking ──────────────────────────────────────────────────

/**
 * Track morale checks needed based on casualties and weapon special rules.
 *
 * @param casualtiesPerUnit - Map of unitId -> casualty count
 * @param unitSizesAtStart - Map of unitId -> size at start
 * @param weaponMoraleRules - Map of unitId -> array of morale-affecting rules from weapons
 * @returns Array of pending morale checks
 */
export function trackMoraleChecks(
  casualtiesPerUnit: Map<string, number>,
  unitSizesAtStart: Record<string, number>,
  weaponMoraleRules: Map<string, Array<{ checkType: MoraleCheckType; modifier: number; source: string }>>,
): PendingMoraleCheck[] {
  const checks: PendingMoraleCheck[] = [];

  // Check each unit that took casualties for panic threshold
  for (const [unitId, casualties] of casualtiesPerUnit) {
    const unitSizeAtStart = unitSizesAtStart[unitId] ?? 0;

    // Check panic threshold: >= 25% casualties
    if (checkPanicThreshold(casualties, unitSizeAtStart)) {
      checks.push({
        unitId,
        checkType: 'panic',
        modifier: 0,
        source: `Panic check: ${casualties} casualties from ${unitSizeAtStart} models (${Math.round((casualties / unitSizeAtStart) * 100)}%)`,
      });
    }
  }

  // Add weapon-based morale checks (Pinning, Suppressive, Stun, etc.)
  for (const [unitId, rules] of weaponMoraleRules) {
    for (const rule of rules) {
      checks.push({
        unitId,
        checkType: rule.checkType,
        modifier: rule.modifier,
        source: rule.source,
      });
    }
  }

  return checks;
}
