import { describe, expect, it } from 'vitest';
import { validateArmyListWithDoctrine } from '@hh/army-builder';
import {
  createHeadlessGameStateFromArmyLists,
  getCurated2000PointArmyLists,
  validateHeadlessArmyLists,
} from './index';

describe('curated 2000-point army lists', () => {
  it('provides one validated roster for each currently playable faction', () => {
    const rosters = getCurated2000PointArmyLists();

    expect(rosters).toHaveLength(5);

    for (const roster of rosters) {
      const validation = validateArmyListWithDoctrine(roster.armyList);
      const allUnits = roster.armyList.detachments.flatMap((detachment) => detachment.units);
      const assignedTransportIds = new Set(
        allUnits
          .flatMap((unit) => unit.assignedTransportUnitId ? [unit.assignedTransportUnitId] : []),
      );

      expect(roster.armyList.pointsLimit).toBe(2000);
      expect(roster.armyList.totalPoints).toBe(2000);
      expect(
        validation.isValid,
        `${roster.id}: ${validation.errors.map((error) => error.message).join(' | ')}`,
      ).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(new Set(allUnits.map((unit) => unit.id)).size).toBe(allUnits.length);

      for (const unit of allUnits) {
        if (unit.battlefieldRole === 'Transport' || unit.battlefieldRole === 'Heavy Transport') {
          expect(assignedTransportIds.has(unit.id)).toBe(true);
        }
      }
    }
  });

  it('can be paired into a headless match setup without duplicate-ID or validation failures', () => {
    const rosters = getCurated2000PointArmyLists();
    const validation = validateHeadlessArmyLists([
      rosters[0].armyList,
      rosters[1].armyList,
    ]);
    const state = createHeadlessGameStateFromArmyLists({
      missionId: 'heart-of-battle',
      armyLists: [rosters[0].armyList, rosters[1].armyList],
    });

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(state.armies[0].units.length).toBeGreaterThan(0);
    expect(state.armies[1].units.length).toBeGreaterThan(0);
  });
});
