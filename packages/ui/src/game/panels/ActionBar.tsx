/**
 * ActionBar Panel
 *
 * Context-sensitive action buttons based on current phase/sub-phase and selected unit.
 * Shows available actions with disabled states and tooltips explaining why actions
 * aren't available.
 */

import { useCallback, useMemo } from 'react';
import { getPhaseUxStatus } from '@hh/engine';
import { Phase, SubPhase } from '@hh/types';
import type { GameUIState, GameUIAction, AvailableAction } from '../types';

interface ActionBarProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  phaseAutomationPaused: boolean;
  onTogglePhaseAutomation: () => void;
}

function getAvailableActions(
  state: GameUIState,
  phaseAutomationPaused: boolean,
): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const gs = state.gameState;
  if (!gs) return actions;

  const hasSelectedUnit = state.selectedUnitId !== null;
  const phaseStatus = getPhaseUxStatus(gs);

  // If awaiting reaction, only show reaction actions
  if (gs.awaitingReaction) {
    actions.push({
      id: 'decline-reaction',
      label: 'Decline Reaction',
      enabled: true,
      action: { type: 'DECLINE_REACTION' },
      shortcut: 'Esc',
    });
    return actions;
  }

  // Phase-specific actions
  switch (gs.currentPhase) {
    case Phase.Movement:
      if (gs.currentSubPhase === SubPhase.Move) {
        actions.push({
          id: 'move',
          label: 'Move',
          enabled: hasSelectedUnit,
          disabledReason: !hasSelectedUnit ? 'Select a unit first' : undefined,
          action: { type: 'START_MOVE_FLOW' },
          shortcut: 'M',
        });
        actions.push({
          id: 'rush',
          label: 'Rush',
          enabled: hasSelectedUnit,
          disabledReason: !hasSelectedUnit ? 'Select a unit first' : undefined,
          action: { type: 'START_RUSH_FLOW' },
          shortcut: 'R',
        });
      }
      break;

    case Phase.Shooting:
      if (gs.currentSubPhase === SubPhase.Attack) {
        actions.push({
          id: 'shoot',
          label: 'Shoot',
          enabled: hasSelectedUnit,
          disabledReason: !hasSelectedUnit ? 'Select a unit first' : undefined,
          action: { type: 'START_SHOOTING_FLOW' },
          shortcut: 'S',
        });
      }
      break;

    case Phase.Assault:
      if (gs.currentSubPhase === SubPhase.Charge) {
        actions.push({
          id: 'charge',
          label: 'Charge',
          enabled: hasSelectedUnit,
          disabledReason: !hasSelectedUnit ? 'Select a unit first' : undefined,
          action: { type: 'START_CHARGE_FLOW' },
          shortcut: 'C',
        });
      }
      break;
  }

  // Cancel current flow
  if (state.flowState.type !== 'idle') {
    actions.push({
      id: 'cancel',
      label: 'Cancel',
      enabled: true,
      action: state.flowState.type === 'movement'
        ? { type: 'CANCEL_MOVE' }
        : state.flowState.type === 'shooting'
          ? { type: 'CANCEL_SHOOTING' }
          : state.flowState.type === 'assault'
            ? { type: 'CANCEL_CHARGE' }
            : { type: 'SET_FLOW_STATE', flowState: { type: 'idle' } },
      shortcut: 'Esc',
    });
  }

  const shouldShowContinue =
    !gs.isGameOver && (phaseAutomationPaused || phaseStatus.isDecisionPoint);

  if (shouldShowContinue) {
    actions.push({
      id: 'continue-sub-phase',
      label: phaseStatus.isDecisionPoint ? 'Continue (Skip)' : 'Continue',
      enabled: state.flowState.type === 'idle',
      disabledReason: state.flowState.type !== 'idle'
        ? 'Complete or cancel current action first'
        : undefined,
      action: { type: 'END_SUB_PHASE' },
      shortcut: 'E',
    });
  }

  return actions;
}

function getPhaseStatusLabel(
  phaseStatus: ReturnType<typeof getPhaseUxStatus>,
  awaitingReaction: boolean,
): string {
  if (awaitingReaction) return 'Reaction Pending';
  if (phaseStatus.state === 'decision') return 'Decision Required';
  if (phaseStatus.state === 'auto') return 'Auto-Advance';
  return 'Blocked';
}

export function ActionBar({
  state,
  dispatch,
  phaseAutomationPaused,
  onTogglePhaseAutomation,
}: ActionBarProps) {
  const actions = useMemo(
    () => getAvailableActions(state, phaseAutomationPaused),
    [state, phaseAutomationPaused],
  );
  const phaseStatus = useMemo(
    () => (state.gameState ? getPhaseUxStatus(state.gameState) : null),
    [state.gameState],
  );

  const handleClick = useCallback(
    (action: GameUIAction) => {
      dispatch(action);
    },
    [dispatch],
  );

  return (
    <div className="panel-section action-bar">
      <div className="panel-title">Actions</div>
      {phaseStatus && state.gameState && (
        <>
          <div className="action-bar-phase-status">
            <span className="panel-row-label">Phase</span>
            <span
              className={`panel-row-value action-bar-phase-state action-bar-phase-state-${phaseStatus.state}`}
            >
              {getPhaseStatusLabel(phaseStatus, state.gameState.awaitingReaction)}
            </span>
          </div>
          <div className="action-bar-phase-message">{phaseStatus.message}</div>
          <div className="action-bar-automation-controls">
            <span className="panel-row-label">Automation</span>
            <button
              className="action-bar-btn"
              onClick={onTogglePhaseAutomation}
            >
              {phaseAutomationPaused ? 'Resume Auto' : 'Pause Auto'}
            </button>
          </div>
        </>
      )}
      <div className="action-bar-buttons">
        {actions.map(a => (
          <button
            key={a.id}
            className={`action-bar-btn ${a.enabled ? '' : 'disabled'}`}
            disabled={!a.enabled}
            title={a.disabledReason ?? (a.shortcut ? `Shortcut: ${a.shortcut}` : undefined)}
            onClick={() => handleClick(a.action)}
          >
            {a.label}
            {a.shortcut && <span className="action-bar-shortcut">{a.shortcut}</span>}
          </button>
        ))}
      </div>
      {/* Flow State Indicator */}
      {state.flowState.type !== 'idle' && (
        <div className="action-bar-flow-indicator">
          <span className="panel-row-label">Current Flow</span>
          <span className="panel-row-value" style={{ textTransform: 'capitalize' }}>
            {state.flowState.type}
            {state.flowState.type === 'movement' && ` — ${state.flowState.step.step}`}
            {state.flowState.type === 'shooting' && ` — ${state.flowState.step.step}`}
            {state.flowState.type === 'assault' && ` — ${state.flowState.step.step}`}
          </span>
        </div>
      )}
    </div>
  );
}
