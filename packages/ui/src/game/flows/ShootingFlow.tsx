/**
 * ShootingFlow
 *
 * Multi-step shooting flow panel. Guides the player through:
 * 1. Select target unit (attacker already selected)
 * 2. Assign weapons per model
 * 3. Confirm and resolve the shooting attack
 * 4. View results and resolve casualties/morale
 */

import { useCallback } from 'react';
import type { GameUIState, GameUIAction } from '../types';
import { WeaponSelectionPanel } from './WeaponSelectionPanel';
import { FireGroupDisplay } from './FireGroupDisplay';

interface ShootingFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

export function ShootingFlow({ state, dispatch }: ShootingFlowProps) {
  if (state.flowState.type !== 'shooting') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  // Look up unit names
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
      dispatch({ type: 'SELECT_SHOOTING_TARGET', targetUnitId });
    },
    [dispatch],
  );

  const handleConfirmShooting = useCallback(() => {
    dispatch({ type: 'CONFIRM_SHOOTING' });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CANCEL_SHOOTING' });
  }, [dispatch]);

  const handleResolveCasualties = useCallback(() => {
    dispatch({ type: 'RESOLVE_SHOOTING_CASUALTIES' });
  }, [dispatch]);

  return (
    <div className="flow-panel">
      <div className="flow-panel-title">Shooting Attack</div>

      {/* Step 1: Select Target */}
      {step.step === 'selectTarget' && (
        <>
          <div className="flow-panel-step">
            Attacker: {findUnitName(step.attackerUnitId)}
          </div>
          <div className="flow-panel-step">
            Click an enemy unit to select as the target.
          </div>
          {/* Show eligible targets */}
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

      {/* Step 2: Weapon Selection */}
      {step.step === 'selectWeapons' && (
        <>
          <div className="flow-panel-step">
            Attacker: {findUnitName(step.attackerUnitId)} → Target: {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#60a5fa' }}>
            Assign weapons for each model.
          </div>
          <WeaponSelectionPanel
            state={state}
            dispatch={dispatch}
            attackerUnitId={step.attackerUnitId}
            targetUnitId={step.targetUnitId}
          />
          <div className="panel-row" style={{ marginTop: 8 }}>
            <span className="panel-row-label">Weapons assigned</span>
            <span className="panel-row-value">{step.weaponSelections.length}</span>
          </div>
        </>
      )}

      {/* Step 3: Resolving */}
      {step.step === 'resolving' && (
        <>
          <div className="flow-panel-step">
            Resolving: {findUnitName(step.attackerUnitId)} → {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Processing hit tests, wound tests, and saves...
          </div>
          {/* Show fire groups if available from shootingAttackState */}
          {gs.shootingAttackState && (
            <FireGroupDisplay
              fireGroups={gs.shootingAttackState.fireGroups}
              currentIndex={gs.shootingAttackState.currentFireGroupIndex}
            />
          )}
        </>
      )}

      {/* Step 4: Show Results */}
      {step.step === 'showResults' && (
        <>
          <div className="flow-panel-step">
            Attack Complete: {findUnitName(step.attackerUnitId)} → {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#22c55e' }}>
            Results are shown in the combat log.
          </div>
          <button className="toolbar-btn" onClick={handleResolveCasualties} style={{ marginTop: 8, width: '100%' }}>
            Resolve Casualties
          </button>
        </>
      )}

      {/* Step 5: Resolve Morale */}
      {step.step === 'resolveMorale' && (
        <>
          <div className="flow-panel-step">
            Morale Checks: {findUnitName(step.attackerUnitId)} → {findUnitName(step.targetUnitId)}
          </div>
          <div className="flow-panel-step" style={{ color: '#a78bfa' }}>
            Resolving panic/pinning checks...
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flow-panel-actions">
        {step.step === 'selectWeapons' && step.weaponSelections.length > 0 && (
          <button className="toolbar-btn" onClick={handleConfirmShooting}>
            Confirm Attack
          </button>
        )}
        {(step.step === 'selectTarget' || step.step === 'selectWeapons') && (
          <button className="toolbar-btn" onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
