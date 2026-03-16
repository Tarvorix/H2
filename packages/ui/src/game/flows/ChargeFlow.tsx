/**
 * ChargeFlow
 *
 * Handles the charge declaration and resolution steps of the assault flow.
 * Select target → confirm charge → volley attacks → charge roll → charge move.
 */

import { useCallback } from 'react';
import type { AttackTargetRef } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';
import {
  getAttackTargetLabel,
  getClosestAttackTargetDistance,
  hasLineOfSightToAttackTarget,
} from '../attack-targets';

interface ChargeFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

export function ChargeFlow({ state, dispatch }: ChargeFlowProps) {
  if (state.flowState.type !== 'assault') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  const findTargetName = (target: AttackTargetRef): string => getAttackTargetLabel(gs, target);

  const handleSelectTarget = useCallback(
    (target: AttackTargetRef) => {
      dispatch({ type: 'SELECT_CHARGE_TARGET', target });
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
            Charging Unit: {findTargetName({ kind: 'unit', unitId: step.chargingUnitId })}
          </div>
          <div className="flow-panel-step">
            Select an enemy unit or doorway to charge.
          </div>
          <div style={{ marginTop: 8 }}>
            {[
              ...gs.armies[1 - gs.activePlayerIndex].units
                .filter(u => u.isDeployed && !u.models.every(m => m.isDestroyed))
                .map((u) => ({
                  target: { kind: 'unit', unitId: u.id } as AttackTargetRef,
                  label: `${u.profileId} (${u.models.filter(m => !m.isDestroyed).length} models alive)`,
                })),
              ...(
                gs.gameMode === 'zone-mortalis'
                  ? (gs.zoneMortalisState?.doorways ?? [])
                    .filter((doorway) => doorway.state !== 'destroyed' && doorway.id)
                    .map((doorway) => ({
                      target: { kind: 'doorway', doorwayId: doorway.id! } as AttackTargetRef,
                      label: `${getAttackTargetLabel(gs, { kind: 'doorway', doorwayId: doorway.id! })} (${doorway.state} • ${doorway.hullPoints}/${doorway.maxHullPoints} HP)`,
                    }))
                  : []
              ),
            ].map(({ target, label }) => {
              const closestDistance = getClosestAttackTargetDistance(gs, step.chargingUnitId, target);
              const hasLOS = hasLineOfSightToAttackTarget(gs, step.chargingUnitId, target);
              const isWithinDeclareRange = closestDistance <= 12.001;
              const canChargeDeclare = isWithinDeclareRange && hasLOS;

              return (
                <div key={target.kind === 'unit' ? target.unitId : target.doorwayId} style={{ marginBottom: 6 }}>
                  <button
                    className="reaction-modal-unit-btn"
                    onClick={() => handleSelectTarget(target)}
                    disabled={!canChargeDeclare}
                    title={!canChargeDeclare
                      ? !hasLOS
                        ? 'No line of sight to target'
                        : 'Target is outside 12" charge declaration range'
                      : undefined}
                  >
                    {label}
                  </button>
                  <div className="panel-row" style={{ padding: '2px 4px' }}>
                    <span className="panel-row-label">
                      Closest {Number.isFinite(closestDistance) ? `${closestDistance.toFixed(1)}"` : '—'} / 12.0"
                    </span>
                    <span
                      className="panel-row-value"
                      style={{ color: canChargeDeclare ? '#22c55e' : '#ef4444' }}
                    >
                      {canChargeDeclare ? 'In Range' : 'Out of Range'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Confirm Charge */}
      {step.step === 'confirmCharge' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step">
            {findTargetName({ kind: 'unit', unitId: step.chargingUnitId })} → Charging → {findTargetName(step.target)}
          </div>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Confirm the charge declaration?
          </div>
          {/* Show distance info from assaultAttackState if available */}
          {(gs.assaultAttackState || Number.isFinite(step.measuredDistance)) && (
            <div className="panel-row">
              <span className="panel-row-label">Distance to target</span>
              <span className="panel-row-value">
                {(gs.assaultAttackState?.closestDistance ?? step.measuredDistance).toFixed(1)}"
              </span>
            </div>
          )}
        </>
      )}

      {/* Resolving / Volley / Charge Roll / Charge Move */}
      {step.step === 'resolving' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Resolving charge: {findTargetName({ kind: 'unit', unitId: step.chargingUnitId })} → {findTargetName(step.target)}
          </div>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Processing charge procedure...
          </div>
        </>
      )}

      {step.step === 'volleyAttacks' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Volley Attacks: {findTargetName(step.target)} fires snap shots at the charging unit
          </div>
          <div className="flow-panel-step" style={{ color: '#f87171' }}>
            Defender's volley attacks being resolved...
          </div>
        </>
      )}

      {step.step === 'chargeRoll' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step">
            Charge Roll: {findTargetName({ kind: 'unit', unitId: step.chargingUnitId })}
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

      {step.step === 'chargeMove' && 'chargingUnitId' in step && (
        <>
          <div className="flow-panel-step" style={{ color: '#22c55e' }}>
            Charge successful! {findTargetName({ kind: 'unit', unitId: step.chargingUnitId })} engages {findTargetName(step.target)}
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
