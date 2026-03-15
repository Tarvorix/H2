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

import type { GameState, GameCommand, Position, DeclareShootingCommand, DeclareChargeCommand, PassChallengeCommand, DeclareChallengeCommand, SelectGambitCommand, AcceptChallengeCommand, DeclineChallengeCommand, SelectAftermathCommand, ResolveFightCommand, SelectTargetModelCommand, PlaceTerrainCommand, RemoveTerrainCommand, SelectWargearOptionCommand, DeclareWeaponsCommand, ManifestPsychicPowerCommand, FlyerCombatAssignment, ReserveEntryMethod } from '@hh/types';
import { Phase, SubPhase, CoreReaction, TacticalStatus, TerrainType, UnitMovementState, ModelSubType, ModelType } from '@hh/types';
import { findAdvancedReaction, findLegionWeapon, findWeapon, getDisciplineIds } from '@hh/data';
import type {
  CommandResult,
  DiceProvider,
  GameEvent,
  AdvancedReactionDeclaredEvent,
  AdvancedReactionResolvedEvent,
} from './types';
import {
  advanceSubPhase,
  advancePhase,
} from './state-machine';
import {
  setAwaitingReaction,
  clearAssaultAttackState,
  clearShootingAttackState,
  setAssaultAttackState,
  updateArmyByIndex,
  updateModelInUnit,
  updateUnitInGameState,
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
import {
  detectVehicleMoveThroughTriggers,
  getDeathOrGloryEligibleUnitIds,
  resolveDeathOrGloryReaction,
  resolveVehicleMoveThroughHits,
} from './movement/death-or-glory';

// Shooting handlers
import {
  finalizePendingShootingAttackStepEleven,
  handleShootingAttack,
  handleShootingMorale,
} from './phases/shooting-phase';
import { countCasualtiesPerUnit } from './shooting/casualty-removal';
import type { PendingMoraleCheck, ResolvedWeaponProfile, ResolvedWeaponProfileModifier } from './shooting/shooting-types';
import { markUnitReacted, isDefensiveWeapon } from './shooting/return-fire-handler';
import { executeOutOfPhaseShootingAttack } from './shooting/out-of-phase-shooting';
import { resolveDeferredMisfiresFromAttackState } from './shooting/overload-misfire';
import { resolveWeaponAssignment } from './shooting/weapon-declaration';

// Assault handlers
import {
  handleCharge,
  handleDeclareChallenge,
  handleAcceptChallenge,
  handleDeclineChallenge,
  handleSelectGambit,
  handleFight,
  handleResolution,
  handleSelectAftermath,
} from './phases/assault-phase';
import {
  getEligibleAcceptors,
  getEligibleChallengers,
} from './assault/challenge-handler';
import { resolveVolleyAttacks } from './assault/volley-attack-handler';
import { resolveChargeMove } from './assault/charge-move-handler';
import { checkOverwatchTrigger, resolveOverwatch, declineOverwatch } from './assault/overwatch-handler';
import { syncActiveCombats } from './assault/combat-state';

// Phase lifecycle handlers
import { handleStartPhase } from './phases/start-phase';
import { handleEndEffects, handleStatusCleanup, handleVictoryCheck } from './phases/end-phase';
import { recordAssaultPhaseObjectiveSnapshot } from './missions/vanguard-bonus';
import {
  declineNullifyReaction,
  handleManifestPsychicPower,
  hasAvailableManifestPsychicPower,
  resolvePsychicReaction,
} from './psychic/power-handler';
import { getModelPsychicMeleeWeapon } from './psychic/psychic-runtime';
import {
  findUnit,
  findModel,
  getReactivePlayerIndex,
  getClosestModelDistance,
  hasLOSToUnit,
  hasReactionAllotment,
  isVehicleUnit,
  findUnitPlayerIndex,
  canUnitReact,
  getAliveModels,
} from './game-queries';
import { getModelMovement, getModelType, lookupUnitProfile, modelHasSubType, unitProfileHasTrait, unitProfileHasSubType } from './profile-lookup';
import { MAX_CHARGE_RANGE } from './assault/charge-validator';

let advancedReactionHandlersInitialized = false;
const PSYCHIC_DISCIPLINE_IDS = new Set(getDisciplineIds());

type SelectReactionCommandWithMove = {
  type: 'selectReaction';
  unitId: string;
  reactionType: string;
  modelPositions?: { modelId: string; position: Position }[];
  reactingModelId?: string;
  weaponId?: string;
  profileName?: string;
};

type BattlefieldEdge = 'left' | 'right' | 'bottom' | 'top';

const FLYER_STRAIGHT_MOVE_TOLERANCE = 0.25;

function isFlyerCombatAssignment(
  assignment: FlyerCombatAssignment | ReserveEntryMethod | null | undefined,
): assignment is FlyerCombatAssignment {
  return (
    assignment === 'drop-mission' ||
    assignment === 'extraction-mission' ||
    assignment === 'strike-mission' ||
    assignment === 'strafing-run'
  );
}

function isUnitOnActiveFlyerCombatAssignment(
  unit: NonNullable<GameState['armies']>[number]['units'][number],
): unit is NonNullable<GameState['armies']>[number]['units'][number] & { flyerCombatAssignment: FlyerCombatAssignment } {
  return (
    isFlyerCombatAssignment(unit.flyerCombatAssignment) &&
    unitProfileHasSubType(unit.profileId, ModelSubType.Flyer) &&
    (unit.reserveType ?? 'standard') === 'aerial' &&
    unit.isDeployed &&
    !unit.isInReserves &&
    unit.reserveEntryMethodThisTurn === unit.flyerCombatAssignment
  );
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

function canUnitMakeHeroicIntervention(
  unit: NonNullable<GameState['armies']>[number]['units'][number],
): boolean {
  return (
    unit.hasReactedThisTurn !== true &&
    !unit.statuses.includes(TacticalStatus.Stunned) &&
    !unit.statuses.includes(TacticalStatus.Routed) &&
    unitProfileHasSubType(unit.profileId, ModelSubType.Flyer) !== true &&
    unit.isLockedInCombat &&
    unit.isDeployed &&
    unit.embarkedOnId === null
  );
}

function getChallengeCombatById(
  state: GameState,
  combatId: string,
): NonNullable<GameState['activeCombats']>[number] | null {
  return state.activeCombats?.find((combat) => combat.combatId === combatId) ?? null;
}

function appendProcessedChallengeCombatId(
  state: GameState,
  combatId: string,
): GameState {
  return {
    ...state,
    processedChallengeCombatIds: [
      ...new Set([...(state.processedChallengeCombatIds ?? []), combatId]),
    ],
  };
}

function combatHasActiveChallengeOpportunity(
  state: GameState,
  combat: NonNullable<GameState['activeCombats']>[number],
): boolean {
  const activeHasEligibleChallenger = combat.activePlayerUnitIds.some((unitId) =>
    getEligibleChallengers(state, unitId).eligibleChallengerIds.length > 0,
  );
  const reactiveHasEligibleAcceptor = combat.reactivePlayerUnitIds.some((unitId) =>
    getEligibleAcceptors(state, unitId).length > 0,
  );

  return activeHasEligibleChallenger && reactiveHasEligibleAcceptor;
}

function getRemainingChallengeCombatIds(state: GameState): string[] {
  const processedCombatIds = new Set(state.processedChallengeCombatIds ?? []);

  return (state.activeCombats ?? [])
    .filter((combat) =>
      combat.challengeState === null &&
      !processedCombatIds.has(combat.combatId) &&
      combatHasActiveChallengeOpportunity(state, combat),
    )
    .map((combat) => combat.combatId);
}

function getHeroicInterventionEligibleUnitIds(
  state: GameState,
  combat: NonNullable<GameState['activeCombats']>[number],
): string[] {
  return combat.reactivePlayerUnitIds.filter((unitId) => {
    const unit = findUnit(state, unitId);
    if (!unit || !canUnitMakeHeroicIntervention(unit)) {
      return false;
    }
    return getEligibleChallengers(state, unitId).eligibleChallengerIds.length > 0;
  });
}

function getCurrentDeathOrGloryTrigger(
  state: GameState,
): NonNullable<GameState['pendingDeathOrGloryState']>['triggers'][number] | null {
  const pendingState = state.pendingDeathOrGloryState;
  if (!pendingState) {
    return null;
  }

  return pendingState.triggers[pendingState.currentTriggerIndex] ?? null;
}

function advanceDeathOrGloryQueue(
  state: GameState,
): GameState {
  const pendingState = state.pendingDeathOrGloryState;
  if (!pendingState) {
    return state;
  }

  const nextIndex = pendingState.currentTriggerIndex + 1;
  if (nextIndex >= pendingState.triggers.length) {
    return {
      ...state,
      pendingDeathOrGloryState: undefined,
    };
  }

  return {
    ...state,
    pendingDeathOrGloryState: {
      ...pendingState,
      currentTriggerIndex: nextIndex,
    },
  };
}

function maybeOfferDeathOrGloryReaction(
  state: GameState,
  leadingEvents: GameEvent[] = [],
): CommandResult | null {
  const pendingState = state.pendingDeathOrGloryState;
  const currentTrigger = getCurrentDeathOrGloryTrigger(state);
  if (!pendingState || !currentTrigger) {
    return null;
  }

  const eligibleUnitIds = getDeathOrGloryEligibleUnitIds(
    state,
    currentTrigger.movedThroughUnitIds,
  );
  if (eligibleUnitIds.length === 0) {
    return null;
  }

  const playerIndex = findUnitPlayerIndex(state, eligibleUnitIds[0]) ?? getReactivePlayerIndex(state);
  const reactionState = setAwaitingReaction(state, true, {
    reactionType: 'death-or-glory',
    isAdvancedReaction: true,
    eligibleUnitIds,
    triggerDescription: `Vehicle model "${currentTrigger.vehicleModelId}" moved through enemy models, allowing Death or Glory.`,
    triggerSourceUnitId: currentTrigger.vehicleUnitId,
  });

  return {
    state: reactionState,
    events: [
      ...leadingEvents,
      {
        type: 'advancedReactionDeclared',
        reactionId: 'death-or-glory',
        reactionName: 'Death or Glory',
        reactingUnitId: '',
        triggerSourceUnitId: currentTrigger.vehicleUnitId,
        playerIndex,
      } as GameEvent,
    ],
    errors: [],
    accepted: true,
  };
}

function finalizeDeathOrGloryQueue(
  state: GameState,
  dice: DiceProvider,
  leadingEvents: GameEvent[] = [],
): CommandResult {
  const activeUnitId = state.pendingDeathOrGloryState?.activeUnitId ?? null;
  let currentState = state;
  const events: GameEvent[] = [...leadingEvents];

  while (currentState.pendingDeathOrGloryState) {
    const offered = maybeOfferDeathOrGloryReaction(currentState, events);
    if (offered) {
      return offered;
    }

    const currentTrigger = getCurrentDeathOrGloryTrigger(currentState);
    if (!currentTrigger) {
      currentState = {
        ...currentState,
        pendingDeathOrGloryState: undefined,
      };
      break;
    }

    const currentVehicleModel = findUnit(currentState, currentTrigger.vehicleUnitId)?.models.find(
      (model) => model.id === currentTrigger.vehicleModelId,
    );
    if (!currentVehicleModel?.isDestroyed) {
      const moveThroughHits = resolveVehicleMoveThroughHits(currentState, currentTrigger, dice);
      currentState = moveThroughHits.state;
      events.push(...moveThroughHits.events);
    }

    currentState = advanceDeathOrGloryQueue(currentState);
  }

  if (!activeUnitId) {
    return {
      state: currentState,
      events,
      errors: [],
      accepted: true,
    };
  }

  return checkAndOfferRepositionForUnit({
    state: currentState,
    events,
    errors: [],
    accepted: true,
  }, activeUnitId);
}

function getNearestBattlefieldEdge(
  position: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
): BattlefieldEdge {
  const distances: Array<[BattlefieldEdge, number]> = [
    ['left', position.x],
    ['right', battlefieldWidth - position.x],
    ['bottom', position.y],
    ['top', battlefieldHeight - position.y],
  ];
  distances.sort((left, right) => left[1] - right[1]);
  return distances[0]?.[0] ?? 'left';
}

function isCentrelineWeaponProfile(
  weaponProfile: ResolvedWeaponProfile,
  weaponId: string,
): boolean {
  const normalizedId = weaponId.toLowerCase();
  return (
    normalizedId.includes('centreline-mounted') ||
    weaponProfile.traits.some((trait) => trait.toLowerCase() === 'centreline arc of fire') ||
    weaponProfile.specialRules.some((rule) => rule.name.toLowerCase() === 'centreline arc of fire')
  );
}

function isGuidedMissileWeaponProfile(
  weaponProfile: ResolvedWeaponProfile,
  weaponId: string,
): boolean {
  const normalizedId = weaponId.toLowerCase();
  return (
    normalizedId.includes('guided-missile') ||
    weaponProfile.traits.some((trait) => trait.toLowerCase() === 'guided missile') ||
    weaponProfile.specialRules.some((rule) => rule.name.toLowerCase() === 'guided missile')
  );
}

function formatFlyerCombatAssignment(assignment: FlyerCombatAssignment): string {
  switch (assignment) {
    case 'drop-mission':
      return 'Drop Mission';
    case 'extraction-mission':
      return 'Extraction Mission';
    case 'strike-mission':
      return 'Strike Mission';
    case 'strafing-run':
      return 'Strafing Run';
  }
}

function validateFlyerCombatAssignmentMove(
  state: GameState,
  unit: NonNullable<GameState['armies']>[number]['units'][number],
  modelPositions: { modelId: string; position: Position }[],
): { code: string; message: string } | null {
  if (!isUnitOnActiveFlyerCombatAssignment(unit)) {
    return null;
  }

  const assignment = unit.flyerCombatAssignment;
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return null;
  }

  if (assignment === 'strafing-run') {
    for (const placement of modelPositions) {
      const model = aliveModels.find((candidate) => candidate.id === placement.modelId);
      if (!model) {
        continue;
      }

      const dx = placement.position.x - model.position.x;
      const dy = placement.position.y - model.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxDistance = getModelMovement(model.unitProfileId, model.profileModelName) / 2;
      if (distance > maxDistance + 0.01) {
        return {
          code: 'STRAFING_RUN_MOVE_TOO_FAR',
          message: `Flyers on a Strafing Run may move no more than half their Movement characteristic (${maxDistance}") in the Move sub-phase.`,
        };
      }
    }

    return null;
  }

  const anchorModel = aliveModels[0];
  const edge = getNearestBattlefieldEdge(
    anchorModel.position,
    state.battlefield.width,
    state.battlefield.height,
  );
  let referenceDelta: Position | null = null;

  for (const placement of modelPositions) {
    const model = aliveModels.find((candidate) => candidate.id === placement.modelId);
    if (!model) {
      continue;
    }

    const delta = {
      x: placement.position.x - model.position.x,
      y: placement.position.y - model.position.y,
    };
    if (referenceDelta === null) {
      referenceDelta = delta;
    } else if (
      Math.abs(delta.x - referenceDelta.x) > FLYER_STRAIGHT_MOVE_TOLERANCE ||
      Math.abs(delta.y - referenceDelta.y) > FLYER_STRAIGHT_MOVE_TOLERANCE
    ) {
      return {
        code: 'FLYER_COMBAT_ASSIGNMENT_TURNING_FORBIDDEN',
        message: `${formatFlyerCombatAssignment(assignment)} movement must be a straight forward translation without turning.`,
      };
    }
  }

  if (!referenceDelta) {
    return null;
  }

  const lateralDistance = edge === 'left' || edge === 'right'
    ? Math.abs(referenceDelta.y)
    : Math.abs(referenceDelta.x);
  if (lateralDistance > FLYER_STRAIGHT_MOVE_TOLERANCE) {
    return {
      code: 'FLYER_COMBAT_ASSIGNMENT_TURNING_FORBIDDEN',
      message: `${formatFlyerCombatAssignment(assignment)} movement must be straight forwards without turning.`,
    };
  }

  const movingForward =
    (edge === 'left' && referenceDelta.x >= -0.01) ||
    (edge === 'right' && referenceDelta.x <= 0.01) ||
    (edge === 'bottom' && referenceDelta.y >= -0.01) ||
    (edge === 'top' && referenceDelta.y <= 0.01);

  if (!movingForward) {
    return {
      code: 'FLYER_COMBAT_ASSIGNMENT_BACKTRACK_FORBIDDEN',
      message: `${formatFlyerCombatAssignment(assignment)} movement must continue forwards from the battlefield edge used to enter play.`,
    };
  }

  return null;
}

function getFlyerCombatAirPatrolEligibleUnitIds(state: GameState): string[] {
  const reactivePlayerIndex = getReactivePlayerIndex(state);
  const reactiveArmy = state.armies[reactivePlayerIndex];
  if (!hasReactionAllotment(reactiveArmy)) {
    return [];
  }

  return reactiveArmy.units
    .filter((unit) => isAerialReserveReactionUnit(unit))
    .map((unit) => unit.id);
}

function checkAndOfferCombatAirPatrolReaction(
  result: CommandResult,
  movedUnitId: string,
): CommandResult {
  const movedUnit = findUnit(result.state, movedUnitId);
  if (!movedUnit || !isUnitOnActiveFlyerCombatAssignment(movedUnit)) {
    return result;
  }

  const eligibleUnitIds = getFlyerCombatAirPatrolEligibleUnitIds(result.state);
  if (eligibleUnitIds.length === 0) {
    return result;
  }

  return {
    ...result,
    state: setAwaitingReaction(result.state, true, {
      reactionType: 'combat-air-patrol',
      isAdvancedReaction: false,
      eligibleUnitIds,
      triggerDescription: `Flyer "${movedUnitId}" completed its ${formatFlyerCombatAssignment(movedUnit.flyerCombatAssignment)} move, allowing Combat Air Patrol.`,
      triggerSourceUnitId: movedUnitId,
    }),
  };
}

function validateMandatoryFlyerMovesBeforeLeavingMoveSubPhase(
  state: GameState,
): { code: string; message: string } | null {
  const activeArmy = state.armies[state.activePlayerIndex];
  for (const unit of activeArmy.units) {
    if (!isUnitOnActiveFlyerCombatAssignment(unit)) {
      continue;
    }
    if (unit.movementState !== UnitMovementState.Stationary) {
      continue;
    }

    return {
      code: 'FLYER_COMBAT_ASSIGNMENT_MOVE_REQUIRED',
      message: `Flyer "${unit.id}" must complete its ${formatFlyerCombatAssignment(unit.flyerCombatAssignment)} move before ending the Move sub-phase.`,
    };
  }

  return null;
}

function returnFlyersToAerialReservesAtEndOfShooting(
  state: GameState,
): { state: GameState; events: GameEvent[] } {
  let newState = state;
  const events: GameEvent[] = [];
  const activeArmy = state.armies[state.activePlayerIndex];

  for (const unit of activeArmy.units) {
    if (!isUnitOnActiveFlyerCombatAssignment(unit)) {
      continue;
    }

    const assignment = unit.flyerCombatAssignment;
    newState = updateUnitInGameState(newState, unit.id, (currentUnit) => ({
      ...currentUnit,
      isInReserves: true,
      isDeployed: false,
      reserveReadyToEnter: false,
      movementState: UnitMovementState.Stationary,
      flyerCombatAssignment: null,
      reserveEntryMethodThisTurn: null,
      aerialReserveReturnCount: (currentUnit.aerialReserveReturnCount ?? 0) + 1,
    }));

    const embarkedUnits = newState.armies[state.activePlayerIndex].units.filter(
      (candidate) => candidate.embarkedOnId === unit.id,
    );
    for (const embarkedUnit of embarkedUnits) {
      newState = updateUnitInGameState(newState, embarkedUnit.id, (currentUnit) => ({
        ...currentUnit,
        isInReserves: true,
        isDeployed: false,
        reserveReadyToEnter: false,
        movementState: UnitMovementState.Stationary,
        reserveEntryMethodThisTurn: null,
        cannotChargeThisTurn: false,
        statuses: assignment === 'extraction-mission' ? [] : currentUnit.statuses,
      }));
    }
  }

  return { state: newState, events };
}

function getFlyerCombatAssignmentShootingOptions(
  state: GameState,
  attackerUnit: NonNullable<GameState['armies']>[number]['units'][number],
  command: DeclareShootingCommand,
): { error?: { code: string; message: string }; weaponProfileModifier?: ResolvedWeaponProfileModifier } {
  if (!isUnitOnActiveFlyerCombatAssignment(attackerUnit)) {
    return {};
  }

  const assignment = attackerUnit.flyerCombatAssignment;
  let strikeUsesCentreline = false;

  for (const selection of command.weaponSelections) {
    const weaponProfile = resolveWeaponAssignment({
      modelId: selection.modelId,
      weaponId: selection.weaponId,
      profileName: selection.profileName,
    }, attackerUnit, state);
    if (!weaponProfile) {
      continue;
    }

    if (assignment === 'drop-mission' || assignment === 'extraction-mission') {
      if (!isDefensiveWeapon(weaponProfile.rangedStrength, weaponProfile.traits)) {
        return {
          error: {
            code: 'FLYER_DEFENSIVE_WEAPONS_ONLY',
            message: `${formatFlyerCombatAssignment(assignment)} allows only Defensive Weapons to fire in the Shooting phase.`,
          },
        };
      }
      continue;
    }

    if (assignment === 'strike-mission') {
      const isCentreline = isCentrelineWeaponProfile(weaponProfile, selection.weaponId);
      const isGuidedMissile = isGuidedMissileWeaponProfile(weaponProfile, selection.weaponId);
      if (!isCentreline && !isGuidedMissile) {
        return {
          error: {
            code: 'STRIKE_MISSION_WEAPON_RESTRICTED',
            message: 'Strike Mission allows only Centreline Arc of Fire weapons or Guided Missile weapons to fire.',
          },
        };
      }
      if (isCentreline) {
        strikeUsesCentreline = true;
      }
    }
  }

  if (assignment !== 'strike-mission' || !strikeUsesCentreline) {
    return {};
  }

  const weaponProfileModifier: ResolvedWeaponProfileModifier = (weaponProfile, context) => {
    if (!isCentrelineWeaponProfile(weaponProfile, context.weaponId)) {
      return weaponProfile;
    }
    if (weaponProfile.traits.some((trait) => trait.toLowerCase() === 'heavy')) {
      return weaponProfile;
    }

    return {
      ...weaponProfile,
      traits: [...weaponProfile.traits, 'Heavy'],
    };
  };

  return { weaponProfileModifier };
}

function validateFlyerEmbarkCommand(
  state: GameState,
  transportId: string,
): { code: string; message: string } | null {
  const transport = findUnit(state, transportId);
  if (!transport || !isUnitOnActiveFlyerCombatAssignment(transport)) {
    return null;
  }

  switch (transport.flyerCombatAssignment) {
    case 'strike-mission':
    case 'strafing-run':
      return {
        code: 'FLYER_EMBARK_FORBIDDEN',
        message: `${formatFlyerCombatAssignment(transport.flyerCombatAssignment)} does not allow units to embark.`,
      };
    case 'extraction-mission':
      if (transport.movementState === UnitMovementState.Stationary) {
        return {
          code: 'EXTRACTION_MISSION_MOVE_REQUIRED',
          message: 'Units may only embark on a Flyer performing an Extraction Mission after that Flyer completes its move.',
        };
      }
      return null;
    default:
      return null;
  }
}

function validateFlyerDisembarkCommand(
  state: GameState,
  embarkedUnitId: string,
): { code: string; message: string } | null {
  const unit = findUnit(state, embarkedUnitId);
  const transportId = unit?.embarkedOnId;
  if (!transportId) {
    return null;
  }

  const transport = findUnit(state, transportId);
  if (!transport || !isUnitOnActiveFlyerCombatAssignment(transport)) {
    return null;
  }

  switch (transport.flyerCombatAssignment) {
    case 'drop-mission':
      if (transport.movementState === UnitMovementState.Stationary) {
        return {
          code: 'DROP_MISSION_MOVE_REQUIRED',
          message: 'Embarked units may only disembark from a Flyer performing a Drop Mission after that Flyer completes its move.',
        };
      }
      return null;
    case 'extraction-mission':
    case 'strike-mission':
    case 'strafing-run':
      return {
        code: 'FLYER_DISEMBARK_FORBIDDEN',
        message: `${formatFlyerCombatAssignment(transport.flyerCombatAssignment)} does not allow embarked units to disembark.`,
      };
  }
}

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

    case 'manifestPsychicPower':
      return processManifestPsychicPower(state, command, dice);

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

    case 'passChallenge':
      return processPassChallenge(state, command, dice);

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

  const modelInfo = findModel(state, command.modelId);
  if (modelInfo) {
    const flyerMoveError = validateFlyerCombatAssignmentMove(state, modelInfo.unit, [{
      modelId: command.modelId,
      position: command.targetPosition,
    }]);
    if (flyerMoveError) {
      return reject(state, flyerMoveError.code, flyerMoveError.message);
    }
  }

  // Delegate to move handler
  const result = handleMoveModel(state, command.modelId, command.targetPosition, dice);

  if (!result.accepted) {
    return result;
  }

  const movedUnit = modelInfo ? findUnit(result.state, modelInfo.unit.id) : undefined;
  if (movedUnit && isUnitOnActiveFlyerCombatAssignment(movedUnit)) {
    return checkAndOfferCombatAirPatrolReaction(result, movedUnit.id);
  }

  if (!modelInfo) {
    return result;
  }

  const deathOrGloryResult = checkAndResolveVehicleMoveThrough(
    state,
    result,
    modelInfo.unit.id,
    [{ modelId: command.modelId, position: command.targetPosition }],
    dice,
  );
  if (deathOrGloryResult) {
    return deathOrGloryResult;
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

  const movingUnit = findUnit(state, command.unitId);
  if (movingUnit) {
    const flyerMoveError = validateFlyerCombatAssignmentMove(state, movingUnit, command.modelPositions);
    if (flyerMoveError) {
      return reject(state, flyerMoveError.code, flyerMoveError.message);
    }
  }

  const result = handleMoveUnit(state, command.unitId, command.modelPositions, dice, {
    isRush: command.isRush === true,
  });
  if (!result.accepted) {
    return result;
  }

  const movedUnit = findUnit(result.state, command.unitId);
  if (movedUnit && isUnitOnActiveFlyerCombatAssignment(movedUnit)) {
    return checkAndOfferCombatAirPatrolReaction(result, command.unitId);
  }

  const deathOrGloryResult = checkAndResolveVehicleMoveThrough(
    state,
    result,
    command.unitId,
    command.modelPositions,
    dice,
  );
  if (deathOrGloryResult) {
    return deathOrGloryResult;
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
  command: {
    type: 'deployUnit';
    unitId: string;
    modelPositions: { modelId: string; position: Position }[];
    combatAssignment?: import('@hh/types').FlyerCombatAssignment;
  },
  dice: DiceProvider,
): CommandResult {
  // deployUnit can be used in Reserves sub-phase (for placing after passing test)
  // or potentially during setup. For now, route to reserves entry.
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Reserves) {
    return reject(state, 'WRONG_PHASE', `deployUnit requires Movement/Reserves phase (currently ${state.currentPhase}/${state.currentSubPhase})`);
  }

  const result = handleReservesEntry(state, command.unitId, command.modelPositions, dice, command.combatAssignment);
  if (!result.accepted) {
    return result;
  }

  return checkAndOfferReserveEntryReaction(result, command.unitId);
}

function isAerialReserveReactionUnit(unit: NonNullable<GameState['armies']>[number]['units'][number]): boolean {
  return (
    unit.isInReserves &&
    (unit.reserveType ?? 'standard') === 'aerial' &&
    unit.hasReactedThisTurn !== true &&
    !unit.statuses.includes(TacticalStatus.Stunned) &&
    !unit.statuses.includes(TacticalStatus.Routed) &&
    unitProfileHasTrait(unit.profileId, 'Interceptor')
  );
}

function getDistanceToNearestBattlefieldEdge(
  position: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
): number {
  return Math.min(
    position.x,
    battlefieldWidth - position.x,
    position.y,
    battlefieldHeight - position.y,
  );
}

function checkAndResolveVehicleMoveThrough(
  preMoveState: GameState,
  result: CommandResult,
  activeUnitId: string,
  modelPositions: Array<{ modelId: string; position: Position }>,
  dice: DiceProvider,
): CommandResult | null {
  const triggers = detectVehicleMoveThroughTriggers(
    preMoveState,
    activeUnitId,
    modelPositions,
  );
  if (triggers.length === 0) {
    return null;
  }

  const queuedState: GameState = {
    ...result.state,
    pendingDeathOrGloryState: {
      activeUnitId,
      currentTriggerIndex: 0,
      triggers,
    },
  };

  return finalizeDeathOrGloryQueue(queuedState, dice, result.events);
}

function checkAndOfferReserveEntryReaction(
  result: CommandResult,
  enteredUnitId: string,
): CommandResult {
  const enteredUnit = findUnit(result.state, enteredUnitId);
  if (!enteredUnit) {
    return result;
  }

  const reactivePlayerIndex = getReactivePlayerIndex(result.state);
  const reactiveArmy = result.state.armies[reactivePlayerIndex];
  if (!hasReactionAllotment(reactiveArmy)) {
    return result;
  }

  const interceptEligibleUnitIds = reactiveArmy.units
    .filter((unit) => canUnitReact(unit) && hasLOSToUnit(result.state, unit.id, enteredUnitId))
    .map((unit) => unit.id);
  const eligibleUnitIds = [...new Set(interceptEligibleUnitIds)];
  if (eligibleUnitIds.length === 0) {
    return result;
  }

  return {
    ...result,
    state: setAwaitingReaction(result.state, true, {
      reactionType: 'reserve-entry-intercept',
      isAdvancedReaction: false,
      eligibleUnitIds,
      triggerDescription:
        (enteredUnit.reserveType ?? 'standard') === 'aerial'
          ? `Unit "${enteredUnitId}" entered play from Aerial Reserves, allowing Intercept.`
          : `Unit "${enteredUnitId}" entered play from Reserves, allowing Intercept.`,
      triggerSourceUnitId: enteredUnitId,
    }),
  };
}

function resolveInterceptReaction(
  state: GameState,
  reactingUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
): CommandResult {
  const reactingUnit = findUnit(state, reactingUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!reactingUnit) {
    return reject(state, 'UNIT_NOT_FOUND', `Reacting unit '${reactingUnitId}' was not found.`);
  }
  if (!targetUnit) {
    return reject(state, 'UNIT_NOT_FOUND', `Target unit '${targetUnitId}' was not found.`);
  }

  const preserveFullBSForStrafingRun =
    isUnitOnActiveFlyerCombatAssignment(targetUnit) &&
    targetUnit.flyerCombatAssignment === 'strafing-run';

  const attack = executeOutOfPhaseShootingAttack(
    setAwaitingReaction(state, false),
    reactingUnitId,
    targetUnitId,
    dice,
    {
      forceSnapShots: !preserveFullBSForStrafingRun,
      defensiveWeaponsOnly: isVehicleUnit(reactingUnit),
    },
  );
  if (!attack.accepted) {
    return {
      state: attack.state,
      events: attack.events,
      errors: [{ code: 'INTERCEPT_FAILED', message: 'The Intercept reaction could not be resolved.' }],
      accepted: false,
    };
  }

  return {
    state: markUnitReacted(attack.state, reactingUnitId),
    events: attack.events,
    errors: [],
    accepted: true,
  };
}

function resolveCombatAirPatrolReaction(
  state: GameState,
  reactingUnitId: string,
  targetUnitId: string,
  modelPositions: { modelId: string; position: Position }[] | undefined,
  dice: DiceProvider,
): CommandResult {
  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return reject(state, 'UNIT_NOT_FOUND', `Reacting unit '${reactingUnitId}' was not found.`);
  }

  if (!isAerialReserveReactionUnit(reactingUnit)) {
    return reject(
      state,
      'INVALID_COMBAT_AIR_PATROL_UNIT',
      'Combat Air Patrol requires a reacting unit in Aerial Reserves with the Interceptor trait.',
    );
  }

  if (!modelPositions || modelPositions.length === 0) {
    return reject(
      state,
      'MODEL_POSITIONS_REQUIRED',
      'Combat Air Patrol requires final model positions so the reacting flyer can enter from the battlefield edge.',
    );
  }

  const aliveModelIds = new Set(getAliveModels(reactingUnit).map((model) => model.id));
  for (const model of getAliveModels(reactingUnit)) {
    if (!modelPositions.some((candidate) => candidate.modelId === model.id)) {
      return reject(
        state,
        'MISSING_MODEL_POSITION',
        `Combat Air Patrol requires a destination for model '${model.id}'.`,
      );
    }
  }

  for (const placement of modelPositions) {
    if (!aliveModelIds.has(placement.modelId)) {
      continue;
    }

    if (
      placement.position.x < 0 ||
      placement.position.y < 0 ||
      placement.position.x > state.battlefield.width ||
      placement.position.y > state.battlefield.height
    ) {
      return reject(state, 'OUT_OF_BOUNDS', 'Combat Air Patrol placement must remain on the battlefield.');
    }

    const model = reactingUnit.models.find((candidate) => candidate.id === placement.modelId);
    if (!model) {
      continue;
    }

    const maxMove = getModelMovement(model.unitProfileId, model.profileModelName);
    const distanceToEdge = getDistanceToNearestBattlefieldEdge(
      placement.position,
      state.battlefield.width,
      state.battlefield.height,
    );
    if (distanceToEdge > maxMove + 0.01) {
      return reject(
        state,
        'COMBAT_AIR_PATROL_MOVE_TOO_FAR',
        `Model '${placement.modelId}' exceeds the legal Combat Air Patrol move from the battlefield edge.`,
      );
    }

    for (const terrain of state.terrain) {
      if (terrain.type === TerrainType.Impassable && terrain.shape.kind === 'circle') {
        const dx = placement.position.x - terrain.shape.center.x;
        const dy = placement.position.y - terrain.shape.center.y;
        if (Math.sqrt(dx * dx + dy * dy) <= terrain.shape.radius) {
          return reject(
            state,
            'IN_IMPASSABLE_TERRAIN',
            `Combat Air Patrol placement for model '${placement.modelId}' ends in impassable terrain.`,
          );
        }
      }
    }
  }

  let enteredState = setAwaitingReaction(state, false);
  for (const placement of modelPositions) {
    if (!aliveModelIds.has(placement.modelId)) {
      continue;
    }
    enteredState = updateUnitInGameState(enteredState, reactingUnitId, (unit) =>
      updateModelInUnit(unit, placement.modelId, (model) => ({
        ...model,
        position: placement.position,
      })),
    );
  }

  enteredState = updateUnitInGameState(enteredState, reactingUnitId, (unit) => ({
    ...unit,
    isInReserves: false,
    isDeployed: true,
    reserveReadyToEnter: false,
    movementState: UnitMovementState.Moved,
    reserveEntryMethodThisTurn: 'combat-air-patrol',
  }));

  const weaponProfileModifier: ResolvedWeaponProfileModifier = (weaponProfile) => (
    weaponProfile.traits.some((trait) => trait.toLowerCase() === 'defensive')
      ? weaponProfile
      : {
          ...weaponProfile,
          traits: [...weaponProfile.traits, 'Defensive'],
        }
  );

  const attack = executeOutOfPhaseShootingAttack(
    enteredState,
    reactingUnitId,
    targetUnitId,
    dice,
    {
      weaponProfileModifier,
    },
  );
  if (!attack.accepted) {
    return {
      state: attack.state,
      events: attack.events,
      errors: [{ code: 'COMBAT_AIR_PATROL_FAILED', message: 'The Combat Air Patrol attack could not be resolved.' }],
      accepted: false,
    };
  }

  let newState = markUnitReacted(attack.state, reactingUnitId);
  newState = updateUnitInGameState(newState, reactingUnitId, (unit) => ({
    ...unit,
    isInReserves: true,
    isDeployed: false,
    reserveReadyToEnter: false,
    movementState: UnitMovementState.Stationary,
    reserveEntryMethodThisTurn: null,
    aerialReserveReturnCount: (unit.aerialReserveReturnCount ?? 0) + 1,
  }));

  return {
    state: newState,
    events: attack.events,
    errors: [],
    accepted: true,
  };
}

