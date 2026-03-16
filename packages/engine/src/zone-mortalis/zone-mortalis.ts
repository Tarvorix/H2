import type {
  GameState,
  MissionState,
  ModelState,
  ObjectiveMarker,
  Position,
  TerrainPiece,
  ZoneMortalisBlindPanicCheck,
  ZoneMortalisDoorwayTerrainData,
  ZoneMortalisSectionState,
  ZoneMortalisState,
} from '@hh/types';
import {
  GameMode,
  MissionSpecialRule,
  ModelType,
  TerrainType,
} from '@hh/types';
import { findDeploymentMapByType, ZONE_MORTALIS_SECTION_SIZE } from '@hh/data';
import {
  EPSILON,
  terrainChordLength,
} from '@hh/geometry';
import {
  getUnitSpecialRules,
  lookupModelDefinition,
  lookupUnitProfile,
} from '../profile-lookup';
import type { DiceProvider } from '../types';

type ZoneMortalisPathContext = 'measurement' | 'movement' | 'charge';

interface RectObstacle {
  id: string;
  topLeft: Position;
  width: number;
  height: number;
}

interface GraphNode {
  id: string;
  position: Position;
}

function makeRectTerrain(
  id: string,
  topLeft: Position,
  width: number,
  height: number,
): TerrainPiece {
  return {
    id,
    name: id,
    type: TerrainType.Impassable,
    shape: {
      kind: 'rectangle',
      topLeft,
      width,
      height,
    },
    isDifficult: false,
    isDangerous: false,
  };
}

function pointInRect(point: Position, obstacle: RectObstacle): boolean {
  return (
    point.x > obstacle.topLeft.x + EPSILON &&
    point.x < obstacle.topLeft.x + obstacle.width - EPSILON &&
    point.y > obstacle.topLeft.y + EPSILON &&
    point.y < obstacle.topLeft.y + obstacle.height - EPSILON
  );
}

