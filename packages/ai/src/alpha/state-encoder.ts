import type {
  AssaultCombatState,
  GameState,
  ObjectiveMarker,
  Position,
  TerrainPiece,
  UnitState,
} from '@hh/types';
import {
  CoreReaction,
  Phase,
  SubPhase,
  TacticalStatus,
  TerrainType,
  UnitMovementState,
  VehicleFacing,
} from '@hh/types';
import {
  canModelHoldObjective,
  getAliveModels,
  getModelAttacks,
  getModelBS,
  getModelCool,
  getModelInitiative,
  getModelLeadership,
  getModelMovement,
  getModelSave,
  getModelStrength,
  getModelToughness,
  getModelWounds,
  getModelWS,
  getObjectiveController,
  getUnitLegion,
  getVehicleArmour,
  isVehicleUnit,
  lookupUnitProfile,
  unitCanUsePsychicAbilities,
} from '@hh/engine';
import type { AlphaEncodedStateToken, AlphaStateTokenType } from '../types';
import {
  estimateObjectiveRemovalSwing,
  estimateProjectedObjectiveValue,
  estimateProjectedOutgoingPressure,
  estimateUnitExposureBreakdown,
  estimateUnitStrategicValue,
  summarizeTacticalBalance,
} from '../engine/tactical-signals';
import { getUnitCentroid } from '../helpers/unit-queries';
import {
  ALPHA_MAX_STATE_TOKENS,
  ALPHA_STATE_FEATURE_DIMENSION,
  buildFeatureVector,
  buildFourierCoordinateFeatures,
  buildHashedFeatureSlice,
  clamp,
  getTokenTypeIndex,
  mean,
  safeDivide,
  tanhScaled,
  toRootRelativePosition,
} from './common';

interface SortableToken {
  token: AlphaEncodedStateToken;
  priority: number;
}

interface ValueTargets {
  value: number;
  vpDelta: number;
  tacticalSwing: number;
}

const PHASES = [Phase.Start, Phase.Movement, Phase.Shooting, Phase.Assault, Phase.End];
const SUB_PHASES = [
  SubPhase.StartEffects,
  SubPhase.Reserves,
  SubPhase.Move,
  SubPhase.Rout,
  SubPhase.Attack,
  SubPhase.ShootingMorale,
  SubPhase.Charge,
  SubPhase.Challenge,
  SubPhase.Fight,
  SubPhase.Resolution,
  SubPhase.EndEffects,
  SubPhase.Statuses,
  SubPhase.Victory,
];
const MOVEMENT_STATES = [
  UnitMovementState.Stationary,
  UnitMovementState.Moved,
  UnitMovementState.RushDeclared,
  UnitMovementState.Rushed,
  UnitMovementState.EnteredFromReserves,
  UnitMovementState.FellBack,
];
const STATUS_STATES = [
  TacticalStatus.Pinned,
  TacticalStatus.Suppressed,
  TacticalStatus.Stunned,
  TacticalStatus.Routed,
  TacticalStatus.Stupefied,
  TacticalStatus.LostToTheNails,
];
const TERRAIN_TYPES = [
  TerrainType.LightArea,
  TerrainType.MediumArea,
  TerrainType.HeavyArea,
  TerrainType.TerrainPiece,
  TerrainType.Dangerous,
  TerrainType.Difficult,
  TerrainType.Impassable,
];
const REACTION_TYPES = [
  CoreReaction.Reposition,
  CoreReaction.ReturnFire,
  CoreReaction.Overwatch,
];
const FACING_VALUES = [
  VehicleFacing.Front,
  VehicleFacing.Side,
  VehicleFacing.Rear,
];

function encodeOneHot<T extends string>(value: T | null | undefined, options: readonly T[]): number[] {
  return options.map((candidate) => Number(value === candidate));
}

function encodePosition(position: Position | null, battlefield: GameState['battlefield'], rootPlayerIndex: number): number[] {
  return buildFourierCoordinateFeatures(position, battlefield, rootPlayerIndex);
}

function normalizeTokenPosition(
  position: Position | null,
  battlefield: GameState['battlefield'],
  rootPlayerIndex: number,
): Position | null {
  return position ? toRootRelativePosition(position, battlefield, rootPlayerIndex) : null;
}

