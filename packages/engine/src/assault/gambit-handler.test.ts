/**
 * Gambit & Focus Roll Handler Tests
 * Tests for Challenge gambits and Focus Roll mechanics.
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 2-3
 */

import { describe, it, expect } from 'vitest';
import { ChallengeGambit } from '@hh/types';
import type { DiceProvider } from '../types';
import type { ChallengeState } from './assault-types';
import {
  GAMBIT_EFFECTS,
  selectGambit,
  resolveFocusRoll,
  getGambitEffect,
  getAvailableGambits,
} from './gambit-handler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createChallengeState(overrides: Partial<ChallengeState> = {}): ChallengeState {
  return {
    challengerId: 'model-a',
    challengedId: 'model-b',
    challengerUnitId: 'unit-0',
    challengedUnitId: 'unit-1',
    challengerPlayerIndex: 0,
    challengedPlayerIndex: 1,
    currentStep: 'FACE_OFF',
    challengerGambit: null,
    challengedGambit: null,
    challengeAdvantagePlayerIndex: null,
    focusRolls: null,
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

// ─── GAMBIT_EFFECTS ─────────────────────────────────────────────────────────

describe('GAMBIT_EFFECTS', () => {
  it('should have an effect for every ChallengeGambit enum value', () => {
    for (const gambit of Object.values(ChallengeGambit)) {
      expect(GAMBIT_EFFECTS[gambit]).toBeDefined();
      expect(GAMBIT_EFFECTS[gambit].name).toBe(gambit);
    }
  });

  it('Seize the Initiative should add extra die and discard lowest', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.SeizeTheInitiative];
    expect(effect.extraFocusDie).toBe(true);
    expect(effect.discardDie).toBe('lowest');
  });

  it('Guard should give +1 WS and fixed 1 attack', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.Guard];
    expect(effect.wsModifier).toBe(1);
    expect(effect.fixedAttacks).toBe(1);
    expect(effect.missesGrantFocusBonus).toBe(true);
  });

  it('Press the Attack should give bonus D3 attacks', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.PressTheAttack];
    expect(effect.bonusAttacksRoll).toBe('D3');
    expect(effect.bonusAttackFixedDamage).toBe(1);
  });

  it('Reckless Assault should add extra die discarding highest, +1 S and D', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.RecklessAssault];
    expect(effect.extraFocusDie).toBe(true);
    expect(effect.discardDie).toBe('highest');
    expect(effect.strengthModifier).toBe(1);
    expect(effect.damageModifier).toBe(1);
  });

  it('Cautious Advance should grant next round advantage', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.CautiousAdvance];
    expect(effect.grantsNextRoundAdvantage).toBe(true);
  });

  it('Defensive Stance should allow withdraw', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.DefensiveStance];
    expect(effect.allowsWithdraw).toBe(true);
    expect(effect.fixedAttacks).toBe(1);
  });

  it('All Out Attack should block outside support focus and redirect to attacks', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.AllOutAttack];
    expect(effect.blocksOutsideSupportFocus).toBe(true);
    expect(effect.outsideSupportToAttacks).toBe(true);
    expect(effect.extraFocusDie).toBe(true);
    expect(effect.discardDie).toBe('highest');
  });

  it('Death or Glory should swap stats with enemy and give CRP bonus', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.DeathOrGlory];
    expect(effect.swapStatsWithEnemy).toBe(true);
    expect(effect.crpBonusPerSelection).toBe(1);
  });

  it('Feint should be first chooser only and block opponent gambit', () => {
    const effect = GAMBIT_EFFECTS[ChallengeGambit.Feint];
    expect(effect.firstChooserOnly).toBe(true);
    expect(effect.blocksOpponentGambit).toBe(true);
  });
});

// ─── selectGambit ───────────────────────────────────────────────────────────

describe('selectGambit', () => {
  it('should set challenger gambit', () => {
    const challenge = createChallengeState();
    const result = selectGambit('model-a', ChallengeGambit.SeizeTheInitiative, challenge);

    expect(result.challengeState.challengerGambit).toBe(ChallengeGambit.SeizeTheInitiative);
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('gambitSelected');
  });

  it('should set challenged gambit', () => {
    const challenge = createChallengeState();
    const result = selectGambit('model-b', ChallengeGambit.Guard, challenge);

    expect(result.challengeState.challengedGambit).toBe(ChallengeGambit.Guard);
  });

  it('should not modify state for unknown model', () => {
    const challenge = createChallengeState();
    const result = selectGambit('unknown', ChallengeGambit.Guard, challenge);

    expect(result.challengeState.challengerGambit).toBeNull();
    expect(result.challengeState.challengedGambit).toBeNull();
    expect(result.events).toHaveLength(0);
  });

  it('should not modify state for invalid gambit', () => {
    const challenge = createChallengeState();
    const result = selectGambit('model-a', 'InvalidGambit', challenge);

    expect(result.events).toHaveLength(0);
  });
});

