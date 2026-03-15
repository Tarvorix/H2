import { findLegionWeapon, findWeapon } from '@hh/data';
import type {
  GameCommand,
  GameState,
  Position,
  UnitState,
} from '@hh/types';
import { resolveWeaponAssignment } from '@hh/engine';
import type { AlphaEncodedAction, MacroAction } from '../types';
import {
  estimateObjectiveRemovalSwing,
  estimateProjectedObjectiveValue,
  estimateProjectedOutgoingPressure,
  estimateUnitExposureBreakdown,
} from '../engine/tactical-signals';
import { getUnitCentroid } from '../helpers/unit-queries';
import {
  ALPHA_ACTION_FEATURE_DIMENSION,
  buildFeatureVector,
  buildHashedFeatureSlice,
  clamp,
  safeDivide,
  tanhScaled,
} from './common';

const COMMAND_TYPES: GameCommand['type'][] = [
  'moveModel',
  'moveUnit',
  'manifestPsychicPower',
  'declareShooting',
  'resolveShootingCasualties',
  'declareCharge',
  'passChallenge',
  'declareChallenge',
  'acceptChallenge',
  'declineChallenge',
  'selectGambit',
  'selectReaction',
  'declineReaction',
  'endPhase',
  'endSubPhase',
  'selectTargetModel',
  'deployUnit',
  'reservesTest',
  'rushUnit',
  'embark',
  'disembark',
  'selectWargearOption',
  'declareWeapons',
  'selectAftermath',
  'resolveFight',
  'placeTerrain',
  'removeTerrain',
];

function encodeOneHot<T extends string>(value: T | null | undefined, options: readonly T[]): number[] {
  return options.map((candidate) => Number(value === candidate));
}

function averagePosition(positions: Position[]): Position | null {
  if (positions.length === 0) return null;
  const total = positions.reduce(
    (sum, position) => ({ x: sum.x + position.x, y: sum.y + position.y }),
    { x: 0, y: 0 },
  );
  return {
    x: total.x / positions.length,
    y: total.y / positions.length,
  };
}

function getUnitByAnyId(state: GameState, id: string): UnitState | null {
  for (const army of state.armies) {
    for (const unit of army.units) {
      if (unit.id === id) return unit;
      if (unit.models.some((model) => model.id === id)) return unit;
    }
  }
  return null;
}

function getCommandTargetIds(command: GameCommand): string[] {
  switch (command.type) {
    case 'declareShooting':
      return [command.targetUnitId];
    case 'declareCharge':
      return [command.targetUnitId];
    case 'manifestPsychicPower':
      return command.targetUnitId ? [command.targetUnitId] : [];
    case 'declareChallenge':
      return [command.targetModelId];
    case 'acceptChallenge':
      return [command.challengedModelId];
    case 'passChallenge':
      return [command.combatId];
    case 'selectTargetModel':
      return [command.modelId];
    case 'embark':
      return [command.transportId];
    case 'resolveFight':
      return [command.combatId];
    case 'removeTerrain':
      return [command.terrainId];
    case 'selectAftermath':
      return [command.unitId];
    default:
      return [];
  }
}

function getMovementTargetPosition(command: GameCommand): Position | null {
  switch (command.type) {
    case 'moveModel':
      return command.targetPosition;
    case 'moveUnit':
      return averagePosition(command.modelPositions.map((entry) => entry.position));
    case 'selectReaction':
      return averagePosition(command.modelPositions?.map((entry) => entry.position) ?? []);
    default:
      return null;
  }
}

function summarizeWeaponSelection(
  state: GameState,
  macroAction: MacroAction,
): { count: number; avgRange: number; avgStrength: number; avgDamage: number; avgAp: number } {
  const primary = macroAction.commands[0];
  if (!primary || primary.type !== 'declareShooting') {
    return { count: 0, avgRange: 0, avgStrength: 0, avgDamage: 0, avgAp: 0 };
  }

  const attacker = getUnitByAnyId(state, primary.attackingUnitId);
  if (!attacker) {
    return { count: primary.weaponSelections.length, avgRange: 0, avgStrength: 0, avgDamage: 0, avgAp: 0 };
  }

  const ranges: number[] = [];
  const strengths: number[] = [];
  const damages: number[] = [];
  const aps: number[] = [];

  for (const selection of primary.weaponSelections) {
    const resolved = resolveWeaponAssignment(selection, attacker);
    const weapon = resolved ?? findWeapon(selection.weaponId) ?? findLegionWeapon(selection.weaponId);
    if (!weapon || !('range' in weapon)) continue;
    ranges.push(weapon.range);
    strengths.push(weapon.rangedStrength);
    damages.push(weapon.damage);
    aps.push(weapon.ap ?? 7);
  }

  const count = Math.max(primary.weaponSelections.length, ranges.length);
  return {
    count,
    avgRange: safeDivide(ranges.reduce((sum, value) => sum + value, 0), Math.max(1, ranges.length), 0) / 72,
    avgStrength: safeDivide(strengths.reduce((sum, value) => sum + value, 0), Math.max(1, strengths.length), 0) / 10,
    avgDamage: safeDivide(damages.reduce((sum, value) => sum + value, 0), Math.max(1, damages.length), 0) / 8,
    avgAp: safeDivide(aps.reduce((sum, value) => sum + value, 0), Math.max(1, aps.length), 0) / 7,
  };
}

