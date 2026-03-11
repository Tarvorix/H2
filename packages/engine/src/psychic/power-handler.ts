import type {
  CharacteristicModifier,
  DeclaredPsychicPower,
  GameState,
  ManifestPsychicPowerCommand,
  ModelState,
  SpecialRuleRef,
  UnitState,
} from '@hh/types';
import {
  ModelSubType,
  ModelType,
  Phase,
  SubPhase,
  TacticalStatus,
  UnitMovementState,
} from '@hh/types';
import type {
  CommandResult,
  DiceProvider,
  GameEvent,
  LeadershipCheckEvent,
  RoutMoveEvent,
  StatusAppliedEvent,
  StatusRemovedEvent,
} from '../types';
import {
  canUnitMove,
  canUnitReact,
  findModel,
  findUnit,
  findUnitArmy,
  findUnitPlayerIndex,
  getAliveModels,
} from '../game-queries';
import {
  addStatus,
  setMovementState,
  updateUnitInGameState,
  updateModelInUnit,
} from '../state-helpers';
import {
  getBestAvailablePsychicFocus,
  getActivePsychicEffects,
  getModelPsychicPower,
  getModelPsychicReaction,
  modelHasPsychicTrait,
  modelHasGrantedPsychicTrait,
  modelHasLOSToUnit,
  modelIsWithinRangeOfUnit,
  recordPsychicUsage,
  resolveManifestationCheck,
  resolveResistanceCheck,
  applyPerilsOfTheWarp,
  addActivePsychicEffect,
  unitCanUsePsychicAbilities,
  unitHasUsedPsychicPower,
  unitHasUsedPsychicReaction,
} from './psychic-runtime';
import { getModelLeadership, getModelType, getModelWounds, modelHasSubType } from '../profile-lookup';
import { markUnitReacted } from '../shooting/return-fire-handler';
import { resolveImmediateFallBackMove } from '../movement/rout-handler';

interface DeclaredShootingPsychicResult extends CommandResult {
  grantedSpecialRules: SpecialRuleRef[];
}

interface PsychicFocusContext {
  focusUnit: UnitState;
  focusModel: ModelState;
}

function rejectPsychic(state: GameState, code: string, message: string): CommandResult {
  return {
    state,
    events: [],
    errors: [{ code, message }],
    accepted: false,
  };
}

function successPsychic(state: GameState, events: GameEvent[] = []): CommandResult {
  return {
    state,
    events,
    errors: [],
    accepted: true,
  };
}

function buildModifier(
  characteristic: string,
  operation: CharacteristicModifier['operation'],
  value: number,
  source: string,
  expiresAt: CharacteristicModifier['expiresAt'],
): CharacteristicModifier {
  return {
    characteristic,
    operation,
    value,
    source,
    expiresAt,
  };
}

function addUnitModifier(
  state: GameState,
  unitId: string,
  modifier: CharacteristicModifier,
): GameState {
  return updateUnitInGameState(state, unitId, (unit) => ({
    ...unit,
    modifiers: [...unit.modifiers, modifier],
  }));
}

function addModelModifierToUnit(
  state: GameState,
  unitId: string,
  modifier: CharacteristicModifier,
): GameState {
  return updateUnitInGameState(state, unitId, (unit) => ({
    ...unit,
    models: unit.models.map((model) => ({
      ...model,
      modifiers: [...model.modifiers, modifier],
    })),
  }));
}

function clearUnitStatuses(
  state: GameState,
  unitId: string,
): { state: GameState; events: GameEvent[] } {
  const unit = findUnit(state, unitId);
  if (!unit || unit.statuses.length === 0) {
    return { state, events: [] };
  }

  const events: GameEvent[] = unit.statuses.map((status) => ({
    type: 'statusRemoved',
    unitId,
    status,
  } satisfies StatusRemovedEvent));

  return {
    state: updateUnitInGameState(state, unitId, (currentUnit) => ({
      ...currentUnit,
      statuses: [],
    })),
    events,
  };
}

