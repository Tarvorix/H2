/**
 * Fight Handler — Combat Determination
 * Implements Steps 1-2 of the Fight Sub-Phase.
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Steps 1-2
 *
 * Step 1: Determine Combats — identify all units locked in combat, merge multi-unit combats
 * Step 2: Declare Weapons & Set Initiative Steps — set up initiative steps from model initiative values
 */

import type { GameState } from '@hh/types';
import type { GameEvent, CombatDeclaredEvent } from '../types';
import {
  findUnit,
  getLockedInCombatUnits,
  findUnitPlayerIndex,
} from '../game-queries';
import type { CombatState, InitiativeStep } from './assault-types';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of determining all combats on the battlefield.
 */
export interface DetermineCombatsResult {
  /** All identified combats, sorted by combatId */
  combats: CombatState[];
  /** Events emitted during combat determination */
  events: GameEvent[];
}

/**
 * Setup data for a single model participating in a combat.
 * Describes the model's initiative value and chosen weapon for the fight.
 */
export interface ModelCombatSetup {
  /** The model's ID */
  modelId: string;
  /** The model's effective Combat Initiative value (already resolved) */
  initiativeValue: number;
  /** The name of the melee weapon this model is using */
  weaponName: string;
}

// ─── Determine Combats ──────────────────────────────────────────────────────

/**
 * Identifies all combats on the battlefield by examining locked-in-combat units
 * and merging multi-unit combats using BFS.
 *
 * Units that are engaged with each other form a single combat. If unit A is
 * engaged with unit B, and unit B is engaged with unit C, then A, B, and C
 * are all part of one combat (connected component).
 *
 * Each combat is split into active player units and reactive player units
 * based on `state.activePlayerIndex`.
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Step 1
 *
 * @param state - Current game state
 * @returns DetermineCombatsResult with all identified combats and events
 */
export function determineCombats(state: GameState): DetermineCombatsResult {
  const events: GameEvent[] = [];
  const lockedUnits = getLockedInCombatUnits(state);

  if (lockedUnits.length === 0) {
    return { combats: [], events };
  }

  // Build adjacency from engagedWithUnitIds for all locked-in-combat units
  const lockedUnitIds = new Set<string>(lockedUnits.map(u => u.id));

  // BFS to find connected components (each component = one combat)
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const unit of lockedUnits) {
    if (visited.has(unit.id)) continue;

    // BFS from this unit to find all connected units
    const component: string[] = [];
    const queue: string[] = [unit.id];
    visited.add(unit.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      component.push(currentId);

      const currentUnit = findUnit(state, currentId);
      if (!currentUnit) continue;

      for (const engagedId of currentUnit.engagedWithUnitIds) {
        if (!visited.has(engagedId) && lockedUnitIds.has(engagedId)) {
          visited.add(engagedId);
          queue.push(engagedId);
        }
      }
    }

    components.push(component);
  }

  // Convert each connected component into a CombatState
  const combats: CombatState[] = [];

  for (let index = 0; index < components.length; index++) {
    const component = components[index];
    const activePlayerUnitIds: string[] = [];
    const reactivePlayerUnitIds: string[] = [];

    for (const unitId of component) {
      const playerIndex = findUnitPlayerIndex(state, unitId);
      if (playerIndex === state.activePlayerIndex) {
        activePlayerUnitIds.push(unitId);
      } else {
        reactivePlayerUnitIds.push(unitId);
      }
    }

    // Sort unit IDs within each side for deterministic ordering
    activePlayerUnitIds.sort();
    reactivePlayerUnitIds.sort();

    const combatId = `combat-${index}`;

    const combat: CombatState = {
      combatId,
      activePlayerUnitIds,
      reactivePlayerUnitIds,
      initiativeSteps: [],
      currentInitiativeStepIndex: 0,
      activePlayerCRP: 0,
      reactivePlayerCRP: 0,
      challengeState: null,
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
      resolved: false,
      isMassacre: false,
      massacreWinnerPlayerIndex: null,
    };

    combats.push(combat);

    // Emit CombatDeclaredEvent for each combat
    const combatEvent: CombatDeclaredEvent = {
      type: 'combatDeclared',
      combatId,
      activePlayerUnitIds: [...activePlayerUnitIds],
      reactivePlayerUnitIds: [...reactivePlayerUnitIds],
    };
    events.push(combatEvent);
  }

  // Sort combats by combatId for deterministic ordering
  combats.sort((a, b) => a.combatId.localeCompare(b.combatId));

  return { combats, events };
}

// ─── Declare Weapons & Set Initiative Steps ─────────────────────────────────

/**
 * Sets up initiative steps for a combat based on model combat setups.
 *
 * Groups models by their initiative value, creates an InitiativeStep for each
 * distinct value, and sorts steps from highest to lowest (higher initiative
 * attacks first).
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Step 2
 *
 * @param combatState - The combat to set up initiative steps for
 * @param modelSetups - Array of model setups with their initiative values and weapon names
 * @returns Updated CombatState with initiative steps populated
 */
export function declareWeaponsAndSetInitiativeSteps(
  combatState: CombatState,
  modelSetups: ModelCombatSetup[],
): CombatState {
  // Group models by their initiative value
  const initiativeGroups = new Map<number, string[]>();

  for (const setup of modelSetups) {
    const existing = initiativeGroups.get(setup.initiativeValue);
    if (existing) {
      existing.push(setup.modelId);
    } else {
      initiativeGroups.set(setup.initiativeValue, [setup.modelId]);
    }
  }

  // Create InitiativeStep for each distinct initiative value
  const initiativeSteps: InitiativeStep[] = [];

  for (const [initiativeValue, modelIds] of initiativeGroups) {
    const step: InitiativeStep = {
      initiativeValue,
      modelIds: [...modelIds],
      strikeGroups: [],
      resolved: false,
    };
    initiativeSteps.push(step);
  }

  // Sort steps highest to lowest (higher initiative attacks first)
  initiativeSteps.sort((a, b) => b.initiativeValue - a.initiativeValue);

  return {
    ...combatState,
    initiativeSteps,
    currentInitiativeStepIndex: 0,
  };
}

// ─── Combat Initiative Score ────────────────────────────────────────────────

/**
 * Calculates a model's effective Combat Initiative score for the Fight Sub-Phase.
 *
 * If the model's unit has any tactical status, the Combat Initiative is forced to 1.
 * Otherwise, it is the model's base initiative plus the weapon's initiative modifier,
 * with a minimum of 1.
 *
 * Reference: HH_Rules_Battle.md — Fight Sub-Phase Step 2
 *
 * @param baseInitiative - The model's base Initiative characteristic
 * @param weaponInitiativeModifier - The melee weapon's Initiative modifier (IM value)
 * @param hasAnyTacticalStatus - Whether the model's unit has any tactical status
 * @returns The effective Combat Initiative score (minimum 1)
 */
export function getCombatInitiativeScore(
  baseInitiative: number,
  weaponInitiativeModifier: number,
  hasAnyTacticalStatus: boolean,
): number {
  // Any tactical status → Combat Initiative forced to 1
  if (hasAnyTacticalStatus) {
    return 1;
  }

  // Normal case: base initiative + weapon modifier, minimum 1
  return Math.max(1, baseInitiative + weaponInitiativeModifier);
}
