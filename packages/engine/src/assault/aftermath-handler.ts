/**
 * Aftermath Handler — Post-Combat Resolution Options
 * Implements the 6 aftermath options from the Resolution Sub-Phase.
 * Reference: HH_Rules_Battle.md — Resolution Sub-Phase Step 4
 *
 * Available options:
 * - Hold: Stay in combat, pile-in
 * - Disengage: Move away from combat (losing side only)
 * - Fall Back: Retreat toward board edge, gain Routed
 * - Pursue: Chase fleeing enemy (winner only)
 * - Gun Down: Shoot at fleeing enemy (winner only)
 * - Consolidate: Free move after combat (winner only, all enemies fleeing)
 */

import { checkCoherency, STANDARD_COHERENCY_RANGE } from '@hh/geometry';
import type { GameState, ModelState, Position, UnitState } from '@hh/types';
import { AftermathOption, ModelType, TacticalStatus } from '@hh/types';
import type { DiceProvider, GameEvent } from '../types';
import {
  findUnit,
  getAliveModels,
  getDistanceBetween,
  getUnitModelShapes,
} from '../game-queries';
import {
  getModelInitiative,
  getModelMovement,
  getModelType,
} from '../profile-lookup';
import { executeOutOfPhaseShootingAttack } from '../shooting/out-of-phase-shooting';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  addStatus,
  unlockFromCombat,
} from '../state-helpers';
import type { CombatState, AftermathResult } from './assault-types';
import { moveToward } from './setup-move-handler';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default board edge position (bottom of board, y=0) */
export const BOARD_EDGE_Y = 0;

/** Default board width */
export const BOARD_WIDTH = 48;

/** Default board height */
export const BOARD_HEIGHT = 48;

/** Default Initiative for fall back / pile-in when not specified */
export const DEFAULT_INITIATIVE = 4;

/** Default Movement value for disengage */
export const DEFAULT_MOVEMENT = 6;

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of selecting and resolving an aftermath option.
 */
export interface AftermathSelectionResult {
  /** Updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
  /** The aftermath result details */
  result: AftermathResult;
}

// ─── Get Available Aftermath Options ────────────────────────────────────────

/**
 * Determine which aftermath options are available to a unit.
 * Reference: HH_Rules_Battle.md — Resolution Sub-Phase Step 4
 *
 * Rules:
 * - Routed units: must Fall Back
 * - Losing (not routed): Hold, Disengage, Fall Back
 * - Winner (enemy still in combat): Hold
 * - Winner (all enemy fleeing/disengaging): Pursue, Gun Down, Consolidate
 * - Draw: Hold, Fall Back
 *
 * @param state - Current game state
 * @param unitId - The unit to get options for
 * @param isWinner - Whether this unit's side won the combat
 * @param isLoser - Whether this unit's side lost the combat
 * @param isDraw - Whether the combat was a draw
 * @param allEnemyFleeing - Whether all enemy units are falling back or disengaging
 * @returns Array of available AftermathOption values
 */
export function getAvailableAftermathOptions(
  state: GameState,
  unitId: string,
  isWinner: boolean,
  isLoser: boolean,
  isDraw: boolean,
  allEnemyFleeing: boolean,
): AftermathOption[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];

  if (unitIncludesVehicleModel(unit)) {
    return [AftermathOption.Hold];
  }

  const isRouted = unit.statuses.includes(TacticalStatus.Routed);

  // Routed units must Fall Back
  if (isRouted) {
    return [AftermathOption.FallBack];
  }

  // Losing side options
  if (isLoser) {
    return [AftermathOption.Hold, AftermathOption.Disengage, AftermathOption.FallBack];
  }

  // Winner options
  if (isWinner) {
    if (allEnemyFleeing) {
      return [AftermathOption.Pursue, AftermathOption.GunDown, AftermathOption.Consolidate];
    }
    return [AftermathOption.Hold];
  }

  // Draw
  if (isDraw) {
    return [AftermathOption.Hold, AftermathOption.FallBack];
  }

  return [AftermathOption.Hold];
}

// ─── Resolve Aftermath Option ──────────────────────────────────────────────

