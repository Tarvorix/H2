/**
 * Detachment Template Definitions.
 * Defines the Force Organisation Chart slot layouts for all standard detachments.
 *
 * Reference: TheCrusadeForceOrganisationChart.pdf
 * Reference: HH_Battle_AOD.md — "Detachment Types", "Force Organisation Charts"
 */

import { BattlefieldRole, DetachmentType } from '@hh/types';
import type { RiteOfWarDefinition } from '@hh/types';

// ─── Template Types ──────────────────────────────────────────────────────────

/**
 * A slot within a detachment template.
 */
export interface DetachmentSlotTemplate {
  /** Unique identifier within this template (e.g., 'hc-1', 'troops-1') */
  id: string;
  /** Which battlefield role this slot accepts */
  role: BattlefieldRole;
  /** Whether this is a Prime Slot (grants bonuses when filled) */
  isPrime: boolean;
  /** Display label (e.g., "Command (Prime)", "Troops 1") */
  label: string;
  /** Whether this slot must be filled for the detachment to be valid */
  isMandatory: boolean;
}

/**
 * A detachment template — defines the slot layout for a specific detachment type.
 */
export interface DetachmentTemplate {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Detachment type (Primary, Allied, Auxiliary, Apex) */
  type: DetachmentType;
  /** Category for additional detachments that don't fit standard types */
  category: 'primary' | 'warlord' | 'lordOfWar' | 'allied' | 'auxiliary' | 'apex' | 'rite';
  /** All slots in this detachment */
  slots: DetachmentSlotTemplate[];
  /** Source of this template (e.g., "Crusade FOC", "Dark Angels Rite of War") */
  source: string;
  /** Description of this detachment */
  description: string;
}

// ─── Helper: Slot Builder ────────────────────────────────────────────────────

let slotCounter = 0;
function makeSlot(
  role: BattlefieldRole,
  opts: { isPrime?: boolean; isMandatory?: boolean; label?: string } = {},
): DetachmentSlotTemplate {
  slotCounter++;
  const isPrime = opts.isPrime ?? false;
  const isMandatory = opts.isMandatory ?? false;
  const primeLabel = isPrime ? ' (Prime)' : '';
  const label = opts.label ?? `${role}${primeLabel}`;
  return {
    id: `slot-${role.toLowerCase().replace(/\s+/g, '-')}-${slotCounter}`,
    role,
    isPrime,
    label,
    isMandatory,
  };
}

function resetSlotCounter(): void {
  slotCounter = 0;
}

// ─── Core Detachment Templates ───────────────────────────────────────────────

/**
 * Crusade Primary Detachment (12 slots).
 * 1x High Command, 3x Command (Prime), 4x Troops (Prime), 4x Transport
 *
 * Every army must have exactly one Primary Detachment.
 * HC slot is mandatory. Command (Prime) slots each unlock 1 Auxiliary Detachment.
 * HC slot (when filled) unlocks 1 Apex OR 1 Auxiliary Detachment.
 */
resetSlotCounter();
export const CRUSADE_PRIMARY: DetachmentTemplate = {
  id: 'crusade-primary',
  name: 'Crusade Primary',
  type: DetachmentType.Primary,
  category: 'primary',
  slots: [
    makeSlot(BattlefieldRole.HighCommand, { isMandatory: true, label: 'High Command' }),
    makeSlot(BattlefieldRole.Command, { isPrime: true, label: 'Command (Prime) 1' }),
    makeSlot(BattlefieldRole.Command, { isPrime: true, label: 'Command (Prime) 2' }),
    makeSlot(BattlefieldRole.Command, { isPrime: true, label: 'Command (Prime) 3' }),
    makeSlot(BattlefieldRole.Troops, { isPrime: true, label: 'Troops (Prime) 1' }),
    makeSlot(BattlefieldRole.Troops, { isPrime: true, label: 'Troops (Prime) 2' }),
    makeSlot(BattlefieldRole.Troops, { isPrime: true, label: 'Troops (Prime) 3' }),
    makeSlot(BattlefieldRole.Troops, { isPrime: true, label: 'Troops (Prime) 4' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 1' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 2' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 3' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 4' }),
  ],
  source: 'Crusade FOC',
  description:
    'The mandatory Primary Detachment forming the core of every Crusade army. ' +
    'Includes High Command, Command (Prime), Troops (Prime), and Transport slots. ' +
    'Filled Command slots each unlock one Auxiliary Detachment. ' +
    'A filled High Command slot unlocks one Apex or one additional Auxiliary Detachment.',
};

