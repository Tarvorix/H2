import type {
  AftermathOption,
  BlastPlacement,
  GameCommand,
  GameState,
  Position,
  TemplatePlacement,
  UnitState,
} from '@hh/types';
import {
  ChallengeGambit,
  CoreReaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import {
  canUnitMove,
  canUnitRush,
  FixedDiceProvider,
  formFireGroups,
  getAliveModels,
  getBlastSizeInches,
  getClosestModelDistance,
  getModelsWithLOSToUnit,
  getValidCommands,
  handleMoveUnit,
  hasLOSToUnit,
} from '@hh/engine';
import type { MacroAction, SearchConfig } from '../types';
import { generateCandidatePositions, evaluateMovementDestination } from '../evaluation/position-evaluation';
import { evaluateUnitThreat } from '../evaluation/threat-evaluation';
import { prioritizeChargeTargets, prioritizeShootingTargets } from '../evaluation/target-priority';
import {
  getChargeableUnits,
  getEnemyDeployedUnits,
  getModelMovementCharacteristic,
  getShootableUnits,
  getUnitCentroid,
  getValidChargeTargets,
  getValidShootingTargets,
} from '../helpers/unit-queries';
import { selectWeaponsForAttack } from '../helpers/weapon-selection';
import { getAvailableAftermathOptions } from '@hh/engine';
import { TacticalStatus } from '@hh/types';
import {
  estimateObjectiveRemovalSwing,
  estimateProjectedObjectiveValue,
  estimateProjectedOutgoingPressure,
  estimateUnitExposureBreakdown,
  estimateUnitRangedDamagePotential,
  estimateUnitStrategicValue,
} from './tactical-signals';

export interface SearchNodeState {
  state: GameState;
  actedUnitIds: Set<string>;
}

type MovementLane = 'objective' | 'fire' | 'safety' | 'pressure' | 'center' | 'best';

interface MovementDestinationCandidate {
  position: Position;
  baseScore: number;
  laneScores: Record<Exclude<MovementLane, 'best'>, number>;
  modelPositions: { modelId: string; position: Position }[];
}

function makeAction(
  id: string,
  label: string,
  commands: GameCommand[],
  orderingScore: number,
  actorIds: string[],
  reasons: string[],
): MacroAction {
  return { id, label, commands, orderingScore, actorIds, reasons };
}

function translateUnitToCentroid(unit: UnitState, targetCentroid: Position): { modelId: string; position: Position }[] | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return null;

  const originCentroid = getUnitCentroid(unit);
  if (!originCentroid) return null;

  const dx = targetCentroid.x - originCentroid.x;
  const dy = targetCentroid.y - originCentroid.y;
  return aliveModels.map((model) => ({
    modelId: model.id,
    position: {
      x: model.position.x + dx,
      y: model.position.y + dy,
    },
  }));
}

function areModelPositionsWithinBattlefield(
  state: GameState,
  modelPositions: { modelId: string; position: Position }[],
): boolean {
  return modelPositions.every(({ position }) =>
    position.x >= 0 &&
    position.y >= 0 &&
    position.x <= state.battlefield.width &&
    position.y <= state.battlefield.height,
  );
}

function isLegalMoveFormation(
  state: GameState,
  unitId: string,
  modelPositions: { modelId: string; position: Position }[],
): boolean {
  if (!areModelPositionsWithinBattlefield(state, modelPositions)) {
    return false;
  }

  const dice = new FixedDiceProvider(
    Array.from({ length: Math.max(16, modelPositions.length * 4) }, () => 6),
  );
  return handleMoveUnit(state, unitId, modelPositions, dice).accepted;
}

function buildReserveEntryPositions(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
): { modelId: string; position: Position }[] {
  const aliveModels = getAliveModels(unit);
  const xCenter = state.battlefield.width / 2;
  const isBottomEdge = playerIndex === 0;
  const edgeY = isBottomEdge ? 0.5 : (state.battlefield.height - 0.5);
  const inwardY = isBottomEdge ? 2 : (state.battlefield.height - 2);
  const spacing = 1.5;

  return aliveModels.map((model, index) => {
    const offset = index - ((aliveModels.length - 1) / 2);
    return {
      modelId: model.id,
      position: {
        x: Math.max(1, Math.min(state.battlefield.width - 1, xCenter + (offset * spacing))),
        y: index === 0 ? edgeY : inwardY,
      },
    };
  });
}

