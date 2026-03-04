import { useEffect, useRef } from 'react';
import { getNextPhaseState, getPhaseUxStatus, getValidCommands } from '@hh/engine';
import type { GameUIAction, GameUIState } from '../types';
import { GameUIPhase } from '../types';

interface UsePhaseAutomationOptions {
  paused: boolean;
  autoAdvanceDelayMs?: number;
}

let autoAdvanceLogCounter = 0;

function nextAutoAdvanceLogId(): string {
  autoAdvanceLogCounter += 1;
  return `auto-phase-${autoAdvanceLogCounter}`;
}

/**
 * Auto-advances sub-phases when no tactical decisions are pending.
 * The hook is intentionally conservative and will never auto-advance while:
 * - not in Playing UI phase
 * - a UI flow is in progress
 * - a reaction is pending
 * - automation is paused
 */
export function usePhaseAutomation(
  state: GameUIState,
  dispatch: React.Dispatch<GameUIAction>,
  options: UsePhaseAutomationOptions,
): void {
  const delayMs = options.autoAdvanceDelayMs ?? 140;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhaseKeyRef = useRef<string>('');
  const lastDispatchedPhaseKeyRef = useRef<string>('');

  const gs = state.gameState;
  const flowType = state.flowState.type;
  const phaseKey = gs
    ? `${gs.currentBattleTurn}:${gs.activePlayerIndex}:${gs.currentPhase}:${gs.currentSubPhase}:${gs.awaitingReaction ? 'reaction' : 'normal'}`
    : '';

  useEffect(() => {
    latestPhaseKeyRef.current = phaseKey;
  }, [phaseKey]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!gs) return;
    if (state.uiPhase !== GameUIPhase.Playing) return;
    if (options.paused) return;
    if (flowType !== 'idle') return;
    if (gs.isGameOver) return;
    if (state.aiConfig && gs.activePlayerIndex === state.aiConfig.playerIndex) return;

    const phaseStatus = getPhaseUxStatus(gs);
    if (!phaseStatus.canAutoAdvance) return;

    const valid = new Set(getValidCommands(gs));
    if (!valid.has('endSubPhase')) return;

    if (lastDispatchedPhaseKeyRef.current === phaseKey) return;
    lastDispatchedPhaseKeyRef.current = phaseKey;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const next = getNextPhaseState(gs.currentPhase, gs.currentSubPhase);
    const currentPhaseKey = phaseKey;
    timerRef.current = setTimeout(() => {
      if (latestPhaseKeyRef.current !== currentPhaseKey) return;

      dispatch({
        type: 'ADD_COMBAT_LOG_ENTRY',
        entry: {
          id: nextAutoAdvanceLogId(),
          timestamp: Date.now(),
          battleTurn: gs.currentBattleTurn,
          phase: gs.currentPhase,
          subPhase: gs.currentSubPhase,
          activePlayerIndex: gs.activePlayerIndex,
          category: 'system',
          message: next
            ? `Auto-advance: ${gs.currentSubPhase} -> ${next.subPhase}`
            : `Auto-advance: ${gs.currentSubPhase} -> Next player turn`,
          diceRolls: [],
          isImportant: false,
        },
      });
      dispatch({ type: 'END_SUB_PHASE' });
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [
    delayMs,
    dispatch,
    flowType,
    gs,
    options.paused,
    phaseKey,
    state.aiConfig,
    state.uiPhase,
  ]);
}
