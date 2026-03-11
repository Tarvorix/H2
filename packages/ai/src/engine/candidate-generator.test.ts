import { describe, expect, it } from 'vitest';
import {
  Allegiance,
  CoreReaction,
  LegionFaction,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import type {
  ArmyState,
  GameState,
  ModelState,
  PendingReaction,
  UnitState,
} from '@hh/types';
import { FixedDiceProvider, handleMoveUnit, processCommand } from '@hh/engine';
import type { SearchConfig } from '../types';
import { generateMacroActions } from './candidate-generator';

function createModel(overrides: Partial<ModelState> = {}): ModelState {
  return {
    id: `model-${Math.random().toString(36).slice(2, 8)}`,
    profileModelName: 'Tactical Marine',
    unitProfileId: 'tactical-squad',
    position: { x: 10, y: 10 },
    currentWounds: 1,
    isDestroyed: false,
    equippedWargear: ['bolter'],
    modifiers: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: `unit-${Math.random().toString(36).slice(2, 8)}`,
    profileId: 'tactical-squad',
    models: [createModel()],
    movementState: UnitMovementState.Stationary,
    isLockedInCombat: false,
    embarkedOnId: null,
    isInReserves: false,
    isDeployed: true,
    engagedWithUnitIds: [],
    statuses: [],
    hasReactedThisTurn: false,
    modifiers: [],
    ...overrides,
  };
}

function createArmy(overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${Math.random().toString(36).slice(2, 8)}`,
    playerIndex: 0,
    playerName: 'Player 1',
    faction: LegionFaction.DarkAngels,
    allegiance: Allegiance.Loyalist,
    units: [createUnit({ id: 'p0-unit-1' })],
    totalPoints: 1000,
    pointsLimit: 1000,
    reactionAllotmentRemaining: 2,
    baseReactionAllotment: 2,
    victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'candidate-generator-test',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [
      createArmy({ playerIndex: 0 }),
      createArmy({
        playerIndex: 1,
        playerName: 'Player 2',
        faction: LegionFaction.WorldEaters,
        allegiance: Allegiance.Traitor,
        units: [createUnit({
          id: 'p1-unit-1',
          models: [createModel({ id: 'p1-m1', position: { x: 50, y: 40 } })],
        })],
      }),
    ],
    currentBattleTurn: 1,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Movement,
    currentSubPhase: SubPhase.Move,
    maxBattleTurns: 5,
    isGameOver: false,
    winnerPlayerIndex: null,
    awaitingReaction: false,
    advancedReactionsUsed: [],
    legionTacticaState: [null, null],
    missionState: null,
    log: [],
    turnHistory: [],
    ...overrides,
  } as GameState;
}

function createSearchConfig(overrides: Partial<SearchConfig> = {}): SearchConfig {
  return {
    timeBudgetMs: 150,
    nnueModelId: 'gameplay-default-v1',
    baseSeed: 2026,
    rolloutCount: 1,
    maxDepthSoft: 2,
    diagnosticsEnabled: true,
    maxRootActions: 20,
    maxActionsPerUnit: 5,
    aspirationWindow: 35,
    maxAutoAdvanceSteps: 8,
    ...overrides,
  };
}

function expectAllMoveActionsAccepted(state: GameState, playerIndex: number): void {
  const actions = generateMacroActions(
    { state, actedUnitIds: new Set() },
    playerIndex,
    createSearchConfig(),
  ).filter((action) => action.commands[0]?.type === 'moveUnit');

  for (const action of actions) {
    const command = action.commands[0];
    if (command?.type !== 'moveUnit') continue;
    const result = handleMoveUnit(
      state,
      command.unitId,
      command.modelPositions,
      new FixedDiceProvider(Array.from({ length: 128 }, () => 6)),
      command.isRush === true ? { isRush: true } : undefined,
    );
    expect(result.accepted, action.id).toBe(true);
    expect(command.modelPositions.every((entry) => entry.position.x >= 0 && entry.position.y >= 0)).toBe(true);
    expect(command.modelPositions.every((entry) =>
      entry.position.x <= state.battlefield.width && entry.position.y <= state.battlefield.height,
    )).toBe(true);
  }
}

describe('generateMacroActions', () => {
  it('keeps tactically distinct movement lanes in the move candidate set', () => {
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [
              createModel({ id: 'p0-m1', position: { x: 12, y: 12 } }),
              createModel({ id: 'p0-m2', position: { x: 15, y: 12 } }),
            ],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            createUnit({
              id: 'p1-unit-1',
              models: [
                createModel({ id: 'p1-m1', position: { x: 26, y: 12 } }),
                createModel({ id: 'p1-m2', position: { x: 29, y: 12 } }),
              ],
            }),
          ],
        }),
      ],
      missionState: {
        missionId: 'test',
        missionName: 'Test',
        primaryObjective: null,
        secondaryObjectives: [],
        objectives: [
          {
            id: 'obj-1',
            label: 'Center',
            position: { x: 16, y: 19 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
          },
        ],
        deploymentZones: [],
        deploymentMap: null,
        activeSpecialRules: [],
        placedObjectiveCount: 1,
        playersPendingObjectivePlacement: [],
        scoringEvents: [],
        pendingWindowOfOpportunityObjectiveId: null,
        lastPrimaryScoringBattleTurn: null,
      } as GameState['missionState'],
    });

    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      0,
      createSearchConfig(),
    ).filter((action) => action.commands[0]?.type === 'moveUnit');

    const laneReasons = new Set(actions.flatMap((action) => action.reasons));
    expect(actions.length).toBeGreaterThan(1);
    expect(laneReasons.size).toBeGreaterThan(1);
    expectAllMoveActionsAccepted(state, 0);
  });

  it('filters out movement candidates that would end outside the battlefield', () => {
    const wideModels = Array.from({ length: 20 }, (_, index) =>
      createModel({
        id: `p0-wide-${index}`,
        position: { x: 1 + (index * 2), y: 14 },
      }),
    );
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-wide-unit',
            models: wideModels,
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            createUnit({
              id: 'p1-unit-1',
              models: [createModel({ id: 'p1-m1', position: { x: 4, y: 18 } })],
            }),
          ],
        }),
      ],
      missionState: {
        missionId: 'test',
        missionName: 'Test',
        primaryObjective: null,
        secondaryObjectives: [],
        objectives: [
          {
            id: 'left-obj',
            label: 'Left',
            position: { x: 3, y: 18 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
          },
        ],
        deploymentZones: [],
        deploymentMap: null,
        activeSpecialRules: [],
        placedObjectiveCount: 1,
        playersPendingObjectivePlacement: [],
        scoringEvents: [],
        pendingWindowOfOpportunityObjectiveId: null,
        lastPrimaryScoringBattleTurn: null,
      } as GameState['missionState'],
    });

    expectAllMoveActionsAccepted(state, 0);
  });

  it('filters out movement candidates that would end within enemy exclusion zones', () => {
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: Array.from({ length: 10 }, (_, index) =>
              createModel({
                id: `p0-front-${index}`,
                position: { x: 18 + index, y: 18 },
              })
            ),
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            createUnit({
              id: 'p1-threat',
              models: [
                createModel({ id: 'p1-m1', position: { x: 28, y: 18 } }),
                createModel({ id: 'p1-m2', position: { x: 29, y: 18 } }),
              ],
            }),
          ],
        }),
      ],
      missionState: {
        missionId: 'test',
        missionName: 'Test',
        primaryObjective: null,
        secondaryObjectives: [],
        objectives: [
          {
            id: 'contest-obj',
            label: 'Contest',
            position: { x: 27, y: 18 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
          },
        ],
        deploymentZones: [],
        deploymentMap: null,
        activeSpecialRules: [],
        placedObjectiveCount: 1,
        playersPendingObjectivePlacement: [],
        scoringEvents: [],
        pendingWindowOfOpportunityObjectiveId: null,
        lastPrimaryScoringBattleTurn: null,
      } as GameState['missionState'],
    });

    expectAllMoveActionsAccepted(state, 0);
  });

  it('scores shooting candidates with expected damage and objective-holder context', () => {
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [
              createModel({ id: 'p0-m1', position: { x: 12, y: 12 }, equippedWargear: ['bolter'] }),
              createModel({ id: 'p0-m2', position: { x: 13, y: 12 }, equippedWargear: ['bolter'] }),
            ],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [createUnit({
            id: 'p1-unit-1',
            models: [createModel({ id: 'p1-m1', position: { x: 20, y: 12 }, isWarlord: true })],
          })],
        }),
      ],
      missionState: {
        missionId: 'test',
        missionName: 'Test',
        primaryObjective: null,
        secondaryObjectives: [],
        objectives: [
          {
            id: 'obj-1',
            label: 'Alpha',
            position: { x: 20, y: 12 },
            vpValue: 3,
            currentVpValue: 3,
            isRemoved: false,
          },
        ],
        deploymentZones: [],
        deploymentMap: null,
        activeSpecialRules: [],
        placedObjectiveCount: 1,
        playersPendingObjectivePlacement: [],
        scoringEvents: [],
        pendingWindowOfOpportunityObjectiveId: null,
        lastPrimaryScoringBattleTurn: null,
      } as GameState['missionState'],
    });

    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      0,
      createSearchConfig(),
    );
    const shootAction = actions.find((action) => action.commands[0]?.type === 'declareShooting');

    expect(shootAction).toBeDefined();
    expect(shootAction?.reasons.some((reason) => reason.startsWith('expected damage '))).toBe(true);
    expect(shootAction?.reasons).toContain('objective holder');
  });

  it('prefers the stronger eligible reactive unit over weak or decline options', () => {
    const pendingReaction: PendingReaction = {
      reactionType: CoreReaction.ReturnFire,
      isAdvancedReaction: false,
      eligibleUnitIds: ['p1-weak', 'p1-strong'],
      triggerDescription: 'Incoming shooting',
      triggerSourceUnitId: 'p0-unit-1',
    };
    const state = createGameState({
      activePlayerIndex: 0,
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
      awaitingReaction: true,
      pendingReaction,
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [createModel({ id: 'p0-m1', position: { x: 20, y: 18 } })],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            createUnit({
              id: 'p1-weak',
              models: [createModel({ id: 'p1-w1', position: { x: 28, y: 18 }, equippedWargear: ['bolt-pistol'] })],
            }),
            createUnit({
              id: 'p1-strong',
              models: [
                createModel({ id: 'p1-s1', position: { x: 24, y: 18 }, equippedWargear: ['bolter', 'bolt-pistol'] }),
                createModel({ id: 'p1-s2', position: { x: 25, y: 18 }, equippedWargear: ['bolter'] }),
              ],
            }),
          ],
        }),
      ],
    });

    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      1,
      createSearchConfig(),
    );

    expect(actions[0]?.id).toBe('reaction:p1-strong');
    expect(actions.find((action) => action.id === 'reaction:decline')?.orderingScore).toBeLessThan(
      actions[0]?.orderingScore ?? 0,
    );
  });

  it('emits a full rush macro with declaration and rush move resolution', () => {
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            models: [
              createModel({ id: 'p0-m1', position: { x: 12, y: 12 } }),
              createModel({ id: 'p0-m2', position: { x: 15, y: 12 } }),
            ],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            createUnit({
              id: 'p1-unit-1',
              models: [createModel({ id: 'p1-m1', position: { x: 36, y: 12 } })],
            }),
          ],
        }),
      ],
    });

    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      0,
      createSearchConfig(),
    );
    const rushAction = actions.find((action) => action.commands[0]?.type === 'rushUnit');

    expect(rushAction).toBeDefined();
    expect(rushAction?.commands).toHaveLength(2);
    expect(rushAction?.commands[1]).toMatchObject({
      type: 'moveUnit',
      unitId: 'p0-unit-1',
      isRush: true,
    });

    let currentState = state;
    const dice = new FixedDiceProvider(Array.from({ length: 128 }, () => 6));
    for (const command of rushAction?.commands ?? []) {
      const result = processCommand(currentState, command, dice);
      expect(result.accepted).toBe(true);
      currentState = result.state;
    }

    expect(currentState.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
  });

  it('continues a declared rush with a rush move command only', () => {
    const state = createGameState({
      armies: [
        createArmy({
          playerIndex: 0,
          units: [createUnit({
            id: 'p0-unit-1',
            movementState: UnitMovementState.RushDeclared,
            models: [
              createModel({ id: 'p0-m1', position: { x: 12, y: 12 } }),
              createModel({ id: 'p0-m2', position: { x: 15, y: 12 } }),
            ],
          })],
        }),
        createArmy({
          playerIndex: 1,
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [createUnit({
            id: 'p1-unit-1',
            models: [createModel({ id: 'p1-m1', position: { x: 36, y: 12 } })],
          })],
        }),
      ],
    });

    const actions = generateMacroActions(
      { state, actedUnitIds: new Set() },
      0,
      createSearchConfig(),
    );
    const rushMove = actions.find((action) => action.commands[0]?.type === 'moveUnit' && action.commands[0].isRush === true);

    expect(rushMove).toBeDefined();
    expect(rushMove?.commands).toHaveLength(1);
    expect(rushMove?.commands[0]).toMatchObject({
      type: 'moveUnit',
      unitId: 'p0-unit-1',
      isRush: true,
    });
  });
});
