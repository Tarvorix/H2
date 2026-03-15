/**
 * Tests for Weapon Declaration — Shooting Pipeline Step 3
 * Reference: HH_Rules_Battle.md — Step 3: Declare Weapons
 * Reference: HH_Principles.md — Snap Shots, Heavy Weapons, Tactical Statuses
 */

import { describe, it, expect } from 'vitest';
import { TacticalStatus, UnitMovementState } from '@hh/types';
import type { UnitState, ModelState } from '@hh/types';
import type { WeaponAssignment, ResolvedWeaponProfile } from './shooting-types';
import {
  validateWeaponAssignments,
  determineSnapShots,
  getWeaponSelectionOptions,
  resolveWeaponAssignment,
} from './weapon-declaration';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

/**
 * Create a minimal ModelState for testing.
 */
function createModel(id: string, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: ['bolter', 'flamer', 'plasma-gun', 'heavy-bolter', 'lascannon', 'krak-grenades', 'missile-launcher'],
    isWarlord: false,
    ...overrides,
  };
}

/**
 * Create a minimal UnitState for testing.
 */
function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [
      createModel(`${id}-m1`),
      createModel(`${id}-m2`),
      createModel(`${id}-m3`),
    ],
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...overrides,
  };
}

/**
 * Create a minimal ResolvedWeaponProfile for testing.
 */
function makeWeaponProfile(overrides: Partial<ResolvedWeaponProfile> = {}): ResolvedWeaponProfile {
  return {
    id: 'bolter',
    name: 'Bolter',
    range: 24,
    hasTemplate: false,
    firepower: 2,
    rangedStrength: 4,
    ap: 5,
    damage: 1,
    specialRules: [],
    traits: ['Bolt'],
    ...overrides,
  };
}

// ─── resolveWeaponAssignment Tests ──────────────────────────────────────────

describe('resolveWeaponAssignment', () => {
  it('resolves a valid ranged weapon by ID', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'bolter' };
    const result = resolveWeaponAssignment(assignment);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Bolter');
    expect(result!.range).toBe(24);
    expect(result!.firepower).toBe(2);
    expect(result!.rangedStrength).toBe(4);
    expect(result!.ap).toBe(5);
    expect(result!.damage).toBe(1);
  });

  it('resolves a heavy weapon (lascannon)', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'lascannon' };
    const result = resolveWeaponAssignment(assignment);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Lascannon');
    expect(result!.range).toBe(48);
    expect(result!.rangedStrength).toBe(9);
    expect(result!.ap).toBe(2);
  });

  it('returns undefined for a non-existent weapon ID', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'nonexistent-weapon' };
    const result = resolveWeaponAssignment(assignment);
    expect(result).toBeUndefined();
  });

  it('returns undefined for a melee weapon (cannot be used in shooting)', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'chainsword' };
    const result = resolveWeaponAssignment(assignment);
    expect(result).toBeUndefined();
  });

  it('resolves a template weapon (flamer)', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'flamer' };
    const result = resolveWeaponAssignment(assignment);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Flamer');
    expect(result!.hasTemplate).toBe(true);
    expect(result!.range).toBe(0);
  });

  it('resolves a plasma gun', () => {
    const assignment: WeaponAssignment = { modelId: 'model-1', weaponId: 'plasma-gun' };
    const result = resolveWeaponAssignment(assignment);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Plasma gun');
    expect(result!.range).toBe(24);
    expect(result!.firepower).toBe(2);
    expect(result!.rangedStrength).toBe(6);
    expect(result!.ap).toBe(4);
  });

  it('resolves dedicated ranged weapon IDs using unit profile context', () => {
    const attacker = createUnit('alpharius-unit', {
      profileId: 'alpharius',
      models: [
        createModel('alpharius-m1', {
          profileModelName: 'Alpharius',
          unitProfileId: 'alpharius',
          equippedWargear: ['the-hydra-s-spite'],
        }),
      ],
    });
    const assignment: WeaponAssignment = {
      modelId: 'alpharius-m1',
      weaponId: 'the-hydra-s-spite',
    };

    const result = resolveWeaponAssignment(assignment, attacker);
    expect(result).toBeDefined();
    expect(result!.name).toBe('The Hydra’s Spite');
    expect(result!.range).toBe(18);
    expect(result!.rangedStrength).toBe(7);
  });

  it('resolves grouped mounted vehicle weapons to their base profile with multiplied firepower', () => {
    const assignment: WeaponAssignment = {
      modelId: 'model-1',
      weaponId: 'two-centreline-mounted-twin-lascannon',
    };

    const result = resolveWeaponAssignment(assignment);
    expect(result).toBeDefined();
    expect(result!.name).toBe('Twin lascannon');
    expect(result!.range).toBe(48);
    expect(result!.firepower).toBe(4);
    expect(result!.rangedStrength).toBe(9);
    expect(result!.ap).toBe(2);
  });

  it('resolves parent missile-launcher assignments with the selected profile name', () => {
    const assignment: WeaponAssignment = {
      modelId: 'model-1',
      weaponId: 'missile-launcher',
      profileName: 'Krak',
    };

    const result = resolveWeaponAssignment(assignment);
    expect(result).toBeDefined();
    expect(result!.name).toBe('Missile launcher - Krak');
    expect(result!.range).toBe(48);
    expect(result!.rangedStrength).toBe(8);
    expect(result!.ap).toBe(3);
  });

  it('resolves range-band parent weapons automatically from target distance', () => {
    const assignment: WeaponAssignment = {
      modelId: 'model-1',
      weaponId: 'conversion-beam-cannon',
    };

    const result = resolveWeaponAssignment(assignment, undefined, undefined, 20);
    expect(result).toBeDefined();
    expect(result!.name).toBe('Conversion beam cannon');
    expect(result!.rangedStrength).toBe(7);
    expect(result!.ap).toBe(3);
    expect(result!.rangeBand).toEqual({ min: 15, max: 30 });
  });

  it('returns all legal profile options for a parent multi-profile weapon', () => {
    const options = getWeaponSelectionOptions({
      modelId: 'model-1',
      weaponId: 'missile-launcher',
    });

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.assignment.profileName)).toEqual(['Frag', 'Krak']);
  });
});

