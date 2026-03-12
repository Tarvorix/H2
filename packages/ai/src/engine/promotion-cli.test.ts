import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeNNUEModel } from './serialization';
import {
  DEFAULT_GAMEPLAY_NNUE_MODEL,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
} from './default-model';
import { promoteGameplayModel } from '../../../../tools/nnue/promote-gameplay-model.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promotion CLI workflow', () => {
  it('writes a promoted override module from a passed gate result even when the gate summary omits passed', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-promote-'));
    tempDirs.push(tempDir);

    const candidatePath = path.join(tempDir, 'candidate-gameplay-model.json');
    const gateSummaryPath = path.join(tempDir, 'gate-summary.json');
    const outFile = path.join(tempDir, 'default-gameplay-model.override.ts');
    const archiveRoot = path.join(tempDir, 'archive', 'nnue', 'gameplay-promotions');

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
    }, null, 2));

    const summary = promoteGameplayModel([
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
    const archivedModelPath = path.join(summary.archiveDir, 'candidate-gameplay-model.json');
    const archivedGateSummaryPath = path.join(summary.archiveDir, 'gate-summary.json');
    const archiveRecordPath = path.join(summary.archiveDir, 'promotion-record.json');
    const archiveIndex = JSON.parse(fs.readFileSync(summary.archiveIndexPath, 'utf8'));

    expect(summary.promotedModelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(summary.rebuilt).toBe(false);
    expect(summary.archiveDir.startsWith(archiveRoot)).toBe(true);
    expect(fs.existsSync(archivedModelPath)).toBe(true);
    expect(fs.existsSync(archivedGateSummaryPath)).toBe(true);
    expect(fs.existsSync(archiveRecordPath)).toBe(true);
    expect(Array.isArray(archiveIndex)).toBe(true);
    expect(archiveIndex).toHaveLength(1);
    expect(archiveIndex[0]?.sourceModelId).toBe(sourceModelId);
    expect(overrideSource).toContain('DEFAULT_GAMEPLAY_MODEL_OVERRIDE');
    expect(overrideSource).toContain(`"modelId": "${DEFAULT_GAMEPLAY_NNUE_MODEL_ID}"`);
    expect(overrideSource).toContain(`"sourceModelId": "${sourceModelId}"`);
    expect(overrideSource).toContain('"passed": true');
  });
});