/**
 * Resolve a selected aftermath option for a unit.
 *
 * @param state - Current game state
 * @param unitId - The unit resolving aftermath
 * @param option - The selected aftermath option
 * @param combatState - The combat state
 * @param dice - Dice provider
 * @param initiative - Initiative value for movement calculations
 * @param movement - Movement value for disengage
 * @returns AftermathSelectionResult
 */
export function resolveAftermathOption(
  state: GameState,
  unitId: string,
  option: AftermathOption,
  combatState: CombatState,
  dice: DiceProvider,
  initiative?: number,
  movement?: number,
): AftermathSelectionResult {
  const events: GameEvent[] = [];

  events.push({
    type: 'aftermathSelected',
    unitId,
    option: option as string,
  } as GameEvent);

  switch (option) {
    case AftermathOption.Hold:
      return resolveHold(state, unitId, combatState, initiative, events);

    case AftermathOption.Disengage:
      return resolveDisengage(state, unitId, combatState, movement, initiative, events);

    case AftermathOption.FallBack:
      return resolveFallBack(state, unitId, dice, initiative, events);

    case AftermathOption.Pursue:
      return resolvePursue(state, unitId, combatState, dice, initiative, events);

    case AftermathOption.GunDown:
      return resolveGunDown(state, unitId, combatState, dice, events);

    case AftermathOption.Consolidate:
      return resolveConsolidate(state, unitId, combatState, dice, initiative, events);

    default:
      return {
        state,
        events,
        result: createEmptyResult(),
      };
  }
}

// ─── Hold ──────────────────────────────────────────────────────────────────

/**
 * Hold: Immediate pile-in toward closest enemy.
 * If any base contact remains → still Locked in Combat.
 */
function resolveHold(
  state: GameState,
  unitId: string,
  combatState: CombatState,
  initiativeOverride: number | undefined,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  let newState = state;

  // Get enemy unit IDs
  const enemyUnitIds = getEnemyUnitIds(combatState, unitId);

  // Get all alive enemy models
  const enemyModels = getAllAliveEnemyModels(newState, enemyUnitIds);

  // Pile in: each alive model moves up to initiative toward closest enemy
  const aliveModels = getAliveModels(unit);
  for (const model of aliveModels) {
    if (enemyModels.length === 0) break;

    const closestEnemy = findClosestPosition(model.position, enemyModels.map(m => m.position));
    if (!closestEnemy) continue;

    const initiativeValue = getModelAftermathInitiative(model, initiativeOverride);
    const newPos = moveToward(model.position, closestEnemy, initiativeValue);
    if (newPos.x !== model.position.x || newPos.y !== model.position.y) {
      newState = updateUnitInGameState(newState, unitId, u =>
        updateModelInUnit(u, model.id, m => moveModel(m, newPos)),
      );

      modelMoves.push({ modelId: model.id, from: model.position, to: newPos });
    }
  }

  // Check if any base contact remains (within 1" of enemy)
  const updatedUnit = findUnit(newState, unitId);
  let stillLocked = false;
  if (updatedUnit) {
    const updatedAlive = getAliveModels(updatedUnit);
    for (const model of updatedAlive) {
      for (const enemy of enemyModels) {
        if (getDistanceBetween(model.position, enemy.position) <= 1) {
          stillLocked = true;
          break;
        }
      }
      if (stillLocked) break;
    }
  }

  // If no base contact, unlock from combat
  if (!stillLocked) {
    newState = unlockFromCombat(newState, unitId);
  }

  return {
    state: newState,
    events,
    result: {
      modelMoves,
      stillLockedInCombat: stillLocked,
      routedApplied: false,
      statusChanges: [],
      pursueCaught: false,
      pursueRoll: 0,
    },
  };
}

// ─── Disengage ─────────────────────────────────────────────────────────────

/**
 * Disengage: Move up to M away from enemies.
 * Must end in coherency, not in base contact with enemy.
 * Can move through same-combat enemies.
 * If ends within 2" of combat enemy, extend move to >2".
 * Losing side only.
 */
