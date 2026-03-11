/**
 * Unit Datasheet Parser
 * Parses unit profiles from legiones_astartes_clean.md into structured data.
 *
 * Reference: legiones_astartes_clean.md — 303 datasheets organized by Battlefield Role
 */

import type {
  ModelCharacteristics,
  VehicleCharacteristics,
  SavingThrow,
} from '@hh/types';
import {
  BattlefieldRole,
} from '@hh/types';

// ─── Output Types ────────────────────────────────────────────────────────────

/**
 * A parsed unit profile — semi-structured extraction from the markdown datasheet.
 * We parse as much as possible into typed fields, and store raw text for sections
 * that are too variable to fully parse (e.g., OPTIONS, extended SPECIAL RULES text).
 */
export interface ParsedUnit {
  /** Unique identifier (kebab-case of name) */
  id: string;
  /** Display name from ### header */
  name: string;
  /** TITLES section text */
  titles: string;
  /** LORE section text */
  lore: string;
  /** Battlefield role (from section header) */
  battlefieldRole: BattlefieldRole;
  /** Base points cost */
  basePoints: number;
  /** ADDITIONAL text (extra model costs, variants, etc.) */
  additional: string;
  /** Raw UNIT COMPOSITION text */
  unitComposition: string;
  /** Parsed model count and types */
  composition: ParsedComposition;

  /** Parsed model stat lines */
  models: ParsedModelStats[];
  /** Whether this unit uses vehicle stat format */
  isVehicle: boolean;

  /** Default wargear list */
  defaultWargear: string[];
  /** Wargear subdivided by model type (for mixed units) */
  wargearByModel: Record<string, string[]>;

  /** TRAITS list */
  traits: string[];

  /** SPECIAL RULES list (first section — rule names/references) */
  specialRules: string[];
  /** Extended SPECIAL RULES text (second section — full descriptions) */
  specialRulesText: string;

  /** TYPE entries: model name → type string */
  typeEntries: ParsedTypeEntry[];

  /** Raw OPTIONS text */
  optionsRaw: string;

  /** ACCESS POINTS text (transports) */
  accessPoints: string;

  /** Dedicated weapon profiles embedded in the datasheet */
  dedicatedWeapons: ParsedDedicatedWeapon[];
}

export interface ParsedComposition {
  /** Total model count at base */
  baseModelCount: number;
  /** Model types and their counts */
  models: { name: string; count: number }[];
  /** Points per additional model (from ADDITIONAL) */
  pointsPerAdditional: number;
  /** Maximum additional models */
  maxAdditional: number;
}

export interface ParsedModelStats {
  /** Model name (e.g., "Sergeant", "Legionary") */
  name: string;
  /** Base size in mm */
  baseSizeMM: number;
  /** Infantry/walker characteristics (or null if vehicle) */
  characteristics?: ModelCharacteristics;
  /** Vehicle characteristics (or null if infantry/walker) */
  vehicleCharacteristics?: VehicleCharacteristics;
}

export interface ParsedTypeEntry {
  /** Model name or variant name */
  modelName: string;
  /** Primary type (Infantry, Vehicle, Walker, etc.) */
  primaryType: string;
  /** Sub-types (Command, Sergeant, Unique, etc.) */
  subTypes: string[];
}

export interface ParsedDedicatedWeapon {
  /** Weapon name */
  name: string;
  /** Whether it's ranged or melee */
  category: 'ranged' | 'melee';
  /** Flavor/description text before the table */
  description: string;
  /** Parsed weapon profiles (may be multiple for multi-profile weapons) */
  profiles: ParsedWeaponProfile[];
}

export interface ParsedWeaponProfile {
  /** Profile name (e.g., "The Lion Sword", "- Krak") */
  name: string;
  /** Raw stat values as strings */
  stats: Record<string, string>;
}

// ─── Battlefield Role Section Headers ────────────────────────────────────────

