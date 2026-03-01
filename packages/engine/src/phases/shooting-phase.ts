/**
 * Shooting Phase Handler
 * Orchestrates the 11-step shooting attack pipeline.
 * Reference: HH_Rules_Battle.md -- "Shooting Phase"
 */

import type {
  GameState,
  DeclareShootingCommand,
  ShootingAttackState as ExternalShootingAttackState,
  ShootingFireGroup,
  ShootingMoraleCheck,
  ShootingGlancingHit,
} from '@hh/types';
import { Phase, SubPhase, CoreReaction, VehicleFacing } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent, ShootingAttackDeclaredEvent, FireGroupResolvedEvent, DamageAppliedEvent } from '../types';
import {
  findUnit,
  findUnitPlayerIndex,
  getAliveModels,
  getUnitMajorityToughness,
  isVehicleUnit,
} from '../game-queries';
import {
  setShootingAttackState,
  clearShootingAttackState,
  setAwaitingReaction,
  updateModelInUnit,
  updateUnitInGameState,
  applyWoundsToModel,
} from '../state-helpers';

// Shooting pipeline modules
import {
  validateShootingTarget,
  validateAttackerEligibility,
  filterModelsWithLOS,
} from '../shooting/shooting-validator';
import { validateWeaponAssignments } from '../shooting/weapon-declaration';
import { formFireGroups, splitPrecisionHits } from '../shooting/fire-groups';
import { resolveFireGroupHits, processGetsHot } from '../shooting/hit-resolution';
import { resolveWoundTests } from '../shooting/wound-resolution';
import { resolveArmourPenetration } from '../shooting/armour-penetration';
import { autoSelectTargetModel } from '../shooting/target-model-selection';
import type { TargetModelInfo } from '../shooting/target-model-selection';
import { resolveSaves } from '../shooting/save-resolution';
import { resolveDamage, handleDamageMitigation } from '../shooting/damage-resolution';
import { removeCasualties } from '../shooting/casualty-removal';
import { resolveVehicleDamageTable } from '../shooting/vehicle-damage';
import { resolveShootingMorale as resolveMorale } from '../shooting/morale-handler';
import { checkReturnFireTrigger } from '../shooting/return-fire-handler';
import type { FireGroup, WeaponAssignment, PendingMoraleCheck, WoundResult, GlancingHit } from '../shooting/shooting-types';
import { ModelType } from '@hh/types';
import { getSpecialRuleValue } from '../shooting/hit-resolution';
import {
  lookupUnitProfile,
  lookupModelDefinition,
  isVehicleCharacteristics,
  getModelWounds,
  getModelSave,
  getModelInvulnSave,
  getVehicleArmour,
} from '../profile-lookup';

// ---- Helpers ----------------------------------------------------------------

/**
 * Create a rejected CommandResult with the given error.
 */
function rejectShooting(state: GameState, code: string, message: string): CommandResult {
  return { state, events: [], errors: [{ code, message }], accepted: false };
}

/**
 * Calculate Euclidean distance between two positions.
 */
function euclideanDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert an internal FireGroup to the external ShootingFireGroup type
 * used by @hh/types ShootingAttackState.
 */
