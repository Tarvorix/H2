/**
 * Assault AI
 *
 * Generates assault commands for the AI during the Assault phase.
 * Handles charge declarations, challenges, gambit selection, fights, and aftermath.
 */

import type { GameState, GameCommand } from '@hh/types';
import { SubPhase } from '@hh/types';
import { getAliveModels, getEligibleAcceptors, getEligibleChallengers } from '@hh/engine';
import type { AITurnContext, StrategyMode } from '../types';
import { getChargeableUnits, getValidChargeTargets } from '../helpers/unit-queries';

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate the next assault command for the AI.
 *
 * @returns A GameCommand or null if no more assault actions are needed
 */
export function generateAssaultCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  switch (state.currentSubPhase) {
    case SubPhase.Charge:
      return generateChargeCommand(state, playerIndex, context, strategy);
    case SubPhase.Challenge:
      return generateChallengeCommand(state, playerIndex, strategy);
    case SubPhase.Fight:
      return generateFightCommand(state, playerIndex, context);
    case SubPhase.Resolution:
      return generateResolutionCommand(state, playerIndex, context, strategy);
    default:
      return null;
  }
}

function modelBelongsToPlayer(
  state: GameState,
  modelId: string,
  playerIndex: number,
): boolean {
  return state.armies[playerIndex]?.units.some((unit) =>
    unit.models.some((model) => model.id === modelId),
  ) ?? false;
}

// ─── Charge ──────────────────────────────────────────────────────────────────

/**
 * Generate a charge command.
 * Basic: 50% chance to charge a random valid target.
 * Tactical: only charge favorable combats.
 */
function generateChargeCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  const chargeableUnits = getChargeableUnits(state, playerIndex, context.actedUnitIds);
  if (chargeableUnits.length === 0) {
    return null; // No units can charge
  }

  for (const unit of chargeableUnits) {
    const targets = getValidChargeTargets(state, unit.id);
    if (targets.length === 0) {
      context.actedUnitIds.add(unit.id);
      continue;
    }

    // Decide whether to charge
    if (strategy === 'basic') {
      // 50% chance to charge
      if (Math.random() < 0.5) {
        context.actedUnitIds.add(unit.id);
        continue;
      }
    } else {
      // Tactical: only charge if we have a favorable matchup
      const shouldCharge = evaluateChargeWorth(state, unit.id, targets);
      if (!shouldCharge) {
        context.actedUnitIds.add(unit.id);
        continue;
      }
    }

    // Select the target
    const target = selectChargeTarget(targets, strategy);
    context.actedUnitIds.add(unit.id);

    return {
      type: 'declareCharge',
      chargingUnitId: unit.id,
      targetUnitId: target.id,
    };
  }

  return null;
}

/**
 * Select a charge target.
 * Basic: random target
 * Tactical: weakest target (fewest alive models)
 */
function selectChargeTarget(
  targets: import('@hh/types').UnitState[],
  strategy: StrategyMode,
): { id: string } {
  if (strategy === 'basic' || targets.length === 1) {
    const idx = Math.floor(Math.random() * targets.length);
    return { id: targets[idx].id };
  }

  // Tactical: prefer targets with fewer models
  let best = targets[0];
  let bestCount = getAliveModels(targets[0]).length;

  for (let i = 1; i < targets.length; i++) {
    const count = getAliveModels(targets[i]).length;
    if (count < bestCount) {
      bestCount = count;
      best = targets[i];
    }
  }

  return { id: best.id };
}

/**
 * Evaluate whether a charge is worth attempting.
 * Returns true if any target presents a favorable matchup.
 */
function evaluateChargeWorth(
  state: GameState,
  chargerUnitId: string,
  targets: import('@hh/types').UnitState[],
): boolean {
  // Find the charger
  const charger =
    state.armies[0].units.find((u) => u.id === chargerUnitId) ??
    state.armies[1].units.find((u) => u.id === chargerUnitId);
  if (!charger) return false;

  const chargerModels = getAliveModels(charger).length;

  // Charge if we outnumber at least one target
  for (const target of targets) {
    const targetModels = getAliveModels(target).length;
    if (chargerModels >= targetModels) return true;
  }

  // Also charge if we have 5+ models (decent chance of winning)
  return chargerModels >= 5;
}

// ─── Challenge ───────────────────────────────────────────────────────────────

/**
 * Generate a challenge-related command.
 * Handles declaring challenges, accepting/declining, and gambit selection.
 */
