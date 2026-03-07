import type {
  BlastPlacement,
  DeclareShootingCommand,
  GameState,
  Position,
  SpecialRuleRef,
  TemplatePlacement,
} from '@hh/types';
import type { DiceProvider, GameEvent, ValidationError } from '../types';
import {
  applyScatter,
  blastOverlap,
  blastSizeToRadius,
  closestPointOnShape,
  createStandardTemplate,
  pointInShape,
  templateOverlap,
} from '@hh/geometry';
import { findModel, findUnit, findUnitPlayerIndex, getAliveModels, getModelShape } from '../game-queries';
import type { FireGroup, HitResult } from './shooting-types';

export const TEMPLATE_EFFECTIVE_RANGE_INCHES = 8;

export interface SpecialShotResolutionResult {
  fireGroup: FireGroup;
  events: GameEvent[];
  errors: ValidationError[];
  additionalFireGroups: FireGroup[];
  affectedUnitIds: string[];
}

interface UnitHitMapEntry {
  unitId: string;
  modelIds: string[];
}

type UnitHitMap = Map<string, UnitHitMapEntry>;

export function getBlastSizeInches(specialRules: SpecialRuleRef[]): number | null {
  const blastRule = specialRules.find((rule) => rule.name.toLowerCase() === 'blast');
  if (!blastRule?.value) return null;
  const match = blastRule.value.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function sameSourceModelIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function findBlastPlacement(
  fireGroup: FireGroup,
  command: DeclareShootingCommand,
): BlastPlacement | undefined {
  const sourceModelIds = fireGroup.attacks.map((attack) => attack.modelId);
  return command.blastPlacements?.find((placement) =>
    sameSourceModelIds(placement.sourceModelIds, sourceModelIds),
  );
}

function findTemplatePlacement(
  fireGroup: FireGroup,
  command: DeclareShootingCommand,
): TemplatePlacement | undefined {
  const sourceModelId = fireGroup.attacks[0]?.modelId;
  if (!sourceModelId) return undefined;
  return command.templatePlacements?.find((placement) => placement.sourceModelId === sourceModelId);
}

function flattenUnitHitMap(hitMap: UnitHitMap): string[] {
  return [...hitMap.values()].flatMap((entry) => entry.modelIds);
}

function getModelsTouchedByBlast(
  state: GameState,
  center: Position,
  sizeInches: number,
): UnitHitMap {
  const radius = blastSizeToRadius(sizeInches);
  const hitMap: UnitHitMap = new Map();

  for (const army of state.armies) {
    for (const unit of army.units) {
      const aliveModels = getAliveModels(unit);
      if (aliveModels.length === 0) continue;

      const hitIndices = blastOverlap(
        center,
        radius,
        aliveModels.map((model) => getModelShape(model)),
      );
      if (hitIndices.length === 0) continue;

      hitMap.set(unit.id, {
        unitId: unit.id,
        modelIds: hitIndices.map((index) => aliveModels[index].id),
      });
    }
  }

  return hitMap;
}

function getModelsTouchedByTemplate(
  state: GameState,
  sourceModelId: string,
  directionRadians: number,
): { templateOrigin: Position; hitMap: UnitHitMap } | null {
  const sourceModelInfo = findModel(state, sourceModelId);
  if (!sourceModelInfo) return null;

  const sourceShape = getModelShape(sourceModelInfo.model);
  const farPoint = {
    x: sourceModelInfo.model.position.x + Math.cos(directionRadians) * TEMPLATE_EFFECTIVE_RANGE_INCHES,
    y: sourceModelInfo.model.position.y + Math.sin(directionRadians) * TEMPLATE_EFFECTIVE_RANGE_INCHES,
  };
  const templateOrigin = closestPointOnShape(sourceShape, farPoint);
  const template = createStandardTemplate(templateOrigin, directionRadians);
  const hitMap: UnitHitMap = new Map();

  for (const army of state.armies) {
    for (const unit of army.units) {
      const aliveModels = getAliveModels(unit);
      if (aliveModels.length === 0) continue;

      const hitIndices = templateOverlap(
        template,
        aliveModels.map((model) => getModelShape(model)),
      );
      if (hitIndices.length === 0) continue;

      const modelIds = hitIndices
        .map((index) => aliveModels[index].id)
        .filter((modelId) => modelId !== sourceModelId);
      if (modelIds.length === 0) continue;

      hitMap.set(unit.id, {
        unitId: unit.id,
        modelIds,
      });
    }
  }

  return { templateOrigin, hitMap };
}

function createTemplateHit(attack: FireGroup['attacks'][number]): HitResult {
  return {
    diceRoll: 0,
    targetNumber: 0,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    isAutoHit: true,
    sourceModelId: attack.modelId,
    weaponStrength: attack.weaponProfile.rangedStrength,
    weaponAP: attack.weaponProfile.ap,
    weaponDamage: attack.weaponProfile.damage,
    specialRules: [...attack.weaponProfile.specialRules],
  };
}

function buildGeneratedHits(
  sourceHits: HitResult[],
  hitsPerSource: number,
  fromScatter: boolean,
): HitResult[] {
  const generated: HitResult[] = [];

  for (const sourceHit of sourceHits) {
    for (let i = 0; i < hitsPerSource; i++) {
      generated.push({
        ...sourceHit,
        isHit: true,
        isCritical: fromScatter ? false : sourceHit.isCritical,
        isPrecision: fromScatter ? false : sourceHit.isPrecision,
        isRending: fromScatter ? false : sourceHit.isRending,
        isAutoHit: fromScatter ? false : sourceHit.isAutoHit,
      });
    }
  }

  return generated;
}

function countsByUnit(hitMap: UnitHitMap): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [unitId, entry] of hitMap) {
    counts.set(unitId, entry.modelIds.length);
  }
  return counts;
}

