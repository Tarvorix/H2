/**
 * Objective Control Query Tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  GameState,
  ArmyState,
  UnitState,
  ModelState,
  ObjectiveMarker,
  MissionState,
} from '@hh/types';
import {
  Phase,
  SubPhase,
  TacticalStatus,
  Allegiance,
  LegionFaction,
  UnitMovementState,
  DeploymentMap,
  MissionSpecialRule,
} from '@hh/types';
import {
  canModelHoldObjective,
  getModelsWithinObjectiveRange,
  calculateTacticalStrength,
  getObjectiveController,
  getControlledObjectives,
  getObjectiveScoringValueForUnit,
  OBJECTIVE_CONTROL_RANGE,
} from './objective-queries';

// ─── Test Helpers ────────────────────────────────────────────────────────────

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

function makeUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical-squad',
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
    faction: LegionFaction.SonsOfHorus,
    allegiance: Allegiance.Traitor,
    units,
    totalPoints: 2000,
    pointsLimit: 2000,
    reactionAllotmentRemaining: 1,
    baseReactionAllotment: 1,
    victoryPoints: 0,
  };
}

function makeObjective(id: string, x: number, y: number, vpValue: number = 3): ObjectiveMarker {
  return {
    id,
    position: { x, y },
    vpValue,
    currentVpValue: vpValue,
    isRemoved: false,
    label: `Objective ${id}`,
  };
}

function makeMissionState(objectives: ObjectiveMarker[]): MissionState {
  return {
    missionId: 'test-mission',
    deploymentMap: DeploymentMap.SearchAndDestroy,
    deploymentZones: [
      { playerIndex: 0, vertices: [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 24 }] },
      { playerIndex: 1, vertices: [{ x: 72, y: 48 }, { x: 48, y: 48 }, { x: 72, y: 24 }] },
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

function makeState(
  army0Units: UnitState[],
  army1Units: UnitState[],
  missionState?: MissionState,
): GameState {
  return {
    gameId: 'test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [makeArmy(0, army0Units), makeArmy(1, army1Units)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.End,
    currentSubPhase: SubPhase.Victory,
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
    missionState: missionState ?? null,
  } as GameState;
}

// ─── canModelHoldObjective ───────────────────────────────────────────────────

describe('canModelHoldObjective', () => {
  it('returns true for alive model in clean unit', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model]);
    expect(canModelHoldObjective(model, unit)).toBe(true);
  });

  it('returns false for destroyed model', () => {
    const model = makeModel('m1', 10, 10, { isDestroyed: true });
    const unit = makeUnit('u1', [model]);
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false if unit has Pinned status', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { statuses: [TacticalStatus.Pinned] });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false if unit has Routed status', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { statuses: [TacticalStatus.Routed] });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false if unit is locked in combat', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { isLockedInCombat: true });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false if unit is embarked', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { embarkedOnId: 'transport-1' });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false if unit is in reserves', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { isInReserves: true });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });

  it('returns false for a vehicle without Line', () => {
    const model = makeModel('m1', 10, 10, {
      profileModelName: 'Vindicator',
      unitProfileId: 'vindicator-siege-tank',
    });
    const unit = makeUnit('u1', [model], {
      profileId: 'vindicator-siege-tank',
    });
    expect(canModelHoldObjective(model, unit)).toBe(false);
  });
});

// ─── getModelsWithinObjectiveRange ───────────────────────────────────────────

describe('getModelsWithinObjectiveRange', () => {
  it('finds models within 3" of objective', () => {
    const model1 = makeModel('m1', 10, 10); // At objective
    const model2 = makeModel('m2', 12, 10); // 2" away — within range
    const model3 = makeModel('m3', 20, 10); // 10" away — out of range
    const unit = makeUnit('u1', [model1, model2, model3]);
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    const result = getModelsWithinObjectiveRange(state, obj, 0);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.model.id)).toContain('m1');
    expect(result.map((r) => r.model.id)).toContain('m2');
  });

  it('returns empty for models all out of range', () => {
    const model = makeModel('m1', 50, 50);
    const unit = makeUnit('u1', [model]);
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(getModelsWithinObjectiveRange(state, obj, 0)).toHaveLength(0);
  });

  it('ignores destroyed models', () => {
    const model = makeModel('m1', 10, 10, { isDestroyed: true });
    const unit = makeUnit('u1', [model]);
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(getModelsWithinObjectiveRange(state, obj, 0)).toHaveLength(0);
  });

  it('only checks models of the specified player', () => {
    const p0Model = makeModel('p0-m1', 10, 10);
    const p1Model = makeModel('p1-m1', 10, 10);
    const state = makeState(
      [makeUnit('u0', [p0Model])],
      [makeUnit('u1', [p1Model])],
    );
    const obj = makeObjective('obj1', 10, 10);

    expect(getModelsWithinObjectiveRange(state, obj, 0)).toHaveLength(1);
    expect(getModelsWithinObjectiveRange(state, obj, 1)).toHaveLength(1);
  });
});

// ─── calculateTacticalStrength ───────────────────────────────────────────────

describe('calculateTacticalStrength', () => {
  it('counts eligible models in range', () => {
    const models = [
      makeModel('m1', 10, 10),
      makeModel('m2', 11, 10),
      makeModel('m3', 12, 10), // 2" away
    ];
    const unit = makeUnit('u1', models);
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(calculateTacticalStrength(state, obj, 0)).toBe(9);
  });

  it('excludes models in units with statuses', () => {
    const model = makeModel('m1', 10, 10);
    const unit = makeUnit('u1', [model], { statuses: [TacticalStatus.Pinned] });
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(calculateTacticalStrength(state, obj, 0)).toBe(0);
  });

  it('returns 0 when no models in range', () => {
    const model = makeModel('m1', 50, 50);
    const unit = makeUnit('u1', [model]);
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(calculateTacticalStrength(state, obj, 0)).toBe(0);
  });

  it('adds Line(X) to model tactical strength', () => {
    const models = [
      makeModel('m1', 10, 10),
      makeModel('m2', 11, 10),
      makeModel('m3', 12, 10),
    ];
    const unit = makeUnit('u1', models, { profileId: 'tactical-squad' });
    const state = makeState([unit], []);
    const obj = makeObjective('obj1', 10, 10);

    expect(calculateTacticalStrength(state, obj, 0)).toBe(9);
  });
});

// ─── getObjectiveController ──────────────────────────────────────────────────

describe('getObjectiveController', () => {
  it('player with higher strength controls', () => {
    const p0Models = [makeModel('m1', 10, 10), makeModel('m2', 11, 10)];
    const p1Models = [makeModel('m3', 12, 10)];
    const state = makeState(
      [makeUnit('u0', p0Models)],
      [makeUnit('u1', p1Models)],
    );
    const obj = makeObjective('obj1', 10, 10);

    const result = getObjectiveController(state, obj);
    expect(result.controllerPlayerIndex).toBe(0);
    expect(result.isContested).toBe(false);
    expect(result.player0Strength).toBe(6);
    expect(result.player1Strength).toBe(3);
  });

  it('contested when equal non-zero strength', () => {
    const p0Model = makeModel('m1', 10, 10);
    const p1Model = makeModel('m2', 10.5, 10);
    const state = makeState(
      [makeUnit('u0', [p0Model])],
      [makeUnit('u1', [p1Model])],
    );
    const obj = makeObjective('obj1', 10, 10);

    const result = getObjectiveController(state, obj);
    expect(result.controllerPlayerIndex).toBeNull();
    expect(result.isContested).toBe(true);
  });

  it('uncontrolled when no models in range', () => {
    const state = makeState(
      [makeUnit('u0', [makeModel('m1', 50, 50)])],
      [makeUnit('u1', [makeModel('m2', 50, 50)])],
    );
    const obj = makeObjective('obj1', 10, 10);

    const result = getObjectiveController(state, obj);
    expect(result.controllerPlayerIndex).toBeNull();
    expect(result.isContested).toBe(false);
  });

  it('uses the strongest single unit instead of summing multiple friendly units', () => {
    const state = makeState(
      [
        makeUnit('u0a', [makeModel('m1', 10, 10)]),
        makeUnit('u0b', [makeModel('m2', 11, 10)]),
      ],
      [
        makeUnit('u1', [
          makeModel('m3', 10, 10),
          makeModel('m4', 10.5, 10),
        ]),
      ],
    );
    const obj = makeObjective('obj1', 10, 10);

    const result = getObjectiveController(state, obj);
    expect(result.controllerPlayerIndex).toBe(1);
    expect(result.controllingUnitId).toBe('u1');
    expect(result.player0Strength).toBe(3);
    expect(result.player1Strength).toBe(6);
  });
});

describe('getObjectiveScoringValueForUnit', () => {
  it('adds the Line(X) bonus when the controlling unit has majority Line', () => {
    const unit = makeUnit('u1', [
      makeModel('m1', 10, 10),
      makeModel('m2', 11, 10),
      makeModel('m3', 12, 10),
    ], {
      profileId: 'tactical-squad',
    });
    const objective = makeObjective('obj1', 10, 10, 3);

    expect(getObjectiveScoringValueForUnit(unit, objective)).toBe(5);
  });

  it('applies Support Unit(X) as a hard scoring cap', () => {
    const unit = makeUnit('u1', [
      makeModel('m1', 10, 10, {
        profileModelName: 'Exodus',
        unitProfileId: 'exodus',
      }),
    ], {
      profileId: 'exodus',
    });
    const objective = makeObjective('obj1', 10, 10, 3);

    expect(getObjectiveScoringValueForUnit(unit, objective)).toBe(1);
  });

  it('caps Vanguard(X) units to 1 VP for controlling an objective', () => {
    const unit = makeUnit('u1', [
      makeModel('m1', 10, 10, {
        profileModelName: 'Assault Sergeant',
        unitProfileId: 'assault-squad',
      }),
      makeModel('m2', 11, 10, {
        profileModelName: 'Assault Legionary',
        unitProfileId: 'assault-squad',
      }),
      makeModel('m3', 12, 10, {
        profileModelName: 'Assault Legionary',
        unitProfileId: 'assault-squad',
      }),
    ], {
      profileId: 'assault-squad',
    });
    const objective = makeObjective('obj1', 10, 10, 3);

    expect(getObjectiveScoringValueForUnit(unit, objective)).toBe(1);
  });
});

// ─── getControlledObjectives ─────────────────────────────────────────────────

describe('getControlledObjectives', () => {
  it('returns objectives controlled by the player', () => {
    const p0Model = makeModel('m1', 10, 10);
    const obj1 = makeObjective('obj1', 10, 10, 3);
    const obj2 = makeObjective('obj2', 50, 40, 1); // No one near
    const mission = makeMissionState([obj1, obj2]);
    const state = makeState(
      [makeUnit('u0', [p0Model])],
      [],
      mission,
    );

    const controlled = getControlledObjectives(state, 0);
    expect(controlled).toHaveLength(1);
    expect(controlled[0].id).toBe('obj1');
  });

  it('returns empty array when no mission state', () => {
    const state = makeState([], []);
    expect(getControlledObjectives(state, 0)).toHaveLength(0);
  });

  it('skips removed objectives', () => {
    const obj = makeObjective('obj1', 10, 10, 3);
    obj.isRemoved = true;
    const mission = makeMissionState([obj]);
    const p0Model = makeModel('m1', 10, 10);
    const state = makeState([makeUnit('u0', [p0Model])], [], mission);

    expect(getControlledObjectives(state, 0)).toHaveLength(0);
  });

  it('does not let a single unit control two objectives in the same Victory sub-phase', () => {
    const obj1 = makeObjective('obj1', 10, 10, 3);
    const obj2 = makeObjective('obj2', 13, 10, 1);
    const mission = makeMissionState([obj1, obj2]);
    const state = makeState(
      [makeUnit('u0', [
        makeModel('m1', 11, 10),
        makeModel('m2', 11.5, 10),
      ])],
      [],
      mission,
    );

    const controlled = getControlledObjectives(state, 0);
    expect(controlled).toHaveLength(1);
    expect(controlled[0].id).toBe('obj1');
  });
});

// ─── OBJECTIVE_CONTROL_RANGE ─────────────────────────────────────────────────

describe('Constants', () => {
  it('OBJECTIVE_CONTROL_RANGE is 3 inches', () => {
    expect(OBJECTIVE_CONTROL_RANGE).toBe(3);
  });
});
