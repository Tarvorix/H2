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
import type { GameUIState, GameUIAction } from '../types';
/**
 * Hook that automatically deploys AI units during the Deployment phase.
 *
 * @param state - Current UI state
 * @param dispatch - UI action dispatcher
 */
export declare function useAIDeployment(state: GameUIState, dispatch: React.Dispatch<GameUIAction>): void;
//# sourceMappingURL=useAIDeployment.d.ts.map