function unitRelationScore(rootPlayerIndex: number, playerIndex: number): number {
  return playerIndex === rootPlayerIndex ? 1 : -1;
}

function getObjectiveDistanceSummary(state: GameState, unit: UnitState): { nearest: number; holdStrength: number } {
  const centroid = getUnitCentroid(unit);
  const objectives = state.missionState?.objectives?.filter((objective) => !objective.isRemoved) ?? [];
  if (!centroid || objectives.length === 0) {
    return { nearest: 1, holdStrength: 0 };
  }

  let nearest = Number.POSITIVE_INFINITY;
  let holdStrength = 0;
  for (const objective of objectives) {
    const distance = Math.hypot(centroid.x - objective.position.x, centroid.y - objective.position.y);
    nearest = Math.min(nearest, distance);
    const control = getObjectiveController(state, objective);
    if (control.controllerPlayerIndex === null) continue;
    const friendlyStrength = control.controllerPlayerIndex === 0 ? control.player0Strength : control.player1Strength;
    holdStrength = Math.max(holdStrength, friendlyStrength);
  }

  const maxDistance = Math.hypot(state.battlefield.width, state.battlefield.height);
  return {
    nearest: clamp(nearest / Math.max(1, maxDistance), 0, 1),
    holdStrength: tanhScaled(holdStrength, 6),
  };
}

function getNearbyTerrainSummary(state: GameState, position: Position | null): { cover: number; density: number; nearest: number } {
  if (!position || state.terrain.length === 0) {
    return { cover: 0, density: 0, nearest: 1 };
  }

  let coverScore = 0;
  let nearest = Number.POSITIVE_INFINITY;
  let nearby = 0;

  for (const terrain of state.terrain) {
    const centroid = getTerrainPosition(terrain);
    if (!centroid) continue;
    const distance = Math.hypot(position.x - centroid.x, position.y - centroid.y);
    nearest = Math.min(nearest, distance);
    if (distance <= 8) {
      nearby += 1;
      if (terrain.type === TerrainType.MediumArea || terrain.type === TerrainType.HeavyArea) {
        coverScore += 1;
      }
      if (terrain.isDifficult || terrain.isDangerous) {
        coverScore += 0.25;
      }
    }
  }

  const maxDistance = Math.hypot(state.battlefield.width, state.battlefield.height);
  return {
    cover: tanhScaled(coverScore, 4),
    density: tanhScaled(nearby, 6),
    nearest: clamp(nearest / Math.max(1, maxDistance), 0, 1),
  };
}

function getTerrainPosition(terrain: TerrainPiece): Position | null {
  switch (terrain.shape.kind) {
    case 'circle':
      return terrain.shape.center;
    case 'rectangle':
      return {
        x: terrain.shape.topLeft.x + (terrain.shape.width / 2),
        y: terrain.shape.topLeft.y + (terrain.shape.height / 2),
      };
    case 'polygon': {
      if (terrain.shape.vertices.length === 0) return null;
      const total = terrain.shape.vertices.reduce(
        (sum, vertex) => ({ x: sum.x + vertex.x, y: sum.y + vertex.y }),
        { x: 0, y: 0 },
      );
      return {
        x: total.x / terrain.shape.vertices.length,
        y: total.y / terrain.shape.vertices.length,
      };
    }
    default:
      return null;
  }
}

function createToken(
  tokenType: AlphaStateTokenType,
  stableId: string,
  priority: number,
  position: Position | null,
  features: number[],
): SortableToken {
  return {
    priority,
    token: {
      tokenType,
      stableId,
      position,
      features: buildFeatureVector(features, ALPHA_STATE_FEATURE_DIMENSION),
    },
  };
}

