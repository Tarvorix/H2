import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider } from '@hh/engine';
import { createHeadlessGameState } from './setup';
import { runHeadlessMatch } from './index';

describe('headless AI match loop', () => {
  it('can run an end-to-end AI-driven mission to game over', () => {
    const initialState = createHeadlessGameState({
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
    });

    const result = runHeadlessMatch(initialState, {
      maxCommands: 4000,
      diceProvider: new FixedDiceProvider(Array.from({ length: 24000 }, () => 3)),
    });

    expect(result.executedCommands).toBeGreaterThan(0);
    expect(result.commandHistory.some((entry) => entry.accepted)).toBe(true);
    expect(result.terminatedReason).toBe('game-over');
    expect(result.finalState.isGameOver).toBe(true);
  });
});
