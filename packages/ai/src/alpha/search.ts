import type { GameState } from '@hh/types';
import type {
  AIPlayerConfig,
  AlphaAIDiagnostics,
  AlphaSearchConfig,
  AlphaSearchResult,
  MacroAction,
  QueuedCommandStep,
  SearchConfig,
} from '../types';
import { AIStrategyTier } from '../types';
import { generateMacroActions } from '../engine/candidate-generator';
import { getDecisionPlayerIndex, getStateFingerprint } from '../state-utils';
import { encodeAlphaActions } from './action-encoder';
import { sampleMacroActionTransition } from './chance-handling';
import {
  createDefaultAlphaSearchConfig,
  DEFAULT_ALPHA_MODEL_ID,
  shannonEntropy,
  softmax,
} from './common';
import { alphaForwardPass } from './inference';
import { resolveAlphaModel } from './model-registry';
import { computePUCTScore } from './puct';
import { encodeAlphaState, estimateAlphaValueTargets } from './state-encoder';

interface AlphaActionEdge {
  action: MacroAction;
  prior: number;
  policyLogit: number;
  visits: number;
  valueSum: number;
  chanceNode: AlphaChanceNode | null;
  blocked: boolean;
}

interface AlphaChanceOutcome {
  key: string;
  visits: number;
  valueSum: number;
  queuedPlan: QueuedCommandStep[];
  child: AlphaTreeNode;
}

interface AlphaChanceNode {
  visits: number;
  outcomes: Map<string, AlphaChanceOutcome>;
}

interface AlphaTreeNode {
  kind: 'decision' | 'reaction';
  state: GameState;
  actedUnitIds: Set<string>;
  fingerprint: string;
  decisionOwner: number;
  visits: number;
  valueSum: number;
  expanded: boolean;
  edges: AlphaActionEdge[];
}

interface SelectionStep {
  node: AlphaTreeNode;
  edge: AlphaActionEdge;
  outcome: AlphaChanceOutcome;
}

interface PendingExpansion {
  path: SelectionStep[];
  node: AlphaTreeNode;
  actions: MacroAction[];
}

interface AlphaSearchRuntime {
  rootPlayerIndex: number;
  config: AlphaSearchConfig;
  startedAt: number;
  deadlineAt: number;
  nodesExpanded: number;
  modelId: string;
}

const ROOT_CACHE = new Map<string, AlphaTreeNode>();

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function createMacroSearchConfig(config: AlphaSearchConfig): SearchConfig {
  return {
    timeBudgetMs: config.timeBudgetMs,
    nnueModelId: DEFAULT_ALPHA_MODEL_ID,
    baseSeed: config.baseSeed,
    rolloutCount: 1,
    maxDepthSoft: 1,
    diagnosticsEnabled: false,
    maxRootActions: config.maxRootActions,
    maxActionsPerUnit: config.maxActionsPerUnit,
    aspirationWindow: 0,
    maxAutoAdvanceSteps: config.maxAutoAdvanceSteps,
  };
}

function createActedSignature(actedUnitIds: Set<string>): string {
  return [...actedUnitIds].sort((left, right) => left.localeCompare(right)).join('|');
}

function buildRootCacheKey(
  state: GameState,
  rootPlayerIndex: number,
  actedUnitIds: Set<string>,
  modelId: string,
): string {
  return `${getStateFingerprint(state)}::${rootPlayerIndex}::${createActedSignature(actedUnitIds)}::${modelId}`;
}

function createTreeNode(
  state: GameState,
  actedUnitIds: Set<string>,
  decisionOwner: number,
): AlphaTreeNode {
  return {
    kind: state.awaitingReaction ? 'reaction' : 'decision',
    state,
    actedUnitIds: new Set(actedUnitIds),
    fingerprint: getStateFingerprint(state),
    decisionOwner,
    visits: 0,
    valueSum: 0,
    expanded: false,
    edges: [],
  };
}

