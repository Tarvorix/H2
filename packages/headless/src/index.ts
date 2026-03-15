import type { GameCommand, GameState } from '@hh/types';
import {
  RandomDiceProvider,
  processCommand,
  hashGameState,
} from '@hh/engine';
import {
  AIStrategyTier,
  DEFAULT_ALPHA_MODEL_ID,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  createTurnContext,
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
  shouldAIAct,
  type AIDiagnostics,
  type AIPlayerConfig,
} from '@hh/ai';
import type { DiceProvider } from '@hh/engine';
import { buildFallbackCommand } from './fallback-command';
export type {
  HeadlessArmySetup,
  HeadlessGameSetupOptions,
  HeadlessUnitSetup,
} from './setup';
export { createHeadlessGameState } from './setup';
export type {
  HeadlessArmyListGameSetupOptions,
  HeadlessArmyListValidationSummary,
} from './roster';
export {
  createHeadlessGameStateFromArmyLists,
  validateHeadlessArmyLists,
} from './roster';
export type {
  CuratedArmyListDefinition,
  CuratedArmyListSource,
} from './curated-army-lists';
export {
  CURATED_2000_POINT_ARMY_LISTS,
  getCurated2000PointArmyList,
  getCurated2000PointArmyLists,
} from './curated-army-lists';
export type {
  HeadlessGeneratedArmyList,
  HeadlessGeneratedArmyListGameSetupOptions,
  HeadlessGeneratedArmyListGameSetupResult,
  HeadlessRosterCandidateSummary,
  HeadlessRosterDiagnostics,
  HeadlessRosterGenerationConfig,
  HeadlessRosterStrategyTier,
} from './roster-ai';
export {
  createHeadlessGameStateFromGeneratedArmyLists,
  generateHeadlessArmyList,
  generateHeadlessArmyLists,
} from './roster-ai';
export type {
  HeadlessReplayArtifact,
  HeadlessReplayVerificationResult,
  ReplayCommandInput,
} from './replay';
export {
  createReplayArtifact,
  createReplayArtifactFromHeadlessRun,
  saveReplayArtifact,
  loadReplayArtifact,
  verifyReplayArtifact,
} from './replay';
export {
  buildFallbackCommand,
} from './fallback-command';
export type {
  DecisionSupportPlayerConfig,
  HeadlessDecisionOption,
  HeadlessDecisionOptionsSnapshot,
} from './decision-support';
export {
  getDecisionOptionsSnapshot,
  getDecisionPlayerIndex,
} from './decision-support';
export type {
  HeadlessLegalActionsSnapshot,
  HeadlessMatchCommandRecord,
  HeadlessMatchPlayerConfig,
  HeadlessMatchSessionCreateOptions,
  HeadlessNudgeSnapshot,
  HeadlessPlayerMode,
} from './session';
export {
  HeadlessMatchSession,
  createHeadlessMatchSession,
  verifyReplayArtifactDeterminism,
} from './session';

export interface HeadlessAIPlayerConfig {
  enabled: boolean;
  playerIndex: number;
  strategyTier: AIStrategyTier;
  timeBudgetMs?: number;
  nnueModelId?: string;
  alphaModelId?: string;
  baseSeed?: number;
  rolloutCount?: number;
  maxDepthSoft?: number;
  maxSimulations?: number;
  diagnosticsEnabled?: boolean;
  shadowAlpha?: AIPlayerConfig['shadowAlpha'];
}

export interface HeadlessRunOptions {
  /**
   * Maximum number of commands executed before aborting.
   * Prevents infinite loops if no terminal condition is reached.
   */
  maxCommands?: number;
  /**
   * AI controller configuration per player.
   * Default: both players tactical AI.
   */
  aiPlayers?: HeadlessAIPlayerConfig[];
  /**
   * Optional deterministic dice provider for testable runs.
   * Default: RandomDiceProvider.
   */
  diceProvider?: DiceProvider;
}

export interface HeadlessCommandRecord {
  step: number;
  command: GameCommand;
  actingPlayerIndex: number;
  accepted: boolean;
  errorMessages: string[];
  eventCount: number;
  battleTurn: number;
  phase: string;
  subPhase: string;
  aiDiagnostics: AIDiagnostics | null;
}

export interface HeadlessRunResult {
  finalState: GameState;
  finalStateHash: string;
  commandHistory: HeadlessCommandRecord[];
  executedCommands: number;
  diceSequence: number[];
  terminatedReason:
    | 'game-over'
    | 'max-commands'
    | 'no-ai-controller'
    | 'no-command-generated'
    | 'command-rejected'
    | 'ai-error';
  errorMessage: string | null;
}

class RecordingDiceProvider implements DiceProvider {
  private readonly recorded: number[] = [];

  constructor(private readonly delegate: DiceProvider) {}

  rollD6(): number {
    const value = this.delegate.rollD6();
    this.recorded.push(value);
    return value;
  }

  rollMultipleD6(count: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollD6());
    }
    return results;
  }

  roll2D6(): [number, number] {
    return [this.rollD6(), this.rollD6()];
  }

  rollD3(): number {
    return Math.ceil(this.rollD6() / 2);
  }

  rollScatter(): { direction: number; distance: number } {
    return {
      direction: this.rollD6(),
      distance: this.rollD6(),
    };
  }

  getSequence(): number[] {
    return [...this.recorded];
  }
}