function buildSpecialPlacements(
  state: GameState,
  attackingUnitId: string,
  targetUnitId: string,
  weaponSelections: { modelId: string; weaponId: string; profileName?: string }[],
): { blastPlacements: BlastPlacement[]; templatePlacements: TemplatePlacement[] } {
  const attackerUnit = state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === attackingUnitId);
  const targetUnit = state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === targetUnitId);

  if (!attackerUnit || !targetUnit) {
    return { blastPlacements: [], templatePlacements: [] };
  }

  const modelsWithLos = getModelsWithLOSToUnit(state, attackingUnitId, targetUnitId).map((model) => model.id);
  const targetDistance = getClosestModelDistance(state, attackingUnitId, targetUnitId) ?? 0;
  const fireGroups = formFireGroups(
    weaponSelections.map((selection) => ({
      modelId: selection.modelId,
      weaponId: selection.weaponId,
      profileName: selection.profileName,
    })),
    attackerUnit,
    modelsWithLos,
    targetDistance,
  );
  const targetCentroid = getUnitCentroid(targetUnit) ?? getAliveModels(targetUnit)[0]?.position;
  if (!targetCentroid) {
    return { blastPlacements: [], templatePlacements: [] };
  }

  const blastPlacements: BlastPlacement[] = [];
  const templatePlacements: TemplatePlacement[] = [];

  for (const fireGroup of fireGroups) {
    if (fireGroup.weaponProfile.hasTemplate) {
      const sourceModelId = fireGroup.attacks[0]?.modelId;
      const sourceModel = sourceModelId
        ? getAliveModels(attackerUnit).find((model) => model.id === sourceModelId)
        : null;
      if (!sourceModel || !hasLOSToUnit(state, attackingUnitId, targetUnitId)) continue;

      const directionRadians = Math.atan2(
        targetCentroid.y - sourceModel.position.y,
        targetCentroid.x - sourceModel.position.x,
      );
      templatePlacements.push({
        sourceModelId,
        directionRadians,
      });
      continue;
    }

    const blastSize = getBlastSizeInches(fireGroup.specialRules);
    if (blastSize === null) continue;
    blastPlacements.push({
      sourceModelIds: fireGroup.attacks.map((attack) => attack.modelId),
      position: targetCentroid,
    });
  }

  return { blastPlacements, templatePlacements };
}

function positionKey(position: Position): string {
  return `${position.x.toFixed(1)}:${position.y.toFixed(1)}`;
}

function distanceBetween(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function findUnitInState(state: GameState, unitId: string): UnitState | null {
  return state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === unitId) ?? null;
}

function getNearestEnemyDistance(
  state: GameState,
  playerIndex: number,
  position: Position,
): number {
  const enemies = getEnemyDeployedUnits(state, playerIndex);
  const distances = enemies
    .map((enemy) => getUnitCentroid(enemy))
    .filter((centroid): centroid is Position => centroid !== null)
    .map((centroid) => distanceBetween(position, centroid));
  return distances.length > 0 ? Math.min(...distances) : 999;
}

function getNearestObjectiveDistance(state: GameState, position: Position): number {
  const objectives = state.missionState?.objectives?.filter((objective) => !objective.isRemoved) ?? [];
  if (objectives.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...objectives.map((objective) => distanceBetween(position, objective.position)));
}

