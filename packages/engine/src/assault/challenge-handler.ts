/**
 * Challenge Handler
 * Implements Challenge declaration and response (Steps 1-2 of the Challenge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 1-2
 *
 * Step 1: Declare Challenge — active player's eligible model issues a challenge
 * Step 2: Face-Off — opponent may accept or decline
 *   - If declined: apply Disgraced to one eligible enemy model (WS and LD halved)
 *   - If accepted: both models are removed from main combat for the challenge
 */

import type { GameState, ModelState } from '@hh/types';
import type { GameEvent, ChallengeDeclaredEvent, ChallengeDeclinedEvent, DisgracedAppliedEvent } from '../types';
import {
  findUnit,
  findModel,
  findUnitPlayerIndex,
  getAliveModels,
} from '../game-queries';
import { applyDisgraced } from '../state-helpers';
import type { ChallengeState, CombatState } from './assault-types';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of checking challenge eligibility.
 */
export interface ChallengeEligibilityResult {
  /** Whether any eligible challengers exist */
  hasEligibleChallengers: boolean;
  /** Model IDs eligible to issue a challenge */
  eligibleChallengerIds: string[];
}

/**
 * Result of declaring a challenge.
 */
export interface ChallengeDeclareResult {
  /** The updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
  /** Whether the declaration was valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Result of accepting or declining a challenge.
 */
export interface ChallengeResponseResult {
  /** The updated game state */
  state: GameState;
  /** Events generated */
  events: GameEvent[];
  /** Whether the challenge was accepted */
  accepted: boolean;
  /** The challenged model ID (if accepted) */
  challengedModelId?: string;
  /** The disgraced model ID (if declined) */
  disgracedModelId?: string;
}

// ─── Get Eligible Challengers ───────────────────────────────────────────────

/**
 * Get models eligible to issue a challenge from a unit in combat.
 *
 * A model is eligible to challenge if:
 * - It is alive (not destroyed)
 * - It is a Paragon type, Command/Champion subtype, or has a challenge-enabling rule
 * - Its unit is locked in combat with an enemy unit that also has an eligible model
 * - It is not Routed
 *
 * For simplicity, all character-type models (warlords) and squad leaders
 * are considered eligible. In a full implementation, this would check
 * ModelType and ModelSubType from the unit profile.
 *
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Step 1
 *
 * @param state - Current game state
 * @param unitId - The unit to check for eligible challengers
 * @returns ChallengeEligibilityResult with eligible model IDs
 */
export function getEligibleChallengers(
  state: GameState,
  unitId: string,
): ChallengeEligibilityResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { hasEligibleChallengers: false, eligibleChallengerIds: [] };
  }

  // Unit must be locked in combat
  if (!unit.isLockedInCombat) {
    return { hasEligibleChallengers: false, eligibleChallengerIds: [] };
  }

  // Unit must not be Routed
  if (unit.statuses.some(s => s === 'Routed')) {
    return { hasEligibleChallengers: false, eligibleChallengerIds: [] };
  }

  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return { hasEligibleChallengers: false, eligibleChallengerIds: [] };
  }

  // For now, eligible challengers are:
  // - Warlord models
  // - Models whose profileModelName suggests they are characters
  //   (contains 'Sergeant', 'Champion', 'Centurion', 'Praetor', 'Captain', etc.)
  // In a full implementation, this would check the model's type and subtypes
  // from the unit profile in the data package.
  const eligibleIds: string[] = [];
  for (const model of aliveModels) {
    if (isEligibleChallenger(model)) {
      eligibleIds.push(model.id);
    }
  }

  // Per rules: the challenger declares, then opponent must accept or decline.
  // So we only need the active player to have eligible challengers.
  // If the enemy has no eligible challengers, they must decline and take Disgraced.

  return {
    hasEligibleChallengers: eligibleIds.length > 0,
    eligibleChallengerIds: eligibleIds,
  };
}

/**
 * Check if a model is eligible to issue or accept a challenge.
 * Characters (warlords, sergeants, champions, etc.) are eligible.
 */
function isEligibleChallenger(model: ModelState): boolean {
  // Warlord is always eligible
  if (model.isWarlord) return true;

  // Check profile name for character-like models
  const name = model.profileModelName.toLowerCase();
  const characterNames = [
    'sergeant', 'champion', 'centurion', 'praetor', 'captain',
    'tribune', 'delegatus', 'consul', 'warden', 'herald',
    'master', 'lord', 'primarch', 'commander', 'terminator sergeant',
  ];

  return characterNames.some(cn => name.includes(cn));
}