const BATTLEFIELD_ROLE_HEADERS: Record<string, BattlefieldRole> = {
  'Warlord': BattlefieldRole.Warlord,
  'High Command': BattlefieldRole.HighCommand,
  'Command': BattlefieldRole.Command,
  'Retinue': BattlefieldRole.Retinue,
  'Elites': BattlefieldRole.Elites,
  'War Engine': BattlefieldRole.WarEngine,
  'Troops': BattlefieldRole.Troops,
  'Support': BattlefieldRole.Support,
  'Lord of War': BattlefieldRole.LordOfWar,
  'Transport': BattlefieldRole.Transport,
  'Heavy Assault': BattlefieldRole.HeavyAssault,
  'Heavy Transport': BattlefieldRole.HeavyTransport,
  'Armour': BattlefieldRole.Armour,
  'Recon': BattlefieldRole.Recon,
  'Fast Attack': BattlefieldRole.FastAttack,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseSavingThrow(val: string): SavingThrow {
  if (!val || val === '-' || val.trim() === '' || val.trim() === '-') return null;
  const num = parseInt(val.replace('+', ''));
  return isNaN(num) ? null : num;
}

function parseIntSafe(val: string): number {
  if (!val || val === '-' || val.trim() === '' || val.trim() === '-') return 0;
  const num = parseInt(val.replace('+', ''));
  return isNaN(num) ? 0 : num;
}

function parseBaseSizeMM(modelName: string): number {
  const match = modelName.match(/⌀(\d+)mm/);
  if (match) return parseInt(match[1]);
  if (modelName.includes('No official base size')) return 0;
  if (modelName.includes('Use model')) return 0; // Vehicles
  return 32; // Default infantry base
}

function extractModelName(raw: string): string {
  // Remove base size indicator like "(⌀32mm)" or "(⌀Use model)"
  return raw.replace(/\s*\(⌀[^)]*\)\s*/, '').trim();
}

// ─── Stat Table Parsing ──────────────────────────────────────────────────────

function splitTableRow(line: string): string[] {
  // Split markdown table row preserving empty cells for positional indexing.
  // "| A | B | | D |" → ["A", "B", "", "D"]
  // Drop leading/trailing empty from the leading/trailing | characters.
  const raw = line.split('|').map(c => c.trim());
  // First and last elements are always empty from leading/trailing |
  return raw.slice(1, raw.length - 1);
}

function parseInfantryStatTable(lines: string[]): ParsedModelStats[] {
  const results: ParsedModelStats[] = [];

  // Collect non-separator table rows
  const dataRows: string[] = [];
  for (const line of lines) {
    if (line.includes('|') && !line.includes('---')) {
      dataRows.push(line);
    }
  }

  // Find the header row: | | M | WS | BS | S | T | W | I | A | LD | CL | WP | IN | SAV | INV |
  let headerIndex = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = splitTableRow(dataRows[i]);
    if (cells.includes('M') && cells.includes('WS') && cells.includes('BS')) {
      headerIndex = i;
      headerCells = cells;
      break;
    }
  }

  if (headerIndex === -1) return results;

  // Find column index for T (used to distinguish full vs partial rows)
  const colT = headerCells.indexOf('T');

  for (let i = headerIndex + 1; i < dataRows.length; i++) {
    const cells = splitTableRow(dataRows[i]);

    // Get model name from cell 0
    const modelNameRaw = cells[0];
    if (!modelNameRaw) continue;

    // Skip "partial" display rows — these have T column empty
    if (colT >= 0 && colT < cells.length) {
      const tVal = cells[colT];
      if (!tVal || tVal === '') continue;
    }

    const baseSizeMM = parseBaseSizeMM(modelNameRaw);
    const name = extractModelName(modelNameRaw);

    // Map header column names to cell values by position
    const stats: Record<string, string> = {};
    for (let j = 1; j < headerCells.length && j < cells.length; j++) {
      if (headerCells[j]) {
        stats[headerCells[j]] = cells[j];
      }
    }

    const characteristics: ModelCharacteristics = {
      M: parseIntSafe(stats['M'] || '0'),
      WS: parseIntSafe(stats['WS'] || '0'),
      BS: parseIntSafe(stats['BS'] || '0'),
      S: parseIntSafe(stats['S'] || '0'),
      T: parseIntSafe(stats['T'] || '0'),
      W: parseIntSafe(stats['W'] || '0'),
      I: parseIntSafe(stats['I'] || '0'),
      A: parseIntSafe(stats['A'] || '0'),
      LD: parseIntSafe(stats['LD'] || '0'),
      CL: parseIntSafe(stats['CL'] || '0'),
      WP: parseIntSafe(stats['WP'] || '0'),
      IN: parseIntSafe(stats['IN'] || '0'),
      SAV: parseSavingThrow(stats['SAV'] || '-'),
      INV: parseSavingThrow(stats['INV'] || '-'),
    };

    results.push({ name, baseSizeMM, characteristics });
  }

  return results;
}

