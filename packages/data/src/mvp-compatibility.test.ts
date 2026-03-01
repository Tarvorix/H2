import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMvpLegion, MVP_LEGIONS } from './mvp-scope';
import { ALL_DETACHMENT_TEMPLATES } from './detachment-layouts';
import { getAllProfiles } from './profile-registry';

interface LegionIndexEntry {
  allowedUnitIds: string[];
}

type LegionIndexFile = Record<string, LegionIndexEntry>;

function getWorkspaceRoot(): string {
  return process.cwd();
}

function readJsonFile<T>(relativePath: string): T {
  const absolutePath = path.resolve(getWorkspaceRoot(), relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as T;
}

function factionToLegionKey(faction: string): string {
  return faction.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

describe('MVP compatibility guards', () => {
  it('keeps runtime profile registry synchronized with generated MVP whitelist', () => {
    const whitelistIds = readJsonFile<string[]>('content/indexes/mvp-whitelist.json');
    const runtimeIds = getAllProfiles().map((profile) => profile.id);

    const whitelistSet = new Set(whitelistIds);
    const runtimeSet = new Set(runtimeIds);

    const missingFromRuntime = whitelistIds.filter((id) => !runtimeSet.has(id));
    const missingFromWhitelist = runtimeIds.filter((id) => !whitelistSet.has(id));

    expect(missingFromRuntime).toEqual([]);
    expect(missingFromWhitelist).toEqual([]);
    expect(runtimeSet.size).toBe(whitelistSet.size);
  });

  it('ensures every MVP unit role is placeable in at least one detachment slot', () => {
    const slotRoles = new Set(
      ALL_DETACHMENT_TEMPLATES.flatMap((template) =>
        template.slots.map((slot) => slot.role),
      ),
    );

    const unplaceable = getAllProfiles()
      .filter((profile) => !slotRoles.has(profile.battlefieldRole))
      .map((profile) => `${profile.id}:${profile.battlefieldRole}`);

    expect(unplaceable).toEqual([]);
  });

  it('keeps legion index gating aligned with faction-specific profile traits', () => {
    const legionIndex = readJsonFile<LegionIndexFile>('content/indexes/legion-index.json');
    const profiles = getAllProfiles();
    const mvpLegionKeys = MVP_LEGIONS.map((legion) => factionToLegionKey(legion));

    for (const legionKey of mvpLegionKeys) {
      expect(legionIndex[legionKey]).toBeDefined();
    }

    const missingAllowedEntries: string[] = [];
    const leakedEntries: string[] = [];

    for (const profile of profiles) {
      const factionTraits = profile.traits
        .filter((trait) => trait.category === 'Faction' && isMvpLegion(trait.value))
        .map((trait) => trait.value);

      const specificLegionKeys = factionTraits.map((faction) => factionToLegionKey(faction));
      const isGenericToMvp = specificLegionKeys.length === 0;

      for (const legionKey of mvpLegionKeys) {
        const allowedIds = new Set(legionIndex[legionKey]?.allowedUnitIds ?? []);
        const hasProfile = allowedIds.has(profile.id);
        const shouldHaveProfile =
          isGenericToMvp || specificLegionKeys.includes(legionKey);

        if (shouldHaveProfile && !hasProfile) {
          missingAllowedEntries.push(`${legionKey}:${profile.id}`);
        } else if (!shouldHaveProfile && hasProfile) {
          leakedEntries.push(`${legionKey}:${profile.id}`);
        }
      }
    }

    expect(missingAllowedEntries).toEqual([]);
    expect(leakedEntries).toEqual([]);
  });
});