function resolveDisengage(
  state: GameState,
  unitId: string,
  combatState: CombatState,
  movementOverride: number | undefined,
  initiativeOverride: number | undefined,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  let newState = state;

  // Get enemy positions to move away from
  const enemyUnitIds = getEnemyUnitIds(combatState, unitId);
  const enemyModels = getAllAliveEnemyModels(newState, enemyUnitIds);

  if (enemyModels.length === 0) {
    newState = unlockFromCombat(newState, unitId);
    return {
      state: newState,
      events,
      result: {
        modelMoves: [],
        stillLockedInCombat: false,
        routedApplied: false,
        statusChanges: [],
        pursueCaught: false,
        pursueRoll: 0,
      },
    };
  }

  const aliveModels = getAliveModels(unit);
  const battlefield = getBattlefieldDimensions(state);
  const plannedMoves = new Map<string, Position>();

  for (const model of aliveModels) {
    const movementValue = getModelAftermathMovement(model, movementOverride);
    const disengagePosition = findDisengageDestination(
      model,
      enemyModels,
      movementValue,
      battlefield,
    );

    if (!disengagePosition) {
      return resolveHold(state, unitId, combatState, initiativeOverride, events);
    }

    plannedMoves.set(model.id, disengagePosition);
    if (disengagePosition.x !== model.position.x || disengagePosition.y !== model.position.y) {
      modelMoves.push({ modelId: model.id, from: model.position, to: disengagePosition });
    }
  }

  newState = applyModelMoves(newState, unitId, plannedMoves);

  const updatedUnit = findUnit(newState, unitId);
  const coherent = updatedUnit
    ? checkCoherency(getUnitModelShapes(updatedUnit), STANDARD_COHERENCY_RANGE).isCoherent
    : true;
  const inBaseContact = updatedUnit
    ? getAliveModels(updatedUnit).some((model) =>
      enemyModels.some((enemy) => getDistanceBetween(model.position, enemy.position) <= 1),
    )
    : false;

  let routedApplied = false;
  const statusChanges: { unitId: string; status: TacticalStatus; applied: boolean }[] = [];
  if (!coherent || inBaseContact) {
    const routedState = applyRoutedStatus(newState, unitId);
    newState = routedState.state;
    routedApplied = routedState.applied;
    if (routedApplied) {
      statusChanges.push({ unitId, status: TacticalStatus.Routed, applied: true });
    }
  }

  // Unlock from combat
  newState = unlockFromCombat(newState, unitId);

  if (modelMoves.length > 0) {
    events.push({
      type: 'disengageMove',
      unitId,
      modelMoves,
    } as GameEvent);
  }

  return {
    state: newState,
    events,
    result: {
      modelMoves,
      stillLockedInCombat: false,
      routedApplied,
      statusChanges,
      pursueCaught: false,
      pursueRoll: 0,
    },
  };
}

// ─── Fall Back ─────────────────────────────────────────────────────────────

/**
 * Fall Back: Gain Routed if not already.
 * Immediate fall back move: I + d6" toward nearest board edge.
 * Mandatory if already Routed.
 */
function resolveFallBack(
  state: GameState,
  unitId: string,
  dice: DiceProvider,
  initiativeOverride: number | undefined,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  let newState = state;
  let routedApplied = false;
  const statusChanges: { unitId: string; status: TacticalStatus; applied: boolean }[] = [];

  // Apply Routed if not already
  const routedState = applyRoutedStatus(newState, unitId);
  newState = routedState.state;
  routedApplied = routedState.applied;
  if (routedApplied) {
    statusChanges.push({ unitId, status: TacticalStatus.Routed, applied: true });
  }

  // Fall back distance: I + d6"
  const d6 = dice.rollD6();

  // Move toward nearest board edge
  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  const aliveModels = getAliveModels(unit);
  let farthestFallBackDistance = 0;
  for (const model of aliveModels) {
    const fallBackDistance = getModelAftermathInitiative(model, initiativeOverride) + d6;
    farthestFallBackDistance = Math.max(farthestFallBackDistance, fallBackDistance);
    const edgeTarget = getNearestBoardEdge(model.position, state);
    const newPos = moveToward(model.position, edgeTarget, fallBackDistance);

    if (newPos.x !== model.position.x || newPos.y !== model.position.y) {
      newState = updateUnitInGameState(newState, unitId, u =>
        updateModelInUnit(u, model.id, m => moveModel(m, newPos)),
      );

      modelMoves.push({ modelId: model.id, from: model.position, to: newPos });
    }
  }

  // Unlock from combat
  newState = unlockFromCombat(newState, unitId);

  events.push({
    type: 'assaultFallBack',
    unitId,
    distance: farthestFallBackDistance,
    modelMoves,
  } as GameEvent);

  return {
    state: newState,
    events,
    result: {
      modelMoves,
      stillLockedInCombat: false,
      routedApplied,
      statusChanges,
      pursueCaught: false,
      pursueRoll: 0,
    },
  };
}

