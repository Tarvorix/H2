/**
 * ObjectivePlacementScreen
 *
 * For alternating/symmetric missions, allows players to click to place objectives on the battlefield.
 * Shows the deployment zones and existing objectives.
 */

import { useCallback } from 'react';
import { findMission } from '@hh/data';
import type { GameUIState, GameUIAction } from '../types';
import {
  getObjectivePlacementInstructions,
  validateObjectivePlacement,
} from '../objective-placement';

interface ObjectivePlacementScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

export function ObjectivePlacementScreen({ state, dispatch, onReturnToMenu }: ObjectivePlacementScreenProps) {
  const { objectivePlacement } = state;
  const {
    firstPlacingPlayerIndex,
    placingPlayerIndex,
    placedObjectives,
    totalToPlace,
    pendingPosition,
  } = objectivePlacement;
  const mission = state.missionSelect.selectedMissionId
    ? findMission(state.missionSelect.selectedMissionId)
    : null;

  const objectivesRemaining = totalToPlace - placedObjectives.length;
  const pendingValidation = mission && pendingPosition
    ? validateObjectivePlacement(
        mission,
        state.battlefieldWidth,
        state.battlefieldHeight,
        placedObjectives,
        pendingPosition,
      )
    : null;
  const canConfirmPlacement = pendingPosition !== null && (pendingValidation?.valid ?? true);
  const allPlaced = placedObjectives.length >= totalToPlace;

  const handleBattlefieldClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (allPlaced) return;

      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const xRatio = (e.clientX - rect.left) / rect.width;
      const yRatio = (e.clientY - rect.top) / rect.height;
      const clampedXRatio = Math.max(0, Math.min(1, xRatio));
      const clampedYRatio = Math.max(0, Math.min(1, yRatio));

      const x = clampedXRatio * state.battlefieldWidth;
      const y = clampedYRatio * state.battlefieldHeight;

      dispatch({ type: 'SET_OBJECTIVE_POSITION', position: { x, y } });
    },
    [dispatch, allPlaced, state.battlefieldWidth, state.battlefieldHeight],
  );

  const handleConfirmPlacement = useCallback(() => {
    if (!canConfirmPlacement) return;
    dispatch({ type: 'CONFIRM_OBJECTIVE_PLACEMENT' });
  }, [dispatch, canConfirmPlacement]);

  const handleUndoPlacement = useCallback(() => {
    dispatch({ type: 'UNDO_OBJECTIVE_PLACEMENT' });
  }, [dispatch]);

  const handleConfirmAll = useCallback(() => {
    dispatch({ type: 'CONFIRM_ALL_OBJECTIVES' });
  }, [dispatch]);

  return (
    <div className="setup-screen objective-placement-screen">
      <div className="setup-header">
        <h1 className="setup-title">Objective Placement</h1>
        <p className="setup-subtitle">
          Player {placingPlayerIndex + 1}: Place objectives on the battlefield
          ({objectivesRemaining} remaining)
        </p>
        {mission && (
          <p className="setup-subtitle" style={{ fontSize: 13, color: '#94a3b8' }}>
            Objective roll-off: Player {firstPlacingPlayerIndex + 1} places first. {getObjectivePlacementInstructions(mission)}
          </p>
        )}
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content objective-placement-content">
        <div
          className="objective-placement-canvas"
          role="button"
          tabIndex={0}
        >
          {/* Battlefield representation */}
          <div className="battlefield-preview">
            <div className="battlefield-outline" style={{
              aspectRatio: `${state.battlefieldWidth} / ${state.battlefieldHeight}`,
              minHeight: '180px',
            }}
            onClick={handleBattlefieldClick}
            >
              {/* Show placed objectives */}
              {placedObjectives.map((obj, i) => (
                <div
                  key={obj.id}
                  className="objective-marker placed"
                  style={{
                    left: `${(obj.position.x / state.battlefieldWidth) * 100}%`,
                    top: `${(obj.position.y / state.battlefieldHeight) * 100}%`,
                  }}
                  title={`Objective ${i + 1}: ${obj.label} (${obj.vpValue}VP)`}
                >
                  {i + 1}
                </div>
              ))}

              {/* Show pending position */}
              {pendingPosition && (
                <div
                  className="objective-marker pending"
                  style={{
                    left: `${(pendingPosition.x / state.battlefieldWidth) * 100}%`,
                    top: `${(pendingPosition.y / state.battlefieldHeight) * 100}%`,
                  }}
                >
                  ?
                </div>
              )}
            </div>
          </div>

          <div className="objective-placement-info">
            {pendingValidation && !pendingValidation.valid && (
              <div className="panel-row" style={{ color: '#fca5a5', marginBottom: 8 }}>
                {pendingValidation.error}
              </div>
            )}
            <div className="objective-placement-placed">
              <h3>Placed Objectives</h3>
              {placedObjectives.length === 0 ? (
                <div>No objectives placed yet.</div>
              ) : (
                placedObjectives.map((obj, i) => (
                  <div key={obj.id} className="objective-placement-item">
                    {i + 1}. {obj.label} at ({obj.position.x.toFixed(0)}", {obj.position.y.toFixed(0)}") — {obj.vpValue}VP
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="setup-footer">
        {!allPlaced && (
          <>
            <button
              className="toolbar-btn"
              disabled={placedObjectives.length === 0}
              onClick={handleUndoPlacement}
            >
              Undo Last
            </button>
            <button
              className={`setup-confirm-btn ${canConfirmPlacement ? '' : 'disabled'}`}
              disabled={!canConfirmPlacement}
              onClick={handleConfirmPlacement}
            >
              Confirm Placement
            </button>
          </>
        )}
        {allPlaced && (
          <button className="setup-confirm-btn" onClick={handleConfirmAll}>
            Continue to Deployment →
          </button>
        )}
      </div>
    </div>
  );
}
