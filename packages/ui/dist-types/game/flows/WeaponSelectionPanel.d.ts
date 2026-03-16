/**
 * WeaponSelectionPanel
 *
 * Per-model weapon assignment during the shooting flow.
 * Shows each alive model in the attacking unit with their available weapons.
 * The player selects which weapon each model will fire.
 */
import type { AttackTargetRef } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';
interface WeaponSelectionPanelProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    attackerUnitId: string;
    target: AttackTargetRef;
}
export declare function WeaponSelectionPanel({ state, dispatch, attackerUnitId, target, }: WeaponSelectionPanelProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=WeaponSelectionPanel.d.ts.map