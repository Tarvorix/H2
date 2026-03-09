import { describe, expect, it } from 'vitest';
import { Allegiance, LegionFaction } from '@hh/types';
import { getProfileById } from './profile-registry';
import {
  canProfileEmbarkOnTransport,
  getProfileBulkyValue,
  getProfileFixedAllegiances,
  getTransportProfileRules,
  isProfileCompatibleWithArmyAllegiance,
} from './profile-legality';

describe('profile legality helpers', () => {
  it('exposes fixed allegiances for named characters', () => {
    const mardukSedras = getProfileById('marduk-sedras');
    expect(mardukSedras).toBeDefined();
    expect(getProfileFixedAllegiances(mardukSedras!)).toEqual([Allegiance.Loyalist]);
    expect(isProfileCompatibleWithArmyAllegiance(mardukSedras!, Allegiance.Traitor)).toBe(false);
  });

  it('treats placeholder allegiance units as flexible', () => {
    const tacticalSquad = getProfileById('tactical-squad');
    expect(tacticalSquad).toBeDefined();
    expect(getProfileFixedAllegiances(tacticalSquad!)).toEqual([]);
    expect(isProfileCompatibleWithArmyAllegiance(tacticalSquad!, Allegiance.Loyalist)).toBe(true);
    expect(isProfileCompatibleWithArmyAllegiance(tacticalSquad!, Allegiance.Traitor)).toBe(true);
  });
});

describe('transport legality helpers', () => {
  it('rejects bulky infantry embarking on light transports', () => {
    const assaultSquad = getProfileById('assault-squad');
    const rhino = getProfileById('rhino');
    expect(assaultSquad).toBeDefined();
    expect(rhino).toBeDefined();
    expect(getProfileBulkyValue(assaultSquad!)).toBe(2);

    const result = canProfileEmbarkOnTransport({
      passengerProfile: assaultSquad!,
      passengerModelCount: 10,
      passengerFaction: LegionFaction.SonsOfHorus,
      transportProfile: rhino!,
      transportFaction: LegionFaction.SonsOfHorus,
    });

    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Light Transport');
  });

  it('allows regular infantry on a rhino within capacity', () => {
    const tacticalSquad = getProfileById('tactical-squad');
    const rhino = getProfileById('rhino');
    expect(tacticalSquad).toBeDefined();
    expect(rhino).toBeDefined();

    const result = canProfileEmbarkOnTransport({
      passengerProfile: tacticalSquad!,
      passengerModelCount: 10,
      passengerFaction: LegionFaction.SonsOfHorus,
      transportProfile: rhino!,
      transportFaction: LegionFaction.SonsOfHorus,
    });

    expect(result.isCompatible).toBe(true);
    expect(result.requiredCapacity).toBe(10);
  });

  it('limits dreadnought transports to walker passengers', () => {
    const contemptor = getProfileById('contemptor-dreadnought');
    const tacticalSquad = getProfileById('tactical-squad');
    const dreadnoughtDropPod = getProfileById('dreadnought-drop-pod');
    expect(contemptor).toBeDefined();
    expect(tacticalSquad).toBeDefined();
    expect(dreadnoughtDropPod).toBeDefined();

    const walkerResult = canProfileEmbarkOnTransport({
      passengerProfile: contemptor!,
      passengerModelCount: 1,
      passengerFaction: LegionFaction.SonsOfHorus,
      transportProfile: dreadnoughtDropPod!,
      transportFaction: LegionFaction.SonsOfHorus,
    });
    const infantryResult = canProfileEmbarkOnTransport({
      passengerProfile: tacticalSquad!,
      passengerModelCount: 10,
      passengerFaction: LegionFaction.SonsOfHorus,
      transportProfile: dreadnoughtDropPod!,
      transportFaction: LegionFaction.SonsOfHorus,
    });

    expect(walkerResult.isCompatible).toBe(true);
    expect(infantryResult.isCompatible).toBe(false);
  });

  it('marks super-heavy transports as multi-unit carriers', () => {
    const thunderhawk = getProfileById('thunderhawk-gunship');
    expect(thunderhawk).toBeDefined();
    expect(getTransportProfileRules(thunderhawk!)).toMatchObject({
      allowsMultipleUnits: true,
      capacity: 32,
    });
  });
});
