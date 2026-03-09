import type { GameCommand, GameState } from '@hh/types';
import { FixedDiceProvider, RandomDiceProvider, getValidCommands, hashGameState, processCommand } from '@hh/engine';
import {
  AIStrategyTier,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
  createTurnContext,
  generateNextCommand,
  getTurnContextDiagnostics,
  getTurnContextError,
  shouldAIAct,
  type AIDiagnostics,
  type AIDeploymentFormation,
  type AIPlayerConfig,
} from '@hh/ai';
import type { DiceProvider, GameEvent } from '@hh/engine';
import type { HeadlessArmyListGameSetupOptions } from './roster';
import { createHeadlessGameStateFromArmyLists } from './roster';
import type { HeadlessGeneratedArmyListGameSetupOptions } from './roster-ai';
import { createHeadlessGameStateFromGeneratedArmyLists } from './roster-ai';
import type { HeadlessGameSetupOptions } from './setup';
import { createHeadlessGameState } from './setup';
import { buildFallbackCommand } from './fallback-command';
import type { HeadlessReplayArtifact } from './replay';
import { createReplayArtifact } from './replay';

export type HeadlessPlayerMode = 'human' | 'agent' | 'ai';

export interface HeadlessMatchPlayerConfig {
  mode: HeadlessPlayerMode;
  strategyTier?: AIStrategyTier;
  deploymentFormation?: AIDeploymentFormation;
  timeBudgetMs?: number;
  nnueModelId?: string;
  baseSeed?: number;
  rolloutCount?: number;
  maxDepthSoft?: number;
  diagnosticsEnabled?: boolean;
}

export interface HeadlessMatchCommandRecord {
  step: number;
  command: GameCommand;
  actingPlayerIndex: number;
  accepted: boolean;
  errorMessages: string[];
  events: GameEvent[];
  eventCount: number;
  battleTurn: number;
  phase: string;
  subPhase: string;
  stateHash: string;
  aiDiagnostics: AIDiagnostics | null;
}

export interface HeadlessNudgeSnapshot {
  kind: 'idle' | 'turn' | 'reaction' | 'game-over';
  actingPlayerIndex: number | null;
  actingMode: HeadlessPlayerMode | null;
  awaitingReaction: boolean;
  validCommandTypes: string[];
  currentBattleTurn: number;
  currentPhase: string;
  currentSubPhase: string;
  winnerPlayerIndex: number | null;
  blocking: boolean;
  summary: string;
  aiDiagnostics: AIDiagnostics | null;
}

export interface HeadlessLegalActionsSnapshot {
  playerIndex: 0 | 1;
  canAct: boolean;
  actingPlayerIndex: number | null;
  validCommandTypes: string[];
  awaitingReaction: boolean;
  currentPhase: string;
  currentSubPhase: string;
}

export interface HeadlessMatchSessionCreateOptions {
  matchId?: string;
  initialState?: GameState;
  setupOptions?: HeadlessGameSetupOptions;
  armyListSetupOptions?: HeadlessArmyListGameSetupOptions;
  generatedArmyListSetupOptions?: HeadlessGeneratedArmyListGameSetupOptions;
  playerConfigs?: [Partial<HeadlessMatchPlayerConfig>, Partial<HeadlessMatchPlayerConfig>];
  diceProvider?: DiceProvider;
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

function generateMatchId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `hh-match-${Date.now()}-${random}`;
}

function resolveInitialState(options: HeadlessMatchSessionCreateOptions): GameState {
  if (options.initialState) return options.initialState;
  if (options.armyListSetupOptions) return createHeadlessGameStateFromArmyLists(options.armyListSetupOptions);
  if (options.generatedArmyListSetupOptions) {
    return createHeadlessGameStateFromGeneratedArmyLists(options.generatedArmyListSetupOptions).state;
  }
  if (options.setupOptions) return createHeadlessGameState(options.setupOptions);
  throw new Error('HeadlessMatchSession requires initialState, setupOptions, armyListSetupOptions, or generatedArmyListSetupOptions.');
}

function defaultPlayerConfig(): HeadlessMatchPlayerConfig {
  return {
    mode: 'ai',
    strategyTier: AIStrategyTier.Tactical,
    deploymentFormation: 'auto',
  };
}

function toAIPlayerConfig(playerIndex: 0 | 1, config: HeadlessMatchPlayerConfig): AIPlayerConfig {
  const isEngine = (config.strategyTier ?? AIStrategyTier.Tactical) === AIStrategyTier.Engine;
  return {
    enabled: config.mode === 'ai',
    playerIndex,
    strategyTier: config.strategyTier ?? AIStrategyTier.Tactical,
    deploymentFormation: config.deploymentFormation ?? 'auto',
    commandDelayMs: 0,
    timeBudgetMs: config.timeBudgetMs,
    nnueModelId: isEngine ? (config.nnueModelId ?? DEFAULT_GAMEPLAY_NNUE_MODEL_ID) : undefined,
    baseSeed: config.baseSeed,
    rolloutCount: config.rolloutCount,
    maxDepthSoft: config.maxDepthSoft,
    diagnosticsEnabled: config.diagnosticsEnabled,
  };
}

