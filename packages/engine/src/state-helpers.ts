/**
 * Immutable State Update Helpers
 * Pure functions that produce new state objects without mutation.
 * Used by all handlers to update GameState.
 */

import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  Position,
  RollEvent,
  ShootingAttackState,
  AssaultAttackState,
  AssaultCombatState,
  AdvancedReactionUsage,
  LegionTacticaState,
} from '@hh/types';
import { Phase, SubPhase, TacticalStatus, UnitMovementState } from '@hh/types';

// ─── Army Helpers ────────────────────────────────────────────────────────────

/**
 * Update the active player's army state.
 */
export function updateActiveArmy(
  state: GameState,
  updater: (army: ArmyState) => ArmyState,
): GameState {
  const armies = [...state.armies] as [ArmyState, ArmyState];
  armies[state.activePlayerIndex] = updater(armies[state.activePlayerIndex]);
  return { ...state, armies };
}

/**
 * Update the reactive (non-active) player's army state.
 */
export function updateReactiveArmy(
  state: GameState,
  updater: (army: ArmyState) => ArmyState,
): GameState {
  const reactiveIndex = state.activePlayerIndex === 0 ? 1 : 0;
  const armies = [...state.armies] as [ArmyState, ArmyState];
  armies[reactiveIndex] = updater(armies[reactiveIndex]);
  return { ...state, armies };
}

/**
 * Update a specific army by player index.
 */
export function updateArmyByIndex(
  state: GameState,
  playerIndex: number,
  updater: (army: ArmyState) => ArmyState,
): GameState {
  const armies = [...state.armies] as [ArmyState, ArmyState];
  armies[playerIndex] = updater(armies[playerIndex]);
  return { ...state, armies };
}

// ─── Unit Helpers ────────────────────────────────────────────────────────────

/**
 * Update a unit within an army.
 */
export function updateUnit(
  army: ArmyState,
  unitId: string,
  updater: (unit: UnitState) => UnitState,
): ArmyState {
  const units = army.units.map(u => (u.id === unitId ? updater(u) : u));
  return { ...army, units };
}

/**
 * Update a unit in the game state by searching both armies.
 * Returns the updated game state and the player index where the unit was found.
 */
export function updateUnitInGameState(
  state: GameState,
  unitId: string,
  updater: (unit: UnitState) => UnitState,
): GameState {
  for (let i = 0; i < 2; i++) {
    const army = state.armies[i];
    const unitIdx = army.units.findIndex(u => u.id === unitId);
    if (unitIdx >= 0) {
      return updateArmyByIndex(state, i, a => updateUnit(a, unitId, updater));
    }
  }
  return state;
}

// ─── Model Helpers ───────────────────────────────────────────────────────────

/**
 * Update a specific model within a unit.
 */
export function updateModelInUnit(
  unit: UnitState,
  modelId: string,
  updater: (model: ModelState) => ModelState,
): UnitState {
  const models = unit.models.map(m => (m.id === modelId ? updater(m) : m));
  return { ...unit, models };
}

/**
 * Move a model to a new position.
 */
export function moveModel(model: ModelState, newPosition: Position): ModelState {
  const dx = newPosition.x - model.position.x;
  const dy = newPosition.y - model.position.y;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq <= 0.000001) {
    return { ...model, position: newPosition };
  }

  return {
    ...model,
    position: newPosition,
    rotationRadians: Math.atan2(dy, dx),
  };
}

// ─── Phase/SubPhase Helpers ──────────────────────────────────────────────────

/**
 * Set the current phase and sub-phase.
 */
export function setPhaseState(
  state: GameState,
  phase: Phase,
  subPhase: SubPhase,
): GameState {
  return {
    ...state,
    currentPhase: phase,
    currentSubPhase: subPhase,
    dangerousTerrainTestedModelIds:
      phase === state.currentPhase
        ? state.dangerousTerrainTestedModelIds
        : undefined,
  };
}

export function expireModifiersForTransition(
  state: GameState,
  nextPhase: Phase,
  nextSubPhase: SubPhase,
): GameState {
  const leavingSubPhase = nextSubPhase !== state.currentSubPhase;
  const leavingPhase = nextPhase !== state.currentPhase;

  if (!leavingSubPhase && !leavingPhase) {
    return state;
  }

  const armies = state.armies.map((army) => ({
    ...army,
    units: army.units.map((unit) => ({
      ...unit,
      modifiers: unit.modifiers.filter((modifier) => {
        if (modifier.expiresAt.type === 'endOfSubPhase' && leavingSubPhase && modifier.expiresAt.subPhase === state.currentSubPhase) {
          return false;
        }
        if (modifier.expiresAt.type === 'endOfPhase' && leavingPhase && modifier.expiresAt.phase === state.currentPhase) {
          return false;
        }
        return true;
      }),
      models: unit.models.map((model) => ({
        ...model,
        modifiers: model.modifiers.filter((modifier) => {
          if (modifier.expiresAt.type === 'endOfSubPhase' && leavingSubPhase && modifier.expiresAt.subPhase === state.currentSubPhase) {
            return false;
          }
          if (modifier.expiresAt.type === 'endOfPhase' && leavingPhase && modifier.expiresAt.phase === state.currentPhase) {
            return false;
          }
          return true;
        }),
      })),
    })),
  })) as [ArmyState, ArmyState];

  return {
    ...state,
    armies,
  };
}