function selectCharacteristicCheckModel(
  unit: UnitState,
  getCharacteristic: (model: ModelState) => number,
): ModelState | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return null;
  }

  const leaderCandidates = aliveModels.filter((model) =>
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Sergeant) ||
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Command) ||
    getModelType(model.unitProfileId, model.profileModelName) === ModelType.Paragon,
  );

  const pool = leaderCandidates.length > 0 ? leaderCandidates : aliveModels;
  const sorted = [...pool].sort((left, right) =>
    leaderCandidates.length > 0
      ? getCharacteristic(right) - getCharacteristic(left)
      : getCharacteristic(left) - getCharacteristic(right),
  );

  return sorted[0] ?? null;
}

function resolveFocusContext(
  state: GameState,
  focusModelId: string,
): PsychicFocusContext | null {
  const focusInfo = findModel(state, focusModelId);
  if (!focusInfo || focusInfo.model.isDestroyed) {
    return null;
  }

  return {
    focusUnit: focusInfo.unit,
    focusModel: focusInfo.model,
  };
}

function validateActivePlayerPsychicFocus(
  state: GameState,
  powerId: string,
  focusModelId: string,
): PsychicFocusContext | CommandResult {
  const focusContext = resolveFocusContext(state, focusModelId);
  if (!focusContext) {
    return rejectPsychic(state, 'PSYCHIC_FOCUS_NOT_FOUND', `Psychic focus model '${focusModelId}' could not be resolved.`);
  }

  const focusPlayerIndex = findUnitPlayerIndex(state, focusContext.focusUnit.id);
  if (focusPlayerIndex !== state.activePlayerIndex) {
    return rejectPsychic(state, 'PSYCHIC_FOCUS_NOT_ACTIVE', 'Psychic powers may only be manifested by the active player.');
  }

  if (!unitCanUsePsychicAbilities(state, focusContext.focusUnit)) {
    return rejectPsychic(state, 'PSYCHIC_FOCUS_UNAVAILABLE', 'This unit cannot use psychic abilities in its current state.');
  }

  if (!modelHasPsychicTrait(state, focusContext.focusModel)) {
    return rejectPsychic(state, 'PSYCHIC_FOCUS_NOT_PSYKER', 'Only a Psyker may use psychic powers.');
  }

  if (!getModelPsychicPower(focusContext.focusModel, powerId)) {
    return rejectPsychic(state, 'PSYCHIC_POWER_UNAVAILABLE', `Model '${focusModelId}' does not have psychic power '${powerId}'.`);
  }

  if (unitHasUsedPsychicPower(state, focusContext.focusUnit.id)) {
    return rejectPsychic(state, 'PSYCHIC_POWER_ALREADY_USED', 'This unit has already used a psychic power this player turn.');
  }

  return focusContext;
}

function validateEnemyTargetUnit(
  state: GameState,
  sourceUnitId: string,
  targetUnitId: string,
): UnitState | CommandResult {
  const sourcePlayerIndex = findUnitPlayerIndex(state, sourceUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  const targetPlayerIndex = targetUnit ? findUnitPlayerIndex(state, targetUnitId) : undefined;

  if (!targetUnit) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_NOT_FOUND', `Target unit '${targetUnitId}' was not found.`);
  }

  if (sourcePlayerIndex === targetPlayerIndex) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_FRIENDLY', 'This psychic power must target an enemy unit.');
  }

  if (!targetUnit.isDeployed || targetUnit.isInReserves || targetUnit.embarkedOnId !== null) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_UNAVAILABLE', 'The target unit is not available on the battlefield.');
  }

  if (getAliveModels(targetUnit).length === 0) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_DESTROYED', 'The target unit has no surviving models.');
  }

  return targetUnit;
}

function maybeApplyPerils(
  state: GameState,
  unitId: string,
  perilsValue: number | null,
  dice: DiceProvider,
): GameState {
  if (perilsValue === null) {
    return state;
  }

  return applyPerilsOfTheWarp(state, unitId, perilsValue, dice);
}

function hasPsykerInUnit(state: GameState, unit: UnitState): boolean {
  return getAliveModels(unit).some((model) => modelHasPsychicTrait(state, model));
}