function buildMovementLaneScores(
  state: GameState,
  playerIndex: number,
  unit: UnitState,
  position: Position,
  baseScore: number,
): Record<Exclude<MovementLane, 'best'>, number> {
  const nearestEnemyDistance = getNearestEnemyDistance(state, playerIndex, position);
  const nearestObjectiveDistance = getNearestObjectiveDistance(state, position);
  const projectedExposure = estimateUnitExposureBreakdown(state, playerIndex, unit, position);
  const projectedOutgoing = estimateProjectedOutgoingPressure(state, playerIndex, unit, position);
  const projectedObjectiveValue = estimateProjectedObjectiveValue(state, playerIndex, unit, position);
  const strategicValue = estimateUnitStrategicValue(state, playerIndex, unit);
  const centerDistance = distanceBetween(position, {
    x: state.battlefield.width / 2,
    y: state.battlefield.height / 2,
  });

  const objectiveScore = Number.isFinite(nearestObjectiveDistance)
    ? (30 - (nearestObjectiveDistance * 2.2)) +
      (baseScore * 0.25) +
      (projectedObjectiveValue * 1.45) -
      (projectedExposure.total * 0.45)
    : Number.NEGATIVE_INFINITY;
  const fireScore =
    (24 - Math.abs(nearestEnemyDistance - 15)) +
    (baseScore * 0.25) +
    (projectedOutgoing * 0.4) -
    (projectedExposure.ranged * 0.2) +
    (projectedObjectiveValue * 0.3);
  const safetyScore =
    (Math.min(nearestEnemyDistance, 24) * 1.25) +
    (baseScore * 0.15) +
    (strategicValue * 0.45) +
    (projectedObjectiveValue * 0.35) -
    (projectedExposure.total * 0.8);
  const pressureScore =
    (30 - nearestEnemyDistance) +
    (baseScore * 0.2) +
    (projectedOutgoing * 0.45) -
    (projectedExposure.total * 0.15) +
    (projectedObjectiveValue * 0.25);
  const centerScore =
    (24 - centerDistance) +
    (baseScore * 0.15) +
    (projectedObjectiveValue * 0.55) +
    (projectedOutgoing * 0.15) -
    (projectedExposure.total * 0.2);

  return {
    objective: objectiveScore,
    fire: fireScore,
    safety: safetyScore,
    pressure: pressureScore,
    center: centerScore,
  };
}

function laneReason(lane: MovementLane): string {
  switch (lane) {
    case 'objective':
      return 'objective lane';
    case 'fire':
      return 'fire lane';
    case 'safety':
      return 'safety lane';
    case 'pressure':
      return 'pressure lane';
    case 'center':
      return 'center lane';
    default:
      return 'best lane';
  }
}

function selectDiversifiedMovementDestinations(
  candidates: MovementDestinationCandidate[],
  maxActions: number,
): Array<MovementDestinationCandidate & { lane: MovementLane; selectedScore: number }> {
  const selected: Array<MovementDestinationCandidate & { lane: MovementLane; selectedScore: number }> = [];
  const selectedPositions = new Set<string>();

  const takeBestForLane = (lane: Exclude<MovementLane, 'best'>): void => {
    const bestCandidate = [...candidates]
      .filter((candidate) => !selectedPositions.has(positionKey(candidate.position)))
      .sort((left, right) => {
        const laneDelta = right.laneScores[lane] - left.laneScores[lane];
        if (laneDelta !== 0) return laneDelta;
        return right.baseScore - left.baseScore;
      })[0];
    if (!bestCandidate || !Number.isFinite(bestCandidate.laneScores[lane])) return;

    selected.push({
      ...bestCandidate,
      lane,
      selectedScore: Math.max(bestCandidate.baseScore, bestCandidate.laneScores[lane]),
    });
    selectedPositions.add(positionKey(bestCandidate.position));
  };

  takeBestForLane('objective');
  takeBestForLane('fire');
  takeBestForLane('safety');
  takeBestForLane('pressure');
  takeBestForLane('center');

  for (const candidate of [...candidates].sort((left, right) => right.baseScore - left.baseScore)) {
    if (selected.length >= maxActions) break;
    if (selectedPositions.has(positionKey(candidate.position))) continue;
    selected.push({
      ...candidate,
      lane: 'best',
      selectedScore: candidate.baseScore,
    });
    selectedPositions.add(positionKey(candidate.position));
  }

  return selected
    .sort((left, right) => right.selectedScore - left.selectedScore)
    .slice(0, maxActions);
}

function isObjectiveHolder(state: GameState, unit: UnitState): boolean {
  const centroid = getUnitCentroid(unit);
  if (!centroid) return false;
  return (state.missionState?.objectives ?? []).some((objective) =>
    !objective.isRemoved && distanceBetween(centroid, objective.position) <= 3,
  );
}

