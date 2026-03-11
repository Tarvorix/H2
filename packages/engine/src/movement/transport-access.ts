import type {
  AccessFacing,
  AccessPoint,
  ModelState,
  Position,
  UnitProfile,
} from '@hh/types';
import {
  ModelSubType,
  ModelType,
} from '@hh/types';
import type {
  CircleBase,
  ModelShape,
  RectHull,
  Segment,
} from '@hh/geometry';
import {
  closestPointOnRect,
  closestPointOnSegment,
  createCircleBase,
  getRectCorners,
  getRectEdges,
  pointInRectHull,
  segmentIntersectsRect,
  vec2Distance,
} from '@hh/geometry';
import { getModelShape, getModelShapeAtPosition } from '../model-shapes';
import { lookupModelDefinition } from '../profile-lookup';

type AccessBoundary =
  | { kind: 'circle'; circle: CircleBase }
  | { kind: 'segment'; segment: Segment };

const FACING_EDGE_INDEX: Record<AccessFacing, number> = {
  front: 0,
  right: 1,
  rear: 2,
  left: 3,
};

function getTransportBaseShape(
  transportModel: ModelState,
  transportProfile: UnitProfile,
): CircleBase | null {
  const modelDef = lookupModelDefinition(
    transportProfile.id,
    transportModel.profileModelName,
  ) ?? transportProfile.modelDefinitions[0];
  if (!modelDef || modelDef.baseSizeMM <= 0) {
    return null;
  }

  return createCircleBase(transportModel.position, modelDef.baseSizeMM);
}

function usesWholeBaseEdge(
  transportProfile: UnitProfile,
  transportBase: CircleBase | null,
): boolean {
  if (!transportBase) {
    return false;
  }

  return (
    transportProfile.unitType !== ModelType.Vehicle ||
    transportProfile.unitSubTypes.includes(ModelSubType.Flyer)
  );
}

function allFacingBoundaries(
  transportShape: ModelShape,
): AccessBoundary[] {
  if (transportShape.kind === 'circle') {
    return [{ kind: 'circle', circle: transportShape }];
  }

  return getRectEdges(transportShape).map((segment) => ({ kind: 'segment', segment }));
}

function resolveAccessPointBoundaries(
  accessPoint: AccessPoint,
  transportShape: ModelShape,
  transportBase: CircleBase | null,
): AccessBoundary[] {
  switch (accessPoint.geometry.kind) {
    case 'base-edge':
      if (transportBase) {
        return [{ kind: 'circle', circle: transportBase }];
      }
      return transportShape.kind === 'circle'
        ? [{ kind: 'circle', circle: transportShape }]
        : [];

    case 'base-edge-or-all-facings':
      if (transportBase) {
        return [{ kind: 'circle', circle: transportBase }];
      }
      return allFacingBoundaries(transportShape);

    case 'all-facings':
      return allFacingBoundaries(transportShape);

    case 'facings':
      if (transportShape.kind === 'circle') {
        return [{ kind: 'circle', circle: transportShape }];
      }

      return accessPoint.geometry.facings.map((facing) => ({
        kind: 'segment' as const,
        segment: getRectEdges(transportShape)[FACING_EDGE_INDEX[facing]],
      }));
  }
}

function getAccessBoundaries(
  transportModel: ModelState,
  transportProfile: UnitProfile,
): AccessBoundary[] {
  const transportBase = getTransportBaseShape(transportModel, transportProfile);
  const normalizedTransportModel: ModelState = {
    ...transportModel,
    unitProfileId: transportProfile.id,
    profileModelName: transportProfile.modelDefinitions[0]?.name ?? transportModel.profileModelName,
  };
  const normalizedTransportShape = getModelShape(normalizedTransportModel);

  if (usesWholeBaseEdge(transportProfile, transportBase)) {
    return [{ kind: 'circle', circle: transportBase! }];
  }

  const boundaries = (transportProfile.accessPoints ?? [])
    .flatMap((accessPoint) =>
      resolveAccessPointBoundaries(accessPoint, normalizedTransportShape, transportBase),
    );

  const deduped = new Map<string, AccessBoundary>();
  for (const boundary of boundaries) {
    const key = boundary.kind === 'circle'
      ? `circle:${boundary.circle.center.x}:${boundary.circle.center.y}:${boundary.circle.radius}`
      : `segment:${boundary.segment.start.x}:${boundary.segment.start.y}:${boundary.segment.end.x}:${boundary.segment.end.y}`;
    deduped.set(key, boundary);
  }

  return Array.from(deduped.values());
}

function distanceCircleToSegment(
  circle: CircleBase,
  segment: Segment,
): number {
  const closest = closestPointOnSegment(circle.center, segment.start, segment.end);
  return Math.max(0, vec2Distance(circle.center, closest) - circle.radius);
}

function distanceRectToSegment(
  rect: RectHull,
  segment: Segment,
): number {
  if (
    segmentIntersectsRect(segment.start, segment.end, rect) ||
    pointInRectHull(segment.start, rect) ||
    pointInRectHull(segment.end, rect)
  ) {
    return 0;
  }

  let minDistance = Infinity;

  for (const endpoint of [segment.start, segment.end]) {
    const closest = closestPointOnRect(rect, endpoint);
    minDistance = Math.min(minDistance, vec2Distance(endpoint, closest));
  }

  for (const corner of getRectCorners(rect)) {
    const closest = closestPointOnSegment(corner, segment.start, segment.end);
    minDistance = Math.min(minDistance, vec2Distance(corner, closest));
  }

  return minDistance;
}

function distanceShapeToCircleBoundary(
  shape: ModelShape,
  circle: CircleBase,
): number {
  if (shape.kind === 'circle') {
    return Math.max(
      0,
      Math.abs(vec2Distance(shape.center, circle.center) - circle.radius) - shape.radius,
    );
  }

  const closest = closestPointOnRect(shape, circle.center);
  return Math.max(0, vec2Distance(circle.center, closest) - circle.radius);
}

function distanceShapeToBoundary(
  shape: ModelShape,
  boundary: AccessBoundary,
): number {
  if (boundary.kind === 'circle') {
    return distanceShapeToCircleBoundary(shape, boundary.circle);
  }

  return shape.kind === 'circle'
    ? distanceCircleToSegment(shape, boundary.segment)
    : distanceRectToSegment(shape, boundary.segment);
}

export function getTransportAccessDistanceAtPosition(
  model: ModelState,
  position: Position,
  transportModel: ModelState,
  transportProfile: UnitProfile,
): number | null {
  const boundaries = getAccessBoundaries(transportModel, transportProfile);
  if (boundaries.length === 0) {
    return null;
  }

  const modelShape = getModelShapeAtPosition(model, position);
  let minDistance = Infinity;
  for (const boundary of boundaries) {
    minDistance = Math.min(minDistance, distanceShapeToBoundary(modelShape, boundary));
  }

  return Number.isFinite(minDistance) ? minDistance : null;
}

export function getEmergencyDisembarkAnchorShape(
  transportModel: ModelState,
  transportProfile: UnitProfile,
): ModelShape {
  const transportBase = getTransportBaseShape(transportModel, transportProfile);
  if (usesWholeBaseEdge(transportProfile, transportBase)) {
    return transportBase!;
  }

  return getModelShape({
    ...transportModel,
    unitProfileId: transportProfile.id,
    profileModelName: transportProfile.modelDefinitions[0]?.name ?? transportModel.profileModelName,
  });
}