function createGlobalToken(state: GameState, rootPlayerIndex: number): SortableToken {
  const enemyIndex = rootPlayerIndex === 0 ? 1 : 0;
  const friendlyArmy = state.armies[rootPlayerIndex];
  const enemyArmy = state.armies[enemyIndex];
  const values = estimateAlphaValueTargets(state, rootPlayerIndex);
  const objectiveCount = state.missionState?.objectives.filter((objective) => !objective.isRemoved).length ?? 0;
  const activeCombats = state.activeCombats?.length ?? 0;
  const pendingReaction = state.pendingReaction;
  const pendingReactionType = pendingReaction?.reactionType ?? null;
  const shootingState = state.shootingAttackState;
  const assaultState = state.assaultAttackState;

  return createToken('global', 'global', 1_000_000, null, [
    getTokenTypeIndex('global'),
    Number(state.activePlayerIndex === rootPlayerIndex),
    Number(state.awaitingReaction),
    safeDivide(state.currentBattleTurn, state.maxBattleTurns, 0),
    safeDivide(friendlyArmy.victoryPoints, 20, 0),
    safeDivide(enemyArmy.victoryPoints, 20, 0),
    tanhScaled(friendlyArmy.victoryPoints - enemyArmy.victoryPoints, 6),
    Number(state.isGameOver),
    state.winnerPlayerIndex === null ? 0 : Number(state.winnerPlayerIndex === rootPlayerIndex),
    friendlyArmy.units.length / 40,
    enemyArmy.units.length / 40,
    friendlyArmy.reactionAllotmentRemaining / Math.max(1, friendlyArmy.baseReactionAllotment),
    enemyArmy.reactionAllotmentRemaining / Math.max(1, enemyArmy.baseReactionAllotment),
    objectiveCount / 12,
    activeCombats / 12,
    Number(shootingState !== undefined),
    Number(assaultState !== undefined),
    values.value,
    values.vpDelta,
    values.tacticalSwing,
    ...encodeOneHot(state.currentPhase, PHASES),
    ...encodeOneHot(state.currentSubPhase, SUB_PHASES),
    ...encodeOneHot(pendingReactionType as CoreReaction | null, REACTION_TYPES),
    ...buildHashedFeatureSlice(String(pendingReactionType ?? 'none'), 4, 'global:reaction'),
    ...buildHashedFeatureSlice(String(shootingState?.currentStep ?? 'none'), 4, 'global:shooting-step'),
    ...buildHashedFeatureSlice(String(assaultState?.chargeStep ?? 'none'), 4, 'global:assault-step'),
    ...buildHashedFeatureSlice(state.missionState?.missionId ?? 'no-mission', 4, 'global:mission'),
  ]);
}