// ─── resolveFocusRoll ───────────────────────────────────────────────────────

describe('resolveFocusRoll', () => {
  it('should determine advantage when challenger rolls higher', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([6, 2]); // Challenger=6, Challenged=2

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.advantagePlayerIndex).toBe(0); // Challenger wins (6+4=10 > 2+4=6)
    expect(result.needsReroll).toBe(false);
  });

  it('should determine advantage when challenged rolls higher', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([1, 6]); // Challenger=1, Challenged=6

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.advantagePlayerIndex).toBe(1); // Challenged wins (1+4=5 < 6+4=10)
    expect(result.needsReroll).toBe(false);
  });

  it('should require reroll on tie', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([3, 3]); // Both = 3+4 = 7

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.needsReroll).toBe(true);
    expect(result.advantagePlayerIndex).toBeNull();
  });

  it('should add initiative scores to rolls', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([1, 1]); // Both roll 1

    // Challenger initiative 6, challenged initiative 3
    const result = resolveFocusRoll(challenge, dice, 6, 3, 0, 1);

    // Challenger: 1+6=7, Challenged: 1+3=4
    expect(result.advantagePlayerIndex).toBe(0);
  });

  it('should apply Seize the Initiative (extra die, discard lowest)', () => {
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.SeizeTheInitiative,
    });
    // Seize rolls 2 dice: [5, 2] → keeps 5
    // Challenged rolls 1 die: [3]
    const dice = createDiceProvider([5, 2, 3]);

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    // Challenger: 5+4=9, Challenged: 3+4=7
    expect(result.advantagePlayerIndex).toBe(0);
  });

  it('should apply Reckless Assault (extra die, discard highest)', () => {
    const challenge = createChallengeState({
      challengerGambit: ChallengeGambit.RecklessAssault,
    });
    // Reckless rolls 2 dice: [5, 2] → keeps 2 (discard highest)
    // Challenged rolls 1 die: [3]
    const dice = createDiceProvider([5, 2, 3]);

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    // Challenger: 2+4=6, Challenged: 3+4=7
    expect(result.advantagePlayerIndex).toBe(1);
  });

  it('should apply Test the Foe auto-advantage', () => {
    const challenge = createChallengeState({
      testTheFoeAdvantage: { 0: true },
    });
    const dice = createDiceProvider([1, 6]); // Doesn't matter

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.advantagePlayerIndex).toBe(0); // Auto advantage
  });

  it('should apply Guard Up focus bonus', () => {
    const challenge = createChallengeState({
      guardUpFocusBonus: { 0: 3 },
    });
    const dice = createDiceProvider([1, 4]); // Challenger=1, Challenged=4

    // Challenger: 1+4+3=8, Challenged: 4+4=8
    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    // Equal → tie
    expect(result.needsReroll).toBe(true);
  });

  it('should generate focusRoll event', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([4, 3]);

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('focusRoll');
  });

  it('should update challenge state step to STRIKE on resolution', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([6, 2]);

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.challengeState.currentStep).toBe('STRIKE');
  });

  it('should keep step as FOCUS on tie (needs reroll)', () => {
    const challenge = createChallengeState();
    const dice = createDiceProvider([3, 3]);

    const result = resolveFocusRoll(challenge, dice, 4, 4, 0, 1);

    expect(result.challengeState.currentStep).toBe('FOCUS');
  });
});

// ─── getGambitEffect ────────────────────────────────────────────────────────

describe('getGambitEffect', () => {
  it('should return effect for valid gambit', () => {
    const effect = getGambitEffect(ChallengeGambit.Guard);
    expect(effect).not.toBeNull();
    expect(effect!.wsModifier).toBe(1);
  });

  it('should return null for invalid gambit', () => {
    const effect = getGambitEffect('InvalidGambit');
    expect(effect).toBeNull();
  });
});

// ─── getAvailableGambits ────────────────────────────────────────────────────

describe('getAvailableGambits', () => {
  it('should return all 9 gambits', () => {
    const gambits = getAvailableGambits();
    expect(gambits.length).toBe(9);
  });

  it('should include all ChallengeGambit enum values', () => {
    const gambits = getAvailableGambits();
    for (const g of Object.values(ChallengeGambit)) {
      expect(gambits).toContain(g);
    }
  });
});