function getDecisionPlayerIndex(state: GameState): 0 | 1 {
  return (state.awaitingReaction ? (state.activePlayerIndex === 0 ? 1 : 0) : state.activePlayerIndex) as 0 | 1;
}

export class HeadlessMatchSession {
  readonly id: string;
  private readonly initialState: GameState;
  private state: GameState;
  private readonly playerConfigs: [HeadlessMatchPlayerConfig, HeadlessMatchPlayerConfig];
  private readonly aiContexts = new Map<number, ReturnType<typeof createTurnContext>>();
  private readonly aiDiagnostics = new Map<number, AIDiagnostics | null>();
  private readonly dice: RecordingDiceProvider;
  private readonly history: HeadlessMatchCommandRecord[] = [];

  constructor(options: HeadlessMatchSessionCreateOptions) {
    this.id = options.matchId ?? generateMatchId();
    this.initialState = resolveInitialState(options);
    this.state = this.initialState;
    this.playerConfigs = [
      {
        ...defaultPlayerConfig(),
        ...options.playerConfigs?.[0],
      },
      {
        ...defaultPlayerConfig(),
        ...options.playerConfigs?.[1],
      },
    ];
    this.aiContexts.set(0, createTurnContext());
    this.aiContexts.set(1, createTurnContext());
    this.aiDiagnostics.set(0, null);
    this.aiDiagnostics.set(1, null);
    this.dice = new RecordingDiceProvider(options.diceProvider ?? new RandomDiceProvider());
  }

  getState(): GameState {
    return this.state;
  }

  getInitialState(): GameState {
    return this.initialState;
  }

  getHistory(): HeadlessMatchCommandRecord[] {
    return [...this.history];
  }

  getDiceSequence(): number[] {
    return this.dice.getSequence();
  }

  getPlayerConfigs(): [HeadlessMatchPlayerConfig, HeadlessMatchPlayerConfig] {
    return [...this.playerConfigs] as [HeadlessMatchPlayerConfig, HeadlessMatchPlayerConfig];
  }

  getAIDiagnostics(): [AIDiagnostics | null, AIDiagnostics | null] {
    return [
      this.aiDiagnostics.get(0) ?? null,
      this.aiDiagnostics.get(1) ?? null,
    ];
  }

  getDecisionPlayerIndex(): 0 | 1 {
    return getDecisionPlayerIndex(this.state);
  }

  getNudgeSnapshot(): HeadlessNudgeSnapshot {
    if (this.state.isGameOver) {
      return {
        kind: 'game-over',
        actingPlayerIndex: null,
        actingMode: null,
        awaitingReaction: false,
        validCommandTypes: [],
        currentBattleTurn: this.state.currentBattleTurn,
        currentPhase: this.state.currentPhase,
        currentSubPhase: this.state.currentSubPhase,
        winnerPlayerIndex: this.state.winnerPlayerIndex,
        blocking: false,
        summary: this.state.winnerPlayerIndex === null
          ? 'Game ended with no winner.'
          : `Game over. Player ${this.state.winnerPlayerIndex + 1} won.`,
        aiDiagnostics: null,
      };
    }

    const actingPlayerIndex = this.getDecisionPlayerIndex();
    const validCommandTypes = getValidCommands(this.state);
    const actingMode = this.playerConfigs[actingPlayerIndex].mode;
    const kind = this.state.awaitingReaction ? 'reaction' : 'turn';
    const aiDiagnostics = actingMode === 'ai'
      ? (this.aiDiagnostics.get(actingPlayerIndex) ?? null)
      : null;

    return {
      kind,
      actingPlayerIndex,
      actingMode,
      awaitingReaction: this.state.awaitingReaction,
      validCommandTypes,
      currentBattleTurn: this.state.currentBattleTurn,
      currentPhase: this.state.currentPhase,
      currentSubPhase: this.state.currentSubPhase,
      winnerPlayerIndex: this.state.winnerPlayerIndex,
      blocking: true,
      summary: this.state.awaitingReaction
        ? `Player ${actingPlayerIndex + 1} has a reaction decision pending.`
        : `Player ${actingPlayerIndex + 1} must act in ${this.state.currentPhase}/${this.state.currentSubPhase}.`,
      aiDiagnostics,
    };
  }

  getLegalActions(playerIndex: 0 | 1): HeadlessLegalActionsSnapshot {
    const actingPlayerIndex = this.state.isGameOver ? null : this.getDecisionPlayerIndex();
    const validCommandTypes = actingPlayerIndex === null ? [] : getValidCommands(this.state);

    return {
      playerIndex,
      canAct: actingPlayerIndex === playerIndex,
      actingPlayerIndex,
      validCommandTypes,
      awaitingReaction: this.state.awaitingReaction,
      currentPhase: this.state.currentPhase,
      currentSubPhase: this.state.currentSubPhase,
    };
  }

