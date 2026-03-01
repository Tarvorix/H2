/**
 * Initiative Step Handler — Single Initiative Step Resolution
 * Implements the resolution of a single initiative step within a combat.
 *
 * Each initiative step contains models that fight at a specific initiative value.
 * Within a step, all strike groups are resolved sequentially:
 *   1. Hit tests (Attacker WS vs Defender WS from the Melee Hit Table)
 *   2. Wound tests (Weapon Strength vs Target Toughness from the Wound Table)
 *   3. Saving throws (modified by weapon AP)
 *   4. Damage application and casualty removal
 *
 * Models fighting at the same initiative step strike simultaneously —
 * casualties from this step still get to fight back before being removed.
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Steps 3-5
 * Reference: HH_Principles.md — Melee Hit Tests, Wound Tests
 * Reference: HH_Tables.md — Melee Hit Table, Wound Table
 */

import type { GameState, ModelState } from '@hh/types';
import { PipelineHook } from '@hh/types';
import { getTacticaEffectsForLegion } from '@hh/data';
import type {
  DiceProvider,
  GameEvent,
  MeleeHitTestRollEvent,
  MeleeWoundTestRollEvent,
  SavingThrowRollEvent,
  DamageAppliedEvent,
  CasualtyRemovedEvent,
  InitiativeStepResolvedEvent,
} from '../types';
import {
  findUnit,
  findModel,
  getAliveModels,
  getMajorityWS,
  getDistanceBetween,
  getUnitLegion,
} from '../game-queries';
import {
  applyWoundsToModel,
  updateUnitInGameState,
  updateModelInUnit,
} from '../state-helpers';
import { meleeHitTable, woundTable } from '../tables';
import type {
  CombatState,
  MeleeStrikeGroup,
} from './assault-types';
import { applyLegionTactica } from '../legion';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of resolving a single initiative step within a combat.
 * Contains the updated game state, combat state, emitted events,
 * and lists of casualty model IDs for each side.
 */
export interface InitiativeStepResult {
  /** The updated game state after resolving this initiative step */
  state: GameState;
  /** The updated combat state with casualties and resolution flags updated */
  combatState: CombatState;
  /** All events generated during resolution of this step */
  events: GameEvent[];
  /** Model IDs of active player casualties caused during this step */
  activePlayerCasualtiesThisStep: string[];
  /** Model IDs of reactive player casualties caused during this step */
  reactivePlayerCasualtiesThisStep: string[];
}

// ─── Resolve Initiative Step ────────────────────────────────────────────────

/**
 * Resolves a single initiative step within a combat.
 *
 * This is the core melee resolution function. It processes all strike groups
 * within the given initiative step, performing hit tests, wound tests, saving
 * throws, and damage application for each group sequentially.
 *
 * Models that die during this step still get to fight (simultaneous initiative),
 * so casualty removal is deferred until the entire step is resolved.
 *
 * Procedure:
 *   1. Get the InitiativeStep at the given index
 *   2. Filter out already-destroyed models from the step's modelIds
 *   3. For each strike group in the step:
 *      a. Determine the target number to hit via meleeHitTable(attackerWS, defenderWS)
 *      b. Roll hit tests (one die per totalAttacks)
 *      c. Roll wound tests (one die per hit)
 *      d. Roll saving throws for each wound
 *      e. Apply damage to target models
 *      f. Track casualties
 *   4. Generate events for hits, wounds, saves, damage, and casualties
 *   5. Update combatState casualty lists
 *   6. Mark the initiative step as resolved
 *   7. Generate InitiativeStepResolvedEvent
 *
 * @param state - Current game state
 * @param combatState - Current combat state for this combat
 * @param initiativeStepIndex - Index into combatState.initiativeSteps
 * @param dice - Dice provider for all rolls
 * @param targetToughness - Toughness value of the target (majority toughness)
 * @param defenderSave - Defender's base armour save value (e.g. 3 for 3+), or null if no save
 * @returns InitiativeStepResult with updated state, combatState, events, and casualties
 */
