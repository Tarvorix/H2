import { describe, expect, it } from 'vitest';
import {
  Allegiance,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type { ArmyState, GameState, ModelState, UnitState } from '@hh/types';
import { FixedDiceProvider } from '../dice';
import { processCommand } from '../command-processor';
import { handleShootingAttack } from '../phases/shooting-phase';

function makeModel(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ModelState> = {},
): ModelState {
  return {
    id,
    profileModelName: 'Test Marine',
    unitProfileId: 'test-profile',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function makeUnit(
  id: string,
  models: ModelState[],
  overrides: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    profileId: 'test-profile',
    models,
    statuses: [],
    hasReactedThisTurn: false,
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    modifiers: [],
    ...overrides,
  };
}

function makeArmy(playerIndex: number, units: UnitState[]): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units,
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  } as ArmyState;
}

function makeState(army0Units: UnitState[], army1Units: UnitState[]): GameState {
  return {
    gameId: 'overload-test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [makeArmy(0, army0Units), makeArmy(1, army1Units)],
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
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
    missionState: null,
  } as GameState;
}

describe('Overload Misfires', () => {
  it('resolves normal-hit overload misfires against the firing infantry unit after the shot', () => {
    const attacker = makeUnit('attacker-u1', [
      makeModel('attacker-m1', 10, 10, { equippedWargear: ['disintegrator-rifle'] }),
    ]);
    const target = makeUnit('target-u1', [
      makeModel('target-m1', 18, 10),
    ]);
    const state = makeState([attacker], [target]);

    const result = handleShootingAttack(state, {
      type: 'declareShooting',
      attackingUnitId: 'attacker-u1',
      targetUnitId: 'target-u1',
      weaponSelections: [{ modelId: 'attacker-m1', weaponId: 'disintegrator-rifle' }],
    }, new FixedDiceProvider([1, 4]), {
      allowReturnFireTrigger: false,
      persistShootingAttackState: false,
    });

    expect(result.accepted).toBe(true);
    const updatedAttacker = result.state.armies[0].units[0].models[0];
    expect(updatedAttacker.isDestroyed).toBe(true);
    expect(updatedAttacker.currentWounds).toBe(0);

    const misfireDamage = result.events.find(
      (event) => event.type === 'damageApplied' && event.unitId === 'attacker-u1',
    ) as { damageSource: string } | undefined;
    expect(misfireDamage?.damageSource).toBe('Misfire from Disintegrator rifle');
  });

  it('rolls template overload misfires after template hits are determined', () => {
    const attacker = makeUnit('attacker-u1', [
      makeModel('attacker-m1', 10, 10, { equippedWargear: ['plasma-burner-maximal'] }),
    ]);
    const target = makeUnit('target-u1', [
      makeModel('target-m1', 12, 10),
    ]);
    const state = makeState([attacker], [target]);

    const result = handleShootingAttack(state, {
      type: 'declareShooting',
      attackingUnitId: 'attacker-u1',
      targetUnitId: 'target-u1',
      weaponSelections: [{ modelId: 'attacker-m1', weaponId: 'plasma-burner-maximal' }],
      templatePlacements: [{ sourceModelId: 'attacker-m1', directionRadians: 0 }],
    }, new FixedDiceProvider([1, 2, 2]), {
      allowReturnFireTrigger: false,
      persistShootingAttackState: false,
    });

    expect(result.accepted).toBe(true);
    const updatedAttacker = result.state.armies[0].units[0].models[0];
    expect(updatedAttacker.currentWounds).toBe(0);
    expect(updatedAttacker.isDestroyed).toBe(true);

    const misfireEvent = result.events.find(
      (event) => event.type === 'fireGroupResolved' && event.weaponName === 'Plasma burner — Maximal (Misfire)',
    );
    expect(misfireEvent).toBeDefined();
  });

  it('resolves vehicle overload misfires against the lowest armour value of the firing vehicle', () => {
    const attacker = makeUnit('attacker-u1', [
      makeModel('attacker-v1', 10, 10, {
        profileModelName: 'Vindicator',
        unitProfileId: 'vindicator-siege-tank',
        currentWounds: 6,
        equippedWargear: ['neutron-blaster'],
      }),
    ], {
      profileId: 'vindicator-siege-tank',
    });
    const target = makeUnit('target-u1', [
      makeModel('target-m1', 20, 10),
    ]);
    const state = makeState([attacker], [target]);

    const result = handleShootingAttack(state, {
      type: 'declareShooting',
      attackingUnitId: 'attacker-u1',
      targetUnitId: 'target-u1',
      weaponSelections: [{ modelId: 'attacker-v1', weaponId: 'neutron-blaster' }],
    }, new FixedDiceProvider([1, 6]), {
      allowReturnFireTrigger: false,
      persistShootingAttackState: false,
    });

    expect(result.accepted).toBe(true);
    const updatedVehicle = result.state.armies[0].units[0].models[0];
    expect(updatedVehicle.currentWounds).toBe(3);
    expect(updatedVehicle.isDestroyed).toBe(false);

    const selfDamage = result.events.find(
      (event) => event.type === 'damageApplied' && event.unitId === 'attacker-u1',
    ) as { woundsLost: number } | undefined;
    expect(selfDamage?.woundsLost).toBe(3);
  });

  it('defers original-attack misfires until the pending Return Fire window is closed', () => {
    const attacker = makeUnit('attacker-u1', [
      makeModel('attacker-m1', 20, 20, { equippedWargear: ['disintegrator-rifle'] }),
    ], {
      profileId: 'tactical',
    });
    attacker.models[0].profileModelName = 'Legionary';
    attacker.models[0].unitProfileId = 'tactical';

    const target = makeUnit('target-u1', [
      makeModel('target-m1', 28, 20, { equippedWargear: ['bolter'] }),
    ], {
      profileId: 'tactical',
    });
    target.models[0].profileModelName = 'Legionary';
    target.models[0].unitProfileId = 'tactical';

    const state = makeState([attacker], [target]);

    const offered = processCommand(state, {
      type: 'declareShooting',
      attackingUnitId: 'attacker-u1',
      targetUnitId: 'target-u1',
      weaponSelections: [{ modelId: 'attacker-m1', weaponId: 'disintegrator-rifle' }],
    }, new FixedDiceProvider([1]));

    expect(offered.accepted).toBe(true);
    expect(offered.state.awaitingReaction).toBe(true);
    expect(offered.state.shootingAttackState?.pendingMisfireGroups).toHaveLength(1);
    expect(offered.events.some((event) => event.type === 'damageApplied' && event.unitId === 'attacker-u1')).toBe(false);

    const declined = processCommand(offered.state, { type: 'declineReaction' }, new FixedDiceProvider([4]));
    expect(declined.accepted).toBe(true);
    expect(declined.state.awaitingReaction).toBe(false);
    expect(declined.state.shootingAttackState?.pendingMisfireGroups ?? []).toHaveLength(0);

    const updatedAttacker = declined.state.armies[0].units[0].models[0];
    expect(updatedAttacker.currentWounds).toBe(0);
    expect(updatedAttacker.isDestroyed).toBe(true);
    expect(declined.events.some((event) => event.type === 'damageApplied' && event.unitId === 'attacker-u1')).toBe(true);
  });
});
