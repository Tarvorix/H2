/**
 * Return Fire Reaction Handler Tests
 * Reference: HH_Rules_Battle.md -- "Return Fire Reaction"
 * Reference: HH_Principles.md -- "Reaction Allotments, Core Reactions"
 */

import { describe, it, expect } from 'vitest';
import {
  Allegiance,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
  TacticalStatus,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import {
  checkReturnFireTrigger,
  isDefensiveWeapon,
  markUnitReacted,
  getReturnFireRestrictions,
} from './return-fire-handler';

// ---- Test Fixtures ---------------------------------------------------------

function createTestModel(id: string, overrides?: Partial<ModelState>): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x: 0, y: 0 },
    currentWounds: 1,
    maxWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    characteristicModifiers: [],
    ...overrides,
  } as ModelState;
}

function createTestUnit(id: string, overrides?: Partial<UnitState>): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createTestModel(`${id}-m1`), createTestModel(`${id}-m2`)],
    movementState: UnitMovementState.Stationary,
    statuses: [],
    hasReactedThisTurn: false,
    isDeployed: true,
    isInReserves: false,
    isLockedInCombat: false,
    embarkedOnId: null,
    engagedWithUnitIds: [],
    modifiers: [],
    ...overrides,
  } as UnitState;
}

function createTestArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.Ultramarines,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function createTestGameState(overrides?: Partial<GameState>): GameState {
  const attackerUnit = createTestUnit('attacker', {
    models: [
      createTestModel('atk-m1', { position: { x: 10, y: 24 } }),
      createTestModel('atk-m2', { position: { x: 12, y: 24 } }),
    ],
  });

  const targetUnit = createTestUnit('target', {
    models: [
      createTestModel('tgt-m1', { position: { x: 36, y: 24 } }),
      createTestModel('tgt-m2', { position: { x: 38, y: 24 } }),
    ],
  });

  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createTestArmy(0, [attackerUnit]),
      createTestArmy(1, [targetUnit]),
    ],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Shooting,
    currentSubPhase: SubPhase.Attack,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

// ---- checkReturnFireTrigger ------------------------------------------------

