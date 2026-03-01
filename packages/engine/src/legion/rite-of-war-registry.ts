/**
 * Rite of War Registry
 *
 * Registers all 20 Rite of War definitions from @hh/data, provides lookup and
 * validation functions, and applies rite benefits to game state.
 *
 * Each Rite of War bundles:
 * - A Legion Tactica (passive army-wide rule)
 * - An Advanced Reaction (phase-interrupting ability)
 * - A Legion Gambit (challenge-specific ability)
 * - A Prime Advantage (upgrade for a unit filling a Prime Force Org Slot)
 * - Additional Detachments (Auxiliary/Apex detachments unique to the legion)
 * - Benefits and Restrictions (structured for army builder validation)
 *
 * Reference: HH_Legiones_Astartes.md — all legion "Rite of War" sections
 */

import { LegionFaction, Allegiance } from '@hh/types';
import type { RiteOfWarDefinition, ArmyList, ArmyValidationError } from '@hh/types';
import {
  RITES_OF_WAR,
} from '@hh/data';

// ─── Registry State ──────────────────────────────────────────────────────────

/**
 * Map of rite ID → RiteOfWarDefinition.
 */
const riteOfWarRegistry = new Map<string, RiteOfWarDefinition>();

/**
 * Map of legion faction → array of rite IDs.
 */
const ritesByFaction = new Map<string, string[]>();

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register a single Rite of War definition.
 */
export function registerRiteOfWar(def: RiteOfWarDefinition): void {
  riteOfWarRegistry.set(def.id, def);

  const factionKey = def.legion;
  const existing = ritesByFaction.get(factionKey) ?? [];
  if (!existing.includes(def.id)) {
    ritesByFaction.set(factionKey, [...existing, def.id]);
  }
}

/**
 * Register all 20 Rite of War definitions from @hh/data.
 * Called once during engine initialization.
 */
export function registerAllRitesOfWar(): void {
  for (const rite of RITES_OF_WAR) {
    registerRiteOfWar(rite);
  }
}

/**
 * Clear all registered rites of war (for testing).
 */
export function clearRiteOfWarRegistry(): void {
  riteOfWarRegistry.clear();
  ritesByFaction.clear();
}

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Get a Rite of War definition by its ID.
 * Returns undefined if not found.
 */
export function getRiteOfWar(riteId: string): RiteOfWarDefinition | undefined {
  return riteOfWarRegistry.get(riteId);
}

/**
 * Get a Rite of War definition by its display name.
 * Returns undefined if not found.
 */
export function getRiteOfWarByName(riteName: string): RiteOfWarDefinition | undefined {
  for (const rite of riteOfWarRegistry.values()) {
    if (rite.name === riteName) return rite;
  }
  return undefined;
}

/**
 * Get all Rite of War IDs available for a specific legion.
 * Includes both standard and Hereticus rites.
 */
export function getRitesForLegion(legion: LegionFaction): string[] {
  return ritesByFaction.get(legion) ?? [];
}

/**
 * Get all Rite of War definitions available for a specific legion.
 */
export function getRiteDefinitionsForLegion(legion: LegionFaction): RiteOfWarDefinition[] {
  const ids = getRitesForLegion(legion);
  return ids.map(id => riteOfWarRegistry.get(id)).filter((r): r is RiteOfWarDefinition => r !== undefined);
}

/**
 * Get all registered Rite of War IDs (for diagnostics/testing).
 */
export function getRegisteredRitesOfWar(): string[] {
  return Array.from(riteOfWarRegistry.keys());
}

/**
 * Check if a rite ID is registered.
 */
export function isRiteOfWarRegistered(riteId: string): boolean {
  return riteOfWarRegistry.has(riteId);
}

/**
 * Check if a rite requires a specific allegiance.
 * Returns the required allegiance or undefined if any allegiance is valid.
 */
export function getRiteRequiredAllegiance(riteId: string): Allegiance | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.requiredAllegiance;
}

/**
 * Check if a rite is a Hereticus rite.
 */
export function isHereticusRite(riteId: string): boolean {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.isHereticus ?? false;
}

