import type {
  AftermathOption,
  BlastPlacement,
  DeclaredPsychicPower,
  GameCommand,
  GameState,
  MeleeWeaponProfile,
  ModelState,
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
  findLegionWeapon,
  findWeapon,
  isMeleeWeapon,
} from '@hh/data';
import {
  canUnitMove,
  canUnitRush,
  findModel,
  FixedDiceProvider,
  formFireGroups,
  getAliveModels,
  getAvailableGambits,
  getBestAvailablePsychicFocus,
  getBlastSizeInches,
  getClosestModelDistance,
  getEligibleAcceptors,
  getEligibleChallengers,
  getModelPsychicDisciplines,
  getModelPsychicMeleeWeapon,
  getModelsWithLOSToUnit,
  getUnitLegion,
  getValidCommands,
  handleDisembark,
  handleEmbark,
  handleMoveUnit,
  handleRepositionReaction,
  hasLOSToUnit,
  isVehicleUnit,
  modelHasPsychicTrait,
  modelHasLOSToUnit,
  modelIsWithinRangeOfUnit,
  unitCanUsePsychicAbilities,
  unitHasUsedPsychicPower,
} from '@hh/engine';
import type { MacroAction, SearchConfig } from '../types';
import { generateCandidatePositions, evaluateMovementDestination } from '../evaluation/position-evaluation';
import { evaluateUnitThreat } from '../evaluation/threat-evaluation';
import { prioritizeChargeTargets, prioritizeShootingTargets } from '../evaluation/target-priority';
import {
  getChargeableUnits,
  getEnemyDeployedUnits,
  getModelInitiativeCharacteristic,
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

interface PsychicFocusChoice {
  unit: UnitState;
  model: ModelState;
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
  isRush: boolean = false,
): boolean {
  if (!areModelPositionsWithinBattlefield(state, modelPositions)) {
    return false;
  }

  const dice = new FixedDiceProvider(
    Array.from({ length: Math.max(16, modelPositions.length * 4) }, () => 6),
  );
  return handleMoveUnit(
    state,
    unitId,
    modelPositions,
    dice,
    isRush ? { isRush: true } : undefined,
  ).accepted;
}

function getUnitMaxTranslation(unit: UnitState, isRush: boolean): number {
  const aliveModels = getAliveModels(unit);
  return aliveModels.reduce((currentMin, model) => Math.min(
    currentMin,
    getModelMovementCharacteristic(model)
      + (isRush ? getModelInitiativeCharacteristic(model) : 0),
  ), Number.POSITIVE_INFINITY);
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

function getPlayerUnits(
  state: GameState,
  playerIndex: number,
): UnitState[] {
  return state.armies[playerIndex]?.units ?? [];
}

function unitHasPsyker(
  state: GameState,
  unit: UnitState,
): boolean {
  return getAliveModels(unit).some((model) => modelHasPsychicTrait(state, model));
}

function hasPsychicPowerWithGrantedTrait(
  model: ModelState,
  powerId: string,
  grantedTrait: string,
): boolean {
  return getModelPsychicDisciplines(model).some((discipline) =>
    discipline.grantedTrait.toLowerCase() === grantedTrait.toLowerCase() &&
    discipline.powers.some((power) => power.id === powerId),
  );
}

function getCandidatePsychicFocuses(
  state: GameState,
  playerIndex: number,
  powerId: string,
  grantedTrait: string,
): PsychicFocusChoice[] {
  return getPlayerUnits(state, playerIndex).flatMap((unit) => {
    if (!unitCanUsePsychicAbilities(state, unit) || unitHasUsedPsychicPower(state, unit.id)) {
      return [];
    }

    const focus = getBestAvailablePsychicFocus(state, unit.id, (model) =>
      hasPsychicPowerWithGrantedTrait(model, powerId, grantedTrait),
    );
    return focus ? [{ unit, model: focus }] : [];
  });
}

function buildDeclaredPsychicPower(
  powerId: string,
  focusModelId: string,
): DeclaredPsychicPower {
  return { powerId, focusModelId };
}

function selectDeclaredPsychicPower(
  state: GameState,
  playerIndex: number,
  beneficiaryUnitId: string,
  powerId: string,
  grantedTrait: string,
): DeclaredPsychicPower | null {
  const candidates = getCandidatePsychicFocuses(state, playerIndex, powerId, grantedTrait)
    .filter(({ unit, model }) =>
      unit.id === beneficiaryUnitId ||
      (
        modelIsWithinRangeOfUnit(state, model.id, beneficiaryUnitId, 18) &&
        modelHasLOSToUnit(state, model.id, beneficiaryUnitId)
      ),
    )
    .sort((left, right) => {
      const leftSameUnit = Number(left.unit.id === beneficiaryUnitId);
      const rightSameUnit = Number(right.unit.id === beneficiaryUnitId);
      if (leftSameUnit !== rightSameUnit) {
        return rightSameUnit - leftSameUnit;
      }

      const leftDistance = left.unit.id === beneficiaryUnitId
        ? 0
        : (getClosestModelDistance(state, left.unit.id, beneficiaryUnitId) ?? Number.POSITIVE_INFINITY);
      const rightDistance = right.unit.id === beneficiaryUnitId
        ? 0
        : (getClosestModelDistance(state, right.unit.id, beneficiaryUnitId) ?? Number.POSITIVE_INFINITY);
      return leftDistance - rightDistance;
    });

  const chosen = candidates[0];
  return chosen ? buildDeclaredPsychicPower(powerId, chosen.model.id) : null;
}

function getModelAvailableMeleeWeaponIds(model: ModelState): string[] {
  const weaponIds = new Set<string>(model.equippedWargear);

  for (const discipline of getModelPsychicDisciplines(model)) {
    for (const weapon of discipline.weapons) {
      if (getModelPsychicMeleeWeapon(model, weapon.id)) {
        weaponIds.add(weapon.id);
      }
    }
  }

  return [...weaponIds].filter((weaponId) => resolveCandidateMeleeWeapon(model, weaponId) !== null);
}

function buildCompactFormation(
  unit: UnitState,
  center: Position,
): { modelId: string; position: Position }[] {
  const aliveModels = getAliveModels(unit);
  const columns = Math.max(1, Math.ceil(Math.sqrt(aliveModels.length)));
  const totalRows = Math.max(1, Math.ceil(aliveModels.length / columns));
  const spacing = 1.5;

  return aliveModels.map((model, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, aliveModels.length - (row * columns));
    return {
      modelId: model.id,
      position: {
        x: center.x + ((column - ((rowCount - 1) / 2)) * spacing),
        y: center.y + ((row - ((totalRows - 1) / 2)) * spacing),
      },
    };
  });
}

function getFormationCentroid(
  modelPositions: { modelId: string; position: Position }[],
): Position | null {
  if (modelPositions.length === 0) {
    return null;
  }

  const total = modelPositions.reduce((sum, entry) => ({
    x: sum.x + entry.position.x,
    y: sum.y + entry.position.y,
  }), { x: 0, y: 0 });

  return {
    x: total.x / modelPositions.length,
    y: total.y / modelPositions.length,
  };
}

function buildDisembarkDestinations(
  state: GameState,
  unit: UnitState,
  config: SearchConfig,
): Array<MovementDestinationCandidate & { lane: MovementLane; selectedScore: number }> {
  if (unit.embarkedOnId === null) {
    return [];
  }

  const transport = findUnitInState(state, unit.embarkedOnId);
  const transportModel = transport ? getAliveModels(transport)[0] : null;
  if (!transport || !transportModel) {
    return [];
  }

  const maxMove = getUnitMaxTranslation(unit, false);
  const candidateCenters = generateCandidatePositions(
    transportModel.position,
    maxMove,
    state.battlefield.width,
    state.battlefield.height,
  );
  const playerIndex = state.armies.findIndex((army) => army.units.some((candidate) => candidate.id === unit.id));
  if (playerIndex < 0) {
    return [];
  }

  const destinations = candidateCenters
    .map((center) => {
      const modelPositions = buildCompactFormation(unit, center);
      if (!areModelPositionsWithinBattlefield(state, modelPositions)) {
        return null;
      }

      const validation = handleDisembark(
        state,
        unit.id,
        modelPositions,
        new FixedDiceProvider([]),
      );
      if (!validation.accepted) {
        return null;
      }

      const centroid = getFormationCentroid(modelPositions);
      if (!centroid) {
        return null;
      }

      const baseScore = evaluateMovementDestination(state, unit.id, centroid, playerIndex);
      return {
        position: centroid,
        baseScore,
        laneScores: buildMovementLaneScores(state, playerIndex, unit, centroid, baseScore),
        modelPositions,
      };
    })
    .filter((candidate): candidate is MovementDestinationCandidate => candidate !== null);

  return selectDiversifiedMovementDestinations(destinations, Math.max(2, config.maxActionsPerUnit));
}

function findNearestModelPosition(
  state: GameState,
  targetUnitId: string,
  fromPosition: Position,
): Position | null {
  const targetUnit = findUnitInState(state, targetUnitId);
  if (!targetUnit) return null;

  const aliveModels = getAliveModels(targetUnit);
  if (aliveModels.length === 0) return null;

  let nearestPosition: Position | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const model of aliveModels) {
    const distance = distanceBetween(fromPosition, model.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPosition = model.position;
    }
  }

  return nearestPosition;
}

