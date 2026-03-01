#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const HH_UNITS_PATH = path.join(ROOT, 'HH_v2_units.md');
const GENERATED_PROFILES_PATH = path.join(ROOT, 'packages', 'data', 'src', 'generated', 'unit-profiles.ts');

const CONTENT_DIR = path.join(ROOT, 'content');
const UNITS_DIR = path.join(CONTENT_DIR, 'units');
const INDEXES_DIR = path.join(CONTENT_DIR, 'indexes');
const MVP_GENERATED_PROFILES_PATH = path.join(
  ROOT,
  'packages',
  'data',
  'src',
  'generated',
  'mvp-unit-profiles.ts',
);

const LEGIONS = ['world-eaters', 'alpha-legion', 'dark-angels'];
const LEGION_HEADER_TO_KEY = {
  'world eaters': 'world-eaters',
  'alpha legion': 'alpha-legion',
  'dark angels': 'dark-angels',
};

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

function writeMvpGeneratedProfiles(filePath, profiles) {
  const header = [
    '/**',
    ' * Auto-generated MVP unit profiles data.',
    ' * Source: HH_v2_units.md Profile ID whitelist + generated/unit-profiles.ts',
    ' * DO NOT EDIT BY HAND - re-generate via `pnpm content:build`.',
    ` * ${profiles.length} MVP unit profiles.`,
    ' */',
    '',
    "import type { UnitProfile } from '@hh/types';",
    '',
    '// eslint-disable-next-line @typescript-eslint/no-explicit-any',
    `export const MVP_UNIT_PROFILES: UnitProfile[] = ${JSON.stringify(profiles)} as any;`,
    '',
  ].join('\n');

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, header, 'utf8');
}

