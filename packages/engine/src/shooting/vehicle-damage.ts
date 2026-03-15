/**
 * Vehicle Damage Table — Shooting Pipeline Step 11 (partial)
 * Reference: HH_Rules_Battle.md — Vehicle Damage Table
 *
 * When a vehicle suffers a glancing hit (d6 + S = AV), it doesn't lose hull points.
 * Instead, roll on the Vehicle Damage Table:
 *   1-2: Stunned — apply Stunned status
 *   3-4: Pinned  — apply Pinned status (the vehicle is Shaken)
 *   5-6: Suppressed — apply Suppressed status
 *
 * Duplicate Status Rule:
 *   If the vehicle already has the status being applied, it loses 1 Hull Point
 *   instead (no save allowed).
 *
 * Accumulated statuses within a resolution batch are tracked:
 *   If a vehicle gets Stunned from hit 1, and Stunned again from hit 2,
 *   hit 2 loses an HP instead.
 */

import { TacticalStatus } from '@hh/types';
import type { DiceProvider, GameEvent, VehicleDamageRollEvent } from '../types';
import type { GlancingHit } from './shooting-types';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of resolving the Vehicle Damage Table for all glancing hits.
 */
export interface VehicleDamageResult {
  /** Status effects to apply to vehicles */
  statusesToApply: Array<{
    vehicleModelId: string;
    vehicleUnitId: string;
    status: TacticalStatus;
  }>;
  /** Hull points to remove from vehicles (due to duplicate statuses) */
  hullPointsToRemove: Array<{
    vehicleModelId: string;
    vehicleUnitId: string;
    hullPointsLost: number;
  }>;
  /** Events emitted during resolution */
  events: GameEvent[];
}

export function accumulateHullPointLossesFromGlancingHits(
  glancingHits: GlancingHit[],
): VehicleDamageResult['hullPointsToRemove'] {
  const hullPointsToRemove: VehicleDamageResult['hullPointsToRemove'] = [];

  for (const hit of glancingHits) {
    const existingEntry = hullPointsToRemove.find(
      (entry) =>
        entry.vehicleModelId === hit.vehicleModelId &&
        entry.vehicleUnitId === hit.vehicleUnitId,
    );

    if (existingEntry) {
      existingEntry.hullPointsLost += 1;
      continue;
    }

    hullPointsToRemove.push({
      vehicleModelId: hit.vehicleModelId,
      vehicleUnitId: hit.vehicleUnitId,
      hullPointsLost: 1,
    });
  }

  return hullPointsToRemove;
}

// ─── Vehicle Damage Table Lookup ────────────────────────────────────────────

/**
 * Map a d6 roll to the Vehicle Damage Table result.
 *   1-2 = Stunned
 *   3-4 = Pinned
 *   5-6 = Suppressed
 *
 * @param roll - A d6 result (1-6)
 * @returns The TacticalStatus corresponding to the roll
 */
export function vehicleDamageTableResult(roll: number): TacticalStatus {
  if (roll <= 2) {
    return TacticalStatus.Stunned;
  }
  if (roll <= 4) {
    return TacticalStatus.Pinned;
  }
  return TacticalStatus.Suppressed;
}

// ─── Status to Event Result String ──────────────────────────────────────────

/**
 * Map a TacticalStatus to the VehicleDamageRollEvent result string.
 *
 * @param status - The TacticalStatus to convert
 * @returns The lowercase result string for event emission
 */
export function statusToResultString(status: TacticalStatus): 'stunned' | 'pinned' | 'suppressed' {
  switch (status) {
    case TacticalStatus.Stunned:
      return 'stunned';
    case TacticalStatus.Pinned:
      return 'pinned';
    case TacticalStatus.Suppressed:
      return 'suppressed';
    default:
      // Should never happen for vehicle damage table results, but handle defensively
      return 'stunned';
  }
}

// ─── Vehicle Damage Table Resolution ────────────────────────────────────────

