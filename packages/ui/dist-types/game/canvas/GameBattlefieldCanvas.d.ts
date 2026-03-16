/**
 * GameBattlefieldCanvas
 *
 * Bridge component that adapts GameUIState → DebugVisualizerState
 * and DebugVisualizerAction → GameUIAction so the existing
 * BattlefieldCanvas + renderer pipeline works for game mode.
 *
 * Also integrates game-specific overlays (status rings, wound markers,
 * objective markers, active unit glow, destroyed model markers) via
 * a custom render callback injected into the renderer pipeline.
 */
import type { GameUIState, GameUIAction } from '../types';
import type { RendererAssetMode } from '../../canvas/assets';
interface GameBattlefieldCanvasProps {
    state: GameUIState;
    dispatch: React.Dispatch<GameUIAction>;
    rendererMode?: RendererAssetMode;
}
export declare function GameBattlefieldCanvas({ state, dispatch, rendererMode, }: GameBattlefieldCanvasProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=GameBattlefieldCanvas.d.ts.map