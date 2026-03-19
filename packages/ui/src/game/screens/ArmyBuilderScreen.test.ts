import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Allegiance, GameMode, LegionFaction } from '@hh/types';
import type { ArmyList } from '@hh/types';
import { createInitialGameUIState } from '../types';
import { ArmyBuilderScreen } from './ArmyBuilderScreen';

function createArmyList(): ArmyList {
  return {
    playerName: 'Player 1',
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    pointsLimit: 2000,
    totalPoints: 0,
    detachments: [],
  };
}

function renderArmyBuilder(gameMode: GameMode): string {
  const state = createInitialGameUIState();
  state.gameMode = gameMode;
  state.armyBuilder.armyLists = [createArmyList(), null];

  return renderToStaticMarkup(
    createElement(ArmyBuilderScreen, {
      state,
      dispatch: vi.fn(),
      onReturnToMenu: vi.fn(),
    }),
  );
}

describe('ArmyBuilderScreen AI controls', () => {
  it('renders the AI toggle for Zone Mortalis', () => {
    const markup = renderArmyBuilder(GameMode.ZoneMortalis);

    expect(markup).toContain('AI Opponent');
  });

  it('renders the AI toggle for core missions', () => {
    const markup = renderArmyBuilder(GameMode.CoreMissions);

    expect(markup).toContain('AI Opponent');
  });
});