function parseVehicleStatTable(lines: string[]): ParsedModelStats[] {
  const results: ParsedModelStats[] = [];

  const dataRows: string[] = [];
  for (const line of lines) {
    if (line.includes('|') && !line.includes('---')) {
      dataRows.push(line);
    }
  }

  // Find the header row: | | M | BS | Front | Side | Rear | HP | |
  let headerIndex = -1;
  let headerCells: string[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const cells = splitTableRow(dataRows[i]);
    if (cells.includes('M') && cells.includes('BS') && cells.includes('Front')) {
      headerIndex = i;
      headerCells = cells;
      break;
    }
  }

  if (headerIndex === -1) return results;

  const colM = headerCells.indexOf('M');

  for (let i = headerIndex + 1; i < dataRows.length; i++) {
    const cells = splitTableRow(dataRows[i]);

    const modelNameRaw = cells[0];
    if (!modelNameRaw) continue;

    // Skip empty display rows (M column is empty)
    if (colM >= 0 && colM < cells.length) {
      const mVal = cells[colM];
      if (!mVal || mVal === '') continue;
    }

    const baseSizeMM = parseBaseSizeMM(modelNameRaw);
    const name = extractModelName(modelNameRaw);

    // Map header column names to cell values by position
    const stats: Record<string, string> = {};
    for (let j = 1; j < headerCells.length && j < cells.length; j++) {
      if (headerCells[j]) {
        stats[headerCells[j]] = cells[j];
      }
    }

    // The transport capacity is in the last column (unnamed in header, after HP)
    const hpColIndex = headerCells.indexOf('HP');
    const transportCapStr = (hpColIndex >= 0 && hpColIndex + 1 < cells.length) ? cells[hpColIndex + 1] : '0';

    const vehicleCharacteristics: VehicleCharacteristics = {
      M: parseIntSafe(stats['M'] || '0'),
      BS: parseIntSafe(stats['BS'] || '0'),
      frontArmour: parseIntSafe(stats['Front'] || '0'),
      sideArmour: parseIntSafe(stats['Side'] || '0'),
      rearArmour: parseIntSafe(stats['Rear'] || '0'),
      HP: parseIntSafe(stats['HP'] || '0'),
      transportCapacity: parseIntSafe(transportCapStr),
    };

    results.push({ name, baseSizeMM, vehicleCharacteristics });
  }

  return results;
}

// ─── Weapon Table Parsing ────────────────────────────────────────────────────

