/**
 * CombatLog Panel
 *
 * Scrolling log of all game events with dice roll details.
 * Filterable by category. Auto-scrolls to latest entry.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { CombatLogEntry, CombatLogCategory, GameUIAction } from '../types';

interface CombatLogProps {
  entries: CombatLogEntry[];
  filter: CombatLogCategory | 'all';
  dispatch: React.Dispatch<GameUIAction>;
}

const CATEGORY_COLORS: Record<CombatLogCategory, string> = {
  movement: '#60a5fa',
  shooting: '#f87171',
  assault: '#fb923c',
  morale: '#a78bfa',
  reaction: '#34d399',
  status: '#fbbf24',
  phase: '#94a3b8',
  system: '#e2e8f0',
};

const FILTER_OPTIONS: { value: CombatLogCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movement', label: 'Move' },
  { value: 'shooting', label: 'Shoot' },
  { value: 'assault', label: 'Assault' },
  { value: 'morale', label: 'Morale' },
  { value: 'reaction', label: 'React' },
  { value: 'status', label: 'Status' },
  { value: 'phase', label: 'Phase' },
];

export function CombatLog({ entries, filter, dispatch }: CombatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter(e => e.category === filter);

  const handleFilterChange = useCallback(
    (newFilter: CombatLogCategory | 'all') => {
      dispatch({ type: 'SET_COMBAT_LOG_FILTER', filter: newFilter });
    },
    [dispatch],
  );

  return (
    <div className="panel-section combat-log">
      <div className="panel-title">Combat Log</div>

      {/* Filter Bar */}
      <div className="combat-log-filters">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`combat-log-filter-btn ${filter === opt.value ? 'active' : ''}`}
            onClick={() => handleFilterChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Log Entries */}
      <div className="combat-log-entries" ref={scrollRef}>
        {filteredEntries.length === 0 ? (
          <div className="combat-log-empty">No events yet</div>
        ) : (
          filteredEntries.map(entry => (
            <div
              key={entry.id}
              className={`combat-log-entry ${entry.isImportant ? 'combat-log-important' : ''}`}
            >
              <div className="combat-log-entry-header">
                <span
                  className="combat-log-category"
                  style={{ color: CATEGORY_COLORS[entry.category] }}
                >
                  {entry.category.toUpperCase()}
                </span>
                <span className="combat-log-turn">T{entry.battleTurn}</span>
              </div>
              <div className="combat-log-message">{entry.message}</div>
              {entry.diceRolls.length > 0 && (
                <div className="combat-log-dice">
                  {entry.diceRolls.map((roll, i) => (
                    <div key={i} className="combat-log-dice-roll">
                      <span className="combat-log-dice-label">{roll.label}:</span>
                      <span className="combat-log-dice-values">
                        {roll.values.map((v, j) => (
                          <span
                            key={j}
                            className={`combat-log-die ${
                              roll.passedIndices.includes(j)
                                ? 'die-pass'
                                : roll.failedIndices.includes(j)
                                  ? 'die-fail'
                                  : ''
                            }`}
                          >
                            {v}
                          </span>
                        ))}
                      </span>
                      <span className="combat-log-dice-summary">{roll.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
