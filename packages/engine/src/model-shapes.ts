import type { ModelState, Position } from '@hh/types';
import type { ModelShape } from '@hh/geometry';
import {
  createCircleBase,
  createCircleBaseInches,
  createRectHull,
} from '@hh/geometry';
import {
  getModelStateBaseSizeMM,
  getModelStateCharacteristics,
  isVehicleCharacteristics,
} from './profile-lookup';

type VehicleFootprintSpec =
  | {
      kind: 'circle';
      diameterInches: number;
    }
  | {
      kind: 'rect';
      lengthInches: number;
      widthInches: number;
    };

const RHINO_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 4.5,
  widthInches: 2.75,
};

const SICARAN_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 5.0,
  widthInches: 3.0,
};

const LAND_RAIDER_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 6.0,
  widthInches: 3.75,
};

const SPARTAN_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 7.0,
  widthInches: 4.0,
};

const HEAVY_TANK_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 6.25,
  widthInches: 4.0,
};

const SABRE_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 4.0,
  widthInches: 2.5,
};

const SUPER_HEAVY_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 8.5,
  widthInches: 5.0,
};

const MASTODON_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 10.5,
  widthInches: 5.5,
};

const STORM_EAGLE_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 6.5,
  widthInches: 5.5,
};

const XIPHON_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 5.0,
  widthInches: 4.0,
};

const THUNDERHAWK_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 10.0,
  widthInches: 8.0,
};

const STORMBIRD_CHASSIS: VehicleFootprintSpec = {
  kind: 'rect',
  lengthInches: 12.0,
  widthInches: 9.0,
};

const DROP_POD_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 4.0,
};

const DEATHSTORM_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 4.5,
};

const DREADNOUGHT_DROP_POD_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 4.5,
};

const DREADCLAW_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 4.5,
};

const KHARYBDIS_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 6.0,
};

const TERMITE_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 4.0,
};

const SENTRY_PLATFORM_CHASSIS: VehicleFootprintSpec = {
  kind: 'circle',
  diameterInches: 2.5,
};

function resolveVehicleFootprint(profileId: string): VehicleFootprintSpec {
  if (
    profileId === 'rhino' ||
    profileId === 'damocles-command-rhino' ||
    profileId === 'predator' ||
    profileId === 'scorpius-missile-tank' ||
    profileId === 'vindicator-siege-tank'
  ) {
    return RHINO_CHASSIS;
  }

  if (profileId === 'sicaran' || profileId === 'sicaran-venator') {
    return SICARAN_CHASSIS;
  }

  if (
    profileId === 'land-raider-carrier' ||
    profileId === 'land-raider-explorator' ||
    profileId === 'cerberus-heavy-tank-destroyer' ||
    profileId === 'typhon-heavy-siege-tank'
  ) {
    return LAND_RAIDER_CHASSIS;
  }

  if (profileId === 'spartan') {
    return SPARTAN_CHASSIS;
  }

  if (
    profileId === 'arquitor-bombard' ||
    profileId === 'kratos-assault-tank'
  ) {
    return HEAVY_TANK_CHASSIS;
  }

  if (profileId === 'sabre') {
    return SABRE_CHASSIS;
  }

  if (
    profileId === 'falchion-super-heavy-tank-destroyer' ||
    profileId === 'fellblade-super-heavy-battle-tank' ||
    profileId === 'glaive-super-heavy-special-weapons-tank' ||
    profileId === 'the-tormentor'
  ) {
    return SUPER_HEAVY_CHASSIS;
  }

  if (profileId === 'mastodon-super-heavy-assault-transport') {
    return MASTODON_CHASSIS;
  }

  if (profileId === 'storm-eagle' || profileId === 'fire-raptor') {
    return STORM_EAGLE_CHASSIS;
  }

  if (profileId === 'xiphon-interceptor') {
    return XIPHON_CHASSIS;
  }

  if (
    profileId === 'thunderhawk-gunship' ||
    profileId === 'thunderhawk-transporter' ||
    profileId === 'tos-dios'
  ) {
    return THUNDERHAWK_CHASSIS;
  }

  if (profileId === 'sokar-stormbird') {
    return STORMBIRD_CHASSIS;
  }

  if (profileId === 'drop-pod') {
    return DROP_POD_CHASSIS;
  }

  if (profileId === 'deathstorm-drop-pod') {
    return DEATHSTORM_CHASSIS;
  }

  if (profileId === 'dreadnought-drop-pod') {
    return DREADNOUGHT_DROP_POD_CHASSIS;
  }

  if (profileId === 'dreadclaw-drop-pod') {
    return DREADCLAW_CHASSIS;
  }

  if (profileId === 'kharybdis-assault-claw') {
    return KHARYBDIS_CHASSIS;
  }

  if (profileId === 'termite') {
    return TERMITE_CHASSIS;
  }

  if (
    profileId === 'araknae-quad-accelerator-platform' ||
    profileId === 'tarantula-sentry-gun'
  ) {
    return SENTRY_PLATFORM_CHASSIS;
  }

  return RHINO_CHASSIS;
}

export function getModelShapeRotation(model: ModelState): number {
  return model.rotationRadians ?? 0;
}

export function getModelShapeAtPosition(
  model: ModelState,
  position: Position,
): ModelShape {
  const characteristics = getModelStateCharacteristics(model);
  if (characteristics && isVehicleCharacteristics(characteristics)) {
    const footprint = resolveVehicleFootprint(model.unitProfileId);
    if (footprint.kind === 'circle') {
      return createCircleBaseInches(position, footprint.diameterInches / 2);
    }

    return createRectHull(
      position,
      footprint.lengthInches,
      footprint.widthInches,
      getModelShapeRotation(model),
    );
  }

  return createCircleBase(position, getModelStateBaseSizeMM(model));
}

export function getModelShapeRenderRadius(model: ModelState): number {
  const shape = getModelShapeAtPosition(model, model.position);
  return shape.kind === 'circle'
    ? shape.radius
    : Math.max(shape.width, shape.height) / 2;
}

export function getModelShape(model: ModelState): ModelShape {
  return getModelShapeAtPosition(model, model.position);
}
