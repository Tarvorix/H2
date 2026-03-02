import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LegionFaction } from '@hh/types';
import { getCuratedLegions } from './faction-scope';
import { ALL_DETACHMENT_TEMPLATES } from './detachment-layouts';
import { getAllProfiles } from './profile-registry';

interface LegionIndexEntry {
  allowedUnitIds: string[];
}

type LegionIndexFile = Record<string, LegionIndexEntry>;

const LEGION_TO_KEY: Record<LegionFaction, string> = {
  [LegionFaction.DarkAngels]: 'dark-angels',
  [LegionFaction.EmperorsChildren]: 'emperors-children',
  [LegionFaction.IronWarriors]: 'iron-warriors',
  [LegionFaction.WhiteScars]: 'white-scars',
  [LegionFaction.SpaceWolves]: 'space-wolves',
  [LegionFaction.ImperialFists]: 'imperial-fists',
  [LegionFaction.NightLords]: 'night-lords',
  [LegionFaction.BloodAngels]: 'blood-angels',
  [LegionFaction.IronHands]: 'iron-hands',
  [LegionFaction.WorldEaters]: 'world-eaters',
  [LegionFaction.Ultramarines]: 'ultramarines',
  [LegionFaction.DeathGuard]: 'death-guard',
  [LegionFaction.ThousandSons]: 'thousand-sons',
  [LegionFaction.SonsOfHorus]: 'sons-of-horus',
  [LegionFaction.WordBearers]: 'word-bearers',
  [LegionFaction.Salamanders]: 'salamanders',
  [LegionFaction.RavenGuard]: 'raven-guard',
  [LegionFaction.AlphaLegion]: 'alpha-legion',
};

function getWorkspaceRoot(): string {
  return process.cwd();
}

function readJsonFile<T>(relativePath: string): T {
  const absolutePath = path.resolve(getWorkspaceRoot(), relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as T;
}

describe('profile compatibility guards', () => {
  it('keeps runtime profile registry synchronized with generated unit whitelist', () => {
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

  it('ensures every runtime unit role is placeable in at least one detachment slot', () => {
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
    const legionKeys = getCuratedLegions().map((legion) => LEGION_TO_KEY[legion]);
    const allLegionNames = new Set(Object.values(LegionFaction));

    for (const legionKey of legionKeys) {
      expect(legionIndex[legionKey]).toBeDefined();
    }

    const missingAllowedEntries: string[] = [];
    const leakedEntries: string[] = [];

    for (const profile of profiles) {
      const allFactionTraits = profile.traits
        .filter((trait) => trait.category === 'Faction')
        .map((trait) => trait.value);

      const hasOnlyLegionFactionTraits = allFactionTraits.every((value) =>
        allLegionNames.has(value as LegionFaction),
      );
      if (!hasOnlyLegionFactionTraits) {
        continue;
      }

      const factionTraits = allFactionTraits
        .filter((value) => allLegionNames.has(value as LegionFaction))
        .map((value) => value as LegionFaction);

      const specificLegionKeys = factionTraits.map((faction) => LEGION_TO_KEY[faction]);
      const isGeneric = allFactionTraits.length === 0;

      for (const legionKey of legionKeys) {
        const allowedIds = new Set(legionIndex[legionKey]?.allowedUnitIds ?? []);
        const hasProfile = allowedIds.has(profile.id);
        const shouldHaveProfile = isGeneric || specificLegionKeys.includes(legionKey);

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