describe('checkReturnFireTrigger', () => {
  it('1. triggers when reactive player has allotment and target unit can react', () => {
    const state = createTestGameState();

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(true);
    expect(result.eligibleUnitIds).toEqual(['target']);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'returnFireTriggered',
      targetUnitId: 'attacker',
      eligibleUnitIds: ['target'],
    });
  });

  it('2. does NOT trigger when reactive player has no reaction allotment', () => {
    const state = createTestGameState();
    // Set the reactive army (player 1) to have 0 allotments
    state.armies[1] = {
      ...state.armies[1],
      reactionAllotmentRemaining: 0,
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('3. does NOT trigger when target unit has already reacted this turn', () => {
    const state = createTestGameState();
    // Mark the target unit as having already reacted
    const targetUnit = state.armies[1].units.find(u => u.id === 'target')!;
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target' ? { ...targetUnit, hasReactedThisTurn: true } : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('4. does NOT trigger when target unit is Stunned', () => {
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? { ...u, statuses: [TacticalStatus.Stunned] }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('5. does NOT trigger when target unit is Routed', () => {
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? { ...u, statuses: [TacticalStatus.Routed] }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('6. does NOT trigger when target unit is locked in combat', () => {
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? { ...u, isLockedInCombat: true }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('7. does NOT trigger when target unit is not deployed', () => {
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? { ...u, isDeployed: false }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('8. does NOT trigger when target unit is embarked', () => {
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? { ...u, embarkedOnId: 'transport-1' }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('14. returns no trigger event when no eligible units', () => {
    // Target unit has no alive models
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: state.armies[1].units.map(u =>
        u.id === 'target'
          ? {
              ...u,
              models: u.models.map(m => ({
                ...m,
                isDestroyed: true,
                currentWounds: 0,
              })),
            }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('returns no trigger when attacker unit has no alive models', () => {
    const state = createTestGameState();
    state.armies[0] = {
      ...state.armies[0],
      units: state.armies[0].units.map(u =>
        u.id === 'attacker'
          ? {
              ...u,
              models: u.models.map(m => ({
                ...m,
                isDestroyed: true,
                currentWounds: 0,
              })),
            }
          : u,
      ),
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('returns no trigger when target unit ID does not exist', () => {
    const state = createTestGameState();

    const result = checkReturnFireTrigger(state, 'nonexistent', 'attacker');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('returns no trigger when attacker unit ID does not exist', () => {
    const state = createTestGameState();

    const result = checkReturnFireTrigger(state, 'target', 'nonexistent');

    expect(result.canReturnFire).toBe(false);
    expect(result.eligibleUnitIds).toEqual([]);
    expect(result.events).toHaveLength(0);
  });

  it('15. only target unit is eligible (not nearby units), so eligibleUnitIds has at most 1 entry', () => {
    // Add a second unit to army 1 that could also react
    const secondUnit = createTestUnit('nearby-friendly', {
      models: [
        createTestModel('nf-m1', { position: { x: 40, y: 24 } }),
        createTestModel('nf-m2', { position: { x: 42, y: 24 } }),
      ],
    });

    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: [...state.armies[1].units, secondUnit],
    };

    const result = checkReturnFireTrigger(state, 'target', 'attacker');

    // Only the target unit should be eligible, not the nearby friendly unit
    expect(result.canReturnFire).toBe(true);
    expect(result.eligibleUnitIds).toEqual(['target']);
    expect(result.eligibleUnitIds).not.toContain('nearby-friendly');
  });
});

// ---- isDefensiveWeapon -----------------------------------------------------

describe('isDefensiveWeapon', () => {
  it('9. S6 weapon is defensive', () => {
    expect(isDefensiveWeapon(6, ['Bolt', 'Heavy'])).toBe(true);
  });

  it('S5 weapon is defensive', () => {
    expect(isDefensiveWeapon(5, ['Bolt', 'Assault'])).toBe(true);
  });

  it('S1 weapon is defensive', () => {
    expect(isDefensiveWeapon(1, [])).toBe(true);
  });

  it('10. S7 weapon is NOT defensive (unless has Defensive trait)', () => {
    expect(isDefensiveWeapon(7, ['Las', 'Heavy'])).toBe(false);
  });

  it('S8 weapon without Defensive trait is NOT defensive', () => {
    expect(isDefensiveWeapon(8, ['Melta'])).toBe(false);
  });

  it('S10 weapon without Defensive trait is NOT defensive', () => {
    expect(isDefensiveWeapon(10, ['Ordnance'])).toBe(false);
  });

  it('11. S8 weapon WITH Defensive trait IS defensive', () => {
    expect(isDefensiveWeapon(8, ['Melta', 'Defensive'])).toBe(true);
  });

  it('S7 weapon with Defensive trait is defensive', () => {
    expect(isDefensiveWeapon(7, ['Las', 'Defensive'])).toBe(true);
  });

  it('S10 weapon with Defensive trait is defensive', () => {
    expect(isDefensiveWeapon(10, ['Ordnance', 'Defensive'])).toBe(true);
  });

  it('Defensive trait check is case-insensitive', () => {
    expect(isDefensiveWeapon(8, ['defensive'])).toBe(true);
    expect(isDefensiveWeapon(8, ['DEFENSIVE'])).toBe(true);
    expect(isDefensiveWeapon(8, ['Defensive'])).toBe(true);
  });

  it('empty traits with S6 is defensive', () => {
    expect(isDefensiveWeapon(6, [])).toBe(true);
  });

  it('empty traits with S7 is NOT defensive', () => {
    expect(isDefensiveWeapon(7, [])).toBe(false);
  });
});

// ---- markUnitReacted -------------------------------------------------------

describe('markUnitReacted', () => {
  it('12. sets hasReactedThisTurn and decrements allotment', () => {
    const state = createTestGameState();

    // Before marking
    const targetBefore = state.armies[1].units.find(u => u.id === 'target')!;
    expect(targetBefore.hasReactedThisTurn).toBe(false);
    expect(state.armies[1].reactionAllotmentRemaining).toBe(1);

    // Mark the target unit as reacted
    const newState = markUnitReacted(state, 'target');

    // After marking
    const targetAfter = newState.armies[1].units.find(u => u.id === 'target')!;
    expect(targetAfter.hasReactedThisTurn).toBe(true);
    expect(newState.armies[1].reactionAllotmentRemaining).toBe(0);
  });

  it('does not decrement allotment below 0', () => {
    const state = createTestGameState();
    // Set allotment to 0 already
    state.armies[1] = {
      ...state.armies[1],
      reactionAllotmentRemaining: 0,
    };

    const newState = markUnitReacted(state, 'target');

    expect(newState.armies[1].reactionAllotmentRemaining).toBe(0);
    const targetAfter = newState.armies[1].units.find(u => u.id === 'target')!;
    expect(targetAfter.hasReactedThisTurn).toBe(true);
  });

  it('returns state unchanged for nonexistent unit', () => {
    const state = createTestGameState();

    const newState = markUnitReacted(state, 'nonexistent-unit');

    // State should be identical since unit was not found
    expect(newState).toEqual(state);
  });

  it('correctly decrements army 0 allotment when marking army 0 unit', () => {
    const state = createTestGameState();
    // Start with allotment of 2 for army 0
    state.armies[0] = {
      ...state.armies[0],
      reactionAllotmentRemaining: 2,
    };

    const newState = markUnitReacted(state, 'attacker');

    const attackerAfter = newState.armies[0].units.find(u => u.id === 'attacker')!;
    expect(attackerAfter.hasReactedThisTurn).toBe(true);
    expect(newState.armies[0].reactionAllotmentRemaining).toBe(1);
    // Army 1 should be unaffected
    expect(newState.armies[1].reactionAllotmentRemaining).toBe(1);
  });

  it('marks unit reacted without affecting other units in the same army', () => {
    const secondUnit = createTestUnit('second-unit');
    const state = createTestGameState();
    state.armies[1] = {
      ...state.armies[1],
      units: [...state.armies[1].units, secondUnit],
    };

    const newState = markUnitReacted(state, 'target');

    const targetAfter = newState.armies[1].units.find(u => u.id === 'target')!;
    const secondAfter = newState.armies[1].units.find(u => u.id === 'second-unit')!;
    expect(targetAfter.hasReactedThisTurn).toBe(true);
    expect(secondAfter.hasReactedThisTurn).toBe(false);
  });
});

// ---- getReturnFireRestrictions ---------------------------------------------

describe('getReturnFireRestrictions', () => {
  it('13. infantry unit: always stationary, no defensive-only restriction', () => {
    const unit = createTestUnit('infantry-unit');

    const restrictions = getReturnFireRestrictions(unit);

    expect(restrictions.countsAsStationary).toBe(true);
    expect(restrictions.defensiveWeaponsOnly).toBe(false);
    expect(restrictions.isReturnFire).toBe(true);
    expect(restrictions.canIgnoreLOS).toBe(false);
  });

  it('13b. all units always count as stationary during Return Fire', () => {
    // Even a unit that has moved should count as stationary
    const movedUnit = createTestUnit('moved-unit', {
      movementState: UnitMovementState.Moved,
    });

    const restrictions = getReturnFireRestrictions(movedUnit);

    expect(restrictions.countsAsStationary).toBe(true);
  });

  it('13c. all units always count as stationary even if Rushed', () => {
    const rushedUnit = createTestUnit('rushed-unit', {
      movementState: UnitMovementState.Rushed,
    });

    const restrictions = getReturnFireRestrictions(rushedUnit);

    expect(restrictions.countsAsStationary).toBe(true);
  });

  it('isReturnFire is always true', () => {
    const unit = createTestUnit('some-unit');

    const restrictions = getReturnFireRestrictions(unit);

    expect(restrictions.isReturnFire).toBe(true);
  });

  it('canIgnoreLOS is always false for Return Fire', () => {
    const unit = createTestUnit('barrage-unit');

    const restrictions = getReturnFireRestrictions(unit);

    expect(restrictions.canIgnoreLOS).toBe(false);
  });

  it('vehicle detection (currently always false from isVehicleUnit stub)', () => {
    // Non-vehicle units don't have the defensiveWeaponsOnly restriction
    const unit = createTestUnit('vehicle-unit');

    const restrictions = getReturnFireRestrictions(unit);

    // Non-vehicle units don't have the defensiveWeaponsOnly restriction
    expect(restrictions.defensiveWeaponsOnly).toBe(false);
  });
});
