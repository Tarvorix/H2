import type { AttackTargetRef, GameState, ModelState } from '@hh/types';
export declare function getAttackTargetLabel(gameState: GameState, target: AttackTargetRef): string;
export declare function getDoorwayDistanceForModel(gameState: GameState, model: ModelState, doorwayId: string): number;
export declare function getClosestAttackTargetDistance(gameState: GameState, attackerUnitId: string, target: AttackTargetRef): number;
export declare function getModelsWithLOSToDoorway(gameState: GameState, attackerUnitId: string, doorwayId: string): string[];
export declare function hasLineOfSightToAttackTarget(gameState: GameState, attackerUnitId: string, target: AttackTargetRef): boolean;
export declare function canAnyWeaponReachAttackTarget(gameState: GameState, attackerUnitId: string, target: AttackTargetRef): boolean;
//# sourceMappingURL=attack-targets.d.ts.map