function toExternalFireGroup(fg: FireGroup): ShootingFireGroup {
  return {
    index: fg.index,
    weaponName: fg.weaponName,
    profileName: fg.profileName,
    ballisticSkill: fg.ballisticSkill,
    isSnapShot: fg.isSnapShot,
    totalFirepower: fg.totalFirepower,
    specialRules: fg.specialRules.map(sr => ({ name: sr.name, value: sr.value })),
    traits: [...fg.traits],
    weaponStrength: fg.weaponProfile.rangedStrength,
    weaponAP: fg.weaponProfile.ap,
    weaponDamage: fg.weaponProfile.damage,
    weaponRange: fg.weaponProfile.range,
    hasTemplate: fg.weaponProfile.hasTemplate,
    attacks: fg.attacks.map(a => ({
      modelId: a.modelId,
      firepower: a.firepower,
      ballisticSkill: a.ballisticSkill,
      isSnapShot: a.isSnapShot,
    })),
    hits: fg.hits.map(h => ({
      diceRoll: h.diceRoll,
      targetNumber: h.targetNumber,
      isHit: h.isHit,
      isCritical: h.isCritical,
      isPrecision: h.isPrecision,
      isRending: h.isRending,
      isAutoHit: h.isAutoHit,
      sourceModelId: h.sourceModelId,
      weaponStrength: h.weaponStrength,
      weaponAP: h.weaponAP,
      weaponDamage: h.weaponDamage,
      specialRules: h.specialRules.map(sr => ({ name: sr.name, value: sr.value })),
    })),
    wounds: fg.wounds.map(w => ({
      diceRoll: w.diceRoll,
      targetNumber: w.targetNumber,
      isWound: w.isWound,
      strength: w.strength,
      ap: w.ap,
      damage: w.damage,
      isBreaching: w.isBreaching,
      isShred: w.isShred,
      isPoisoned: w.isPoisoned,
      isCriticalWound: w.isCriticalWound,
      isRendingWound: w.isRendingWound,
      isPrecision: w.isPrecision,
      specialRules: w.specialRules.map(sr => ({ name: sr.name, value: sr.value })),
      assignedToModelId: w.assignedToModelId,
    })),
    penetratingHits: fg.penetratingHits.map(p => ({
      diceRoll: p.diceRoll,
      strength: p.strength,
      total: p.total,
      armourValue: p.armourValue,
      facing: p.facing,
      isPenetrating: p.isPenetrating,
      damage: p.damage,
      specialRules: p.specialRules.map(sr => ({ name: sr.name, value: sr.value })),
      assignedToModelId: p.assignedToModelId,
    })),
    glancingHits: fg.glancingHits.map(g => ({
      facing: g.facing,
      vehicleModelId: g.vehicleModelId,
      vehicleUnitId: g.vehicleUnitId,
    })),
    resolved: fg.resolved,
    isPrecisionGroup: fg.isPrecisionGroup,
    isDeflagrateGroup: fg.isDeflagrateGroup,
  };
}

/**
 * Convert an internal PendingMoraleCheck to the external ShootingMoraleCheck type.
 */
function toExternalMoraleCheck(check: PendingMoraleCheck): ShootingMoraleCheck {
  return {
    unitId: check.unitId,
    checkType: check.checkType,
    modifier: check.modifier,
    source: check.source,
  };
}

/**
 * Convert an internal GlancingHit to the external ShootingGlancingHit type.
 */
function toExternalGlancingHit(hit: GlancingHit): ShootingGlancingHit {
  return {
    facing: hit.facing,
    vehicleModelId: hit.vehicleModelId,
    vehicleUnitId: hit.vehicleUnitId,
  };
}

/**
 * Build TargetModelInfo array for target model selection.
 * Looks up model type and wounds from profile data.
 */
function buildTargetModelInfos(targetUnit: { models: Array<{ id: string; isDestroyed: boolean; currentWounds: number; unitProfileId: string; profileModelName: string }> }): TargetModelInfo[] {
  return targetUnit.models.map(m => {
    const profile = lookupUnitProfile(m.unitProfileId);
    const modelDef = lookupModelDefinition(m.unitProfileId, m.profileModelName);
    const maxWounds = getModelWounds(m.unitProfileId, m.profileModelName);
    const chars = modelDef?.characteristics;
    const isVehicle = chars ? isVehicleCharacteristics(chars) : false;

    return {
      model: m as TargetModelInfo['model'],
      modelType: profile?.unitType ?? ModelType.Infantry,
      modelSubTypes: profile?.unitSubTypes ?? [],
      maxWounds,
      isVehicle,
    };
  });
}

// ---- handleShootingAttack ---------------------------------------------------

/**
 * Process a full shooting attack through the 11-step pipeline.
 *
 * Steps 1-2: Validate attacker eligibility and target validity
 * Step 3: Validate weapon assignments
 * Step 4: Form fire groups
 * Steps 5-6: For each fire group, resolve hits
 * Step 7: For each fire group, resolve wounds/AP
 * Step 8: For each fire group, auto-select target models
 * Step 9: For each fire group, resolve saves and damage
 * Step 10: Check Return Fire trigger
 * Step 11: Remove casualties and resolve vehicle damage
 *
 * @param state - Current game state
 * @param command - The declareShooting command
 * @param dice - Dice provider for all rolls
 * @returns CommandResult with updated state and events
 */
