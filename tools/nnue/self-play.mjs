import path from 'node:path';
import {
  createProgressReporter,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  createDefaultSetupOptions,
  createEnginePlayerConfig,
  ensureDir,
  parseArgs,
  readJson,
  runInstrumentedMatch,
  saveSerializedModel,
  toInt,
  writeJson,
  writeJsonLines,
} from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const matchCount = toInt(args.matches, 4);
const outDir = args['out-dir'] ? path.resolve(process.cwd(), String(args['out-dir'])) : path.resolve(process.cwd(), 'tmp/nnue');
const modelId = typeof args.model === 'string' ? args.model : DEFAULT_GAMEPLAY_NNUE_MODEL_ID;
const timeBudgetMs = toInt(args['time-budget-ms'], 100);
const maxCommands = toInt(args['max-commands'], 1500);
const shardSize = toInt(args['shard-size'], 256);
const maxDepthSoft = args['max-depth-soft'] !== undefined
  ? toInt(args['max-depth-soft'], 4)
  : undefined;
const rolloutCount = args['rollout-count'] !== undefined
  ? toInt(args['rollout-count'], 1)
  : undefined;
const explicitSetupOptions = typeof args.setup === 'string'
  ? readJson(String(args.setup))
  : null;

ensureDir(outDir);
ensureDir(path.join(outDir, 'replays'));

const allSamples = [];
const matches = [];
const progress = createProgressReporter({
  label: 'selfplay',
  total: matchCount,
});

for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
  const matchId = `selfplay-${Date.now()}-${matchIndex + 1}`;
  const setupOptions = explicitSetupOptions
    ? {
      ...explicitSetupOptions,
      firstPlayerIndex: matchIndex % 2,
    }
    : createDefaultSetupOptions({
      matchIndex,
      firstPlayerIndex: matchIndex % 2,
    });
  const result = runInstrumentedMatch({
    matchId,
    setupOptions,
    aiPlayers: [
      createEnginePlayerConfig(0, {
        timeBudgetMs,
        nnueModelId: modelId,
        baseSeed: 1000 + (matchIndex * 2),
        ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
        ...(rolloutCount !== undefined ? { rolloutCount } : {}),
      }),
      createEnginePlayerConfig(1, {
        timeBudgetMs,
        nnueModelId: modelId,
        baseSeed: 1001 + (matchIndex * 2),
        ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
        ...(rolloutCount !== undefined ? { rolloutCount } : {}),
      }),
    ],
    maxCommands,
  });

  const replayPath = path.join(outDir, 'replays', `${matchId}.json`);
  writeJson(replayPath, result.replay);
  const replayAbsolutePath = path.resolve(process.cwd(), replayPath);

  allSamples.push(
    ...result.samples.map((sample) => ({
      ...sample,
      replayArtifactPath: replayAbsolutePath,
    })),
  );
  matches.push({
    matchId,
    replayArtifactPath: replayAbsolutePath,
    terminatedReason: result.terminatedReason,
    errorMessage: result.errorMessage,
    sampleCount: result.samples.length,
    finalStateHash: result.replay.finalStateHash,
  });

  progress.tick(`match ${matchIndex + 1}/${matchCount} samples=${result.samples.length} end=${result.terminatedReason}`);
}

const shardPaths = [];
for (let index = 0; index < allSamples.length; index += shardSize) {
  const shardRows = allSamples.slice(index, index + shardSize);
  const shardNumber = Math.floor(index / shardSize) + 1;
  const shardPath = path.join(outDir, `selfplay-shard-${String(shardNumber).padStart(3, '0')}.jsonl`);
  writeJsonLines(shardPath, shardRows);
  shardPaths.push(path.resolve(process.cwd(), shardPath));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  modelId,
  matchCount,
  sampleCount: allSamples.length,
  shardPaths,
  matches,
  timeBudgetMs,
  maxCommands,
  maxDepthSoft: maxDepthSoft ?? null,
  rolloutCount: rolloutCount ?? null,
};

const manifestPath = writeJson(path.join(outDir, 'manifest.json'), manifest);
progress.finish(`samples=${allSamples.length} shards=${shardPaths.length}`);

console.log(JSON.stringify({
  outDir,
  manifestPath,
  matchCount,
  sampleCount: allSamples.length,
  shardCount: shardPaths.length,
}, null, 2));
