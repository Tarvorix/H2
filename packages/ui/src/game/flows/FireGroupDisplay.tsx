/**
 * FireGroupDisplay
 *
 * Displays the fire groups formed during a shooting attack.
 * Shows weapon stats, number of attacks, and resolution results.
 */

import type { ShootingFireGroup } from '@hh/types';

interface FireGroupDisplayProps {
  fireGroups: ShootingFireGroup[];
  currentIndex: number;
}

export function FireGroupDisplay({ fireGroups, currentIndex }: FireGroupDisplayProps) {
  if (fireGroups.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#6b7fa0', padding: '8px 0' }}>
        No fire groups formed.
      </div>
    );
  }

  return (
    <div>
      {fireGroups.map((fg, i) => {
        const isActive = i === currentIndex;
        const isResolved = fg.resolved;

        return (
          <div
            key={i}
            className="fire-group-display"
            style={{
              borderColor: isActive ? '#3b82f6' : isResolved ? '#1e2a3f' : '#2a3a4f',
              opacity: isResolved ? 0.7 : 1,
            }}
          >
            <div className="fire-group-header">
              <div className="fire-group-name">
                {isActive && '▶ '}
                Fire Group {i + 1}: {fg.weaponName}
                {fg.profileName && ` (${fg.profileName})`}
                {isResolved && ' ✓'}
              </div>
              <div className="fire-group-stats">
                {fg.totalFirepower} shots
                {fg.isSnapShot && ' (Snap Shot)'}
              </div>
            </div>

            <div className="fire-group-detail">
              S{fg.weaponStrength} | AP{fg.weaponAP ?? '-'} | D{fg.weaponDamage} | Range {fg.weaponRange}"
            </div>
            <div className="fire-group-detail">
              BS{fg.ballisticSkill} | {fg.attacks.length} model{fg.attacks.length !== 1 ? 's' : ''} firing
            </div>

            {/* Special rules */}
            {fg.specialRules.length > 0 && (
              <div className="fire-group-detail" style={{ color: '#a78bfa' }}>
                {fg.specialRules.map(r => r.name).join(', ')}
              </div>
            )}

            {/* Traits */}
            {fg.traits.length > 0 && (
              <div className="fire-group-detail" style={{ color: '#60a5fa' }}>
                {fg.traits.join(', ')}
              </div>
            )}

            {/* Results (if resolved) */}
            {isResolved && (
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #1e2a3f' }}>
                <div className="fire-group-detail">
                  Hits: <span style={{ color: '#22c55e' }}>
                    {fg.hits.filter(h => h.isHit).length}
                  </span> / {fg.hits.length}
                </div>
                <div className="fire-group-detail">
                  Wounds: <span style={{ color: '#f87171' }}>
                    {fg.wounds.filter(w => w.isWound).length}
                  </span> / {fg.wounds.length}
                </div>
                {fg.penetratingHits.length > 0 && (
                  <div className="fire-group-detail">
                    Penetrating Hits: <span style={{ color: '#ef4444' }}>
                      {fg.penetratingHits.filter(p => p.isPenetrating).length}
                    </span>
                  </div>
                )}
                {fg.glancingHits.length > 0 && (
                  <div className="fire-group-detail">
                    Glancing Hits: <span style={{ color: '#fbbf24' }}>
                      {fg.glancingHits.length}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
