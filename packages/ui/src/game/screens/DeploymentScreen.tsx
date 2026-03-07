/**
 * DeploymentScreen
 *
 * Allows players to deploy units into their deployment zones before the game starts.
 * The player who loses the deployment roll-off deploys all units first, then the opponent.
 * Deployment zones are 12" deep from each player's table edge.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LegionFaction, Phase, SubPhase } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, Position, TerrainPiece, MissionState, ObjectiveMarker } from '@hh/types';
import type { GameUIState, GameUIAction, ArmyConfig, MissionSelectUIState } from '../types';
import { getProfileById, findMission, findDeploymentMapByType } from '@hh/data';
import { getModelStateBaseSizeMM, getModelWounds, initializeMissionState } from '@hh/engine';
import {
  DEPLOYMENT_FORMATION_LABELS,
  type DeploymentFormationPreset,
} from './deployment-formations';
import { getDeploymentFormationSpacing } from '@hh/geometry';
import {
  buildDeploymentFormationForZone,
  getDeploymentZoneForPlayer,
  isPointInDeploymentZone,
} from '../deployment-rules';

interface DeploymentScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

type DeploymentPlacementMode = 'unit' | 'model';

/**
 * Create the initial GameState from army configs, terrain, and battlefield dimensions.
 * This is called when deployment begins — it constructs the engine-compatible state
 * so that unit placement commands can be validated.
 */
