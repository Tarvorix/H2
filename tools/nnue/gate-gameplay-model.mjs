import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProgressReporter,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  loadSerializedModel,
  parseArgs,
  readJson,
  runGateMatches,
  runModelGateMatches,
  toFloat,
  toInt,
  writeJson,
} from './common.mjs';

export function buildGameplayGateSummary({
  candidateModelId,
  threshold,
  previousThreshold,
  timeBudgetMs,
  maxDepthSoft,
  rolloutCount,
  tacticalSummary,
  previousVersionSummary,
}) {
  const tacticalPassed = tacticalSummary.winRate > threshold;
  const previousVersionPassed = previousVersionSummary
    ? previousVersionSummary.winRate > previousThreshold
    : true;

  return {
    candidateModelId,
    threshold,
    previousThreshold,
    timeBudgetMs,
    maxDepthSoft: maxDepthSoft ?? null,
    rolloutCount: rolloutCount ?? null,
    engineWins: tacticalSummary.engineWins,
    tacticalWins: tacticalSummary.tacticalWins,
    draws: tacticalSummary.draws,
    aborted: tacticalSummary.aborted,
    timeouts: tacticalSummary.timeouts,
    winRate: tacticalSummary.winRate,
    tacticalPassed,
    previousVersion: previousVersionSummary
      ? {
        opponentModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
        threshold: previousThreshold,
        ...previousVersionSummary,
        passed: previousVersionPassed,
      }
      : null,
    passed: tacticalPassed && previousVersionPassed,
  };
}

export function runGameplayGate(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const modelFile = typeof args.model === 'string' ? args.model : null;
  const loadedModel = modelFile ? loadSerializedModel(modelFile) : null;
  const candidateModelId = loadedModel?.manifest.modelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID;
  const matches = toInt(args.matches, 8);
  const threshold = toFloat(args.threshold, 0.55);
  const previousThreshold = toFloat(args['previous-threshold'], 0.5);
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
  const setupOptions = explicitSetupOptions
    ? {
      setupFactory: (matchIndex) => ({
        ...explicitSetupOptions,
        firstPlayerIndex: matchIndex % 2,
      }),
    }
    : {};

  const tacticalProgress = createProgressReporter({
    label: 'gate:tactical',
    total: matches,
  });
  const tacticalSummary = runGateMatches({
    matches,
    timeBudgetMs,
    candidateModelId,
    ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
    ...(rolloutCount !== undefined ? { rolloutCount } : {}),
    ...setupOptions,
    onMatchComplete: ({ totals, classification }) => {
      tacticalProgress.tick(
        `W-L-D ${totals.engineWins}-${totals.tacticalWins}-${totals.draws} aborted=${totals.aborted} timeouts=${totals.timeouts} last=${classification.outcome}`,
      );
    },
  });
  tacticalProgress.finish(`W-L-D ${tacticalSummary.engineWins}-${tacticalSummary.tacticalWins}-${tacticalSummary.draws} aborted=${tacticalSummary.aborted} timeouts=${tacticalSummary.timeouts}`);

  const shouldBenchmarkPreviousVersion = candidateModelId !== DEFAULT_GAMEPLAY_NNUE_MODEL_ID;
  let previousVersionSummary = null;

  if (shouldBenchmarkPreviousVersion) {
    const previousProgress = createProgressReporter({
      label: 'gate:previous',
      total: matches,
    });
    previousVersionSummary = runModelGateMatches({
      matches,
      timeBudgetMs,
      candidateModelId,
      opponentModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
      ...(maxDepthSoft !== undefined ? { maxDepthSoft } : {}),
      ...(rolloutCount !== undefined ? { rolloutCount } : {}),
      ...setupOptions,
      onMatchComplete: ({ totals, classification }) => {
        previousProgress.tick(
          `W-L-D ${totals.candidateWins}-${totals.opponentWins}-${totals.draws} aborted=${totals.aborted} timeouts=${totals.timeouts} last=${classification.outcome}`,
        );
      },
    });
    previousProgress.finish(`W-L-D ${previousVersionSummary.candidateWins}-${previousVersionSummary.opponentWins}-${previousVersionSummary.draws} aborted=${previousVersionSummary.aborted} timeouts=${previousVersionSummary.timeouts}`);
  }

  const summary = buildGameplayGateSummary({
    candidateModelId,
    threshold,
    previousThreshold,
    timeBudgetMs,
    maxDepthSoft,
    rolloutCount,
    tacticalSummary,
    previousVersionSummary,
  });

  if (summaryOut) {
    writeJson(summaryOut, summary);
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.passed) {
    process.exitCode = 1;
  }

  return summary;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  runGameplayGate();
}
