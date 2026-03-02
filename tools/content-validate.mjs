#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CONTENT_DIR = path.join(ROOT, 'content');
const UNITS_DIR = path.join(CONTENT_DIR, 'units');
const INDEXES_DIR = path.join(CONTENT_DIR, 'indexes');

const UNIT_INDEX_PATH = path.join(INDEXES_DIR, 'unit-index.json');
const LEGION_INDEX_PATH = path.join(INDEXES_DIR, 'legion-index.json');
const WHITELIST_PATH = path.join(INDEXES_DIR, 'mvp-whitelist.json');

const LEGIONS = ['world-eaters', 'alpha-legion', 'dark-angels'];

function fail(message, errors) {
  errors.push(message);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${path.relative(ROOT, filePath)}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function listJsonFilesRecursive(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) {
    return results;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listJsonFilesRecursive(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(abs);
    }
  }

  return results;
}

function unique(items) {
  return new Set(items).size === items.length;
}

function main() {
  const errors = [];

  const unitIndex = readJson(UNIT_INDEX_PATH);
  const legionIndex = readJson(LEGION_INDEX_PATH);
  const whitelist = readJson(WHITELIST_PATH);

  if (!Array.isArray(whitelist)) {
    fail('mvp-whitelist.json must be an array of unit ids.', errors);
  }

  if (!unique(whitelist)) {
    fail('mvp-whitelist.json contains duplicate unit ids.', errors);
  }

  const whitelistSet = new Set(whitelist);

  if (!unitIndex || typeof unitIndex !== 'object' || Array.isArray(unitIndex)) {
    fail('unit-index.json must be an object keyed by unit id.', errors);
  }

  const unitIndexIds = Object.keys(unitIndex);
  for (const unitId of unitIndexIds) {
    if (!whitelistSet.has(unitId)) {
      fail(`unit-index contains out-of-whitelist unit id: ${unitId}`, errors);
    }

    const record = unitIndex[unitId];
    if (!record || typeof record !== 'object') {
      fail(`unit-index entry for "${unitId}" must be an object.`, errors);
      continue;
    }

    if (typeof record.path !== 'string' || record.path.length === 0) {
      fail(`unit-index entry for "${unitId}" is missing a valid "path".`, errors);
      continue;
    }

    const absPath = path.join(ROOT, record.path);
    if (!fs.existsSync(absPath)) {
      fail(`unit-index path does not exist for "${unitId}": ${record.path}`, errors);
    } else if (!absPath.endsWith(`${unitId}.json`)) {
      fail(`unit-index path for "${unitId}" does not match filename "${unitId}.json".`, errors);
    }

    if (!Array.isArray(record.legionTags)) {
      fail(`unit-index entry for "${unitId}" must include legionTags array.`, errors);
    }
  }

  for (const unitId of whitelist) {
    if (!(unitId in unitIndex)) {
      fail(`whitelist unit id missing from unit-index: ${unitId}`, errors);
    }
  }

  const unitFiles = listJsonFilesRecursive(UNITS_DIR);
  const unitFileIds = unitFiles.map((filePath) => path.basename(filePath, '.json'));

  if (!unique(unitFileIds)) {
    fail('Duplicate unit json filenames found in content/units.', errors);
  }

  for (const fileId of unitFileIds) {
    if (!whitelistSet.has(fileId)) {
      fail(`content/units contains out-of-whitelist file: ${fileId}.json`, errors);
    }
  }

  for (const unitId of whitelist) {
    if (!unitFileIds.includes(unitId)) {
      fail(`whitelist unit id missing content file: ${unitId}.json`, errors);
    }
  }

  if (!legionIndex || typeof legionIndex !== 'object' || Array.isArray(legionIndex)) {
    fail('legion-index.json must be an object keyed by legion name.', errors);
  }

  const legionKeys = Object.keys(legionIndex).sort((a, b) => a.localeCompare(b));
  const expectedLegionKeys = [...LEGIONS].sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(legionKeys) !== JSON.stringify(expectedLegionKeys)) {
    fail(
      `legion-index must contain exactly ${expectedLegionKeys.join(', ')}; found ${legionKeys.join(', ') || '(none)'}.`,
      errors,
    );
  }

  const commonIds = unitIndexIds.filter((id) => {
    const tags = Array.isArray(unitIndex[id]?.legionTags) ? unitIndex[id].legionTags : [];
    return tags.length === 0;
  });

  const legionSpecific = {
    'world-eaters': new Set(),
    'alpha-legion': new Set(),
    'dark-angels': new Set(),
  };

  for (const unitId of unitIndexIds) {
    const tags = Array.isArray(unitIndex[unitId]?.legionTags) ? unitIndex[unitId].legionTags : [];
    for (const tag of tags) {
      if (LEGIONS.includes(tag)) {
        legionSpecific[tag].add(unitId);
      }
    }
  }

  for (const legion of LEGIONS) {
    const entry = legionIndex[legion];
    if (!entry || typeof entry !== 'object') {
      fail(`Missing or invalid legion entry for "${legion}".`, errors);
      continue;
    }

    const allowedUnitIds = entry.allowedUnitIds;
    if (!Array.isArray(allowedUnitIds)) {
      fail(`legion-index "${legion}" must include allowedUnitIds array.`, errors);
      continue;
    }

    if (!unique(allowedUnitIds)) {
      fail(`legion-index "${legion}" contains duplicate allowedUnitIds.`, errors);
    }

    const allowedSet = new Set(allowedUnitIds);
    for (const unitId of allowedUnitIds) {
      if (!whitelistSet.has(unitId)) {
        fail(`legion-index "${legion}" includes out-of-whitelist unit id: ${unitId}`, errors);
      }
    }

    for (const commonId of commonIds) {
      if (!allowedSet.has(commonId)) {
        fail(`legion-index "${legion}" missing common unit id: ${commonId}`, errors);
      }
    }

    for (const legionUnitId of legionSpecific[legion]) {
      if (!allowedSet.has(legionUnitId)) {
        fail(`legion-index "${legion}" missing its specific unit id: ${legionUnitId}`, errors);
      }
    }

    for (const otherLegion of LEGIONS) {
      if (otherLegion === legion) continue;
      for (const otherId of legionSpecific[otherLegion]) {
        if (allowedSet.has(otherId)) {
          fail(
            `legion-index "${legion}" improperly includes "${otherLegion}" specific unit id: ${otherId}`,
            errors,
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('content:validate failed');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('content:validate passed');
  console.log(
    JSON.stringify(
      {
        whitelistUnits: whitelist.length,
        indexedUnits: unitIndexIds.length,
        unitFiles: unitFileIds.length,
        legions: LEGIONS,
      },
      null,
      2,
    ),
  );
}

main();
