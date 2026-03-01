/**
 * useAITurn Hook
 *
 * React hook that drives the AI opponent during the Playing phase.
 * Detects when the AI should act, generates commands, and dispatches them.
 *
 * The hook runs a loop: state change → hook fires → AI generates command →
 * dispatch → state change → hook fires again. The loop terminates when
 * shouldAIAct() returns false or generateNextCommand() returns null.
 *
 * Uses setTimeout with commandDelayMs for visual pacing so the human player
 * can follow the AI's actions.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getValidCommands } from '@hh/engine';
import {
  shouldAIAct,
  generateNextCommand,
  createTurnContext,
} from '@hh/ai';
import type { AITurnContext } from '@hh/ai';
import type { GameUIState, GameUIAction } from '../types';
import { GameUIPhase } from '../types';

function buildFallbackCommand(
  gameState: NonNullable<GameUIState['gameState']>,
): import('@hh/types').GameCommand | null {
  if (gameState.awaitingReaction) {
    return { type: 'declineReaction' };
  }

  const valid = new Set(getValidCommands(gameState));
  if (valid.has('endSubPhase')) return { type: 'endSubPhase' };
  if (valid.has('endPhase')) return { type: 'endPhase' };
  return null;
}

/**
 * Hook that automatically executes AI turns when it's the AI player's turn.
 *
 * @param state - Current UI state
 * @param dispatch - UI action dispatcher
 */
export function useAITurn(
  state: GameUIState,
  dispatch: React.Dispatch<GameUIAction>,
): void {
  const contextRef = useRef<AITurnContext>(createTurnContext());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  const processAITurn = useCallback(() => {
    if (!state.aiConfig || !state.gameState) return;
    if (state.uiPhase !== GameUIPhase.Playing) return;
    if (isProcessingRef.current) return;

    const config = state.aiConfig;
    if (!shouldAIAct(state.gameState, config)) {
      if (state.aiThinking) {
        dispatch({ type: 'AI_TURN_END' });
      }
      return;
    }

    // Signal that AI is thinking
    if (!state.aiThinking) {
      dispatch({ type: 'AI_TURN_START' });
    }

    isProcessingRef.current = true;

    const shouldPreferFallback =
      state.lastCommandResult !== null &&
      !state.lastCommandResult.accepted;

    const command = shouldPreferFallback
      ? buildFallbackCommand(state.gameState) ??
        generateNextCommand(state.gameState, config, contextRef.current)
      : generateNextCommand(state.gameState, config, contextRef.current) ??
        buildFallbackCommand(state.gameState);

    if (command === null) {
      isProcessingRef.current = false;
      dispatch({ type: 'AI_TURN_END' });
      return;
    }

    // Dispatch with delay for visual pacing
    const delay = config.commandDelayMs;
    if (delay > 0) {
      timerRef.current = setTimeout(() => {
        dispatch({ type: 'DISPATCH_ENGINE_COMMAND', command });
        isProcessingRef.current = false;
      }, delay);
    } else {
      dispatch({ type: 'DISPATCH_ENGINE_COMMAND', command });
      isProcessingRef.current = false;
    }
  }, [
    state.aiConfig,
    state.gameState,
    state.uiPhase,
    state.aiThinking,
    state.lastCommandResult,
    dispatch,
  ]);

  // Run the AI turn loop whenever gameState changes
  useEffect(() => {
    if (!state.aiConfig || !state.gameState) return;
    if (state.uiPhase !== GameUIPhase.Playing) return;

    // Small delay to let React batch state updates
    const frameTimer = setTimeout(processAITurn, 16);

    return () => {
      clearTimeout(frameTimer);
    };
  }, [state.gameState, state.aiConfig, state.uiPhase, state.lastCommandResult, processAITurn]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