function distanceBetween(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function parseNumericRuleValue(
  rules: Array<{ name: string; value?: string }>,
  ruleName: string,
): number | null {
  const match = rules.find((rule) => rule.name.toLowerCase() === ruleName.toLowerCase());
  if (!match?.value) {
    return null;
  }

  const parsed = Number.parseInt(String(match.value).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getModelBulkyValue(model: ModelState): number {
  const unitRules = getUnitSpecialRules(model.unitProfileId);
  const modelRules = lookupModelDefinition(model.unitProfileId, model.profileModelName)?.specialRules ?? [];
  return Math.max(
    0,
    parseNumericRuleValue([...unitRules, ...modelRules], 'Bulky') ?? 0,
  );
}

function getModelTypeForZoneMortalis(model: ModelState): ModelType | null {
  const modelType = lookupModelDefinition(model.unitProfileId, model.profileModelName)?.modelType;
  if (modelType !== undefined) {
    return modelType;
  }

  return lookupUnitProfile(model.unitProfileId)?.unitType ?? null;
}

function getModelHullPoints(model: ModelState): number {
  const characteristics = lookupModelDefinition(model.unitProfileId, model.profileModelName)?.characteristics;
  if (!characteristics || !('HP' in characteristics)) {
    return 0;
  }

  return characteristics.HP;
}

function getObjectiveStateLookup(
  zoneMortalisState: ZoneMortalisState | undefined,
): Map<string, ZoneMortalisState['objectives'][number]> {
  return new Map((zoneMortalisState?.objectives ?? []).map((objectiveState) => [
    objectiveState.objectiveId,
    objectiveState,
  ]));
}

function buildSections(missionState: MissionState | null): ZoneMortalisSectionState[] {
  const traits = missionState
    ? (findDeploymentMapByType(missionState.deploymentMap)?.zoneMortalisSectionTraits ?? [])
    : [];

  const sections: ZoneMortalisSectionState[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const trait = traits.find((candidate) => candidate.row === row && candidate.column === column);
      sections.push({
        id: `section-${row}-${column}`,
        row,
        column,
        topLeft: {
          x: column * ZONE_MORTALIS_SECTION_SIZE,
          y: row * ZONE_MORTALIS_SECTION_SIZE,
        },
        confinedSpace: trait?.confinedSpace ?? 10,
        hasAbyssalDarkness: false,
        abyssalDarknessExpiresAfterPlayerTurn: null,
        label: trait?.label,
      });
    }
  }

  return sections;
}

function buildObjectives(
  missionState: MissionState | null,
  currentState: ZoneMortalisState | undefined,
): ZoneMortalisState['objectives'] {
  if (!missionState) {
    return [];
  }

  const currentLookup = getObjectiveStateLookup(currentState);
  return missionState.objectives.map((objective) => {
    const current = currentLookup.get(objective.id);
    return {
      objectiveId: objective.id,
      currentValue: objective.currentVpValue,
      isActive: !objective.isRemoved,
      isInterfaced: current?.isInterfaced ?? objective.currentVpValue > 0,
    };
  });
}

export function isZoneMortalisGame(state: GameState): boolean {
  return state.gameMode === GameMode.ZoneMortalis;
}

export function initializeZoneMortalisState(
  terrain: TerrainPiece[],
  missionState: MissionState | null,
  currentState?: ZoneMortalisState,
): ZoneMortalisState {
  const currentDoorways = new Map(
    (currentState?.doorways ?? []).map((doorway) => [doorway.id, doorway]),
  );

  const doorways = terrain
    .filter((piece): piece is TerrainPiece & { zoneMortalis: ZoneMortalisDoorwayTerrainData } =>
      piece.zoneMortalis?.kind === 'doorway',
    )
    .map((piece) => currentDoorways.get(piece.id) ?? {
      ...piece.zoneMortalis,
      id: piece.id,
    });

  return {
    sections: currentState?.sections?.length === 16 ? currentState.sections : buildSections(missionState),
    doorways,
    objectives: buildObjectives(missionState, currentState),
    unitObjectiveAssignments: currentState?.unitObjectiveAssignments ?? {},
    doorwayOperationHistory: currentState?.doorwayOperationHistory ?? [],
    pendingBlindPanicChecks: currentState?.pendingBlindPanicChecks ?? [],
  };
}

export function ensureZoneMortalisState(state: GameState): GameState {
  if (!isZoneMortalisGame(state)) {
    return state;
  }

  return {
    ...state,
    zoneMortalisState: initializeZoneMortalisState(
      state.terrain,
      state.missionState,
      state.zoneMortalisState,
    ),
  };
}

export function getZoneMortalisDoorway(
  state: GameState,
  doorwayId: string,
): ZoneMortalisDoorwayTerrainData | null {
  const ensured = ensureZoneMortalisState(state);
  return ensured.zoneMortalisState?.doorways.find((doorway) => doorway.id === doorwayId) ?? null;
}

export function updateZoneMortalisDoorway(
  state: GameState,
  doorwayId: string,
  updater: (doorway: ZoneMortalisDoorwayTerrainData) => ZoneMortalisDoorwayTerrainData,
): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  const updatedDoorways = ensured.zoneMortalisState.doorways.map((doorway) =>
    doorway.id === doorwayId ? updater(doorway) : doorway,
  );
  const updatedTerrain = ensured.terrain.map((piece) => {
    const doorway = updatedDoorways.find((candidate) => candidate.id === piece.id);
    if (!doorway) {
      return piece;
    }

    return {
      ...piece,
      zoneMortalis: doorway,
    };
  });

  return {
    ...ensured,
    terrain: updatedTerrain,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      doorways: updatedDoorways,
    },
  };
}

export function setZoneMortalisObjectiveAssignments(
  state: GameState,
  assignments: Record<string, string | null>,
): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  return {
    ...ensured,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      unitObjectiveAssignments: assignments,
    },
  };
}

export function updateZoneMortalisSections(
  state: GameState,
  updater: (sections: ZoneMortalisSectionState[]) => ZoneMortalisSectionState[],
): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  return {
    ...ensured,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      sections: updater(ensured.zoneMortalisState.sections),
    },
  };
}

