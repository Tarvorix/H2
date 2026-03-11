import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider } from '@hh/engine';
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

  it('lets external agents play a full match to a winner through decision options', () => {
    const matches = new HHMatchManager();
    const summary = matches.createMatch({
      setupOptions: {
        ...createSetupOptions(),
        maxBattleTurns: 1,
        objectives: [
          {
            id: 'obj-home',
            label: 'Home',
            position: { x: 12, y: 6 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
          },
        ],
      },
      playerConfigs: [{ mode: 'agent' }, { mode: 'agent' }],
      diceProvider: new FixedDiceProvider(Array.from({ length: 2048 }, () => 6)),
    });

    matches.bindAgent(summary.matchId, 0, 'codex-agent');
    matches.bindAgent(summary.matchId, 1, 'claude-agent');

    let safety = 0;
    while (!matches.getMatch(summary.matchId).isGameOver && safety < 128) {
      const current = matches.getMatch(summary.matchId);
      const actingPlayerIndex = current.nudge.actingPlayerIndex as 0 | 1;
      const agentId = actingPlayerIndex === 0 ? 'codex-agent' : 'claude-agent';
      const options = matches.getDecisionOptions(summary.matchId, actingPlayerIndex, agentId);

      expect(options.canAct).toBe(true);
      expect(options.options.length).toBeGreaterThan(0);

      const records = matches.submitDecisionOption(
        summary.matchId,
        actingPlayerIndex,
        options.options[0].id,
        agentId,
      );
      expect(records.length).toBeGreaterThan(0);
      safety += records.length;
    }

    const final = matches.getMatch(summary.matchId);
    expect(final.isGameOver).toBe(true);
    expect(final.winnerPlayerIndex).toBe(0);
  });
});
