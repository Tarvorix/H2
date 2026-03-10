import type { GameState } from '@hh/types';
import type { CommandResult } from '@hh/engine';
import { processCommand } from '@hh/engine';
import type {
  AIPlayerConfig,
  AIDiagnostics,
  MacroAction,
  QueuedCommandStep,
  SearchConfig,
  SearchResult,
} from '../types';
import { AIStrategyTier } from '../types';
import { NNUEEvaluator } from './evaluator';
import { SeededDiceProvider } from './deterministic-dice';
import { generateMacroActions, isRealDecisionNode, type SearchNodeState } from './candidate-generator';
import { getStateFingerprint } from '../state-utils';
import { DEFAULT_GAMEPLAY_NNUE_MODEL_ID } from './model-registry';

interface SearchRuntime {
  rootPlayerIndex: number;
  config: SearchConfig;
  evaluator: NNUEEvaluator;
  startedAt: number;
  deadlineAt: number;
  nodeCount: number;
  transpositionTable: Map<string, { depth: number; score: number; principalVariation: string[] }>;
  historyHeuristic: Map<string, number>;
  killerMoves: Map<number, string[]>;
  rootOrderingScores: Map<string, number>;
}

interface SearchEvaluation {
  score: number;
  principalVariation: string[];
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function createSearchConfig(config: AIPlayerConfig): SearchConfig {
  if (config.strategyTier !== AIStrategyTier.Engine) {
    throw new Error('Engine search config requested for a non-Engine AI player.');
  }

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

function createActedSignature(node: SearchNodeState): string {
  return [...node.actedUnitIds].sort((left, right) => left.localeCompare(right)).join('|');
}

function createNodeKey(node: SearchNodeState, rootPlayerIndex: number): string {
  return `${getStateFingerprint(node.state)}::${rootPlayerIndex}::${createActedSignature(node)}`;
}

function markActionAsActed(
  node: SearchNodeState,
  action: MacroAction,
  nextState: SearchNodeState,
): void {
  if (
    node.state.currentPhase !== nextState.state.currentPhase ||
    node.state.currentSubPhase !== nextState.state.currentSubPhase
  ) {
    nextState.actedUnitIds.clear();
    return;
  }

  action.actorIds.forEach((actorId) => nextState.actedUnitIds.add(actorId));
}

function transitionNode(
  runtime: SearchRuntime,
  node: SearchNodeState,
  action: MacroAction,
  sampleIndex: number,
): { node: SearchNodeState; result: CommandResult; queuedPlan: QueuedCommandStep[] } | null {
  let state = node.state;
  let actedUnitIds = new Set(node.actedUnitIds);
  let lastResult: CommandResult | null = null;
  const queuedPlan: QueuedCommandStep[] = [];

  for (let commandIndex = 0; commandIndex < action.commands.length; commandIndex++) {
    const command = action.commands[commandIndex];
    const fingerprintBeforeCommand = getStateFingerprint(state);
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

    const nextNode: SearchNodeState = {
      state: result.state,
      actedUnitIds: new Set(actedUnitIds),
    };
    markActionAsActed(
      { state, actedUnitIds },
      action,
      nextNode,
    );

    state = nextNode.state;
    actedUnitIds = nextNode.actedUnitIds;
    lastResult = result;

    if (commandIndex < action.commands.length - 1) {
      queuedPlan.push({
        command: action.commands[commandIndex + 1],
        expectedStateFingerprint: getStateFingerprint(state),
        decisionOwner: state.awaitingReaction
          ? (state.activePlayerIndex === 0 ? 1 : 0)
          : state.activePlayerIndex,
        phase: state.currentPhase,
        subPhase: state.currentSubPhase,
        label: action.label,
      });
    }
  }

  let autoAdvanceState: SearchNodeState = {
    state,
    actedUnitIds,
  };

  for (let step = 0; step < runtime.config.maxAutoAdvanceSteps; step++) {
    if (autoAdvanceState.state.isGameOver) break;
    const decisionOwner = autoAdvanceState.state.awaitingReaction
      ? (autoAdvanceState.state.activePlayerIndex === 0 ? 1 : 0)
      : autoAdvanceState.state.activePlayerIndex;
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

    const fingerprintBeforeCommand = getStateFingerprint(autoAdvanceState.state);
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

function staticEvaluate(runtime: SearchRuntime, node: SearchNodeState): SearchEvaluation {
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

function updateHistory(runtime: SearchRuntime, action: MacroAction, depth: number): void {
  const current = runtime.historyHeuristic.get(action.id) ?? 0;
  runtime.historyHeuristic.set(action.id, current + (depth * depth));
}

function registerKillerMove(runtime: SearchRuntime, depth: number, action: MacroAction): void {
  const existing = runtime.killerMoves.get(depth) ?? [];
  const updated = [action.id, ...existing.filter((entry) => entry !== action.id)].slice(0, 2);
  runtime.killerMoves.set(depth, updated);
}

function compareActionPriority(
  runtime: SearchRuntime,
  depth: number,
  left: MacroAction,
  right: MacroAction,
): number {
  const killerMoves = new Set(runtime.killerMoves.get(depth) ?? []);
  const killerDelta = Number(killerMoves.has(right.id)) - Number(killerMoves.has(left.id));
  if (killerDelta !== 0) return killerDelta;
  const historyDelta = (runtime.historyHeuristic.get(right.id) ?? 0) - (runtime.historyHeuristic.get(left.id) ?? 0);
  if (historyDelta !== 0) return historyDelta;
  return right.orderingScore - left.orderingScore;
}

function orderActions(
  runtime: SearchRuntime,
  depth: number,
  actions: MacroAction[],
): MacroAction[] {
  return [...actions].sort((left, right) => compareActionPriority(runtime, depth, left, right));
}

function getRootOrderingScore(
  runtime: SearchRuntime,
  rootNode: SearchNodeState,
  action: MacroAction,
): number {
  const cached = runtime.rootOrderingScores.get(action.id);
  if (cached !== undefined) {
    return cached;
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

function orderRootActions(
  runtime: SearchRuntime,
  rootNode: SearchNodeState,
  depth: number,
  actions: MacroAction[],
): MacroAction[] {
  return [...actions].sort((left, right) => {
    const rootDelta = getRootOrderingScore(runtime, rootNode, right) - getRootOrderingScore(runtime, rootNode, left);
    if (rootDelta !== 0) return rootDelta;
    return compareActionPriority(runtime, depth, left, right);
  });
}

function searchNode(
  runtime: SearchRuntime,
  node: SearchNodeState,
  depth: number,
  alpha: number,
  beta: number,
): SearchEvaluation {
  if (nowMs() >= runtime.deadlineAt || depth <= 0 || node.state.isGameOver) {
    return staticEvaluate(runtime, node);
  }

  const decisionOwner = node.state.awaitingReaction
    ? (node.state.activePlayerIndex === 0 ? 1 : 0)
    : node.state.activePlayerIndex;
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
  let bestPV: string[] = [];

  for (const action of actions) {
    let totalScore = 0;
    let validSamples = 0;
    let actionPV: string[] = [];

    for (let sampleIndex = 0; sampleIndex < runtime.config.rolloutCount; sampleIndex++) {
      const transition = transitionNode(runtime, node, action, sampleIndex);
      if (!transition) {
        continue;
      }

      const child = searchNode(
        runtime,
        transition.node,
        depth - 1,
        alpha,
        beta,
      );
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

export function searchBestAction(
  state: GameState,
  playerConfig: AIPlayerConfig,
  actedUnitIds: Set<string>,
): SearchResult {
  const config = createSearchConfig(playerConfig);
  const runtime: SearchRuntime = {
    rootPlayerIndex: playerConfig.playerIndex,
    config,
    evaluator: new NNUEEvaluator(config.nnueModelId),
    startedAt: nowMs(),
    deadlineAt: nowMs() + config.timeBudgetMs,
    nodeCount: 0,
    transpositionTable: new Map(),
    historyHeuristic: new Map(),
    killerMoves: new Map(),
    rootOrderingScores: new Map(),
  };

  const rootNode: SearchNodeState = {
    state,
    actedUnitIds: new Set(actedUnitIds),
  };
  const rootActions = generateMacroActions(rootNode, state.awaitingReaction ? (state.activePlayerIndex === 0 ? 1 : 0) : state.activePlayerIndex, config);
  if (rootActions.length === 0) {
    const diagnostics: AIDiagnostics = {
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
    };
  }

  let bestAction = rootActions[0];
  let bestScore = -Infinity;
  let bestPV = [bestAction.label];
  let bestQueuedPlan: QueuedCommandStep[] = [];
  let completedDepth = 0;
  let aspirationCenter = 0;

  for (let depth = 1; depth <= config.maxDepthSoft; depth++) {
    if (nowMs() >= runtime.deadlineAt) {
      break;
    }

    let alpha = aspirationCenter - config.aspirationWindow;
    let beta = aspirationCenter + config.aspirationWindow;
    let depthBestAction = bestAction;
    let depthBestScore = -Infinity;
    let depthBestPV = bestPV;
    let depthBestQueuedPlan = bestQueuedPlan;

    for (let attempt = 0; attempt < 2; attempt++) {
      let localBestAction = depthBestAction;
      let localBestScore = -Infinity;
      let localBestPV = depthBestPV;
      let localBestQueuedPlan = depthBestQueuedPlan;

      for (const action of orderRootActions(runtime, rootNode, depth, rootActions)) {
        if (nowMs() >= runtime.deadlineAt) break;

        let totalScore = 0;
        let validSamples = 0;
        let principalVariation: string[] = [];
        let queuedPlan: QueuedCommandStep[] = [];

        for (let sampleIndex = 0; sampleIndex < config.rolloutCount; sampleIndex++) {
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

  const diagnostics: AIDiagnostics = {
    tier: AIStrategyTier.Engine,
    modelId: config.nnueModelId,
    selectedMacroActionId: bestAction.id,
    selectedMacroActionLabel: bestAction.label,
    selectedCommandType: bestAction.commands[0]?.type,
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
  };
}
