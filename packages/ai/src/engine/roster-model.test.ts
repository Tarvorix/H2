import { describe, expect, it } from 'vitest';
import type { ArmyList, ArmyListDetachment, ArmyListUnit } from '@hh/types';
import {
  Allegiance,
  BattlefieldRole,
  DetachmentType,
  LegionFaction,
} from '@hh/types';
import {
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  ROSTER_FEATURE_DIMENSION,
  evaluateRosterArmyList,
  extractRosterFeatures,
  listNNUEModels,
  resolveNNUEModel,
} from '../index';

function makeUnit(overrides: Partial<ArmyListUnit>): ArmyListUnit {
  return {
    id: overrides.id ?? `unit-${Math.random().toString(36).slice(2, 6)}`,
    profileId: overrides.profileId ?? 'centurion',
    modelCount: overrides.modelCount ?? 1,
    selectedOptions: overrides.selectedOptions ?? [],
    totalPoints: overrides.totalPoints ?? 100,
    battlefieldRole: overrides.battlefieldRole ?? BattlefieldRole.Command,
  };
}

function makeDetachment(
  detachmentTemplateId: string,
  type: DetachmentType,
  units: ArmyListUnit[],
): ArmyListDetachment {
  return {
    id: `${detachmentTemplateId}-${Math.random().toString(36).slice(2, 6)}`,
    detachmentTemplateId,
    type,
    faction: LegionFaction.SonsOfHorus,
    units,
  };
}

function makeSparseArmy(): ArmyList {
  const detachments = [
    makeDetachment('crusade-primary', DetachmentType.Primary, [
      makeUnit({
        id: 'cmd',
        profileId: 'centurion',
        battlefieldRole: BattlefieldRole.Command,
        totalPoints: 100,
      }),
      makeUnit({
        id: 'troops',
        profileId: 'tactical-squad',
        modelCount: 10,
        battlefieldRole: BattlefieldRole.Troops,
        totalPoints: 125,
      }),
    ]),
  ];

  return {
    playerName: 'Sparse',
    pointsLimit: 2000,
    totalPoints: 225,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    detachments,
    warlordUnitId: 'cmd',
  };
}

function makeBalancedArmy(): ArmyList {
  const primaryUnits = [
    makeUnit({
      id: 'hc',
      profileId: 'praetor',
      battlefieldRole: BattlefieldRole.HighCommand,
      totalPoints: 120,
    }),
    makeUnit({
      id: 'cmd',
      profileId: 'centurion',
      battlefieldRole: BattlefieldRole.Command,
      totalPoints: 100,
    }),
    makeUnit({
      id: 'troops-1',
      profileId: 'tactical-squad',
      modelCount: 10,
      battlefieldRole: BattlefieldRole.Troops,
      totalPoints: 125,
    }),
    makeUnit({
      id: 'troops-2',
      profileId: 'despoiler-squad',
      modelCount: 10,
      battlefieldRole: BattlefieldRole.Troops,
      totalPoints: 100,
    }),
    makeUnit({
      id: 'troops-3',
      profileId: 'assault-squad',
      modelCount: 10,
      battlefieldRole: BattlefieldRole.Troops,
      totalPoints: 145,
    }),
    makeUnit({
      id: 'transport',
      profileId: 'drop-pod',
      battlefieldRole: BattlefieldRole.Transport,
      totalPoints: 50,
    }),
  ];
  const auxiliaryUnits = [
    makeUnit({
      id: 'war-engine',
      profileId: 'contemptor-dreadnought',
      battlefieldRole: BattlefieldRole.WarEngine,
      totalPoints: 150,
    }),
  ];
  const detachments = [
    makeDetachment('crusade-primary', DetachmentType.Primary, primaryUnits),
    makeDetachment('heavy-support', DetachmentType.Auxiliary, auxiliaryUnits),
  ];

  return {
    playerName: 'Balanced',
    pointsLimit: 2000,
    totalPoints: 790,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    detachments,
    warlordUnitId: 'hc',
  };
}

describe('roster NNUE model support', () => {
  it('registers the built-in roster model separately from gameplay models', () => {
    const rosterModel = resolveNNUEModel(DEFAULT_ROSTER_NNUE_MODEL_ID, 'roster');

    expect(rosterModel.manifest.modelKind).toBe('roster');
    expect(listNNUEModels('roster')).toContain(DEFAULT_ROSTER_NNUE_MODEL_ID);
  });

  it('extracts bounded roster features for valid army lists', () => {
    const features = extractRosterFeatures(makeBalancedArmy());

    expect(features).toHaveLength(ROSTER_FEATURE_DIMENSION);
    expect(Array.from(features).every((feature) => feature >= -1 && feature <= 1)).toBe(true);
  });

  it('scores a more complete roster above a sparse one with the default roster model', () => {
    const sparseScore = evaluateRosterArmyList(makeSparseArmy(), DEFAULT_ROSTER_NNUE_MODEL_ID);
    const balancedScore = evaluateRosterArmyList(makeBalancedArmy(), DEFAULT_ROSTER_NNUE_MODEL_ID);

    expect(balancedScore).toBeGreaterThan(sparseScore);
  });
});
