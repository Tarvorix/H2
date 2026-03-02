/**
 * Game Queries — Read-only queries against the GameState
 * No mutations; pure functions that extract information.
 */

import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  Position,
} from '@hh/types';
import {
  TacticalStatus,
  UnitMovementState,
  Phase,
  SubPhase,
  LegionFaction,
} from '@hh/types';
import type { ModelShape } from '@hh/geometry';
import { createCircleBase } from '@hh/geometry';
import {
  unitProfileHasSpecialRule,
  isVehicleUnitState,
  getModelStateBaseSizeMM,
  getModelToughness,
  getModelWS,
} from './profile-lookup';

// ─── Army Queries ────────────────────────────────────────────────────────────

/**
 * Get the active player's army.
 */
export function getActiveArmy(state: GameState): ArmyState {
  return state.armies[state.activePlayerIndex];
}

/**
 * Get the reactive (non-active) player's army.
 */
export function getReactiveArmy(state: GameState): ArmyState {
  return state.armies[state.activePlayerIndex === 0 ? 1 : 0];
}

/**
 * Get the reactive player index.
 */
export function getReactivePlayerIndex(state: GameState): number {
  return state.activePlayerIndex === 0 ? 1 : 0;
}

// ─── Unit Queries ────────────────────────────────────────────────────────────

/**
 * Find a unit by ID in any army.
 */
export function findUnit(state: GameState, unitId: string): UnitState | undefined {
  for (const army of state.armies) {
    const unit = army.units.find(u => u.id === unitId);
    if (unit) return unit;
  }
  return undefined;
}

/**
 * Find which army a unit belongs to.
 */
export function findUnitArmy(state: GameState, unitId: string): ArmyState | undefined {
  for (const army of state.armies) {
    if (army.units.some(u => u.id === unitId)) return army;
  }
  return undefined;
}

/**
 * Get the legion faction for a unit (from its owning army's faction).
 * Returns undefined if the unit is not found.
 */
export function getUnitLegion(state: GameState, unitId: string): LegionFaction | undefined {
  const unit = findUnit(state, unitId);
  if (!unit) return undefined;
  if (unit.originLegion) return unit.originLegion;

  const army = findUnitArmy(state, unitId);
  if (!army) return undefined;
  if (Object.values(LegionFaction).includes(army.faction as LegionFaction)) {
    return army.faction as LegionFaction;
  }
  return undefined;
}

/**
 * Find which player index a unit belongs to.
 */
export function findUnitPlayerIndex(state: GameState, unitId: string): number | undefined {
  for (let i = 0; i < 2; i++) {
    if (state.armies[i].units.some(u => u.id === unitId)) return i;
  }
  return undefined;
}

/**
 * Find a model by ID in any army.
 */
export function findModel(
  state: GameState,
  modelId: string,
): { model: ModelState; unit: UnitState; army: ArmyState } | undefined {
  for (const army of state.armies) {
    for (const unit of army.units) {
      const model = unit.models.find(m => m.id === modelId);
      if (model) return { model, unit, army };
    }
  }
  return undefined;
}

/**
 * Find a model's parent unit ID by model ID.
 */
export function findModelUnitId(state: GameState, modelId: string): string | undefined {
  for (const army of state.armies) {
    for (const unit of army.units) {
      if (unit.models.some(m => m.id === modelId)) return unit.id;
    }
  }
  return undefined;
}

// ─── Unit State Queries ──────────────────────────────────────────────────────

/**
 * Check if a unit has a specific special rule.
 * Checks against the unit's state-level special rules list.
 */
export function unitHasSpecialRule(unit: UnitState, ruleName: string): boolean {
  return unitProfileHasSpecialRule(unit.profileId, ruleName);
}

/**
 * Check if a unit is eligible to move (not pinned, routed in combat, etc.)
 */
export function canUnitMove(unit: UnitState): boolean {
  // Cannot move if: Pinned, Locked in Combat, movement 0 (checked at model level),
  // entered from reserves this turn, not deployed
  if (unit.statuses.includes(TacticalStatus.Pinned)) return false;
  if (unit.isLockedInCombat) return false;
  if (unit.movementState === UnitMovementState.EnteredFromReserves) return false;
  if (!unit.isDeployed) return false;
  if (unit.embarkedOnId !== null) return false;
  return true;
}

/**
 * Check if a unit can rush (move at M + I).
 */
