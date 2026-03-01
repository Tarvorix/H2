/**
 * Points Calculation Module.
 * Handles all points arithmetic for army building.
 *
 * Reference: HH_Battle_AOD.md — "Points Values", "Lord of War Cap", "Allied Points Cap"
 */

import type { UnitProfile, ArmyListUnit, ArmyListDetachment } from '@hh/types';
import { BattlefieldRole, DetachmentType } from '@hh/types';

// ─── Unit Points Calculation ─────────────────────────────────────────────────

/**
 * Calculate the total points cost for a unit based on model count and selected options.
 *
 * Formula: basePoints + (additionalModels * pointsPerAdditionalModel) + sum(wargear costs)
 *
 * @param profile - The unit profile from the data module
 * @param modelCount - Number of models in the unit
 * @param selectedOptions - Array of { optionIndex, count } for wargear selections
 * @returns Total points cost for this unit
 */
export function calculateUnitPoints(
  profile: UnitProfile,
  modelCount: number,
  selectedOptions: { optionIndex: number; count: number }[] = [],
): number {
  // Base points include the minimum model count
  let total = profile.basePoints;

  // Additional models beyond the base
  const additionalModels = Math.max(0, modelCount - profile.minModels);
  total += additionalModels * profile.pointsPerAdditionalModel;

  // Wargear option costs
  for (const selection of selectedOptions) {
    const option = profile.wargearOptions[selection.optionIndex];
    if (option) {
      total += option.pointsCost * selection.count;
    }
  }

  return total;
}

/**
 * Calculate the total points for all units in an army.
 *
 * @param units - All army list units across all detachments
 * @returns Sum of all unit points
 */
export function calculateArmyTotalPoints(units: ArmyListUnit[]): number {
  return units.reduce((sum, unit) => sum + unit.totalPoints, 0);
}

/**
 * Check if the army's total points exceeds the points limit.
 *
 * @param totalPoints - The army's total points
 * @param pointsLimit - The agreed points limit for the battle
 * @returns true if over the limit
 */
export function isOverPointsLimit(totalPoints: number, pointsLimit: number): boolean {
  return totalPoints > pointsLimit;
}

// ─── Lord of War / Warlord Cap ───────────────────────────────────────────────

/**
 * Calculate the Lord of War / Warlord role points cap (25% of points limit, rounded up).
 *
 * Reference: HH_Battle_AOD.md — "Lord of War Cap: ≤25% of the army's total points limit"
 *
 * @param pointsLimit - The army's agreed points limit
 * @returns Maximum points allowed for Lord of War + Warlord role units
 */
export function calculateLordOfWarCap(pointsLimit: number): number {
  return Math.ceil(pointsLimit * 0.25);
}

/**
 * Get the total points spent on Lord of War and Warlord battlefield role units.
 *
 * @param units - All army list units
 * @returns Sum of points for units in Lord of War or Warlord roles
 */
export function getLordOfWarAndWarlordPoints(units: ArmyListUnit[]): number {
  return units
    .filter(
      (u) =>
        u.battlefieldRole === BattlefieldRole.LordOfWar ||
        u.battlefieldRole === BattlefieldRole.Warlord,
    )
    .reduce((sum, unit) => sum + unit.totalPoints, 0);
}

/**
 * Check if Lord of War + Warlord role units exceed the 25% cap.
 *
 * @param units - All army list units
 * @param pointsLimit - The army's agreed points limit
 * @returns true if over the cap
 */
export function isOverLordOfWarCap(units: ArmyListUnit[], pointsLimit: number): boolean {
  const cap = calculateLordOfWarCap(pointsLimit);
  const spent = getLordOfWarAndWarlordPoints(units);
  return spent > cap;
}

// ─── Allied Points Cap ───────────────────────────────────────────────────────

/**
 * Calculate the Allied detachment points cap (50% of points limit, rounded up).
 *
 * Reference: HH_Battle_AOD.md — "Allied: ≤50% of the army's total points limit"
 *
 * @param pointsLimit - The army's agreed points limit
 * @returns Maximum points allowed for allied units
 */
export function getAlliedPointsCap(pointsLimit: number): number {
  return Math.ceil(pointsLimit * 0.50);
}

/**
 * Get the total points of all units in Allied detachments.
 *
 * @param detachments - All army list detachments
 * @returns Sum of points for units in Allied detachments
 */
export function getAlliedPoints(detachments: ArmyListDetachment[]): number {
  return detachments
    .filter((d) => d.type === DetachmentType.Allied)
    .flatMap((d) => d.units)
    .reduce((sum, unit) => sum + unit.totalPoints, 0);
}

/**
 * Check if Allied detachment units exceed the 50% cap.
 *
 * @param detachments - All army list detachments
 * @param pointsLimit - The army's agreed points limit
 * @returns true if over the cap
 */
export function isOverAlliedCap(
  detachments: ArmyListDetachment[],
  pointsLimit: number,
): boolean {
  const cap = getAlliedPointsCap(pointsLimit);
  const spent = getAlliedPoints(detachments);
  return spent > cap;
}
