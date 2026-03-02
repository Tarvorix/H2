import type { GameCommand, GameState } from '@hh/types';
import {
  RandomDiceProvider,
  getValidCommands,
  processCommand,
  hashGameState,
} from '@hh/engine';
import {
  AIStrategyTier,
  createTurnContext,
  generateNextCommand,
  shouldAIAct,
  type AIPlayerConfig,
} from '@hh/ai';
import type { DiceProvider } from '@hh/engine';
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

export interface HeadlessAIPlayerConfig {
  enabled: boolean;
  playerIndex: number;
  strategyTier: AIStrategyTier;
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
    | 'command-rejected';
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
  return {
    enabled: config.enabled,
    playerIndex: config.playerIndex,
    strategyTier: config.strategyTier,
    commandDelayMs: 0,
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

function buildFallbackCommand(state: GameState): GameCommand | null {
  if (state.awaitingReaction) {
    return { type: 'declineReaction' };
  }

  const valid = new Set(getValidCommands(state));

  if (valid.has('endSubPhase')) return { type: 'endSubPhase' };
  if (valid.has('endPhase')) return { type: 'endPhase' };

  return null;
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
      };
    }

    const shouldPreferFallback =
      history.length > 0 && history[history.length - 1]?.accepted === false;
    const command = shouldPreferFallback
      ? buildFallbackCommand(state) ?? generateNextCommand(state, aiConfig, aiContext)
      : generateNextCommand(state, aiConfig, aiContext) ?? buildFallbackCommand(state);
    if (!command) {
      return {
        finalState: state,
        finalStateHash: hashGameState(state),
        commandHistory: history,
        executedCommands: history.length,
        diceSequence: dice.getSequence(),
        terminatedReason: 'no-command-generated',
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
  };
}
