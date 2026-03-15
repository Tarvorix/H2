import {
  AIStrategyTier,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  NNUEEvaluator,
} from '../../packages/ai/dist/index.js';
import { SeededDiceProvider } from '../../packages/ai/dist/engine/deterministic-dice.js';
import {
  generateMacroActions,
  isRealDecisionNode,
} from '../../packages/ai/dist/engine/candidate-generator.js';
import {
  hashGameState,
  processCommand,
} from '../../packages/engine/dist/index.js';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getBudgetSafetyMarginMs(timeBudgetMs) {
  if (timeBudgetMs <= 0) return 0;
  return Math.max(10, Math.min(100, Math.floor(timeBudgetMs * 0.15)));
}

function hasTimedOut(runtime) {
  return nowMs() >= runtime.deadlineAt;
}

function createSearchConfig(config) {
  const timeBudgetMs = config.timeBudgetMs ?? 500;
  const maxDepthSoft = config.maxDepthSoft ?? (timeBudgetMs <= 600 ? 3 : 4);

  return {
    timeBudgetMs,
    nnueModelId: config.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
    baseSeed: config.baseSeed ?? 1337,
    rolloutCount: Math.max(1, config.rolloutCount ?? 1),
    maxDepthSoft: Math.max(1, maxDepthSoft),
    diagnosticsEnabled: config.diagnosticsEnabled ?? false,
    maxRootActions: timeBudgetMs <= 600 ? 20 : 24,
    maxActionsPerUnit: timeBudgetMs <= 600 ? 4 : 5,
    aspirationWindow: 35,
    maxAutoAdvanceSteps: 8,
  };
}

function getDecisionPlayerIndex(state) {
  return state.awaitingReaction
    ? (state.activePlayerIndex === 0 ? 1 : 0)
    : state.activePlayerIndex;
}

function createActedSignature(node) {
  return [...node.actedUnitIds].sort((left, right) => left.localeCompare(right)).join('|');
}

function createNodeKey(node, rootPlayerIndex) {
  return `${hashGameState(node.state)}::${rootPlayerIndex}::${createActedSignature(node)}`;
}

function markActionAsActed(node, action, nextState) {
  if (
    node.state.currentPhase !== nextState.state.currentPhase ||
    node.state.currentSubPhase !== nextState.state.currentSubPhase
  ) {
    nextState.actedUnitIds.clear();
    return;
  }

  action.actorIds.forEach((actorId) => nextState.actedUnitIds.add(actorId));
}

function transitionNode(runtime, node, action, sampleIndex) {
  let state = node.state;
  let actedUnitIds = new Set(node.actedUnitIds);
  let lastResult = null;
  const queuedPlan = [];

  for (let commandIndex = 0; commandIndex < action.commands.length; commandIndex++) {
    if (hasTimedOut(runtime)) {
      return null;
    }

    const command = action.commands[commandIndex];
    const fingerprintBeforeCommand = hashGameState(state);
    const dice = new SeededDiceProvider([
      runtime.config.baseSeed,
      fingerprintBeforeCommand,
      action.id,
      sampleIndex,
      commandIndex,
    ]);
    const result = processCommand(state, command, dice);
    runtime.nodeCount += 1;

    if (!result.accepted) {
      return null;
    }

    const nextNode = {
      state: result.state,
      actedUnitIds: new Set(actedUnitIds),
    };
    markActionAsActed({ state, actedUnitIds }, action, nextNode);

    state = nextNode.state;
    actedUnitIds = nextNode.actedUnitIds;
    lastResult = result;

    if (commandIndex < action.commands.length - 1) {
      queuedPlan.push({
        command: action.commands[commandIndex + 1],
        expectedStateFingerprint: hashGameState(state),
        decisionOwner: getDecisionPlayerIndex(state),
        phase: state.currentPhase,
        subPhase: state.currentSubPhase,
        label: action.label,
      });
    }
  }

  let autoAdvanceState = {
    state,
    actedUnitIds,
  };

  for (let step = 0; step < runtime.config.maxAutoAdvanceSteps; step++) {
    if (hasTimedOut(runtime)) break;
    if (autoAdvanceState.state.isGameOver) break;

    const decisionOwner = getDecisionPlayerIndex(autoAdvanceState.state);
    if (isRealDecisionNode(autoAdvanceState, decisionOwner, runtime.config)) {
      break;
    }

    const autoActions = generateMacroActions(autoAdvanceState, decisionOwner, runtime.config, {
      includeAdvanceCommands: true,
    });
    const autoAdvanceAction = autoActions.find((candidate) =>
      candidate.commands.length === 1 &&
      (candidate.commands[0].type === 'endSubPhase' || candidate.commands[0].type === 'endPhase'),
    );
    if (!autoAdvanceAction) break;

    const fingerprintBeforeCommand = hashGameState(autoAdvanceState.state);
    const dice = new SeededDiceProvider([
      runtime.config.baseSeed,
      fingerprintBeforeCommand,
      autoAdvanceAction.id,
      sampleIndex,
      step,
    ]);
    const autoResult = processCommand(autoAdvanceState.state, autoAdvanceAction.commands[0], dice);
    runtime.nodeCount += 1;
    if (!autoResult.accepted) {
      break;
    }

    autoAdvanceState = {
      state: autoResult.state,
      actedUnitIds: new Set(),
    };
    lastResult = autoResult;
  }

  if (!lastResult) {
    return null;
  }

  return {
    node: autoAdvanceState,
    result: lastResult,
    queuedPlan,
  };
}

