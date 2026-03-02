import { DetachmentType } from '@hh/types';
import type { UnitProfile } from '@hh/types';
import { LegionFaction } from '@hh/types';

export interface BlackshieldsOathDefinition {
  id: string;
  name: string;
  description: string;
  incompatibleWith?: string[];
  requiresSelectedLegionForArmoury?: boolean;
}

export const BLACKSHIELDS_TACTICA_ID = 'blackshields-bastard-sons-of-fate';
export const BLACKSHIELDS_GAMBIT_ID = 'blackshields-beholden-to-none';

export const BLACKSHIELDS_OATHS: BlackshieldsOathDefinition[] = [
  {
    id: 'blackshields-eternal-vendetta',
    name: 'The Eternal Vendetta',
    description: 'Hatred versus Legiones Astartes, with mandatory charges against nearby targets.',
  },
  {
    id: 'blackshields-panoply-of-old',
    name: 'Panoply of Old',
    description: 'Detachment may select one Legion Armoury for wargear exchanges.',
    requiresSelectedLegionForArmoury: true,
  },
  {
    id: 'blackshields-only-in-death-does-duty-end',
    name: 'Only in Death does Duty End',
    description: 'Routed status may be discarded in exchange for self-inflicted wounds.',
  },
  {
    id: 'blackshields-spoils-of-victory',
    name: 'The Spoils of Victory',
    description: 'Swap objective control traits for loot-based scoring and post-combat pinning.',
    incompatibleWith: ['blackshields-reapers-of-lives'],
  },
  {
    id: 'blackshields-an-eternity-of-war',
    name: 'An Eternity of War',
    description: 'Blackshields may fall back in any direction and gain aggression-focused behavior.',
  },
  {
    id: 'blackshields-flesh-is-weak',
    name: 'The Flesh is Weak',
    description: 'Infantry gain Automata profile conversion and altered tactica behavior.',
  },
  {
    id: 'blackshields-legacy-of-nikaea',
    name: 'The Legacy of Nikaea',
    description: 'Grants psyker access and additional psychic capability to selected models.',
  },
  {
    id: 'blackshields-broken-helix',
    name: 'The Broken Helix',
    description: 'Alters physiology and command behavior with direct characteristic changes.',
  },
  {
    id: 'blackshields-in-disgrace-all-are-equal',
    name: 'In Disgrace all are Equal',
    description: 'Removes command hierarchy and enables broad Petty Warlord prime access.',
  },
  {
    id: 'blackshields-pride-is-our-armour',
    name: 'Pride is our Armour',
    description: 'Converts Troops slots to Elites and enforces veteran-force composition.',
  },
  {
    id: 'blackshields-taint-of-the-xenos',
    name: 'The Taint of the Xenos',
    description: 'Adds proscribed xenos-tech weapon options to blackshields armouries.',
  },
  {
    id: 'blackshields-weapons-of-desperation',
    name: 'The Weapons of Desperation',
    description: 'Forces bolt-weapon exchanges into desperation loadouts at no points cost.',
  },
  {
    id: 'blackshields-blade-of-the-just',
    name: 'The Blade of the Just',
    description: 'Emphasizes challenge duels and precision assault pressure.',
    incompatibleWith: ['blackshields-reapers-of-lives', 'blackshields-spoils-of-victory'],
  },
  {
    id: 'blackshields-reapers-of-lives',
    name: 'Reapers of Lives',
    description: 'Trades objective control for attrition and victory-point harvesting in combat.',
    incompatibleWith: ['blackshields-spoils-of-victory', 'blackshields-blade-of-the-just'],
  },
  {
    id: 'blackshields-alone-and-forgotten',
    name: 'Alone and Forgotten',
    description: 'Command-only force structure centered on isolated centurion champions.',
  },
];

const OATH_BY_ID = new Map(BLACKSHIELDS_OATHS.map((oath) => [oath.id, oath]));

const BLACKSHIELDS_OATH_LIMIT_BY_DETACHMENT: Partial<Record<DetachmentType, number>> = {
  [DetachmentType.Primary]: 2,
  [DetachmentType.Allied]: 1,
};

const LEGION_VALUES = new Set(Object.values(LegionFaction));

export function getBlackshieldsOathLimit(detachmentType: DetachmentType): number {
  return BLACKSHIELDS_OATH_LIMIT_BY_DETACHMENT[detachmentType] ?? 0;
}

export function getBlackshieldsOaths(): BlackshieldsOathDefinition[] {
  return [...BLACKSHIELDS_OATHS];
}

export function findBlackshieldsOath(oathId: string): BlackshieldsOathDefinition | undefined {
  return OATH_BY_ID.get(oathId);
}

/**
 * Blackshields may only include units that are not bound to a specific legion trait.
 */
export function isProfileAllowedForBlackshields(profile: UnitProfile): boolean {
  const factionTraits = profile.traits
    .filter((trait) => trait.category === 'Faction')
    .map((trait) => trait.value);
  return factionTraits.every((value) => !LEGION_VALUES.has(value as LegionFaction));
}

