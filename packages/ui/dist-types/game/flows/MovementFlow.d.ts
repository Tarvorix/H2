/**
 * MovementFlow
 *
 * UI panel displayed during the Movement Phase when a player is moving a unit.
 * Shows the movement flow steps: select destination → confirm move.
 * Integrates with the movement envelope overlay for valid destination display.
 */
import type { GameUIState, GameUIAction } from '../types';
interface MovementFlowProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function MovementFlow({ state, dispatch }: MovementFlowProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=MovementFlow.d.ts.map