/**
 * Command Processor
 * Top-level command router: validate → execute → emit events.
 *
 * Reference: HH_Rules_Battle.md — Turn Sequence, Movement Phase
 *
 * The command processor accepts a GameState and a GameCommand, validates the
 * command against the current game state (phase, sub-phase, active player),
 * routes it to the appropriate handler, and returns a CommandResult.
 *
 * Flow: UI sends GameCommand → processCommand(state, command, dice) → CommandResult
 *
 * During reactions (awaitingReaction = true), only SelectReactionCommand and
 * DeclineReactionCommand are accepted.
 */

import type { GameState, GameCommand, Position, DeclareShootingCommand, DeclareChargeCommand, DeclareChallengeCommand, SelectGambitCommand, AcceptChallengeCommand, DeclineChallengeCommand, SelectAftermathCommand, ResolveFightCommand, SelectTargetModelCommand, PlaceBlastMarkerCommand, PlaceTerrainCommand, RemoveTerrainCommand, SelectWargearOptionCommand, DeclareWeaponsCommand } from '@hh/types';
import { Phase, SubPhase, CoreReaction } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from './types';
import {
  advanceSubPhase,
  advancePhase,
} from './state-machine';
import {
  setAwaitingReaction,
  clearAssaultAttackState,
  clearShootingAttackState,
  setAssaultAttackState,
} from './state-helpers';
import {
  resolveAdvancedReaction,
  checkMovementAdvancedReactionTriggers,
  checkAssaultAdvancedReactionTriggers,
  registerAllAdvancedReactions,
} from './legion/advanced-reaction-registry';

// Movement handlers
import { handleMoveModel, handleMoveUnit, handleRushUnit } from './movement/move-handler';
import { handleReservesTest, handleReservesEntry } from './movement/reserves-handler';
import { handleEmbark, handleDisembark } from './movement/embark-disembark-handler';
import { checkRepositionTrigger, handleRepositionReaction } from './movement/reposition-handler';

// Shooting handlers
import { handleShootingAttack, handleShootingMorale } from './phases/shooting-phase';
import { countCasualtiesPerUnit } from './shooting/casualty-removal';
import type { PendingMoraleCheck } from './shooting/shooting-types';
import { resolveWeaponAssignment } from './shooting/weapon-declaration';
import { isDefensiveWeapon, markUnitReacted } from './shooting/return-fire-handler';

// Assault handlers
import {
  handleCharge,
  handleDeclareChallenge,
  handleAcceptChallenge,
  handleDeclineChallenge,
  handleSelectGambit,
  handleFight,
  handleSelectAftermath,
} from './phases/assault-phase';
import { resolveVolleyAttacks } from './assault/volley-attack-handler';
import { resolveChargeMove } from './assault/charge-move-handler';
import { checkOverwatchTrigger, resolveOverwatch, declineOverwatch } from './assault/overwatch-handler';

// Phase lifecycle handlers
import { handleStartPhase } from './phases/start-phase';
import { handleEndEffects, handleStatusCleanup, handleVictoryCheck } from './phases/end-phase';
import {
  findUnit,
  getAliveModels,
  getClosestModelDistance,
  getModelsWithLOSToUnit,
  isVehicleUnit,
  findUnitPlayerIndex,
} from './game-queries';

let advancedReactionHandlersInitialized = false;

function ensureAdvancedReactionHandlersRegistered(): void {
  if (advancedReactionHandlersInitialized) return;
  registerAllAdvancedReactions();
  advancedReactionHandlersInitialized = true;
}

// ─── processCommand ──────────────────────────────────────────────────────────

/**
 * Process a game command against the current state.
 *
 * Validates the command, routes to the appropriate handler, and returns the
 * result. This is the single entry point for all game state changes.
 *
 * @param state - Current game state
 * @param command - The command to process
 * @param dice - Dice provider for any rolls
 * @returns CommandResult with updated state, events, and errors
 */
export function processCommand(
  state: GameState,
  command: GameCommand,
  dice: DiceProvider,
): CommandResult {
  ensureAdvancedReactionHandlersRegistered();

  // Game over — no commands accepted
  if (state.isGameOver) {
    return reject(state, 'GAME_OVER', 'The game is over. No further commands can be processed.');
  }

  // If awaiting reaction, only reaction commands are valid
  if (state.awaitingReaction) {
    if (command.type === 'selectReaction') {
      return processSelectReaction(state, command, dice);
    }
    if (command.type === 'declineReaction') {
      return processDeclineReaction(state, dice);
    }
    return reject(state, 'AWAITING_REACTION', 'A reaction decision is pending. Only selectReaction or declineReaction commands are accepted.');
  }

  // Route by command type
  switch (command.type) {
    case 'moveModel':
      return processMoveModel(state, command, dice);

    case 'moveUnit':
      return processMoveUnit(state, command, dice);

    case 'rushUnit':
      return processRushUnit(state, command, dice);

    case 'reservesTest':
      return processReservesTest(state, command, dice);

    case 'deployUnit':
      return processDeployUnit(state, command, dice);

    case 'embark':
      return processEmbark(state, command, dice);

    case 'disembark':
      return processDisembark(state, command, dice);

    case 'endSubPhase':
      return processEndSubPhase(state, dice);

    case 'endPhase':
      return processEndPhase(state, dice);

    case 'selectReaction':
      return reject(state, 'NO_REACTION_PENDING', 'No reaction is currently pending.');

    case 'declineReaction':
      return reject(state, 'NO_REACTION_PENDING', 'No reaction is currently pending.');

    // Shooting Phase Commands
    case 'declareShooting':
      return processDeclareShooting(state, command, dice);

    case 'resolveShootingCasualties':
      return processResolveShootingCasualties(state, dice);

    // Assault Phase Commands
    case 'declareCharge':
      return processDeclareCharge(state, command, dice);

    case 'declareChallenge':
      return processDeclareChallenge(state, command, dice);

    case 'acceptChallenge':
      return processAcceptChallenge(state, command, dice);

    case 'declineChallenge':
      return processDeclineChallenge(state, command, dice);

    case 'selectGambit':
      return processSelectGambit(state, command, dice);

    case 'resolveFight':
      return processResolveFight(state, command, dice);

    case 'selectAftermath':
      return processSelectAftermath(state, command, dice);

    case 'selectTargetModel':
      return processSelectTargetModel(state, command);

    case 'placeBlastMarker':
      return processPlaceBlastMarker(state, command);

    case 'placeTerrain':
      return processPlaceTerrain(state, command);

    case 'removeTerrain':
      return processRemoveTerrain(state, command);

    case 'selectWargearOption':
      return processSelectWargearOption(state, command);

    case 'declareWeapons':
      return processDeclareWeapons(state, command);

    default:
      return reject(state, 'UNKNOWN_COMMAND', `Unknown command type`);
  }
}

