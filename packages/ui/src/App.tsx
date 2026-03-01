/**
 * App — Root component with mode toggle
 *
 * Supports two modes:
 * - Debug Visualizer: the existing dev tool for testing canvas, overlays, scenarios
 * - Game Session: the full game interface for playing a battle
 */

import { useState, useReducer, useCallback } from 'react';
import './styles/index.css';
import './styles/game.css';
import { createInitialState } from './state/initialState';
import { debugVisualizerReducer } from './state/reducer';
import { Toolbar } from './panels/Toolbar';
import { InfoPanel } from './panels/InfoPanel';
import { BattlefieldCanvas } from './canvas/BattlefieldCanvas';
import { GameSession } from './game/GameSession';
import type { AppMode } from './game/types';

function MainMenu({ onSelectMode }: { onSelectMode: (mode: AppMode) => void }) {
  return (
    <div className="main-menu">
      <div className="main-menu-content">
        <h1 className="main-menu-title">HH Digital</h1>
        <p className="main-menu-subtitle">Horus Heresy — Age of Darkness</p>

        <div className="main-menu-buttons">
          <button
            className="main-menu-btn main-menu-btn-primary"
            onClick={() => onSelectMode('gameSession')}
          >
            <div className="main-menu-btn-title">New Game</div>
            <div className="main-menu-btn-desc">
              Start a two-player hotseat battle
            </div>
          </button>
          <button
            className="main-menu-btn main-menu-btn-secondary"
            onClick={() => onSelectMode('debugVisualizer')}
          >
            <div className="main-menu-btn-title">Dev Mode</div>
            <div className="main-menu-btn-desc">
              Debug visualizer for testing engine features
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function DebugVisualizer({ onReturnToMenu }: { onReturnToMenu: () => void }) {
  const [state, dispatch] = useReducer(debugVisualizerReducer, undefined, createInitialState);

  return (
    <div className="app-layout">
      <Toolbar state={state} dispatch={dispatch} onReturnToMenu={onReturnToMenu} />
      <div className="canvas-container">
        <BattlefieldCanvas state={state} dispatch={dispatch} />
      </div>
      <InfoPanel state={state} dispatch={dispatch} />
    </div>
  );
}

export function App() {
  const [mode, setMode] = useState<AppMode | 'menu'>('menu');

  const handleReturnToMenu = useCallback(() => {
    setMode('menu');
  }, []);

  switch (mode) {
    case 'menu':
      return <MainMenu onSelectMode={setMode} />;

    case 'debugVisualizer':
      return <DebugVisualizer onReturnToMenu={handleReturnToMenu} />;

    case 'gameSession':
      return <GameSession onReturnToMenu={handleReturnToMenu} />;
  }
}
