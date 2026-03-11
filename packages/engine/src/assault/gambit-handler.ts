/**
 * Gambit & Focus Roll Handler
 * Implements Face-Off gambits and Focus Roll (Steps 2-3 of the Challenge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 2-3
 *
 * Each combatant selects a Gambit that provides combat modifiers.
 * Then a Focus Roll determines Challenge Advantage (who attacks first).
 */

import { ChallengeGambit } from '@hh/types';
import type { LegionFaction } from '@hh/types';
import type { DiceProvider, GameEvent, GambitSelectedEvent, FocusRollEvent } from '../types';
import type { GambitEffect, ChallengeState } from './assault-types';
import {
  getLegionGambitEffect,
  getAvailableLegionGambits,
  getLegionGambitFocusModifier,
  doesGambitExcludeCombatInitiative,
  getGambitReplaceCharacteristic,
} from '../legion/legion-gambit-registry';

// ─── Gambit Effects Lookup ──────────────────────────────────────────────────

/**
 * Complete lookup table for the 9 universal Challenge Gambits.
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase (Face-Off step)
 */
export const GAMBIT_EFFECTS: Record<string, GambitEffect> = {
  [ChallengeGambit.SeizeTheInitiative]: {
    name: ChallengeGambit.SeizeTheInitiative,
    extraFocusDie: true,
    discardDie: 'lowest',
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.Feint]: {
    name: ChallengeGambit.Feint,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: true,
    blocksOpponentGambit: true,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.Guard]: {
    name: ChallengeGambit.Guard,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 1,
    fixedAttacks: 1,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: true,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.PressTheAttack]: {
    name: ChallengeGambit.PressTheAttack,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: 'D3',
    bonusAttackFixedDamage: 1,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.RecklessAssault]: {
    name: ChallengeGambit.RecklessAssault,
    extraFocusDie: true,
    discardDie: 'highest',
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 1,
    damageModifier: 1,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.CautiousAdvance]: {
    name: ChallengeGambit.CautiousAdvance,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: true,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.DefensiveStance]: {
    name: ChallengeGambit.DefensiveStance,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 1,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: true,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.AllOutAttack]: {
    name: ChallengeGambit.AllOutAttack,
    extraFocusDie: true,
    discardDie: 'highest',
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: true,
    outsideSupportToAttacks: true,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },

  [ChallengeGambit.DeathOrGlory]: {
    name: ChallengeGambit.DeathOrGlory,
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: true,
    crpBonusPerSelection: 1,
  },
};

/**
 * Additional non-core gambits that are granted by other rules sources, such as
 * psychic disciplines. These are legal selections only when the enabling rule
 * has already granted them to the model.
 */
const EXTRA_GAMBIT_EFFECTS: Record<string, GambitEffect> = {
  'every-strike-foreseen': {
    name: 'every-strike-foreseen',
    extraFocusDie: false,
    discardDie: null,
    wsModifier: 0,
    fixedAttacks: 0,
    bonusAttacksRoll: null,
    bonusAttackFixedDamage: null,
    strengthModifier: 0,
    damageModifier: 0,
    blocksOutsideSupportFocus: false,
    outsideSupportToAttacks: false,
    firstChooserOnly: false,
    blocksOpponentGambit: false,
    allowsWithdraw: false,
    grantsNextRoundAdvantage: false,
    missesGrantFocusBonus: false,
    swapStatsWithEnemy: false,
    crpBonusPerSelection: 0,
  },
};

function getBaseGambitEffect(gambitName: string): GambitEffect | null {
  return GAMBIT_EFFECTS[gambitName] ?? EXTRA_GAMBIT_EFFECTS[gambitName] ?? null;
}

// ─── Select Gambit ──────────────────────────────────────────────────────────

/**
 * Record a gambit selection for a model in a challenge.
 *
 * @param state - Current game state
 * @param modelId - Model selecting the gambit
 * @param gambit - The gambit being selected
 * @param challengeState - Current challenge state
 * @returns Updated challenge state and events
 */