function parseDedicatedWeapons(wargearSections: { name: string; lines: string[] }[]): {
  wargear: string[];
  wargearByModel: Record<string, string[]>;
  weapons: ParsedDedicatedWeapon[];
} {
  const wargear: string[] = [];
  const wargearByModel: Record<string, string[]> = {};
  const weapons: ParsedDedicatedWeapon[] = [];

  let currentModel = '';
  let descriptionBuffer = '';

  for (const section of wargearSections) {
    let inWeaponTable = false;
    let weaponCategory: 'ranged' | 'melee' = 'ranged';
    let tableLines: string[] = [];
    let currentDescription = '';

    for (const line of section.lines) {
      const trimmed = line.trim();

      if (trimmed === 'WARGEAR') continue;

      // Check for weapon table header
      if (trimmed.startsWith('| Ranged Weapon') || trimmed.startsWith('| Melee Weapon')) {
        // Start of a weapon stat table
        inWeaponTable = true;
        weaponCategory = trimmed.includes('Ranged') ? 'ranged' : 'melee';
        tableLines = [trimmed];
        currentDescription = descriptionBuffer.trim();
        descriptionBuffer = '';
        continue;
      }

      if (inWeaponTable) {
        if (trimmed.startsWith('|')) {
          tableLines.push(trimmed);
        } else {
          // End of table
          inWeaponTable = false;
          const weapon = parseWeaponTable(tableLines, weaponCategory, currentDescription);
          if (weapon) {
            weapons.push(weapon);
          }
          tableLines = [];
          descriptionBuffer = trimmed;
        }
        continue;
      }

      // Regular wargear list items
      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2).trim();
        if (currentModel) {
          if (!wargearByModel[currentModel]) wargearByModel[currentModel] = [];
          wargearByModel[currentModel].push(item);
        } else {
          wargear.push(item);
        }
        descriptionBuffer = '';
      } else if (trimmed && !trimmed.startsWith('|') && !trimmed.startsWith('---')) {
        // Check if this is a model name header (e.g., "Legionary" or "Rapier Carrier")
        // These are typically short lines that appear alone before a wargear list
        if (trimmed.length < 60 && !trimmed.includes('.') && !trimmed.includes(',') &&
            section.lines.indexOf(line) + 1 < section.lines.length) {
          const nextLine = section.lines[section.lines.indexOf(line) + 1]?.trim();
          if (nextLine?.startsWith('- ')) {
            currentModel = trimmed;
            continue;
          }
        }
        // Otherwise it's description text for an embedded weapon
        descriptionBuffer += (descriptionBuffer ? ' ' : '') + trimmed;
      }
    }

    // Handle table that extends to end of section
    if (inWeaponTable && tableLines.length > 0) {
      const weapon = parseWeaponTable(tableLines, weaponCategory, currentDescription);
      if (weapon) {
        weapons.push(weapon);
      }
    }
  }

  return { wargear, wargearByModel, weapons };
}

function parseWeaponTable(tableLines: string[], category: 'ranged' | 'melee', description: string): ParsedDedicatedWeapon | null {
  // Parse a weapon stat table into profiles
  const profiles: ParsedWeaponProfile[] = [];
  let headerCells: string[] = [];

  // Find the actual header row (second row with column names, not "Ranged Weapon"/"Melee Weapon")
  for (let i = 0; i < tableLines.length; i++) {
    if (tableLines[i].includes('---')) continue;
    const cells = splitTableRow(tableLines[i]);
    if (cells.length < 3) continue;

    // Find header row
    if (category === 'ranged' && cells.includes('R') && cells.includes('FP')) {
      headerCells = cells;
      continue;
    }
    if (category === 'melee' && cells.includes('IM') && cells.includes('AM')) {
      headerCells = cells;
      continue;
    }

    // Skip the display header rows
    if (cells[0] === 'Ranged Weapon' || cells[0] === 'Melee Weapon') continue;

    if (headerCells.length === 0) continue;

    // Check if this is a data row (has actual stat values, not all empty)
    const hasData = cells.slice(1).some(c => c && c !== '');
    if (!hasData) continue; // Skip the empty "name only" rows

    const stats: Record<string, string> = {};
    const name = cells[0];
    for (let j = 1; j < headerCells.length && j < cells.length; j++) {
      if (headerCells[j]) {
        stats[headerCells[j]] = cells[j];
      }
    }

    profiles.push({ name, stats });
  }

  if (profiles.length === 0) return null;

  // The main weapon name comes from the first profile
  const weaponName = profiles[0].name.startsWith('- ')
    ? profiles[0].name // sub-profile
    : profiles[0].name;

  return {
    name: weaponName,
    category,
    description,
    profiles,
  };
}

// ─── Composition Parsing ─────────────────────────────────────────────────────

