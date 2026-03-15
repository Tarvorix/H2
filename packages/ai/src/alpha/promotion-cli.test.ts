import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeAlphaModel } from './serialization';
import { createFreshAlphaModel } from './inference';
import { DEFAULT_ALPHA_MODEL_ID } from './common';
import { promoteAlphaModel } from '../../../../tools/alpha/promote-model.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('alpha promotion CLI workflow', () => {
  it('writes a promoted override module from a passed Alpha gate result', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-promote-'));
    tempDirs.push(tempDir);

    const candidatePath = path.join(tempDir, 'candidate-alpha-model.json');
    const gateSummaryPath = path.join(tempDir, 'gate-summary.json');
    const outFile = path.join(tempDir, 'default-alpha-model-override.ts');
    const archiveRoot = path.join(tempDir, 'archive', 'alpha', 'promotions');

    const serialized = serializeAlphaModel(createFreshAlphaModel('alpha-candidate-nightly', {
      trainedAt: '2026-03-13T00:00:00.000Z',
      datasetName: 'alpha-promotion-test',
      datasetSize: 32,
      epochs: 2,
      optimizer: 'adam',
      learningRate: 1e-4,
      notes: 'alpha promotion test',
    }));
    const sourceModelId = 'alpha-candidate-nightly';

    fs.writeFileSync(candidatePath, JSON.stringify({
      ...serialized,
      manifest: {
        ...serialized.manifest,
        modelId: sourceModelId,
      },
    }, null, 2));

    fs.writeFileSync(gateSummaryPath, JSON.stringify({
      candidateModelId: sourceModelId,
      threshold: 0.45,
      timeBudgetMs: 600,
      maxSimulations: 256,
      matchesPerOpponent: 2,
      candidateWins: 3,
      engineWins: 1,
      tacticalWins: 0,
      defaultAlphaWins: 0,
      draws: 0,
      aborted: 0,
      timeouts: 0,
      winRate: 0.75,
      passed: true,
    }, null, 2));

    const summary = promoteAlphaModel([
      '--model',
      candidatePath,
      '--gate-summary',
      gateSummaryPath,
      '--archive-root',
      archiveRoot,
      '--out-file',
      outFile,
      '--no-build',
    ]);

    const overrideSource = fs.readFileSync(outFile, 'utf8');
    const archivedModelPath = path.join(summary.archiveDir, 'candidate-alpha-model.json');
    const archivedGateSummaryPath = path.join(summary.archiveDir, 'gate-summary.json');
    const archiveRecordPath = path.join(summary.archiveDir, 'promotion-record.json');
    const archiveIndex = JSON.parse(fs.readFileSync(summary.archiveIndexPath, 'utf8'));

    expect(summary.promotedModelId).toBe(DEFAULT_ALPHA_MODEL_ID);
    expect(summary.rebuilt).toBe(false);
    expect(summary.archiveDir.startsWith(archiveRoot)).toBe(true);
    expect(fs.existsSync(archivedModelPath)).toBe(true);
    expect(fs.existsSync(archivedGateSummaryPath)).toBe(true);
    expect(fs.existsSync(archiveRecordPath)).toBe(true);
    expect(Array.isArray(archiveIndex)).toBe(true);
    expect(archiveIndex).toHaveLength(1);
    expect(archiveIndex[0]?.sourceModelId).toBe(sourceModelId);
    expect(overrideSource).toContain('DEFAULT_ALPHA_MODEL_OVERRIDE');
    expect(overrideSource).toContain(`"modelId": "${DEFAULT_ALPHA_MODEL_ID}"`);
    expect(overrideSource).toContain(`"sourceModelId": "${sourceModelId}"`);
    expect(overrideSource).toContain('"passed": true');
  });
});
