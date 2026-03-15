import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createHeadlessGameState,
  createHeadlessGameStateFromArmyLists,
  createReplayArtifact,
} from '../../../headless/src';
import { createDefaultSetupOptions } from '../../../../tools/nnue/common.mjs';
import { createFreshAlphaModel } from './inference';
import { serializeAlphaModel } from './serialization';
import { distillEngineTeacherData } from '../../../../tools/alpha/distill-engine.mjs';
import { runAlphaSelfPlay } from '../../../../tools/alpha/self-play.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('alpha tooling interop', () => {
  it('reruns fresh alpha distill matches without failing the rerun path', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-distill-rerun-'));
    tempDirs.push(tempDir);

    const outDir = path.join(tempDir, 'alpha-distill-rerun');
    const summary = distillEngineTeacherData([
      '--matches',
      '1',
      '--time-budget-ms',
      '5',
      '--max-commands',
      '5',
      '--out-dir',
      outDir,
      '--shard-size',
      '32',
    ]);

    const outputManifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf8'));
    const shardRows = fs.readFileSync(outputManifest.shardPaths[0], 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(summary.importMode).toBe('rerun');
    expect(summary.matchCount).toBe(1);
    expect(summary.sampleCount).toBeGreaterThan(0);
    expect(outputManifest.teacherModelId).toBe('gameplay-default-v1');
    expect(shardRows[0]?.source).toBe('distill');
  });

  it('imports existing engine selfplay manifests into alpha distill shards', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-distill-import-'));
    tempDirs.push(tempDir);

    const sourceDir = path.join(tempDir, 'source-selfplay');
    const replayDir = path.join(sourceDir, 'replays');
    fs.mkdirSync(replayDir, { recursive: true });

    const setupOptions = createDefaultSetupOptions({
      matchIndex: 0,
      firstPlayerIndex: 0,
    });
    const initialState = Array.isArray(setupOptions.armyLists)
      ? createHeadlessGameStateFromArmyLists(setupOptions)
      : createHeadlessGameState(setupOptions);
    const replay = createReplayArtifact(
      initialState,
      [{ command: { type: 'endSubPhase' }, actingPlayerIndex: 0 }],
      [],
      {
        matchId: 'existing-engine-selfplay-1',
        terminatedReason: 'max-commands',
      },
    );
    const replayPath = path.join(replayDir, 'existing-engine-selfplay-1.json');
    fs.writeFileSync(replayPath, `${JSON.stringify(replay, null, 2)}\n`, 'utf8');

    const manifestPath = path.join(sourceDir, 'manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      generatedAt: '2026-03-13T00:00:00.000Z',
      modelId: 'gameplay-default-v1',
      matchCount: 1,
      sampleCount: 1,
      shardPaths: [],
      matches: [
        {
          matchId: 'existing-engine-selfplay-1',
          replayArtifactPath: replayPath,
          terminatedReason: 'max-commands',
          errorMessage: null,
          sampleCount: 1,
          finalStateHash: replay.finalStateHash,
        },
      ],
      timeBudgetMs: 25,
      maxCommands: 1,
      maxDepthSoft: 2,
      rolloutCount: 1,
    }, null, 2)}\n`, 'utf8');

    const outDir = path.join(tempDir, 'alpha-distill');
    const summary = distillEngineTeacherData([
      '--input',
      manifestPath,
      '--out-dir',
      outDir,
      '--shard-size',
      '32',
    ]);

    const outputManifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf8'));
    const shardRows = fs.readFileSync(outputManifest.shardPaths[0], 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const firstRow = shardRows[0];

    expect(summary.importMode).toBe('existing-replays');
    expect(summary.sampleCount).toBeGreaterThan(0);
    expect(outputManifest.matches[0]?.sourceManifestPath).toBe(manifestPath);
    expect(firstRow.source).toBe('distill');
    expect(firstRow.replayArtifactPath).toBe(replayPath);
    expect(firstRow.encodedState.length).toBeGreaterThan(0);
    expect(firstRow.encodedActions.length).toBeGreaterThan(0);
  });

  it('runs alpha selfplay directly from a candidate model file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-selfplay-file-'));
    tempDirs.push(tempDir);

    const candidateModelPath = path.join(tempDir, 'alpha-candidate.json');
    fs.writeFileSync(candidateModelPath, `${JSON.stringify(serializeAlphaModel(createFreshAlphaModel(
      'alpha-model-file-test',
      {
        trainedAt: '2026-03-13T00:00:00.000Z',
        datasetName: 'alpha-model-file-test',
        datasetSize: 8,
        epochs: 1,
        optimizer: 'adam',
        learningRate: 1e-4,
        notes: 'alpha selfplay model-file test',
      },
    )), null, 2)}\n`, 'utf8');

    const outDir = path.join(tempDir, 'alpha-selfplay');
    const summary = runAlphaSelfPlay([
      '--model-file',
      candidateModelPath,
      '--matches',
      '1',
      '--curriculum',
      'mirror',
      '--time-budget-ms',
      '5',
      '--max-simulations',
      '2',
      '--max-commands',
      '1',
      '--out-dir',
      outDir,
      '--shard-size',
      '32',
    ]);

    const outputManifest = JSON.parse(fs.readFileSync(summary.manifestPath, 'utf8'));
    const shardRows = fs.readFileSync(outputManifest.shardPaths[0], 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const firstRow = shardRows[0];

    expect(summary.modelId).toBe('alpha-model-file-test');
    expect(summary.modelFilePath).toBe(candidateModelPath);
    expect(outputManifest.modelId).toBe('alpha-model-file-test');
    expect(outputManifest.modelFilePath).toBe(candidateModelPath);
    expect(outputManifest.sampleCount).toBeGreaterThan(0);
    expect(firstRow.sourceModelId).toBe('alpha-model-file-test');
  }, 20_000);
});
