/**
 * ActionBar Panel
 *
 * Context-sensitive action buttons based on current phase/sub-phase and selected unit.
 * Shows available actions with disabled states and tooltips explaining why actions
 * aren't available.
 */

import { useCallback, useMemo } from 'react';
import {
  canUnitShoot,
  getValidCommands,
  getModelStateBaseSizeMM,
  getPhaseUxStatus,
  getZoneMortalisMeasurementDistance,
} from '@hh/engine';
import { GameMode, Phase, SubPhase } from '@hh/types';
import type { GameUIState, GameUIAction, AvailableAction } from '../types';

interface ActionBarProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  phaseAutomationPaused: boolean;
  onTogglePhaseAutomation: () => void;
}

function findUnitById(state: GameUIState, unitId: string) {
  const gs = state.gameState;
  if (!gs) return null;
  for (const army of gs.armies) {
    for (const unit of army.units) {
      if (unit.id === unitId) return unit;
    }
  }
  return null;
}

function getDistanceFromPointToRectangle(
  x: number,
  y: number,
  topLeft: { x: number; y: number },
  width: number,
  height: number,
): number {
  const dx = Math.max(topLeft.x - x, 0, x - (topLeft.x + width));
  const dy = Math.max(topLeft.y - y, 0, y - (topLeft.y + height));
  return Math.sqrt(dx * dx + dy * dy);
}

function getZoneMortalisActionTargets(
  state: GameUIState,
  selectedUnit: NonNullable<ReturnType<typeof findUnitById>>,
): {
  doorwayToOpenId: string | null;
  doorwayToCloseId: string | null;
  objectiveToInterfaceId: string | null;
} {
  const gs = state.gameState;
  if (
    !gs ||
    gs.gameMode !== GameMode.ZoneMortalis ||
    !gs.zoneMortalisState ||
    gs.currentPhase !== Phase.Movement ||
    gs.currentSubPhase !== SubPhase.Move
  ) {
    return {
      doorwayToOpenId: null,
      doorwayToCloseId: null,
      objectiveToInterfaceId: null,
    };
  }

  const isActivePlayersUnit = gs.armies[gs.activePlayerIndex].units.some((unit) => unit.id === selectedUnit.id);
  if (
    !isActivePlayersUnit ||
    !selectedUnit.isDeployed ||
    selectedUnit.embarkedOnId !== null ||
    selectedUnit.isLockedInCombat
  ) {
    return {
      doorwayToOpenId: null,
      doorwayToCloseId: null,
      objectiveToInterfaceId: null,
    };
  }

  const aliveModels = selectedUnit.models.filter((model) => !model.isDestroyed);
  const doorwayCandidates = gs.zoneMortalisState.doorways
    .map((doorway) => {
      if (doorway.state === 'destroyed') {
        return null;
      }

      const terrain = gs.terrain.find((piece) => piece.id === doorway.id);
      if (!terrain || terrain.shape.kind !== 'rectangle') {
        return null;
      }
      const terrainShape = terrain.shape;

      const hasBaseContactModel = aliveModels.some((model) => {
        const radius = (getModelStateBaseSizeMM(model) / 25.4) / 2;
        return getDistanceFromPointToRectangle(
          model.position.x,
          model.position.y,
          terrainShape.topLeft,
          terrainShape.width,
          terrainShape.height,
        ) <= radius + 0.0001;
      });
      if (!hasBaseContactModel) {
        return null;
      }

      const hasOperator = aliveModels.some((model) => {
        const radius = (getModelStateBaseSizeMM(model) / 25.4) / 2;
        return getDistanceFromPointToRectangle(
          model.position.x,
          model.position.y,
          terrainShape.topLeft,
          terrainShape.width,
          terrainShape.height,
        ) <= radius + 2.0001;
      });
      if (!hasOperator) {
        return null;
      }

      const minDistance = Math.min(...aliveModels.map((model) =>
        getDistanceFromPointToRectangle(
          model.position.x,
          model.position.y,
          terrainShape.topLeft,
          terrainShape.width,
          terrainShape.height,
        ),
      ));

      return {
        doorwayId: doorway.id ?? terrain.id,
        state: doorway.state,
        minDistance,
      };
    })
    .filter((candidate): candidate is { doorwayId: string; state: 'open' | 'closed'; minDistance: number } => candidate !== null)
    .sort((left, right) => left.minDistance - right.minDistance);

  const doorwayToOpenId = doorwayCandidates.find((candidate) => candidate.state === 'closed')?.doorwayId ?? null;
  const doorwayToCloseId = doorwayCandidates.find((candidate) => candidate.state === 'open')?.doorwayId ?? null;

  let objectiveToInterfaceId: string | null = null;
  if (gs.missionState?.missionId === 'terminal-control') {
    const objectiveCandidates = gs.missionState.objectives
      .map((objective) => {
        const minDistance = Math.min(...aliveModels.map((model) =>
          getZoneMortalisMeasurementDistance(gs, model.position, objective.position) ?? Number.POSITIVE_INFINITY,
        ));
        if (!Number.isFinite(minDistance) || minDistance > 3.0001) {
          return null;
        }

        return {
          objectiveId: objective.id,
          minDistance,
        };
      })
      .filter((candidate): candidate is { objectiveId: string; minDistance: number } => candidate !== null)
      .sort((left, right) => left.minDistance - right.minDistance);

    objectiveToInterfaceId = objectiveCandidates[0]?.objectiveId ?? null;
  }

  return {
    doorwayToOpenId,
    doorwayToCloseId,
    objectiveToInterfaceId,
  };
}

