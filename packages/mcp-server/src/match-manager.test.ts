import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { HHMatchManager } from './match-manager';

function createSetupOptions() {
  return {
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
    ] as const,
  };
}

describe('HHMatchManager', () => {
  it('creates matches, binds stable agents, and exposes observer snapshots', () => {
    const matches = new HHMatchManager();

    const summary = matches.createMatch({
      setupOptions: createSetupOptions(),
      playerConfigs: [{ mode: 'agent' }, { mode: 'ai' }],
    });

    expect(summary.playerConfigs[0]).toMatchObject({
      mode: 'agent',
      deploymentFormation: 'auto',
    });
    expect(summary.nudge.actingPlayerIndex).toBe(0);

    const rebound = matches.bindAgent(summary.matchId, 0, 'codex-agent');
    expect(rebound.playerAgents[0]).toBe('codex-agent');

    expect(() => matches.getLegalActions(summary.matchId, 0, 'wrong-agent')).toThrow(
      'Player 1 is bound to agent "codex-agent".',
    );

    const legal = matches.getLegalActions(summary.matchId, 0, 'codex-agent');
    expect(legal.canAct).toBe(true);
    expect(legal.currentPhase).toBe('Start');

    const record = matches.submitAction(summary.matchId, 0, { type: 'endSubPhase' }, 'codex-agent');
    expect(record.accepted).toBe(true);

    const snapshot = matches.getObserverSnapshot(summary.matchId);
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.match.currentPhase).toBe('Movement');
    expect(snapshot.match.nudge.currentSubPhase).toBe('Reserves');

    const replay = matches.exportReplayArtifact(summary.matchId);
    expect(replay.metadata.matchId).toBe(summary.matchId);
    expect(replay.steps).toHaveLength(1);
  });
});
