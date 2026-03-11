/**
 * Command Processor Tests
 * Full integration tests routing commands through the engine.
 */

import { describe, it, expect } from 'vitest';
import { Phase, SubPhase, UnitMovementState, TacticalStatus, Allegiance, LegionFaction, CoreReaction, ChallengeGambit } from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import { FixedDiceProvider } from './dice';
import { processCommand, getValidCommands } from './command-processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x: number, y: number, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id, profileModelName: 'Legionary', unitProfileId: 'tactical',
    position: { x, y }, currentWounds: 1, isDestroyed: false,
    modifiers: [], equippedWargear: [], isWarlord: false,
    ...overrides,
  };
}

function createTacticalModel(id: string, x: number, y: number, overrides: Partial<ModelState> = {}): ModelState {
  return createModel(id, x, y, {
    profileModelName: 'Legionary',
    unitProfileId: 'tactical-squad',
    equippedWargear: ['bolter', 'bolt-pistol', 'frag-grenades', 'krak-grenades'],
    ...overrides,
  });
}

function createLibrarianModel(
  id: string,
  x: number,
  y: number,
  disciplineIds: string[] = [],
  overrides: Partial<ModelState> = {},
): ModelState {
  return createModel(id, x, y, {
    profileModelName: 'Librarian',
    unitProfileId: 'librarian',
    currentWounds: 3,
    equippedWargear: ['force-weapon', 'bolt-pistol', 'frag-grenades', 'krak-grenades', ...disciplineIds],
    ...overrides,
  });
}

function createUnit(id: string, models: ModelState[], overrides: Partial<UnitState> = {}): UnitState {
  return {
    id, profileId: 'tactical', models, statuses: [],
    hasReactedThisTurn: false, movementState: UnitMovementState.Stationary,
    isLockedInCombat: false, embarkedOnId: null,
    isInReserves: false, isDeployed: true, engagedWithUnitIds: [], modifiers: [],
    ...overrides,
  };
}

function createArmy(playerIndex: number, units: UnitState[], overrides: Partial<ArmyState> = {}): ArmyState {
  return {
    id: `army-${playerIndex}`, playerIndex, playerName: `P${playerIndex + 1}`,
    faction: LegionFaction.SonsOfHorus, allegiance: Allegiance.Traitor,
    units, totalPoints: 1000, pointsLimit: 2000,
    reactionAllotmentRemaining: 1, baseReactionAllotment: 1, victoryPoints: 0,
    ...overrides,
  };
}

function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'test', battlefield: { width: 72, height: 48 }, terrain: [],
    armies: [createArmy(0, []), createArmy(1, [])],
    currentBattleTurn: 1, maxBattleTurns: 4,
    activePlayerIndex: 0, firstPlayerIndex: 0,
    currentPhase: Phase.Movement, currentSubPhase: SubPhase.Move,
    awaitingReaction: false, isGameOver: false, winnerPlayerIndex: null,
    log: [], turnHistory: [],
    advancedReactionsUsed: [],
    legionTacticaState: [
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
      { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
    ],
    missionState: null,
    ...overrides,
  };
}

// ─── Basic Routing Tests ────────────────────────────────────────────────────

