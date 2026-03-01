/**
 * Advanced Reaction Registry
 *
 * Parallel to the Legion Tactica Registry, but for advanced reactions.
 * Each legion has one standard advanced reaction and optionally a Hereticus reaction.
 * The registry maps reaction IDs to handler functions.
 *
 * Flow:
 * 1. At specific trigger points (movement, shooting steps, charge steps, etc.),
 *    the command processor calls a trigger check function.
 * 2. If a trigger matches, a PendingReaction is set on GameState with isAdvancedReaction=true.
 * 3. The reactive player selects or declines the reaction.
 * 4. If selected, resolveAdvancedReaction() executes the handler, records usage,
 *    deducts allotment, and marks the unit as having reacted.
 *
 * Reference: HH_Legiones_Astartes.md — all 18 legion sections, "Advanced Reaction" subsections
 */

import type {
  GameState,
  AdvancedReactionDefinition,
  AdvancedReactionUsage,
} from '@hh/types';
import {
  findAdvancedReaction,
  getAdvancedReactionsForLegion as getAdvancedReactionsForLegionData,
} from '@hh/data';
import type { CommandResult, DiceProvider, GameEvent, AdvancedReactionDeclaredEvent, AdvancedReactionResolvedEvent } from '../types';
import {
  findUnit,
  findUnitPlayerIndex,
  getReactivePlayerIndex,
  canUnitReact,
  hasReactionAllotment,
  getClosestModelDistance,
  hasLOSToUnit,
} from '../game-queries';
import {
  setAwaitingReaction,
  updateUnitInGameState,
  updateArmyByIndex,
} from '../state-helpers';

// ─── Handler Types ───────────────────────────────────────────────────────────

/**
 * Context passed to an advanced reaction handler when resolving the reaction.
 */
export interface AdvancedReactionContext {
  /** Current game state */
  state: GameState;
  /** The unique ID of the reaction being resolved */
  reactionId: string;
  /** The unit performing the reaction */
  reactingUnitId: string;
  /** The unit that triggered the reaction (e.g., the moving/shooting/charging unit) */
  triggerSourceUnitId: string;
  /** Player index of the reacting player */
  playerIndex: number;
  /** The reaction's data definition */
  definition: AdvancedReactionDefinition;
}

/**
 * Result returned by an advanced reaction handler.
 */
export interface AdvancedReactionResult {
  /** The updated game state after applying the reaction's effects */
  state: GameState;
  /** Events generated during resolution */
  events: GameEvent[];
  /** Whether the reaction was successfully applied */
  success: boolean;
}

/**
 * An advanced reaction handler function.
 * Takes context and dice, applies the reaction's mechanical effects,
 * and returns the updated state and events.
 */
export type AdvancedReactionHandler = (
  context: AdvancedReactionContext,
  dice: DiceProvider,
) => AdvancedReactionResult;

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Registry mapping reaction IDs to handler functions.
 */
const advancedReactionRegistry = new Map<string, AdvancedReactionHandler>();

/**
 * Register a handler for an advanced reaction.
 */
export function registerAdvancedReaction(
  reactionId: string,
  handler: AdvancedReactionHandler,
): void {
  advancedReactionRegistry.set(reactionId, handler);
}

/**
 * Get the handler for a specific advanced reaction.
 */
export function getAdvancedReactionHandler(
  reactionId: string,
): AdvancedReactionHandler | undefined {
  return advancedReactionRegistry.get(reactionId);
}

/**
 * Check if a handler is registered for a specific advanced reaction.
 */
export function hasAdvancedReactionHandler(reactionId: string): boolean {
  return advancedReactionRegistry.has(reactionId);
}

/**
 * Clear all registered advanced reaction handlers (for testing).
 */
export function clearAdvancedReactionRegistry(): void {
  advancedReactionRegistry.clear();
}

/**
 * Get all registered reaction IDs (for diagnostics/testing).
 */
export function getRegisteredAdvancedReactions(): string[] {
  return Array.from(advancedReactionRegistry.keys());
}

// ─── Availability Check ─────────────────────────────────────────────────────

/**
 * Check if an advanced reaction is available for a player to use.
 * Validates: once-per-battle tracking, reaction allotment, legion match, allegiance.
 *
 * @param state - Current game state
 * @param reactionId - ID of the reaction to check
 * @param playerIndex - Which player wants to use it
 * @returns Whether the reaction is currently available
 */