export function updateZoneMortalisObjectives(
  state: GameState,
  updater: (objectives: ZoneMortalisState['objectives']) => ZoneMortalisState['objectives'],
): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  return {
    ...ensured,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      objectives: updater(ensured.zoneMortalisState.objectives),
    },
  };
}

export function queueZoneMortalisBlindPanicChecks(
  state: GameState,
  checks: ZoneMortalisBlindPanicCheck[],
): GameState {
  if (checks.length === 0) {
    return state;
  }

  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  const existing = new Set(
    (ensured.zoneMortalisState.pendingBlindPanicChecks ?? [])
      .map((check) => `${check.sourceUnitId}:${check.unitId}`),
  );
  const merged = [...(ensured.zoneMortalisState.pendingBlindPanicChecks ?? [])];

  for (const check of checks) {
    const key = `${check.sourceUnitId}:${check.unitId}`;
    if (existing.has(key)) {
      continue;
    }
    existing.add(key);
    merged.push(check);
  }

  return {
    ...ensured,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      pendingBlindPanicChecks: merged,
    },
  };
}

export function clearZoneMortalisBlindPanicChecks(state: GameState): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (!ensured.zoneMortalisState) {
    return ensured;
  }

  return {
    ...ensured,
    zoneMortalisState: {
      ...ensured.zoneMortalisState,
      pendingBlindPanicChecks: [],
    },
  };
}

export function applyZoneMortalisCrumblingSuperstructure(
  state: GameState,
  dice: DiceProvider,
): GameState {
  const ensured = ensureZoneMortalisState(state);
  if (
    !ensured.zoneMortalisState ||
    !ensured.missionState?.activeSpecialRules.includes(MissionSpecialRule.CrumblingSuperstructure)
  ) {
    return ensured;
  }

  const occupiedSectionIds = new Set<string>();
  for (const army of ensured.armies) {
    for (const unit of army.units) {
      if (!unit.isDeployed || unit.embarkedOnId !== null) {
        continue;
      }

      for (const model of unit.models) {
        if (model.isDestroyed) {
          continue;
        }

        const section = getZoneMortalisSectionAtPosition(ensured, model.position);
        if (section) {
          occupiedSectionIds.add(section.id);
        }
      }
    }
  }

  return updateZoneMortalisSections(ensured, (sections) => sections.map((section) => {
    if (occupiedSectionIds.has(section.id)) {
      return section;
    }

    const roll = dice.rollD6();
    if (roll === 1) {
      return {
        ...section,
        hasAbyssalDarkness: true,
        abyssalDarknessExpiresAfterPlayerTurn: null,
      };
    }

    return {
      ...section,
      confinedSpace: roll,
      hasAbyssalDarkness: false,
      abyssalDarknessExpiresAfterPlayerTurn: null,
    };
  }));
}

function doorwayBlocksPassage(
  doorway: ZoneMortalisDoorwayTerrainData,
  model: ModelState | null,
  context: ZoneMortalisPathContext,
): boolean {
  if (doorway.state === 'destroyed') {
    return false;
  }

  if (doorway.state === 'closed') {
    return true;
  }

  if (!model || context === 'measurement') {
    return false;
  }

  const modelType = getModelTypeForZoneMortalis(model);
  if (modelType === ModelType.Vehicle) {
    return true;
  }

  const bulkyValue = getModelBulkyValue(model);
  if (bulkyValue <= doorway.width) {
    return false;
  }

  if (bulkyValue > doorway.width * 2) {
    return true;
  }

  return context === 'charge';
}

function doorwayMovePenalty(
  doorway: ZoneMortalisDoorwayTerrainData,
  model: ModelState | null,
): number {
  if (doorway.state === 'destroyed') {
    return 0;
  }

  if (!model) {
    return 0;
  }

  const bulkyValue = getModelBulkyValue(model);
  if (bulkyValue <= doorway.width) {
    return 0;
  }

  return Math.max(0, bulkyValue - doorway.width);
}

