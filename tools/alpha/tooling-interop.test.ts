import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHeadlessGameState, createReplayArtifact } from '../../packages/headless/src';
import { generateMacroActions } from '../../packages/ai/src';
import { createDefaultSetupOptions } from '../nnue/common.mjs';
import { createFreshAlphaModel } from '../../packages/ai/src/alpha/inference';
import { serializeAlphaModel } from '../../packages/ai/src/alpha/serialization';
import { distillEngineTeacherData } from './distill-engine.mjs';
import { createAlphaSelfPlaySample } from './common.mjs';
import { runAlphaSelfPlay } from './self-play.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('alpha tooling interop', () => {
  it('builds a selfplay sample from a preselected macro action without rerunning alpha search', () => {
    const state = createHeadlessGameState(createDefaultSetupOptions({
      matchIndex: 0,
      firstPlayerIndex: 0,
    }));
    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      0,
      {
        timeBudgetMs: 20,
        nnueModelId: 'alpha-selfplay-sample-test',
        baseSeed: 9001,
        rolloutCount: 1,
        maxDepthSoft: 1,
        diagnosticsEnabled: false,
        maxRootActions: 18,
        maxActionsPerUnit: 4,
        aspirationWindow: 0,
        maxAutoAdvanceSteps: 8,
      },
      { includeAdvanceCommands: true },
    );
    const selected = actions[0];
    expect(selected).toBeTruthy();

    const sample = createAlphaSelfPlaySample(
      state,
      0,
      {
        timeBudgetMs: 20,
        alphaModelId: 'missing-alpha-model-id-should-not-be-resolved',
        baseSeed: 9001,
        diagnosticsEnabled: true,
      },
      {
        actedUnitIds: [],
        selectedMacroActionId: selected?.id,
        selectedCommandType: selected?.commands[0]?.type ?? null,
        sourceModelId: 'alpha-selfplay-sample-test',
        valueEstimate: 0.25,
        rootVisits: 12,
        nodesExpanded: 9,
        policyEntropy: 0.5,
        searchTimeMs: 7,
      },
    );

    expect(sample).not.toBeNull();
    expect(sample?.selectedMacroActionId).toBe(selected?.id);
    expect(sample?.sourceModelId).toBe('alpha-selfplay-sample-test');
    expect(sample?.rootVisits).toBe(12);
    expect(sample?.actions.length).toBeGreaterThan(0);
  });

  it('imports existing engine selfplay manifests into alpha distill shards', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-alpha-distill-import-'));
    tempDirs.push(tempDir);

    const sourceDir = path.join(tempDir, 'source-selfplay');
    const replayDir = path.join(sourceDir, 'replays');
    fs.mkdirSync(replayDir, { recursive: true });

    const initialState = createHeadlessGameState(createDefaultSetupOptions({
      matchIndex: 0,
      firstPlayerIndex: 0,
    }));
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
      '20',
      '--max-simulations',
      '8',
      '--max-commands',
      '32',
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
  });
});
