import type { CharacteristicModifier, ModelState, UnitState } from '@hh/types';

function matchesCharacteristic(modifier: CharacteristicModifier, characteristic: string): boolean {
  return modifier.characteristic.toLowerCase() === characteristic.toLowerCase();
}

function getRelevantModifiers(
  unit: UnitState | undefined,
  model: ModelState | undefined,
  characteristic: string,
): CharacteristicModifier[] {
  return [
    ...(unit?.modifiers ?? []),
    ...(model?.modifiers ?? []),
  ].filter((modifier) => matchesCharacteristic(modifier, characteristic));
}

export function getEffectiveNumericCharacteristic(
  baseValue: number,
  characteristic: string,
  unit?: UnitState,
  model?: ModelState,
): number {
  const relevant = getRelevantModifiers(unit, model, characteristic);
  if (relevant.length === 0) {
    return baseValue;
  }

  let value = baseValue;
  const setModifiers = relevant.filter((modifier) => modifier.operation === 'set');
  if (setModifiers.length > 0) {
    value = setModifiers[setModifiers.length - 1].value;
  }

  for (const modifier of relevant) {
    if (modifier.operation === 'set') {
      continue;
    }

    switch (modifier.operation) {
      case 'add':
        value += modifier.value;
        break;
      case 'subtract':
        value -= modifier.value;
        break;
      case 'multiply':
        value *= modifier.value;
        break;
    }
  }

  return value;
}

export function hasActiveCharacteristicModifier(
  unit: UnitState | undefined,
  model: ModelState | undefined,
  characteristic: string,
  predicate?: (modifier: CharacteristicModifier) => boolean,
): boolean {
  const relevant = getRelevantModifiers(unit, model, characteristic);
  if (!predicate) {
    return relevant.length > 0;
  }

  return relevant.some(predicate);
}
