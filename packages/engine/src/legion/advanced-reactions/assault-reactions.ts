/**
 * Assault-Phase Advanced Reaction Handlers
 *
 * Implements the 8 assault-triggered advanced reactions:
 *
 * 1. Dark Angels — "Vengeance of the First Legion" (da-vengeance)
 *    Trigger: afterLastInitiativeStep
 *    Effect: Flag combat for a second round, grant Shred(6+) on Sword weapons.
 *
 * 2. Emperor's Children — "Perfect Counter" (ec-perfect-counter)
 *    Trigger: duringChargeStep step 3
 *    Effect: Counter-charge roll (2d6 discard lowest). If successful,
 *    move toward charger, lock in combat, swap charge bonuses.
 *
 * 3. Night Lords — "Better Part of Valour" (nl-better-part)
 *    Trigger: duringChargeStep step 4
 *    Effect: Fall Back 2d6" directly away from charger WITHOUT Routed status.
 *
 * 4. Iron Hands — "Spite of the Gorgon" (ih-spite-of-gorgon)
 *    Trigger: duringChargeStep step 3
 *    Effect: Shooting attack at full BS with +1 FP and Overload(1).
 *    Prevents volley attacks.
 *
 * 5. Sons of Horus — "Warrior Pride" (soh-warrior-pride)
 *    Trigger: onChallengeDeclaration
 *    Effect: If challenger WS < reacting unit majority WS,
 *    decline challenge without Disgraced penalty.
 *
 * 6. Salamanders — "Selfless Burden" (sal-selfless-burden)
 *    Trigger: duringChargeStep step 3
 *    Effect: +1 WS, +1 S, +1 A modifiers. Roll d6 per model; on 1 take a wound.
 *
 * 7. Emperor's Children Hereticus — "Twisted Desire" (ec-h-twisted-desire)
 *    Trigger: duringChargeStep step 2 (Traitor only)
 *    Effect: Apply Stupefied status, grant FNP 5+.
 *
 * 8. World Eaters Hereticus — "Furious Charge" (we-h-furious-charge)
 *    Trigger: afterVolleyAttacks (Traitor only)
 *    Effect: Apply LostToTheNails, counter-charge roll (2d6 discard lowest).
 *    If successful, move toward charger, lock in combat, gain charge bonuses.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections, "Advanced Reaction" subsections
 */

import type { Position, ModelState, SpecialRuleRef } from '@hh/types';
import { TacticalStatus, Phase } from '@hh/types';
import type { DiceProvider, GameEvent } from '../../types';
import type { AdvancedReactionContext, AdvancedReactionResult } from '../advanced-reaction-registry';
import { registerAdvancedReaction } from '../advanced-reaction-registry';
import { findUnit, getAliveModels, getDistanceBetween, getClosestModelDistance, getMajorityWS } from '../../game-queries';
import { updateUnitInGameState, updateModelInUnit, moveModel, applyWoundsToModel, addStatus, lockUnitsInCombat } from '../../state-helpers';
import { executeOutOfPhaseShootingAttack } from '../../shooting/out-of-phase-shooting';

// ─── Geometry Helpers ────────────────────────────────────────────────────────

/**
 * Move a position toward a target position by at most maxDistance inches.
 * If the target is closer than maxDistance, move to the target position.
 * If distance is zero (positions overlap), return the original position.
 */
function moveToward(from: Position, to: Position, maxDistance: number): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return from;
  if (dist <= maxDistance) return { x: to.x, y: to.y };
  const ratio = maxDistance / dist;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

/**
 * Move a position directly away from a reference position by maxDistance inches.
 * If distance is zero (positions overlap), move along the positive x-axis.
 */
function moveAway(from: Position, awayFrom: Position, maxDistance: number): Position {
  const dx = from.x - awayFrom.x;
  const dy = from.y - awayFrom.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0) return { x: from.x + maxDistance, y: from.y };
  const ratio = maxDistance / dist;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}

/**
 * Find the nearest alive model in a collection to a given position.
 * Returns undefined if the collection is empty.
 */
