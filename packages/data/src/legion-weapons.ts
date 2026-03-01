/**
 * Legion-Specific Weapon Database — All ranged and melee weapon profiles unique to each Legion.
 * Reference: HH_Legiones_Astartes.md — legion-specific weapon tables
 *
 * This file contains legion-specific weapons for all 18 Legiones Astartes.
 * Generic weapons shared across legions are in weapons.ts.
 */

import type { RangedWeaponProfile, MeleeWeaponProfile, SpecialRuleRef, StatModifier } from '@hh/types';

// ─── Helper: Parse special rule string like "Breaching (4+)" ──────────────────

function parseSpecialRule(str: string): SpecialRuleRef {
  const match = str.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), value: match[2].trim() };
  }
  return { name: str.trim() };
}

function parseRules(rules: string[]): SpecialRuleRef[] {
  return rules.filter(r => r !== '-' && r !== '').map(parseSpecialRule);
}

// ─── Helper: Parse stat modifier for melee weapons ────────────────────────────

function parseMeleeStatMod(val: string | number): StatModifier {
  if (typeof val === 'number') return val;
  if (val === 'I' || val === 'A' || val === 'S') return val;
  if (val.startsWith('+')) return { op: 'add', value: parseInt(val.slice(1)) };
  if (val.startsWith('-')) return { op: 'subtract', value: parseInt(val.slice(1)) };
  if (val.startsWith('x') || val.startsWith('×')) return { op: 'multiply', value: parseInt(val.slice(1)) };
  return parseInt(val);
}

// ─── Ranged Weapon Factory ────────────────────────────────────────────────────

function ranged(
  id: string, name: string, range: number, firepower: number, rangedStrength: number,
  ap: number | null, damage: number, specialRules: string[], traits: string[],
  opts?: { hasTemplate?: boolean; parentWeaponId?: string; rangeBand?: { min: number; max: number } }
): RangedWeaponProfile {
  return {
    id, name, range,
    hasTemplate: opts?.hasTemplate ?? false,
    firepower, rangedStrength,
    ap, damage,
    specialRules: parseRules(specialRules),
    traits,
    parentWeaponId: opts?.parentWeaponId,
    rangeBand: opts?.rangeBand,
  };
}

// ─── Melee Weapon Factory ─────────────────────────────────────────────────────