function resolveEvadeReaction(
  state: GameState,
  reactingUnitId: string,
  chargingUnitId: string,
  modelPositions: { modelId: string; position: Position }[] | undefined,
  dice: DiceProvider,
): CommandResult {
  const attackState = state.assaultAttackState;
  if (!attackState || attackState.chargeStep !== 'CHARGE_ROLL') {
    return reject(state, 'EVADE_UNAVAILABLE', 'Evade may only be resolved after charge volley attacks and before the charge roll.');
  }
  if (attackState.targetUnitId !== reactingUnitId || attackState.chargingUnitId !== chargingUnitId) {
    return reject(state, 'EVADE_TARGET_MISMATCH', 'The selected Evade unit does not match the pending charge target.');
  }
  if (!modelPositions || modelPositions.length === 0) {
    return reject(state, 'MODEL_POSITIONS_REQUIRED', 'Evade requires final model positions for the reacting unit.');
  }

  const repositionResult = handleRepositionReaction(
    state,
    reactingUnitId,
    modelPositions,
    dice,
  );
  if (!repositionResult.accepted) {
    return repositionResult;
  }

  const clearedReactionState = setAwaitingReaction(repositionResult.state, false);
  const updatedDistance = getClosestModelDistance(clearedReactionState, chargingUnitId, reactingUnitId);
  if (updatedDistance > MAX_CHARGE_RANGE) {
    return {
      state: clearAssaultAttackState(clearedReactionState),
      events: repositionResult.events,
      errors: [],
      accepted: true,
    };
  }

  const resumedState = setAssaultAttackState(clearedReactionState, {
    ...attackState,
    closestDistance: updatedDistance,
    chargeStep: 'CHARGE_ROLL',
  });

  return resumePendingActionAfterAdvancedReaction(
    resumedState,
    dice,
    repositionResult.events,
  );
}