function generateChallengeCommand(
  state: GameState,
  playerIndex: number,
  strategy: StrategyMode,
): GameCommand | null {
  if (
    state.pendingHeroicInterventionState &&
    state.pendingHeroicInterventionState.reactingPlayerIndex === playerIndex &&
    state.activeCombats
  ) {
    const combat = state.activeCombats.find(
      (candidate) => candidate.combatId === state.pendingHeroicInterventionState?.combatId,
    );
    if (combat) {
      const challengerUnitId = state.pendingHeroicInterventionState.reactingUnitId;
      const challengerId = getEligibleChallengers(state, challengerUnitId).eligibleChallengerIds[0];
      const targetModelId = combat.activePlayerUnitIds.flatMap((unitId) => getEligibleAcceptors(state, unitId))[0];
      if (challengerId && targetModelId) {
        return {
          type: 'declareChallenge',
          challengerModelId: challengerId,
          targetModelId,
        };
      }
    }
    return null;
  }

  // If there are active combats with a challenge state, respond
  if (state.activeCombats) {
    for (const combat of state.activeCombats) {
      if (combat.challengeState) {
        const cs = combat.challengeState;

        if (cs.currentStep === 'DECLARE' && modelBelongsToPlayer(state, cs.challengedId, playerIndex)) {
          return { type: 'acceptChallenge', challengedModelId: cs.challengedId };
        }

        // If waiting for gambit selection (FACE_OFF step)
        if (cs.currentStep === 'FACE_OFF') {
          // Need to select gambit for the model that hasn't picked one yet
          const needsGambit =
            cs.challengerGambit === null ? cs.challengerId :
            cs.challengedGambit === null ? cs.challengedId :
            null;

          if (needsGambit) {
            const gambitOptions = ['SeizeTheInitiative', 'PressTheAttack', 'Guard'];

            if (strategy === 'basic') {
              const idx = Math.floor(Math.random() * gambitOptions.length);
              return { type: 'selectGambit', modelId: needsGambit, gambit: gambitOptions[idx] };
            }

            // Tactical: PressTheAttack if we're strong, Guard if we're weak
            return { type: 'selectGambit', modelId: needsGambit, gambit: 'PressTheAttack' };
          }
        }
      }
    }
  }

  if (playerIndex !== state.activePlayerIndex || !state.activeCombats) {
    return null;
  }

  const processedCombatIds = new Set(state.processedChallengeCombatIds ?? []);
  for (const combat of state.activeCombats) {
    if (combat.challengeState || processedCombatIds.has(combat.combatId)) {
      continue;
    }

    const challengerModelId = combat.activePlayerUnitIds
      .flatMap((unitId) => getEligibleChallengers(state, unitId).eligibleChallengerIds)[0];
    const targetModelId = combat.reactivePlayerUnitIds
      .flatMap((unitId) => getEligibleAcceptors(state, unitId))[0];
    if (!challengerModelId || !targetModelId) {
      continue;
    }

    if (strategy === 'basic' && Math.random() >= 0.4) {
      return { type: 'passChallenge', combatId: combat.combatId };
    }

    return { type: 'declareChallenge', challengerModelId, targetModelId };
  }

  // No challenge state — skip
  return null;
}

// ─── Fight ───────────────────────────────────────────────────────────────────

/**
 * Generate a fight resolution command for active combats.
 */
function generateFightCommand(
  state: GameState,
  _playerIndex: number,
  context: AITurnContext,
): GameCommand | null {
  // Check if there are active combats to resolve
  if (state.activeCombats && state.activeCombats.length > 0) {
    for (const combat of state.activeCombats) {
      if (!context.actedUnitIds.has(combat.combatId)) {
        context.actedUnitIds.add(combat.combatId);
        return {
          type: 'resolveFight',
          combatId: combat.combatId,
        };
      }
    }
  }

  return null;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Generate an aftermath command for combat resolution.
 * Basic: random option
 * Tactical: pursue if won, consolidate toward objectives if uncertain
 */
function generateResolutionCommand(
  state: GameState,
  playerIndex: number,
  context: AITurnContext,
  strategy: StrategyMode,
): GameCommand | null {
  // Find units in combat that need an aftermath decision
  const army = state.armies[playerIndex];
  const lockedUnits = army.units.filter((u) => u.isLockedInCombat && !context.actedUnitIds.has(u.id));

  if (lockedUnits.length === 0) return null;

  const unit = lockedUnits[0];
  context.actedUnitIds.add(unit.id);

  const aftermathOptions = ['Pursue', 'Consolidate', 'Disengage', 'Hold'];

  if (strategy === 'basic') {
    // Random option
    const idx = Math.floor(Math.random() * aftermathOptions.length);
    return {
      type: 'selectAftermath',
      unitId: unit.id,
      option: aftermathOptions[idx],
    };
  }

  // Tactical: prefer consolidate (safe option that advances position)
  return {
    type: 'selectAftermath',
    unitId: unit.id,
    option: 'Consolidate',
  };
}