function melee(
  id: string, name: string, im: string | number, am: string | number, sm: string | number,
  ap: number | null, damage: number, specialRules: string[], traits: string[],
  opts?: { parentWeaponId?: string }
): MeleeWeaponProfile {
  return {
    id, name,
    initiativeModifier: parseMeleeStatMod(im),
    attacksModifier: parseMeleeStatMod(am),
    strengthModifier: parseMeleeStatMod(sm),
    ap, damage,
    specialRules: parseRules(specialRules),
    traits,
    parentWeaponId: opts?.parentWeaponId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// I — DARK ANGELS
// ═══════════════════════════════════════════════════════════════════════════════

export const DARK_ANGELS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('calibanite-warblade', 'Calibanite warblade', 'I', 'A', '+1', 3, 1,
    ['Breaching (5+)'], ['Sword of the Order']),
  melee('terranic-greatsword', 'Terranic greatsword', '-1', 'A', '+2', 3, 2,
    ['Breaching (5+)'], ['Sword of the Order']),
  melee('calibanite-charge-blade-uncharged', 'Calibanite charge-blade — Uncharged', '+2', 'A', 'S', 4, 1,
    [], [], { parentWeaponId: 'calibanite-charge-blade' }),
  melee('calibanite-charge-blade-charged', 'Calibanite charge-blade — Charged', '-1', 'A', '+1', 3, 1,
    ['Breaching (6+)'], [], { parentWeaponId: 'calibanite-charge-blade' }),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('plasma-burner-sustained', 'Plasma burner — Sustained', 0, 1, 5, 4, 1,
    ['Template'], ['Plasma'], { hasTemplate: true, parentWeaponId: 'plasma-burner' }),
  ranged('plasma-burner-maximal', 'Plasma burner — Maximal', 0, 1, 6, 4, 1,
    ['Template', 'Overload (1)'], ['Plasma'], { hasTemplate: true, parentWeaponId: 'plasma-burner' }),
  ranged('plasma-incinerator-sustained', 'Plasma incinerator — Sustained', 0, 1, 5, 4, 2,
    ['Template'], ['Plasma'], { hasTemplate: true, parentWeaponId: 'plasma-incinerator' }),
  ranged('plasma-incinerator-maximal', 'Plasma incinerator — Maximal', 0, 1, 6, 4, 2,
    ['Template', 'Overload (1)'], ['Plasma'], { hasTemplate: true, parentWeaponId: 'plasma-incinerator' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// III — EMPEROR'S CHILDREN
// ═══════════════════════════════════════════════════════════════════════════════

export const EMPERORS_CHILDREN_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('sonic-lance', 'Sonic lance', 0, 1, 2, 5, 1,
    ['Template', 'Breaching (6+)'], ['Assault', 'Sonic'], { hasTemplate: true }),
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('phoenix-power-spear', 'Phoenix power spear', '+1', 'A', '+1', 3, 1,
    ['Impact (D)', 'Breaching (6+)'], ['Power']),
  melee('phoenix-rapier', 'Phoenix rapier', 'I', 'A', 'S', 3, 1,
    ['Impact (D)', 'Breaching (6+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// IV — IRON WARRIORS
// ═══════════════════════════════════════════════════════════════════════════════

export const IRON_WARRIORS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('graviton-crusher', 'Graviton crusher', '-2', 'A', '+4', 2, 2,
    ['Armourbane', 'Shock (Pinned)'], ['Graviton']),
  melee('graviton-mace', 'Graviton mace', '-1', 'A', '+3', 3, 1,
    ['Armourbane', 'Shock (Pinned)'], ['Graviton']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('shrapnel-pistol', 'Shrapnel pistol', 10, 1, 4, null, 1,
    ['Pistol', 'Pinning (0)'], ['Bolt']),
  ranged('shrapnel-bolter', 'Shrapnel bolter', 18, 2, 4, null, 1,
    ['Pinning (0)'], ['Bolt']),
  ranged('shrapnel-cannon', 'Shrapnel cannon', 36, 3, 5, 5, 1,
    ['Pinning (0)', 'Shred (6+)'], ['Bolt']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// V — WHITE SCARS
// ═══════════════════════════════════════════════════════════════════════════════

export const WHITE_SCARS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('power-glaive', 'Power glaive', 'I', 'A', '+1', 3, 1,
    ['Impact (AP)', 'Breaching (5+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// VI — SPACE WOLVES
// ═══════════════════════════════════════════════════════════════════════════════

export const SPACE_WOLVES_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('fenrisian-axe', 'Fenrisian axe', 'I', 'A', '+1', null, 1,
    ['Reaping Blow (1)'], ['Chain']),
  melee('frost-sword', 'Frost sword', 'I', 'A', '+1', 3, 1,
    ['Breaching (5+)', 'Reaping Blow (1)'], ['Power']),
  melee('frost-axe', 'Frost axe', '-1', 'A', '+1', 3, 1,
    ['Breaching (4+)', 'Reaping Blow (1)'], ['Power']),
  melee('frost-claw', 'Frost claw', 'I', 'A', 'S', 3, 1,
    ['Breaching (4+)', 'Reaping Blow (1)', 'Shred (6+)'], ['Power']),
  melee('great-frost-blade', 'Great frost blade', '-2', 'A', '+3', 2, 2,
    ['Reaping Blow (1)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// VII — IMPERIAL FISTS
// ═══════════════════════════════════════════════════════════════════════════════

export const IMPERIAL_FISTS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('solarite-power-gauntlet', 'Solarite power gauntlet', '-3', 'A', '+4', 2, 2,
    ['Critical Hit (6+)'], ['Power']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('iliastus-assault-cannon-sustained', 'Iliastus assault cannon — Sustained', 24, 3, 6, 4, 1,
    ['Heavy (FP)', 'Breaching (6+)'], ['Auto'], { parentWeaponId: 'iliastus-assault-cannon' }),
  ranged('iliastus-assault-cannon-maximal', 'Iliastus assault cannon — Maximal', 24, 5, 6, 4, 1,
    ['Heavy (FP)', 'Breaching (6+)', 'Overload (1)'], ['Auto'], { parentWeaponId: 'iliastus-assault-cannon' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// VIII — NIGHT LORDS
// ═══════════════════════════════════════════════════════════════════════════════

export const NIGHT_LORDS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('chainglaive', 'Chainglaive', 'I', 'A', '+1', 3, 1,
    ['Breaching (6+)', 'Shred (6+)'], ['Chain']),
  melee('headsmans-axe', "Headsman's axe", '-2', 'A', '+2', 2, 2,
    ['Critical Hit (6+)'], ['Chain']),
  melee('escaton-power-claw', 'Escaton power claw', '-2', 'A', '+3', 2, 2,
    ['Shred (6+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// IX — BLOOD ANGELS
// ═══════════════════════════════════════════════════════════════════════════════

export const BLOOD_ANGELS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('inferno-pistol', 'Inferno pistol', 6, 1, 8, 2, 1,
    ['Pistol', 'Melta (3)'], ['Assault', 'Melta']),
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('blade-of-perdition', 'Blade of Perdition', 'I', 'A', 'S', 3, 1,
    ['Aflame (1)', 'Breaching (6+)'], ['Power']),
  melee('axe-of-perdition', 'Axe of Perdition', '-1', 'A', '+1', 3, 1,
    ['Aflame (1)', 'Breaching (5+)'], ['Power']),
  melee('maul-of-perdition', 'Maul of Perdition', '-1', 'A', '+2', 3, 1,
    ['Aflame (1)', 'Breaching (6+)'], ['Power']),
  melee('spear-of-perdition', 'Spear of Perdition', '+1', 'A', 'S', 3, 1,
    ['Aflame (1)', 'Precision (6+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// X — IRON HANDS
// ═══════════════════════════════════════════════════════════════════════════════

export const IRON_HANDS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('artificer-power-axe', 'Artificer power axe', '-1', 'A', '+1', 3, 1,
    ['Breaching (5+)', 'Shred (5+)'], ['Power']),
  ranged('graviton-pistol', 'Graviton pistol', 12, 2, 6, 4, 1,
    ['Pistol', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (1)'], ['Graviton']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XII — WORLD EATERS
// ═══════════════════════════════════════════════════════════════════════════════

export const WORLD_EATERS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('meteor-hammer', 'Meteor hammer', 'I', '-1', '+2', 3, 2,
    ['Impact (IM)'], ['Power']),
  melee('excoriator-chainaxe', 'Excoriator chainaxe', '-2', 'A', '+2', 3, 1,
    ['Breaching (6+)', 'Shred (6+)'], ['Chain']),
  melee('paired-falax-blades', 'Paired falax blades', 'I', '+2', 'S', 3, 1,
    [], ['Power']),
  melee('barb-hook-lash', 'Barb-hook lash', '+1', 'A', 'S', 3, 1,
    ['Critical Hit (6+)', 'Phage (S)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XIII — ULTRAMARINES
// ═══════════════════════════════════════════════════════════════════════════════

export const ULTRAMARINES_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('legatine-axe', 'Legatine axe', 'I', 'A', '+1', 3, 1,
    ['Breaching (4+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XIV — DEATH GUARD
// ═══════════════════════════════════════════════════════════════════════════════

export const DEATH_GUARD_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('power-scythe', 'Power scythe', '-1', 'A', '+1', 3, 1,
    ['Reaping Blow (2)', 'Breaching (5+)'], ['Power']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('alchem-flamer', 'Alchem flamer', 0, 1, 4, 5, 1,
    ['Template', 'Poisoned (2+)'], ['Flame'], { hasTemplate: true }),
  ranged('alchem-combi-flamer', 'Alchem combi-flamer', 24, 2, 4, 5, 1,
    [], ['Bolt']),
  ranged('alchem-combi-flamer-secondary', 'Alchem combi-flamer — Secondary', 0, 1, 4, 5, 1,
    ['Template', 'Poisoned (2+)', 'Limited (1)', 'Combi'], ['Flame'], { hasTemplate: true, parentWeaponId: 'alchem-combi-flamer' }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XV — THOUSAND SONS
// ═══════════════════════════════════════════════════════════════════════════════

export const THOUSAND_SONS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('achea-force-sword', 'Achea force sword', 'I', 'A', '+1', 3, 1,
    ['Breaching (5+)', 'Force (D)'], ['Psychic']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('asphyx-pistol', 'Asphyx pistol', 8, 1, 4, 5, 1,
    ['Pistol', 'Rending (6+)'], ['Bolt']),
  ranged('asphyx-bolter', 'Asphyx bolter', 18, 2, 4, 5, 1,
    ['Rending (6+)'], ['Bolt']),
  ranged('aether-fire-pistol', 'Aether-fire pistol', 10, 1, 6, 4, 2,
    ['Pistol', 'Breaching (6+)'], ['Psychic']),
  ranged('aether-fire-blaster', 'Aether-fire blaster', 18, 2, 6, 4, 2,
    ['Breaching (6+)'], ['Psychic']),
  ranged('aether-fire-magna-cannon', 'Aether-fire magna-cannon', 24, 1, 6, 4, 2,
    ['Blast (5")', 'Breaching (6+)'], ['Psychic']),
  // ─── Prosperine Arcana — Psychic Cult Weapons ──────────────────────────────
  ranged('raptora-crushing-force', 'Raptora — Crushing Force', 12, 1, 9, 4, 2,
    ['Armourbane', 'Force (D)'], ['Psychic']),
  melee('pyrae-burning-grasp', 'Pyrae — Burning Grasp', 'I', 'A', 8, 3, 2,
    ['Critical Hit (6+)', 'Breaching (5+)', 'Armourbane'], ['Psychic']),
  ranged('pavoni-bloodboil', 'Pavoni — Bloodboil', 12, 1, 4, 2, 2,
    ['Poisoned (2+)'], ['Psychic']),
  ranged('athanaean-emanation-of-dread', 'Athanaean — Emanation of Dread', 24, 3, 4, null, 1,
    ['Panic (1)'], ['Psychic']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XVI — SONS OF HORUS
// ═══════════════════════════════════════════════════════════════════════════════

export const SONS_OF_HORUS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('banestrike-bolter', 'Banestrike bolter', 18, 2, 4, 4, 1,
    ['Breaching (6+)'], ['Bolt']),
  ranged('banestrike-combi-bolter', 'Banestrike combi-bolter', 18, 4, 4, 4, 1,
    ['Breaching (6+)'], ['Bolt']),
  ranged('banestrike-bolt-cannon', 'Banestrike bolt cannon', 24, 4, 6, 4, 2,
    ['Breaching (6+)'], ['Bolt']),
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('carsoran-power-axe', 'Carsoran power axe', '-1', 'A', '+1', 3, 1,
    ['Breaching (5+)', 'Shred (6+)'], ['Power']),
  melee('carsoran-power-tabar', 'Carsoran power tabar', '-2', 'A', '+2', 3, 1,
    ['Breaching (5+)', 'Shred (5+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XVII — WORD BEARERS
// ═══════════════════════════════════════════════════════════════════════════════

export const WORD_BEARERS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('tainted-weapon', 'Tainted weapon', 'I', 'A', 'S', 3, 1,
    ['Breaching (6+)', 'Phage (S)'], ['Psychic']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('warpfire-pistol', 'Warpfire pistol', 12, 1, 5, 4, 1,
    ['Pistol', 'Breaching (5+)', 'Shred (6+)'], ['Plasma']),
  ranged('warpfire-blaster', 'Warpfire blaster', 24, 2, 5, 4, 1,
    ['Breaching (5+)', 'Shred (6+)'], ['Plasma']),
  ranged('warpfire-projector', 'Warpfire projector', 36, 1, 5, 4, 1,
    ['Heavy (RS)', 'Blast (3")', 'Breaching (5+)', 'Shred (6+)'], ['Plasma']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XVIII — SALAMANDERS
// ═══════════════════════════════════════════════════════════════════════════════

export const SALAMANDERS_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  // ─── Melee ──────────────────────────────────────────────────────────────────
  melee('forge-crafted-power-sword', 'Forge-crafted power sword', 'I', '+1', 'S', 3, 1,
    ['Breaching (6+)'], ['Power']),
  melee('forge-crafted-power-axe', 'Forge-crafted power axe', '-1', '+1', '+1', 3, 1,
    ['Breaching (5+)'], ['Power']),
  melee('forge-crafted-power-maul', 'Forge-crafted power maul', '-1', '+1', '+2', 4, 1,
    [], ['Power']),
  melee('forge-crafted-power-lance', 'Forge-crafted power lance', '+1', '+1', 'S', 3, 1,
    ['Impact (S)'], ['Power']),
  melee('forge-crafted-thunder-hammer', 'Forge-crafted thunder hammer', '-2', '+1', '+3', 2, 2,
    [], ['Power']),
  melee('forge-crafted-power-fist', 'Forge-crafted power fist', '-3', 'A', '+4', 2, 3,
    [], ['Power']),
  // ─── Ranged ─────────────────────────────────────────────────────────────────
  ranged('forge-crafted-hand-flamer', 'Forge-crafted hand flamer', 0, 1, 3, 6, 2,
    ['Template', 'Pistol'], ['Flame'], { hasTemplate: true }),
  ranged('forge-crafted-flamer', 'Forge-crafted flamer', 0, 1, 4, 5, 2,
    ['Template'], ['Flame'], { hasTemplate: true }),
  ranged('forge-crafted-heavy-flamer', 'Forge-crafted heavy flamer', 0, 1, 5, 4, 2,
    ['Template', 'Heavy (RS)'], ['Flame'], { hasTemplate: true }),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XIX — RAVEN GUARD
// ═══════════════════════════════════════════════════════════════════════════════

export const RAVEN_GUARD_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  melee('ravens-talon', "Raven's Talon", 'I', 'A', 'S', 3, 1,
    ['Impact (IM)', 'Rending (6+)', 'Breaching (6+)'], ['Power']),
  melee('pair-of-ravens-talons', "Pair of Raven's Talons", 'I', '+2', 'S', 3, 1,
    ['Impact (IM)', 'Rending (6+)', 'Breaching (6+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// XX — ALPHA LEGION
// ═══════════════════════════════════════════════════════════════════════════════

export const ALPHA_LEGION_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  ranged('venom-spheres', 'Venom spheres', 8, 1, 1, null, 1,
    ['Blast (3")', 'Poisoned (4+)'], ['Assault']),
  melee('power-dagger', 'Power dagger', '+2', 'A', '-1', 3, 1,
    ['Breaching (5+)'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED LEGION WEAPON DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/** All legion-specific weapons combined into a single array */
export const ALL_LEGION_WEAPONS: (RangedWeaponProfile | MeleeWeaponProfile)[] = [
  ...DARK_ANGELS_WEAPONS,
  ...EMPERORS_CHILDREN_WEAPONS,
  ...IRON_WARRIORS_WEAPONS,
  ...WHITE_SCARS_WEAPONS,
  ...SPACE_WOLVES_WEAPONS,
  ...IMPERIAL_FISTS_WEAPONS,
  ...NIGHT_LORDS_WEAPONS,
  ...BLOOD_ANGELS_WEAPONS,
  ...IRON_HANDS_WEAPONS,
  ...WORLD_EATERS_WEAPONS,
  ...ULTRAMARINES_WEAPONS,
  ...DEATH_GUARD_WEAPONS,
  ...THOUSAND_SONS_WEAPONS,
  ...SONS_OF_HORUS_WEAPONS,
  ...WORD_BEARERS_WEAPONS,
  ...SALAMANDERS_WEAPONS,
  ...RAVEN_GUARD_WEAPONS,
  ...ALPHA_LEGION_WEAPONS,
];

/** Index all legion weapons by ID for fast lookup */
const LEGION_WEAPONS_BY_ID: Record<string, RangedWeaponProfile | MeleeWeaponProfile> = {};
for (const weapon of ALL_LEGION_WEAPONS) {
  LEGION_WEAPONS_BY_ID[weapon.id] = weapon;
}

/**
 * Look up a legion-specific weapon by ID.
 */
export function findLegionWeapon(id: string): RangedWeaponProfile | MeleeWeaponProfile | undefined {
  return LEGION_WEAPONS_BY_ID[id];
}

/**
 * Look up legion-specific weapons by name (case-insensitive).
 * Returns all matching profiles (may be multiple for multi-profile weapons).
 */
export function findLegionWeaponByName(name: string): (RangedWeaponProfile | MeleeWeaponProfile)[] {
  const lower = name.toLowerCase();
  return ALL_LEGION_WEAPONS.filter(w => w.name.toLowerCase() === lower);
}
