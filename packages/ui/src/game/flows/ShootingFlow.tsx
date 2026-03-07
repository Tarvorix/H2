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
import { findWeapon, findLegionWeapon, isRangedWeapon } from '@hh/data';
import { checkWeaponRange, getClosestModelDistance, hasLOSToUnit, TEMPLATE_EFFECTIVE_RANGE_INCHES } from '@hh/engine';
import type { GameState, UnitState } from '@hh/types';

interface ShootingFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

interface ShootingTargetInfo {
  target: UnitState;
  closestDistance: number;
  maxAttackerRange: number;
  hasLOS: boolean;
  hasAnyWeaponInRange: boolean;
  canTarget: boolean;
}

function lookupWeapon(weaponId: string) {
  return findWeapon(weaponId) ?? findLegionWeapon(weaponId);
}

function findUnitById(gs: GameState, unitId: string): UnitState | null {
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (unit.id === unitId) return unit;
    }
  }
  return null;
}

function getRangedWeaponIdsForModel(model: UnitState['models'][number]): string[] {
  if (model.equippedWargear.length > 0) {
    return model.equippedWargear;
  }
  // Preset fallback: no explicit wargear loaded, treat as bolter-armed.
  return ['bolter'];
}

function getEffectiveWeaponRange(weapon: ReturnType<typeof lookupWeapon>): number {
  if (!weapon || !isRangedWeapon(weapon)) return 0;
  return weapon.hasTemplate ? TEMPLATE_EFFECTIVE_RANGE_INCHES : weapon.range;
}

function getShootingTargetInfo(
  gs: GameState,
  attackerUnitId: string,
): ShootingTargetInfo[] {
  const attacker = findUnitById(gs, attackerUnitId);
  if (!attacker) return [];

  const aliveAttackers = attacker.models.filter(m => !m.isDestroyed);
  const maxAttackerRange = aliveAttackers.reduce((maxRange, model) => {
    const ranges = getRangedWeaponIdsForModel(model)
      .map((weaponId) => lookupWeapon(weaponId))
      .filter((weapon): weapon is ReturnType<typeof lookupWeapon> & { range: number } => !!weapon && isRangedWeapon(weapon))
      .map((weapon) => getEffectiveWeaponRange(weapon))
      .filter(range => range > 0);

    const modelMaxRange = ranges.length > 0 ? Math.max(...ranges) : 0;
    return Math.max(maxRange, modelMaxRange);
  }, 0);

  return gs.armies[1 - gs.activePlayerIndex].units
    .filter(unit => unit.isDeployed && !unit.models.every(m => m.isDestroyed))
    .map((target): ShootingTargetInfo => {
      const targetAliveModels = target.models.filter(m => !m.isDestroyed);
      const closestDistance = getClosestModelDistance(gs, attacker.id, target.id);
      const hasLOS = hasLOSToUnit(gs, attacker.id, target.id);

      const hasAnyWeaponInRange = aliveAttackers.some((attackerModel) => {
        return getRangedWeaponIdsForModel(attackerModel).some((weaponId) => {
          const weapon = lookupWeapon(weaponId);
          if (!weapon || !isRangedWeapon(weapon)) return false;
          const effectiveRange = getEffectiveWeaponRange(weapon);
          if (effectiveRange <= 0) return false;
          return checkWeaponRange(attackerModel, targetAliveModels, effectiveRange);
        });
      });

      const canTarget = hasLOS && hasAnyWeaponInRange;
      return {
        target,
        closestDistance,
        maxAttackerRange,
        hasLOS,
        hasAnyWeaponInRange,
        canTarget,
      };
    });
}

export function ShootingFlow({ state, dispatch }: ShootingFlowProps) {
  if (state.flowState.type !== 'shooting') return null;

  const step = state.flowState.step;
  const isCompactPanelStep =
    step.step === 'resolving' || step.step === 'showResults' || step.step === 'resolveMorale';
  const gs = state.gameState;
  if (!gs) return null;
  const shootingTargetInfo = step.step === 'selectTarget'
    ? getShootingTargetInfo(gs, step.attackerUnitId)
    : [];

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
    <div className={`flow-panel flow-panel-shooting${isCompactPanelStep ? ' flow-panel-shooting-compact' : ''}`}>
      <div className="flow-panel-title">Shooting Attack</div>

      <div className="flow-panel-body">
        {/* Step 1: Select Target */}
        {step.step === 'selectTarget' && (
          <>
            <div className="flow-panel-step">
              Attacker: {findUnitName(step.attackerUnitId)}
            </div>
            <div className="flow-panel-step">
              Choose an enemy unit in range. Distances are measured now (before attack confirmation).
            </div>
            {/* Show eligible targets */}
            <div style={{ marginTop: 8 }}>
              {shootingTargetInfo.map((targetInfo) => (
                <div key={targetInfo.target.id} style={{ marginBottom: 6 }}>
                  <button
                    className="reaction-modal-unit-btn"
                    onClick={() => handleSelectTarget(targetInfo.target.id)}
                    disabled={!targetInfo.canTarget}
                    title={!targetInfo.canTarget
                      ? !targetInfo.hasLOS
                        ? 'No line of sight to target'
                        : 'No ranged weapons can reach this target'
                      : undefined}
                  >
                    {targetInfo.target.profileId} ({targetInfo.target.models.filter(m => !m.isDestroyed).length} models alive)
                  </button>
                  <div className="panel-row" style={{ padding: '2px 4px' }}>
                    <span className="panel-row-label">
                      Closest {Number.isFinite(targetInfo.closestDistance) ? `${targetInfo.closestDistance.toFixed(1)}"` : '—'}
                      {' • '}Max gun {targetInfo.maxAttackerRange.toFixed(1)}"
                    </span>
                    <span
                      className="panel-row-value"
                      style={{ color: targetInfo.canTarget ? '#22c55e' : '#ef4444' }}
                    >
                      {targetInfo.canTarget ? 'In Range' : 'Out of Range'}
                    </span>
                  </div>
                </div>
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

        {step.step === 'placeSpecial' && (
          <>
            <div className="flow-panel-step">
              Attacker: {findUnitName(step.attackerUnitId)} → Target: {findUnitName(step.targetUnitId)}
            </div>
            <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
              {step.requirements[step.currentIndex]?.label}
            </div>
            <div className="flow-panel-step">
              Click the battlefield to place this marker or template.
            </div>
            <div className="panel-row" style={{ marginTop: 8 }}>
              <span className="panel-row-label">Placement</span>
              <span className="panel-row-value">
                {step.currentIndex + 1} / {step.requirements.length}
              </span>
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
              <div className="shooting-resolution-groups">
                <FireGroupDisplay
                  fireGroups={gs.shootingAttackState.fireGroups}
                  currentIndex={gs.shootingAttackState.currentFireGroupIndex}
                />
              </div>
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
            <div className="flow-panel-step" style={{ color: '#93c5fd' }}>
              Click Resolve Casualties to finish this attack and close the panel.
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
      </div>

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