export function resolveInitiativeStep(
  state: GameState,
  combatState: CombatState,
  initiativeStepIndex: number,
  dice: DiceProvider,
  targetToughness: number,
  defenderSave: number | null,
): InitiativeStepResult {
  const events: GameEvent[] = [];
  const activePlayerCasualtiesThisStep: string[] = [];
  const reactivePlayerCasualtiesThisStep: string[] = [];

  // Step 1: Get the initiative step at the given index
  const initiativeStep = combatState.initiativeSteps[initiativeStepIndex];
  if (!initiativeStep) {
    // No step at this index — return unchanged state
    return {
      state,
      combatState,
      events,
      activePlayerCasualtiesThisStep,
      reactivePlayerCasualtiesThisStep,
    };
  }

  // Step 2: Filter out already-destroyed models from the step's modelIds
  const aliveModelIds = initiativeStep.modelIds.filter(modelId => {
    const modelInfo = findModel(state, modelId);
    return modelInfo !== undefined && !modelInfo.model.isDestroyed;
  });

  // If no alive models remain in this step, mark it resolved and return
  if (aliveModelIds.length === 0) {
    const updatedCombatState = markInitiativeStepResolved(
      combatState,
      initiativeStepIndex,
    );

    events.push({
      type: 'initiativeStepResolved',
      combatId: combatState.combatId,
      initiativeValue: initiativeStep.initiativeValue,
      activePlayerCasualties: 0,
      reactivePlayerCasualties: 0,
    } as InitiativeStepResolvedEvent);

    return {
      state,
      combatState: updatedCombatState,
      events,
      activePlayerCasualtiesThisStep,
      reactivePlayerCasualtiesThisStep,
    };
  }

  // Step 3: Resolve each strike group in this step
  let currentState = state;

  for (const strikeGroup of initiativeStep.strikeGroups) {
    if (strikeGroup.resolved) {
      continue;
    }

    // Determine which models in this strike group are still alive
    const aliveAttackerIds = strikeGroup.attackerModelIds.filter(id => {
      const info = findModel(currentState, id);
      return info !== undefined && !info.model.isDestroyed;
    });

    // If no alive attackers remain in this strike group, skip it
    if (aliveAttackerIds.length === 0) {
      continue;
    }

    // Find the target unit to determine defender WS
    const targetUnit = findUnit(currentState, strikeGroup.targetUnitId);
    if (!targetUnit) {
      continue;
    }

    const aliveTargetModels = getAliveModels(targetUnit);
    if (aliveTargetModels.length === 0) {
      continue;
    }

    // Apply legion tactica melee modifiers
    let wsModifier = 0;
    let strengthModifier = 0;
    let attacksModifier = 0;

    // Find the unit that owns the first alive attacker model
    const firstAttackerInfo = findModel(currentState, aliveAttackerIds[0]);
    if (firstAttackerInfo) {
      const attackerUnitId = firstAttackerInfo.unit.id;
      const attackerLegion = getUnitLegion(currentState, attackerUnitId);
      if (attackerLegion) {
        const effects = getTacticaEffectsForLegion(attackerLegion);

        // Check OnCharge tactica (BA +1S, WE +1A, EC +1CI)
        // isChargeTurn is approximated: the active player's units are the chargers
        const isCharging = combatState.activePlayerUnitIds.includes(attackerUnitId);
        const chargeResult = applyLegionTactica(attackerLegion, PipelineHook.OnCharge, {
          state: currentState,
          unit: firstAttackerInfo.unit,
          effects,
          hook: PipelineHook.OnCharge,
          isChargeTurn: isCharging,
          isChallenge: false,
          enemyUnits: [],
          entireUnitHasTactica: true,
        } as any);

        if (chargeResult.meleeStrengthModifier) {
          strengthModifier += chargeResult.meleeStrengthModifier;
        }
        if (chargeResult.meleeAttacksModifier) {
          attacksModifier += chargeResult.meleeAttacksModifier;
        }

        // Check PreHit tactica (NL +1 WS vs models with tactical status)
        const hitResult2 = applyLegionTactica(attackerLegion, PipelineHook.PreHit, {
          state: currentState,
          unit: firstAttackerInfo.unit,
          effects,
          hook: PipelineHook.PreHit,
          isChargeTurn: isCharging,
          isChallenge: false,
          enemyUnits: [targetUnit],
          entireUnitHasTactica: true,
        } as any);

        if (hitResult2.meleeWSModifier) {
          wsModifier += hitResult2.meleeWSModifier;
        }
      }
    }

    // Step 3a: Get defender's majority WS for hit table lookup
    const defenderMajorityWS = getMajorityWS(targetUnit);

    // Step 3b: Roll hit tests (apply WS and attacks modifiers from legion tactica)
    const effectiveStrikeGroup = {
      ...strikeGroup,
      weaponSkill: strikeGroup.weaponSkill + wsModifier,
      totalAttacks: strikeGroup.totalAttacks + attacksModifier,
    };
    const hitResult = resolveStrikeGroupHits(
      effectiveStrikeGroup,
      defenderMajorityWS,
      dice,
    );

    // Emit MeleeHitTestRollEvent
    const hitEvent: MeleeHitTestRollEvent = {
      type: 'meleeHitTestRoll',
      strikeGroupIndex: strikeGroup.index,
      rolls: hitResult.rolls,
      targetNumber: hitResult.targetNumber,
      attackerWS: strikeGroup.weaponSkill,
      defenderWS: defenderMajorityWS,
      hits: hitResult.hits,
      misses: hitResult.misses,
    };
    events.push(hitEvent);

    // If no hits, skip wound/save/damage
    if (hitResult.hits === 0) {
      continue;
    }

    // Step 3c: Roll wound tests (apply strength modifier from legion tactica)
    const effectiveStrength = strikeGroup.weaponStrength + strengthModifier;
    const woundResult = resolveStrikeGroupWounds(
      hitResult.hits,
      effectiveStrength,
      targetToughness,
      dice,
    );

    // Emit MeleeWoundTestRollEvent
    const woundEvent: MeleeWoundTestRollEvent = {
      type: 'meleeWoundTestRoll',
      strikeGroupIndex: strikeGroup.index,
      rolls: woundResult.rolls,
      targetNumber: woundResult.targetNumber ?? 0,
      strength: strikeGroup.weaponStrength,
      toughness: targetToughness,
      wounds: woundResult.wounds,
      failures: woundResult.failures,
    };
    events.push(woundEvent);

    // If no wounds, skip saves/damage
    if (woundResult.wounds === 0) {
      continue;
    }

    // Step 3d: Roll saving throws
    const saveResult = resolveStrikeGroupSaves(
      woundResult.wounds,
      defenderSave,
      strikeGroup.weaponAP,
      dice,
    );

    // Emit SavingThrowRollEvent for each save attempt
    const effectiveSave = calculateEffectiveSave(defenderSave, strikeGroup.weaponAP);
    for (let i = 0; i < saveResult.rolls.length; i++) {
      const roll = saveResult.rolls[i];
      const passed = effectiveSave !== null && effectiveSave <= 6 && roll >= effectiveSave;

      // Pick a target model to associate the save with
      const targetModelForSave = aliveTargetModels[i % aliveTargetModels.length];

      const saveEvent: SavingThrowRollEvent = {
        type: 'savingThrowRoll',
        modelId: targetModelForSave.id,
        saveType: 'armour',
        roll,
        targetNumber: effectiveSave ?? 7,
        passed,
        weaponAP: strikeGroup.weaponAP,
      };
      events.push(saveEvent);
    }

    // If no unsaved wounds, skip damage
    if (saveResult.unsavedWounds === 0) {
      continue;
    }

    // Step 3e: Apply damage to target models
    // Allocate unsaved wounds to target models, starting with the closest
    // to any attacking model, then wrapping to the next model in the unit.
    const damagePerWound = strikeGroup.weaponDamage;
    let remainingUnsavedWounds = saveResult.unsavedWounds;

    // Get currently alive target models (refresh in case previous strike groups
    // already damaged some — though within the same initiative step casualties
    // still get to fight, we still track damage for CRP purposes)
    const currentAliveTargets = getAliveModels(
      findUnit(currentState, strikeGroup.targetUnitId)!,
    );

    // Sort target models by proximity to any attacker model (closest first)
    const sortedTargets = sortTargetsByProximity(
      currentState,
      currentAliveTargets,
      aliveAttackerIds,
    );

    let targetModelIndex = 0;

    while (remainingUnsavedWounds > 0 && sortedTargets.length > 0) {
      // Wrap around if we've exceeded the number of available targets
      const targetModel = sortedTargets[targetModelIndex % sortedTargets.length];

      // Check if this model is already destroyed from accumulated damage this step
      const latestModelInfo = findModel(currentState, targetModel.id);
      if (!latestModelInfo || latestModelInfo.model.isDestroyed) {
        // Remove this model from sorted targets and try the next
        const destroyedIdx = sortedTargets.findIndex(m => m.id === targetModel.id);
        if (destroyedIdx >= 0) {
          sortedTargets.splice(destroyedIdx, 1);
        }
        if (sortedTargets.length === 0) break;
        targetModelIndex = targetModelIndex % sortedTargets.length;
        continue;
      }

      // Apply damage to this model
      const totalDamage = damagePerWound;
      const updatedModel = applyWoundsToModel(latestModelInfo.model, totalDamage);

      // Update the model in game state
      currentState = updateUnitInGameState(
        currentState,
        strikeGroup.targetUnitId,
        unit => updateModelInUnit(unit, targetModel.id, () => updatedModel),
      );

      // Emit DamageAppliedEvent
      const damageEvent: DamageAppliedEvent = {
        type: 'damageApplied',
        modelId: targetModel.id,
        unitId: strikeGroup.targetUnitId,
        woundsLost: totalDamage,
        remainingWounds: updatedModel.currentWounds,
        destroyed: updatedModel.isDestroyed,
        damageSource: strikeGroup.weaponName,
      };
      events.push(damageEvent);

      // Step 3f: Track casualties
      if (updatedModel.isDestroyed) {
        // Emit CasualtyRemovedEvent
        const casualtyEvent: CasualtyRemovedEvent = {
          type: 'casualtyRemoved',
          modelId: targetModel.id,
          unitId: strikeGroup.targetUnitId,
        };
        events.push(casualtyEvent);

        // Determine which side this casualty belongs to
        const isActivePlayerUnit = combatState.activePlayerUnitIds.includes(
          strikeGroup.targetUnitId,
        );

        if (isActivePlayerUnit) {
          activePlayerCasualtiesThisStep.push(targetModel.id);
        } else {
          reactivePlayerCasualtiesThisStep.push(targetModel.id);
        }

        // Remove from sorted targets so we move to the next model
        const removedIdx = sortedTargets.findIndex(m => m.id === targetModel.id);
        if (removedIdx >= 0) {
          sortedTargets.splice(removedIdx, 1);
        }

        // Reset index if we removed the current target
        if (sortedTargets.length > 0) {
          targetModelIndex = targetModelIndex % sortedTargets.length;
        }
      } else {
        // Model survived — move to the next model for the next wound
        targetModelIndex = (targetModelIndex + 1) % sortedTargets.length;
      }

      remainingUnsavedWounds--;
    }
  }

  // Step 5: Update combatState casualty lists
  let updatedCombatState: CombatState = {
    ...combatState,
    activePlayerCasualties: [
      ...combatState.activePlayerCasualties,
      ...activePlayerCasualtiesThisStep,
    ],
    reactivePlayerCasualties: [
      ...combatState.reactivePlayerCasualties,
      ...reactivePlayerCasualtiesThisStep,
    ],
  };

  // Step 6: Mark initiative step as resolved
  updatedCombatState = markInitiativeStepResolved(
    updatedCombatState,
    initiativeStepIndex,
  );

  // Step 7: Generate InitiativeStepResolvedEvent
  const resolvedEvent: InitiativeStepResolvedEvent = {
    type: 'initiativeStepResolved',
    combatId: combatState.combatId,
    initiativeValue: initiativeStep.initiativeValue,
    activePlayerCasualties: activePlayerCasualtiesThisStep.length,
    reactivePlayerCasualties: reactivePlayerCasualtiesThisStep.length,
  };
  events.push(resolvedEvent);

  return {
    state: currentState,
    combatState: updatedCombatState,
    events,
    activePlayerCasualtiesThisStep,
    reactivePlayerCasualtiesThisStep,
  };
}