function chooseResurrectionTarget(state: GameState, unitId: string): ModelState | null {
  const casualties = (state.shootingAttackState?.accumulatedCasualties ?? [])
    .map((modelId) => findModel(state, modelId)?.model ?? null)
    .filter((model): model is ModelState => model !== null && model.unitProfileId !== '' && findModel(state, model.id)?.unit.id === unitId);

  if (casualties.length === 0) {
    return null;
  }

  return [...casualties]
    .filter((model) => getModelWounds(model.unitProfileId, model.profileModelName) > 0)
    .sort((left, right) => {
      const woundDelta = getModelWounds(right.unitProfileId, right.profileModelName) - getModelWounds(left.unitProfileId, left.profileModelName);
      if (woundDelta !== 0) {
        return woundDelta;
      }

      return getModelLeadership(right.unitProfileId, right.profileModelName) - getModelLeadership(left.unitProfileId, left.profileModelName);
    })[0] ?? null;
}

function manifestTranquillity(
  state: GameState,
  command: ManifestPsychicPowerCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Start || state.currentSubPhase !== SubPhase.StartEffects) {
    return rejectPsychic(state, 'WRONG_PHASE', 'Tranquillity may only be manifested in the Start/StartEffects phase.');
  }

  const focusContext = validateActivePlayerPsychicFocus(state, 'tranquillity', command.focusModelId);
  if ('accepted' in focusContext) {
    return focusContext;
  }

  if (!modelHasGrantedPsychicTrait(focusContext.focusModel, 'Thaumaturge')) {
    return rejectPsychic(state, 'PSYCHIC_TRAIT_MISMATCH', 'Tranquillity requires a focus with the Thaumaturge trait.');
  }

  const targetUnit = validateEnemyTargetUnit(state, focusContext.focusUnit.id, command.targetUnitId);
  if ('accepted' in targetUnit) {
    return targetUnit;
  }

  if (!hasPsykerInUnit(state, targetUnit)) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_NOT_PSYKER', 'Tranquillity must target a unit that includes a Psyker.');
  }

  if (!modelIsWithinRangeOfUnit(state, command.focusModelId, command.targetUnitId, 18) ||
      !modelHasLOSToUnit(state, command.focusModelId, command.targetUnitId)) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_OUT_OF_RANGE', 'Tranquillity requires the target unit to be within 18" and visible to the focus.');
  }

  const resistance = resolveResistanceCheck(state, command.targetUnitId, dice);
  if (!resistance) {
    return rejectPsychic(state, 'PSYCHIC_RESISTANCE_INVALID', 'Unable to resolve the target unit for a Resistance Check.');
  }

  let newState = recordPsychicUsage(state, focusContext.focusUnit.id, 'power');
  if (!resistance.passed) {
    newState = addActivePsychicEffect(newState, {
      id: `tranquillity:${focusContext.focusModel.id}:${command.targetUnitId}:${state.currentBattleTurn}:${state.activePlayerIndex}`,
      sourcePowerId: 'tranquillity',
      sourceUnitId: focusContext.focusUnit.id,
      focusModelId: focusContext.focusModel.id,
      targetUnitId: command.targetUnitId,
      playerIndex: state.activePlayerIndex,
      expiry: {
        type: 'startOfPlayerTurn',
        playerIndex: state.activePlayerIndex,
      },
    });
  }

  newState = maybeApplyPerils(newState, resistance.focusUnitId, resistance.perilsValue, dice);
  return successPsychic(newState);
}

