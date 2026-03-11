/**
 * Victory Handler.
 * Processes the Victory sub-phase during the End Phase.
 *
 * Reference: HH_Battle_AOD.md — "Victory Conditions", "Scoring",
 *   "Sudden Death", "Counter Offensive", "Seize the Initiative"
 */

import type { GameState } from '@hh/types';
import { MissionSpecialRule, SecondaryObjectiveType } from '@hh/types';
import type {
  CommandResult,
  DiceProvider,
  GameEvent,
  ObjectiveScoredEvent,
  SecondaryAchievedEvent,
  CounterOffensiveActivatedEvent,
  SeizeTheInitiativeEvent,
  WindowOfOpportunityEvent,
  SuddenDeathEvent,
} from '../types';
import { findUnit } from '../game-queries';
import {
  getObjectiveScoringValueForUnit,
  resolveObjectiveControlForScoring,
} from './objective-queries';
import {
  recordObjectiveScored,
  applyWindowOfOpportunity,
} from './mission-state';
import {
  evaluateSecondaryObjectives,
  checkSlayTheWarlord,
  checkGiantKiller,
  checkLastManStanding,
  checkFirstStrike,
} from './secondary-objectives';
import { SUDDEN_DEATH_BONUS_VP, SEIZE_THE_INITIATIVE_TARGET } from '@hh/data';

// ─── Main Victory Handler ────────────────────────────────────────────────────

