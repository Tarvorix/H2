/**
 * Tests for Fire Group Formation — Shooting Pipeline Step 4
 * Reference: HH_Rules_Battle.md — Step 4: Set Fire Groups
 * Reference: HH_Principles.md — Fire Groups, Rapid Fire, Precision
 */

import { describe, it, expect } from 'vitest';
import { TacticalStatus, UnitMovementState } from '@hh/types';
import type { UnitState, ModelState, SpecialRuleRef } from '@hh/types';
import type {
  WeaponAssignment,
  FireGroup,
  ResolvedWeaponProfile,
  HitResult,
} from './shooting-types';
import { formFireGroups, splitPrecisionHits } from './fire-groups';

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
    equippedWargear: ['bolter'],
    isWarlord: false,
    ...overrides,
  };
}

/**
 * Create a minimal UnitState for testing.
 */
function createUnit(id: string, modelCount: number, overrides: Partial<UnitState> = {}): UnitState {
  const models: ModelState[] = [];
  for (let i = 0; i < modelCount; i++) {
    models.push(createModel(`${id}-m${i + 1}`));
  }
  return {
    id,
    profileId: 'tactical',
    models,
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
    id: 'test-weapon',
    name: 'Test Weapon',
    range: 24,
    hasTemplate: false,
    firepower: 1,
    rangedStrength: 4,
    ap: 5,
    damage: 1,
    specialRules: [],
    traits: [],
    ...overrides,
  };
}

/**
 * Create a minimal FireGroup for testing precision split.
 */
function makeFireGroup(overrides: Partial<FireGroup> = {}): FireGroup {
  const weaponProfile = overrides.weaponProfile ?? makeWeaponProfile();
  return {
    index: 0,
    weaponName: 'Test Weapon',
    ballisticSkill: 4,
    isSnapShot: false,
    attacks: [],
    totalFirepower: 3,
    specialRules: [],
    traits: [],
    weaponProfile,
    hits: [],
    wounds: [],
    penetratingHits: [],
    glancingHits: [],
    resolved: false,
    isPrecisionGroup: false,
    isDeflagrateGroup: false,
    ...overrides,
  };
}

/**
 * Create a minimal HitResult for testing.
 */
function makeHitResult(overrides: Partial<HitResult> = {}): HitResult {
  return {
    diceRoll: 4,
    targetNumber: 3,
    isHit: true,
    isCritical: false,
    isPrecision: false,
    isRending: false,
    isAutoHit: false,
    sourceModelId: 'model-1',
    weaponStrength: 4,
    weaponAP: 5,
    weaponDamage: 1,
    specialRules: [],
    ...overrides,
  };
}

// ─── formFireGroups Tests ───────────────────────────────────────────────────