function manifestMindBurst(
  state: GameState,
  command: ManifestPsychicPowerCommand,
  dice: DiceProvider,
): CommandResult {
  if (state.currentPhase !== Phase.Movement || state.currentSubPhase !== SubPhase.Move) {
    return rejectPsychic(state, 'WRONG_PHASE', 'Mind-burst may only be manifested in the Movement/Move phase.');
  }

  const focusContext = validateActivePlayerPsychicFocus(state, 'mind-burst', command.focusModelId);
  if ('accepted' in focusContext) {
    return focusContext;
  }

  if (!modelHasGrantedPsychicTrait(focusContext.focusModel, 'Telepath')) {
    return rejectPsychic(state, 'PSYCHIC_TRAIT_MISMATCH', 'Mind-burst requires a focus with the Telepath trait.');
  }

  if (focusContext.focusUnit.movementState !== UnitMovementState.Stationary || !canUnitMove(focusContext.focusUnit)) {
    return rejectPsychic(state, 'PSYCHIC_SOURCE_ALREADY_MOVED', 'Mind-burst must be used before the focus unit makes any move.');
  }

  const targetUnit = validateEnemyTargetUnit(state, focusContext.focusUnit.id, command.targetUnitId);
  if ('accepted' in targetUnit) {
    return targetUnit;
  }

  if (targetUnit.isLockedInCombat) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_LOCKED', 'Mind-burst cannot target a unit locked in combat.');
  }

  if (getAliveModels(targetUnit).some((model) => getModelType(model.unitProfileId, model.profileModelName) === ModelType.Vehicle)) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_VEHICLE', 'Mind-burst cannot target a unit that includes any Vehicle models.');
  }

  if (!modelIsWithinRangeOfUnit(state, command.focusModelId, command.targetUnitId, 18) ||
      !modelHasLOSToUnit(state, command.focusModelId, command.targetUnitId)) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_OUT_OF_RANGE', 'Mind-burst requires the target unit to be within 18" and visible to the focus.');
  }

  const resistance = resolveResistanceCheck(state, command.targetUnitId, dice);
  if (!resistance) {
    return rejectPsychic(state, 'PSYCHIC_RESISTANCE_INVALID', 'Unable to resolve the target unit for a Resistance Check.');
  }

  let newState = recordPsychicUsage(state, focusContext.focusUnit.id, 'power');
  newState = addUnitModifier(newState, focusContext.focusUnit.id, buildModifier(
    'NoMove',
    'set',
    1,
    'Mind-burst',
    { type: 'endOfPhase', phase: Phase.Movement },
  ));
  newState = addUnitModifier(newState, focusContext.focusUnit.id, buildModifier(
    'NoRush',
    'set',
    1,
    'Mind-burst',
    { type: 'endOfPhase', phase: Phase.Movement },
  ));

  const events: GameEvent[] = [];
  if (!resistance.passed) {
    const statusClear = clearUnitStatuses(newState, command.targetUnitId);
    newState = statusClear.state;
    events.push(...statusClear.events);

    const fallBack = resolveImmediateFallBackMove(newState, command.targetUnitId, dice.rollD6());
    newState = updateUnitInGameState(fallBack.state, command.targetUnitId, (unit) =>
      setMovementState(unit, UnitMovementState.FellBack),
    );
    events.push({
      type: 'routMove',
      unitId: command.targetUnitId,
      distanceRolled: 0,
      modelMoves: fallBack.modelMoves,
      reachedEdge: fallBack.reachedEdge,
    } satisfies RoutMoveEvent);

    const leadershipModel = selectCharacteristicCheckModel(
      targetUnit,
      (model) => getModelLeadership(model.unitProfileId, model.profileModelName),
    );
    const targetNumber = leadershipModel
      ? getModelLeadership(leadershipModel.unitProfileId, leadershipModel.profileModelName)
      : 0;
    const [die1, die2] = dice.roll2D6();
    const roll = targetNumber > 0 ? die1 + die2 : 13;
    const passed = targetNumber > 0 && roll <= targetNumber;
    events.push({
      type: 'leadershipCheck',
      unitId: command.targetUnitId,
      roll,
      target: targetNumber,
      passed,
    } satisfies LeadershipCheckEvent);

    if (!passed) {
      newState = updateUnitInGameState(newState, command.targetUnitId, (unit) =>
        addStatus(unit, TacticalStatus.Routed),
      );
      events.push({
        type: 'statusApplied',
        unitId: command.targetUnitId,
        status: TacticalStatus.Routed,
      } satisfies StatusAppliedEvent);
    }
  }

  newState = maybeApplyPerils(newState, resistance.focusUnitId, resistance.perilsValue, dice);
  return successPsychic(newState, events);
}