/**
 * Warlord Detachment (5 slots).
 * 1x Warlord, 1x War-Engine, 1x Retinue, 2x Transport
 *
 * Rules: Same Faction as Primary. Only available at 3,000+ points.
 * Must include a Paragon model.
 */
resetSlotCounter();
export const WARLORD_DETACHMENT: DetachmentTemplate = {
  id: 'warlord-detachment',
  name: 'Warlord',
  type: DetachmentType.Primary, // Uses Primary type but is additional
  category: 'warlord',
  slots: [
    makeSlot(BattlefieldRole.Warlord, { isMandatory: true, label: 'Warlord' }),
    makeSlot(BattlefieldRole.WarEngine, { label: 'War-Engine' }),
    makeSlot(BattlefieldRole.Retinue, { label: 'Retinue' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 1' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 2' }),
  ],
  source: 'Crusade FOC',
  description:
    'The Warlord Detachment. Must be the same Faction as the Primary Detachment. ' +
    'Only available at 3,000+ points. Must include a Paragon model.',
};

/**
 * Lord of War Detachment (2 slots).
 * 2x Lord of War
 *
 * Rules: Any Faction. Combined points of LoW + Warlord role units ≤ 25% of army points.
 */
resetSlotCounter();
export const LORD_OF_WAR_DETACHMENT: DetachmentTemplate = {
  id: 'lord-of-war-detachment',
  name: 'Lord of War',
  type: DetachmentType.Primary, // Uses Primary type but is additional
  category: 'lordOfWar',
  slots: [
    makeSlot(BattlefieldRole.LordOfWar, { label: 'Lord of War 1' }),
    makeSlot(BattlefieldRole.LordOfWar, { label: 'Lord of War 2' }),
  ],
  source: 'Crusade FOC',
  description:
    'The Lord of War Detachment. Can be from any Faction. ' +
    'Combined points of Lord of War and Warlord-role units must not exceed 25% of the army points limit.',
};

/**
 * Allied Detachment (6 slots).
 * 1x High Command, 1x Command, 2x Troops, 2x Transport
 *
 * Rules: Must be a different Faction than Primary. Total allied points ≤ 50% of army points.
 * Filled Command slots in this detachment unlock linked Auxiliary Detachments.
 */
resetSlotCounter();
export const ALLIED_DETACHMENT: DetachmentTemplate = {
  id: 'allied-detachment',
  name: 'Allied',
  type: DetachmentType.Allied,
  category: 'allied',
  slots: [
    makeSlot(BattlefieldRole.HighCommand, { label: 'High Command' }),
    makeSlot(BattlefieldRole.Command, { label: 'Command' }),
    makeSlot(BattlefieldRole.Troops, { label: 'Troops 1' }),
    makeSlot(BattlefieldRole.Troops, { label: 'Troops 2' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 1' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 2' }),
  ],
  source: 'Crusade FOC',
  description:
    'An Allied Detachment from a different Faction. ' +
    'Total points of all allied units must not exceed 50% of the army points limit. ' +
    'Filled Command slots unlock linked Auxiliary Detachments.',
};

// ─── Auxiliary Detachment Templates ──────────────────────────────────────────

/**
 * Armoured Fist Auxiliary (8 slots).
 * 4x Armour, 4x Transport
 */
resetSlotCounter();
export const ARMOURED_FIST: DetachmentTemplate = {
  id: 'armoured-fist',
  name: 'Armoured Fist',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 1' }),
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 2' }),
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 3' }),
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 4' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 1' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 2' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 3' }),
    makeSlot(BattlefieldRole.Transport, { label: 'Transport 4' }),
  ],
  source: 'Crusade FOC',
  description: 'An armoured formation providing tanks and transports.',
};

/**
 * Tactical Support Auxiliary (5 slots).
 * 2x Support, 2x Troops, 1x War-Engine
 */
resetSlotCounter();
export const TACTICAL_SUPPORT: DetachmentTemplate = {
  id: 'tactical-support',
  name: 'Tactical Support',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.Support, { label: 'Support 1' }),
    makeSlot(BattlefieldRole.Support, { label: 'Support 2' }),
    makeSlot(BattlefieldRole.Troops, { label: 'Troops 1' }),
    makeSlot(BattlefieldRole.Troops, { label: 'Troops 2' }),
    makeSlot(BattlefieldRole.WarEngine, { label: 'War-Engine' }),
  ],
  source: 'Crusade FOC',
  description: 'A tactical support formation with infantry support and war engines.',
};

/**
 * Armoured Support Auxiliary (4 slots).
 * 2x Armour, 2x Heavy Transport
 */
