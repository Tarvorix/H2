/**
 * Assault Phase Handler — Orchestrator
 * Routes assault commands to the appropriate handler modules.
 *
 * Reference: HH_Rules_Battle.md — "Assault Phase"
 *
 * Sub-phases:
 * - Charge: validate → setup move → volley → overwatch → charge roll → charge move
 * - Challenge: declare → accept/decline → gambits → focus roll → strike → glory
 * - Fight: determine combats → declare weapons → initiative steps → pile-in
 * - Resolution: return challenge participants → CRP → winner → panic → aftermath
 */

import type {
  GameState,
  AssaultChargeStep,
  DeclareChargeCommand,
  DeclareChallengeCommand,
  SelectGambitCommand,
  AcceptChallengeCommand,
  DeclineChallengeCommand,
  SelectAftermathCommand,
  ResolveFightCommand,
} from '@hh/types';
import { AftermathOption, CoreReaction, TacticalStatus } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import { findUnit, findUnitPlayerIndex, getAliveModels } from '../game-queries';
import { setAwaitingReaction } from '../state-helpers';
import { checkAssaultAdvancedReactionTriggers } from '../legion/advanced-reaction-registry';

// Assault handler imports
import {
  validateChargeEligibility,
  validateChargeTarget,
  isDisorderedCharge,
} from '../assault/charge-validator';
import { resolveSetupMove } from '../assault/setup-move-handler';
import { resolveVolleyAttacks } from '../assault/volley-attack-handler';
import { resolveChargeMove } from '../assault/charge-move-handler';
import {
  checkOverwatchTrigger,
} from '../assault/overwatch-handler';
import {
  declareChallenge,
  acceptChallenge,
  declineChallenge,
} from '../assault/challenge-handler';
import { selectGambit } from '../assault/gambit-handler';
import { determineCombats } from '../assault/fight-handler';
import { resolveInitiativeStep } from '../assault/initiative-step-handler';
import { resolveFinalPileIn } from '../assault/pile-in-handler';
import { resolveCombatResolution } from '../assault/resolution-handler';
import {
  getAvailableAftermathOptions,
  resolveAftermathOption,
} from '../assault/aftermath-handler';

// ─── Charge Sub-Phase ──────────────────────────────────────────────────────

export interface ChargeExecutionOptions {
  /** Skip advanced reaction windows when resuming a paused charge flow. */
  skipAdvancedReactionChecks?: boolean;
}

function offerChargeAdvancedReaction(
  state: GameState,
  existingEvents: GameEvent[],
  reactionId: string,
  eligibleUnitIds: string[],
  chargingUnitId: string,
  targetUnitId: string,
  chargeStep: AssaultChargeStep,
  setupMoveDistance: number,
  isDisordered: boolean,
  closestDistance: number,
  modelsWithLOS: string[],
): CommandResult {
  const playerIndex = eligibleUnitIds.length > 0
    ? findUnitPlayerIndex(state, eligibleUnitIds[0]) ?? -1
    : -1;

  const reactionState = setAwaitingReaction(state, true, {
    reactionType: reactionId,
    isAdvancedReaction: true,
    eligibleUnitIds,
    triggerDescription: `Charge advanced reaction "${reactionId}" triggered by charger "${chargingUnitId}"`,
    triggerSourceUnitId: chargingUnitId,
  });

  return {
    state: {
      ...reactionState,
      assaultAttackState: {
        chargingUnitId,
        targetUnitId,
        chargerPlayerIndex: state.activePlayerIndex,
        chargeStep,
        setupMoveDistance,
        chargeRoll: 0,
        isDisordered,
        chargeCompleteViaSetup: false,
        overwatchResolved: false,
        closestDistance,
        modelsWithLOS,
      },
    },
    events: [
      ...existingEvents,
      {
        type: 'advancedReactionDeclared',
        reactionId,
        reactionName: reactionId,
        reactingUnitId: '',
        triggerSourceUnitId: chargingUnitId,
        playerIndex,
      } as GameEvent,
    ],
    errors: [],
    accepted: true,
  };
}