export function canUnitRush(unit: UnitState): boolean {
  if (!canUnitMove(unit)) return false;
  // Cannot rush if already moved or rushed
  if (unit.movementState !== UnitMovementState.Stationary) return false;
  // Cannot rush during reactions
  return true;
}

/**
 * Check if a unit is eligible to react.
 * Reference: HH_Principles.md — Reaction eligibility
 */
export function canUnitReact(unit: UnitState): boolean {
  if (unit.hasReactedThisTurn) return false;
  if (unit.statuses.includes(TacticalStatus.Stunned)) return false;
  if (unit.statuses.includes(TacticalStatus.Routed)) return false;
  if (unit.isLockedInCombat) return false;
  if (!unit.isDeployed) return false;
  if (unit.embarkedOnId !== null) return false;
  return true;
}

/**
 * Check if an army has reaction allotments remaining.
 */
export function hasReactionAllotment(army: ArmyState): boolean {
  return army.reactionAllotmentRemaining > 0;
}

/**
 * Get alive (non-destroyed) models in a unit.
 */
export function getAliveModels(unit: UnitState): ModelState[] {
  return unit.models.filter(m => !m.isDestroyed);
}

/**
 * Check if a unit has been completely destroyed.
 */
export function isUnitDestroyed(unit: UnitState): boolean {
  return unit.models.every(m => m.isDestroyed);
}

/**
 * Get all units with a specific status.
 */
export function getUnitsWithStatus(
  army: ArmyState,
  status: TacticalStatus,
): UnitState[] {
  return army.units.filter(u => u.statuses.includes(status));
}

/**
 * Get all units in reserves.
 */
export function getUnitsInReserves(army: ArmyState): UnitState[] {
  return army.units.filter(u => u.isInReserves);
}

/**
 * Get all deployed, alive units.
 */
export function getDeployedUnits(army: ArmyState): UnitState[] {
  return army.units.filter(u => u.isDeployed && !isUnitDestroyed(u));
}

// ─── Geometry Helpers ────────────────────────────────────────────────────────

/**
 * Get ModelShape geometry for a model (for use with @hh/geometry).
 * Looks up actual base size from the unit profile data.
 */
export function getModelShape(model: ModelState): ModelShape {
  const baseSizeMM = getModelStateBaseSizeMM(model);
  return createCircleBase(model.position, baseSizeMM);
}

/**
 * Get all enemy model shapes from the game state.
 */
export function getEnemyModelShapes(
  state: GameState,
  playerIndex: number,
): ModelShape[] {
  const enemyIndex = playerIndex === 0 ? 1 : 0;
  const shapes: ModelShape[] = [];
  for (const unit of state.armies[enemyIndex].units) {
    if (!unit.isDeployed || unit.embarkedOnId !== null) continue;
    for (const model of unit.models) {
      if (!model.isDestroyed) {
        shapes.push(getModelShape(model));
      }
    }
  }
  return shapes;
}

/**
 * Get all model shapes for a specific unit.
 */
export function getUnitModelShapes(unit: UnitState): ModelShape[] {
  return unit.models
    .filter(m => !m.isDestroyed)
    .map(m => getModelShape(m));
}

/**
 * Get all model shapes for a specific army (deployed, alive).
 */
export function getArmyModelShapes(army: ArmyState): ModelShape[] {
  const shapes: ModelShape[] = [];
  for (const unit of army.units) {
    if (!unit.isDeployed || unit.embarkedOnId !== null) continue;
    for (const model of unit.models) {
      if (!model.isDestroyed) {
        shapes.push(getModelShape(model));
      }
    }
  }
  return shapes;
}

// ─── Routed Units ────────────────────────────────────────────────────────────

/**
 * Get all routed units in the active army.
 */
export function getRoutedUnits(state: GameState): UnitState[] {
  const army = getActiveArmy(state);
  return getUnitsWithStatus(army, TacticalStatus.Routed);
}

// ─── Phase Queries ───────────────────────────────────────────────────────────

/**
 * Check if we're in the Movement phase.
 */
export function isMovementPhase(state: GameState): boolean {
  return state.currentPhase === Phase.Movement;
}

/**
 * Check if we're in a specific sub-phase.
 */
export function isSubPhase(state: GameState, subPhase: SubPhase): boolean {
  return state.currentSubPhase === subPhase;
}

