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
  AIStrategyTier,
  shouldAIAct,
  generateNextCommand,
  createTurnContext,
  getTurnContextDiagnostics,
  getTurnContextError,
} from '@hh/ai';
import type { AITurnContext } from '@hh/ai';
import type { GameUIState, GameUIAction } from '../types';
import { GameUIPhase } from '../types';
import type { EngineAIWorkerRequest, EngineAIWorkerResponse } from './engine-ai-worker.types';
import type { AlphaAIWorkerRequest, AlphaAIWorkerResponse } from './alpha-ai-worker.types';

type AIWorkerKind = 'engine' | 'alpha';
type AnyAIWorkerRequest = EngineAIWorkerRequest | AlphaAIWorkerRequest;
type AnyAIWorkerResponse = EngineAIWorkerResponse | AlphaAIWorkerResponse;

function buildFallbackCommand(
  gameState: NonNullable<GameUIState['gameState']>,
): import('@hh/types').GameCommand | null {
  if (gameState.awaitingReaction) {
    const pending = gameState.pendingReaction;
    const reactivePlayerIndex = gameState.activePlayerIndex === 0 ? 1 : 0;
    const reactiveArmy = gameState.armies[reactivePlayerIndex];

    if (
      pending &&
      pending.eligibleUnitIds.length > 0 &&
      reactiveArmy.reactionAllotmentRemaining > 0
    ) {
      return {
        type: 'selectReaction',
        unitId: pending.eligibleUnitIds[0],
        reactionType: String(pending.reactionType),
      };
    }

    return { type: 'declineReaction' };
  }

  const valid = new Set(getValidCommands(gameState));
  if (valid.has('endSubPhase')) return { type: 'endSubPhase' };
  if (valid.has('endPhase')) return { type: 'endPhase' };
  return null;
}

