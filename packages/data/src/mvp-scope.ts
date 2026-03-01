/**
 * MVP Scope Helpers
 *
 * Canonical HHv2 launch scope:
 * - World Eaters
 * - Alpha Legion
 * - Dark Angels
 */

import { LegionFaction } from '@hh/types';

export const MVP_LEGIONS = [
  LegionFaction.WorldEaters,
  LegionFaction.AlphaLegion,
  LegionFaction.DarkAngels,
] as const;

const MVP_LEGION_SET = new Set<LegionFaction>(MVP_LEGIONS);

/**
 * Return MVP legions as a regular array for UI iteration.
 */
export function getMvpLegions(): LegionFaction[] {
  return [...MVP_LEGIONS];
}

/**
 * Type guard for MVP legion scope.
 */
export function isMvpLegion(value: unknown): value is LegionFaction {
  if (typeof value !== 'string') return false;
  return MVP_LEGION_SET.has(value as LegionFaction);
}