export function handleManifestPsychicPower(
  state: GameState,
  command: ManifestPsychicPowerCommand,
  dice: DiceProvider,
): CommandResult {
  switch (command.powerId) {
    case 'tranquillity':
      return manifestTranquillity(state, command, dice);
    case 'mind-burst':
      return manifestMindBurst(state, command, dice);
    default:
      return rejectPsychic(state, 'PSYCHIC_POWER_UNSUPPORTED', `Psychic power '${command.powerId}' is not a standalone phase action.`);
  }
}

export function resolveDeclaredChargePsychicPower(
  state: GameState,
  chargingUnitId: string,
  declaredPower: DeclaredPsychicPower | undefined,
  dice: DiceProvider,
): CommandResult {
  if (!declaredPower) {
    return successPsychic(state);
  }

  if (declaredPower.powerId !== 'biomantic-rage') {
    return rejectPsychic(state, 'PSYCHIC_POWER_UNSUPPORTED', `Psychic power '${declaredPower.powerId}' cannot be declared with a charge.`);
  }

  const focusContext = validateActivePlayerPsychicFocus(state, declaredPower.powerId, declaredPower.focusModelId);
  if ('accepted' in focusContext) {
    return focusContext;
  }

  if (!modelHasGrantedPsychicTrait(focusContext.focusModel, 'Biomancer')) {
    return rejectPsychic(state, 'PSYCHIC_TRAIT_MISMATCH', 'Biomantic Rage requires a focus with the Biomancer trait.');
  }

  const focusWithinUnit = focusContext.focusUnit.id === chargingUnitId;
  const supportFocusLegal = !focusWithinUnit &&
    modelIsWithinRangeOfUnit(state, focusContext.focusModel.id, chargingUnitId, 18) &&
    modelHasLOSToUnit(state, focusContext.focusModel.id, chargingUnitId);

  if (!focusWithinUnit && !supportFocusLegal) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_OUT_OF_RANGE', 'Biomantic Rage requires the focus to be in the charging unit or within 18" and visible to it.');
  }

  let newState = recordPsychicUsage(state, focusContext.focusUnit.id, 'power');
  const manifestation = resolveManifestationCheck(newState, focusContext.focusModel.id, dice);
  if (!manifestation) {
    return rejectPsychic(state, 'PSYCHIC_MANIFESTATION_INVALID', 'Unable to resolve the Biomantic Rage manifestation check.');
  }

  if (manifestation.passed) {
    newState = addUnitModifier(newState, chargingUnitId, buildModifier(
      'S',
      'add',
      2,
      'Biomantic Rage',
      { type: 'endOfPhase', phase: Phase.Assault },
    ));
    newState = addUnitModifier(newState, chargingUnitId, buildModifier(
      'T',
      'add',
      2,
      'Biomantic Rage',
      { type: 'endOfPhase', phase: Phase.Assault },
    ));
    newState = addUnitModifier(newState, chargingUnitId, buildModifier(
      'NoVolleyAttacks',
      'set',
      1,
      'Biomantic Rage',
      { type: 'endOfSubPhase', subPhase: SubPhase.Charge },
    ));
  }

  newState = maybeApplyPerils(newState, manifestation.focusUnitId, manifestation.perilsValue, dice);
  return successPsychic(newState);
}

