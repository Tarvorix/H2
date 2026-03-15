/**
 * WeaponSelectionPanel
 *
 * Per-model weapon assignment during the shooting flow.
 * Shows each alive model in the attacking unit with their available weapons.
 * The player selects which weapon each model will fire.
 */

import { useCallback } from 'react';
import type { GameUIState, GameUIAction, WeaponSelection } from '../types';
import { checkWeaponRange, getClosestModelDistance, getWeaponSelectionOptions, TEMPLATE_EFFECTIVE_RANGE_INCHES } from '@hh/engine';

/**
 * Format a weapon's stats for display.
 */
function formatWeaponStats(
  weapon: {
    range: number;
    rangedStrength: number;
    ap: number | null;
    traits: string[];
    hasTemplate: boolean;
    rangeBand?: { min: number; max: number };
  },
): string {
  const apStr = weapon.ap !== null ? `AP${weapon.ap}` : 'AP-';
  const traitsStr = weapon.traits.length > 0 ? ` ${weapon.traits.join(', ')}` : '';
  const rangeStr = weapon.hasTemplate
    ? `${TEMPLATE_EFFECTIVE_RANGE_INCHES}"`
    : weapon.rangeBand && weapon.rangeBand.min > 0
      ? `>${weapon.rangeBand.min}" to ${weapon.range}"`
      : `${weapon.range}"`;
  return `${rangeStr} S${weapon.rangedStrength} ${apStr}${traitsStr}`;
}

interface WeaponSelectionPanelProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  attackerUnitId: string;
  targetUnitId: string;
}

export function WeaponSelectionPanel({
  state,
  dispatch,
  attackerUnitId,
  targetUnitId,
}: WeaponSelectionPanelProps) {
  const gs = state.gameState;
  if (!gs) return null;

  // Find the attacking unit
  let attackingUnit = null;
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (unit.id === attackerUnitId) {
        attackingUnit = unit;
      }
    }
  }
  if (!attackingUnit) return null;

  // Find the target unit
  let targetUnit = null;
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (unit.id === targetUnitId) {
        targetUnit = unit;
      }
    }
  }
  if (!targetUnit) return null;

  const targetAliveModels = targetUnit.models.filter(m => !m.isDestroyed);
  const closestDistance = getClosestModelDistance(gs, attackerUnitId, targetUnitId);

  // Get current weapon selections from the flow state
  const currentSelections: WeaponSelection[] =
    state.flowState.type === 'shooting' && state.flowState.step.step === 'selectWeapons'
      ? state.flowState.step.weaponSelections
      : [];

  const aliveModels = attackingUnit.models.filter(m => !m.isDestroyed);

  const handleSelectWeapon = useCallback(
    (selection: WeaponSelection) => {
      dispatch({
        type: 'SET_WEAPON_SELECTION',
        selection,
      });
    },
    [dispatch],
  );

  const handleClearWeapon = useCallback(
    (modelId: string) => {
      dispatch({ type: 'CLEAR_WEAPON_SELECTION', modelId });
    },
    [dispatch],
  );

  return (
    <div className="weapon-selection-panel">
      <div className="panel-row" style={{ padding: '2px 0 8px 0' }}>
        <span className="panel-row-label">Closest Distance</span>
        <span className="panel-row-value">
          {Number.isFinite(closestDistance) ? `${closestDistance.toFixed(1)}"` : '—'}
        </span>
      </div>
      {aliveModels.map((model, idx) => {
        const selectedWeapon = currentSelections.find(ws => ws.modelId === model.id);
        const weapons = model.equippedWargear;
        const selectionOptions = (weapons.length > 0 ? weapons : ['bolter']).flatMap((weaponId) =>
          getWeaponSelectionOptions(
            { modelId: model.id, weaponId },
            attackingUnit,
            gs,
            Number.isFinite(closestDistance) ? closestDistance : undefined,
          ),
        );

        return (
          <div key={model.id} className="weapon-selection-model">
            <div className="weapon-selection-model-name">
              Model {idx + 1} ({model.profileModelName})
              {selectedWeapon && (
                <span style={{ color: '#22c55e', marginLeft: 8 }}>
                  → {selectedWeapon.weaponName}
                </span>
              )}
            </div>

            {selectionOptions.length === 0 ? (
              <div style={{ fontSize: 11, color: '#6b7fa0', padding: '4px 0' }}>
                No ranged weapons equipped
              </div>
            ) : (
              selectionOptions.map((option) => {
                const effectiveRange = option.weaponProfile.hasTemplate
                  ? TEMPLATE_EFFECTIVE_RANGE_INCHES
                  : option.weaponProfile.range;
                const stats = formatWeaponStats(option.weaponProfile);
                const canShootWithWeapon = effectiveRange > 0 && checkWeaponRange(
                  model,
                  targetAliveModels,
                  effectiveRange,
                  option.weaponProfile.rangeBand?.min ?? 0,
                );
                const isDisabled = !canShootWithWeapon;
                return (
                  <div key={`${option.assignment.weaponId}|${option.assignment.profileName ?? ''}`} className="weapon-option">
                    <input
                      type="radio"
                      name={`weapon-${model.id}`}
                      checked={
                        selectedWeapon?.weaponId === option.assignment.weaponId
                        && selectedWeapon?.profileName === option.assignment.profileName
                      }
                      disabled={isDisabled}
                      onChange={() => handleSelectWeapon({
                        modelId: model.id,
                        weaponId: option.assignment.weaponId,
                        weaponName: option.displayName,
                        profileName: option.assignment.profileName,
                      })}
                    />
                    <span className="weapon-option-name">{option.displayName}</span>
                    {stats && <span className="weapon-option-stats">{stats}</span>}
                    <span
                      className="weapon-option-stats"
                      style={{ color: canShootWithWeapon ? '#22c55e' : '#ef4444' }}
                    >
                      {canShootWithWeapon ? 'In Range' : 'Out of Range'}
                    </span>
                  </div>
                );
              })
            )}

            {selectedWeapon && (
              <button
                className="terrain-remove-btn"
                onClick={() => handleClearWeapon(model.id)}
                style={{ marginTop: 4 }}
              >
                Clear
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
