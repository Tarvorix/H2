/**
 * Shooting Validator Tests
 * Tests for shooting attack validation (Steps 1-2 of the 11-step pipeline).
 * Reference: HH_Rules_Battle.md — Shooting Phase Steps 1-2
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  VehicleFacing,
  TerrainType,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState, TerrainPiece } from '@hh/types';
import { createRectHull } from '@hh/geometry';
import type { RectHull } from '@hh/geometry';
import {
  validateShootingTarget,
  validateAttackerEligibility,
  filterModelsWithLOS,
  checkWeaponRange,
  determineTargetFacing,
} from './shooting-validator';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(
  id: string,
  x = 0,
  y = 0,
  destroyed = false,
  unitProfileId = 'tactical',
  profileModelName = 'Legionary',
): ModelState {
  return {
    id,
    profileModelName,
    unitProfileId,
    position: { x, y },
    currentWounds: destroyed ? 0 : 1,
    isDestroyed: destroyed,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };
}

function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createModel(`${id}-m0`), createModel(`${id}-m1`)],
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

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.Ultramarines,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  // Default: player 0 has units at x=10, player 1 has units at x=36
  const army0Units = [
    createUnit('attacker', {
      models: [
        createModel('atk-m0', 10, 24),
        createModel('atk-m1', 12, 24),
        createModel('atk-m2', 14, 24),
      ],
    }),
  ];

  const army1Units = [
    createUnit('target', {
      models: [
        createModel('tgt-m0', 36, 24),
        createModel('tgt-m1', 38, 24),
      ],
    }),
  ];

  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy(0, army0Units),
      createArmy(1, army1Units),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Shooting,
    currentSubPhase: SubPhase.Attack,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  };
}

// ─── validateShootingTarget Tests ─────────────────────────────────────────────

describe('validateShootingTarget', () => {
  it('should accept a valid enemy target on the battlefield', () => {
    const state = createGameState();
    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject targeting a friendly unit (same army)', () => {
    // Add a second unit to army 0
    const state = createGameState();
    const friendlyUnit = createUnit('friendly', {
      models: [createModel('fr-m0', 20, 24)],
    });
    state.armies[0].units.push(friendlyUnit);

    const result = validateShootingTarget(state, 'attacker', 'friendly');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_IS_FRIENDLY')).toBe(true);
  });

  it('should reject targeting a unit embarked on a transport', () => {
    const state = createGameState();
    // Find the target unit and set it as embarked
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    targetUnit.embarkedOnId = 'transport-1';

    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_EMBARKED')).toBe(true);
  });

  it('should reject targeting a unit in reserves', () => {
    const state = createGameState();
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    targetUnit.isInReserves = true;

    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_IN_RESERVES')).toBe(true);
  });

  it('should reject targeting a unit not deployed', () => {
    const state = createGameState();
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    targetUnit.isDeployed = false;

    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_NOT_DEPLOYED')).toBe(true);
  });

  it('should reject targeting a destroyed unit (all models destroyed)', () => {
    const state = createGameState();
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    // Destroy all models in the target unit
    for (const model of targetUnit.models) {
      model.isDestroyed = true;
      model.currentWounds = 0;
    }

    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_DESTROYED')).toBe(true);
  });

  it('should reject if attacker unit does not exist', () => {
    const state = createGameState();
    const result = validateShootingTarget(state, 'nonexistent', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_NOT_FOUND')).toBe(true);
  });

  it('should reject if target unit does not exist', () => {
    const state = createGameState();
    const result = validateShootingTarget(state, 'attacker', 'nonexistent');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'TARGET_NOT_FOUND')).toBe(true);
  });

  it('should collect multiple errors for a target that is both embarked and in reserves', () => {
    const state = createGameState();
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    targetUnit.embarkedOnId = 'transport-1';
    targetUnit.isInReserves = true;

    const result = validateShootingTarget(state, 'attacker', 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some(e => e.code === 'TARGET_EMBARKED')).toBe(true);
    expect(result.errors.some(e => e.code === 'TARGET_IN_RESERVES')).toBe(true);
  });
});

// ─── validateAttackerEligibility Tests ────────────────────────────────────────

describe('validateAttackerEligibility', () => {
  it('should accept a valid attacker belonging to the active player', () => {
    const state = createGameState({ activePlayerIndex: 0 });
    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject a unit that does not belong to the active player', () => {
    // Active player is 0, but target unit belongs to player 1
    const state = createGameState({ activePlayerIndex: 0 });
    const result = validateAttackerEligibility(state, 'target');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_NOT_ACTIVE_PLAYER')).toBe(true);
  });

  it('should reject a unit that Rushed this turn', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.movementState = UnitMovementState.Rushed;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_RUSHED')).toBe(true);
  });

  it('should reject a unit locked in combat', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.isLockedInCombat = true;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_IN_COMBAT')).toBe(true);
  });

  it('should reject a unit that is embarked on a transport', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.embarkedOnId = 'rhino-1';

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_EMBARKED')).toBe(true);
  });

  it('should reject a unit that is not deployed', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.isDeployed = false;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_NOT_DEPLOYED')).toBe(true);
  });

  it('should reject a unit with no alive models', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    for (const model of attackerUnit.models) {
      model.isDestroyed = true;
      model.currentWounds = 0;
    }

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_NO_ALIVE_MODELS')).toBe(true);
  });

  it('should reject a nonexistent unit', () => {
    const state = createGameState();
    const result = validateAttackerEligibility(state, 'ghost-unit');

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ATTACKER_NOT_FOUND')).toBe(true);
  });

  it('should accept a unit that has Moved (not Rushed)', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.movementState = UnitMovementState.Moved;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept a unit that entered from reserves', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.movementState = UnitMovementState.EnteredFromReserves;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should collect multiple errors when unit is both rushed and in combat', () => {
    const state = createGameState();
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.movementState = UnitMovementState.Rushed;
    attackerUnit.isLockedInCombat = true;

    const result = validateAttackerEligibility(state, 'attacker');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some(e => e.code === 'ATTACKER_RUSHED')).toBe(true);
    expect(result.errors.some(e => e.code === 'ATTACKER_IN_COMBAT')).toBe(true);
  });
});

// ─── filterModelsWithLOS Tests ──────────────────────────────────────────────

describe('filterModelsWithLOS', () => {
  it('should return all attacker models when there is clear LOS', () => {
    // Attackers at x=10, targets at x=20, no terrain
    const attackerModels: ModelState[] = [
      createModel('atk-0', 10, 24),
      createModel('atk-1', 12, 24),
    ];
    const targetModels: ModelState[] = [
      createModel('tgt-0', 20, 24),
    ];
    const terrain: TerrainPiece[] = [];
    const vehicleHulls: RectHull[] = [];

    const result = filterModelsWithLOS(attackerModels, targetModels, terrain, vehicleHulls);

    expect(result).toHaveLength(2);
    expect(result).toContain('atk-0');
    expect(result).toContain('atk-1');
  });

  it('should filter out models behind heavy terrain that blocks LOS', () => {
    // Attacker 0 has clear LOS, attacker 1 is behind heavy terrain
    const attackerModels: ModelState[] = [
      createModel('atk-clear', 10, 24),
      createModel('atk-blocked', 10, 10),
    ];
    const targetModels: ModelState[] = [
      createModel('tgt-0', 30, 24),
    ];

    // Place heavy terrain wall between atk-blocked and target
    // Heavy area terrain at x=15-25, y=5-15 — blocks atk-blocked at (10,10) to tgt at (30,24)
    const heavyTerrain: TerrainPiece = {
      id: 'heavy-1',
      name: 'Dense Forest',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 15, y: 5 }, width: 10, height: 10 },
      isDifficult: true,
      isDangerous: false,
    };

    const terrain: TerrainPiece[] = [heavyTerrain];
    const vehicleHulls: RectHull[] = [];

    const result = filterModelsWithLOS(attackerModels, targetModels, terrain, vehicleHulls);

    // atk-clear (10,24) to tgt (30,24) goes straight across at y=24, above the terrain (y=5-15)
    // atk-blocked (10,10) to tgt (30,24) passes through heavy terrain at x=15-25, y=5-15
    expect(result).toContain('atk-clear');
    expect(result).not.toContain('atk-blocked');
  });

  it('should return empty array if no attacker models have LOS', () => {
    const attackerModels: ModelState[] = [
      createModel('atk-0', 10, 10),
    ];
    const targetModels: ModelState[] = [
      createModel('tgt-0', 30, 10),
    ];

    // Massive heavy terrain wall directly between them
    const heavyTerrain: TerrainPiece = {
      id: 'heavy-wall',
      name: 'Fortress Wall',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 18, y: 0 }, width: 4, height: 20 },
      isDifficult: false,
      isDangerous: false,
    };

    const result = filterModelsWithLOS(attackerModels, targetModels, [heavyTerrain], []);

    expect(result).toHaveLength(0);
  });

  it('should handle vehicle hulls blocking LOS', () => {
    const attackerModels: ModelState[] = [
      createModel('atk-0', 10, 24),
    ];
    const targetModels: ModelState[] = [
      createModel('tgt-0', 40, 24),
    ];

    // A vehicle hull directly between them at x=25, y=24
    const blockingVehicle: RectHull = createRectHull(
      { x: 25, y: 24 },
      4.5, // width along facing
      2.5, // height perpendicular
      0,   // rotation: facing right
    );

    const result = filterModelsWithLOS(attackerModels, targetModels, [], [blockingVehicle]);

    // The vehicle hull should block the LOS ray between the two models
    expect(result).toHaveLength(0);
  });

  it('should allow LOS when models are in base contact (always have LOS)', () => {
    // Two models extremely close together (within base contact distance)
    // 32mm base radius ≈ 0.63", so models within ~1.26" center-to-center are in base contact
    const attackerModels: ModelState[] = [
      createModel('atk-0', 10, 24),
    ];
    const targetModels: ModelState[] = [
      createModel('tgt-0', 11.2, 24), // Within base contact distance (~1.2" center-to-center)
    ];

    // Even with massive terrain, base contact = always LOS
    const heavyTerrain: TerrainPiece = {
      id: 'heavy-1',
      name: 'Wall',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 9, y: 22 }, width: 4, height: 4 },
      isDifficult: false,
      isDangerous: false,
    };

    const result = filterModelsWithLOS(attackerModels, targetModels, [heavyTerrain], []);

    expect(result).toContain('atk-0');
  });

  it('should check LOS to multiple target models (LOS to any one is sufficient)', () => {
    const attackerModels: ModelState[] = [
      createModel('atk-0', 10, 10),
    ];

    // Target model 0 is behind terrain, target model 1 is visible
    const targetModels: ModelState[] = [
      createModel('tgt-blocked', 30, 10),
      createModel('tgt-visible', 30, 30),
    ];

    // Heavy terrain blocks view to tgt-blocked but not tgt-visible
    const heavyTerrain: TerrainPiece = {
      id: 'heavy-1',
      name: 'Wall',
      type: TerrainType.HeavyArea,
      shape: { kind: 'rectangle', topLeft: { x: 18, y: 5 }, width: 4, height: 10 },
      isDifficult: false,
      isDangerous: false,
    };

    const result = filterModelsWithLOS(attackerModels, targetModels, [heavyTerrain], []);

    // Attacker should have LOS because it can see tgt-visible even though tgt-blocked is hidden
    expect(result).toContain('atk-0');
  });

  it('should handle empty attacker models', () => {
    const result = filterModelsWithLOS(
      [],
      [createModel('tgt-0', 30, 24)],
      [],
      [],
    );
    expect(result).toHaveLength(0);
  });

  it('should handle empty target models', () => {
    const result = filterModelsWithLOS(
      [createModel('atk-0', 10, 24)],
      [],
      [],
      [],
    );
    expect(result).toHaveLength(0);
  });
});

// ─── checkWeaponRange Tests ─────────────────────────────────────────────────

describe('checkWeaponRange', () => {
  it('should return true when target is within weapon range', () => {
    // Attacker at x=10, target at x=22 → ~12" center-to-center
    // With 32mm bases, edge-to-edge ≈ 12 - 2*0.6299 ≈ 10.74"
    // 24" range weapon → in range
    const attackerModel = createModel('atk-0', 10, 24);
    const targetModels = [createModel('tgt-0', 22, 24)];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(true);
  });

  it('should return true at exactly weapon range boundary', () => {
    // Target at exactly 12" center-to-center, using 24" range weapon
    const attackerModel = createModel('atk-0', 0, 0);
    const targetModels = [createModel('tgt-0', 12, 0)];

    // Edge-to-edge ≈ 12 - 2*0.6299 ≈ 10.74", weapon range 24" → in range
    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(true);
  });

  it('should return false when target is out of weapon range', () => {
    // Attacker at x=0, target at x=36 → ~36" center-to-center
    // With 32mm bases, edge-to-edge ≈ 36 - 2*0.6299 ≈ 34.74"
    // 24" range weapon → out of range
    const attackerModel = createModel('atk-0', 0, 0);
    const targetModels = [createModel('tgt-0', 36, 0)];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(false);
  });

  it('should return true if any target model is in range even if others are not', () => {
    const attackerModel = createModel('atk-0', 0, 0);
    const targetModels = [
      createModel('tgt-far', 50, 0),   // 50" center-to-center, way out of range
      createModel('tgt-close', 10, 0),  // 10" center-to-center, edge ≈ 8.74", in range
    ];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(true);
  });

  it('should return false when all target models are out of range', () => {
    const attackerModel = createModel('atk-0', 0, 0);
    const targetModels = [
      createModel('tgt-0', 50, 0),
      createModel('tgt-1', 55, 0),
    ];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(false);
  });

  it('should return false for empty target models', () => {
    const attackerModel = createModel('atk-0', 0, 0);
    const result = checkWeaponRange(attackerModel, [], 24);

    expect(result).toBe(false);
  });

  it('target at 12" with 24" range weapon should be in range', () => {
    // Explicit test case from requirements: target at 12" with 24" range → in range
    // Place attacker at origin, target 12" away (center-to-center)
    // Edge-to-edge ≈ 12 - 2*(32/25.4/2) ≈ 12 - 1.26 ≈ 10.74" → well within 24"
    const attackerModel = createModel('atk-0', 0, 24);
    const targetModels = [createModel('tgt-0', 12, 24)];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(true);
  });

  it('target at 30" with 24" range weapon should be out of range', () => {
    // Explicit test case from requirements: target at 30" with 24" range → out of range
    // Edge-to-edge ≈ 30 - 1.26 ≈ 28.74" → exceeds 24"
    const attackerModel = createModel('atk-0', 0, 24);
    const targetModels = [createModel('tgt-0', 30, 24)];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(false);
  });

  it('should use the attacker model base size instead of a fixed 32mm default', () => {
    const attackerModel = createModel(
      'atk-contemptor',
      0,
      0,
      false,
      'contemptor-dreadnought',
      'Contemptor Dreadnought',
    );
    const targetModels = [createModel('tgt-0', 25.5, 0)];

    const result = checkWeaponRange(attackerModel, targetModels, 24);

    expect(result).toBe(true);
  });
});

// ─── determineTargetFacing Tests ─────────────────────────────────────────────

describe('determineTargetFacing', () => {
  // Vehicle facing right (+x), hull at center (24, 24), width 4.5" (along facing), height 2.5"
  const vehicleHull: RectHull = createRectHull(
    { x: 24, y: 24 },
    4.5, // width along facing direction
    2.5, // height perpendicular to facing
    0,   // rotation: facing right (+x)
  );

  it('should return Front when majority of attackers are in front arc', () => {
    // All 3 attacker models directly in front (positive x direction)
    const attackerModels = [
      createModel('atk-0', 35, 23),
      createModel('atk-1', 35, 24),
      createModel('atk-2', 35, 25),
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Front);
  });

  it('should return Rear when majority of attackers are in rear arc', () => {
    // All 3 attacker models directly behind (negative x direction)
    const attackerModels = [
      createModel('atk-0', 10, 23),
      createModel('atk-1', 10, 24),
      createModel('atk-2', 10, 25),
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Rear);
  });

  it('should return Side when majority of attackers are in side arc', () => {
    // All 3 attacker models directly to the side (positive y direction)
    const attackerModels = [
      createModel('atk-0', 23, 35),
      createModel('atk-1', 24, 35),
      createModel('atk-2', 25, 35),
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Side);
  });

  it('should return Side when facings are tied (defender chooses → default Side)', () => {
    // 1 model in front, 1 model to the side → tie → defender chooses → Side
    const attackerModels = [
      createModel('atk-front', 35, 24),  // Front arc
      createModel('atk-side', 24, 35),   // Side arc
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Side);
  });

  it('should handle a single attacker model', () => {
    // Single model in front
    const attackerModels = [
      createModel('atk-0', 35, 24),
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Front);
  });

  it('should return Front when no attacker models exist', () => {
    const result = determineTargetFacing([], vehicleHull);

    // Default to Front when no attacker models
    expect(result).toBe(VehicleFacing.Front);
  });

  it('should handle a vehicle facing a different direction', () => {
    // Vehicle facing up (+y), so "front" is in the +y direction
    const upFacingVehicle: RectHull = createRectHull(
      { x: 24, y: 24 },
      4.5,
      2.5,
      Math.PI / 2, // facing up (+y)
    );

    // Attackers above the vehicle (in the front arc of an upward-facing vehicle)
    const attackerModels = [
      createModel('atk-0', 23, 40),
      createModel('atk-1', 24, 40),
      createModel('atk-2', 25, 40),
    ];

    const result = determineTargetFacing(attackerModels, upFacingVehicle);

    expect(result).toBe(VehicleFacing.Front);
  });

  it('should correctly determine majority when split between facings', () => {
    // 2 models in front, 1 model in rear → majority is Front
    const attackerModels = [
      createModel('atk-front-1', 35, 23),  // Front
      createModel('atk-front-2', 35, 25),  // Front
      createModel('atk-rear', 10, 24),     // Rear
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Front);
  });

  it('should handle three-way tie with Side as default', () => {
    // 1 model in each arc → three-way tie → defender chooses → Side
    const attackerModels = [
      createModel('atk-front', 35, 24),    // Front
      createModel('atk-side', 24, 35),     // Side
      createModel('atk-rear', 10, 24),     // Rear
    ];

    const result = determineTargetFacing(attackerModels, vehicleHull);

    expect(result).toBe(VehicleFacing.Side);
  });
});

// ─── Integration-style Tests ────────────────────────────────────────────────

describe('shooting validation integration', () => {
  it('should validate both attacker and target for a complete shooting declaration', () => {
    const state = createGameState();

    const attackerResult = validateAttackerEligibility(state, 'attacker');
    const targetResult = validateShootingTarget(state, 'attacker', 'target');

    expect(attackerResult.valid).toBe(true);
    expect(targetResult.valid).toBe(true);
  });

  it('should reject shooting when attacker has Rushed and target is friendly', () => {
    const state = createGameState();
    // Make attacker rushed
    const attackerUnit = state.armies[0].units.find(u => u.id === 'attacker')!;
    attackerUnit.movementState = UnitMovementState.Rushed;

    // Add a second unit to army 0 to target as "friendly"
    const friendlyUnit = createUnit('friendly', {
      models: [createModel('fr-m0', 20, 24)],
    });
    state.armies[0].units.push(friendlyUnit);

    const attackerResult = validateAttackerEligibility(state, 'attacker');
    const targetResult = validateShootingTarget(state, 'attacker', 'friendly');

    expect(attackerResult.valid).toBe(false);
    expect(attackerResult.errors.some(e => e.code === 'ATTACKER_RUSHED')).toBe(true);

    expect(targetResult.valid).toBe(false);
    expect(targetResult.errors.some(e => e.code === 'TARGET_IS_FRIENDLY')).toBe(true);
  });

  it('should validate LOS and range as a combined check', () => {
    // Create a scenario where attackers have LOS and are in bolter range
    const attackerModels = [
      createModel('atk-0', 10, 24),
      createModel('atk-1', 12, 24),
    ];
    const targetModels = [
      createModel('tgt-0', 30, 24),
    ];

    // No terrain → clear LOS
    const losModels = filterModelsWithLOS(attackerModels, targetModels, [], []);
    expect(losModels).toHaveLength(2);

    // Check range with bolter (24")
    // Distance from (10,24) to (30,24) = 20" center-to-center
    // Edge-to-edge ≈ 20 - 1.26 ≈ 18.74" → within 24" range
    const inRange = checkWeaponRange(createModel('atk-range', 10, 24), targetModels, 24);
    expect(inRange).toBe(true);
  });
});