// ─── Movement Phase Commands ─────────────────────────────────────────────────

/**
 * Process a moveModel command.
 * Validates we're in the correct phase, delegates to move-handler,
 * then checks for Reposition reaction trigger.
 */
function processMoveModel(
  state: GameState,
  command: { type: 'moveModel'; modelId: string; targetPosition: Position },
  dice: DiceProvider,
): CommandResult {
  // Validate phase
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return reject(state, 'WRONG_PHASE', `moveModel requires Movement/Move phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  // Delegate to move handler
  const result = handleMoveModel(state, command.modelId, command.targetPosition, dice);

  if (!result.accepted) {
    return result;
  }

  // After a successful move, check for Reposition reaction trigger
  return checkAndOfferReposition(result, command.modelId);
}

/**
 * Process a moveUnit command.
 * Validates we're in the correct phase, delegates to move-handler,
 * then checks for a single Reposition reaction trigger after the full unit move.
 */
function processMoveUnit(
  state: GameState,
  command: { type: 'moveUnit'; unitId: string; modelPositions: { modelId: string; position: Position }[]; isRush?: boolean },
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return reject(state, 'WRONG_PHASE', `moveUnit requires Movement/Move phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  const result = handleMoveUnit(state, command.unitId, command.modelPositions, dice, {
    isRush: command.isRush === true,
  });
  if (!result.accepted) {
    return result;
  }

  return checkAndOfferRepositionForUnit(result, command.unitId);
}

/**
 * Process a rushUnit command.
 */
function processRushUnit(
  state: GameState,
  command: { type: 'rushUnit'; unitId: string },
  dice: DiceProvider,
): CommandResult {
  // Validate phase
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return reject(state, 'WRONG_PHASE', `rushUnit requires Movement/Move phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  return handleRushUnit(state, command.unitId, dice);
}

/**
 * Process a reservesTest command.
 */
function processReservesTest(
  state: GameState,
  command: { type: 'reservesTest'; unitId: string },
  dice: DiceProvider,
): CommandResult {
  // Validate phase
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Reserves) {
    return reject(state, 'WRONG_PHASE', `reservesTest requires Movement/Reserves phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  return handleReservesTest(state, command.unitId, dice);
}

/**
 * Process a deployUnit command (reserves entry / placement on battlefield).
 */
function processDeployUnit(
  state: GameState,
  command: { type: 'deployUnit'; unitId: string; modelPositions: { modelId: string; position: Position }[] },
  dice: DiceProvider,
): CommandResult {
  // deployUnit can be used in Reserves sub-phase (for placing after passing test)
  // or potentially during setup. For now, route to reserves entry.
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Reserves) {
    return reject(state, 'WRONG_PHASE', `deployUnit requires Movement/Reserves phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  return handleReservesEntry(state, command.unitId, command.modelPositions, dice);
}

/**
 * Process an embark command.
 */
function processEmbark(
  state: GameState,
  command: { type: 'embark'; unitId: string; transportId: string },
  dice: DiceProvider,
): CommandResult {
  // Embark can happen during the Move sub-phase
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return reject(state, 'WRONG_PHASE', `embark requires Movement/Move phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  return handleEmbark(state, command.unitId, command.transportId, dice);
}

/**
 * Process a disembark command.
 */
function processDisembark(
  state: GameState,
  command: { type: 'disembark'; unitId: string; modelPositions: { modelId: string; position: Position }[] },
  dice: DiceProvider,
): CommandResult {
  // Disembark can happen during the Move sub-phase
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return reject(state, 'WRONG_PHASE', `disembark requires Movement/Move phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  return handleDisembark(state, command.unitId, command.modelPositions, dice);
}

// ─── Shooting Phase Commands ─────────────────────────────────────────────────

/**
 * Process a declareShooting command.
 * Validates we're in the correct phase, delegates to the shooting phase handler.
 */
function processDeclareShooting(
  state: GameState,
  command: DeclareShootingCommand,
  dice: DiceProvider,
): CommandResult {
  // Validate phase
  if (state.currentPhase !== Phase.Shooting || state.currentSubPhase !== SubPhase.Attack) {
    return reject(state, 'WRONG_PHASE', `declareShooting requires Shooting/Attack phase`);
  }

  return handleShootingAttack(state, command, dice);
}

/**
 * Process a resolveShootingCasualties command.
 * Resolves pending morale checks from the shooting attack and clears the attack state.
 */
function processResolveShootingCasualties(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  // Validate phase
  if (state.currentPhase !== Phase.Shooting) {
    return reject(state, 'WRONG_PHASE', `resolveShootingCasualties requires Shooting phase`);
  }

  // Must have an active shooting attack state
  if (!state.shootingAttackState) {
    return reject(state, 'NO_ACTIVE_ATTACK', 'No shooting attack is currently in progress');
  }

  const attackState = state.shootingAttackState;

  // Convert external ShootingMoraleCheck to internal PendingMoraleCheck
  const pendingChecks: PendingMoraleCheck[] = attackState.pendingMoraleChecks.map(check => ({
    unitId: check.unitId,
    checkType: check.checkType,
    modifier: check.modifier,
    source: check.source,
  }));

  // Count casualties per unit
  const casualtiesPerUnit = countCasualtiesPerUnit(state, attackState.accumulatedCasualties);

  // Resolve morale and clear attack state
  return handleShootingMorale(
    state,
    pendingChecks,
    attackState.unitSizesAtStart,
    casualtiesPerUnit,
    dice,
  );
}

// ─── Assault Phase Commands ─────────────────────────────────────────────────

function processDeclareCharge(
  state: GameState,
  command: DeclareChargeCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Charge) {
    return reject(state, 'WRONG_PHASE', `declareCharge requires Assault/Charge phase`);
  }

  return handleCharge(state, command, dice);
}

function processDeclareChallenge(
  state: GameState,
  command: DeclareChallengeCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', `declareChallenge requires Assault/Challenge phase`);
  }
  return handleDeclareChallenge(state, command, dice);
}

function processAcceptChallenge(
  state: GameState,
  command: AcceptChallengeCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', `acceptChallenge requires Assault/Challenge phase`);
  }
  return handleAcceptChallenge(state, command, dice);
}

function processDeclineChallenge(
  state: GameState,
  command: DeclineChallengeCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', `declineChallenge requires Assault/Challenge phase`);
  }
  return handleDeclineChallenge(state, command, dice);
}

function processSelectGambit(
  state: GameState,
  command: SelectGambitCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', `selectGambit requires Assault/Challenge phase`);
  }
  return handleSelectGambit(state, command, dice);
}

function processResolveFight(
  state: GameState,
  command: ResolveFightCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Fight) {
    return reject(state, 'WRONG_PHASE', `resolveFight requires Assault/Fight phase`);
  }
  return handleFight(state, command, dice);
}

function processSelectAftermath(
  state: GameState,
  command: SelectAftermathCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Resolution) {
    return reject(state, 'WRONG_PHASE', `selectAftermath requires Assault/Resolution phase`);
  }
  return handleSelectAftermath(state, command, dice);
}

// ─── Phase Advancement Commands ──────────────────────────────────────────────

/**
 * Auto-process phase lifecycle handlers when entering specific sub-phases.
 * These sub-phases are engine-driven (not player-driven) and execute automatically
 * when the state machine transitions into them.
 *
 * - StartEffects: resets per-turn legion tactica state
 * - EndEffects: resets reaction/movement state, expires modifiers
 * - Statuses: Cool Checks for Pinned, auto-remove Suppressed, etc.
 * - Victory: score objectives, check victory conditions
 */
function autoProcessSubPhase(
  state: GameState,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[] } {
  const subPhase = state.currentSubPhase;
  let result: CommandResult;

  switch (subPhase) {
    case SubPhase.StartEffects:
      result = handleStartPhase(state, dice);
      return { state: result.state, events: result.events };

    case SubPhase.EndEffects:
      result = handleEndEffects(state, dice);
      return { state: result.state, events: result.events };

    case SubPhase.Statuses:
      result = handleStatusCleanup(state, dice);
      return { state: result.state, events: result.events };

    case SubPhase.Victory:
      result = handleVictoryCheck(state, dice);
      return { state: result.state, events: result.events };

    default:
      // Not an auto-process sub-phase — no action needed
      return { state, events: [] };
  }
}

/**
 * Process an endSubPhase command.
 * Advances to the next sub-phase, then auto-processes phase lifecycle handlers
 * if the new sub-phase is engine-driven (StartEffects, EndEffects, Statuses, Victory).
 */
function processEndSubPhase(state: GameState, dice: DiceProvider): CommandResult {
  const events: GameEvent[] = [];

  // Advance to the next sub-phase
  const { state: advancedState, events: advanceEvents } = advanceSubPhase(state);
  events.push(...advanceEvents);

  // Auto-process the new sub-phase if it's engine-driven
  const { state: processedState, events: processEvents } = autoProcessSubPhase(advancedState, dice);
  events.push(...processEvents);

  return {
    state: processedState,
    events,
    errors: [],
    accepted: true,
  };
}

/**
 * Process an endPhase command.
 * Skips remaining sub-phases of the current phase and advances to the next main phase.
 * Auto-processes phase lifecycle handlers for any engine-driven sub-phases entered.
 */
function processEndPhase(state: GameState, dice: DiceProvider): CommandResult {
  const { state: advancedState, events } = advancePhase(state);

  // Auto-process the new sub-phase if it's engine-driven
  const { state: processedState, events: processEvents } = autoProcessSubPhase(advancedState, dice);
  events.push(...processEvents);

  return {
    state: processedState,
    events,
    errors: [],
    accepted: true,
  };
}

// ─── Reaction Commands ───────────────────────────────────────────────────────

/**
 * Resume a paused charge sequence after an Overwatch accept/decline decision.
 *
 * The charge flow pauses at AWAITING_OVERWATCH (after setup move).
 * Once the reaction is resolved, we continue:
 * - Step 4b: volley attacks (target volley suppressed if Overwatch accepted)
 * - Step 5: charge roll and move (if neither side was wiped by volleys)
 *
 * The temporary assault attack state used for the pause is cleared after resume.
 */
function resumeChargeAfterOverwatchDecision(
  state: GameState,
  dice: DiceProvider,
  overwatchAccepted: boolean,
): { state: GameState; events: GameEvent[] } {
  const attackState = state.assaultAttackState;
  if (!attackState || attackState.chargeStep !== 'AWAITING_OVERWATCH') {
    return { state, events: [] };
  }

  const events: GameEvent[] = [];
  const { chargingUnitId, targetUnitId, isDisordered, closestDistance } = attackState;

  // Overwatch replaces the defender's snap-shot volley.
  const volleyResult = resolveVolleyAttacks(
    state,
    chargingUnitId,
    targetUnitId,
    isDisordered,
    dice,
    true,
    !overwatchAccepted,
  );
  let resumedState = volleyResult.state;
  events.push(...volleyResult.events);

  if (!volleyResult.chargerWipedOut && !volleyResult.targetWipedOut) {
    const afterVolleyTrigger = checkAssaultAdvancedReactionTriggers(
      resumedState,
      'afterVolleyAttacks',
      chargingUnitId,
      targetUnitId,
    );
    if (afterVolleyTrigger) {
      const playerIndex = afterVolleyTrigger.eligibleUnitIds.length > 0
        ? findUnitPlayerIndex(resumedState, afterVolleyTrigger.eligibleUnitIds[0]) ?? -1
        : -1;

      const reactionState = setAwaitingReaction(resumedState, true, {
        reactionType: afterVolleyTrigger.reactionId,
        isAdvancedReaction: true,
        eligibleUnitIds: afterVolleyTrigger.eligibleUnitIds,
        triggerDescription: `Charge advanced reaction "${afterVolleyTrigger.reactionId}" triggered by charger "${chargingUnitId}"`,
        triggerSourceUnitId: chargingUnitId,
      });

      return {
        state: setAssaultAttackState(reactionState, {
          ...attackState,
          chargeStep: 'CHARGE_ROLL',
          closestDistance,
        }),
        events: [
          ...events,
          {
            type: 'advancedReactionDeclared' as const,
            reactionId: afterVolleyTrigger.reactionId,
            reactionName: afterVolleyTrigger.reactionId,
            reactingUnitId: '',
            triggerSourceUnitId: chargingUnitId,
            playerIndex,
          },
        ],
      };
    }

    const chargeResult = resolveChargeMove(
      resumedState,
      chargingUnitId,
      targetUnitId,
      dice,
      closestDistance,
    );
    resumedState = chargeResult.state;
    events.push(...chargeResult.events);
  }

  return {
    state: clearAssaultAttackState(resumedState),
    events,
  };
}

/**
 * Build a deterministic default weapon selection set for reaction shooting.
 *
 * Rules alignment:
 * - Only weapons in range can be selected.
 * - Vehicle units can only fire Defensive weapons during Return Fire.
 * - Models without LOS are excluded.
 */
function buildReactionWeaponSelections(
  state: GameState,
  reactingUnitId: string,
  targetUnitId: string,
): Array<{ modelId: string; weaponId: string; profileName?: string }> {
  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) return [];

  const targetDistance = getClosestModelDistance(state, reactingUnitId, targetUnitId);
  if (!Number.isFinite(targetDistance)) return [];

  const modelsWithLOS = new Set(
    getModelsWithLOSToUnit(state, reactingUnitId, targetUnitId).map((model) => model.id),
  );
  const defensiveOnly = isVehicleUnit(reactingUnit);
  const weaponSelections: Array<{ modelId: string; weaponId: string; profileName?: string }> = [];

  for (const model of getAliveModels(reactingUnit)) {
    if (!modelsWithLOS.has(model.id)) continue;

    for (const weaponId of model.equippedWargear) {
      const weaponProfile = resolveWeaponAssignment(
        { modelId: model.id, weaponId },
        reactingUnit,
      );
      if (!weaponProfile) continue;
      if (defensiveOnly && !isDefensiveWeapon(weaponProfile.rangedStrength, weaponProfile.traits)) {
        continue;
      }
      if (!weaponProfile.hasTemplate && targetDistance > weaponProfile.range) continue;

      weaponSelections.push({ modelId: model.id, weaponId });
      break;
    }
  }

  return weaponSelections;
}

/**
 * Once Return Fire is accepted/declined, the original shooting attack leaves
 * the reaction gate and can proceed to morale resolution.
 */
function finalizePendingReturnFireAttackState(state: GameState): GameState {
  if (!state.shootingAttackState) return state;
  if (
    state.shootingAttackState.currentStep !== 'AWAITING_RETURN_FIRE' &&
    state.shootingAttackState.returnFireResolved
  ) {
    return state;
  }

  return {
    ...state,
    shootingAttackState: {
      ...state.shootingAttackState,
      returnFireResolved: true,
      currentStep: 'COMPLETE',
    },
  };
}

function executeOverwatchReaction(
  state: GameState,
  reactingUnitId: string,
  chargingUnitId: string,
  dice: DiceProvider,
): { state: GameState; events: GameEvent[]; chargerWipedOut: boolean } {
  let currentState = setAwaitingReaction(state, false);
  const events: GameEvent[] = [];
  const weaponSelections = buildReactionWeaponSelections(currentState, reactingUnitId, chargingUnitId);

  if (weaponSelections.length > 0) {
    const overwatchCommand: DeclareShootingCommand = {
      type: 'declareShooting',
      attackingUnitId: reactingUnitId,
      targetUnitId: chargingUnitId,
      weaponSelections,
    };

    const overwatchAttack = handleShootingAttack(currentState, overwatchCommand, dice, {
      allowOutOfPhaseAttack: true,
      allowNonActiveAttacker: true,
      ignoreRushedRestriction: true,
      ignoreHasShotRestriction: true,
      countsAsStationary: true,
      forceNoSnapShots: true,
      allowReturnFireTrigger: false,
      suppressMoraleAndStatusChecks: true,
      blockShroudedDamageMitigation: true,
      persistShootingAttackState: false,
      consumeShootingAction: false,
    });

    if (overwatchAttack.accepted) {
      currentState = overwatchAttack.state;
      events.push(...overwatchAttack.events);
    }
  }

  const resolved = resolveOverwatch(currentState, reactingUnitId, chargingUnitId);
  events.push(...resolved.events);

  return {
    state: resolved.state,
    events,
    chargerWipedOut: resolved.chargerWipedOut,
  };
}

function continueChargeFromAdvancedStepFour(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  const attackState = state.assaultAttackState;
  if (!attackState) {
    return { state, events: [], errors: [], accepted: true };
  }

  const events: GameEvent[] = [];
  const { chargingUnitId, targetUnitId, isDisordered, closestDistance } = attackState;
  let newState = state;

  const overwatchCheck = checkOverwatchTrigger(newState, chargingUnitId, targetUnitId);
  if (overwatchCheck.canOverwatch) {
    const reactionState = setAwaitingReaction(newState, true, {
      reactionType: CoreReaction.Overwatch,
      isAdvancedReaction: false,
      eligibleUnitIds: overwatchCheck.eligibleUnitIds,
      triggerDescription: `Unit "${chargingUnitId}" is charging. Overwatch available.`,
      triggerSourceUnitId: chargingUnitId,
    });
    events.push(...overwatchCheck.events);

    return {
      state: setAssaultAttackState(reactionState, {
        ...attackState,
        chargeStep: 'AWAITING_OVERWATCH',
        overwatchResolved: false,
      }),
      events,
      errors: [],
      accepted: true,
    };
  }

  const volleyResult = resolveVolleyAttacks(
    newState,
    chargingUnitId,
    targetUnitId,
    isDisordered,
    dice,
  );
  newState = volleyResult.state;
  events.push(...volleyResult.events);

  if (!volleyResult.chargerWipedOut && !volleyResult.targetWipedOut) {
    const afterVolleyTrigger = checkAssaultAdvancedReactionTriggers(
      newState,
      'afterVolleyAttacks',
      chargingUnitId,
      targetUnitId,
    );

    if (afterVolleyTrigger) {
      const playerIndex = afterVolleyTrigger.eligibleUnitIds.length > 0
        ? findUnitPlayerIndex(newState, afterVolleyTrigger.eligibleUnitIds[0]) ?? -1
        : -1;

      const reactionState = setAwaitingReaction(newState, true, {
        reactionType: afterVolleyTrigger.reactionId,
        isAdvancedReaction: true,
        eligibleUnitIds: afterVolleyTrigger.eligibleUnitIds,
        triggerDescription: `Charge advanced reaction "${afterVolleyTrigger.reactionId}" triggered by charger "${chargingUnitId}"`,
        triggerSourceUnitId: chargingUnitId,
      });

      return {
        state: setAssaultAttackState(reactionState, {
          ...attackState,
          chargeStep: 'CHARGE_ROLL',
          closestDistance,
        }),
        events: [
          ...events,
          {
            type: 'advancedReactionDeclared',
            reactionId: afterVolleyTrigger.reactionId,
            reactionName: afterVolleyTrigger.reactionId,
            reactingUnitId: '',
            triggerSourceUnitId: chargingUnitId,
            playerIndex,
          } as GameEvent,
        ],
        errors: [],
        accepted: true,
      };
    }

    const chargeResult = resolveChargeMove(
      newState,
      chargingUnitId,
      targetUnitId,
      dice,
      closestDistance,
    );
    newState = chargeResult.state;
    events.push(...chargeResult.events);
  }

  return {
    state: clearAssaultAttackState(newState),
    events,
    errors: [],
    accepted: true,
  };
}

function resumePendingActionAfterAdvancedReaction(
  state: GameState,
  dice: DiceProvider,
  leadingEvents: GameEvent[] = [],
): CommandResult {
  if (state.shootingAttackState?.currentStep === 'DECLARING') {
    const pendingAttack = state.shootingAttackState;
    const resumeCommand: DeclareShootingCommand = {
      type: 'declareShooting',
      attackingUnitId: pendingAttack.attackerUnitId,
      targetUnitId: pendingAttack.targetUnitId,
      weaponSelections: pendingAttack.weaponAssignments.map((assignment) => ({
        modelId: assignment.modelId,
        weaponId: assignment.weaponId,
        profileName: assignment.profileName,
      })),
    };

    const resumed = handleShootingAttack(
      clearShootingAttackState(state),
      resumeCommand,
      dice,
      { skipAdvancedReactionChecks: true },
    );

    return {
      ...resumed,
      events: [...leadingEvents, ...resumed.events],
    };
  }

  if (
    state.currentSubPhase === SubPhase.Charge &&
    state.assaultAttackState?.chargeStep === 'DECLARING'
  ) {
    const pendingCharge = state.assaultAttackState;
    const resumeCommand: DeclareChargeCommand = {
      type: 'declareCharge',
      chargingUnitId: pendingCharge.chargingUnitId,
      targetUnitId: pendingCharge.targetUnitId,
    };

    const resumed = handleCharge(
      clearAssaultAttackState(state),
      resumeCommand,
      dice,
      { skipAdvancedReactionChecks: true },
    );

    return {
      ...resumed,
      events: [...leadingEvents, ...resumed.events],
    };
  }

  if (
    state.currentSubPhase === SubPhase.Charge &&
    state.assaultAttackState?.chargeStep === 'VOLLEY_ATTACKS'
  ) {
    const resumed = continueChargeFromAdvancedStepFour(state, dice);
    return {
      ...resumed,
      events: [...leadingEvents, ...resumed.events],
    };
  }

  if (
    state.currentSubPhase === SubPhase.Charge &&
    state.assaultAttackState?.chargeStep === 'CHARGE_ROLL'
  ) {
    const pendingCharge = state.assaultAttackState;
    const chargeResult = resolveChargeMove(
      state,
      pendingCharge.chargingUnitId,
      pendingCharge.targetUnitId,
      dice,
      pendingCharge.closestDistance,
    );

    return {
      state: clearAssaultAttackState(chargeResult.state),
      events: [...leadingEvents, ...chargeResult.events],
      errors: [],
      accepted: true,
    };
  }

  return {
    state,
    events: leadingEvents,
    errors: [],
    accepted: true,
  };
}

/**
 * Process a selectReaction command (reactive player chooses to react).
 */
function processSelectReaction(
  state: GameState,
  command: { type: 'selectReaction'; unitId: string; reactionType: string },
  dice: DiceProvider,
): CommandResult {
  if (!state.pendingReaction) {
    return reject(state, 'NO_REACTION_PENDING', 'No reaction is currently pending.');
  }

  // Validate the chosen unit is eligible
  if (!state.pendingReaction.eligibleUnitIds.includes(command.unitId)) {
    return reject(state, 'UNIT_NOT_ELIGIBLE', `Unit "${command.unitId}" is not eligible for this reaction.`);
  }

  // Handle Reposition reaction
  if (state.pendingReaction.reactionType === CoreReaction.Reposition) {
    // Current command shape does not include model destinations, so execute a
    // legal 0" reposition (up to Initiative allows remaining stationary).
    const repositionResult = handleRepositionReaction(state, command.unitId, [], dice);
    if (!repositionResult.accepted) {
      return repositionResult;
    }
    const newState = setAwaitingReaction(repositionResult.state, false);

    return {
      state: newState,
      events: repositionResult.events,
      errors: repositionResult.errors,
      accepted: true,
    };
  }

  // Handle Return Fire reaction
  if (state.pendingReaction.reactionType === CoreReaction.ReturnFire) {
    const targetUnitId = state.pendingReaction.triggerSourceUnitId;
    if (!targetUnitId) {
      return reject(state, 'RETURN_FIRE_SOURCE_MISSING', 'Unable to resolve Return Fire target unit.');
    }

    let newState = setAwaitingReaction(state, false);
    const events: GameEvent[] = [];
    const weaponSelections = buildReactionWeaponSelections(newState, command.unitId, targetUnitId);

    if (weaponSelections.length > 0) {
      const returnFireCommand: DeclareShootingCommand = {
        type: 'declareShooting',
        attackingUnitId: command.unitId,
        targetUnitId,
        weaponSelections,
      };

      const returnFireAttack = handleShootingAttack(newState, returnFireCommand, dice, {
        allowNonActiveAttacker: true,
        ignoreRushedRestriction: true,
        ignoreHasShotRestriction: true,
        countsAsStationary: true,
        allowReturnFireTrigger: false,
        suppressMoraleAndStatusChecks: true,
        persistShootingAttackState: false,
        consumeShootingAction: false,
      });

      if (returnFireAttack.accepted) {
        newState = returnFireAttack.state;
        events.push(...returnFireAttack.events);
      }
    }

    // Declared reactions consume allotment even when no weapons can be brought to bear.
    newState = markUnitReacted(newState, command.unitId);
    newState = finalizePendingReturnFireAttackState(newState);
    newState = setAwaitingReaction(newState, false);

    return { state: newState, events, errors: [], accepted: true };
  }

  // Handle Overwatch reaction
  if (state.pendingReaction.reactionType === CoreReaction.Overwatch) {
    const chargingUnitId =
      state.pendingReaction.triggerSourceUnitId || state.assaultAttackState?.chargingUnitId;
    if (!chargingUnitId) {
      return reject(state, 'OVERWATCH_SOURCE_MISSING', 'Unable to resolve Overwatch source unit for pending charge.');
    }

    const overwatchResult = executeOverwatchReaction(state, command.unitId, chargingUnitId, dice);
    const resumedCharge = resumeChargeAfterOverwatchDecision(
      overwatchResult.state,
      dice,
      true,
    );
    return {
      state: resumedCharge.state,
      events: [...overwatchResult.events, ...resumedCharge.events],
      errors: [],
      accepted: true,
    };
  }

  // Handle Advanced Reactions (legion-specific)
  if (state.pendingReaction.isAdvancedReaction) {
    const reactionId = state.pendingReaction.reactionType as string;
    const triggerSourceUnitId = state.pendingReaction.triggerSourceUnitId ?? '';
    const resolution = resolveAdvancedReaction(state, reactionId, command.unitId, triggerSourceUnitId, dice);
    if (!resolution.accepted) {
      return resolution;
    }

    const postResolutionState = resolution.state.awaitingReaction
      ? setAwaitingReaction(resolution.state, false)
      : resolution.state;

    return resumePendingActionAfterAdvancedReaction(
      postResolutionState,
      dice,
      resolution.events,
    );
  }

  return reject(state, 'UNSUPPORTED_REACTION', `Reaction type "${state.pendingReaction.reactionType}" is not yet supported.`);
}

/**
 * Process a declineReaction command (reactive player passes on the reaction).
 */
function processDeclineReaction(state: GameState, dice: DiceProvider): CommandResult {
  if (!state.pendingReaction) {
    return reject(state, 'NO_REACTION_PENDING', 'No reaction is currently pending.');
  }

  if (state.pendingReaction.reactionType === CoreReaction.Overwatch) {
    const chargingUnitId =
      state.pendingReaction.triggerSourceUnitId || state.assaultAttackState?.chargingUnitId;
    if (!chargingUnitId) {
      return reject(state, 'OVERWATCH_SOURCE_MISSING', 'Unable to resolve Overwatch source unit for pending charge.');
    }

    const declineResult = declineOverwatch(state, chargingUnitId);
    const resumedCharge = resumeChargeAfterOverwatchDecision(
      declineResult.state,
      dice,
      false,
    );

    return {
      state: resumedCharge.state,
      events: [...declineResult.events, ...resumedCharge.events],
      errors: [],
      accepted: true,
    };
  }

  let newState = setAwaitingReaction(state, false);
  if (state.pendingReaction.reactionType === CoreReaction.ReturnFire) {
    newState = finalizePendingReturnFireAttackState(newState);
  }

  if (state.pendingReaction.isAdvancedReaction) {
    return resumePendingActionAfterAdvancedReaction(newState, dice);
  }

  return {
    state: newState,
    events: [],
    errors: [],
    accepted: true,
  };
}

// ─── Reposition Trigger Check ────────────────────────────────────────────────

/**
 * After a successful move, check if any reactive units can trigger a
 * Reposition reaction. If so, set awaitingReaction on the game state
 * and populate the pendingReaction info.
 */
function checkAndOfferReposition(
  result: CommandResult,
  modelId: string,
): CommandResult {
  // Find which unit the model belongs to
  const unit = findModelUnit(result.state, modelId);
  if (!unit) return result;

  // Check for advanced movement reactions first (legion-specific take priority)
  const advancedTrigger = checkMovementAdvancedReactionTriggers(result.state, unit.id);
  if (advancedTrigger) {
    const newState = setAwaitingReaction(result.state, true, {
      reactionType: advancedTrigger.reactionId,
      eligibleUnitIds: advancedTrigger.eligibleUnitIds,
      triggerDescription: `Unit "${unit.id}" completed a move, triggering advanced reaction "${advancedTrigger.reactionId}"`,
      triggerSourceUnitId: unit.id,
      isAdvancedReaction: true,
    });

    return {
      ...result,
      state: newState,
      events: [
        ...result.events,
        {
          type: 'advancedReactionDeclared' as const,
          reactionId: advancedTrigger.reactionId,
          reactionName: advancedTrigger.reactionId,
          reactingUnitId: '',
          triggerSourceUnitId: unit.id,
          playerIndex: -1,
        },
      ],
    };
  }

  // Fall back to core Reposition reaction
  const triggerResult = checkRepositionTrigger(result.state, unit.id);

  if (triggerResult.triggered) {
    const newState = setAwaitingReaction(result.state, true, {
      reactionType: CoreReaction.Reposition,
      isAdvancedReaction: false,
      eligibleUnitIds: triggerResult.eligibleUnitIds,
      triggerDescription: `Unit "${unit.id}" completed a move within 12" of reactive units`,
      triggerSourceUnitId: unit.id,
    });

    return {
      ...result,
      state: newState,
      events: [
        ...result.events,
        {
          type: 'repositionTriggered' as const,
          triggerUnitId: unit.id,
          eligibleUnitIds: triggerResult.eligibleUnitIds,
        },
      ],
    };
  }

  return result;
}

function checkAndOfferRepositionForUnit(
  result: CommandResult,
  unitId: string,
): CommandResult {
  // Check for advanced movement reactions first (legion-specific take priority)
  const advancedTrigger = checkMovementAdvancedReactionTriggers(result.state, unitId);
  if (advancedTrigger) {
    const newState = setAwaitingReaction(result.state, true, {
      reactionType: advancedTrigger.reactionId,
      eligibleUnitIds: advancedTrigger.eligibleUnitIds,
      triggerDescription: `Unit "${unitId}" completed a move, triggering advanced reaction "${advancedTrigger.reactionId}"`,
      triggerSourceUnitId: unitId,
      isAdvancedReaction: true,
    });

    return {
      ...result,
      state: newState,
      events: [
        ...result.events,
        {
          type: 'advancedReactionDeclared' as const,
          reactionId: advancedTrigger.reactionId,
          reactionName: advancedTrigger.reactionId,
          reactingUnitId: '',
          triggerSourceUnitId: unitId,
          playerIndex: -1,
        },
      ],
    };
  }

  // Fall back to core Reposition reaction
  const triggerResult = checkRepositionTrigger(result.state, unitId);

  if (triggerResult.triggered) {
    const newState = setAwaitingReaction(result.state, true, {
      reactionType: CoreReaction.Reposition,
      isAdvancedReaction: false,
      eligibleUnitIds: triggerResult.eligibleUnitIds,
      triggerDescription: `Unit "${unitId}" completed a move within 12" of reactive units`,
      triggerSourceUnitId: unitId,
    });

    return {
      ...result,
      state: newState,
      events: [
        ...result.events,
        {
          type: 'repositionTriggered' as const,
          triggerUnitId: unitId,
          eligibleUnitIds: triggerResult.eligibleUnitIds,
        },
      ],
    };
  }

  return result;
}

/**
 * Find the unit that contains a model by ID.
 */
function findModelUnit(state: GameState, modelId: string): { id: string } | undefined {
  for (const army of state.armies) {
    for (const unit of army.units) {
      if (unit.models.some(m => m.id === modelId)) {
        return unit;
      }
    }
  }
  return undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a rejected CommandResult with the given error.
 */
function reject(state: GameState, code: string, message: string): CommandResult {
  return {
    state,
    events: [],
    errors: [{ code, message }],
    accepted: false,
  };
}

// ─── Select Target Model ─────────────────────────────────────────────────────

/**
 * Process a selectTargetModel command.
 * Used during shooting to select a specific model in the target unit to allocate hits to.
 * Validates that a shooting attack is in progress and the model belongs to the target unit.
 */
function processSelectTargetModel(
  state: GameState,
  command: SelectTargetModelCommand,
): CommandResult {
  if (state.currentPhase !== Phase.Shooting) {
    return reject(state, 'WRONG_PHASE', 'selectTargetModel requires Shooting phase');
  }

  if (!state.shootingAttackState) {
    return reject(state, 'NO_ACTIVE_ATTACK', 'No shooting attack is currently in progress');
  }

  // Find the target unit
  const targetUnitId = state.shootingAttackState.targetUnitId;
  let targetUnit = null;
  for (const army of state.armies) {
    targetUnit = army.units.find(u => u.id === targetUnitId);
    if (targetUnit) break;
  }

  if (!targetUnit) {
    return reject(state, 'UNIT_NOT_FOUND', `Target unit "${targetUnitId}" not found`);
  }

  // Validate model belongs to target unit
  const model = targetUnit.models.find(m => m.id === command.modelId);
  if (!model) {
    return reject(state, 'MODEL_NOT_IN_UNIT', `Model "${command.modelId}" does not belong to target unit "${targetUnitId}"`);
  }

  if (model.isDestroyed) {
    return reject(state, 'MODEL_DESTROYED', `Model "${command.modelId}" is already destroyed`);
  }

  // Store the selected target model on the shooting attack state
  const newState: GameState = {
    ...state,
    shootingAttackState: {
      ...state.shootingAttackState,
      selectedTargetModelId: command.modelId,
    },
  };

  return {
    state: newState,
    events: [{
      type: 'targetModelSelected' as const,
      modelId: command.modelId,
      unitId: targetUnitId,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── Place Blast Marker ──────────────────────────────────────────────────────

/**
 * Process a placeBlastMarker command.
 * Places a blast template at a position during shooting phase for blast weapons.
 * Validates position is on the battlefield and a shooting attack is in progress.
 */
function processPlaceBlastMarker(
  state: GameState,
  command: PlaceBlastMarkerCommand,
): CommandResult {
  if (state.currentPhase !== Phase.Shooting) {
    return reject(state, 'WRONG_PHASE', 'placeBlastMarker requires Shooting phase');
  }

  if (!state.shootingAttackState) {
    return reject(state, 'NO_ACTIVE_ATTACK', 'No shooting attack is currently in progress');
  }

  // Validate position is within battlefield bounds
  const { width, height } = state.battlefield;
  if (command.position.x < 0 || command.position.x > width ||
      command.position.y < 0 || command.position.y > height) {
    return reject(state, 'OUT_OF_BOUNDS', 'Blast marker position is outside the battlefield');
  }

  // Validate blast size (3" small, 5" large, or 7" apocalyptic)
  const validSizes = [3, 5, 7];
  if (!validSizes.includes(command.size)) {
    return reject(state, 'INVALID_BLAST_SIZE', `Invalid blast size: ${command.size}. Valid sizes are 3, 5, or 7 inches.`);
  }

  // Find all models under the blast template
  const blastRadius = command.size / 2;
  const hitModelIds: string[] = [];

  for (const army of state.armies) {
    for (const unit of army.units) {
      for (const model of unit.models) {
        if (model.isDestroyed) continue;
        const dx = model.position.x - command.position.x;
        const dy = model.position.y - command.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= blastRadius) {
          hitModelIds.push(model.id);
        }
      }
    }
  }

  // Store blast marker on the shooting attack state
  const newState: GameState = {
    ...state,
    shootingAttackState: {
      ...state.shootingAttackState,
      blastMarker: {
        position: command.position,
        size: command.size,
        hitModelIds,
      },
    },
  };

  return {
    state: newState,
    events: [{
      type: 'blastMarkerPlaced' as const,
      center: command.position,
      radius: command.size / 2,
      modelsHit: hitModelIds,
      scattered: false,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── Place Terrain ───────────────────────────────────────────────────────────

/**
 * Process a placeTerrain command.
 * Adds a terrain piece to the battlefield during terrain setup.
 */
function processPlaceTerrain(
  state: GameState,
  command: PlaceTerrainCommand,
): CommandResult {
  const terrain = command.terrain;

  // Validate terrain has required fields
  if (!terrain.id || !terrain.name || !terrain.type || !terrain.shape) {
    return reject(state, 'INVALID_TERRAIN', 'Terrain piece is missing required fields (id, name, type, shape)');
  }

  // Check for duplicate terrain ID
  if (state.terrain.some(t => t.id === terrain.id)) {
    return reject(state, 'DUPLICATE_TERRAIN_ID', `Terrain with id "${terrain.id}" already exists on the battlefield`);
  }

  const newState: GameState = {
    ...state,
    terrain: [...state.terrain, terrain],
  };

  return {
    state: newState,
    events: [{
      type: 'terrainPlaced' as const,
      terrainId: terrain.id,
      terrainName: terrain.name,
      terrainType: terrain.type,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── Remove Terrain ──────────────────────────────────────────────────────────

/**
 * Process a removeTerrain command.
 * Removes a terrain piece from the battlefield by ID.
 */
function processRemoveTerrain(
  state: GameState,
  command: RemoveTerrainCommand,
): CommandResult {
  const terrainIndex = state.terrain.findIndex(t => t.id === command.terrainId);

  if (terrainIndex === -1) {
    return reject(state, 'TERRAIN_NOT_FOUND', `Terrain with id "${command.terrainId}" not found on the battlefield`);
  }

  const removedTerrain = state.terrain[terrainIndex];
  const newTerrain = [...state.terrain];
  newTerrain.splice(terrainIndex, 1);

  const newState: GameState = {
    ...state,
    terrain: newTerrain,
  };

  return {
    state: newState,
    events: [{
      type: 'terrainRemoved' as const,
      terrainId: command.terrainId,
      terrainName: removedTerrain.name,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── Select Wargear Option ───────────────────────────────────────────────────

/**
 * Process a selectWargearOption command.
 * Applies a wargear option to a specific model, swapping equipment per the option's
 * removes/adds configuration from the unit profile.
 */
function processSelectWargearOption(
  state: GameState,
  command: SelectWargearOptionCommand,
): CommandResult {
  // Find the unit
  let targetUnit = null;
  let armyIndex = -1;
  let unitIndex = -1;
  for (let ai = 0; ai < state.armies.length; ai++) {
    const idx = state.armies[ai].units.findIndex(u => u.id === command.unitId);
    if (idx !== -1) {
      targetUnit = state.armies[ai].units[idx];
      armyIndex = ai;
      unitIndex = idx;
      break;
    }
  }

  if (!targetUnit) {
    return reject(state, 'UNIT_NOT_FOUND', `Unit "${command.unitId}" not found`);
  }

  // Find the model
  const modelIndex = targetUnit.models.findIndex(m => m.id === command.modelId);
  if (modelIndex === -1) {
    return reject(state, 'MODEL_NOT_FOUND', `Model "${command.modelId}" not found in unit "${command.unitId}"`);
  }

  const model = targetUnit.models[modelIndex];
  if (model.isDestroyed) {
    return reject(state, 'MODEL_DESTROYED', `Model "${command.modelId}" is destroyed`);
  }

  // Validate option index (basic bounds check — the UI is responsible for passing valid indices
  // from the unit profile's wargearOptions array)
  if (command.optionIndex < 0) {
    return reject(state, 'INVALID_OPTION', `Invalid wargear option index: ${command.optionIndex}`);
  }

  // Apply the wargear option by storing the selected option index on the model's equipped wargear.
  // The actual wargear swap (removes/adds) is data-driven from the UnitProfile.wargearOptions,
  // which the UI resolves. Here we store the option index as a marker that the option was selected.
  const updatedModels = [...targetUnit.models];
  const updatedModel = { ...updatedModels[modelIndex] };
  // Add the option marker to the equipped wargear list
  const wargearOptionMarker = `__wargear_option_${command.optionIndex}`;
  if (!updatedModel.equippedWargear.includes(wargearOptionMarker)) {
    updatedModel.equippedWargear = [...updatedModel.equippedWargear, wargearOptionMarker];
  }
  updatedModels[modelIndex] = updatedModel;

  const updatedUnits = [...state.armies[armyIndex].units];
  updatedUnits[unitIndex] = { ...targetUnit, models: updatedModels };

  const updatedArmies = [...state.armies] as [typeof state.armies[0], typeof state.armies[1]];
  updatedArmies[armyIndex] = { ...state.armies[armyIndex], units: updatedUnits };

  const newState: GameState = {
    ...state,
    armies: updatedArmies,
  };

  return {
    state: newState,
    events: [{
      type: 'wargearOptionSelected' as const,
      unitId: command.unitId,
      modelId: command.modelId,
      optionIndex: command.optionIndex,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── Declare Weapons ─────────────────────────────────────────────────────────

/**
 * Process a declareWeapons command.
 * Declares which melee weapons each model will use in the assault fight step.
 * Validates that an active combat exists and the models belong to engaged units.
 */
function processDeclareWeapons(
  state: GameState,
  command: DeclareWeaponsCommand,
): CommandResult {
  if (state.currentPhase !== Phase.Assault) {
    return reject(state, 'WRONG_PHASE', 'declareWeapons requires Assault phase');
  }

  if (!state.activeCombats || state.activeCombats.length === 0) {
    return reject(state, 'NO_ACTIVE_COMBAT', 'No active combats to declare weapons for');
  }

  // Validate each weapon selection
  for (const selection of command.weaponSelections) {
    // Find the model
    let modelFound = false;
    for (const army of state.armies) {
      for (const unit of army.units) {
        const model = unit.models.find(m => m.id === selection.modelId);
        if (model) {
          modelFound = true;
          if (model.isDestroyed) {
            return reject(state, 'MODEL_DESTROYED', `Model "${selection.modelId}" is destroyed`);
          }
          // Validate the weapon is in the model's equipped wargear
          if (!model.equippedWargear.includes(selection.weaponId)) {
            return reject(state, 'WEAPON_NOT_EQUIPPED', `Model "${selection.modelId}" does not have weapon "${selection.weaponId}" equipped`);
          }
          break;
        }
      }
      if (modelFound) break;
    }

    if (!modelFound) {
      return reject(state, 'MODEL_NOT_FOUND', `Model "${selection.modelId}" not found`);
    }
  }

  // Store weapon declarations on the first active combat's state
  // The fight resolver will use these selections when determining attacks
  const updatedCombats = state.activeCombats.map((combat, i) => {
    if (i === 0) {
      return {
        ...combat,
        weaponDeclarations: command.weaponSelections,
      };
    }
    return combat;
  });

  const newState: GameState = {
    ...state,
    activeCombats: updatedCombats,
  };

  return {
    state: newState,
    events: [{
      type: 'weaponsDeclared' as const,
      selections: command.weaponSelections,
    }],
    errors: [],
    accepted: true,
  };
}

// ─── getValidCommands ────────────────────────────────────────────────────────

/**
 * Get the list of valid command types for the current game state.
 * This is used by the UI to determine which actions are available.
 *
 * @param state - Current game state
 * @returns Array of valid command type strings
 */
export function getValidCommands(state: GameState): string[] {
  if (state.isGameOver) return [];

  if (state.awaitingReaction) {
    return ['selectReaction', 'declineReaction'];
  }

  const validCommands: string[] = ['endSubPhase', 'endPhase', 'placeTerrain', 'removeTerrain', 'selectWargearOption'];

  switch (state.currentPhase) {
    case Phase.Movement:
      switch (state.currentSubPhase) {
        case SubPhase.Reserves:
          validCommands.push('reservesTest', 'deployUnit');
          break;
        case SubPhase.Move:
          validCommands.push('moveModel', 'moveUnit', 'rushUnit', 'embark', 'disembark');
          break;
        case SubPhase.Rout:
          // Rout is auto-processed, just endSubPhase
          break;
      }
      break;

    case Phase.Shooting:
      switch (state.currentSubPhase) {
        case SubPhase.Attack:
          if (state.shootingAttackState) {
            validCommands.push('resolveShootingCasualties', 'selectTargetModel', 'placeBlastMarker');
          } else {
            validCommands.push('declareShooting');
          }
          break;
        case SubPhase.ShootingMorale:
          // Morale is auto-resolved via endSubPhase
          break;
      }
      break;

    case Phase.Assault:
      switch (state.currentSubPhase) {
        case SubPhase.Charge:
          validCommands.push('declareCharge');
          break;
        case SubPhase.Fight:
          validCommands.push('resolveFight', 'declareWeapons');
          break;
        case SubPhase.Challenge:
          validCommands.push('declareChallenge', 'acceptChallenge', 'declineChallenge', 'selectGambit');
          break;
        case SubPhase.Resolution:
          validCommands.push('selectAftermath');
          break;
      }
      break;
  }

  return validCommands;
}
