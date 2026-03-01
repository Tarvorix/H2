/**
 * Unit Database — Parsed unit datasheets from legiones_astartes_clean.md
 *
 * This module re-exports the parser and provides the parsed unit data
 * once the markdown file has been loaded and processed.
 */

export {
  parseDatasheets,
  indexUnitsById,
  findUnitByName,
} from './unit-parser';

export type {
  ParsedUnit,
  ParsedComposition,
  ParsedModelStats,
  ParsedTypeEntry,
  ParsedDedicatedWeapon,
  ParsedWeaponProfile,
} from './unit-parser';