/**
 * Roll on the Vehicle Damage Table for each glancing hit.
 *
 * For each glancing hit:
 * 1. Roll d6
 * 2. Determine result: 1-2 = Stunned, 3-4 = Pinned, 5-6 = Suppressed
 * 3. Check if vehicle already has that status (from existing statuses OR
 *    from earlier hits in this same batch)
 * 4. If already has status -> lose 1 HP instead
 * 5. If not -> apply the status
 *
 * Track accumulated statuses within this resolution batch:
 *   If a vehicle gets Stunned from hit 1, and Stunned again from hit 2,
 *   hit 2 loses an HP instead.
 *
 * @param glancingHits - Array of glancing hits to resolve
 * @param existingStatuses - Map of vehicleModelId to current TacticalStatus[]
 * @param dice - Dice provider
 * @returns Statuses to apply and hull points to remove
 */
export function resolveVehicleDamageTable(
  glancingHits: GlancingHit[],
  existingStatuses: Map<string, TacticalStatus[]>,
  dice: DiceProvider,
): VehicleDamageResult {
  const statusesToApply: VehicleDamageResult['statusesToApply'] = [];
  const hullPointsToRemove: VehicleDamageResult['hullPointsToRemove'] = [];
  const events: GameEvent[] = [];

  // Track statuses accumulated within this batch, per vehicle model ID.
  // This allows us to detect duplicate statuses from multiple glancing hits
  // in the same resolution pass.
  const batchStatuses = new Map<string, TacticalStatus[]>();

  for (const hit of glancingHits) {
    const { vehicleModelId, vehicleUnitId } = hit;

    // Step 1: Roll d6
    const roll = dice.rollD6();

    // Step 2: Determine result from Vehicle Damage Table
    const status = vehicleDamageTableResult(roll);
    const resultString = statusToResultString(status);

    // Step 3: Check if vehicle already has this status
    // Check both pre-existing statuses and statuses accumulated in this batch
    const currentExisting = existingStatuses.get(vehicleModelId) ?? [];
    const currentBatch = batchStatuses.get(vehicleModelId) ?? [];

    const alreadyHasStatus =
      currentExisting.includes(status) || currentBatch.includes(status);

    if (alreadyHasStatus) {
      // Step 4: Duplicate status — lose 1 HP instead (no save allowed)
      // Check if we already have an entry for this vehicle in hullPointsToRemove
      const existingHPEntry = hullPointsToRemove.find(
        (entry) => entry.vehicleModelId === vehicleModelId && entry.vehicleUnitId === vehicleUnitId,
      );
      if (existingHPEntry) {
        existingHPEntry.hullPointsLost += 1;
      } else {
        hullPointsToRemove.push({
          vehicleModelId,
          vehicleUnitId,
          hullPointsLost: 1,
        });
      }

      // Emit event: status NOT applied, HP lost instead
      const event: VehicleDamageRollEvent = {
        type: 'vehicleDamageRoll',
        modelId: vehicleModelId,
        unitId: vehicleUnitId,
        roll,
        result: resultString,
        statusApplied: false,
        hullPointLost: true,
      };
      events.push(event);
    } else {
      // Step 5: Apply the status
      statusesToApply.push({
        vehicleModelId,
        vehicleUnitId,
        status,
      });

      // Track in batch statuses for subsequent hits in this resolution pass
      if (!batchStatuses.has(vehicleModelId)) {
        batchStatuses.set(vehicleModelId, [status]);
      } else {
        batchStatuses.get(vehicleModelId)!.push(status);
      }

      // Emit event: status applied
      const event: VehicleDamageRollEvent = {
        type: 'vehicleDamageRoll',
        modelId: vehicleModelId,
        unitId: vehicleUnitId,
        roll,
        result: resultString,
        statusApplied: true,
        hullPointLost: false,
      };
      events.push(event);
    }
  }

  return { statusesToApply, hullPointsToRemove, events };
}
