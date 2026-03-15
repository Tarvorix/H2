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
import { AftermathOption, CoreReaction, ModelSubType, ModelType, TacticalStatus } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import {
  canUnitReact,
  findModel,
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
  getClosestModelDistance,
  hasReactionAllotment,
} from '../game-queries';
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
import { resolveFocusRoll, selectGambit } from '../assault/gambit-handler';
import { resolveInitiativeStep } from '../assault/initiative-step-handler';
import { resolveFinalPileIn } from '../assault/pile-in-handler';
import { resolveCombatResolution } from '../assault/resolution-handler';
import { resolveChallengeGlory, resolveChallengeStrike } from '../assault/challenge-strike-handler';
import {
  getAvailableAftermathOptions,
  resolveAftermathOption,
} from '../assault/aftermath-handler';
import {
  resolveDeclaredChargePsychicPower,
  unitCanDeclarePsychicReaction,
} from '../psychic/power-handler';
import {
  getCurrentModelWillpower,
  getModelPsychicGambit,
} from '../psychic/psychic-runtime';
import { awardVanguardBonusForCombatObjectiveUnits } from '../missions/vanguard-bonus';
import {
  prepareCombatForFight,
  syncActiveCombats,
} from '../assault/combat-state';
import {
  getModelAttacks,
  getModelInitiative,
  getModelSave,
  getModelStrength,
  getModelToughness,
  getModelType,
  getModelWS,
  modelHasSubType,
} from '../profile-lookup';

// ─── Charge Sub-Phase ──────────────────────────────────────────────────────

export interface ChargeExecutionOptions {
  /** Skip advanced reaction windows when resuming a paused charge flow. */
  skipAdvancedReactionChecks?: boolean;
}

function resolveEveryStrikeForeseenCheck(
  state: GameState,
  modelId: string,
  dice: DiceProvider,
): { passed: boolean } {
  const modelInfo = findModel(state, modelId);
  if (!modelInfo) {
    return { passed: false };
  }

  const targetNumber = getCurrentModelWillpower(state, modelInfo.unit, modelInfo.model);
  if (targetNumber <= 0) {
    return { passed: false };
  }

  const [dieOne, dieTwo] = dice.roll2D6();
  return {
    passed: dieOne + dieTwo <= targetNumber,
  };
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
  declaredPsychicPower: DeclareChargeCommand['psychicPower'],
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
        declaredPsychicPower,
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

function getCurrentChargeDistance(
  state: GameState,
  chargingUnitId: string,
  targetUnitId: string,
): number {
  return getClosestModelDistance(state, chargingUnitId, targetUnitId);
}

function unitQualifiesForEvade(
  unit: NonNullable<GameState['armies']>[number]['units'][number],
): boolean {
  const aliveModels = getAliveModels(unit);
  return (
    aliveModels.length > 0 &&
    aliveModels.every((model) =>
      modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Light) ||
      getModelType(model.unitProfileId, model.profileModelName) === ModelType.Cavalry,
    )
  );
}

