import { describe, expect, it } from 'vitest';
import { LegionFaction, SpecialFaction } from '@hh/types';
import {
  getAllLegions,
  getPlayableFactions,
  isPlayableFaction,
} from './faction-scope';

describe('faction-scope', () => {
  it('returns all 18 legions', () => {
    const legions = getAllLegions();
    expect(legions).toHaveLength(18);
    expect(new Set(legions)).toEqual(new Set(Object.values(LegionFaction)));
  });

  it('returns a mutable copy for all legions', () => {
    const legions = getAllLegions();
    legions.pop();
    expect(getAllLegions()).toHaveLength(18);
  });

  it('marks playable factions correctly', () => {
    for (const legion of Object.values(LegionFaction)) {
      expect(isPlayableFaction(legion)).toBe(true);
    }
    for (const faction of Object.values(SpecialFaction)) {
      expect(isPlayableFaction(faction)).toBe(true);
    }
    expect(isPlayableFaction('not-a-faction')).toBe(false);
    expect(isPlayableFaction(null)).toBe(false);
    expect(getPlayableFactions().length).toBeGreaterThanOrEqual(20);
  });
});
