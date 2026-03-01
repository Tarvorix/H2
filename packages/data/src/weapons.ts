/**
 * Weapon Database — All ranged and melee weapon profiles from HH_Legiones_Astartes.md
 * Reference: HH_Legiones_Astartes.md weapon tables
 *
 * This file contains the complete weapon database for the Legiones Astartes.
 * Weapons are organized by family (Bolt, Flame, Las, Melta, Plasma, Volkite, etc.)
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
// RANGED WEAPONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Bolt Weapons ─────────────────────────────────────────────────────────────

export const BOLT_WEAPONS: RangedWeaponProfile[] = [
  ranged('bolt-pistol', 'Bolt pistol', 12, 1, 4, 5, 1, ['Pistol'], ['Assault', 'Bolt']),
  ranged('bolter', 'Bolter', 24, 2, 4, 5, 1, [], ['Bolt']),
  ranged('twin-bolter', 'Twin bolter', 24, 4, 4, 5, 1, [], ['Bolt']),
  ranged('combi-bolter', 'Combi-bolter', 24, 4, 4, 5, 1, [], ['Bolt']),
  ranged('kraken-bolter', 'Kraken bolter', 30, 2, 4, 4, 1, ['Precision (4+)', 'Shot Selector'], ['Bolt']),
  ranged('nemesis-bolter', 'Nemesis bolter', 48, 1, 4, 5, 1, ['Heavy (RS)', 'Breaching (5+)', 'Pinning (1)', 'Precision (4+)'], ['Bolt']),
  ranged('heavy-bolter', 'Heavy bolter', 36, 3, 5, 4, 1, ['Heavy (FP)'], ['Bolt']),
  ranged('twin-heavy-bolter', 'Twin heavy bolter', 36, 6, 5, 4, 1, [], ['Bolt']),
  ranged('gravis-bolt-cannon', 'Gravis bolt cannon', 36, 6, 5, 4, 2, ['Heavy (FP)'], ['Bolt']),
  ranged('gravis-heavy-bolter-battery', 'Gravis heavy bolter battery', 36, 8, 5, 4, 1, ['Suppressive (2)'], ['Bolt']),
  ranged('twin-avenger-bolt-cannon', 'Twin Avenger bolt cannon', 36, 10, 6, 3, 1, ['Suppressive (2)'], ['Bolt']),
];

// ─── Combi Weapons ────────────────────────────────────────────────────────────

export const COMBI_WEAPONS: RangedWeaponProfile[] = [
  ranged('combi-bolter-primary', 'Bolter (Primary)', 24, 2, 4, 5, 1, ['Combi'], ['Bolt']),
  ranged('combi-flamer-secondary', 'Flamer (Secondary)', 0, 1, 4, 5, 1, ['Template', 'Panic (1)', 'Limited (1)', 'Combi'], ['Flame'], { hasTemplate: true }),
  ranged('combi-melta-secondary', 'Meltagun (Secondary)', 12, 1, 8, 2, 3, ['Melta (6)', 'Limited (1)', 'Combi'], ['Melta']),
  ranged('combi-plasma-secondary', 'Plasma gun (Secondary)', 24, 2, 6, 4, 1, ['Breaching (6+)', 'Limited (1)', 'Combi'], ['Plasma']),
  ranged('combi-volkite-secondary', 'Volkite charger (Secondary)', 15, 2, 5, 5, 1, ['Deflagrate (5)', 'Combi'], ['Volkite']),
  ranged('combi-grenade-secondary-krak', 'Grenade launcher (Secondary) - Krak', 24, 1, 6, 4, 2, ['Combi'], []),
  ranged('combi-grav-secondary', 'Graviton gun (Secondary)', 18, 1, 6, 4, 1, ['Blast (3")', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (1)', 'Limited (1)', 'Combi'], ['Graviton']),
];

// ─── Conversion Beam Weapons ──────────────────────────────────────────────────

export const CONVERSION_BEAM_WEAPONS: RangedWeaponProfile[] = [
  ranged('conversion-beam-cannon-short', 'Conversion beam cannon', 15, 1, 6, 4, 1, ['Heavy (RS)', 'Blast (3")'], ['Conversion'], { parentWeaponId: 'conversion-beam-cannon', rangeBand: { min: 0, max: 15 } }),
  ranged('conversion-beam-cannon-mid', 'Conversion beam cannon', 30, 1, 7, 3, 2, ['Heavy (RS)', 'Blast (3")'], ['Conversion'], { parentWeaponId: 'conversion-beam-cannon', rangeBand: { min: 15, max: 30 } }),
  ranged('conversion-beam-cannon-long', 'Conversion beam cannon', 45, 1, 8, 2, 3, ['Heavy (RS)', 'Blast (3")'], ['Conversion'], { parentWeaponId: 'conversion-beam-cannon', rangeBand: { min: 30, max: 45 } }),
  ranged('heavy-conversion-beam-cannon-short', 'Heavy conversion beam cannon', 15, 1, 6, 4, 1, ['Heavy (RS)', 'Blast (5")'], ['Conversion'], { parentWeaponId: 'heavy-conversion-beam-cannon', rangeBand: { min: 0, max: 15 } }),
  ranged('heavy-conversion-beam-cannon-mid', 'Heavy conversion beam cannon', 30, 1, 7, 3, 2, ['Heavy (RS)', 'Blast (5")'], ['Conversion'], { parentWeaponId: 'heavy-conversion-beam-cannon', rangeBand: { min: 15, max: 30 } }),
  ranged('heavy-conversion-beam-cannon-long', 'Heavy conversion beam cannon', 45, 1, 8, 2, 3, ['Heavy (RS)', 'Blast (5")'], ['Conversion'], { parentWeaponId: 'heavy-conversion-beam-cannon', rangeBand: { min: 30, max: 45 } }),
  ranged('inversion-beamer-short', 'Inversion beamer', 15, 1, 8, 2, 3, ['Heavy (RS)', 'Blast (5")'], ['Conversion'], { parentWeaponId: 'inversion-beamer', rangeBand: { min: 0, max: 15 } }),
  ranged('inversion-beamer-long', 'Inversion beamer', 30, 1, 7, 3, 2, ['Heavy (RS)', 'Blast (5")'], ['Conversion'], { parentWeaponId: 'inversion-beamer', rangeBand: { min: 15, max: 30 } }),
];

// ─── Disintegrator Weapons ────────────────────────────────────────────────────

export const DISINTEGRATOR_WEAPONS: RangedWeaponProfile[] = [
  ranged('disintegrator-pistol', 'Disintegrator pistol', 12, 1, 4, 3, 2, ['Pistol', 'Overload (1)'], ['Assault', 'Disintegrator']),
  ranged('disintegrator-rifle', 'Disintegrator rifle', 24, 1, 4, 3, 2, ['Overload (1)'], ['Disintegrator']),
  ranged('disintegrator-blaster', 'Disintegrator blaster', 18, 1, 5, 2, 2, ['Overload (1)'], ['Disintegrator']),
  ranged('heavy-disintegrator', 'Heavy disintegrator', 24, 1, 6, 2, 2, ['Heavy (FP)', 'Overload (1)'], ['Disintegrator']),
  ranged('twin-heavy-disintegrator', 'Twin heavy disintegrator', 24, 2, 7, 2, 2, ['Overload (2)'], ['Disintegrator']),
  ranged('disintegrator-cannon', 'Disintegrator cannon', 24, 2, 9, 2, 3, ['Overload (2)'], ['Disintegrator']),
];

// ─── Flame Weapons ────────────────────────────────────────────────────────────

export const FLAME_WEAPONS: RangedWeaponProfile[] = [
  ranged('hand-flamer', 'Hand flamer', 0, 1, 3, null, 1, ['Template', 'Pistol'], ['Assault', 'Flame'], { hasTemplate: true }),
  ranged('flamer', 'Flamer', 0, 1, 4, 5, 1, ['Template', 'Panic (1)'], ['Flame'], { hasTemplate: true }),
  ranged('heavy-flamer', 'Heavy flamer', 0, 1, 5, 4, 1, ['Template', 'Panic (1)'], ['Flame'], { hasTemplate: true }),
  ranged('twin-heavy-flamer', 'Twin heavy flamer', 0, 1, 5, 4, 1, ['Template', 'Panic (2)'], ['Flame'], { hasTemplate: true }),
  ranged('flamestorm-cannon', 'Flamestorm cannon', 0, 1, 6, 4, 2, ['Template', 'Panic (2)'], ['Flame'], { hasTemplate: true }),
  ranged('photonic-incinerator', 'Photonic incinerator', 0, 1, 6, 4, 1, ['Template', 'Panic (2)'], ['Assault', 'Flame'], { hasTemplate: true }),
];

// ─── Graviton Weapons ─────────────────────────────────────────────────────────

export const GRAVITON_WEAPONS: RangedWeaponProfile[] = [
  ranged('graviton-gun', 'Graviton gun', 18, 1, 6, 4, 1, ['Blast (3")', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (1)'], ['Graviton']),
  ranged('graviton-cannon', 'Graviton cannon', 36, 1, 8, 3, 1, ['Heavy (D)', 'Blast (3")', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (2)'], ['Graviton']),
  ranged('graviton-charge-cannon', 'Graviton-charge cannon', 24, 1, 9, 3, 2, ['Heavy (D)', 'Blast (5")', 'Barrage (1)', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (3)'], ['Graviton']),
  ranged('grav-flux-bombard', 'Grav-flux bombard', 18, 1, 7, 4, 1, ['Heavy (D)', 'Blast (5")', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (2)'], ['Graviton']),
  ranged('graviton-pulveriser', 'Graviton pulveriser', 18, 1, 9, 3, 3, ['Heavy (D)', 'Blast (3")', 'Breaching (6+)', 'Shock (Pinned)', 'Pinning (3)'], ['Graviton']),
  ranged('graviton-shredder', 'Graviton shredder', 18, 2, 6, 4, 1, ['Breaching (6+)', 'Shock (Pinned)', 'Pinning (1)'], ['Assault', 'Graviton']),
];

// ─── Las Weapons ──────────────────────────────────────────────────────────────

export const LAS_WEAPONS: RangedWeaponProfile[] = [
  ranged('lascannon', 'Lascannon', 48, 1, 9, 2, 1, ['Heavy (D)', 'Armourbane'], ['Las']),
  ranged('twin-lascannon', 'Twin lascannon', 48, 2, 9, 2, 1, ['Heavy (D)', 'Armourbane'], ['Las']),
  ranged('lascannon-array', 'Lascannon array', 48, 2, 9, 2, 3, ['Armourbane'], ['Las']),
  ranged('arachnus-heavy-lascannon-battery', 'Arachnus heavy lascannon battery', 48, 2, 9, 2, 4, ['Heavy (RS)', 'Armourbane', 'Skyfire'], ['Las']),
  ranged('laser-destroyer', 'Laser destroyer', 36, 2, 10, 2, 2, ['Heavy (D)', 'Armourbane'], ['Las']),
  ranged('magna-laser-destroyer', 'Magna laser destroyer', 36, 2, 10, 2, 3, ['Ordnance (D)', 'Armourbane'], ['Las']),
  ranged('neutron-beam-laser', 'Neutron beam laser', 36, 2, 10, 2, 2, ['Ordnance (D)', 'Armourbane', 'Shock (Suppressed)'], ['Las']),
  ranged('neutron-blaster', 'Neutron blaster', 24, 1, 9, 2, 3, ['Armourbane', 'Shock (Suppressed)', 'Overload (1)'], ['Las']),
  ranged('neutron-laser-battery', 'Neutron laser battery', 72, 3, 10, 2, 3, ['Ordnance (D)', 'Armourbane', 'Shock (Suppressed)', 'Overload (1)'], ['Las']),
  ranged('neutron-wave-cannon', 'Neutron-wave cannon', 120, 2, 12, 2, 4, ['Ordnance (D)', 'Armourbane', 'Shock (Stunned)'], ['Las']),
  ranged('turbo-laser-destructor', 'Turbo-laser destructor', 96, 1, 12, 2, 6, ['Blast (3")', 'Armourbane'], ['Las']),
  ranged('volcano-cannon', 'Volcano cannon', 120, 1, 13, 2, 12, ['Blast (3")'], ['Las']),
];

// ─── Melta Weapons ────────────────────────────────────────────────────────────

export const MELTA_WEAPONS: RangedWeaponProfile[] = [
  ranged('meltagun', 'Meltagun', 12, 1, 8, 2, 3, ['Melta (6)'], ['Melta']),
  ranged('multi-melta', 'Multi-melta', 24, 1, 8, 2, 3, ['Heavy (RS)', 'Melta (8)'], ['Melta']),
  ranged('melta-lance', 'Melta lance', 18, 1, 8, 2, 3, ['Melta (6)'], ['Assault', 'Melta']),
  ranged('twin-multi-melta', 'Twin multi-melta', 24, 2, 8, 2, 3, ['Melta (8)'], ['Melta']),
  ranged('melta-cannon', 'Melta cannon', 24, 2, 9, 2, 4, ['Heavy (D)', 'Melta (12)'], ['Melta']),
  ranged('cyclonic-melta-lance', 'Cyclonic melta lance', 24, 2, 9, 2, 5, ['Heavy (D)', 'Melta (8)'], ['Melta']),
];

// ─── Missile Weapons ──────────────────────────────────────────────────────────

export const MISSILE_WEAPONS: RangedWeaponProfile[] = [
  // Missile launcher profiles
  ranged('missile-launcher-frag', 'Missile launcher - Frag', 48, 1, 4, 5, 1, ['Blast (3")', 'Pinning (1)'], ['Missile'], { parentWeaponId: 'missile-launcher' }),
  ranged('missile-launcher-krak', 'Missile launcher - Krak', 48, 1, 8, 3, 2, ['Heavy (RS)'], ['Missile'], { parentWeaponId: 'missile-launcher' }),
  ranged('havoc-launcher', 'Havoc launcher', 48, 1, 5, 5, 1, ['Blast (3")', 'Pinning (1)'], ['Missile']),
  ranged('hunter-killer-missile', 'Hunter-killer missile', 48, 1, 8, 3, 2, ['Limited (1)'], ['Missile']),
  ranged('twin-missile-launcher-frag', 'Twin missile launcher - Frag', 48, 2, 4, 5, 1, ['Blast (3")', 'Pinning (1)'], ['Missile'], { parentWeaponId: 'twin-missile-launcher' }),
  ranged('twin-missile-launcher-krak', 'Twin missile launcher - Krak', 48, 2, 8, 3, 2, [], ['Missile'], { parentWeaponId: 'twin-missile-launcher' }),
  // Cyclone
  ranged('cyclone-missile-launcher-frag', 'Cyclone missile launcher - Frag', 48, 2, 4, 5, 1, ['Blast (3")', 'Pinning (1)'], ['Missile'], { parentWeaponId: 'cyclone-missile-launcher' }),
  ranged('cyclone-missile-launcher-krak', 'Cyclone missile launcher - Krak', 48, 2, 8, 3, 2, [], ['Missile'], { parentWeaponId: 'cyclone-missile-launcher' }),
  // Scorpius
  ranged('scorpius-multi-launcher', 'Scorpius multi-launcher', 48, 3, 6, 3, 1, ['Barrage (2)', 'Blast (3")', 'Pinning (2)'], ['Missile']),
  // Typhon
  ranged('dreadhammer-siege-cannon', 'Dreadhammer siege cannon', 24, 1, 10, 2, 4, ['Ordnance (D)', 'Blast (7")', 'Pinning (3)'], ['Missile']),
];

// ─── Plasma Weapons ───────────────────────────────────────────────────────────

export const PLASMA_WEAPONS: RangedWeaponProfile[] = [
  ranged('plasma-pistol', 'Plasma pistol', 12, 1, 6, 4, 1, ['Pistol', 'Breaching (6+)'], ['Assault', 'Plasma']),
  ranged('plasma-gun', 'Plasma gun', 24, 2, 6, 4, 1, ['Breaching (6+)'], ['Plasma']),
  ranged('plasma-cannon', 'Plasma cannon', 36, 1, 7, 3, 2, ['Heavy (FP)', 'Blast (3")', 'Breaching (6+)'], ['Plasma']),
  ranged('plasma-blaster', 'Plasma blaster', 18, 2, 7, 3, 1, ['Breaching (5+)'], ['Assault', 'Plasma']),
  ranged('gravis-plasma-cannon', 'Gravis plasma cannon', 36, 2, 7, 3, 2, ['Heavy (FP)', 'Blast (3")', 'Breaching (5+)'], ['Plasma']),
  ranged('twin-plasma-gun', 'Twin plasma gun', 24, 4, 6, 4, 1, ['Breaching (6+)'], ['Plasma']),
  ranged('executioner-plasma-destroyer', 'Executioner plasma destroyer', 48, 2, 7, 3, 3, ['Heavy (D)', 'Blast (3")', 'Breaching (5+)'], ['Plasma']),
  ranged('magna-plasma-destroyer', 'Magna plasma destroyer', 48, 3, 8, 2, 3, ['Ordnance (D)', 'Blast (5")', 'Breaching (4+)'], ['Plasma']),
];

// ─── Volkite Weapons ──────────────────────────────────────────────────────────

export const VOLKITE_WEAPONS: RangedWeaponProfile[] = [
  ranged('volkite-serpenta', 'Volkite serpenta', 10, 2, 5, 5, 1, ['Pistol', 'Deflagrate (5)'], ['Assault', 'Volkite']),
  ranged('volkite-charger', 'Volkite charger', 15, 2, 5, 5, 1, ['Deflagrate (5)'], ['Volkite']),
  ranged('volkite-caliver', 'Volkite caliver', 30, 2, 6, 5, 1, ['Heavy (FP)', 'Deflagrate (6)'], ['Volkite']),
  ranged('volkite-culverin', 'Volkite culverin', 45, 4, 6, 5, 2, ['Heavy (FP)', 'Deflagrate (6)'], ['Volkite']),
  ranged('twin-volkite-culverin', 'Twin volkite culverin', 45, 8, 6, 5, 2, ['Deflagrate (6)'], ['Volkite']),
  ranged('volkite-macro-saker', 'Volkite macro-saker', 24, 5, 7, 4, 1, ['Deflagrate (5)'], ['Volkite']),
  ranged('volkite-dual-culverin', 'Volkite dual-culverin', 45, 6, 6, 5, 2, ['Deflagrate (6)'], ['Volkite']),
  ranged('volkite-cardanelle', 'Volkite cardanelle', 45, 8, 8, 3, 2, ['Heavy (FP)', 'Deflagrate (5)'], ['Volkite']),
];

// ─── Autocannon & Misc Heavy Weapons ─────────────────────────────────────────

export const AUTOCANNON_WEAPONS: RangedWeaponProfile[] = [
  ranged('autocannon', 'Autocannon', 48, 2, 7, 4, 1, ['Heavy (FP)'], ['Auto']),
  ranged('twin-autocannon', 'Twin autocannon', 48, 4, 7, 4, 1, [], ['Auto']),
  ranged('gravis-autocannon', 'Gravis autocannon', 48, 3, 7, 4, 2, ['Heavy (FP)'], ['Auto']),
  ranged('gravis-autocannon-battery', 'Gravis autocannon battery', 48, 4, 7, 4, 2, ['Heavy (FP)'], ['Auto']),
  ranged('predator-cannon', 'Predator cannon', 48, 4, 7, 4, 2, ['Heavy (FP)'], ['Auto']),
  ranged('kheres-assault-cannon', 'Kheres assault cannon', 24, 6, 6, 4, 1, ['Suppressive (2)'], ['Assault', 'Auto']),
  ranged('twin-kheres-assault-cannon', 'Twin Kheres assault cannon', 24, 12, 6, 4, 1, ['Suppressive (2)'], ['Auto']),
  ranged('reaper-autocannon', 'Reaper autocannon', 36, 4, 7, 4, 1, ['Heavy (FP)'], ['Auto']),
  ranged('twin-reaper-autocannon', 'Twin reaper autocannon', 36, 8, 7, 4, 1, [], ['Auto']),
  ranged('punisher-rotary-cannon', 'Punisher rotary cannon', 36, 12, 5, 4, 1, ['Suppressive (3)'], ['Auto']),
];

// ─── Vehicle Battlecannons ────────────────────────────────────────────────────

export const BATTLECANNON_WEAPONS: RangedWeaponProfile[] = [
  ranged('kratos-battlecannon-he', 'Kratos battlecannon - HE shells', 36, 1, 8, 4, 1, ['Ordnance (D)', 'Blast (5")', 'Stun (1)'], ['Auto'], { parentWeaponId: 'kratos-battlecannon' }),
  ranged('kratos-battlecannon-ap', 'Kratos battlecannon - AP shells', 36, 1, 8, 2, 2, ['Ordnance (D)', 'Armourbane'], ['Auto'], { parentWeaponId: 'kratos-battlecannon' }),
  ranged('kratos-battlecannon-flashburn', 'Kratos battlecannon - Flashburn shells', 24, 1, 9, 2, 3, ['Ordnance (D)', 'Armourbane', 'Overload (1)'], ['Auto'], { parentWeaponId: 'kratos-battlecannon' }),
  ranged('demolisher-cannon', 'Demolisher cannon', 24, 1, 10, 2, 4, ['Ordnance (D)', 'Blast (5")'], ['Auto']),
];

// ─── Grenade Weapons ──────────────────────────────────────────────────────────

export const GRENADE_WEAPONS: RangedWeaponProfile[] = [
  ranged('frag-grenades', 'Frag grenades', 6, 1, 3, null, 1, ['Blast (3")'], ['Grenade', 'Assault']),
  ranged('krak-grenades', 'Krak grenades', 6, 1, 6, 4, 2, [], ['Grenade', 'Assault']),
  ranged('melta-bombs', 'Melta bombs', 0, 1, 8, 2, 4, ['Detonation', 'Armourbane'], ['Grenade']),
  ranged('phosphex-bombs', 'Phosphex bombs', 6, 1, 5, 2, 1, ['Blast (3")', 'Breaching (4+)', 'Poisoned (3+)'], ['Grenade']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// MELEE WEAPONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Chain Weapons ────────────────────────────────────────────────────────────

export const CHAIN_WEAPONS: MeleeWeaponProfile[] = [
  melee('chainsword', 'Chainsword', 'I', 'A', 'S', 5, 1, [], ['Chain']),
  melee('chainaxe', 'Chainaxe', 'I', 'A', '+1', 4, 1, [], ['Chain']),
  melee('chain-fist', 'Chain fist', 1, 'A', 'S', 2, 2, ['Armourbane'], ['Chain']),
  melee('chain-glaive', 'Chain glaive', 'I', 'A', '+1', 4, 1, ['Reaping Blow (1)'], ['Chain']),
  melee('heavy-chainsword', 'Heavy chainsword', 'I', 'A', '+1', 4, 1, ['Shred (5+)'], ['Chain']),
  melee('heavy-chainaxe', 'Heavy chainaxe', 'I', 'A', '+2', 3, 2, ['Shred (5+)'], ['Chain']),
];

// ─── Force Weapons ────────────────────────────────────────────────────────────

export const FORCE_WEAPONS: MeleeWeaponProfile[] = [
  melee('force-sword', 'Force sword', 'I', 'A', 'S', 3, 1, ['Force (D)'], ['Force', 'Power']),
  melee('force-axe', 'Force axe', 'I', 'A', '+1', 2, 2, ['Force (D)'], ['Force', 'Power']),
  melee('force-maul', 'Force maul', '+1', 'A', '+2', 4, 1, ['Force (D)'], ['Force', 'Power']),
  melee('force-staff', 'Force staff', 'I', '+1', 'S', 4, 1, ['Force (D)', 'Reaping Blow (1)'], ['Force', 'Power']),
];

// ─── Power Weapons ────────────────────────────────────────────────────────────

export const POWER_WEAPONS: MeleeWeaponProfile[] = [
  melee('power-sword', 'Power sword', 'I', 'A', 'S', 3, 1, [], ['Power']),
  melee('power-axe', 'Power axe', 'I', 'A', '+1', 2, 2, [], ['Power']),
  melee('power-maul', 'Power maul', '+1', 'A', '+2', 4, 1, [], ['Power']),
  melee('power-lance', 'Power lance', '+1', 'A', '+1', 3, 1, ['Impact (SM)'], ['Power']),
  melee('power-fist', 'Power fist', 1, 'A', 'x2', 2, 2, [], ['Power']),
  melee('power-glaive', 'Power glaive', 'I', 'A', '+1', 3, 1, ['Reaping Blow (1)'], ['Power']),
  melee('thunder-hammer', 'Thunder hammer', 1, 'A', 'x2', 2, 3, ['Stun (1)'], ['Power']),
  melee('lightning-claw', 'Lightning claw', 'I', 'A', 'S', 3, 1, ['Shred (5+)', 'Rending (6+)'], ['Power']),
  melee('pair-lightning-claws', 'Pair of lightning claws', 'I', '+1', 'S', 3, 1, ['Shred (5+)', 'Rending (6+)'], ['Power']),
  melee('charnabal-sabre', 'Charnabal sabre', '+1', 'A', 'S', 3, 1, ["Duellist's Edge (1)"], ['Power']),
  melee('paragon-blade', 'Paragon blade', 'I', 'A', '+1', 2, 2, ['Rending (4+)'], ['Power']),
];

// ─── Basic Melee ──────────────────────────────────────────────────────────────

export const BASIC_MELEE: MeleeWeaponProfile[] = [
  melee('close-combat-weapon', 'Close combat weapon', 'I', 'A', 'S', null, 1, [], []),
  melee('combat-blade', 'Combat blade', 'I', 'A', 'S', 5, 1, [], []),
];

// ─── Dreadnought Melee ───────────────────────────────────────────────────────

export const DREADNOUGHT_MELEE: MeleeWeaponProfile[] = [
  melee('dreadnought-close-combat-weapon', 'Dreadnought close combat weapon', 'I', 'A', 'S', 2, 2, [], ['Power']),
  melee('gravis-power-fist', 'Gravis power fist', 1, 'A', 'x2', 2, 3, [], ['Power']),
  melee('leviathan-siege-claw', 'Leviathan siege claw', 1, 'A', 'x2', 2, 4, ['Armourbane'], ['Power']),
  melee('leviathan-siege-drill', 'Leviathan siege drill', 1, 'A', 'x2', 2, 5, ['Armourbane'], ['Power']),
];

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

/** All ranged weapons indexed by ID */
export const RANGED_WEAPONS: Record<string, RangedWeaponProfile> = {};

