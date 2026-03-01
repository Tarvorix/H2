/**
 * Army Serialization Module.
 * Handles exporting and importing army lists as JSON.
 *
 * Reference: HH_Battle_AOD.md — "Army Lists"
 */

import type {
  ArmyList,
} from '@hh/types';
import {
  Allegiance,
  DetachmentType,
  LegionFaction,
} from '@hh/types';

// ─── Schema Version ──────────────────────────────────────────────────────────

/** Current serialization schema version */
export const ARMY_LIST_SCHEMA_VERSION = 1;

// ─── Serialization Types ─────────────────────────────────────────────────────

interface SerializedArmyList {
  schemaVersion: number;
  armyList: ArmyList;
}

interface ImportResult {
  armyList: ArmyList | null;
  errors: string[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Export an army list to a JSON string with schema versioning.
 *
 * @param armyList - The army list to export
 * @returns JSON string representation of the army list
 */
export function exportArmyList(armyList: ArmyList): string {
  const serialized: SerializedArmyList = {
    schemaVersion: ARMY_LIST_SCHEMA_VERSION,
    armyList,
  };
  return JSON.stringify(serialized, null, 2);
}

// ─── Import ──────────────────────────────────────────────────────────────────

/**
 * Import an army list from a JSON string.
 * Validates the structure and returns errors if the JSON is malformed.
 *
 * @param json - The JSON string to import
 * @returns ImportResult with the army list and any errors
 */
export function importArmyList(json: string): ImportResult {
  const errors: string[] = [];

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { armyList: null, errors: ['Invalid JSON: parse error.'] };
  }

  // Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null) {
    return { armyList: null, errors: ['Invalid structure: expected an object.'] };
  }

  const obj = parsed as Record<string, unknown>;

  // Check schema version
  if (typeof obj.schemaVersion !== 'number') {
    errors.push('Missing or invalid "schemaVersion" field.');
  } else if (obj.schemaVersion > ARMY_LIST_SCHEMA_VERSION) {
    errors.push(
      `Unsupported schema version ${obj.schemaVersion} (max supported: ${ARMY_LIST_SCHEMA_VERSION}).`,
    );
  }

  // Validate armyList field
  if (typeof obj.armyList !== 'object' || obj.armyList === null) {
    return {
      armyList: null,
      errors: [...errors, 'Missing or invalid "armyList" field.'],
    };
  }

  // Validate army list structure
  const structureErrors = validateArmyListStructure(obj.armyList as Record<string, unknown>);
  if (structureErrors.length > 0) {
    return { armyList: null, errors: [...errors, ...structureErrors] };
  }

  if (errors.length > 0) {
    return { armyList: null, errors };
  }

  return { armyList: obj.armyList as ArmyList, errors: [] };
}

// ─── Structure Validation ────────────────────────────────────────────────────

/**
 * Validate the runtime structure of a parsed army list object.
 * Checks that all required fields exist and have the correct types.
 *
 * @param obj - The parsed object to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateArmyListStructure(obj: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Required string fields
  if (typeof obj.playerName !== 'string') {
    errors.push('Missing or invalid "playerName" (expected string).');
  }
  if (typeof obj.faction !== 'string') {
    errors.push('Missing or invalid "faction" (expected string).');
  } else if (!Object.values(LegionFaction).includes(obj.faction as LegionFaction)) {
    errors.push(`Invalid "faction" value: "${obj.faction}".`);
  }
  if (typeof obj.allegiance !== 'string') {
    errors.push('Missing or invalid "allegiance" (expected string).');
  } else if (!Object.values(Allegiance).includes(obj.allegiance as Allegiance)) {
    errors.push(`Invalid "allegiance" value: "${obj.allegiance}".`);
  }

  // Required number fields
  if (typeof obj.pointsLimit !== 'number' || obj.pointsLimit <= 0) {
    errors.push('Missing or invalid "pointsLimit" (expected positive number).');
  }
  if (typeof obj.totalPoints !== 'number' || obj.totalPoints < 0) {
    errors.push('Missing or invalid "totalPoints" (expected non-negative number).');
  }

  // Detachments array
  if (!Array.isArray(obj.detachments)) {
    errors.push('Missing or invalid "detachments" (expected array).');
  } else {
    for (let i = 0; i < obj.detachments.length; i++) {
      const det = obj.detachments[i] as Record<string, unknown>;
      const detErrors = validateDetachmentStructure(det, i);
      errors.push(...detErrors);
    }
  }

  return errors;
}

/**
 * Validate a single detachment's structure.
 */
function validateDetachmentStructure(
  det: Record<string, unknown>,
  index: number,
): string[] {
  const errors: string[] = [];
  const prefix = `detachments[${index}]`;

  if (typeof det.id !== 'string') {
    errors.push(`${prefix}: Missing or invalid "id" (expected string).`);
  }
  if (typeof det.detachmentTemplateId !== 'string') {
    errors.push(`${prefix}: Missing or invalid "detachmentTemplateId" (expected string).`);
  }
  if (typeof det.type !== 'string') {
    errors.push(`${prefix}: Missing or invalid "type" (expected string).`);
  } else if (!Object.values(DetachmentType).includes(det.type as DetachmentType)) {
    errors.push(`${prefix}: Invalid "type" value: "${det.type}".`);
  }
  if (typeof det.faction !== 'string') {
    errors.push(`${prefix}: Missing or invalid "faction" (expected string).`);
  }

  if (!Array.isArray(det.units)) {
    errors.push(`${prefix}: Missing or invalid "units" (expected array).`);
  } else {
    for (let j = 0; j < det.units.length; j++) {
      const unit = det.units[j] as Record<string, unknown>;
      const unitErrors = validateUnitStructure(unit, index, j);
      errors.push(...unitErrors);
    }
  }

  return errors;
}

/**
 * Validate a single unit's structure.
 */
function validateUnitStructure(
  unit: Record<string, unknown>,
  detIndex: number,
  unitIndex: number,
): string[] {
  const errors: string[] = [];
  const prefix = `detachments[${detIndex}].units[${unitIndex}]`;

  if (typeof unit.id !== 'string') {
    errors.push(`${prefix}: Missing or invalid "id" (expected string).`);
  }
  if (typeof unit.profileId !== 'string') {
    errors.push(`${prefix}: Missing or invalid "profileId" (expected string).`);
  }
  if (typeof unit.modelCount !== 'number' || unit.modelCount < 1) {
    errors.push(`${prefix}: Missing or invalid "modelCount" (expected positive number).`);
  }
  if (typeof unit.totalPoints !== 'number' || unit.totalPoints < 0) {
    errors.push(`${prefix}: Missing or invalid "totalPoints" (expected non-negative number).`);
  }
  if (typeof unit.battlefieldRole !== 'string') {
    errors.push(`${prefix}: Missing or invalid "battlefieldRole" (expected string).`);
  }
  if (!Array.isArray(unit.selectedOptions)) {
    errors.push(`${prefix}: Missing or invalid "selectedOptions" (expected array).`);
  }

  return errors;
}
