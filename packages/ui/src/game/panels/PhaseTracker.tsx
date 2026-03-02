/**
 * PhaseTracker Panel
 *
 * Displays the current game state in the toolbar:
 * - Battle Turn X/4
 * - Active Player name
 * - Current Phase + Sub-Phase
 * - Reaction Allotment remaining
 * - Visual phase progression bar
 */

import type { GameState } from '@hh/types';
import { getPhaseUxStatus } from '@hh/engine';
import { Phase } from '@hh/types';

interface PhaseTrackerProps {
  gameState: GameState;
}

const PHASE_ORDER: Phase[] = [
  Phase.Start,
  Phase.Movement,
  Phase.Shooting,
  Phase.Assault,
  Phase.End,
];

const PHASE_LABELS: Record<Phase, string> = {
  [Phase.Start]: 'Start',
  [Phase.Movement]: 'Movement',
  [Phase.Shooting]: 'Shooting',
  [Phase.Assault]: 'Assault',
  [Phase.End]: 'End',
};

export function PhaseTracker({ gameState }: PhaseTrackerProps) {
  const activeArmy = gameState.armies[gameState.activePlayerIndex];
  const reactiveArmy = gameState.armies[gameState.activePlayerIndex === 0 ? 1 : 0];
  const currentPhaseIndex = PHASE_ORDER.indexOf(gameState.currentPhase);
  const phaseStatus = getPhaseUxStatus(gameState);
  const phaseStatusLabel = gameState.awaitingReaction
    ? 'Reaction'
    : phaseStatus.state === 'decision'
      ? 'Decision'
      : phaseStatus.state === 'auto'
        ? 'Auto'
        : 'Blocked';

  return (
    <div className="phase-tracker">
      {/* Turn Counter */}
      <div className="toolbar-group">
        <span className="toolbar-label">Turn</span>
        <span className="phase-tracker-value">
          {gameState.currentBattleTurn}/{gameState.maxBattleTurns}
        </span>
      </div>

      <div className="toolbar-separator" />

      {/* Active Player */}
      <div className="toolbar-group">
        <span className="toolbar-label">Active</span>
        <span className="phase-tracker-value phase-tracker-player">
          {activeArmy?.playerName ?? `Player ${gameState.activePlayerIndex + 1}`}
        </span>
      </div>

      <div className="toolbar-separator" />

      {/* Phase Bar */}
      <div className="toolbar-group">
        <div className="phase-bar">
          {PHASE_ORDER.map((phase, idx) => (
            <div
              key={phase}
              className={`phase-bar-segment ${
                idx < currentPhaseIndex
                  ? 'phase-completed'
                  : idx === currentPhaseIndex
                    ? 'phase-active'
                    : 'phase-pending'
              }`}
              title={`${PHASE_LABELS[phase]}${idx === currentPhaseIndex ? ` — ${gameState.currentSubPhase}` : ''}`}
            >
              {PHASE_LABELS[phase].charAt(0)}
            </div>
          ))}
        </div>
      </div>

      <div className="toolbar-separator" />

      {/* Sub-Phase */}
      <div className="toolbar-group">
        <span className="toolbar-label">Sub</span>
        <span className="phase-tracker-value">{gameState.currentSubPhase}</span>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <span className="toolbar-label">Status</span>
        <span className={`phase-tracker-status phase-tracker-status-${phaseStatus.state}`}>
          {phaseStatusLabel}
        </span>
      </div>

      <div className="toolbar-separator" />

      {/* Reaction Allotment */}
      <div className="toolbar-group">
        <span className="toolbar-label">Reactions</span>
        <span className="phase-tracker-value">
          {reactiveArmy?.reactionAllotmentRemaining ?? 0}
        </span>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <span className="phase-tracker-hint">{phaseStatus.message}</span>
      </div>

      {/* Awaiting Reaction Indicator */}
      {gameState.awaitingReaction && (
        <>
          <div className="toolbar-separator" />
          <div className="toolbar-group">
            <span className="phase-tracker-reaction-alert">
              REACTION PENDING
            </span>
          </div>
        </>
      )}
    </div>
  );
}