function computeMoveToward(
  from: Position,
  target: Position,
  maxDistance: number,
): Position {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) {
    return { x: from.x, y: from.y };
  }

  const moveDistance = Math.min(maxDistance, distance);
  return {
    x: from.x + ((dx / distance) * moveDistance),
    y: from.y + ((dy / distance) * moveDistance),
  };
}

function buildChasingTheWindModelPositions(
  state: GameState,
  unit: UnitState,
  triggerSourceUnitId: string,
): { modelId: string; position: Position }[] | null {
  const modelPositions = getAliveModels(unit).map((model) => {
    const nearestEnemyPosition = findNearestModelPosition(state, triggerSourceUnitId, model.position);
    if (!nearestEnemyPosition) {
      return { modelId: model.id, position: model.position };
    }

    return {
      modelId: model.id,
      position: computeMoveToward(
        model.position,
        nearestEnemyPosition,
        getModelMovementCharacteristic(model),
      ),
    };
  });

  return areModelPositionsWithinBattlefield(state, modelPositions) ? modelPositions : null;
}

function resolveCandidateMeleeWeapon(
  model: ModelState,
  weaponId: string,
): MeleeWeaponProfile | null {
  const dataWeapon = findWeapon(weaponId) ?? findLegionWeapon(weaponId);
  if (dataWeapon && isMeleeWeapon(dataWeapon)) {
    return dataWeapon;
  }

  return getModelPsychicMeleeWeapon(model, weaponId) ?? null;
}