export function isAdvancedReactionAvailable(
  state: GameState,
  reactionId: string,
  playerIndex: number,
): boolean {
  const definition = findAdvancedReaction(reactionId);
  if (!definition) return false;

  // Check once-per-battle restriction
  if (definition.oncePerBattle) {
    const alreadyUsed = state.advancedReactionsUsed.some(
      (u: AdvancedReactionUsage) => u.reactionId === reactionId && u.playerIndex === playerIndex,
    );
    if (alreadyUsed) return false;
  }

  // Check reaction allotment remaining
  const army = state.armies[playerIndex];
  if (!hasReactionAllotment(army)) return false;

  // Check legion match
  if (army.faction !== definition.legion) return false;

  // Check allegiance restriction (Hereticus reactions require Traitor)
  if (definition.requiredAllegiance !== undefined && army.allegiance !== definition.requiredAllegiance) {
    return false;
  }

  return true;
}

/**
 * Check if an advanced reaction has already been used this battle.
 *
 * @param state - Current game state
 * @param reactionId - ID of the reaction to check
 * @param playerIndex - Which player to check for
 * @returns Whether the reaction has been used
 */
export function hasAdvancedReactionBeenUsed(
  state: GameState,
  reactionId: string,
  playerIndex: number,
): boolean {
  return state.advancedReactionsUsed.some(
    (u: AdvancedReactionUsage) => u.reactionId === reactionId && u.playerIndex === playerIndex,
  );
}

// ─── Trigger Check Functions ─────────────────────────────────────────────────

/**
 * Check if any movement-triggered advanced reactions should fire.
 * Called after a model in the active army completes a move.
 *
 * Trigger type: afterEnemyMoveWithinRange
 * - White Scars "Chasing the Wind" (12" + LOS)
 * - Imperial Fists "Bastion of Fire" (10" + LOS)
 *
 * @param state - Current game state
 * @param movedUnitId - ID of the unit that just moved
 * @returns Reaction ID and eligible unit IDs, or null if no trigger
 */
export function checkMovementAdvancedReactionTriggers(
  state: GameState,
  movedUnitId: string,
): { reactionId: string; eligibleUnitIds: string[] } | null {
  const reactivePlayerIndex = getReactivePlayerIndex(state);
  const reactiveArmy = state.armies[reactivePlayerIndex];

  // Get all movement-triggered reactions for the reactive player's legion
  const legionReactions = getAdvancedReactionsForLegionData(reactiveArmy.faction);

  for (const reaction of legionReactions) {
    if (reaction.triggerCondition.type !== 'afterEnemyMoveWithinRange') continue;
    if (!isAdvancedReactionAvailable(state, reaction.id, reactivePlayerIndex)) continue;
    if (!hasAdvancedReactionHandler(reaction.id)) continue;

    const trigger = reaction.triggerCondition as {
      type: 'afterEnemyMoveWithinRange';
      range: number;
      requiresLOS: boolean;
    };

    // Find eligible units in the reactive army
    const eligibleUnitIds: string[] = [];
    for (const unit of reactiveArmy.units) {
      if (!canUnitReact(unit)) continue;

      // Check range: closest model distance between the reactive unit and the moved unit
      const distance = getClosestModelDistance(state, unit.id, movedUnitId);
      if (distance > trigger.range) continue;

      // Check LOS if required
      if (trigger.requiresLOS && !hasLOSToUnit(state, unit.id, movedUnitId)) continue;

      eligibleUnitIds.push(unit.id);
    }

    if (eligibleUnitIds.length > 0) {
      return { reactionId: reaction.id, eligibleUnitIds };
    }
  }

  return null;
}

/**
 * Check if any shooting-triggered advanced reactions should fire.
 * Called at the specified step of the shooting attack pipeline.
 *
 * Trigger type: duringShootingAttackStep
 * Step 3: IW Bitter Fury, SW Bestial Savagery, UM Retribution Strike, RG Shadow Veil, AL Smoke and Mirrors
 * Step 4: BA Wrath of Angels, WE Brutal Tide, DG Barbaran Endurance, TS Fortress of the Mind
 * Step 5: WB Glorious Martyrdom
 *
 * @param state - Current game state
 * @param attackerUnitId - ID of the shooting unit (active player)
 * @param targetUnitId - ID of the target unit (reactive player)
 * @param step - Current step in the shooting attack pipeline
 * @returns Reaction ID and eligible unit IDs, or null if no trigger
 */
