/**
 * FactionSelector
 *
 * Dropdowns for selecting faction, allegiance, and Rite of War.
 */

import { useCallback, useMemo } from 'react';
import { LegionFaction, Allegiance } from '@hh/types';
import type { ArmyList } from '@hh/types';
import { getRitesForLegion, getMvpLegions } from '@hh/data';

interface FactionSelectorProps {
  armyList: ArmyList | null;
  playerIndex: number;
  selectedRiteId: string | null;
  onFactionChange: (faction: LegionFaction) => void;
  onAllegianceChange: (allegiance: Allegiance) => void;
  onPointsLimitChange: (limit: number) => void;
  onRiteChange: (riteId: string | null) => void;
}

const MVP_FACTIONS = getMvpLegions();
const POINTS_PRESETS = [1500, 2000, 2500, 3000, 3500, 4000, 5000];

export function FactionSelector({
  armyList,
  playerIndex,
  selectedRiteId,
  onFactionChange,
  onAllegianceChange,
  onPointsLimitChange,
  onRiteChange,
}: FactionSelectorProps) {
  const handleFactionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFactionChange(e.target.value as LegionFaction);
    },
    [onFactionChange],
  );

  const handleAllegianceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onAllegianceChange(e.target.value as Allegiance);
    },
    [onAllegianceChange],
  );

  const handlePointsChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onPointsLimitChange(Number(e.target.value));
    },
    [onPointsLimitChange],
  );

  const handleRiteChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      onRiteChange(val || null);
    },
    [onRiteChange],
  );

  const availableRites = useMemo(() => {
    if (!armyList?.faction) return [];
    return getRitesForLegion(armyList.faction);
  }, [armyList?.faction]);

  return (
    <div className="faction-selector">
      <div className="faction-selector-row">
        <label className="faction-label">Faction</label>
        <select
          className="faction-select"
          value={armyList?.faction ?? ''}
          onChange={handleFactionChange}
        >
          <option value="" disabled>Select Faction...</option>
          {MVP_FACTIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      <div className="faction-selector-row">
        <label className="faction-label">Allegiance</label>
        <select
          className="faction-select"
          value={armyList?.allegiance ?? ''}
          onChange={handleAllegianceChange}
        >
          <option value={Allegiance.Loyalist}>Loyalist</option>
          <option value={Allegiance.Traitor}>Traitor</option>
        </select>
      </div>

      <div className="faction-selector-row">
        <label className="faction-label">Points Limit</label>
        <select
          className="faction-select"
          value={armyList?.pointsLimit ?? 2000}
          onChange={handlePointsChange}
        >
          {POINTS_PRESETS.map((pts) => (
            <option key={pts} value={pts}>{pts} pts</option>
          ))}
        </select>
      </div>

      {availableRites.length > 0 && (
        <div className="faction-selector-row">
          <label className="faction-label">Rite of War</label>
          <select
            className="faction-select"
            value={selectedRiteId ?? ''}
            onChange={handleRiteChange}
          >
            <option value="">None</option>
            {availableRites.map((rite) => (
              <option key={rite.id} value={rite.id}>{rite.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="faction-selector-row">
        <label className="faction-label">Player {playerIndex + 1}</label>
        <span className="faction-value">
          {armyList?.faction ?? 'Not selected'}
        </span>
      </div>
    </div>
  );
}