function addGeneratedHitsByUnit(
  destination: Map<string, HitResult[]>,
  sourceHits: HitResult[],
  hitCounts: Map<string, number>,
  fromScatter: boolean,
): void {
  for (const [unitId, hitCount] of hitCounts) {
    if (hitCount <= 0 || sourceHits.length === 0) continue;
    const existing = destination.get(unitId) ?? [];
    existing.push(...buildGeneratedHits(sourceHits, hitCount, fromScatter));
    destination.set(unitId, existing);
  }
}

function createAdditionalFireGroup(
  parent: FireGroup,
  targetUnitId: string,
  hits: HitResult[],
): FireGroup {
  return {
    ...parent,
    index: -1,
    targetUnitId,
    hits,
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    hitPoolResolved: true,
    isPrecisionGroup: false,
    isDeflagrateGroup: false,
  };
}

function validateBlastPlacement(
  state: GameState,
  targetUnitId: string,
  position: Position,
): ValidationError | null {
  if (
    position.x < 0 ||
    position.x > state.battlefield.width ||
    position.y < 0 ||
    position.y > state.battlefield.height
  ) {
    return {
      code: 'OUT_OF_BOUNDS',
      message: 'Blast marker position is outside the battlefield.',
    };
  }

  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) {
    return {
      code: 'INVALID_TARGET',
      message: `Target unit "${targetUnitId}" was not found for blast placement.`,
    };
  }

  const centeredOnTarget = getAliveModels(targetUnit)
    .map((model) => getModelShape(model))
    .some((shape) => pointInShape(position, shape));
  if (!centeredOnTarget) {
    return {
      code: 'INVALID_BLAST_PLACEMENT',
      message: 'Blast marker hole must be centered over a model in the target unit.',
    };
  }

  return null;
}

function rollScatterResult(dice: DiceProvider): { angle: number; distance: number; isHit: boolean } {
  const scatter = dice.rollScatter();
  if (scatter.direction <= 2) {
    return { angle: 0, distance: 0, isHit: true };
  }

  const angleByFace: Record<number, number> = {
    3: 0,
    4: Math.PI / 2,
    5: Math.PI,
    6: (3 * Math.PI) / 2,
  };

  return {
    angle: angleByFace[scatter.direction] ?? 0,
    distance: scatter.distance,
    isHit: false,
  };
}