// ─── Pursue ────────────────────────────────────────────────────────────────

/**
 * Pursue: Roll 1d6; each model moves Initiative + die result toward nearest
 * fleeing enemy model. Base contact = caught (becomes Locked in Combat).
 * Winner only.
 */
function resolvePursue(
  state: GameState,
  unitId: string,
  combatState: CombatState,
  dice: DiceProvider,
  initiativeOverride: number | undefined,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  // Roll pursue distance
  const pursueRoll = dice.rollD6();

  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  let newState = state;

  // Get fleeing enemy models
  const enemyUnitIds = getEnemyUnitIds(combatState, unitId);
  const enemyModels = getAllAliveEnemyModels(newState, enemyUnitIds);

  // Move each model toward nearest fleeing enemy
  const aliveModels = getAliveModels(unit);
  let pursueCaught = false;

  for (const model of aliveModels) {
    if (enemyModels.length === 0) break;

    const closestEnemy = findClosestPosition(model.position, enemyModels.map(m => m.position));
    if (!closestEnemy) continue;

    const pursueDistance = getModelAftermathInitiative(model, initiativeOverride) + pursueRoll;
    const newPos = moveToward(model.position, closestEnemy, pursueDistance);

    if (newPos.x !== model.position.x || newPos.y !== model.position.y) {
      newState = updateUnitInGameState(newState, unitId, u =>
        updateModelInUnit(u, model.id, m => moveModel(m, newPos)),
      );

      modelMoves.push({ modelId: model.id, from: model.position, to: newPos });

      // Check if base contact achieved (within 1")
      const distToEnemy = getDistanceBetween(newPos, closestEnemy);
      if (distToEnemy <= 1) {
        pursueCaught = true;
      }
    }
  }

  // If caught, lock units in combat again
  if (pursueCaught) {
    for (const enemyUnitId of enemyUnitIds) {
      const enemyUnit = findUnit(newState, enemyUnitId);
      if (enemyUnit && getAliveModels(enemyUnit).length > 0) {
        // Re-lock in combat
        newState = updateUnitInGameState(newState, unitId, u => ({
          ...u,
          isLockedInCombat: true,
          engagedWithUnitIds: u.engagedWithUnitIds.includes(enemyUnitId)
            ? u.engagedWithUnitIds
            : [...u.engagedWithUnitIds, enemyUnitId],
        }));
        newState = updateUnitInGameState(newState, enemyUnitId, u => ({
          ...u,
          isLockedInCombat: true,
          engagedWithUnitIds: u.engagedWithUnitIds.includes(unitId)
            ? u.engagedWithUnitIds
            : [...u.engagedWithUnitIds, unitId],
        }));
      }
    }
  } else {
    // Didn't catch — unlock
    newState = unlockFromCombat(newState, unitId);
  }

  events.push({
    type: 'pursueRoll',
    unitId,
    roll: pursueRoll,
    pursueDistance: getMaximumAftermathInitiative(unit, initiativeOverride) + pursueRoll,
    caughtEnemy: pursueCaught,
  } as GameEvent);

  return {
    state: newState,
    events,
    result: {
      modelMoves,
      stillLockedInCombat: pursueCaught,
      routedApplied: false,
      statusChanges: [],
      pursueCaught,
      pursueRoll,
    },
  };
}

// ─── Gun Down ──────────────────────────────────────────────────────────────

/**
 * Gun Down: Volley-style shooting at one fleeing enemy unit.
 * Assault-trait weapons only. Winner only.
 */
