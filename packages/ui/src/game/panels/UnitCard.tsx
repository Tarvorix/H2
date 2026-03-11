/**
 * UnitCard Panel
 *
 * Displays detailed information about the selected unit:
 * - Unit name, model count (alive/total)
 * - Full stat line (M/WS/BS/S/T/W/I/A/LD/Sv)
 * - Wargear list with weapon profiles
 * - Current statuses (Pinned/Suppressed/Stunned/Routed)
 * - Wounds remaining per model
 * - Movement state (Stationary/Moved/Rushed)
 * - Special rules
 */

import type { GameState, UnitState, ModelState } from '@hh/types';
import { UnitMovementState } from '@hh/types';
import {
  StatusBadgeRow,
  CombatLockBadge,
  ReservesBadge,
  MovementStateBadge,
  WoundTracker,
} from '../components/StatusIndicators';

interface UnitCardProps {
  gameState: GameState;
  selectedUnitId: string;
}

const MOVEMENT_LABELS: Record<UnitMovementState, string> = {
  [UnitMovementState.Stationary]: 'Stationary',
  [UnitMovementState.Moved]: 'Moved',
  [UnitMovementState.RushDeclared]: 'Rush Declared',
  [UnitMovementState.Rushed]: 'Rushed',
  [UnitMovementState.EnteredFromReserves]: 'From Reserves',
  [UnitMovementState.FellBack]: 'Fell Back',
};

function findUnit(gameState: GameState, unitId: string): UnitState | null {
  for (const army of gameState.armies) {
    const unit = army.units.find(u => u.id === unitId);
    if (unit) return unit;
  }
  return null;
}

function getAliveModels(unit: UnitState): ModelState[] {
  return unit.models.filter(m => !m.isDestroyed);
}

export function UnitCard({ gameState, selectedUnitId }: UnitCardProps) {
  const unit = findUnit(gameState, selectedUnitId);
  if (!unit) {
    return (
      <div className="panel-section">
        <div className="panel-title">Unit Card</div>
        <div className="panel-row">
          <span className="panel-row-label">No unit selected</span>
        </div>
      </div>
    );
  }

  const aliveModels = getAliveModels(unit);
  const totalModels = unit.models.length;

  return (
    <div className="panel-section unit-card">
      <div className="panel-title">Unit Card</div>

      {/* Unit Name */}
      <div className="panel-row">
        <span className="panel-row-label">Unit</span>
        <span className="panel-row-value">{unit.profileId}</span>
      </div>

      {/* Model Count */}
      <div className="panel-row">
        <span className="panel-row-label">Models</span>
        <span className={`panel-row-value ${aliveModels.length < totalModels ? 'error' : ''}`}>
          {aliveModels.length}/{totalModels}
        </span>
      </div>

      {/* Movement State */}
      <div className="panel-row">
        <span className="panel-row-label">Movement</span>
        <span className="panel-row-value">
          <MovementStateBadge movementState={MOVEMENT_LABELS[unit.movementState]} />
        </span>
      </div>

      {/* Statuses */}
      <StatusBadgeRow statuses={unit.statuses} />

      {/* Combat Lock */}
      {unit.isLockedInCombat && (
        <div className="unit-card-statuses">
          <CombatLockBadge />
        </div>
      )}

      {/* Reserves */}
      {unit.isInReserves && (
        <div className="unit-card-statuses">
          <ReservesBadge />
        </div>
      )}

      {/* Wounds per model (for multi-wound models) */}
      {(() => {
        const maxWounds = Math.max(...unit.models.map(m => m.currentWounds), 1);
        if (maxWounds <= 1) return null;
        return (
          <div className="panel-section">
            <div className="panel-title" style={{ fontSize: 10, marginTop: 4 }}>Model Wounds</div>
            {aliveModels.map(m => (
              <div key={m.id} className="panel-row">
                <span className="panel-row-label" style={{ fontSize: 11 }}>
                  {m.profileModelName || m.id}
                </span>
                <span className="panel-row-value">
                  <WoundTracker current={m.currentWounds} max={maxWounds} />
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Wargear */}
      {aliveModels.length > 0 && aliveModels[0].equippedWargear.length > 0 && (
        <div className="panel-section">
          <div className="panel-title" style={{ fontSize: 10, marginTop: 4 }}>Wargear</div>
          {aliveModels[0].equippedWargear.map((wg, i) => (
            <div key={i} className="panel-row">
              <span className="panel-row-label" style={{ fontSize: 11 }}>{wg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