function buildAiStateKey(
  gameState: NonNullable<GameUIState['gameState']>,
): string {
  return [
    gameState.currentBattleTurn,
    gameState.activePlayerIndex,
    gameState.currentPhase,
    gameState.currentSubPhase,
    gameState.awaitingReaction ? 'reaction' : 'normal',
  ].join(':');
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
  const latestStateKeyRef = useRef('');
  const latestStateRef = useRef(state);
  const engineWorkerRef = useRef<Worker | null>(null);
  const alphaWorkerRef = useRef<Worker | null>(null);
  const workerRequestIdRef = useRef(0);
  const workerUnavailableRef = useRef<Record<AIWorkerKind, boolean>>({
    engine: false,
    alpha: false,
  });
  const aiStateKey = state.gameState ? buildAiStateKey(state.gameState) : '';

  useEffect(() => {
    latestStateKeyRef.current = aiStateKey;
  }, [aiStateKey]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const setDiagnostics = useCallback((diagnostics: import('@hh/ai').AIDiagnostics | null) => {
    dispatch({ type: 'SET_AI_DIAGNOSTICS', diagnostics });
  }, [dispatch]);

  const setAIError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_AI_ERROR', error });
    if (error) {
      dispatch({
        type: 'ADD_NOTIFICATION',
        notification: {
          message: `AI error: ${error}`,
          type: 'error',
          duration: 10_000,
        },
      });
    }
  }, [dispatch]);

  const ensureWorker = useCallback((kind: AIWorkerKind): Worker | null => {
    const currentRef = kind === 'engine' ? engineWorkerRef : alphaWorkerRef;
    if (workerUnavailableRef.current[kind]) return null;
    if (currentRef.current) return currentRef.current;
    if (typeof Worker === 'undefined') {
      workerUnavailableRef.current[kind] = true;
      return null;
    }

    try {
      currentRef.current = new Worker(
        new URL(kind === 'engine' ? './engine-ai.worker.ts' : './alpha-ai.worker.ts', import.meta.url),
        { type: 'module' },
      );
      return currentRef.current;
    } catch {
      workerUnavailableRef.current[kind] = true;
      return null;
    }
  }, []);

  const dispatchResolvedCommand = useCallback((command: import('@hh/types').GameCommand | null, scheduledStateKey: string) => {
    if (command === null) {
      isProcessingRef.current = false;
      dispatch({ type: 'AI_TURN_END' });
      return;
    }

    const latestState = latestStateRef.current;
    const config = latestState.aiConfig;
    if (!config) {
      isProcessingRef.current = false;
      dispatch({ type: 'AI_TURN_END' });
      return;
    }

    const delay = config.commandDelayMs;
    if (delay > 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (latestStateKeyRef.current !== scheduledStateKey) {
          isProcessingRef.current = false;
          return;
        }
        dispatch({ type: 'DISPATCH_ENGINE_COMMAND', command });
        isProcessingRef.current = false;
      }, delay);
      return;
    }

    if (latestStateKeyRef.current !== scheduledStateKey) {
      isProcessingRef.current = false;
      return;
    }

    dispatch({ type: 'DISPATCH_ENGINE_COMMAND', command });
    isProcessingRef.current = false;
  }, [dispatch]);

  const handleWorkerResponse = useCallback((response: AnyAIWorkerResponse) => {
    if (response.requestId !== workerRequestIdRef.current) {
      return;
    }

    contextRef.current = response.context;
    setDiagnostics(response.diagnostics);

    if (response.error) {
      setAIError(response.error);
      isProcessingRef.current = false;
      dispatch({ type: 'AI_TURN_END' });
      return;
    }

    setAIError(null);
    if (latestStateKeyRef.current !== response.stateKey) {
      isProcessingRef.current = false;
      return;
    }

    const latestState = latestStateRef.current;
    const command = response.command ?? (
      latestState.gameState ? buildFallbackCommand(latestState.gameState) : null
    );
    dispatchResolvedCommand(command, response.stateKey);
  }, [dispatch, dispatchResolvedCommand, setAIError, setDiagnostics]);

  useEffect(() => {
    const worker = ensureWorker('engine');
    if (!worker) return;

    const onMessage = (event: MessageEvent<EngineAIWorkerResponse>) => {
      handleWorkerResponse(event.data);
    };
    worker.addEventListener('message', onMessage);
    return () => {
      worker.removeEventListener('message', onMessage);
    };
  }, [ensureWorker, handleWorkerResponse]);

  useEffect(() => {
    const worker = ensureWorker('alpha');
    if (!worker) return;

    const onMessage = (event: MessageEvent<AlphaAIWorkerResponse>) => {
      handleWorkerResponse(event.data);
    };
    worker.addEventListener('message', onMessage);
    return () => {
      worker.removeEventListener('message', onMessage);
    };
  }, [ensureWorker, handleWorkerResponse]);

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
    const scheduledStateKey = buildAiStateKey(state.gameState);

    const workerKind = config.strategyTier === AIStrategyTier.Engine
      ? 'engine'
      : config.strategyTier === AIStrategyTier.Alpha
        ? 'alpha'
        : null;

    if (workerKind) {
      const worker = ensureWorker(workerKind);
      if (worker) {
        const request: AnyAIWorkerRequest = {
          requestId: ++workerRequestIdRef.current,
          stateKey: scheduledStateKey,
          state: state.gameState,
          config,
          context: contextRef.current,
        };
        worker.postMessage(request);
        return;
      }
    }

    let command: import('@hh/types').GameCommand | null = null;
    try {
      command = generateNextCommand(state.gameState, config, contextRef.current);
      setDiagnostics(getTurnContextDiagnostics(contextRef.current));
      setAIError(getTurnContextError(contextRef.current));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDiagnostics(getTurnContextDiagnostics(contextRef.current));
      setAIError(message);
      isProcessingRef.current = false;
      dispatch({ type: 'AI_TURN_END' });
      return;
    }

    const resolvedCommand = command ?? buildFallbackCommand(state.gameState);
    dispatchResolvedCommand(resolvedCommand, scheduledStateKey);
  }, [
    state.aiConfig,
    state.gameState,
    state.uiPhase,
    state.aiThinking,
    state.lastCommandResult,
    dispatch,
    dispatchResolvedCommand,
    ensureWorker,
    setAIError,
    setDiagnostics,
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
      engineWorkerRef.current?.terminate();
      engineWorkerRef.current = null;
      alphaWorkerRef.current?.terminate();
      alphaWorkerRef.current = null;
    };
  }, []);
}