/**
 * Process a declareCharge command.
 * Orchestrates the full charge sequence: validate → setup move → volley → charge roll/move.
 *
 * @param state - Current game state
 * @param command - The declare charge command
 * @param dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleCharge(
  state: GameState,
  command: DeclareChargeCommand,
  dice: DiceProvider,
  options: ChargeExecutionOptions = {},
): CommandResult {
  const events: GameEvent[] = [];
  const { chargingUnitId, targetUnitId } = command;

  // Step 1: Validate charge eligibility
  const eligibility = validateChargeEligibility(state, chargingUnitId);
  if (!eligibility.valid) {
    const firstError = eligibility.errors[0];
    return reject(
      state,
      firstError?.code ?? 'CHARGE_INVALID',
      firstError?.message ?? 'Charge is not valid',
    );
  }

  // Step 2: Validate charge target
  const targetValidation = validateChargeTarget(state, chargingUnitId, targetUnitId);
  if (!targetValidation.valid) {
    const firstError = targetValidation.errors[0];
    return reject(
      state,
      firstError?.code ?? 'CHARGE_TARGET_INVALID',
      firstError?.message ?? 'Invalid charge target',
    );
  }

  // Look up the charging unit for disordered check
  const chargingUnit = findUnit(state, chargingUnitId);
  if (!chargingUnit) {
    return reject(state, 'CHARGER_NOT_FOUND', `Charging unit '${chargingUnitId}' not found`);
  }

  const disordered = isDisorderedCharge(chargingUnit);

  if (options.skipAdvancedReactionChecks !== true) {
    const step2Trigger = checkAssaultAdvancedReactionTriggers(
      state,
      'duringChargeStep',
      chargingUnitId,
      targetUnitId,
      2,
    );
    if (step2Trigger) {
      return offerChargeAdvancedReaction(
        state,
        events,
        step2Trigger.reactionId,
        step2Trigger.eligibleUnitIds,
        chargingUnitId,
        targetUnitId,
        'DECLARING',
        0,
        disordered,
        targetValidation.closestDistance,
        targetValidation.modelsWithLOS,
      );
    }

    const step3Trigger = checkAssaultAdvancedReactionTriggers(
      state,
      'duringChargeStep',
      chargingUnitId,
      targetUnitId,
      3,
    );
    if (step3Trigger) {
      return offerChargeAdvancedReaction(
        state,
        events,
        step3Trigger.reactionId,
        step3Trigger.eligibleUnitIds,
        chargingUnitId,
        targetUnitId,
        'DECLARING',
        0,
        disordered,
        targetValidation.closestDistance,
        targetValidation.modelsWithLOS,
      );
    }
  }

  events.push({
    type: 'chargeDeclared',
    chargingUnitId,
    targetUnitId,
    isDisordered: disordered,
  } as GameEvent);

  let newState = state;

  // Step 3: Setup Move (skip if disordered)
  const setupResult = resolveSetupMove(
    newState,
    chargingUnitId,
    targetUnitId,
    disordered,
  );
  newState = setupResult.state;
  events.push(...setupResult.events);

  // If setup move achieved base contact, charge succeeds immediately
  if (setupResult.chargeCompleteViaSetup) {
    return {
      state: newState,
      events,
      errors: [],
      accepted: true,
    };
  }

  if (options.skipAdvancedReactionChecks !== true) {
    const step4Trigger = checkAssaultAdvancedReactionTriggers(
      newState,
      'duringChargeStep',
      chargingUnitId,
      targetUnitId,
      4,
    );
    if (step4Trigger) {
      return offerChargeAdvancedReaction(
        newState,
        events,
        step4Trigger.reactionId,
        step4Trigger.eligibleUnitIds,
        chargingUnitId,
        targetUnitId,
        'VOLLEY_ATTACKS',
        setupResult.setupMoveDistance,
        disordered,
        targetValidation.closestDistance,
        targetValidation.modelsWithLOS,
      );
    }
  }

  // Step 4: Check Overwatch trigger
  const overwatchCheck = checkOverwatchTrigger(newState, chargingUnitId, targetUnitId);
  if (overwatchCheck.canOverwatch) {
    // Offer Overwatch reaction to reactive player
    const reactionState = setAwaitingReaction(newState, true, {
      reactionType: CoreReaction.Overwatch,
      isAdvancedReaction: false,
      eligibleUnitIds: overwatchCheck.eligibleUnitIds,
      triggerDescription: `Unit "${chargingUnitId}" is charging. Overwatch available.`,
      triggerSourceUnitId: chargingUnitId,
    });

    events.push(...overwatchCheck.events);

    // Store charge state so it can resume after overwatch resolution
    return {
      state: {
        ...reactionState,
        assaultAttackState: {
          chargingUnitId,
          targetUnitId,
          chargerPlayerIndex: state.activePlayerIndex,
          chargeStep: 'AWAITING_OVERWATCH' as const,
          setupMoveDistance: setupResult.setupMoveDistance,
          chargeRoll: 0,
          isDisordered: disordered,
          chargeCompleteViaSetup: false,
          overwatchResolved: false,
          closestDistance: targetValidation.closestDistance,
          modelsWithLOS: targetValidation.modelsWithLOS,
        },
      },
      events,
      errors: [],
      accepted: true,
    };
  }

  // Step 4b: Volley attacks
  const volleyResult = resolveVolleyAttacks(
    newState,
    chargingUnitId,
    targetUnitId,
    disordered,
    dice,
  );
  newState = volleyResult.state;
  events.push(...volleyResult.events);

  // Check if either unit was wiped out by volley
  if (volleyResult.chargerWipedOut) {
    return { state: newState, events, errors: [], accepted: true };
  }
  if (volleyResult.targetWipedOut) {
    return { state: newState, events, errors: [], accepted: true };
  }

  if (options.skipAdvancedReactionChecks !== true) {
    const afterVolleyTrigger = checkAssaultAdvancedReactionTriggers(
      newState,
      'afterVolleyAttacks',
      chargingUnitId,
      targetUnitId,
    );
    if (afterVolleyTrigger) {
      return offerChargeAdvancedReaction(
        newState,
        events,
        afterVolleyTrigger.reactionId,
        afterVolleyTrigger.eligibleUnitIds,
        chargingUnitId,
        targetUnitId,
        'CHARGE_ROLL',
        setupResult.setupMoveDistance,
        disordered,
        targetValidation.closestDistance,
        targetValidation.modelsWithLOS,
      );
    }
  }

  // Step 5: Charge Roll & Move
  const closestDist = targetValidation.closestDistance;
  const chargeResult = resolveChargeMove(
    newState,
    chargingUnitId,
    targetUnitId,
    dice,
    closestDist,
  );
  newState = chargeResult.state;
  events.push(...chargeResult.events);

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── Challenge Sub-Phase ───────────────────────────────────────────────────

/**
 * Process a declareChallenge command.
 *
 * @param state - Current game state
 * @param command - The declare challenge command
 * @param _dice - Dice provider (unused for declaration)
 * @returns CommandResult with updated state
 */
