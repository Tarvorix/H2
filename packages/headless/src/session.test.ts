import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider } from '@hh/engine';
import {
  AIStrategyTier,
  DEFAULT_ALPHA_MODEL_ID,
  DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
} from '@hh/ai';
import {
  createHeadlessMatchSession,
  verifyReplayArtifactDeterminism,
} from './session';

function createMatchSession() {
  return createHeadlessMatchSession({
    setupOptions: {
      missionId: 'heart-of-battle',
      armies: [
        {
          playerName: 'Player 1',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
        {
          playerName: 'Player 2',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
      ],
    },
    diceProvider: new FixedDiceProvider(Array.from({ length: 64 }, () => 3)),
  });
}

describe('HeadlessMatchSession', () => {
  it('exposes the current decision window and legal actions', () => {
    const session = createMatchSession();

    expect(session.getNudgeSnapshot()).toMatchObject({
      kind: 'turn',
      actingPlayerIndex: 0,
      actingMode: 'ai',
      currentPhase: 'Start',
      currentSubPhase: 'StartEffects',
      blocking: true,
    });
    expect(session.getLegalActions(0)).toMatchObject({
      canAct: true,
      actingPlayerIndex: 0,
      currentPhase: 'Start',
      currentSubPhase: 'StartEffects',
    });
    expect(session.getLegalActions(1).canAct).toBe(false);
  });

  it('records commands and exports deterministic replay artifacts', () => {
    const session = createMatchSession();

    const record = session.submitAction(0, { type: 'endSubPhase' });

    expect(record.accepted).toBe(true);
    expect(session.getHistory()).toHaveLength(1);
    expect(session.getState().currentPhase).toBe('Movement');
    expect(session.getPlayerConfigs()[0].deploymentFormation).toBe('auto');

    const replay = session.exportReplayArtifact({ source: 'session-test' });

    expect(replay.metadata.source).toBe('session-test');
    expect(replay.metadata.matchId).toBe(session.id);
    expect(replay.steps).toHaveLength(1);
    expect(verifyReplayArtifactDeterminism(replay)).toBe(record.stateHash);
  });

  it('can advance an AI-owned decision window', () => {
    const session = createMatchSession();

    const record = session.advanceAiDecision(0);

    expect(record.accepted).toBe(true);
    expect(record.actingPlayerIndex).toBe(0);
    expect(session.getHistory()).toHaveLength(1);
  });

  it('records engine diagnostics on engine-owned decision windows', () => {
    const session = createHeadlessMatchSession({
      setupOptions: {
        missionId: 'heart-of-battle',
        armies: [
          {
            playerName: 'Player 1',
            faction: LegionFaction.WorldEaters,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
          {
            playerName: 'Player 2',
            faction: LegionFaction.AlphaLegion,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
        ],
      },
      playerConfigs: [
        {
          mode: 'ai',
          strategyTier: AIStrategyTier.Engine,
          timeBudgetMs: 50,
          nnueModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
          diagnosticsEnabled: true,
        },
        {
          mode: 'ai',
          strategyTier: AIStrategyTier.Tactical,
        },
      ],
      diceProvider: new FixedDiceProvider(Array.from({ length: 64 }, () => 3)),
    });

    session.advanceAiDecision(0);
    const record = session.advanceAiDecision(0);

    expect(record.command.type).toBe('endSubPhase');
    expect(record.aiDiagnostics?.tier).toBe(AIStrategyTier.Engine);
    expect(session.getAIDiagnostics()[0]?.modelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(session.getNudgeSnapshot().aiDiagnostics).toEqual(session.getAIDiagnostics()[0]);
  });

  it('preserves Alpha and shadow Alpha config fields in the session player config surface', () => {
    const session = createHeadlessMatchSession({
      setupOptions: {
        missionId: 'heart-of-battle',
        armies: [
          {
            playerName: 'Player 1',
            faction: LegionFaction.WorldEaters,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
          {
            playerName: 'Player 2',
            faction: LegionFaction.AlphaLegion,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
        ],
      },
      playerConfigs: [
        {
          mode: 'ai',
          strategyTier: AIStrategyTier.Alpha,
          alphaModelId: DEFAULT_ALPHA_MODEL_ID,
          timeBudgetMs: 600,
          maxSimulations: 256,
          shadowAlpha: {
            enabled: true,
            alphaModelId: DEFAULT_ALPHA_MODEL_ID,
            timeBudgetMs: 300,
            maxSimulations: 96,
            baseSeed: 1234,
            diagnosticsEnabled: true,
          },
        },
        {
          mode: 'ai',
          strategyTier: AIStrategyTier.Tactical,
        },
      ],
      diceProvider: new FixedDiceProvider(Array.from({ length: 64 }, () => 3)),
    });

    expect(session.getPlayerConfigs()[0]).toMatchObject({
      strategyTier: AIStrategyTier.Alpha,
      alphaModelId: DEFAULT_ALPHA_MODEL_ID,
      timeBudgetMs: 600,
      maxSimulations: 256,
      shadowAlpha: {
        enabled: true,
        alphaModelId: DEFAULT_ALPHA_MODEL_ID,
        timeBudgetMs: 300,
        maxSimulations: 96,
        baseSeed: 1234,
        diagnosticsEnabled: true,
      },
    });
  });
});
