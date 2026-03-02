import type {
  Allegiance,
  ArmyFaction,
  ArmyDoctrine,
  ArmyState,
  GameState,
  ModelState,
  ObjectiveMarker,
  Position,
  UnitState,
} from '@hh/types';
import { LegionFaction, Phase, SubPhase, UnitMovementState } from '@hh/types';
import {
  STANDARD_BATTLEFIELD_HEIGHT,
  STANDARD_BATTLEFIELD_WIDTH,
  STANDARD_GAME_LENGTH,
  findDeploymentMapByType,
  findMission,
  getProfileById,
} from '@hh/data';
import { getModelWounds, initializeMissionState } from '@hh/engine';

export interface HeadlessUnitSetup {
  profileId: string;
  modelCount?: number;
  unitId?: string;
  isWarlord?: boolean;
  originLegion?: LegionFaction;
  modelPositions?: Position[];
  isInReserves?: boolean;
  isDeployed?: boolean;
}

export interface HeadlessArmySetup {
  playerName: string;
  faction: ArmyFaction;
  allegiance: Allegiance;
  doctrine?: ArmyDoctrine;
  units: HeadlessUnitSetup[];
  pointsLimit?: number;
  baseReactionAllotment?: number;
}

export interface HeadlessGameSetupOptions {
  missionId: string;
  armies: [HeadlessArmySetup, HeadlessArmySetup];
  objectives?: ObjectiveMarker[];
  gameId?: string;
  battlefieldWidth?: number;
  battlefieldHeight?: number;
  maxBattleTurns?: number;
  firstPlayerIndex?: 0 | 1;
}

function buildDefaultModelPositions(
  playerIndex: number,
  modelCount: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): Position[] {
  const positions: Position[] = [];
  const y = playerIndex === 0 ? 6 : battlefieldHeight - 6;
  const startX = playerIndex === 0 ? 6 : battlefieldWidth - 6;
  const direction = playerIndex === 0 ? 1 : -1;
  const spacing = 2;

  for (let i = 0; i < modelCount; i++) {
    positions.push({
      x: startX + direction * spacing * i,
      y,
    });
  }

  return positions;
}

function createUnitModels(
  unitSetup: HeadlessUnitSetup,
  playerIndex: number,
  unitIndex: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): ModelState[] {
  const profile = getProfileById(unitSetup.profileId);
  if (!profile) {
    throw new Error(`Unknown unit profile "${unitSetup.profileId}" in headless setup.`);
  }

  const modelCount = unitSetup.modelCount ?? profile.minModels;
  if (modelCount < profile.minModels || modelCount > profile.maxModels) {
    throw new Error(
      `Invalid modelCount ${modelCount} for "${unitSetup.profileId}" (allowed ${profile.minModels}-${profile.maxModels}).`,
    );
  }

  const explicitPositions = unitSetup.modelPositions;
  if (explicitPositions && explicitPositions.length !== modelCount) {
    throw new Error(
      `Model positions length (${explicitPositions.length}) must match modelCount (${modelCount}) for "${unitSetup.profileId}".`,
    );
  }

  const defaultPositions = buildDefaultModelPositions(
    playerIndex,
    modelCount,
    battlefieldWidth,
    battlefieldHeight,
  );

  const models: ModelState[] = [];
  let modelsCreated = 0;

  for (const modelDef of profile.modelDefinitions) {
    let count: number;
    if (modelDef.isLeader) {
      count = 1;
    } else if (modelDef.isAdditionalModelType) {
      count = Math.max(0, modelCount - modelsCreated);
    } else {
      count = Math.min(modelDef.countInBase, modelCount - modelsCreated);
    }

    for (let i = 0; i < count && modelsCreated < modelCount; i++) {
      const id = `p${playerIndex}-u${unitIndex}-m${modelsCreated}`;
      const wounds = getModelWounds(profile.id, modelDef.name);
      const position = explicitPositions?.[modelsCreated] ?? defaultPositions[modelsCreated];

      models.push({
        id,
        profileModelName: modelDef.name,
        unitProfileId: profile.id,
        position,
        currentWounds: wounds,
        isDestroyed: false,
        modifiers: [],
        equippedWargear: [...profile.defaultWargear, ...(modelDef.defaultWargear ?? [])],
        isWarlord: unitSetup.isWarlord === true && modelsCreated === 0,
      });

      modelsCreated++;
    }
  }

  const fillDef = profile.modelDefinitions.find((md) => !md.isLeader) ?? profile.modelDefinitions[0];
  while (modelsCreated < modelCount) {
    const id = `p${playerIndex}-u${unitIndex}-m${modelsCreated}`;
    const wounds = getModelWounds(profile.id, fillDef.name);
    const position = explicitPositions?.[modelsCreated] ?? defaultPositions[modelsCreated];

    models.push({
      id,
      profileModelName: fillDef.name,
      unitProfileId: profile.id,
      position,
      currentWounds: wounds,
      isDestroyed: false,
      modifiers: [],
      equippedWargear: [...profile.defaultWargear, ...(fillDef.defaultWargear ?? [])],
      isWarlord: unitSetup.isWarlord === true && modelsCreated === 0,
    });

    modelsCreated++;
  }

  return models;
}

function estimateUnitPoints(profileId: string, modelCount: number): number {
  const profile = getProfileById(profileId);
  if (!profile) return 0;
  const additional = Math.max(0, modelCount - profile.minModels);
  return profile.basePoints + additional * profile.pointsPerAdditionalModel;
}