function scoreReactionUnit(
  node: SearchNodeState,
  unitId: string,
): { score: number; reasons: string[] } | null {
  const pendingReaction = node.state.pendingReaction;
  if (!pendingReaction) return null;

  const reactingPlayerIndex = node.state.activePlayerIndex === 0 ? 1 : 0;
  const unit = findUnitInState(node.state, unitId);
  if (!unit) return null;

  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return null;

  const totalWeapons = aliveModels.reduce((total, model) => total + model.equippedWargear.length, 0);
  const triggerDistance = getClosestModelDistance(node.state, unit.id, pendingReaction.triggerSourceUnitId) ?? 24;
  const reasons: string[] = ['legal reaction'];
  let score = aliveModels.length * 2.5 + totalWeapons * 2;

  switch (pendingReaction.reactionType) {
    case CoreReaction.ReturnFire:
      score += totalWeapons * 4;
      score += Math.max(0, 20 - triggerDistance);
      score += estimateProjectedOutgoingPressure(node.state, reactingPlayerIndex, unit) * 0.45;
      reasons.push('best return fire');
      break;
    case CoreReaction.Overwatch:
      score += totalWeapons * 3;
      score += Math.max(0, 14 - triggerDistance) * 1.5;
      score += estimateProjectedOutgoingPressure(node.state, reactingPlayerIndex, unit) * 0.35;
      reasons.push('best overwatch');
      break;
    case CoreReaction.Reposition:
      score += Math.max(0, 18 - triggerDistance) * 1.75;
      score += aliveModels.length;
      score += estimateUnitExposureBreakdown(node.state, reactingPlayerIndex, unit).total * 0.8;
      reasons.push('best reposition');
      break;
    default:
      score += Math.max(0, 16 - triggerDistance);
      reasons.push('best reaction unit');
      break;
  }

  if (aliveModels.some((model) => model.isWarlord)) {
    score -= 8;
    reasons.push('protect warlord');
  }

  if (isObjectiveHolder(node.state, unit)) {
    score -= 4;
    reasons.push('holds objective');
  }

  const enemyThreat = evaluateUnitThreat(node.state, reactingPlayerIndex, pendingReaction.triggerSourceUnitId);
  score += enemyThreat * 0.1;
  score += estimateUnitStrategicValue(node.state, reactingPlayerIndex, unit) * 0.15;

  return { score, reasons };
}

function generateReactionActions(node: SearchNodeState): MacroAction[] {
  const pendingReaction = node.state.pendingReaction;
  if (!node.state.awaitingReaction || !pendingReaction) return [];

  const scoredUnits = pendingReaction.eligibleUnitIds
    .map((unitId) => ({ unitId, scoring: scoreReactionUnit(node, unitId) }))
    .filter((entry): entry is { unitId: string; scoring: NonNullable<ReturnType<typeof scoreReactionUnit>> } => entry.scoring !== null)
    .sort((left, right) => right.scoring.score - left.scoring.score);

  const actions = scoredUnits.map(({ unitId, scoring }) =>
    makeAction(
      `reaction:${unitId}`,
      `React with ${unitId}`,
      [{
        type: 'selectReaction',
        unitId,
        reactionType: String(pendingReaction.reactionType),
      }],
      scoring.score,
      [unitId],
      scoring.reasons,
    ),
  );

  const bestReactionScore = scoredUnits[0]?.scoring.score ?? 0;
  const declineScore = bestReactionScore < 18 ? 6 : -Math.min(12, bestReactionScore / 3);
  const declineReasons = bestReactionScore < 18 ? ['decline weak reaction'] : ['decline'];

  actions.push(
    makeAction(
      'reaction:decline',
      'Decline reaction',
      [{ type: 'declineReaction' }],
      declineScore,
      [],
      declineReasons,
    ),
  );

  return actions;
}

function generateReserveActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const army = node.state.armies[playerIndex];

  for (const unit of army.units) {
    if (getAliveModels(unit).length === 0) continue;

    if (unit.isInReserves && !node.actedUnitIds.has(unit.id)) {
      actions.push(
        makeAction(
          `reserve:test:${unit.id}`,
          `Reserves test ${unit.id}`,
          [{ type: 'reservesTest', unitId: unit.id }],
          15,
          [unit.id],
          ['reserves test'],
        ),
      );
      continue;
    }

    if (unit.movementState === UnitMovementState.EnteredFromReserves && !node.actedUnitIds.has(unit.id)) {
      actions.push(
        makeAction(
          `reserve:deploy:${unit.id}`,
          `Deploy ${unit.id} from reserves`,
          [{
            type: 'deployUnit',
            unitId: unit.id,
            modelPositions: buildReserveEntryPositions(node.state, unit, playerIndex),
          }],
          18,
          [unit.id],
          ['reserves entry'],
        ),
      );
    }
  }

  return actions;
}

function generateMoveActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const battlefieldWidth = node.state.battlefield.width;
  const battlefieldHeight = node.state.battlefield.height;
  const movableUnits = node.state.armies[playerIndex].units.filter((unit) => {
    if (node.actedUnitIds.has(unit.id)) return false;
    if (getAliveModels(unit).length === 0) return false;
    if (!canUnitMove(unit)) return false;
    const centroid = getUnitCentroid(unit);
    return centroid !== null && unit.movementState === UnitMovementState.Stationary;
  });

  for (const unit of movableUnits) {
    const aliveModels = getAliveModels(unit);
    const centroid = getUnitCentroid(unit);
    if (!centroid || aliveModels.length === 0) continue;

    const maxMove = aliveModels.reduce(
      (currentMin, model) => Math.min(currentMin, getModelMovementCharacteristic(model)),
      Number.POSITIVE_INFINITY,
    );

    const destinations = generateCandidatePositions(centroid, maxMove, battlefieldWidth, battlefieldHeight)
      .map((position) => {
        const modelPositions = translateUnitToCentroid(unit, position);
        if (!modelPositions) return null;
        if (!isLegalMoveFormation(node.state, unit.id, modelPositions)) {
          return null;
        }
        const baseScore = evaluateMovementDestination(node.state, unit.id, position, playerIndex);
        return {
          position,
          baseScore,
          laneScores: buildMovementLaneScores(node.state, playerIndex, unit, position, baseScore),
          modelPositions,
        };
      })
      .filter((candidate): candidate is MovementDestinationCandidate => candidate !== null);
    const selectedDestinations = selectDiversifiedMovementDestinations(destinations, config.maxActionsPerUnit);

    for (const destination of selectedDestinations) {
      actions.push(
        makeAction(
          `move:${unit.id}:${destination.position.x.toFixed(1)}:${destination.position.y.toFixed(1)}`,
          `Move ${unit.id}`,
          [{
            type: 'moveUnit',
            unitId: unit.id,
            modelPositions: destination.modelPositions,
          }],
          destination.selectedScore,
          [unit.id],
          [laneReason(destination.lane)],
        ),
      );
    }

    if (canUnitRush(unit)) {
      actions.push(
        makeAction(
          `rush:${unit.id}`,
          `Rush ${unit.id}`,
          [{ type: 'rushUnit', unitId: unit.id }],
          4,
          [unit.id],
          ['rush option'],
        ),
      );
    }
  }

  return actions;
}

function generateShootingContinuationActions(node: SearchNodeState): MacroAction[] {
  const attackState = node.state.shootingAttackState;
  if (!attackState) return [];

  const actions: MacroAction[] = [];
  const targetUnit = node.state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === attackState.targetUnitId);

  if (!targetUnit) {
    return [
      makeAction(
        'shoot:resolve',
        'Resolve shooting casualties',
        [{ type: 'resolveShootingCasualties' }],
        1,
        [],
        ['resolve attack'],
      ),
    ];
  }

  if (!attackState.selectedTargetModelId) {
    const targetPlayerIndex = attackState.attackerPlayerIndex === 0 ? 1 : 0;
    const targetStrategicValue = estimateUnitStrategicValue(node.state, targetPlayerIndex, targetUnit);
    const candidateModels = getAliveModels(targetUnit)
      .sort((left, right) => {
        if (left.isWarlord !== right.isWarlord) return left.isWarlord ? -1 : 1;
        return left.currentWounds - right.currentWounds;
      })
      .slice(0, 2);

    for (const model of candidateModels) {
      actions.push(
        makeAction(
          `shoot:target:${model.id}`,
          `Direct hits onto ${model.id}`,
          [
            { type: 'selectTargetModel', modelId: model.id },
            { type: 'resolveShootingCasualties' },
          ],
          (model.isWarlord ? 24 : 12 - model.currentWounds) + (targetStrategicValue * 0.6),
          [targetUnit.id],
          ['directed allocation'],
        ),
      );
    }
  }

  actions.push(
    makeAction(
      'shoot:resolve',
      'Resolve shooting casualties',
      [{ type: 'resolveShootingCasualties' }],
      0,
      [],
      ['resolve attack'],
    ),
  );

  return actions;
}

function generateShootingActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  if (node.state.shootingAttackState) {
    return generateShootingContinuationActions(node);
  }

  const actions: MacroAction[] = [];
  const shootableUnits = getShootableUnits(node.state, playerIndex, node.actedUnitIds);

  for (const unit of shootableUnits) {
    const prioritizedTargets = prioritizeShootingTargets(node.state, unit.id, playerIndex)
      .slice(0, Math.max(config.maxActionsPerUnit * 2, config.maxActionsPerUnit + 2));
    const scoredActions: MacroAction[] = [];

    for (const targetScore of prioritizedTargets) {
      const target = getValidShootingTargets(node.state, unit.id).find((candidate) => candidate.id === targetScore.unitId);
      if (!target) continue;

      const weaponSelections = selectWeaponsForAttack(node.state, unit, target, 'tactical');
      if (weaponSelections.length === 0) continue;

      const placements = buildSpecialPlacements(node.state, unit.id, target.id, weaponSelections);
      const expectedDamage = estimateUnitRangedDamagePotential(node.state, unit, target);
      const targetThreat = evaluateUnitThreat(node.state, playerIndex, target.id);
      const targetRemainingWounds = getAliveModels(target)
        .reduce((total, model) => total + model.currentWounds, 0);
      const targetStrategicValue = estimateUnitStrategicValue(node.state, playerIndex === 0 ? 1 : 0, target);
      const targetExposure = estimateUnitExposureBreakdown(node.state, playerIndex === 0 ? 1 : 0, target);
      const targetRetaliation = estimateProjectedOutgoingPressure(node.state, playerIndex === 0 ? 1 : 0, target);
      const targetObjectiveSwing = estimateObjectiveRemovalSwing(node.state, playerIndex === 0 ? 1 : 0, target);
      const killPressure = targetRemainingWounds > 0
        ? Math.min(18, (expectedDamage / targetRemainingWounds) * 14)
        : 0;

      const reasons = [...targetScore.reasons];
      reasons.push(`expected damage ${expectedDamage.toFixed(1)}`);
      if (isObjectiveHolder(node.state, target)) {
        reasons.push('objective holder');
      }
      if (getAliveModels(target).some((model) => model.isWarlord)) {
        reasons.push('warlord target');
      }
      if (killPressure >= 6) {
        reasons.push('kill pressure');
      }
      if (targetStrategicValue >= 16) {
        reasons.push('high value target');
      }
      if (targetExposure.total >= 3) {
        reasons.push('already exposed');
      }
      if (targetRetaliation >= 3) {
        reasons.push('cuts retaliation');
      }
      if (targetObjectiveSwing >= 1) {
        reasons.push(`objective swing ${targetObjectiveSwing.toFixed(1)}`);
      }

      const shootingScore = targetScore.score
        + (expectedDamage * 12)
        + (targetThreat * 0.2)
        + killPressure
        + (targetStrategicValue * 0.65)
        + (targetExposure.total * 1.5)
        + (targetRetaliation * 0.35)
        + (targetObjectiveSwing * 14)
        + (isObjectiveHolder(node.state, target) ? 12 : 0)
        + (getAliveModels(target).some((model) => model.isWarlord) ? 14 : 0);

      scoredActions.push(
        makeAction(
          `shoot:${unit.id}:${target.id}`,
          `Shoot ${target.id} with ${unit.id}`,
          [{
            type: 'declareShooting',
            attackingUnitId: unit.id,
            targetUnitId: target.id,
            weaponSelections,
            blastPlacements: placements.blastPlacements,
            templatePlacements: placements.templatePlacements,
          }],
          shootingScore,
          [unit.id],
          reasons,
        ),
      );
    }

    actions.push(
      ...scoredActions
        .sort((left, right) => right.orderingScore - left.orderingScore)
        .slice(0, config.maxActionsPerUnit),
    );
  }

  return actions;
}

function generateChargeActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const chargeableUnits = getChargeableUnits(node.state, playerIndex, node.actedUnitIds);

  for (const unit of chargeableUnits) {
    const prioritizedTargets = prioritizeChargeTargets(node.state, unit.id, playerIndex)
      .slice(0, config.maxActionsPerUnit);

    for (const targetScore of prioritizedTargets) {
      actions.push(
        makeAction(
          `charge:${unit.id}:${targetScore.unitId}`,
          `Charge ${targetScore.unitId} with ${unit.id}`,
          [{
            type: 'declareCharge',
            chargingUnitId: unit.id,
            targetUnitId: targetScore.unitId,
          }],
          targetScore.score,
          [unit.id],
          targetScore.reasons,
        ),
      );
    }

    if (prioritizedTargets.length === 0 && getValidChargeTargets(node.state, unit.id).length === 0) {
      continue;
    }
  }

  return actions;
}

function generateChallengeActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const combats = node.state.activeCombats ?? [];

  for (const combat of combats) {
    const challengeState = (combat as typeof combat & {
      challengeState?: {
        challengerId: string;
        challengedId: string;
        challengerPlayerIndex: number;
        challengedPlayerIndex: number;
        challengerGambit: string | null;
        challengedGambit: string | null;
        currentStep: string;
      };
    }).challengeState;

    if (!challengeState) {
      const combatUnitIds = [...combat.activePlayerUnitIds, ...combat.reactivePlayerUnitIds];
      const ownUnitIds = combatUnitIds.filter((unitId) =>
        node.state.armies[playerIndex].units.some((unit) => unit.id === unitId),
      );
      const enemyUnitIds = combatUnitIds.filter((unitId) =>
        node.state.armies[playerIndex === 0 ? 1 : 0].units.some((unit) => unit.id === unitId),
      );
      if (ownUnitIds.length === 0 || enemyUnitIds.length === 0) continue;

      const ownModels = ownUnitIds
        .flatMap((unitId) => node.state.armies[playerIndex].units.find((unit) => unit.id === unitId)?.models ?? [])
        .filter((model) => !model.isDestroyed)
        .filter((model) => model.isWarlord || model.profileModelName.toLowerCase().includes('sergeant'));
      const enemyModels = enemyUnitIds
        .flatMap((unitId) => node.state.armies[playerIndex === 0 ? 1 : 0].units.find((unit) => unit.id === unitId)?.models ?? [])
        .filter((model) => !model.isDestroyed)
        .filter((model) => model.isWarlord || model.profileModelName.toLowerCase().includes('sergeant'));

      if (ownModels.length > 0 && enemyModels.length > 0) {
        actions.push(
          makeAction(
            `challenge:declare:${ownModels[0].id}:${enemyModels[0].id}`,
            `Declare challenge`,
            [{
              type: 'declareChallenge',
              challengerModelId: ownModels[0].id,
              targetModelId: enemyModels[0].id,
            }],
            8,
            [ownModels[0].id],
            ['challenge opportunity'],
          ),
        );
      }
      continue;
    }

    if (challengeState.challengedPlayerIndex === playerIndex && challengeState.currentStep === 'FACE_OFF') {
      actions.push(
        makeAction(
          `challenge:accept:${challengeState.challengedId}`,
          `Accept challenge`,
          [{ type: 'acceptChallenge', challengedModelId: challengeState.challengedId }],
          10,
          [challengeState.challengedId],
          ['accept challenge'],
        ),
      );
      actions.push(
        makeAction(
          'challenge:decline',
          'Decline challenge',
          [{ type: 'declineChallenge' }],
          -5,
          [],
          ['decline challenge'],
        ),
      );
    }

    const challengerNeedsGambit =
      challengeState.challengerPlayerIndex === playerIndex &&
      challengeState.challengerGambit === null;
    const challengedNeedsGambit =
      challengeState.challengedPlayerIndex === playerIndex &&
      challengeState.challengedGambit === null;

    if (challengerNeedsGambit || challengedNeedsGambit) {
      const modelId = challengerNeedsGambit ? challengeState.challengerId : challengeState.challengedId;
      const gambits = [
        ChallengeGambit.PressTheAttack,
        ChallengeGambit.Guard,
        ChallengeGambit.SeizeTheInitiative,
      ];

      gambits.forEach((gambit, index) => {
        actions.push(
          makeAction(
            `gambit:${modelId}:${gambit}`,
            `Select ${gambit}`,
            [{ type: 'selectGambit', modelId, gambit }],
            12 - (index * 2),
            [modelId],
            ['gambit selection'],
          ),
        );
      });
    }
  }

  return actions;
}

function generateFightActions(node: SearchNodeState): MacroAction[] {
  return (node.state.activeCombats ?? [])
    .filter((combat) => !combat.resolved)
    .map((combat, index) =>
      makeAction(
        `fight:${combat.combatId}`,
        `Resolve fight ${index + 1}`,
        [{ type: 'resolveFight', combatId: combat.combatId }],
        6,
        [combat.combatId],
        ['resolve combat'],
      ),
    );
}