/**
 * Handle the Victory sub-phase of the End Phase.
 *
 * Steps:
 * 1. Score primary objectives for the active player
 * 2. Apply Window of Opportunity if active
 * 3. Check Sudden Death rule
 * 4. If game ending (last battle turn or Sudden Death): evaluate secondaries, determine winner
 * 5. Apply Counter Offensive if applicable
 *
 * @param state - Current game state
 * @param dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleVictorySubPhase(
  state: GameState,
  _dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];

  if (!state.missionState) {
    // No mission — return unchanged (fallback for games without missions)
    return { state, events: [], errors: [], accepted: true };
  }

  let newState = { ...state };
  let missionState = { ...state.missionState };

  // ─── Step 1: Score Primary Objectives ────────────────────────────────
  const activePlayerIndex = state.activePlayerIndex;
  let vpScored = 0;
  const objectiveResolution = resolveObjectiveControlForScoring(newState, activePlayerIndex);

  for (const objective of missionState.objectives) {
    if (objective.isRemoved) continue;

    const control = objectiveResolution.objectiveResults[objective.id];
    if (!control) continue;
    if (control.controllerPlayerIndex === activePlayerIndex) {
      const controllingUnit = control.controllingUnitId
        ? (findUnit(newState, control.controllingUnitId) ?? null)
        : null;
      const vp = getObjectiveScoringValueForUnit(controllingUnit, objective);
      vpScored += vp;

      // Record scoring
      missionState = recordObjectiveScored(missionState, {
        battleTurn: state.currentBattleTurn,
        playerIndex: activePlayerIndex,
        objectiveId: objective.id,
        vpScored: vp,
        source: objective.label,
      });

      events.push({
        type: 'objectiveScored',
        objectiveId: objective.id,
        playerIndex: activePlayerIndex,
        vpScored: vp,
        objectiveLabel: objective.label,
      } satisfies ObjectiveScoredEvent);

      // Step 2: Apply Window of Opportunity
      if (missionState.activeSpecialRules.includes(MissionSpecialRule.WindowOfOpportunity)) {
        const prevValue = objective.currentVpValue;
        missionState = applyWindowOfOpportunity(missionState, objective.id);
        const updatedObj = missionState.objectives.find((o) => o.id === objective.id);
        if (updatedObj) {
          events.push({
            type: 'windowOfOpportunity',
            objectiveId: objective.id,
            previousValue: prevValue,
            newValue: updatedObj.currentVpValue,
            removed: updatedObj.isRemoved,
          } satisfies WindowOfOpportunityEvent);
        }
      }
    }
  }

  // Update army VP
  const armyIndex = activePlayerIndex;
  const updatedArmies = [...newState.armies] as [typeof newState.armies[0], typeof newState.armies[1]];
  updatedArmies[armyIndex] = {
    ...updatedArmies[armyIndex],
    victoryPoints: updatedArmies[armyIndex].victoryPoints + vpScored,
  };
  newState = { ...newState, armies: updatedArmies };

  // ─── Step 3: Check Sudden Death ──────────────────────────────────────
  const suddenDeath = checkSuddenDeath(newState);

  // ─── Step 4: If game ending, evaluate secondaries ────────────────────
  const isLastTurn = state.currentBattleTurn >= state.maxBattleTurns;
  const isSecondPlayerTurn = state.activePlayerIndex === (state.firstPlayerIndex === 0 ? 1 : 0);
  const isEndOfBattleTurn = isSecondPlayerTurn; // Both players have had their turn
  const isGameEnding = (isLastTurn && isEndOfBattleTurn) || suddenDeath.triggered;

  if (suddenDeath.triggered) {
    // Award Sudden Death bonus
    const survivorIndex = suddenDeath.survivingPlayerIndex!;
    const updatedArmies2 = [...newState.armies] as [typeof newState.armies[0], typeof newState.armies[1]];
    updatedArmies2[survivorIndex] = {
      ...updatedArmies2[survivorIndex],
      victoryPoints: updatedArmies2[survivorIndex].victoryPoints + SUDDEN_DEATH_BONUS_VP,
    };
    newState = { ...newState, armies: updatedArmies2 };

    events.push({
      type: 'suddenDeath',
      survivingPlayerIndex: survivorIndex,
      bonusVP: SUDDEN_DEATH_BONUS_VP,
    } satisfies SuddenDeathEvent);
  }

  if (isGameEnding) {
    // Evaluate secondary objectives
    const [p0SecVP, p1SecVP] = evaluateSecondaryObjectives(
      { ...newState, missionState },
      suddenDeath.triggered,
    );

    const finalArmies = [...newState.armies] as [typeof newState.armies[0], typeof newState.armies[1]];
    finalArmies[0] = {
      ...finalArmies[0],
      victoryPoints: finalArmies[0].victoryPoints + p0SecVP,
    };
    finalArmies[1] = {
      ...finalArmies[1],
      victoryPoints: finalArmies[1].victoryPoints + p1SecVP,
    };
    newState = { ...newState, armies: finalArmies };

    // Emit secondary events
    if (p0SecVP > 0) {
      for (const sec of missionState.secondaryObjectives) {
        if (sec.achievedByPlayer === 0 || checkSecondaryForPlayer(newState, sec.type, 0)) {
          events.push({
            type: 'secondaryAchieved',
            secondaryType: sec.type,
            playerIndex: 0,
            vpScored: sec.vpValue,
          } satisfies SecondaryAchievedEvent);
        }
      }
    }
    if (p1SecVP > 0) {
      for (const sec of missionState.secondaryObjectives) {
        if (sec.achievedByPlayer === 1 || checkSecondaryForPlayer(newState, sec.type, 1)) {
          events.push({
            type: 'secondaryAchieved',
            secondaryType: sec.type,
            playerIndex: 1,
            vpScored: sec.vpValue,
          } satisfies SecondaryAchievedEvent);
        }
      }
    }

    // ─── Step 5: Apply Counter Offensive ────────────────────────────────
    if (missionState.activeSpecialRules.includes(MissionSpecialRule.CounterOffensive)) {
      const coResult = applyCounterOffensive(newState, missionState);
      if (coResult.applied) {
        const coArmies = [...newState.armies] as [typeof newState.armies[0], typeof newState.armies[1]];
        coArmies[coResult.playerIndex] = {
          ...coArmies[coResult.playerIndex],
          victoryPoints: coResult.newVP,
        };
        newState = { ...newState, armies: coArmies };

        events.push({
          type: 'counterOffensiveActivated',
          playerIndex: coResult.playerIndex,
          originalVP: coResult.originalVP,
          doubledVP: coResult.newVP,
        } satisfies CounterOffensiveActivatedEvent);
      }
    }

    // Determine winner
    const p0Final = newState.armies[0].victoryPoints;
    const p1Final = newState.armies[1].victoryPoints;
    let winnerIndex: number | null = null;
    if (p0Final > p1Final) winnerIndex = 0;
    else if (p1Final > p0Final) winnerIndex = 1;

    newState = {
      ...newState,
      isGameOver: true,
      winnerPlayerIndex: winnerIndex,
    };

    events.push({
      type: 'gameOver',
      winnerPlayerIndex: winnerIndex,
      reason: suddenDeath.triggered
        ? 'Sudden Death — one player has no models on the battlefield'
        : `End of Battle Turn ${state.maxBattleTurns}`,
    });
  }

  // Update mission state on game state
  newState = { ...newState, missionState };

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── Sudden Death Check ──────────────────────────────────────────────────────

interface SuddenDeathResult {
  triggered: boolean;
  survivingPlayerIndex: number | null;
}

/**
 * Check Sudden Death condition.
 * At the end of any Battle Turn, if any player has no models on the battlefield,
 * the battle immediately ends.
 *
 * Models in Reserves do NOT count.
 * Models embarked in Transports DO count.
 *
 * @param state - Current game state
 * @returns Whether Sudden Death triggered and who survived
 */
