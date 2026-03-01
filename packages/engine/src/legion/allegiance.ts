/**
 * Allegiance System
 *
 * Validates allegiance constraints for army building and rite of war selection.
 * In the Horus Heresy, each legion has a canonical allegiance (Loyalist or Traitor),
 * but any legion CAN play as either side. Hereticus rites require Traitor allegiance.
 *
 * Loyalist legions: I (DA), V (WS), VI (SW), VII (IF), IX (BA), X (IH), XIII (UM), XVIII (Sal), XIX (RG)
 * Traitor legions: III (EC), IV (IW), VIII (NL), XII (WE), XIV (DG), XV (TS), XVI (SoH), XVII (WB), XX (AL)
 *
 * Reference: HH_Core.md — "Allegiance"
 * Reference: HH_Legiones_Astartes.md — per-legion allegiance defaults
 */

import { LegionFaction, Allegiance } from '@hh/types';
import type { ArmyList, ArmyValidationError } from '@hh/types';
import { isHereticusRite, getRiteOfWar } from './rite-of-war-registry';

// ─── Default Allegiance Mapping ──────────────────────────────────────────────

/**
 * Canonical (historical) allegiance for each legion.
 * This is the default; any legion CAN play as either side in the game.
 */
const DEFAULT_ALLEGIANCE: Record<LegionFaction, Allegiance> = {
  [LegionFaction.DarkAngels]: Allegiance.Loyalist,
  [LegionFaction.EmperorsChildren]: Allegiance.Traitor,
  [LegionFaction.IronWarriors]: Allegiance.Traitor,
  [LegionFaction.WhiteScars]: Allegiance.Loyalist,
  [LegionFaction.SpaceWolves]: Allegiance.Loyalist,
  [LegionFaction.ImperialFists]: Allegiance.Loyalist,
  [LegionFaction.NightLords]: Allegiance.Traitor,
  [LegionFaction.BloodAngels]: Allegiance.Loyalist,
  [LegionFaction.IronHands]: Allegiance.Loyalist,
  [LegionFaction.WorldEaters]: Allegiance.Traitor,
  [LegionFaction.Ultramarines]: Allegiance.Loyalist,
  [LegionFaction.DeathGuard]: Allegiance.Traitor,
  [LegionFaction.ThousandSons]: Allegiance.Traitor,
  [LegionFaction.SonsOfHorus]: Allegiance.Traitor,
  [LegionFaction.WordBearers]: Allegiance.Traitor,
  [LegionFaction.Salamanders]: Allegiance.Loyalist,
  [LegionFaction.RavenGuard]: Allegiance.Loyalist,
  [LegionFaction.AlphaLegion]: Allegiance.Traitor,
};

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Get the default (canonical/historical) allegiance for a legion.
 * Returns Loyalist or Traitor based on the Heresy lore.
 */
export function getDefaultAllegiance(legion: LegionFaction): Allegiance {
  return DEFAULT_ALLEGIANCE[legion] ?? Allegiance.Loyalist;
}

/**
 * Check if a legion is canonically Loyalist.
 */
export function isCanonicallyLoyalist(legion: LegionFaction): boolean {
  return DEFAULT_ALLEGIANCE[legion] === Allegiance.Loyalist;
}

/**
 * Check if a legion is canonically Traitor.
 */
export function isCanonicallyTraitor(legion: LegionFaction): boolean {
  return DEFAULT_ALLEGIANCE[legion] === Allegiance.Traitor;
}

/**
 * Get all legions with a specific canonical allegiance.
 */
export function getLegionsForAllegiance(allegiance: Allegiance): LegionFaction[] {
  return Object.entries(DEFAULT_ALLEGIANCE)
    .filter(([_, a]) => a === allegiance)
    .map(([legion]) => legion as LegionFaction);
}

/**
 * Get all Loyalist legions.
 */
export function getLoyalistLegions(): LegionFaction[] {
  return getLegionsForAllegiance(Allegiance.Loyalist);
}

/**
 * Get all Traitor legions.
 */
export function getTraitorLegions(): LegionFaction[] {
  return getLegionsForAllegiance(Allegiance.Traitor);
}

// ─── Rite Availability ───────────────────────────────────────────────────────

/**
 * Check if a Rite of War is available for a given allegiance.
 * Hereticus rites require Traitor allegiance; standard rites are available to any.
 */
export function isRiteAvailableForAllegiance(riteId: string, allegiance: Allegiance): boolean {
  // Hereticus rites require Traitor
  if (isHereticusRite(riteId) && allegiance !== Allegiance.Traitor) {
    return false;
  }

  // Check if the rite has a specific required allegiance
  const rite = getRiteOfWar(riteId);
  if (rite?.requiredAllegiance && rite.requiredAllegiance !== allegiance) {
    return false;
  }

  return true;
}

// ─── Army Validation ─────────────────────────────────────────────────────────

/**
 * Validate the allegiance configuration of an army list.
 * Returns an array of validation errors (empty array = valid).
 *
 * Checks:
 * 1. Allegiance is valid (Loyalist or Traitor)
 * 2. If a Rite of War is selected, allegiance compatibility is checked
 * 3. Hereticus rites require Traitor allegiance
 */
export function validateAllegiance(armyList: ArmyList): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  // 1. Validate allegiance enum
  if (armyList.allegiance !== Allegiance.Loyalist && armyList.allegiance !== Allegiance.Traitor) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Invalid allegiance: "${armyList.allegiance}". Must be Loyalist or Traitor.`,
    });
    return errors;
  }

  // 2. If a rite is selected, check allegiance compatibility
  if (armyList.riteOfWar) {
    if (!isRiteAvailableForAllegiance(armyList.riteOfWar, armyList.allegiance)) {
      const rite = getRiteOfWar(armyList.riteOfWar);
      const riteName = rite?.name ?? armyList.riteOfWar;
      errors.push({
        severity: 'error',
        scope: 'army',
        message: `Rite of War "${riteName}" requires Traitor allegiance, but army is ${armyList.allegiance}.`,
      });
    }
  }

  return errors;
}

/**
 * Check if a given faction + allegiance combo with optional rite is fully valid.
 * Returns true if valid, false if not.
 */
export function isAllegianceValid(
  _faction: LegionFaction,
  allegiance: Allegiance,
  riteId?: string,
): boolean {
  // Any legion can play as either allegiance
  if (allegiance !== Allegiance.Loyalist && allegiance !== Allegiance.Traitor) {
    return false;
  }

  // If a rite is specified, check it's available for this allegiance
  if (riteId) {
    return isRiteAvailableForAllegiance(riteId, allegiance);
  }

  return true;
}
