/**
 * EndGameSummary
 *
 * Full-screen overlay when the game is over.
 * Shows winner, victory points, total casualties, and game summary.
 */

import { useMemo } from 'react';
import type { GameState } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';

interface EndGameSummaryProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onNewGame: () => void;
  onReturnToMenu: () => void;
}

interface PlayerSummary {
  playerName: string;
  faction: string;
  allegiance: string;
  victoryPoints: number;
  totalModels: number;
  casualtiesLost: number;
  unitsDestroyed: number;
  totalUnits: number;
  survivingModels: number;
}

function computePlayerSummary(gs: GameState, playerIndex: number): PlayerSummary {
  const army = gs.armies[playerIndex];
  let totalModels = 0;
  let casualtiesLost = 0;
  let unitsDestroyed = 0;

  for (const unit of army.units) {
    const unitModels = unit.models.length;
    const destroyed = unit.models.filter(m => m.isDestroyed).length;
    totalModels += unitModels;
    casualtiesLost += destroyed;
    if (destroyed === unitModels) {
      unitsDestroyed++;
    }
  }

  return {
    playerName: army.playerName,
    faction: army.faction,
    allegiance: army.allegiance,
    victoryPoints: army.victoryPoints,
    totalModels,
    casualtiesLost,
    unitsDestroyed,
    totalUnits: army.units.length,
    survivingModels: totalModels - casualtiesLost,
  };
}

export function EndGameSummary({ state, onNewGame, onReturnToMenu }: EndGameSummaryProps) {
  const gs = state.gameState;

  const { player1, player2, winnerName, isDraw } = useMemo(() => {
    if (!gs) {
      return {
        player1: null,
        player2: null,
        winnerName: null,
        isDraw: true,
      };
    }

    const p1 = computePlayerSummary(gs, 0);
    const p2 = computePlayerSummary(gs, 1);

    let winner: string | null = null;
    let draw = false;

    if (gs.winnerPlayerIndex !== null) {
      winner = gs.armies[gs.winnerPlayerIndex].playerName;
    } else if (p1.victoryPoints === p2.victoryPoints) {
      draw = true;
    } else if (p1.victoryPoints > p2.victoryPoints) {
      winner = p1.playerName;
    } else {
      winner = p2.playerName;
    }

    return {
      player1: p1,
      player2: p2,
      winnerName: winner,
      isDraw: draw,
    };
  }, [gs]);

  return (
    <div className="endgame-screen">
      <div className="endgame-header">
        <h1 className="endgame-title">Battle Complete</h1>
        {gs && (
          <p className="endgame-subtitle">
            After {gs.currentBattleTurn} battle turn{gs.currentBattleTurn !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="endgame-result">
        {isDraw ? (
          <div className="endgame-winner draw">
            <div className="endgame-winner-label">Result</div>
            <div className="endgame-winner-name">Draw</div>
          </div>
        ) : (
          <div className="endgame-winner">
            <div className="endgame-winner-label">Victor</div>
            <div className="endgame-winner-name">{winnerName}</div>
          </div>
        )}
      </div>

      <div className="endgame-summaries">
        {/* Player 1 Summary */}
        {player1 && (
          <div className="endgame-player-summary">
            <div className="endgame-player-header">
              <div className="endgame-player-name">{player1.playerName}</div>
              <div className="endgame-player-faction">
                {player1.faction} ({player1.allegiance})
              </div>
            </div>
            <div className="endgame-stats">
              <div className="endgame-stat">
                <span className="endgame-stat-label">Victory Points</span>
                <span className="endgame-stat-value vp">{player1.victoryPoints}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Units Deployed</span>
                <span className="endgame-stat-value">{player1.totalUnits}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Units Destroyed</span>
                <span className="endgame-stat-value casualties">{player1.unitsDestroyed}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Total Models</span>
                <span className="endgame-stat-value">{player1.totalModels}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Casualties</span>
                <span className="endgame-stat-value casualties">{player1.casualtiesLost}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Surviving Models</span>
                <span className="endgame-stat-value survivors">{player1.survivingModels}</span>
              </div>
            </div>
          </div>
        )}

        {/* VS Divider */}
        <div className="endgame-vs">VS</div>

        {/* Player 2 Summary */}
        {player2 && (
          <div className="endgame-player-summary">
            <div className="endgame-player-header">
              <div className="endgame-player-name">{player2.playerName}</div>
              <div className="endgame-player-faction">
                {player2.faction} ({player2.allegiance})
              </div>
            </div>
            <div className="endgame-stats">
              <div className="endgame-stat">
                <span className="endgame-stat-label">Victory Points</span>
                <span className="endgame-stat-value vp">{player2.victoryPoints}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Units Deployed</span>
                <span className="endgame-stat-value">{player2.totalUnits}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Units Destroyed</span>
                <span className="endgame-stat-value casualties">{player2.unitsDestroyed}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Total Models</span>
                <span className="endgame-stat-value">{player2.totalModels}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Casualties</span>
                <span className="endgame-stat-value casualties">{player2.casualtiesLost}</span>
              </div>
              <div className="endgame-stat">
                <span className="endgame-stat-label">Surviving Models</span>
                <span className="endgame-stat-value survivors">{player2.survivingModels}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Combat Log Summary */}
      {state.combatLog.length > 0 && (
        <div className="endgame-log-summary">
          <div className="panel-title">Battle Summary</div>
          <div className="endgame-log-stats">
            <span>Total Events: {state.combatLog.length}</span>
            <span>Shooting Events: {state.combatLog.filter(e => e.category === 'shooting').length}</span>
            <span>Assault Events: {state.combatLog.filter(e => e.category === 'assault').length}</span>
            <span>Morale Events: {state.combatLog.filter(e => e.category === 'morale').length}</span>
            <span>Reactions: {state.combatLog.filter(e => e.category === 'reaction').length}</span>
          </div>
        </div>
      )}

      <div className="endgame-actions">
        <button className="setup-confirm-btn" onClick={onNewGame}>
          New Game
        </button>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Return to Menu
        </button>
      </div>
    </div>
  );
}