function createArmyState(
  setup: HeadlessArmySetup,
  playerIndex: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
): ArmyState {
  const units: UnitState[] = setup.units.map((unitSetup, unitIndex) => {
    const profile = getProfileById(unitSetup.profileId);
    if (!profile) {
      throw new Error(`Unknown unit profile "${unitSetup.profileId}" in headless setup.`);
    }

    const models = createUnitModels(
      unitSetup,
      playerIndex,
      unitIndex,
      battlefieldWidth,
      battlefieldHeight,
    );

    return {
      id: unitSetup.unitId ?? `p${playerIndex}-unit-${unitIndex}`,
      profileId: unitSetup.profileId,
      originLegion:
        unitSetup.originLegion ??
        (Object.values(LegionFaction).includes(setup.faction as LegionFaction)
          ? (setup.faction as LegionFaction)
          : undefined),
      models,
      statuses: [],
      hasReactedThisTurn: false,
      movementState: UnitMovementState.Stationary,
      isLockedInCombat: false,
      embarkedOnId: null,
      isInReserves: unitSetup.isInReserves ?? false,
      isDeployed: unitSetup.isDeployed ?? true,
      engagedWithUnitIds: [],
      modifiers: [],
    };
  });

  const totalPoints = setup.units.reduce((sum, unit) => {
    const profile = getProfileById(unit.profileId);
    const modelCount = unit.modelCount ?? profile?.minModels ?? 1;
    return sum + estimateUnitPoints(unit.profileId, modelCount);
  }, 0);

  const baseReactionAllotment = setup.baseReactionAllotment ?? 1;

  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: setup.playerName,
    faction: setup.faction,
    allegiance: setup.allegiance,
    doctrine: setup.doctrine,
    units,
    totalPoints,
    pointsLimit: setup.pointsLimit ?? totalPoints,
    reactionAllotmentRemaining: baseReactionAllotment,
    baseReactionAllotment,
    victoryPoints: 0,
  };
}

function generateGameId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `headless-${Date.now()}-${random}`;
}

function defaultObjectivesForMission(
  missionId: string,
  battlefieldWidth: number,
  battlefieldHeight: number,
): ObjectiveMarker[] | undefined {
  if (missionId === 'crucible-of-war') {
    return [
      { id: 'obj-0', position: { x: 18, y: 16 }, vpValue: 2, currentVpValue: 2, isRemoved: false, label: 'Objective A' },
      { id: 'obj-1', position: { x: 54, y: 16 }, vpValue: 2, currentVpValue: 2, isRemoved: false, label: 'Objective B' },
      { id: 'obj-2', position: { x: 18, y: 32 }, vpValue: 2, currentVpValue: 2, isRemoved: false, label: 'Objective C' },
      { id: 'obj-3', position: { x: 54, y: 32 }, vpValue: 2, currentVpValue: 2, isRemoved: false, label: 'Objective D' },
    ];
  }

  if (missionId === 'take-and-hold') {
    const halfSeparation = 9;
    return [
      {
        id: 'obj-0',
        position: { x: battlefieldWidth / 2 - halfSeparation, y: battlefieldHeight / 2 },
        vpValue: 3,
        currentVpValue: 3,
        isRemoved: false,
        label: 'Midfield West',
      },
      {
        id: 'obj-1',
        position: { x: battlefieldWidth / 2 + halfSeparation, y: battlefieldHeight / 2 },
        vpValue: 3,
        currentVpValue: 3,
        isRemoved: false,
        label: 'Midfield East',
      },
    ];
  }

  return undefined;
}

/**
 * Build a fully initialized headless `GameState`, including mission setup.
 * This is UI-independent and intended for test scenarios and CLI workflows.
 */
export function createHeadlessGameState(options: HeadlessGameSetupOptions): GameState {
  const battlefieldWidth = options.battlefieldWidth ?? STANDARD_BATTLEFIELD_WIDTH;
  const battlefieldHeight = options.battlefieldHeight ?? STANDARD_BATTLEFIELD_HEIGHT;
  const maxBattleTurns = options.maxBattleTurns ?? STANDARD_GAME_LENGTH;
  const firstPlayerIndex = options.firstPlayerIndex ?? 0;

  const mission = findMission(options.missionId);
  if (!mission) {
    throw new Error(`Unknown mission "${options.missionId}" in headless setup.`);
  }

  const deploymentMapDef = findDeploymentMapByType(mission.deploymentMap);
  if (!deploymentMapDef) {
    throw new Error(
      `No deployment map definition found for mission "${options.missionId}" (${mission.deploymentMap}).`,
    );
  }

  const objectiveOverrides =
    options.objectives ?? defaultObjectivesForMission(options.missionId, battlefieldWidth, battlefieldHeight);

  const missionState = initializeMissionState(
    mission,
    deploymentMapDef,
    battlefieldWidth,
    battlefieldHeight,
    objectiveOverrides,
  );

  const armies: [ArmyState, ArmyState] = [
    createArmyState(options.armies[0], 0, battlefieldWidth, battlefieldHeight),
    createArmyState(options.armies[1], 1, battlefieldWidth, battlefieldHeight),
  ];

  return {
    gameId: options.gameId ?? generateGameId(),
    battlefield: { width: battlefieldWidth, height: battlefieldHeight },
    terrain: [],
    armies,
    currentBattleTurn: 1,
    maxBattleTurns,
    activePlayerIndex: firstPlayerIndex,
    firstPlayerIndex,
    currentPhase: Phase.Start,
    currentSubPhase: SubPhase.StartEffects,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
    missionState,
  };
}
