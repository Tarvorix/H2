/**
 * OverlayControls
 * Checkboxes to toggle each overlay layer on/off.
 */
import type { OverlayVisibility, DebugVisualizerAction } from '../state/types';
interface OverlayControlsProps {
    visibility: OverlayVisibility;
    dispatch: React.Dispatch<DebugVisualizerAction>;
}
export declare function OverlayControls({ visibility, dispatch }: OverlayControlsProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=OverlayControls.d.ts.map