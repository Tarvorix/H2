/**
 * GameSession — Root component for Game Mode
 *
 * Wires together the game reducer, battlefield canvas, sidebar panels,
 * flow overlays, and modals. This replaces the debug visualizer's App
 * component when in game mode.
 */
interface GameSessionProps {
    onReturnToMenu: () => void;
}
export declare function GameSession({ onReturnToMenu }: GameSessionProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=GameSession.d.ts.map