// ─── Shooting Phase Queries ──────────────────────────────────────────────────

/**
 * Check if we're in the Shooting phase.
 */
export function isShootingPhase(state: GameState): boolean {
  return state.currentPhase === Phase.Shooting;
}

/**
 * Check if a unit can make a shooting attack.
 * A unit cannot shoot if:
 * - It Rushed this turn
 * - It is Locked in Combat
 * - It is Embarked (unless vehicle that can fire while embarked)
 * - It is not deployed
 * - All models are destroyed
 * Reference: HH_Rules_Battle.md — Shooting Phase eligibility
 */
export function canUnitShoot(unit: UnitState): boolean {
  // Must be deployed
  if (!unit.isDeployed) return false;
  // Must not be embarked
  if (unit.embarkedOnId !== null) return false;
  // Must not have rushed
  if (unit.movementState === UnitMovementState.Rushed) return false;
  // Must not be locked in combat
  if (unit.isLockedInCombat) return false;
  // Must have alive models
  if (unit.models.every(m => m.isDestroyed)) return false;
  return true;
}

/**
 * Get the majority toughness of a unit.
 * If tied, use the highest tied value.
 * Reference: HH_Principles.md — Wound Tests use majority Toughness
 */
export function getUnitMajorityToughness(unit: UnitState): number {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return 0;

  // Count toughness values across alive models using profile data
  const toughnessCounts = new Map<number, number>();
  for (const model of aliveModels) {
    const t = getModelToughness(model.unitProfileId, model.profileModelName);
    toughnessCounts.set(t, (toughnessCounts.get(t) ?? 0) + 1);
  }

  // Find highest count, break ties with highest value
  let maxCount = 0;
  let majorityT = 0;
  for (const [t, count] of toughnessCounts) {
    if (count > maxCount || (count === maxCount && t > majorityT)) {
      maxCount = count;
      majorityT = t;
    }
  }

  return majorityT;
}

/**
 * Check if a unit contains Vehicle type models.
 * Used to determine whether to use Wound Tests or Armour Penetration.
 */
export function isVehicleUnit(unit: UnitState): boolean {
  return isVehicleUnitState(unit);
}

/**
 * Check if there's an active shooting attack in progress.
 */
export function hasActiveShootingAttack(state: GameState): boolean {
  return state.shootingAttackState !== undefined;
}

// ─── Assault Phase Queries ──────────────────────────────────────────────────

/**
 * Check if we're in the Assault phase.
 */
export function isAssaultPhase(state: GameState): boolean {
  return state.currentPhase === Phase.Assault;
}

/**
 * Check if there's an active assault attack in progress.
 */
export function hasActiveAssaultAttack(state: GameState): boolean {
  return state.assaultAttackState !== undefined;
}

/**
 * Check if a unit can declare a charge.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase eligibility
 */
export function canUnitCharge(unit: UnitState): boolean {
  // Must be deployed
  if (!unit.isDeployed) return false;
  // Must not be embarked
  if (unit.embarkedOnId !== null) return false;
  // Must not have Rushed this turn
  if (unit.movementState === UnitMovementState.Rushed) return false;
  // Must not be locked in combat already
  if (unit.isLockedInCombat) return false;
  // Must not have Pinned or Routed statuses
  if (unit.statuses.includes(TacticalStatus.Pinned)) return false;
  if (unit.statuses.includes(TacticalStatus.Routed)) return false;
  // Must have alive models
  if (unit.models.every(m => m.isDestroyed)) return false;
  return true;
}

/**
 * Check if a unit's charge would be disordered.
 * Any tactical status on the unit makes the charge disordered.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase, Disordered Charge
 */
export function isDisorderedCharge(unit: UnitState): boolean {
  return unit.statuses.length > 0;
}

/**
 * Get all units currently locked in combat.
 */
export function getLockedInCombatUnits(state: GameState): UnitState[] {
  const result: UnitState[] = [];
  for (const army of state.armies) {
    for (const unit of army.units) {
      if (unit.isLockedInCombat) {
        result.push(unit);
      }
    }
  }
  return result;
}

/**
 * Get all enemy units a unit is currently engaged with.
 */
export function getCombatParticipants(
  state: GameState,
  unitId: string,
): UnitState[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];
  const participants: UnitState[] = [];
  for (const engagedId of unit.engagedWithUnitIds) {
    const engaged = findUnit(state, engagedId);
    if (engaged) participants.push(engaged);
  }
  return participants;
}