// ─── Resolve Strike Group Hits ──────────────────────────────────────────────

/**
 * Resolves hit tests for a melee strike group.
 *
 * Uses the Melee Hit Table (Attacker WS vs Defender WS) to determine the
 * target number needed to hit, then rolls one d6 per attack. A roll equal
 * to or greater than the target number is a hit.
 *
 * Reference: HH_Tables.md — Melee Hit Table
 * Reference: HH_Principles.md — Melee Hit Tests
 *
 * @param strikeGroup - The melee strike group to resolve hits for
 * @param defenderMajorityWS - The majority Weapon Skill of the defending unit
 * @param dice - Dice provider for rolling
 * @returns Object containing hits count, misses count, individual rolls, and the target number
 */
export function resolveStrikeGroupHits(
  strikeGroup: MeleeStrikeGroup,
  defenderMajorityWS: number,
  dice: DiceProvider,
): { hits: number; misses: number; rolls: number[]; targetNumber: number } {
  // Look up the target number from the Melee Hit Table
  const targetNumber = meleeHitTable(strikeGroup.weaponSkill, defenderMajorityWS);

  // Roll one d6 per attack
  const rolls: number[] = [];
  let hits = 0;
  let misses = 0;

  for (let i = 0; i < strikeGroup.totalAttacks; i++) {
    const roll = dice.rollD6();
    rolls.push(roll);

    if (roll >= targetNumber) {
      hits++;
    } else {
      misses++;
    }
  }

  return { hits, misses, rolls, targetNumber };
}