function findNearestModel(position: Position, models: ModelState[]): ModelState | undefined {
  let nearest: ModelState | undefined;
  let minDist = Infinity;
  for (const m of models) {
    const dist = getDistanceBetween(position, m.position);
    if (dist < minDist) {
      minDist = dist;
      nearest = m;
    }
  }
  return nearest;
}

function increaseOverloadRule(specialRules: SpecialRuleRef[]): SpecialRuleRef[] {
  let foundOverload = false;
  const updated = specialRules.map((rule) => {
    if (rule.name.toLowerCase() !== 'overload') {
      return rule;
    }

    foundOverload = true;
    const currentValue = Number.parseInt(rule.value ?? '0', 10);
    return {
      ...rule,
      value: String(Number.isFinite(currentValue) ? currentValue + 1 : 1),
    };
  });

  if (foundOverload) {
    return updated;
  }

  return [...updated, { name: 'Overload', value: '1' }];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DARK ANGELS (I) — Vengeance of the First Legion
//
// Trigger: afterLastInitiativeStep
//
// After the last Initiative step in a combat, the reacting unit forces a
// second round of combat. All models gain a VengeanceActive modifier and
// Shred(6+) on Sword weapons via a ShredBonus modifier.
//
// Implementation:
// - Retrieve the reacting unit from state.
// - For each alive model, add two modifiers:
//   1. VengeanceActive (set to 1) — flags the combat for a second round.
//   2. ShredBonus (set to 6) — grants Shred(6+) on Sword weapons.
// - Both modifiers expire at end of Assault phase.
// - Return success with the updated state.
// ═══════════════════════════════════════════════════════════════════════════════

function handleVengeanceOfTheFirstLegion(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Apply VengeanceActive and ShredBonus modifiers to each alive model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'VengeanceActive',
            operation: 'set' as const,
            value: 1,
            source: 'Vengeance of the First',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
          {
            characteristic: 'ShredBonus',
            operation: 'set' as const,
            value: 6,
            source: 'Vengeance of the First',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
        ],
      })),
    );
  }

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EMPEROR'S CHILDREN (III) — Perfect Counter
//
// Trigger: duringChargeStep step 3
//
// Make a counter-charge roll (2d6, discard lowest). If the result >= closest
// model distance between the reacting unit and the charging unit:
// - Move each model in the reacting unit toward the nearest charger model
//   (up to the charge roll distance).
// - Lock units in combat.
// - The charger LOSES charge bonuses (NoChargeBonuses modifier).
// - The reactor GAINS charge bonuses (HasChargeBonuses modifier).
// - Emit chargeSucceeded and chargeMove events.
//
// If the charge roll fails:
// - Emit chargeFailed event.
// - Return success: true (reaction was declared, effect just failed).
// ═══════════════════════════════════════════════════════════════════════════════

