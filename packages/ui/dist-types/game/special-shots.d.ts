import type { AttackTargetRef, BlastPlacement, GameState, Position, TemplatePlacement } from '@hh/types';
import type { TemplateShape } from '@hh/geometry';
import type { SpecialShotRequirement, WeaponSelection } from './types';
export declare function buildSpecialShotRequirements(gameState: GameState, attackerUnitId: string, target: AttackTargetRef, weaponSelections: WeaponSelection[]): SpecialShotRequirement[];
export declare function buildTemplatePreview(gameState: GameState, sourceModelId: string, aimPosition: Position): {
    directionRadians: number;
    origin: Position;
    template: TemplateShape;
} | null;
export declare function appendBlastPlacement(placements: BlastPlacement[], placement: BlastPlacement): BlastPlacement[];
export declare function appendTemplatePlacement(placements: TemplatePlacement[], placement: TemplatePlacement): TemplatePlacement[];
//# sourceMappingURL=special-shots.d.ts.map