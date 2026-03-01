/**
 * MovementFlow
 *
 * UI panel displayed during the Movement Phase when a player is moving a unit.
 * Shows the movement flow steps: select destination → confirm move.
 * Integrates with the movement envelope overlay for valid destination display.
 */

import { useCallback } from 'react';
import type { GameUIState, GameUIAction } from '../types';

interface MovementFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

export function MovementFlow({ state, dispatch }: MovementFlowProps) {
  if (state.flowState.type !== 'movement') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  // Find the unit being moved
  let unitName = 'Unknown Unit';
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (
        (step.step === 'selectDestination' && unit.id === step.unitId) ||
        (step.step === 'confirmMove' && unit.id === step.unitId)
      ) {
        unitName = unit.profileId;
      }
    }
  }

  const handleConfirmMove = useCallback(() => {
    dispatch({ type: 'CONFIRM_MOVE' });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL_MOVE' });
  }, [dispatch]);

  return (
    <div className="flow-panel">
      <div className="flow-panel-title">
        {step.step === 'selectDestination' && step.isRush ? 'Rush' : 'Move'}: {unitName}
      </div>

      {step.step === 'selectDestination' && (
        <div className="flow-panel-step">
          Click on the battlefield to set the destination.
          {step.isRush && (
            <span style={{ color: '#fbbf24', marginLeft: 8 }}>
              (Rush — double movement, cannot shoot this turn)
            </span>
          )}
        </div>
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
          {step.modelPositions.map((mp, i) => (
            <div key={i} className="panel-row">
              <span className="panel-row-label">Model {i + 1}</span>
              <span className="panel-row-value">
                ({mp.position.x.toFixed(1)}", {mp.position.y.toFixed(1)}")
              </span>
            </div>
          ))}
        </>
      )}

      <div className="flow-panel-actions">
        {step.step === 'confirmMove' && (
          <button className="toolbar-btn" onClick={handleConfirmMove}>
            Confirm {step.isRush ? 'Rush' : 'Move'}
          </button>
        )}
        <button className="toolbar-btn" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