// ─── Declare Challenge ──────────────────────────────────────────────────────

/**
 * Declare a challenge from one model to another.
 *
 * @param state - Current game state
 * @param challengerModelId - Model issuing the challenge
 * @param targetModelId - Model being challenged
 * @returns ChallengeDeclareResult with updated state and events
 */
export function declareChallenge(
  state: GameState,
  challengerModelId: string,
  targetModelId: string,
): ChallengeDeclareResult {
  const events: GameEvent[] = [];

  // Find the challenger
  const challengerInfo = findModel(state, challengerModelId);
  if (!challengerInfo) {
    return {
      state,
      events,
      valid: false,
      error: `Challenger model '${challengerModelId}' not found`,
    };
  }

  // Find the target
  const targetInfo = findModel(state, targetModelId);
  if (!targetInfo) {
    return {
      state,
      events,
      valid: false,
      error: `Target model '${targetModelId}' not found`,
    };
  }

  // Validate challenger is eligible
  if (!isEligibleChallenger(challengerInfo.model)) {
    return {
      state,
      events,
      valid: false,
      error: `Model '${challengerModelId}' is not eligible to issue a challenge`,
    };
  }

  // Validate the units are engaged with each other
  const challengerUnit = challengerInfo.unit;
  const targetUnit = targetInfo.unit;

  if (!challengerUnit.engagedWithUnitIds.includes(targetUnit.id)) {
    return {
      state,
      events,
      valid: false,
      error: 'Challenger and target units are not engaged in combat',
    };
  }

  // Validate challenger belongs to active player
  const challengerPlayerIndex = findUnitPlayerIndex(state, challengerUnit.id);
  if (challengerPlayerIndex !== state.activePlayerIndex) {
    return {
      state,
      events,
      valid: false,
      error: 'Challenger must belong to the active player',
    };
  }

  // Generate challenge declared event
  const challengeEvent: ChallengeDeclaredEvent = {
    type: 'challengeDeclared',
    challengerModelId,
    challengerUnitId: challengerUnit.id,
    targetModelId,
    targetUnitId: targetUnit.id,
    challengerPlayerIndex: challengerPlayerIndex!,
  };
  events.push(challengeEvent);

  const activeCombats = (state.activeCombats ?? []) as CombatState[];
  const combatIndex = activeCombats.findIndex((combat) =>
    combat.activePlayerUnitIds.includes(challengerUnit.id) &&
    combat.reactivePlayerUnitIds.includes(targetUnit.id),
  );
  if (combatIndex < 0) {
    return {
      state,
      events,
      valid: false,
      error: 'No active combat context found for this challenge',
    };
  }

  if (activeCombats[combatIndex].challengeState) {
    return {
      state,
      events,
      valid: false,
      error: 'A challenge is already active in this combat',
    };
  }

  const challengedPlayerIndex = findUnitPlayerIndex(state, targetUnit.id);
  if (challengedPlayerIndex === undefined) {
    return {
      state,
      events,
      valid: false,
      error: `Could not determine the challenged player for unit '${targetUnit.id}'`,
    };
  }

  const challengeState: ChallengeState = {
    challengerId: challengerModelId,
    challengedId: targetModelId,
    challengerUnitId: challengerUnit.id,
    challengedUnitId: targetUnit.id,
    challengerPlayerIndex: challengerPlayerIndex!,
    challengedPlayerIndex,
    currentStep: 'DECLARE',
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: null,
    focusRolls: null,
    challengerWoundsInflicted: 0,
    challengedWoundsInflicted: 0,
    round: 1,
    challengerCRP: 0,
    challengedCRP: 0,
    challengerWeaponId: null,
    challengedWeaponId: null,
    guardUpFocusBonus: {},
    testTheFoeAdvantage: {},
    tauntAndBaitSelections: {},
    withdrawChosen: {},
  };

  const updatedCombats = [...activeCombats];
  updatedCombats[combatIndex] = {
    ...updatedCombats[combatIndex],
    challengeState,
  };

  return {
    state: {
      ...state,
      activeCombats: updatedCombats,
    },
    events,
    valid: true,
  };
}

// ─── Accept Challenge ───────────────────────────────────────────────────────

