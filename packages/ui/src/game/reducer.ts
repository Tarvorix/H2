/**
 * Game Reducer
 *
 * Manages the complete GameUIState for a game session.
 * Handles pre-game flow (army load, terrain setup, deployment),
 * game actions (movement, shooting, assault, reactions),
 * and UI state (selection, camera, overlays, combat log, dice animation).
 *
 * All game-logic mutations flow through the engine's processCommand().
 * The reducer translates UI actions → engine commands → updated state.
 */

import type { Position, ArmyList, GameState } from '@hh/types';
import type { CommandResult } from '@hh/engine';
import { getModelInitiative, getModelMovement, canUnitShoot } from '@hh/engine';
import { checkWeaponRange, getClosestModelDistance, hasLOSToUnit, TEMPLATE_EFFECTIVE_RANGE_INCHES } from '@hh/engine';
import { findMission, getProfileById, findWeapon, findLegionWeapon, isRangedWeapon } from '@hh/data';
import type { ArmyConfig, UnitSelection } from './types';
import {
  executeCommand,
  buildMoveUnitCommand,
  buildShootingCommand,
  buildChargeCommand,
  buildReactionCommand,
  buildDeclineReactionCommand,
  buildEndPhaseCommand,
  buildEndSubPhaseCommand,
  buildDeclareChallengeCommand,
  buildSelectGambitCommand,
  buildSelectAftermathCommand,
  buildResolveFightCommand,
  buildAcceptChallengeCommand,
  buildDeclineChallengeCommand,
  buildResolveShootingCasualtiesCommand,
  eventsToLogEntries,
  extractGhostTrails,
  extractLatestDiceRoll,
} from './command-bridge';
import type {
  GameUIState,
  GameUIAction,
} from './types';
import {
  GameUIPhase,
  createInitialGameUIState,
  createDefaultDeploymentState,
} from './types';
import { rollDeploymentFirstPlayerIndex } from './deployment-order';
import {
  createObjectiveMarkerFromPlacement,
  createObjectivePlacementState,
  getFixedObjectiveCount,
  getNextObjectivePlacingPlayerIndex,
  getTotalObjectiveCount,
  rollObjectivePlacementFirstPlayerIndex,
  validateObjectivePlacement,
} from './objective-placement';
import { validateSetupDeploymentPlacement } from './deployment-rules';
import { buildSpecialShotRequirements } from './special-shots';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function screenToWorld(
  camera: { offsetX: number; offsetY: number; zoom: number },
  screenX: number,
  screenY: number,
): Position {
  return {
    x: (screenX - camera.offsetX) / camera.zoom,
    y: (screenY - camera.offsetY) / camera.zoom,
  };
}

function clampZoom(zoom: number): number {
  return Math.max(4, Math.min(40, zoom));
}

const MOVE_DISTANCE_EPSILON = 0.005;

function getDeploymentFacingRotation(
  gameState: GameState,
  playerIndex: number,
): number {
  const zone = gameState.missionState?.deploymentZones.find(
    (candidate) => candidate.playerIndex === playerIndex,
  );
  if (!zone || zone.vertices.length === 0) {
    return playerIndex === 0 ? 0 : Math.PI;
  }

  const centroid = zone.vertices.reduce(
    (acc, vertex) => ({
      x: acc.x + vertex.x,
      y: acc.y + vertex.y,
    }),
    { x: 0, y: 0 },
  );
  const zoneCenter = {
    x: centroid.x / zone.vertices.length,
    y: centroid.y / zone.vertices.length,
  };
  const battlefieldCenter = {
    x: gameState.battlefield.width / 2,
    y: gameState.battlefield.height / 2,
  };

  return Math.atan2(
    battlefieldCenter.y - zoneCenter.y,
    battlefieldCenter.x - zoneCenter.x,
  );
}

function findUnitById(
  gameState: GameState,
  unitId: string,
): GameState['armies'][number]['units'][number] | null {
  for (const army of gameState.armies) {
    for (const unit of army.units) {
      if (unit.id === unitId) return unit;
    }
  }
  return null;
}

function lookupWeapon(weaponId: string) {
  return findWeapon(weaponId) ?? findLegionWeapon(weaponId);
}

function getEffectiveWeaponRange(weapon: ReturnType<typeof lookupWeapon>): number {
  if (!weapon || !isRangedWeapon(weapon)) return 0;
  return weapon.hasTemplate ? TEMPLATE_EFFECTIVE_RANGE_INCHES : weapon.range;
}

function getRangedWeaponIdsForModel(model: GameState['armies'][number]['units'][number]['models'][number]): string[] {
  if (model.equippedWargear.length > 0) {
    return model.equippedWargear;
  }
  // Preset fallback: no explicit wargear loaded, treat as bolter-armed.
  return ['bolter'];
}

function canAnyWeaponReachTarget(
  gameState: GameState,
  attackerUnitId: string,
  targetUnitId: string,
): boolean {
  const attacker = findUnitById(gameState, attackerUnitId);
  const target = findUnitById(gameState, targetUnitId);
  if (!attacker || !target) return false;

  const aliveAttackers = attacker.models.filter(model => !model.isDestroyed);
  const aliveTargets = target.models.filter(model => !model.isDestroyed);
  if (aliveAttackers.length === 0 || aliveTargets.length === 0) return false;

  return aliveAttackers.some((attackerModel) =>
    getRangedWeaponIdsForModel(attackerModel).some((weaponId) => {
      const weapon = lookupWeapon(weaponId);
      if (!weapon || !isRangedWeapon(weapon)) return false;
      const effectiveRange = getEffectiveWeaponRange(weapon);
      if (effectiveRange <= 0) return false;
      return checkWeaponRange(attackerModel, aliveTargets, effectiveRange);
    }),
  );
}

