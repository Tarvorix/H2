import type { DiceProvider } from '@hh/engine';
import { RandomDiceProvider } from '@hh/engine';
import type {
  MissionDefinition,
  ObjectiveMarker,
  Position,
} from '@hh/types';
import type { ObjectivePlacementUIState } from './types';

const DEFAULT_EDGE_BUFFER = 12;

function distanceBetween(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isWithinBattlefieldEdgeBuffer(
  position: Position,
  battlefieldWidth: number,
  battlefieldHeight: number,
  edgeBuffer: number,
): boolean {
  return (
    position.x >= edgeBuffer &&
    position.x <= battlefieldWidth - edgeBuffer &&
    position.y >= edgeBuffer &&
    position.y <= battlefieldHeight - edgeBuffer
  );
}

function resolveHeartOfBattleCenter(
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position {
  return {
    x: battlefieldWidth / 2,
    y: battlefieldHeight / 2,
  };
}

export function rollObjectivePlacementFirstPlayerIndex(
  dice: DiceProvider = new RandomDiceProvider(),
): 0 | 1 {
  for (;;) {
    const player0Roll = dice.rollD6();
    const player1Roll = dice.rollD6();

    if (player0Roll === player1Roll) {
      continue;
    }

    return player0Roll > player1Roll ? 0 : 1;
  }
}

export function getFixedObjectiveCount(mission: MissionDefinition): number {
  switch (mission.objectivePlacement.kind) {
    case 'fixed':
      return mission.objectivePlacement.objectives.length;
    case 'center-fixed-alternating':
      return mission.objectivePlacement.fixedObjectives.length;
    default:
      return 0;
  }
}

export function getInitialObjectiveMarkers(
  mission: MissionDefinition,
  battlefieldWidth: number,
  battlefieldHeight: number,
): ObjectiveMarker[] {
  if (mission.objectivePlacement.kind === 'fixed') {
    return mission.objectivePlacement.objectives.map((obj, index) => ({
      id: `obj-fixed-${index}`,
      position: obj.position,
      vpValue: obj.vpValue,
      currentVpValue: obj.vpValue,
      isRemoved: false,
      label: obj.label,
    }));
  }

  if (mission.objectivePlacement.kind === 'center-fixed-alternating') {
    return mission.objectivePlacement.fixedObjectives.map((obj, index) => ({
      id: `obj-fixed-${index}`,
      position: mission.id === 'heart-of-battle'
        ? resolveHeartOfBattleCenter(battlefieldWidth, battlefieldHeight)
        : obj.position,
      vpValue: obj.vpValue,
      currentVpValue: obj.vpValue,
      isRemoved: false,
      label: obj.label,
    }));
  }

  return [];
}

export function getTotalObjectiveCount(mission: MissionDefinition): number {
  switch (mission.objectivePlacement.kind) {
    case 'fixed':
      return mission.objectivePlacement.objectives.length;
    case 'center-fixed-alternating':
      return mission.objectivePlacement.fixedObjectives.length + mission.objectivePlacement.count;
    case 'alternating':
      return mission.objectivePlacement.count;
    case 'symmetric':
      return mission.objectivePlacement.pairsCount * 2;
  }
}

export function getPlayerPlacedObjectiveCount(
  mission: MissionDefinition,
  placedObjectivesLength: number,
): number {
  return Math.max(0, placedObjectivesLength - getFixedObjectiveCount(mission));
}

export function getNextObjectivePlacingPlayerIndex(
  mission: MissionDefinition,
  firstPlacingPlayerIndex: 0 | 1,
  placedObjectivesLength: number,
): 0 | 1 {
  const playerPlacedCount = getPlayerPlacedObjectiveCount(mission, placedObjectivesLength);
  return playerPlacedCount % 2 === 0
    ? firstPlacingPlayerIndex
    : (firstPlacingPlayerIndex === 0 ? 1 : 0);
}

export function createObjectivePlacementState(
  mission: MissionDefinition,
  battlefieldWidth: number,
  battlefieldHeight: number,
  firstPlacingPlayerIndex: 0 | 1,
): ObjectivePlacementUIState {
  const placedObjectives = getInitialObjectiveMarkers(mission, battlefieldWidth, battlefieldHeight);

  return {
    firstPlacingPlayerIndex,
    placingPlayerIndex: getNextObjectivePlacingPlayerIndex(
      mission,
      firstPlacingPlayerIndex,
      placedObjectives.length,
    ),
    placedObjectives,
    totalToPlace: getTotalObjectiveCount(mission),
    pendingPosition: null,
  };
}

export function validateObjectivePlacement(
  mission: MissionDefinition,
  battlefieldWidth: number,
  battlefieldHeight: number,
  placedObjectives: ObjectiveMarker[],
  position: Position,
): { valid: boolean; error?: string } {
  if (mission.objectivePlacement.kind === 'fixed') {
    return {
      valid: false,
      error: 'This mission does not use manual objective placement.',
    };
  }

  if (mission.objectivePlacement.kind === 'center-fixed-alternating') {
    const placement = mission.objectivePlacement;
    if (!isWithinBattlefieldEdgeBuffer(position, battlefieldWidth, battlefieldHeight, placement.edgeBuffer)) {
      return {
        valid: false,
        error: `Objectives must be at least ${placement.edgeBuffer}" from every battlefield edge.`,
      };
    }

    const fixedObjectives = placedObjectives.slice(0, placement.fixedObjectives.length);
    for (const fixedObjective of fixedObjectives) {
      if (distanceBetween(position, fixedObjective.position) < placement.minimumDistanceFromFixedObjectives) {
        return {
          valid: false,
          error: `Objectives must be at least ${placement.minimumDistanceFromFixedObjectives}" from the central objective.`,
        };
      }
    }

    const playerPlacedObjectives = placedObjectives.slice(placement.fixedObjectives.length);
    for (const objective of playerPlacedObjectives) {
      if (distanceBetween(position, objective.position) < placement.minimumSpacing) {
        return {
          valid: false,
          error: `Objectives must be at least ${placement.minimumSpacing}" from other flank objectives.`,
        };
      }
    }

    return { valid: true };
  }

  if (mission.objectivePlacement.kind === 'alternating') {
    const placement = mission.objectivePlacement;
    if (!isWithinBattlefieldEdgeBuffer(position, battlefieldWidth, battlefieldHeight, placement.edgeBuffer)) {
      return {
        valid: false,
        error: `Objectives must be at least ${placement.edgeBuffer}" from every battlefield edge.`,
      };
    }

    for (const objective of placedObjectives) {
      if (distanceBetween(position, objective.position) < placement.minimumSpacing) {
        return {
          valid: false,
          error: `Objectives must be at least ${placement.minimumSpacing}" from each other.`,
        };
      }
    }

    return { valid: true };
  }

  const symmetricEdgeBuffer = DEFAULT_EDGE_BUFFER;
  if (!isWithinBattlefieldEdgeBuffer(position, battlefieldWidth, battlefieldHeight, symmetricEdgeBuffer)) {
    return {
      valid: false,
      error: `Objectives must be at least ${symmetricEdgeBuffer}" from every battlefield edge.`,
    };
  }

  for (const objective of placedObjectives) {
    if (distanceBetween(position, objective.position) < mission.objectivePlacement.separationDistance) {
      return {
        valid: false,
        error: `Objectives must be at least ${mission.objectivePlacement.separationDistance}" from each other.`,
      };
    }
  }

  return { valid: true };
}

export function createObjectiveMarkerFromPlacement(
  mission: MissionDefinition,
  placedObjectives: ObjectiveMarker[],
  position: Position,
): ObjectiveMarker {
  if (mission.objectivePlacement.kind === 'fixed') {
    throw new Error('Manual objective placement is not valid for fixed-objective missions.');
  }

  const fixedObjectiveCount = getFixedObjectiveCount(mission);
  const playerPlacedIndex = Math.max(0, placedObjectives.length - fixedObjectiveCount);

  if (mission.objectivePlacement.kind === 'center-fixed-alternating') {
    return {
      id: `obj-placed-${placedObjectives.length}`,
      position,
      vpValue: mission.objectivePlacement.vpValue,
      currentVpValue: mission.objectivePlacement.vpValue,
      isRemoved: false,
      label: `Flank Objective ${playerPlacedIndex + 1}`,
    };
  }

  if (mission.objectivePlacement.kind === 'alternating') {
    return {
      id: `obj-placed-${placedObjectives.length}`,
      position,
      vpValue: mission.objectivePlacement.vpValue,
      currentVpValue: mission.objectivePlacement.vpValue,
      isRemoved: false,
      label: `Objective ${playerPlacedIndex + 1}`,
    };
  }

  if (mission.objectivePlacement.kind === 'symmetric') {
    return {
      id: `obj-placed-${placedObjectives.length}`,
      position,
      vpValue: mission.objectivePlacement.vpValue,
      currentVpValue: mission.objectivePlacement.vpValue,
      isRemoved: false,
      label: `Objective ${playerPlacedIndex + 1}`,
    };
  }

  throw new Error('Unsupported objective placement rule for manual objective creation.');
}

export function getObjectivePlacementInstructions(mission: MissionDefinition): string {
  switch (mission.objectivePlacement.kind) {
    case 'center-fixed-alternating':
      return 'Place flank objectives 12" from the centre and 6" from battlefield edges. The second flank objective must also be 6" from the first.';
    case 'alternating':
      return `Place each objective at least ${mission.objectivePlacement.edgeBuffer}" from battlefield edges and ${mission.objectivePlacement.minimumSpacing}" from other objectives.`;
    case 'symmetric':
      return `Place each objective at least ${DEFAULT_EDGE_BUFFER}" from battlefield edges and ${mission.objectivePlacement.separationDistance}" from other objectives.`;
    case 'fixed':
      return 'This mission places its objectives automatically.';
  }
}
