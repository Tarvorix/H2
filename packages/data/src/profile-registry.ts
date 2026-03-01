/**
 * Profile Registry — Singleton registry for unit profiles.
 *
 * Auto-initialized from the generated unit profiles data file.
 * Provides lookup functions used by both the UI (army builder) and the engine (game queries).
 */

import type { UnitProfile } from '@hh/types';
import { BattlefieldRole, LegionFaction } from '@hh/types';
import { MVP_UNIT_PROFILES } from './generated/mvp-unit-profiles';

// ─── Registry State (auto-initialized at module load) ───────────────────────

const _allProfiles: UnitProfile[] = MVP_UNIT_PROFILES;

const _profileById: Map<string, UnitProfile> = new Map();
const _profilesByRole: Map<BattlefieldRole, UnitProfile[]> = new Map();

// Build lookup maps
for (const profile of _allProfiles) {
  _profileById.set(profile.id, profile);

  const roleProfiles = _profilesByRole.get(profile.battlefieldRole) || [];
  roleProfiles.push(profile);
  _profilesByRole.set(profile.battlefieldRole, roleProfiles);
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Get all unit profiles.
 */
export function getAllProfiles(): UnitProfile[] {
  return _allProfiles;
}

/**
 * Get a unit profile by its unique ID.
 */
export function getProfileById(id: string): UnitProfile | undefined {
  return _profileById.get(id);
}

/**
 * Get all unit profiles with a specific battlefield role.
 */
export function getProfilesByRole(role: BattlefieldRole): UnitProfile[] {
  return _profilesByRole.get(role) || [];
}

/**
 * Get all unit profiles that belong to a specific faction.
 *
 * A profile belongs to a faction if it has a matching Faction trait,
 * or if it has a "Legiones Astartes" trait (generic units available to all legions).
 */
export function getProfilesByFaction(faction: LegionFaction): UnitProfile[] {
  return _allProfiles.filter(profile => {
    const hasFactionTrait = profile.traits.some(
      t => t.category === 'Faction' && (t.value === faction || t.value === 'Legiones Astartes')
    );
    // If no faction trait at all, it's a generic unit available to everyone
    const hasAnyFactionTrait = profile.traits.some(t => t.category === 'Faction');
    return hasFactionTrait || !hasAnyFactionTrait;
  });
}

/**
 * Get profiles filtered by both faction and battlefield role.
 */
export function getProfilesByFactionAndRole(
  faction: LegionFaction,
  role: BattlefieldRole,
): UnitProfile[] {
  return getProfilesByFaction(faction).filter(p => p.battlefieldRole === role);
}

/**
 * Search profiles by name (case-insensitive partial match).
 */
export function searchProfiles(query: string): UnitProfile[] {
  if (!query || query.trim() === '') return _allProfiles;
  const lower = query.toLowerCase();
  return _allProfiles.filter(p => p.name.toLowerCase().includes(lower));
}

/**
 * Get the total number of loaded profiles.
 */
export function getProfileCount(): number {
  return _allProfiles.length;
}
