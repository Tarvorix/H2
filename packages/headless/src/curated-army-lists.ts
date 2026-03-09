import { calculateUnitPoints, createDetachment } from '@hh/army-builder';
import {
  ARMOURED_FIST,
  COMBAT_PIONEER,
  CRUSADE_PRIMARY,
  FIRST_STRIKE,
  HEAVY_SUPPORT,
  SHOCK_ASSAULT,
  TACTICAL_SUPPORT,
  type DetachmentTemplate,
  getProfileById,
} from '@hh/data';
import type {
  ArmyDoctrine,
  ArmyFaction,
  ArmyList,
  ArmyListDetachment,
  ArmyListUnit,
  SelectedWargearOption,
} from '@hh/types';
import {
  Allegiance,
  LegionFaction,
  SpecialFaction,
} from '@hh/types';

export interface CuratedArmyListSource {
  label: string;
  url: string;
}

export interface CuratedArmyListDefinition {
  id: string;
  faction: ArmyFaction;
  allegiance: Allegiance;
  pointsLimit: 2000;
  name: string;
  summary: string;
  sources: CuratedArmyListSource[];
  armyList: ArmyList;
}

interface UnitSpec {
  id: string;
  profileId: string;
  modelCount?: number;
  selectedOptions?: SelectedWargearOption[];
  assignedTransportUnitId?: string;
  originLegion?: LegionFaction;
}