function createInitialGameState(
  armyConfigs: [ArmyConfig, ArmyConfig],
  terrain: TerrainPiece[],
  battlefieldWidth: number,
  battlefieldHeight: number,
  missionSelect: MissionSelectUIState,
  placedObjectives: ObjectiveMarker[],
  firstPlayerIndex: 0 | 1,
): GameState {
  const armies: [ArmyState, ArmyState] = [
    createArmyState(armyConfigs[0], 0),
    createArmyState(armyConfigs[1], 1),
  ];

  // Initialize mission state from mission selection data
  let missionState: MissionState | null = null;
  if (missionSelect.selectedMissionId && missionSelect.selectedDeploymentMap) {
    const mission = findMission(missionSelect.selectedMissionId);
    const deploymentMapDef = findDeploymentMapByType(missionSelect.selectedDeploymentMap);
    if (mission && deploymentMapDef) {
      missionState = initializeMissionState(
        mission,
        deploymentMapDef,
        battlefieldWidth,
        battlefieldHeight,
        placedObjectives.length > 0 ? placedObjectives : undefined,
      );
    }
  }

  return {
    gameId: `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    battlefield: { width: battlefieldWidth, height: battlefieldHeight },
    terrain,
    armies,
    currentBattleTurn: 1,
    maxBattleTurns: 4,
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

function createArmyState(config: ArmyConfig, playerIndex: number): ArmyState {
  const units: UnitState[] = config.unitSelections.map((sel, unitIdx) => {
    const profile = getProfileById(sel.profileId);
    const models: ModelState[] = [];

    if (profile && profile.modelDefinitions.length > 0) {
      // Build models from profile's model definitions
      let modelsCreated = 0;
      const totalModels = sel.modelCount;

      for (const modelDef of profile.modelDefinitions) {
        // Leader models: always 1 (if we haven't exceeded total)
        // Additional model types: fill the rest
        // Base models: use countInBase
        let count: number;
        if (modelDef.isLeader) {
          count = 1;
        } else if (modelDef.isAdditionalModelType) {
          // Additional models fill up to the total after base models
          count = Math.max(0, totalModels - modelsCreated);
        } else {
          count = Math.min(modelDef.countInBase, totalModels - modelsCreated);
        }

        for (let i = 0; i < count && modelsCreated < totalModels; i++) {
          const wounds = getModelWounds(sel.profileId, modelDef.name);
          models.push({
            id: `p${playerIndex}-u${unitIdx}-m${modelsCreated}`,
            profileModelName: modelDef.name,
            unitProfileId: sel.profileId,
            position: { x: 0, y: 0 }, // Will be set during deployment
            currentWounds: wounds,
            isDestroyed: false,
            modifiers: [],
            equippedWargear: [
              ...profile.defaultWargear,
              ...(modelDef.defaultWargear ?? []),
            ],
            isWarlord: false,
          });
          modelsCreated++;
        }
      }

      // If model definitions didn't fill all models, create the rest as the first non-leader definition
      const fillDef = profile.modelDefinitions.find(md => !md.isLeader) ?? profile.modelDefinitions[0];
      while (modelsCreated < totalModels) {
        const wounds = getModelWounds(sel.profileId, fillDef.name);
        models.push({
          id: `p${playerIndex}-u${unitIdx}-m${modelsCreated}`,
          profileModelName: fillDef.name,
          unitProfileId: sel.profileId,
          position: { x: 0, y: 0 },
          currentWounds: wounds,
          isDestroyed: false,
          modifiers: [],
          equippedWargear: [
            ...profile.defaultWargear,
            ...(fillDef.defaultWargear ?? []),
          ],
          isWarlord: false,
        });
        modelsCreated++;
      }
    } else {
      // Fallback: no profile data — create generic models
      for (let i = 0; i < sel.modelCount; i++) {
        models.push({
          id: `p${playerIndex}-u${unitIdx}-m${i}`,
          profileModelName: sel.name,
          unitProfileId: sel.profileId,
          position: { x: 0, y: 0 },
          currentWounds: 1,
          isDestroyed: false,
          modifiers: [],
          equippedWargear: [],
          isWarlord: false,
        });
      }
    }

    return {
      id: `p${playerIndex}-unit-${unitIdx}`,
      profileId: sel.profileId,
      originLegion:
        sel.originLegion ??
        (Object.values(LegionFaction).includes(config.faction as LegionFaction)
          ? (config.faction as LegionFaction)
          : undefined),
      models,
      statuses: [],
      hasReactedThisTurn: false,
      movementState: 'Stationary' as UnitState['movementState'],
      isLockedInCombat: false,
      embarkedOnId: null,
      isInReserves: false,
      isDeployed: false,
      engagedWithUnitIds: [],
      modifiers: [],
    };
  });

  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: config.playerName,
    faction: config.faction,
    allegiance: config.allegiance,
    doctrine: config.doctrine,
    units,
    totalPoints: config.unitSelections.reduce((sum, s) => sum + s.pointsCost, 0),
    pointsLimit: config.pointsLimit,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

export function DeploymentScreen({ state, dispatch, onReturnToMenu }: DeploymentScreenProps) {
  const [placementMode, setPlacementMode] = useState<DeploymentPlacementMode>('unit');
  const [formationPreset, setFormationPreset] = useState<DeploymentFormationPreset>('block');
  const [formationRotationQuarterTurns, setFormationRotationQuarterTurns] = useState(0);
  const deployment = state.deployment;
  const deployingPlayerIndex = deployment.deployingPlayerIndex;
  const deployingConfig = state.armyConfigs[deployingPlayerIndex];

  // Initialize game state on first render if not yet created
  const gameState = useMemo(() => {
    if (state.gameState) return state.gameState;
    if (!state.armyConfigs[0] || !state.armyConfigs[1]) return null;
    return createInitialGameState(
      state.armyConfigs as [ArmyConfig, ArmyConfig],
      state.terrain,
      state.battlefieldWidth,
      state.battlefieldHeight,
      state.missionSelect,
      state.objectivePlacement.placedObjectives,
      state.deployment.deployingPlayerIndex as 0 | 1,
    );
  }, [state.gameState, state.armyConfigs, state.terrain, state.battlefieldWidth, state.battlefieldHeight, state.missionSelect, state.objectivePlacement.placedObjectives, state.deployment.deployingPlayerIndex]);

  // Persist the locally-created gameState into the global reducer state
  useEffect(() => {
    if (!state.gameState && gameState) {
      dispatch({ type: 'INIT_GAME_STATE', gameState });
    }
  }, [state.gameState, gameState, dispatch]);

  // Get units for the deploying player
  const deployingArmy: ArmyState | undefined = gameState?.armies[deployingPlayerIndex];
  const allUnits: UnitState[] = deployingArmy?.units ?? [];
  const unitsToPlace = allUnits.filter(
    (u: UnitState) => !deployment.deployedUnitIds.includes(u.id) && u.id !== deployment.selectedRosterUnitId,
  );
  const deployedUnits = allUnits.filter(
    (u: UnitState) => deployment.deployedUnitIds.includes(u.id),
  );

  // Currently placing unit
  const placingUnit = allUnits.find(
    (u: UnitState) => u.id === deployment.selectedRosterUnitId,
  );
  const modelsLeftToPlace = placingUnit
    ? placingUnit.models.length - deployment.pendingModelPositions.length
    : 0;

  const deploymentZone = getDeploymentZoneForPlayer(gameState, deployingPlayerIndex);
  const deploymentMap = gameState?.missionState?.deploymentMap ?? state.missionSelect.selectedDeploymentMap;
  const formationSpacingInches = useMemo(() => {
    if (!placingUnit) return undefined;
    return getDeploymentFormationSpacing(
      placingUnit.models
        .filter((model) => !model.isDestroyed)
        .map((model) => getModelStateBaseSizeMM(model)),
    );
  }, [placingUnit]);

  const handleSelectUnit = useCallback(
    (unitId: string) => {
      dispatch({ type: 'SELECT_ROSTER_UNIT', unitId });
    },
    [dispatch],
  );

  const handlePlaceModel = useCallback(
    (position: Position) => {
      if (!placingUnit) return;
      const nextModelIndex = deployment.pendingModelPositions.length;
      if (nextModelIndex >= placingUnit.models.length) return;
      const model = placingUnit.models[nextModelIndex];

      if (!deploymentZone || !isPointInDeploymentZone(position, deploymentZone)) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          notification: {
            message: 'Model must be placed inside your mission deployment zone.',
            type: 'warning',
            duration: 3000,
          },
        });
        return;
      }

      dispatch({
        type: 'PLACE_DEPLOYMENT_MODEL',
        modelId: model.id,
        position,
      });
    },
    [dispatch, deployment.pendingModelPositions.length, deploymentZone, placingUnit],
  );

  const handleConfirmPlacement = useCallback(() => {
    if (!placingUnit) return;
    if (deployment.pendingModelPositions.length < placingUnit.models.length) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        notification: {
          message: `Place all ${placingUnit.models.length} models before confirming`,
          type: 'warning',
          duration: 3000,
        },
      });
      return;
    }
    dispatch({ type: 'CONFIRM_UNIT_PLACEMENT' });
  }, [dispatch, placingUnit, deployment.pendingModelPositions.length]);

  const handleUndoLastModel = useCallback(() => {
    dispatch({ type: 'UNDO_UNIT_PLACEMENT' });
  }, [dispatch]);

  const handleConfirmDeployment = useCallback(() => {
    dispatch({ type: 'CONFIRM_DEPLOYMENT' });
  }, [dispatch]);

  const handleBattlefieldClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placingUnit) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickXPct = (e.clientX - rect.left) / rect.width;
      const clickYPct = (e.clientY - rect.top) / rect.height;
      const worldX = clickXPct * state.battlefieldWidth;
      const worldY = clickYPct * state.battlefieldHeight;
      const clickedPosition = { x: Math.round(worldX * 10) / 10, y: Math.round(worldY * 10) / 10 };

      if (placementMode === 'unit') {
        if (!deploymentZone || !deploymentMap) {
          dispatch({
            type: 'ADD_NOTIFICATION',
            notification: {
              message: 'Deployment zone is not initialized for this mission.',
              type: 'error',
              duration: 3000,
            },
          });
          return;
        }

        const formation = buildDeploymentFormationForZone(
          placingUnit.models.length,
          clickedPosition,
          deploymentMap,
          deployingPlayerIndex,
          state.battlefieldWidth,
          state.battlefieldHeight,
          deploymentZone,
          formationPreset,
          {
            spacingInches: formationSpacingInches,
            rotationQuarterTurns: formationRotationQuarterTurns,
          },
        );
        const allInZone = formation.every((position) => isPointInDeploymentZone(position, deploymentZone));
        if (!allInZone) {
          dispatch({
            type: 'ADD_NOTIFICATION',
            notification: {
              message: 'That formation does not fit inside the current deployment zone. Try clicking deeper into the zone or place models one-by-one.',
              type: 'warning',
              duration: 4000,
            },
          });
          return;
        }
        // Re-selecting the same unit clears pending model positions for re-placement.
        dispatch({ type: 'SELECT_ROSTER_UNIT', unitId: placingUnit.id });
        for (let i = 0; i < placingUnit.models.length; i++) {
          dispatch({
            type: 'PLACE_DEPLOYMENT_MODEL',
            modelId: placingUnit.models[i].id,
            position: formation[i],
          });
        }
        return;
      }

      handlePlaceModel(clickedPosition);
    },
    [
      placingUnit,
      placementMode,
      formationPreset,
      formationRotationQuarterTurns,
      formationSpacingInches,
      deploymentZone,
      deploymentMap,
      deployingPlayerIndex,
      dispatch,
      handlePlaceModel,
      state.battlefieldWidth,
      state.battlefieldHeight,
    ],
  );

  const allPlaced = unitsToPlace.length === 0 && !placingUnit;
  const firstDeployingPlayerIndex = gameState?.firstPlayerIndex ?? (state.deployment.deployingPlayerIndex as 0 | 1);
  const firstDeployingConfig = state.armyConfigs[firstDeployingPlayerIndex];
  const firstDeployingLabel = firstDeployingConfig
    ? `${firstDeployingConfig.playerName} (${firstDeployingConfig.faction})`
    : `Player ${firstDeployingPlayerIndex + 1}`;
  const playerLabel = deployingConfig
    ? `${deployingConfig.playerName} (${deployingConfig.faction})`
    : `Player ${deployingPlayerIndex + 1}`;
  const confirmedDeploymentCount = Number(deployment.player1Confirmed) + Number(deployment.player2Confirmed);
  const nextDeployingPlayerIndex = deployingPlayerIndex === 0 ? 1 : 0;
  const nextDeployingConfig = state.armyConfigs[nextDeployingPlayerIndex];
  const nextDeployingLabel = nextDeployingConfig
    ? nextDeployingConfig.playerName
    : `Player ${nextDeployingPlayerIndex + 1}`;
  const confirmedPlayerIndex = deployment.player1Confirmed !== deployment.player2Confirmed
    ? (deployment.player1Confirmed ? 0 : 1)
    : null;
  const confirmedPlayerConfig = confirmedPlayerIndex !== null ? state.armyConfigs[confirmedPlayerIndex] : null;
  const confirmedPlayerLabel = confirmedPlayerConfig
    ? confirmedPlayerConfig.playerName
    : (confirmedPlayerIndex !== null ? `Player ${confirmedPlayerIndex + 1}` : null);

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1 className="setup-title">Unit Deployment</h1>
        <p className="setup-subtitle">
          {playerLabel} — Place your units in the deployment zone
        </p>
        <p className="setup-subtitle" style={{ fontSize: 13, color: '#94a3b8' }}>
          Deployment roll-off: {firstDeployingLabel} deploys first and takes turn 1.
        </p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content deployment-content">
        {/* Unit Roster */}
        <div className="deployment-roster">
          <div className="panel-section">
            <div className="panel-title">
              Units to Deploy ({unitsToPlace.length} remaining)
            </div>
            {unitsToPlace.length === 0 && !placingUnit ? (
              <div className="panel-row">
                <span className="panel-row-label">All units deployed</span>
              </div>
            ) : (
              unitsToPlace.map(unit => (
                <button
                  key={unit.id}
                  className={`deployment-unit-btn ${deployment.selectedRosterUnitId === unit.id ? 'active' : ''}`}
                  onClick={() => handleSelectUnit(unit.id)}
                >
                  <div className="deployment-unit-name">{unit.profileId}</div>
                  <div className="deployment-unit-info">
                    {unit.models.length} models
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Currently Placing */}
          {placingUnit && (
            <div className="panel-section">
              <div className="panel-title">Placing: {placingUnit.profileId}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="toolbar-btn"
                  onClick={() => setPlacementMode('unit')}
                  style={placementMode === 'unit' ? { outline: '1px solid #22c55e' } : undefined}
                >
                  Place Whole Unit
                </button>
                <button
                  className="toolbar-btn"
                  onClick={() => setPlacementMode('model')}
                  style={placementMode === 'model' ? { outline: '1px solid #22c55e' } : undefined}
                >
                  Place Models One-by-One
                </button>
              </div>
              {placementMode === 'unit' && (
                <div style={{ marginBottom: 8 }}>
                  <div className="panel-row" style={{ marginBottom: 6 }}>
                    <span className="panel-row-label">Formation</span>
                    <span className="panel-row-value">{DEPLOYMENT_FORMATION_LABELS[formationPreset]}</span>
                  </div>
                  <div className="panel-row" style={{ marginBottom: 6 }}>
                    <span className="panel-row-label">Rotation</span>
                    <span className="panel-row-value">{formationRotationQuarterTurns * 90}°</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(Object.keys(DEPLOYMENT_FORMATION_LABELS) as DeploymentFormationPreset[]).map((preset) => (
                      <button
                        key={preset}
                        className="toolbar-btn"
                        onClick={() => setFormationPreset(preset)}
                        style={formationPreset === preset ? { outline: '1px solid #22c55e' } : undefined}
                      >
                        {DEPLOYMENT_FORMATION_LABELS[preset]}
                      </button>
                    ))}
                    <button
                      className="toolbar-btn"
                      onClick={() => setFormationRotationQuarterTurns((current) => (current + 1) % 4)}
                    >
                      Rotate 90°
                    </button>
                  </div>
                </div>
              )}
              <div className="panel-row">
                <span className="panel-row-label">Models placed</span>
                <span className="panel-row-value">
                  {deployment.pendingModelPositions.length} / {placingUnit.models.length}
                </span>
              </div>
              {deployment.pendingModelPositions.map((mp, i) => (
                <div key={i} className="panel-row">
                  <span className="panel-row-label">Model {i + 1}</span>
                  <span className="panel-row-value">
                    ({mp.position.x.toFixed(1)}", {mp.position.y.toFixed(1)}")
                  </span>
                </div>
              ))}
              {modelsLeftToPlace > 0 && (
                <div className="panel-row">
                  <span className="panel-row-label" style={{ color: '#fbbf24' }}>
                    {placementMode === 'unit'
                      ? `Click battlefield to place full unit formation (${DEPLOYMENT_FORMATION_LABELS[formationPreset]}, ${formationRotationQuarterTurns * 90}°)`
                      : 'Click battlefield to place next model'}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {deployment.pendingModelPositions.length > 0 && (
                  <button className="toolbar-btn" onClick={handleUndoLastModel}>
                    Undo Last
                  </button>
                )}
                {deployment.pendingModelPositions.length === placingUnit.models.length && (
                  <button className="toolbar-btn" onClick={handleConfirmPlacement} style={{ flex: 1 }}>
                    Confirm Placement
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Deployed Units */}
          {deployedUnits.length > 0 && (
            <div className="panel-section">
              <div className="panel-title">Deployed ({deployedUnits.length})</div>
              {deployedUnits.map(unit => (
                <div key={unit.id} className="terrain-list-item">
                  <div>
                    <span className="terrain-name">{unit.profileId}</span>
                    <span className="terrain-type"> ({unit.models.length} models)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Battlefield Preview with Deployment Zones */}
        <div className="deployment-battlefield">
          <div
            className="deployment-battlefield-map"
            style={{
              width: '100%',
              aspectRatio: `${state.battlefieldWidth} / ${state.battlefieldHeight}`,
              background: '#1a2636',
              border: '1px solid #2a4a6f',
              borderRadius: 4,
              position: 'relative',
              overflow: 'hidden',
              cursor: placingUnit ? 'crosshair' : 'default',
            }}
            onClick={handleBattlefieldClick}
          >
            {gameState?.missionState?.deploymentZones && (
              <svg
                viewBox={`0 0 ${state.battlefieldWidth} ${state.battlefieldHeight}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                }}
                preserveAspectRatio="none"
              >
                {gameState.missionState.deploymentZones.map((zone) => {
                  const points = zone.vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ');
                  const isActiveZone = zone.playerIndex === deployingPlayerIndex;
                  const fill = zone.playerIndex === 0
                    ? (isActiveZone ? 'rgba(59, 130, 246, 0.16)' : 'rgba(59, 130, 246, 0.06)')
                    : (isActiveZone ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.06)');
                  const stroke = zone.playerIndex === 0
                    ? 'rgba(96, 165, 250, 0.55)'
                    : 'rgba(248, 113, 113, 0.55)';
                  const centroid = zone.vertices.reduce(
                    (acc, vertex) => ({ x: acc.x + vertex.x, y: acc.y + vertex.y }),
                    { x: 0, y: 0 },
                  );
                  const labelX = centroid.x / zone.vertices.length;
                  const labelY = centroid.y / zone.vertices.length;

                  return (
                    <g key={`deployment-zone-${zone.playerIndex}`}>
                      <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeDasharray="1.25 0.75"
                        strokeWidth={0.2}
                      />
                      <text
                        x={labelX}
                        y={labelY}
                        fill={zone.playerIndex === 0 ? '#60a5fa' : '#f87171'}
                        fontSize="1.3"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        opacity={0.9}
                      >
                        {`Player ${zone.playerIndex + 1} Zone`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Terrain pieces */}
            {state.terrain.map(t => {
              if (t.shape.kind === 'rectangle') {
                const xPct = (t.shape.topLeft.x / state.battlefieldWidth) * 100;
                const yPct = (t.shape.topLeft.y / state.battlefieldHeight) * 100;
                const wPct = (t.shape.width / state.battlefieldWidth) * 100;
                const hPct = (t.shape.height / state.battlefieldHeight) * 100;
                return (
                  <div
                    key={t.id}
                    style={{
                      position: 'absolute',
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${wPct}%`,
                      height: `${hPct}%`,
                      background: 'rgba(148,163,184,0.15)',
                      border: '1px solid rgba(148,163,184,0.3)',
                      borderRadius: 2,
                      fontSize: 7,
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    {t.name}
                  </div>
                );
              }
              if (t.shape.kind === 'circle') {
                const xPct = ((t.shape.center.x - t.shape.radius) / state.battlefieldWidth) * 100;
                const yPct = ((t.shape.center.y - t.shape.radius) / state.battlefieldHeight) * 100;
                const dPct = (t.shape.radius * 2 / state.battlefieldWidth) * 100;
                const hPct = (t.shape.radius * 2 / state.battlefieldHeight) * 100;
                return (
                  <div
                    key={t.id}
                    style={{
                      position: 'absolute',
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${dPct}%`,
                      height: `${hPct}%`,
                      background: 'rgba(148,163,184,0.15)',
                      border: '1px solid rgba(148,163,184,0.3)',
                      borderRadius: '50%',
                      fontSize: 7,
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    {t.name}
                  </div>
                );
              }
              return null;
            })}

            {/* Placed model markers */}
            {deployment.pendingModelPositions.map((mp, i) => {
              const xPct = (mp.position.x / state.battlefieldWidth) * 100;
              const yPct = (mp.position.y / state.battlefieldHeight) * 100;
              return (
                <div
                  key={mp.modelId}
                  style={{
                    position: 'absolute',
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    marginTop: -4,
                    borderRadius: '50%',
                    background: deployingPlayerIndex === 0 ? '#3b82f6' : '#ef4444',
                    border: '1px solid rgba(255,255,255,0.5)',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                  title={`Model ${i + 1} at (${mp.position.x.toFixed(1)}", ${mp.position.y.toFixed(1)}")`}
                />
              );
            })}

            {/* Previously deployed unit model markers are shown through the engine's GameState */}
          </div>
        </div>
      </div>

      <div className="setup-footer">
        {confirmedPlayerLabel && confirmedDeploymentCount === 1 && (
          <div style={{ color: '#22c55e', fontSize: 12, marginBottom: 8 }}>
            {confirmedPlayerLabel} deployment confirmed
          </div>
        )}
        <button
          className={`setup-confirm-btn ${allPlaced ? '' : 'disabled'}`}
          disabled={!allPlaced}
          onClick={handleConfirmDeployment}
        >
          {allPlaced
            ? confirmedDeploymentCount === 0
              ? `Confirm Deployment → ${nextDeployingLabel} Deploys`
              : 'Confirm Deployment → Begin Battle!'
            : `Deploy all units (${unitsToPlace.length + (placingUnit ? 1 : 0)} remaining)`
          }
        </button>
      </div>
    </div>
  );
}
