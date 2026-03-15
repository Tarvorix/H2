/**
 * End Phase Handler
 * Processes the End Phase of a player turn.
 *
 * Reference: HH_Rules_Battle.md — "End Phase"
 *
 * The End Phase handles:
 * - EndEffects Sub-Phase: resolve end-of-turn effects
 * - Statuses Sub-Phase: Cool Checks to remove Pinned/Suppressed, clean up statuses
 * - Victory Sub-Phase: check victory conditions
 *
 * This is currently a stub. Status cleanup and victory checking will be
 * implemented as part of the full turn cycle integration.
 */

import type { GameState, UnitState } from '@hh/types';
import { ModelSubType, TacticalStatus, UnitMovementState } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import type { CoolCheckEvent, RepairTestEvent, StatusRemovedEvent } from '../types';
import { updateUnitInGameState, removeStatus, setMovementState } from '../state-helpers';
import { getActiveArmy, getAliveModels, getUnitsWithStatus, isVehicleUnit } from '../game-queries';
import { handleVictorySubPhase } from '../missions/victory-handler';
import { getModelCool, getUnitSpecialRuleValue, unitProfileHasSubType } from '../profile-lookup';

const COOL_CHECK_STATUSES: TacticalStatus[] = [
  TacticalStatus.Pinned,
  TacticalStatus.Suppressed,
  TacticalStatus.Stunned,
  TacticalStatus.Stupefied,
];

const VEHICLE_STATUS_REMOVAL_PRIORITY: TacticalStatus[] = [
  TacticalStatus.Stunned,
  TacticalStatus.Pinned,
  TacticalStatus.Suppressed,
  TacticalStatus.Stupefied,
];

function getRepairTargetNumber(unit: UnitState): number {
  const autoRepair = getUnitSpecialRuleValue(unit.profileId, 'Auto-repair');
  return autoRepair !== null ? autoRepair : 6;
}

function getHighestPriorityVehicleStatus(unit: UnitState): TacticalStatus | null {
  for (const status of VEHICLE_STATUS_REMOVAL_PRIORITY) {
    if (unit.statuses.includes(status)) {
      return status;
    }
  }

  return unit.statuses[0] ?? null;
}

/**
 * Process the End Phase Effects sub-phase.
 * - Expire end-of-player-turn modifiers on all models
 * - Reset hasReactedThisTurn for all units in the active army
 * - Reset movementState to Stationary for all units in the active army
 *
 * @param state - Current game state
 * @param _dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleEndEffects(
  state: GameState,
  _dice: DiceProvider,
): CommandResult {
  let newState = state;
  const activeArmy = getActiveArmy(state);

  for (const unit of activeArmy.units) {
    // Reset per-turn reaction/shooting usage flags
    if (unit.hasReactedThisTurn || unit.hasShotThisTurn === true) {
      newState = updateUnitInGameState(newState, unit.id, (u) => ({
        ...u,
        hasReactedThisTurn: false,
        hasShotThisTurn: false,
      }));
    }

    // Reset movementState to Stationary
    if (unit.movementState !== UnitMovementState.Stationary) {
      newState = updateUnitInGameState(newState, unit.id, (u) =>
        setMovementState(u, UnitMovementState.Stationary),
      );
    }

    // Expire end-of-player-turn modifiers on unit
    if (unit.modifiers.some(m => m.expiresAt.type === 'endOfPlayerTurn')) {
      newState = updateUnitInGameState(newState, unit.id, (u) => ({
        ...u,
        modifiers: u.modifiers.filter(m => m.expiresAt.type !== 'endOfPlayerTurn'),
      }));
    }

    // Expire end-of-player-turn modifiers on each model
    for (const model of unit.models) {
      if (model.modifiers.some(m => m.expiresAt.type === 'endOfPlayerTurn')) {
        newState = updateUnitInGameState(newState, unit.id, (u) => ({
          ...u,
          models: u.models.map(m =>
            m.id === model.id
              ? { ...m, modifiers: m.modifiers.filter(mod => mod.expiresAt.type !== 'endOfPlayerTurn') }
              : m,
          ),
        }));
      }
    }
  }

  return {
    state: newState,
    events: [],
    errors: [],
    accepted: true,
  };
}

/**
 * Process the End Phase Statuses sub-phase.
 * Handles per-status Cool Checks for non-vehicle units and Repair Tests for vehicles.
 *
 * Reference: HH_Rules_Battle.md — "End Phase: Status Cleanup"
 * - Non-vehicle units make a Cool Check for each non-Routed status affecting them.
 * - Vehicle units make Repair Tests instead of Cool Checks.
 *
 * @param state - Current game state
 * @param dice - Dice provider for Cool Checks
 * @returns CommandResult with updated state
 */