/** All melee weapons indexed by ID */
export const MELEE_WEAPONS: Record<string, MeleeWeaponProfile> = {};

// Populate ranged weapons
const allRangedArrays = [
  BOLT_WEAPONS, COMBI_WEAPONS, CONVERSION_BEAM_WEAPONS, DISINTEGRATOR_WEAPONS,
  FLAME_WEAPONS, GRAVITON_WEAPONS, LAS_WEAPONS, MELTA_WEAPONS,
  MISSILE_WEAPONS, PLASMA_WEAPONS, VOLKITE_WEAPONS, AUTOCANNON_WEAPONS,
  BATTLECANNON_WEAPONS, GRENADE_WEAPONS,
];
for (const arr of allRangedArrays) {
  for (const weapon of arr) {
    RANGED_WEAPONS[weapon.id] = weapon;
  }
}

// Populate melee weapons
const allMeleeArrays = [
  CHAIN_WEAPONS, FORCE_WEAPONS, POWER_WEAPONS, BASIC_MELEE, DREADNOUGHT_MELEE,
];
for (const arr of allMeleeArrays) {
  for (const weapon of arr) {
    MELEE_WEAPONS[weapon.id] = weapon;
  }
}

/** All weapons (ranged + melee) indexed by ID */
export const ALL_WEAPONS: Record<string, RangedWeaponProfile | MeleeWeaponProfile> = {
  ...RANGED_WEAPONS,
  ...MELEE_WEAPONS,
};

/**
 * Look up a weapon by ID.
 */
export function findWeapon(id: string): RangedWeaponProfile | MeleeWeaponProfile | undefined {
  return ALL_WEAPONS[id];
}

/**
 * Look up a weapon by name (case-insensitive).
 */
export function findWeaponByName(name: string): (RangedWeaponProfile | MeleeWeaponProfile)[] {
  const lower = name.toLowerCase();
  return Object.values(ALL_WEAPONS).filter(w => w.name.toLowerCase() === lower);
}

/**
 * Check if a weapon profile is a ranged weapon.
 */
export function isRangedWeapon(weapon: RangedWeaponProfile | MeleeWeaponProfile): weapon is RangedWeaponProfile {
  return 'range' in weapon;
}

/**
 * Check if a weapon profile is a melee weapon.
 */
export function isMeleeWeapon(weapon: RangedWeaponProfile | MeleeWeaponProfile): weapon is MeleeWeaponProfile {
  return 'initiativeModifier' in weapon;
}