function resolveGunDown(
  state: GameState,
  unitId: string,
  combatState: CombatState,
  dice: DiceProvider,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  let newState = unlockFromCombat(state, unitId);

  // Get fleeing enemy units, preferring Routed units that actually fell back.
  const enemyUnitIds = getEnemyUnitIds(combatState, unitId);
  const preferredTargetIds = [
    ...enemyUnitIds.filter((enemyId) => findUnit(newState, enemyId)?.statuses.includes(TacticalStatus.Routed)),
    ...enemyUnitIds,
  ];

  let targetUnitId: string | null = null;
  for (const enemyId of preferredTargetIds) {
    const enemyUnit = findUnit(newState, enemyId);
    if (enemyUnit && getAliveModels(enemyUnit).length > 0) {
      targetUnitId = enemyId;
      break;
    }
  }

  if (!targetUnitId) {
    // No valid target
    newState = unlockFromCombat(newState, unitId);
    return {
      state: newState,
      events,
      result: createEmptyResult(),
    };
  }

  const attack = executeOutOfPhaseShootingAttack(newState, unitId, targetUnitId, dice, {
    forceSnapShots: true,
    weaponFilter: ({ weaponProfile }) =>
      weaponProfile.traits.some((trait) => trait.toLowerCase() === 'assault'),
  });
  newState = attack.state;

  const hits = attack.events
    .filter((event): event is Extract<GameEvent, { type: 'fireGroupResolved' }> => event.type === 'fireGroupResolved')
    .reduce((total, event) => total + event.totalHits, 0);
  const wounds = attack.events
    .filter((event): event is Extract<GameEvent, { type: 'fireGroupResolved' }> => event.type === 'fireGroupResolved')
    .reduce((total, event) => total + event.totalWounds + event.totalPenetrating + event.totalGlancing, 0);
  const casualties = attack.events
    .filter((event): event is Extract<GameEvent, { type: 'casualtyRemoved' }> =>
      event.type === 'casualtyRemoved' && event.unitId === targetUnitId)
    .map((event) => event.modelId);

  events.push(...attack.events);

  events.push({
    type: 'gunDown',
    firingUnitId: unitId,
    targetUnitId,
    hits,
    wounds,
    casualties,
  } as GameEvent);

  return {
    state: newState,
    events,
    result: {
      modelMoves: [],
      stillLockedInCombat: false,
      routedApplied: false,
      statusChanges: [],
      pursueCaught: false,
      pursueRoll: 0,
    },
  };
}

// ─── Consolidate ───────────────────────────────────────────────────────────

/**
 * Consolidate: Move up to Initiative in any direction.
 * Must end in coherency and >2" from enemies.
 * Ignores difficult terrain. Winner only when all enemy fleeing.
 */
