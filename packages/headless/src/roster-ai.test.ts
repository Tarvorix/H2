import { describe, expect, it } from 'vitest';
import { DEFAULT_ROSTER_NNUE_MODEL_ID } from '@hh/ai';
import {
  getProfileById,
  getProfileFixedAllegiances,
} from '@hh/data';
import {
  Allegiance,
  LegionFaction,
} from '@hh/types';
import {
  createHeadlessGameStateFromGeneratedArmyLists,
  createHeadlessMatchSession,
  generateHeadlessArmyList,
  validateHeadlessArmyLists,
} from './index';

describe('headless roster AI', () => {
  it('generates deterministic heuristic rosters that validate cleanly', () => {
    const config = {
      playerName: 'Roster Alpha',
      faction: LegionFaction.WorldEaters,
      allegiance: Allegiance.Traitor,
      pointsLimit: 2000,
      strategyTier: 'heuristic' as const,
      baseSeed: 4242,
      candidateCount: 8,
    };

    const generatedA = generateHeadlessArmyList(config);
    const generatedB = generateHeadlessArmyList(config);

    expect(generatedA.armyList).toEqual(generatedB.armyList);
    expect(generatedA.armyList.totalPoints).toBeLessThanOrEqual(config.pointsLimit);
    expect(generatedA.diagnostics.strategyTier).toBe('heuristic');
    expect(generatedA.validation.isValid).toBe(true);
    expect(generatedA.validation.errors).toHaveLength(0);
  });

  it('supports roster-model selection separately from gameplay Engine', () => {
    const generated = generateHeadlessArmyList({
      playerName: 'Roster Beta',
      faction: LegionFaction.DarkAngels,
      allegiance: Allegiance.Loyalist,
      pointsLimit: 2500,
      strategyTier: 'model',
      nnueModelId: DEFAULT_ROSTER_NNUE_MODEL_ID,
      baseSeed: 9001,
      candidateCount: 10,
    });

    expect(generated.diagnostics.strategyTier).toBe('model');
    expect(generated.diagnostics.modelId).toBe(DEFAULT_ROSTER_NNUE_MODEL_ID);
    expect(generated.armyList.detachments.length).toBeGreaterThan(0);
    expect(generated.armyList.totalPoints).toBeLessThanOrEqual(2500);
    expect(generated.validation.isValid).toBe(true);
  });

  it('creates game state and sessions from generated army-list setup options', () => {
    const generatedSetup = {
      missionId: 'heart-of-battle',
      rosterConfigs: [
        {
          playerName: 'Generated 1',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          pointsLimit: 2000,
          strategyTier: 'heuristic' as const,
          baseSeed: 101,
        },
        {
          playerName: 'Generated 2',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          pointsLimit: 2000,
          strategyTier: 'model' as const,
          nnueModelId: DEFAULT_ROSTER_NNUE_MODEL_ID,
          baseSeed: 202,
        },
      ] as const,
    };

    const generated = createHeadlessGameStateFromGeneratedArmyLists(generatedSetup);
    const session = createHeadlessMatchSession({
      generatedArmyListSetupOptions: generatedSetup,
    });

    expect(generated.state.armies[0].units.length).toBeGreaterThan(0);
    expect(generated.state.armies[1].units.length).toBeGreaterThan(0);
    expect(generated.generatedArmies[1].diagnostics.modelId).toBe(DEFAULT_ROSTER_NNUE_MODEL_ID);
    expect(generated.generatedArmies[0].validation.isValid).toBe(true);
    expect(generated.generatedArmies[1].validation.isValid).toBe(true);
    expect(session.getState().armies[0].units.length).toBeGreaterThan(0);
    expect(session.getState().armies[1].units.length).toBeGreaterThan(0);
  });

  it('assigns player-scoped unit IDs when generating paired army lists', () => {
    const generatedSetup = {
      missionId: 'heart-of-battle',
      rosterConfigs: [
        {
          playerName: 'Generated Mirror',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          pointsLimit: 2000,
          strategyTier: 'heuristic' as const,
          baseSeed: 5150,
        },
        {
          playerName: 'Generated Mirror',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          pointsLimit: 2000,
          strategyTier: 'heuristic' as const,
          baseSeed: 5150,
        },
      ] as const,
    };

    const generated = createHeadlessGameStateFromGeneratedArmyLists(generatedSetup);
    const player0UnitIds = new Set(generated.state.armies[0].units.map((unit) => unit.id));
    const player1UnitIds = new Set(generated.state.armies[1].units.map((unit) => unit.id));
    const validation = validateHeadlessArmyLists([
      generated.generatedArmies[0].armyList,
      generated.generatedArmies[1].armyList,
    ]);

    expect(validation.isValid).toBe(true);
    expect([...player0UnitIds].every((unitId) => !player1UnitIds.has(unitId))).toBe(true);
    expect([...player0UnitIds].every((unitId) => unitId.startsWith('p0-'))).toBe(true);
    expect([...player1UnitIds].every((unitId) => unitId.startsWith('p1-'))).toBe(true);
  });

  it('keeps generated rosters free of fixed-allegiance mismatches and unused dedicated transports', () => {
    const generated = generateHeadlessArmyList({
      playerName: 'Legality Audit',
      faction: LegionFaction.DarkAngels,
      allegiance: Allegiance.Traitor,
      pointsLimit: 2000,
      strategyTier: 'heuristic',
      baseSeed: 1337,
      candidateCount: 12,
    });

    const assignedTransportIds = new Set(
      generated.armyList.detachments
        .flatMap((detachment) => detachment.units)
        .flatMap((unit) => unit.assignedTransportUnitId ? [unit.assignedTransportUnitId] : []),
    );

    for (const detachment of generated.armyList.detachments) {
      for (const unit of detachment.units) {
        const profile = getProfileById(unit.profileId);
        expect(profile).toBeDefined();

        const fixedAllegiances = getProfileFixedAllegiances(profile!);
        if (fixedAllegiances.length > 0) {
          expect(fixedAllegiances).toContain(generated.armyList.allegiance);
        }

        if (unit.battlefieldRole === 'Transport' || unit.battlefieldRole === 'Heavy Transport') {
          expect(assignedTransportIds.has(unit.id)).toBe(true);
        }
      }
    }
  });
});