function resolvePreparedShootingAttack(
  state: GameUIState,
  attackerUnitId: string,
  targetUnitId: string,
  weaponSelections: import('./types').WeaponSelection[],
  blastPlacements: import('@hh/types').BlastPlacement[] = [],
  templatePlacements: import('@hh/types').TemplatePlacement[] = [],
): GameUIState {
  const newState = applyEngineCommand(
    state,
    buildShootingCommand(
      attackerUnitId,
      targetUnitId,
      weaponSelections,
      blastPlacements,
      templatePlacements,
    ),
  );

  if (newState.lastErrors.length > 0) {
    return newState;
  }

  if (newState.flowState.type === 'reaction') {
    return newState;
  }

  if (newState.gameState?.shootingAttackState) {
    return {
      ...newState,
      flowState: {
        type: 'shooting',
        step: {
          step: 'showResults',
          attackerUnitId,
          targetUnitId,
          events: newState.lastCommandResult?.events ?? [],
        },
      },
    };
  }

  return {
    ...newState,
    flowState: { type: 'idle' },
    overlayVisibility: { ...newState.overlayVisibility, los: false },
  };
}

function applySetupDeploymentPlacement(
  gameState: GameState,
  unitId: string,
  modelPositions: { modelId: string; position: Position }[],
): { gameState: GameState | null; error: string | null } {
  const armyIndex = gameState.armies.findIndex(army =>
    army.units.some(unit => unit.id === unitId),
  );
  if (armyIndex < 0) {
    return {
      gameState: null,
      error: `Deployment failed: unit "${unitId}" was not found in game state.`,
    };
  }

  const army = gameState.armies[armyIndex];
  const unitIndex = army.units.findIndex(unit => unit.id === unitId);
  if (unitIndex < 0) {
    return {
      gameState: null,
      error: `Deployment failed: unit "${unitId}" index could not be resolved.`,
    };
  }

  const unit = army.units[unitIndex];
  const aliveModels = unit.models.filter(model => !model.isDestroyed);
  const positionByModelId = new Map<string, Position>();
  const deploymentFacingRotation = getDeploymentFacingRotation(gameState, army.playerIndex);

  for (const placement of modelPositions) {
    if (positionByModelId.has(placement.modelId)) {
      return {
        gameState: null,
        error: `Deployment failed: duplicate model placement for "${placement.modelId}".`,
      };
    }
    positionByModelId.set(placement.modelId, placement.position);
  }

  for (const model of aliveModels) {
    if (!positionByModelId.has(model.id)) {
      return {
        gameState: null,
        error: `Deployment failed: missing position for model "${model.id}".`,
      };
    }
  }

  if (positionByModelId.size !== aliveModels.length) {
    return {
      gameState: null,
      error: `Deployment failed: expected ${aliveModels.length} model positions, received ${positionByModelId.size}.`,
    };
  }

  const updatedModels = unit.models.map((model) => {
    const placement = positionByModelId.get(model.id);
    return placement
      ? {
          ...model,
          position: placement,
          rotationRadians: deploymentFacingRotation,
        }
      : model;
  });

  const placementValidation = validateSetupDeploymentPlacement(
    gameState,
    army.playerIndex,
    unit,
    modelPositions,
  );
  if (!placementValidation.valid) {
    return {
      gameState: null,
      error: placementValidation.error ?? 'Deployment failed: invalid placement.',
    };
  }

  const updatedUnit = {
    ...unit,
    models: updatedModels,
    isDeployed: true,
    isInReserves: false,
  };

  const updatedUnits = [...army.units];
  updatedUnits[unitIndex] = updatedUnit;

  const updatedArmies = [...gameState.armies];
  updatedArmies[armyIndex] = {
    ...army,
    units: updatedUnits,
  };

  return {
    gameState: {
      ...gameState,
      armies: updatedArmies as typeof gameState.armies,
    },
    error: null,
  };
}

function buildTranslatedUnitMovePositions(
  gameState: GameState,
  unitId: string,
  destination: Position,
  isRush: boolean,
): { modelPositions: { modelId: string; position: Position }[] | null; error: string | null } {
  for (const army of gameState.armies) {
    const unit = army.units.find(u => u.id === unitId);
    if (!unit) continue;

    const aliveModels = unit.models.filter(model => !model.isDestroyed);
    if (aliveModels.length === 0) {
      return {
        modelPositions: null,
        error: `Move failed: unit "${unitId}" has no alive models.`,
      };
    }

    const refModel = aliveModels[0];
    const maxDistance = isRush
      ? getModelMovement(refModel.unitProfileId, refModel.profileModelName) +
        getModelInitiative(refModel.unitProfileId, refModel.profileModelName)
      : getModelMovement(refModel.unitProfileId, refModel.profileModelName);

    const centroid = aliveModels.reduce(
      (acc, model) => ({
        x: acc.x + model.position.x,
        y: acc.y + model.position.y,
      }),
      { x: 0, y: 0 },
    );
    const centerX = centroid.x / aliveModels.length;
    const centerY = centroid.y / aliveModels.length;
    const dx = destination.x - centerX;
    const dy = destination.y - centerY;
    const intendedDistance = Math.sqrt(dx * dx + dy * dy);

    if (intendedDistance > maxDistance + MOVE_DISTANCE_EPSILON) {
      return {
        modelPositions: null,
        error: `Destination is out of range (${intendedDistance.toFixed(2)}" / ${maxDistance.toFixed(2)}").`,
      };
    }

    return {
      modelPositions: aliveModels.map(model => ({
        modelId: model.id,
        position: {
          x: model.position.x + dx,
          y: model.position.y + dy,
        },
      })),
      error: null,
    };
  }

  return {
    modelPositions: null,
    error: `Move failed: unit "${unitId}" was not found.`,
  };
}

/**
 * Apply an engine command to the game state.
 * Returns the updated GameUIState with new game state, log entries, ghost trails, and dice animation.
 */