// ─── determineSnapShots Tests ───────────────────────────────────────────────

describe('determineSnapShots', () => {
  describe('unit status snap shot triggers', () => {
    it('Pinned unit fires all weapons as snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Pinned],
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile(); // Regular bolter

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Suppressed unit fires all weapons as snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Suppressed],
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile(); // Regular bolter

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('weapons without Skyfire fire snap shots when targeting Flyers', () => {
      const unit = createUnit('unit-1');
      const weapon = makeWeaponProfile();

      expect(determineSnapShots(unit, weapon, false, false, false, true)).toBe(true);
    });

    it('Skyfire weapons ignore the flyer snap shot penalty', () => {
      const unit = createUnit('unit-1');
      const weapon = makeWeaponProfile({
        specialRules: [{ name: 'Skyfire' }],
      });

      expect(determineSnapShots(unit, weapon, false, false, false, true)).toBe(false);
    });

    it('Pinned unit fires even non-heavy weapons as snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Pinned],
      });
      const weapon = makeWeaponProfile({
        traits: ['Assault', 'Bolt'],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Stunned status alone does not force snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Stunned],
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile();

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });

    it('Routed status alone does not force snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Routed],
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile();

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });
  });

  describe('Heavy weapon snap shot triggers', () => {
    it('Heavy weapon + unit moved -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        name: 'Heavy bolter',
        traits: ['Bolt'],
        specialRules: [{ name: 'Heavy', value: 'FP' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Heavy weapon + unit stationary -> NO snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile({
        name: 'Heavy bolter',
        traits: ['Bolt'],
        specialRules: [{ name: 'Heavy', value: 'FP' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });

    it('Heavy weapon with "Heavy" in traits (not special rules) + moved -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        name: 'Custom Heavy',
        traits: ['Heavy'],
        specialRules: [],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Heavy weapon + entered from reserves -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.EnteredFromReserves,
      });
      const weapon = makeWeaponProfile({
        name: 'Lascannon',
        traits: ['Las'],
        specialRules: [{ name: 'Heavy', value: 'D' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Heavy weapon + rushed -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Rushed,
      });
      const weapon = makeWeaponProfile({
        name: 'Autocannon',
        traits: ['Auto'],
        specialRules: [{ name: 'Heavy', value: 'FP' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });
  });

  describe('non-Heavy weapon, no status, stationary -> no snap shots', () => {
    it('Bolter, stationary unit, no statuses -> no snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Stationary,
        statuses: [],
      });
      const weapon = makeWeaponProfile();

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });

    it('Assault weapon + unit moved -> no snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        traits: ['Assault', 'Bolt'],
      });

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });

    it('Regular bolter + unit moved -> no snap shots (bolter is not heavy)', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        traits: ['Bolt'],
      });

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });
  });

  describe('Defensive weapon snap shot triggers', () => {
    it('Defensive weapon + unit moved -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        name: 'Storm bolter',
        traits: ['Defensive', 'Bolt'],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Defensive weapon + unit stationary -> no snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Stationary,
      });
      const weapon = makeWeaponProfile({
        name: 'Storm bolter',
        traits: ['Defensive', 'Bolt'],
      });

      expect(determineSnapShots(unit, weapon)).toBe(false);
    });

    it('Defensive special rule + unit moved -> snap shots', () => {
      const unit = createUnit('unit-1', {
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        name: 'Defensive weapon',
        specialRules: [{ name: 'Defensive' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });
  });

  describe('combined conditions', () => {
    it('Pinned + Heavy + moved -> snap shots (Pinned alone is sufficient)', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Pinned],
        movementState: UnitMovementState.Moved,
      });
      const weapon = makeWeaponProfile({
        specialRules: [{ name: 'Heavy', value: 'FP' }],
      });

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });

    it('Suppressed + Pinned -> snap shots', () => {
      const unit = createUnit('unit-1', {
        statuses: [TacticalStatus.Suppressed, TacticalStatus.Pinned],
      });
      const weapon = makeWeaponProfile();

      expect(determineSnapShots(unit, weapon)).toBe(true);
    });
  });
});