function sectionBlocksPassage(section: ZoneMortalisSectionState, model: ModelState | null): boolean {
  if (!model || section.confinedSpace === null) {
    return false;
  }

  const modelType = getModelTypeForZoneMortalis(model);
  if (modelType === ModelType.Vehicle && getModelHullPoints(model) >= 3) {
    return true;
  }

  const bulkyValue = getModelBulkyValue(model);
  return bulkyValue >= section.confinedSpace;
}

export function getZoneMortalisSectionAtPosition(
  state: GameState,
  position: Position,
): ZoneMortalisSectionState | null {
  const ensured = ensureZoneMortalisState(state);
  return ensured.zoneMortalisState?.sections.find((section) =>
    position.x >= section.topLeft.x &&
    position.x <= section.topLeft.x + ZONE_MORTALIS_SECTION_SIZE &&
    position.y >= section.topLeft.y &&
    position.y <= section.topLeft.y + ZONE_MORTALIS_SECTION_SIZE,
  ) ?? null;
}

function getBlockingObstacles(
  state: GameState,
  context: ZoneMortalisPathContext,
  model: ModelState | null,
  start: Position,
  end: Position,
  ignoredTerrainIds: ReadonlySet<string> = new Set(),
): RectObstacle[] {
  const ensured = ensureZoneMortalisState(state);
  const obstacles: RectObstacle[] = [];

  for (const piece of ensured.terrain) {
    if (ignoredTerrainIds.has(piece.id)) {
      continue;
    }

    const doorway = piece.zoneMortalis?.kind === 'doorway'
      ? getZoneMortalisDoorway(ensured, piece.id)
      : null;
    const blocks = doorway
      ? doorwayBlocksPassage(doorway, model, context)
      : piece.zoneMortalis?.kind === 'wall' || piece.type === TerrainType.Impassable;

    if (!blocks || piece.shape.kind !== 'rectangle') {
      continue;
    }

    obstacles.push({
      id: piece.id,
      topLeft: piece.shape.topLeft,
      width: piece.shape.width,
      height: piece.shape.height,
    });
  }

  if (context !== 'measurement' && ensured.zoneMortalisState) {
    for (const section of ensured.zoneMortalisState.sections) {
      if (!sectionBlocksPassage(section, model)) {
        continue;
      }

      const sectionRect: RectObstacle = {
        id: section.id,
        topLeft: section.topLeft,
        width: ZONE_MORTALIS_SECTION_SIZE,
        height: ZONE_MORTALIS_SECTION_SIZE,
      };
      if (pointInRect(start, sectionRect) || pointInRect(end, sectionRect)) {
        return [];
      }

      obstacles.push(sectionRect);
    }
  }

  return obstacles;
}

export function getZoneMortalisBlockingTerrainPieces(
  state: GameState,
  context: ZoneMortalisPathContext = 'measurement',
  model: ModelState | null = null,
): TerrainPiece[] {
  const ensured = ensureZoneMortalisState(state);
  return ensured.terrain.filter((piece) => {
    const doorway = piece.zoneMortalis?.kind === 'doorway'
      ? getZoneMortalisDoorway(ensured, piece.id)
      : null;
    if (doorway) {
      return doorwayBlocksPassage(doorway, model, context);
    }

    return piece.zoneMortalis?.kind === 'wall' || piece.type === TerrainType.Impassable;
  });
}

function obstacleBlocksSegment(
  obstacle: RectObstacle,
  a: Position,
  b: Position,
): boolean {
  const terrain = makeRectTerrain(obstacle.id, obstacle.topLeft, obstacle.width, obstacle.height);
  return terrainChordLength(a, b, terrain) > EPSILON;
}

function isSegmentClear(
  from: Position,
  to: Position,
  obstacles: RectObstacle[],
  fromNodeId?: string,
  toNodeId?: string,
): boolean {
  for (const obstacle of obstacles) {
    if (obstacle.id === fromNodeId || obstacle.id === toNodeId) {
      continue;
    }

    if (pointInRect(from, obstacle) || pointInRect(to, obstacle)) {
      return false;
    }

    if (obstacleBlocksSegment(obstacle, from, to)) {
      return false;
    }
  }

  return true;
}