export function checkSuddenDeath(state: GameState): SuddenDeathResult {
  const p0HasModels = hasModelsOnBattlefield(state, 0);
  const p1HasModels = hasModelsOnBattlefield(state, 1);

  if (!p0HasModels && p1HasModels) {
    return { triggered: true, survivingPlayerIndex: 1 };
  }
  if (!p1HasModels && p0HasModels) {
    return { triggered: true, survivingPlayerIndex: 0 };
  }
  if (!p0HasModels && !p1HasModels) {
    // Both wiped out — no survivor bonus
    return { triggered: true, survivingPlayerIndex: null };
  }

  return { triggered: false, survivingPlayerIndex: null };
}

/**
 * Check if a player has any models on the battlefield.
 * Models in reserves do NOT count. Embarked models DO count.
 */
function hasModelsOnBattlefield(state: GameState, playerIndex: number): boolean {
  const army = state.armies[playerIndex];
  for (const unit of army.units) {
    if (unit.isInReserves) continue;
    for (const model of unit.models) {
      if (!model.isDestroyed) return true;
    }
  }
  return false;
}

// ─── Counter Offensive ───────────────────────────────────────────────────────

interface CounterOffensiveResult {
  applied: boolean;
  playerIndex: number;
  originalVP: number;
  newVP: number;
}

/**
 * Apply Counter Offensive if applicable.
 *
 * At the end of the game, if a player has ≤50% of their opponent's VP
 * (from the start of the last Battle Turn), double their final VP.
 *
 * @param state - Current game state at game end
 * @param missionState - Mission state
 * @returns Result of Counter Offensive check
 */
export function applyCounterOffensive(
  state: GameState,
  missionState: { vpAtTurnStart: [number, number][] },
): CounterOffensiveResult {
  const noResult: CounterOffensiveResult = {
    applied: false,
    playerIndex: 0,
    originalVP: 0,
    newVP: 0,
  };

  // Need VP at start of last battle turn
  if (missionState.vpAtTurnStart.length === 0) return noResult;

  const lastTurnStart = missionState.vpAtTurnStart[missionState.vpAtTurnStart.length - 1];
  const [p0VPAtStart, p1VPAtStart] = lastTurnStart;

  // Check if player 0 qualifies (had ≤50% of player 1's VP at turn start)
  if (p1VPAtStart > 0 && p0VPAtStart <= p1VPAtStart * 0.5) {
    return {
      applied: true,
      playerIndex: 0,
      originalVP: state.armies[0].victoryPoints,
      newVP: state.armies[0].victoryPoints * 2,
    };
  }

  // Check if player 1 qualifies
  if (p0VPAtStart > 0 && p1VPAtStart <= p0VPAtStart * 0.5) {
    return {
      applied: true,
      playerIndex: 1,
      originalVP: state.armies[1].victoryPoints,
      newVP: state.armies[1].victoryPoints * 2,
    };
  }

  return noResult;
}

// ─── Seize the Initiative ────────────────────────────────────────────────────

/**
 * Handle Seize the Initiative at the start of a Battle Turn.
 * The player going second may roll a d6. On a 6+, they go first instead.
 *
 * @param state - Current game state
 * @param dice - Dice provider
 * @returns Updated state and events
 */
export function handleSeizeTheInitiative(
  state: GameState,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  if (!state.missionState) return { state, events: [] };
  if (!state.missionState.activeSpecialRules.includes(MissionSpecialRule.SeizeTheInitiative)) {
    return { state, events: [] };
  }

  const secondPlayerIndex = state.firstPlayerIndex === 0 ? 1 : 0;
  const roll = dice.rollD6();
  const success = roll >= SEIZE_THE_INITIATIVE_TARGET;

  const event: SeizeTheInitiativeEvent = {
    type: 'seizeTheInitiative',
    playerIndex: secondPlayerIndex,
    roll,
    target: SEIZE_THE_INITIATIVE_TARGET,
    success,
  };

  if (success) {
    return {
      state: {
        ...state,
        firstPlayerIndex: secondPlayerIndex,
        activePlayerIndex: secondPlayerIndex,
      },
      events: [event ],
    };
  }

  return { state, events: [event ] };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function checkSecondaryForPlayer(
  state: GameState,
  type: SecondaryObjectiveType,
  playerIndex: number,
): boolean {
  switch (type) {
    case SecondaryObjectiveType.SlayTheWarlord:
      return checkSlayTheWarlord(state, playerIndex);
    case SecondaryObjectiveType.GiantKiller:
      return checkGiantKiller(state, playerIndex);
    case SecondaryObjectiveType.LastManStanding:
      return checkLastManStanding(state, playerIndex);
    case SecondaryObjectiveType.FirstStrike:
      return checkFirstStrike(state, playerIndex);
    default:
      return false;
  }
}