// ─── Status Helpers ──────────────────────────────────────────────────────────

/**
 * Add a tactical status to a unit (if not already present).
 */
export function addStatus(unit: UnitState, status: TacticalStatus): UnitState {
  if (unit.statuses.includes(status)) return unit;
  return { ...unit, statuses: [...unit.statuses, status] };
}

/**
 * Remove a tactical status from a unit.
 */
export function removeStatus(unit: UnitState, status: TacticalStatus): UnitState {
  return { ...unit, statuses: unit.statuses.filter(s => s !== status) };
}

/**
 * Check if a unit has a specific tactical status.
 */
export function hasStatus(unit: UnitState, status: TacticalStatus): boolean {
  return unit.statuses.includes(status);
}

// ─── Movement State Helpers ──────────────────────────────────────────────────

/**
 * Set the movement state for a unit.
 */
export function setMovementState(
  unit: UnitState,
  movementState: UnitMovementState,
): UnitState {
  return { ...unit, movementState };
}

// ─── Reaction Helpers ────────────────────────────────────────────────────────

/**
 * Set the awaiting reaction flag on the game state.
 */
export function setAwaitingReaction(
  state: GameState,
  awaiting: boolean,
  pendingReaction?: GameState['pendingReaction'],
): GameState {
  return {
    ...state,
    awaitingReaction: awaiting,
    pendingReaction: awaiting ? pendingReaction : undefined,
  };
}

// ─── Log Helpers ─────────────────────────────────────────────────────────────

/**
 * Add a roll event to the game log.
 */
export function addLogEntry(state: GameState, entry: RollEvent): GameState {
  return { ...state, log: [...state.log, entry] };
}

// ─── Embark/Reserves Helpers ─────────────────────────────────────────────────

/**
 * Mark a unit as embarked on a transport.
 */
export function embarkUnit(unit: UnitState, transportId: string): UnitState {
  return { ...unit, embarkedOnId: transportId, isDeployed: false };
}

/**
 * Mark a unit as disembarked.
 */
export function disembarkUnit(unit: UnitState): UnitState {
  return { ...unit, embarkedOnId: null, isDeployed: true };
}

/**
 * Set unit as in reserves.
 */
export function setInReserves(unit: UnitState, inReserves: boolean): UnitState {
  return { ...unit, isInReserves: inReserves };
}

/**
 * Set unit as deployed.
 */
export function setDeployed(unit: UnitState, deployed: boolean): UnitState {
  return { ...unit, isDeployed: deployed };
}

// ─── Game Over Helper ────────────────────────────────────────────────────────

/**
 * Mark the game as over with an optional winner.
 */
export function setGameOver(
  state: GameState,
  winnerPlayerIndex: number | null,
): GameState {
  return { ...state, isGameOver: true, winnerPlayerIndex };
}

// ─── Shooting Attack State Helpers ──────────────────────────────────────────

/**
 * Set the shooting attack state on the game state.
 */
export function setShootingAttackState(
  state: GameState,
  attackState: ShootingAttackState,
): GameState {
  return { ...state, shootingAttackState: attackState };
}

/**
 * Clear the shooting attack state (attack complete).
 */
export function clearShootingAttackState(state: GameState): GameState {
  return { ...state, shootingAttackState: undefined };
}

/**
 * Update the shooting attack state via an updater function.
 */
export function updateShootingAttackState(
  state: GameState,
  updater: (attackState: ShootingAttackState) => ShootingAttackState,
): GameState {
  if (!state.shootingAttackState) return state;
  return { ...state, shootingAttackState: updater(state.shootingAttackState) };
}

/**
 * Apply damage to a model — reduce currentWounds by amount.
 * Does NOT remove the model; just reduces wounds.
 */
export function applyWoundsToModel(
  model: ModelState,
  woundsToApply: number,
): ModelState {
  const newWounds = Math.max(0, model.currentWounds - woundsToApply);
  return {
    ...model,
    currentWounds: newWounds,
    isDestroyed: newWounds <= 0,
  };
}

