/**
 * Assault AI
 *
 * Generates assault commands for the AI during the Assault phase.
 * Handles charge declarations, challenges, gambit selection, fights, and aftermath.
 */

import type { GameState, GameCommand } from '@hh/types';
import { SubPhase } from '@hh/types';
import { getAliveModels } from '@hh/engine';
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
  // If there are active combats with a challenge state, respond
  if (state.activeCombats) {
    for (const combat of state.activeCombats) {
      if (combat.challengeState) {
        const cs = combat.challengeState;

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

  // Check if we can declare a challenge
  // For simplicity: in the Challenge sub-phase, if no challenge exists yet,
  // try to declare one or skip
  if (strategy === 'basic') {
    // Basic: 40% chance to declare a challenge, otherwise skip
    if (Math.random() < 0.4 && state.activeCombats && state.activeCombats.length > 0) {
      // Find a combat with units we own that has character models
      const combat = state.activeCombats[0];
      const playerUnits = state.activePlayerIndex === playerIndex
        ? combat.activePlayerUnitIds
        : combat.reactivePlayerUnitIds;
      if (playerUnits.length > 0) {
        // Would need character model IDs — for now just skip
        return null;
      }
    }
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
