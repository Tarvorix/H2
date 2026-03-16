/**
 * ActionBar Panel
 *
 * Context-sensitive action buttons based on current phase/sub-phase and selected unit.
 * Shows available actions with disabled states and tooltips explaining why actions
 * aren't available.
 */
import type { GameUIState, GameUIAction } from '../types';
interface ActionBarProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    phaseAutomationPaused: boolean;
    onTogglePhaseAutomation: () => void;
}
export declare function ActionBar({ state, dispatch, phaseAutomationPaused, onTogglePhaseAutomation, }: ActionBarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ActionBar.d.ts.map