function buildGraphNodes(obstacles: RectObstacle[], from: Position, to: Position): GraphNode[] {
  const nodes: GraphNode[] = [
    { id: 'start', position: from },
    { id: 'end', position: to },
  ];

  for (const obstacle of obstacles) {
    const left = obstacle.topLeft.x;
    const right = obstacle.topLeft.x + obstacle.width;
    const top = obstacle.topLeft.y;
    const bottom = obstacle.topLeft.y + obstacle.height;

    nodes.push(
      { id: obstacle.id, position: { x: left, y: top } },
      { id: obstacle.id, position: { x: right, y: top } },
      { id: obstacle.id, position: { x: right, y: bottom } },
      { id: obstacle.id, position: { x: left, y: bottom } },
    );
  }

  return nodes;
}

function computeShortestVisibilityPathDistance(
  from: Position,
  to: Position,
  obstacles: RectObstacle[],
): number | null {
  if (isSegmentClear(from, to, obstacles)) {
    return distanceBetween(from, to);
  }

  const nodes = buildGraphNodes(obstacles, from, to);
  const distances = new Map<string, number>(nodes.map((node) => [node.id + JSON.stringify(node.position), Number.POSITIVE_INFINITY]));
  const visited = new Set<string>();
  const nodeKey = (node: GraphNode): string => node.id + JSON.stringify(node.position);
  const startNode = nodes[0];
  const endNode = nodes[1];
  distances.set(nodeKey(startNode), 0);

  while (visited.size < nodes.length) {
    let current: GraphNode | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      const key = nodeKey(node);
      if (visited.has(key)) {
        continue;
      }

      const distance = distances.get(key) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = node;
        currentDistance = distance;
      }
    }

    if (!current || !Number.isFinite(currentDistance)) {
      break;
    }

    const currentKey = nodeKey(current);
    if (current === endNode) {
      return currentDistance;
    }

    visited.add(currentKey);
    for (const neighbor of nodes) {
      const neighborKey = nodeKey(neighbor);
      if (neighborKey === currentKey || visited.has(neighborKey)) {
        continue;
      }

      if (!isSegmentClear(current.position, neighbor.position, obstacles, current.id, neighbor.id)) {
        continue;
      }

      const candidate = currentDistance + distanceBetween(current.position, neighbor.position);
      if (candidate < (distances.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighborKey, candidate);
      }
    }
  }

  return null;
}

function getOpenDoorwaysCrossed(
  state: GameState,
  from: Position,
  to: Position,
  model: ModelState | null,
): ZoneMortalisDoorwayTerrainData[] {
  const ensured = ensureZoneMortalisState(state);
  const crossed: ZoneMortalisDoorwayTerrainData[] = [];

  for (const doorway of ensured.zoneMortalisState?.doorways ?? []) {
    if (doorway.state === 'closed' || doorwayBlocksPassage(doorway, model, 'movement')) {
      continue;
    }

    const terrainPiece = ensured.terrain.find((piece) => piece.id === doorway.id);
    if (!terrainPiece || terrainPiece.shape.kind !== 'rectangle') {
      continue;
    }

    const terrain = makeRectTerrain(
      terrainPiece.id,
      terrainPiece.shape.topLeft,
      terrainPiece.shape.width,
      terrainPiece.shape.height,
    );
    if (terrainChordLength(from, to, terrain) > EPSILON) {
      crossed.push(doorway);
    }
  }

  return crossed;
}

export function getZoneMortalisMeasurementDistance(
  state: GameState,
  from: Position,
  to: Position,
): number | null {
  const obstacles = getBlockingObstacles(state, 'measurement', null, from, to);
  return computeShortestVisibilityPathDistance(from, to, obstacles);
}

export function getZoneMortalisMeasurementDistanceIgnoringTerrain(
  state: GameState,
  from: Position,
  to: Position,
  ignoredTerrainIds: string[],
): number | null {
  const obstacles = getBlockingObstacles(
    state,
    'measurement',
    null,
    from,
    to,
    new Set(ignoredTerrainIds),
  );
  return computeShortestVisibilityPathDistance(from, to, obstacles);
}