function resolveConsolidate(
  state: GameState,
  unitId: string,
  combatState: CombatState,
  _dice: DiceProvider,
  initiativeOverride: number | undefined,
  events: GameEvent[],
): AftermathSelectionResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events, result: createEmptyResult() };
  }

  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];
  let newState = state;

  // Get enemy positions to stay away from
  const enemyUnitIds = getEnemyUnitIds(combatState, unitId);
  const enemyModels = getAllAliveEnemyModels(newState, enemyUnitIds);

  // Move each model up to initiative distance
  // Direction: away from enemies (if any), or toward center of board
  const aliveModels = getAliveModels(unit);
  const battlefield = getBattlefieldDimensions(state);

  for (const model of aliveModels) {
    let targetPos: Position;
    const initiativeValue = getModelAftermathInitiative(model, initiativeOverride);

    if (enemyModels.length > 0) {
      // Move away from enemies
      const enemyCenter = calculateCenter(enemyModels.map(m => m.position));
      const awayDir = getDirectionAway(model.position, enemyCenter);
      targetPos = {
        x: model.position.x + awayDir.x * initiativeValue,
        y: model.position.y + awayDir.y * initiativeValue,
      };
    } else {
      // No enemies — move toward board center
      targetPos = {
        x: battlefield.width / 2,
        y: battlefield.height / 2,
      };
    }

    targetPos = clampToBoard(targetPos, state);
    const newPos = moveToward(model.position, targetPos, initiativeValue);

    // Ensure >2" from all enemies
    let finalPos = newPos;
    for (const enemy of enemyModels) {
      const dist = getDistanceBetween(finalPos, enemy.position);
      if (dist <= 2) {
        const awayFromEnemy = getDirectionAway(finalPos, enemy.position);
        const extensionNeeded = 2.1 - dist;
        finalPos = {
          x: finalPos.x + awayFromEnemy.x * extensionNeeded,
          y: finalPos.y + awayFromEnemy.y * extensionNeeded,
        };
        finalPos = clampToBoard(finalPos, state);
      }
    }

    if (finalPos.x !== model.position.x || finalPos.y !== model.position.y) {
      newState = updateUnitInGameState(newState, unitId, u =>
        updateModelInUnit(u, model.id, m => moveModel(m, finalPos)),
      );

      modelMoves.push({ modelId: model.id, from: model.position, to: finalPos });
    }
  }

  // Unlock from combat
  newState = unlockFromCombat(newState, unitId);

  if (modelMoves.length > 0) {
    events.push({
      type: 'consolidateMove',
      unitId,
      modelMoves,
    } as GameEvent);
  }

  return {
    state: newState,
    events,
    result: {
      modelMoves,
      stillLockedInCombat: false,
      routedApplied: false,
      statusChanges: [],
      pursueCaught: false,
      pursueRoll: 0,
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create an empty aftermath result.
 */
function createEmptyResult(): AftermathResult {
  return {
    modelMoves: [],
    stillLockedInCombat: false,
    routedApplied: false,
    statusChanges: [],
    pursueCaught: false,
    pursueRoll: 0,
  };
}

/**
 * Get enemy unit IDs for a given unit in a combat.
 */
function getEnemyUnitIds(combatState: CombatState, unitId: string): string[] {
  if (combatState.activePlayerUnitIds.includes(unitId)) {
    return combatState.reactivePlayerUnitIds;
  }
  return combatState.activePlayerUnitIds;
}

/**
 * Get all alive enemy models across multiple units.
 */
function getAllAliveEnemyModels(
  state: GameState,
  unitIds: string[],
): { id: string; position: Position }[] {
  const models: { id: string; position: Position }[] = [];
  for (const unitId of unitIds) {
    const unit = findUnit(state, unitId);
    if (unit) {
      for (const model of getAliveModels(unit)) {
        models.push({ id: model.id, position: model.position });
      }
    }
  }
  return models;
}

/**
 * Find the closest position from a list to a given position.
 */
function findClosestPosition(from: Position, positions: Position[]): Position | null {
  let closest: Position | null = null;
  let minDist = Infinity;
  for (const pos of positions) {
    const dist = getDistanceBetween(from, pos);
    if (dist < minDist) {
      minDist = dist;
      closest = pos;
    }
  }
  return closest;
}

/**
 * Calculate the center position of a set of positions.
 */
function calculateCenter(positions: Position[]): Position {
  if (positions.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const pos of positions) {
    sumX += pos.x;
    sumY += pos.y;
  }
  return {
    x: sumX / positions.length,
    y: sumY / positions.length,
  };
}

/**
 * Get a normalized direction vector pointing away from a target.
 */
function getDirectionAway(from: Position, target: Position): Position {
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { x: 0, y: 1 }; // Default: move "up"
  return { x: dx / dist, y: dy / dist };
}

/**
 * Clamp a position to be within the board boundaries.
 */
function clampToBoard(pos: Position, state: GameState): Position {
  const battlefield = getBattlefieldDimensions(state);
  return {
    x: Math.max(0, Math.min(battlefield.width, pos.x)),
    y: Math.max(0, Math.min(battlefield.height, pos.y)),
  };
}

/**
 * Get the nearest board edge position for a model.
 * Returns a position on the nearest edge.
 */
function getNearestBoardEdge(pos: Position, state: GameState): Position {
  const battlefield = getBattlefieldDimensions(state);
  const distToLeft = pos.x;
  const distToRight = battlefield.width - pos.x;
  const distToBottom = pos.y;
  const distToTop = battlefield.height - pos.y;

  const minDist = Math.min(distToLeft, distToRight, distToBottom, distToTop);

  if (minDist === distToBottom) return { x: pos.x, y: 0 };
  if (minDist === distToTop) return { x: pos.x, y: battlefield.height };
  if (minDist === distToLeft) return { x: 0, y: pos.y };
  return { x: battlefield.width, y: pos.y };
}

function getBattlefieldDimensions(state: GameState): { width: number; height: number } {
  return {
    width: state.battlefield?.width ?? BOARD_WIDTH,
    height: state.battlefield?.height ?? BOARD_HEIGHT,
  };
}

function unitIncludesVehicleModel(unit: UnitState): boolean {
  return getAliveModels(unit).some((model) =>
    getModelType(model.unitProfileId, model.profileModelName) === ModelType.Vehicle,
  );
}

function getModelAftermathInitiative(model: ModelState, initiativeOverride?: number): number {
  return initiativeOverride ?? getModelInitiative(model.unitProfileId, model.profileModelName);
}

function getMaximumAftermathInitiative(unit: UnitState, initiativeOverride?: number): number {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return initiativeOverride ?? DEFAULT_INITIATIVE;
  }

  return Math.max(
    ...aliveModels.map((model) => getModelAftermathInitiative(model, initiativeOverride)),
  );
}

function getModelAftermathMovement(model: ModelState, movementOverride?: number): number {
  return movementOverride ?? getModelMovement(model.unitProfileId, model.profileModelName);
}

function applyRoutedStatus(
  state: GameState,
  unitId: string,
): { state: GameState; applied: boolean } {
  const unit = findUnit(state, unitId);
  if (!unit || unit.statuses.includes(TacticalStatus.Routed)) {
    return { state, applied: false };
  }

  return {
    state: updateUnitInGameState(state, unitId, (currentUnit) =>
      addStatus(currentUnit, TacticalStatus.Routed),
    ),
    applied: true,
  };
}

function applyModelMoves(
  state: GameState,
  unitId: string,
  moves: Map<string, Position>,
): GameState {
  let nextState = state;
  for (const [modelId, position] of moves.entries()) {
    nextState = updateUnitInGameState(nextState, unitId, (unit) =>
      updateModelInUnit(unit, modelId, (model) => moveModel(model, position)),
    );
  }
  return nextState;
}

function getMinimumEnemyDistance(
  position: Position,
  enemyModels: { id: string; position: Position }[],
): number {
  if (enemyModels.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let minimumDistance = Number.POSITIVE_INFINITY;
  for (const enemyModel of enemyModels) {
    minimumDistance = Math.min(minimumDistance, getDistanceBetween(position, enemyModel.position));
  }
  return minimumDistance;
}

function getDistanceSamples(maxDistance: number): number[] {
  if (maxDistance <= 0) {
    return [0];
  }

  return [...new Set([
    maxDistance,
    maxDistance * 0.75,
    maxDistance * 0.5,
    maxDistance * 0.25,
    Math.min(maxDistance, 2.1),
  ])].filter((distance) => distance > 0);
}

function pushAwayFromEnemyModels(
  position: Position,
  enemyModels: { id: string; position: Position }[],
  state: GameState,
): Position {
  let adjustedPosition = position;
  for (const enemyModel of enemyModels) {
    const distance = getDistanceBetween(adjustedPosition, enemyModel.position);
    if (distance <= 2) {
      const away = getDirectionAway(adjustedPosition, enemyModel.position);
      const extension = 2.1 - distance;
      adjustedPosition = clampToBoard({
        x: adjustedPosition.x + away.x * extension,
        y: adjustedPosition.y + away.y * extension,
      }, state);
    }
  }
  return adjustedPosition;
}

function findDisengageDestination(
  model: ModelState,
  enemyModels: { id: string; position: Position }[],
  movementValue: number,
  battlefield: { width: number; height: number },
): Position | null {
  if (enemyModels.length === 0) {
    return model.position;
  }

  const syntheticState = {
    battlefield,
  } as GameState;
  const currentDistance = getMinimumEnemyDistance(model.position, enemyModels);
  const enemyCenter = calculateCenter(enemyModels.map((enemyModel) => enemyModel.position));
  const preferredAngle = Math.atan2(
    model.position.y - enemyCenter.y,
    model.position.x - enemyCenter.x,
  );

  let bestPosition: Position | null = null;
  let bestDistance = currentDistance;

  for (let step = 0; step < 24; step += 1) {
    const angle = preferredAngle + ((Math.PI * 2) / 24) * step;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };

    for (const distance of getDistanceSamples(movementValue)) {
      const candidate = clampToBoard({
        x: model.position.x + direction.x * distance,
        y: model.position.y + direction.y * distance,
      }, syntheticState);
      const adjustedCandidate = pushAwayFromEnemyModels(candidate, enemyModels, syntheticState);
      const candidateDistance = getMinimumEnemyDistance(adjustedCandidate, enemyModels);

      if (candidateDistance > bestDistance + 0.01) {
        bestDistance = candidateDistance;
        bestPosition = adjustedCandidate;
      }
    }
  }

  return bestPosition;
}
