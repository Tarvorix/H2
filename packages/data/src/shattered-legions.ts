import { LegionFaction } from '@hh/types';

export const SHATTERED_LEGIONS_TACTICA_ID = 'shattered-legions-mutable-tactics';
export const SHATTERED_LEGIONS_GAMBIT_ID = 'shattered-legions-spiteful-strike';
export const SHATTERED_LEGIONS_ADVANCED_REACTION_ID = 'shattered-legions-exact-the-price';
export const SHATTERED_LEGIONS_COMMANDER_UNIT_IDS = [
  'hibou-khan',
  'alexis-polux',
  'shadrak-meduson',
  'saul-tarvitz',
  'garviel-loken',
] as const;

export const SHATTERED_LEGIONS_MIN_SELECTED = 2;
export const SHATTERED_LEGIONS_MAX_SELECTED = 3;

export interface MutableTacticsBenefit {
  legion: LegionFaction;
  name: string;
  summary: string;
}

export const SHATTERED_LEGIONS_MUTABLE_TACTICS: MutableTacticsBenefit[] = [
  {
    legion: LegionFaction.DarkAngels,
    name: 'Children of Old Night',
    summary: 'Fear (X) only applies within 6" instead of 12".',
  },
  {
    legion: LegionFaction.EmperorsChildren,
    name: 'Unparalleled Skill',
    summary: 'Melee Hit Test results of 4+ always succeed.',
  },
  {
    legion: LegionFaction.IronWarriors,
    name: 'Accustomed to Devastation',
    summary: 'Morale Leadership checks of 9 or less always succeed in the Shooting Phase.',
  },
  {
    legion: LegionFaction.WhiteScars,
    name: 'Swift of Action',
    summary: '+1 Initiative while making Set-up Moves or Rushing.',
  },
  {
    legion: LegionFaction.SpaceWolves,
    name: 'Spirit of Fenris',
    summary: '+1" to Set-up Moves, to a maximum of 6".',
  },
  {
    legion: LegionFaction.ImperialFists,
    name: 'Devastating Volleys',
    summary: 'Bolters can make Volley Attacks as if they had Assault.',
  },
  {
    legion: LegionFaction.NightLords,
    name: 'Murderous Reputation',
    summary: 'Score +1 Combat Resolution Point if enemy casualties were inflicted.',
  },
  {
    legion: LegionFaction.BloodAngels,
    name: 'Vengeful Blows',
    summary: '+1 melee Wound Test modifier if own unit took casualties that phase.',
  },
  {
    legion: LegionFaction.IronHands,
    name: 'Iron Resolve',
    summary: 'Gain Feel No Pain (4+) against Volley Attack allocations.',
  },
  {
    legion: LegionFaction.WorldEaters,
    name: 'Frenzied Pursuit',
    summary: '+2" when pursuing a falling back enemy.',
  },
  {
    legion: LegionFaction.Ultramarines,
    name: 'Methodical Fighters',
    summary: 'Enemy reaction shooting against affected units is resolved as Snap Shots.',
  },
  {
    legion: LegionFaction.DeathGuard,
    name: 'Children of Barbarus',
    summary: 'Ignore Difficult and Dangerous Terrain effects (auto-pass tests).',
  },
  {
    legion: LegionFaction.ThousandSons,
    name: 'Conjured Illusions',
    summary: 'Enemy units cannot pursue units that include affected models.',
  },
  {
    legion: LegionFaction.SonsOfHorus,
    name: 'Brutal Tradition',
    summary: '+1 Hit Test modifier in combat while outnumbered.',
  },
  {
    legion: LegionFaction.WordBearers,
    name: 'Zealous Devotion',
    summary: 'Charge rolls use an additional die and discard the two lowest.',
  },
  {
    legion: LegionFaction.Salamanders,
    name: 'Scions of the Flame',
    summary: 'Ignore Panic (X) effects from Flame weapons.',
  },
  {
    legion: LegionFaction.RavenGuard,
    name: 'Masters of Obfuscation',
    summary: 'Gain Shrouded (6+) if not Stationary during Movement.',
  },
  {
    legion: LegionFaction.AlphaLegion,
    name: 'Assassination Tactics',
    summary: 'Volley Attacks gain Precision (6+).',
  },
];

const LEGION_SET = new Set(Object.values(LegionFaction));

export function isValidShatteredLegion(value: unknown): value is LegionFaction {
  return typeof value === 'string' && LEGION_SET.has(value as LegionFaction);
}

export function getMutableTacticsBenefit(
  legion: LegionFaction,
): MutableTacticsBenefit | undefined {
  return SHATTERED_LEGIONS_MUTABLE_TACTICS.find((benefit) => benefit.legion === legion);
}
