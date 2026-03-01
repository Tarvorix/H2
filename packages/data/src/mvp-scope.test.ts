import { describe, it, expect } from 'vitest';
import { LegionFaction } from '@hh/types';
import { MVP_LEGIONS, getMvpLegions, isMvpLegion } from './mvp-scope';

describe('mvp-scope', () => {
  it('exports exactly the 3 MVP legions', () => {
    expect(MVP_LEGIONS).toEqual([
      LegionFaction.WorldEaters,
      LegionFaction.AlphaLegion,
      LegionFaction.DarkAngels,
    ]);
  });

  it('getMvpLegions returns a mutable copy', () => {
    const legions = getMvpLegions();
    expect(legions).toEqual(MVP_LEGIONS);
    legions.push(LegionFaction.SonsOfHorus);
    expect(getMvpLegions()).toEqual(MVP_LEGIONS);
  });

  it('isMvpLegion guards membership correctly', () => {
    expect(isMvpLegion(LegionFaction.WorldEaters)).toBe(true);
    expect(isMvpLegion(LegionFaction.AlphaLegion)).toBe(true);
    expect(isMvpLegion(LegionFaction.DarkAngels)).toBe(true);
    expect(isMvpLegion(LegionFaction.SonsOfHorus)).toBe(false);
    expect(isMvpLegion('not-a-legion')).toBe(false);
    expect(isMvpLegion(null)).toBe(false);
  });
});