function applyEngineCommand(
  state: GameUIState,
  command: import('@hh/types').GameCommand,
): GameUIState {
  if (!state.gameState) {
    return {
      ...state,
      notifications: [
        ...state.notifications,
        {
          message: `Engine command "${command.type}" dropped: game state not initialized`,
          type: 'error' as const,
          timestamp: Date.now(),
          duration: 5000,
        },
      ],
    };
  }

  const result: CommandResult = executeCommand(state.gameState, command);

  if (!result.accepted) {
    return {
      ...state,
      lastCommandResult: result,
      lastErrors: result.errors,
      notifications: [
        ...state.notifications,
        {
          message: result.errors.map(e => e.message).join('; ') || 'Command rejected',
          type: 'error' as const,
          timestamp: Date.now(),
          duration: 4000,
        },
      ],
    };
  }

  // Convert events to combat log entries
  const newLogEntries = eventsToLogEntries(result.events, result.state);

  // Extract ghost trails from movement events
  const newGhostTrails = extractGhostTrails(result.events, result.state);

  // Extract dice roll for animation
  const diceRoll = extractLatestDiceRoll(result.events);

  // Check if game is over
  const newUIPhase = result.state.isGameOver ? GameUIPhase.GameOver : state.uiPhase;

  // Check if reaction is pending — update flow state
  let flowState = state.flowState;
  if (result.state.awaitingReaction && result.state.pendingReaction) {
    flowState = {
      type: 'reaction',
      step: {
        step: 'prompt',
        pendingReaction: result.state.pendingReaction,
      },
    };
  } else if (state.flowState.type === 'reaction' && !result.state.awaitingReaction) {
    // Reaction was resolved — return to idle
    flowState = { type: 'idle' };
  }

  return {
    ...state,
    gameState: result.state,
    uiPhase: newUIPhase,
    combatLog: [...state.combatLog, ...newLogEntries],
    ghostTrails: [...state.ghostTrails, ...newGhostTrails],
    diceAnimation: diceRoll
      ? { isVisible: true, roll: diceRoll, startTime: Date.now(), duration: 6000 }
      : state.diceAnimation,
    flowState,
    lastCommandResult: result,
    lastErrors: [],
  };
}

/**
 * Preserve reaction prompt flow when the engine state still has a pending reaction.
 * This prevents chained reaction windows from being hidden by caller flow overrides.
 */
