/**
 * ShootingFlow
 *
 * Multi-step shooting flow panel. Guides the player through:
 * 1. Select target unit (attacker already selected)
 * 2. Assign weapons per model
 * 3. Confirm and resolve the shooting attack
 * 4. View results and resolve casualties/morale
 */
import type { GameUIState, GameUIAction } from '../types';
interface ShootingFlowProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
}
export declare function ShootingFlow({ state, dispatch }: ShootingFlowProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=ShootingFlow.d.ts.map