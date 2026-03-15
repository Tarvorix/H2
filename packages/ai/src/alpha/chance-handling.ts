import type { GameState } from '@hh/types';
import { processCommand } from '@hh/engine';
import type {
  AlphaSearchConfig,
  MacroAction,
  QueuedCommandStep,
  SearchConfig,
} from '../types';
import { SeededDiceProvider } from '../engine/deterministic-dice';
import { generateMacroActions, isRealDecisionNode, type SearchNodeState } from '../engine/candidate-generator';
import { getDecisionPlayerIndex, getStateFingerprint } from '../state-utils';
import { AIStrategyTier } from '../types';

export interface AlphaTransitionResult {
  node: SearchNodeState;
  queuedPlan: QueuedCommandStep[];
  stateFingerprint: string;
  decisionOwner: number;
}

function toMacroSearchConfig(config: AlphaSearchConfig): SearchConfig {
  return {
    timeBudgetMs: config.timeBudgetMs,
    nnueModelId: 'alpha-macro-surface',
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

export function sampleMacroActionTransition(
  config: AlphaSearchConfig,
  node: SearchNodeState,
  action: MacroAction,
  sampleIndex: number,
): AlphaTransitionResult | null {
  const macroConfig = toMacroSearchConfig(config);
  let state: GameState = node.state;
  let actedUnitIds = new Set(node.actedUnitIds);
  const queuedPlan: QueuedCommandStep[] = [];

  for (let commandIndex = 0; commandIndex < action.commands.length; commandIndex++) {
    const command = action.commands[commandIndex];
    const fingerprintBeforeCommand = getStateFingerprint(state);
    const dice = new SeededDiceProvider([
      config.baseSeed,
      fingerprintBeforeCommand,
      action.id,
      sampleIndex,
      commandIndex,
    ]);
    const result = processCommand(state, command, dice);
    if (!result.accepted) {
      return null;
    }

    const nextNode: SearchNodeState = {
      state: result.state,
      actedUnitIds: new Set(actedUnitIds),
    };
    markActionAsActed({ state, actedUnitIds }, action, nextNode);
    state = nextNode.state;
    actedUnitIds = nextNode.actedUnitIds;

    if (commandIndex < action.commands.length - 1) {
      queuedPlan.push({
        command: action.commands[commandIndex + 1],
        expectedStateFingerprint: getStateFingerprint(state),
        decisionOwner: getDecisionPlayerIndex(state),
        phase: state.currentPhase,
        subPhase: state.currentSubPhase,
        label: action.label,
      });
    }
  }

  let searchNode: SearchNodeState = { state, actedUnitIds };
  for (let step = 0; step < config.maxAutoAdvanceSteps; step++) {
    if (searchNode.state.isGameOver) break;
    const decisionOwner = getDecisionPlayerIndex(searchNode.state);
    if (isRealDecisionNode(searchNode, decisionOwner, macroConfig)) {
      break;
    }

    const autoAdvanceAction = generateMacroActions(searchNode, decisionOwner, macroConfig, {
      includeAdvanceCommands: true,
    }).find((candidate) =>
      candidate.commands.length === 1 &&
      (candidate.commands[0].type === 'endSubPhase' || candidate.commands[0].type === 'endPhase'),
    );
    if (!autoAdvanceAction) break;

    const fingerprintBeforeCommand = getStateFingerprint(searchNode.state);
    const dice = new SeededDiceProvider([
      config.baseSeed,
      fingerprintBeforeCommand,
      autoAdvanceAction.id,
      sampleIndex,
      step,
      AIStrategyTier.Alpha,
    ]);
    const autoResult = processCommand(searchNode.state, autoAdvanceAction.commands[0], dice);
    if (!autoResult.accepted) break;
    searchNode = {
      state: autoResult.state,
      actedUnitIds: new Set(),
    };
  }

  return {
    node: searchNode,
    queuedPlan,
    stateFingerprint: getStateFingerprint(searchNode.state),
    decisionOwner: getDecisionPlayerIndex(searchNode.state),
  };
}