function createUnitToken(
  state: GameState,
  unit: UnitState,
  ownerIndex: number,
  rootPlayerIndex: number,
): SortableToken {
  const aliveModels = getAliveModels(unit);
  const representative = aliveModels[0] ?? unit.models[0] ?? null;
  const centroid = getUnitCentroid(unit);
  const objectiveSummary = getObjectiveDistanceSummary(state, unit);
  const terrainSummary = getNearbyTerrainSummary(state, centroid);
  const exposure = estimateUnitExposureBreakdown(state, ownerIndex, unit);
  const outgoingPressure = estimateProjectedOutgoingPressure(state, ownerIndex, unit, centroid ?? undefined);
  const strategicValue = estimateUnitStrategicValue(state, ownerIndex, unit);
  const projectedObjectiveValue = estimateProjectedObjectiveValue(state, ownerIndex, unit, centroid ?? undefined);
  const objectiveRemovalSwing = estimateObjectiveRemovalSwing(state, ownerIndex, unit);
  const totalModels = unit.models.length;
  const totalCurrentWounds = aliveModels.reduce((sum, model) => sum + Math.max(0, model.currentWounds), 0);
  const totalMaxWounds = aliveModels.reduce((sum, model) => sum + Math.max(1, getModelWounds(model.unitProfileId, model.profileModelName)), 0);
  const legion = getUnitLegion(state, unit.id);
  const profile = lookupUnitProfile(unit.profileId);
  const relation = unitRelationScore(rootPlayerIndex, ownerIndex);
  const canUsePsychic = unitCanUsePsychicAbilities(state, unit);
  const hasObjectiveModels = aliveModels.some((model) => canModelHoldObjective(model, unit));
  const vehicleArmour = representative ? getVehicleArmour(representative.unitProfileId, representative.profileModelName) : null;
  const nearbyEnemyDistance = centroid
    ? getClosestEnemyDistance(state, ownerIndex, unit.id, centroid)
    : Number.POSITIVE_INFINITY;
  const averagedStats = representative
    ? [
        getModelMovement(representative.unitProfileId, representative.profileModelName) / 16,
        getModelWS(representative.unitProfileId, representative.profileModelName) / 10,
        getModelBS(representative.unitProfileId, representative.profileModelName) / 10,
        getModelStrength(representative.unitProfileId, representative.profileModelName) / 10,
        getModelToughness(representative.unitProfileId, representative.profileModelName) / 10,
        getModelInitiative(representative.unitProfileId, representative.profileModelName) / 10,
        getModelAttacks(representative.unitProfileId, representative.profileModelName) / 10,
        getModelLeadership(representative.unitProfileId, representative.profileModelName) / 12,
        getModelCool(representative.unitProfileId, representative.profileModelName) / 12,
        (getModelSave(representative.unitProfileId, representative.profileModelName) ?? 7) / 7,
      ]
    : Array.from({ length: 10 }, () => 0);

  const priority = (
    (relation > 0 ? 5000 : 0) +
    (strategicValue * 100) +
    (projectedObjectiveValue * 10) +
    aliveModels.length
  );

  return createToken('unit', unit.id, priority, normalizeTokenPosition(centroid, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('unit'),
    relation,
    Number(ownerIndex === state.activePlayerIndex),
    Number(ownerIndex === (state.awaitingReaction ? (state.activePlayerIndex === 0 ? 1 : 0) : state.activePlayerIndex)),
    Number(hasObjectiveModels),
    Number(unit.isLockedInCombat),
    Number(unit.embarkedOnId !== null),
    Number(unit.isInReserves),
    Number(unit.isDeployed),
    Number(unit.hasReactedThisTurn),
    Number(unit.hasShotThisTurn === true),
    Number(canUsePsychic),
    Number(isVehicleUnit(unit)),
    aliveModels.length / Math.max(1, totalModels),
    totalModels / 20,
    safeDivide(totalCurrentWounds, totalMaxWounds, 0),
    tanhScaled(strategicValue, 25),
    tanhScaled(projectedObjectiveValue, 25),
    tanhScaled(objectiveRemovalSwing, 12),
    tanhScaled(outgoingPressure, 12),
    tanhScaled(exposure.total, 10),
    tanhScaled(exposure.ranged, 10),
    tanhScaled(exposure.melee, 10),
    objectiveSummary.nearest,
    objectiveSummary.holdStrength,
    terrainSummary.cover,
    terrainSummary.density,
    terrainSummary.nearest,
    clamp(nearbyEnemyDistance / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    ...encodeOneHot(unit.movementState, MOVEMENT_STATES),
    ...encodeOneHot(unit.statuses[0] ?? null, STATUS_STATES),
    ...STATUS_STATES.map((status) => Number(unit.statuses.includes(status))),
    ...averagedStats,
    ...encodePosition(centroid, state.battlefield, rootPlayerIndex),
    ...(vehicleArmour
      ? [
          vehicleArmour.front / 16,
          vehicleArmour.side / 16,
          vehicleArmour.rear / 16,
        ]
      : [0, 0, 0]),
    ...buildHashedFeatureSlice(unit.profileId, 4, 'unit:profile'),
    ...buildHashedFeatureSlice(profile?.battlefieldRole ?? 'unknown', 4, 'unit:role'),
    ...buildHashedFeatureSlice(state.armies[ownerIndex]?.faction ?? 'unknown', 4, 'unit:faction'),
    ...buildHashedFeatureSlice(legion ?? 'unknown', 4, 'unit:legion'),
    ...buildHashedFeatureSlice(unit.id, 4, 'unit:id'),
    ...buildHashedFeatureSlice(representative?.profileModelName ?? 'none', 2, 'unit:model-name'),
  ]);
}

function createObjectiveToken(
  state: GameState,
  objective: ObjectiveMarker,
  rootPlayerIndex: number,
): SortableToken {
  const control = getObjectiveController(state, objective);
  const friendlyStrength = rootPlayerIndex === 0 ? control.player0Strength : control.player1Strength;
  const enemyStrength = rootPlayerIndex === 0 ? control.player1Strength : control.player0Strength;
  const nearestFriendly = getNearestArmyDistance(state, rootPlayerIndex, objective.position);
  const nearestEnemy = getNearestArmyDistance(state, rootPlayerIndex === 0 ? 1 : 0, objective.position);

  return createToken('objective', objective.id, 2500 + (objective.currentVpValue * 100), normalizeTokenPosition(objective.position, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('objective'),
    Number(control.controllerPlayerIndex === rootPlayerIndex),
    Number(control.controllerPlayerIndex === (rootPlayerIndex === 0 ? 1 : 0)),
    Number(control.isContested),
    Number(objective.isRemoved),
    objective.vpValue / 6,
    objective.currentVpValue / 6,
    tanhScaled(friendlyStrength - enemyStrength, 6),
    tanhScaled(friendlyStrength, 6),
    tanhScaled(enemyStrength, 6),
    clamp(nearestFriendly / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    clamp(nearestEnemy / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    ...encodePosition(objective.position, state.battlefield, rootPlayerIndex),
    ...buildHashedFeatureSlice(objective.label, 8, 'objective:label'),
  ]);
}

function createTerrainToken(
  state: GameState,
  terrain: TerrainPiece,
  rootPlayerIndex: number,
): SortableToken {
  const position = getTerrainPosition(terrain);
  const nearestFriendly = position ? getNearestArmyDistance(state, rootPlayerIndex, position) : Number.POSITIVE_INFINITY;
  const nearestEnemy = position ? getNearestArmyDistance(state, rootPlayerIndex === 0 ? 1 : 0, position) : Number.POSITIVE_INFINITY;
  const size = getTerrainSizeEstimate(terrain, state.battlefield);
  const priority = 1000 + (size * 100) - Math.min(nearestFriendly, nearestEnemy);

  return createToken('terrain', terrain.id, priority, normalizeTokenPosition(position, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('terrain'),
    Number(terrain.isDifficult),
    Number(terrain.isDangerous),
    size,
    clamp(nearestFriendly / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    clamp(nearestEnemy / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    ...encodeOneHot(terrain.type, TERRAIN_TYPES),
    ...encodePosition(position, state.battlefield, rootPlayerIndex),
    ...buildHashedFeatureSlice(terrain.name, 6, 'terrain:name'),
  ]);
}

function createReactionContextToken(state: GameState, rootPlayerIndex: number): SortableToken | null {
  const pending = state.pendingReaction;
  if (!state.awaitingReaction || !pending) return null;

  const sourceUnit = pending.triggerSourceUnitId ? findUnit(state, pending.triggerSourceUnitId) : null;
  const sourceCentroid = sourceUnit ? getUnitCentroid(sourceUnit) : null;

  return createToken('context', `reaction:${pending.triggerSourceUnitId}`, 10_000, normalizeTokenPosition(sourceCentroid, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('context'),
    1,
    Number(pending.isAdvancedReaction),
    pending.eligibleUnitIds.length / 8,
    ...encodeOneHot(pending.reactionType as CoreReaction | null, REACTION_TYPES),
    ...encodePosition(sourceCentroid, state.battlefield, rootPlayerIndex),
    ...buildHashedFeatureSlice(pending.triggerDescription, 8, 'context:trigger'),
    ...buildHashedFeatureSlice(pending.triggerSourceUnitId, 4, 'context:trigger-unit'),
  ]);
}

function createShootingContextToken(state: GameState, rootPlayerIndex: number): SortableToken | null {
  const shooting = state.shootingAttackState;
  if (!shooting) return null;
  const attacker = findUnit(state, shooting.attackerUnitId);
  const target = findUnit(state, shooting.targetUnitId);
  const attackerCentroid = attacker ? getUnitCentroid(attacker) : null;
  const targetCentroid = target ? getUnitCentroid(target) : null;
  const distance = attackerCentroid && targetCentroid
    ? Math.hypot(attackerCentroid.x - targetCentroid.x, attackerCentroid.y - targetCentroid.y)
    : 0;

  return createToken('context', `shooting:${shooting.attackerUnitId}:${shooting.targetUnitId}`, 11_000, normalizeTokenPosition(attackerCentroid, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('context'),
    0.75,
    Number(shooting.isReturnFire),
    shooting.weaponAssignments.length / 16,
    shooting.fireGroups.length / 8,
    shooting.currentFireGroupIndex / Math.max(1, shooting.fireGroups.length),
    clamp(distance / Math.hypot(state.battlefield.width, state.battlefield.height), 0, 1),
    ...encodeOneHot(shooting.targetFacing, FACING_VALUES),
    ...buildHashedFeatureSlice(shooting.currentStep, 6, 'context:shooting-step'),
    ...buildHashedFeatureSlice(shooting.selectedTargetModelId ?? 'none', 4, 'context:shooting-target-model'),
    ...encodePosition(attackerCentroid, state.battlefield, rootPlayerIndex),
    ...encodePosition(targetCentroid, state.battlefield, rootPlayerIndex),
  ]);
}

function createAssaultContextToken(state: GameState, rootPlayerIndex: number): SortableToken | null {
  const assault = state.assaultAttackState;
  if (!assault) return null;
  const attacker = findUnit(state, assault.chargingUnitId);
  const target = findUnit(state, assault.targetUnitId);
  const attackerCentroid = attacker ? getUnitCentroid(attacker) : null;
  const targetCentroid = target ? getUnitCentroid(target) : null;

  return createToken('context', `assault:${assault.chargingUnitId}:${assault.targetUnitId}`, 11_000, normalizeTokenPosition(attackerCentroid, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('context'),
    0.5,
    Number(assault.isDisordered),
    Number(assault.chargeCompleteViaSetup),
    Number(assault.overwatchResolved),
    assault.setupMoveDistance / 18,
    assault.chargeRoll / 12,
    assault.closestDistance / 24,
    assault.modelsWithLOS.length / 20,
    ...buildHashedFeatureSlice(assault.chargeStep, 6, 'context:charge-step'),
    ...encodePosition(attackerCentroid, state.battlefield, rootPlayerIndex),
    ...encodePosition(targetCentroid, state.battlefield, rootPlayerIndex),
  ]);
}

function createCombatContextTokens(state: GameState, rootPlayerIndex: number): SortableToken[] {
  return (state.activeCombats ?? []).map((combat, index) =>
    createCombatContextToken(state, combat, rootPlayerIndex, index),
  );
}

function createCombatContextToken(
  state: GameState,
  combat: AssaultCombatState,
  rootPlayerIndex: number,
  index: number,
): SortableToken {
  const allUnitIds = [...combat.activePlayerUnitIds, ...combat.reactivePlayerUnitIds];
  const centroids = allUnitIds
    .map((unitId) => {
      const unit = findUnit(state, unitId);
      return unit ? getUnitCentroid(unit) : null;
    })
    .filter((position): position is Position => position !== null);
  const position = centroids.length === 0
    ? null
    : {
        x: mean(centroids.map((entry) => entry.x)),
        y: mean(centroids.map((entry) => entry.y)),
      };

  return createToken('context', `combat:${combat.combatId}`, 10_500 - index, normalizeTokenPosition(position, state.battlefield, rootPlayerIndex), [
    getTokenTypeIndex('context'),
    0.25,
    Number(combat.resolved),
    Number(combat.isMassacre),
    combat.activePlayerUnitIds.length / 8,
    combat.reactivePlayerUnitIds.length / 8,
    tanhScaled(combat.activePlayerCRP - combat.reactivePlayerCRP, 6),
    combat.activePlayerCasualties.length / 20,
    combat.reactivePlayerCasualties.length / 20,
    Number(combat.challengeState !== null),
    ...buildHashedFeatureSlice(combat.challengeState?.currentStep ?? 'no-challenge', 6, 'context:challenge-step'),
    ...encodePosition(position, state.battlefield, rootPlayerIndex),
  ]);
}

function getTerrainSizeEstimate(terrain: TerrainPiece, battlefield: GameState['battlefield']): number {
  switch (terrain.shape.kind) {
    case 'circle':
      return clamp((Math.PI * terrain.shape.radius * terrain.shape.radius) / (battlefield.width * battlefield.height), 0, 1);
    case 'rectangle':
      return clamp((terrain.shape.width * terrain.shape.height) / (battlefield.width * battlefield.height), 0, 1);
    case 'polygon':
      return clamp(terrain.shape.vertices.length / 16, 0, 1);
    default:
      return 0;
  }
}

function findUnit(state: GameState, unitId: string): UnitState | null {
  return state.armies.flatMap((army) => army.units).find((unit) => unit.id === unitId) ?? null;
}

function getNearestArmyDistance(state: GameState, playerIndex: number, position: Position): number {
  const units = state.armies[playerIndex]?.units ?? [];
  const distances = units
    .map((unit) => getUnitCentroid(unit))
    .filter((centroid): centroid is Position => centroid !== null)
    .map((centroid) => Math.hypot(centroid.x - position.x, centroid.y - position.y));
  return distances.length === 0 ? Math.hypot(state.battlefield.width, state.battlefield.height) : Math.min(...distances);
}

function getClosestEnemyDistance(
  state: GameState,
  ownerIndex: number,
  unitId: string,
  position: Position,
): number {
  const enemyIndex = ownerIndex === 0 ? 1 : 0;
  const distances = state.armies[enemyIndex].units
    .filter((unit) => unit.id !== unitId)
    .map((unit) => getUnitCentroid(unit))
    .filter((centroid): centroid is Position => centroid !== null)
    .map((centroid) => Math.hypot(centroid.x - position.x, centroid.y - position.y));
  return distances.length === 0 ? Math.hypot(state.battlefield.width, state.battlefield.height) : Math.min(...distances);
}

export function estimateAlphaValueTargets(state: GameState, rootPlayerIndex: number): ValueTargets {
  const enemyIndex = rootPlayerIndex === 0 ? 1 : 0;
  const tactical = summarizeTacticalBalance(state, rootPlayerIndex);
  const vpDeltaRaw = state.armies[rootPlayerIndex].victoryPoints - state.armies[enemyIndex].victoryPoints;
  const tacticalSwingRaw =
    tactical.friendly.projectedScoringSwing -
    tactical.enemy.projectedScoringSwing +
    (tactical.friendly.controlledObjectiveVp - tactical.enemy.controlledObjectiveVp) +
    (tactical.friendly.bestRangedVsHighValueTargets - tactical.enemy.bestRangedVsHighValueTargets) +
    (tactical.friendly.bestMeleeVsHighValueTargets - tactical.enemy.bestMeleeVsHighValueTargets) -
    (tactical.friendly.retaliationPressure - tactical.enemy.retaliationPressure);

  const materialBalance = state.armies[rootPlayerIndex].units.reduce(
    (total, unit) => total + estimateUnitStrategicValue(state, rootPlayerIndex, unit),
    0,
  ) - state.armies[enemyIndex].units.reduce(
    (total, unit) => total + estimateUnitStrategicValue(state, enemyIndex, unit),
    0,
  );

  const terminalBonus = state.isGameOver
    ? (state.winnerPlayerIndex === null ? 0 : (state.winnerPlayerIndex === rootPlayerIndex ? 3 : -3))
    : 0;

  const rawValue =
    (vpDeltaRaw * 0.8) +
    (tacticalSwingRaw * 0.12) +
    (materialBalance * 0.08) +
    terminalBonus;

  return {
    value: tanhScaled(rawValue, 4.5),
    vpDelta: tanhScaled(vpDeltaRaw, 6),
    tacticalSwing: tanhScaled(tacticalSwingRaw, 16),
  };
}

export function encodeAlphaState(
  state: GameState,
  rootPlayerIndex: number,
): AlphaEncodedStateToken[] {
  const tokens: SortableToken[] = [createGlobalToken(state, rootPlayerIndex)];

  for (const army of state.armies) {
    for (const unit of army.units) {
      tokens.push(createUnitToken(state, unit, army.playerIndex, rootPlayerIndex));
    }
  }

  for (const objective of state.missionState?.objectives ?? []) {
    tokens.push(createObjectiveToken(state, objective, rootPlayerIndex));
  }

  for (const terrain of state.terrain) {
    tokens.push(createTerrainToken(state, terrain, rootPlayerIndex));
  }

  const reactionContext = createReactionContextToken(state, rootPlayerIndex);
  if (reactionContext) tokens.push(reactionContext);
  const shootingContext = createShootingContextToken(state, rootPlayerIndex);
  if (shootingContext) tokens.push(shootingContext);
  const assaultContext = createAssaultContextToken(state, rootPlayerIndex);
  if (assaultContext) tokens.push(assaultContext);
  tokens.push(...createCombatContextTokens(state, rootPlayerIndex));

  const globalToken = tokens[0];
  const rest = tokens
    .slice(1)
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (left.token.tokenType !== right.token.tokenType) {
        return getTokenTypeIndex(left.token.tokenType) - getTokenTypeIndex(right.token.tokenType);
      }
      return left.token.stableId.localeCompare(right.token.stableId);
    })
    .slice(0, ALPHA_MAX_STATE_TOKENS - 1);

  return [globalToken.token, ...rest.map((entry) => entry.token)];
}
