/**
 * Profile Converter — Transforms ParsedUnit (from markdown parser) into UnitProfile (for engine/UI).
 *
 * This is the bridge between the raw parsed datasheet data and the typed
 * UnitProfile interface that the game engine and UI components consume.
 */

import type {
  UnitProfile,
  ModelDefinition,
  UnitTrait,
  WargearOption,
  DedicatedWeapon,
  RangedWeaponInline,
  MeleeWeaponInline,
  AccessPoint,
} from '@hh/types';
import type { SpecialRuleRef } from '@hh/types';
import { ModelType, ModelSubType } from '@hh/types';

import type {
  ParsedUnit,
  ParsedTypeEntry,
  ParsedDedicatedWeapon,
  ParsedWeaponProfile,
} from './unit-parser';
import { findWeaponByName } from './weapons';

// ─── Type Mapping Tables ────────────────────────────────────────────────────

const MODEL_TYPE_MAP: Record<string, ModelType> = {
  'infantry': ModelType.Infantry,
  'vehicle': ModelType.Vehicle,
  'walker': ModelType.Walker,
  'cavalry': ModelType.Cavalry,
  'automata': ModelType.Automata,
  'primarch': ModelType.Primarch,
  'paragon': ModelType.Paragon,
  'knight': ModelType.Knight,
  'titan': ModelType.Titan,
  'building': ModelType.Building,
};

const MODEL_SUBTYPE_MAP: Record<string, ModelSubType> = {
  'line': ModelSubType.Line,
  'heavy': ModelSubType.Heavy,
  'skirmish': ModelSubType.Skirmish,
  'command': ModelSubType.Command,
  'sergeant': ModelSubType.Sergeant,
  'unique': ModelSubType.Unique,
  'light': ModelSubType.Light,
  'transport': ModelSubType.Transport,
  'fast': ModelSubType.Fast,
  'heavy vehicle': ModelSubType.HeavyVehicle,
  'super-heavy': ModelSubType.SuperHeavy,
  'super heavy': ModelSubType.SuperHeavy,
  'flyer': ModelSubType.Flyer,
  'hover': ModelSubType.Hover,
  'antigrav': ModelSubType.Antigrav,
  'dreadnought': ModelSubType.Dreadnought,
  'jump': ModelSubType.Jump,
  'jet': ModelSubType.Jet,
  'mounted': ModelSubType.Mounted,
  'daemon': ModelSubType.Daemon,
  'psyker': ModelSubType.Psyker,
  'corrupted': ModelSubType.Corrupted,
};

// ─── Special Rule Parsing ───────────────────────────────────────────────────

function parseSpecialRuleRef(str: string): SpecialRuleRef {
  // Parse "Breaching (4+)" → { name: "Breaching", value: "4+" }
  // Parse "Bulky (2)" → { name: "Bulky", value: "2" }
  // Parse "Eternal Warrior" → { name: "Eternal Warrior" }
  const match = str.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), value: match[2].trim() };
  }
  return { name: str.trim() };
}

// ─── Trait Parsing ──────────────────────────────────────────────────────────

function parseTrait(traitStr: string): UnitTrait {
  const lower = traitStr.toLowerCase();

  // Check for allegiance traits
  if (lower === 'loyalist') {
    return { category: 'Allegiance', value: 'Loyalist' };
  }
  if (lower === 'traitor') {
    return { category: 'Allegiance', value: 'Traitor' };
  }

  // Check for faction traits (legion names)
  const factionNames = [
    'Dark Angels', "Emperor's Children", 'Iron Warriors', 'White Scars',
    'Space Wolves', 'Imperial Fists', 'Night Lords', 'Blood Angels',
    'Iron Hands', 'World Eaters', 'Ultramarines', 'Death Guard',
    'Thousand Sons', 'Sons of Horus', 'Word Bearers', 'Salamanders',
    'Raven Guard', 'Alpha Legion', 'Legiones Astartes',
  ];
  for (const factionName of factionNames) {
    if (lower === factionName.toLowerCase()) {
      return { category: 'Faction', value: factionName };
    }
  }

  // Everything else is a custom trait
  return { category: 'Custom', value: traitStr };
}

// ─── Wargear Name → Weapon ID Mapping ──────────────────────────────────────

