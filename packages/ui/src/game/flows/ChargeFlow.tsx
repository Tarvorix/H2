/**
 * ChargeFlow
 *
 * Handles the charge declaration and resolution steps of the assault flow.
 * Select target → confirm charge → volley attacks → charge roll → charge move.
 */

import { useCallback } from 'react';
import type { GameUIState, GameUIAction } from '../types';

interface ChargeFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

export function ChargeFlow({ state, dispatch }: ChargeFlowProps) {
  if (state.flowState.type !== 'assault') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  const findUnitName = (unitId: string): string => {
    for (const army of gs.armies) {
      for (const unit of army.units) {
        if (unit.id === unitId) return unit.profileId;
      }
    }
    return 'Unknown';
  };

  const handleSelectTarget = useCallback(
    (targetUnitId: string) => {
      dispatch({ type: 'SELECT_CHARGE_TARGET', targetUnitId });
    },
    [dispatch],
  );

  const handleConfirmCharge = useCallback(() => {
    dispatch({ type: 'CONFIRM_CHARGE' });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL_CHARGE' });
  }, [dispatch]);

  return (
    <div className="flow-panel">
      <div className="flow-panel-title">Charge Declaration</div>

      {/* Select Target */}
      {step.step === 'selectTarget' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Charging Unit: {findUnitName(step.chargingUnitId)}
          </div>
          <div className="flow-panel-step">
            Select an enemy unit to charge.
          </div>
          <div style={{ marginTop: 8 }}>
            {gs.armies[1 - gs.activePlayerIndex].units
              .filter(u => u.isDeployed && !u.models.every(m => m.isDestroyed))
              .map(u => (
                <button
                  key={u.id}
                  className="reaction-modal-unit-btn"
                  onClick={() => handleSelectTarget(u.id)}
                >
                  {u.profileId} ({u.models.filter(m => !m.isDestroyed).length} models alive)
                </button>
              ))}
          </div>
        </>
      )}

      {/* Confirm Charge */}
      {step.step === 'confirmCharge' && 'chargingUnitId' in step && 'targetUnitId' in step && (
        <>
          <div className="flow-panel-step">
            {findUnitName(step.chargingUnitId)} → Charging → {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Confirm the charge declaration?
          </div>
          {/* Show distance info from assaultAttackState if available */}
          {gs.assaultAttackState && (
            <div className="panel-row">
              <span className="panel-row-label">Distance to target</span>
              <span className="panel-row-value">
                {gs.assaultAttackState.closestDistance.toFixed(1)}"
              </span>
            </div>
          )}
        </>
      )}

      {/* Resolving / Volley / Charge Roll / Charge Move */}
      {step.step === 'resolving' && 'chargingUnitId' in step && 'targetUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Resolving charge: {findUnitName(step.chargingUnitId)} → {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Processing charge procedure...
          </div>
        </>
      )}

      {step.step === 'volleyAttacks' && 'chargingUnitId' in step && 'targetUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Volley Attacks: {findUnitName(step.targetUnitId)} fires snap shots at the charging unit
          </div>
          <div className="flow-panel-step" style={{ color: '#f87171' }}>
            Defender's volley attacks being resolved...
          </div>
        </>
      )}

      {step.step === 'chargeRoll' && 'chargingUnitId' in step && 'targetUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Charge Roll: {findUnitName(step.chargingUnitId)}
          </div>
          {gs.assaultAttackState && (
            <>
              <div className="panel-row">
                <span className="panel-row-label">Charge Roll</span>
                <span className="panel-row-value">{gs.assaultAttackState.chargeRoll}"</span>
              </div>
              <div className="panel-row">
                <span className="panel-row-label">Distance Needed</span>
                <span className="panel-row-value">{gs.assaultAttackState.closestDistance.toFixed(1)}"</span>
              </div>
            </>
          )}
        </>
      )}

      {step.step === 'chargeMove' && 'chargingUnitId' in step && 'targetUnitId' in step && (
        <>
          <div className="flow-panel-step" style={{ color: '#22c55e' }}>
            Charge successful! {findUnitName(step.chargingUnitId)} engages {findUnitName(step.targetUnitId)}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flow-panel-actions">
        {step.step === 'confirmCharge' && (
          <button className="toolbar-btn" onClick={handleConfirmCharge}>
            Confirm Charge
          </button>
        )}
        {(step.step === 'selectTarget' || step.step === 'confirmCharge') && (
          <button className="toolbar-btn" onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
