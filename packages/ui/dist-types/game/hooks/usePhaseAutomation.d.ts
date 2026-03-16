import type { GameUIAction, GameUIState } from '../types';
interface UsePhaseAutomationOptions {
    paused: boolean;
    autoAdvanceDelayMs?: number;
}
/**
 * Auto-advances sub-phases when no tactical decisions are pending.
 * The hook is intentionally conservative and will never auto-advance while:
 * - not in Playing UI phase
 * - a UI flow is in progress
 * - a reaction is pending
 * - automation is paused
 */
export declare function usePhaseAutomation(state: GameUIState, dispatch: React.Dispatch<GameUIAction>, options: UsePhaseAutomationOptions): void;
export {};
//# sourceMappingURL=usePhaseAutomation.d.ts.map