function handlePerfectCounter(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const chargerUnit = findUnit(state, triggerSourceUnitId);
  if (!chargerUnit) {
    return { state, events: [], success: false };
  }

  const reactorAlive = getAliveModels(reactingUnit);
  const chargerAlive = getAliveModels(chargerUnit);
  if (reactorAlive.length === 0 || chargerAlive.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Roll 2d6, discard lowest
  const [die1, die2] = dice.roll2D6();
  const chargeRoll = Math.max(die1, die2);

  // Calculate closest distance between reacting and charging units
  const closestDistance = getClosestModelDistance(state, reactingUnitId, triggerSourceUnitId);

  // Check if counter-charge succeeds
  if (chargeRoll >= closestDistance) {
    // Counter-charge succeeds: move each reactor model toward nearest charger model
    for (const model of reactorAlive) {
      const nearestCharger = findNearestModel(model.position, chargerAlive);
      if (!nearestCharger) continue;

      const fromPosition: Position = { x: model.position.x, y: model.position.y };
      const newPosition = moveToward(fromPosition, nearestCharger.position, chargeRoll);

      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => moveModel(m, newPosition)),
      );

      // Emit chargeMove event for each model moved
      events.push({
        type: 'chargeMove',
        chargingUnitId: reactingUnitId,
        targetUnitId: triggerSourceUnitId,
        modelId: model.id,
        from: fromPosition,
        to: newPosition,
      });
    }

    // Lock units in combat
    currentState = lockUnitsInCombat(currentState, reactingUnitId, triggerSourceUnitId);

    // Charger LOSES charge bonuses
    const currentChargerUnit = findUnit(currentState, triggerSourceUnitId);
    if (currentChargerUnit) {
      const currentChargerAlive = getAliveModels(currentChargerUnit);
      for (const model of currentChargerAlive) {
        currentState = updateUnitInGameState(currentState, triggerSourceUnitId, unit =>
          updateModelInUnit(unit, model.id, m => ({
            ...m,
            modifiers: [
              ...m.modifiers,
              {
                characteristic: 'NoChargeBonuses',
                operation: 'set' as const,
                value: 1,
                source: 'Perfect Counter',
                expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
              },
            ],
          })),
        );
      }
    }

    // Reactor GAINS charge bonuses
    const updatedReactorUnit = findUnit(currentState, reactingUnitId);
    if (updatedReactorUnit) {
      const updatedReactorAlive = getAliveModels(updatedReactorUnit);
      for (const model of updatedReactorAlive) {
        currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
          updateModelInUnit(unit, model.id, m => ({
            ...m,
            modifiers: [
              ...m.modifiers,
              {
                characteristic: 'HasChargeBonuses',
                operation: 'set' as const,
                value: 1,
                source: 'Perfect Counter',
                expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
              },
            ],
          })),
        );
      }
    }

    // Emit chargeSucceeded event
    events.push({
      type: 'chargeSucceeded',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });

    return {
      state: currentState,
      events,
      success: true,
    };
  } else {
    // Counter-charge failed
    events.push({
      type: 'chargeFailed',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });

    return {
      state: currentState,
      events,
      success: true, // Reaction was declared, effect just failed
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NIGHT LORDS (VIII) — Better Part of Valour
//
// Trigger: duringChargeStep step 4
//
// The reacting unit makes a Fall Back move of 2d6 inches directly away from
// the nearest model in the charging unit. The key benefit is that the Routed
// status is NOT applied — this is a tactical withdrawal, not a rout.
//
// Implementation:
// - Roll 2d6 for fall back distance (sum of both dice).
// - For each alive model in the reacting unit, find the nearest charger model
//   and move directly away by the fall back distance.
// - Do NOT apply the Routed status.
// - Emit assaultFallBack events for each model moved.
// ═══════════════════════════════════════════════════════════════════════════════

function handleBetterPartOfValour(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const chargerUnit = findUnit(state, triggerSourceUnitId);
  if (!chargerUnit) {
    return { state, events: [], success: false };
  }

  const reactorAlive = getAliveModels(reactingUnit);
  const chargerAlive = getAliveModels(chargerUnit);
  if (reactorAlive.length === 0 || chargerAlive.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Roll 2d6 for fall back distance (sum of both dice)
  const [die1, die2] = dice.roll2D6();
  const fallBackDistance = die1 + die2;

  const modelMoves: { modelId: string; from: Position; to: Position }[] = [];

  // Move each alive model directly away from the nearest charger model
  for (const model of reactorAlive) {
    const nearestCharger = findNearestModel(model.position, chargerAlive);
    if (!nearestCharger) continue;

    const fromPosition: Position = { x: model.position.x, y: model.position.y };
    const newPosition = moveAway(fromPosition, nearestCharger.position, fallBackDistance);

    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => moveModel(m, newPosition)),
    );

    modelMoves.push({
      modelId: model.id,
      from: fromPosition,
      to: newPosition,
    });
  }

  // Emit assaultFallBack event for the entire unit's fall back
  events.push({
    type: 'assaultFallBack',
    unitId: reactingUnitId,
    distance: fallBackDistance,
    modelMoves,
  });

  // Key: Do NOT apply Routed status — this is the benefit of the reaction

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. IRON HANDS (X) — Spite of the Gorgon
//
// Trigger: duringChargeStep step 3
//
// The reacting unit makes a shooting attack at full BS (not snap shots)
// with +1 Firepower and Overload(1).
//
// Implementation:
// - For each alive model in the reacting unit: roll 2 shots (1 base + 1 FP bonus).
// - Each shot hits on 4+ (BS4 standard).
// - Each hit: roll to wound on 4+ (S4 vs T4).
// - Each wound: apply 1 damage to a random alive model in the charging unit.
// - Add NoVolleyAttacks modifier to prevent volley attacks from the reacting unit.
// - Emit fireGroupResolved event with totals.
// ═══════════════════════════════════════════════════════════════════════════════

function handleSpiteOfTheGorgon(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const chargerUnit = findUnit(state, triggerSourceUnitId);
  if (!chargerUnit) {
    return { state, events: [], success: false };
  }

  if (getAliveModels(reactingUnit).length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const attack = executeOutOfPhaseShootingAttack(state, reactingUnitId, triggerSourceUnitId, dice, {
    forceNoSnapShots: true,
    suppressMoraleAndStatusChecks: true,
    weaponProfileModifier: (weaponProfile) => ({
      ...weaponProfile,
      firepower: weaponProfile.firepower + 1,
      specialRules: increaseOverloadRule(weaponProfile.specialRules),
    }),
  });
  const events: GameEvent[] = [...attack.events];

  if (attack.accepted) {
    currentState = attack.state;
  }

  // Add NoVolleyAttacks modifier to prevent volley attacks from the reacting unit
  const updatedReactorUnit = findUnit(currentState, reactingUnitId);
  if (updatedReactorUnit) {
    const updatedReactorAlive = getAliveModels(updatedReactorUnit);
    for (const model of updatedReactorAlive) {
      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => ({
          ...m,
          modifiers: [
            ...m.modifiers,
            {
              characteristic: 'NoVolleyAttacks',
              operation: 'set' as const,
              value: 1,
              source: 'Spite of the Gorgon',
              expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
            },
          ],
        })),
      );
    }
  }

  return {
    state: currentState,
    events,
    success: attack.accepted,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SONS OF HORUS (XVI) — Warrior Pride
//
// Trigger: onChallengeDeclaration
//
// Compare the challenger's WS with the majority WS of the reacting unit.
// If the challenger's WS is LOWER than the reacting unit's majority WS,
// the challenge is declined WITHOUT the Disgraced penalty.
//
// Implementation:
// - Default challenger WS = 4 (standard Marine).
// - Get majority WS of the reacting unit using getMajorityWS.
// - If challenger WS < majority WS:
//   - Add NobleDeclination modifier to reacting unit models.
//   - Return success: true.
// - If challenger WS >= majority WS:
//   - Return success: false (condition not met, cannot use this reaction).
// ═══════════════════════════════════════════════════════════════════════════════

function handleWarriorPride(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) {
    return { state, events: [], success: false };
  }

  // Default challenger WS = 4 (standard Marine WS)
  const challengerWS = 4;

  // Get majority WS of the reacting unit
  const reactingMajorityWS = getMajorityWS(reactingUnit);

  // Check condition: challenger WS must be LOWER than reacting unit's majority WS
  if (challengerWS >= reactingMajorityWS) {
    // Condition not met — cannot use this reaction
    return { state, events: [], success: false };
  }

  // Condition met: decline the challenge without Disgraced penalty
  let currentState = state;
  const events: GameEvent[] = [];

  // Add NobleDeclination modifier to each alive model in the reacting unit
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'NobleDeclination',
            operation: 'set' as const,
            value: 1,
            source: 'Warrior Pride',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
        ],
      })),
    );
  }

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SALAMANDERS (XVIII) — Selfless Burden
//
// Trigger: duringChargeStep step 3
//
// Grant +1 WS, +1 Strength, +1 Attacks to each alive model in the reacting
// unit. Mark for delayed self-damage with SelflessBurdenPending. Then roll
// d6 for each model: on a 1, apply 1 wound immediately.
//
// Implementation:
// - For each alive model, add four modifiers:
//   1. WS +1
//   2. S +1
//   3. A +1
//   4. SelflessBurdenPending (set to 1)
// - Roll d6 for each model; on a 1, apply 1 wound.
// - All modifiers expire at end of Assault phase.
// ═══════════════════════════════════════════════════════════════════════════════

