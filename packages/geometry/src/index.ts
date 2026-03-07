// @hh/geometry — Measurement, LOS, templates, collision

// ─── Constants ────────────────────────────────────────────────────────────────
export {
  MM_TO_INCHES,
  INCHES_TO_MM,
  EPSILON,
  BASE_25MM_DIAMETER,
  BASE_25MM_RADIUS,
  BASE_32MM_DIAMETER,
  BASE_32MM_RADIUS,
  BASE_40MM_DIAMETER,
  BASE_40MM_RADIUS,
  BASE_60MM_DIAMETER,
  BASE_60MM_RADIUS,
  STANDARD_COHERENCY_RANGE,
  SKIRMISH_COHERENCY_RANGE,
  ENEMY_EXCLUSION_ZONE,
  MEDIUM_TERRAIN_CHORD_THRESHOLD,
  BLAST_STANDARD_RADIUS,
  BLAST_LARGE_RADIUS,
  BLAST_MASSIVE_RADIUS,
  TEMPLATE_LENGTH,
  TEMPLATE_NARROW_WIDTH,
  TEMPLATE_WIDE_WIDTH,
  DEFAULT_BATTLEFIELD_WIDTH,
  DEFAULT_BATTLEFIELD_HEIGHT,
  TWO_PI,
  HALF_PI,
  DEG_TO_RAD,
  RAD_TO_DEG,
} from './constants';

// ─── 2D Vector Math ───────────────────────────────────────────────────────────
export {
  vec2Add,
  vec2Sub,
  vec2Scale,
  vec2Negate,
  vec2Dot,
  vec2Cross,
  vec2LengthSq,
  vec2Length,
  vec2DistanceSq,
  vec2Distance,
  vec2Normalize,
  vec2Perpendicular,
  vec2PerpendicularCW,
  vec2Rotate,
  vec2Lerp,
  vec2Angle,
  vec2AngleOf,
  vec2Equal,
  approxZero,
  approxEqual,
  clamp,
  projectPointOntoSegment,
  closestPointOnSegment,
} from './vec2';

// ─── Shapes ───────────────────────────────────────────────────────────────────
export type { CircleBase, RectHull, ModelShape, Segment, AABB } from './shapes';
export {
  createCircleBase,
  createCircleBaseInches,
  createRectHull,
  getRectCorners,
  getRectEdges,
  closestPointOnCircle,
  closestPointOnRect,
  closestPointOnShape,
  getShapeBounds,
  pointInAABB,
  aabbOverlap,
  pointInCircleBase,
  pointInRectHull,
  pointInShape,
} from './shapes';

// ─── Distance ─────────────────────────────────────────────────────────────────
export {
  distanceCircleToCircle,
  distanceCircleToRect,
  distanceRectToRect,
  distanceShapes,
  areInBaseContact,
  distanceRoundUp,
  isWithinRange,
} from './distance';

// ─── Intersection ─────────────────────────────────────────────────────────────
export {
  segmentSegmentIntersection,
  segmentCircleIntersection,
  segmentPolygonIntersection,
  segmentRectIntersection,
  externalTangentLines,
  internalTangentLines,
  allTangentLines,
  circleToRectRays,
  rectToRectRays,
  chordLengthThroughPolygon,
  chordLengthThroughCircle,
  pointInPolygon,
  pointInCircle,
  pointInRect,
  segmentIntersectsRect,
} from './intersection';

// ─── Terrain ──────────────────────────────────────────────────────────────────
export {
  pointInTerrainShape,
  pointInTerrain,
  modelInTerrain,
  getTerrainAtPoint,
  terrainChordLength,
  getTerrainVertices,
} from './terrain';

// ─── Line of Sight ────────────────────────────────────────────────────────────
export type { TerrainIntersection, LOSRay, LOSResult } from './line-of-sight';
export { checkLOS, hasLOS } from './line-of-sight';

// ─── Vehicle Facing ───────────────────────────────────────────────────────────
export { determineVehicleFacing, getVehicleArcBoundaries } from './vehicle-facing';

// ─── Coherency ────────────────────────────────────────────────────────────────
export type { CoherencyResult } from './coherency';
export { checkCoherency, isUnitCoherent } from './coherency';

// ─── Movement Envelope ────────────────────────────────────────────────────────
export type { MovementEnvelopeResult } from './movement-envelope';
export {
  computeMovementEnvelope,
  isWithinMovementRange,
  isInExclusionZone,
  isInImpassableTerrain,
} from './movement-envelope';

// ─── Blast & Template ─────────────────────────────────────────────────────────
export type { TemplateShape, ScatterResult } from './blast-template';
export {
  blastOverlap,
  isModelHitByBlast,
  createStandardTemplate,
  getTemplateVertices,
  templateOverlap,
  applyScatter,
  randomScatter,
  blastSizeToRadius,
} from './blast-template';

// ─── Quadtree ─────────────────────────────────────────────────────────────────
export { QuadTree } from './quadtree';

// ─── Scenario Helpers ─────────────────────────────────────────────────────────
export type { Scenario } from './scenario';
export {
  createInfantryLine,
  createInfantryLineEdgeSpacing,
  createInfantryGrid,
  createVehicle,
  createRhino,
  createLandRaider,
  createRectTerrain,
  createCircleTerrain,
  createPolygonTerrain,
  createOpenFieldScenario,
  createTerrainScenario,
  createVehicleScenario,
  createCoherencyTestScenario,
  createBlastTestScenario,
} from './scenario';

// ─── Deployment Formations ───────────────────────────────────────────────────
export type { DeploymentFormationPreset, DeploymentFormationAxes } from './deployment-formations';
export {
  buildUnitDeploymentFormation,
  buildUnitDeploymentFormationWithAxes,
  getDeploymentFormationSpacing,
} from './deployment-formations';
