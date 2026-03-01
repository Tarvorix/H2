/**
 * useAIDeployment Hook
 *
 * React hook that drives the AI opponent during the Deployment phase.
 * When it's the AI player's turn to deploy, this hook automatically
 * generates deployment placements and dispatches the corresponding
 * UI actions (SELECT_ROSTER_UNIT + PLACE_DEPLOYMENT_MODEL + CONFIRM_UNIT_PLACEMENT).
 *
 * When all AI units are deployed, dispatches CONFIRM_DEPLOYMENT.
 */

import { useEffect, useRef, useCallback } from 'react';
import { generateDeploymentCommand } from '@hh/ai';
import type { GameUIState, GameUIAction } from '../types';
import { GameUIPhase } from '../types';

/**
 * Hook that automatically deploys AI units during the Deployment phase.
 *
 * @param state - Current UI state
 * @param dispatch - UI action dispatcher
 */
export function useAIDeployment(
  state: GameUIState,
  dispatch: React.Dispatch<GameUIAction>,
): void {
  const isProcessingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processDeployment = useCallback(() => {
    if (!state.aiConfig || !state.gameState) return;
    if (state.uiPhase !== GameUIPhase.Deployment) return;
    if (isProcessingRef.current) return;

    const config = state.aiConfig;
    const { deployment } = state;

    // Only act when it's the AI player's turn to deploy
    if (deployment.deployingPlayerIndex !== config.playerIndex) return;

    // Check if this player has already confirmed deployment
    const isConfirmed = config.playerIndex === 0
      ? deployment.player1Confirmed
      : deployment.player2Confirmed;
    if (isConfirmed) return;

    isProcessingRef.current = true;

    // Signal AI is thinking
    dispatch({ type: 'AI_TURN_START' });

    const result = generateDeploymentCommand(
      state.gameState,
      config,
      deployment.deployedUnitIds,
      deployment.deploymentZoneDepth,
    );

    if (result === null) {
      // All units deployed — confirm deployment
      const delay = config.commandDelayMs;
      if (delay > 0) {
        timerRef.current = setTimeout(() => {
          dispatch({ type: 'CONFIRM_DEPLOYMENT' });
          dispatch({ type: 'AI_TURN_END' });
          isProcessingRef.current = false;
        }, delay);
      } else {
        dispatch({ type: 'CONFIRM_DEPLOYMENT' });
        dispatch({ type: 'AI_TURN_END' });
        isProcessingRef.current = false;
      }
      return;
    }

    // Deploy the unit: select → place each model → confirm
    const delay = config.commandDelayMs;
    const deployUnit = () => {
      // Select the unit from the roster
      dispatch({ type: 'SELECT_ROSTER_UNIT', unitId: result.unitId });

      // Place each model
      for (const mp of result.modelPositions) {
        dispatch({
          type: 'PLACE_DEPLOYMENT_MODEL',
          modelId: mp.modelId,
          position: mp.position,
        });
      }

      // Confirm the placement
      dispatch({ type: 'CONFIRM_UNIT_PLACEMENT' });
      dispatch({ type: 'AI_TURN_END' });
      isProcessingRef.current = false;
    };

    if (delay > 0) {
      timerRef.current = setTimeout(deployUnit, delay);
    } else {
      deployUnit();
    }
  }, [state.aiConfig, state.gameState, state.uiPhase, state.deployment, dispatch]);

  // Trigger deployment processing when state changes
  useEffect(() => {
    if (!state.aiConfig || !state.gameState) return;
    if (state.uiPhase !== GameUIPhase.Deployment) return;

    const frameTimer = setTimeout(processDeployment, 50);
    return () => clearTimeout(frameTimer);
  }, [state.deployment, state.aiConfig, state.gameState, state.uiPhase, processDeployment]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