resetSlotCounter();
export const ARMOURED_SUPPORT: DetachmentTemplate = {
  id: 'armoured-support',
  name: 'Armoured Support',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 1' }),
    makeSlot(BattlefieldRole.Armour, { label: 'Armour 2' }),
    makeSlot(BattlefieldRole.HeavyTransport, { label: 'Heavy Transport 1' }),
    makeSlot(BattlefieldRole.HeavyTransport, { label: 'Heavy Transport 2' }),
  ],
  source: 'Crusade FOC',
  description: 'Heavy armoured support with tanks and heavy transports.',
};

/**
 * Heavy Support Auxiliary (1 slot).
 * 1x War-Engine
 */
resetSlotCounter();
export const HEAVY_SUPPORT: DetachmentTemplate = {
  id: 'heavy-support',
  name: 'Heavy Support',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.WarEngine, { label: 'War-Engine' }),
  ],
  source: 'Crusade FOC',
  description: 'A single war engine for heavy fire support.',
};

/**
 * Combat Pioneer Auxiliary (2 slots).
 * 1x Elites, 1x Recon
 */
resetSlotCounter();
export const COMBAT_PIONEER: DetachmentTemplate = {
  id: 'combat-pioneer',
  name: 'Combat Pioneer',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.Elites, { label: 'Elites' }),
    makeSlot(BattlefieldRole.Recon, { label: 'Recon' }),
  ],
  source: 'Crusade FOC',
  description: 'Specialist reconnaissance and elite support formation.',
};

/**
 * Shock Assault Auxiliary (2 slots).
 * 2x Heavy Assault
 */
resetSlotCounter();
export const SHOCK_ASSAULT: DetachmentTemplate = {
  id: 'shock-assault',
  name: 'Shock Assault',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.HeavyAssault, { label: 'Heavy Assault 1' }),
    makeSlot(BattlefieldRole.HeavyAssault, { label: 'Heavy Assault 2' }),
  ],
  source: 'Crusade FOC',
  description: 'Heavy assault formation for close-quarters breakthrough.',
};

/**
 * First Strike Auxiliary (2 slots).
 * 2x Fast Attack
 */
resetSlotCounter();
export const FIRST_STRIKE: DetachmentTemplate = {
  id: 'first-strike',
  name: 'First Strike',
  type: DetachmentType.Auxiliary,
  category: 'auxiliary',
  slots: [
    makeSlot(BattlefieldRole.FastAttack, { label: 'Fast Attack 1' }),
    makeSlot(BattlefieldRole.FastAttack, { label: 'Fast Attack 2' }),
  ],
  source: 'Crusade FOC',
  description: 'Fast attack formation for rapid strikes and flanking.',
};

// ─── Apex Detachment Templates ───────────────────────────────────────────────

/**
 * Combat Retinue Apex (3 slots).
 * 1x Command, 2x Retinue
 */
resetSlotCounter();
export const COMBAT_RETINUE: DetachmentTemplate = {
  id: 'combat-retinue',
  name: 'Combat Retinue',
  type: DetachmentType.Apex,
  category: 'apex',
  slots: [
    makeSlot(BattlefieldRole.Command, { label: 'Command' }),
    makeSlot(BattlefieldRole.Retinue, { label: 'Retinue 1' }),
    makeSlot(BattlefieldRole.Retinue, { label: 'Retinue 2' }),
  ],
  source: 'Crusade FOC',
  description: 'A command unit with dedicated retinue bodyguard.',
};

/**
 * Officer Cadre Apex (2 slots).
 * 1x High Command, 1x Command
 */
resetSlotCounter();
export const OFFICER_CADRE: DetachmentTemplate = {
  id: 'officer-cadre',
  name: 'Officer Cadre',
  type: DetachmentType.Apex,
  category: 'apex',
  slots: [
    makeSlot(BattlefieldRole.HighCommand, { label: 'High Command' }),
    makeSlot(BattlefieldRole.Command, { label: 'Command' }),
  ],
  source: 'Crusade FOC',
  description: 'Additional officer support with high command and command units.',
};

/**
 * Army Vanguard Apex (2 slots).
 * 2x Recon
 */
resetSlotCounter();
export const ARMY_VANGUARD: DetachmentTemplate = {
  id: 'army-vanguard',
  name: 'Army Vanguard',
  type: DetachmentType.Apex,
  category: 'apex',
  slots: [
    makeSlot(BattlefieldRole.Recon, { label: 'Recon 1' }),
    makeSlot(BattlefieldRole.Recon, { label: 'Recon 2' }),
  ],
  source: 'Crusade FOC',
  description: 'Forward reconnaissance formation.',
};

// ─── Template Collections ────────────────────────────────────────────────────

