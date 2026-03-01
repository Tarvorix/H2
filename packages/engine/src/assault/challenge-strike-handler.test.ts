/**
 * Challenge Strike Handler Tests
 * Tests for Challenge Strike and Glory (Steps 4-5 of the Challenge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 4-5
 */

import { describe, it, expect } from 'vitest';
import {
  Phase,
  SubPhase,
  UnitMovementState,
  Allegiance,
  LegionFaction,
  ChallengeGambit,
} from '@hh/types';
import type { GameState, ArmyState, UnitState, ModelState } from '@hh/types';
import type { DiceProvider } from '../types';
import type { ChallengeState } from './assault-types';
import {
  resolveChallengeStrike,
  resolveChallengeGlory,
} from './challenge-strike-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createModel(id: string, x = 0, y = 0, overrides: Partial<ModelState> = {}): ModelState {
  return {
    id,
    profileModelName: 'Legionary',
    unitProfileId: 'tactical',
    position: { x, y },
    currentWounds: 1,
    isDestroyed: false,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
    ...overrides,
  };
}

function createUnit(id: string, overrides: Partial<UnitState> = {}): UnitState {
  return {
    id,
    profileId: 'tactical',
    models: [createModel(`${id}-m0`), createModel(`${id}-m1`)],
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

function createArmy(playerIndex: number, units: UnitState[]): ArmyState {
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

function createChallengeGameState(): GameState {
  const army0Units = [
    createUnit('unit-0', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-1'],
      models: [
        createModel('challenger', 10, 10, {
          profileModelName: 'Sergeant',
          currentWounds: 2,
        }),
      ],
    }),
  ];

  const army1Units = [
    createUnit('unit-1', {
      isLockedInCombat: true,
      engagedWithUnitIds: ['unit-0'],
      models: [
        createModel('challenged', 11, 10, {
          profileModelName: 'Sergeant',
          currentWounds: 2,
        }),
      ],
    }),
  ];

  return {
    gameId: 'test-game',
    battlefield: { width: 72, height: 48 },
    terrain: [],
    armies: [createArmy(0, army0Units), createArmy(1, army1Units)],
    currentBattleTurn: 1,
    maxBattleTurns: 4,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    currentPhase: Phase.Assault,
    currentSubPhase: SubPhase.Challenge,
    awaitingReaction: false,
    isGameOver: false,
    winnerPlayerIndex: null,
    log: [],
    turnHistory: [],
  };
}

function createChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return {
    challengerId: 'challenger',
    challengedId: 'challenged',
    challengerUnitId: 'unit-0',
    challengedUnitId: 'unit-1',
    challengerPlayerIndex: 0,
    challengedPlayerIndex: 1,
    currentStep: 'STRIKE',
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: 0, // Challenger has advantage
    focusRolls: [8, 6],
    challengerWoundsInflicted: 0,
    challengedWoundsInflicted: 0,
    round: 1,
    challengerCRP: 0,
    challengedCRP: 0,
    challengerWeaponId: null,
    challengedWeaponId: null,
    guardUpFocusBonus: {},
    testTheFoeAdvantage: {},
    tauntAndBaitSelections: {},
    withdrawChosen: {},
    ...overrides,
  };
}

function createDiceProvider(values: number[]): DiceProvider {
  let index = 0;
  return {
    rollD6(): number {
      if (index >= values.length) return 4;
      return values[index++];
    },
    rollMultipleD6(count: number): number[] {
      const results: number[] = [];
      for (let i = 0; i < count; i++) {
        results.push(this.rollD6());
      }
      return results;
    },
    rollD3(): number {
      return Math.ceil(this.rollD6() / 2);
    },
    roll2D6(): [number, number] {
      return [this.rollD6(), this.rollD6()];
    },
    rollScatter(): { direction: number; distance: number } {
      return { direction: 0, distance: this.rollD6() };
    },
  };
}

// ─── resolveChallengeStrike ────────────────────────────────────────────────

describe('resolveChallengeStrike', () => {
  it('should have challenger attack first when they have advantage', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState({
      challengeAdvantagePlayerIndex: 0, // Challenger advantage
    });
    // WS4 vs WS4 → need 4+ to hit
    // S4 vs T4 → need 4+ to wound
    // Hit: 5, Wound: 5, Save: 2 (save on 3+ = saved)
    // Hit: 4, Wound: 4, Save: 1 (fails save, wound inflicted)
    // Challenger has 2 attacks (base 1 + advantage) = 3 total
    // Let's give 3 attacks with all rolling high to guarantee some wounds
    const dice = createDiceProvider([
      // Challenger attacks (3 attacks: base 2 + 1 advantage)
      5, 5,  // Attack 1: hit=5, wound=5
      1,     // Save: 1 (fail) → wound applied
      4, 4,  // Attack 2: hit=4, wound=4
      2,     // Save: 2 (fail on 3+) → wound applied
      4, 4,  // Attack 3: hit=4, wound=4
      3,     // Save: 3 (pass on 3+) → saved
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4,  // WS
      4, 4,  // S
      2, 2,  // A (base attacks)
      4, 4,  // T
      3, 3,  // Save (3+)
      null,  // AP
      1,     // Damage
    );

    // Challenger attacked first
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('challengeStrike');
  });

  it('should have challenged attack first when they have advantage', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState({
      challengeAdvantagePlayerIndex: 1, // Challenged advantage
    });
    // All misses so nobody dies
    const dice = createDiceProvider([
      // Challenged attacks first (3: base 2 + 1 advantage)
      1, 1, 1, // All misses
      // Challenger attacks (2: base 2)
      1, 1, // All misses
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
    expect(result.challengeContinues).toBe(true);
  });

  it('should kill challenged model when enough wounds are inflicted', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();

    // All hits, all wounds, all failed saves
    const dice = createDiceProvider([
      // Challenger's 3 attacks (2 base + 1 advantage): hit, wound, save
      6, 6, 1,  // Attack 1: hit, wound, failed save → 1 damage
      6, 6, 1,  // Attack 2: hit, wound, failed save → 1 damage (model has 2W, now dead)
      6, 6, 1,  // Attack 3: hit, wound, failed save → overkill
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenged');
    expect(result.challengeContinues).toBe(false);
    expect(result.challengeState.currentStep).toBe('GLORY');
  });

  it('should kill challenger model when challenged has advantage and inflicts enough wounds', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState({
      challengeAdvantagePlayerIndex: 1, // Challenged has advantage
    });

    // Challenged attacks first, all hits
    const dice = createDiceProvider([
      // Challenged's 3 attacks (2 base + 1 advantage)
      6, 6, 1,  // hit, wound, failed save
      6, 6, 1,  // hit, wound, failed save (2 wounds, model dead)
      6, 6, 1,  // overkill
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenger');
  });

  it('should not let defender attack if slain by first attacker', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();

    // Challenger kills challenged, challenged should NOT attack back
    const dice = createDiceProvider([
      // Challenger's 3 attacks: all kill
      6, 6, 1,
      6, 6, 1,
      6, 6, 1,
      // If challenged attacked, these would be consumed — they shouldn't be
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenged');
    // Challenged should have inflicted 0 wounds (never got to attack)
    expect(result.challengeState.challengedWoundsInflicted).toBe(0);
  });

  it('should grant +1 attack to the Challenge Advantage holder', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState({
      challengeAdvantagePlayerIndex: 0,
    });

    // Challenger has base 2A + 1 advantage = 3 attacks
    // All misses so we just count dice consumed
    const dice = createDiceProvider([
      // Challenger: 3 attacks (2 base + 1 advantage)
      1, // miss
      1, // miss
      1, // miss
      // Challenged: 2 attacks (no advantage bonus)
      1, // miss
      1, // miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
    expect(result.challengeContinues).toBe(true);
  });

  it('should apply AP to modify saves', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();

    // With AP 3, a 3+ save becomes 6+ (3 + 3 = 6)
    const dice = createDiceProvider([
      // Challenger: 3 attacks
      6, 6, 5,  // hit, wound, save roll 5 → 5 < 6 → fails (AP makes save 6+)
      6, 6, 6,  // hit, wound, save roll 6 → 6 >= 6 → passes
      6, 6, 4,  // hit, wound, save roll 4 → fails
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3,
      3,   // AP 3
      1,   // Damage
    );

    // 2 unsaved wounds should be inflicted by challenger (the model has 2W, so it dies)
    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenged');
  });

  it('should apply weapon damage per unsaved wound', () => {
    const state = createChallengeGameState();
    // Give both models 4 wounds
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 4,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 4,
    });
    const challenge = createChallengeState();

    // Damage 2 per wound. 2 unsaved wounds = 4 damage total → kills 4W model
    const dice = createDiceProvider([
      // Challenger: 3 attacks
      6, 6, 1,  // hit, wound, failed save → 2 damage
      6, 6, 1,  // hit, wound, failed save → 2 damage (4 total, model dead)
      1,        // Attack 3 misses
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null,
      2,  // Damage 2 per wound
    );

    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenged');
  });

  it('should handle no save (save = null)', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();

    // No saves — every wound goes through
    const dice = createDiceProvider([
      // Challenger: 3 attacks (2 base + 1 advantage)
      6, 6,  // hit, wound → no save test → damage
      6, 6,  // hit, wound → damage (2 wounds = model dead)
      1,     // miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4,
      null, null,  // No saves
      null, 1,
    );

    expect(result.modelSlain).toBe(true);
    expect(result.slainModelId).toBe('challenged');
  });

  it('should accumulate wounds inflicted in challenge state', () => {
    const state = createChallengeGameState();
    // Give both models lots of wounds so neither dies
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerWoundsInflicted: 2, // Previous round wounds
      challengedWoundsInflicted: 1,
    });

    // 1 wound by challenger, 1 wound by challenged
    const dice = createDiceProvider([
      // Challenger: 3 attacks
      6, 6, 1,  // hit, wound, failed save → 1 damage
      1,        // miss
      1,        // miss
      // Challenged: 2 attacks
      6, 6, 1,  // hit, wound, failed save → 1 damage
      1,        // miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.challengeState.challengerWoundsInflicted).toBe(3); // 2 + 1
    expect(result.challengeState.challengedWoundsInflicted).toBe(2); // 1 + 1
  });

  it('should generate challengeStrike event with correct data', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();
    const dice = createDiceProvider([1, 1, 1, 1, 1]); // All misses

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.events.length).toBe(1);
    const event = result.events[0] as {
      type: string;
      challengerModelId: string;
      challengedModelId: string;
      modelSlain: boolean;
    };
    expect(event.type).toBe('challengeStrike');
    expect(event.challengerModelId).toBe('challenger');
    expect(event.challengedModelId).toBe('challenged');
    expect(event.modelSlain).toBe(false);
  });

  it('should keep step as STRIKE when both survive', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();
    const dice = createDiceProvider([1, 1, 1, 1, 1]); // All misses

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.challengeState.currentStep).toBe('STRIKE');
    expect(result.challengeContinues).toBe(true);
  });

  it('should set step to GLORY when model is slain', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState();
    const dice = createDiceProvider([6, 6, 1, 6, 6, 1]); // 2 unsaved wounds

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.challengeState.currentStep).toBe('GLORY');
    expect(result.challengeContinues).toBe(false);
  });

  // ─── Gambit Modifier Tests ─────────────────────────────────────────────────

  it('should apply Guard gambit (+1 WS, fixed 1 attack)', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.Guard,
    });

    // Guard: fixed 1 attack + 1 advantage = 2 attacks for challenger
    // WS becomes 4+1=5
    const dice = createDiceProvider([
      // Challenger: 2 attacks (fixed 1 + advantage 1)
      1,  // miss
      1,  // miss
      // Challenged: 2 attacks (base 2, no advantage)
      1,  // miss
      1,  // miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 3, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
    expect(result.challengeContinues).toBe(true);
  });

  it('should apply Guard missesGrantFocusBonus', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.Guard,
    });

    // Challenged has 2 attacks, all miss → 2 misses → +2 focus bonus for challenger
    const dice = createDiceProvider([
      1, 1,  // Challenger's 2 attacks (Guard: 1 fixed + 1 advantage): miss
      1, 1,  // Challenged's 2 attacks: miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 3, 2, 4, 4, 3, 3, null, 1,
    );

    // Challenged had 2 attacks, inflicted 0 wounds → 2 misses → +2 bonus
    expect(result.challengeState.guardUpFocusBonus[0]).toBe(2);
  });

  it('should apply Reckless Assault gambit (+1 S, +1 D)', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.RecklessAssault,
    });

    // With Reckless Assault: +1 S and +1 D
    // S becomes 4+1=5, D becomes 1+1=2
    const dice = createDiceProvider([
      // Challenger: 3 attacks (2 base + 1 advantage)
      6, 6, 1,  // hit, wound, failed save → 2 damage (D=1+1=2)
      1,        // miss
      1,        // miss
      // Challenged: 2 attacks
      1, 1,     // miss, miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    // Challenger inflicted 2 damage (1 wound * 2 damage)
    expect(result.challengeState.challengerWoundsInflicted).toBe(2);
  });

  it('should apply Cautious Advance grantsNextRoundAdvantage when both survive', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.CautiousAdvance,
    });

    const dice = createDiceProvider([1, 1, 1, 1, 1]); // All misses

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    // CautiousAdvance grants next round advantage when both survive
    expect(result.challengeState.testTheFoeAdvantage[0]).toBe(true);
    expect(result.modelSlain).toBe(false);
  });

  it('should NOT apply Cautious Advance advantage if model is slain', () => {
    const state = createChallengeGameState();
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.CautiousAdvance,
      challengeAdvantagePlayerIndex: 1, // Challenged attacks first
    });

    // Challenged kills challenger
    const dice = createDiceProvider([
      6, 6, 1, 6, 6, 1, 6, 6, 1,  // Challenged's 3 attacks all wound
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(true);
    expect(result.challengeState.testTheFoeAdvantage[0]).toBeUndefined();
  });

  it('should apply Death or Glory stat swap (use enemy WS if higher)', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.DeathOrGlory,
    });

    // Challenger WS=3, Challenged WS=5
    // Death or Glory: challenger uses enemy's WS since 5 > 3 → effective WS=5
    const dice = createDiceProvider([1, 1, 1, 1, 1]); // All misses

    const result = resolveChallengeStrike(
      state, challenge, dice,
      3, 5, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
  });

  it('should apply Death or Glory stat swap (use own WS-1 if not higher)', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.DeathOrGlory,
    });

    // Challenger WS=5, Challenged WS=3
    // Death or Glory: 3 is NOT > 5, so WS becomes 5-1=4
    const dice = createDiceProvider([1, 1, 1, 1, 1]); // All misses

    const result = resolveChallengeStrike(
      state, challenge, dice,
      5, 3, 4, 4, 2, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
  });

  it('should apply Defensive Stance (fixed 1 attack)', () => {
    const state = createChallengeGameState();
    state.armies[0].units[0].models[0] = createModel('challenger', 10, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    state.armies[1].units[0].models[0] = createModel('challenged', 11, 10, {
      profileModelName: 'Sergeant',
      currentWounds: 10,
    });
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.DefensiveStance,
    });

    // DefensiveStance: fixed 1 attack + 1 advantage = 2 attacks
    const dice = createDiceProvider([
      1, 1,  // Challenger: 2 attacks (1 fixed + 1 advantage), miss
      1, 1,  // Challenged: 2 attacks, miss
    ]);

    const result = resolveChallengeStrike(
      state, challenge, dice,
      4, 4, 4, 4, 3, 2, 4, 4, 3, 3, null, 1,
    );

    expect(result.modelSlain).toBe(false);
  });
});

