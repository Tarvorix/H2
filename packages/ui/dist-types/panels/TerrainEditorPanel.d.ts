/**
 * TerrainEditorPanel
 * Terrain type/shape selector, terrain list, and remove button.
 * Visible when mode is 'terrainEdit'.
 */
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
interface TerrainEditorPanelProps {
    state: DebugVisualizerState;
    dispatch: React.Dispatch<DebugVisualizerAction>;
}
export declare function TerrainEditorPanel({ state, dispatch }: TerrainEditorPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=TerrainEditorPanel.d.ts.map