/**
 * Check if a model is in base-to-base contact with any model from a target unit.
 * Base contact is defined as models whose bases overlap or touch (distance <= sum of base radii).
 * Uses 32mm (0.63") base size as default.
 * Reference: HH_Principles.md — Base Contact
 */
export function isModelInBaseContact(
  state: GameState,
  modelId: string,
  targetUnitId: string,
): boolean {
  const modelInfo = findModel(state, modelId);
  if (!modelInfo) return false;
  const targetUnit = findUnit(state, targetUnitId);
  if (!targetUnit) return false;

  const BASE_RADIUS_INCHES = 0.63; // ~32mm diameter in inches / 2
  const CONTACT_THRESHOLD = BASE_RADIUS_INCHES * 2 + 0.01; // Two bases touching + tiny tolerance

  for (const targetModel of targetUnit.models) {
    if (targetModel.isDestroyed) continue;
    const dx = modelInfo.model.position.x - targetModel.position.x;
    const dy = modelInfo.model.position.y - targetModel.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= CONTACT_THRESHOLD) return true;
  }
  return false;
}

/**
 * Get all engaged models in a unit for a given combat.
 * A model is engaged if:
 * - It is in base-to-base contact with an enemy model, OR
 * - It is within 2" of a friendly model that is in base contact with an enemy
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase, Engaged Models
 */
export function getEngagedModels(
  state: GameState,
  unitId: string,
  enemyUnitIds: string[],
): ModelState[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];

  const aliveModels = getAliveModels(unit);
  const WITHIN_2_INCHES = 2.0;

  // First pass: find models in base contact with any enemy
  const inBaseContact = new Set<string>();
  for (const model of aliveModels) {
    for (const enemyUnitId of enemyUnitIds) {
      if (isModelInBaseContact(state, model.id, enemyUnitId)) {
        inBaseContact.add(model.id);
        break;
      }
    }
  }

  // Second pass: find models within 2" of a friendly in base contact
  const engaged: ModelState[] = [];
  for (const model of aliveModels) {
    if (inBaseContact.has(model.id)) {
      engaged.push(model);
      continue;
    }
    // Check if within 2" of a friendly model that IS in base contact
    for (const friendlyModel of aliveModels) {
      if (friendlyModel.id === model.id) continue;
      if (!inBaseContact.has(friendlyModel.id)) continue;
      const dx = model.position.x - friendlyModel.position.x;
      const dy = model.position.y - friendlyModel.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= WITHIN_2_INCHES) {
        engaged.push(model);
        break;
      }
    }
  }

  return engaged;
}

/**
 * Get the majority Weapon Skill of a unit.
 * If tied, use the highest tied value.
 * Reference: HH_Principles.md — Majority WS for melee
 */
export function getMajorityWS(unit: UnitState): number {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return 0;

  // Count WS values across alive models using profile data
  const wsCounts = new Map<number, number>();
  for (const model of aliveModels) {
    const ws = getModelWS(model.unitProfileId, model.profileModelName);
    wsCounts.set(ws, (wsCounts.get(ws) ?? 0) + 1);
  }

  // Find highest count, break ties with highest value
  let maxCount = 0;
  let majorityWS = 0;
  for (const [ws, count] of wsCounts) {
    if (count > maxCount || (count === maxCount && ws > majorityWS)) {
      maxCount = count;
      majorityWS = ws;
    }
  }

  return majorityWS;
}

/**
 * Calculate a model's Combat Initiative Score for the Fight Sub-Phase.
 * Combat Initiative = base Initiative + weapon Initiative modifier.
 * If the model has ANY tactical status, Combat Initiative is forced to 1.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Step 2
 *
 * @param modelInitiative - The model's base Initiative characteristic
 * @param weaponInitiativeModifier - The melee weapon's Initiative modifier (IM)
 * @param unitStatuses - The unit's current tactical statuses
 * @returns The effective Combat Initiative score
 */
export function getCombatInitiative(
  modelInitiative: number,
  weaponInitiativeModifier: number | string,
  unitStatuses: TacticalStatus[],
): number {
  // Any tactical status → Combat Initiative forced to 1
  if (unitStatuses.length > 0) return 1;

  // If the weapon IM is a fixed value (number), use that as the initiative modifier
  if (typeof weaponInitiativeModifier === 'number') {
    return Math.max(1, modelInitiative + weaponInitiativeModifier);
  }

  // If string (e.g., "I" meaning use model's initiative), parse it
  // For now, if it's "I" or similar, just return the model's initiative
  return Math.max(1, modelInitiative);
}