export function resolveDeclaredShootingPsychicPower(
  state: GameState,
  attackerUnitId: string,
  declaredPower: DeclaredPsychicPower | undefined,
  dice: DiceProvider,
): DeclaredShootingPsychicResult {
  if (!declaredPower) {
    return {
      ...successPsychic(state),
      grantedSpecialRules: [],
    };
  }

  if (declaredPower.powerId !== 'foresights-blessing') {
    return {
      ...rejectPsychic(state, 'PSYCHIC_POWER_UNSUPPORTED', `Psychic power '${declaredPower.powerId}' cannot be declared with a shooting attack.`),
      grantedSpecialRules: [],
    };
  }

  const existingEffect = getActivePsychicEffects(state, attackerUnitId, 'foresights-blessing')[0];
  if (existingEffect) {
    const passed = existingEffect.metadata?.passed === true;
    return {
      state,
      events: [],
      errors: [],
      accepted: true,
      grantedSpecialRules: passed
        ? [{ name: 'Precision', value: '5+' } satisfies SpecialRuleRef]
        : [],
    };
  }

  const focusContext = validateActivePlayerPsychicFocus(state, declaredPower.powerId, declaredPower.focusModelId);
  if ('accepted' in focusContext) {
    return {
      ...focusContext,
      grantedSpecialRules: [],
    };
  }

  if (!modelHasGrantedPsychicTrait(focusContext.focusModel, 'Diviner')) {
    return {
      ...rejectPsychic(state, 'PSYCHIC_TRAIT_MISMATCH', 'Foresight’s Blessing requires a focus with the Diviner trait.'),
      grantedSpecialRules: [],
    };
  }

  const focusWithinUnit = focusContext.focusUnit.id === attackerUnitId;
  const supportFocusLegal = !focusWithinUnit &&
    modelIsWithinRangeOfUnit(state, focusContext.focusModel.id, attackerUnitId, 18) &&
    modelHasLOSToUnit(state, focusContext.focusModel.id, attackerUnitId);

  if (!focusWithinUnit && !supportFocusLegal) {
    return {
      ...rejectPsychic(state, 'PSYCHIC_TARGET_OUT_OF_RANGE', 'Foresight’s Blessing requires the focus to be in the shooting unit or within 18" and visible to it.'),
      grantedSpecialRules: [],
    };
  }

  let newState = recordPsychicUsage(state, focusContext.focusUnit.id, 'power');
  const manifestation = resolveManifestationCheck(newState, focusContext.focusModel.id, dice);
  if (!manifestation) {
    return {
      ...rejectPsychic(state, 'PSYCHIC_MANIFESTATION_INVALID', 'Unable to resolve the Foresight’s Blessing manifestation check.'),
      grantedSpecialRules: [],
    };
  }

  const grantedSpecialRules = manifestation.passed
    ? [{ name: 'Precision', value: '5+' } satisfies SpecialRuleRef]
    : [];

  newState = addActivePsychicEffect(newState, {
    id: `foresights-blessing:${focusContext.focusModel.id}:${attackerUnitId}:${state.currentBattleTurn}:${state.activePlayerIndex}`,
    sourcePowerId: 'foresights-blessing',
    sourceUnitId: focusContext.focusUnit.id,
    focusModelId: focusContext.focusModel.id,
    targetUnitId: attackerUnitId,
    playerIndex: state.activePlayerIndex,
    expiry: {
      type: 'endOfShootingAttack',
    },
    metadata: {
      passed: manifestation.passed,
    },
  });

  newState = maybeApplyPerils(newState, manifestation.focusUnitId, manifestation.perilsValue, dice);
  return {
    state: newState,
    events: [],
    errors: [],
    accepted: true,
    grantedSpecialRules,
  };
}

function resolveForceBarrierReaction(
  state: GameState,
  unitId: string,
  dice: DiceProvider,
): CommandResult {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return rejectPsychic(state, 'PSYCHIC_TARGET_NOT_FOUND', `Unit '${unitId}' was not found for Force Barrier.`);
  }

  const focusModel = getBestAvailablePsychicFocus(state, unitId, (model) =>
    getModelPsychicReaction(model, 'force-barrier') !== undefined &&
    modelHasGrantedPsychicTrait(model, 'Telekine'),
  );
  if (!focusModel) {
    return rejectPsychic(state, 'PSYCHIC_REACTION_UNAVAILABLE', 'No legal Telekine focus is available for Force Barrier.');
  }

  let newState = markUnitReacted(state, unitId);
  newState = recordPsychicUsage(newState, unitId, 'reaction');
  const manifestation = resolveManifestationCheck(newState, focusModel.id, dice);
  if (!manifestation) {
    return rejectPsychic(newState, 'PSYCHIC_MANIFESTATION_INVALID', 'Unable to resolve the Force Barrier manifestation check.');
  }

  if (manifestation.passed) {
    newState = addModelModifierToUnit(newState, unitId, buildModifier(
      'Shrouded',
      'set',
      3,
      'Force Barrier',
      { type: 'endOfSubPhase', subPhase: state.currentSubPhase },
    ));
  }

  newState = maybeApplyPerils(newState, manifestation.focusUnitId, manifestation.perilsValue, dice);
  return successPsychic(newState);
}