function maybeOfferEvadeReaction(
  state: GameState,
  existingEvents: GameEvent[],
  chargingUnitId: string,
  targetUnitId: string,
  setupMoveDistance: number,
  isDisordered: boolean,
  modelsWithLOS: string[],
  declaredPsychicPower: DeclareChargeCommand['psychicPower'],
): CommandResult | null {
  const targetUnit = findUnit(state, targetUnitId);
  const targetPlayerIndex = findUnitPlayerIndex(state, targetUnitId);
  if (!targetUnit || targetPlayerIndex === undefined) {
    return null;
  }
  if (!unitQualifiesForEvade(targetUnit)) {
    return null;
  }
  if (!canUnitReact(targetUnit)) {
    return null;
  }
  if (!hasReactionAllotment(state.armies[targetPlayerIndex])) {
    return null;
  }

  return offerChargeAdvancedReaction(
    state,
    existingEvents,
    'evade',
    [targetUnitId],
    chargingUnitId,
    targetUnitId,
    'CHARGE_ROLL',
    setupMoveDistance,
    isDisordered,
    getCurrentChargeDistance(state, chargingUnitId, targetUnitId),
    modelsWithLOS,
    declaredPsychicPower,
  );
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
        command.psychicPower,
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
        command.psychicPower,
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

  const declaredPsychicResult = resolveDeclaredChargePsychicPower(
    newState,
    chargingUnitId,
    command.psychicPower,
    dice,
  );
  if (!declaredPsychicResult.accepted) {
    return declaredPsychicResult;
  }
  newState = declaredPsychicResult.state;
  events.push(...declaredPsychicResult.events);
  const currentChargeDistance = getCurrentChargeDistance(newState, chargingUnitId, targetUnitId);

  // If setup move achieved base contact, charge succeeds immediately
  if (setupResult.chargeCompleteViaSetup) {
    return {
      state: newState,
      events,
      errors: [],
      accepted: true,
    };
  }

  if (unitCanDeclarePsychicReaction(newState, chargingUnitId, 'force-barrier')) {
    const reactionState = setAwaitingReaction(newState, true, {
      reactionType: 'force-barrier',
      isAdvancedReaction: false,
      eligibleUnitIds: [chargingUnitId],
      triggerDescription: `Unit "${chargingUnitId}" may manifest Force Barrier before charge volleys are resolved.`,
      triggerSourceUnitId: targetUnitId,
    });

    return {
      state: {
        ...reactionState,
        assaultAttackState: {
          chargingUnitId,
          targetUnitId,
          chargerPlayerIndex: state.activePlayerIndex,
          chargeStep: 'VOLLEY_ATTACKS' as const,
          setupMoveDistance: setupResult.setupMoveDistance,
          chargeRoll: 0,
          isDisordered: disordered,
          chargeCompleteViaSetup: false,
          overwatchResolved: false,
          closestDistance: currentChargeDistance,
          modelsWithLOS: targetValidation.modelsWithLOS,
          declaredPsychicPower: command.psychicPower,
        },
      },
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
        currentChargeDistance,
        targetValidation.modelsWithLOS,
        command.psychicPower,
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
          closestDistance: currentChargeDistance,
          modelsWithLOS: targetValidation.modelsWithLOS,
          declaredPsychicPower: command.psychicPower,
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
    const evadeReaction = maybeOfferEvadeReaction(
      newState,
      events,
      chargingUnitId,
      targetUnitId,
      setupResult.setupMoveDistance,
      disordered,
      targetValidation.modelsWithLOS,
      command.psychicPower,
    );
    if (evadeReaction) {
      return evadeReaction;
    }
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
        getCurrentChargeDistance(newState, chargingUnitId, targetUnitId),
        targetValidation.modelsWithLOS,
        command.psychicPower,
      );
    }
  }

  // Step 5: Charge Roll & Move
  const chargeResult = resolveChargeMove(
    newState,
    chargingUnitId,
    targetUnitId,
    dice,
    getCurrentChargeDistance(newState, chargingUnitId, targetUnitId),
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
  const challengeState = state.activeCombats && state.activeCombats.length > 0 ? state : syncActiveCombats(state).state;
  const result = declareChallenge(challengeState, command.challengerModelId, command.targetModelId);
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
  const challengeState = state.activeCombats && state.activeCombats.length > 0 ? state : syncActiveCombats(state).state;
  const challengerModelId = ((challengeState.activeCombats ?? []) as import('../assault/assault-types').CombatState[])
    .find((combat) => combat.challengeState?.currentStep === 'DECLARE')
    ?.challengeState?.challengerId;

  if (!challengerModelId) {
    return reject(state, 'NO_CHALLENGE_PENDING', 'No challenge is currently pending.');
  }

  const result = acceptChallenge(
    challengeState,
    command.challengedModelId,
    challengerModelId,
  );

  if (!result.valid || !result.accepted) {
    return reject(
      state,
      'ACCEPT_CHALLENGE_INVALID',
      result.error || 'Cannot accept challenge',
    );
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
  const challengeState = state.activeCombats && state.activeCombats.length > 0 ? state : syncActiveCombats(state).state;
  const pendingChallenge = ((challengeState.activeCombats ?? []) as import('../assault/assault-types').CombatState[])
    .find((combat) => combat.challengeState?.currentStep === 'DECLARE')
    ?.challengeState;
  const challengerModelId = pendingChallenge?.challengerId;
  const targetUnitId = pendingChallenge?.challengedUnitId;

  if (!challengerModelId || !targetUnitId) {
    return reject(state, 'NO_CHALLENGE_PENDING', 'No challenge is currently pending.');
  }

  const result = declineChallenge(
    challengeState,
    challengerModelId,
    targetUnitId,
  );

  if (!result.valid) {
    return reject(
      state,
      'DECLINE_CHALLENGE_INVALID',
      result.error || 'Cannot decline challenge',
    );
  }

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
  dice: DiceProvider,
): CommandResult {
  const challengeState = state.activeCombats && state.activeCombats.length > 0 ? state : syncActiveCombats(state).state;
  const activeCombats = challengeState.activeCombats;
  if (!activeCombats || activeCombats.length === 0) {
    return reject(state, 'NO_ACTIVE_COMBAT', 'No active combat for gambit selection');
  }

  for (let i = 0; i < activeCombats.length; i++) {
    const combat = activeCombats[i];
    const combatWithChallenge = combat as unknown as {
      challengeState?: import('../assault/assault-types').ChallengeState;
    };

    if (combatWithChallenge.challengeState) {
      const selectedModel = findModel(challengeState, command.modelId);
      if (
        command.gambit === 'every-strike-foreseen' &&
        (!selectedModel || !getModelPsychicGambit(selectedModel.model, 'every-strike-foreseen'))
      ) {
        return reject(state, 'GAMBIT_INVALID', 'This model cannot use Every Strike Foreseen.');
      }

      const gambitResult = selectGambit(
        command.modelId,
        command.gambit,
        combatWithChallenge.challengeState,
      );
      let updatedChallenge = gambitResult.challengeState;
      let updatedState = challengeState;
      const events = [...gambitResult.events];

      if (updatedChallenge.challengerGambit && updatedChallenge.challengedGambit) {
        const challengerInfo = findModel(updatedState, updatedChallenge.challengerId);
        const challengedInfo = findModel(updatedState, updatedChallenge.challengedId);
        if (!challengerInfo || !challengedInfo) {
          return reject(state, 'CHALLENGE_INVALID', 'Challenge participants could not be resolved.');
        }

        const focusResult = resolveFocusRoll(
          updatedChallenge,
          dice,
          getModelInitiative(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
          getModelInitiative(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
          updatedChallenge.challengerPlayerIndex,
          updatedChallenge.challengedPlayerIndex,
        );
        updatedChallenge = focusResult.challengeState;
        events.push(...focusResult.events);

        if (!focusResult.needsReroll) {
          const strikeOverrides: {
            challengerHitTargetOverride?: number;
            challengedHitTargetOverride?: number;
          } = {};
          if (
            updatedChallenge.challengerGambit === 'every-strike-foreseen' &&
            getModelPsychicGambit(challengerInfo.model, 'every-strike-foreseen')
          ) {
            if (resolveEveryStrikeForeseenCheck(updatedState, challengerInfo.model.id, dice).passed) {
              strikeOverrides.challengerHitTargetOverride = 2;
            }
          }
          if (
            updatedChallenge.challengedGambit === 'every-strike-foreseen' &&
            getModelPsychicGambit(challengedInfo.model, 'every-strike-foreseen')
          ) {
            if (resolveEveryStrikeForeseenCheck(updatedState, challengedInfo.model.id, dice).passed) {
              strikeOverrides.challengedHitTargetOverride = 2;
            }
          }

          const strikeResult = resolveChallengeStrike(
            updatedState,
            updatedChallenge,
            dice,
            getModelWS(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
            getModelWS(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
            getModelStrength(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
            getModelStrength(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
            getModelAttacks(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
            getModelAttacks(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
            getModelToughness(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
            getModelToughness(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
            getModelSave(challengerInfo.model.unitProfileId, challengerInfo.model.profileModelName),
            getModelSave(challengedInfo.model.unitProfileId, challengedInfo.model.profileModelName),
            undefined,
            undefined,
            strikeOverrides,
          );
          updatedState = strikeResult.state;
          updatedChallenge = strikeResult.challengeState;
          events.push(...strikeResult.events);

          const gloryResult = resolveChallengeGlory(updatedChallenge);
          updatedChallenge = gloryResult.challengeState;
          events.push(...gloryResult.events);
        }
      }

      const updatedCombats = [...(updatedState.activeCombats ?? [])];
      updatedCombats[i] = {
        ...combat,
        ...({ challengeState: updatedChallenge } as Record<string, unknown>),
      } as typeof combat;

      return {
        state: {
          ...updatedState,
          activeCombats: updatedCombats,
        },
        events,
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
  const synced = syncActiveCombats(state);
  const activeCombats = synced.state.activeCombats as import('../assault/assault-types').CombatState[] | undefined;
  if (!activeCombats || activeCombats.length === 0) {
    return reject(state, 'COMBAT_NOT_FOUND', `Combat "${command.combatId}" not found`);
  }

  const combatIndex = activeCombats.findIndex((combat) => combat.combatId === command.combatId);
  if (combatIndex < 0) {
    return reject(state, 'COMBAT_NOT_FOUND', `Combat "${command.combatId}" not found`);
  }
  let currentCombat = prepareCombatForFight(synced.state, activeCombats[combatIndex]);
  let newState: GameState = {
    ...synced.state,
    activeCombats: activeCombats.map((combat, index) => (
      index === combatIndex ? currentCombat : combat
    )),
  };

  for (let i = 0; i < currentCombat.initiativeSteps.length; i++) {
    const stepResult = resolveInitiativeStep(
      newState,
      currentCombat,
      i,
      dice,
      0,
      null,
    );
    currentCombat = stepResult.combatState;
    newState = {
      ...stepResult.state,
      activeCombats: (stepResult.state.activeCombats as import('../assault/assault-types').CombatState[]).map((combat, index) => (
        index === combatIndex ? currentCombat : combat
      )),
    };
    events.push(...stepResult.events);
  }

  // Final pile-in after all initiative steps
  const pileInResult = resolveFinalPileIn(newState, currentCombat);
  newState = pileInResult.state;
  events.push(...pileInResult.events);
  currentCombat = {
    ...currentCombat,
    resolved: true,
  };
  newState = {
    ...newState,
    activeCombats: ((newState.activeCombats ?? []) as import('../assault/assault-types').CombatState[]).map((combat, index) => (
      index === combatIndex ? currentCombat : combat
    )),
  };

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
  const synced = syncActiveCombats(state);
  const activeCombats = synced.state.activeCombats as import('../assault/assault-types').CombatState[] | undefined;
  const combat = combatId
    ? activeCombats?.find((candidate) => candidate.combatId === combatId)
    : activeCombats?.[0];

  if (!combat) {
    return reject(state, 'NO_COMBAT', 'No active combat to resolve');
  }

  // Run the full resolution pipeline
  const resolutionResult = resolveCombatResolution(synced.state, combat, dice);
  const updatedCombat: import('../assault/assault-types').CombatState = {
    ...combat,
    activePlayerCRP: resolutionResult.crpResult.activePlayerCRP,
    reactivePlayerCRP: resolutionResult.crpResult.reactivePlayerCRP,
    isMassacre: resolutionResult.isMassacre,
    massacreWinnerPlayerIndex: resolutionResult.winnerResult.winnerPlayerIndex,
    aftermathResolvedUnitIds: combat.aftermathResolvedUnitIds ?? [],
  };
  const newState = {
    ...resolutionResult.state,
    activeCombats: (resolutionResult.state.activeCombats as import('../assault/assault-types').CombatState[]).map((candidate) => (
      candidate.combatId === combat.combatId ? updatedCombat : candidate
    )),
  };
  let finalState: GameState = newState;
  events.push(...resolutionResult.events);

  if (resolutionResult.isMassacre) {
    const loserUnitIds = resolutionResult.winnerResult.loserPlayerIndex === 0
      ? combat.activePlayerUnitIds
      : resolutionResult.winnerResult.loserPlayerIndex === 1
        ? combat.reactivePlayerUnitIds
        : [];
    const vanguardBonusResult = awardVanguardBonusForCombatObjectiveUnits(
      finalState,
      updatedCombat,
      loserUnitIds,
      resolutionResult.winnerResult.winnerPlayerIndex,
      'assault-massacre',
    );
    finalState = vanguardBonusResult.state;
    events.push(...vanguardBonusResult.events);
  }

  return {
    state: finalState,
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

  const activeCombats = (state.activeCombats ?? []) as import('../assault/assault-types').CombatState[];
  const combat = activeCombats.find(
    c => c.activePlayerUnitIds.includes(unitId) || c.reactivePlayerUnitIds.includes(unitId),
  );

  if (!combat) {
    return reject(state, 'NO_COMBAT', 'No active combat for aftermath selection');
  }

  const isActiveUnit = combat.activePlayerUnitIds.includes(unitId);
  const isWinner = (isActiveUnit && combat.activePlayerCRP > combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP > combat.activePlayerCRP);
  const isLoser = (isActiveUnit && combat.activePlayerCRP < combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP < combat.activePlayerCRP);
  const isDraw = combat.activePlayerCRP === combat.reactivePlayerCRP;
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
  const updatedCombats = activeCombats.map((candidate) => {
    if (candidate.combatId !== combat.combatId) {
      return candidate;
    }

    const resolvedUnitIds = new Set(candidate.aftermathResolvedUnitIds ?? []);
    resolvedUnitIds.add(unitId);
    return {
      ...candidate,
      aftermathResolvedUnitIds: [...resolvedUnitIds],
    };
  });

  let finalState: GameState = {
    ...result.state,
    activeCombats: updatedCombats,
  };
  const finalEvents = [...result.events];

  if (selectedOption === AftermathOption.FallBack) {
    const unitPlayerIndex = findUnitPlayerIndex(state, unitId);
    const opposingPlayerIndex = unitPlayerIndex === null ? null : (unitPlayerIndex === 0 ? 1 : 0);
    const vanguardBonusResult = awardVanguardBonusForCombatObjectiveUnits(
      finalState,
      combat,
      [unitId],
      opposingPlayerIndex,
      'assault-fallback',
    );
    finalState = vanguardBonusResult.state;
    finalEvents.push(...vanguardBonusResult.events);
  }

  return {
    state: finalState,
    events: finalEvents,
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