function staticEvaluate(runtime, node) {
  if (node.state.isGameOver) {
    if (node.state.winnerPlayerIndex === runtime.rootPlayerIndex) {
      return { score: 100_000, principalVariation: ['game-over:win'] };
    }
    if (node.state.winnerPlayerIndex === null) {
      return { score: 0, principalVariation: ['game-over:draw'] };
    }
    return { score: -100_000, principalVariation: ['game-over:loss'] };
  }

  return {
    score: runtime.evaluator.evaluate(node.state, runtime.rootPlayerIndex),
    principalVariation: [],
  };
}

function updateHistory(runtime, action, depth) {
  const current = runtime.historyHeuristic.get(action.id) ?? 0;
  runtime.historyHeuristic.set(action.id, current + (depth * depth));
}

function registerKillerMove(runtime, depth, action) {
  const existing = runtime.killerMoves.get(depth) ?? [];
  const updated = [action.id, ...existing.filter((entry) => entry !== action.id)].slice(0, 2);
  runtime.killerMoves.set(depth, updated);
}

function compareActionPriority(runtime, depth, left, right) {
  const killerMoves = new Set(runtime.killerMoves.get(depth) ?? []);
  const killerDelta = Number(killerMoves.has(right.id)) - Number(killerMoves.has(left.id));
  if (killerDelta !== 0) return killerDelta;

  const historyDelta = (runtime.historyHeuristic.get(right.id) ?? 0) - (runtime.historyHeuristic.get(left.id) ?? 0);
  if (historyDelta !== 0) return historyDelta;

  return right.orderingScore - left.orderingScore;
}

function orderActions(runtime, depth, actions) {
  return [...actions].sort((left, right) => compareActionPriority(runtime, depth, left, right));
}

function getRootOrderingScore(runtime, rootNode, action) {
  const cached = runtime.rootOrderingScores.get(action.id);
  if (cached !== undefined) {
    return cached;
  }

  if (hasTimedOut(runtime)) {
    const fallback = action.orderingScore;
    runtime.rootOrderingScores.set(action.id, fallback);
    return fallback;
  }

  const transition = transitionNode(runtime, rootNode, action, 0);
  if (!transition) {
    runtime.rootOrderingScores.set(action.id, Number.NEGATIVE_INFINITY);
    return Number.NEGATIVE_INFINITY;
  }

  const staticScore = staticEvaluate(runtime, transition.node).score;
  const rootScore = staticScore + (action.orderingScore * 0.25) + (transition.queuedPlan.length * 1.5);
  runtime.rootOrderingScores.set(action.id, rootScore);
  return rootScore;
}

function orderRootActions(runtime, rootNode, depth, actions) {
  return [...actions].sort((left, right) => {
    const rootDelta = getRootOrderingScore(runtime, rootNode, right) - getRootOrderingScore(runtime, rootNode, left);
    if (rootDelta !== 0) return rootDelta;
    return compareActionPriority(runtime, depth, left, right);
  });
}

