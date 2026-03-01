/**
 * Vehicle Damage Table Tests
 * Reference: HH_Rules_Battle.md — Vehicle Damage Table
 */

import { describe, it, expect } from 'vitest';
import { TacticalStatus, VehicleFacing } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import type { VehicleDamageRollEvent } from '../types';
import type { GlancingHit } from './shooting-types';
import {
  resolveVehicleDamageTable,
  vehicleDamageTableResult,
  statusToResultString,
} from './vehicle-damage';

// ─── Helper: Create a glancing hit ──────────────────────────────────────────

function makeGlancingHit(overrides: Partial<GlancingHit> = {}): GlancingHit {
  return {
    facing: VehicleFacing.Front,
    vehicleModelId: 'vehicle-1',
    vehicleUnitId: 'unit-1',
    ...overrides,
  };
}

// ─── vehicleDamageTableResult ───────────────────────────────────────────────

describe('vehicleDamageTableResult', () => {
  it('roll 1 → Stunned', () => {
    expect(vehicleDamageTableResult(1)).toBe(TacticalStatus.Stunned);
  });

  it('roll 2 → Stunned', () => {
    expect(vehicleDamageTableResult(2)).toBe(TacticalStatus.Stunned);
  });

  it('roll 3 → Pinned', () => {
    expect(vehicleDamageTableResult(3)).toBe(TacticalStatus.Pinned);
  });

  it('roll 4 → Pinned', () => {
    expect(vehicleDamageTableResult(4)).toBe(TacticalStatus.Pinned);
  });

  it('roll 5 → Suppressed', () => {
    expect(vehicleDamageTableResult(5)).toBe(TacticalStatus.Suppressed);
  });

  it('roll 6 → Suppressed', () => {
    expect(vehicleDamageTableResult(6)).toBe(TacticalStatus.Suppressed);
  });
});

// ─── statusToResultString ───────────────────────────────────────────────────

describe('statusToResultString', () => {
  it('Stunned → "stunned"', () => {
    expect(statusToResultString(TacticalStatus.Stunned)).toBe('stunned');
  });

  it('Pinned → "pinned"', () => {
    expect(statusToResultString(TacticalStatus.Pinned)).toBe('pinned');
  });

  it('Suppressed → "suppressed"', () => {
    expect(statusToResultString(TacticalStatus.Suppressed)).toBe('suppressed');
  });
});

// ─── resolveVehicleDamageTable ──────────────────────────────────────────────