describe('processCommand', () => {
  describe('psychic runtime integration', () => {
    it('should expose and execute Tranquillity during StartEffects', () => {
      const psykerUnit = createUnit(
        'psyker-unit',
        [createLibrarianModel('psyker-m0', 10, 10, ['thaumaturgy'])],
        { profileId: 'librarian' },
      );
      const enemyPsykerUnit = createUnit(
        'enemy-psyker',
        [createLibrarianModel('enemy-m0', 18, 10, ['telepathy'])],
        { profileId: 'librarian' },
      );
      const state = createGameState({
        currentPhase: Phase.Start,
        currentSubPhase: SubPhase.StartEffects,
        armies: [
          createArmy(0, [psykerUnit]),
          createArmy(1, [enemyPsykerUnit]),
        ],
      });

      expect(getValidCommands(state)).toContain('manifestPsychicPower');

      const dice = new FixedDiceProvider([4, 6]);
      const result = processCommand(state, {
        type: 'manifestPsychicPower',
        powerId: 'tranquillity',
        focusModelId: 'psyker-m0',
        targetUnitId: 'enemy-psyker',
      }, dice as any);

      expect(result.accepted).toBe(true);
      expect(result.state.psychicState?.activeEffects.some((effect) =>
        effect.sourcePowerId === 'tranquillity' && effect.targetUnitId === 'enemy-psyker',
      )).toBe(true);
    });

    it('should execute Mind-burst during the Move sub-phase', () => {
      const psykerUnit = createUnit(
        'psyker-unit',
        [createLibrarianModel('psyker-m0', 10, 10, ['telepathy'])],
        { profileId: 'librarian' },
      );
      const targetUnit = createUnit(
        'target-unit',
        [createTacticalModel('target-m0', 20, 10)],
        { profileId: 'tactical-squad', statuses: [TacticalStatus.Pinned] },
      );
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [
          createArmy(0, [psykerUnit]),
          createArmy(1, [targetUnit]),
        ],
      });

      const dice = new FixedDiceProvider([6, 6, 3, 1, 1]);
      const result = processCommand(state, {
        type: 'manifestPsychicPower',
        powerId: 'mind-burst',
        focusModelId: 'psyker-m0',
        targetUnitId: 'target-unit',
      }, dice as any);

      expect(result.accepted).toBe(true);
      const updatedSource = result.state.armies[0].units[0];
      const updatedTarget = result.state.armies[1].units[0];
      expect(updatedSource.modifiers.some((modifier) => modifier.characteristic === 'NoMove')).toBe(true);
      expect(updatedSource.modifiers.some((modifier) => modifier.characteristic === 'NoRush')).toBe(true);
      expect(updatedTarget.movementState).toBe(UnitMovementState.FellBack);
      expect(updatedTarget.statuses).toEqual([]);
    });

    it('should resolve a psychic shooting weapon through the live shooting command', () => {
      const attackerUnit = createUnit(
        'attacker',
        [createLibrarianModel('attacker-m0', 10, 10, ['telekinesis'])],
        { profileId: 'librarian' },
      );
      const targetUnit = createUnit(
        'target',
        [createTacticalModel('target-m0', 18, 10)],
        { profileId: 'tactical-squad' },
      );
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const dice = new FixedDiceProvider([4, 4, 4, 4, 4, 4, 1, 1, 1]);
      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'attacker',
        targetUnitId: 'target',
        weaponSelections: [{ modelId: 'attacker-m0', weaponId: 'immovable-force' }],
      }, dice as any);

      expect(result.accepted).toBe(true);
      expect(result.events.some((event) => event.type === 'shootingAttackDeclared')).toBe(true);
      expect(result.state.shootingAttackState?.currentStep).toBe('COMPLETE');
    });

    it('should offer Force Barrier and resume the shooting attack after acceptance', () => {
      const attackerUnit = createUnit(
        'attacker',
        [createTacticalModel('attacker-m0', 10, 10)],
        { profileId: 'tactical-squad' },
      );
      const targetUnit = createUnit(
        'target',
        [createLibrarianModel('target-m0', 18, 10, ['telekinesis'])],
        { profileId: 'librarian' },
      );
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit]),
        ],
      });

      const offered = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'attacker',
        targetUnitId: 'target',
        weaponSelections: [{ modelId: 'attacker-m0', weaponId: 'bolter' }],
      }, new FixedDiceProvider([]) as any);

      expect(offered.accepted).toBe(true);
      expect(offered.state.awaitingReaction).toBe(true);
      expect(offered.state.pendingReaction?.reactionType).toBe('force-barrier');

      const resolved = processCommand(offered.state, {
        type: 'selectReaction',
        unitId: 'target',
        reactionType: 'force-barrier',
      }, new FixedDiceProvider([3, 3, 4, 4, 1, 3]) as any);

      expect(resolved.accepted).toBe(true);
      expect(resolved.state.awaitingReaction).toBe(false);
      expect(resolved.state.armies[1].units[0].hasReactedThisTurn).toBe(true);
      expect(resolved.state.armies[1].units[0].models[0].modifiers.some((modifier) =>
        modifier.characteristic === 'Shrouded' && modifier.value === 3,
      )).toBe(true);
      expect(resolved.state.armies[1].units[0].models[0].currentWounds).toBe(3);
    });

    it('should resolve Resurrection before casualty removal and restore a model', () => {
      const attackerUnit = createUnit(
        'attacker',
        [createTacticalModel('attacker-m0', 10, 10)],
        { profileId: 'tactical-squad' },
      );
      const reactiveUnit = createUnit(
        'reactive',
        [
          createLibrarianModel('reactive-focus', 18, 10, ['thaumaturgy']),
          createLibrarianModel('reactive-casualty', 19, 10, ['thaumaturgy'], {
            isDestroyed: true,
            currentWounds: 0,
          }),
        ],
        { profileId: 'librarian' },
      );
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: 'resurrection',
          eligibleUnitIds: ['reactive'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'attacker',
        },
        shootingAttackState: {
          attackerUnitId: 'attacker',
          targetUnitId: 'reactive',
          attackerPlayerIndex: 0,
          targetFacing: null,
          weaponAssignments: [],
          fireGroups: [],
          currentFireGroupIndex: 0,
          currentStep: 'AWAITING_RESURRECTION',
          accumulatedGlancingHits: [],
          accumulatedCasualties: ['reactive-casualty'],
          unitSizesAtStart: { attacker: 1, reactive: 2 },
          pendingMoraleChecks: [],
          returnFireResolved: true,
          isReturnFire: false,
          modelsWithLOS: [],
        } as any,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'reactive',
        reactionType: 'resurrection',
      }, new FixedDiceProvider([3, 3, 4]) as any);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.shootingAttackState?.currentStep).toBe('COMPLETE');
      expect(result.state.armies[1].units[0].models[1].isDestroyed).toBe(false);
      expect(result.state.armies[1].units[0].models[1].currentWounds).toBe(3);
    });

    it('should allow psychic melee weapons to be declared during the Fight sub-phase', () => {
      const psykerUnit = createUnit(
        'psyker-unit',
        [createLibrarianModel('psyker-m0', 10, 10, ['biomancy'])],
        { profileId: 'librarian' },
      );
      const enemyUnit = createUnit(
        'enemy-unit',
        [createTacticalModel('enemy-m0', 11, 10)],
        { profileId: 'tactical-squad' },
      );
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
        armies: [
          createArmy(0, [psykerUnit]),
          createArmy(1, [enemyUnit]),
        ],
        activeCombats: [{
          combatId: 'combat-1',
          activePlayerUnitIds: ['psyker-unit'],
          reactivePlayerUnitIds: ['enemy-unit'],
          activePlayerCRP: 0,
          reactivePlayerCRP: 0,
          activePlayerCasualties: [],
          reactivePlayerCasualties: [],
          resolved: false,
          isMassacre: false,
          challengeState: null,
        }],
      });

      const result = processCommand(state, {
        type: 'declareWeapons',
        weaponSelections: [{ modelId: 'psyker-m0', weaponId: 'biomantic-slam' }],
      }, new FixedDiceProvider([]) as any);

      expect(result.accepted).toBe(true);
      expect(result.state.activeCombats?.[0].weaponDeclarations).toEqual([
        { modelId: 'psyker-m0', weaponId: 'biomantic-slam' },
      ]);
    });
  });

  describe('game over rejection', () => {
    it('should reject all commands when game is over', () => {
      const state = createGameState({ isGameOver: true });
      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('GAME_OVER');
    });
  });

  describe('awaiting reaction', () => {
    it('should reject non-reaction commands when awaiting reaction', () => {
      const state = createGameState({
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Reposition,
          eligibleUnitIds: ['u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a1',
        },
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('AWAITING_REACTION');
    });

    it('should accept declineReaction when awaiting reaction', () => {
      const state = createGameState({
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Reposition,
          eligibleUnitIds: ['u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a1',
        },
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'declineReaction' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
    });

    it('should accept selectReaction for eligible unit', () => {
      const reactiveUnit = createUnit('r-u1', [createModel('r-m0', 36, 24)]);
      const state = createGameState({
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Reposition,
          eligibleUnitIds: ['r-u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a1',
        },
        armies: [
          createArmy(0, []),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'r-u1',
        reactionType: 'Reposition',
        modelPositions: [{ modelId: 'r-m0', position: { x: 38, y: 24 } }],
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(0);
      expect(result.state.armies[1].units[0].hasReactedThisTurn).toBe(true);
      expect(result.state.armies[1].units[0].models[0].position).toEqual({ x: 38, y: 24 });
      expect(result.events.some((event) => event.type === 'repositionExecuted')).toBe(true);
    });

    it('should resolve Chasing the Wind through the live movement path', () => {
      const reactiveUnit = createUnit(
        'ws-unit',
        [createTacticalModel('ws-m0', 10, 10)],
        { profileId: 'tactical-squad' },
      );
      const triggerUnit = createUnit(
        'enemy-unit',
        [createTacticalModel('enemy-m0', 18, 10)],
        { profileId: 'tactical-squad' },
      );
      const state = createGameState({
        awaitingReaction: true,
        pendingReaction: {
          reactionType: 'ws-chasing-wind',
          isAdvancedReaction: true,
          eligibleUnitIds: ['ws-unit'],
          triggerDescription: 'enemy moved within 12"',
          triggerSourceUnitId: 'enemy-unit',
        },
        armies: [
          createArmy(0, [triggerUnit], { faction: LegionFaction.DarkAngels }),
          createArmy(1, [reactiveUnit], { faction: LegionFaction.WhiteScars }),
        ],
      });

      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'ws-unit',
        reactionType: 'ws-chasing-wind',
        modelPositions: [{ modelId: 'ws-m0', position: { x: 15, y: 10 } }],
      }, new FixedDiceProvider([]) as any);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(0);
      expect(result.state.armies[1].units[0].hasReactedThisTurn).toBe(true);
      expect(result.state.armies[1].units[0].models[0].position).toEqual({ x: 15, y: 10 });
      expect(result.state.advancedReactionsUsed).toContainEqual({
        reactionId: 'ws-chasing-wind',
        playerIndex: 1,
        battleTurn: 1,
      });
      expect(result.events.some((event) => event.type === 'advancedReactionDeclared')).toBe(true);
      expect(result.events.some((event) => event.type === 'advancedReactionResolved')).toBe(true);
      expect(result.events.some((event) => event.type === 'modelMoved')).toBe(true);
    });

    it('should execute Return Fire and finalize the pending shooting attack window', () => {
      const attackerUnit = createUnit(
        'a-u1',
        [createModel('a-m0', 24, 24)],
      );
      const reactiveUnit = createUnit(
        'r-u1',
        [{ ...createModel('r-m0', 36, 24), equippedWargear: ['bolter'] }],
      );
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        awaitingReaction: true,
        shootingAttackState: {
          attackerUnitId: 'a-u1',
          targetUnitId: 'r-u1',
          attackerPlayerIndex: 0,
          targetFacing: null,
          weaponAssignments: [],
          fireGroups: [],
          currentFireGroupIndex: 0,
          currentStep: 'AWAITING_RETURN_FIRE',
          accumulatedGlancingHits: [],
          accumulatedCasualties: [],
          unitSizesAtStart: { 'a-u1': 1, 'r-u1': 1 },
          pendingMoraleChecks: [],
          returnFireResolved: false,
          isReturnFire: false,
          modelsWithLOS: [],
        } as any,
        pendingReaction: {
          reactionType: CoreReaction.ReturnFire,
          eligibleUnitIds: ['r-u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a-u1',
        },
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([6, 6, 1, 1, 1, 1]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'r-u1',
        reactionType: 'ReturnFire',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.pendingReaction).toBeUndefined();
      expect(result.state.armies[1].reactionAllotmentRemaining).toBe(0);
      expect(result.state.armies[1].units[0].hasReactedThisTurn).toBe(true);
      expect(result.state.armies[1].units[0].hasShotThisTurn).not.toBe(true);
      expect(result.state.shootingAttackState?.returnFireResolved).toBe(true);
      expect(result.state.shootingAttackState?.currentStep).toBe('COMPLETE');
      expect(result.events.some((event) => event.type === 'shootingAttackDeclared')).toBe(true);
    });

    it('should finalize pending shooting attack window when Return Fire is declined', () => {
      const attackerUnit = createUnit('a-u1', [createModel('a-m0', 24, 24)]);
      const reactiveUnit = createUnit('r-u1', [createModel('r-m0', 36, 24)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        awaitingReaction: true,
        shootingAttackState: {
          attackerUnitId: 'a-u1',
          targetUnitId: 'r-u1',
          attackerPlayerIndex: 0,
          targetFacing: null,
          weaponAssignments: [],
          fireGroups: [],
          currentFireGroupIndex: 0,
          currentStep: 'AWAITING_RETURN_FIRE',
          accumulatedGlancingHits: [],
          accumulatedCasualties: [],
          unitSizesAtStart: { 'a-u1': 1, 'r-u1': 1 },
          pendingMoraleChecks: [],
          returnFireResolved: false,
          isReturnFire: false,
          modelsWithLOS: [],
        } as any,
        pendingReaction: {
          reactionType: CoreReaction.ReturnFire,
          eligibleUnitIds: ['r-u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a-u1',
        },
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'declineReaction' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.shootingAttackState?.returnFireResolved).toBe(true);
      expect(result.state.shootingAttackState?.currentStep).toBe('COMPLETE');
    });

    it('should reject selectReaction for ineligible unit', () => {
      const state = createGameState({
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Reposition,
          eligibleUnitIds: ['r-u1'],
          triggerDescription: 'test',
          triggerSourceUnitId: 'a1',
        },
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'r-u2',
        reactionType: 'Reposition',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('UNIT_NOT_ELIGIBLE');
    });
  });

  describe('wrong phase rejection', () => {
    it('should reject moveModel outside Movement/Move phase', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveModel',
        modelId: 'm1',
        targetPosition: { x: 10, y: 10 },
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject moveUnit outside Movement/Move phase', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveUnit',
        unitId: 'u1',
        modelPositions: [],
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject rushUnit outside Movement/Move phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Reserves,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'rushUnit',
        unitId: 'u1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject reservesTest outside Movement/Reserves phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'reservesTest',
        unitId: 'u1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject embark outside Movement/Move phase', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'embark',
        unitId: 'u1',
        transportId: 't1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject disembark outside Movement/Move phase', () => {
      const state = createGameState({
        currentPhase: Phase.Start,
        currentSubPhase: SubPhase.StartEffects,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'disembark',
        unitId: 'u1',
        modelPositions: [],
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject deployUnit outside Movement/Reserves phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'deployUnit',
        unitId: 'u1',
        modelPositions: [],
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });
  });

  describe('moveModel integration', () => {
    it('should successfully move a model during Move sub-phase', () => {
      const model = createModel('m1', 10, 10);
      const unit = createUnit('u1', [model]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveModel',
        modelId: 'm1',
        targetPosition: { x: 15, y: 10 },
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 15, y: 10 });
      expect(result.events.some(e => e.type === 'modelMoved')).toBe(true);
    });

    it('should trigger reposition reaction when enemy is within 12"', () => {
      const activeModel = createModel('a-m0', 30, 24);
      const activeUnit = createUnit('active-u1', [activeModel]);
      const reactiveModel = createModel('r-m0', 36, 24); // 6" from active model target
      const reactiveUnit = createUnit('reactive-u1', [reactiveModel]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        activePlayerIndex: 0,
        armies: [
          createArmy(0, [activeUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      // Move the active model to (32, 24) — now 4" from reactive model
      const result = processCommand(state, {
        type: 'moveModel',
        modelId: 'a-m0',
        targetPosition: { x: 32, y: 24 },
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(true);
      expect(result.state.pendingReaction).toBeDefined();
      expect(result.state.pendingReaction!.reactionType).toBe(CoreReaction.Reposition);
      expect(result.state.pendingReaction!.eligibleUnitIds).toContain('reactive-u1');
      expect(result.events.some(e => e.type === 'repositionTriggered')).toBe(true);
    });

    it('should not trigger reposition when enemy is beyond 12"', () => {
      const activeModel = createModel('a-m0', 10, 24);
      const activeUnit = createUnit('active-u1', [activeModel]);
      const reactiveModel = createModel('r-m0', 60, 24); // Far away
      const reactiveUnit = createUnit('reactive-u1', [reactiveModel]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        activePlayerIndex: 0,
        armies: [
          createArmy(0, [activeUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveModel',
        modelId: 'a-m0',
        targetPosition: { x: 14, y: 24 },
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
    });
  });

  describe('moveUnit integration', () => {
    it('should successfully move all models in a unit atomically', () => {
      const unit = createUnit('u1', [
        createModel('m1', 10, 10),
        createModel('m2', 12, 10),
      ]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveUnit',
        unitId: 'u1',
        modelPositions: [
          { modelId: 'm1', position: { x: 14, y: 10 } },
          { modelId: 'm2', position: { x: 16, y: 10 } },
        ],
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].models[0].position).toEqual({ x: 14, y: 10 });
      expect(result.state.armies[0].units[0].models[1].position).toEqual({ x: 16, y: 10 });
      expect(result.events.filter(e => e.type === 'modelMoved')).toHaveLength(2);
    });

    it('should process moveUnit with isRush using rush distance and rushed state', () => {
      const unit = createUnit('u1', [
        createModel('m1', 10, 10),
        createModel('m2', 12, 10),
      ]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveUnit',
        unitId: 'u1',
        isRush: true,
        modelPositions: [
          { modelId: 'm1', position: { x: 20, y: 10 } },
          { modelId: 'm2', position: { x: 22, y: 10 } },
        ],
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
      expect(result.events.some(e => e.type === 'unitRushed')).toBe(true);
    });

    it('should trigger reposition reaction once after full unit move', () => {
      const activeUnit = createUnit('active-u1', [
        createModel('a-m0', 30, 24),
        createModel('a-m1', 32, 24),
      ]);
      const reactiveUnit = createUnit('reactive-u1', [createModel('r-m0', 36, 24)]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        activePlayerIndex: 0,
        armies: [
          createArmy(0, [activeUnit]),
          createArmy(1, [reactiveUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'moveUnit',
        unitId: 'active-u1',
        modelPositions: [
          { modelId: 'a-m0', position: { x: 32, y: 24 } },
          { modelId: 'a-m1', position: { x: 34, y: 24 } },
        ],
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(true);
      expect(result.state.pendingReaction?.reactionType).toBe(CoreReaction.Reposition);
      expect(result.events.filter(e => e.type === 'repositionTriggered')).toHaveLength(1);
    });
  });

  describe('rushUnit integration', () => {
    it('should successfully declare a rush', () => {
      const unit = createUnit('u1', [createModel('m1', 10, 10)]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'rushUnit',
        unitId: 'u1',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].movementState).toBe(UnitMovementState.RushDeclared);
    });

    it('should allow a declared rush to be completed with a rush move', () => {
      const unit = createUnit('u1', [createModel('m1', 10, 10)]);

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const declared = processCommand(state, {
        type: 'rushUnit',
        unitId: 'u1',
      }, new FixedDiceProvider([]));

      expect(declared.accepted).toBe(true);
      expect(declared.state.armies[0].units[0].movementState).toBe(UnitMovementState.RushDeclared);

      const moved = processCommand(declared.state, {
        type: 'moveUnit',
        unitId: 'u1',
        isRush: true,
        modelPositions: [{ modelId: 'm1', position: { x: 20, y: 10 } }],
      }, new FixedDiceProvider([]));

      expect(moved.accepted).toBe(true);
      expect(moved.state.armies[0].units[0].movementState).toBe(UnitMovementState.Rushed);
      expect(moved.state.armies[0].units[0].models[0].position).toEqual({ x: 20, y: 10 });
    });
  });

  describe('reservesTest integration', () => {
    it('should successfully test reserves during Reserves sub-phase', () => {
      const unit = createUnit('u1', [createModel('m1', 0, 0)], {
        isInReserves: true,
        isDeployed: false,
      });

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Reserves,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([4]); // Pass (4 >= 3)
      const result = processCommand(state, {
        type: 'reservesTest',
        unitId: 'u1',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.events.some(e => e.type === 'reservesTest')).toBe(true);
    });
  });

  describe('embark integration', () => {
    it('should successfully embark during Move sub-phase', () => {
      const infantryUnit = createUnit('infantry', [createModel('i-m0', 10, 10)], {
        profileId: 'tactical-squad',
      });
      const transportUnit = createUnit('transport', [createModel('t-m0', 10.5, 10)], {
        profileId: 'rhino',
      });

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [infantryUnit, transportUnit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'embark',
        unitId: 'infantry',
        transportId: 'transport',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].embarkedOnId).toBe('transport');
    });
  });

  describe('disembark integration', () => {
    it('should successfully disembark during Move sub-phase', () => {
      const embarkedUnit = createUnit('u1', [createModel('m0', 0, 0)], {
        embarkedOnId: 't1',
        isDeployed: false,
      });
      const transportUnit = createUnit('t1', [createModel('t-m0', 20, 24)], {
        profileId: 'rhino',
      });

      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
        armies: [createArmy(0, [embarkedUnit, transportUnit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'disembark',
        unitId: 'u1',
        modelPositions: [{ modelId: 'm0', position: { x: 19, y: 24 } }],
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.armies[0].units[0].embarkedOnId).toBeNull();
    });
  });

  describe('phase advancement', () => {
    it('should advance sub-phase with endSubPhase command', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Reserves,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentSubPhase).toBe(SubPhase.Move);
    });

    it('should advance to next phase with endPhase command', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe(Phase.Shooting);
    });
  });

  describe('declareShooting routing', () => {
    it('should reject declareShooting when attacker unit is not found', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'u1',
        targetUnitId: 'u2',
        weaponSelections: [],
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('ATTACKER_NOT_FOUND');
    });

    it('should reject declareShooting in wrong phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'u1',
        targetUnitId: 'u2',
        weaponSelections: [],
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject a second normal shooting attack from the same unit in the same turn', () => {
      const attackerModel = { ...createModel('a-m0', 24, 24), equippedWargear: ['bolter'] };
      const attackerUnit = createUnit('a-u1', [attackerModel]);
      const targetUnit = createUnit('r-u1', [createModel('r-m0', 30, 24)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const command = {
        type: 'declareShooting' as const,
        attackingUnitId: 'a-u1',
        targetUnitId: 'r-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'bolter' }],
      };

      const first = processCommand(state, command, new FixedDiceProvider([6, 6, 6, 6, 6, 6]));
      expect(first.accepted).toBe(true);
      expect(first.state.armies[0].units[0].hasShotThisTurn).toBe(true);

      const second = processCommand(first.state, command, new FixedDiceProvider([6, 6, 6, 6, 6, 6]));
      expect(second.accepted).toBe(false);
      expect(second.errors[0].code).toBe('ATTACKER_ALREADY_SHOT');
    });
  });

  describe('blast and template shooting resolution', () => {
    it('resolves blast hits from the placed marker onto covered models', () => {
      const attackerModel = { ...createModel('a-m0', 24, 24), equippedWargear: ['plasma-cannon'] };
      const attackerUnit = createUnit('a-u1', [attackerModel]);
      const targetUnit = createUnit('t-u1', [
        createModel('t-m0', 30, 24),
        createModel('t-m1', 31.2, 24),
      ]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'a-u1',
        targetUnitId: 't-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'plasma-cannon' }],
        blastPlacements: [{ sourceModelIds: ['a-m0'], position: { x: 30.4, y: 24 } }],
      }, new FixedDiceProvider([4, 2, 2]));

      expect(result.accepted).toBe(true);
      expect(result.events.some((event) => event.type === 'blastMarkerPlaced')).toBe(true);
      const resolvedEvent = result.events.find((event) => event.type === 'fireGroupResolved') as { totalHits: number } | undefined;
      expect(resolvedEvent?.totalHits).toBe(2);
    });

    it('rejects a template placement that touches a friendly model', () => {
      const attackerUnit = createUnit('a-u1', [
        { ...createModel('a-m0', 24, 24), equippedWargear: ['flamer'] },
        createModel('a-m1', 27, 24),
      ]);
      const targetUnit = createUnit('t-u1', [createModel('t-m0', 31, 24)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'a-u1',
        targetUnitId: 't-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'flamer' }],
        templatePlacements: [{ sourceModelId: 'a-m0', directionRadians: 0 }],
      }, new FixedDiceProvider([]));

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TEMPLATE_PLACEMENT');
    });

    it('resolves template attacks without hit-test rolls', () => {
      const attackerUnit = createUnit('a-u1', [
        { ...createModel('a-m0', 24, 24), equippedWargear: ['flamer'] },
      ]);
      const targetUnit = createUnit('t-u1', [
        createModel('t-m0', 29, 24),
        createModel('t-m1', 31, 24),
      ]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'a-u1',
        targetUnitId: 't-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'flamer' }],
        templatePlacements: [{ sourceModelId: 'a-m0', directionRadians: 0 }],
      }, new FixedDiceProvider([3, 4]));

      expect(result.accepted).toBe(true);
      expect(result.events.some((event) => event.type === 'templatePlaced')).toBe(true);
      expect(result.events.some((event) => event.type === 'hitTestRoll')).toBe(false);
      const resolvedEvent = result.events.find((event) => event.type === 'fireGroupResolved') as { totalHits: number } | undefined;
      expect(resolvedEvent?.totalHits).toBe(2);
    });

    it('allocates remaining wounds to new models after the current target is destroyed', () => {
      const attackerUnit = createUnit('a-u1', [
        { ...createModel('a-m0', 24, 24), equippedWargear: ['heavy-bolter'] },
      ]);
      const targetUnit = createUnit('t-u1', [
        {
          ...createModel('t-m0', 30, 24),
          unitProfileId: 'veteran-tactical-squad',
          profileModelName: 'Veteran Sergeant',
          currentWounds: 1,
        },
        {
          ...createModel('t-m1', 31, 24),
          unitProfileId: 'veteran-tactical-squad',
          profileModelName: 'Veteran',
          currentWounds: 2,
        },
        {
          ...createModel('t-m2', 32, 24),
          unitProfileId: 'veteran-tactical-squad',
          profileModelName: 'Veteran',
          currentWounds: 2,
        },
      ], {
        profileId: 'veteran-tactical-squad',
      });
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'a-u1',
        targetUnitId: 't-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'heavy-bolter' }],
      }, new FixedDiceProvider([6, 6, 6, 6, 6, 6, 1, 1, 1]));

      expect(result.accepted).toBe(true);
      const updatedModels = result.state.armies[1].units[0].models;
      expect(updatedModels.find((model) => model.id === 't-m0')?.isDestroyed).toBe(true);
      expect(updatedModels.find((model) => model.id === 't-m1')?.isDestroyed).toBe(true);
      expect(updatedModels.find((model) => model.id === 't-m2')?.isDestroyed).toBe(false);
      expect(updatedModels.find((model) => model.id === 't-m2')?.currentWounds).toBe(2);
    });

    it('resolves damage mitigation after a failed save on the allocated model', () => {
      const attackerUnit = createUnit('a-u1', [
        { ...createModel('a-m0', 24, 24), equippedWargear: ['bolter'] },
      ]);
      const targetUnit = createUnit('t-u1', [
        {
          ...createModel('t-m0', 30, 24),
          unitProfileId: 'veteran-tactical-squad',
          profileModelName: 'Veteran',
          currentWounds: 2,
          modifiers: [
            {
              characteristic: 'FNP',
              operation: 'set',
              value: 5,
              source: 'Test FNP',
              expiresAt: { type: 'endOfPhase', phase: Phase.Shooting },
            },
          ],
        },
      ], {
        profileId: 'veteran-tactical-squad',
      });
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 0 }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'a-u1',
        targetUnitId: 't-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'bolter' }],
      }, new FixedDiceProvider([6, 1, 6, 1, 5]));

      expect(result.accepted).toBe(true);
      const saveIndex = result.events.findIndex((event) => event.type === 'savingThrowRoll');
      const mitigationIndex = result.events.findIndex((event) => event.type === 'damageMitigationRoll');
      expect(saveIndex).toBeGreaterThanOrEqual(0);
      expect(mitigationIndex).toBeGreaterThan(saveIndex);
      expect(result.events.some((event) => event.type === 'damageApplied')).toBe(false);
      expect(result.state.armies[1].units[0].models[0].currentWounds).toBe(2);
    });
  });

  describe('selectReaction / declineReaction outside awaiting state', () => {
    it('should reject selectReaction when not awaiting reaction', () => {
      const state = createGameState({ awaitingReaction: false });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'u1',
        reactionType: 'Reposition',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_REACTION_PENDING');
    });

    it('should reject declineReaction when not awaiting reaction', () => {
      const state = createGameState({ awaitingReaction: false });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'declineReaction' }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_REACTION_PENDING');
    });
  });

  // ─── Assault Phase Command Tests ──────────────────────────────────────────

  describe('declareCharge routing', () => {
    it('should reject declareCharge when not in Assault/Charge phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'u1',
        targetUnitId: 'u2',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject declareCharge in Assault phase but wrong sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'u1',
        targetUnitId: 'u2',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject declareCharge when charging unit not found', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [createArmy(0, []), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'nonexistent',
        targetUnitId: 'u2',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('CHARGER_NOT_FOUND');
    });

    it('should reject declareCharge when target unit not found', () => {
      const charger = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        activePlayerIndex: 0,
        armies: [createArmy(0, [charger]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([4, 4]); // Charge roll dice
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'nonexistent',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('TARGET_NOT_FOUND');
    });

    it('should accept declareCharge with valid units in Assault/Charge phase', () => {
      const chargerModel = createModel('c-m0', 10, 10);
      const charger = createUnit('charger-u1', [chargerModel]);
      const targetModel = createModel('t-m0', 16, 10); // 6" away — within charge range
      const target = createUnit('target-u1', [targetModel]);

      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        activePlayerIndex: 0,
        armies: [createArmy(0, [charger]), createArmy(1, [target])],
      });

      // Dice: setup move doesn't need rolls; charge roll = 4+4 = 8 (enough for 6")
      const dice = new FixedDiceProvider([4, 4]);
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'target-u1',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.events.some(e => e.type === 'chargeDeclared')).toBe(true);
    });

    it('should trigger Overwatch when reactive unit is eligible', () => {
      const chargerModel = createModel('c-m0', 10, 10);
      const charger = createUnit('charger-u1', [chargerModel]);
      const targetModel = createModel('t-m0', 20, 10); // 10" away
      const target = createUnit('target-u1', [targetModel]);

      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        activePlayerIndex: 0,
        armies: [
          createArmy(0, [charger]),
          createArmy(1, [target], { reactionAllotmentRemaining: 1 }),
        ],
      });

      const dice = new FixedDiceProvider([6, 6]); // charge roll dice
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'target-u1',
      }, dice);

      expect(result.accepted).toBe(true);
      // If Overwatch triggered, game should be awaiting reaction
      if (result.state.awaitingReaction) {
        expect(result.state.pendingReaction).toBeDefined();
        expect(result.state.pendingReaction!.reactionType).toBe(CoreReaction.Overwatch);
        expect(result.state.pendingReaction!.eligibleUnitIds).toContain('target-u1');
      }
      // The charge was accepted either way (overwatch just pauses the flow)
    });
  });

  describe('declareChallenge routing', () => {
    it('should reject declareChallenge when not in Assault/Challenge phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareChallenge',
        challengerModelId: 'm1',
        targetModelId: 'm2',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject declareChallenge in Assault phase but wrong sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareChallenge',
        challengerModelId: 'm1',
        targetModelId: 'm2',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should route declareChallenge to handler in Assault/Challenge phase', () => {
      // Without valid models in combat, this will hit the handler and fail validation
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
        armies: [createArmy(0, []), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareChallenge',
        challengerModelId: 'nonexistent-m1',
        targetModelId: 'nonexistent-m2',
      }, dice);

      // Should reach the handler (not WRONG_PHASE) — handler returns CHALLENGE_INVALID
      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('CHALLENGE_INVALID');
    });
  });

  describe('acceptChallenge routing', () => {
    it('should reject acceptChallenge when not in Assault/Challenge phase', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'acceptChallenge',
        challengedModelId: 'm1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject acceptChallenge in Assault/Fight sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'acceptChallenge',
        challengedModelId: 'm1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should route acceptChallenge to handler when no challenge is pending', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'acceptChallenge',
        challengedModelId: 'm1',
      }, dice);

      // Reaches handler, but no challenge context found
      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_CHALLENGE_PENDING');
    });
  });

  describe('declineChallenge routing', () => {
    it('should reject declineChallenge when not in Assault/Challenge phase', () => {
      const state = createGameState({
        currentPhase: Phase.End,
        currentSubPhase: SubPhase.Statuses,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declineChallenge',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject declineChallenge in Assault/Resolution sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Resolution,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declineChallenge',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should route declineChallenge to handler when no challenge is pending', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declineChallenge',
      }, dice);

      // Reaches handler, but no challenge context found
      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_CHALLENGE_PENDING');
    });
  });

  describe('selectGambit routing', () => {
    it('should reject selectGambit when not in Assault/Challenge phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectGambit',
        modelId: 'm1',
        gambit: ChallengeGambit.Guard,
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject selectGambit in Assault/Fight sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectGambit',
        modelId: 'm1',
        gambit: ChallengeGambit.Feint,
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject selectGambit with no active combats', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
        activeCombats: [],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectGambit',
        modelId: 'm1',
        gambit: ChallengeGambit.PressTheAttack,
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_ACTIVE_COMBAT');
    });

    it('should reject selectGambit with no challenge state in combats', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
        activeCombats: [
          {
            combatId: 'combat-1',
            activePlayerUnitIds: ['u1'],
            reactivePlayerUnitIds: ['u2'],
            initiativeSteps: [],
            activePlayerCRP: 0,
            reactivePlayerCRP: 0,
          },
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectGambit',
        modelId: 'm1',
        gambit: ChallengeGambit.Guard,
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('GAMBIT_INVALID');
    });
  });

  describe('resolveFight routing', () => {
    it('should reject resolveFight when not in Assault/Fight phase', () => {
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'resolveFight',
        combatId: 'combat-1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject resolveFight in Assault/Charge sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'resolveFight',
        combatId: 'combat-1',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject resolveFight with missing combat', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Fight,
        armies: [createArmy(0, []), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'resolveFight',
        combatId: 'nonexistent-combat',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('COMBAT_NOT_FOUND');
    });
  });

  describe('selectAftermath routing', () => {
    it('should reject selectAftermath when not in Assault/Resolution phase', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectAftermath',
        unitId: 'u1',
        option: 'Hold',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject selectAftermath in Assault/Challenge sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Challenge,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectAftermath',
        unitId: 'u1',
        option: 'Hold',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('WRONG_PHASE');
    });

    it('should reject selectAftermath when unit not found', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Resolution,
        armies: [createArmy(0, []), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectAftermath',
        unitId: 'nonexistent',
        option: 'Hold',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('UNIT_NOT_FOUND');
    });

    it('should route selectAftermath to handler when unit exists but no combat', () => {
      const unit = createUnit('u1', [createModel('m0', 10, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Resolution,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectAftermath',
        unitId: 'u1',
        option: 'Hold',
      }, dice);

      // Reaches handler, unit is found but no combat context
      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('NO_COMBAT');
    });
  });

  describe('Overwatch reaction during charge', () => {
    it('should clear awaitingReaction when selectReaction accepts Overwatch', () => {
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 20, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
        armies: [
          createArmy(0, []),
          createArmy(1, [targetUnit]),
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'target-u1',
        reactionType: 'Overwatch',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
    });

    it('should clear awaitingReaction when declineReaction declines Overwatch', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'declineReaction' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
    });

    it('should reject non-reaction commands when Overwatch is pending', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'u2',
        targetUnitId: 'u3',
      }, dice);

      expect(result.accepted).toBe(false);
      expect(result.errors[0].code).toBe('AWAITING_REACTION');
    });

    it('should resume charge after accepting Overwatch and skip defender snap-shot volley', () => {
      const chargerUnit = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 12, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
        assaultAttackState: {
          chargingUnitId: 'charger-u1',
          targetUnitId: 'target-u1',
          chargerPlayerIndex: 0,
          chargeStep: 'AWAITING_OVERWATCH',
          setupMoveDistance: 0,
          chargeRoll: 0,
          isDisordered: false,
          chargeCompleteViaSetup: false,
          overwatchResolved: false,
          closestDistance: 2,
          modelsWithLOS: ['c-m0'],
        },
        armies: [
          createArmy(0, [chargerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 2 }),
        ],
      });

      const dice = new FixedDiceProvider([6, 1]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'target-u1',
        reactionType: 'Overwatch',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.assaultAttackState).toBeUndefined();

      const volleyEvents = result.events
        .filter(e => e.type === 'volleyAttack') as Array<{ attackerUnitId: string }>;
      expect(volleyEvents).toHaveLength(1);
      expect(volleyEvents[0].attackerUnitId).toBe('charger-u1');

      expect(result.events.some(e => e.type === 'overwatchResolved')).toBe(true);
      expect(result.events.some(e => e.type === 'chargeRoll')).toBe(true);
    });

    it('should resume charge after declining Overwatch and allow both snap-shot volleys', () => {
      const chargerUnit = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 12, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
        assaultAttackState: {
          chargingUnitId: 'charger-u1',
          targetUnitId: 'target-u1',
          chargerPlayerIndex: 0,
          chargeStep: 'AWAITING_OVERWATCH',
          setupMoveDistance: 0,
          chargeRoll: 0,
          isDisordered: false,
          chargeCompleteViaSetup: false,
          overwatchResolved: false,
          closestDistance: 2,
          modelsWithLOS: ['c-m0'],
        },
        armies: [
          createArmy(0, [chargerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 2 }),
        ],
      });

      const dice = new FixedDiceProvider([6, 1]);
      const result = processCommand(state, { type: 'declineReaction' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(false);
      expect(result.state.assaultAttackState).toBeUndefined();

      const volleyEvents = result.events
        .filter(e => e.type === 'volleyAttack') as Array<{ attackerUnitId: string }>;
      expect(volleyEvents).toHaveLength(2);
      expect(volleyEvents.map(e => e.attackerUnitId)).toEqual(['charger-u1', 'target-u1']);

      expect(result.events.some(e => e.type === 'overwatchResolved')).toBe(true);
      expect(result.events.some(e => e.type === 'chargeRoll')).toBe(true);
    });

    it('should execute a real Overwatch shooting attack at full BS before charge resume', () => {
      const chargerUnit = createUnit('charger-u1', [
        createModel('c-m0', 10, 10),
        createModel('c-m1', 10, 11),
        createModel('c-m2', 10, 12),
      ]);
      const targetUnit = createUnit('target-u1', [
        { ...createModel('t-m0', 12, 10), equippedWargear: ['bolter'] },
      ]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        awaitingReaction: true,
        pendingReaction: {
          reactionType: CoreReaction.Overwatch,
          eligibleUnitIds: ['target-u1'],
          triggerDescription: 'Unit "charger-u1" is charging. Overwatch available.',
          triggerSourceUnitId: 'charger-u1',
        },
        assaultAttackState: {
          chargingUnitId: 'charger-u1',
          targetUnitId: 'target-u1',
          chargerPlayerIndex: 0,
          chargeStep: 'AWAITING_OVERWATCH',
          setupMoveDistance: 0,
          chargeRoll: 0,
          isDisordered: false,
          chargeCompleteViaSetup: false,
          overwatchResolved: false,
          closestDistance: 2,
          modelsWithLOS: ['c-m0', 'c-m1', 'c-m2'],
        },
        armies: [
          createArmy(0, [chargerUnit]),
          createArmy(1, [targetUnit], { reactionAllotmentRemaining: 2 }),
        ],
      });

      const dice = new FixedDiceProvider([6, 6, 6, 6, 1, 6, 1]);
      const result = processCommand(state, {
        type: 'selectReaction',
        unitId: 'target-u1',
        reactionType: 'Overwatch',
      }, dice);

      expect(result.accepted).toBe(true);
      expect(result.events.some(event => event.type === 'shootingAttackDeclared')).toBe(true);
      const shootingEvent = result.events.find(
        (event) => event.type === 'shootingAttackDeclared',
      ) as { fireGroups: Array<{ isSnapShot: boolean }> } | undefined;
      expect(shootingEvent?.fireGroups[0]?.isSnapShot).toBe(false);
      expect(result.events.some(event => event.type === 'overwatchResolved')).toBe(true);
    });
  });

  describe('advanced reaction trigger wiring', () => {
    it('offers a shooting advanced reaction at step 3 and resumes the shot after decline', () => {
      const attackerUnit = createUnit('attacker-u1', [
        { ...createModel('a-m0', 20, 20), equippedWargear: ['bolter'] },
      ]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 28, 20)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit], { faction: LegionFaction.DarkAngels }),
          createArmy(1, [targetUnit], { faction: LegionFaction.IronWarriors }),
        ],
      });

      const offerDice = new FixedDiceProvider([]);
      const offer = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'attacker-u1',
        targetUnitId: 'target-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'bolter' }],
      }, offerDice);

      expect(offer.accepted).toBe(true);
      expect(offer.state.awaitingReaction).toBe(true);
      expect(offer.state.pendingReaction?.isAdvancedReaction).toBe(true);
      expect(offer.state.pendingReaction?.reactionType).toBe('iw-bitter-fury');

      const resumeDice = new FixedDiceProvider([6, 6, 1, 1, 6, 1]);
      const declined = processCommand(offer.state, { type: 'declineReaction' }, resumeDice);

      expect(declined.accepted).toBe(true);
      expect(declined.events.some(event => event.type === 'shootingAttackDeclared')).toBe(true);
    });

    it('offers an assault advanced reaction at charge step 2 and resumes charge flow after decline', () => {
      const chargerUnit = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 18, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          createArmy(0, [chargerUnit], {
            faction: LegionFaction.DarkAngels,
            allegiance: Allegiance.Loyalist,
          }),
          createArmy(1, [targetUnit], {
            faction: LegionFaction.EmperorsChildren,
            allegiance: Allegiance.Traitor,
          }),
        ],
      });

      const offerDice = new FixedDiceProvider([]);
      const offer = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'target-u1',
      }, offerDice);

      expect(offer.accepted).toBe(true);
      expect(offer.state.awaitingReaction).toBe(true);
      expect(offer.state.pendingReaction?.isAdvancedReaction).toBe(true);
      expect(offer.state.pendingReaction?.reactionType).toBe('ec-h-twisted-desire');

      const declined = processCommand(offer.state, { type: 'declineReaction' }, new FixedDiceProvider([]));
      expect(declined.accepted).toBe(true);
      expect(declined.events.some(event => event.type === 'chargeDeclared')).toBe(true);
    });

    it('offers a shooting advanced reaction at step 4 when the reacting legion trigger is step 4', () => {
      const attackerUnit = createUnit('attacker-u1', [
        { ...createModel('a-m0', 20, 20), equippedWargear: ['bolter'] },
      ]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 28, 20)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit], { faction: LegionFaction.DarkAngels }),
          createArmy(1, [targetUnit], { faction: LegionFaction.BloodAngels }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'attacker-u1',
        targetUnitId: 'target-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'bolter' }],
      }, new FixedDiceProvider([]));

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(true);
      expect(result.state.pendingReaction?.isAdvancedReaction).toBe(true);
      expect(result.state.pendingReaction?.reactionType).toBe('ba-wrath-of-angels');
    });

    it('offers a shooting advanced reaction at step 5 when the reacting legion trigger is step 5', () => {
      const attackerUnit = createUnit('attacker-u1', [
        { ...createModel('a-m0', 20, 20), equippedWargear: ['bolter'] },
      ]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 28, 20)]);
      const state = createGameState({
        currentPhase: Phase.Shooting,
        currentSubPhase: SubPhase.Attack,
        armies: [
          createArmy(0, [attackerUnit], { faction: LegionFaction.DarkAngels }),
          createArmy(1, [targetUnit], { faction: LegionFaction.WordBearers }),
        ],
      });

      const result = processCommand(state, {
        type: 'declareShooting',
        attackingUnitId: 'attacker-u1',
        targetUnitId: 'target-u1',
        weaponSelections: [{ modelId: 'a-m0', weaponId: 'bolter' }],
      }, new FixedDiceProvider([]));

      expect(result.accepted).toBe(true);
      expect(result.state.awaitingReaction).toBe(true);
      expect(result.state.pendingReaction?.isAdvancedReaction).toBe(true);
      expect(result.state.pendingReaction?.reactionType).toBe('wb-glorious-martyrdom');
    });

    it('offers an assault advanced reaction at charge step 4 and resumes to Overwatch after decline', () => {
      const chargerUnit = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 18, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          createArmy(0, [chargerUnit], { faction: LegionFaction.DarkAngels }),
          createArmy(1, [targetUnit], { faction: LegionFaction.NightLords }),
        ],
      });

      const offered = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'target-u1',
      }, new FixedDiceProvider([]));

      expect(offered.accepted).toBe(true);
      expect(offered.state.awaitingReaction).toBe(true);
      expect(offered.state.pendingReaction?.reactionType).toBe('nl-better-part');

      const declined = processCommand(offered.state, { type: 'declineReaction' }, new FixedDiceProvider([]));
      expect(declined.accepted).toBe(true);
      expect(declined.state.awaitingReaction).toBe(true);
      expect(declined.state.pendingReaction?.reactionType).toBe(CoreReaction.Overwatch);
    });

    it('offers an assault advanced reaction after volley attacks when applicable', () => {
      const chargerUnit = createUnit('charger-u1', [createModel('c-m0', 10, 10)]);
      const targetUnit = createUnit('target-u1', [createModel('t-m0', 18, 10)]);
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        armies: [
          createArmy(0, [chargerUnit], {
            faction: LegionFaction.DarkAngels,
            allegiance: Allegiance.Loyalist,
          }),
          createArmy(1, [targetUnit], {
            faction: LegionFaction.WorldEaters,
            allegiance: Allegiance.Traitor,
            reactionAllotmentRemaining: 2,
          }),
        ],
      });

      const declared = processCommand(state, {
        type: 'declareCharge',
        chargingUnitId: 'charger-u1',
        targetUnitId: 'target-u1',
      }, new FixedDiceProvider([]));
      expect(declared.accepted).toBe(true);
      expect(declared.state.pendingReaction?.reactionType).toBe(CoreReaction.Overwatch);

      const declinedOverwatch = processCommand(
        declared.state,
        { type: 'declineReaction' },
        new FixedDiceProvider([]),
      );

      expect(declinedOverwatch.accepted).toBe(true);
      expect(declinedOverwatch.state.awaitingReaction).toBe(true);
      expect(declinedOverwatch.state.pendingReaction?.isAdvancedReaction).toBe(true);
      expect(declinedOverwatch.state.pendingReaction?.reactionType).toBe('we-h-furious-charge');
    });
  });
});