function defaultAIPlayers(): HeadlessAIPlayerConfig[] {
  return [
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
  ];
}

function toAIPlayerConfig(config: HeadlessAIPlayerConfig): AIPlayerConfig {
  const isEngine = config.strategyTier === AIStrategyTier.Engine;
  const isAlpha = config.strategyTier === AIStrategyTier.Alpha;
  return {
    enabled: config.enabled,
    playerIndex: config.playerIndex,
    strategyTier: config.strategyTier,
    deploymentFormation: 'auto',
    commandDelayMs: 0,
    timeBudgetMs: config.timeBudgetMs,
    nnueModelId: isEngine ? (config.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID) : undefined,
    alphaModelId: isAlpha ? (config.alphaModelId ?? DEFAULT_ALPHA_MODEL_ID) : undefined,
    baseSeed: config.baseSeed,
    rolloutCount: config.rolloutCount,
    maxDepthSoft: config.maxDepthSoft,
    maxSimulations: config.maxSimulations,
    diagnosticsEnabled: config.diagnosticsEnabled,
    shadowAlpha: config.shadowAlpha,
  };
}

function getReactivePlayerIndex(state: GameState): number {
  return state.activePlayerIndex === 0 ? 1 : 0;
}

function getDecisionPlayerIndex(state: GameState): number {
  if (state.awaitingReaction) {
    return getReactivePlayerIndex(state);
  }
  return state.activePlayerIndex;
}

/**
 * Execute a fully headless AI-driven match loop from an existing GameState.
 *
 * Notes:
 * - This runner only uses engine commands and AI strategies.
 * - It assumes the incoming state is already initialized/deployed.
 */
export function runHeadlessMatch(
  initialState: GameState,
  options: HeadlessRunOptions = {},
): HeadlessRunResult {
  const maxCommands = options.maxCommands ?? 2000;
  const aiConfigs = (options.aiPlayers ?? defaultAIPlayers()).map(toAIPlayerConfig);
  const aiByPlayer = new Map<number, AIPlayerConfig>(
    aiConfigs.map((cfg) => [cfg.playerIndex, cfg]),
  );
  const aiContexts = new Map<number, ReturnType<typeof createTurnContext>>(
    aiConfigs.map((cfg) => [cfg.playerIndex, createTurnContext()]),
  );

  let state = initialState;
  const history: HeadlessCommandRecord[] = [];
  const dice = new RecordingDiceProvider(options.diceProvider ?? new RandomDiceProvider());
  let step = 0;

  while (step < maxCommands) {
    if (state.isGameOver) {
      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'game-over',
        errorMessage: null,
      };
    }

    const decisionPlayer = getDecisionPlayerIndex(state);
    const aiConfig = aiByPlayer.get(decisionPlayer);
    const aiContext = aiContexts.get(decisionPlayer);

    if (!aiConfig || !aiContext || !shouldAIAct(state, aiConfig)) {
      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'no-ai-controller',
        errorMessage: null,
      };
    }

    const shouldPreferFallback =
      history.length > 0 && history[history.length - 1]?.accepted === false;
    let command: GameCommand | null;
    let aiDiagnostics: AIDiagnostics | null = null;
    try {
      command = shouldPreferFallback
        ? buildFallbackCommand(state) ?? generateNextCommand(state, aiConfig, aiContext)
        : generateNextCommand(state, aiConfig, aiContext) ?? buildFallbackCommand(state);
      aiDiagnostics = getTurnContextDiagnostics(aiContext);
    } catch (error) {
      const message = getTurnContextError(aiContext) ?? (error instanceof Error ? error.message : String(error));
      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'ai-error',
        errorMessage: message,
      };
    }

    if (!command) {
      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'no-command-generated',
        errorMessage: null,
      };
    }

    step++;
    const result = processCommand(state, command, dice);
    history.push({
      step,
      command,
      actingPlayerIndex: decisionPlayer,
      accepted: result.accepted,
      errorMessages: result.errors.map((err) => err.message),
      eventCount: result.events.length,
      battleTurn: result.state.currentBattleTurn,
      phase: result.state.currentPhase,
      subPhase: result.state.currentSubPhase,
      aiDiagnostics,
    });

    if (!result.accepted) {
      const fallback = buildFallbackCommand(state);
      if (fallback && fallback.type !== command.type && step < maxCommands) {
        step++;
        const fallbackResult = processCommand(state, fallback, dice);
        history.push({
          step,
          command: fallback,
          actingPlayerIndex: decisionPlayer,
          accepted: fallbackResult.accepted,
          errorMessages: fallbackResult.errors.map((err) => err.message),
          eventCount: fallbackResult.events.length,
          battleTurn: fallbackResult.state.currentBattleTurn,
          phase: fallbackResult.state.currentPhase,
          subPhase: fallbackResult.state.currentSubPhase,
          aiDiagnostics,
        });

        if (fallbackResult.accepted) {
          state = fallbackResult.state;
          continue;
        }
      }

      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'command-rejected',
        errorMessage: null,
      };
    }

    state = result.state;
  }

  return {
    finalState: state,
    finalStateHash: hashGameState(state),
    commandHistory: history,
    executedCommands: history.length,
    diceSequence: dice.getSequence(),
    terminatedReason: 'max-commands',
    errorMessage: null,
  };
}