function parseComposition(compositionText: string, additionalText: string): ParsedComposition {
  const models: { name: string; count: number }[] = [];
  let totalCount = 0;

  // Parse "1 SERGEANT , 9 LEGIONARIES" or "1 PRAETOR" etc.
  const parts = compositionText.replace(/^UNIT COMPOSITION:\s*/i, '').split(/\s*,\s*/);
  for (const part of parts) {
    const match = part.trim().match(/^(\d+)\s+(.+)$/);
    if (match) {
      const count = parseInt(match[1]);
      const name = match[2].trim();
      models.push({ name, count });
      totalCount += count;
    }
  }

  // Parse ADDITIONAL: "May include up to 10 additional Legionaries at +10 Points per Model."
  let pointsPerAdditional = 0;
  let maxAdditional = 0;

  if (additionalText) {
    const additionalMatch = additionalText.match(/up to (\d+) additional.*?at \+(\d+) Points/i);
    if (additionalMatch) {
      maxAdditional = parseInt(additionalMatch[1]);
      pointsPerAdditional = parseInt(additionalMatch[2]);
    }
    // Also handle "Each Rapier Crew" pattern: "May include up to 3 additional Rapier Crews at +40 Points per Rapier Crew."
    const crewMatch = additionalText.match(/up to (\d+) additional.*?at \+(\d+) Points per/i);
    if (crewMatch && !additionalMatch) {
      maxAdditional = parseInt(crewMatch[1]);
      pointsPerAdditional = parseInt(crewMatch[2]);
    }
  }

  return {
    baseModelCount: totalCount,
    models,
    pointsPerAdditional,
    maxAdditional,
  };
}

// ─── Type Entry Parsing ──────────────────────────────────────────────────────

function parseTypeEntries(lines: string[]): ParsedTypeEntry[] {
  const entries: ParsedTypeEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;

    const content = trimmed.slice(2).trim();

    // Format: "ModelName : PrimaryType ( SubType1 , SubType2 )" or "PrimaryType ( SubType )"
    const colonIndex = content.indexOf(':');
    let modelName = '';
    let typeString = content;

    if (colonIndex >= 0) {
      modelName = content.slice(0, colonIndex).trim();
      typeString = content.slice(colonIndex + 1).trim();
    }

    // Parse "Infantry ( Sergeant )" or "Vehicle ( Transport )" or just "Walker"
    const parenMatch = typeString.match(/^(\w+(?:\s+\w+)*)\s*(?:\(\s*(.+?)\s*\))?/);
    if (parenMatch) {
      const primaryType = parenMatch[1].trim();
      const subTypesStr = parenMatch[2] || '';
      const subTypes = subTypesStr
        .split(/\s*,\s*/)
        .map(s => s.trim())
        .filter(s => s !== '' && s !== '†If');

      entries.push({ modelName, primaryType, subTypes });
    }
  }

  return entries;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse the entire legiones_astartes_clean.md file into structured unit data.
 */