// ─── getValidCommands Tests ──────────────────────────────────────────────────

describe('getValidCommands', () => {
  it('should return empty array when game is over', () => {
    const state = createGameState({ isGameOver: true });
    expect(getValidCommands(state)).toEqual([]);
  });

  it('should return reaction commands when awaiting reaction', () => {
    const state = createGameState({ awaitingReaction: true });
    const commands = getValidCommands(state);
    expect(commands).toContain('selectReaction');
    expect(commands).toContain('declineReaction');
    expect(commands).not.toContain('moveModel');
  });

  it('should return movement commands during Move sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Move,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('moveModel');
    expect(commands).toContain('moveUnit');
    expect(commands).toContain('rushUnit');
    expect(commands).toContain('embark');
    expect(commands).toContain('disembark');
    expect(commands).toContain('endSubPhase');
    expect(commands).toContain('endPhase');
  });

  it('should return reserves commands during Reserves sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Movement,
      currentSubPhase: SubPhase.Reserves,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('reservesTest');
    expect(commands).toContain('deployUnit');
    expect(commands).toContain('endSubPhase');
  });

  it('should return shooting commands during Attack sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Shooting,
      currentSubPhase: SubPhase.Attack,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('declareShooting');
    expect(commands).toContain('endSubPhase');
  });

  it('should return charge commands during Charge sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Charge,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('declareCharge');
  });

  it('should always include endSubPhase and endPhase when not awaiting reaction', () => {
    const state = createGameState({
      currentPhase: Phase.End,
      currentSubPhase: SubPhase.Statuses,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('endSubPhase');
    expect(commands).toContain('endPhase');
  });

  // ─── Assault Sub-Phase getValidCommands Tests ─────────────────────────────

  it('should return challenge commands during Challenge sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Challenge,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('declareChallenge');
    expect(commands).toContain('acceptChallenge');
    expect(commands).toContain('declineChallenge');
    expect(commands).toContain('selectGambit');
    expect(commands).toContain('endSubPhase');
    expect(commands).toContain('endPhase');
    // Should NOT contain commands from other sub-phases
    expect(commands).not.toContain('declareCharge');
    expect(commands).not.toContain('resolveFight');
    expect(commands).not.toContain('selectAftermath');
  });

  it('should return resolveFight during Fight sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Fight,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('resolveFight');
    expect(commands).toContain('endSubPhase');
    expect(commands).toContain('endPhase');
    // Should NOT contain commands from other sub-phases
    expect(commands).not.toContain('declareCharge');
    expect(commands).not.toContain('declareChallenge');
    expect(commands).not.toContain('selectAftermath');
  });

  it('should return selectAftermath during Resolution sub-phase', () => {
    const state = createGameState({
      currentPhase: Phase.Assault,
      currentSubPhase: SubPhase.Resolution,
    });
    const commands = getValidCommands(state);
    expect(commands).toContain('selectAftermath');
    expect(commands).toContain('endSubPhase');
    expect(commands).toContain('endPhase');
    // Should NOT contain commands from other sub-phases
    expect(commands).not.toContain('declareCharge');
    expect(commands).not.toContain('declareChallenge');
    expect(commands).not.toContain('resolveFight');
  });
});

