/**
 * GameSession — Root component for Game Mode
 *
 * Wires together the game reducer, battlefield canvas, sidebar panels,
 * flow overlays, and modals. This replaces the debug visualizer's App
 * component when in game mode.
 */

import { useReducer, useCallback, useEffect, useState } from 'react';
import { gameReducer } from './reducer';
import { createInitialGameUIState, GameUIPhase } from './types';
import { GameSetup } from './GameSetup';
import { PhaseTracker } from './panels/PhaseTracker';
import { UnitCard } from './panels/UnitCard';
import { ActionBar } from './panels/ActionBar';
import { CombatLog } from './panels/CombatLog';
import { EndGameSummary } from './screens/EndGameSummary';
import { MovementFlow } from './flows/MovementFlow';
import { ShootingFlow } from './flows/ShootingFlow';
import { AssaultFlow } from './flows/AssaultFlow';
import { ReactionPrompt } from './flows/ReactionPrompt';
import { ChallengeFlow } from './flows/ChallengeFlow';
import { DiceDisplay } from './components/DiceDisplay';
import { useAITurn } from './hooks/useAITurn';
import { useAIDeployment } from './hooks/useAIDeployment';
import { GameBattlefieldCanvas } from './canvas/GameBattlefieldCanvas';
import { VPTracker } from './panels/VPTracker';
import {
  getNextRendererAssetMode,
  type RendererAssetMode,
} from '../canvas/assets';

interface GameSessionProps {
  onReturnToMenu: () => void;
}

export function GameSession({ onReturnToMenu }: GameSessionProps) {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialGameUIState);
  const [rendererMode, setRendererMode] = useState<RendererAssetMode>('placeholder');

  // AI hooks — internally guard on phase and aiConfig
  useAITurn(state, dispatch);
  useAIDeployment(state, dispatch);

  // Auto-dismiss notifications after their duration
  useEffect(() => {
    if (state.notifications.length === 0) return;
    const timers = state.notifications.map(n => {
      const elapsed = Date.now() - n.timestamp;
      const remaining = Math.max(0, n.duration - elapsed);
      return setTimeout(() => {
        dispatch({ type: 'DISMISS_NOTIFICATION', timestamp: n.timestamp });
      }, remaining);
    });
    return () => timers.forEach(clearTimeout);
  }, [state.notifications]);

  // Auto-hide dice animation
  useEffect(() => {
    if (!state.diceAnimation.isVisible) return;
    const elapsed = Date.now() - state.diceAnimation.startTime;
    const remaining = Math.max(0, state.diceAnimation.duration - elapsed);
    const timer = setTimeout(() => {
      dispatch({ type: 'HIDE_DICE_ANIMATION' });
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.diceAnimation.isVisible, state.diceAnimation.startTime, state.diceAnimation.duration]);

  const handleReturnToMenu = useCallback(() => {
    dispatch({ type: 'RETURN_TO_MENU' });
    onReturnToMenu();
  }, [onReturnToMenu]);

  const handleDismissDice = useCallback(() => {
    dispatch({ type: 'HIDE_DICE_ANIMATION' });
  }, []);

  // Pre-game setup phases
  if (
    state.uiPhase === GameUIPhase.ArmyBuilder ||
    state.uiPhase === GameUIPhase.ArmyLoad ||
    state.uiPhase === GameUIPhase.MissionSelect ||
    state.uiPhase === GameUIPhase.TerrainSetup ||
    state.uiPhase === GameUIPhase.ObjectivePlacement ||
    state.uiPhase === GameUIPhase.Deployment
  ) {
    return (
      <GameSetup
        state={state}
        dispatch={dispatch}
        onReturnToMenu={handleReturnToMenu}
      />
    );
  }

  // Game over
  if (state.uiPhase === GameUIPhase.GameOver) {
    return (
      <EndGameSummary
        state={state}
        dispatch={dispatch}
        onNewGame={() => dispatch({ type: 'NEW_GAME' })}
        onReturnToMenu={handleReturnToMenu}
      />
    );
  }

  // Active game (Playing phase)
  return (
    <div className="game-layout">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="game-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">HH Digital</span>
        </div>
        <div className="toolbar-separator" />
        {state.gameState && (
          <PhaseTracker gameState={state.gameState} />
        )}
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => dispatch({ type: 'END_SUB_PHASE' })}
          >
            End Sub-Phase
          </button>
          <button
            className="toolbar-btn"
            onClick={() => dispatch({ type: 'END_PHASE' })}
          >
            End Phase
          </button>
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <span className="toolbar-label">
            {state.camera.zoom.toFixed(1)}px/in
          </span>
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <button
            className="toolbar-btn"
            onClick={() => setRendererMode((mode) => getNextRendererAssetMode(mode))}
          >
            Render: {rendererMode === 'placeholder' ? 'Placeholder' : 'Sprite-Ready'}
          </button>
        </div>
        <div className="toolbar-separator" />
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={handleReturnToMenu}>
            Menu
          </button>
        </div>
      </div>

      {/* ── Battlefield (center) ─────────────────────────────────────────── */}
      <div className="game-canvas-container">
        <GameBattlefieldCanvas
          state={state}
          dispatch={dispatch}
          rendererMode={rendererMode}
        />
      </div>

      {/* ── Sidebar (right) ──────────────────────────────────────────────── */}
      <div className="game-sidebar">
        {/* Unit Card */}
        {state.selectedUnitId && state.gameState && (
          <UnitCard
            gameState={state.gameState}
            selectedUnitId={state.selectedUnitId}
          />
        )}

        {/* Action Bar */}
        {state.gameState && (
          <ActionBar
            state={state}
            dispatch={dispatch}
          />
        )}

        {/* Victory Points */}
        {state.gameState && (
          <VPTracker gameState={state.gameState} />
        )}

        {/* Combat Log */}
        <CombatLog
          entries={state.combatLog}
          filter={state.combatLogFilter}
          dispatch={dispatch}
        />
      </div>

      {/* ── Flow Panels (bottom overlays) ──────────────────────────────────── */}
      {state.flowState.type === 'movement' && (
        <MovementFlow state={state} dispatch={dispatch} />
      )}
      {state.flowState.type === 'shooting' && (
        <ShootingFlow state={state} dispatch={dispatch} />
      )}
      {state.flowState.type === 'assault' && (
        <AssaultFlow state={state} dispatch={dispatch} />
      )}

      {/* ── Modal Overlays ─────────────────────────────────────────────────── */}
      {state.flowState.type === 'reaction' && (
        <ReactionPrompt state={state} dispatch={dispatch} />
      )}
      {state.flowState.type === 'challenge' && (
        <ChallengeFlow state={state} dispatch={dispatch} />
      )}

      {/* ── Notifications ────────────────────────────────────────────────── */}
      {state.notifications.length > 0 && (
        <div className="game-notifications">
          {state.notifications.map(n => (
            <div
              key={n.timestamp}
              className={`game-notification game-notification-${n.type}`}
              onClick={() => dispatch({ type: 'DISMISS_NOTIFICATION', timestamp: n.timestamp })}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      {/* ── Dice Animation Overlay ───────────────────────────────────────── */}
      <DiceDisplay
        animation={state.diceAnimation}
        onDismiss={handleDismissDice}
      />
    </div>
  );
}
