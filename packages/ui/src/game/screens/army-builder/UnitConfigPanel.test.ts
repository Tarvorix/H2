import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { getAllProfiles, getProfileById } from '@hh/data';
import type { UnitProfile } from '@hh/types';
import { UnitConfigPanel } from './UnitConfigPanel';

describe('UnitConfigPanel', () => {
  it('renders praetor profile without throwing', () => {
    const praetor = getProfileById('praetor');
    expect(praetor).toBeDefined();

    expect(() =>
      renderToString(
        React.createElement(UnitConfigPanel, {
          profile: praetor ?? null,
          onCancel: () => undefined,
          onConfirm: () => undefined,
        }),
      ),
    ).not.toThrow();
  });

  it('renders every MVP profile without throwing', () => {
    const profiles = getAllProfiles();
    expect(profiles.length).toBeGreaterThan(0);

    for (const profile of profiles) {
      expect(() =>
        renderToString(
          React.createElement(UnitConfigPanel, {
            profile,
            onCancel: () => undefined,
            onConfirm: () => undefined,
          }),
        ),
      ).not.toThrow();
    }
  });

  it('handles malformed wargear option data safely', () => {
    const praetor = getProfileById('praetor');
    expect(praetor).toBeDefined();

    const malformedProfile: UnitProfile = {
      ...praetor!,
      wargearOptions: [
        null,
        undefined,
        { description: '', pointsCost: Number.NaN },
        { description: 'Valid option', pointsCost: 15 },
      ],
    } as unknown as UnitProfile;

    expect(() =>
      renderToString(
        React.createElement(UnitConfigPanel, {
          profile: malformedProfile,
          onCancel: () => undefined,
          onConfirm: () => undefined,
        }),
      ),
    ).not.toThrow();
  });
});
