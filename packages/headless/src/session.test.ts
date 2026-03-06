import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider } from '@hh/engine';
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
});