// ─── Assault Attack State Helpers ───────────────────────────────────────────

/**
 * Set the assault attack state on the game state.
 */
export function setAssaultAttackState(
  state: GameState,
  attackState: AssaultAttackState,
): GameState {
  return { ...state, assaultAttackState: attackState };
}

/**
 * Clear the assault attack state.
 */
export function clearAssaultAttackState(state: GameState): GameState {
  return { ...state, assaultAttackState: undefined };
}

/**
 * Update the assault attack state via an updater function.
 */
export function updateAssaultAttackState(
  state: GameState,
  updater: (attackState: AssaultAttackState) => AssaultAttackState,
): GameState {
  if (!state.assaultAttackState) return state;
  return { ...state, assaultAttackState: updater(state.assaultAttackState) };
}

// ─── Active Combats Helpers ─────────────────────────────────────────────────

/**
 * Set the active combats on the game state.
 */
export function setActiveCombats(
  state: GameState,
  combats: AssaultCombatState[],
): GameState {
  return { ...state, activeCombats: combats };
}

/**
 * Clear the active combats.
 */
export function clearActiveCombats(state: GameState): GameState {
  return { ...state, activeCombats: undefined };
}

/**
 * Update a specific combat by ID.
 */
export function updateCombat(
  state: GameState,
  combatId: string,
  updater: (combat: AssaultCombatState) => AssaultCombatState,
): GameState {
  if (!state.activeCombats) return state;
  const combats = state.activeCombats.map(c =>
    c.combatId === combatId ? updater(c) : c,
  );
  return { ...state, activeCombats: combats };
}

// ─── Lock in Combat Helpers ─────────────────────────────────────────────────

/**
 * Lock two units in combat with each other.
 * Sets isLockedInCombat and populates engagedWithUnitIds on both.
 */
export function lockUnitsInCombat(
  state: GameState,
  unitIdA: string,
  unitIdB: string,
): GameState {
  let newState = updateUnitInGameState(state, unitIdA, unit => ({
    ...unit,
    isLockedInCombat: true,
    engagedWithUnitIds: unit.engagedWithUnitIds.includes(unitIdB)
      ? unit.engagedWithUnitIds
      : [...unit.engagedWithUnitIds, unitIdB],
  }));
  newState = updateUnitInGameState(newState, unitIdB, unit => ({
    ...unit,
    isLockedInCombat: true,
    engagedWithUnitIds: unit.engagedWithUnitIds.includes(unitIdA)
      ? unit.engagedWithUnitIds
      : [...unit.engagedWithUnitIds, unitIdA],
  }));
  return newState;
}

/**
 * Unlock a unit from combat.
 * Removes it from all engaged units' lists and clears its own.
 */
export function unlockFromCombat(
  state: GameState,
  unitId: string,
): GameState {
  const unit = state.armies[0].units.find(u => u.id === unitId)
    ?? state.armies[1].units.find(u => u.id === unitId);
  if (!unit) return state;

  let newState = state;
  // Remove this unit from each engaged unit's list
  for (const engagedId of unit.engagedWithUnitIds) {
    newState = updateUnitInGameState(newState, engagedId, u => ({
      ...u,
      engagedWithUnitIds: u.engagedWithUnitIds.filter(id => id !== unitId),
      isLockedInCombat: u.engagedWithUnitIds.filter(id => id !== unitId).length > 0,
    }));
  }
  // Clear this unit's engagement
  newState = updateUnitInGameState(newState, unitId, u => ({
    ...u,
    isLockedInCombat: false,
    engagedWithUnitIds: [],
  }));
  return newState;
}

/**
 * Apply Disgraced status to a model — halve WS and LD via modifiers.
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Step 1 (Disgraced)
 */
export function applyDisgraced(
  state: GameState,
  modelId: string,
): GameState {
  return updateUnitInGameState(state, findModelUnitIdHelper(state, modelId), unit =>
    updateModelInUnit(unit, modelId, model => ({
      ...model,
      modifiers: [
        ...model.modifiers,
        {
          characteristic: 'WS',
          operation: 'multiply' as const,
          value: 0.5,
          source: 'Disgraced',
          expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
        },
        {
          characteristic: 'LD',
          operation: 'multiply' as const,
          value: 0.5,
          source: 'Disgraced',
          expiresAt: { type: 'endOfPhase' as const, phase: Phase.Assault },
        },
      ],
    })),
  );
}

/**
 * Helper to find a model's unit ID.
 */
function findModelUnitIdHelper(state: GameState, modelId: string): string {
  for (const army of state.armies) {
    for (const unit of army.units) {
      if (unit.models.some(m => m.id === modelId)) return unit.id;
    }
  }
  return '';
}