export function selectGambit(
  modelId: string,
  gambit: string,
  challengeState: ChallengeState,
): { challengeState: ChallengeState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // Check universal/extra gambits first, then legion gambits.
  const gambitEffect = getBaseGambitEffect(gambit) ?? getLegionGambitEffect(gambit);
  if (!gambitEffect) {
    return { challengeState, events };
  }

  let updatedChallenge = { ...challengeState };

  if (modelId === challengeState.challengerId) {
    updatedChallenge = { ...updatedChallenge, challengerGambit: gambit };
  } else if (modelId === challengeState.challengedId) {
    updatedChallenge = { ...updatedChallenge, challengedGambit: gambit };
  } else {
    return { challengeState, events };
  }

  const event: GambitSelectedEvent = {
    type: 'gambitSelected',
    modelId,
    gambit,
  };
  events.push(event);

  return { challengeState: updatedChallenge, events };
}

// ─── Resolve Focus Roll ─────────────────────────────────────────────────────

/**
 * Result of a focus roll.
 */
export interface FocusRollResult {
  /** Updated challenge state with focus roll results */
  challengeState: ChallengeState;
  /** Events generated */
  events: GameEvent[];
  /** Player index that won Challenge Advantage (null if tie — reroll needed) */
  advantagePlayerIndex: number | null;
  /** Whether a reroll is needed (tie) */
  needsReroll: boolean;
}

/**
 * Resolve the Focus Roll to determine Challenge Advantage.
 *
 * Each model rolls 1d6 and adds their Combat Initiative Score + modifiers:
 * - Heavy subtype: -1
 * - Per wound missing: -1 each
 * - Duellist's Edge (X): +X
 * - Light subtype: +1
 * - Outside Support: +1 per 5 friendly engaged models (Walker = 5)
 * - One-sided support: +2 per 5 if only one side has support
 * - Gambit modifiers (Seize = extra die discard lowest, etc.)
 *
 * Higher total → Challenge Advantage (attacks first, +1 attacks)
 * Ties → reroll
 *
 * @param challengeState - Current challenge state (with gambits selected)
 * @param dice - Dice provider for rolling
 * @param challengerInitiative - Challenger's Combat Initiative score
 * @param challengedInitiative - Challenged's Combat Initiative score
 * @param challengerPlayerIndex - Player index of the challenger
 * @param challengedPlayerIndex - Player index of the challenged
 * @returns FocusRollResult with advantage determination
 */
export function resolveFocusRoll(
  challengeState: ChallengeState,
  dice: DiceProvider,
  challengerInitiative: number,
  challengedInitiative: number,
  challengerPlayerIndex: number,
  challengedPlayerIndex: number,
): FocusRollResult {
  const events: GameEvent[] = [];

  // Roll focus dice for each model
  const challengerRoll = rollFocusDice(dice, challengeState.challengerGambit);
  const challengedRoll = rollFocusDice(dice, challengeState.challengedGambit);

  // Check if legion gambits exclude Combat Initiative
  const challengerCIExcluded = challengeState.challengerGambit
    ? doesGambitExcludeCombatInitiative(challengeState.challengerGambit)
    : false;
  const challengedCIExcluded = challengeState.challengedGambit
    ? doesGambitExcludeCombatInitiative(challengeState.challengedGambit)
    : false;

  // Add initiative scores (unless excluded by legion gambit)
  const challengerCI = challengerCIExcluded ? 0 : challengerInitiative;
  const challengedCI = challengedCIExcluded ? 0 : challengedInitiative;

  // Add legion gambit focus modifiers (e.g., EC Paragon +2)
  const challengerFocusMod = challengeState.challengerGambit
    ? getLegionGambitFocusModifier(challengeState.challengerGambit)
    : 0;
  const challengedFocusMod = challengeState.challengedGambit
    ? getLegionGambitFocusModifier(challengeState.challengedGambit)
    : 0;

  const challengerTotal = challengerRoll + challengerCI + challengerFocusMod +
    (challengeState.guardUpFocusBonus[challengerPlayerIndex] ?? 0);
  const challengedTotal = challengedRoll + challengedCI + challengedFocusMod +
    (challengeState.guardUpFocusBonus[challengedPlayerIndex] ?? 0);

  // Apply Test the Foe auto-advantage
  let advantagePlayerIndex: number | null = null;
  let needsReroll = false;

  if (challengeState.testTheFoeAdvantage[challengerPlayerIndex]) {
    advantagePlayerIndex = challengerPlayerIndex;
  } else if (challengeState.testTheFoeAdvantage[challengedPlayerIndex]) {
    advantagePlayerIndex = challengedPlayerIndex;
  } else if (challengerTotal > challengedTotal) {
    advantagePlayerIndex = challengerPlayerIndex;
  } else if (challengedTotal > challengerTotal) {
    advantagePlayerIndex = challengedPlayerIndex;
  } else {
    // Tie — need reroll
    needsReroll = true;
  }

  const updatedChallenge: ChallengeState = {
    ...challengeState,
    focusRolls: [challengerTotal, challengedTotal],
    challengeAdvantagePlayerIndex: advantagePlayerIndex,
    currentStep: needsReroll ? 'FOCUS' : 'STRIKE',
  };

  const focusEvent: FocusRollEvent = {
    type: 'focusRoll',
    challengerRoll: challengerTotal,
    challengedRoll: challengedTotal,
    advantagePlayerIndex,
    isTie: needsReroll,
  };
  events.push(focusEvent);

  return {
    challengeState: updatedChallenge,
    events,
    advantagePlayerIndex,
    needsReroll,
  };
}