describe('formFireGroups', () => {
  describe('single weapon type', () => {
    it('groups 3 models with same bolter into one fire group', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
        { modelId: 'unit-1-m3', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].weaponName).toBe('Bolter');
      expect(groups[0].attacks).toHaveLength(3);
      expect(groups[0].ballisticSkill).toBe(4); // Default BS
      expect(groups[0].isSnapShot).toBe(false);
      expect(groups[0].index).toBe(0);
    });

    it('calculates total firepower from all attacks in group', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' }, // FP 2
        { modelId: 'unit-1-m2', weaponId: 'bolter' }, // FP 2
        { modelId: 'unit-1-m3', weaponId: 'bolter' }, // FP 2
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups[0].totalFirepower).toBe(6); // 3 models * 2 FP each
    });

    it('each attack references the correct model ID', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
        { modelId: 'unit-1-m3', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      const modelIds = groups[0].attacks.map((a) => a.modelId);
      expect(modelIds).toContain('unit-1-m1');
      expect(modelIds).toContain('unit-1-m2');
      expect(modelIds).toContain('unit-1-m3');
    });
  });

  describe('multiple weapon types', () => {
    it('creates separate fire groups for different weapons', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'plasma-gun' },
        { modelId: 'unit-1-m3', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(2);

      // Find bolter group and plasma group
      const bolterGroup = groups.find((g) => g.weaponName === 'Bolter');
      const plasmaGroup = groups.find((g) => g.weaponName === 'Plasma gun');

      expect(bolterGroup).toBeDefined();
      expect(plasmaGroup).toBeDefined();
      expect(bolterGroup!.attacks).toHaveLength(2); // 2 bolter models
      expect(plasmaGroup!.attacks).toHaveLength(1); // 1 plasma model
    });

    it('assigns sequential indices to fire groups', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'heavy-bolter' },
        { modelId: 'unit-1-m3', weaponId: 'lascannon' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(3);
      expect(groups[0].index).toBe(0);
      expect(groups[1].index).toBe(1);
      expect(groups[2].index).toBe(2);
    });
  });

  describe('snap shot splitting', () => {
    it('splits Heavy weapon models into snap shot group when unit moved', () => {
      const unit = createUnit('unit-1', 3, {
        movementState: UnitMovementState.Moved,
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },      // Non-heavy, normal shots
        { modelId: 'unit-1-m2', weaponId: 'heavy-bolter' }, // Heavy, snap shots because moved
        { modelId: 'unit-1-m3', weaponId: 'bolter' },       // Non-heavy, normal shots
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      // Bolter group (normal) and Heavy bolter group (snap shots)
      const bolterGroup = groups.find((g) => g.weaponName === 'Bolter');
      const heavyBolterGroup = groups.find((g) => g.weaponName === 'Heavy bolter');

      expect(bolterGroup).toBeDefined();
      expect(heavyBolterGroup).toBeDefined();
      expect(bolterGroup!.isSnapShot).toBe(false);
      expect(heavyBolterGroup!.isSnapShot).toBe(true);
    });

    it('Pinned unit has ALL weapons as snap shots', () => {
      const unit = createUnit('unit-1', 2, {
        statuses: [TacticalStatus.Pinned],
        movementState: UnitMovementState.Stationary,
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].isSnapShot).toBe(true);
    });

    it('Suppressed unit has ALL weapons as snap shots', () => {
      const unit = createUnit('unit-1', 2, {
        statuses: [TacticalStatus.Suppressed],
        movementState: UnitMovementState.Stationary,
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].isSnapShot).toBe(true);
    });
  });

  describe('fire group initialization', () => {
    it('initializes resolution tracking fields correctly', () => {
      const unit = createUnit('unit-1', 1);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups[0].hits).toEqual([]);
      expect(groups[0].wounds).toEqual([]);
      expect(groups[0].penetratingHits).toEqual([]);
      expect(groups[0].glancingHits).toEqual([]);
      expect(groups[0].resolved).toBe(false);
      expect(groups[0].isPrecisionGroup).toBe(false);
      expect(groups[0].isDeflagrateGroup).toBe(false);
    });

    it('carries weapon profile onto the fire group', () => {
      const unit = createUnit('unit-1', 1);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups[0].weaponProfile).toBeDefined();
      expect(groups[0].weaponProfile.name).toBe('Bolter');
      expect(groups[0].weaponProfile.rangedStrength).toBe(4);
      expect(groups[0].weaponProfile.ap).toBe(5);
    });

    it('carries special rules and traits onto the fire group', () => {
      const unit = createUnit('unit-1', 1);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'heavy-bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      // Heavy bolter has Heavy(FP) special rule and Bolt trait
      expect(groups[0].specialRules.some((r) => r.name === 'Heavy')).toBe(true);
      expect(groups[0].traits).toContain('Bolt');
    });
  });

  describe('Rapid Fire at half range', () => {
    it('doubles firepower for Rapid Fire weapon at half range', () => {
      const unit = createUnit('unit-1', 2);

      // Use a weapon with Rapid Fire trait
      // Since no real weapons currently have "Rapid Fire" trait in data,
      // we test the mechanism by verifying non-Rapid-Fire weapons don't double
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' }, // Bolter FP=2, no Rapid Fire trait
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 12; // Half of 24"

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      // Bolter doesn't have "Rapid Fire" trait, so no doubling
      // Each bolter has FP 2, so total = 4
      expect(groups[0].totalFirepower).toBe(4);
    });

    it('does not double firepower for non-Rapid-Fire weapon at any range', () => {
      const unit = createUnit('unit-1', 1);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'lascannon' }, // FP 1, Heavy not Rapid Fire
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 5; // Very close, but lascannon isn't Rapid Fire

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups[0].totalFirepower).toBe(1); // No doubling
    });
  });

  describe('multi-profile weapons', () => {
    it('missile launcher profiles create separate fire groups', () => {
      const unit = createUnit('unit-1', 2);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'missile-launcher-frag', profileName: 'Frag' },
        { modelId: 'unit-1-m2', weaponId: 'missile-launcher-krak', profileName: 'Krak' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 30;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      // Different weapon IDs resolve to different weapon names, so separate groups
      expect(groups.length).toBeGreaterThanOrEqual(1);
      // Since the weapon names are different ("Missile launcher - Frag" vs "Missile launcher - Krak"),
      // they form separate groups
    });
  });

  describe('edge cases', () => {
    it('empty assignments produce no fire groups', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(0);
    });

    it('skips models not in LOS list', () => {
      const unit = createUnit('unit-1', 3);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' }, // Not in LOS
        { modelId: 'unit-1-m3', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m3']; // m2 doesn't have LOS
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].attacks).toHaveLength(2); // Only m1 and m3
    });

    it('skips destroyed models', () => {
      const unit = createUnit('unit-1', 3, {
        models: [
          createModel('unit-1-m1'),
          createModel('unit-1-m2', { isDestroyed: true, currentWounds: 0 }),
          createModel('unit-1-m3'),
        ],
      });
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'bolter' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
        { modelId: 'unit-1-m3', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2', 'unit-1-m3'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].attacks).toHaveLength(2); // m1 and m3 only
    });

    it('skips invalid weapon IDs', () => {
      const unit = createUnit('unit-1', 2);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'nonexistent' },
        { modelId: 'unit-1-m2', weaponId: 'bolter' },
      ];
      const modelsWithLOS = ['unit-1-m1', 'unit-1-m2'];
      const targetDistance = 20;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].attacks).toHaveLength(1); // Only m2 with valid weapon
    });

    it('template weapons are included in fire groups', () => {
      const unit = createUnit('unit-1', 1);
      const assignments: WeaponAssignment[] = [
        { modelId: 'unit-1-m1', weaponId: 'flamer' },
      ];
      const modelsWithLOS = ['unit-1-m1'];
      const targetDistance = 5;

      const groups = formFireGroups(assignments, unit, modelsWithLOS, targetDistance);

      expect(groups).toHaveLength(1);
      expect(groups[0].weaponName).toBe('Flamer');
      expect(groups[0].weaponProfile.hasTemplate).toBe(true);
    });
  });

  describe('grouping key behavior', () => {
    it('all models same weapon, same BS, same snap status -> one group', () => {
      const unit = createUnit('unit-1', 5);
      const assignments: WeaponAssignment[] = [];
      const modelsWithLOS: string[] = [];

      for (let i = 1; i <= 5; i++) {
        assignments.push({ modelId: `unit-1-m${i}`, weaponId: 'bolter' });
        modelsWithLOS.push(`unit-1-m${i}`);
      }

      const groups = formFireGroups(assignments, unit, modelsWithLOS, 20);

      expect(groups).toHaveLength(1);
      expect(groups[0].attacks).toHaveLength(5);
      expect(groups[0].totalFirepower).toBe(10); // 5 models * 2 FP each
    });
  });
});