function getAvailableActions(
  state: GameUIState,
  phaseAutomationPaused: boolean,
): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const gs = state.gameState;
  if (!gs) return actions;

  const hasSelectedUnit = state.selectedUnitId !== null;
  const selectedUnit = state.selectedUnitId ? findUnitById(state, state.selectedUnitId) : null;
  const selectedUnitCanShoot = selectedUnit ? canUnitShoot(selectedUnit) : false;
  const phaseStatus = getPhaseUxStatus(gs);
  const validCommands = new Set(getValidCommands(gs));
  const zoneMortalisTargets = selectedUnit
    ? getZoneMortalisActionTargets(state, selectedUnit)
    : {
        doorwayToOpenId: null,
        doorwayToCloseId: null,
        objectiveToInterfaceId: null,
      };

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

  // If a flow is already active, only allow canceling that flow.
  if (state.flowState.type !== 'idle') {
    const isCompulsoryAssaultFlow = state.flowState.type === 'assault' && (
      state.flowState.step.step === 'fightPhase' ||
      state.flowState.step.step === 'resolution' ||
      state.flowState.step.step === 'selectAftermath'
    );
    if (isCompulsoryAssaultFlow) {
      return actions;
    }

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
        if (zoneMortalisTargets.doorwayToOpenId) {
          actions.push({
            id: 'open-doorway',
            label: 'Open Door',
            enabled: true,
            action: {
              type: 'DISPATCH_ENGINE_COMMAND',
              command: {
                type: 'operateDoorway',
                unitId: selectedUnit!.id,
                doorwayId: zoneMortalisTargets.doorwayToOpenId,
                desiredState: 'open',
              },
            },
          });
        }
        if (zoneMortalisTargets.doorwayToCloseId) {
          actions.push({
            id: 'close-doorway',
            label: 'Close Door',
            enabled: true,
            action: {
              type: 'DISPATCH_ENGINE_COMMAND',
              command: {
                type: 'operateDoorway',
                unitId: selectedUnit!.id,
                doorwayId: zoneMortalisTargets.doorwayToCloseId,
                desiredState: 'closed',
              },
            },
          });
        }
        if (zoneMortalisTargets.objectiveToInterfaceId) {
          actions.push({
            id: 'interface-objective',
            label: 'Interface',
            enabled: true,
            action: {
              type: 'DISPATCH_ENGINE_COMMAND',
              command: {
                type: 'interfaceObjective',
                unitId: selectedUnit!.id,
                objectiveId: zoneMortalisTargets.objectiveToInterfaceId,
              },
            },
          });
        }
      }
      break;

    case Phase.Shooting:
      if (gs.currentSubPhase === SubPhase.Attack) {
        actions.push({
          id: 'shoot',
          label: 'Shoot',
          enabled: hasSelectedUnit && selectedUnitCanShoot,
          disabledReason: !hasSelectedUnit
            ? 'Select a unit first'
            : !selectedUnit
              ? 'Selected unit was not found'
              : !selectedUnitCanShoot
                ? 'Selected unit is not eligible to shoot'
                : undefined,
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
      } else if (gs.currentSubPhase === SubPhase.Challenge) {
        actions.push({
          id: 'challenge',
          label: 'Challenge',
          enabled: hasSelectedUnit,
          disabledReason: !hasSelectedUnit ? 'Select an engaged unit first' : undefined,
          action: { type: 'START_CHALLENGE_FLOW' },
          shortcut: 'H',
        });
      }
      break;
  }

  const shouldShowContinue =
    !gs.isGameOver &&
    validCommands.has('endSubPhase') &&
    (phaseAutomationPaused || phaseStatus.isDecisionPoint);

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