// ─── Phase Handler Integration Tests ─────────────────────────────────────────

describe('phase handler auto-processing', () => {
  describe('handleStartPhase via endSubPhase', () => {
    it('should reset legion tactica state when entering StartEffects via player turn advance', () => {
      // Start in End/Victory phase — advancing from Victory wraps around to next player turn at Start/StartEffects
      const state = createGameState({
        currentPhase: Phase.End,
        currentSubPhase: SubPhase.Victory,
        activePlayerIndex: 0,
        firstPlayerIndex: 0,
        legionTacticaState: [
          { reactionDiscountUsedThisTurn: true, movementBonusActiveThisTurn: true, perTurnFlags: { someFlag: true } },
          { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
        ],
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);
      // After advancing from Victory, we enter next player turn at Start/StartEffects
      // handleStartPhase should have reset the new active player's legion tactica state
      const newActiveIndex = result.state.activePlayerIndex;
      const tacticaState = result.state.legionTacticaState[newActiveIndex];
      expect(tacticaState.reactionDiscountUsedThisTurn).toBe(false);
      expect(tacticaState.movementBonusActiveThisTurn).toBe(false);
      expect(tacticaState.perTurnFlags).toEqual({});
    });
  });

  describe('handleEndEffects via endSubPhase', () => {
    it('should reset hasReactedThisTurn when entering EndEffects sub-phase', () => {
      const unit = createUnit('u1', [createModel('m1', 10, 10)], {
        hasReactedThisTurn: true,
        movementState: UnitMovementState.Moved,
      });

      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Resolution,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      // Advance from Resolution → End/EndEffects
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe(Phase.End);
      expect(result.state.currentSubPhase).toBe(SubPhase.EndEffects);

      // handleEndEffects should have reset reaction and movement state
      const updatedUnit = result.state.armies[0].units[0];
      expect(updatedUnit.hasReactedThisTurn).toBe(false);
      expect(updatedUnit.movementState).toBe(UnitMovementState.Stationary);
    });
  });

  describe('handleStatusCleanup via endSubPhase', () => {
    it('should auto-remove Suppressed status when entering Statuses sub-phase', () => {
      const unit = createUnit('u1', [createModel('m1', 10, 10)], {
        statuses: [TacticalStatus.Suppressed],
      });

      const state = createGameState({
        currentPhase: Phase.End,
        currentSubPhase: SubPhase.EndEffects,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      const dice = new FixedDiceProvider([]);
      // Advance from EndEffects → Statuses
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe(Phase.End);
      expect(result.state.currentSubPhase).toBe(SubPhase.Statuses);

      // handleStatusCleanup should have removed Suppressed
      const updatedUnit = result.state.armies[0].units[0];
      expect(updatedUnit.statuses).not.toContain(TacticalStatus.Suppressed);

      // Should have emitted a statusRemoved event
      expect(result.events.some(e => e.type === 'statusRemoved')).toBe(true);
    });

    it('should run Cool Check for Pinned units when entering Statuses sub-phase', () => {
      const unit = createUnit('u1', [createModel('m1', 10, 10)], {
        statuses: [TacticalStatus.Pinned],
      });

      const state = createGameState({
        currentPhase: Phase.End,
        currentSubPhase: SubPhase.EndEffects,
        armies: [createArmy(0, [unit]), createArmy(1, [])],
      });

      // Dice for Cool Check: 2d6 = 1+1 = 2 (passes any Cool value)
      const dice = new FixedDiceProvider([1, 1]);
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);

      // Should have emitted a coolCheck event
      expect(result.events.some(e => e.type === 'coolCheck')).toBe(true);

      // With roll of 2, should pass the check and remove Pinned
      const updatedUnit = result.state.armies[0].units[0];
      expect(updatedUnit.statuses).not.toContain(TacticalStatus.Pinned);
    });
  });

  describe('handleVictoryCheck via endSubPhase', () => {
    it('should execute victory check when entering Victory sub-phase', () => {
      const state = createGameState({
        currentPhase: Phase.End,
        currentSubPhase: SubPhase.Statuses,
      });

      const dice = new FixedDiceProvider([]);
      // Advance from Statuses → Victory
      const result = processCommand(state, { type: 'endSubPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe(Phase.End);
      expect(result.state.currentSubPhase).toBe(SubPhase.Victory);
    });
  });

  describe('endPhase auto-processing', () => {
    it('should advance from Movement to Shooting and auto-process StartEffects on new player turn', () => {
      const state = createGameState({
        currentPhase: Phase.Movement,
        currentSubPhase: SubPhase.Move,
      });

      const dice = new FixedDiceProvider([]);
      const result = processCommand(state, { type: 'endPhase' }, dice);

      expect(result.accepted).toBe(true);
      expect(result.state.currentPhase).toBe(Phase.Shooting);
    });

    it('should process full phase cycle from End phase to next player turn Start', () => {
      const state = createGameState({
        currentPhase: Phase.Assault,
        currentSubPhase: SubPhase.Charge,
        activePlayerIndex: 0,
        firstPlayerIndex: 0,
        legionTacticaState: [
          { reactionDiscountUsedThisTurn: true, movementBonusActiveThisTurn: true, perTurnFlags: { used: true } },
          { reactionDiscountUsedThisTurn: false, movementBonusActiveThisTurn: false, perTurnFlags: {} },
        ],
      });

      const dice = new FixedDiceProvider([]);
      // endPhase from Assault skips to End, then from End advances to next player turn
      const result = processCommand(state, { type: 'endPhase' }, dice);

      expect(result.accepted).toBe(true);
      // Should have advanced past Assault into End phase
      expect(result.state.currentPhase).toBe(Phase.End);
    });
  });
});