// ─── resolveChallengeGlory ─────────────────────────────────────────────────

describe('resolveChallengeGlory', () => {
  it('should award CRP to challenger when they inflicted more wounds', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 3,
      challengedWoundsInflicted: 1,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.winnerPlayerIndex).toBe(0);
    expect(result.challengerCRP).toBe(3);
    expect(result.challengedCRP).toBe(0);
  });

  it('should award CRP to challenged when they inflicted more wounds', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 1,
      challengedWoundsInflicted: 4,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.winnerPlayerIndex).toBe(1);
    expect(result.challengerCRP).toBe(0);
    expect(result.challengedCRP).toBe(4);
  });

  it('should award no CRP on draw (equal wounds)', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 2,
      challengedWoundsInflicted: 2,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.winnerPlayerIndex).toBeNull();
    expect(result.challengerCRP).toBe(0);
    expect(result.challengedCRP).toBe(0);
  });

  it('should award no CRP when both inflicted zero wounds', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 0,
      challengedWoundsInflicted: 0,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.winnerPlayerIndex).toBeNull();
    expect(result.challengerCRP).toBe(0);
    expect(result.challengedCRP).toBe(0);
  });

  it('should accumulate CRP in challenge state from previous rounds', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 3,
      challengedWoundsInflicted: 1,
      challengerCRP: 2, // Previous round CRP
      challengedCRP: 1,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.challengeState.challengerCRP).toBe(5); // 2 + 3
    expect(result.challengeState.challengedCRP).toBe(1); // 1 + 0
  });

  it('should set step to GLORY', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 1,
      challengedWoundsInflicted: 0,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.challengeState.currentStep).toBe('GLORY');
  });

  it('should generate challengeGlory event', () => {
    const challenge = createChallengeState({
      challengerWoundsInflicted: 2,
      challengedWoundsInflicted: 0,
    });

    const result = resolveChallengeGlory(challenge);

    expect(result.events.length).toBe(1);
    const event = result.events[0] as {
      type: string;
      challengerCRP: number;
      challengedCRP: number;
      winnerPlayerIndex: number | null;
    };
    expect(event.type).toBe('challengeGlory');
    expect(event.challengerCRP).toBe(2);
    expect(event.challengedCRP).toBe(0);
    expect(event.winnerPlayerIndex).toBe(0);
  });

  it('should apply Death or Glory CRP bonus from tauntAndBaitSelections', () => {
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.DeathOrGlory,
      challengerWoundsInflicted: 2,
      challengedWoundsInflicted: 0,
      tauntAndBaitSelections: { 0: 3 }, // 3 selections
    });

    const result = resolveChallengeGlory(challenge);

    // CRP = wounds (2) + bonus (1 per selection × 3) = 5
    expect(result.challengerCRP).toBe(5);
    expect(result.winnerPlayerIndex).toBe(0);
  });

  it('should apply Death or Glory CRP bonus for challenged', () => {
    const challenge = createChallengeState({
      challengedGambit: ChallengeGambit.DeathOrGlory,
      challengerWoundsInflicted: 0,
      challengedWoundsInflicted: 3,
      tauntAndBaitSelections: { 1: 2 }, // 2 selections
    });

    const result = resolveChallengeGlory(challenge);

    // CRP = wounds (3) + bonus (1 per selection × 2) = 5
    expect(result.challengedCRP).toBe(5);
    expect(result.winnerPlayerIndex).toBe(1);
  });

  it('should not apply CRP bonus if loser has Death or Glory', () => {
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.DeathOrGlory,
      challengerWoundsInflicted: 0,
      challengedWoundsInflicted: 3,
      tauntAndBaitSelections: { 0: 2 },
    });

    const result = resolveChallengeGlory(challenge);

    // Challenger lost, so their DeathOrGlory bonus doesn't apply
    expect(result.challengerCRP).toBe(0);
    expect(result.challengedCRP).toBe(3);
    expect(result.winnerPlayerIndex).toBe(1);
  });
});