export function checkShootingAdvancedReactionTriggers(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  step: number,
): { reactionId: string; eligibleUnitIds: string[] } | null {
  const reactivePlayerIndex = getReactivePlayerIndex(state);
  const reactiveArmy = state.armies[reactivePlayerIndex];

  // Get all shooting-triggered reactions for the reactive player's legion
  const legionReactions = getAdvancedReactionsForLegionData(reactiveArmy.faction);

  for (const reaction of legionReactions) {
    if (reaction.triggerCondition.type !== 'duringShootingAttackStep') continue;

    const trigger = reaction.triggerCondition as {
      type: 'duringShootingAttackStep';
      step: number;
    };
    if (trigger.step !== step) continue;
    if (!isAdvancedReactionAvailable(state, reaction.id, reactivePlayerIndex)) continue;
    if (!hasAdvancedReactionHandler(reaction.id)) continue;

    // Verify the target unit belongs to the reactive player and is the correct legion
    const targetPlayerIndex = findUnitPlayerIndex(state, targetUnitId);
    if (targetPlayerIndex !== reactivePlayerIndex) continue;

    // Special case: Ultramarines Retribution Strike uses a DIFFERENT unit
    if (reaction.id === 'um-retribution-strike') {
      const eligibleUnitIds: string[] = [];
      for (const unit of reactiveArmy.units) {
        if (unit.id === targetUnitId) continue; // Must be a different unit than the target
        if (!canUnitReact(unit)) continue;
        // Must have LOS to the attacker
        if (!hasLOSToUnit(state, unit.id, attackerUnitId)) continue;
        eligibleUnitIds.push(unit.id);
      }
      if (eligibleUnitIds.length > 0) {
        return { reactionId: reaction.id, eligibleUnitIds };
      }
    } else {
      // Standard: the target unit is the reacting unit
      const targetUnit = findUnit(state, targetUnitId);
      if (targetUnit && canUnitReact(targetUnit)) {
        return { reactionId: reaction.id, eligibleUnitIds: [targetUnitId] };
      }
    }
  }

  return null;
}

/**
 * Check if any assault-triggered advanced reactions should fire.
 * Called at various points during the Charge and Fight sub-phases.
 *
 * Trigger types:
 * - duringChargeStep: EC Perfect Counter (step 3), NL Better Part of Valour (step 4),
 *                     IH Spite of the Gorgon (step 3), Sal Selfless Burden (step 3),
 *                     EC-H Twisted Desire (step 2)
 * - afterLastInitiativeStep: DA Vengeance of the First
 * - onChallengeDeclaration: SoH Warrior Pride
 * - afterVolleyAttacks: WE-H Furious Charge
 *
 * @param state - Current game state
 * @param triggerType - The type of assault trigger
 * @param chargerUnitId - ID of the charging unit
 * @param targetUnitId - ID of the target unit
 * @param step - Step number (for duringChargeStep triggers)
 * @returns Reaction ID and eligible unit IDs, or null if no trigger
 */
