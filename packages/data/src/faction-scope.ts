/**
 * Faction scope helpers.
 *
 * Expansion-safe helpers for listing available factions in army building
 * and validating that a runtime faction value is playable.
 */

import { LegionFaction, SpecialFaction } from '@hh/types';
import type { ArmyFaction } from '@hh/types';

const CURATED_LEGIONS: LegionFaction[] = [
  LegionFaction.DarkAngels,
  LegionFaction.WorldEaters,
  LegionFaction.AlphaLegion,
];
const ALL_LEGIONS: LegionFaction[] = Object.values(LegionFaction);
const SPECIAL_FACTIONS: SpecialFaction[] = Object.values(SpecialFaction);

/**
 * Return all Legiones Astartes factions.
 */
export function getAllLegions(): LegionFaction[] {
  return [...ALL_LEGIONS];
}

/**
 * Return currently curated Legiones Astartes factions for top-level faction selection.
 */
export function getCuratedLegions(): LegionFaction[] {
  return [...CURATED_LEGIONS];
}

/**
 * Return all currently playable factions.
 * Includes all legions plus any special factions.
 */
export function getPlayableFactions(): ArmyFaction[] {
  return [...CURATED_LEGIONS, ...SPECIAL_FACTIONS];
}

/**
 * Runtime guard for playable army factions.
 */
export function isPlayableFaction(value: unknown): value is ArmyFaction {
  if (typeof value !== 'string') return false;
  return getPlayableFactions().includes(value as ArmyFaction);
}
