/**
 * WeaponSelectionPanel
 *
 * Per-model weapon assignment during the shooting flow.
 * Shows each alive model in the attacking unit with their available weapons.
 * The player selects which weapon each model will fire.
 */

import { useCallback } from 'react';
import type { GameUIState, GameUIAction, WeaponSelection } from '../types';
import type { RangedWeaponProfile, MeleeWeaponProfile } from '@hh/types';
import { findWeapon, findLegionWeapon, isRangedWeapon, isMeleeWeapon } from '@hh/data';

/**
 * Look up a weapon by ID, checking both generic and legion-specific databases.
 */
function lookupWeapon(weaponId: string): RangedWeaponProfile | MeleeWeaponProfile | undefined {
  return findWeapon(weaponId) ?? findLegionWeapon(weaponId);
}

/**
 * Format a weapon's stats for display.
 */
function formatWeaponStats(weapon: RangedWeaponProfile | MeleeWeaponProfile): string {
  if (isRangedWeapon(weapon)) {
    const apStr = weapon.ap !== null ? `AP${weapon.ap}` : 'AP-';
    const traitsStr = weapon.traits.length > 0 ? ` ${weapon.traits.join(', ')}` : '';
    return `${weapon.range}" S${weapon.rangedStrength} ${apStr}${traitsStr}`;
  }
  if (isMeleeWeapon(weapon)) {
    const apStr = weapon.ap !== null ? `AP${weapon.ap}` : 'AP-';
    return `Melee ${apStr}`;
  }
  return '';
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

  // Get current weapon selections from the flow state
  const currentSelections: WeaponSelection[] =
    state.flowState.type === 'shooting' && state.flowState.step.step === 'selectWeapons'
      ? state.flowState.step.weaponSelections
      : [];

  const aliveModels = attackingUnit.models.filter(m => !m.isDestroyed);

  const handleSelectWeapon = useCallback(
    (modelId: string, weaponId: string, weaponName: string) => {
      dispatch({
        type: 'SET_WEAPON_SELECTION',
        selection: { modelId, weaponId, weaponName },
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
      {aliveModels.map((model, idx) => {
        const selectedWeapon = currentSelections.find(ws => ws.modelId === model.id);
        const weapons = model.equippedWargear;

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

            {weapons.length === 0 ? (
              <div style={{ fontSize: 11, color: '#6b7fa0', padding: '4px 0' }}>
                No ranged weapons equipped
              </div>
            ) : (
              weapons.map((weaponId) => {
                const weapon = lookupWeapon(weaponId);
                const displayName = weapon ? weapon.name : weaponId;
                const stats = weapon ? formatWeaponStats(weapon) : '';
                return (
                  <div key={weaponId} className="weapon-option">
                    <input
                      type="radio"
                      name={`weapon-${model.id}`}
                      checked={selectedWeapon?.weaponId === weaponId}
                      onChange={() => handleSelectWeapon(model.id, weaponId, displayName)}
                    />
                    <span className="weapon-option-name">{displayName}</span>
                    {stats && <span className="weapon-option-stats">{stats}</span>}
                  </div>
                );
              })
            )}

            {/* If no equipped wargear, offer a default bolter for preset armies */}
            {weapons.length === 0 && (() => {
              const bolter = lookupWeapon('bolter');
              const bolterName = bolter ? bolter.name : 'Bolter';
              const bolterStats = bolter ? formatWeaponStats(bolter) : '24" S4 AP5 Rapid Fire';
              return (
                <div className="weapon-option">
                  <input
                    type="radio"
                    name={`weapon-${model.id}`}
                    checked={selectedWeapon?.weaponId === 'bolter'}
                    onChange={() => handleSelectWeapon(model.id, 'bolter', bolterName)}
                  />
                  <span className="weapon-option-name">{bolterName}</span>
                  <span className="weapon-option-stats">{bolterStats}</span>
                </div>
              );
            })()}

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
