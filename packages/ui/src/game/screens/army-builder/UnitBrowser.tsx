/**
 * UnitBrowser
 *
 * Center panel showing available units filtered by slot role.
 * Searchable, shows points, stats, and unit type.
 */

import { useCallback, useMemo } from 'react';
import type { BattlefieldRole, LegionFaction } from '@hh/types';
import { getProfilesByFaction, getAllProfiles } from '@hh/data';

interface UnitBrowserEntry {
  id: string;
  name: string;
  unitType: string;
  basePoints: number;
  pointsPerAdditionalModel: number;
  minModels: number;
  maxModels: number;
  battlefieldRole: BattlefieldRole;
}

interface UnitBrowserProps {
  /** The battlefield role to filter by (from the selected slot) */
  filterRole: BattlefieldRole | null;
  /** Search text filter */
  searchFilter: string;
  /** Faction to filter profiles for */
  faction: LegionFaction | null;
  /** Callback when a unit is selected */
  onSelectUnit: (profileId: string) => void;
  /** Callback when search text changes */
  onSearchChange: (filter: string) => void;
}

export function UnitBrowser({
  filterRole,
  searchFilter,
  faction,
  onSelectUnit,
  onSearchChange,
}: UnitBrowserProps) {
  // Load real unit profiles from the profile registry
  const allProfiles: UnitBrowserEntry[] = useMemo(() => {
    const profiles = faction ? getProfilesByFaction(faction) : getAllProfiles();
    return profiles.map(p => ({
      id: p.id,
      name: p.name,
      unitType: p.unitType,
      basePoints: p.basePoints,
      pointsPerAdditionalModel: p.pointsPerAdditionalModel,
      minModels: p.minModels,
      maxModels: p.maxModels,
      battlefieldRole: p.battlefieldRole,
    }));
  }, [faction]);

  const filteredProfiles = useMemo(() => {
    let profiles = allProfiles;

    // Filter by battlefield role (from selected slot)
    if (filterRole) {
      profiles = profiles.filter(p => p.battlefieldRole === filterRole);
    }

    // Filter by search text
    if (searchFilter.trim()) {
      const lower = searchFilter.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.id.toLowerCase().includes(lower),
      );
    }

    return profiles;
  }, [allProfiles, filterRole, searchFilter]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange],
  );

  return (
    <div className="unit-browser">
      <div className="panel-title">
        Unit Browser
        {filterRole && (
          <span className="unit-browser-role-filter"> — {filterRole}</span>
        )}
      </div>

      <div className="unit-browser-search">
        <input
          type="text"
          className="panel-input"
          placeholder="Search units..."
          value={searchFilter}
          onChange={handleSearchChange}
        />
      </div>

      <div className="unit-browser-list">
        {filteredProfiles.length === 0 ? (
          <div className="unit-browser-empty">
            {searchFilter
              ? 'No units match your search.'
              : filterRole
                ? `No units available for ${filterRole} role.`
                : 'Select a slot to browse available units.'}
          </div>
        ) : (
          filteredProfiles.map((profile) => (
            <div
              key={profile.id}
              className="unit-browser-item"
              onClick={() => onSelectUnit(profile.id)}
              role="button"
              tabIndex={0}
            >
              <div className="unit-browser-item-name">{profile.name}</div>
              <div className="unit-browser-item-details">
                <span className="unit-browser-item-type">{profile.unitType}</span>
                <span className="unit-browser-item-points">
                  {profile.basePoints}pts
                  {profile.pointsPerAdditionalModel > 0 &&
                    ` (+${profile.pointsPerAdditionalModel}/model)`}
                </span>
              </div>
              <div className="unit-browser-item-stats">
                {profile.minModels}-{profile.maxModels} models
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