function scoreMeleeWeaponChoice(
  model: ModelState,
  weaponId: string,
): number {
  const weapon = resolveCandidateMeleeWeapon(model, weaponId);
  if (!weapon) {
    return Number.NEGATIVE_INFINITY;
  }

  const initiativeBonus = typeof weapon.initiativeModifier === 'number'
    ? weapon.initiativeModifier
    : 0;
  const apScore = weapon.ap === null ? 0 : (10 - weapon.ap);
  return (
    (weapon.damage * 10) +
    apScore +
    initiativeBonus +
    (weapon.specialRules.length * 0.5)
  );
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

  const actions = scoredUnits.flatMap(({ unitId, scoring }) => {
    const unit = findUnitInState(node.state, unitId);
    if (!unit) {
      return [];
    }

    if (pendingReaction.reactionType === CoreReaction.Reposition) {
      const centroid = getUnitCentroid(unit);
      if (!centroid) {
        return [];
      }

      const maxMove = getAliveModels(unit).reduce(
        (minimum, model) => Math.min(minimum, getModelInitiativeCharacteristic(model)),
        Number.POSITIVE_INFINITY,
      );
      const destinations = generateCandidatePositions(
        centroid,
        maxMove,
        node.state.battlefield.width,
        node.state.battlefield.height,
      )
        .map((position) => {
          const modelPositions = translateUnitToCentroid(unit, position);
          if (!modelPositions || !areModelPositionsWithinBattlefield(node.state, modelPositions)) {
            return null;
          }

          const validation = handleRepositionReaction(
            node.state,
            unit.id,
            modelPositions,
            new FixedDiceProvider(Array.from({ length: 64 }, () => 6)),
          );
          if (!validation.accepted) {
            return null;
          }

          const baseScore = evaluateMovementDestination(
            node.state,
            unit.id,
            position,
            node.state.activePlayerIndex === 0 ? 1 : 0,
          );
          return {
            position,
            baseScore,
            laneScores: buildMovementLaneScores(node.state, node.state.activePlayerIndex === 0 ? 1 : 0, unit, position, baseScore),
            modelPositions,
          };
        })
        .filter((candidate): candidate is MovementDestinationCandidate => candidate !== null);

      return selectDiversifiedMovementDestinations(destinations, 3).map((destination) =>
        makeAction(
          `reaction:${unitId}:${destination.position.x.toFixed(1)}:${destination.position.y.toFixed(1)}`,
          `Reposition ${unitId}`,
          [{
            type: 'selectReaction',
            unitId,
            reactionType: String(pendingReaction.reactionType),
            modelPositions: destination.modelPositions,
          }],
          scoring.score + destination.selectedScore,
          [unitId],
          [...scoring.reasons, laneReason(destination.lane)],
        ),
      );
    }

    if (pendingReaction.reactionType === 'ws-chasing-wind') {
      const modelPositions = buildChasingTheWindModelPositions(
        node.state,
        unit,
        pendingReaction.triggerSourceUnitId,
      );
      if (!modelPositions) {
        return [];
      }

      const validation = handleMoveUnit(
        node.state,
        unit.id,
        modelPositions,
        new FixedDiceProvider(Array.from({ length: 64 }, () => 6)),
        { expectedPlayerIndex: node.state.activePlayerIndex === 0 ? 1 : 0 },
      );
      if (!validation.accepted) {
        return [];
      }

      return [
        makeAction(
          `reaction:${unitId}:ws-chasing-wind`,
          `React with ${unitId}`,
          [{
            type: 'selectReaction',
            unitId,
            reactionType: String(pendingReaction.reactionType),
            modelPositions,
          }],
          scoring.score + 8,
          [unitId],
          [...scoring.reasons, 'move toward enemy'],
        ),
      ];
    }

    return [
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
    ];
  });

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

function generateStandalonePsychicActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const enemyIndex = playerIndex === 0 ? 1 : 0;
  const enemyUnits = getPlayerUnits(node.state, enemyIndex).filter((unit) => getAliveModels(unit).length > 0);

  if (node.state.currentPhase === Phase.Start && node.state.currentSubPhase === SubPhase.StartEffects) {
    const focuses = getCandidatePsychicFocuses(node.state, playerIndex, 'tranquillity', 'Thaumaturge');
    for (const focus of focuses) {
      const scoredTargets = enemyUnits
        .filter((target) =>
          unitCanUsePsychicAbilities(node.state, target) &&
          unitHasPsyker(node.state, target) &&
          modelIsWithinRangeOfUnit(node.state, focus.model.id, target.id, 18) &&
          modelHasLOSToUnit(node.state, focus.model.id, target.id),
        )
        .map((target) => ({
          target,
          score:
            estimateUnitStrategicValue(node.state, enemyIndex, target) +
            evaluateUnitThreat(node.state, enemyIndex, target.id) +
            (isObjectiveHolder(node.state, target) ? 8 : 0) +
            (getAliveModels(target).some((model) => model.isWarlord) ? 10 : 0),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(2, config.maxActionsPerUnit));

      for (const { target, score } of scoredTargets) {
        actions.push(
          makeAction(
            `psychic:manifest:tranquillity:${focus.model.id}:${target.id}`,
            `Manifest Tranquillity on ${target.id}`,
            [{
              type: 'manifestPsychicPower',
              powerId: 'tranquillity',
              focusModelId: focus.model.id,
              targetUnitId: target.id,
            }],
            score + 10,
            [focus.unit.id],
            ['standalone psychic power', 'psyker suppression'],
          ),
        );
      }
    }
  }

  if (node.state.currentPhase === Phase.Movement && node.state.currentSubPhase === SubPhase.Move) {
    const focuses = getCandidatePsychicFocuses(node.state, playerIndex, 'mind-burst', 'Telepath')
      .filter(({ unit }) => unit.movementState === UnitMovementState.Stationary && canUnitMove(unit));

    for (const focus of focuses) {
      const scoredTargets = enemyUnits
        .filter((target) =>
          target.isDeployed &&
          !target.isInReserves &&
          target.embarkedOnId === null &&
          !target.isLockedInCombat &&
          modelIsWithinRangeOfUnit(node.state, focus.model.id, target.id, 18) &&
          modelHasLOSToUnit(node.state, focus.model.id, target.id)
        )
        .filter((target) => !isVehicleUnit(target))
        .map((target) => ({
          target,
          score:
            estimateUnitStrategicValue(node.state, enemyIndex, target) +
            (evaluateUnitThreat(node.state, enemyIndex, target.id) * 1.2) +
            (isObjectiveHolder(node.state, target) ? 12 : 0) +
            (getAliveModels(target).some((model) => model.isWarlord) ? 10 : 0),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(2, config.maxActionsPerUnit));

      for (const { target, score } of scoredTargets) {
        actions.push(
          makeAction(
            `psychic:manifest:mind-burst:${focus.model.id}:${target.id}`,
            `Manifest Mind-burst on ${target.id}`,
            [{
              type: 'manifestPsychicPower',
              powerId: 'mind-burst',
              focusModelId: focus.model.id,
              targetUnitId: target.id,
            }],
            score + 8,
            [focus.unit.id],
            ['standalone psychic power', 'movement denial'],
          ),
        );
      }
    }
  }

  return actions;
}

function generateTransportActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const armyUnits = getPlayerUnits(node.state, playerIndex);
  const aliveUnits = armyUnits.filter((unit) => getAliveModels(unit).length > 0);
  const transports = aliveUnits.filter((unit) => unit.isDeployed && unit.embarkedOnId === null);
  const validationDice = new FixedDiceProvider(Array.from({ length: 128 }, () => 6));

  for (const unit of aliveUnits) {
    if (node.actedUnitIds.has(unit.id)) {
      continue;
    }

    if (unit.embarkedOnId !== null) {
      const destinations = buildDisembarkDestinations(node.state, unit, config);
      for (const destination of destinations) {
        actions.push(
          makeAction(
            `transport:disembark:${unit.id}:${destination.position.x.toFixed(1)}:${destination.position.y.toFixed(1)}`,
            `Disembark ${unit.id}`,
            [{
              type: 'disembark',
              unitId: unit.id,
              modelPositions: destination.modelPositions,
            }],
            destination.selectedScore + estimateUnitStrategicValue(node.state, playerIndex, unit),
            [unit.id],
            ['transport action', laneReason(destination.lane)],
          ),
        );
      }
      continue;
    }

    const embarkCandidates = transports
      .filter((transport) => transport.id !== unit.id)
      .flatMap((transport) => {
        const directEmbark = handleEmbark(node.state, unit.id, transport.id, validationDice);
        const scored: MacroAction[] = [];
        const unitValue = estimateUnitStrategicValue(node.state, playerIndex, unit);
        const transportValue = estimateUnitStrategicValue(node.state, playerIndex, transport);

        if (directEmbark.accepted) {
          scored.push(
            makeAction(
              `transport:embark:${unit.id}:${transport.id}`,
              `Embark ${unit.id} on ${transport.id}`,
              [{
                type: 'embark',
                unitId: unit.id,
                transportId: transport.id,
              }],
              12 + (unitValue * 0.5) + (transportValue * 0.15),
              [unit.id],
              ['transport action', 'board transport'],
            ),
          );
        }

        const transportModel = getAliveModels(transport)[0];
        if (
          transportModel &&
          unit.movementState === UnitMovementState.Stationary &&
          canUnitMove(unit)
        ) {
          const embarkCenters = generateCandidatePositions(
            transportModel.position,
            2.5,
            node.state.battlefield.width,
            node.state.battlefield.height,
          );

          for (const center of embarkCenters) {
            const modelPositions = translateUnitToCentroid(unit, center);
            if (!modelPositions || !areModelPositionsWithinBattlefield(node.state, modelPositions)) {
              continue;
            }

            const moved = handleMoveUnit(node.state, unit.id, modelPositions, validationDice);
            if (!moved.accepted) {
              continue;
            }

            const embarked = handleEmbark(moved.state, unit.id, transport.id, validationDice);
            if (!embarked.accepted) {
              continue;
            }

            scored.push(
              makeAction(
                `transport:move-embark:${unit.id}:${transport.id}:${center.x.toFixed(1)}:${center.y.toFixed(1)}`,
                `Move and embark ${unit.id}`,
                [
                  {
                    type: 'moveUnit',
                    unitId: unit.id,
                    modelPositions,
                  },
                  {
                    type: 'embark',
                    unitId: unit.id,
                    transportId: transport.id,
                  },
                ],
                14 + (unitValue * 0.55) + (transportValue * 0.2),
                [unit.id],
                ['transport action', 'move to transport'],
              ),
            );
          }
        }

        return scored;
      })
      .sort((left, right) => right.orderingScore - left.orderingScore)
      .slice(0, Math.max(2, config.maxActionsPerUnit));

    actions.push(...embarkCandidates);
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
    return (
      centroid !== null &&
      (
        unit.movementState === UnitMovementState.Stationary
        || unit.movementState === UnitMovementState.RushDeclared
      )
    );
  });

  for (const unit of movableUnits) {
    const aliveModels = getAliveModels(unit);
    const centroid = getUnitCentroid(unit);
    if (!centroid || aliveModels.length === 0) continue;

    const buildDestinations = (isRush: boolean): Array<MovementDestinationCandidate & { lane: MovementLane; selectedScore: number }> => {
      const maxMove = getUnitMaxTranslation(unit, isRush);
      const destinations = generateCandidatePositions(centroid, maxMove, battlefieldWidth, battlefieldHeight)
        .map((position) => {
          const modelPositions = translateUnitToCentroid(unit, position);
          if (!modelPositions) return null;
          if (!isLegalMoveFormation(node.state, unit.id, modelPositions, isRush)) {
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

      return selectDiversifiedMovementDestinations(destinations, config.maxActionsPerUnit);
    };

    if (unit.movementState === UnitMovementState.Stationary) {
      const selectedDestinations = buildDestinations(false);
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
    }

    const canGenerateRushMoves =
      unit.movementState === UnitMovementState.RushDeclared || canUnitRush(unit);
    if (canGenerateRushMoves) {
      const selectedRushDestinations = buildDestinations(true);
      for (const destination of selectedRushDestinations) {
        const rushCommands: GameCommand[] = unit.movementState === UnitMovementState.RushDeclared
          ? [{
              type: 'moveUnit',
              unitId: unit.id,
              modelPositions: destination.modelPositions,
              isRush: true,
            }]
          : [
              { type: 'rushUnit', unitId: unit.id },
              {
                type: 'moveUnit',
                unitId: unit.id,
                modelPositions: destination.modelPositions,
                isRush: true,
              },
            ];

        actions.push(
          makeAction(
            `rush:${unit.id}:${destination.position.x.toFixed(1)}:${destination.position.y.toFixed(1)}`,
            `Rush ${unit.id}`,
            rushCommands,
            destination.selectedScore + 1,
            [unit.id],
            ['rush move', laneReason(destination.lane)],
          ),
        );
      }
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

      const declaredPsychicPower = selectDeclaredPsychicPower(
        node.state,
        playerIndex,
        unit.id,
        'foresights-blessing',
        'Diviner',
      );
      if (declaredPsychicPower) {
        scoredActions.push(
          makeAction(
            `shoot:${unit.id}:${target.id}:foresights-blessing:${declaredPsychicPower.focusModelId}`,
            `Shoot ${target.id} with ${unit.id} using Foresight's Blessing`,
            [{
              type: 'declareShooting',
              attackingUnitId: unit.id,
              targetUnitId: target.id,
              psychicPower: declaredPsychicPower,
              weaponSelections,
              blastPlacements: placements.blastPlacements,
              templatePlacements: placements.templatePlacements,
            }],
            shootingScore + 6,
            [unit.id],
            [...reasons, 'psychic precision'],
          ),
        );
      }
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

      const declaredPsychicPower = selectDeclaredPsychicPower(
        node.state,
        playerIndex,
        unit.id,
        'biomantic-rage',
        'Biomancer',
      );
      if (declaredPsychicPower) {
        actions.push(
          makeAction(
            `charge:${unit.id}:${targetScore.unitId}:biomantic-rage:${declaredPsychicPower.focusModelId}`,
            `Charge ${targetScore.unitId} with ${unit.id} using Biomantic Rage`,
            [{
              type: 'declareCharge',
              chargingUnitId: unit.id,
              targetUnitId: targetScore.unitId,
              psychicPower: declaredPsychicPower,
            }],
            targetScore.score + 5,
            [unit.id],
            [...targetScore.reasons, 'psychic assault buff'],
          ),
        );
      }
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

      const declareActions = ownUnitIds.flatMap((ownUnitId) => {
        const challengerIds = getEligibleChallengers(node.state, ownUnitId).eligibleChallengerIds;
        return challengerIds.flatMap((challengerId) =>
          enemyUnitIds.flatMap((enemyUnitId) =>
            getEligibleAcceptors(node.state, enemyUnitId).map((targetModelId) => {
              const challenger = findModel(node.state, challengerId)?.model;
              const target = findModel(node.state, targetModelId)?.model;
              const score =
                8 +
                (challenger?.isWarlord ? 3 : 0) +
                (target?.isWarlord ? 4 : 0);

              return makeAction(
                `challenge:declare:${challengerId}:${targetModelId}`,
                'Declare challenge',
                [{
                  type: 'declareChallenge',
                  challengerModelId: challengerId,
                  targetModelId,
                }],
                score,
                [challengerId],
                ['challenge opportunity', target?.isWarlord ? 'enemy warlord' : 'eligible challenger'],
              );
            }),
          ),
        );
      })
        .sort((left, right) => right.orderingScore - left.orderingScore)
        .slice(0, 4);

      actions.push(...declareActions);
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
      const modelInfo = findModel(node.state, modelId);
      const legion = modelInfo ? getUnitLegion(node.state, modelInfo.unit.id) : undefined;
      const psychicGambits = modelInfo
        ? getModelPsychicDisciplines(modelInfo.model).flatMap((discipline) => discipline.gambits.map((gambit) => gambit.id))
        : [];
      const gambits = new Set([
        ...getAvailableGambits(legion ?? undefined),
        ...psychicGambits,
      ]);

      [...gambits].forEach((gambit) => {
        const score = (
          gambit === ChallengeGambit.PressTheAttack ? 12 :
          gambit === 'every-strike-foreseen' ? 11 :
          gambit === ChallengeGambit.Guard ? 10 :
          gambit === ChallengeGambit.SeizeTheInitiative ? 9 :
          gambit === ChallengeGambit.RecklessAssault ? 8 :
          gambit === ChallengeGambit.AllOutAttack ? 7 :
          6
        );
        actions.push(
          makeAction(
            `gambit:${modelId}:${gambit}`,
            `Select ${gambit}`,
            [{ type: 'selectGambit', modelId, gambit }],
            score,
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
  const unresolvedCombats = (node.state.activeCombats ?? []).filter((combat) => !combat.resolved);
  const actions = unresolvedCombats.map((combat, index) =>
    makeAction(
      `fight:${combat.combatId}`,
      `Resolve fight ${index + 1}`,
      [{ type: 'resolveFight', combatId: combat.combatId }],
      6,
      [combat.combatId],
      ['resolve combat'],
    ),
  );

  const currentCombat = unresolvedCombats[0];
  if (!currentCombat) {
    return actions;
  }

  const combatUnitIds = [...currentCombat.activePlayerUnitIds, ...currentCombat.reactivePlayerUnitIds];
  const weaponSelections = combatUnitIds
    .map((unitId) => findUnitInState(node.state, unitId))
    .filter((unit): unit is UnitState => unit !== null)
    .flatMap((unit) =>
      getAliveModels(unit).map((model) => {
        const weaponId = getModelAvailableMeleeWeaponIds(model)
          .sort((left, right) => scoreMeleeWeaponChoice(model, right) - scoreMeleeWeaponChoice(model, left))[0];
        return weaponId ? { modelId: model.id, weaponId } : null;
      }),
    )
    .filter((selection): selection is { modelId: string; weaponId: string } => selection !== null);

  if (weaponSelections.length > 0) {
    actions.unshift(
      makeAction(
        `fight:${currentCombat.combatId}:declare-weapons`,
        `Declare weapons and resolve ${currentCombat.combatId}`,
        [
          { type: 'declareWeapons', weaponSelections },
          { type: 'resolveFight', combatId: currentCombat.combatId },
        ],
        9,
        [currentCombat.combatId],
        ['declare weapons', 'resolve combat'],
      ),
    );
  }

  return actions;
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
  if ((combat.aftermathResolvedUnitIds ?? []).includes(unitId)) {
    return null;
  }

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
        case Phase.Start:
          return node.state.currentSubPhase === SubPhase.StartEffects
            ? generateStandalonePsychicActions(node, playerIndex, config)
            : [];
        case Phase.Movement:
          switch (node.state.currentSubPhase) {
            case SubPhase.Reserves:
              return generateReserveActions(node, playerIndex);
            case SubPhase.Move:
              return [
                ...generateStandalonePsychicActions(node, playerIndex, config),
                ...generateTransportActions(node, playerIndex, config),
                ...generateMoveActions(node, playerIndex, config),
              ];
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