function resolveResurrectionReaction(
  state: GameState,
  unitId: string,
  dice: DiceProvider,
): CommandResult {
  const unit = findUnit(state, unitId);
  const attackState = state.shootingAttackState;
  if (!unit || !attackState || attackState.currentStep !== 'AWAITING_RESURRECTION') {
    return rejectPsychic(state, 'PSYCHIC_REACTION_UNAVAILABLE', 'Resurrection can only be declared at the start of Step 11 of a shooting attack.');
  }

  const focusModel = getBestAvailablePsychicFocus(state, unitId, (model) =>
    getModelPsychicReaction(model, 'resurrection') !== undefined &&
    modelHasGrantedPsychicTrait(model, 'Thaumaturge'),
  );
  if (!focusModel) {
    return rejectPsychic(state, 'PSYCHIC_REACTION_UNAVAILABLE', 'No legal Thaumaturge focus is available for Resurrection.');
  }

  let newState = markUnitReacted(state, unitId);
  newState = recordPsychicUsage(newState, unitId, 'reaction');
  const manifestation = resolveManifestationCheck(newState, focusModel.id, dice);
  if (!manifestation) {
    return rejectPsychic(newState, 'PSYCHIC_MANIFESTATION_INVALID', 'Unable to resolve the Resurrection manifestation check.');
  }

  if (manifestation.passed) {
    const casualtyModel = chooseResurrectionTarget(newState, unitId);
    if (casualtyModel && dice.rollD6() >= 4) {
      const restoredWounds = getModelWounds(casualtyModel.unitProfileId, casualtyModel.profileModelName);
      newState = updateUnitInGameState(newState, unitId, (currentUnit) =>
        updateModelInUnit(currentUnit, casualtyModel.id, (currentModel) => ({
          ...currentModel,
          isDestroyed: false,
          currentWounds: restoredWounds,
        })),
      );
      newState = {
        ...newState,
        shootingAttackState: newState.shootingAttackState
          ? {
              ...newState.shootingAttackState,
              accumulatedCasualties: newState.shootingAttackState.accumulatedCasualties.filter((modelId) => modelId !== casualtyModel.id),
            }
          : newState.shootingAttackState,
      };
    }
  }

  newState = maybeApplyPerils(newState, manifestation.focusUnitId, manifestation.perilsValue, dice);
  return successPsychic(newState);
}

export function resolvePsychicReaction(
  state: GameState,
  unitId: string,
  reactionId: string,
  dice: DiceProvider,
): CommandResult {
  const unit = findUnit(state, unitId);
  const army = unit ? findUnitArmy(state, unitId) : undefined;
  if (!unit || !army || !canUnitReact(unit) || !unitCanUsePsychicAbilities(state, unit)) {
    return rejectPsychic(state, 'PSYCHIC_REACTION_UNAVAILABLE', 'This unit cannot currently declare a psychic reaction.');
  }

  if (army.reactionAllotmentRemaining <= 0) {
    return rejectPsychic(state, 'NO_REACTION_ALLOTMENT', 'No reaction allotment remains for this psychic reaction.');
  }

  if (unitHasUsedPsychicReaction(state, unitId)) {
    return rejectPsychic(state, 'PSYCHIC_REACTION_ALREADY_USED', 'This unit has already used a psychic reaction this opposing player turn.');
  }

  switch (reactionId) {
    case 'force-barrier':
      return resolveForceBarrierReaction(state, unitId, dice);
    case 'resurrection':
      return resolveResurrectionReaction(state, unitId, dice);
    default:
      return rejectPsychic(state, 'PSYCHIC_REACTION_UNSUPPORTED', `Psychic reaction '${reactionId}' is not supported by the live engine.`);
  }
}