function searchNode(runtime, node, depth, alpha, beta) {
  if (hasTimedOut(runtime) || depth <= 0 || node.state.isGameOver) {
    return staticEvaluate(runtime, node);
  }

  const decisionOwner = getDecisionPlayerIndex(node.state);
  const nodeKey = createNodeKey(node, runtime.rootPlayerIndex);
  const cached = runtime.transpositionTable.get(nodeKey);
  if (cached && cached.depth >= depth) {
    return {
      score: cached.score,
      principalVariation: [...cached.principalVariation],
    };
  }

  const actions = orderActions(
    runtime,
    depth,
    generateMacroActions(node, decisionOwner, runtime.config),
  );
  if (actions.length === 0) {
    return staticEvaluate(runtime, node);
  }

  const maximizing = decisionOwner === runtime.rootPlayerIndex;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestPV = [];

  for (const action of actions) {
    if (hasTimedOut(runtime)) break;
    let totalScore = 0;
    let validSamples = 0;
    let actionPV = [];

    for (let sampleIndex = 0; sampleIndex < runtime.config.rolloutCount; sampleIndex++) {
      if (hasTimedOut(runtime)) break;
      const transition = transitionNode(runtime, node, action, sampleIndex);
      if (!transition) continue;

      const child = searchNode(runtime, transition.node, depth - 1, alpha, beta);
      totalScore += child.score;
      validSamples += 1;
      if (actionPV.length === 0 || Math.abs(child.score) > Math.abs(totalScore / validSamples)) {
        actionPV = child.principalVariation;
      }
    }

    if (validSamples === 0) {
      continue;
    }

    const averageScore = totalScore / validSamples;
    const principalVariation = [action.label, ...actionPV];

    if (maximizing) {
      if (averageScore > bestScore) {
        bestScore = averageScore;
        bestPV = principalVariation;
      }
      alpha = Math.max(alpha, averageScore);
    } else {
      if (averageScore < bestScore) {
        bestScore = averageScore;
        bestPV = principalVariation;
      }
      beta = Math.min(beta, averageScore);
    }

    updateHistory(runtime, action, depth);
    if (beta <= alpha) {
      registerKillerMove(runtime, depth, action);
      break;
    }
  }

  const evaluation = Number.isFinite(bestScore)
    ? { score: bestScore, principalVariation: bestPV }
    : staticEvaluate(runtime, node);
  runtime.transpositionTable.set(nodeKey, {
    depth,
    score: evaluation.score,
    principalVariation: evaluation.principalVariation,
  });
  return evaluation;
}

function evaluateEmergencyRootBaseline(runtime, rootNode, rootActions) {
  const prioritizedActions = [...rootActions].sort((left, right) => right.orderingScore - left.orderingScore);
  let bestAction = null;
  let bestScore = -Infinity;
  let bestPV = [];
  let bestQueuedPlan = [];

  for (const action of prioritizedActions) {
    if (hasTimedOut(runtime)) break;

    let totalScore = 0;
    let validSamples = 0;
    let principalVariation = [];
    let queuedPlan = [];

    for (let sampleIndex = 0; sampleIndex < runtime.config.rolloutCount; sampleIndex++) {
      if (hasTimedOut(runtime)) break;
      const transition = transitionNode(runtime, rootNode, action, sampleIndex);
      if (!transition) continue;

      const evaluation = staticEvaluate(runtime, transition.node);
      totalScore += evaluation.score;
      validSamples += 1;
      if (principalVariation.length === 0) {
        principalVariation = evaluation.principalVariation;
        queuedPlan = transition.queuedPlan;
      }
    }

    if (validSamples === 0) continue;

    const averageScore = totalScore / validSamples;
    runtime.rootOrderingScores.set(
      action.id,
      averageScore + (action.orderingScore * 0.25) + (queuedPlan.length * 1.5),
    );

    if (averageScore > bestScore || bestAction === null) {
      bestAction = action;
      bestScore = averageScore;
      bestPV = [action.label, ...principalVariation];
      bestQueuedPlan = queuedPlan;
    }
  }

  return {
    bestAction,
    bestScore,
    bestPV,
    bestQueuedPlan,
  };
}