describe('resolveVehicleDamageTable', () => {
  // Test 1: Single glancing hit → roll 1-2 → Stunned status applied
  it('single glancing hit, roll 1 → Stunned status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([1]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      status: TacticalStatus.Stunned,
    });
    expect(result.hullPointsToRemove).toHaveLength(0);
    expect(result.events).toHaveLength(1);
  });

  it('single glancing hit, roll 2 → Stunned status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([2]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  // Test 2: Single glancing hit → roll 3-4 → Pinned status applied
  it('single glancing hit, roll 3 → Pinned status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([3]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      status: TacticalStatus.Pinned,
    });
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  it('single glancing hit, roll 4 → Pinned status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([4]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Pinned);
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  // Test 3: Single glancing hit → roll 5-6 → Suppressed status applied
  it('single glancing hit, roll 5 → Suppressed status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([5]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      status: TacticalStatus.Suppressed,
    });
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  it('single glancing hit, roll 6 → Suppressed status applied', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([6]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Suppressed);
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  // Test 4: Duplicate status — vehicle already Stunned, roll Stunned again → HP lost instead
  it('duplicate status: vehicle already Stunned, rolls Stunned → HP lost instead', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>([
      ['vehicle-1', [TacticalStatus.Stunned]],
    ]);
    const dice = new FixedDiceProvider([1]); // roll 1 → Stunned

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // Status should NOT be applied
    expect(result.statusesToApply).toHaveLength(0);
    // HP should be lost
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      hullPointsLost: 1,
    });
    // Event should show status not applied, HP lost
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as VehicleDamageRollEvent;
    expect(event.statusApplied).toBe(false);
    expect(event.hullPointLost).toBe(true);
  });

  it('duplicate status: vehicle already Pinned, rolls Pinned → HP lost instead', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>([
      ['vehicle-1', [TacticalStatus.Pinned]],
    ]);
    const dice = new FixedDiceProvider([3]); // roll 3 → Pinned

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(0);
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0].hullPointsLost).toBe(1);
  });

  it('duplicate status: vehicle already Suppressed, rolls Suppressed → HP lost instead', () => {
    const hits = [makeGlancingHit()];
    const existingStatuses = new Map<string, TacticalStatus[]>([
      ['vehicle-1', [TacticalStatus.Suppressed]],
    ]);
    const dice = new FixedDiceProvider([5]); // roll 5 → Suppressed

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(0);
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0].hullPointsLost).toBe(1);
  });

  // Test 5: Multiple glancing hits → different statuses applied
  it('multiple glancing hits with different results → all statuses applied', () => {
    const hits = [
      makeGlancingHit(), // roll 1 → Stunned
      makeGlancingHit(), // roll 3 → Pinned
      makeGlancingHit(), // roll 5 → Suppressed
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([1, 3, 5]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(3);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);
    expect(result.statusesToApply[1].status).toBe(TacticalStatus.Pinned);
    expect(result.statusesToApply[2].status).toBe(TacticalStatus.Suppressed);
    expect(result.hullPointsToRemove).toHaveLength(0);
    expect(result.events).toHaveLength(3);
  });

  // Test 6: Multiple glancing hits on same vehicle → second duplicate causes HP loss
  it('multiple hits on same vehicle: first Stunned applies, second Stunned loses HP', () => {
    const hits = [
      makeGlancingHit(), // roll 2 → Stunned (applied)
      makeGlancingHit(), // roll 1 → Stunned (duplicate → HP lost)
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([2, 1]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // Only the first Stunned should be applied
    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);

    // The second Stunned should cause HP loss
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      hullPointsLost: 1,
    });

    // Two events emitted
    expect(result.events).toHaveLength(2);
    const event1 = result.events[0] as VehicleDamageRollEvent;
    const event2 = result.events[1] as VehicleDamageRollEvent;
    expect(event1.statusApplied).toBe(true);
    expect(event1.hullPointLost).toBe(false);
    expect(event2.statusApplied).toBe(false);
    expect(event2.hullPointLost).toBe(true);
  });

  // Test 7: Empty glancing hits array → no results
  it('empty glancing hits array → no results', () => {
    const hits: GlancingHit[] = [];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(0);
    expect(result.hullPointsToRemove).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  // Test 8: Mixed vehicles → statuses tracked per vehicle
  it('mixed vehicles: statuses tracked per vehicle independently', () => {
    const hits = [
      makeGlancingHit({ vehicleModelId: 'vehicle-1', vehicleUnitId: 'unit-1' }), // roll 1 → Stunned on V1
      makeGlancingHit({ vehicleModelId: 'vehicle-2', vehicleUnitId: 'unit-2' }), // roll 2 → Stunned on V2
      makeGlancingHit({ vehicleModelId: 'vehicle-1', vehicleUnitId: 'unit-1' }), // roll 1 → Stunned on V1 (duplicate!)
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([1, 2, 1]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // Vehicle-1: first Stunned applied, second Stunned → HP loss
    // Vehicle-2: Stunned applied (independent tracking)
    expect(result.statusesToApply).toHaveLength(2);
    expect(result.statusesToApply[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      status: TacticalStatus.Stunned,
    });
    expect(result.statusesToApply[1]).toEqual({
      vehicleModelId: 'vehicle-2',
      vehicleUnitId: 'unit-2',
      status: TacticalStatus.Stunned,
    });

    // Only vehicle-1 loses HP
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0]).toEqual({
      vehicleModelId: 'vehicle-1',
      vehicleUnitId: 'unit-1',
      hullPointsLost: 1,
    });
  });

  // Test 9: Events are correctly emitted for each roll
  it('events are correctly emitted for each roll', () => {
    const hits = [
      makeGlancingHit({ vehicleModelId: 'vehicle-A', vehicleUnitId: 'unit-A' }),
      makeGlancingHit({ vehicleModelId: 'vehicle-B', vehicleUnitId: 'unit-B' }),
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([2, 5]); // Stunned, Suppressed

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.events).toHaveLength(2);

    const event1 = result.events[0] as VehicleDamageRollEvent;
    expect(event1).toEqual({
      type: 'vehicleDamageRoll',
      modelId: 'vehicle-A',
      unitId: 'unit-A',
      roll: 2,
      result: 'stunned',
      statusApplied: true,
      hullPointLost: false,
    });

    const event2 = result.events[1] as VehicleDamageRollEvent;
    expect(event2).toEqual({
      type: 'vehicleDamageRoll',
      modelId: 'vehicle-B',
      unitId: 'unit-B',
      roll: 5,
      result: 'suppressed',
      statusApplied: true,
      hullPointLost: false,
    });
  });

  // Test 10: Accumulated statuses within batch
  it('accumulated statuses within batch: first hit applies, second duplicate loses HP', () => {
    // Two hits on the same vehicle, both roll Stunned
    // First: applies Stunned
    // Second: detects Stunned was applied in the same batch → HP lost
    const hits = [
      makeGlancingHit({ vehicleModelId: 'tank-1', vehicleUnitId: 'squad-1' }),
      makeGlancingHit({ vehicleModelId: 'tank-1', vehicleUnitId: 'squad-1' }),
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>(); // No pre-existing statuses
    const dice = new FixedDiceProvider([1, 2]); // Both roll Stunned (1 and 2)

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // First Stunned is applied
    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0]).toEqual({
      vehicleModelId: 'tank-1',
      vehicleUnitId: 'squad-1',
      status: TacticalStatus.Stunned,
    });

    // Second Stunned causes HP loss
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0]).toEqual({
      vehicleModelId: 'tank-1',
      vehicleUnitId: 'squad-1',
      hullPointsLost: 1,
    });

    // Events: first = status applied, second = HP lost
    expect(result.events).toHaveLength(2);
    const event1 = result.events[0] as VehicleDamageRollEvent;
    expect(event1.roll).toBe(1);
    expect(event1.result).toBe('stunned');
    expect(event1.statusApplied).toBe(true);
    expect(event1.hullPointLost).toBe(false);

    const event2 = result.events[1] as VehicleDamageRollEvent;
    expect(event2.roll).toBe(2);
    expect(event2.result).toBe('stunned');
    expect(event2.statusApplied).toBe(false);
    expect(event2.hullPointLost).toBe(true);
  });

  // Additional edge case: Multiple duplicate statuses accumulate HP loss
  it('three Stunned hits on same vehicle: first applies, second and third lose 1 HP each', () => {
    const hits = [
      makeGlancingHit(), // roll 1 → Stunned (applied)
      makeGlancingHit(), // roll 2 → Stunned (duplicate → HP lost)
      makeGlancingHit(), // roll 1 → Stunned (duplicate → HP lost)
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([1, 2, 1]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);

    // Hull points accumulate: 2 duplicate hits = 2 HP lost
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0].hullPointsLost).toBe(2);

    expect(result.events).toHaveLength(3);
  });

  // Edge case: Vehicle has existing status AND gets same status from different result
  it('vehicle has existing Pinned, gets Stunned (new) then Pinned (duplicate) → mixed results', () => {
    const hits = [
      makeGlancingHit(), // roll 1 → Stunned (new, vehicle only has Pinned)
      makeGlancingHit(), // roll 3 → Pinned (duplicate — vehicle already has Pinned)
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>([
      ['vehicle-1', [TacticalStatus.Pinned]],
    ]);
    const dice = new FixedDiceProvider([1, 3]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // Stunned should be applied (vehicle didn't have it)
    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);

    // Pinned was already on the vehicle → HP lost
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0].hullPointsLost).toBe(1);

    // First event: Stunned applied
    const event1 = result.events[0] as VehicleDamageRollEvent;
    expect(event1.result).toBe('stunned');
    expect(event1.statusApplied).toBe(true);
    expect(event1.hullPointLost).toBe(false);

    // Second event: Pinned duplicate, HP lost
    const event2 = result.events[1] as VehicleDamageRollEvent;
    expect(event2.result).toBe('pinned');
    expect(event2.statusApplied).toBe(false);
    expect(event2.hullPointLost).toBe(true);
  });

  // Edge case: Vehicle with no existing statuses in the map (absent key)
  it('vehicle not in existingStatuses map → treats as having no statuses', () => {
    const hits = [makeGlancingHit({ vehicleModelId: 'new-vehicle', vehicleUnitId: 'new-unit' })];
    // Map exists but doesn't contain this vehicle
    const existingStatuses = new Map<string, TacticalStatus[]>([
      ['other-vehicle', [TacticalStatus.Stunned]],
    ]);
    const dice = new FixedDiceProvider([1]); // roll 1 → Stunned

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // Should apply Stunned — no pre-existing for this vehicle
    expect(result.statusesToApply).toHaveLength(1);
    expect(result.statusesToApply[0].status).toBe(TacticalStatus.Stunned);
    expect(result.hullPointsToRemove).toHaveLength(0);
  });

  // Edge case: Different facings on same vehicle still track by vehicleModelId
  it('glancing hits on different facings of same vehicle share status tracking', () => {
    const hits = [
      makeGlancingHit({ facing: VehicleFacing.Front }), // roll 1 → Stunned
      makeGlancingHit({ facing: VehicleFacing.Side }),   // roll 2 → Stunned (duplicate!)
    ];
    const existingStatuses = new Map<string, TacticalStatus[]>();
    const dice = new FixedDiceProvider([1, 2]);

    const result = resolveVehicleDamageTable(hits, existingStatuses, dice);

    // First Stunned applies, second is duplicate
    expect(result.statusesToApply).toHaveLength(1);
    expect(result.hullPointsToRemove).toHaveLength(1);
    expect(result.hullPointsToRemove[0].hullPointsLost).toBe(1);
  });
});