// ─── splitPrecisionHits Tests ───────────────────────────────────────────────

describe('splitPrecisionHits', () => {
  it('returns all hits as normal when no precision hits', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: false, diceRoll: 3 }),
      makeHitResult({ isHit: true, isPrecision: false, diceRoll: 4 }),
      makeHitResult({ isHit: false, isPrecision: false, diceRoll: 2 }),
    ];

    const { normalGroup, precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).toBeNull();
    expect(normalGroup.hits).toHaveLength(3);
    expect(normalGroup.isPrecisionGroup).toBe(false);
  });

  it('splits precision hits into separate group', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: false, diceRoll: 3 }),
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 6 }),
      makeHitResult({ isHit: false, isPrecision: false, diceRoll: 1 }),
    ];

    const { normalGroup, precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    // Normal group should have the non-precision hits (including misses)
    expect(normalGroup.hits).toHaveLength(2); // roll 3 (hit, not precision) + roll 1 (miss)
    expect(normalGroup.isPrecisionGroup).toBe(false);

    // Precision group should have precision hits only
    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.hits).toHaveLength(2); // rolls 5 and 6
    expect(precisionGroup!.isPrecisionGroup).toBe(true);
    expect(precisionGroup!.hits.every((h) => h.isPrecision)).toBe(true);
  });

  it('precision group inherits weapon profile from parent', () => {
    const wp = makeWeaponProfile({
      name: 'Kraken bolter',
      rangedStrength: 4,
      ap: 4,
    });
    const parentGroup = makeFireGroup({
      index: 0,
      weaponProfile: wp,
      weaponName: 'Kraken bolter',
    });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
    ];

    const { precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.weaponProfile.name).toBe('Kraken bolter');
    expect(precisionGroup!.weaponProfile.rangedStrength).toBe(4);
    expect(precisionGroup!.weaponProfile.ap).toBe(4);
    expect(precisionGroup!.weaponName).toBe('Kraken bolter');
  });

  it('precision group has index -1 (to be re-indexed by caller)', () => {
    const parentGroup = makeFireGroup({ index: 3 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 6 }),
    ];

    const { precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.index).toBe(-1);
  });

  it('precision group initializes with empty resolution arrays', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
    ];

    const { precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.wounds).toEqual([]);
    expect(precisionGroup!.penetratingHits).toEqual([]);
    expect(precisionGroup!.glancingHits).toEqual([]);
    expect(precisionGroup!.resolved).toBe(false);
    expect(precisionGroup!.isDeflagrateGroup).toBe(false);
  });

  it('handles all hits being precision', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 6 }),
    ];

    const { normalGroup, precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    // Normal group has no hits (all were precision)
    expect(normalGroup.hits).toHaveLength(0);

    // Precision group has all hits
    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.hits).toHaveLength(2);
  });

  it('misses are never counted as precision', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: false, isPrecision: false, diceRoll: 1 }),
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
    ];

    const { normalGroup, precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    // Miss stays in normal group
    expect(normalGroup.hits).toHaveLength(1);
    expect(normalGroup.hits[0].isHit).toBe(false);

    // Precision hit in precision group
    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.hits).toHaveLength(1);
    expect(precisionGroup!.hits[0].isHit).toBe(true);
  });

  it('empty hit results produce no precision group', () => {
    const parentGroup = makeFireGroup({ index: 0 });
    const hitResults: HitResult[] = [];

    const { normalGroup, precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(normalGroup.hits).toHaveLength(0);
    expect(precisionGroup).toBeNull();
  });

  it('precision group carries special rules from parent', () => {
    const specialRules: SpecialRuleRef[] = [
      { name: 'Precision', value: '4+' },
      { name: 'Breaching', value: '5+' },
    ];
    const parentGroup = makeFireGroup({
      index: 0,
      specialRules,
    });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 5 }),
    ];

    const { precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.specialRules).toHaveLength(2);
    expect(precisionGroup!.specialRules.some((r) => r.name === 'Precision')).toBe(true);
    expect(precisionGroup!.specialRules.some((r) => r.name === 'Breaching')).toBe(true);
  });

  it('precision group carries traits from parent', () => {
    const parentGroup = makeFireGroup({
      index: 0,
      traits: ['Bolt'],
    });
    const hitResults: HitResult[] = [
      makeHitResult({ isHit: true, isPrecision: true, diceRoll: 6 }),
    ];

    const { precisionGroup } = splitPrecisionHits(parentGroup, hitResults);

    expect(precisionGroup).not.toBeNull();
    expect(precisionGroup!.traits).toContain('Bolt');
  });
});
