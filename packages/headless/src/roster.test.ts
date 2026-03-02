import { describe, expect, it } from 'vitest';
import type { ArmyList, ArmyListUnit, ArmyListDetachment } from '@hh/types';
import {
  Allegiance,
  BattlefieldRole,
  DetachmentType,
  LegionFaction,
} from '@hh/types';
import {
  createHeadlessGameStateFromArmyLists,
  validateHeadlessArmyLists,
} from './roster';

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

function makePrimaryDetachment(
  faction: LegionFaction,
  units: ArmyListUnit[],
): ArmyListDetachment {
  return {
    id: `det-primary-${Math.random().toString(36).slice(2, 6)}`,
    detachmentTemplateId: 'crusade-primary',
    type: DetachmentType.Primary,
    faction,
    units,
  };
}

function makeValidArmyList(faction: LegionFaction, name: string): ArmyList {
  const units: ArmyListUnit[] = [
    makeUnit({
      id: `${name}-hc`,
      profileId: 'armillus-dynat',
      battlefieldRole: BattlefieldRole.HighCommand,
      totalPoints: 185,
    }),
    makeUnit({
      id: `${name}-cmd`,
      profileId: 'centurion',
      battlefieldRole: BattlefieldRole.Command,
      totalPoints: 100,
    }),
    makeUnit({
      id: `${name}-troops`,
      profileId: 'assault-squad',
      modelCount: 10,
      battlefieldRole: BattlefieldRole.Troops,
      totalPoints: 145,
    }),
  ];

  const totalPoints = units.reduce((sum, unit) => sum + unit.totalPoints, 0);

  return {
    playerName: name,
    faction,
    allegiance: Allegiance.Traitor,
    pointsLimit: 2000,
    totalPoints,
    detachments: [makePrimaryDetachment(faction, units)],
  };
}

describe('headless roster validation', () => {
  it('accepts valid army lists', () => {
    const army0 = makeValidArmyList(LegionFaction.WorldEaters, 'Player 1');
    const army1 = makeValidArmyList(LegionFaction.AlphaLegion, 'Player 2');

    const result = validateHeadlessArmyLists([army0, army1]);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.playerResults[0].isValid).toBe(true);
    expect(result.playerResults[1].isValid).toBe(true);
  });

  it('rejects unplayable faction and unknown profile references', () => {
    const army0 = makeValidArmyList(LegionFaction.WorldEaters, 'Player 1');
    const army1 = makeValidArmyList(LegionFaction.AlphaLegion, 'Player 2');

    army1.faction = 'Not A Faction' as LegionFaction;
    army1.detachments[0].faction = 'Not A Faction' as LegionFaction;
    army1.detachments[0].units[0] = makeUnit({
      id: 'invalid-profile',
      profileId: 'not-a-real-profile',
      battlefieldRole: BattlefieldRole.HighCommand,
      totalPoints: 100,
    });

    const result = validateHeadlessArmyLists([army0, army1]);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((err) => err.includes('not currently playable'))).toBe(true);
    expect(result.errors.some((err) => err.includes('unknown or out-of-scope profile ID'))).toBe(true);
  });
});

describe('createHeadlessGameStateFromArmyLists', () => {
  it('builds a mission-initialized headless state from valid ArmyList input', () => {
    const army0 = makeValidArmyList(LegionFaction.WorldEaters, 'Player 1');
    const army1 = makeValidArmyList(LegionFaction.DarkAngels, 'Player 2');

    const state = createHeadlessGameStateFromArmyLists({
      missionId: 'heart-of-battle',
      armyLists: [army0, army1],
    });

    expect(state.armies[0].faction).toBe(LegionFaction.WorldEaters);
    expect(state.armies[1].faction).toBe(LegionFaction.DarkAngels);
    expect(state.armies[0].units.length).toBeGreaterThan(0);
    expect(state.armies[1].units.length).toBeGreaterThan(0);
    expect(state.missionState?.missionId).toBe('heart-of-battle');
  });

  it('throws when ArmyList payload is invalid', () => {
    const army0 = makeValidArmyList(LegionFaction.WorldEaters, 'Player 1');
    const army1 = makeValidArmyList(LegionFaction.AlphaLegion, 'Player 2');
    army1.detachments[0].units[0] = makeUnit({
      id: 'bad-unit',
      profileId: 'unknown-profile-id',
      battlefieldRole: BattlefieldRole.HighCommand,
      totalPoints: 100,
    });

    expect(() =>
      createHeadlessGameStateFromArmyLists({
        missionId: 'heart-of-battle',
        armyLists: [army0, army1],
      }),
    ).toThrow('Cannot create headless game state from invalid army list(s)');
  });
});