function getOrCreateRootNode(
  state: GameState,
  rootPlayerIndex: number,
  actedUnitIds: Set<string>,
  modelId: string,
  reuseRoots: boolean,
): AlphaTreeNode {
  const cacheKey = buildRootCacheKey(state, rootPlayerIndex, actedUnitIds, modelId);
  if (reuseRoots) {
    const cached = ROOT_CACHE.get(cacheKey);
    if (cached) {
      cached.state = state;
      cached.actedUnitIds = new Set(actedUnitIds);
      cached.fingerprint = getStateFingerprint(state);
      cached.decisionOwner = getDecisionPlayerIndex(state);
      cached.kind = state.awaitingReaction ? 'reaction' : 'decision';
      return cached;
    }
  }

  const root = createTreeNode(state, actedUnitIds, getDecisionPlayerIndex(state));
  if (reuseRoots) {
    ROOT_CACHE.set(cacheKey, root);
  }
  return root;
}

function selectBestEdge(runtime: AlphaSearchRuntime, node: AlphaTreeNode): AlphaActionEdge | null {
  const candidates = node.edges.filter((edge) => !edge.blocked);
  if (candidates.length === 0) return null;

  const parentVisits = Math.max(1, node.visits);
  let bestEdge: AlphaActionEdge | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const edge of candidates) {
    const meanValue = edge.visits > 0 ? (edge.valueSum / edge.visits) : 0;
    const exploitation = node.decisionOwner === runtime.rootPlayerIndex ? meanValue : -meanValue;
    const score = computePUCTScore(edge.prior, parentVisits, edge.visits, exploitation, runtime.config.puctExploration);
    if (score > bestScore) {
      bestScore = score;
      bestEdge = edge;
    }
  }

  return bestEdge;
}

function getTerminalValue(state: GameState, rootPlayerIndex: number): number {
  if (!state.isGameOver) {
    return estimateAlphaValueTargets(state, rootPlayerIndex).value;
  }
  if (state.winnerPlayerIndex === null) return 0;
  return state.winnerPlayerIndex === rootPlayerIndex ? 1 : -1;
}

function blendPriors(
  modelPriors: number[],
  actions: MacroAction[],
  blend: number,
): number[] {
  const heuristic = softmax(actions.map((action) => action.orderingScore / 18));
  const priors = actions.map((_, index) => {
    const modelPrior = modelPriors[index] ?? 0;
    const heuristicPrior = heuristic[index] ?? 0;
    return (modelPrior * (1 - blend)) + (heuristicPrior * blend);
  });
  const total = priors.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Array.from({ length: actions.length }, () => 1 / Math.max(1, actions.length));
  }
  return priors.map((value) => value / total);
}

function expandNode(
  runtime: AlphaSearchRuntime,
  node: AlphaTreeNode,
  actions: MacroAction[],
  policyLogits: number[],
  policyPriors: number[],
  blendedValue: number,
): void {
  const priors = blendPriors(policyPriors, actions, runtime.config.policyPriorBlend);
  node.edges = actions.map((action, index) => ({
    action,
    prior: priors[index] ?? 0,
    policyLogit: policyLogits[index] ?? Number.NEGATIVE_INFINITY,
    visits: 0,
    valueSum: 0,
    chanceNode: null,
    blocked: false,
  }));
  node.expanded = true;
  node.visits += 1;
  node.valueSum += blendedValue;
  runtime.nodesExpanded += 1;
}

function backupTerminalPath(path: SelectionStep[], node: AlphaTreeNode, value: number): void {
  node.visits += 1;
  node.valueSum += value;
  for (let index = path.length - 1; index >= 0; index--) {
    const step = path[index];
    step.node.visits += 1;
    step.node.valueSum += value;
    step.edge.visits += 1;
    step.edge.valueSum += value;
    if (step.edge.chanceNode) {
      step.edge.chanceNode.visits += 1;
    }
    step.outcome.visits += 1;
    step.outcome.valueSum += value;
  }
}

