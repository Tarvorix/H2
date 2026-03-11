import type { GameState } from '@hh/types';
import {
  getChallengeDecisionPlayerIndex,
  getResolutionDecisionPlayerIndex,
  hashGameState,
} from '@hh/engine';
import {
  AIStrategyTier,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  generateMacroActions,
  type MacroAction,
  type SearchConfig,
  type SearchNodeState,
} from '@hh/ai';

export interface DecisionSupportPlayerConfig {
  mode: 'human' | 'agent' | 'ai';
  strategyTier?: AIStrategyTier;
  timeBudgetMs?: number;
  nnueModelId?: string;
  baseSeed?: number;
  rolloutCount?: number;
  maxDepthSoft?: number;
  diagnosticsEnabled?: boolean;
}

export interface HeadlessDecisionOption {
  id: string;
  label: string;
  orderingScore: number;
  reasons: string[];
  commands: MacroAction['commands'];
  actorIds: string[];
}

export interface HeadlessDecisionOptionsSnapshot {
  playerIndex: 0 | 1;
  canAct: boolean;
  actingPlayerIndex: 0 | 1 | null;
  awaitingReaction: boolean;
  currentPhase: string;
  currentSubPhase: string;
  stateHash: string;
  options: HeadlessDecisionOption[];
}

function createSearchConfig(config: DecisionSupportPlayerConfig): SearchConfig {
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

export function getDecisionPlayerIndex(state: GameState): 0 | 1 | null {
  if (state.isGameOver) {
    return null;
  }

  if (state.awaitingReaction) {
    return (state.activePlayerIndex === 0 ? 1 : 0) as 0 | 1;
  }

  if (state.currentPhase === 'Assault' && state.currentSubPhase === 'Challenge') {
    return getChallengeDecisionPlayerIndex(state);
  }

  if (state.currentPhase === 'Assault' && state.currentSubPhase === 'Resolution') {
    return getResolutionDecisionPlayerIndex(state);
  }

  return state.activePlayerIndex as 0 | 1;
}

function toDecisionOption(action: MacroAction): HeadlessDecisionOption {
  return {
    id: action.id,
    label: action.label,
    orderingScore: action.orderingScore,
    reasons: [...action.reasons],
    commands: [...action.commands],
    actorIds: [...action.actorIds],
  };
}

export function getDecisionOptionsSnapshot(
  state: GameState,
  playerConfigs: [DecisionSupportPlayerConfig, DecisionSupportPlayerConfig],
  playerIndex: 0 | 1,
): HeadlessDecisionOptionsSnapshot {
  const actingPlayerIndex = getDecisionPlayerIndex(state);
  const canAct = actingPlayerIndex === playerIndex;
  let options: HeadlessDecisionOption[] = [];

  if (actingPlayerIndex !== null && canAct) {
    const node: SearchNodeState = {
      state,
      actedUnitIds: new Set(),
    };
    const searchConfig = createSearchConfig(playerConfigs[actingPlayerIndex]);
    options = generateMacroActions(node, actingPlayerIndex, searchConfig, {
      includeAdvanceCommands: true,
    }).map(toDecisionOption);
  }

  return {
    playerIndex,
    canAct,
    actingPlayerIndex,
    awaitingReaction: state.awaitingReaction,
    currentPhase: state.currentPhase,
    currentSubPhase: state.currentSubPhase,
    stateHash: hashGameState(state),
    options,
  };
}