function resolveWargearIds(wargearNames: string[]): string[] {
  const ids: string[] = [];
  for (const name of wargearNames) {
    const matches = findWeaponByName(name);
    if (matches.length > 0) {
      ids.push(matches[0].id);
    } else {
      // Store the name as-is as a fallback ID (for dedicated weapons or unknown items)
      ids.push(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  }
  return ids;
}

// ─── Options Parsing ────────────────────────────────────────────────────────

function parseOptionsText(optionsRaw: string): WargearOption[] {
  if (!optionsRaw || optionsRaw.trim() === '') return [];

  const options: WargearOption[] = [];
  const lines = optionsRaw.split('\n');

  for (const line of lines) {
    const trimmed = line.replace(/^-\s*/, '').trim();
    if (!trimmed) continue;

    // Pattern: "X may exchange Y for Z for +N pts" or "for Free"
    const exchangeMatch = trimmed.match(
      /(?:(?:any|one|each|the|all)\s+)?(?:model(?:s)?|.*?)\s+may\s+(?:have\s+(?:its|their)\s+)?(.+?)\s+exchanged?\s+for\s+(?:one\s+)?(.+?)(?:\s+for\s+(?:\+?(\d+)\s+[Pp]oints?|[Ff]ree))?\.?$/i
    );
    if (exchangeMatch) {
      const removesStr = exchangeMatch[1].trim();
      const addsStr = exchangeMatch[2].trim();
      const pointsCost = exchangeMatch[3] ? parseInt(exchangeMatch[3]) : 0;

      const scope = inferScope(trimmed);
      const removes = resolveWargearIds([removesStr]);
      const adds = resolveWargearIds([addsStr]);

      options.push({
        type: 'exchange',
        description: trimmed,
        removes,
        adds,
        pointsCost,
        scope,
      });
      continue;
    }

    // Pattern: "X may take Y for +N pts"
    const addMatch = trimmed.match(
      /(?:(?:any|one|each|the|all)\s+)?(?:model(?:s)?|.*?)\s+may\s+(?:take|be\s+equipped\s+with|have)\s+(?:a\s+|an\s+)?(.+?)(?:\s+for\s+(?:\+?(\d+)\s+[Pp]oints?|[Ff]ree))?\.?$/i
    );
    if (addMatch) {
      const addsStr = addMatch[1].trim();
      const pointsCost = addMatch[2] ? parseInt(addMatch[2]) : 0;
      const scope = inferScope(trimmed);
      const adds = resolveWargearIds([addsStr]);

      options.push({
        type: 'add',
        description: trimmed,
        adds,
        pointsCost,
        scope,
      });
      continue;
    }

    // Pattern: Direct points cost "Item Name (+N pts)" or just a description
    const directPointsMatch = trimmed.match(/(.+?)\s+(?:for\s+)?\+(\d+)\s+[Pp]oints?/);
    if (directPointsMatch) {
      const addsStr = directPointsMatch[1].trim().replace(/^(?:a|an|one)\s+/i, '');
      const pointsCost = parseInt(directPointsMatch[2]);
      const adds = resolveWargearIds([addsStr]);

      options.push({
        type: 'add',
        description: trimmed,
        adds,
        pointsCost,
        scope: inferScope(trimmed),
      });
      continue;
    }

    // Fallback: keep as unparsed option with description only
    if (trimmed.length > 5) {
      options.push({
        type: 'upgrade',
        description: trimmed,
        adds: [],
        pointsCost: 0,
        scope: 'any-model',
      });
    }
  }

  return options;
}

function inferScope(text: string): 'any-model' | 'one-model' | 'all-models' | 'leader' | number {
  const lower = text.toLowerCase();
  if (lower.includes('any model')) return 'any-model';
  if (lower.includes('all models') || lower.includes('the entire unit') || lower.includes('entire unit')) return 'all-models';
  if (lower.includes('one model') || lower.includes('one in every')) return 'one-model';
  if (lower.includes('sergeant') || lower.includes('leader') || lower.includes('centurion')) return 'leader';
  if (lower.includes('this model')) return 'one-model';

  // Check for "up to X models" pattern
  const upToMatch = lower.match(/up to (\d+)/);
  if (upToMatch) return parseInt(upToMatch[1]);

  return 'any-model';
}

// ─── Dedicated Weapon Conversion ────────────────────────────────────────────

function convertDedicatedWeapon(parsed: ParsedDedicatedWeapon, unitId: string): DedicatedWeapon | null {
  if (parsed.profiles.length === 0) return null;

  const firstProfile = parsed.profiles[0];
  const weaponId = `${unitId}-${parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

  if (parsed.category === 'ranged') {
    const profile = convertRangedWeaponProfile(firstProfile);
    if (!profile) return null;
    return {
      id: weaponId,
      name: parsed.name,
      category: 'ranged',
      profile,
      description: parsed.description || undefined,
    };
  } else {
    const profile = convertMeleeWeaponProfile(firstProfile);
    if (!profile) return null;
    return {
      id: weaponId,
      name: parsed.name,
      category: 'melee',
      profile,
      description: parsed.description || undefined,
    };
  }
}

function convertRangedWeaponProfile(parsed: ParsedWeaponProfile): RangedWeaponInline | null {
  const stats = parsed.stats;
  const range = parseStatInt(stats['R'] || stats['Range'] || '0');
  const firepower = parseStatInt(stats['FP'] || stats['Firepower'] || '1');
  const rangedStrength = parseStatInt(stats['RS'] || stats['S'] || stats['Str'] || '0');
  const ap = parseStatIntOrNull(stats['AP'] || '-');
  const damage = parseStatInt(stats['D'] || stats['Dmg'] || '1');

  // Special rules from the stats (if any SR column)
  const srText = stats['SR'] || stats['Special Rules'] || '';
  const specialRules = srText && srText !== '-'
    ? srText.split(/,\s*/).map(parseSpecialRuleRef)
    : [];

  return {
    range,
    hasTemplate: range === 0 && (stats['R'] || '').toLowerCase().includes('template'),
    firepower,
    rangedStrength,
    ap,
    damage,
    specialRules,
    traits: [],
  };
}

function convertMeleeWeaponProfile(parsed: ParsedWeaponProfile): MeleeWeaponInline | null {
  const stats = parsed.stats;

  const im = parseStatModifier(stats['IM'] || 'I');
  const am = parseStatModifier(stats['AM'] || 'A');
  const sm = parseStatModifier(stats['SM'] || 'S');
  const ap = parseStatIntOrNull(stats['AP'] || '-');
  const damage = parseStatInt(stats['D'] || stats['Dmg'] || '1');

  const srText = stats['SR'] || stats['Special Rules'] || '';
  const specialRules = srText && srText !== '-'
    ? srText.split(/,\s*/).map(parseSpecialRuleRef)
    : [];

  return {
    initiativeModifier: im,
    attacksModifier: am,
    strengthModifier: sm,
    ap,
    damage,
    specialRules,
    traits: [],
  };
}

function parseStatInt(val: string): number {
  if (!val || val === '-' || val.trim() === '') return 0;
  const num = parseInt(val.replace(/[^0-9-]/g, ''));
  return isNaN(num) ? 0 : num;
}

function parseStatIntOrNull(val: string): number | null {
  if (!val || val === '-' || val.trim() === '' || val.trim() === '-') return null;
  const num = parseInt(val.replace(/[^0-9]/g, ''));
  return isNaN(num) ? null : num;
}

function parseStatModifier(val: string): number | string | { op: string; value: number } {
  if (!val || val === '-') return 'I';
  const trimmed = val.trim();
  if (trimmed === 'I' || trimmed === 'A' || trimmed === 'S') return trimmed;
  if (trimmed.startsWith('+')) return { op: 'add', value: parseInt(trimmed.slice(1)) || 0 };
  if (trimmed.startsWith('-')) return { op: 'subtract', value: parseInt(trimmed.slice(1)) || 0 };
  if (trimmed.startsWith('x') || trimmed.startsWith('×')) return { op: 'multiply', value: parseInt(trimmed.slice(1)) || 1 };
  const num = parseInt(trimmed);
  return isNaN(num) ? trimmed : num;
}

// ─── Access Points Parsing ──────────────────────────────────────────────────

function parseAccessPoints(text: string): AccessPoint[] | undefined {
  if (!text || text.trim() === '') return undefined;

  const points: AccessPoint[] = [];
  // Simple parsing: split by comma or numbered items
  const parts = text.split(/,\s*/);
  let xOffset = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    points.push({
      name: trimmed,
      relativePosition: { x: xOffset, y: 0 },
    });
    xOffset += 2; // Spread access points along the hull
  }
  return points.length > 0 ? points : undefined;
}

// ─── Model Definition Building ──────────────────────────────────────────────

function buildModelDefinitions(parsed: ParsedUnit): ModelDefinition[] {
  const definitions: ModelDefinition[] = [];
  const compositionModels = parsed.composition.models;

  for (const modelStats of parsed.models) {
    // Find the matching composition entry by fuzzy name match
    const compEntry = findCompositionMatch(modelStats.name, compositionModels);

    // Determine characteristics
    const characteristics = modelStats.characteristics || modelStats.vehicleCharacteristics;
    if (!characteristics) continue;

    // Determine if this model is the leader
    const isLeader = determineIsLeader(modelStats.name, parsed.typeEntries, compositionModels);

    // Determine if this is the additional model type
    const isAdditionalModelType = determineIsAdditionalType(modelStats.name, parsed.additional, compositionModels);

    // Count in base from composition
    const countInBase = compEntry ? compEntry.count : 1;

    // Model-specific wargear
    const modelWargear = parsed.wargearByModel[modelStats.name];
    const defaultWargear = modelWargear ? resolveWargearIds(modelWargear) : undefined;

    // Model-specific special rules from type entries
    const modelTypeEntry = parsed.typeEntries.find(te =>
      te.modelName.toLowerCase() === modelStats.name.toLowerCase()
    );
    const modelSpecialRules = modelTypeEntry?.subTypes
      .filter(st => st.toLowerCase().includes('psyker'))
      .map(st => parseSpecialRuleRef(st));

    definitions.push({
      name: modelStats.name,
      baseSizeMM: modelStats.baseSizeMM || 32,
      countInBase,
      isAdditionalModelType,
      characteristics,
      isLeader,
      defaultWargear: defaultWargear && defaultWargear.length > 0 ? defaultWargear : undefined,
      specialRules: modelSpecialRules && modelSpecialRules.length > 0 ? modelSpecialRules : undefined,
    });
  }

  // If no model definitions were created from stat tables, create a single default
  if (definitions.length === 0 && compositionModels.length > 0) {
    // Fallback: create model definitions from composition without stats
    for (const compModel of compositionModels) {
      definitions.push({
        name: compModel.name,
        baseSizeMM: 32,
        countInBase: compModel.count,
        isAdditionalModelType: compositionModels.length > 1 && compModel === compositionModels[compositionModels.length - 1],
        characteristics: {
          M: 7, WS: 4, BS: 4, S: 4, T: 4, W: 1, I: 4, A: 1,
          LD: 8, CL: 7, WP: 7, IN: 7, SAV: 3, INV: null,
        },
        isLeader: compModel === compositionModels[0] && compModel.count === 1 && compositionModels.length > 1,
      });
    }
  }

  return definitions;
}

function findCompositionMatch(
  modelName: string,
  compositionModels: { name: string; count: number }[],
): { name: string; count: number } | undefined {
  const modelLower = modelName.toLowerCase();

  // Direct match
  for (const comp of compositionModels) {
    if (comp.name.toLowerCase() === modelLower) return comp;
  }

  // Partial match: model name contains composition name or vice versa
  for (const comp of compositionModels) {
    const compLower = comp.name.toLowerCase();
    if (modelLower.includes(compLower) || compLower.includes(modelLower)) return comp;
  }

  // Singularize/pluralize matching
  for (const comp of compositionModels) {
    const compLower = comp.name.toLowerCase();
    const singularComp = compLower.replace(/ies$/, 'y').replace(/s$/, '');
    const singularModel = modelLower.replace(/ies$/, 'y').replace(/s$/, '');
    if (singularModel === singularComp) return comp;
    if (singularModel.includes(singularComp) || singularComp.includes(singularModel)) return comp;
  }

  // Word overlap matching
  for (const comp of compositionModels) {
    const compWords = comp.name.toLowerCase().split(/\s+/);
    const modelWords = modelLower.split(/\s+/);
    const overlap = compWords.filter(w => modelWords.includes(w));
    if (overlap.length > 0) return comp;
  }

  return undefined;
}

function determineIsLeader(
  modelName: string,
  typeEntries: ParsedTypeEntry[],
  compositionModels: { name: string; count: number }[],
): boolean {
  const lower = modelName.toLowerCase();

  // Check type entries for Sergeant/Command sub-types
  for (const entry of typeEntries) {
    if (entry.modelName.toLowerCase() === lower || !entry.modelName) {
      const hasLeaderSubType = entry.subTypes.some(st => {
        const stLower = st.toLowerCase();
        return stLower === 'sergeant' || stLower === 'command' || stLower === 'unique';
      });
      if (hasLeaderSubType) return true;
    }
  }

  // Check common leader name patterns
  if (
    lower.includes('sergeant') ||
    lower.includes('centurion') ||
    lower.includes('praetor') ||
    lower.includes('champion') ||
    lower.includes('master') ||
    lower.includes('consul')
  ) {
    return true;
  }

  // Single model in first composition slot with more models after
  if (compositionModels.length > 1) {
    const first = compositionModels[0];
    if (first.count === 1 && first.name.toLowerCase().includes(lower.replace('legion ', ''))) {
      return true;
    }
  }

  return false;
}

function determineIsAdditionalType(
  modelName: string,
  additionalText: string,
  compositionModels: { name: string; count: number }[],
): boolean {
  if (!additionalText) {
    // If no ADDITIONAL text and multiple model types, the non-leader is additional
    if (compositionModels.length > 1) {
      const lastComp = compositionModels[compositionModels.length - 1];
      const lower = modelName.toLowerCase();
      const lastLower = lastComp.name.toLowerCase();
      const singularLast = lastLower.replace(/ies$/, 'y').replace(/s$/, '');
      const singularModel = lower.replace(/ies$/, 'y').replace(/s$/, '');
      return singularModel === singularLast || singularModel.includes(singularLast) || singularLast.includes(singularModel);
    }
    // Single model type = it IS the additional type
    return compositionModels.length === 1;
  }

  // Match against the ADDITIONAL text
  const additionalLower = additionalText.toLowerCase();
  const modelLower = modelName.toLowerCase();

  // "additional Legionaries" → Legionary is the additional type
  const singularModel = modelLower.replace(/ies$/, 'y').replace(/s$/, '');
  return additionalLower.includes(modelLower) || additionalLower.includes(singularModel);
}

// ─── Type Resolution ────────────────────────────────────────────────────────

function resolveUnitType(parsed: ParsedUnit): ModelType {
  // Use type entries first
  if (parsed.typeEntries.length > 0) {
    const firstEntry = parsed.typeEntries[0];
    const mapped = MODEL_TYPE_MAP[firstEntry.primaryType.toLowerCase()];
    if (mapped) return mapped;
  }

  // Fallback: check isVehicle flag
  if (parsed.isVehicle) return ModelType.Vehicle;

  return ModelType.Infantry;
}

function resolveUnitSubTypes(parsed: ParsedUnit): ModelSubType[] {
  const subTypes = new Set<ModelSubType>();

  for (const entry of parsed.typeEntries) {
    for (const st of entry.subTypes) {
      const mapped = MODEL_SUBTYPE_MAP[st.toLowerCase()];
      if (mapped) subTypes.add(mapped);
    }
  }

  return Array.from(subTypes);
}

// ─── Main Converter ─────────────────────────────────────────────────────────

/**
 * Convert a ParsedUnit (from the markdown parser) into a UnitProfile (for engine/UI).
 */
export function convertParsedUnitToProfile(parsed: ParsedUnit): UnitProfile {
  const modelDefinitions = buildModelDefinitions(parsed);

  // Resolve unit-level default wargear to weapon IDs
  const defaultWargear = resolveWargearIds(parsed.defaultWargear);

  // Parse wargear options from OPTIONS text
  const wargearOptions = parseOptionsText(parsed.optionsRaw);

  // Parse special rules
  const specialRules = parsed.specialRules
    .filter(r => !r.startsWith('[')) // Filter out variant headers like [Praetor]
    .map(parseSpecialRuleRef);

  // Parse traits
  const traits = parsed.traits.map(parseTrait);

  // Resolve type
  const unitType = resolveUnitType(parsed);
  const unitSubTypes = resolveUnitSubTypes(parsed);

  // Convert dedicated weapons
  const dedicatedWeapons = parsed.dedicatedWeapons
    .map(dw => convertDedicatedWeapon(dw, parsed.id))
    .filter((dw): dw is DedicatedWeapon => dw !== null);

  // Parse access points
  const accessPoints = parseAccessPoints(parsed.accessPoints);

  return {
    id: parsed.id,
    name: parsed.name,
    titles: parsed.titles || undefined,
    lore: parsed.lore || undefined,
    basePoints: parsed.basePoints,
    battlefieldRole: parsed.battlefieldRole,
    modelDefinitions,
    minModels: parsed.composition.baseModelCount,
    maxModels: parsed.composition.baseModelCount + parsed.composition.maxAdditional,
    pointsPerAdditionalModel: parsed.composition.pointsPerAdditional,
    defaultWargear,
    wargearOptions,
    specialRules,
    traits,
    unitType,
    unitSubTypes,
    accessPoints,
    dedicatedWeapons: dedicatedWeapons.length > 0 ? dedicatedWeapons : undefined,
  };
}

/**
 * Convert all parsed units into UnitProfile array.
 */
export function convertAllParsedUnits(parsedUnits: ParsedUnit[]): UnitProfile[] {
  return parsedUnits.map(convertParsedUnitToProfile);
}