function normalizeAnchor(anchor) {
  return anchor.trim().toLowerCase();
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

function parseUnitSheets(markdown) {
  const chunks = markdown.split(/<a id="([^"]+)"><\/a>/g);
  const byAnchor = new Map();

  for (let i = 1; i < chunks.length; i += 2) {
    const anchorId = normalizeAnchor(chunks[i]);
    const sectionText = chunks[i + 1] ?? '';

    const nameMatch = sectionText.match(/^\s*####\s+(.+?)\s*$/m);
    const profileIdMatch = sectionText.match(/- Profile ID:\s*`([^`]+)`/m);
    if (!profileIdMatch) {
      continue;
    }

    byAnchor.set(anchorId, {
      anchorId,
      name: nameMatch ? nameMatch[1].trim() : '',
      profileId: profileIdMatch[1].trim(),
    });
  }

  return byAnchor;
}

function parseLegionAnchorsFromToc(markdown) {
  const tocText = markdown.split('## Unit Sheets')[0];
  const lines = tocText.split(/\r?\n/);
  const anchorsByLegion = {
    'world-eaters': new Set(),
    'alpha-legion': new Set(),
    'dark-angels': new Set(),
  };

  let currentLegion = null;

  for (const line of lines) {
    const headerMatch = line.match(/^###\s+(.+?)\s*$/);
    if (headerMatch) {
      const normalizedHeader = headerMatch[1].trim().toLowerCase();
      currentLegion = LEGION_HEADER_TO_KEY[normalizedHeader] ?? null;
      continue;
    }

    if (!currentLegion) {
      continue;
    }

    const linkMatch = line.match(/- \[[^\]]+\]\(#([^)]+)\)/);
    if (!linkMatch) {
      continue;
    }

    anchorsByLegion[currentLegion].add(normalizeAnchor(linkMatch[1]));
  }

  return anchorsByLegion;
}

function toSortedArray(values) {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function getFolderForUnit(unitId, legionSpecificIds) {
  if (legionSpecificIds['world-eaters'].has(unitId)) return 'world-eaters';
  if (legionSpecificIds['alpha-legion'].has(unitId)) return 'alpha-legion';
  if (legionSpecificIds['dark-angels'].has(unitId)) return 'dark-angels';
  return 'common';
}

function main() {
  const hhUnitsMarkdown = readText(HH_UNITS_PATH);
  const generatedProfilesTs = readText(GENERATED_PROFILES_PATH);

  const allProfiles = parseGeneratedProfiles(generatedProfilesTs);
  const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));

  const sheetsByAnchor = parseUnitSheets(hhUnitsMarkdown);
  if (sheetsByAnchor.size === 0) {
    throw new Error('No unit sheets with "Profile ID" were parsed from HH_v2_units.md.');
  }

  const legionAnchors = parseLegionAnchorsFromToc(hhUnitsMarkdown);
  const legionSpecificIds = {
    'world-eaters': new Set(),
    'alpha-legion': new Set(),
    'dark-angels': new Set(),
  };
  const skippedLegionAnchors = [];

  for (const legion of LEGIONS) {
    for (const anchorId of legionAnchors[legion]) {
      const sheet = sheetsByAnchor.get(anchorId);
      if (!sheet) {
        skippedLegionAnchors.push({ legion, anchorId });
        continue;
      }
      legionSpecificIds[legion].add(sheet.profileId);
    }
  }

  const whitelistIds = toSortedArray(
    new Set(Array.from(sheetsByAnchor.values()).map((sheet) => sheet.profileId)),
  );
  const whitelistSet = new Set(whitelistIds);

  const missingFromGenerated = whitelistIds.filter((id) => !profileById.has(id));
  if (missingFromGenerated.length > 0) {
    throw new Error(
      `Missing ${missingFromGenerated.length} profile(s) from generated unit-profiles.ts: ${missingFromGenerated.join(', ')}`,
    );
  }

  ensureDir(path.join(UNITS_DIR, 'common'));
  ensureDir(path.join(UNITS_DIR, 'world-eaters'));
  ensureDir(path.join(UNITS_DIR, 'alpha-legion'));
  ensureDir(path.join(UNITS_DIR, 'dark-angels'));
  ensureDir(INDEXES_DIR);

  const unitIndex = {};

  for (const unitId of whitelistIds) {
    const profile = profileById.get(unitId);
    const folder = getFolderForUnit(unitId, legionSpecificIds);
    const relativePath = path.posix.join('content', 'units', folder, `${unitId}.json`);
    const absolutePath = path.join(ROOT, relativePath);

    writeJson(absolutePath, profile);

    unitIndex[unitId] = {
      path: relativePath,
      role: profile.battlefieldRole,
      legionTags: folder === 'common' ? [] : [folder],
    };
  }

  const commonIds = whitelistIds.filter(
    (unitId) =>
      !legionSpecificIds['world-eaters'].has(unitId) &&
      !legionSpecificIds['alpha-legion'].has(unitId) &&
      !legionSpecificIds['dark-angels'].has(unitId),
  );

  const legionIndex = {};
  for (const legion of LEGIONS) {
    const allowedUnitIds = toSortedArray(
      new Set([...commonIds, ...legionSpecificIds[legion]]),
    );
    const invalidAllowed = allowedUnitIds.filter((id) => !whitelistSet.has(id));
    if (invalidAllowed.length > 0) {
      throw new Error(
        `Legion index for "${legion}" includes ids outside whitelist: ${invalidAllowed.join(', ')}`,
      );
    }

    legionIndex[legion] = {
      allowedUnitIds,
      allowedRules: [],
      allowedWargearLists: [],
    };
  }

  writeJson(path.join(INDEXES_DIR, 'unit-index.json'), unitIndex);
  writeJson(path.join(INDEXES_DIR, 'legion-index.json'), legionIndex);
  writeJson(path.join(INDEXES_DIR, 'mvp-whitelist.json'), whitelistIds);
  writeMvpGeneratedProfiles(
    MVP_GENERATED_PROFILES_PATH,
    whitelistIds.map((unitId) => profileById.get(unitId)),
  );

  const counts = {
    totalUnits: whitelistIds.length,
    commonUnits: commonIds.length,
    worldEatersSpecific: legionSpecificIds['world-eaters'].size,
    alphaLegionSpecific: legionSpecificIds['alpha-legion'].size,
    darkAngelsSpecific: legionSpecificIds['dark-angels'].size,
  };

  console.log('content:build complete');
  if (skippedLegionAnchors.length > 0) {
    console.log(
      `Skipped ${skippedLegionAnchors.length} legion TOC link(s) without Profile ID sheets: ${skippedLegionAnchors.map((x) => `#${x.anchorId}`).join(', ')}`,
    );
  }
  console.log(JSON.stringify(counts, null, 2));
}

main();