export function handleDeclareChallenge(
  state: GameState,
  command: DeclareChallengeCommand,
  _dice: DiceProvider,
): CommandResult {
  const result = declareChallenge(state, command.challengerModelId, command.targetModelId);
  if (!result.valid) {
    return reject(state, 'CHALLENGE_INVALID', result.error || 'Challenge is not valid');
  }

  return {
    state: result.state,
    events: result.events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process an acceptChallenge command.
 *
 * The challenger model info is retrieved from the game state's assault context.
 * The challenge handler validates the acceptance and sets up the challenge combat.
 *
 * @param state - Current game state
 * @param command - The accept challenge command
 * @param _dice - Dice provider (unused for acceptance)
 * @returns CommandResult with updated state
 */
export function handleAcceptChallenge(
  state: GameState,
  command: AcceptChallengeCommand,
  _dice: DiceProvider,
): CommandResult {
  // The active challenge context should be stored in the assault attack state
  // or in the active combat's challenge state.
  // The challengerModelId comes from the pending challenge context.
  // For now, look up from activeCombats to find a pending challenge.
  let challengerModelId: string | undefined;

  if (state.activeCombats) {
    for (const combat of state.activeCombats) {
      // AssaultCombatState from @hh/types is a simplified version;
      // the challenge context is tracked via the engine's internal CombatState.
      // For the orchestrator, we retrieve the challenger from the assault state.
      if ((combat as unknown as { challengeState?: { challengerId: string } }).challengeState) {
        challengerModelId = (combat as unknown as { challengeState: { challengerId: string } }).challengeState.challengerId;
        break;
      }
    }
  }

  // Fallback: if assault attack state has charge context, use that
  if (!challengerModelId && state.assaultAttackState) {
    // The assault attack state stores the charging unit context.
    // In the challenge flow, the challengerModelId would have been
    // set during the declareChallenge step. Use the chargingUnitId as a fallback.
    challengerModelId = state.assaultAttackState.chargingUnitId;
  }

  if (!challengerModelId) {
    return reject(state, 'NO_CHALLENGE_PENDING', 'No challenge is currently pending.');
  }

  const result = acceptChallenge(
    state,
    command.challengedModelId,
    challengerModelId,
  );

  if (!result.accepted) {
    return reject(state, 'ACCEPT_CHALLENGE_INVALID', 'Cannot accept challenge');
  }

  return {
    state: result.state,
    events: result.events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process a declineChallenge command.
 *
 * Finds the active challenge context and declines it, applying Disgraced
 * to an eligible model in the declining unit.
 *
 * @param state - Current game state
 * @param _command - The decline challenge command
 * @param _dice - Dice provider (unused for declining)
 * @returns CommandResult with updated state
 */
export function handleDeclineChallenge(
  state: GameState,
  _command: DeclineChallengeCommand,
  _dice: DiceProvider,
): CommandResult {
  // Find the active challenge context
  let challengerModelId: string | undefined;
  let targetUnitId: string | undefined;

  if (state.activeCombats) {
    for (const combat of state.activeCombats) {
      const combatWithChallenge = combat as unknown as {
        challengeState?: { challengerId: string; challengedUnitId: string };
      };
      if (combatWithChallenge.challengeState) {
        challengerModelId = combatWithChallenge.challengeState.challengerId;
        targetUnitId = combatWithChallenge.challengeState.challengedUnitId;
        break;
      }
    }
  }

  // Fallback: derive from assault attack state
  if (!challengerModelId && state.assaultAttackState) {
    challengerModelId = state.assaultAttackState.chargingUnitId;
    targetUnitId = state.assaultAttackState.targetUnitId;
  }

  if (!challengerModelId || !targetUnitId) {
    return reject(state, 'NO_CHALLENGE_PENDING', 'No challenge is currently pending.');
  }

  const result = declineChallenge(
    state,
    challengerModelId,
    targetUnitId,
  );

  return {
    state: result.state,
    events: result.events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process a selectGambit command.
 *
 * Finds the active challenge state within the current combat and records
 * the gambit selection for the specified model.
 *
 * @param state - Current game state
 * @param command - The select gambit command
 * @param _dice - Dice provider (unused for gambit selection)
 * @returns CommandResult with updated state
 */
export function handleSelectGambit(
  state: GameState,
  command: SelectGambitCommand,
  _dice: DiceProvider,
): CommandResult {
  // Find the active combat with a challenge state
  if (!state.activeCombats || state.activeCombats.length === 0) {
    return reject(state, 'NO_ACTIVE_COMBAT', 'No active combat for gambit selection');
  }

  // Look through active combats for one with a challenge state
  // The challenge state is tracked internally via CombatState.challengeState
  // We need to find the combat and its challenge state to pass to selectGambit
  for (let i = 0; i < state.activeCombats.length; i++) {
    const combat = state.activeCombats[i];
    const combatWithChallenge = combat as unknown as {
      challengeState?: import('../assault/assault-types').ChallengeState;
    };

    if (combatWithChallenge.challengeState) {
      const gambitResult = selectGambit(
        command.modelId,
        command.gambit,
        combatWithChallenge.challengeState,
      );

      // Update the combat's challenge state with the gambit selection
      const updatedCombats = [...state.activeCombats];
      updatedCombats[i] = {
        ...combat,
        ...({ challengeState: gambitResult.challengeState } as Record<string, unknown>),
      } as typeof combat;

      return {
        state: {
          ...state,
          activeCombats: updatedCombats,
        },
        events: gambitResult.events,
        errors: [],
        accepted: true,
      };
    }
  }

  return reject(state, 'GAMBIT_INVALID', 'No active challenge found for gambit selection');
}

// ─── Fight Sub-Phase ───────────────────────────────────────────────────────

/**
 * Process a resolveFight command.
 * Determines combats and resolves all initiative steps for the specified combat.
 *
 * @param state - Current game state
 * @param command - The resolve fight command (specifies combatId)
 * @param dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleFight(
  state: GameState,
  command: ResolveFightCommand,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];

  // Determine all combats
  const combatsResult = determineCombats(state);
  let newState = state;

  // Find the requested combat
  const combat = combatsResult.combats.find(c => c.combatId === command.combatId);
  if (!combat) {
    return reject(state, 'COMBAT_NOT_FOUND', `Combat "${command.combatId}" not found`);
  }

  events.push(...combatsResult.events);

  // Resolve each initiative step sequentially
  // The initiative-step-handler returns updated combatState and gameState
  let currentCombat = combat;

  for (let i = 0; i < currentCombat.initiativeSteps.length; i++) {
    // Get the majority toughness of the target unit for this step
    // For simplicity, use the default toughness (4) and save (3+) —
    // in a full implementation these would come from the actual model profiles
    // and would be calculated per-strike-group.
    const stepResult = resolveInitiativeStep(
      newState,
      currentCombat,
      i,
      dice,
      4, // default majority toughness
      3, // default armour save (3+)
    );
    newState = stepResult.state;
    currentCombat = stepResult.combatState;
    events.push(...stepResult.events);
  }

  // Final pile-in after all initiative steps
  const pileInResult = resolveFinalPileIn(newState, currentCombat);
  newState = pileInResult.state;
  events.push(...pileInResult.events);

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── Resolution Sub-Phase ──────────────────────────────────────────────────

/**
 * Process the resolution sub-phase for a combat.
 * Runs the full resolution pipeline: return challenge participants → CRP → winner → panic.
 *
 * @param state - Current game state
 * @param dice - Dice provider
 * @param combatId - Optional combat ID to resolve (defaults to first active combat)
 * @returns CommandResult with updated state
 */
export function handleResolution(
  state: GameState,
  dice: DiceProvider,
  combatId?: string,
): CommandResult {
  const events: GameEvent[] = [];

  // Determine combats to find the one being resolved
  const combatsResult = determineCombats(state);
  const combat = combatId
    ? combatsResult.combats.find(c => c.combatId === combatId)
    : combatsResult.combats[0]; // Default to first combat

  if (!combat) {
    return reject(state, 'NO_COMBAT', 'No active combat to resolve');
  }

  // Run the full resolution pipeline
  const resolutionResult = resolveCombatResolution(state, combat, dice);
  const newState = resolutionResult.state;
  events.push(...resolutionResult.events);

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process a selectAftermath command.
 * Validates the aftermath option is available for the specified unit and resolves it.
 *
 * @param state - Current game state
 * @param command - The select aftermath command
 * @param dice - Dice provider
 * @returns CommandResult with updated state
 */
export function handleSelectAftermath(
  state: GameState,
  command: SelectAftermathCommand,
  dice: DiceProvider,
): CommandResult {
  const { unitId, option } = command;

  // Find the unit
  const unit = findUnit(state, unitId);
  if (!unit) {
    return reject(state, 'UNIT_NOT_FOUND', `Unit "${unitId}" not found`);
  }

  // Find the combat this unit is in
  const combatsResult = determineCombats(state);
  const combat = combatsResult.combats.find(
    c => c.activePlayerUnitIds.includes(unitId) || c.reactivePlayerUnitIds.includes(unitId),
  );

  if (!combat) {
    return reject(state, 'NO_COMBAT', 'No active combat for aftermath selection');
  }

  // Determine if this unit is winner/loser/draw based on CRP stored in the combat
  const isActiveUnit = combat.activePlayerUnitIds.includes(unitId);
  const isWinner = (isActiveUnit && combat.activePlayerCRP > combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP > combat.activePlayerCRP);
  const isLoser = (isActiveUnit && combat.activePlayerCRP < combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP < combat.activePlayerCRP);
  const isDraw = combat.activePlayerCRP === combat.reactivePlayerCRP;

  // Check if all enemy units are fleeing (Routed status)
  const enemyUnitIds = isActiveUnit
    ? combat.reactivePlayerUnitIds
    : combat.activePlayerUnitIds;

  let allEnemyFleeing = true;
  for (const enemyId of enemyUnitIds) {
    const enemyUnit = findUnit(state, enemyId);
    if (enemyUnit) {
      const aliveEnemyModels = getAliveModels(enemyUnit);
      if (aliveEnemyModels.length > 0 && !enemyUnit.statuses.includes(TacticalStatus.Routed)) {
        allEnemyFleeing = false;
        break;
      }
    }
  }

  // Validate the option is available
  const available = getAvailableAftermathOptions(
    state,
    unitId,
    isWinner,
    isLoser,
    isDraw,
    allEnemyFleeing,
  );
  const selectedOption = option as AftermathOption;

  if (!available.includes(selectedOption)) {
    return reject(state, 'AFTERMATH_INVALID', `Option "${option}" is not available for this unit`);
  }

  // Resolve the aftermath option
  const result = resolveAftermathOption(state, unitId, selectedOption, combat, dice);

  return {
    state: result.state,
    events: result.events,
    errors: [],
    accepted: true,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Create a rejected CommandResult with an error.
 *
 * @param state - The unchanged game state
 * @param code - Error code for programmatic handling
 * @param message - Human-readable error message
 * @returns CommandResult with accepted=false and the error
 */
function reject(state: GameState, code: string, message: string): CommandResult {
  return {
    state,
    events: [],
    errors: [{ code, message }],
    accepted: false,
  };
}
