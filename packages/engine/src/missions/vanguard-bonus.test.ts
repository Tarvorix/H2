import { describe, expect, it } from 'vitest';
import type {
  ArmyState,
  GameState,
  MissionState,
  ModelState,
  ObjectiveMarker,
  UnitState,
} from '@hh/types';
import {
  Allegiance,
  DeploymentMap,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type { CombatState } from '../assault/assault-types';
import {
  awardVanguardBonusForCombatObjectiveUnits,
  awardVanguardBonusForDestroyedUnits,
} from './vanguard-bonus';

function makeModel(id: string, x: number, y: number, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function makeUnit(id: string, profileId: string, models: ModelState[]): UnitState {
  return {
    id,
    profileId,
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
  };
}

function makeArmy(playerIndex: number, units: UnitState[], victoryPoints: number = 0): ArmyState {
  return {
    id: `army-${playerIndex}`,
    playerIndex,
    playerName: `Player ${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    doctrine: undefined,
    units,
    totalPoints: 2000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints,
  };
}

function makeObjective(id: string, x: number, y: number, vpValue: number = 3): ObjectiveMarker {
  return {
    id,
    position: { x, y },
    vpValue,
    currentVpValue: vpValue,
    isRemoved: false,
    label: id,
  };
}

function makeMissionState(objectives: ObjectiveMarker[]): MissionState {
  return {
    missionId: 'heart-of-battle',
    deploymentMap: DeploymentMap.SearchAndDestroy,
    deploymentZones: [
      { playerIndex: 0, vertices: [] },
      { playerIndex: 1, vertices: [] },
    ],
    objectives,
    secondaryObjectives: [],
    activeSpecialRules: [],
    firstStrikeTracking: {
      player0FirstTurnCompleted: false,
      player1FirstTurnCompleted: false,
      player0Achieved: false,
      player1Achieved: false,
    },
    scoringHistory: [],
    vpAtTurnStart: [],
    vanguardBonusHistory: [],
    assaultPhaseObjectiveSnapshot: null,
  };
}

function makeState(player0Units: UnitState[], player1Units: UnitState[], missionState: MissionState): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [makeArmy(0, player0Units), makeArmy(1, player1Units)],
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
      { activeTacticaId: null, usedThisTurn: false },
      { activeTacticaId: null, usedThisTurn: false },
    ],
    missionState,
  } as GameState;
}

describe('awardVanguardBonusForDestroyedUnits', () => {
  it('awards Vanguard VP once when the destroyed unit was the declared objective holder', () => {
    const attacker = makeUnit('atk', 'assault-squad', [
      makeModel('a1', 20, 20, { profileModelName: 'Assault Sergeant', unitProfileId: 'assault-squad' }),
      makeModel('a2', 21, 20, { profileModelName: 'Assault Legionary', unitProfileId: 'assault-squad' }),
      makeModel('a3', 22, 20, { profileModelName: 'Assault Legionary', unitProfileId: 'assault-squad' }),
    ]);
    const defender = makeUnit('def', 'tactical-squad', [
      makeModel('d1', 36, 24),
      makeModel('d2', 37, 24),
      makeModel('d3', 38, 24),
    ]);
    const state = makeState([attacker], [defender], makeMissionState([makeObjective('obj-1', 36, 24, 3)]));

    const result = awardVanguardBonusForDestroyedUnits(state, attacker.id, [defender.id]);
    expect(result.state.armies[0].victoryPoints).toBe(2);
    expect(result.state.missionState!.vanguardBonusHistory).toHaveLength(1);
    expect(result.state.missionState!.scoringHistory.at(-1)?.vpScored).toBe(2);

    const secondResult = awardVanguardBonusForDestroyedUnits(result.state, attacker.id, [defender.id]);
    expect(secondResult.state.armies[0].victoryPoints).toBe(2);
    expect(secondResult.state.missionState!.vanguardBonusHistory).toHaveLength(1);
  });
});

describe('awardVanguardBonusForCombatObjectiveUnits', () => {
  it('awards Vanguard VP when an objective unit falls back from combat', () => {
    const attacker = makeUnit('atk', 'assault-squad', [
      makeModel('a1', 20, 20, { profileModelName: 'Assault Sergeant', unitProfileId: 'assault-squad' }),
      makeModel('a2', 21, 20, { profileModelName: 'Assault Legionary', unitProfileId: 'assault-squad' }),
      makeModel('a3', 22, 20, { profileModelName: 'Assault Legionary', unitProfileId: 'assault-squad' }),
    ]);
    const defender = makeUnit('def', 'tactical-squad', [
      makeModel('d1', 36, 24),
      makeModel('d2', 37, 24),
      makeModel('d3', 38, 24),
    ]);
    const state = makeState([attacker], [defender], {
      ...makeMissionState([makeObjective('obj-1', 36, 24, 3)]),
      assaultPhaseObjectiveSnapshot: {
        battleTurn: 1,
        activePlayerIndex: 0,
        unitIdsByObjectiveId: { 'obj-1': [defender.id] },
      },
    });

    const combatState = {
      combatId: 'combat-1',
      activePlayerUnitIds: [attacker.id],
      reactivePlayerUnitIds: [defender.id],
      initiativeSteps: [{
        initiativeValue: 4,
        modelIds: ['a1'],
        resolved: true,
        strikeGroups: [{
          index: 0,
          weaponName: 'chainsword',
          attackerModelIds: ['a1'],
          targetUnitId: defender.id,
          weaponSkill: 4,
          combatInitiative: 4,
          totalAttacks: 3,
          weaponStrength: 4,
          weaponAP: null,
          weaponDamage: 1,
          specialRules: [],
          hits: [],
          wounds: [],
          penetratingHits: [],
          glancingHits: [],
          resolved: true,
          attackerPlayerIndex: 0,
        }],
      }],
      currentInitiativeStepIndex: 0,
      activePlayerCRP: 0,
      reactivePlayerCRP: 0,
      challengeState: null,
      activePlayerCasualties: [],
      reactivePlayerCasualties: [],
      aftermathResolvedUnitIds: [],
      resolved: false,
      isMassacre: false,
      massacreWinnerPlayerIndex: null,
    } as unknown as CombatState;

    const result = awardVanguardBonusForCombatObjectiveUnits(
      state,
      combatState,
      [defender.id],
      0,
      'assault-fallback',
    );

    expect(result.state.armies[0].victoryPoints).toBe(2);
    expect(result.state.missionState!.vanguardBonusHistory).toHaveLength(1);
    expect(result.state.missionState!.vanguardBonusHistory[0].trigger).toBe('assault-fallback');
  });
});
