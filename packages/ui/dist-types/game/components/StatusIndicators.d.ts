/**
 * StatusIndicators
 *
 * Visual status indicators rendered on or near models to show current tactical statuses.
 * Used in the game sidebar and as canvas overlay information.
 *
 * Status colors:
 * - Pinned: yellow
 * - Suppressed: orange
 * - Stunned: red
 * - Routed: white
 * - Locked in Combat: purple
 * - In Reserves: grey
 */
import { TacticalStatus } from '@hh/types';
interface StatusBadgeProps {
    status: TacticalStatus;
}
/**
 * A single status badge showing the tactical status name.
 */
export declare function StatusBadge({ status }: StatusBadgeProps): import("react/jsx-runtime").JSX.Element | null;
/**
 * A row of status badges for all statuses on a unit.
 */
export declare function StatusBadgeRow({ statuses }: {
    statuses: TacticalStatus[];
}): import("react/jsx-runtime").JSX.Element | null;
/**
 * Combat lock indicator.
 */
export declare function CombatLockBadge(): import("react/jsx-runtime").JSX.Element;
/**
 * Reserves indicator.
 */
export declare function ReservesBadge(): import("react/jsx-runtime").JSX.Element;
/**
 * Movement state indicator for the unit card.
 */
export declare function MovementStateBadge({ movementState }: {
    movementState: string;
}): import("react/jsx-runtime").JSX.Element;
/**
 * Wound tracker for individual models.
 */
export declare function WoundTracker({ current, max }: {
    current: number;
    max: number;
}): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=StatusIndicators.d.ts.map