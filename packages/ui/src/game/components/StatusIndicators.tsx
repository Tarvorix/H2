/**
 * StatusIndicators
 *
 * Visual status indicators rendered on or near models to show current tactical statuses.
 * Used in the game sidebar and as canvas overlay information.
 *
 * Status colors:
 * - Pinned: yellow
 * - Suppressed: orange
 * - Stunned: red
 * - Routed: white
 * - Locked in Combat: purple
 * - In Reserves: grey
 */

import { TacticalStatus } from '@hh/types';

interface StatusBadgeProps {
  status: TacticalStatus;
}

const STATUS_CONFIG: Record<TacticalStatus, { label: string; className: string }> = {
  [TacticalStatus.Pinned]: { label: 'PINNED', className: 'pinned' },
  [TacticalStatus.Suppressed]: { label: 'SUPPRESSED', className: 'suppressed' },
  [TacticalStatus.Stunned]: { label: 'STUNNED', className: 'stunned' },
  [TacticalStatus.Routed]: { label: 'ROUTED', className: 'routed' },
  [TacticalStatus.Stupefied]: { label: 'STUPEFIED', className: 'stupefied' },
  [TacticalStatus.LostToTheNails]: { label: 'LOST TO THE NAILS', className: 'lost-to-the-nails' },
};

/**
 * A single status badge showing the tactical status name.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span className={`unit-card-status-badge ${config.className}`}>
      {config.label}
    </span>
  );
}

/**
 * A row of status badges for all statuses on a unit.
 */
export function StatusBadgeRow({ statuses }: { statuses: TacticalStatus[] }) {
  if (statuses.length === 0) return null;

  return (
    <div className="unit-card-statuses">
      {statuses.map(status => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  );
}

/**
 * Combat lock indicator.
 */
export function CombatLockBadge() {
  return (
    <span className="unit-card-status-badge locked-in-combat">
      LOCKED IN COMBAT
    </span>
  );
}

/**
 * Reserves indicator.
 */
export function ReservesBadge() {
  return (
    <span className="unit-card-status-badge in-reserves">
      IN RESERVES
    </span>
  );
}

/**
 * Movement state indicator for the unit card.
 */
export function MovementStateBadge({ movementState }: { movementState: string }) {
  const colors: Record<string, string> = {
    Stationary: '#94a3b8',
    Moved: '#60a5fa',
    Rushed: '#f87171',
    EnteredFromReserves: '#34d399',
    FellBack: '#ef4444',
  };

  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color: colors[movementState] ?? '#6b7fa0',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>
      {movementState}
    </span>
  );
}

/**
 * Wound tracker for individual models.
 */
export function WoundTracker({ current, max }: { current: number; max: number }) {
  if (max <= 1) return null;

  const pips: boolean[] = [];
  for (let i = 0; i < max; i++) {
    pips.push(i < current);
  }

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {pips.map((alive, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: alive ? '#22c55e' : '#ef4444',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: '#6b7fa0', marginLeft: 4 }}>
        {current}/{max}
      </span>
    </div>
  );
}
