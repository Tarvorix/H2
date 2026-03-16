/**
 * Toolbar
 * Top bar with mode selectors, scenario dropdown, blast size, movement distance.
 */
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
interface ToolbarProps {
    state: DebugVisualizerState;
    dispatch: React.Dispatch<DebugVisualizerAction>;
    onReturnToMenu?: () => void;
}
export declare function Toolbar({ state, dispatch, onReturnToMenu }: ToolbarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Toolbar.d.ts.map