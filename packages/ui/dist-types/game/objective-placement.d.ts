import type { DiceProvider } from '@hh/engine';
import type { MissionDefinition, ObjectiveMarker, Position } from '@hh/types';
import type { ObjectivePlacementUIState } from './types';
export declare function rollObjectivePlacementFirstPlayerIndex(dice?: DiceProvider): 0 | 1;
export declare function getFixedObjectiveCount(mission: MissionDefinition): number;
export declare function getInitialObjectiveMarkers(mission: MissionDefinition, battlefieldWidth: number, battlefieldHeight: number): ObjectiveMarker[];
export declare function getTotalObjectiveCount(mission: MissionDefinition): number;
export declare function getPlayerPlacedObjectiveCount(mission: MissionDefinition, placedObjectivesLength: number): number;
export declare function getNextObjectivePlacingPlayerIndex(mission: MissionDefinition, firstPlacingPlayerIndex: 0 | 1, placedObjectivesLength: number): 0 | 1;
export declare function createObjectivePlacementState(mission: MissionDefinition, battlefieldWidth: number, battlefieldHeight: number, firstPlacingPlayerIndex: 0 | 1): ObjectivePlacementUIState;
export declare function validateObjectivePlacement(mission: MissionDefinition, battlefieldWidth: number, battlefieldHeight: number, placedObjectives: ObjectiveMarker[], position: Position): {
    valid: boolean;
    error?: string;
};
export declare function createObjectiveMarkerFromPlacement(mission: MissionDefinition, placedObjectives: ObjectiveMarker[], position: Position): ObjectiveMarker;
export declare function getObjectivePlacementInstructions(mission: MissionDefinition): string;
//# sourceMappingURL=objective-placement.d.ts.map