export function checkAssaultAdvancedReactionTriggers(
  state: GameState,
  triggerType: 'duringChargeStep' | 'afterLastInitiativeStep' | 'onChallengeDeclaration' | 'afterVolleyAttacks',
  _chargerUnitId: string,
  targetUnitId: string,
  step?: number,
): { reactionId: string; eligibleUnitIds: string[] } | null {
  const reactivePlayerIndex = getReactivePlayerIndex(state);
  const reactiveArmy = state.armies[reactivePlayerIndex];

  // Get all assault-triggered reactions for the reactive player's legion
  const legionReactions = getAdvancedReactionsForLegionData(reactiveArmy.faction);

  for (const reaction of legionReactions) {
    if (reaction.triggerCondition.type !== triggerType) continue;

    // For duringChargeStep, check step number
    if (triggerType === 'duringChargeStep' && step !== undefined) {
      const trigger = reaction.triggerCondition as {
        type: 'duringChargeStep';
        step: number;
      };
      if (trigger.step !== step) continue;
    }

    if (!isAdvancedReactionAvailable(state, reaction.id, reactivePlayerIndex)) continue;
    if (!hasAdvancedReactionHandler(reaction.id)) continue;

    // The target unit should belong to the reactive player
    const targetPlayerIndex = findUnitPlayerIndex(state, targetUnitId);
    if (targetPlayerIndex !== reactivePlayerIndex) continue;

    // The target unit is the reacting unit
    const targetUnit = findUnit(state, targetUnitId);
    if (targetUnit && canUnitReact(targetUnit)) {
      return { reactionId: reaction.id, eligibleUnitIds: [targetUnitId] };
    }
  }

  return null;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve an advanced reaction by executing its handler.
 * This is called when the reactive player selects an advanced reaction.
 *
 * Process:
 * 1. Validate the reaction and handler exist
 * 2. Execute the handler
 * 3. Record usage (once-per-battle tracking)
 * 4. Deduct reaction allotment
 * 5. Mark the unit as having reacted this turn
 * 6. Clear the awaiting reaction state
 * 7. Emit declaration and resolution events
 *
 * @param state - Current game state
 * @param reactionId - ID of the reaction to resolve
 * @param reactingUnitId - ID of the unit performing the reaction
 * @param triggerSourceUnitId - ID of the unit that triggered the reaction
 * @param dice - Dice provider for any rolls
 * @returns CommandResult with updated state and events
 */
export function resolveAdvancedReaction(
  state: GameState,
  reactionId: string,
  reactingUnitId: string,
  triggerSourceUnitId: string,
  dice: DiceProvider,
): CommandResult {
  const definition = findAdvancedReaction(reactionId);
  if (!definition) {
    return {
      state,
      events: [],
      errors: [{ code: 'UNKNOWN_REACTION', message: `Unknown advanced reaction: ${reactionId}` }],
      accepted: false,
    };
  }

  const handler = advancedReactionRegistry.get(reactionId);
  if (!handler) {
    return {
      state,
      events: [],
      errors: [{ code: 'HANDLER_NOT_FOUND', message: `No handler registered for reaction: ${reactionId}` }],
      accepted: false,
    };
  }

  const playerIndex = findUnitPlayerIndex(state, reactingUnitId);
  if (playerIndex === undefined) {
    return {
      state,
      events: [],
      errors: [{ code: 'UNIT_NOT_FOUND', message: `Reacting unit not found: ${reactingUnitId}` }],
      accepted: false,
    };
  }

  // Build context
  const context: AdvancedReactionContext = {
    state,
    reactionId,
    reactingUnitId,
    triggerSourceUnitId,
    playerIndex,
    definition,
  };

  // Emit declaration event
  const declaredEvent: AdvancedReactionDeclaredEvent = {
    type: 'advancedReactionDeclared',
    reactionId,
    reactionName: definition.name,
    reactingUnitId,
    triggerSourceUnitId,
    playerIndex,
  };

  // Execute the handler
  const result = handler(context, dice);

  // Emit resolution event
  const resolvedEvent: AdvancedReactionResolvedEvent = {
    type: 'advancedReactionResolved',
    reactionId,
    reactionName: definition.name,
    reactingUnitId,
    triggerSourceUnitId,
    success: result.success,
    effectsSummary: definition.effects,
  };

  if (!result.success) {
    return {
      state: result.state,
      events: [declaredEvent, ...result.events, resolvedEvent],
      errors: [],
      accepted: true, // The reaction was declared, even if the effect failed (e.g., charge roll failed)
    };
  }

  // Apply post-resolution state changes
  let newState = result.state;

  // Record usage for once-per-battle tracking
  newState = {
    ...newState,
    advancedReactionsUsed: [
      ...newState.advancedReactionsUsed,
      {
        reactionId,
        playerIndex,
        battleTurn: newState.currentBattleTurn,
      } as AdvancedReactionUsage,
    ],
  };

  // Deduct reaction allotment
  newState = updateArmyByIndex(newState, playerIndex, army => ({
    ...army,
    reactionAllotmentRemaining: Math.max(0, army.reactionAllotmentRemaining - definition.cost),
  }));

  // Mark the reacting unit as having reacted this turn
  newState = updateUnitInGameState(newState, reactingUnitId, unit => ({
    ...unit,
    hasReactedThisTurn: true,
  }));

  // Clear the awaiting reaction state
  newState = setAwaitingReaction(newState, false);

  return {
    state: newState,
    events: [declaredEvent, ...result.events, resolvedEvent],
    errors: [],
    accepted: true,
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

import { registerMovementReactions } from './advanced-reactions/movement-reactions';
import { registerShootingReactions } from './advanced-reactions/shooting-reactions';
import { registerAssaultReactions } from './advanced-reactions/assault-reactions';

/**
 * Register all 20 advanced reaction handlers.
 * Called once during engine initialization.
 */
export function registerAllAdvancedReactions(): void {
  registerMovementReactions();
  registerShootingReactions();
  registerAssaultReactions();
}