/**
 * Get the tactica ID associated with a rite.
 */
export function getRiteTacticaId(riteId: string): string | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.tacticaId;
}

/**
 * Get the advanced reaction ID associated with a rite.
 */
export function getRiteAdvancedReactionId(riteId: string): string | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.advancedReactionId;
}

/**
 * Get the gambit ID associated with a rite.
 */
export function getRiteGambitId(riteId: string): string | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.gambitId;
}

/**
 * Get the prime advantage for a rite.
 */
export function getRitePrimeAdvantage(riteId: string): RiteOfWarDefinition['primeAdvantage'] | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.primeAdvantage;
}

/**
 * Get the additional detachments available from a rite.
 */
export function getRiteAdditionalDetachments(riteId: string): RiteOfWarDefinition['additionalDetachments'] {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.additionalDetachments ?? [];
}

/**
 * Get the minimum points threshold for a rite.
 * Returns undefined if no minimum.
 */
export function getRiteMinimumPoints(riteId: string): number | undefined {
  const rite = riteOfWarRegistry.get(riteId);
  return rite?.minimumPoints;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that an army list can legally use a specific Rite of War.
 * Returns an array of validation errors (empty array = valid).
 *
 * Checks:
 * 1. Rite exists and is registered
 * 2. Army faction matches rite's legion
 * 3. Allegiance is compatible (Hereticus requires Traitor)
 * 4. Points limit meets minimum threshold (if any)
 * 5. Rite-specific restrictions (unit exclusions, role requirements, etc.)
 */
export function validateRiteOfWar(armyList: ArmyList, riteId: string): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  // 1. Check rite exists
  const rite = riteOfWarRegistry.get(riteId);
  if (!rite) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Rite of War "${riteId}" is not registered or does not exist.`,
    });
    return errors;
  }

  // 2. Check faction match
  if (armyList.faction !== rite.legion) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Rite of War "${rite.name}" requires ${rite.legion} faction, but army is ${armyList.faction}.`,
    });
  }

  // 3. Check allegiance compatibility
  if (rite.requiredAllegiance && armyList.allegiance !== rite.requiredAllegiance) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Rite of War "${rite.name}" requires ${rite.requiredAllegiance} allegiance, but army is ${armyList.allegiance}.`,
    });
  }

  // 4. Check minimum points
  if (rite.minimumPoints && armyList.pointsLimit < rite.minimumPoints) {
    errors.push({
      severity: 'error',
      scope: 'army',
      message: `Rite of War "${rite.name}" requires a minimum of ${rite.minimumPoints} points, but army limit is ${armyList.pointsLimit}.`,
    });
  }

  // 5. Check structured restrictions
  for (const restriction of rite.restrictions) {
    const restrictionErrors = validateRestriction(armyList, rite, restriction);
    errors.push(...restrictionErrors);
  }

  return errors;
}

/**
 * Validate a single restriction against an army list.
 */
function validateRestriction(
  armyList: ArmyList,
  rite: RiteOfWarDefinition,
  restriction: RiteOfWarDefinition['restrictions'][0],
): ArmyValidationError[] {
  const errors: ArmyValidationError[] = [];

  switch (restriction.type) {
    case 'allegianceRequired': {
      // Already handled in main validation (allegiance check)
      // This is a no-op since restrictions with allegiance: null mean "no restriction"
      const requiredAllegiance = restriction.restriction.allegiance as string | null;
      if (requiredAllegiance && armyList.allegiance !== requiredAllegiance) {
        errors.push({
          severity: 'error',
          scope: 'army',
          message: `Rite of War "${rite.name}" restriction: requires ${requiredAllegiance} allegiance.`,
        });
      }
      break;
    }

    case 'excludeUnit': {
      // Check if the army contains an excluded unit type
      const excludedProfileId = restriction.restriction.profileId as string | undefined;
      const excludedName = restriction.restriction.unitName as string | undefined;
      if (excludedProfileId) {
        for (const detachment of armyList.detachments) {
          for (const unit of detachment.units) {
            if (unit.profileId === excludedProfileId) {
              errors.push({
                severity: 'error',
                scope: 'unit',
                elementId: unit.id,
                message: `Rite of War "${rite.name}" restriction: ${restriction.description}`,
              });
            }
          }
        }
      }
      if (excludedName) {
        // Name-based exclusion (for less structured data)
        for (const detachment of armyList.detachments) {
          for (const unit of detachment.units) {
            if (unit.profileId.toLowerCase().includes(excludedName.toLowerCase())) {
              errors.push({
                severity: 'error',
                scope: 'unit',
                elementId: unit.id,
                message: `Rite of War "${rite.name}" restriction: ${restriction.description}`,
              });
            }
          }
        }
      }
      break;
    }

    case 'excludeRole': {
      // Check if the army contains units with an excluded battlefield role
      const excludedRole = restriction.restriction.role as string | undefined;
      if (excludedRole) {
        for (const detachment of armyList.detachments) {
          for (const unit of detachment.units) {
            if (unit.battlefieldRole === excludedRole) {
              errors.push({
                severity: 'error',
                scope: 'unit',
                elementId: unit.id,
                message: `Rite of War "${rite.name}" restriction: ${restriction.description}`,
              });
            }
          }
        }
      }
      break;
    }

    case 'requireUnit': {
      // Check if the army contains the required unit type
      const requiredProfileId = restriction.restriction.profileId as string | undefined;
      if (requiredProfileId) {
        const hasRequired = armyList.detachments.some(d =>
          d.units.some(u => u.profileId === requiredProfileId),
        );
        if (!hasRequired) {
          errors.push({
            severity: 'error',
            scope: 'army',
            message: `Rite of War "${rite.name}" restriction: ${restriction.description}`,
          });
        }
      }
      break;
    }

    case 'requireRole': {
      // Check if the army has the required battlefield role filled
      const requiredRole = restriction.restriction.role as string | undefined;
      if (requiredRole) {
        const hasRole = armyList.detachments.some(d =>
          d.units.some(u => u.battlefieldRole === requiredRole),
        );
        if (!hasRole) {
          errors.push({
            severity: 'error',
            scope: 'army',
            message: `Rite of War "${rite.name}" restriction: ${restriction.description}`,
          });
        }
      }
      break;
    }

    case 'minimumPoints': {
      // Already handled in main validation, but can have per-restriction minimums
      const minPoints = restriction.restriction.points as number | undefined;
      if (minPoints && armyList.pointsLimit < minPoints) {
        errors.push({
          severity: 'error',
          scope: 'army',
          message: `Rite of War "${rite.name}" restriction: requires minimum ${minPoints} points.`,
        });
      }
      break;
    }

    case 'detachmentRestriction': {
      // Detachment-level restrictions (slot limits, type restrictions, etc.)
      // These are informational for now — full enforcement requires detachment validation
      // which happens in the army builder, not the game engine.
      break;
    }
  }

  return errors;
}

/**
 * Check if a rite of war is valid for a given faction and allegiance.
 * Quick check without full army list validation.
 */
export function isRiteAvailableFor(
  riteId: string,
  faction: LegionFaction,
  allegiance: Allegiance,
): boolean {
  const rite = riteOfWarRegistry.get(riteId);
  if (!rite) return false;

  // Check faction match
  if (rite.legion !== faction) return false;

  // Check allegiance compatibility
  if (rite.requiredAllegiance && rite.requiredAllegiance !== allegiance) return false;

  return true;
}

/**
 * Get the rite benefits summary for a given rite ID.
 * Returns an array of human-readable benefit descriptions.
 */
export function getRiteBenefitDescriptions(riteId: string): string[] {
  const rite = riteOfWarRegistry.get(riteId);
  if (!rite) return [];
  return rite.benefits.map(b => b.description);
}

/**
 * Get the rite restriction descriptions for a given rite ID.
 * Returns an array of human-readable restriction descriptions.
 */
export function getRiteRestrictionDescriptions(riteId: string): string[] {
  const rite = riteOfWarRegistry.get(riteId);
  if (!rite) return [];
  return rite.restrictions.map(r => r.description);
}