export function unitCanDeclarePsychicReaction(
  state: GameState,
  unitId: string,
  reactionId: string,
): boolean {
  const unit = findUnit(state, unitId);
  const army = unit ? findUnitArmy(state, unitId) : undefined;
  if (!unit || !army || !canUnitReact(unit) || !unitCanUsePsychicAbilities(state, unit)) {
    return false;
  }

  if (army.reactionAllotmentRemaining <= 0 || unitHasUsedPsychicReaction(state, unitId)) {
    return false;
  }

  switch (reactionId) {
    case 'force-barrier':
      return getBestAvailablePsychicFocus(state, unitId, (model) =>
        getModelPsychicReaction(model, 'force-barrier') !== undefined &&
        modelHasGrantedPsychicTrait(model, 'Telekine'),
      ) !== null;
    case 'resurrection':
      return (
        state.shootingAttackState !== undefined &&
        (
          state.shootingAttackState.currentStep === 'REMOVING_CASUALTIES' ||
          state.shootingAttackState.currentStep === 'AWAITING_RESURRECTION'
        ) &&
        chooseResurrectionTarget(state, unitId) !== null &&
        getBestAvailablePsychicFocus(state, unitId, (model) =>
          getModelPsychicReaction(model, 'resurrection') !== undefined &&
          modelHasGrantedPsychicTrait(model, 'Thaumaturge'),
        ) !== null
      );
    default:
      return false;
  }
}

function unitHasAvailableTranquillity(state: GameState, unit: UnitState): boolean {
  if (!unitCanUsePsychicAbilities(state, unit) || unitHasUsedPsychicPower(state, unit.id)) {
    return false;
  }

  return getAliveModels(unit).some((model) =>
    getModelPsychicPower(model, 'tranquillity') !== undefined &&
    modelHasGrantedPsychicTrait(model, 'Thaumaturge') &&
    state.armies
      .flatMap((army) => army.units)
      .some((enemyUnit) =>
        findUnitPlayerIndex(state, enemyUnit.id) !== state.activePlayerIndex &&
        unitCanUsePsychicAbilities(state, enemyUnit) &&
        hasPsykerInUnit(state, enemyUnit) &&
        modelIsWithinRangeOfUnit(state, model.id, enemyUnit.id, 18) &&
        modelHasLOSToUnit(state, model.id, enemyUnit.id),
      ),
  );
}

function unitHasAvailableMindBurst(state: GameState, unit: UnitState): boolean {
  if (!unitCanUsePsychicAbilities(state, unit) || unitHasUsedPsychicPower(state, unit.id)) {
    return false;
  }

  if (unit.movementState !== UnitMovementState.Stationary || !canUnitMove(unit)) {
    return false;
  }

  return getAliveModels(unit).some((model) =>
    getModelPsychicPower(model, 'mind-burst') !== undefined &&
    modelHasGrantedPsychicTrait(model, 'Telepath') &&
    state.armies
      .flatMap((army) => army.units)
      .some((enemyUnit) =>
        findUnitPlayerIndex(state, enemyUnit.id) !== state.activePlayerIndex &&
        enemyUnit.isDeployed &&
        !enemyUnit.isInReserves &&
        enemyUnit.embarkedOnId === null &&
        !enemyUnit.isLockedInCombat &&
        getAliveModels(enemyUnit).length > 0 &&
        !getAliveModels(enemyUnit).some((enemyModel) => getModelType(enemyModel.unitProfileId, enemyModel.profileModelName) === ModelType.Vehicle) &&
        modelIsWithinRangeOfUnit(state, model.id, enemyUnit.id, 18) &&
        modelHasLOSToUnit(state, model.id, enemyUnit.id),
      ),
  );
}

export function hasAvailableManifestPsychicPower(state: GameState): boolean {
  const activeUnits = state.armies[state.activePlayerIndex].units;

  if (state.currentPhase === Phase.Start && state.currentSubPhase === SubPhase.StartEffects) {
    return activeUnits.some((unit) => unitHasAvailableTranquillity(state, unit));
  }

  if (state.currentPhase === Phase.Movement && state.currentSubPhase === SubPhase.Move) {
    return activeUnits.some((unit) => unitHasAvailableMindBurst(state, unit));
  }

  return false;
}