function withReactionFlowPriority(
  state: GameUIState,
  fallbackFlowState: GameUIState['flowState'],
): GameUIState {
  if (state.gameState?.awaitingReaction && state.gameState.pendingReaction) {
    return {
      ...state,
      flowState: {
        type: 'reaction',
        step: {
          step: 'prompt',
          pendingReaction: state.gameState.pendingReaction,
        },
      },
    };
  }

  return {
    ...state,
    flowState: fallbackFlowState,
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function gameReducer(
  state: GameUIState,
  action: GameUIAction,
): GameUIState {
  switch (action.type) {
    // ── Pre-Game Flow ─────────────────────────────────────────────────────
    case 'SET_UI_PHASE':
      return { ...state, uiPhase: action.phase };

    case 'SET_ARMY_CONFIG':
      return {
        ...state,
        armyConfigs: action.playerIndex === 0
          ? [action.config, state.armyConfigs[1]]
          : [state.armyConfigs[0], action.config],
      };

    case 'LOAD_PRESET_ARMY':
      return {
        ...state,
        armyConfigs: action.playerIndex === 0
          ? [action.preset.config, state.armyConfigs[1]]
          : [state.armyConfigs[0], action.preset.config],
      };

    case 'CONFIRM_ARMIES': {
      if (!state.armyConfigs[0] || !state.armyConfigs[1]) return state;
      return {
        ...state,
        uiPhase: GameUIPhase.MissionSelect,
      };
    }

    // ── Army Builder ──────────────────────────────────────────────────────
    case 'SET_ARMY_BUILDER_PLAYER':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          editingPlayerIndex: action.playerIndex,
          activeDetachmentIndex: null,
          activeSlotId: null,
        },
      };

    case 'SET_ARMY_LIST':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          armyLists: action.playerIndex === 0
            ? [action.armyList, state.armyBuilder.armyLists[1]]
            : [state.armyBuilder.armyLists[0], action.armyList],
        },
      };

    case 'SET_ARMY_VALIDATION':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          validationResults: action.playerIndex === 0
            ? [action.result, state.armyBuilder.validationResults[1]]
            : [state.armyBuilder.validationResults[0], action.result],
        },
      };

    case 'SET_ACTIVE_DETACHMENT':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          activeDetachmentIndex: action.index,
        },
      };

    case 'SET_ACTIVE_SLOT':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          activeSlotId: action.slotId,
        },
      };

    case 'SET_UNIT_SEARCH_FILTER':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          unitSearchFilter: action.filter,
        },
      };

    case 'SET_RITE_OF_WAR':
      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          selectedRiteIds: action.playerIndex === 0
            ? [action.riteId, state.armyBuilder.selectedRiteIds[1]]
            : [state.armyBuilder.selectedRiteIds[0], action.riteId],
        },
      };

    case 'CONFIRM_ARMY_BUILDER': {
      const bothBuilt = state.armyBuilder.armyLists[0] !== null && state.armyBuilder.armyLists[1] !== null;
      if (!bothBuilt) {
        return { ...state, uiPhase: GameUIPhase.ArmyLoad };
      }

      // Convert ArmyList → ArmyConfig for downstream screens
      const convertArmyListToConfig = (armyList: ArmyList, playerIndex: number): ArmyConfig => {
        const unitSelections: UnitSelection[] = [];
        for (const detachment of armyList.detachments) {
          for (const unit of detachment.units) {
            const profile = getProfileById(unit.profileId);
            unitSelections.push({
              profileId: unit.profileId,
              name: profile?.name ?? unit.profileId,
              modelCount: unit.modelCount,
              pointsCost: unit.totalPoints,
              wargearOptions: unit.selectedOptions.map(o => o.optionIndex),
              originLegion: unit.originLegion,
            });
          }
        }
        return {
          playerIndex,
          playerName: armyList.playerName,
          faction: armyList.faction,
          allegiance: armyList.allegiance,
          doctrine: armyList.doctrine,
          pointsLimit: armyList.pointsLimit,
          unitSelections,
        };
      };

      const config0 = convertArmyListToConfig(state.armyBuilder.armyLists[0]!, 0);
      const config1 = convertArmyListToConfig(state.armyBuilder.armyLists[1]!, 1);

      return {
        ...state,
        armyConfigs: [config0, config1],
        uiPhase: GameUIPhase.MissionSelect,
      };
    }

    case 'ADD_UNIT_TO_DETACHMENT': {
      const armyList = state.armyBuilder.armyLists[action.playerIndex];
      if (!armyList) return state;
      const detachment = armyList.detachments[action.detachmentIndex];
      if (!detachment) return state;

      const updatedDetachment = {
        ...detachment,
        units: [...detachment.units, action.unit],
      };
      const updatedDetachments = [...armyList.detachments];
      updatedDetachments[action.detachmentIndex] = updatedDetachment;

      const newTotalPoints = updatedDetachments.reduce(
        (sum, d) => sum + d.units.reduce((s, u) => s + u.totalPoints, 0),
        0,
      );

      const updatedArmyList: ArmyList = {
        ...armyList,
        detachments: updatedDetachments,
        totalPoints: newTotalPoints,
      };

      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          armyLists: action.playerIndex === 0
            ? [updatedArmyList, state.armyBuilder.armyLists[1]]
            : [state.armyBuilder.armyLists[0], updatedArmyList],
        },
      };
    }

    case 'REMOVE_UNIT_FROM_DETACHMENT': {
      const armyList = state.armyBuilder.armyLists[action.playerIndex];
      if (!armyList) return state;
      const detachment = armyList.detachments[action.detachmentIndex];
      if (!detachment) return state;

      const updatedDetachment = {
        ...detachment,
        units: detachment.units.filter(u => u.id !== action.unitId),
      };
      const updatedDetachments = [...armyList.detachments];
      updatedDetachments[action.detachmentIndex] = updatedDetachment;

      const newTotalPoints = updatedDetachments.reduce(
        (sum, d) => sum + d.units.reduce((s, u) => s + u.totalPoints, 0),
        0,
      );

      const updatedArmyList: ArmyList = {
        ...armyList,
        detachments: updatedDetachments,
        totalPoints: newTotalPoints,
      };

      return {
        ...state,
        armyBuilder: {
          ...state.armyBuilder,
          armyLists: action.playerIndex === 0
            ? [updatedArmyList, state.armyBuilder.armyLists[1]]
            : [state.armyBuilder.armyLists[0], updatedArmyList],
        },
      };
    }

    // ── Mission Select ────────────────────────────────────────────────────
    case 'SELECT_MISSION':
      return {
        ...state,
        missionSelect: {
          ...state.missionSelect,
          selectedMissionId: action.missionId,
        },
      };

    case 'SELECT_DEPLOYMENT_MAP':
      return {
        ...state,
        missionSelect: {
          ...state.missionSelect,
          selectedDeploymentMap: action.deploymentMap,
        },
      };

    case 'CONFIRM_MISSION': {
      if (!state.missionSelect.selectedMissionId || !state.missionSelect.selectedDeploymentMap) {
        return state;
      }
      return {
        ...state,
        missionSelect: {
          ...state.missionSelect,
          confirmed: true,
        },
        uiPhase: GameUIPhase.TerrainSetup,
      };
    }

    // ── Objective Placement ───────────────────────────────────────────────
    case 'SET_OBJECTIVE_POSITION':
      return {
        ...state,
        objectivePlacement: {
          ...state.objectivePlacement,
          pendingPosition: action.position,
        },
      };

    case 'CONFIRM_OBJECTIVE_PLACEMENT': {
      const op = state.objectivePlacement;
      if (!op.pendingPosition) return state;
      if (!state.missionSelect.selectedMissionId) return state;

      const mission = findMission(state.missionSelect.selectedMissionId);
      if (!mission) return state;

      const validation = validateObjectivePlacement(
        mission,
        state.battlefieldWidth,
        state.battlefieldHeight,
        op.placedObjectives,
        op.pendingPosition,
      );

      if (!validation.valid) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: validation.error ?? 'Objective placement is not legal for this mission.',
              type: 'warning' as const,
              timestamp: Date.now(),
              duration: 4000,
            },
          ],
        };
      }

      const newObjective = createObjectiveMarkerFromPlacement(
        mission,
        op.placedObjectives,
        op.pendingPosition,
      );

      const newPlaced = [...op.placedObjectives, newObjective];
      const nextPlayer = getNextObjectivePlacingPlayerIndex(
        mission,
        op.firstPlacingPlayerIndex,
        newPlaced.length,
      );

      return {
        ...state,
        objectivePlacement: {
          ...op,
          placedObjectives: newPlaced,
          placingPlayerIndex: nextPlayer,
          pendingPosition: null,
        },
      };
    }

    case 'UNDO_OBJECTIVE_PLACEMENT': {
      const op = state.objectivePlacement;
      if (!state.missionSelect.selectedMissionId) return state;

      const mission = findMission(state.missionSelect.selectedMissionId);
      if (!mission) return state;

      const fixedObjectiveCount = getFixedObjectiveCount(mission);
      if (op.placedObjectives.length <= fixedObjectiveCount) return state;

      const placedObjectives = op.placedObjectives.slice(0, -1);

      return {
        ...state,
        objectivePlacement: {
          ...op,
          placedObjectives,
          placingPlayerIndex: getNextObjectivePlacingPlayerIndex(
            mission,
            op.firstPlacingPlayerIndex,
            placedObjectives.length,
          ),
          pendingPosition: null,
        },
      };
    }

    case 'CONFIRM_ALL_OBJECTIVES':
      if (state.missionSelect.selectedMissionId) {
        const mission = findMission(state.missionSelect.selectedMissionId);
        if (mission && state.objectivePlacement.placedObjectives.length < getTotalObjectiveCount(mission)) {
          return state;
        }
      }
      return {
        ...state,
        uiPhase: GameUIPhase.Deployment,
        deployment: createDefaultDeploymentState(rollDeploymentFirstPlayerIndex()),
      };

    // ── Terrain Setup ─────────────────────────────────────────────────────
    case 'ADD_TERRAIN':
      return { ...state, terrain: [...state.terrain, action.terrain] };

    case 'REMOVE_TERRAIN':
      return { ...state, terrain: state.terrain.filter(t => t.id !== action.terrainId) };

    case 'CONFIRM_TERRAIN': {
      // Look up mission to determine objective placement
      const mission = state.missionSelect.selectedMissionId
        ? findMission(state.missionSelect.selectedMissionId)
        : null;

      if (mission && mission.objectivePlacement.kind === 'fixed') {
        // Fixed objectives: place them automatically, skip to Deployment
        const fixedObjectives = createObjectivePlacementState(
          mission,
          state.battlefieldWidth,
          state.battlefieldHeight,
          0,
        ).placedObjectives;
        return {
          ...state,
          objectivePlacement: {
            ...state.objectivePlacement,
            firstPlacingPlayerIndex: 0,
            placedObjectives: fixedObjectives,
            totalToPlace: fixedObjectives.length,
          },
          uiPhase: GameUIPhase.Deployment,
          deployment: createDefaultDeploymentState(rollDeploymentFirstPlayerIndex()),
        };
      }

      if (
        mission &&
        (mission.objectivePlacement.kind === 'alternating' ||
          mission.objectivePlacement.kind === 'center-fixed-alternating')
      ) {
        const firstPlacingPlayerIndex = rollObjectivePlacementFirstPlayerIndex();
        return {
          ...state,
          objectivePlacement: createObjectivePlacementState(
            mission,
            state.battlefieldWidth,
            state.battlefieldHeight,
            firstPlacingPlayerIndex,
          ),
          uiPhase: GameUIPhase.ObjectivePlacement,
        };
      }

      if (mission && mission.objectivePlacement.kind === 'symmetric') {
        const firstPlacingPlayerIndex = rollObjectivePlacementFirstPlayerIndex();
        return {
          ...state,
          objectivePlacement: {
            firstPlacingPlayerIndex,
            placingPlayerIndex: firstPlacingPlayerIndex,
            placedObjectives: [],
            totalToPlace: mission.objectivePlacement.pairsCount * 2,
            pendingPosition: null,
          },
          uiPhase: GameUIPhase.ObjectivePlacement,
        };
      }

      // Fallback: no mission or unknown kind → go to Deployment
      return {
        ...state,
        uiPhase: GameUIPhase.Deployment,
        deployment: createDefaultDeploymentState(rollDeploymentFirstPlayerIndex()),
      };
    }

    // ── Deployment ────────────────────────────────────────────────────────
    case 'SELECT_ROSTER_UNIT':
      return {
        ...state,
        deployment: {
          ...state.deployment,
          selectedRosterUnitId: action.unitId,
          pendingModelPositions: [],
        },
      };

    case 'PLACE_DEPLOYMENT_MODEL':
      return {
        ...state,
        deployment: {
          ...state.deployment,
          pendingModelPositions: [
            ...state.deployment.pendingModelPositions,
            { modelId: action.modelId, position: action.position },
          ],
        },
      };

    case 'CONFIRM_UNIT_PLACEMENT': {
      const dep = state.deployment;
      if (!dep.selectedRosterUnitId) return state;

      // During setup deployment, write placements directly into gameState.
      // Engine deployUnit is Movement/Reserves-only and rejects setup-phase placement.
      if (state.gameState) {
        const placement = applySetupDeploymentPlacement(
          state.gameState,
          dep.selectedRosterUnitId,
          dep.pendingModelPositions,
        );

        if (!placement.gameState) {
          return {
            ...state,
            notifications: [
              ...state.notifications,
              {
                message: placement.error ?? 'Deployment failed: unable to place unit.',
                type: 'error' as const,
                timestamp: Date.now(),
                duration: 5000,
              },
            ],
          };
        }

        const deployedUnitIds = dep.deployedUnitIds.includes(dep.selectedRosterUnitId)
          ? dep.deployedUnitIds
          : [...dep.deployedUnitIds, dep.selectedRosterUnitId];

        return {
          ...state,
          gameState: placement.gameState,
          deployment: {
            ...dep,
            deployedUnitIds,
            selectedRosterUnitId: null,
            pendingModelPositions: [],
          },
        };
      }

      return {
        ...state,
        deployment: {
          ...dep,
          deployedUnitIds: [...dep.deployedUnitIds, dep.selectedRosterUnitId],
          selectedRosterUnitId: null,
          pendingModelPositions: [],
        },
      };
    }

    case 'UNDO_UNIT_PLACEMENT':
      return {
        ...state,
        deployment: {
          ...state.deployment,
          pendingModelPositions: state.deployment.pendingModelPositions.slice(0, -1),
        },
      };

    case 'CONFIRM_DEPLOYMENT': {
      const dep = state.deployment;
      const deployingPlayerIndex = dep.deployingPlayerIndex as 0 | 1;
      const nextDeployingPlayerIndex = deployingPlayerIndex === 0 ? 1 : 0;
      const currentConfirmed = deployingPlayerIndex === 0 ? dep.player1Confirmed : dep.player2Confirmed;
      const otherConfirmed = deployingPlayerIndex === 0 ? dep.player2Confirmed : dep.player1Confirmed;

      if (currentConfirmed) return state;

      const nextDeploymentState = {
        ...dep,
        player1Confirmed: deployingPlayerIndex === 0 ? true : dep.player1Confirmed,
        player2Confirmed: deployingPlayerIndex === 1 ? true : dep.player2Confirmed,
        selectedRosterUnitId: null,
        pendingModelPositions: [],
      };

      if (!otherConfirmed) {
        return {
          ...state,
          deployment: {
            ...nextDeploymentState,
            deployingPlayerIndex: nextDeployingPlayerIndex,
          },
        };
      }

      // Both confirmed — transition to Playing (only if gameState is initialized)
      if (!state.gameState) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: 'Cannot start game: game state not initialized. Please re-deploy.',
              type: 'error' as const,
              timestamp: Date.now(),
              duration: 5000,
            },
          ],
        };
      }

      return {
        ...state,
        deployment: nextDeploymentState,
        uiPhase: GameUIPhase.Playing,
      };
    }

    // ── Game State Initialization ────────────────────────────────────────
    case 'INIT_GAME_STATE':
      if (state.uiPhase === GameUIPhase.Deployment && !state.gameState) {
        const firstPlayerIndex = state.deployment.deployingPlayerIndex as 0 | 1;
        return {
          ...state,
          gameState: {
            ...action.gameState,
            firstPlayerIndex,
            activePlayerIndex: firstPlayerIndex,
          },
        };
      }
      return {
        ...state,
        gameState: action.gameState,
      };

    // ── Camera / Mouse ──────────────────────────────────────────────────
    case 'SET_CAMERA':
      return { ...state, camera: { ...state.camera, ...action.camera } };

    case 'ZOOM_AT': {
      const oldZoom = state.camera.zoom;
      const zoomFactor = action.delta > 0 ? 0.9 : 1.1;
      const newZoom = clampZoom(oldZoom * zoomFactor);
      const worldX = (action.screenX - state.camera.offsetX) / oldZoom;
      const worldY = (action.screenY - state.camera.offsetY) / oldZoom;
      return {
        ...state,
        camera: {
          zoom: newZoom,
          offsetX: action.screenX - worldX * newZoom,
          offsetY: action.screenY - worldY * newZoom,
        },
      };
    }

    case 'PAN_START':
      return { ...state, isPanning: true, panStart: { x: action.screenX, y: action.screenY } };

    case 'PAN_MOVE': {
      if (!state.isPanning || !state.panStart) return state;
      const dx = action.screenX - state.panStart.x;
      const dy = action.screenY - state.panStart.y;
      return {
        ...state,
        camera: {
          ...state.camera,
          offsetX: state.camera.offsetX + dx,
          offsetY: state.camera.offsetY + dy,
        },
        panStart: { x: action.screenX, y: action.screenY },
      };
    }

    case 'PAN_END':
      return { ...state, isPanning: false, panStart: null };

    case 'MOUSE_MOVE': {
      const worldPos = screenToWorld(state.camera, action.screenX, action.screenY);
      let newState = { ...state, mouseWorldPos: worldPos };

      // Handle panning
      if (state.isPanning && state.panStart) {
        const dx = action.screenX - state.panStart.x;
        const dy = action.screenY - state.panStart.y;
        newState = {
          ...newState,
          camera: {
            ...state.camera,
            offsetX: state.camera.offsetX + dx,
            offsetY: state.camera.offsetY + dy,
          },
          panStart: { x: action.screenX, y: action.screenY },
        };
      }

      return newState;
    }

    case 'MOUSE_DOWN': {
      // Right or middle click → pan
      if (action.button === 1 || action.button === 2) {
        return {
          ...state,
          isPanning: true,
          panStart: { x: action.screenX, y: action.screenY },
        };
      }

      // Left click — handled by flow-specific logic in components
      return state;
    }

    case 'MOUSE_UP': {
      if (state.isPanning) {
        return { ...state, isPanning: false, panStart: null };
      }
      return state;
    }

    // ── Selection ───────────────────────────────────────────────────────
    case 'SELECT_UNIT':
      return { ...state, selectedUnitId: action.unitId };

    case 'HOVER_UNIT':
      return { ...state, hoveredUnitId: action.unitId };

    case 'HOVER_MODEL':
      return { ...state, hoveredModelId: action.modelId };

    // ── Movement Flow ───────────────────────────────────────────────────
    case 'START_MOVE_FLOW': {
      if (state.flowState.type !== 'idle') return state;
      if (!state.selectedUnitId) return state;
      return {
        ...state,
        flowState: {
          type: 'movement',
          step: { step: 'selectDestination', unitId: state.selectedUnitId, isRush: false },
        },
        overlayVisibility: { ...state.overlayVisibility, movement: true },
      };
    }

    case 'START_RUSH_FLOW': {
      if (state.flowState.type !== 'idle') return state;
      if (!state.selectedUnitId) return state;
      return {
        ...state,
        flowState: {
          type: 'movement',
          step: { step: 'selectDestination', unitId: state.selectedUnitId, isRush: true },
        },
        overlayVisibility: { ...state.overlayVisibility, movement: true },
      };
    }

    case 'SET_MOVE_DESTINATION': {
      if (state.flowState.type !== 'movement') return state;
      const moveStep = state.flowState.step;
      if (moveStep.step !== 'selectDestination') return state;

      if (!state.gameState) return state;
      const translatedMove = buildTranslatedUnitMovePositions(
        state.gameState,
        moveStep.unitId,
        action.position,
        moveStep.isRush,
      );
      if (!translatedMove.modelPositions) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: translatedMove.error ?? 'Move failed: unable to build unit movement.',
              type: 'error' as const,
              timestamp: Date.now(),
              duration: 4000,
            },
          ],
        };
      }

      return {
        ...state,
        flowState: {
          type: 'movement',
          step: {
            step: 'confirmMove',
            unitId: moveStep.unitId,
            modelPositions: translatedMove.modelPositions,
            isRush: moveStep.isRush,
          },
        },
      };
    }

    case 'CONFIRM_MOVE': {
      if (state.flowState.type !== 'movement') return state;
      const moveStep = state.flowState.step;
      if (moveStep.step === 'confirmMove') {
        // Execute movement atomically for normal moves and Rush moves.
        const newState = applyEngineCommand(
          state,
          buildMoveUnitCommand(moveStep.unitId, moveStep.modelPositions, moveStep.isRush),
        );
        if (newState.lastErrors.length > 0) {
          return newState;
        }
        const baseState = {
          ...newState,
          selectedUnitId: null,
          overlayVisibility: { ...newState.overlayVisibility, movement: false },
        };
        return withReactionFlowPriority(baseState, { type: 'idle' });
      }
      return state;
    }

    case 'CANCEL_MOVE':
      return {
        ...state,
        flowState: { type: 'idle' },
        overlayVisibility: { ...state.overlayVisibility, movement: false },
      };

    // ── Shooting Flow ───────────────────────────────────────────────────
    case 'START_SHOOTING_FLOW': {
      if (state.flowState.type !== 'idle') return state;
      if (!state.selectedUnitId) return state;
      if (!state.gameState) return state;

      const attacker = findUnitById(state.gameState, state.selectedUnitId);
      if (!attacker || !canUnitShoot(attacker)) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: 'Cannot start shooting: selected unit is not eligible to shoot.',
              type: 'warning' as const,
              timestamp: Date.now(),
              duration: 3000,
            },
          ],
        };
      }

      return {
        ...state,
        flowState: {
          type: 'shooting',
          step: { step: 'selectTarget', attackerUnitId: state.selectedUnitId },
        },
        overlayVisibility: { ...state.overlayVisibility, los: true },
      };
    }

    case 'SELECT_SHOOTING_TARGET': {
      if (state.flowState.type !== 'shooting') return state;
      const shootStep = state.flowState.step;
      if (shootStep.step !== 'selectTarget') return state;
      if (!state.gameState) return state;

      const hasLOS = hasLOSToUnit(state.gameState, shootStep.attackerUnitId, action.targetUnitId);
      const inRange = canAnyWeaponReachTarget(state.gameState, shootStep.attackerUnitId, action.targetUnitId);
      if (!hasLOS || !inRange) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: !hasLOS
                ? 'Cannot select target: no line of sight.'
                : 'Cannot select target: no equipped ranged weapon is currently in range.',
              type: 'warning' as const,
              timestamp: Date.now(),
              duration: 3500,
            },
          ],
        };
      }

      return {
        ...state,
        flowState: {
          type: 'shooting',
          step: {
            step: 'selectWeapons',
            attackerUnitId: shootStep.attackerUnitId,
            targetUnitId: action.targetUnitId,
            weaponSelections: [],
          },
        },
      };
    }

    case 'SET_WEAPON_SELECTION': {
      if (state.flowState.type !== 'shooting') return state;
      const shootStep = state.flowState.step;
      if (shootStep.step !== 'selectWeapons') return state;
      // Update or add weapon selection for this model
      const existing = shootStep.weaponSelections.filter(ws => ws.modelId !== action.selection.modelId);
      return {
        ...state,
        flowState: {
          type: 'shooting',
          step: {
            ...shootStep,
            weaponSelections: [...existing, action.selection],
          },
        },
      };
    }

    case 'CLEAR_WEAPON_SELECTION': {
      if (state.flowState.type !== 'shooting') return state;
      const shootStep = state.flowState.step;
      if (shootStep.step !== 'selectWeapons') return state;
      return {
        ...state,
        flowState: {
          type: 'shooting',
          step: {
            ...shootStep,
            weaponSelections: shootStep.weaponSelections.filter(ws => ws.modelId !== action.modelId),
          },
        },
      };
    }

    case 'CONFIRM_SHOOTING': {
      if (state.flowState.type !== 'shooting') return state;
      const shootStep = state.flowState.step;
      if (shootStep.step !== 'selectWeapons') return state;
      if (shootStep.weaponSelections.length === 0) return state;
      if (!state.gameState) return state;

      const requirements = buildSpecialShotRequirements(
        state.gameState,
        shootStep.attackerUnitId,
        shootStep.targetUnitId,
        shootStep.weaponSelections,
      );

      if (requirements.length > 0) {
        return {
          ...state,
          flowState: {
            type: 'shooting',
            step: {
              step: 'placeSpecial',
              attackerUnitId: shootStep.attackerUnitId,
              targetUnitId: shootStep.targetUnitId,
              weaponSelections: shootStep.weaponSelections,
              requirements,
              currentIndex: 0,
              blastPlacements: [],
              templatePlacements: [],
            },
          },
        };
      }

      return resolvePreparedShootingAttack(
        state,
        shootStep.attackerUnitId,
        shootStep.targetUnitId,
        shootStep.weaponSelections,
      );
    }

    case 'PLACE_SPECIAL_SHOT': {
      if (state.flowState.type !== 'shooting') return state;
      const shootStep = state.flowState.step;
      if (shootStep.step !== 'placeSpecial') return state;
      if (!state.gameState) return state;

      const requirement = shootStep.requirements[shootStep.currentIndex];
      if (!requirement) return state;

      if (requirement.kind === 'blast') {
        const nextBlastPlacements = [
          ...shootStep.blastPlacements,
          {
            sourceModelIds: requirement.sourceModelIds,
            position: action.position,
          },
        ];

        if (shootStep.currentIndex === shootStep.requirements.length - 1) {
          return resolvePreparedShootingAttack(
            {
              ...state,
              flowState: {
                type: 'shooting',
                step: {
                  ...shootStep,
                  blastPlacements: nextBlastPlacements,
                },
              },
            },
            shootStep.attackerUnitId,
            shootStep.targetUnitId,
            shootStep.weaponSelections,
            nextBlastPlacements,
            shootStep.templatePlacements,
          );
        }

        return {
          ...state,
          flowState: {
            type: 'shooting',
            step: {
              ...shootStep,
              currentIndex: shootStep.currentIndex + 1,
              blastPlacements: nextBlastPlacements,
            },
          },
        };
      }

      const sourceModel = state.gameState.armies
        .flatMap((army) => army.units)
        .flatMap((unit) => unit.models)
        .find((model) => model.id === requirement.sourceModelId);
      if (!sourceModel) {
        return state;
      }

      const directionRadians = Math.atan2(
        action.position.y - sourceModel.position.y,
        action.position.x - sourceModel.position.x,
      );
      const nextTemplatePlacements = [
        ...shootStep.templatePlacements,
        {
          sourceModelId: requirement.sourceModelId,
          directionRadians,
        },
      ];

      if (shootStep.currentIndex === shootStep.requirements.length - 1) {
        return resolvePreparedShootingAttack(
          {
            ...state,
            flowState: {
              type: 'shooting',
              step: {
                ...shootStep,
                templatePlacements: nextTemplatePlacements,
              },
            },
          },
          shootStep.attackerUnitId,
          shootStep.targetUnitId,
          shootStep.weaponSelections,
          shootStep.blastPlacements,
          nextTemplatePlacements,
        );
      }

      return {
        ...state,
        flowState: {
          type: 'shooting',
          step: {
            ...shootStep,
            currentIndex: shootStep.currentIndex + 1,
            templatePlacements: nextTemplatePlacements,
          },
        },
      };
    }

    case 'CANCEL_SHOOTING':
      return {
        ...state,
        flowState: { type: 'idle' },
        overlayVisibility: { ...state.overlayVisibility, los: false },
      };

    case 'RESOLVE_SHOOTING_CASUALTIES': {
      const newState = applyEngineCommand(state, buildResolveShootingCasualtiesCommand());
      return {
        ...newState,
        flowState: { type: 'idle' },
        overlayVisibility: { ...newState.overlayVisibility, los: false },
      };
    }

    // ── Assault Flow ────────────────────────────────────────────────────
    case 'START_CHARGE_FLOW': {
      if (state.flowState.type !== 'idle') return state;
      if (!state.selectedUnitId) return state;
      return {
        ...state,
        flowState: {
          type: 'assault',
          step: { step: 'selectTarget', chargingUnitId: state.selectedUnitId },
        },
      };
    }

    case 'SELECT_CHARGE_TARGET': {
      if (state.flowState.type !== 'assault') return state;
      const assaultStep = state.flowState.step;
      if (assaultStep.step !== 'selectTarget') return state;
      if (!state.gameState) return state;

      const hasLOS = hasLOSToUnit(state.gameState, assaultStep.chargingUnitId, action.targetUnitId);
      const closestDistance = getClosestModelDistance(
        state.gameState,
        assaultStep.chargingUnitId,
        action.targetUnitId,
      );
      if (!hasLOS || closestDistance > 12.001) {
        return {
          ...state,
          notifications: [
            ...state.notifications,
            {
              message: !hasLOS
                ? 'Cannot declare charge: no line of sight.'
                : `Cannot declare charge: target is ${closestDistance.toFixed(1)}" away (max 12.0").`,
              type: 'warning' as const,
              timestamp: Date.now(),
              duration: 3500,
            },
          ],
        };
      }

      return {
        ...state,
        flowState: {
          type: 'assault',
          step: {
            step: 'confirmCharge',
            chargingUnitId: assaultStep.chargingUnitId,
            targetUnitId: action.targetUnitId,
          },
        },
      };
    }

    case 'CONFIRM_CHARGE': {
      if (state.flowState.type !== 'assault') return state;
      const assaultStep = state.flowState.step;
      if (assaultStep.step !== 'confirmCharge') return state;

      const newState = applyEngineCommand(
        state,
        buildChargeCommand(assaultStep.chargingUnitId, assaultStep.targetUnitId),
      );

      if (newState.lastCommandResult && !newState.lastCommandResult.accepted) {
        return newState;
      }

      if (newState.flowState.type === 'reaction') {
        return newState;
      }

      return {
        ...newState,
        flowState: { type: 'idle' },
      };
    }

    case 'CANCEL_CHARGE':
      return { ...state, flowState: { type: 'idle' } };

    case 'RESOLVE_FIGHT': {
      const newState = applyEngineCommand(state, buildResolveFightCommand(action.combatId));
      return { ...newState, flowState: { type: 'idle' } };
    }

    case 'SELECT_AFTERMATH': {
      const newState = applyEngineCommand(
        state,
        buildSelectAftermathCommand(action.unitId, action.option),
      );
      return { ...newState, flowState: { type: 'idle' } };
    }

    // ── Reaction Flow ───────────────────────────────────────────────────
    case 'SELECT_REACTION_UNIT': {
      const newState = applyEngineCommand(
        state,
        buildReactionCommand(action.unitId, action.reactionType),
      );
      return withReactionFlowPriority(newState, { type: 'idle' });
    }

    case 'DECLINE_REACTION': {
      const newState = applyEngineCommand(state, buildDeclineReactionCommand());
      return withReactionFlowPriority(newState, { type: 'idle' });
    }

    // ── Challenge Flow ──────────────────────────────────────────────────
    case 'DECLARE_CHALLENGE': {
      const newState = applyEngineCommand(
        state,
        buildDeclareChallengeCommand(action.challengerModelId, action.targetModelId),
      );
      return newState;
    }

    case 'ACCEPT_CHALLENGE': {
      const newState = applyEngineCommand(
        state,
        buildAcceptChallengeCommand(action.modelId),
      );
      return newState;
    }

    case 'DECLINE_CHALLENGE': {
      const newState = applyEngineCommand(state, buildDeclineChallengeCommand());
      return newState;
    }

    case 'SELECT_GAMBIT': {
      const newState = applyEngineCommand(
        state,
        buildSelectGambitCommand(action.modelId, action.gambit),
      );
      return newState;
    }

    // ── Phase Control ───────────────────────────────────────────────────
    case 'END_PHASE': {
      const newState = applyEngineCommand(state, buildEndPhaseCommand());
      return {
        ...newState,
        flowState: { type: 'idle' },
        selectedUnitId: null,
        ghostTrails: [], // Clear ghost trails at phase end
      };
    }

    case 'END_SUB_PHASE': {
      const newState = applyEngineCommand(state, buildEndSubPhaseCommand());
      return {
        ...newState,
        flowState: { type: 'idle' },
      };
    }

    // ── Engine Command (direct passthrough) ─────────────────────────────
    case 'DISPATCH_ENGINE_COMMAND':
      return applyEngineCommand(state, action.command);

    // ── UI State Management ─────────────────────────────────────────────
    case 'SET_FLOW_STATE':
      return { ...state, flowState: action.flowState };

    case 'ADD_COMBAT_LOG_ENTRY':
      return { ...state, combatLog: [...state.combatLog, action.entry] };

    case 'SET_COMBAT_LOG_FILTER':
      return { ...state, combatLogFilter: action.filter };

    case 'SHOW_DICE_ANIMATION':
      return {
        ...state,
        diceAnimation: {
          isVisible: true,
          roll: action.roll,
          startTime: Date.now(),
          duration: 6000,
        },
      };

    case 'HIDE_DICE_ANIMATION':
      return {
        ...state,
        diceAnimation: { ...state.diceAnimation, isVisible: false },
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          { ...action.notification, timestamp: Date.now() },
        ],
      };

    case 'DISMISS_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.timestamp !== action.timestamp),
      };

    case 'CLEAR_GHOST_TRAILS':
      return { ...state, ghostTrails: [] };

    case 'TOGGLE_OVERLAY':
      return {
        ...state,
        overlayVisibility: {
          ...state.overlayVisibility,
          [action.overlay]: !state.overlayVisibility[action.overlay],
        },
      };

    // ── AI Opponent ────────────────────────────────────────────────────
    case 'SET_AI_CONFIG':
      return {
        ...state,
        aiConfig: action.config,
        aiDiagnostics: null,
        aiError: null,
      };

    case 'AI_TURN_START':
      return { ...state, aiThinking: true };

    case 'AI_TURN_END':
      return { ...state, aiThinking: false };

    case 'SET_AI_DIAGNOSTICS':
      return { ...state, aiDiagnostics: action.diagnostics };

    case 'SET_AI_ERROR':
      return { ...state, aiError: action.error };

    // ── Game Reset ──────────────────────────────────────────────────────
    case 'NEW_GAME':
      return createInitialGameUIState();

    case 'RETURN_TO_MENU':
      return createInitialGameUIState();

    default:
      return state;
  }
}
