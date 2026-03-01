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

import type { GameState } from '@hh/types';
import { TacticalStatus, UnitMovementState } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import type { CoolCheckEvent, StatusRemovedEvent } from '../types';
import { updateUnitInGameState, removeStatus, setMovementState } from '../state-helpers';
import { getActiveArmy, getAliveModels, getUnitsWithStatus } from '../game-queries';
import { handleVictorySubPhase } from '../missions/victory-handler';
import { getModelCool } from '../profile-lookup';

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
    // Reset hasReactedThisTurn
    if (unit.hasReactedThisTurn) {
      newState = updateUnitInGameState(newState, unit.id, (u) => ({
        ...u,
        hasReactedThisTurn: false,
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
 * Handles Cool Checks for Pinned and Suppressed units.
 *
 * Reference: HH_Rules_Battle.md — "End Phase: Status Cleanup"
 * - Pinned units take a Cool Check (2d6 <= CL). Pass = remove Pinned.
 * - Suppressed units automatically lose Suppressed at end of turn.
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

  // Remove Suppressed status from all units (automatic)
  const suppressedUnits = getUnitsWithStatus(activeArmy, TacticalStatus.Suppressed);
  for (const unit of suppressedUnits) {
    newState = updateUnitInGameState(newState, unit.id, (u) =>
      removeStatus(u, TacticalStatus.Suppressed),
    );
    const event: StatusRemovedEvent = {
      type: 'statusRemoved',
      unitId: unit.id,
      status: TacticalStatus.Suppressed,
    };
    events.push(event);
  }

  // Pinned units take a Cool Check
  const pinnedUnits = getUnitsWithStatus(activeArmy, TacticalStatus.Pinned);

  for (const unit of pinnedUnits) {
    const rolls = dice.rollMultipleD6(2);
    const total = rolls[0] + rolls[1];
    const refModel = getAliveModels(unit)[0];
    const coolValue = refModel ? getModelCool(refModel.unitProfileId, refModel.profileModelName) : 7;
    const passed = total <= coolValue;

    const coolEvent: CoolCheckEvent = {
      type: 'coolCheck',
      unitId: unit.id,
      roll: total,
      target: coolValue,
      passed,
    };
    events.push(coolEvent);

    if (passed) {
      newState = updateUnitInGameState(newState, unit.id, (u) =>
        removeStatus(u, TacticalStatus.Pinned),
      );
      const removedEvent: StatusRemovedEvent = {
        type: 'statusRemoved',
        unitId: unit.id,
        status: TacticalStatus.Pinned,
      };
      events.push(removedEvent);
    }
  }

  // Stupefied units take a Cool Check to recover (EC Hereticus)
  const stupefiedUnits = getUnitsWithStatus(activeArmy, TacticalStatus.Stupefied);
  for (const unit of stupefiedUnits) {
    const rolls = dice.rollMultipleD6(2);
    const total = rolls[0] + rolls[1];
    const stupRefModel = getAliveModels(unit)[0];
    const stupCoolValue = stupRefModel ? getModelCool(stupRefModel.unitProfileId, stupRefModel.profileModelName) : 7;
    const passed = total <= stupCoolValue;

    const coolEvent: CoolCheckEvent = {
      type: 'coolCheck',
      unitId: unit.id,
      roll: total,
      target: stupCoolValue,
      passed,
    };
    events.push(coolEvent);

    if (passed) {
      newState = updateUnitInGameState(newState, unit.id, (u) =>
        removeStatus(u, TacticalStatus.Stupefied),
      );
      const removedEvent: StatusRemovedEvent = {
        type: 'statusRemoved',
        unitId: unit.id,
        status: TacticalStatus.Stupefied,
      };
      events.push(removedEvent);
    }
  }

  // Lost to the Nails units recover if no enemies within 12" (WE Hereticus)
  // In the End Phase, check if any enemy model is within 12" of the unit.
  // If no enemies within 12", the status is automatically removed.
  const lostToNailsUnits = getUnitsWithStatus(activeArmy, TacticalStatus.LostToTheNails);
  for (const unit of lostToNailsUnits) {
    const aliveModels = unit.models.filter(m => !m.isDestroyed);
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
