/**
 * ChargeFlow
 *
 * Handles the charge declaration and resolution steps of the assault flow.
 * Select target → confirm charge → volley attacks → charge roll → charge move.
 */
import type { GameUIState, GameUIAction } from '../types';
interface ChargeFlowProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function ChargeFlow({ state, dispatch }: ChargeFlowProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=ChargeFlow.d.ts.map