function resolveHeroicInterventionReaction(
  state: GameState,
  reactingUnitId: string,
  combatId: string,
): CommandResult {
  const preparedState = state.activeCombats && state.activeCombats.length > 0
    ? state
    : syncActiveCombats(state).state;
  const combat = getChallengeCombatById(preparedState, combatId);
  const reactingUnit = findUnit(preparedState, reactingUnitId);
  const reactingPlayerIndex = findUnitPlayerIndex(preparedState, reactingUnitId);

  if (!combat) {
    return reject(preparedState, 'COMBAT_NOT_FOUND', `Combat "${combatId}" was not found.`);
  }
  if (!reactingUnit || reactingPlayerIndex === undefined) {
    return reject(preparedState, 'UNIT_NOT_FOUND', `Reacting unit "${reactingUnitId}" was not found.`);
  }
  if (!combat.reactivePlayerUnitIds.includes(reactingUnitId)) {
    return reject(
      preparedState,
      'UNIT_NOT_ELIGIBLE',
      'Heroic Intervention requires a reacting unit from the combat that was passed.',
    );
  }
  if (!canUnitMakeHeroicIntervention(reactingUnit)) {
    return reject(
      preparedState,
      'UNIT_NOT_ELIGIBLE',
      'The selected unit cannot make a Heroic Intervention reaction.',
    );
  }
  if (getEligibleChallengers(preparedState, reactingUnitId).eligibleChallengerIds.length === 0) {
    return reject(
      preparedState,
      'UNIT_NOT_ELIGIBLE',
      'The selected unit has no eligible challenger for Heroic Intervention.',
    );
  }

  let newState = updateArmyByIndex(preparedState, reactingPlayerIndex, (army) => ({
    ...army,
    reactionAllotmentRemaining: Math.max(0, army.reactionAllotmentRemaining - 1),
  }));
  newState = updateUnitInGameState(newState, reactingUnitId, (unit) => ({
    ...unit,
    hasReactedThisTurn: true,
  }));
  newState = setAwaitingReaction(newState, false);
  newState = {
    ...newState,
    pendingHeroicInterventionState: {
      combatId,
      reactingPlayerIndex,
      activePlayerIndex: preparedState.activePlayerIndex,
      reactingUnitId,
    },
  };

  return {
    state: newState,
    events: [],
    errors: [],
    accepted: true,
  };
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

  const flyerEmbarkError = validateFlyerEmbarkCommand(state, command.transportId);
  if (flyerEmbarkError) {
    return reject(state, flyerEmbarkError.code, flyerEmbarkError.message);
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

  const flyerDisembarkError = validateFlyerDisembarkCommand(state, command.unitId);
  if (flyerDisembarkError) {
    return reject(state, flyerDisembarkError.code, flyerDisembarkError.message);
  }

  return handleDisembark(state, command.unitId, command.modelPositions, dice);
}

function processManifestPsychicPower(
  state: GameState,
  command: ManifestPsychicPowerCommand,
  dice: DiceProvider,
): CommandResult {
  return handleManifestPsychicPower(state, command, dice);
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

  const attackerUnit = findUnit(state, command.attackingUnitId);
  if (attackerUnit) {
    const flyerShooting = getFlyerCombatAssignmentShootingOptions(state, attackerUnit, command);
    if (flyerShooting.error) {
      return reject(state, flyerShooting.error.code, flyerShooting.error.message);
    }

    return handleShootingAttack(state, command, dice, {
      weaponProfileModifier: flyerShooting.weaponProfileModifier,
    });
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
    weaponTraits: check.weaponTraits ? [...check.weaponTraits] : undefined,
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

function processPassChallenge(
  state: GameState,
  command: PassChallengeCommand,
  _dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', 'passChallenge requires Assault/Challenge phase');
  }

  const preparedState = state.activeCombats && state.activeCombats.length > 0
    ? state
    : syncActiveCombats(state).state;
  if (preparedState.pendingHeroicInterventionState) {
    return reject(
      preparedState,
      'HEROIC_INTERVENTION_PENDING',
      'Resolve the pending Heroic Intervention before passing another combat.',
    );
  }
  if (preparedState.activeCombats?.some((combat) => combat.challengeState && combat.challengeState.currentStep !== 'GLORY')) {
    return reject(preparedState, 'CHALLENGE_IN_PROGRESS', 'Resolve the active challenge before passing another combat.');
  }
  const combat = getChallengeCombatById(preparedState, command.combatId);
  if (!combat) {
    return reject(preparedState, 'COMBAT_NOT_FOUND', `Combat "${command.combatId}" was not found.`);
  }
  if (combat.challengeState) {
    return reject(preparedState, 'CHALLENGE_ALREADY_ACTIVE', 'This combat already has an active challenge.');
  }
  if (preparedState.processedChallengeCombatIds?.includes(command.combatId)) {
    return reject(
      preparedState,
      'CHALLENGE_COMBAT_ALREADY_PROCESSED',
      'This combat has already been processed in the current Challenge sub-phase.',
    );
  }
  if (!combatHasActiveChallengeOpportunity(preparedState, combat)) {
    return reject(
      preparedState,
      'CHALLENGE_NOT_AVAILABLE',
      'This combat does not currently have an eligible Challenge Step 1 declaration.',
    );
  }

  let newState = appendProcessedChallengeCombatId(preparedState, combat.combatId);
  const reactivePlayerIndex = getReactivePlayerIndex(preparedState);
  const reactiveArmy = preparedState.armies[reactivePlayerIndex];
  const heroicEligibleUnitIds = hasReactionAllotment(reactiveArmy)
    ? getHeroicInterventionEligibleUnitIds(preparedState, combat)
    : [];

  if (heroicEligibleUnitIds.length === 0) {
    return {
      state: newState,
      events: [],
      errors: [],
      accepted: true,
    };
  }

  newState = setAwaitingReaction(newState, true, {
    reactionType: 'heroic-intervention',
    isAdvancedReaction: true,
    eligibleUnitIds: heroicEligibleUnitIds,
    triggerDescription: `The active player passed combat "${combat.combatId}", allowing Heroic Intervention.`,
    triggerSourceUnitId: combat.combatId,
  });

  return {
    state: newState,
    events: [],
    errors: [],
    accepted: true,
  };
}

function processDeclareChallenge(
  state: GameState,
  command: DeclareChallengeCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Assault || state.currentSubPhase !== SubPhase.Challenge) {
    return reject(state, 'WRONG_PHASE', `declareChallenge requires Assault/Challenge phase`);
  }
  const preparedState = state.activeCombats && state.activeCombats.length > 0
    ? state
    : syncActiveCombats(state).state;
  if (
    !preparedState.pendingHeroicInterventionState &&
    preparedState.activeCombats?.some((combat) => combat.challengeState && combat.challengeState.currentStep !== 'GLORY')
  ) {
    return reject(preparedState, 'CHALLENGE_IN_PROGRESS', 'Resolve the active challenge before declaring another.');
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

    case SubPhase.Resolution: {
      let currentState = state;
      const events: GameEvent[] = [];
      const combats = (state.activeCombats ?? []) as import('./assault/assault-types').CombatState[];
      for (const combat of combats) {
        result = handleResolution(currentState, dice, combat.combatId);
        currentState = result.state;
        events.push(...result.events);
      }
      return { state: currentState, events };
    }

    default:
      // Not an auto-process sub-phase — no action needed
      return { state, events: [] };
  }
}

function prepareEnteredSubPhase(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.currentPhase !== Phase.Assault) {
    return { state, events: [] };
  }

  if (state.currentSubPhase === SubPhase.Charge) {
    return {
      state: recordAssaultPhaseObjectiveSnapshot(state),
      events: [],
    };
  }

  if (
    state.currentSubPhase === SubPhase.Fight ||
    state.currentSubPhase === SubPhase.Resolution
  ) {
    const synced = syncActiveCombats({
      ...state,
      pendingHeroicInterventionState: undefined,
      processedChallengeCombatIds: undefined,
    });
    return { state: synced.state, events: synced.events };
  }

  if (state.currentSubPhase === SubPhase.Challenge) {
    const synced = syncActiveCombats({
      ...state,
      pendingHeroicInterventionState: undefined,
      processedChallengeCombatIds: [],
    });
    return { state: synced.state, events: synced.events };
  }

  return { state, events: [] };
}

