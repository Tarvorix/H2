/**
 * MovementFlow
 *
 * UI panel displayed during the Movement Phase when a player is moving a unit.
 * Shows the movement flow steps: select destination → confirm move.
 * Integrates with the movement envelope overlay for valid destination display.
 */

import { useCallback } from 'react';
import { getModelInitiative, getModelMovement } from '@hh/engine';
import type { GameUIState, GameUIAction } from '../types';

interface MovementFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

const MOVE_DISTANCE_EPSILON = 0.005;

function distanceInches(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getUnitMoveLimit(
  unit: NonNullable<GameUIState['gameState']>['armies'][number]['units'][number],
  isRush: boolean,
): number {
  const aliveModel = unit.models.find(m => !m.isDestroyed);
  if (!aliveModel) return 0;

  const movement = getModelMovement(aliveModel.unitProfileId, aliveModel.profileModelName);
  if (!isRush) return movement;

  const initiative = getModelInitiative(aliveModel.unitProfileId, aliveModel.profileModelName);
  return movement + initiative;
}

function getUnitCentroid(
  unit: NonNullable<GameUIState['gameState']>['armies'][number]['units'][number],
): { x: number; y: number } | null {
  const aliveModels = unit.models.filter(m => !m.isDestroyed);
  if (aliveModels.length === 0) return null;

  const sum = aliveModels.reduce(
    (acc, model) => ({ x: acc.x + model.position.x, y: acc.y + model.position.y }),
    { x: 0, y: 0 },
  );
  return {
    x: sum.x / aliveModels.length,
    y: sum.y / aliveModels.length,
  };
}

export function MovementFlow({ state, dispatch }: MovementFlowProps) {
  if (state.flowState.type !== 'movement') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  const movingUnitId =
    step.step === 'selectDestination' || step.step === 'confirmMove'
      ? step.unitId
      : null;
  if (!movingUnitId) return null;

  const isRush =
    step.step === 'selectDestination' || step.step === 'confirmMove'
      ? step.isRush
      : false;

  // Find the unit being moved
  let movingUnit: (typeof gs.armies)[number]['units'][number] | null = null;
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (unit.id === movingUnitId) {
        movingUnit = unit;
      }
    }
  }
  if (!movingUnit) return null;

  const unitName = movingUnit.profileId;
  const moveLimit = getUnitMoveLimit(movingUnit, isRush);
  const unitCentroid = getUnitCentroid(movingUnit);

  const cursorDistance = step.step === 'selectDestination' && state.mouseWorldPos && unitCentroid
    ? distanceInches(state.mouseWorldPos, unitCentroid)
    : null;
  const cursorInRange = cursorDistance !== null
    ? cursorDistance <= moveLimit + MOVE_DISTANCE_EPSILON
    : null;

  const plannedDistance = step.step === 'confirmMove' && step.modelPositions.length > 0
    ? (() => {
        const first = step.modelPositions[0];
        const origin = movingUnit.models.find(m => m.id === first.modelId)?.position;
        return origin ? distanceInches(origin, first.position) : null;
      })()
    : null;

  const handleConfirmMove = useCallback(() => {
    dispatch({ type: 'CONFIRM_MOVE' });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL_MOVE' });
  }, [dispatch]);

  return (
    <div className="flow-panel">
      <div className="flow-panel-title">
        {step.step === 'selectDestination' && isRush ? 'Rush' : 'Move'}: {unitName}
      </div>

      {step.step === 'selectDestination' && (
        <>
          <div className="flow-panel-step">
            Click on the battlefield to set the destination.
            {isRush && (
              <span style={{ color: '#fbbf24', marginLeft: 8 }}>
                (Rush — double movement, cannot shoot this turn)
              </span>
            )}
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Move Limit</span>
            <span className="panel-row-value">{moveLimit.toFixed(2)}"</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Cursor Distance</span>
            <span
              className="panel-row-value"
              style={
                cursorInRange === null
                  ? undefined
                  : { color: cursorInRange ? '#22c55e' : '#ef4444' }
              }
            >
              {cursorDistance !== null ? `${cursorDistance.toFixed(2)}"` : '--'}
            </span>
          </div>
        </>
      )}

      {step.step === 'confirmMove' && (
        <>
          <div className="flow-panel-step">
            Destination set. Confirm the move.
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Models to move</span>
            <span className="panel-row-value">{step.modelPositions.length}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Planned Distance</span>
            <span
              className="panel-row-value"
              style={
                plannedDistance === null
                  ? undefined
                  : { color: plannedDistance <= moveLimit + MOVE_DISTANCE_EPSILON ? '#22c55e' : '#ef4444' }
              }
            >
              {plannedDistance !== null ? `${plannedDistance.toFixed(2)}" / ${moveLimit.toFixed(2)}"` : '--'}
            </span>
          </div>
        </>
      )}

      <div className="flow-panel-actions">
        {step.step === 'confirmMove' && (
          <button className="toolbar-btn" onClick={handleConfirmMove}>
            Confirm {isRush ? 'Rush' : 'Move'}
          </button>
        )}
        <button className="toolbar-btn" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