/**
 * Accept a challenge with a specific model.
 *
 * @param state - Current game state
 * @param challengedModelId - Model accepting the challenge
 * @param challengerModelId - Model that issued the challenge
 * @returns ChallengeResponseResult with updated state and events
 */
export function acceptChallenge(
  state: GameState,
  challengedModelId: string,
  challengerModelId: string,
): ChallengeResponseResult {
  const events: GameEvent[] = [];

  // Validate the challenged model exists
  const challengedInfo = findModel(state, challengedModelId);
  if (!challengedInfo) {
    return {
      state,
      events,
      accepted: false,
    };
  }

  const activeCombats = (state.activeCombats ?? []) as CombatState[];
  const combatIndex = activeCombats.findIndex((combat) =>
    combat.challengeState?.challengerId === challengerModelId,
  );
  if (combatIndex < 0) {
    return {
      state,
      events,
      accepted: false,
    };
  }

  const combat = activeCombats[combatIndex];
  if (!combat.challengeState) {
    return {
      state,
      events,
      accepted: false,
    };
  }

  const updatedChallenge: ChallengeState = {
    ...combat.challengeState,
    challengedId: challengedModelId,
    challengedUnitId: challengedInfo.unit.id,
    challengedPlayerIndex: challengedInfo.army.playerIndex,
    currentStep: 'FACE_OFF',
  };
  const updatedCombats = [...activeCombats];
  updatedCombats[combatIndex] = {
    ...combat,
    challengeState: updatedChallenge,
  };

  return {
    state: {
      ...state,
      activeCombats: updatedCombats,
    },
    events,
    accepted: true,
    challengedModelId,
  };
}

// ─── Decline Challenge ──────────────────────────────────────────────────────

/**
 * Decline a challenge. Apply Disgraced to one eligible enemy model.
 * Disgraced halves WS and LD for the Assault Phase.
 *
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Step 1 (Disgraced)
 *
 * @param state - Current game state
 * @param challengerModelId - Model that issued the challenge
 * @param targetUnitId - The unit that declined (to find a model to disgrace)
 * @returns ChallengeResponseResult with updated state and events
 */
export function declineChallenge(
  state: GameState,
  challengerModelId: string,
  targetUnitId: string,
): ChallengeResponseResult {
  const events: GameEvent[] = [];

  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) {
    return { state, events, accepted: false };
  }

  // Find an eligible model to disgrace in the declining unit
  const aliveModels = getAliveModels(targetUnit);
  const eligibleForDisgrace = aliveModels.filter(m => isEligibleChallenger(m));

  let newState = state;
  let disgracedModelId: string | undefined;

  if (eligibleForDisgrace.length > 0) {
    // Disgrace the first eligible model
    disgracedModelId = eligibleForDisgrace[0].id;
    newState = applyDisgraced(newState, disgracedModelId);

    const disgracedEvent: DisgracedAppliedEvent = {
      type: 'disgracedApplied',
      modelId: disgracedModelId,
      unitId: targetUnitId,
    };
    events.push(disgracedEvent);
  }

  const declinedEvent: ChallengeDeclinedEvent = {
    type: 'challengeDeclined',
    challengerModelId,
    decliningUnitId: targetUnitId,
    disgracedModelId: disgracedModelId ?? null,
  };
  events.push(declinedEvent);

  const activeCombats = (newState.activeCombats ?? []) as CombatState[];
  const combatIndex = activeCombats.findIndex((combat) =>
    combat.challengeState?.challengerId === challengerModelId,
  );
  if (combatIndex >= 0) {
    const updatedCombats = [...activeCombats];
    updatedCombats[combatIndex] = {
      ...updatedCombats[combatIndex],
      challengeState: null,
    };
    newState = {
      ...newState,
      activeCombats: updatedCombats,
    };
  }

  return {
    state: newState,
    events,
    accepted: false,
    disgracedModelId,
  };
}

// ─── Get Eligible Acceptors ─────────────────────────────────────────────────

/**
 * Get models in a unit that are eligible to accept a challenge.
 * Same criteria as challengers.
 *
 * @param state - Current game state
 * @param unitId - The unit to check
 * @returns Array of eligible model IDs
 */
export function getEligibleAcceptors(
  state: GameState,
  unitId: string,
): string[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];

  const aliveModels = getAliveModels(unit);
  return aliveModels
    .filter(m => isEligibleChallenger(m))
    .map(m => m.id);
}
