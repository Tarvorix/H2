import type { BlastPlacement, GameState, Position, TemplatePlacement } from '@hh/types';
import { TEMPLATE_EFFECTIVE_RANGE_INCHES, findUnit, formFireGroups, getBlastSizeInches, getClosestModelDistance, getModelShape, getModelsWithLOSToUnit } from '@hh/engine';
import { closestPointOnShape, createStandardTemplate } from '@hh/geometry';
import type { TemplateShape } from '@hh/geometry';
import type { SpecialShotRequirement, WeaponSelection } from './types';

function buildWeaponAssignments(weaponSelections: WeaponSelection[]) {
  return weaponSelections.map((selection) => ({
    modelId: selection.modelId,
    weaponId: selection.weaponId,
    profileName: selection.profileName,
  }));
}

export function buildSpecialShotRequirements(
  gameState: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  weaponSelections: WeaponSelection[],
): SpecialShotRequirement[] {
  const attackerUnit = findUnit(gameState, attackerUnitId);
  if (!attackerUnit) return [];

  const modelsWithLos = getModelsWithLOSToUnit(gameState, attackerUnitId, targetUnitId).map((model) => model.id);
  const targetDistance = getClosestModelDistance(gameState, attackerUnitId, targetUnitId);
  const fireGroups = formFireGroups(
    buildWeaponAssignments(weaponSelections),
    attackerUnit,
    modelsWithLos,
    targetDistance,
  );

  const requirements: SpecialShotRequirement[] = [];

  for (const fireGroup of fireGroups) {
    if (fireGroup.weaponProfile.hasTemplate) {
      const sourceModelId = fireGroup.attacks[0]?.modelId;
      if (!sourceModelId) continue;
      requirements.push({
        kind: 'template' as const,
        label: `${fireGroup.weaponName}: place template from firing model`,
        weaponName: fireGroup.weaponName,
        sourceModelId,
      });
      continue;
    }

    const blastSize = getBlastSizeInches(fireGroup.specialRules);
    if (blastSize === null) continue;
    requirements.push({
      kind: 'blast' as const,
      label: `${fireGroup.weaponName}: place ${blastSize}" blast marker`,
      weaponName: fireGroup.weaponName,
      sizeInches: blastSize,
      sourceModelIds: fireGroup.attacks.map((attack) => attack.modelId),
    });
  }

  return requirements;
}

export function buildTemplatePreview(
  gameState: GameState,
  sourceModelId: string,
  aimPosition: Position,
): { directionRadians: number; origin: Position; template: TemplateShape } | null {
  const sourceModelInfo = gameState.armies
    .flatMap((army) => army.units)
    .flatMap((unit) => unit.models)
    .find((model) => model.id === sourceModelId);
  if (!sourceModelInfo) return null;

  const directionRadians = Math.atan2(
    aimPosition.y - sourceModelInfo.position.y,
    aimPosition.x - sourceModelInfo.position.x,
  );
  const farPoint = {
    x: sourceModelInfo.position.x + Math.cos(directionRadians) * TEMPLATE_EFFECTIVE_RANGE_INCHES,
    y: sourceModelInfo.position.y + Math.sin(directionRadians) * TEMPLATE_EFFECTIVE_RANGE_INCHES,
  };
  const origin = closestPointOnShape(getModelShape(sourceModelInfo), farPoint);
  return {
    directionRadians,
    origin,
    template: createStandardTemplate(origin, directionRadians),
  };
}

export function appendBlastPlacement(
  placements: BlastPlacement[],
  placement: BlastPlacement,
): BlastPlacement[] {
  return [...placements, placement];
}

export function appendTemplatePlacement(
  placements: TemplatePlacement[],
  placement: TemplatePlacement,
): TemplatePlacement[] {
  return [...placements, placement];
}
