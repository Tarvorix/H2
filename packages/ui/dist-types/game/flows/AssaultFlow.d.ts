/**
 * AssaultFlow
 *
 * Top-level assault flow panel. Orchestrates the full assault procedure:
 * charge declaration → volley attacks → overwatch → charge move →
 * challenge → fight → resolution → aftermath.
 */
import type { GameUIState, GameUIAction } from '../types';
interface AssaultFlowProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function AssaultFlow({ state, dispatch }: AssaultFlowProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=AssaultFlow.d.ts.map