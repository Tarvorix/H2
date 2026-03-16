import { DeploymentMap } from '@hh/types';
import type { DeploymentZone, GameState, Position, UnitState } from '@hh/types';
import type { DeploymentFormationPreset } from '@hh/geometry';
export declare function isPointInDeploymentZone(position: Position, zone: DeploymentZone): boolean;
export declare function getDeploymentZoneForPlayer(gameState: GameState | null, playerIndex: number): DeploymentZone | null;
export declare function buildDeploymentFormationForZone(modelCount: number, anchor: Position, deploymentMap: DeploymentMap, playerIndex: number, battlefieldWidth: number, battlefieldHeight: number, zone: DeploymentZone, preset: DeploymentFormationPreset, options?: {
    spacingInches?: number;
    rotationQuarterTurns?: number;
}): Position[];
export declare function validateSetupDeploymentPlacement(gameState: GameState, playerIndex: number, unit: UnitState, modelPositions: {
    modelId: string;
    position: Position;
}[]): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=deployment-rules.d.ts.map