// ─── validateWeaponAssignments Tests ────────────────────────────────────────

describe('validateWeaponAssignments', () => {
  describe('valid assignments', () => {
    it('accepts valid bolter assignments for models with LOS in range', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20; // Within bolter's 24" range

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts template weapon regardless of distance', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'flamer' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 100; // Way beyond flamer range, but template weapons ignore range

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts different weapons for different models', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'plasma-gun' },
        { modelId: 'unit-1-m3', weaponId: 'heavy-bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts weapon at exact max range', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 24; // Exactly at bolter range

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts dedicated ranged weapon shorthand ID when in range', () => {
      const unit = createUnit('alpharius-unit', {
        profileId: 'alpharius',
        models: [
          createModel('alpharius-m1', {
            profileModelName: 'Alpharius',
            unitProfileId: 'alpharius',
            equippedWargear: ['the-hydra-s-spite'],
          }),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'alpharius-m1', weaponId: 'the-hydra-s-spite' },
      ];
      const modelsWithLOS = ['alpharius-m1'];
      const targetDistance = 18;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid assignments', () => {
    it('rejects empty assignments', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_WEAPON_ASSIGNMENTS');
    });

    it('rejects invalid weapon ID', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'nonexistent-weapon-xyz' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_WEAPON')).toBe(true);
    });

    it('rejects melee weapon for shooting', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'chainsword' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 5;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_WEAPON')).toBe(true);
    });

    it('rejects ranged weapons the model does not have equipped', () => {
      const unit = createUnit('unit-1', {
        models: [
          createModel('unit-1-m1', { equippedWargear: ['bolter'] }),
          createModel('unit-1-m2'),
          createModel('unit-1-m3'),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'plasma-gun' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'WEAPON_NOT_EQUIPPED')).toBe(true);
    });

    it('rejects model not in LOS', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS: string[] = []; // No models have LOS

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, 20);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MODEL_NO_LOS')).toBe(true);
    });

    it('rejects weapon out of range', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' }, // Bolter range 24"
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 30; // Beyond 24" range

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'WEAPON_OUT_OF_RANGE')).toBe(true);
    });

    it('rejects dedicated ranged weapon shorthand ID when out of range', () => {
      const unit = createUnit('alpharius-unit', {
        profileId: 'alpharius',
        models: [
          createModel('alpharius-m1', {
            profileModelName: 'Alpharius',
            unitProfileId: 'alpharius',
            equippedWargear: ['the-hydra-s-spite'],
          }),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'alpharius-m1', weaponId: 'the-hydra-s-spite' },
      ];
      const modelsWithLOS = ['alpharius-m1'];
      const targetDistance = 18.1;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'WEAPON_OUT_OF_RANGE')).toBe(true);
    });

    it('rejects model not in unit', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'other-unit-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['other-unit-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MODEL_NOT_IN_UNIT')).toBe(true);
    });

    it('rejects destroyed model', () => {
      const unit = createUnit('unit-1', {
        models: [
          createModel('unit-1-m1', { isDestroyed: true, currentWounds: 0 }),
          createModel('unit-1-m2'),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MODEL_DESTROYED')).toBe(true);
    });

    it('rejects duplicate model assignments', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m1', weaponId: 'plasma-gun' }, // Same model, different weapon
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_MODEL_ASSIGNMENT')).toBe(true);
    });
  });

  describe('multiple errors', () => {
    it('reports multiple errors for multiple invalid assignments', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'nonexistent' }, // Invalid weapon
        { modelId: 'unit-1-m2', weaponId: 'bolter' },      // Out of range
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 30; // Beyond bolter range

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      // Should have at least 2 errors: invalid weapon + out of range
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    it('lascannon at 48" range is valid at 48"', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'lascannon' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 48;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('lascannon at 48" range is invalid at 48.1"', () => {
      const unit = createUnit('unit-1');
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'lascannon' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 48.1;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'WEAPON_OUT_OF_RANGE')).toBe(true);
    });

    it('meltagun at 12" range is valid at 12"', () => {
      const unit = createUnit('unit-1', {
        models: [
          createModel('unit-1-m1', { equippedWargear: ['meltagun'] }),
          createModel('unit-1-m2'),
          createModel('unit-1-m3'),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'meltagun' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 12;

      const result = validateWeaponAssignments(assignments, unit, modelsWithLOS, targetDistance);

      expect(result.valid).toBe(true);
    });
  });
});