function handleSelflessBurden(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Add +1 WS, +1 S, +1 A, and SelflessBurdenPending modifiers to each alive model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'WS',
            operation: 'add' as const,
            value: 1,
            source: 'Selfless Burden',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
          {
            characteristic: 'S',
            operation: 'add' as const,
            value: 1,
            source: 'Selfless Burden',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
          {
            characteristic: 'A',
            operation: 'add' as const,
            value: 1,
            source: 'Selfless Burden',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
          {
            characteristic: 'SelflessBurdenPending',
            operation: 'set' as const,
            value: 1,
            source: 'Selfless Burden',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
        ],
      })),
    );
  }

  // Roll d6 for each model: on a 1, apply 1 wound immediately
  for (const model of aliveModels) {
    const selfDamageRoll = dice.rollD6();
    if (selfDamageRoll === 1) {
      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => applyWoundsToModel(m, 1)),
      );

      // Emit damage event for self-inflicted wound
      const updatedUnit = findUnit(currentState, reactingUnitId);
      const updatedModel = updatedUnit?.models.find(m => m.id === model.id);

      events.push({
        type: 'damageApplied',
        modelId: model.id,
        unitId: reactingUnitId,
        woundsLost: 1,
        remainingWounds: updatedModel?.currentWounds ?? 0,
        destroyed: updatedModel?.isDestroyed ?? true,
        damageSource: 'Selfless Burden',
      });

      if (updatedModel?.isDestroyed) {
        events.push({
          type: 'casualtyRemoved',
          modelId: model.id,
          unitId: reactingUnitId,
        });
      }
    }
  }

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. EMPEROR'S CHILDREN HERETICUS — Twisted Desire
//
// Trigger: duringChargeStep step 2 (Traitor allegiance only)
//
// Apply the Stupefied status to the reacting unit. Grant FNP 5+ modifier
// to each alive model. Stupefied removes all other Tactical Statuses,
// prevents new ones, and forces Snap Shots — but grants resilience.
//
// Implementation:
// - Apply Stupefied status to the reacting unit using addStatus.
// - Add FNP 5+ modifier to each alive model.
// - Emit statusApplied event for Stupefied.
// ═══════════════════════════════════════════════════════════════════════════════

