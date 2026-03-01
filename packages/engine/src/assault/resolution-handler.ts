/**
 * Resolution Handler — Combat Resolution Points & Panic
 * Implements the Resolution Sub-Phase Steps 1-3.
 * Reference: HH_Rules_Battle.md — Resolution Sub-Phase
 *
 * Step 1: Return challenge participants to their units
 * Step 2: Calculate Combat Resolution Points (CRP)
 * Step 3: Determine winner and resolve Panic Check
 */

import type { GameState, Position } from '@hh/types';
import { TacticalStatus } from '@hh/types';
import type { DiceProvider, GameEvent, CombatResolutionEvent } from '../types';
import {
  findUnit,
  getAliveModels,
  findUnitPlayerIndex,
  getDistanceBetween,
} from '../game-queries';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  addStatus,
} from '../state-helpers';
import type { CombatState } from './assault-types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default Leadership value for standard Space Marine units */
export const DEFAULT_LEADERSHIP = 8;

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of returning challenge participants to their units.
 */
export interface ReturnChallengeResult {
  /** Updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
}

/**
 * Result of calculating Combat Resolution Points.
 */
export interface CRPResult {
  /** CRP for the active player's side */
  activePlayerCRP: number;
  /** CRP for the reactive player's side */
  reactivePlayerCRP: number;
  /** Breakdown of CRP sources for active player */
  activeBreakdown: CRPBreakdown;
  /** Breakdown of CRP sources for reactive player */
  reactiveBreakdown: CRPBreakdown;
}

/**
 * Breakdown of how CRP was calculated.
 */
export interface CRPBreakdown {
  /** +1 per enemy model killed in fight sub-phase */
  enemyModelsKilled: number;
  /** +1 for controlling most models in combat */
  modelMajority: number;
  /** CRP from challenge glory */
  challengeCRP: number;
  /** CRP bonus from legion tactica (e.g., Word Bearers +1) */
  legionTacticaCRP: number;
  /** Total */
  total: number;
}

/**
 * Result of determining the winner.
 */
export interface CombatWinnerResult {
  /** Player index of the winner (null if draw) */
  winnerPlayerIndex: number | null;
  /** Player index of the loser (null if draw) */
  loserPlayerIndex: number | null;
  /** Whether it's a draw */
  isDraw: boolean;
  /** CRP difference (always >= 0) */
  crpDifference: number;
}

/**
 * Result of resolving the panic check.
 */
export interface PanicCheckResult {
  /** Updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
  /** The roll value (2d6) */
  roll: number;
  /** The target number (Leadership - CRP difference) */
  targetNumber: number;
  /** Whether the check was passed */
  passed: boolean;
  /** Whether the check was skipped (all already routed) */
  skipped: boolean;
}

/**
 * Result of checking for a massacre.
 */
export interface MassacreCheckResult {
  /** Whether a massacre occurred */
  isMassacre: boolean;
  /** Player index of the massacre winner (null if no massacre) */
  winnerPlayerIndex: number | null;
}

// ─── Return Challenge Participants ─────────────────────────────────────────

/**
 * Return surviving challenge participants to their units.
 * Surviving models are placed in coherency with their original unit.
 * If the unit was wiped, they are placed in base contact with the enemy.
 *
 * @param state - Current game state
 * @param combatState - The combat state with challenge info
 * @returns Updated state and events
 */
export function returnChallengeParticipants(
  state: GameState,
  combatState: CombatState,
): ReturnChallengeResult {
  const events: GameEvent[] = [];

  if (!combatState.challengeState) {
    return { state, events };
  }

  const challenge = combatState.challengeState;
  let newState = state;

  // Return challenger if alive
  newState = returnModelToUnit(
    newState,
    challenge.challengerId,
    challenge.challengerUnitId,
    combatState,
    events,
  );

  // Return challenged if alive
  newState = returnModelToUnit(
    newState,
    challenge.challengedId,
    challenge.challengedUnitId,
    combatState,
    events,
  );

  return { state: newState, events };
}

/**
 * Return a single model to its unit after a challenge.
 */
function returnModelToUnit(
  state: GameState,
  modelId: string,
  unitId: string,
  combatState: CombatState,
  events: GameEvent[],
): GameState {
  const unit = findUnit(state, unitId);
  if (!unit) return state;

  // Check if model is still alive
  const model = unit.models.find(m => m.id === modelId);
  if (!model || model.isDestroyed) return state;

  // Get alive models in the unit (excluding the challenge participant)
  const otherAlive = getAliveModels(unit).filter(m => m.id !== modelId);

  if (otherAlive.length > 0) {
    // Place near closest friendly model in the unit (coherency)
    const closest = findClosestModel(model.position, otherAlive);
    if (closest) {
      const targetPos = getCoherencyPosition(model.position, closest.position);
      const newState = updateUnitInGameState(state, unitId, u =>
        updateModelInUnit(u, modelId, m => moveModel(m, targetPos)),
      );

      events.push({
        type: 'pileInMove',
        modelId,
        unitId,
        from: model.position,
        to: targetPos,
        distance: getDistanceBetween(model.position, targetPos),
      } as GameEvent);

      return newState;
    }
  } else {
    // Unit was wiped — place in base contact with enemy unit
    const enemyUnitIds = getEnemyUnitIds(combatState, unitId);
    for (const enemyUnitId of enemyUnitIds) {
      const enemyUnit = findUnit(state, enemyUnitId);
      if (!enemyUnit) continue;
      const enemyAlive = getAliveModels(enemyUnit);
      if (enemyAlive.length === 0) continue;

      const closestEnemy = findClosestModel(model.position, enemyAlive);
      if (closestEnemy) {
        const targetPos = getBaseContactPosition(model.position, closestEnemy.position);
        const newState = updateUnitInGameState(state, unitId, u =>
          updateModelInUnit(u, modelId, m => moveModel(m, targetPos)),
        );

        events.push({
          type: 'pileInMove',
          modelId,
          unitId,
          from: model.position,
          to: targetPos,
          distance: getDistanceBetween(model.position, targetPos),
        } as GameEvent);

        return newState;
      }
    }
  }

  return state;
}

// ─── Calculate Combat Resolution Points ────────────────────────────────────

/**
 * Calculate Combat Resolution Points for both sides.
 * Reference: HH_Rules_Battle.md — Resolution Sub-Phase Step 2
 *
 * CRP sources:
 * - +1 per enemy model killed in the Fight Sub-Phase
 * - +1 for the side controlling the most models in the combat
 * - Challenge CRP from the Glory step
 * - Legion tactica CRP bonus (e.g., Word Bearers +1)
 *
 * @param combatState - The combat state with casualty and challenge info
 * @param activeModelCount - Number of alive models on active player's side
 * @param reactiveModelCount - Number of alive models on reactive player's side
 * @param activeTacticaCRP - Optional legion tactica CRP bonus for active player (default 0)
 * @param reactiveTacticaCRP - Optional legion tactica CRP bonus for reactive player (default 0)
 * @returns CRP result with totals and breakdowns
 */
export function calculateCombatResolutionPoints(
  combatState: CombatState,
  activeModelCount: number,
  reactiveModelCount: number,
  activeTacticaCRP: number = 0,
  reactiveTacticaCRP: number = 0,
): CRPResult {
  // Casualties inflicted = CRP
  const activeCasualtiesInflicted = combatState.reactivePlayerCasualties.length;
  const reactiveCasualtiesInflicted = combatState.activePlayerCasualties.length;

  // Model majority bonus
  let activeModelMajority = 0;
  let reactiveModelMajority = 0;
  if (activeModelCount > reactiveModelCount) {
    activeModelMajority = 1;
  } else if (reactiveModelCount > activeModelCount) {
    reactiveModelMajority = 1;
  }

  // Challenge CRP
  let activeChallengeCRP = 0;
  let reactiveChallengeCRP = 0;
  if (combatState.challengeState) {
    const challenge = combatState.challengeState;
    // Challenger is on active or reactive side?
    const challengerOnActive = combatState.activePlayerUnitIds.includes(
      challenge.challengerUnitId,
    );

    if (challengerOnActive) {
      activeChallengeCRP = challenge.challengerCRP;
      reactiveChallengeCRP = challenge.challengedCRP;
    } else {
      activeChallengeCRP = challenge.challengedCRP;
      reactiveChallengeCRP = challenge.challengerCRP;
    }
  }

  const activeBreakdown: CRPBreakdown = {
    enemyModelsKilled: activeCasualtiesInflicted,
    modelMajority: activeModelMajority,
    challengeCRP: activeChallengeCRP,
    legionTacticaCRP: activeTacticaCRP,
    total: activeCasualtiesInflicted + activeModelMajority + activeChallengeCRP + activeTacticaCRP,
  };

  const reactiveBreakdown: CRPBreakdown = {
    enemyModelsKilled: reactiveCasualtiesInflicted,
    modelMajority: reactiveModelMajority,
    challengeCRP: reactiveChallengeCRP,
    legionTacticaCRP: reactiveTacticaCRP,
    total: reactiveCasualtiesInflicted + reactiveModelMajority + reactiveChallengeCRP + reactiveTacticaCRP,
  };

  return {
    activePlayerCRP: activeBreakdown.total,
    reactivePlayerCRP: reactiveBreakdown.total,
    activeBreakdown,
    reactiveBreakdown,
  };
}

// ─── Determine Winner ──────────────────────────────────────────────────────

/**
 * Determine the winner of a combat based on CRP totals.
 * The side with more CRP wins. Ties result in no winner.
 *
 * @param activePlayerCRP - Active player's CRP total
 * @param reactivePlayerCRP - Reactive player's CRP total
 * @param activePlayerIndex - Player index for the active side (typically 0)
 * @returns CombatWinnerResult with winner, loser, and draw status
 */
export function determineWinner(
  activePlayerCRP: number,
  reactivePlayerCRP: number,
  activePlayerIndex: number = 0,
): CombatWinnerResult {
  const reactivePlayerIndex = activePlayerIndex === 0 ? 1 : 0;
  const crpDifference = Math.abs(activePlayerCRP - reactivePlayerCRP);

  if (activePlayerCRP > reactivePlayerCRP) {
    return {
      winnerPlayerIndex: activePlayerIndex,
      loserPlayerIndex: reactivePlayerIndex,
      isDraw: false,
      crpDifference,
    };
  } else if (reactivePlayerCRP > activePlayerCRP) {
    return {
      winnerPlayerIndex: reactivePlayerIndex,
      loserPlayerIndex: activePlayerIndex,
      isDraw: false,
      crpDifference,
    };
  } else {
    return {
      winnerPlayerIndex: null,
      loserPlayerIndex: null,
      isDraw: true,
      crpDifference: 0,
    };
  }
}

// ─── Resolve Panic Check ───────────────────────────────────────────────────

/**
 * Resolve the Panic Check for the losing side.
 * The losing player makes a Leadership Check on 2d6 with a modifier.
 *
 * Roll 2d6 <= (Leadership - CRP difference) → passed
 * Failed → all losing models gain Routed status
 * Skip if all losing models are already Routed
 *
 * @param state - Current game state
 * @param combatState - The combat state
 * @param losingPlayerIndex - Player index of the losing side
 * @param crpDifference - CRP difference (modifier to leadership)
 * @param dice - Dice provider for rolling
 * @param leadershipValue - Base leadership value (default: 8)
 * @returns PanicCheckResult with updated state
 */
export function resolvePanicCheck(
  state: GameState,
  combatState: CombatState,
  losingPlayerIndex: number,
  crpDifference: number,
  dice: DiceProvider,
  leadershipValue: number = DEFAULT_LEADERSHIP,
): PanicCheckResult {
  const events: GameEvent[] = [];

  // Get the losing side's unit IDs
  const losingUnitIds = getPlayerUnitIds(combatState, losingPlayerIndex);

  // Check if all losing models are already Routed
  let allAlreadyRouted = true;
  for (const unitId of losingUnitIds) {
    const unit = findUnit(state, unitId);
    if (!unit) continue;
    const alive = getAliveModels(unit);
    if (alive.length === 0) continue;
    if (!unit.statuses.includes(TacticalStatus.Routed)) {
      allAlreadyRouted = false;
      break;
    }
  }

  if (allAlreadyRouted) {
    return {
      state,
      events,
      roll: 0,
      targetNumber: 0,
      passed: false,
      skipped: true,
    };
  }

  // Roll 2d6
  const [die1, die2] = dice.roll2D6();
  const roll = die1 + die2;
  const targetNumber = Math.max(2, leadershipValue - crpDifference);
  const passed = roll <= targetNumber;

  events.push({
    type: 'coolCheck',
    unitId: losingUnitIds[0] || '',
    roll,
    target: targetNumber,
    passed,
  } as GameEvent);

  let newState = state;

  if (!passed) {
    // Failed: all losing models gain Routed
    for (const unitId of losingUnitIds) {
      newState = updateUnitInGameState(newState, unitId, unit =>
        addStatus(unit, TacticalStatus.Routed),
      );
    }
  }

  return {
    state: newState,
    events,
    roll,
    targetNumber,
    passed,
    skipped: false,
  };
}

// ─── Massacre Check ────────────────────────────────────────────────────────

/**
 * Check if a massacre occurred in the combat.
 * A massacre occurs when one side is completely wiped out.
 *
 * @param state - Current game state
 * @param combatState - The combat state
 * @returns MassacreCheckResult with massacre status
 */
export function checkMassacre(
  state: GameState,
  combatState: CombatState,
): MassacreCheckResult {
  const activeAlive = countAliveModels(state, combatState.activePlayerUnitIds);
  const reactiveAlive = countAliveModels(state, combatState.reactivePlayerUnitIds);

  if (activeAlive === 0 && reactiveAlive > 0) {
    // Reactive player wins by massacre
    const reactivePlayerIndex = findUnitPlayerIndex(
      state,
      combatState.reactivePlayerUnitIds[0],
    );
    return {
      isMassacre: true,
      winnerPlayerIndex: reactivePlayerIndex ?? 1,
    };
  }

  if (reactiveAlive === 0 && activeAlive > 0) {
    // Active player wins by massacre
    const activePlayerIndex = findUnitPlayerIndex(
      state,
      combatState.activePlayerUnitIds[0],
    );
    return {
      isMassacre: true,
      winnerPlayerIndex: activePlayerIndex ?? 0,
    };
  }

  if (activeAlive === 0 && reactiveAlive === 0) {
    // Both sides wiped — mutual destruction, no winner
    return {
      isMassacre: true,
      winnerPlayerIndex: null,
    };
  }

  return {
    isMassacre: false,
    winnerPlayerIndex: null,
  };
}

// ─── Full Resolution Pipeline ──────────────────────────────────────────────

/**
 * Full combat resolution pipeline result.
 */
export interface CombatResolutionResult {
  /** Updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
  /** CRP result */
  crpResult: CRPResult;
  /** Winner result */
  winnerResult: CombatWinnerResult;
  /** Panic check result (null if massacre or draw) */
  panicCheckResult: PanicCheckResult | null;
  /** Whether a massacre occurred */
  isMassacre: boolean;
}

/**
 * Run the full combat resolution pipeline.
 *
 * 1. Return challenge participants
 * 2. Check for massacre
 * 3. Calculate CRP
 * 4. Determine winner
 * 5. Resolve panic check (if applicable)
 *
 * @param state - Current game state
 * @param combatState - The combat state
 * @param dice - Dice provider
 * @param leadershipValue - Leadership value for panic check
 * @returns Full resolution result
 */
export function resolveCombatResolution(
  state: GameState,
  combatState: CombatState,
  dice: DiceProvider,
  leadershipValue: number = DEFAULT_LEADERSHIP,
): CombatResolutionResult {
  const allEvents: GameEvent[] = [];

  // Step 1: Return challenge participants
  const returnResult = returnChallengeParticipants(state, combatState);
  let newState = returnResult.state;
  allEvents.push(...returnResult.events);

  // Step 2: Check for massacre
  const massacreResult = checkMassacre(newState, combatState);
  if (massacreResult.isMassacre) {
    const crpResult: CRPResult = {
      activePlayerCRP: 0,
      reactivePlayerCRP: 0,
      activeBreakdown: { enemyModelsKilled: 0, modelMajority: 0, challengeCRP: 0, legionTacticaCRP: 0, total: 0 },
      reactiveBreakdown: { enemyModelsKilled: 0, modelMajority: 0, challengeCRP: 0, legionTacticaCRP: 0, total: 0 },
    };

    const winnerResult: CombatWinnerResult = {
      winnerPlayerIndex: massacreResult.winnerPlayerIndex,
      loserPlayerIndex: massacreResult.winnerPlayerIndex !== null
        ? (massacreResult.winnerPlayerIndex === 0 ? 1 : 0)
        : null,
      isDraw: massacreResult.winnerPlayerIndex === null,
      crpDifference: 0,
    };

    allEvents.push({
      type: 'combatResolution',
      combatId: combatState.combatId,
      activePlayerCRP: 0,
      reactivePlayerCRP: 0,
      winnerPlayerIndex: massacreResult.winnerPlayerIndex,
      crpDifference: 0,
    } as CombatResolutionEvent);

    return {
      state: newState,
      events: allEvents,
      crpResult,
      winnerResult,
      panicCheckResult: null,
      isMassacre: true,
    };
  }

  // Step 3: Calculate CRP
  const activeModelCount = countAliveModels(newState, combatState.activePlayerUnitIds);
  const reactiveModelCount = countAliveModels(newState, combatState.reactivePlayerUnitIds);
  const crpResult = calculateCombatResolutionPoints(
    combatState,
    activeModelCount,
    reactiveModelCount,
  );

  // Step 4: Determine winner
  const activePlayerIndex = findUnitPlayerIndex(
    newState,
    combatState.activePlayerUnitIds[0],
  ) ?? 0;
  const winnerResult = determineWinner(
    crpResult.activePlayerCRP,
    crpResult.reactivePlayerCRP,
    activePlayerIndex,
  );

  allEvents.push({
    type: 'combatResolution',
    combatId: combatState.combatId,
    activePlayerCRP: crpResult.activePlayerCRP,
    reactivePlayerCRP: crpResult.reactivePlayerCRP,
    winnerPlayerIndex: winnerResult.winnerPlayerIndex,
    crpDifference: winnerResult.crpDifference,
  } as CombatResolutionEvent);

  // Step 5: Resolve panic check (only if there's a loser)
  let panicCheckResult: PanicCheckResult | null = null;
  if (winnerResult.loserPlayerIndex !== null) {
    panicCheckResult = resolvePanicCheck(
      newState,
      combatState,
      winnerResult.loserPlayerIndex,
      winnerResult.crpDifference,
      dice,
      leadershipValue,
    );
    newState = panicCheckResult.state;
    allEvents.push(...panicCheckResult.events);
  }

  return {
    state: newState,
    events: allEvents,
    crpResult,
    winnerResult,
    panicCheckResult,
    isMassacre: false,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Count alive models across multiple units.
 */
function countAliveModels(state: GameState, unitIds: string[]): number {
  let count = 0;
  for (const unitId of unitIds) {
    const unit = findUnit(state, unitId);
    if (unit) {
      count += getAliveModels(unit).length;
    }
  }
  return count;
}

/**
 * Get unit IDs for a specific player side in a combat.
 */
function getPlayerUnitIds(combatState: CombatState, playerIndex: number): string[] {
  // We determine which side by checking if the player is active or reactive
  // The active player's units are in activePlayerUnitIds
  // We need to check which player index corresponds to which side
  // Since we don't store player indices directly, we use the convention:
  // activePlayerUnitIds belongs to player index that is the active player
  // For this function, if playerIndex matches the active player side, return active units
  // We'll check both sides and return the matching one

  // Simple approach: caller knows which index maps to which side
  // Active player index 0 maps to activePlayerUnitIds, etc.
  // But this is fragile. Instead, accept that the losingPlayerIndex is already
  // determined by determineWinner which uses the activePlayerIndex convention.

  // If the combat was set up with active player first, then:
  // playerIndex === activePlayerIndex → activePlayerUnitIds
  // playerIndex !== activePlayerIndex → reactivePlayerUnitIds
  // Since we don't have the active player index stored, we use both sets.
  // The caller (resolvePanicCheck) receives losingPlayerIndex from determineWinner
  // which returns the actual game playerIndex. We need to map that to the combat side.

  // For simplicity and correctness: return all units from both sides that belong
  // to the specified player. This requires checking the game state.
  // But we only have combatState here, not game state.

  // Convention: determineWinner's activePlayerIndex parameter determines the mapping.
  // If losingPlayerIndex === activePlayerIndex → return activePlayerUnitIds
  // If losingPlayerIndex === reactivePlayerIndex → return reactivePlayerUnitIds
  // Since the caller should know, we provide both and let them pick.

  // Actually, let's simplify: we return all unit IDs and let the caller filter.
  // OR: we store the player index mapping in combatState.
  // The activePlayerUnitIds correspond to the game's active player.
  // So if losingPlayerIndex === state.activePlayerIndex → activePlayerUnitIds
  // Otherwise → reactivePlayerUnitIds

  // Since we don't have state here, we'll use a simple convention:
  // Even playerIndex (0) = active, Odd (1) = reactive
  if (playerIndex === 0) {
    return combatState.activePlayerUnitIds;
  }
  return combatState.reactivePlayerUnitIds;
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
 * Find the closest model from a list to a position.
 */
function findClosestModel(
  position: Position,
  models: { id: string; position: Position }[],
): { id: string; position: Position } | null {
  let closest: { id: string; position: Position } | null = null;
  let minDist = Infinity;
  for (const model of models) {
    const dist = getDistanceBetween(position, model.position);
    if (dist < minDist) {
      minDist = dist;
      closest = model;
    }
  }
  return closest;
}

/**
 * Get a position in coherency with a target model.
 * Places the model 1" away from the target (coherency distance).
 */
function getCoherencyPosition(from: Position, target: Position): Position {
  const dist = getDistanceBetween(from, target);
  if (dist <= 2) return from; // Already in coherency

  // Move toward target, stop at 1" away
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const ratio = (dist - 1) / dist;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
}

/**
 * Get a position in base contact with a target model.
 * Places the model 0.5" away (touching bases).
 */
function getBaseContactPosition(from: Position, target: Position): Position {
  const dist = getDistanceBetween(from, target);
  if (dist <= 1) return from; // Already in base contact

  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const ratio = (dist - 0.5) / dist;
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
}
