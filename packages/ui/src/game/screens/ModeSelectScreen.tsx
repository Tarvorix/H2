import { useCallback } from 'react';
import { GameMode } from '@hh/types';
import type { GameUIAction, GameUIState } from '../types';
import { GameUIPhase } from '../types';

interface ModeSelectScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

const MODE_CARDS: Array<{
  gameMode: GameMode;
  title: string;
  description: string;
  details: string;
}> = [
  {
    gameMode: GameMode.CoreMissions,
    title: 'Core Missions',
    description: 'Standard Age of Darkness missions on a 72" x 48" battlefield.',
    details: 'Core deployment maps, standard terrain flow, AI options available.',
  },
  {
    gameMode: GameMode.ZoneMortalis,
    title: 'Zone Mortalis',
    description: 'Single-level boarding and interior combat on a 48" x 48" battlefield.',
    details: 'Official Zone Mortalis missions, section-based terrain, human-play only.',
  },
];

export function ModeSelectScreen({ state, dispatch, onReturnToMenu }: ModeSelectScreenProps) {
  const handleSelectMode = useCallback(
    (gameMode: GameMode) => {
      dispatch({ type: 'SELECT_GAME_MODE', gameMode });
      dispatch({ type: 'SET_UI_PHASE', phase: GameUIPhase.ArmyBuilder });
    },
    [dispatch],
  );

  return (
    <div className="setup-screen mission-select-screen">
      <div className="setup-header">
        <h1 className="setup-title">New Game</h1>
        <p className="setup-subtitle">Choose the battle ruleset before building armies</p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content mission-select-content">
        <div className="mission-select-section">
          <h2 className="mission-select-section-title">Game Mode</h2>
          <div className="mission-select-grid">
            {MODE_CARDS.map((mode) => (
              <button
                key={mode.gameMode}
                type="button"
                className={`mission-card ${state.gameMode === mode.gameMode ? 'selected' : ''}`}
                onClick={() => handleSelectMode(mode.gameMode)}
              >
                <div className="mission-card-name">{mode.title}</div>
                <div className="mission-card-description">{mode.description}</div>
                <div className="mission-card-secondary">{mode.details}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