export function handleShootingAttack(
  state: GameState,
  command: DeclareShootingCommand,
  dice: DiceProvider,
): CommandResult {
  const allEvents: GameEvent[] = [];

  // ---- Validate phase ----
  if (state.currentPhase !== Phase.Shooting || state.currentSubPhase !== SubPhase.Attack) {
    return rejectShooting(state, 'WRONG_PHASE', 'declareShooting requires Shooting/Attack phase');
  }

  // ---- Steps 1-2: Validate attacker eligibility and target validity ----

  const attackerUnitId = command.attackingUnitId;
  const targetUnitId = command.targetUnitId;

  // Validate attacker eligibility
  const attackerValidation = validateAttackerEligibility(state, attackerUnitId);
  if (!attackerValidation.valid) {
    const firstError = attackerValidation.errors[0];
    return rejectShooting(state, firstError.code, firstError.message);
  }

  // Validate target
  const targetValidation = validateShootingTarget(state, attackerUnitId, targetUnitId);
  if (!targetValidation.valid) {
    const firstError = targetValidation.errors[0];
    return rejectShooting(state, firstError.code, firstError.message);
  }

  // Get attacker and target units
  const attackerUnit = findUnit(state, attackerUnitId)!;
  const targetUnit = findUnit(state, targetUnitId)!;
  const attackerPlayerIndex = findUnitPlayerIndex(state, attackerUnitId)!;

  // Get alive models for both units
  const attackerAliveModels = getAliveModels(attackerUnit);
  const targetAliveModels = getAliveModels(targetUnit);

  // ---- Step 2: Filter models with LOS ----
  const modelsWithLOS = filterModelsWithLOS(
    attackerAliveModels,
    targetAliveModels,
    state.terrain,
    [], // No vehicle hulls to block LOS for now
  );

  if (modelsWithLOS.length === 0) {
    return rejectShooting(state, 'NO_LOS', 'No attacking models have line of sight to the target');
  }

  // ---- Calculate distance (centroid-based, first alive model each) ----
  const attackerPos = attackerAliveModels[0].position;
  const targetPos = targetAliveModels[0].position;
  const targetDistance = euclideanDistance(attackerPos, targetPos);

  // ---- Step 3: Validate weapon assignments ----
  // Convert from command's weaponSelections to internal WeaponAssignment[]
  const weaponAssignments: WeaponAssignment[] = command.weaponSelections.map(ws => ({
    modelId: ws.modelId,
    weaponId: ws.weaponId,
    profileName: ws.profileName,
  }));

  if (weaponAssignments.length === 0) {
    return rejectShooting(state, 'NO_WEAPON_SELECTIONS', 'At least one weapon selection is required');
  }

  const weaponValidation = validateWeaponAssignments(
    weaponAssignments,
    attackerUnit,
    modelsWithLOS,
    targetDistance,
  );

  if (!weaponValidation.valid) {
    const firstError = weaponValidation.errors[0];
    return rejectShooting(state, firstError.code, firstError.message);
  }

  // ---- Step 4: Form fire groups ----
  const fireGroups = formFireGroups(
    weaponAssignments,
    attackerUnit,
    modelsWithLOS,
    targetDistance,
  );

  if (fireGroups.length === 0) {
    return rejectShooting(state, 'NO_FIRE_GROUPS', 'No valid fire groups could be formed from the weapon assignments');
  }

  // Record unit sizes at start of attack (for 25% panic threshold)
  const unitSizesAtStart: Record<string, number> = {};
  unitSizesAtStart[targetUnitId] = getAliveModels(targetUnit).length;
  unitSizesAtStart[attackerUnitId] = getAliveModels(attackerUnit).length;

  // Determine if target is a vehicle for wound resolution path
  const targetIsVehicle = isVehicleUnit(targetUnit);
  const majorityToughness = targetIsVehicle ? 0 : getUnitMajorityToughness(targetUnit);

  // Emit the shooting attack declared event
  const declaredEvent: ShootingAttackDeclaredEvent = {
    type: 'shootingAttackDeclared',
    attackerUnitId,
    targetUnitId,
    fireGroupCount: fireGroups.length,
    fireGroups: fireGroups.map(toExternalFireGroup),
  };
  allEvents.push(declaredEvent);

  // Tracking for accumulated casualties and glancing hits
  const accumulatedCasualties: string[] = [];
  const accumulatedGlancingHits: GlancingHit[] = [];

  // Track all fire groups (may expand with precision splits)
  let allFireGroups: FireGroup[] = [...fireGroups];

  // State reference for applying damage (may be mutated as wounds are applied)
  let currentState = state;

  // ---- Steps 5-9: Resolve each fire group ----
  for (let fgIdx = 0; fgIdx < allFireGroups.length; fgIdx++) {
    let fireGroup = allFireGroups[fgIdx];

    // ---- Steps 5-6: Resolve hit tests ----
    const hitResult = resolveFireGroupHits(fireGroup, dice);
    allEvents.push(...hitResult.events);

    // Update fire group with hit results
    fireGroup = { ...fireGroup, hits: hitResult.hits };

    // Process Gets Hot (if weapon has it)
    const getsHotResult = processGetsHot(fireGroup, hitResult.hits, dice);
    if (getsHotResult.getsHotEvents.length > 0) {
      // Fill in unit ID on Gets Hot events
      const getsHotEventsWithUnit = getsHotResult.getsHotEvents.map(evt => ({
        ...evt,
        unitId: attackerUnitId,
      }));
      allEvents.push(...getsHotEventsWithUnit);

      // Apply Gets Hot wounds to attacker models
      for (const mw of getsHotResult.modelWounds) {
        currentState = updateUnitInGameState(currentState, attackerUnitId, (unit) =>
          updateModelInUnit(unit, mw.modelId, (model) =>
            applyWoundsToModel(model, mw.wounds),
          ),
        );
      }
    }

    // Filter to only successful hits for wound resolution
    const successfulHits = hitResult.hits.filter(h => h.isHit);

    if (successfulHits.length === 0) {
      // No hits -- mark fire group as resolved
      fireGroup = { ...fireGroup, resolved: true };
      allFireGroups[fgIdx] = fireGroup;

      // Emit fire group resolved event
      const fgResolvedEvent: FireGroupResolvedEvent = {
        type: 'fireGroupResolved',
        fireGroupIndex: fireGroup.index,
        weaponName: fireGroup.weaponName,
        totalHits: 0,
        totalWounds: 0,
        totalPenetrating: 0,
        totalGlancing: 0,
      };
      allEvents.push(fgResolvedEvent);
      continue;
    }

    // Split precision hits into a separate fire group if needed
    const { normalGroup, precisionGroup } = splitPrecisionHits(fireGroup, hitResult.hits);

    // Replace the current fire group with the normal group
    allFireGroups[fgIdx] = normalGroup;

    // If there's a precision group, add it to the list for processing after
    if (precisionGroup) {
      precisionGroup.index = allFireGroups.length;
      allFireGroups.push(precisionGroup);
    }

    // Process both the normal group and any precision group that was added
    // (precision group will be processed in a later iteration)
    // For the current iteration, resolve wounds for the normal group
    const groupToResolve = normalGroup;
    const groupSuccessfulHits = groupToResolve.hits.filter(h => h.isHit);

    if (groupSuccessfulHits.length === 0) {
      groupToResolve.resolved = true;
      allFireGroups[fgIdx] = groupToResolve;

      const fgResolvedEvent: FireGroupResolvedEvent = {
        type: 'fireGroupResolved',
        fireGroupIndex: groupToResolve.index,
        weaponName: groupToResolve.weaponName,
        totalHits: 0,
        totalWounds: 0,
        totalPenetrating: 0,
        totalGlancing: 0,
      };
      allEvents.push(fgResolvedEvent);
      continue;
    }

    // ---- Step 7: Resolve wounds or armour penetration ----
    let woundsToProcess: WoundResult[] = [];
    let penetratingCount = 0;
    let glancingCount = 0;

    if (targetIsVehicle) {
      // Vehicle target: resolve armour penetration using profile data
      const targetModel = targetAliveModels.length > 0 ? targetAliveModels[0] : null;
      const vehicleArmour = targetModel ? getVehicleArmour(targetModel.unitProfileId, targetModel.profileModelName) : undefined;
      // Default to front AV; facing determination would require spatial analysis
      const armourValue = vehicleArmour?.front ?? 12;
      const facing = VehicleFacing.Front;

      const apResult = resolveArmourPenetration(groupSuccessfulHits, armourValue, facing, dice);
      allEvents.push(...apResult.events);

      // Store penetrating and glancing hits on the fire group
      groupToResolve.penetratingHits = apResult.penetratingHits;
      penetratingCount = apResult.penetratingHits.length;

      // Fill in vehicle model/unit IDs on glancing hits
      const targetModelId = targetAliveModels.length > 0 ? targetAliveModels[0].id : '';
      const filledGlancingHits = apResult.glancingHits.map(gh => ({
        ...gh,
        vehicleModelId: targetModelId,
        vehicleUnitId: targetUnitId,
      }));
      groupToResolve.glancingHits = filledGlancingHits;
      glancingCount = filledGlancingHits.length;
      accumulatedGlancingHits.push(...filledGlancingHits);
    } else {
      // Non-vehicle target: resolve wound tests
      const woundResult = resolveWoundTests(groupSuccessfulHits, majorityToughness, dice);
      allEvents.push(...woundResult.events);

      // Store wound results on the fire group
      groupToResolve.wounds = woundResult.wounds;
      woundsToProcess = woundResult.wounds.filter(w => w.isWound);
    }

    // ---- Step 8: Auto-select target models ----
    // Re-read the target unit from current state (it may have been modified)
    const currentTargetUnit = findUnit(currentState, targetUnitId);
    if (!currentTargetUnit) {
      // Target unit no longer exists (destroyed by Gets Hot or other causes)
      groupToResolve.resolved = true;
      allFireGroups[fgIdx] = groupToResolve;
      continue;
    }

    if (targetIsVehicle) {
      // For vehicles, assign penetrating hits to the first alive vehicle model
      const vehicleAlive = getAliveModels(currentTargetUnit);
      if (vehicleAlive.length > 0) {
        for (const pen of groupToResolve.penetratingHits) {
          pen.assignedToModelId = vehicleAlive[0].id;
        }
      }
    } else {
      // For non-vehicles, use target model selection for each wound
      const targetModelInfos = buildTargetModelInfos(currentTargetUnit);
      for (const wound of woundsToProcess) {
        if (wound.isPrecision && groupToResolve.isPrecisionGroup) {
          // Precision wounds: attacker chooses target (select first alive for auto-selection)
          const aliveTargets = getAliveModels(currentTargetUnit);
          if (aliveTargets.length > 0) {
            wound.assignedToModelId = aliveTargets[0].id;
          }
        } else {
          // Normal wounds: defender selects (use auto-selection algorithm)
          const selectedModelId = autoSelectTargetModel(targetModelInfos, 'wound');
          if (selectedModelId) {
            wound.assignedToModelId = selectedModelId;
          }
        }
      }
    }

    // ---- Step 9: Resolve saves and apply damage ----
    if (targetIsVehicle) {
      // For vehicle targets, penetrating hits cause direct damage (no saving throws for penetrating)
      for (const pen of groupToResolve.penetratingHits) {
        if (pen.assignedToModelId) {
          const targetModel = currentTargetUnit.models.find(m => m.id === pen.assignedToModelId);
          if (targetModel && !targetModel.isDestroyed) {
            const damageResult = resolveDamage(
              // Create a wound-like object for damage resolution
              [{ diceRoll: pen.diceRoll, targetNumber: 0, isWound: true, strength: pen.strength, ap: null, damage: pen.damage, isBreaching: false, isShred: false, isPoisoned: false, isCriticalWound: false, isRendingWound: false, isPrecision: false, specialRules: [...pen.specialRules] }],
              pen.assignedToModelId,
              targetModel.currentWounds,
            );

            // Apply damage to the model in the game state
            currentState = updateUnitInGameState(currentState, targetUnitId, (unit) =>
              updateModelInUnit(unit, pen.assignedToModelId!, (model) => ({
                ...model,
                currentWounds: damageResult.finalWounds,
                isDestroyed: damageResult.destroyed,
              })),
            );

            // Emit damage applied event
            const damageEvent: DamageAppliedEvent = {
              type: 'damageApplied',
              modelId: pen.assignedToModelId,
              unitId: targetUnitId,
              woundsLost: damageResult.totalDamageApplied,
              remainingWounds: damageResult.finalWounds,
              destroyed: damageResult.destroyed,
              damageSource: `Penetrating hit from ${groupToResolve.weaponName}`,
            };
            allEvents.push(damageEvent);

            // Track casualties
            if (damageResult.destroyed) {
              accumulatedCasualties.push(pen.assignedToModelId);
            }
          }
        }
      }
    } else {
      // For non-vehicle targets, resolve saving throws
      // Group wounds by target model
      const woundsByModel = new Map<string, WoundResult[]>();
      for (const wound of woundsToProcess) {
        const modelId = wound.assignedToModelId;
        if (modelId) {
          const existing = woundsByModel.get(modelId) ?? [];
          existing.push(wound);
          woundsByModel.set(modelId, existing);
        }
      }

      // Resolve saves and damage per model
      for (const [modelId, modelWounds] of woundsByModel) {
        // Check for Shrouded damage mitigation on the target unit
        const shroudedValue = getSpecialRuleValue(
          groupToResolve.weaponProfile.specialRules,
          'Shrouded',
        );

        let woundsForSaves = modelWounds;

        // Handle damage mitigation (Shrouded) if applicable
        if (shroudedValue !== null) {
          const mitigationResult = handleDamageMitigation(
            modelWounds,
            'Shrouded',
            shroudedValue,
            dice,
          );
          allEvents.push(...mitigationResult.events);
          woundsForSaves = mitigationResult.remainingWounds;
        }

        // Resolve saves using profile data
        const targetModel = findUnit(currentState, targetUnitId)?.models.find(m => m.id === modelId);
        const armourSave = targetModel ? (getModelSave(targetModel.unitProfileId, targetModel.profileModelName) ?? 7) : 3;
        const invulnSave: number | null = targetModel ? getModelInvulnSave(targetModel.unitProfileId, targetModel.profileModelName) : null;
        const coverSave: number | null = null; // Cover save determined by terrain, not profile

        const saveResult = resolveSaves(armourSave, invulnSave, coverSave, woundsForSaves, dice);
        allEvents.push(...saveResult.events);

        // Apply damage from unsaved wounds
        if (saveResult.unsavedWounds.length > 0) {
          const targetModel = findUnit(currentState, targetUnitId)?.models.find(m => m.id === modelId);
          if (targetModel && !targetModel.isDestroyed) {
            const damageResult = resolveDamage(
              saveResult.unsavedWounds,
              modelId,
              targetModel.currentWounds,
            );

            // Apply damage to the model
            currentState = updateUnitInGameState(currentState, targetUnitId, (unit) =>
              updateModelInUnit(unit, modelId, (model) => ({
                ...model,
                currentWounds: damageResult.finalWounds,
                isDestroyed: damageResult.destroyed,
              })),
            );

            // Emit damage applied event
            const damageEvent: DamageAppliedEvent = {
              type: 'damageApplied',
              modelId,
              unitId: targetUnitId,
              woundsLost: damageResult.totalDamageApplied,
              remainingWounds: damageResult.finalWounds,
              destroyed: damageResult.destroyed,
              damageSource: `Shooting from ${groupToResolve.weaponName}`,
            };
            allEvents.push(damageEvent);

            // Track casualties
            if (damageResult.destroyed) {
              accumulatedCasualties.push(modelId);
            }
          }
        }
      }
    }

    // Mark fire group as resolved
    groupToResolve.resolved = true;
    allFireGroups[fgIdx] = groupToResolve;

    // Emit fire group resolved event
    const successWounds = groupToResolve.wounds.filter(w => w.isWound).length;
    const fgResolvedEvent: FireGroupResolvedEvent = {
      type: 'fireGroupResolved',
      fireGroupIndex: groupToResolve.index,
      weaponName: groupToResolve.weaponName,
      totalHits: groupSuccessfulHits.length,
      totalWounds: successWounds,
      totalPenetrating: penetratingCount,
      totalGlancing: glancingCount,
    };
    allEvents.push(fgResolvedEvent);
  }

  // ---- Step 10: Check Return Fire trigger ----
  const returnFireCheck = checkReturnFireTrigger(currentState, targetUnitId, attackerUnitId);
  let returnFireResolved = false;

  if (returnFireCheck.canReturnFire) {
    allEvents.push(...returnFireCheck.events);

    // Set awaiting reaction for Return Fire
    currentState = setAwaitingReaction(currentState, true, {
      reactionType: CoreReaction.ReturnFire,
      isAdvancedReaction: false,
      eligibleUnitIds: returnFireCheck.eligibleUnitIds,
      triggerDescription: `Unit "${targetUnitId}" may Return Fire at "${attackerUnitId}"`,
      triggerSourceUnitId: attackerUnitId,
    });

    // Mark Return Fire as not yet resolved -- it will be resolved when the reactive player responds
    returnFireResolved = false;
  } else {
    returnFireResolved = true;
  }

  // ---- Step 11: Remove casualties and resolve vehicle damage ----
  const casualtyResult = removeCasualties(currentState, accumulatedCasualties, unitSizesAtStart);
  currentState = casualtyResult.state;
  allEvents.push(...casualtyResult.events);

  // Resolve vehicle damage table for accumulated glancing hits
  if (accumulatedGlancingHits.length > 0) {
    // Build existing statuses map for the vehicles
    const existingStatuses = new Map<string, import('@hh/types').TacticalStatus[]>();
    for (const gh of accumulatedGlancingHits) {
      if (!existingStatuses.has(gh.vehicleModelId)) {
        const vehicleUnit = findUnit(currentState, gh.vehicleUnitId);
        if (vehicleUnit) {
          existingStatuses.set(gh.vehicleModelId, [...vehicleUnit.statuses]);
        }
      }
    }

    const vdResult = resolveVehicleDamageTable(accumulatedGlancingHits, existingStatuses, dice);
    allEvents.push(...vdResult.events);

    // Apply vehicle damage statuses
    for (const statusEntry of vdResult.statusesToApply) {
      currentState = updateUnitInGameState(currentState, statusEntry.vehicleUnitId, (unit) => {
        if (!unit.statuses.includes(statusEntry.status)) {
          return { ...unit, statuses: [...unit.statuses, statusEntry.status] };
        }
        return unit;
      });
    }

    // Apply hull point losses from duplicate statuses
    for (const hpEntry of vdResult.hullPointsToRemove) {
      currentState = updateUnitInGameState(currentState, hpEntry.vehicleUnitId, (unit) =>
        updateModelInUnit(unit, hpEntry.vehicleModelId, (model) =>
          applyWoundsToModel(model, hpEntry.hullPointsLost),
        ),
      );
    }
  }

  // Collect pending morale checks
  const allPendingMoraleChecks: PendingMoraleCheck[] = [...casualtyResult.pendingMoraleChecks];

  // Collect weapon-based morale checks from fire group special rules
  // (Pinning, Suppressive, Stun, Panic rules on weapons that caused wounds)
  for (const fg of allFireGroups) {
    if (!fg.resolved) continue;
    const woundsInflicted = fg.wounds.filter(w => w.isWound).length + fg.penetratingHits.length;
    if (woundsInflicted === 0) continue;

    // Check for Pinning special rule
    const pinningValue = getSpecialRuleValue(fg.specialRules, 'Pinning');
    if (pinningValue !== null) {
      allPendingMoraleChecks.push({
        unitId: targetUnitId,
        checkType: 'pinning',
        modifier: pinningValue,
        source: `Pinning (${pinningValue}) from ${fg.weaponName}`,
      });
    }

    // Check for Suppressive special rule
    const suppressiveValue = getSpecialRuleValue(fg.specialRules, 'Suppressive');
    if (suppressiveValue !== null) {
      allPendingMoraleChecks.push({
        unitId: targetUnitId,
        checkType: 'suppressive',
        modifier: suppressiveValue,
        source: `Suppressive (${suppressiveValue}) from ${fg.weaponName}`,
      });
    }

    // Check for Stun special rule
    const stunValue = getSpecialRuleValue(fg.specialRules, 'Stun');
    if (stunValue !== null) {
      allPendingMoraleChecks.push({
        unitId: targetUnitId,
        checkType: 'stun',
        modifier: stunValue,
        source: `Stun (${stunValue}) from ${fg.weaponName}`,
      });
    }

    // Check for Panic special rule (weapon-caused panic, separate from 25% threshold)
    const panicValue = getSpecialRuleValue(fg.specialRules, 'Panic');
    if (panicValue !== null) {
      allPendingMoraleChecks.push({
        unitId: targetUnitId,
        checkType: 'panicRule',
        modifier: panicValue,
        source: `Panic (${panicValue}) from ${fg.weaponName}`,
      });
    }
  }

  // Store the shooting attack state on the game state
  // Convert internal types to external types for the GameState
  const shootingAttackState: ExternalShootingAttackState = {
    attackerUnitId,
    targetUnitId,
    attackerPlayerIndex,
    targetFacing: targetIsVehicle ? VehicleFacing.Front : null,
    weaponAssignments: weaponAssignments.map(wa => ({
      modelId: wa.modelId,
      weaponId: wa.weaponId,
      profileName: wa.profileName,
    })),
    fireGroups: allFireGroups.map(toExternalFireGroup),
    currentFireGroupIndex: allFireGroups.length - 1,
    currentStep: returnFireResolved ? 'REMOVING_CASUALTIES' : 'AWAITING_RETURN_FIRE',
    accumulatedGlancingHits: accumulatedGlancingHits.map(toExternalGlancingHit),
    accumulatedCasualties: [...accumulatedCasualties],
    unitSizesAtStart,
    pendingMoraleChecks: allPendingMoraleChecks.map(toExternalMoraleCheck),
    returnFireResolved,
    isReturnFire: false,
    modelsWithLOS,
  };

  currentState = setShootingAttackState(currentState, shootingAttackState);

  // If no Return Fire is pending, mark the attack as complete and store morale checks
  if (returnFireResolved) {
    const completedAttackState: ExternalShootingAttackState = {
      ...shootingAttackState,
      currentStep: 'COMPLETE',
    };
    currentState = setShootingAttackState(currentState, completedAttackState);
  }

  return {
    state: currentState,
    events: allEvents,
    errors: [],
    accepted: true,
  };
}

// ---- handleShootingMorale ---------------------------------------------------

/**
 * Process the Shooting Phase Morale sub-phase.
 * Resolves all pending morale checks from the shooting attack.
 *
 * @param state - Current game state
 * @param pendingChecks - Pending morale checks from the attack
 * @param unitSizesAtStart - Unit sizes at the start of the attack
 * @param casualtiesPerUnit - Map of unitId -> casualties suffered
 * @param dice - Dice provider for rolling
 * @returns CommandResult with updated state
 */
export function handleShootingMorale(
  state: GameState,
  pendingChecks: PendingMoraleCheck[],
  unitSizesAtStart: Record<string, number>,
  casualtiesPerUnit: Map<string, number>,
  dice: DiceProvider,
): CommandResult {
  const moraleResult = resolveMorale(state, pendingChecks, unitSizesAtStart, casualtiesPerUnit, dice);

  // Clear the shooting attack state since the attack is now fully resolved
  const finalState = clearShootingAttackState(moraleResult.state);

  return {
    state: finalState,
    events: moraleResult.events,
    errors: [],
    accepted: true,
  };
}
