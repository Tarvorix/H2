/**
 * DeploymentScreen
 *
 * Allows players to deploy units into their deployment zones before the game starts.
 * Player 1 deploys all units first, then Player 2.
 * Deployment zones are 12" deep from each player's table edge.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { Phase, SubPhase } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, Position, TerrainPiece, MissionState, ObjectiveMarker } from '@hh/types';
import type { GameUIState, GameUIAction, ArmyConfig, MissionSelectUIState } from '../types';
import { getProfileById, findMission, findDeploymentMapByType } from '@hh/data';
import { getModelWounds, initializeMissionState } from '@hh/engine';

interface DeploymentScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

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
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
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
    units,
    totalPoints: config.unitSelections.reduce((sum, s) => sum + s.pointsCost, 0),
    pointsLimit: config.pointsLimit,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

export function DeploymentScreen({ state, dispatch, onReturnToMenu }: DeploymentScreenProps) {
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
    );
  }, [state.gameState, state.armyConfigs, state.terrain, state.battlefieldWidth, state.battlefieldHeight, state.missionSelect, state.objectivePlacement.placedObjectives]);

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

  // Deployment zone boundaries (in inches from top/bottom)
  const zoneDepth = deployment.deploymentZoneDepth;
  const player1ZoneMaxY = zoneDepth;
  const player2ZoneMinY = state.battlefieldHeight - zoneDepth;

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

      // Validate position is within deployment zone
      if (deployingPlayerIndex === 0 && position.y > player1ZoneMaxY) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          notification: {
            message: 'Model must be placed within your deployment zone (first 12" from your edge)',
            type: 'warning',
            duration: 3000,
          },
        });
        return;
      }
      if (deployingPlayerIndex === 1 && position.y < player2ZoneMinY) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          notification: {
            message: 'Model must be placed within your deployment zone (last 12" from your edge)',
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
    [dispatch, placingUnit, deployment.pendingModelPositions.length, deployingPlayerIndex, player1ZoneMaxY, player2ZoneMinY],
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
      handlePlaceModel({ x: Math.round(worldX * 10) / 10, y: Math.round(worldY * 10) / 10 });
    },
    [placingUnit, handlePlaceModel, state.battlefieldWidth, state.battlefieldHeight],
  );

  const allPlaced = unitsToPlace.length === 0 && !placingUnit;
  const playerLabel = deployingConfig
    ? `${deployingConfig.playerName} (${deployingConfig.faction})`
    : `Player ${deployingPlayerIndex + 1}`;

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1 className="setup-title">Unit Deployment</h1>
        <p className="setup-subtitle">
          {playerLabel} — Place your units in the deployment zone
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
                    Click battlefield to place next model
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
            {/* Player 1 Deployment Zone */}
            <div
              className="deployment-zone deployment-zone-p1"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${(zoneDepth / state.battlefieldHeight) * 100}%`,
                background: deployingPlayerIndex === 0
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'rgba(59, 130, 246, 0.05)',
                borderBottom: '2px dashed rgba(59, 130, 246, 0.4)',
              }}
            >
              <div style={{
                position: 'absolute',
                bottom: 4,
                left: 8,
                fontSize: 10,
                color: '#60a5fa',
                opacity: 0.7,
              }}>
                Player 1 Deployment Zone ({zoneDepth}")
              </div>
            </div>

            {/* Player 2 Deployment Zone */}
            <div
              className="deployment-zone deployment-zone-p2"
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: `${(zoneDepth / state.battlefieldHeight) * 100}%`,
                background: deployingPlayerIndex === 1
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(239, 68, 68, 0.05)',
                borderTop: '2px dashed rgba(239, 68, 68, 0.4)',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 4,
                left: 8,
                fontSize: 10,
                color: '#f87171',
                opacity: 0.7,
              }}>
                Player 2 Deployment Zone ({zoneDepth}")
              </div>
            </div>

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
        {deployment.player1Confirmed && deployingPlayerIndex === 1 && (
          <div style={{ color: '#22c55e', fontSize: 12, marginBottom: 8 }}>
            Player 1 deployment confirmed
          </div>
        )}
        <button
          className={`setup-confirm-btn ${allPlaced ? '' : 'disabled'}`}
          disabled={!allPlaced}
          onClick={handleConfirmDeployment}
        >
          {allPlaced
            ? deployment.deployingPlayerIndex === 0
              ? 'Confirm Deployment → Player 2 Deploys'
              : 'Confirm Deployment → Begin Battle!'
            : `Deploy all units (${unitsToPlace.length + (placingUnit ? 1 : 0)} remaining)`
          }
        </button>
      </div>
    </div>
  );
}