// ─── Legion State Helpers ───────────────────────────────────────────────────

/**
 * Create a fresh LegionTacticaState for game initialization.
 * Both players start with clean per-turn tracking.
 */
export function initializeLegionTacticaState(): [LegionTacticaState, LegionTacticaState] {
  const fresh: LegionTacticaState = {
    reactionDiscountUsedThisTurn: false,
    movementBonusActiveThisTurn: false,
    perTurnFlags: {},
  };
  return [{ ...fresh }, { ...fresh }];
}

/**
 * Record that an advanced reaction has been used.
 * Adds a usage entry to the advancedReactionsUsed array.
 */
export function recordAdvancedReactionUsed(
  state: GameState,
  reactionId: string,
  playerIndex: number,
): GameState {
  const usage: AdvancedReactionUsage = {
    reactionId,
    playerIndex,
    battleTurn: state.currentBattleTurn,
  };
  return {
    ...state,
    advancedReactionsUsed: [...state.advancedReactionsUsed, usage],
  };
}

/**
 * Reset per-turn legion tactica state for a player at the start of their turn.
 * Clears all per-turn flags and discount tracking.
 */
export function resetPerTurnLegionState(
  state: GameState,
  playerIndex: number,
): GameState {
  const newTacticaState = [...state.legionTacticaState] as [LegionTacticaState, LegionTacticaState];
  newTacticaState[playerIndex] = {
    reactionDiscountUsedThisTurn: false,
    movementBonusActiveThisTurn: false,
    perTurnFlags: {},
  };
  return {
    ...state,
    legionTacticaState: newTacticaState,
  };
}

/**
 * Apply the Stupefied Hereticus status to a unit.
 * Emperor's Children Hereticus — removes all other tactical statuses,
 * then applies Stupefied. Also adds +1S modifier to all models.
 *
 * Reference: HH_Legiones_Astartes.md — Emperor's Children "Legiones Hereticus"
 */
export function applyStupefied(
  state: GameState,
  unitId: string,
): GameState {
  // First remove all existing tactical statuses
  let newState = updateUnitInGameState(state, unitId, unit => ({
    ...unit,
    statuses: [],
  }));

  // Apply Stupefied status
  newState = updateUnitInGameState(newState, unitId, unit =>
    addStatus(unit, TacticalStatus.Stupefied),
  );

  // Add +1 Strength modifier to all alive models in the unit
  newState = updateUnitInGameState(newState, unitId, unit => ({
    ...unit,
    models: unit.models.map(model => {
      if (model.currentWounds <= 0) return model;
      return {
        ...model,
        modifiers: [
          ...model.modifiers,
          {
            characteristic: 'S' as const,
            operation: 'add' as const,
            value: 1,
            source: 'Stupefied',
            expiresAt: { type: 'manual' },
          },
        ],
      };
    }),
  }));

  return newState;
}

/**
 * Apply the Lost to the Nails Hereticus status to a unit.
 * World Eaters Hereticus — removes all other tactical statuses,
 * then applies LostToTheNails. Also adds +1A modifier and sets LD/CL/WP to 10.
 *
 * Reference: HH_Legiones_Astartes.md — World Eaters "Legiones Hereticus"
 */
export function applyLostToTheNails(
  state: GameState,
  unitId: string,
): GameState {
  // First remove all existing tactical statuses
  let newState = updateUnitInGameState(state, unitId, unit => ({
    ...unit,
    statuses: [],
  }));

  // Apply LostToTheNails status
  newState = updateUnitInGameState(newState, unitId, unit =>
    addStatus(unit, TacticalStatus.LostToTheNails),
  );

  // Add +1 Attacks modifier and set LD/CL/WP to 10 for all alive models
  newState = updateUnitInGameState(newState, unitId, unit => ({
    ...unit,
    models: unit.models.map(model => {
      if (model.currentWounds <= 0) return model;
      return {
        ...model,
        modifiers: [
          ...model.modifiers,
          {
            characteristic: 'A' as const,
            operation: 'add' as const,
            value: 1,
            source: 'Lost to the Nails',
            expiresAt: { type: 'manual' },
          },
          {
            characteristic: 'LD' as const,
            operation: 'set' as const,
            value: 10,
            source: 'Lost to the Nails',
            expiresAt: { type: 'manual' },
          },
          {
            characteristic: 'CL' as const,
            operation: 'set' as const,
            value: 10,
            source: 'Lost to the Nails',
            expiresAt: { type: 'manual' },
          },
          {
            characteristic: 'WP' as const,
            operation: 'set' as const,
            value: 10,
            source: 'Lost to the Nails',
            expiresAt: { type: 'manual' },
          },
        ],
      };
    }),
  }));

  return newState;
}
