import type { ModelState, UnitState } from '@hh/types';
import { getEffectiveNumericCharacteristic } from './characteristic-modifiers';
import {
  getModelAttacks,
  getModelCool,
  getModelInitiative,
  getModelLeadership,
  getModelMovement,
  getModelStrength,
  getModelToughness,
  getModelWS,
} from './profile-lookup';

function getRoundedCharacteristic(
  baseValue: number,
  characteristic: string,
  unit: UnitState,
  model: ModelState,
): number {
  return Math.max(0, Math.round(getEffectiveNumericCharacteristic(baseValue, characteristic, unit, model)));
}

export function getCurrentModelMovement(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelMovement(model.unitProfileId, model.profileModelName),
    'M',
    unit,
    model,
  );
}

export function getCurrentModelInitiative(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelInitiative(model.unitProfileId, model.profileModelName),
    'I',
    unit,
    model,
  );
}

export function getCurrentModelToughness(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelToughness(model.unitProfileId, model.profileModelName),
    'T',
    unit,
    model,
  );
}

export function getCurrentModelWS(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelWS(model.unitProfileId, model.profileModelName),
    'WS',
    unit,
    model,
  );
}

export function getCurrentModelStrength(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelStrength(model.unitProfileId, model.profileModelName),
    'S',
    unit,
    model,
  );
}

export function getCurrentModelAttacks(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelAttacks(model.unitProfileId, model.profileModelName),
    'A',
    unit,
    model,
  );
}

export function getCurrentModelLeadership(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelLeadership(model.unitProfileId, model.profileModelName),
    'LD',
    unit,
    model,
  );
}

export function getCurrentModelCool(unit: UnitState, model: ModelState): number {
  return getRoundedCharacteristic(
    getModelCool(model.unitProfileId, model.profileModelName),
    'CL',
    unit,
    model,
  );
}