  submitAction(
    playerIndex: 0 | 1,
    command: GameCommand,
    aiDiagnostics: AIDiagnostics | null = null,
  ): HeadlessMatchCommandRecord {
    const actingPlayerIndex = this.getDecisionPlayerIndex();
    if (!this.state.isGameOver && actingPlayerIndex !== playerIndex) {
      throw new Error(
        `Player ${playerIndex + 1} cannot act right now. Waiting on player ${actingPlayerIndex + 1}.`,
      );
    }

    const result = processCommand(this.state, command, this.dice);
    const record: HeadlessMatchCommandRecord = {
      step: this.history.length + 1,
      command,
      actingPlayerIndex: playerIndex,
      accepted: result.accepted,
      errorMessages: result.errors.map((error) => error.message),
      events: result.events,
      eventCount: result.events.length,
      battleTurn: result.state.currentBattleTurn,
      phase: result.state.currentPhase,
      subPhase: result.state.currentSubPhase,
      stateHash: hashGameState(result.state),
      aiDiagnostics,
    };

    this.history.push(record);
    if (aiDiagnostics) {
      this.aiDiagnostics.set(playerIndex, aiDiagnostics);
    }
    if (result.accepted) {
      this.state = result.state;
    }

    return record;
  }

  advanceAiDecision(playerIndex?: 0 | 1): HeadlessMatchCommandRecord {
    const actingPlayerIndex = this.getDecisionPlayerIndex();
    const resolvedPlayerIndex = playerIndex ?? actingPlayerIndex;
    if (resolvedPlayerIndex !== actingPlayerIndex) {
      throw new Error(
        `Player ${resolvedPlayerIndex + 1} is not the current decision owner. Waiting on player ${actingPlayerIndex + 1}.`,
      );
    }

    const config = this.playerConfigs[resolvedPlayerIndex];
    if (config.mode !== 'ai') {
      throw new Error(`Player ${resolvedPlayerIndex + 1} is not configured for AI control.`);
    }

    const aiConfig = toAIPlayerConfig(resolvedPlayerIndex, config);
    const aiContext = this.aiContexts.get(resolvedPlayerIndex);
    if (!aiContext || !shouldAIAct(this.state, aiConfig)) {
      throw new Error(`AI is not allowed to act for player ${resolvedPlayerIndex + 1} in the current state.`);
    }

    const previous = this.history[this.history.length - 1];
    const shouldPreferFallback = previous?.accepted === false && previous.actingPlayerIndex === resolvedPlayerIndex;
    let command: GameCommand | null;
    try {
      command = shouldPreferFallback
        ? buildFallbackCommand(this.state) ?? generateNextCommand(this.state, aiConfig, aiContext)
        : generateNextCommand(this.state, aiConfig, aiContext) ?? buildFallbackCommand(this.state);
    } catch (error) {
      const diagnostics = getTurnContextDiagnostics(aiContext) ?? {
        tier: aiConfig.strategyTier,
        modelId: aiConfig.nnueModelId,
        principalVariation: [],
        error: getTurnContextError(aiContext) ?? (error instanceof Error ? error.message : String(error)),
      };
      this.aiDiagnostics.set(resolvedPlayerIndex, diagnostics);
      throw error;
    }

    if (!command) {
      throw new Error(`AI could not generate a command for player ${resolvedPlayerIndex + 1}.`);
    }

    const diagnostics = getTurnContextDiagnostics(aiContext);
    if (diagnostics) {
      this.aiDiagnostics.set(resolvedPlayerIndex, diagnostics);
    }

    const record = this.submitAction(resolvedPlayerIndex, command, diagnostics ?? null);
    if (!record.accepted) {
      const fallback = buildFallbackCommand(this.state);
      if (fallback && fallback.type !== command.type) {
        return this.submitAction(resolvedPlayerIndex, fallback, diagnostics ?? null);
      }
    }

    return record;
  }

  exportReplayArtifact(metadata: Record<string, unknown> = {}): HeadlessReplayArtifact {
    return createReplayArtifact(
      this.initialState,
      this.history.map((entry) => ({
        command: entry.command,
        actingPlayerIndex: entry.actingPlayerIndex,
      })),
      this.dice.getSequence(),
      {
        matchId: this.id,
        playerConfigs: this.playerConfigs,
        ...metadata,
      },
    );
  }
}

export function createHeadlessMatchSession(options: HeadlessMatchSessionCreateOptions): HeadlessMatchSession {
  return new HeadlessMatchSession(options);
}

export function verifyReplayArtifactDeterminism(artifact: HeadlessReplayArtifact): string {
  let state = artifact.initialState;
  const dice = new FixedDiceProvider([...artifact.diceSequence]);

  for (const step of artifact.steps) {
    const result = processCommand(state, step.command, dice);
    state = result.state;
  }

  return hashGameState(state);
}