/** All standard detachment templates */
export const ALL_DETACHMENT_TEMPLATES: DetachmentTemplate[] = [
  CRUSADE_PRIMARY,
  WARLORD_DETACHMENT,
  LORD_OF_WAR_DETACHMENT,
  ALLIED_DETACHMENT,
  ARMOURED_FIST,
  TACTICAL_SUPPORT,
  ARMOURED_SUPPORT,
  HEAVY_SUPPORT,
  COMBAT_PIONEER,
  SHOCK_ASSAULT,
  FIRST_STRIKE,
  COMBAT_RETINUE,
  OFFICER_CADRE,
  ARMY_VANGUARD,
];

/** All standard Auxiliary detachment templates */
export const AUXILIARY_TEMPLATES: DetachmentTemplate[] = [
  ARMOURED_FIST,
  TACTICAL_SUPPORT,
  ARMOURED_SUPPORT,
  HEAVY_SUPPORT,
  COMBAT_PIONEER,
  SHOCK_ASSAULT,
  FIRST_STRIKE,
];

/** All standard Apex detachment templates */
export const APEX_TEMPLATES: DetachmentTemplate[] = [
  COMBAT_RETINUE,
  OFFICER_CADRE,
  ARMY_VANGUARD,
];

// ─── Template Lookup by ID (Map) ─────────────────────────────────────────────

const templateMap = new Map<string, DetachmentTemplate>();
for (const template of ALL_DETACHMENT_TEMPLATES) {
  templateMap.set(template.id, template);
}

// ─── Lookup Functions ────────────────────────────────────────────────────────

/**
 * Find a detachment template by ID.
 * @returns The template or undefined if not found
 */
export function findDetachmentTemplate(id: string): DetachmentTemplate | undefined {
  return templateMap.get(id);
}

/**
 * Get all standard Auxiliary detachment templates.
 */
export function getAuxiliaryTemplates(): DetachmentTemplate[] {
  return AUXILIARY_TEMPLATES;
}

/**
 * Get all standard Apex detachment templates.
 */
export function getApexTemplates(): DetachmentTemplate[] {
  return APEX_TEMPLATES;
}

/**
 * Convert a Rite of War's additionalDetachments into DetachmentTemplates.
 *
 * Rite detachments are defined as arrays of slot role strings
 * (e.g., ['Command', 'Troops', 'Troops', 'Armour']).
 * This converts them into full DetachmentTemplate objects for the army builder.
 *
 * @param rite - The Rite of War definition
 * @returns Array of DetachmentTemplates derived from the rite
 */
export function buildRiteDetachmentTemplates(rite: RiteOfWarDefinition): DetachmentTemplate[] {
  if (!rite.additionalDetachments || rite.additionalDetachments.length === 0) {
    return [];
  }

  return rite.additionalDetachments.map((detachment, index) => {
    resetSlotCounter();

    // Map string role names to BattlefieldRole enum values
    const roleMap: Record<string, BattlefieldRole> = {
      'Warlord': BattlefieldRole.Warlord,
      'High Command': BattlefieldRole.HighCommand,
      'Command': BattlefieldRole.Command,
      'Retinue': BattlefieldRole.Retinue,
      'Elites': BattlefieldRole.Elites,
      'War-Engine': BattlefieldRole.WarEngine,
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

    // Count slots by role for labeling
    const roleCounts: Record<string, number> = {};
    const slots: DetachmentSlotTemplate[] = detachment.slots.map((slotRoleStr: string) => {
      const role = roleMap[slotRoleStr];
      if (!role) {
        throw new Error(
          `Unknown battlefield role "${slotRoleStr}" in rite "${rite.name}" detachment "${detachment.name}"`,
        );
      }

      roleCounts[slotRoleStr] = (roleCounts[slotRoleStr] || 0) + 1;
      const count = roleCounts[slotRoleStr];

      // Only add a number suffix if there are multiple of the same role
      const totalOfRole = detachment.slots.filter((s: string) => s === slotRoleStr).length;
      const label = totalOfRole > 1 ? `${slotRoleStr} ${count}` : slotRoleStr;

      return makeSlot(role, { label });
    });

    // Determine detachment type from the rite's specification
    const typeMap: Record<string, DetachmentType> = {
      'Auxiliary': DetachmentType.Auxiliary,
      'Apex': DetachmentType.Apex,
      'Primary': DetachmentType.Primary,
      'Allied': DetachmentType.Allied,
    };
    const detachmentType = typeMap[detachment.type] ?? DetachmentType.Auxiliary;

    return {
      id: `rite-${rite.id}-det-${index}`,
      name: detachment.name,
      type: detachmentType,
      category: 'rite' as const,
      slots,
      source: `${rite.name} (${rite.legion})`,
      description: detachment.description,
    };
  });
}
