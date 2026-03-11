/**
 * Embark/Disembark Handler
 * Transport interaction during the Movement Phase.
 *
 * Reference: HH_Rules_Battle.md — "Embark", "Disembark", "Emergency Disembark"
 * Reference: HH_Principles.md — "Transport", "Access Points"
 */

import type { GameState, Position } from '@hh/types';
import { LegionFaction, UnitMovementState, TacticalStatus } from '@hh/types';
import type { ModelShape } from '@hh/geometry';
import { createCircleBase, checkCoherency, STANDARD_COHERENCY_RANGE, areInBaseContact } from '@hh/geometry';
import { canProfileEmbarkOnTransport } from '@hh/data';
import { getModelShapeAtPosition } from '../model-shapes';
import type { CommandResult, GameEvent, DiceProvider } from '../types';
import type { EmbarkEvent, DisembarkEvent, EmergencyDisembarkEvent, CoolCheckEvent, StatusAppliedEvent } from '../types';
import {
  updateUnitInGameState,
  updateModelInUnit,
  moveModel,
  setMovementState,
  addStatus,
  embarkUnit,
  disembarkUnit,
} from '../state-helpers';
import {
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
} from '../game-queries';
import { getModelCool, getModelMovement, lookupUnitProfile } from '../profile-lookup';
import {
  getEmergencyDisembarkAnchorShape,
  getTransportAccessDistanceAtPosition,
} from './transport-access';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum distance from transport access point to embark (2") */
export const ACCESS_POINT_RANGE = 2;

/** Default Cool stat for emergency disembark checks */
export const DEFAULT_COOL = 7;

// ─── handleEmbark ────────────────────────────────────────────────────────────

/**
 * Handle a unit embarking onto a transport.
 *
 * All models must be within 2" of a valid transport access point or facing.
 *
 * Reference: HH_Rules_Battle.md — "Embark"
 */
export function handleEmbark(
  state: GameState,
  unitId: string,
  transportId: string,
  _dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  const errors: CommandResult['errors'] = [];

  // Validate unit exists
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events: [], errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit ${unitId} not found` }], accepted: false };
  }

  // Validate transport exists
  const transport = findUnit(state, transportId);
  if (!transport) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_NOT_FOUND', message: `Transport ${transportId} not found` }], accepted: false };
  }

  // Validate same army
  const unitPlayer = findUnitPlayerIndex(state, unitId);
  const transportPlayer = findUnitPlayerIndex(state, transportId);
  if (unitPlayer !== transportPlayer) {
    return { state, events: [], errors: [{ code: 'DIFFERENT_ARMY', message: 'Unit and transport must belong to the same army' }], accepted: false };
  }

  // Validate unit is deployed and not already embarked
  if (!unit.isDeployed) {
    return { state, events: [], errors: [{ code: 'NOT_DEPLOYED', message: 'Unit is not deployed on the battlefield' }], accepted: false };
  }
  if (unit.embarkedOnId !== null) {
    return { state, events: [], errors: [{ code: 'ALREADY_EMBARKED', message: 'Unit is already embarked on a transport' }], accepted: false };
  }

  // Get transport anchor model (first alive model)
  const transportModels = getAliveModels(transport);
  if (transportModels.length === 0) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_DESTROYED', message: 'Transport has no alive models' }], accepted: false };
  }
  const transportModel = transportModels[0];

  const unitProfile = lookupUnitProfile(unit.profileId);
  const transportProfile = lookupUnitProfile(transport.profileId);
  if (!unitProfile || !transportProfile) {
    return {
      state,
      events: [],
      errors: [{
        code: 'PROFILE_NOT_FOUND',
        message: 'Unit or transport profile could not be resolved for embark validation',
      }],
      accepted: false,
    };
  }

  // Check all alive models are within ACCESS_POINT_RANGE of a valid access region
  const aliveModels = getAliveModels(unit);
  for (const model of aliveModels) {
    const dist = getTransportAccessDistanceAtPosition(
      model,
      model.position,
      transportModel,
      transportProfile,
    );
    if (dist === null) {
      errors.push({
        code: 'NO_ACCESS_POINTS',
        message: `Transport ${transport.id} has no usable access geometry`,
      });
      continue;
    }

    if (dist > ACCESS_POINT_RANGE + 0.01) {
      errors.push({
        code: 'MODEL_TOO_FAR',
        message: `Model ${model.id} is ${dist.toFixed(2)}" from a valid transport access point (max ${ACCESS_POINT_RANGE}")`,
        context: { modelId: model.id, distance: dist },
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }
  const army = state.armies[unitPlayer ?? 0];
  const embarkedUnits = army.units.filter(
    (candidate) => candidate.id !== unitId && candidate.embarkedOnId === transportId,
  );
  const occupiedCapacity = embarkedUnits.reduce((sum, embarkedUnit) => {
    const embarkedProfile = lookupUnitProfile(embarkedUnit.profileId);
    if (!embarkedProfile) {
      return sum;
    }
    return sum + canProfileEmbarkOnTransport({
      passengerProfile: embarkedProfile,
      passengerModelCount: getAliveModels(embarkedUnit).length,
      passengerFaction:
        embarkedUnit.originLegion ??
        (Object.values(LegionFaction).includes(army.faction as LegionFaction)
          ? (army.faction as LegionFaction)
          : undefined),
      transportProfile,
      transportFaction:
        transport.originLegion ??
        (Object.values(LegionFaction).includes(army.faction as LegionFaction)
          ? (army.faction as LegionFaction)
          : undefined),
    }).requiredCapacity;
  }, 0);
  const compatibility = canProfileEmbarkOnTransport({
    passengerProfile: unitProfile,
    passengerModelCount: aliveModels.length,
    passengerFaction:
      unit.originLegion ??
      (Object.values(LegionFaction).includes(army.faction as LegionFaction)
        ? (army.faction as LegionFaction)
        : undefined),
    transportProfile,
    transportFaction:
      transport.originLegion ??
      (Object.values(LegionFaction).includes(army.faction as LegionFaction)
        ? (army.faction as LegionFaction)
        : undefined),
    occupiedCapacity,
    embarkedUnitCount: embarkedUnits.length,
  });

  if (!compatibility.isCompatible) {
    return {
      state,
      events: [],
      errors: [{
        code: 'TRANSPORT_INCOMPATIBLE',
        message: compatibility.reason ?? 'Unit cannot embark on the selected transport.',
      }],
      accepted: false,
    };
  }

  // Embark the unit
  let newState = updateUnitInGameState(state, unitId, (u) => embarkUnit(u, transportId));

  // Emit event
  const event: EmbarkEvent = { type: 'embark', unitId, transportId };
  events.push(event);

  return { state: newState, events, errors: [], accepted: true };
}

// ─── handleDisembark ─────────────────────────────────────────────────────────

/**
 * Handle a unit disembarking from a transport.
 *
 * Final model positions must be reachable from a legal access-point placement
 * using each model's Movement characteristic. The unit must end in coherency
 * and counts as having moved.
 *
 * Reference: HH_Rules_Battle.md — "Disembark"
 */
export function handleDisembark(
  state: GameState,
  unitId: string,
  modelPositions: Array<{ modelId: string; position: Position }>,
  _dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  const errors: CommandResult['errors'] = [];

  // Validate unit exists and is embarked
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events: [], errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit ${unitId} not found` }], accepted: false };
  }
  if (unit.embarkedOnId === null) {
    return { state, events: [], errors: [{ code: 'NOT_EMBARKED', message: 'Unit is not embarked on a transport' }], accepted: false };
  }

  // Get transport anchor model and profile
  const transport = findUnit(state, unit.embarkedOnId);
  if (!transport) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_NOT_FOUND', message: 'Transport not found' }], accepted: false };
  }
  const transportModels = getAliveModels(transport);
  if (transportModels.length === 0) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_DESTROYED', message: 'Transport has no alive models' }], accepted: false };
  }
  const transportModel = transportModels[0];
  const transportProfile = lookupUnitProfile(transport.profileId);
  if (!transportProfile) {
    return {
      state,
      events: [],
      errors: [{ code: 'PROFILE_NOT_FOUND', message: 'Transport profile could not be resolved' }],
      accepted: false,
    };
  }

  // Validate all placed positions are reachable from a legal access point
  for (const mp of modelPositions) {
    const model = unit.models.find((candidate) => candidate.id === mp.modelId);
    if (!model || model.isDestroyed) {
      errors.push({
        code: 'MODEL_NOT_FOUND',
        message: `Model ${mp.modelId} is not available to disembark`,
      });
      continue;
    }

    const dist = getTransportAccessDistanceAtPosition(
      model,
      mp.position,
      transportModel,
      transportProfile,
    );
    if (dist === null) {
      errors.push({
        code: 'NO_ACCESS_POINTS',
        message: `Transport ${transport.id} has no usable access geometry`,
      });
      continue;
    }

    const moveAllowance = getModelMovement(model.unitProfileId, model.profileModelName);
    if (dist > moveAllowance + 0.01) {
      errors.push({
        code: 'PLACEMENT_TOO_FAR',
        message: `Model ${mp.modelId} ends ${dist.toFixed(2)}" from the nearest legal access placement (max ${moveAllowance}")`,
        context: { modelId: mp.modelId, distance: dist, moveAllowance },
      });
    }
  }

  // Check coherency
  if (modelPositions.length > 1) {
    const shapes = modelPositions.map(mp => createCircleBase(mp.position, 32));
    const coherency = checkCoherency(shapes, STANDARD_COHERENCY_RANGE);
    if (!coherency.isCoherent) {
      errors.push({
        code: 'COHERENCY_BROKEN',
        message: 'Disembarked models must maintain coherency',
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // Disembark: update positions and set deployed
  let newState = state;
  for (const mp of modelPositions) {
    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, mp.modelId, (m) => moveModel(m, mp.position)),
    );
  }

  // Mark unit as disembarked and moved
  newState = updateUnitInGameState(newState, unitId, (u) => {
    let updated = disembarkUnit(u);
    updated = setMovementState(updated, UnitMovementState.Moved);
    return updated;
  });

  // Emit event
  const event: DisembarkEvent = {
    type: 'disembark',
    unitId,
    transportId: unit.embarkedOnId!,
    modelPositions: modelPositions.map(mp => ({ modelId: mp.modelId, position: mp.position })),
  };
  events.push(event);

  return { state: newState, events, errors: [], accepted: true };
}

// ─── handleEmergencyDisembark ────────────────────────────────────────────────

/**
 * Handle emergency disembark (e.g., when transport is destroyed).
 *
 * Models are placed in base contact with the transport's hull/base or, after
 * the first model, in base contact with already placed models from the same unit.
 * Cool Check: roll 2d6 <= CL. Fail = unit gains Pinned.
 *
 * Reference: HH_Rules_Battle.md — "Emergency Disembark"
 */
export function handleEmergencyDisembark(
  state: GameState,
  unitId: string,
  modelPositions: Array<{ modelId: string; position: Position }>,
  dice: DiceProvider,
): CommandResult {
  const events: GameEvent[] = [];
  const errors: CommandResult['errors'] = [];

  // Validate unit exists and is embarked
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events: [], errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit ${unitId} not found` }], accepted: false };
  }
  if (unit.embarkedOnId === null) {
    return { state, events: [], errors: [{ code: 'NOT_EMBARKED', message: 'Unit is not embarked' }], accepted: false };
  }

  const transportId = unit.embarkedOnId;
  const transport = findUnit(state, transportId);
  if (!transport) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_NOT_FOUND', message: 'Transport not found' }], accepted: false };
  }
  const transportModels = getAliveModels(transport);
  if (transportModels.length === 0) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_DESTROYED', message: 'Transport has no alive models' }], accepted: false };
  }
  const transportModel = transportModels[0];
  const transportProfile = lookupUnitProfile(transport.profileId);
  if (!transportProfile) {
    return {
      state,
      events: [],
      errors: [{ code: 'PROFILE_NOT_FOUND', message: 'Transport profile could not be resolved' }],
      accepted: false,
    };
  }

  const transportAnchorShape = getEmergencyDisembarkAnchorShape(
    transportModel,
    transportProfile,
  );
  const placedShapes: ModelShape[] = [];
  for (const [index, mp] of modelPositions.entries()) {
    const model = unit.models.find((candidate) => candidate.id === mp.modelId);
    if (!model || model.isDestroyed) {
      errors.push({
        code: 'MODEL_NOT_FOUND',
        message: `Model ${mp.modelId} is not available to emergency disembark`,
      });
      continue;
    }

    const placedShape = getModelShapeAtPosition(model, mp.position);
    const touchingTransport = areInBaseContact(placedShape, transportAnchorShape);
    const touchingPlacedModel = placedShapes.some((existingShape) =>
      areInBaseContact(placedShape, existingShape),
    );

    if (!touchingTransport && (index === 0 || !touchingPlacedModel)) {
      errors.push({
        code: 'INVALID_EMERGENCY_DISEMBARK_PLACEMENT',
        message: index === 0
          ? `First model ${mp.modelId} must be placed in base contact with the transport hull/base`
          : `Model ${mp.modelId} must be placed in base contact with the transport hull/base or an already placed model`,
      });
      continue;
    }

    placedShapes.push(placedShape);
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

  // Place models at provided positions
  let newState = state;
  for (const mp of modelPositions) {
    newState = updateUnitInGameState(newState, unitId, (u) =>
      updateModelInUnit(u, mp.modelId, (m) => moveModel(m, mp.position)),
    );
  }

  // Disembark
  newState = updateUnitInGameState(newState, unitId, (u) => {
    let updated = disembarkUnit(u);
    updated = setMovementState(updated, UnitMovementState.Moved);
    return updated;
  });

  // Cool Check: 2d6 <= CL (using real profile data)
  const coolRolls = dice.rollMultipleD6(2);
  const coolTotal = coolRolls[0] + coolRolls[1];
  const unitForCool = findUnit(newState, unitId);
  const coolRefModel = unitForCool ? getAliveModels(unitForCool)[0] : undefined;
  const coolTarget = coolRefModel ? getModelCool(coolRefModel.unitProfileId, coolRefModel.profileModelName) : DEFAULT_COOL;
  const coolPassed = coolTotal <= coolTarget;

  const coolEvent: CoolCheckEvent = {
    type: 'coolCheck',
    unitId,
    roll: coolTotal,
    target: coolTarget,
    passed: coolPassed,
  };
  events.push(coolEvent);

  if (!coolPassed) {
    // Unit gains Pinned
    newState = updateUnitInGameState(newState, unitId, (u) => addStatus(u, TacticalStatus.Pinned));
    const pinnedEvent: StatusAppliedEvent = {
      type: 'statusApplied',
      unitId,
      status: TacticalStatus.Pinned,
    };
    events.push(pinnedEvent);
  }

  // Emit emergency disembark event
  const event: EmergencyDisembarkEvent = {
    type: 'emergencyDisembark',
    unitId,
    transportId,
    coolCheckPassed: coolPassed,
  };
  events.push(event);

  return { state: newState, events, errors: [], accepted: true };
}