/**
 * Get the distance between two positions in inches.
 */
export function getDistanceBetween(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find the closest distance between any two alive models in two units.
 * Returns Infinity if either unit has no alive models.
 */
export function getClosestModelDistance(
  state: GameState,
  unitIdA: string,
  unitIdB: string,
): number {
  const unitA = findUnit(state, unitIdA);
  const unitB = findUnit(state, unitIdB);
  if (!unitA || !unitB) return Infinity;

  const aliveA = getAliveModels(unitA);
  const aliveB = getAliveModels(unitB);
  if (aliveA.length === 0 || aliveB.length === 0) return Infinity;

  let minDist = Infinity;
  for (const modelA of aliveA) {
    for (const modelB of aliveB) {
      const dist = getDistanceBetween(modelA.position, modelB.position);
      if (dist < minDist) minDist = dist;
    }
  }
  return minDist;
}

/**
 * Check if any model in a unit has LOS to any model in a target unit.
 * For now, this is a simplified check — all alive models on the battlefield
 * are assumed to have LOS unless blocked by terrain.
 * TODO: Full LOS implementation with terrain blocking
 */
export function hasLOSToUnit(
  state: GameState,
  unitId: string,
  targetUnitId: string,
): boolean {
  const unit = findUnit(state, unitId);
  const target = findUnit(state, targetUnitId);
  if (!unit || !target) return false;
  if (!unit.isDeployed || !target.isDeployed) return false;

  const aliveAttackers = getAliveModels(unit);
  const aliveTargets = getAliveModels(target);
  if (aliveAttackers.length === 0 || aliveTargets.length === 0) return false;

  // Simplified: assume LOS exists if both units are deployed with alive models
  // Full terrain-based LOS would check for blocking terrain
  return true;
}

/**
 * Get models in a unit that have LOS to any model in the target unit.
 * Simplified for now — returns all alive models.
 * TODO: Full LOS implementation with terrain blocking
 */
export function getModelsWithLOSToUnit(
  state: GameState,
  unitId: string,
  targetUnitId: string,
): ModelState[] {
  const unit = findUnit(state, unitId);
  const target = findUnit(state, targetUnitId);
  if (!unit || !target) return [];
  if (!unit.isDeployed || !target.isDeployed) return [];

  const aliveTargets = getAliveModels(target);
  if (aliveTargets.length === 0) return [];

  // Simplified: all alive models have LOS
  return getAliveModels(unit);
}

// ─── Legion Queries ──────────────────────────────────────────────────────────

/**
 * Check if a specific advanced reaction has been used this battle.
 * Checks the advancedReactionsUsed array in GameState.
 */
export function hasAdvancedReactionBeenUsed(
  state: GameState,
  reactionId: string,
  playerIndex: number,
): boolean {
  return state.advancedReactionsUsed.some(
    u => u.reactionId === reactionId && u.playerIndex === playerIndex,
  );
}

/**
 * Check if all models in a unit belong to a specific legion faction.
 * This verifies the entire unit has the correct faction trait, not just the army.
 *
 * In practice, units in a detachment share the detachment's faction,
 * which matches the army faction. This function checks the army-level faction.
 */
export function isEntireUnitLegion(
  state: GameState,
  unitId: string,
  legion: LegionFaction,
): boolean {
  const army = findUnitArmy(state, unitId);
  if (!army) return false;
  return army.faction === legion;
}

/**
 * Get the movement state of a unit this turn.
 * Returns UnitMovementState enum value indicating whether the unit
 * is stationary, moved, rushed, etc.
 * Returns UnitMovementState.Stationary if the unit is not found.
 */
export function getUnitMovementState(
  state: GameState,
  unitId: string,
): UnitMovementState {
  const unit = findUnit(state, unitId);
  if (!unit) return UnitMovementState.Stationary;
  return unit.movementState;
}

/**
 * Check if a unit has moved this turn (any non-Stationary movement state).
 */
export function hasUnitMoved(
  state: GameState,
  unitId: string,
): boolean {
  const movState = getUnitMovementState(state, unitId);
  return movState !== UnitMovementState.Stationary;
}
