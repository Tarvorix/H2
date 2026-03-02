import { describe, expect, it } from 'vitest';
import { LegionFaction, SpecialFaction } from '@hh/types';
import {
  getAllLegions,
  getCuratedLegions,
  getPlayableFactions,
  isPlayableFaction,
} from './faction-scope';

describe('faction-scope', () => {
  it('returns all 18 legions for doctrine-level selectors', () => {
    const legions = getAllLegions();
    expect(legions).toHaveLength(Object.values(LegionFaction).length);
    expect(legions).toContain(LegionFaction.DarkAngels);
    expect(legions).toContain(LegionFaction.IronHands);
  });

  it('returns curated legions for top-level playable factions', () => {
    expect(getCuratedLegions()).toEqual([
      LegionFaction.DarkAngels,
      LegionFaction.WorldEaters,
      LegionFaction.AlphaLegion,
    ]);
  });

  it('returns a mutable copy for all legions', () => {
    const legions = getAllLegions();
    legions.pop();
    expect(getAllLegions()).toHaveLength(Object.values(LegionFaction).length);
  });

  it('marks playable factions correctly', () => {
    for (const legion of getCuratedLegions()) {
      expect(isPlayableFaction(legion)).toBe(true);
    }
    expect(isPlayableFaction(LegionFaction.IronWarriors)).toBe(false);
    for (const faction of Object.values(SpecialFaction)) {
      expect(isPlayableFaction(faction)).toBe(true);
    }
    expect(isPlayableFaction('not-a-faction')).toBe(false);
    expect(isPlayableFaction(null)).toBe(false);
    expect(getPlayableFactions().length).toBe(5);
  });
});
