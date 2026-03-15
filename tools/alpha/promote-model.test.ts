import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeAlphaModel } from '../../packages/ai/src/alpha/serialization';
import { createFreshAlphaModel } from '../../packages/ai/src/alpha/common';
import { DEFAULT_ALPHA_MODEL_ID } from '../../packages/ai/src/alpha/common';
import { promoteAlphaModel } from './promote-model.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promoteAlphaModel', () => {
  it('writes a promoted override module from a passed Alpha gate result', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-promote-'));
    tempDirs.push(tempDir);

    const candidatePath = path.join(tempDir, 'candidate-alpha-model.json');
    const gateSummaryPath = path.join(tempDir, 'gate-summary.json');
    const outFile = path.join(tempDir, 'default-alpha-model-override.ts');

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
      '--out-file',
      outFile,
      '--no-build',
    ]);

    const overrideSource = fs.readFileSync(outFile, 'utf8');

    expect(summary.promotedModelId).toBe(DEFAULT_ALPHA_MODEL_ID);
    expect(summary.rebuilt).toBe(false);
    expect(overrideSource).toContain('DEFAULT_ALPHA_MODEL_OVERRIDE');
    expect(overrideSource).toContain(`"modelId": "${DEFAULT_ALPHA_MODEL_ID}"`);
    expect(overrideSource).toContain(`"sourceModelId": "${sourceModelId}"`);
  });
});
