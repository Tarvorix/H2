/**
 * InfoPanel
 * Right sidebar showing selected model stats, LOS result,
 * coherency status, distance, blast hits, and movement info.
 */
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
interface InfoPanelProps {
    state: DebugVisualizerState;
    dispatch: React.Dispatch<DebugVisualizerAction>;
}
export declare function InfoPanel({ state, dispatch }: InfoPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=InfoPanel.d.ts.map