function handleTwistedDesire(
  context: AdvancedReactionContext,
  _dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const aliveModels = getAliveModels(reactingUnit);
  if (aliveModels.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Apply Stupefied status to the reacting unit
  currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
    addStatus(unit, TacticalStatus.Stupefied),
  );

  // Add FNP 5+ modifier to each alive model
  for (const model of aliveModels) {
    currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
      updateModelInUnit(unit, model.id, m => ({
        ...m,
        modifiers: [
          ...m.modifiers,
          {
            characteristic: 'FNP',
            operation: 'set' as const,
            value: 5,
            source: 'Twisted Desire',
            expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
          },
        ],
      })),
    );
  }

  // Emit statusApplied event for Stupefied
  events.push({
    type: 'statusApplied',
    unitId: reactingUnitId,
    status: TacticalStatus.Stupefied,
  });

  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. WORLD EATERS HERETICUS — Furious Charge
//
// Trigger: afterVolleyAttacks (Traitor allegiance only)
//
// Apply the LostToTheNails status. Then make a counter-charge roll
// (2d6, discard lowest). If the roll >= closest model distance:
// - Move each model toward the nearest charger model.
// - Lock units in combat.
// - Add HasChargeBonuses modifier to reactor models.
// - Emit chargeSucceeded and chargeMove events.
// If the charge roll fails:
// - Emit chargeFailed event.
// Return success either way (reaction was declared).
// ═══════════════════════════════════════════════════════════════════════════════