export function searchAlphaTeacherBestAction(state, playerConfig, actedUnitIds) {
  const config = createSearchConfig(playerConfig);
  const startedAt = nowMs();
  const timeBudgetMs = Math.max(1, config.timeBudgetMs);
  const safetyMarginMs = getBudgetSafetyMarginMs(timeBudgetMs);
  const runtime = {
    rootPlayerIndex: playerConfig.playerIndex,
    config,
    evaluator: new NNUEEvaluator(config.nnueModelId),
    startedAt,
    deadlineAt: startedAt + Math.max(1, timeBudgetMs - safetyMarginMs),
    nodeCount: 0,
    transpositionTable: new Map(),
    historyHeuristic: new Map(),
    killerMoves: new Map(),
    rootOrderingScores: new Map(),
  };

  const rootNode = {
    state,
    actedUnitIds: new Set(actedUnitIds),
  };
  const rootActions = generateMacroActions(rootNode, getDecisionPlayerIndex(state), config);
  if (rootActions.length === 0) {
    const diagnostics = {
      tier: AIStrategyTier.Engine,
      modelId: config.nnueModelId,
      nodesVisited: runtime.nodeCount,
      depthCompleted: 0,
      searchTimeMs: nowMs() - runtime.startedAt,
      principalVariation: [],
      error: 'No legal engine actions were generated.',
    };
    return {
      bestAction: null,
      score: 0,
      depthCompleted: 0,
      nodesVisited: runtime.nodeCount,
      searchTimeMs: diagnostics.searchTimeMs ?? 0,
      principalVariation: [],
      diagnostics,
      queuedPlan: [],
      rootActions,
    };
  }

  let bestAction = null;
  let bestScore = -Infinity;
  let bestPV = [];
  let bestQueuedPlan = [];
  let completedDepth = 0;
  let aspirationCenter = 0;

  const emergencyBaseline = evaluateEmergencyRootBaseline(runtime, rootNode, rootActions);
  if (emergencyBaseline.bestAction) {
    bestAction = emergencyBaseline.bestAction;
    bestScore = emergencyBaseline.bestScore;
    bestPV = emergencyBaseline.bestPV;
    bestQueuedPlan = emergencyBaseline.bestQueuedPlan;
    completedDepth = 1;
    aspirationCenter = emergencyBaseline.bestScore;
  } else {
    bestAction = [...rootActions].sort((left, right) => right.orderingScore - left.orderingScore)[0] ?? null;
    if (bestAction) {
      bestPV = [bestAction.label];
    }
  }

  for (let depth = completedDepth >= 1 ? 2 : 1; depth <= config.maxDepthSoft; depth++) {
    if (hasTimedOut(runtime)) {
      break;
    }

    let alpha = aspirationCenter - config.aspirationWindow;
    let beta = aspirationCenter + config.aspirationWindow;
    let depthBestAction = bestAction;
    let depthBestScore = bestAction && Number.isFinite(bestScore) ? bestScore : -Infinity;
    let depthBestPV = bestPV;
    let depthBestQueuedPlan = bestQueuedPlan;

    for (let attempt = 0; attempt < 2; attempt++) {
      let localBestAction = depthBestAction;
      let localBestScore = depthBestScore;
      let localBestPV = depthBestPV;
      let localBestQueuedPlan = depthBestQueuedPlan;

      for (const action of orderRootActions(runtime, rootNode, depth, rootActions)) {
        if (hasTimedOut(runtime)) break;

        let totalScore = 0;
        let validSamples = 0;
        let principalVariation = [];
        let queuedPlan = [];

        for (let sampleIndex = 0; sampleIndex < config.rolloutCount; sampleIndex++) {
          if (hasTimedOut(runtime)) break;
          const transition = transitionNode(runtime, rootNode, action, sampleIndex);
          if (!transition) continue;

          const child = searchNode(runtime, transition.node, depth - 1, alpha, beta);
          totalScore += child.score;
          validSamples += 1;
          if (principalVariation.length === 0) {
            principalVariation = child.principalVariation;
            queuedPlan = transition.queuedPlan;
          }
        }

        if (validSamples === 0) continue;
        const averageScore = totalScore / validSamples;
        if (averageScore > localBestScore) {
          localBestScore = averageScore;
          localBestAction = action;
          localBestPV = [action.label, ...principalVariation];
          localBestQueuedPlan = queuedPlan;
        }
        alpha = Math.max(alpha, averageScore);
      }

      depthBestAction = localBestAction;
      depthBestScore = localBestScore;
      depthBestPV = localBestPV;
      depthBestQueuedPlan = localBestQueuedPlan;

      if (localBestScore <= (aspirationCenter - config.aspirationWindow)) {
        alpha = -Infinity;
        beta = aspirationCenter + (config.aspirationWindow * 2);
        continue;
      }
      if (localBestScore >= (aspirationCenter + config.aspirationWindow)) {
        alpha = aspirationCenter - (config.aspirationWindow * 2);
        beta = Infinity;
        continue;
      }
      break;
    }

    if (Number.isFinite(depthBestScore)) {
      bestAction = depthBestAction;
      bestScore = depthBestScore;
      bestPV = depthBestPV;
      bestQueuedPlan = depthBestQueuedPlan;
      completedDepth = depth;
      aspirationCenter = depthBestScore;
    }
  }

  const diagnostics = {
    tier: AIStrategyTier.Engine,
    modelId: config.nnueModelId,
    selectedMacroActionId: bestAction?.id,
    selectedMacroActionLabel: bestAction?.label,
    selectedCommandType: bestAction?.commands[0]?.type,
    score: bestScore,
    depthCompleted: completedDepth,
    nodesVisited: runtime.nodeCount,
    searchTimeMs: nowMs() - runtime.startedAt,
    rolloutCount: config.rolloutCount,
    principalVariation: bestPV,
  };

  return {
    bestAction,
    score: bestScore,
    depthCompleted: completedDepth,
    nodesVisited: runtime.nodeCount,
    searchTimeMs: diagnostics.searchTimeMs ?? 0,
    principalVariation: bestPV,
    diagnostics,
    queuedPlan: bestQueuedPlan,
    rootActions,
  };
}
