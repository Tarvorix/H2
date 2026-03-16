/**
 * DiceDisplay
 *
 * Animated overlay showing recent dice roll results.
 * Displays d6 faces with pass/fail coloring.
 * Appears briefly over the battlefield when rolls happen, then fades.
 */
import type { DiceAnimationState } from '../types';
interface DiceDisplayProps {
    animation: DiceAnimationState;
    onDismiss: () => void;
}
export declare function DiceDisplay({ animation, onDismiss }: DiceDisplayProps): import("react/jsx-runtime").JSX.Element | null;
/**
 * Compact inline dice display for use in panels (combat log, etc.)
 */
export declare function InlineDiceRoll({ values, passedIndices, failedIndices }: {
    values: number[];
    passedIndices: number[];
    failedIndices: number[];
}): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DiceDisplay.d.ts.map