function getResolutionState(
  state: GameState,
  unitId: string,
): { availableOptions: AftermathOption[]; isWinner: boolean } | null {
  const combats = state.activeCombats ?? [];
  const combat = combats.find((candidate) =>
    candidate.activePlayerUnitIds.includes(unitId) || candidate.reactivePlayerUnitIds.includes(unitId),
  );
  if (!combat) return null;

  const unit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === unitId);
  if (!unit) return null;

  const isActiveUnit = combat.activePlayerUnitIds.includes(unitId);
  const isWinner = (isActiveUnit && combat.activePlayerCRP > combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP > combat.activePlayerCRP);
  const isLoser = (isActiveUnit && combat.activePlayerCRP < combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP < combat.activePlayerCRP);
  const isDraw = combat.activePlayerCRP === combat.reactivePlayerCRP;
  const enemyUnitIds = isActiveUnit ? combat.reactivePlayerUnitIds : combat.activePlayerUnitIds;
  const allEnemyFleeing = enemyUnitIds.every((enemyId) => {
    const enemyUnit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === enemyId);
    return enemyUnit ? enemyUnit.statuses.includes(TacticalStatus.Routed) : true;
  });

  return {
    availableOptions: getAvailableAftermathOptions(
      state,
      unitId,
      isWinner,
      isLoser,
      isDraw,
      allEnemyFleeing,
    ),
    isWinner,
  };
}

function generateResolutionActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const units = node.state.armies[playerIndex].units.filter((unit) =>
    unit.isLockedInCombat && getAliveModels(unit).length > 0 && !node.actedUnitIds.has(unit.id),
  );

  for (const unit of units) {
    const resolutionState = getResolutionState(node.state, unit.id);
    if (!resolutionState) continue;

    resolutionState.availableOptions.forEach((option, index) => {
      const score = resolutionState.isWinner
        ? (
          option === 'Pursue' ? 12 :
          option === 'Consolidate' ? 10 :
          option === 'Gun Down' ? 9 :
          4 - index
        )
        : (
          option === 'Hold' ? 7 :
          option === 'Disengage' ? 6 :
          option === 'Fall Back' ? 4 :
          2 - index
        );
      actions.push(
        makeAction(
          `aftermath:${unit.id}:${option}`,
          `Select ${option} for ${unit.id}`,
          [{ type: 'selectAftermath', unitId: unit.id, option }],
          score,
          [unit.id],
          ['aftermath'],
        ),
      );
    });
  }

  return actions;
}

export function generateMacroActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
  options: { includeAdvanceCommands?: boolean } = {},
): MacroAction[] {
  const includeAdvanceCommands = options.includeAdvanceCommands ?? true;
  const valid = new Set(getValidCommands(node.state));
  const actions = node.state.awaitingReaction
    ? generateReactionActions(node)
    : (() => {
      switch (node.state.currentPhase) {
        case Phase.Movement:
          switch (node.state.currentSubPhase) {
            case SubPhase.Reserves:
              return generateReserveActions(node, playerIndex);
            case SubPhase.Move:
              return generateMoveActions(node, playerIndex, config);
            default:
              return [];
          }
        case Phase.Shooting:
          return node.state.currentSubPhase === SubPhase.Attack
            ? generateShootingActions(node, playerIndex, config)
            : [];
        case Phase.Assault:
          switch (node.state.currentSubPhase) {
            case SubPhase.Charge:
              return generateChargeActions(node, playerIndex, config);
            case SubPhase.Challenge:
              return generateChallengeActions(node, playerIndex);
            case SubPhase.Fight:
              return generateFightActions(node);
            case SubPhase.Resolution:
              return generateResolutionActions(node, playerIndex);
            default:
              return [];
          }
        default:
          return [];
      }
    })();

  const filteredActions = actions
    .filter((action) => action.commands.every((command) => valid.has(command.type)))
    .sort((left, right) => right.orderingScore - left.orderingScore)
    .slice(0, config.maxRootActions);

  if (filteredActions.length > 0 || !includeAdvanceCommands) {
    return filteredActions;
  }

  if (valid.has('endSubPhase')) {
    return [
      makeAction(
        'advance:end-sub-phase',
        'End sub-phase',
        [{ type: 'endSubPhase' }],
        -1,
        [],
        ['advance'],
      ),
    ];
  }

  if (valid.has('endPhase')) {
    return [
      makeAction(
        'advance:end-phase',
        'End phase',
        [{ type: 'endPhase' }],
        -2,
        [],
        ['advance'],
      ),
    ];
  }

  return [];
}

export function isRealDecisionNode(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): boolean {
  return generateMacroActions(node, playerIndex, config, { includeAdvanceCommands: false }).length > 0;
}
