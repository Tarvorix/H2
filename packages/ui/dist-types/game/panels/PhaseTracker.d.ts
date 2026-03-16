/**
 * PhaseTracker Panel
 *
 * Displays the current game state in the toolbar:
 * - Battle Turn X/4
 * - Active Player name
 * - Current Phase + Sub-Phase
 * - Reaction Allotment remaining
 * - Visual phase progression bar
 */
import type { GameState } from '@hh/types';
interface PhaseTrackerProps {
    gameState: GameState;
}
export declare function PhaseTracker({ gameState }: PhaseTrackerProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=PhaseTracker.d.ts.map