function selectExpansionTarget(
  runtime: AlphaSearchRuntime,
  root: AlphaTreeNode,
): PendingExpansion | { terminalNode: AlphaTreeNode; terminalValue: number; path: SelectionStep[] } | null {
  let node = root;
  const path: SelectionStep[] = [];
  const macroConfig = createMacroSearchConfig(runtime.config);

  while (true) {
    if (nowMs() >= runtime.deadlineAt) {
      return null;
    }

    if (node.state.isGameOver) {
      return {
        terminalNode: node,
        terminalValue: getTerminalValue(node.state, runtime.rootPlayerIndex),
        path,
      };
    }

    if (!node.expanded) {
      const actions = generateMacroActions(
        {
          state: node.state,
          actedUnitIds: new Set(node.actedUnitIds),
        },
        node.decisionOwner,
        macroConfig,
        { includeAdvanceCommands: true },
      );

      if (actions.length === 0) {
        return {
          terminalNode: node,
          terminalValue: getTerminalValue(node.state, runtime.rootPlayerIndex),
          path,
        };
      }

      return { path, node, actions };
    }

    const edge = selectBestEdge(runtime, node);
    if (!edge) {
      return {
        terminalNode: node,
        terminalValue: getTerminalValue(node.state, runtime.rootPlayerIndex),
        path,
      };
    }

    if (!edge.chanceNode) {
      edge.chanceNode = {
        visits: 0,
        outcomes: new Map(),
      };
    }

    const sampleIndex = edge.chanceNode.visits;
    const transition = sampleMacroActionTransition(
      runtime.config,
      {
        state: node.state,
        actedUnitIds: new Set(node.actedUnitIds),
      },
      edge.action,
      sampleIndex,
    );

    if (!transition) {
      edge.blocked = true;
      continue;
    }

    const outcomeKey = `${transition.stateFingerprint}::${createActedSignature(transition.node.actedUnitIds)}`;
    let outcome = edge.chanceNode.outcomes.get(outcomeKey);
    if (!outcome) {
      outcome = {
        key: outcomeKey,
        visits: 0,
        valueSum: 0,
        queuedPlan: transition.queuedPlan,
        child: createTreeNode(
          transition.node.state,
          transition.node.actedUnitIds,
          transition.decisionOwner,
        ),
      };
      edge.chanceNode.outcomes.set(outcomeKey, outcome);
    }

    path.push({ node, edge, outcome });
    node = outcome.child;
  }
}

function bestOutcomeForEdge(edge: AlphaActionEdge): AlphaChanceOutcome | null {
  if (!edge.chanceNode) return null;
  const outcomes = [...edge.chanceNode.outcomes.values()];
  if (outcomes.length === 0) return null;
  return outcomes.sort((left, right) => {
    if (right.visits !== left.visits) return right.visits - left.visits;
    const leftMean = left.visits > 0 ? left.valueSum / left.visits : 0;
    const rightMean = right.visits > 0 ? right.valueSum / right.visits : 0;
    return rightMean - leftMean;
  })[0] ?? null;
}

function buildPrincipalVariation(root: AlphaTreeNode): string[] {
  const labels: string[] = [];
  let node: AlphaTreeNode | null = root;

  for (let depth = 0; depth < 12 && node?.expanded; depth++) {
    const edge = [...node.edges]
      .filter((candidate) => !candidate.blocked)
      .sort((left, right) => {
        if (right.visits !== left.visits) return right.visits - left.visits;
        return (right.valueSum / Math.max(1, right.visits)) - (left.valueSum / Math.max(1, left.visits));
      })[0];
    if (!edge) break;
    labels.push(edge.action.label);
    const outcome = bestOutcomeForEdge(edge);
    if (!outcome) break;
    node = outcome.child;
  }

  return labels;
}

function chooseBestRootEdge(root: AlphaTreeNode): AlphaActionEdge | null {
  return [...root.edges]
    .filter((edge) => !edge.blocked)
    .sort((left, right) => {
      if (right.visits !== left.visits) return right.visits - left.visits;
      return (right.valueSum / Math.max(1, right.visits)) - (left.valueSum / Math.max(1, left.visits));
    })[0] ?? null;
}

function createDiagnostics(
  runtime: AlphaSearchRuntime,
  root: AlphaTreeNode,
  bestEdge: AlphaActionEdge | null,
  principalVariation: string[],
): AlphaAIDiagnostics {
  const rootPolicy = root.edges.map((edge) => edge.visits / Math.max(1, root.visits));
  const bestAction = bestEdge?.action ?? null;
  return {
    tier: AIStrategyTier.Alpha,
    modelId: runtime.modelId,
    selectedMacroActionId: bestAction?.id,
    selectedMacroActionLabel: bestAction?.label,
    selectedCommandType: bestAction?.commands[0]?.type,
    valueEstimate: root.visits > 0 ? root.valueSum / root.visits : 0,
    rootVisits: root.visits,
    nodesExpanded: runtime.nodesExpanded,
    policyEntropy: shannonEntropy(rootPolicy.filter((value) => value > 0)),
    searchTimeMs: nowMs() - runtime.startedAt,
    principalVariation,
  };
}

