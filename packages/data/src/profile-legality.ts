import type {
  Allegiance,
  ArmyFaction,
  UnitProfile,
  VehicleCharacteristics,
} from '@hh/types';
import {
  LegionFaction,
  ModelSubType,
  ModelType,
  SpecialFaction,
} from '@hh/types';

const GENERIC_LEGION_TRAIT = 'Legiones Astartes';

export interface TransportProfileRules {
  capacity: number;
  allowsMultipleUnits: boolean;
  passengerKind: 'infantry-or-paragon' | 'walker';
  forbidsBulkyPassengers: boolean;
}

export interface EmbarkCompatibilityOptions {
  passengerProfile: UnitProfile;
  passengerModelCount: number;
  passengerFaction?: ArmyFaction;
  transportProfile: UnitProfile;
  transportFaction?: ArmyFaction;
  occupiedCapacity?: number;
  embarkedUnitCount?: number;
}

export interface EmbarkCompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  requiredCapacity: number;
}

function getSpecialRuleNames(profile: UnitProfile): Set<string> {
  return new Set(profile.specialRules.map((rule) => rule.name.toLowerCase()));
}

function getVehicleTransportCapacity(profile: UnitProfile): number {
  for (const modelDefinition of profile.modelDefinitions) {
    const characteristics = modelDefinition.characteristics as Partial<VehicleCharacteristics>;
    if (typeof characteristics.transportCapacity === 'number') {
      return characteristics.transportCapacity;
    }
  }

  return 0;
}

export function getProfileFixedAllegiances(profile: UnitProfile): Allegiance[] {
  return profile.traits
    .filter((trait): trait is { category: 'Allegiance'; value: Allegiance } =>
      trait.category === 'Allegiance' &&
      (trait.value === 'Loyalist' || trait.value === 'Traitor'),
    )
    .map((trait) => trait.value);
}

export function isProfileCompatibleWithArmyAllegiance(
  profile: UnitProfile,
  allegiance: Allegiance,
): boolean {
  const fixedAllegiances = getProfileFixedAllegiances(profile);
  return fixedAllegiances.length === 0 || fixedAllegiances.includes(allegiance);
}

export function getProfileFactionTraits(profile: UnitProfile): string[] {
  return profile.traits
    .filter((trait) => trait.category === 'Faction')
    .map((trait) => trait.value);
}

export function isProfileCompatibleWithArmyFaction(
  profile: UnitProfile,
  faction: ArmyFaction,
): boolean {
  const factionTraits = getProfileFactionTraits(profile);
  const legionFactions = new Set(Object.values(LegionFaction));

  if (faction === SpecialFaction.Blackshields) {
    return factionTraits.every((value) => !legionFactions.has(value as LegionFaction));
  }

  if (faction === SpecialFaction.ShatteredLegions) {
    return !factionTraits.includes(SpecialFaction.Blackshields);
  }

  if (factionTraits.length === 0) {
    return true;
  }

  return factionTraits.includes(faction) || factionTraits.includes(GENERIC_LEGION_TRAIT);
}

export function getProfileBulkyValue(profile: UnitProfile): number | null {
  const bulkyRule = profile.specialRules.find((rule) => rule.name.toLowerCase() === 'bulky');
  if (!bulkyRule) {
    return null;
  }

  const parsed = Number.parseInt(String(bulkyRule.value ?? '2'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

export function getProfileTransportOccupancy(
  profile: UnitProfile,
  modelCount: number,
): number {
  const perModel = getProfileBulkyValue(profile) ?? 1;
  return Math.max(1, modelCount) * perModel;
}

export function getTransportCapacity(profile: UnitProfile): number {
  return getVehicleTransportCapacity(profile);
}

export function isTransportProfile(profile: UnitProfile): boolean {
  return (
    profile.unitSubTypes.includes(ModelSubType.Transport) ||
    getTransportCapacity(profile) > 0
  );
}

export function getTransportProfileRules(
  profile: UnitProfile,
): TransportProfileRules | null {
  if (!isTransportProfile(profile)) {
    return null;
  }

  const capacity = getTransportCapacity(profile);
  if (capacity <= 0) {
    return null;
  }

  const specialRuleNames = getSpecialRuleNames(profile);

  return {
    capacity,
    allowsMultipleUnits: profile.unitSubTypes.includes(ModelSubType.SuperHeavy),
    passengerKind: specialRuleNames.has('dreadnought transport')
      ? 'walker'
      : 'infantry-or-paragon',
    forbidsBulkyPassengers: specialRuleNames.has('light transport'),
  };
}

function canEmbarkByType(
  passengerProfile: UnitProfile,
  rules: TransportProfileRules,
): boolean {
  if (rules.passengerKind === 'walker') {
    return (
      passengerProfile.unitType === ModelType.Walker ||
      passengerProfile.unitSubTypes.includes(ModelSubType.Dreadnought)
    );
  }

  return (
    passengerProfile.unitType === ModelType.Infantry ||
    passengerProfile.unitType === ModelType.Paragon
  );
}

export function canProfileEmbarkOnTransport(
  options: EmbarkCompatibilityOptions,
): EmbarkCompatibilityResult {
  const {
    passengerProfile,
    passengerModelCount,
    passengerFaction,
    transportProfile,
    transportFaction,
    occupiedCapacity = 0,
    embarkedUnitCount = 0,
  } = options;
  const rules = getTransportProfileRules(transportProfile);
  const requiredCapacity = getProfileTransportOccupancy(
    passengerProfile,
    passengerModelCount,
  );

  if (!rules) {
    return {
      isCompatible: false,
      reason: `Transport "${transportProfile.id}" is not a usable transport profile.`,
      requiredCapacity,
    };
  }

  if (
    passengerFaction !== undefined &&
    transportFaction !== undefined &&
    passengerFaction !== transportFaction
  ) {
    return {
      isCompatible: false,
      reason: 'Embarking unit and transport must share the same faction.',
      requiredCapacity,
    };
  }

  if (!canEmbarkByType(passengerProfile, rules)) {
    return {
      isCompatible: false,
      reason:
        rules.passengerKind === 'walker'
          ? `Transport "${transportProfile.id}" only supports Walker/Dreadnought units.`
          : `Transport "${transportProfile.id}" only supports Infantry or Paragon units.`,
      requiredCapacity,
    };
  }

  if (rules.forbidsBulkyPassengers && getProfileBulkyValue(passengerProfile) !== null) {
    return {
      isCompatible: false,
      reason: `Transport "${transportProfile.id}" has Light Transport and cannot carry Bulky passengers.`,
      requiredCapacity,
    };
  }

  if (!rules.allowsMultipleUnits && embarkedUnitCount > 0) {
    return {
      isCompatible: false,
      reason: `Transport "${transportProfile.id}" can only carry a single unit at a time.`,
      requiredCapacity,
    };
  }

  if ((occupiedCapacity + requiredCapacity) > rules.capacity) {
    return {
      isCompatible: false,
      reason:
        `Transport "${transportProfile.id}" capacity ${rules.capacity} is too small ` +
        `for required occupancy ${occupiedCapacity + requiredCapacity}.`,
      requiredCapacity,
    };
  }

  return {
    isCompatible: true,
    requiredCapacity,
  };
}
