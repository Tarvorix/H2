#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const GENERATED_PROFILES_PATH = path.join(
  ROOT,
  'packages',
  'data',
  'src',
  'generated',
  'unit-profiles.ts',
);

const CONTENT_DIR = path.join(ROOT, 'content');
const UNITS_DIR = path.join(CONTENT_DIR, 'units');
const INDEXES_DIR = path.join(CONTENT_DIR, 'indexes');

const LEGION_TO_SLUG = {
  'Dark Angels': 'dark-angels',
  "Emperor's Children": 'emperors-children',
  'Iron Warriors': 'iron-warriors',
  'White Scars': 'white-scars',
  'Space Wolves': 'space-wolves',
  'Imperial Fists': 'imperial-fists',
  'Night Lords': 'night-lords',
  'Blood Angels': 'blood-angels',
  'Iron Hands': 'iron-hands',
  'World Eaters': 'world-eaters',
  Ultramarines: 'ultramarines',
  'Death Guard': 'death-guard',
  'Thousand Sons': 'thousand-sons',
  'Sons of Horus': 'sons-of-horus',
  'Word Bearers': 'word-bearers',
  Salamanders: 'salamanders',
  'Raven Guard': 'raven-guard',
  'Alpha Legion': 'alpha-legion',
};

const LEGIONS = Object.values(LEGION_TO_SLUG);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseGeneratedProfiles(tsContent) {
  const marker = 'export const ALL_UNIT_PROFILES: UnitProfile[] = ';
  const start = tsContent.indexOf(marker);
  if (start === -1) {
    throw new Error(`Could not find "${marker}" in generated unit profiles file.`);
  }

  const startJson = start + marker.length;
  const endJson = tsContent.lastIndexOf(' as any;');
  if (endJson === -1 || endJson <= startJson) {
    throw new Error('Could not locate terminating "as any;" marker in generated unit profiles file.');
  }

  const jsonText = tsContent.slice(startJson, endJson).trim();
  return JSON.parse(jsonText);
}

function toSortedArray(values) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function getLegionTagsForProfile(profile) {
  const tags = new Set();
  for (const trait of profile.traits ?? []) {
    if (trait?.category !== 'Faction' || typeof trait.value !== 'string') continue;
    const legionSlug = LEGION_TO_SLUG[trait.value];
    if (legionSlug) {
      tags.add(legionSlug);
    }
  }
  return toSortedArray(tags);
}

function main() {
  const generatedProfilesTs = readText(GENERATED_PROFILES_PATH);
  const allProfiles = parseGeneratedProfiles(generatedProfilesTs);

  fs.rmSync(UNITS_DIR, { recursive: true, force: true });
  ensureDir(path.join(UNITS_DIR, 'common'));
  for (const legion of LEGIONS) {
    ensureDir(path.join(UNITS_DIR, legion));
  }
  ensureDir(INDEXES_DIR);

  const whitelistIds = [];
  const unitIndex = {};
  const legionSpecificIds = Object.fromEntries(LEGIONS.map((legion) => [legion, new Set()]));

  for (const profile of allProfiles) {
    const unitId = profile.id;
    whitelistIds.push(unitId);

    const legionTags = getLegionTagsForProfile(profile);
    const folder = legionTags.length === 1 ? legionTags[0] : 'common';

    for (const legionTag of legionTags) {
      legionSpecificIds[legionTag].add(unitId);
    }

    const relativePath = path.posix.join('content', 'units', folder, `${unitId}.json`);
    const absolutePath = path.join(ROOT, relativePath);

    writeJson(absolutePath, profile);

    unitIndex[unitId] = {
      path: relativePath,
      role: profile.battlefieldRole,
      legionTags,
    };
  }

  const whitelistSorted = toSortedArray(new Set(whitelistIds));
  const commonIds = whitelistSorted.filter((unitId) => {
    const tags = unitIndex[unitId]?.legionTags ?? [];
    return tags.length === 0;
  });

  const legionIndex = {};
  for (const legion of LEGIONS) {
    const allowedUnitIds = toSortedArray(
      new Set([...commonIds, ...legionSpecificIds[legion]]),
    );

    legionIndex[legion] = {
      allowedUnitIds,
      allowedRules: [],
      allowedWargearLists: [],
    };
  }

  writeJson(path.join(INDEXES_DIR, 'unit-index.json'), unitIndex);
  writeJson(path.join(INDEXES_DIR, 'legion-index.json'), legionIndex);
  writeJson(path.join(INDEXES_DIR, 'unit-whitelist.json'), whitelistSorted);

  const legionUnitCounts = Object.fromEntries(
    LEGIONS.map((legion) => [legion, legionSpecificIds[legion].size]),
  );

  console.log('content:build complete');
  console.log(
    JSON.stringify(
      {
        totalUnits: whitelistSorted.length,
        commonUnits: commonIds.length,
        legionSpecific: legionUnitCounts,
      },
      null,
      2,
    ),
  );
}

main();
