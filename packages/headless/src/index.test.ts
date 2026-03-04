import { describe, expect, it } from 'vitest';
import { Allegiance, CoreReaction, LegionFaction } from '@hh/types';
import { buildFallbackCommand } from './index';
import { createHeadlessGameState } from './setup';

function createAwaitingReactionState() {
  const baseState = createHeadlessGameState({
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

  const reactiveUnitId = baseState.armies[1].units[0]?.id ?? 'reactive-unit';

  return {
    ...baseState,
    activePlayerIndex: 0,
    awaitingReaction: true,
    pendingReaction: {
      reactionType: CoreReaction.Reposition,
      isAdvancedReaction: false,
      eligibleUnitIds: [reactiveUnitId],
      triggerDescription: 'Unit ended move within 12"',
      triggerSourceUnitId: baseState.armies[0].units[0]?.id ?? 'active-unit',
    },
  };
}

describe('buildFallbackCommand', () => {
  it('prefers selecting a valid pending reaction instead of auto-declining', () => {
    const state = createAwaitingReactionState();
    const command = buildFallbackCommand(state);

    expect(command).toEqual({
      type: 'selectReaction',
      unitId: state.pendingReaction!.eligibleUnitIds[0],
      reactionType: String(state.pendingReaction!.reactionType),
    });
  });

  it('declines only when no valid reaction unit can be selected', () => {
    const state = {
      ...createAwaitingReactionState(),
      pendingReaction: {
        ...createAwaitingReactionState().pendingReaction!,
        eligibleUnitIds: [],
      },
    };

    const command = buildFallbackCommand(state);
    expect(command).toEqual({ type: 'declineReaction' });
  });
});
