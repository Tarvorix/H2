import {
  AIStrategyTier,
} from '../../packages/ai/dist/index.js';
import {
  Allegiance,
  LegionFaction,
} from '../../packages/types/dist/index.js';
import {
  getPlayableFactions,
} from '../../packages/data/dist/index.js';
import {
  createHeadlessGameStateFromArmyLists,
  generateHeadlessArmyList,
  runHeadlessMatch,
  validateHeadlessArmyLists,
} from '../../packages/headless/dist/index.js';
import {
  classifyHeadlessResult,
  createProgressReporter,
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  loadSerializedModel,
  parseArgs,
  toFloat,
  toInt,
  writeJson,
} from './common.mjs';

const PLAYABLE_FACTIONS = getPlayableFactions().filter((faction) =>
  Object.values(LegionFaction).includes(faction),
);

if (PLAYABLE_FACTIONS.length < 2) {
  throw new Error('Roster gate requires at least two playable legion factions.');
}

function pickFaction(index) {
  return PLAYABLE_FACTIONS[index % PLAYABLE_FACTIONS.length];
}

const args = parseArgs(process.argv.slice(2));
const modelFile = typeof args.model === 'string' ? args.model : null;
const loadedModel = modelFile ? loadSerializedModel(modelFile) : null;
const candidateModelId = loadedModel?.manifest.modelId ?? DEFAULT_ROSTER_NNUE_MODEL_ID;
const matches = toInt(args.matches, 6);
const threshold = toFloat(args.threshold, 0.55);
const pointsLimit = toInt(args['points-limit'], 2500);
const timeBudgetMs = toInt(args['time-budget-ms'], 100);
const summaryOut = typeof args.out === 'string' ? args.out : null;
const progress = createProgressReporter({
  label: 'roster-gate',
  total: matches,
});

let modelWins = 0;
let heuristicWins = 0;
let draws = 0;
let aborted = 0;
let timeouts = 0;
const results = [];

for (let matchIndex = 0; matchIndex < matches; matchIndex++) {
  const modelPlayerIndex = matchIndex % 2;
  const factions = [
    pickFaction(matchIndex),
    pickFaction(matchIndex + 1),
  ];

  const generatedModel = generateHeadlessArmyList({
    playerName: modelPlayerIndex === 0 ? 'Roster Model' : 'Roster Heuristic',
    faction: factions[0],
    allegiance: Allegiance.Traitor,
    pointsLimit,
    strategyTier: modelPlayerIndex === 0 ? 'model' : 'heuristic',
    nnueModelId: candidateModelId,
    baseSeed: 1000 + (matchIndex * 2),
    candidateCount: 16,
    unitIdNamespace: modelPlayerIndex === 0 ? 'p0-model' : 'p1-model',
  });
  const generatedBaseline = generateHeadlessArmyList({
    playerName: modelPlayerIndex === 1 ? 'Roster Model' : 'Roster Heuristic',
    faction: factions[1],
    allegiance: Allegiance.Loyalist,
    pointsLimit,
    strategyTier: modelPlayerIndex === 1 ? 'model' : 'heuristic',
    nnueModelId: candidateModelId,
    baseSeed: 1001 + (matchIndex * 2),
    candidateCount: 16,
    unitIdNamespace: modelPlayerIndex === 1 ? 'p0-heuristic' : 'p1-heuristic',
  });

  const armyLists = modelPlayerIndex === 0
    ? [generatedModel.armyList, generatedBaseline.armyList]
    : [generatedBaseline.armyList, generatedModel.armyList];
  const pairValidation = validateHeadlessArmyLists(armyLists);
  const modelRoster = modelPlayerIndex === 0 ? generatedModel : generatedBaseline;
  const heuristicRoster = modelPlayerIndex === 0 ? generatedBaseline : generatedModel;

  const result = runHeadlessMatch(
    createHeadlessGameStateFromArmyLists({
      missionId: 'heart-of-battle',
      armyLists,
      firstPlayerIndex: modelPlayerIndex,
    }),
    {
      maxCommands: 1500,
      aiPlayers: [
        {
          enabled: true,
          playerIndex: 0,
          strategyTier: AIStrategyTier.Tactical,
        },
        {
          enabled: true,
          playerIndex: 1,
          strategyTier: AIStrategyTier.Tactical,
        },
      ],
    },
  );

  const classification = classifyHeadlessResult(result, modelPlayerIndex);
  if (classification.outcome === 'favored-win') {
    modelWins += 1;
  } else if (classification.outcome === 'favored-loss') {
    heuristicWins += 1;
  } else if (classification.outcome === 'draw') {
    draws += 1;
  } else if (classification.outcome === 'timeout') {
    timeouts += 1;
  } else {
    aborted += 1;
  }

  results.push({
    matchIndex,
    modelPlayerIndex,
    candidateModelId,
    winnerPlayerIndex: result.finalState.winnerPlayerIndex,
    classifiedOutcome: classification.outcome,
    classifiedReason: classification.reason,
    responsiblePlayerIndex: classification.responsiblePlayerIndex,
    modelFaction: armyLists[modelPlayerIndex].faction,
    heuristicFaction: armyLists[modelPlayerIndex === 0 ? 1 : 0].faction,
    terminatedReason: result.terminatedReason,
    errorMessage: result.errorMessage,
    finalStateHash: result.finalStateHash,
    modelRosterScore: generatedModel.diagnostics.selectedScore,
    heuristicRosterScore: generatedBaseline.diagnostics.selectedScore,
    pairValidation: {
      isValid: pairValidation.isValid,
      errors: pairValidation.errors,
    },
    modelRoster: {
      playerIndex: modelPlayerIndex,
      validation: modelRoster.validation,
      diagnostics: modelRoster.diagnostics,
      armyList: modelRoster.armyList,
    },
    heuristicRoster: {
      playerIndex: modelPlayerIndex === 0 ? 1 : 0,
      validation: heuristicRoster.validation,
      diagnostics: heuristicRoster.diagnostics,
      armyList: heuristicRoster.armyList,
    },
  });

  progress.tick(
    `W-L-D ${modelWins}-${heuristicWins}-${draws} aborted=${aborted} timeouts=${timeouts} last=${classification.outcome}`,
  );
}

const summary = {
  candidateModelId,
  pointsLimit,
  timeBudgetMs,
  modelWins,
  heuristicWins,
  draws,
  aborted,
  timeouts,
  winRate: matches > 0 ? modelWins / matches : 0,
  results,
};
progress.finish(`W-L-D ${modelWins}-${heuristicWins}-${draws} aborted=${aborted} timeouts=${timeouts}`);

if (summaryOut) {
  writeJson(summaryOut, {
    threshold,
    ...summary,
  });
}

console.log(JSON.stringify({
  candidateModelId,
  threshold,
  pointsLimit,
  matches,
  modelWins,
  heuristicWins,
  draws,
  aborted,
  timeouts,
  winRate: summary.winRate,
  passed: summary.winRate > threshold,
}, null, 2));

if (summary.winRate <= threshold) {
  process.exitCode = 1;
}
