import path from 'node:path';
import { AIStrategyTier } from '../../packages/ai/dist/index.js';
import {
  ALPHA_GATE_ROOT,
  DEFAULT_ALPHA_MODEL_ID,
  createAlphaPlayerConfig,
  createEnginePlayerConfig,
  createMirroredGateSetupOptions,
  createProgressReporter,
  getAlphaModel,
  loadAlphaModelFromFile,
  parseArgs,
  registerAlphaModelFromFile,
  runAlphaInstrumentedMatch,
  toFloat,
  toInt,
  validateAlphaModel,
  writeJson,
} from './common.mjs';

function createTacticalPlayerConfig(playerIndex) {
  return {
    enabled: true,
    playerIndex,
    strategyTier: AIStrategyTier.Tactical,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    diagnosticsEnabled: true,
  };
}

function createOpponentBucket(label) {
  return {
    label,
    candidateWins: 0,
    opponentWins: 0,
    draws: 0,
    aborted: 0,
    timeouts: 0,
    matches: 0,
    winRate: 0,
  };
}

function classifyMatch(result, candidatePlayerIndex) {
  if (result.finalState.isGameOver) {
    if (result.finalState.winnerPlayerIndex === null) {
      return 'draw';
    }
    return result.finalState.winnerPlayerIndex === candidatePlayerIndex
      ? 'candidate-win'
      : 'opponent-win';
  }

  if (result.terminatedReason === 'max-commands') {
    return 'timeout';
  }

  if (result.terminatedReason === 'command-rejected') {
    const lastStep = Array.isArray(result.commandHistory)
      ? result.commandHistory[result.commandHistory.length - 1]
      : null;
    const rejectingPlayerIndex = typeof lastStep?.actingPlayerIndex === 'number'
      ? lastStep.actingPlayerIndex
      : null;
    if (rejectingPlayerIndex === candidatePlayerIndex) {
      return 'opponent-win';
    }
    if (rejectingPlayerIndex !== null) {
      return 'candidate-win';
    }
  }

  return 'aborted';
}

function finalizeBucket(bucket) {
  return {
    ...bucket,
    winRate: bucket.matches > 0 ? bucket.candidateWins / bucket.matches : 0,
  };
}

const args = parseArgs(process.argv.slice(2));
const modelFile = typeof args.model === 'string' ? String(args.model) : null;
if (!modelFile) {
  throw new Error(
    'Usage: pnpm alpha:gate --model tmp/alpha/train/<candidate>.json [--matches 4] [--threshold 0.55] [--time-budget-ms 1500] [--max-simulations 640] [--out tmp/alpha/gate/<candidate>.gate.json]',
  );
}

const registeredCandidate = registerAlphaModelFromFile(modelFile);
validateAlphaModel(registeredCandidate);
const candidateModelId = registeredCandidate.manifest.modelId;
const matchesPerOpponent = toInt(args.matches, 4);
const threshold = toFloat(args.threshold, 0.55);
const timeBudgetMs = toInt(args['time-budget-ms'], 1500);
const maxSimulations = toInt(args['max-simulations'], 640);
const maxCommands = toInt(args['max-commands'], 2000);
const outDir = args['out-dir']
  ? path.resolve(process.cwd(), String(args['out-dir']))
  : path.resolve(process.cwd(), ALPHA_GATE_ROOT);
const explicitOut = typeof args.out === 'string'
  ? path.resolve(process.cwd(), String(args.out))
  : null;

const defaultAlphaModel = candidateModelId === DEFAULT_ALPHA_MODEL_ID
  ? null
  : getAlphaModel(DEFAULT_ALPHA_MODEL_ID);
const opponents = [
  { key: 'tactical', label: 'Tactical' },
  { key: 'engine', label: 'Engine' },
  ...(defaultAlphaModel ? [{ key: 'alpha-default', label: 'Alpha Default' }] : []),
];

const progress = createProgressReporter({
  label: 'alpha-gate',
  total: opponents.length * matchesPerOpponent,
});

const opponentBuckets = {
  tactical: createOpponentBucket('Tactical'),
  engine: createOpponentBucket('Engine'),
  alphaDefault: createOpponentBucket('Alpha Default'),
};
const results = [];
let candidateWins = 0;
let tacticalWins = 0;
let engineWins = 0;
let defaultAlphaWins = 0;
let draws = 0;
let aborted = 0;
let timeouts = 0;