interface DetachmentSpec {
  id: string;
  faction: ArmyFaction;
  template: DetachmentTemplate;
  units: UnitSpec[];
  parentDetachmentId?: string;
  doctrine?: ArmyDoctrine;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createUnit(spec: UnitSpec): ArmyListUnit {
  const profile = getProfileById(spec.profileId);
  if (!profile) {
    throw new Error(`Unknown profile "${spec.profileId}" in curated roster.`);
  }

  const modelCount = spec.modelCount ?? profile.minModels;
  const selectedOptions = spec.selectedOptions ?? [];

  return {
    id: spec.id,
    profileId: spec.profileId,
    modelCount,
    selectedOptions,
    totalPoints: calculateUnitPoints(profile, modelCount, selectedOptions),
    battlefieldRole: profile.battlefieldRole,
    assignedTransportUnitId: spec.assignedTransportUnitId,
    originLegion: spec.originLegion,
  };
}

function createRosterDetachment(spec: DetachmentSpec): ArmyListDetachment {
  const detachment = createDetachment(spec.template, spec.faction, spec.id);
  detachment.parentDetachmentId = spec.parentDetachmentId;
  detachment.doctrine = spec.doctrine;
  detachment.units = spec.units.map(createUnit);
  return detachment;
}

function buildArmyList(args: {
  playerName: string;
  faction: ArmyFaction;
  allegiance: Allegiance;
  doctrine?: ArmyDoctrine;
  detachments: DetachmentSpec[];
}): ArmyList {
  const detachments = args.detachments.map(createRosterDetachment);
  const totalPoints = detachments
    .flatMap((detachment) => detachment.units)
    .reduce((sum, unit) => sum + unit.totalPoints, 0);

  return {
    playerName: args.playerName,
    pointsLimit: 2000,
    totalPoints,
    faction: args.faction,
    allegiance: args.allegiance,
    doctrine: args.doctrine,
    detachments,
  };
}

const BLACKSHIELDS_DOCTRINE: ArmyDoctrine = {
  kind: 'blackshields',
  oathIds: [
    'blackshields-an-eternity-of-war',
    'blackshields-only-in-death-does-duty-end',
  ],
};

const SHATTERED_DOCTRINE: ArmyDoctrine = {
  kind: 'shatteredLegions',
  selectedLegions: [
    LegionFaction.DarkAngels,
    LegionFaction.WorldEaters,
    LegionFaction.AlphaLegion,
  ],
};

const DARK_ANGELS_2000 = buildArmyList({
  playerName: 'Dark Angels 2000pt Curated',
  faction: LegionFaction.DarkAngels,
  allegiance: Allegiance.Loyalist,
  detachments: [
    {
      id: 'da-primary',
      faction: LegionFaction.DarkAngels,
      template: CRUSADE_PRIMARY,
      units: [
        { id: 'da-praetor', profileId: 'praetor' },
        { id: 'da-chaplain', profileId: 'chaplain' },
        { id: 'da-herald', profileId: 'herald' },
        {
          id: 'da-tactical-1',
          profileId: 'tactical-squad',
          selectedOptions: [{ optionIndex: 4, count: 1 }],
          assignedTransportUnitId: 'da-rhino-1',
        },
        {
          id: 'da-tactical-2',
          profileId: 'tactical-squad',
          assignedTransportUnitId: 'da-rhino-2',
        },
        {
          id: 'da-despoiler-1',
          profileId: 'despoiler-squad',
          modelCount: 20,
        },
        { id: 'da-rhino-1', profileId: 'rhino' },
        { id: 'da-rhino-2', profileId: 'rhino' },
      ],
    },
    {
      id: 'da-combat-pioneer',
      faction: LegionFaction.DarkAngels,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'da-primary',
      units: [
        {
          id: 'da-cenobium',
          profileId: 'inner-circle-knights-cenobium',
          modelCount: 6,
        },
        { id: 'da-recon', profileId: 'reconnaissance-squad' },
      ],
    },
    {
      id: 'da-tactical-support',
      faction: LegionFaction.DarkAngels,
      template: TACTICAL_SUPPORT,
      parentDetachmentId: 'da-primary',
      units: [
        {
          id: 'da-dreadwing-interemptors',
          profileId: 'dreadwing-interemptors',
          modelCount: 5,
        },
        { id: 'da-support-tactical', profileId: 'tactical-squad' },
        { id: 'da-contemptor', profileId: 'contemptor-dreadnought' },
      ],
    },
    {
      id: 'da-shock-assault',
      faction: LegionFaction.DarkAngels,
      template: SHOCK_ASSAULT,
      parentDetachmentId: 'da-primary',
      units: [
        { id: 'da-cataphractii', profileId: 'cataphractii-terminator-squad' },
        { id: 'da-tartaros', profileId: 'tartaros-terminator-squad' },
      ],
    },
  ],
});

const WORLD_EATERS_2000 = buildArmyList({
  playerName: 'World Eaters 2000pt Curated',
  faction: LegionFaction.WorldEaters,
  allegiance: Allegiance.Traitor,
  detachments: [
    {
      id: 'we-primary',
      faction: LegionFaction.WorldEaters,
      template: CRUSADE_PRIMARY,
      units: [
        { id: 'we-kharn', profileId: 'kh-rn-the-bloody' },
        { id: 'we-chaplain', profileId: 'chaplain' },
        { id: 'we-champion', profileId: 'legion-champion' },
        { id: 'we-assault-1', profileId: 'assault-squad', modelCount: 15 },
        {
          id: 'we-despoiler-1',
          profileId: 'despoiler-squad',
          assignedTransportUnitId: 'we-rhino-1',
        },
        {
          id: 'we-despoiler-2',
          profileId: 'despoiler-squad',
          assignedTransportUnitId: 'we-rhino-2',
        },
        {
          id: 'we-tactical-1',
          profileId: 'tactical-squad',
          assignedTransportUnitId: 'we-armoured-fist-rhino',
        },
        { id: 'we-rhino-1', profileId: 'rhino' },
        { id: 'we-rhino-2', profileId: 'rhino' },
      ],
    },
    {
      id: 'we-combat-pioneer',
      faction: LegionFaction.WorldEaters,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'we-primary',
      units: [
        { id: 'we-red-butchers', profileId: 'red-butchers' },
        { id: 'we-recon', profileId: 'reconnaissance-squad' },
      ],
    },
    {
      id: 'we-shock-assault',
      faction: LegionFaction.WorldEaters,
      template: SHOCK_ASSAULT,
      parentDetachmentId: 'we-primary',
      units: [
        {
          id: 'we-rampagers',
          profileId: 'rampager-squad',
          modelCount: 10,
        },
        { id: 'we-cataphractii', profileId: 'cataphractii-terminator-squad' },
      ],
    },
    {
      id: 'we-armoured-fist',
      faction: LegionFaction.WorldEaters,
      template: ARMOURED_FIST,
      parentDetachmentId: 'we-primary',
      units: [
        { id: 'we-predator-1', profileId: 'predator' },
        { id: 'we-predator-2', profileId: 'predator' },
        {
          id: 'we-armoured-fist-rhino',
          profileId: 'rhino',
          selectedOptions: [{ optionIndex: 3, count: 1 }],
        },
      ],
    },
  ],
});

const ALPHA_LEGION_2000 = buildArmyList({
  playerName: 'Alpha Legion 2000pt Curated',
  faction: LegionFaction.AlphaLegion,
  allegiance: Allegiance.Traitor,
  detachments: [
    {
      id: 'al-primary',
      faction: LegionFaction.AlphaLegion,
      template: CRUSADE_PRIMARY,
      units: [
        { id: 'al-dynat', profileId: 'armillus-dynat' },
        { id: 'al-saboteur', profileId: 'saboteur' },
        { id: 'al-vigilator', profileId: 'vigilator' },
        { id: 'al-master-of-signals', profileId: 'master-of-signals' },
        {
          id: 'al-tactical-1',
          profileId: 'tactical-squad',
          selectedOptions: [{ optionIndex: 4, count: 1 }],
          assignedTransportUnitId: 'al-rhino-1',
        },
        {
          id: 'al-tactical-2',
          profileId: 'tactical-squad',
          assignedTransportUnitId: 'al-rhino-2',
        },
        { id: 'al-despoiler-1', profileId: 'despoiler-squad', modelCount: 15 },
        {
          id: 'al-rhino-1',
          profileId: 'rhino',
          selectedOptions: [{ optionIndex: 3, count: 1 }],
        },
        { id: 'al-rhino-2', profileId: 'rhino' },
      ],
    },
    {
      id: 'al-combat-pioneer-1',
      faction: LegionFaction.AlphaLegion,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'al-primary',
      units: [
        {
          id: 'al-headhunters',
          profileId: 'headhunter-kill-team',
          modelCount: 10,
        },
        { id: 'al-recon-1', profileId: 'reconnaissance-squad' },
      ],
    },
    {
      id: 'al-combat-pioneer-2',
      faction: LegionFaction.AlphaLegion,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'al-primary',
      units: [
        {
          id: 'al-lernaean',
          profileId: 'lernaean-terminator-squad',
          modelCount: 6,
        },
        { id: 'al-recon-2', profileId: 'reconnaissance-squad' },
      ],
    },
    {
      id: 'al-heavy-support',
      faction: LegionFaction.AlphaLegion,
      template: HEAVY_SUPPORT,
      parentDetachmentId: 'al-primary',
      units: [
        { id: 'al-contemptor', profileId: 'contemptor-dreadnought' },
      ],
    },
    {
      id: 'al-first-strike',
      faction: LegionFaction.AlphaLegion,
      template: FIRST_STRIKE,
      parentDetachmentId: 'al-primary',
      units: [
        {
          id: 'al-javelin',
          profileId: 'javelin-squadron',
          selectedOptions: [{ optionIndex: 3, count: 1 }],
        },
        {
          id: 'al-land-speeder',
          profileId: 'land-speeder-squadron',
          selectedOptions: [{ optionIndex: 2, count: 1 }],
        },
      ],
    },
  ],
});

const BLACKSHIELDS_2000 = buildArmyList({
  playerName: 'Blackshields 2000pt Curated',
  faction: SpecialFaction.Blackshields,
  allegiance: Allegiance.Loyalist,
  doctrine: BLACKSHIELDS_DOCTRINE,
  detachments: [
    {
      id: 'bs-primary',
      faction: SpecialFaction.Blackshields,
      template: CRUSADE_PRIMARY,
      doctrine: BLACKSHIELDS_DOCTRINE,
      units: [
        { id: 'bs-haar', profileId: 'endryd-haar' },
        { id: 'bs-chaplain', profileId: 'chaplain' },
        { id: 'bs-centurion', profileId: 'centurion' },
        { id: 'bs-moritat', profileId: 'moritat' },
        { id: 'bs-tactical-2', profileId: 'tactical-squad', modelCount: 15 },
        {
          id: 'bs-despoiler-1',
          profileId: 'despoiler-squad',
          assignedTransportUnitId: 'bs-rhino-1',
        },
        {
          id: 'bs-tactical-1',
          profileId: 'tactical-squad',
          assignedTransportUnitId: 'bs-rhino-2',
        },
        {
          id: 'bs-breacher-1',
          profileId: 'breacher-squad',
          assignedTransportUnitId: 'bs-armoured-fist-rhino',
        },
        { id: 'bs-rhino-1', profileId: 'rhino' },
        { id: 'bs-rhino-2', profileId: 'rhino' },
      ],
    },
    {
      id: 'bs-combat-pioneer',
      faction: SpecialFaction.Blackshields,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'bs-primary',
      doctrine: BLACKSHIELDS_DOCTRINE,
      units: [
        { id: 'bs-veterans-2', profileId: 'veteran-tactical-squad', modelCount: 10 },
        { id: 'bs-recon', profileId: 'reconnaissance-squad' },
      ],
    },
    {
      id: 'bs-tactical-support',
      faction: SpecialFaction.Blackshields,
      template: TACTICAL_SUPPORT,
      parentDetachmentId: 'bs-primary',
      doctrine: BLACKSHIELDS_DOCTRINE,
      units: [
        {
          id: 'bs-techmarine',
          profileId: 'techmarine',
          selectedOptions: [{ optionIndex: 1, count: 1 }],
        },
        {
          id: 'bs-rapiers',
          profileId: 'rapier-battery',
          modelCount: 2,
          selectedOptions: [{ optionIndex: 1, count: 2 }],
        },
        { id: 'bs-support-tactical', profileId: 'tactical-squad' },
        { id: 'bs-contemptor', profileId: 'contemptor-dreadnought' },
      ],
    },
    {
      id: 'bs-armoured-fist',
      faction: SpecialFaction.Blackshields,
      template: ARMOURED_FIST,
      parentDetachmentId: 'bs-primary',
      doctrine: BLACKSHIELDS_DOCTRINE,
      units: [
        { id: 'bs-predator-1', profileId: 'predator' },
        { id: 'bs-predator-2', profileId: 'predator' },
        { id: 'bs-armoured-fist-rhino', profileId: 'rhino' },
      ],
    },
  ],
});

const SHATTERED_LEGIONS_2000 = buildArmyList({
  playerName: 'Shattered Legions 2000pt Curated',
  faction: SpecialFaction.ShatteredLegions,
  allegiance: Allegiance.Loyalist,
  doctrine: SHATTERED_DOCTRINE,
  detachments: [
    {
      id: 'sl-primary',
      faction: SpecialFaction.ShatteredLegions,
      template: CRUSADE_PRIMARY,
      units: [
        {
          id: 'sl-dynat',
          profileId: 'armillus-dynat',
          originLegion: LegionFaction.AlphaLegion,
        },
        {
          id: 'sl-chaplain',
          profileId: 'chaplain',
          originLegion: LegionFaction.DarkAngels,
        },
        {
          id: 'sl-herald',
          profileId: 'herald',
          originLegion: LegionFaction.WorldEaters,
        },
        {
          id: 'sl-saboteur',
          profileId: 'saboteur',
          originLegion: LegionFaction.AlphaLegion,
        },
        {
          id: 'sl-tactical-dark-angels',
          profileId: 'tactical-squad',
          assignedTransportUnitId: 'sl-rhino-1',
          originLegion: LegionFaction.DarkAngels,
        },
        {
          id: 'sl-despoiler-world-eaters',
          profileId: 'despoiler-squad',
          assignedTransportUnitId: 'sl-rhino-2',
          originLegion: LegionFaction.WorldEaters,
        },
        {
          id: 'sl-tactical-alpha-legion',
          profileId: 'tactical-squad',
          originLegion: LegionFaction.AlphaLegion,
        },
        {
          id: 'sl-rhino-1',
          profileId: 'rhino',
          originLegion: LegionFaction.DarkAngels,
        },
        {
          id: 'sl-rhino-2',
          profileId: 'rhino',
          originLegion: LegionFaction.WorldEaters,
        },
      ],
    },
    {
      id: 'sl-combat-pioneer',
      faction: SpecialFaction.ShatteredLegions,
      template: COMBAT_PIONEER,
      parentDetachmentId: 'sl-primary',
      units: [
        {
          id: 'sl-cenobium',
          profileId: 'inner-circle-knights-cenobium',
          originLegion: LegionFaction.DarkAngels,
        },
        {
          id: 'sl-recon',
          profileId: 'reconnaissance-squad',
          originLegion: LegionFaction.AlphaLegion,
        },
      ],
    },
    {
      id: 'sl-shock-assault',
      faction: SpecialFaction.ShatteredLegions,
      template: SHOCK_ASSAULT,
      parentDetachmentId: 'sl-primary',
      units: [
        {
          id: 'sl-rampagers',
          profileId: 'rampager-squad',
          modelCount: 10,
          originLegion: LegionFaction.WorldEaters,
        },
        {
          id: 'sl-cataphractii',
          profileId: 'cataphractii-terminator-squad',
          originLegion: LegionFaction.DarkAngels,
        },
      ],
    },
    {
      id: 'sl-armoured-fist',
      faction: SpecialFaction.ShatteredLegions,
      template: ARMOURED_FIST,
      parentDetachmentId: 'sl-primary',
      units: [
        {
          id: 'sl-scorpius',
          profileId: 'scorpius-missile-tank',
          selectedOptions: [{ optionIndex: 3, count: 1 }],
          originLegion: LegionFaction.AlphaLegion,
        },
        {
          id: 'sl-predator-1',
          profileId: 'predator',
          selectedOptions: [{ optionIndex: 13, count: 1 }],
          originLegion: LegionFaction.WorldEaters,
        },
        {
          id: 'sl-predator-2',
          profileId: 'predator',
          selectedOptions: [
            { optionIndex: 12, count: 1 },
            { optionIndex: 14, count: 1 },
          ],
          originLegion: LegionFaction.DarkAngels,
        },
      ],
    },
  ],
});

export const CURATED_2000_POINT_ARMY_LISTS: CuratedArmyListDefinition[] = [
  {
    id: 'dark-angels-2000',
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    pointsLimit: 2000,
    name: 'Dark Angels Combined Deathwing/Dreadwing',
    summary:
      'Elite First Legion core built around Inner Circle Knights Cenobium, Dreadwing Interemptors, and a broad infantry line.',
    sources: [
      {
        label: 'Goonhammer Dark Angels legion focus',
        url: 'https://www.goonhammer.com/liber-hereticus-liber-astartes-the-goonhammer-review/',
      },
    ],
    armyList: DARK_ANGELS_2000,
  },
  {
    id: 'world-eaters-2000',
    faction: LegionFaction.WorldEaters,
    allegiance: Allegiance.Traitor,
    pointsLimit: 2000,
    name: 'World Eaters Chainaxe Spearhead',
    summary:
      'Aggressive World Eaters roster centered on Kharn, Rampagers, Red Butchers, and multiple line units pushing out of Rhinos.',
    sources: [
      {
        label: 'Goonhammer World Eaters legion focus',
        url: 'https://www.goonhammer.com/liber-hereticus-liber-astartes-the-goonhammer-review/',
      },
    ],
    armyList: WORLD_EATERS_2000,
  },
  {
    id: 'alpha-legion-2000',
    faction: LegionFaction.AlphaLegion,
    allegiance: Allegiance.Traitor,
    pointsLimit: 2000,
    name: 'Alpha Legion Infiltration Cadre',
    summary:
      'Alpha Legion force anchored by Armillus Dynat, reconnaissance assets, Headhunters, Lernaean Terminators, and mobile flanking craft.',
    sources: [
      {
        label: 'Goonhammer Alpha Legion legion focus',
        url: 'https://www.goonhammer.com/horus-heresy-alpha-legion-review/',
      },
    ],
    armyList: ALPHA_LEGION_2000,
  },
  {
    id: 'blackshields-2000',
    faction: SpecialFaction.Blackshields,
    allegiance: Allegiance.Loyalist,
    pointsLimit: 2000,
    name: 'Blackshields Outcast Warband',
    summary:
      'Oath-bound Blackshields infantry and armour battlegroup led by Endryd Haar, built as a hard-charging independent warband.',
    sources: [
      {
        label: 'Warhammer Community Blackshields reveal',
        url: 'https://www.warhammer-community.com/en-gb/articles/dl7io4ux/heresy-thursday-three-new-factions-enter-the-age-of-darkness/',
      },
    ],
    armyList: BLACKSHIELDS_2000,
  },
  {
    id: 'shattered-legions-2000',
    faction: SpecialFaction.ShatteredLegions,
    allegiance: Allegiance.Loyalist,
    pointsLimit: 2000,
    name: 'Shattered Legions Survivor Cohort',
    summary:
      'Mixed-legion survivors drawing from Dark Angels, World Eaters, and Alpha Legion lineages under Shattered Legions doctrine.',
    sources: [
      {
        label: 'Warhammer Community Shattered Legions reveal',
        url: 'https://www.warhammer-community.com/en-gb/articles/e0r6krr8/heresy-thursday-the-shattered-legions-break-cover/',
      },
    ],
    armyList: SHATTERED_LEGIONS_2000,
  },
];

const CURATED_2000_POINT_ARMY_LIST_BY_FACTION = new Map(
  CURATED_2000_POINT_ARMY_LISTS.map((definition) => [definition.faction, definition] as const),
);

export function getCurated2000PointArmyLists(): CuratedArmyListDefinition[] {
  return clone(CURATED_2000_POINT_ARMY_LISTS);
}

export function getCurated2000PointArmyList(
  faction: ArmyFaction,
): CuratedArmyListDefinition | undefined {
  const roster = CURATED_2000_POINT_ARMY_LIST_BY_FACTION.get(faction);
  return roster ? clone(roster) : undefined;
}
