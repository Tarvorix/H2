import { EventEmitter } from 'node:events';
import type { GameCommand, GameState } from '@hh/types';
import type {
  HeadlessLegalActionsSnapshot,
  HeadlessMatchCommandRecord,
  HeadlessMatchPlayerConfig,
  HeadlessMatchSessionCreateOptions,
  HeadlessNudgeSnapshot,
  HeadlessReplayArtifact,
} from '@hh/headless';
import { createHeadlessMatchSession } from '@hh/headless';

export interface HHMatchRecord {
  id: string;
  createdAt: string;
  archivedAt: string | null;
  session: ReturnType<typeof createHeadlessMatchSession>;
  playerAgents: [string | null, string | null];
}

export interface HHMatchSummary {
  matchId: string;
  createdAt: string;
  archivedAt: string | null;
  playerConfigs: [HeadlessMatchPlayerConfig, HeadlessMatchPlayerConfig];
  playerAgents: [string | null, string | null];
  currentBattleTurn: number;
  currentPhase: string;
  currentSubPhase: string;
  activePlayerIndex: number;
  firstPlayerIndex: number;
  awaitingReaction: boolean;
  isGameOver: boolean;
  winnerPlayerIndex: number | null;
  nudge: HeadlessNudgeSnapshot;
}

export interface HHObserverSnapshot {
  reason: string;
  match: HHMatchSummary;
  state: GameState;
  history: HeadlessMatchCommandRecord[];
}

export class HHMatchManager extends EventEmitter {
  private readonly matches = new Map<string, HHMatchRecord>();

  createMatch(options: HeadlessMatchSessionCreateOptions): HHMatchSummary {
    const session = createHeadlessMatchSession(options);
    const record: HHMatchRecord = {
      id: session.id,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      session,
      playerAgents: [null, null],
    };
    this.matches.set(record.id, record);
    this.emitObserverSnapshot(record.id, 'match_created');
    return this.getMatch(record.id);
  }

  listMatches(): HHMatchSummary[] {
    return [...this.matches.values()].map((record) => this.toSummary(record));
  }

  getMatch(matchId: string): HHMatchSummary {
    return this.toSummary(this.requireMatch(matchId));
  }

  archiveMatch(matchId: string): HHMatchSummary {
    const record = this.requireMatch(matchId);
    record.archivedAt = new Date().toISOString();
    this.emitObserverSnapshot(matchId, 'match_archived');
    return this.toSummary(record);
  }

  bindAgent(matchId: string, playerIndex: 0 | 1, agentId: string): HHMatchSummary {
    const record = this.requireMatch(matchId);
    const nextAgents: [string | null, string | null] = [...record.playerAgents] as [string | null, string | null];
    const currentIndex = nextAgents.findIndex((entry) => entry === agentId);
    if (currentIndex >= 0 && currentIndex !== playerIndex) {
      nextAgents[currentIndex as 0 | 1] = null;
    }
    nextAgents[playerIndex] = agentId;
    record.playerAgents = nextAgents;
    this.emitObserverSnapshot(matchId, 'agent_bound');
    return this.toSummary(record);
  }

  getLegalActions(matchId: string, playerIndex: 0 | 1, agentId?: string): HeadlessLegalActionsSnapshot {
    const record = this.requireMatch(matchId);
    this.ensureAgentBinding(record, playerIndex, agentId);
    return record.session.getLegalActions(playerIndex);
  }

  submitAction(
    matchId: string,
    playerIndex: 0 | 1,
    command: GameCommand,
    agentId?: string,
  ): HeadlessMatchCommandRecord {
    const record = this.requireMatch(matchId);
    this.ensureAgentBinding(record, playerIndex, agentId);
    const result = record.session.submitAction(playerIndex, command);
    this.emitObserverSnapshot(matchId, 'action_submitted');
    return result;
  }

  advanceAiDecision(matchId: string, playerIndex?: 0 | 1): HeadlessMatchCommandRecord {
    const record = this.requireMatch(matchId);
    const result = record.session.advanceAiDecision(playerIndex);
    this.emitObserverSnapshot(matchId, 'ai_advanced');
    return result;
  }

  getEventLog(matchId: string): HeadlessMatchCommandRecord[] {
    return this.requireMatch(matchId).session.getHistory();
  }

  getObserverSnapshot(matchId: string, reason = 'observer_snapshot'): HHObserverSnapshot {
    const record = this.requireMatch(matchId);
    return {
      reason,
      match: this.toSummary(record),
      state: record.session.getState(),
      history: record.session.getHistory(),
    };
  }

  exportReplayArtifact(matchId: string): HeadlessReplayArtifact {
    return this.requireMatch(matchId).session.exportReplayArtifact();
  }

  private emitObserverSnapshot(matchId: string, reason: string): void {
    this.emit('observer_snapshot', this.getObserverSnapshot(matchId, reason));
  }

  private toSummary(record: HHMatchRecord): HHMatchSummary {
    const state = record.session.getState();
    return {
      matchId: record.id,
      createdAt: record.createdAt,
      archivedAt: record.archivedAt,
      playerConfigs: record.session.getPlayerConfigs(),
      playerAgents: record.playerAgents,
      currentBattleTurn: state.currentBattleTurn,
      currentPhase: state.currentPhase,
      currentSubPhase: state.currentSubPhase,
      activePlayerIndex: state.activePlayerIndex,
      firstPlayerIndex: state.firstPlayerIndex,
      awaitingReaction: state.awaitingReaction,
      isGameOver: state.isGameOver,
      winnerPlayerIndex: state.winnerPlayerIndex,
      nudge: record.session.getNudgeSnapshot(),
    };
  }

  private ensureAgentBinding(record: HHMatchRecord, playerIndex: 0 | 1, agentId?: string): void {
    const expectedAgent = record.playerAgents[playerIndex];
    if (expectedAgent && expectedAgent !== agentId) {
      throw new Error(`Player ${playerIndex + 1} is bound to agent "${expectedAgent}".`);
    }
  }

  private requireMatch(matchId: string): HHMatchRecord {
    const record = this.matches.get(matchId);
    if (!record) {
      throw new Error(`Unknown match "${matchId}".`);
    }
    return record;
  }
}
