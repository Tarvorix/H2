import {
  createProgressReporter,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  loadSerializedModel,
  parseArgs,
  readJson,
  runGateMatches,
  toFloat,
  toInt,
  writeJson,
} from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const modelFile = typeof args.model === 'string' ? args.model : null;
const loadedModel = modelFile ? loadSerializedModel(modelFile) : null;
const candidateModelId = loadedModel?.manifest.modelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID;
const matches = toInt(args.matches, 8);
const threshold = toFloat(args.threshold, 0.55);
const timeBudgetMs = toInt(args['time-budget-ms'], 100);
const maxDepthSoft = args['max-depth-soft'] !== undefined
  ? toInt(args['max-depth-soft'], 4)
  : undefined;
const rolloutCount = args['rollout-count'] !== undefined
  ? toInt(args['rollout-count'], 1)
  : undefined;
const summaryOut = typeof args.out === 'string' ? args.out : null;
const explicitSetupOptions = typeof args.setup === 'string'
  ? readJson(String(args.setup))
  : null;
const progress = createProgressReporter({
  label: 'gate',
  total: matches,
});

const summary = runGateMatches({
  matches,
  timeBudgetMs,
  candidateModelId,
  ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
  ...(rolloutCount !== undefined ? { rolloutCount } : {}),
  ...(explicitSetupOptions
    ? {
      setupFactory: (matchIndex) => ({
        ...explicitSetupOptions,
        firstPlayerIndex: matchIndex % 2,
      }),
    }
    : {}),
  onMatchComplete: ({ totals, classification }) => {
    progress.tick(
      `W-L-D ${totals.engineWins}-${totals.tacticalWins}-${totals.draws} aborted=${totals.aborted} timeouts=${totals.timeouts} last=${classification.outcome}`,
    );
  },
});
progress.finish(`W-L-D ${summary.engineWins}-${summary.tacticalWins}-${summary.draws} aborted=${summary.aborted} timeouts=${summary.timeouts}`);
const passed = summary.winRate > threshold;

if (summaryOut) {
  writeJson(summaryOut, {
    candidateModelId,
    threshold,
    timeBudgetMs,
    maxDepthSoft: maxDepthSoft ?? null,
    rolloutCount: rolloutCount ?? null,
    ...summary,
    passed,
  });
}

console.log(JSON.stringify({
  candidateModelId,
  threshold,
  timeBudgetMs,
  maxDepthSoft: maxDepthSoft ?? null,
  rolloutCount: rolloutCount ?? null,
  engineWins: summary.engineWins,
  tacticalWins: summary.tacticalWins,
  draws: summary.draws,
  aborted: summary.aborted,
  timeouts: summary.timeouts,
  winRate: summary.winRate,
  passed,
}, null, 2));

if (!passed) {
  process.exitCode = 1;
}