// ─── Resolve Strike Group Wounds ────────────────────────────────────────────

/**
 * Resolves wound tests for a melee strike group.
 *
 * Uses the Wound Table (Weapon Strength vs Target Toughness) to determine
 * the target number needed to wound, then rolls one d6 per hit. A roll
 * equal to or greater than the target number inflicts a wound.
 *
 * If the Wound Table returns null (impossible to wound — e.g. S1 vs T8),
 * no rolls are made and 0 wounds are returned.
 *
 * Reference: HH_Tables.md — Wound Table
 * Reference: HH_Principles.md — Wound Tests
 *
 * @param hits - Number of hits scored (from resolveStrikeGroupHits)
 * @param strength - Weapon Strength value
 * @param toughness - Target's Toughness value (majority toughness of the unit)
 * @param dice - Dice provider for rolling
 * @returns Object containing wounds count, failures count, individual rolls, and the target number (or null)
 */
export function resolveStrikeGroupWounds(
  hits: number,
  strength: number,
  toughness: number,
  dice: DiceProvider,
): { wounds: number; failures: number; rolls: number[]; targetNumber: number | null } {
  // Look up the target number from the Wound Table
  const targetNumber = woundTable(strength, toughness);

  // If target is null (impossible to wound), return 0 wounds with no rolls
  if (targetNumber === null) {
    return { wounds: 0, failures: hits, rolls: [], targetNumber: null };
  }

  // Roll one d6 per hit
  const rolls: number[] = [];
  let wounds = 0;
  let failures = 0;

  for (let i = 0; i < hits; i++) {
    const roll = dice.rollD6();
    rolls.push(roll);

    if (roll >= targetNumber) {
      wounds++;
    } else {
      failures++;
    }
  }

  return { wounds, failures, rolls, targetNumber };
}