export function getZoneMortalisMovementDistance(
  state: GameState,
  model: ModelState,
  from: Position,
  to: Position,
  context: 'movement' | 'charge' = 'movement',
): { distance: number | null; doorwayPenalty: number } {
  const startSection = getZoneMortalisSectionAtPosition(state, from);
  const endSection = getZoneMortalisSectionAtPosition(state, to);
  if (!startSection || !endSection) {
    return { distance: null, doorwayPenalty: 0 };
  }
  if (sectionBlocksPassage(startSection, model) || sectionBlocksPassage(endSection, model)) {
    return { distance: null, doorwayPenalty: 0 };
  }

  const obstacles = getBlockingObstacles(state, context, model, from, to);
  if (obstacles.length === 0 && (sectionBlocksPassage(startSection, model) || sectionBlocksPassage(endSection, model))) {
    return { distance: null, doorwayPenalty: 0 };
  }

  const distance = computeShortestVisibilityPathDistance(from, to, obstacles);
  if (distance === null || context === 'charge') {
    return { distance, doorwayPenalty: 0 };
  }

  const doorwayPenalty = getOpenDoorwaysCrossed(state, from, to, model)
    .reduce((maximum, doorway) => Math.max(maximum, doorwayMovePenalty(doorway, model)), 0);

  return {
    distance,
    doorwayPenalty,
  };
}

export function hasZoneMortalisLineOfSight(
  state: GameState,
  from: Position,
  to: Position,
): boolean {
  if (!isZoneMortalisGame(state)) {
    return true;
  }

  const distance = getZoneMortalisMeasurementDistance(state, from, to);
  if (distance === null) {
    return false;
  }

  const ensured = ensureZoneMortalisState(state);
  const darkSections = (ensured.zoneMortalisState?.sections ?? []).filter((section) => section.hasAbyssalDarkness);
  if (darkSections.length === 0) {
    return true;
  }

  let darknessDistance = 0;
  for (const section of darkSections) {
    const terrain = makeRectTerrain(
      section.id,
      section.topLeft,
      ZONE_MORTALIS_SECTION_SIZE,
      ZONE_MORTALIS_SECTION_SIZE,
    );
    darknessDistance += terrainChordLength(from, to, terrain);
  }

  return darknessDistance <= 6 + EPSILON;
}

export function hasZoneMortalisLineOfSightIgnoringTerrain(
  state: GameState,
  from: Position,
  to: Position,
  ignoredTerrainIds: string[],
): boolean {
  if (!isZoneMortalisGame(state)) {
    return true;
  }

  const distance = getZoneMortalisMeasurementDistanceIgnoringTerrain(state, from, to, ignoredTerrainIds);
  if (distance === null) {
    return false;
  }

  const ensured = ensureZoneMortalisState(state);
  const darkSections = (ensured.zoneMortalisState?.sections ?? []).filter((section) => section.hasAbyssalDarkness);
  if (darkSections.length === 0) {
    return true;
  }

  let darknessDistance = 0;
  for (const section of darkSections) {
    const terrain = makeRectTerrain(
      section.id,
      section.topLeft,
      ZONE_MORTALIS_SECTION_SIZE,
      ZONE_MORTALIS_SECTION_SIZE,
    );
    darknessDistance += terrainChordLength(from, to, terrain);
  }

  return darknessDistance <= 6 + EPSILON;
}

export function syncZoneMortalisMissionObjectives(
  state: GameState,
  objectives: ObjectiveMarker[],
): GameState {
  const missionState = state.missionState;
  if (!missionState) {
    return state;
  }

  const nextState: GameState = {
    ...state,
    missionState: {
      ...missionState,
      objectives,
    },
  };

  return {
    ...nextState,
    zoneMortalisState: initializeZoneMortalisState(
      nextState.terrain,
      nextState.missionState,
      nextState.zoneMortalisState,
    ),
  };
}