export function handleStatusCleanup(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  let newState = state;

  const activeArmy = getActiveArmy(state);

  for (const unit of activeArmy.units) {
    if (unit.statuses.length === 0) {
      continue;
    }

    if (unitProfileHasSubType(unit.profileId, ModelSubType.Flyer)) {
      continue;
    }

    if (isVehicleUnit(unit)) {
      let pendingStatuses = [...unit.statuses];
      const attempts = getAliveModels(unit).length;
      const targetNumber = getRepairTargetNumber(unit);

      for (let attempt = 0; attempt < attempts && pendingStatuses.length > 0; attempt++) {
        const roll = dice.rollD6();
        const passed = roll >= targetNumber;
        events.push({
          type: 'repairTest',
          unitId: unit.id,
          roll,
          target: targetNumber,
          passed,
        } satisfies RepairTestEvent);

        if (!passed) {
          continue;
        }

        const statusToRemove = getHighestPriorityVehicleStatus({ ...unit, statuses: pendingStatuses });
        if (!statusToRemove) {
          continue;
        }

        pendingStatuses = pendingStatuses.filter((status) => status !== statusToRemove);
        newState = updateUnitInGameState(newState, unit.id, (currentUnit) =>
          removeStatus(currentUnit, statusToRemove),
        );
        events.push({
          type: 'statusRemoved',
          unitId: unit.id,
          status: statusToRemove,
        } satisfies StatusRemovedEvent);
      }

      continue;
    }

    const refModel = getAliveModels(unit)[0];
    const coolValue = refModel ? getModelCool(refModel.unitProfileId, refModel.profileModelName) : 7;
    for (const status of COOL_CHECK_STATUSES) {
      if (!unit.statuses.includes(status)) {
        continue;
      }

      const [dieOne, dieTwo] = dice.roll2D6();
      const total = dieOne + dieTwo;
      const passed = total <= coolValue;
      events.push({
        type: 'coolCheck',
        unitId: unit.id,
        roll: total,
        target: coolValue,
        passed,
      } satisfies CoolCheckEvent);

      if (!passed) {
        continue;
      }

      newState = updateUnitInGameState(newState, unit.id, (currentUnit) =>
        removeStatus(currentUnit, status),
      );
      events.push({
        type: 'statusRemoved',
        unitId: unit.id,
        status,
      } satisfies StatusRemovedEvent);
    }
  }

  // Lost to the Nails units recover if no enemies within 12" (WE Hereticus)
  // In the End Phase, check if any enemy model is within 12" of the unit.
  // If no enemies within 12", the status is automatically removed.
  const lostToNailsUnits = getUnitsWithStatus(activeArmy, TacticalStatus.LostToTheNails);
  for (const unit of lostToNailsUnits) {
    const aliveModels = unit.models.filter((model) => !model.isDestroyed);
    if (aliveModels.length === 0) continue;

    // Check if any enemy model is within 12" of any model in this unit
    const reactiveArmy = state.armies[state.activePlayerIndex === 0 ? 1 : 0];
    let enemyWithin12 = false;

    for (const model of aliveModels) {
      for (const enemyUnit of reactiveArmy.units) {
        for (const enemyModel of enemyUnit.models) {
          if (enemyModel.isDestroyed) continue;
          const dx = model.position.x - enemyModel.position.x;
          const dy = model.position.y - enemyModel.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 12) {
            enemyWithin12 = true;
            break;
          }
        }
        if (enemyWithin12) break;
      }
      if (enemyWithin12) break;
    }

    if (!enemyWithin12) {
      newState = updateUnitInGameState(newState, unit.id, (u) =>
        removeStatus(u, TacticalStatus.LostToTheNails),
      );
      const removedEvent: StatusRemovedEvent = {
        type: 'statusRemoved',
        unitId: unit.id,
        status: TacticalStatus.LostToTheNails,
      };
      events.push(removedEvent);
    }
  }

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process the End Phase Victory sub-phase.
 * Delegates to the full Victory Handler for objective scoring,
 * secondary objectives, Sudden Death, Counter Offensive, and game-end determination.
 *
 * @param state - Current game state
 * @param dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleVictoryCheck(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  return handleVictorySubPhase(state, dice);
}