export function parseDatasheets(markdown: string): ParsedUnit[] {
  const lines = markdown.split('\n');
  const units: ParsedUnit[] = [];
  let currentRole: BattlefieldRole = BattlefieldRole.Troops; // default

  // Split into sections by ### headers
  const sections: { header: string; lines: string[] }[] = [];
  let currentSection: { header: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { header: line.slice(4).trim(), lines: [] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  for (const section of sections) {
    const { header, lines: sectionLines } = section;

    // Check if this is a battlefield role header
    if (BATTLEFIELD_ROLE_HEADERS[header]) {
      currentRole = BATTLEFIELD_ROLE_HEADERS[header];
      continue;
    }

    // Check if this is an actual datasheet (has UNIT COMPOSITION and POINTS)
    const hasComposition = sectionLines.some(l => l.trim().startsWith('UNIT COMPOSITION:'));
    const hasPoints = sectionLines.some(l => l.trim().startsWith('POINTS:'));
    if (!hasComposition || !hasPoints) {
      // This is a non-datasheet header (e.g., wargear item, special rule, trait)
      continue;
    }

    // Parse this datasheet
    const unit = parseDatasheet(header, sectionLines, currentRole);
    if (unit) {
      units.push(unit);
    }
  }

  return units;
}

function parseDatasheet(
  name: string,
  lines: string[],
  battlefieldRole: BattlefieldRole,
): ParsedUnit | null {
  const id = toKebabCase(name);

  // ── Extract raw section values ──
  let titles = '';
  let unitComposition = '';
  let pointsText = '';
  let additional = '';
  let lore = '';
  let accessPoints = '';

  // Collect lines by section
  const wargearSections: { name: string; lines: string[] }[] = [];
  const specialRulesSections: string[][] = [];
  const traitLines: string[] = [];
  const typeLines: string[] = [];
  const optionLines: string[] = [];
  const statTableLines: string[] = [];

  // Simple state machine for section parsing
  type SectionType = 'none' | 'titles' | 'composition' | 'points' | 'additional' | 'lore' |
    'wargear' | 'traits' | 'special-rules' | 'type' | 'options' | 'access-points' | 'stat-table';

  let currentSectionType: SectionType = 'none';
  let currentWargearSection: { name: string; lines: string[] } | null = null;
  let currentSpecialRulesSection: string[] = [];
  let statTableCaptured = false; // true after we've captured the unit stat table

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Capture the unit stat table — only before any named section (WARGEAR, TRAITS, etc.)
    // Tables inside WARGEAR sections are weapon tables and handled separately.
    if (trimmed.startsWith('|') && !statTableCaptured && currentSectionType !== 'wargear') {
      statTableLines.push(trimmed);
      continue;
    }
    // Detect end of stat table
    if (statTableLines.length > 0 && !statTableCaptured && !trimmed.startsWith('|')) {
      statTableCaptured = true;
      // Fall through to section detection
    }

    // If we're in a wargear section and hit a table line, add to wargear section
    if (trimmed.startsWith('|') && currentSectionType === 'wargear' && currentWargearSection) {
      currentWargearSection.lines.push(line);
      continue;
    }

    // Section detection
    if (trimmed.startsWith('TITLES:')) {
      titles = trimmed.replace(/^TITLES:\s*/, '');
      currentSectionType = 'titles';
      continue;
    }
    if (trimmed.startsWith('UNIT COMPOSITION:')) {
      unitComposition = trimmed;
      currentSectionType = 'composition';
      continue;
    }
    if (trimmed.startsWith('POINTS:')) {
      pointsText = trimmed;
      currentSectionType = 'points';
      continue;
    }
    if (trimmed.startsWith('ADDITIONAL:')) {
      additional = trimmed.replace(/^ADDITIONAL:\s*/, '');
      currentSectionType = 'additional';
      continue;
    }
    if (trimmed.startsWith('LORE:')) {
      lore = trimmed.replace(/^LORE:\s*/, '');
      currentSectionType = 'lore';
      continue;
    }
    if (trimmed === 'WARGEAR') {
      // Save previous wargear section if exists
      if (currentWargearSection) {
        wargearSections.push(currentWargearSection);
      }
      currentWargearSection = { name: 'WARGEAR', lines: [trimmed] };
      currentSectionType = 'wargear';
      continue;
    }
    if (trimmed === 'TRAITS') {
      if (currentWargearSection) {
        wargearSections.push(currentWargearSection);
        currentWargearSection = null;
      }
      currentSectionType = 'traits';
      continue;
    }
    if (trimmed === 'SPECIAL RULES') {
      if (currentWargearSection) {
        wargearSections.push(currentWargearSection);
        currentWargearSection = null;
      }
      // Start a new special rules section
      if (currentSpecialRulesSection.length > 0) {
        specialRulesSections.push(currentSpecialRulesSection);
      }
      currentSpecialRulesSection = [];
      currentSectionType = 'special-rules';
      continue;
    }
    if (trimmed === 'TYPE') {
      currentSectionType = 'type';
      continue;
    }
    if (trimmed === 'OPTIONS') {
      currentSectionType = 'options';
      continue;
    }
    if (trimmed === 'ACCESS POINTS') {
      currentSectionType = 'access-points';
      continue;
    }

    // Accumulate into current section
    switch (currentSectionType) {
      case 'lore':
        if (trimmed) lore += (lore ? ' ' : '') + trimmed;
        break;
      case 'additional':
        if (trimmed) additional += (additional ? ' ' : '') + trimmed;
        break;
      case 'wargear':
        if (currentWargearSection) {
          currentWargearSection.lines.push(line);
        }
        break;
      case 'traits':
        if (trimmed) traitLines.push(trimmed);
        break;
      case 'special-rules':
        if (trimmed) currentSpecialRulesSection.push(trimmed);
        break;
      case 'type':
        if (trimmed) typeLines.push(trimmed);
        break;
      case 'options':
        if (trimmed) optionLines.push(trimmed);
        break;
      case 'access-points':
        if (trimmed) accessPoints += (accessPoints ? ' ' : '') + trimmed;
        break;
    }
  }

  // Save final sections
  if (currentWargearSection) {
    wargearSections.push(currentWargearSection);
  }
  if (currentSpecialRulesSection.length > 0) {
    specialRulesSections.push(currentSpecialRulesSection);
  }

  // ── Parse points ──
  const pointsMatch = pointsText.match(/POINTS:\s*(\d+)/);
  const basePoints = pointsMatch ? parseInt(pointsMatch[1]) : 0;

  // ── Parse composition ──
  const composition = parseComposition(unitComposition, additional);

  // ── Determine if vehicle format ──
  const isVehicle = statTableLines.some(l => l.includes('Front') && l.includes('Side') && l.includes('Rear'));

  // ── Parse stat table ──
  const models = isVehicle
    ? parseVehicleStatTable(statTableLines)
    : parseInfantryStatTable(statTableLines);

  // ── Parse wargear (including embedded weapons) ──
  const { wargear, wargearByModel, weapons } = parseDedicatedWeapons(wargearSections);

  // ── Parse traits ──
  const traits = traitLines
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim());

  // ── Parse special rules ──
  // First section is the rule name list, subsequent sections are descriptions
  const specialRules: string[] = [];
  let specialRulesText = '';

  if (specialRulesSections.length > 0) {
    // First section: rule names
    for (const line of specialRulesSections[0]) {
      if (line.startsWith('- ')) {
        specialRules.push(line.slice(2).trim());
      } else if (line !== 'None') {
        // Could be a variant-specific rule header
        // E.g. "Praetor" or "Praetor with Jump Pack"
        // followed by "- None" or "- Bulky (2)"
        if (!line.includes('.') && !line.includes(',') && line.length < 80) {
          // Likely a model name prefix for variant-specific rules
          specialRules.push(`[${line}]`); // Mark as variant header
        }
      }
    }

    // Remaining sections: extended descriptions
    for (let i = 1; i < specialRulesSections.length; i++) {
      specialRulesText += (specialRulesText ? '\n' : '') + specialRulesSections[i].join(' ');
    }
  }

  // ── Parse type entries ──
  const typeEntries = parseTypeEntries(typeLines);

  // ── Parse options ──
  const optionsRaw = optionLines.join('\n');

  return {
    id,
    name,
    titles,
    lore,
    battlefieldRole,
    basePoints,
    additional,
    unitComposition,
    composition,
    models,
    isVehicle,
    defaultWargear: wargear,
    wargearByModel,
    traits,
    specialRules,
    specialRulesText,
    typeEntries,
    optionsRaw,
    accessPoints,
    dedicatedWeapons: weapons,
  };
}

// ─── Convenience Exports ─────────────────────────────────────────────────────

/**
 * Build a lookup map by ID.
 */
export function indexUnitsById(units: ParsedUnit[]): Record<string, ParsedUnit> {
  const index: Record<string, ParsedUnit> = {};
  for (const unit of units) {
    index[unit.id] = unit;
  }
  return index;
}

/**
 * Find a unit by name (case-insensitive).
 */
export function findUnitByName(units: ParsedUnit[], name: string): ParsedUnit | undefined {
  const lower = name.toLowerCase();
  return units.find(u => u.name.toLowerCase() === lower);
}
