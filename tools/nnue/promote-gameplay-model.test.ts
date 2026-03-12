import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeNNUEModel } from '../../packages/ai/src/engine/serialization';
import {
  DEFAULT_GAMEPLAY_NNUE_MODEL,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
} from '../../packages/ai/src/engine/default-model';
import { promoteGameplayModel } from './promote-gameplay-model.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promoteGameplayModel', () => {
  it('writes a promoted override module from a passed gate result', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-promote-'));
    tempDirs.push(tempDir);

    const candidatePath = path.join(tempDir, 'candidate-gameplay-model.json');
    const gateSummaryPath = path.join(tempDir, 'gate-summary.json');
    const outFile = path.join(tempDir, 'default-gameplay-model.override.ts');

    const serialized = serializeNNUEModel(DEFAULT_GAMEPLAY_NNUE_MODEL);
    const sourceModelId = 'gameplay-default-v1-candidate-nightly';

    fs.writeFileSync(candidatePath, JSON.stringify({
      ...serialized,
      manifest: {
        ...serialized.manifest,
        modelId: sourceModelId,
      },
    }, null, 2));

    fs.writeFileSync(gateSummaryPath, JSON.stringify({
      candidateModelId: sourceModelId,
      threshold: 0.55,
      timeBudgetMs: 1000,
      engineWins: 15,
      tacticalWins: 5,
      draws: 0,
      aborted: 0,
      timeouts: 0,
      winRate: 0.75,
      passed: true,
    }, null, 2));

    const summary = promoteGameplayModel([
      '--model',
      candidatePath,
      '--gate-summary',
      gateSummaryPath,
      '--out-file',
      outFile,
      '--no-build',
    ]);

    const overrideSource = fs.readFileSync(outFile, 'utf8');

    expect(summary.promotedModelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(summary.rebuilt).toBe(false);
    expect(overrideSource).toContain('DEFAULT_GAMEPLAY_MODEL_OVERRIDE');
    expect(overrideSource).toContain(`"modelId": "${DEFAULT_GAMEPLAY_NNUE_MODEL_ID}"`);
    expect(overrideSource).toContain(`"sourceModelId": "${sourceModelId}"`);
  });
});
