/**
 * Embark/Disembark Handler
 * Transport interaction during the Movement Phase.
 *
 * Reference: HH_Rules_Battle.md — "Embark", "Disembark", "Emergency Disembark"
 * Reference: HH_Principles.md — "Transport", "Access Points"
 */

import type { GameState, Position } from '@hh/types';
import { LegionFaction, UnitMovementState, TacticalStatus } from '@hh/types';
import { vec2Distance, createCircleBase, checkCoherency, STANDARD_COHERENCY_RANGE } from '@hh/geometry';
import { canProfileEmbarkOnTransport } from '@hh/data';
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
import { getModelCool, lookupUnitProfile } from '../profile-lookup';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum distance from transport access point to embark (2") */
export const ACCESS_POINT_RANGE = 2;

/** Default Cool stat for emergency disembark checks */
export const DEFAULT_COOL = 7;

// ─── handleEmbark ────────────────────────────────────────────────────────────

/**
 * Handle a unit embarking onto a transport.
 *
 * All models must be within 2" of the transport's access point (simplified:
 * within 2" of the transport unit's first model position).
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

  // Get transport position (first alive model position)
  const transportModels = getAliveModels(transport);
  if (transportModels.length === 0) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_DESTROYED', message: 'Transport has no alive models' }], accepted: false };
  }
  const transportPos = transportModels[0].position;

  // Check all alive models are within ACCESS_POINT_RANGE of transport
  const aliveModels = getAliveModels(unit);
  for (const model of aliveModels) {
    const dist = vec2Distance(model.position, transportPos);
    if (dist > ACCESS_POINT_RANGE + 0.01) {
      errors.push({
        code: 'MODEL_TOO_FAR',
        message: `Model ${model.id} is ${dist.toFixed(2)}" from transport (max ${ACCESS_POINT_RANGE}")`,
        context: { modelId: model.id, distance: dist },
      });
    }
  }

  if (errors.length > 0) {
    return { state, events: [], errors, accepted: false };
  }

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
 * Models are placed within 2" of the transport's position.
 * Must end in coherency. Unit counts as having moved.
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

  // Get transport position
  const transport = findUnit(state, unit.embarkedOnId);
  if (!transport) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_NOT_FOUND', message: 'Transport not found' }], accepted: false };
  }
  const transportModels = getAliveModels(transport);
  if (transportModels.length === 0) {
    return { state, events: [], errors: [{ code: 'TRANSPORT_DESTROYED', message: 'Transport has no alive models' }], accepted: false };
  }
  const transportPos = transportModels[0].position;

  // Validate all placed positions are within 2" of transport
  for (const mp of modelPositions) {
    const dist = vec2Distance(mp.position, transportPos);
    if (dist > ACCESS_POINT_RANGE + 0.01) {
      errors.push({
        code: 'PLACEMENT_TOO_FAR',
        message: `Model ${mp.modelId} placed ${dist.toFixed(2)}" from transport (max ${ACCESS_POINT_RANGE}")`,
        context: { modelId: mp.modelId, distance: dist },
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
 * Models placed in base contact with hull.
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

  // Validate unit exists and is embarked
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { state, events: [], errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit ${unitId} not found` }], accepted: false };
  }
  if (unit.embarkedOnId === null) {
    return { state, events: [], errors: [{ code: 'NOT_EMBARKED', message: 'Unit is not embarked' }], accepted: false };
  }

  const transportId = unit.embarkedOnId;

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