/**
 * Process an endSubPhase command.
 * Advances to the next sub-phase, then auto-processes phase lifecycle handlers
 * if the new sub-phase is engine-driven (StartEffects, EndEffects, Statuses, Victory).
 */
function processEndSubPhase(state: GameState, dice: DiceProvider): CommandResult {
  const events: GameEvent[] = [];

  if (state.currentPhase === Phase.Movement && state.currentSubPhase === SubPhase.Move) {
    const flyerMoveError = validateMandatoryFlyerMovesBeforeLeavingMoveSubPhase(state);
    if (flyerMoveError) {
      return reject(state, flyerMoveError.code, flyerMoveError.message);
    }
  }

  let baseState = state;
  if (state.currentPhase === Phase.Assault && state.currentSubPhase === SubPhase.Challenge) {
    const syncedChallengeState = state.activeCombats && state.activeCombats.length > 0
      ? state
      : syncActiveCombats(state).state;

    if (syncedChallengeState.pendingHeroicInterventionState) {
      return reject(
        syncedChallengeState,
        'HEROIC_INTERVENTION_PENDING',
        'Resolve the pending Heroic Intervention before ending the Challenge sub-phase.',
      );
    }

    const unresolvedChallenge = syncedChallengeState.activeCombats?.find((combat) =>
      combat.challengeState !== null && combat.challengeState.currentStep !== 'GLORY',
    );
    if (unresolvedChallenge) {
      return reject(
        syncedChallengeState,
        'CHALLENGE_IN_PROGRESS',
        'Resolve the active challenge before ending the Challenge sub-phase.',
      );
    }

    if (getRemainingChallengeCombatIds(syncedChallengeState).length > 0) {
      return reject(
        syncedChallengeState,
        'CHALLENGE_COMBATS_REMAIN',
        'At least one eligible combat still needs a Challenge Step 1 decision.',
      );
    }

    baseState = syncedChallengeState;
  }
  if (state.currentPhase === Phase.Shooting && state.currentSubPhase === SubPhase.ShootingMorale) {
    const returned = returnFlyersToAerialReservesAtEndOfShooting(state);
    baseState = returned.state;
    events.push(...returned.events);
  }

  // Advance to the next sub-phase
  const { state: advancedState, events: advanceEvents } = advanceSubPhase(baseState);
  events.push(...advanceEvents);

  const { state: preparedState, events: prepareEvents } = prepareEnteredSubPhase(advancedState);
  events.push(...prepareEvents);

  // Auto-process the new sub-phase if it's engine-driven
  const { state: processedState, events: processEvents } = autoProcessSubPhase(preparedState, dice);
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
  if (state.currentPhase === Phase.Movement && state.currentSubPhase === SubPhase.Move) {
    const flyerMoveError = validateMandatoryFlyerMovesBeforeLeavingMoveSubPhase(state);
    if (flyerMoveError) {
      return reject(state, flyerMoveError.code, flyerMoveError.message);
    }
  }

  let baseState = state;
  const events: GameEvent[] = [];
  if (state.currentPhase === Phase.Shooting) {
    const returned = returnFlyersToAerialReservesAtEndOfShooting(state);
    baseState = returned.state;
    events.push(...returned.events);
  }

  const { state: advancedState, events: advanceEvents } = advancePhase(baseState);
  events.push(...advanceEvents);
  const { state: preparedState, events: prepareEvents } = prepareEnteredSubPhase(advancedState);
  events.push(...prepareEvents);

  // Auto-process the new sub-phase if it's engine-driven
  const { state: processedState, events: processEvents } = autoProcessSubPhase(preparedState, dice);
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
  const { chargingUnitId, targetUnitId, isDisordered } = attackState;

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
    const currentChargeDistance = getClosestModelDistance(resumedState, chargingUnitId, targetUnitId);
    const targetUnit = findUnit(resumedState, targetUnitId);
    const targetPlayerIndex = findUnitPlayerIndex(resumedState, targetUnitId);
    if (
      targetUnit &&
      targetPlayerIndex !== undefined &&
      resumedState.armies[targetPlayerIndex].reactionAllotmentRemaining > 0 &&
      canUnitReact(targetUnit) &&
      unitQualifiesForEvade(targetUnit)
    ) {
      const reactionState = setAwaitingReaction(resumedState, true, {
        reactionType: 'evade',
        isAdvancedReaction: true,
        eligibleUnitIds: [targetUnitId],
        triggerDescription: `Charge by unit "${chargingUnitId}" allows Evade.`,
        triggerSourceUnitId: chargingUnitId,
      });

      return {
        state: setAssaultAttackState(reactionState, {
          ...attackState,
          chargeStep: 'CHARGE_ROLL',
          closestDistance: currentChargeDistance,
        }),
        events: [
          ...events,
          {
            type: 'advancedReactionDeclared' as const,
            reactionId: 'evade',
            reactionName: 'evade',
            reactingUnitId: '',
            triggerSourceUnitId: chargingUnitId,
            playerIndex: targetPlayerIndex,
          },
        ],
      };
    }

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
          closestDistance: currentChargeDistance,
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
      currentChargeDistance,
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
      currentStep: 'REMOVING_CASUALTIES',
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
  const overwatchAttack = executeOutOfPhaseShootingAttack(
    currentState,
    reactingUnitId,
    chargingUnitId,
    dice,
    {
      forceNoSnapShots: true,
      allowReturnFireTrigger: false,
      suppressMoraleAndStatusChecks: true,
      blockShroudedDamageMitigation: true,
    },
  );

  if (overwatchAttack.accepted) {
    currentState = overwatchAttack.state;
    events.push(...overwatchAttack.events);
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
  const { chargingUnitId, targetUnitId, isDisordered } = attackState;
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
    const currentChargeDistance = getClosestModelDistance(newState, chargingUnitId, targetUnitId);
    const targetUnit = findUnit(newState, targetUnitId);
    const targetPlayerIndex = findUnitPlayerIndex(newState, targetUnitId);
    if (
      targetUnit &&
      targetPlayerIndex !== undefined &&
      newState.armies[targetPlayerIndex].reactionAllotmentRemaining > 0 &&
      canUnitReact(targetUnit) &&
      unitQualifiesForEvade(targetUnit)
    ) {
      const reactionState = setAwaitingReaction(newState, true, {
        reactionType: 'evade',
        isAdvancedReaction: true,
        eligibleUnitIds: [targetUnitId],
        triggerDescription: `Charge by unit "${chargingUnitId}" allows Evade.`,
        triggerSourceUnitId: chargingUnitId,
      });

      return {
        state: setAssaultAttackState(reactionState, {
          ...attackState,
          chargeStep: 'CHARGE_ROLL',
          closestDistance: currentChargeDistance,
        }),
        events: [
          ...events,
          {
            type: 'advancedReactionDeclared',
            reactionId: 'evade',
            reactionName: 'evade',
            reactingUnitId: '',
            triggerSourceUnitId: chargingUnitId,
            playerIndex: targetPlayerIndex,
          } as GameEvent,
        ],
        errors: [],
        accepted: true,
      };
    }

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
          closestDistance: currentChargeDistance,
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
      currentChargeDistance,
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
      blastPlacements: pendingAttack.blastPlacements,
      templatePlacements: pendingAttack.templatePlacements,
      psychicPower: pendingAttack.declaredPsychicPower,
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
      psychicPower: pendingCharge.declaredPsychicPower,
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
    const currentChargeDistance = getClosestModelDistance(
      state,
      pendingCharge.chargingUnitId,
      pendingCharge.targetUnitId,
    );
    const chargeResult = resolveChargeMove(
      state,
      pendingCharge.chargingUnitId,
      pendingCharge.targetUnitId,
      dice,
      currentChargeDistance,
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
  command: SelectReactionCommandWithMove,
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
    const repositionResult = handleRepositionReaction(
      state,
      command.unitId,
      command.modelPositions ?? [],
      dice,
    );
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

  if (state.pendingReaction.reactionType === 'ws-chasing-wind') {
    return processChasingTheWindReaction(state, command, dice);
  }

  if (state.pendingReaction.reactionType === 'reserve-entry-intercept') {
    const targetUnitId = state.pendingReaction.triggerSourceUnitId;
    if (!targetUnitId) {
      return reject(state, 'INTERCEPT_SOURCE_MISSING', 'Unable to resolve the reserve-entry reaction target.');
    }

    const reactingUnit = findUnit(state, command.unitId);
    const targetUnit = findUnit(state, targetUnitId);
    if (!reactingUnit || !targetUnit) {
      return reject(state, 'UNIT_NOT_FOUND', 'Unable to resolve the reserve-entry reaction units.');
    }

    if (
      (targetUnit.reserveType ?? 'standard') === 'aerial' &&
      isAerialReserveReactionUnit(reactingUnit)
    ) {
      return resolveCombatAirPatrolReaction(
        state,
        command.unitId,
        targetUnitId,
        command.modelPositions,
        dice,
      );
    }

    return resolveInterceptReaction(state, command.unitId, targetUnitId, dice);
  }

  if (state.pendingReaction.reactionType === 'combat-air-patrol') {
    const targetUnitId = state.pendingReaction.triggerSourceUnitId;
    if (!targetUnitId) {
      return reject(state, 'COMBAT_AIR_PATROL_SOURCE_MISSING', 'Unable to resolve the Combat Air Patrol target.');
    }

    return resolveCombatAirPatrolReaction(
      state,
      command.unitId,
      targetUnitId,
      command.modelPositions,
      dice,
    );
  }

  // Handle Return Fire reaction
  if (state.pendingReaction.reactionType === CoreReaction.ReturnFire) {
    const targetUnitId = state.pendingReaction.triggerSourceUnitId;
    if (!targetUnitId) {
      return reject(state, 'RETURN_FIRE_SOURCE_MISSING', 'Unable to resolve Return Fire target unit.');
    }

    let newState = setAwaitingReaction(state, false);
    const events: GameEvent[] = [];
    const reactingUnit = findUnit(newState, command.unitId);
    const returnFireAttack = executeOutOfPhaseShootingAttack(
      newState,
      command.unitId,
      targetUnitId,
      dice,
      {
        countsAsStationary: true,
        defensiveWeaponsOnly: reactingUnit ? isVehicleUnit(reactingUnit) : false,
        allowReturnFireTrigger: false,
        suppressMoraleAndStatusChecks: true,
      },
    );

    if (returnFireAttack.accepted) {
      newState = returnFireAttack.state;
      events.push(...returnFireAttack.events);
    }

    const deferredMisfires = resolveDeferredMisfiresFromAttackState(newState, dice);
    if (!deferredMisfires.accepted) {
      return deferredMisfires;
    }
    newState = deferredMisfires.state;
    events.push(...deferredMisfires.events);

    // Declared reactions consume allotment even when no weapons can be brought to bear.
    newState = markUnitReacted(newState, command.unitId);
    newState = finalizePendingReturnFireAttackState(newState);
    newState = setAwaitingReaction(newState, false);
    const finalized = finalizePendingShootingAttackStepEleven(newState, dice);
    if (!finalized.accepted) {
      return finalized;
    }

    return {
      state: finalized.state,
      events: [...events, ...finalized.events],
      errors: [],
      accepted: true,
    };
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

  if (state.pendingReaction.reactionType === 'evade') {
    const chargingUnitId =
      state.pendingReaction.triggerSourceUnitId || state.assaultAttackState?.chargingUnitId;
    if (!chargingUnitId) {
      return reject(state, 'EVADE_SOURCE_MISSING', 'Unable to resolve the charging unit for the Evade reaction.');
    }

    return resolveEvadeReaction(
      state,
      command.unitId,
      chargingUnitId,
      command.modelPositions,
      dice,
    );
  }

  if (state.pendingReaction.reactionType === 'death-or-glory') {
    const currentTrigger = getCurrentDeathOrGloryTrigger(state);
    if (!currentTrigger) {
      return reject(state, 'DEATH_OR_GLORY_UNAVAILABLE', 'No Death or Glory trigger is currently queued.');
    }
    if (!currentTrigger.movedThroughUnitIds.includes(command.unitId)) {
      return reject(state, 'UNIT_NOT_ELIGIBLE', 'The selected unit was not moved through by the target vehicle.');
    }
    if (!command.reactingModelId || !command.weaponId) {
      return reject(state, 'DEATH_OR_GLORY_SELECTION_REQUIRED', 'Death or Glory requires an attacking model and weapon selection.');
    }

    const resolved = resolveDeathOrGloryReaction(
      setAwaitingReaction(state, false),
      currentTrigger,
      command.unitId,
      command.reactingModelId,
      command.weaponId,
      command.profileName,
      dice,
    );
    const advancedEvents: GameEvent[] = [
      {
        type: 'advancedReactionResolved',
        reactionId: 'death-or-glory',
        reactionName: 'Death or Glory',
        reactingUnitId: command.unitId,
        triggerSourceUnitId: currentTrigger.vehicleUnitId,
        success: resolved.vehicleDestroyed || resolved.vehiclePinned,
        effectsSummary: resolved.vehicleDestroyed
          ? ['Vehicle destroyed']
          : resolved.vehiclePinned
            ? ['Vehicle pinned']
            : ['Attacking model destroyed'],
      },
      ...resolved.events,
    ];
    const advancedState = advanceDeathOrGloryQueue({
      ...resolved.state,
      pendingReaction: undefined,
      awaitingReaction: false,
    });
    return finalizeDeathOrGloryQueue(advancedState, dice, advancedEvents);
  }

  if (state.pendingReaction.reactionType === 'heroic-intervention') {
    const combatId = state.pendingReaction.triggerSourceUnitId;
    if (!combatId) {
      return reject(state, 'HEROIC_INTERVENTION_SOURCE_MISSING', 'Unable to resolve the combat for Heroic Intervention.');
    }

    return resolveHeroicInterventionReaction(
      state,
      command.unitId,
      combatId,
    );
  }

  if (
    state.pendingReaction.reactionType === 'force-barrier' ||
    state.pendingReaction.reactionType === 'resurrection' ||
    state.pendingReaction.reactionType === 'nullify'
  ) {
    const psychicReaction = resolvePsychicReaction(
      state,
      command.unitId,
      state.pendingReaction.reactionType,
      dice,
    );
    if (!psychicReaction.accepted) {
      return psychicReaction;
    }

    const postReactionState = setAwaitingReaction(psychicReaction.state, false);
    if (state.pendingReaction.reactionType === 'resurrection') {
      const finalized = finalizePendingShootingAttackStepEleven(
        postReactionState,
        dice,
        { skipResurrectionOffer: true },
      );
      if (!finalized.accepted) {
        return finalized;
      }

      return {
        state: finalized.state,
        events: [...psychicReaction.events, ...finalized.events],
        errors: [],
        accepted: true,
      };
    }

    if (state.pendingReaction.reactionType === 'nullify') {
      return {
        state: setAwaitingReaction(psychicReaction.state, false),
        events: psychicReaction.events,
        errors: [],
        accepted: true,
      };
    }

    return resumePendingActionAfterAdvancedReaction(
      postReactionState,
      dice,
      psychicReaction.events,
    );
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

function processChasingTheWindReaction(
  state: GameState,
  command: SelectReactionCommandWithMove,
  dice: DiceProvider,
): CommandResult {
  const reactionId = state.pendingReaction?.reactionType as string | undefined;
  const triggerSourceUnitId = state.pendingReaction?.triggerSourceUnitId;
  if (!reactionId || !triggerSourceUnitId) {
    return reject(state, 'UNKNOWN_REACTION', 'Unable to resolve Chasing the Wind reaction context.');
  }

  const definition = findAdvancedReaction(reactionId);
  if (!definition) {
    return reject(state, 'UNKNOWN_REACTION', `Unknown advanced reaction: ${reactionId}`);
  }

  if (!command.modelPositions) {
    return reject(
      state,
      'MODEL_POSITIONS_REQUIRED',
      'Chasing the Wind requires explicit model destinations so the reaction move uses the live movement rules.',
    );
  }

  const playerIndex = findUnitPlayerIndex(state, command.unitId);
  if (playerIndex === undefined) {
    return reject(state, 'UNIT_NOT_FOUND', `Reacting unit not found: ${command.unitId}`);
  }

  const moveResult = handleMoveUnit(
    state,
    command.unitId,
    command.modelPositions,
    dice,
    { expectedPlayerIndex: playerIndex },
  );
  if (!moveResult.accepted) {
    return moveResult;
  }

  const declaredEvent: AdvancedReactionDeclaredEvent = {
    type: 'advancedReactionDeclared',
    reactionId,
    reactionName: definition.name,
    reactingUnitId: command.unitId,
    triggerSourceUnitId,
    playerIndex,
  };
  const resolvedEvent: AdvancedReactionResolvedEvent = {
    type: 'advancedReactionResolved',
    reactionId,
    reactionName: definition.name,
    reactingUnitId: command.unitId,
    triggerSourceUnitId,
    success: true,
    effectsSummary: definition.effects,
  };

  let newState = moveResult.state;
  newState = {
    ...newState,
    advancedReactionsUsed: [
      ...newState.advancedReactionsUsed,
      {
        reactionId,
        playerIndex,
        battleTurn: newState.currentBattleTurn,
      },
    ],
  };
  newState = updateArmyByIndex(newState, playerIndex, (army) => ({
    ...army,
    reactionAllotmentRemaining: Math.max(0, army.reactionAllotmentRemaining - definition.cost),
  }));
  newState = updateUnitInGameState(newState, command.unitId, (unit) => ({
    ...unit,
    hasReactedThisTurn: true,
  }));
  newState = setAwaitingReaction(newState, false);

  return resumePendingActionAfterAdvancedReaction(
    newState,
    dice,
    [declaredEvent, ...moveResult.events, resolvedEvent],
  );
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
  const events: GameEvent[] = [];
  if (state.pendingReaction.reactionType === CoreReaction.ReturnFire) {
    const deferredMisfires = resolveDeferredMisfiresFromAttackState(newState, dice);
    if (!deferredMisfires.accepted) {
      return deferredMisfires;
    }
    newState = deferredMisfires.state;
    events.push(...deferredMisfires.events);
    newState = finalizePendingReturnFireAttackState(newState);

    const finalized = finalizePendingShootingAttackStepEleven(newState, dice);
    if (!finalized.accepted) {
      return finalized;
    }

    return {
      state: finalized.state,
      events: [...events, ...finalized.events],
      errors: [],
      accepted: true,
    };
  }

  if (state.pendingReaction.reactionType === 'death-or-glory') {
    const currentTrigger = getCurrentDeathOrGloryTrigger(state);
    let currentState: GameState = {
      ...newState,
      pendingReaction: undefined,
      awaitingReaction: false,
    };
    const currentEvents = [...events];

    if (currentTrigger) {
      const currentVehicleModel = findUnit(currentState, currentTrigger.vehicleUnitId)?.models.find(
        (model) => model.id === currentTrigger.vehicleModelId,
      );
      if (!currentVehicleModel?.isDestroyed) {
        const moveThroughHits = resolveVehicleMoveThroughHits(currentState, currentTrigger, dice);
        currentState = moveThroughHits.state;
        currentEvents.push(...moveThroughHits.events);
      }
      currentState = advanceDeathOrGloryQueue(currentState);
    }

    return finalizeDeathOrGloryQueue(currentState, dice, currentEvents);
  }

  if (
    state.pendingReaction.reactionType === 'force-barrier' ||
    state.pendingReaction.reactionType === 'resurrection' ||
    state.pendingReaction.reactionType === 'nullify'
  ) {
    if (state.pendingReaction.reactionType === 'nullify') {
      const declined = declineNullifyReaction(state, dice);
      if (!declined.accepted) {
        return declined;
      }

      return {
        state: setAwaitingReaction(declined.state, false),
        events: declined.events,
        errors: [],
        accepted: true,
      };
    }

    if (state.pendingReaction.reactionType === 'resurrection') {
      const finalized = finalizePendingShootingAttackStepEleven(
        newState,
        dice,
        { skipResurrectionOffer: true },
      );
      if (!finalized.accepted) {
        return finalized;
      }

      return {
        state: finalized.state,
        events: finalized.events,
        errors: [],
        accepted: true,
      };
    }

    return resumePendingActionAfterAdvancedReaction(newState, dice);
  }

  if (state.pendingReaction.reactionType === 'heroic-intervention') {
    return {
      state: setAwaitingReaction(state, false),
      events,
      errors: [],
      accepted: true,
    };
  }

  if (state.pendingReaction.isAdvancedReaction) {
    return resumePendingActionAfterAdvancedReaction(newState, dice);
  }

  return {
    state: newState,
    events,
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

  const profile = lookupUnitProfile(targetUnit.profileId);
  const option = profile?.wargearOptions?.[command.optionIndex];
  if (command.optionIndex < 0 || !option) {
    return reject(state, 'INVALID_OPTION', `Invalid wargear option index: ${command.optionIndex}`);
  }

  const updatedModels = [...targetUnit.models];
  const updatedModel = { ...updatedModels[modelIndex] };
  const wargearOptionMarker = `__wargear_option_${command.optionIndex}`;

  const isConcreteWargearId = (entry: string): boolean =>
    PSYCHIC_DISCIPLINE_IDS.has(entry) ||
    findWeapon(entry) !== undefined ||
    findLegionWeapon(entry) !== undefined ||
    (profile?.dedicatedWeapons?.some((weapon) => weapon.id === entry) ?? false);

  const concreteRemoves = (option.removes ?? []).filter(isConcreteWargearId);
  const concreteAdds = option.adds.filter(isConcreteWargearId);

  let equippedWargear = updatedModel.equippedWargear.filter((entry) => entry !== wargearOptionMarker);
  if (concreteRemoves.length > 0) {
    const removeSet = new Set(concreteRemoves);
    equippedWargear = equippedWargear.filter((entry) => !removeSet.has(entry));
  }

  for (const addedWargear of concreteAdds) {
    if (!equippedWargear.includes(addedWargear)) {
      equippedWargear.push(addedWargear);
    }
  }

  if (!equippedWargear.includes(wargearOptionMarker)) {
    equippedWargear.push(wargearOptionMarker);
  }
  updatedModel.equippedWargear = equippedWargear;
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
          const hasPsychicMeleeWeapon = getModelPsychicMeleeWeapon(model, selection.weaponId) !== undefined;
          if (!model.equippedWargear.includes(selection.weaponId) && !hasPsychicMeleeWeapon) {
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
    case Phase.Start:
      if (
        state.currentSubPhase === SubPhase.StartEffects &&
        hasAvailableManifestPsychicPower(state)
      ) {
        validCommands.push('manifestPsychicPower');
      }
      break;

    case Phase.Movement:
      switch (state.currentSubPhase) {
        case SubPhase.Reserves:
          validCommands.push('reservesTest', 'deployUnit');
          break;
        case SubPhase.Move:
          validCommands.push('moveModel', 'moveUnit', 'rushUnit', 'embark', 'disembark');
          if (hasAvailableManifestPsychicPower(state)) {
            validCommands.push('manifestPsychicPower');
          }
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
            validCommands.push('resolveShootingCasualties', 'selectTargetModel');
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
          {
            const challengeState = state.activeCombats && state.activeCombats.length > 0
              ? state
              : syncActiveCombats(state).state;

            if (challengeState.pendingHeroicInterventionState) {
              validCommands.push('declareChallenge');
              break;
            }

            if (challengeState.activeCombats?.some((combat) => combat.challengeState?.currentStep === 'DECLARE')) {
              validCommands.push('acceptChallenge', 'declineChallenge');
              break;
            }

            if (challengeState.activeCombats?.some((combat) => combat.challengeState?.currentStep === 'FACE_OFF')) {
              validCommands.push('selectGambit');
              break;
            }

            if (getRemainingChallengeCombatIds(challengeState).length > 0) {
              validCommands.push('declareChallenge', 'passChallenge');
            }
          }
          break;
        case SubPhase.Resolution:
          validCommands.push('selectAftermath');
          break;
      }
      break;
  }

  return validCommands;
}