function handleFuriousCharge(
  context: AdvancedReactionContext,
  dice: DiceProvider,
): AdvancedReactionResult {
  const { state, reactingUnitId, triggerSourceUnitId } = context;

  const reactingUnit = findUnit(state, reactingUnitId);
  if (!reactingUnit) {
    return { state, events: [], success: false };
  }

  const chargerUnit = findUnit(state, triggerSourceUnitId);
  if (!chargerUnit) {
    return { state, events: [], success: false };
  }

  const reactorAlive = getAliveModels(reactingUnit);
  const chargerAlive = getAliveModels(chargerUnit);
  if (reactorAlive.length === 0 || chargerAlive.length === 0) {
    return { state, events: [], success: false };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  // Apply LostToTheNails status to the reacting unit
  currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
    addStatus(unit, TacticalStatus.LostToTheNails),
  );

  // Emit statusApplied event for LostToTheNails
  events.push({
    type: 'statusApplied',
    unitId: reactingUnitId,
    status: TacticalStatus.LostToTheNails,
  });

  // Roll 2d6, discard lowest
  const [die1, die2] = dice.roll2D6();
  const chargeRoll = Math.max(die1, die2);

  // Calculate closest distance between reacting and charging units
  const closestDistance = getClosestModelDistance(currentState, reactingUnitId, triggerSourceUnitId);

  // Check if counter-charge succeeds
  if (chargeRoll >= closestDistance) {
    // Counter-charge succeeds: move each reactor model toward nearest charger model
    for (const model of reactorAlive) {
      const nearestCharger = findNearestModel(model.position, chargerAlive);
      if (!nearestCharger) continue;

      const fromPosition: Position = { x: model.position.x, y: model.position.y };
      const newPosition = moveToward(fromPosition, nearestCharger.position, chargeRoll);

      currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
        updateModelInUnit(unit, model.id, m => moveModel(m, newPosition)),
      );

      // Emit chargeMove event
      events.push({
        type: 'chargeMove',
        chargingUnitId: reactingUnitId,
        targetUnitId: triggerSourceUnitId,
        modelId: model.id,
        from: fromPosition,
        to: newPosition,
      });
    }

    // Lock units in combat
    currentState = lockUnitsInCombat(currentState, reactingUnitId, triggerSourceUnitId);

    // Add HasChargeBonuses modifier to reactor models
    const updatedReactorUnit = findUnit(currentState, reactingUnitId);
    if (updatedReactorUnit) {
      const updatedReactorAlive = getAliveModels(updatedReactorUnit);
      for (const model of updatedReactorAlive) {
        currentState = updateUnitInGameState(currentState, reactingUnitId, unit =>
          updateModelInUnit(unit, model.id, m => ({
            ...m,
            modifiers: [
              ...m.modifiers,
              {
                characteristic: 'HasChargeBonuses',
                operation: 'set' as const,
                value: 1,
                source: 'Furious Charge',
                expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
              },
            ],
          })),
        );
      }
    }

    // Emit chargeSucceeded event
    events.push({
      type: 'chargeSucceeded',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });
  } else {
    // Counter-charge failed
    events.push({
      type: 'chargeFailed',
      chargingUnitId: reactingUnitId,
      targetUnitId: triggerSourceUnitId,
      chargeRoll,
      distanceNeeded: closestDistance,
    });
  }

  // Return success either way — the reaction was declared
  return {
    state: currentState,
    events,
    success: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all assault-phase advanced reaction handlers.
 *
 * Called once during engine initialization via registerAllAdvancedReactions().
 */
export function registerAssaultReactions(): void {
  // Dark Angels — Vengeance of the First Legion
  registerAdvancedReaction('da-vengeance', handleVengeanceOfTheFirstLegion);

  // Emperor's Children — Perfect Counter
  registerAdvancedReaction('ec-perfect-counter', handlePerfectCounter);

  // Night Lords — Better Part of Valour
  registerAdvancedReaction('nl-better-part', handleBetterPartOfValour);

  // Iron Hands — Spite of the Gorgon
  registerAdvancedReaction('ih-spite-of-gorgon', handleSpiteOfTheGorgon);

  // Sons of Horus — Warrior Pride
  registerAdvancedReaction('soh-warrior-pride', handleWarriorPride);

  // Salamanders — Selfless Burden
  registerAdvancedReaction('sal-selfless-burden', handleSelflessBurden);

  // Emperor's Children Hereticus — Twisted Desire
  registerAdvancedReaction('ec-h-twisted-desire', handleTwistedDesire);

  // World Eaters Hereticus — Furious Charge
  registerAdvancedReaction('we-h-furious-charge', handleFuriousCharge);
}
