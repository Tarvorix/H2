import fs from 'node:fs';
import path from 'node:path';
import {
  ALPHA_DISTILL_ROOT,
  ALPHA_SELFPLAY_ROOT,
  parseArgs,
  readJson,
  readJsonLines,
  toInt,
  writeJson,
} from './common.mjs';

function splitCommaSeparated(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectInputSpecs(args) {
  const explicitInputs = typeof args.input === 'string'
    ? splitCommaSeparated(args.input)
    : [];

  if (explicitInputs.length > 0) {
    return explicitInputs;
  }

  return [
    path.join(ALPHA_DISTILL_ROOT, 'manifest.json'),
    path.join(ALPHA_SELFPLAY_ROOT, 'manifest.json'),
  ].filter((candidate) => fs.existsSync(path.resolve(process.cwd(), candidate)));
}

function expandInputFiles(inputSpecs) {
  const expanded = [];
  for (const spec of inputSpecs) {
    const absolutePath = path.resolve(process.cwd(), spec);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Alpha inspect input "${spec}" does not exist.`);
    }

    if (absolutePath.endsWith('.jsonl')) {
      expanded.push(absolutePath);
      continue;
    }

    const manifest = readJson(absolutePath);
    if (!Array.isArray(manifest.shardPaths)) {
      throw new Error(`Alpha inspect manifest "${spec}" is missing "shardPaths".`);
    }
    expanded.push(...manifest.shardPaths.map((entry) => path.resolve(process.cwd(), String(entry))));
  }

  return [...new Set(expanded)];
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const args = parseArgs(process.argv.slice(2));
const inputSpecs = collectInputSpecs(args);
const inputFiles = expandInputFiles(inputSpecs);
const rows = readJsonLines(inputFiles);
const previewCount = toInt(args.preview, 5);

const sourceCounts = {};
const sourceModelCounts = {};
const curriculumCounts = {};
const finalOutcomeCounts = {
  positive: 0,
  zero: 0,
  negative: 0,
};

for (const row of rows) {
  const sourceKey = typeof row.source === 'string' ? row.source : 'unknown';
  sourceCounts[sourceKey] = (sourceCounts[sourceKey] ?? 0) + 1;

  const modelKey = typeof row.sourceModelId === 'string' ? row.sourceModelId : 'unknown';
  sourceModelCounts[modelKey] = (sourceModelCounts[modelKey] ?? 0) + 1;

  if (typeof row.curriculumMode === 'string') {
    curriculumCounts[row.curriculumMode] = (curriculumCounts[row.curriculumMode] ?? 0) + 1;
  }

  const finalOutcome = Number(row.finalOutcome ?? 0);
  if (finalOutcome > 0) {
    finalOutcomeCounts.positive += 1;
  } else if (finalOutcome < 0) {
    finalOutcomeCounts.negative += 1;
  } else {
    finalOutcomeCounts.zero += 1;
  }
}

const summary = {
  inputSpecs,
  inputFiles,
  sampleCount: rows.length,
  uniqueMatches: new Set(rows
    .map((row) => row.sourceMatchId)
    .filter((value) => typeof value === 'string' && value.length > 0)).size,
  sourceCounts,
  sourceModelCounts,
  curriculumCounts,
  finalOutcomeCounts,
  averageStateTokens: mean(rows.map((row) => Array.isArray(row.encodedState) ? row.encodedState.length : 0)),
  averageActionTokens: mean(rows.map((row) => Array.isArray(row.encodedActions) ? row.encodedActions.length : 0)),
  averageValueTarget: mean(rows.map((row) => Number(row.valueTarget ?? 0))),
  averageVpDeltaTarget: mean(rows.map((row) => Number(row.vpDeltaTarget ?? 0))),
  averageTacticalSwingTarget: mean(rows.map((row) => Number(row.tacticalSwingTarget ?? 0))),
  preview: rows.slice(0, previewCount).map((row) => ({
    sampleIndex: row.sampleIndex ?? null,
    source: row.source ?? null,
    sourceModelId: row.sourceModelId ?? null,
    sourceMatchId: row.sourceMatchId ?? null,
    sourceStep: row.sourceStep ?? null,
    finalOutcome: row.finalOutcome ?? null,
    stateTokenCount: Array.isArray(row.encodedState) ? row.encodedState.length : 0,
    actionTokenCount: Array.isArray(row.encodedActions) ? row.encodedActions.length : 0,
    replayArtifactPath: row.replayArtifactPath ?? null,
  })),
};

if (typeof args.out === 'string') {
  writeJson(String(args.out), summary);
}

console.log(JSON.stringify(summary, null, 2));