export function searchAlphaBestAction(
  state: GameState,
  config: AIPlayerConfig,
  actedUnitIds: Set<string>,
): AlphaSearchResult {
  if (config.strategyTier !== AIStrategyTier.Alpha) {
    throw new Error('Alpha search requested for a non-Alpha AI player.');
  }

  const searchConfig = createDefaultAlphaSearchConfig(config);
  const runtime: AlphaSearchRuntime = {
    rootPlayerIndex: config.playerIndex,
    config: searchConfig,
    startedAt: nowMs(),
    deadlineAt: nowMs() + Math.max(1, searchConfig.timeBudgetMs),
    nodesExpanded: 0,
    modelId: config.alphaModelId ?? DEFAULT_ALPHA_MODEL_ID,
  };
  resolveAlphaModel(runtime.modelId);

  const root = getOrCreateRootNode(
    state,
    runtime.rootPlayerIndex,
    actedUnitIds,
    runtime.modelId,
    searchConfig.reuseRoots,
  );

  let simulations = 0;
  while (simulations < searchConfig.maxSimulations && nowMs() < runtime.deadlineAt) {
    const pending: PendingExpansion[] = [];

    while (
      pending.length < searchConfig.batchSize &&
      (simulations + pending.length) < searchConfig.maxSimulations &&
      nowMs() < runtime.deadlineAt
    ) {
      const selection = selectExpansionTarget(runtime, root);
      if (!selection) break;

      if ('terminalNode' in selection) {
        backupTerminalPath(selection.path, selection.terminalNode, selection.terminalValue);
        simulations += 1;
        continue;
      }

      pending.push(selection);
    }

    if (pending.length === 0) {
      if (nowMs() >= runtime.deadlineAt) break;
      continue;
    }

    const encodedStates = pending.map((entry) => encodeAlphaState(entry.node.state, runtime.rootPlayerIndex));
    const encodedActions = pending.map((entry) => encodeAlphaActions(entry.node.state, entry.node.decisionOwner, entry.actions));
    const model = resolveAlphaModel(runtime.modelId);
    const forward = alphaForwardPass(model, encodedStates, encodedActions);

    for (let index = 0; index < pending.length; index++) {
      const entry = pending[index];
      const heuristic = estimateAlphaValueTargets(entry.node.state, runtime.rootPlayerIndex);
      const modelValue = forward.value[index] ?? 0;
      const blendedValue = (modelValue * (1 - searchConfig.valueBlend)) + (heuristic.value * searchConfig.valueBlend);

      expandNode(
        runtime,
        entry.node,
        entry.actions,
        (forward.policyLogits[index] ?? []).slice(0, entry.actions.length),
        (forward.policyPriors[index] ?? []).slice(0, entry.actions.length),
        blendedValue,
      );
      for (const step of entry.path) {
        step.node.visits += 1;
        step.node.valueSum += blendedValue;
        step.edge.visits += 1;
        step.edge.valueSum += blendedValue;
        if (step.edge.chanceNode) {
          step.edge.chanceNode.visits += 1;
        }
        step.outcome.visits += 1;
        step.outcome.valueSum += blendedValue;
      }
      simulations += 1;
    }
  }

  const bestEdge = chooseBestRootEdge(root);
  const principalVariation = buildPrincipalVariation(root);
  const diagnostics = createDiagnostics(runtime, root, bestEdge, principalVariation);
  const bestOutcome = bestEdge ? bestOutcomeForEdge(bestEdge) : null;

  return {
    bestAction: bestEdge?.action ?? null,
    valueEstimate: diagnostics.valueEstimate ?? 0,
    rootVisits: diagnostics.rootVisits ?? 0,
    nodesExpanded: diagnostics.nodesExpanded ?? 0,
    searchTimeMs: diagnostics.searchTimeMs ?? 0,
    policyEntropy: diagnostics.policyEntropy ?? 0,
    principalVariation,
    diagnostics,
    queuedPlan: bestOutcome?.queuedPlan ?? [],
  };
}
