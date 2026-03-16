/**
 * BattlefieldCanvas
 * React component wrapping the HTML5 <canvas>.
 * Handles: requestAnimationFrame render loop, mouse events,
 * resize / HiDPI, and dispatches actions to the reducer.
 */
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
import type { RenderFrameOptions } from './renderer';
interface BattlefieldCanvasProps {
    state: DebugVisualizerState;
    dispatch: React.Dispatch<DebugVisualizerAction>;
    renderOptions?: RenderFrameOptions;
}
export declare function BattlefieldCanvas({ state, dispatch, renderOptions }: BattlefieldCanvasProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BattlefieldCanvas.d.ts.map