for (let opponentIndex = 0; opponentIndex < opponents.length; opponentIndex++) {
  const opponent = opponents[opponentIndex];
  for (let matchIndex = 0; matchIndex < matchesPerOpponent; matchIndex++) {
    const globalMatchIndex = (opponentIndex * matchesPerOpponent) + matchIndex;
    const candidatePlayerIndex = globalMatchIndex % 2;
    const opponentPlayerIndex = candidatePlayerIndex === 0 ? 1 : 0;
    const setupOptions = createMirroredGateSetupOptions(globalMatchIndex, {
      firstPlayerIndex: candidatePlayerIndex,
    });

    let aiPlayers;
    if (opponent.key === 'engine') {
      aiPlayers = candidatePlayerIndex === 0
        ? [
          createAlphaPlayerConfig(0, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 7000 + globalMatchIndex,
          }),
          createEnginePlayerConfig(1, {
            timeBudgetMs,
            baseSeed: 8000 + globalMatchIndex,
          }),
        ]
        : [
          createEnginePlayerConfig(0, {
            timeBudgetMs,
            baseSeed: 8000 + globalMatchIndex,
          }),
          createAlphaPlayerConfig(1, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 7000 + globalMatchIndex,
          }),
        ];
    } else if (opponent.key === 'alpha-default') {
      aiPlayers = candidatePlayerIndex === 0
        ? [
          createAlphaPlayerConfig(0, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 9000 + globalMatchIndex,
          }),
          createAlphaPlayerConfig(1, {
            alphaModelId: DEFAULT_ALPHA_MODEL_ID,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 10_000 + globalMatchIndex,
          }),
        ]
        : [
          createAlphaPlayerConfig(0, {
            alphaModelId: DEFAULT_ALPHA_MODEL_ID,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 10_000 + globalMatchIndex,
          }),
          createAlphaPlayerConfig(1, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 9000 + globalMatchIndex,
          }),
        ];
    } else {
      aiPlayers = candidatePlayerIndex === 0
        ? [
          createAlphaPlayerConfig(0, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 6000 + globalMatchIndex,
          }),
          createTacticalPlayerConfig(1),
        ]
        : [
          createTacticalPlayerConfig(0),
          createAlphaPlayerConfig(1, {
            alphaModelId: candidateModelId,
            timeBudgetMs,
            maxSimulations,
            baseSeed: 6000 + globalMatchIndex,
          }),
        ];
    }

    const result = runAlphaInstrumentedMatch({
      matchId: `alpha-gate-${opponent.key}-${globalMatchIndex + 1}`,
      setupOptions,
      aiPlayers,
      maxCommands,
    });
    const classification = classifyMatch(result, candidatePlayerIndex);
    const bucket = opponent.key === 'engine'
      ? opponentBuckets.engine
      : opponent.key === 'alpha-default'
        ? opponentBuckets.alphaDefault
        : opponentBuckets.tactical;
    bucket.matches += 1;

    if (classification === 'candidate-win') {
      bucket.candidateWins += 1;
      candidateWins += 1;
    } else if (classification === 'opponent-win') {
      bucket.opponentWins += 1;
      if (opponent.key === 'engine') {
        engineWins += 1;
      } else if (opponent.key === 'alpha-default') {
        defaultAlphaWins += 1;
      } else {
        tacticalWins += 1;
      }
    } else if (classification === 'draw') {
      bucket.draws += 1;
      draws += 1;
    } else if (classification === 'timeout') {
      bucket.timeouts += 1;
      timeouts += 1;
    } else {
      bucket.aborted += 1;
      aborted += 1;
    }

    results.push({
      matchIndex: globalMatchIndex,
      opponent: opponent.key,
      candidatePlayerIndex,
      opponentPlayerIndex,
      winnerPlayerIndex: result.finalState.winnerPlayerIndex,
      terminatedReason: result.terminatedReason,
      errorMessage: result.errorMessage,
      finalStateHash: result.replay.finalStateHash,
      classification,
    });

    progress.tick(
      `${opponent.key} W-L-D ${candidateWins}-${engineWins + tacticalWins + defaultAlphaWins}-${draws} aborted=${aborted} timeouts=${timeouts}`,
    );
  }
}

const totalMatches = opponents.length * matchesPerOpponent;
const summary = {
  candidateModelId,
  threshold,
  timeBudgetMs,
  maxSimulations,
  matchesPerOpponent,
  totalMatches,
  candidateWins,
  engineWins,
  tacticalWins,
  defaultAlphaWins,
  draws,
  aborted,
  timeouts,
  winRate: totalMatches > 0 ? candidateWins / totalMatches : 0,
  passed: totalMatches > 0 ? (candidateWins / totalMatches) > threshold : false,
  opponents: {
    tactical: finalizeBucket(opponentBuckets.tactical),
    engine: finalizeBucket(opponentBuckets.engine),
    alphaDefault: defaultAlphaModel ? finalizeBucket(opponentBuckets.alphaDefault) : null,
  },
  results,
};

const summaryPath = explicitOut ?? path.join(outDir, `${candidateModelId}.gate.json`);
writeJson(summaryPath, summary);
progress.finish(`W-L-D ${candidateWins}-${engineWins + tacticalWins + defaultAlphaWins}-${draws} aborted=${aborted} timeouts=${timeouts}`);

console.log(JSON.stringify({
  summaryPath,
  candidateModelId,
  threshold,
  timeBudgetMs,
  maxSimulations,
  matchesPerOpponent,
  candidateWins,
  engineWins,
  tacticalWins,
  defaultAlphaWins,
  draws,
  aborted,
  timeouts,
  winRate: summary.winRate,
  passed: summary.passed,
}, null, 2));

if (!summary.passed) {
  process.exitCode = 1;
}