function summarizeActionUnitDelta(
  state: GameState,
  macroAction: MacroAction,
  playerIndex: number,
): {
  objectiveDelta: number;
  exposureDelta: number;
  outgoingDelta: number;
  objectiveRemovalSwing: number;
  moveDistance: number;
} {
  const actorUnit = macroAction.actorIds.map((actorId) => getUnitByAnyId(state, actorId)).find((unit) => unit !== null) ?? null;
  if (!actorUnit) {
    return {
      objectiveDelta: 0,
      exposureDelta: 0,
      outgoingDelta: 0,
      objectiveRemovalSwing: 0,
      moveDistance: 0,
    };
  }

  const primary = macroAction.commands[0];
  const currentCentroid = getUnitCentroid(actorUnit);
  const targetPosition = primary ? getMovementTargetPosition(primary) : null;
  const currentObjective = estimateProjectedObjectiveValue(state, playerIndex, actorUnit, currentCentroid ?? undefined);
  const projectedObjective = estimateProjectedObjectiveValue(state, playerIndex, actorUnit, targetPosition ?? currentCentroid ?? undefined);
  const currentExposure = estimateUnitExposureBreakdown(state, playerIndex, actorUnit, currentCentroid ?? undefined);
  const projectedExposure = estimateUnitExposureBreakdown(state, playerIndex, actorUnit, targetPosition ?? currentCentroid ?? undefined);
  const currentOutgoing = estimateProjectedOutgoingPressure(state, playerIndex, actorUnit, currentCentroid ?? undefined);
  const projectedOutgoing = estimateProjectedOutgoingPressure(state, playerIndex, actorUnit, targetPosition ?? currentCentroid ?? undefined);
  const objectiveRemovalSwing = estimateObjectiveRemovalSwing(state, playerIndex, actorUnit);
  const moveDistance = currentCentroid && targetPosition
    ? Math.hypot(currentCentroid.x - targetPosition.x, currentCentroid.y - targetPosition.y)
    : 0;

  return {
    objectiveDelta: tanhScaled(projectedObjective - currentObjective, 20),
    exposureDelta: tanhScaled(projectedExposure.total - currentExposure.total, 8),
    outgoingDelta: tanhScaled(projectedOutgoing - currentOutgoing, 10),
    objectiveRemovalSwing: tanhScaled(objectiveRemovalSwing, 12),
    moveDistance: clamp(moveDistance / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
  };
}

export function encodeAlphaActions(
  state: GameState,
  playerIndex: number,
  actions: MacroAction[],
): AlphaEncodedAction[] {
  return actions.map((macroAction) => {
    const primary = macroAction.commands[0] ?? null;
    const targetIds = [...new Set(macroAction.commands.flatMap((command) => getCommandTargetIds(command)))];
    const actionUnitDelta = summarizeActionUnitDelta(state, macroAction, playerIndex);
    const weaponSummary = summarizeWeaponSelection(state, macroAction);

    return {
      macroActionId: macroAction.id,
      label: macroAction.label,
      actorIds: [...macroAction.actorIds],
      targetIds,
      features: buildFeatureVector([
        primary ? 1 : 0,
        macroAction.commands.length / 6,
        macroAction.actorIds.length / 8,
        targetIds.length / 8,
        macroAction.orderingScore / 100,
        Number(macroAction.commands.length > 1),
        Number(state.awaitingReaction),
        Number(primary?.type === 'selectReaction' || primary?.type === 'declineReaction'),
        Number(primary?.type === 'declareShooting'),
        Number(primary?.type === 'declareCharge'),
        Number(primary?.type === 'moveUnit' || primary?.type === 'moveModel' || primary?.type === 'rushUnit'),
        actionUnitDelta.objectiveDelta,
        actionUnitDelta.exposureDelta,
        actionUnitDelta.outgoingDelta,
        actionUnitDelta.objectiveRemovalSwing,
        actionUnitDelta.moveDistance,
        weaponSummary.count / 12,
        weaponSummary.avgRange,
        weaponSummary.avgStrength,
        weaponSummary.avgDamage,
        weaponSummary.avgAp,
        ...encodeOneHot(primary?.type ?? null, COMMAND_TYPES),
        ...buildHashedFeatureSlice(macroAction.id, 4, 'action:id'),
        ...buildHashedFeatureSlice(macroAction.label, 8, 'action:label'),
        ...buildHashedFeatureSlice(macroAction.actorIds.join('|'), 8, 'action:actors'),
        ...buildHashedFeatureSlice(targetIds.join('|') || 'no-target', 8, 'action:targets'),
        ...buildHashedFeatureSlice(macroAction.reasons.join('|') || 'no-reasons', 8, 'action:reasons'),
      ], ALPHA_ACTION_FEATURE_DIMENSION),
    };
  });
}