// ─── Resolve Strike Group Saves ─────────────────────────────────────────────

/**
 * Resolves saving throws for wounds inflicted by a melee strike group.
 *
 * The effective save is calculated as: base save + weapon AP.
 * If the effective save exceeds 6, no save is possible and all wounds
 * go through. If the defender has no save (save is null), all wounds
 * also go through without rolling.
 *
 * AP values in Horus Heresy are positive numbers that worsen the save
 * (e.g. AP 2 means a 3+ save becomes a 5+). An AP of null means
 * no AP modification.
 *
 * Reference: HH_Principles.md — Saving Throws
 *
 * @param wounds - Number of wounds to save against
 * @param save - Base armour save value (e.g. 3 for 3+), or null if no save
 * @param ap - Weapon AP value, or null for no AP
 * @param dice - Dice provider for rolling
 * @returns Object containing unsaved wound count, saved count, and individual rolls
 */
export function resolveStrikeGroupSaves(
  wounds: number,
  save: number | null,
  ap: number | null,
  dice: DiceProvider,
): { unsavedWounds: number; savedCount: number; rolls: number[] } {
  // If defender has no save at all, all wounds go through
  if (save === null) {
    return { unsavedWounds: wounds, savedCount: 0, rolls: [] };
  }

  // Calculate effective save: base save + AP modification
  // AP worsens the save (higher number = harder to save)
  const effectiveSave = save + (ap ?? 0);

  // Cap at 7 — if effective save > 6, no save is possible
  if (effectiveSave > 6) {
    return { unsavedWounds: wounds, savedCount: 0, rolls: [] };
  }

  // Roll one d6 per wound
  const rolls: number[] = [];
  let savedCount = 0;
  let unsavedWounds = 0;

  for (let i = 0; i < wounds; i++) {
    const roll = dice.rollD6();
    rolls.push(roll);

    if (roll >= effectiveSave) {
      savedCount++;
    } else {
      unsavedWounds++;
    }
  }

  return { unsavedWounds, savedCount, rolls };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Marks an initiative step as resolved in the combat state.
 * Also marks all strike groups within that step as resolved.
 *
 * @param combatState - The combat state to update
 * @param stepIndex - The index of the initiative step to mark as resolved
 * @returns Updated CombatState with the step marked as resolved
 */
function markInitiativeStepResolved(
  combatState: CombatState,
  stepIndex: number,
): CombatState {
  const updatedSteps = combatState.initiativeSteps.map((step, index) => {
    if (index !== stepIndex) return step;

    // Mark all strike groups within this step as resolved
    const updatedStrikeGroups = step.strikeGroups.map(sg => ({
      ...sg,
      resolved: true,
    }));

    return {
      ...step,
      strikeGroups: updatedStrikeGroups,
      resolved: true,
    };
  });

  return {
    ...combatState,
    initiativeSteps: updatedSteps,
  };
}

/**
 * Calculates the effective armour save after applying weapon AP.
 *
 * @param save - Base armour save value, or null if no save
 * @param ap - Weapon AP value, or null for no AP
 * @returns The effective save value, or null if no save is possible
 */
function calculateEffectiveSave(
  save: number | null,
  ap: number | null,
): number | null {
  if (save === null) return null;

  const effective = save + (ap ?? 0);

  // If effective save > 6, it's impossible to save
  if (effective > 6) return null;

  return effective;
}

/**
 * Sorts target models by proximity to any attacker model (closest first).
 * This determines the order in which unsaved wounds are allocated to models.
 *
 * In melee, wounds are allocated to the closest models first. This ensures
 * that models in base contact take wounds before models further back in
 * the unit.
 *
 * @param state - Current game state (for looking up model positions)
 * @param targetModels - Array of alive target models to sort
 * @param attackerModelIds - IDs of the attacking models
 * @returns A mutable array of target models sorted by proximity (closest first)
 */
function sortTargetsByProximity(
  state: GameState,
  targetModels: ModelState[],
  attackerModelIds: string[],
): ModelState[] {
  // Create a mutable copy
  const sorted = [...targetModels];

  // Precompute minimum distance from each target to any attacker
  const distanceMap = new Map<string, number>();

  for (const target of sorted) {
    let minDist = Infinity;

    for (const attackerId of attackerModelIds) {
      const attackerInfo = findModel(state, attackerId);
      if (!attackerInfo) continue;

      const dist = getDistanceBetween(target.position, attackerInfo.model.position);
      if (dist < minDist) {
        minDist = dist;
      }
    }

    distanceMap.set(target.id, minDist);
  }

  // Sort by distance (closest first)
  sorted.sort((a, b) => {
    const distA = distanceMap.get(a.id) ?? Infinity;
    const distB = distanceMap.get(b.id) ?? Infinity;
    return distA - distB;
  });

  return sorted;
}