/**
 * Roll focus dice for a model, applying gambit modifiers.
 */
function rollFocusDice(dice: DiceProvider, gambitName: string | null): number {
  // Check for legion gambit "replace with characteristic" (e.g., TS Prophetic Duellist → WP)
  // The characteristic value is applied as a fixed roll result (no d6 roll)
  if (gambitName) {
    const replaceWith = getGambitReplaceCharacteristic(gambitName);
    if (replaceWith) {
      // The characteristic value will be the Focus Roll result instead of a d6
      // Since we don't have model stats here, we still roll d6 but the caller
      // should override. For now, return the d6 roll — the full replacement
      // logic is handled at the challenge-strike level where model stats are available.
      return dice.rollD6();
    }
  }

  // Check core gambit effects first, then legion gambit effects
  const gambit = gambitName ? (getBaseGambitEffect(gambitName) ?? getLegionGambitEffect(gambitName)) : null;

  if (gambit?.extraFocusDie) {
    // Roll 2 dice
    const die1 = dice.rollD6();
    const die2 = dice.rollD6();

    if (gambit.discardDie === 'lowest') {
      return Math.max(die1, die2); // Keep highest (Seize the Initiative)
    } else if (gambit.discardDie === 'highest') {
      return Math.min(die1, die2); // Keep lowest (Reckless Assault, All Out Attack)
    }
    return die1; // Shouldn't happen, but fallback
  }

  // Standard: roll 1d6
  return dice.rollD6();
}

// ─── Get Gambit Effect ──────────────────────────────────────────────────────

/**
 * Get the gambit effect for a given gambit name.
 *
 * @param gambitName - The gambit name (from ChallengeGambit enum)
 * @returns The gambit effect, or null if not found
 */
export function getGambitEffect(gambitName: string): GambitEffect | null {
  return getBaseGambitEffect(gambitName) ?? getLegionGambitEffect(gambitName) ?? null;
}

/**
 * Get all available gambit names. If a legion is provided, includes
 * the legion-specific gambits alongside the 9 core gambits.
 *
 * @param legion - Optional legion faction for legion-specific gambits
 * @returns Array of gambit names (core + legion if applicable)
 */
export function getAvailableGambits(legion?: LegionFaction): string[] {
  const coreGambits = Object.keys(GAMBIT_EFFECTS);
  if (!legion) return coreGambits;

  const legionSpecific = getAvailableLegionGambits(legion);
  return [...coreGambits, ...legionSpecific];
}