export function resolveSpecialShotFireGroup(
  state: GameState,
  command: DeclareShootingCommand,
  originalTargetUnitId: string,
  fireGroup: FireGroup,
  hitTestResults: HitResult[],
  hitTestEvents: GameEvent[],
  dice: DiceProvider,
): SpecialShotResolutionResult | null {
  if (fireGroup.weaponProfile.hasTemplate) {
    const templatePlacement = findTemplatePlacement(fireGroup, command);
    if (!templatePlacement) {
      return {
        fireGroup,
        events: hitTestEvents,
        errors: [{
          code: 'MISSING_TEMPLATE_PLACEMENT',
          message: `Template placement is required for ${fireGroup.weaponName}.`,
        }],
        additionalFireGroups: [],
        affectedUnitIds: [],
      };
    }

    const attack = fireGroup.attacks[0];
    if (!attack) {
      return {
        fireGroup,
        events: hitTestEvents,
        errors: [{
          code: 'INVALID_TEMPLATE_ATTACK',
          message: `Template fire group "${fireGroup.weaponName}" has no source attack.`,
        }],
        additionalFireGroups: [],
        affectedUnitIds: [],
      };
    }

    const touched = getModelsTouchedByTemplate(state, attack.modelId, templatePlacement.directionRadians);
    if (!touched) {
      return {
        fireGroup,
        events: hitTestEvents,
        errors: [{
          code: 'INVALID_TEMPLATE_ATTACK',
          message: `Template source model "${attack.modelId}" was not found.`,
        }],
        additionalFireGroups: [],
        affectedUnitIds: [],
      };
    }

    const attackerPlayerIndex = findUnitPlayerIndex(state, command.attackingUnitId);
    const friendlyModelsTouched = [...touched.hitMap.entries()]
      .filter(([unitId]) => attackerPlayerIndex !== null && findUnitPlayerIndex(state, unitId) === attackerPlayerIndex)
      .flatMap(([, entry]) => entry.modelIds);
    if (friendlyModelsTouched.length > 0) {
      return {
        fireGroup,
        events: hitTestEvents,
        errors: [{
          code: 'INVALID_TEMPLATE_PLACEMENT',
          message: 'Template cannot touch or cover friendly models other than the firing model.',
        }],
        additionalFireGroups: [],
        affectedUnitIds: [],
      };
    }

    const targetEntry = touched.hitMap.get(originalTargetUnitId);
    if (!targetEntry || targetEntry.modelIds.length === 0) {
      return {
        fireGroup,
        events: hitTestEvents,
        errors: [{
          code: 'INVALID_TEMPLATE_PLACEMENT',
          message: 'Template must cover at least one model in the original target unit.',
        }],
        additionalFireGroups: [],
        affectedUnitIds: [],
      };
    }

    const templateHit = createTemplateHit(attack);
    const mainHits = Array.from(
      { length: targetEntry.modelIds.length * attack.firepower },
      () => ({ ...templateHit }),
    );
    const additionalFireGroups: FireGroup[] = [];
    const affectedUnitIds = new Set<string>([originalTargetUnitId]);

    for (const [unitId, entry] of touched.hitMap) {
      if (unitId === originalTargetUnitId) continue;
      if (attackerPlayerIndex !== null && findUnitPlayerIndex(state, unitId) === attackerPlayerIndex) {
        continue;
      }

      affectedUnitIds.add(unitId);
      additionalFireGroups.push(
        createAdditionalFireGroup(
          fireGroup,
          unitId,
          Array.from({ length: entry.modelIds.length * attack.firepower }, () => ({ ...templateHit })),
        ),
      );
    }

    return {
      fireGroup: {
        ...fireGroup,
        targetUnitId: originalTargetUnitId,
        hits: mainHits,
        hitPoolResolved: true,
      },
      events: [
        ...hitTestEvents,
        {
          type: 'templatePlaced' as const,
          origin: touched.templateOrigin,
          modelsHit: flattenUnitHitMap(touched.hitMap),
        },
      ],
      errors: [],
      additionalFireGroups,
      affectedUnitIds: [...affectedUnitIds],
    };
  }

  const blastSize = getBlastSizeInches(fireGroup.specialRules);
  if (blastSize === null) {
    return null;
  }

  const blastPlacement = findBlastPlacement(fireGroup, command);
  if (!blastPlacement) {
    return {
      fireGroup,
      events: hitTestEvents,
      errors: [{
        code: 'MISSING_BLAST_PLACEMENT',
        message: `Blast marker placement is required for ${fireGroup.weaponName}.`,
      }],
      additionalFireGroups: [],
      affectedUnitIds: [],
    };
  }

  const placementError = validateBlastPlacement(state, originalTargetUnitId, blastPlacement.position);
  if (placementError) {
    return {
      fireGroup,
      events: hitTestEvents,
      errors: [placementError],
      additionalFireGroups: [],
      affectedUnitIds: [],
    };
  }

  const initialHitMap = getModelsTouchedByBlast(state, blastPlacement.position, blastSize);
  const successfulHits = hitTestResults.filter((hit) => hit.isHit);
  const missedHits = hitTestResults.filter((hit) => !hit.isHit);
  const generatedHitsByUnit = new Map<string, HitResult[]>();

  addGeneratedHitsByUnit(generatedHitsByUnit, successfulHits, countsByUnit(initialHitMap), false);

  const allEvents: GameEvent[] = [
    ...hitTestEvents,
    {
      type: 'blastMarkerPlaced' as const,
      center: blastPlacement.position,
      radius: blastSizeToRadius(blastSize),
      modelsHit: flattenUnitHitMap(initialHitMap),
      scattered: false,
    },
  ];

  if (missedHits.length > 0) {
    const scatter = rollScatterResult(dice);
    const scatteredPosition = applyScatter(blastPlacement.position, scatter);
    const scatteredHitMap = getModelsTouchedByBlast(state, scatteredPosition, blastSize);

    allEvents.push({
      type: 'scatterRoll' as const,
      diceRoll: scatter.distance,
      angle: scatter.angle,
      distance: scatter.distance,
      isHit: scatter.isHit,
      originalPosition: blastPlacement.position,
      finalPosition: scatteredPosition,
    });

    addGeneratedHitsByUnit(generatedHitsByUnit, missedHits, countsByUnit(scatteredHitMap), true);
  }

  const mainHits = generatedHitsByUnit.get(originalTargetUnitId) ?? [];
  const additionalFireGroups: FireGroup[] = [];
  const affectedUnitIds = new Set<string>();

  for (const [unitId, hits] of generatedHitsByUnit) {
    if (hits.length === 0) continue;
    affectedUnitIds.add(unitId);
    if (unitId === originalTargetUnitId) continue;
    additionalFireGroups.push(createAdditionalFireGroup(fireGroup, unitId, hits));
  }

  return {
    fireGroup: {
      ...fireGroup,
      targetUnitId: originalTargetUnitId,
      hits: mainHits,
      hitPoolResolved: true,
    },
    events: allEvents,
    errors: [],
    additionalFireGroups,
    affectedUnitIds: [...affectedUnitIds],
  };
}
