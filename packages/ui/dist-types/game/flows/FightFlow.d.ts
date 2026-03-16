/**
 * FightFlow
 *
 * Handles the Fight sub-phase of assault: initiative steps, melee resolution,
 * combat resolution, and aftermath selection.
 */
import type { GameUIState, GameUIAction } from '../types';
interface FightFlowProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function FightFlow({ state, dispatch }: FightFlowProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=FightFlow.d.ts.map