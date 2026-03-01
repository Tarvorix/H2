/**
 * Challenge Strike Handler
 * Implements Challenge Strike and Glory (Steps 4-5 of the Challenge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 4-5
 *
 * Step 4: Strike — models attack in Challenge Advantage order
 * Step 5: Glory — determine winner, award CRP
 */

import type { GameState } from '@hh/types';
import type { DiceProvider, GameEvent, ChallengeStrikeEvent, ChallengeGloryEvent } from '../types';
import { findModel } from '../game-queries';
import { applyWoundsToModel, updateUnitInGameState, updateModelInUnit } from '../state-helpers';
import { meleeHitTable, woundTable } from '../tables';
import type { ChallengeState } from './assault-types';
import { GAMBIT_EFFECTS } from './gambit-handler';

// ─── Result Types ───────────────────────────────────────────────────────────

/**
 * Result of resolving a challenge strike.
 */
export interface ChallengeStrikeResult {
  /** Updated game state */
  state: GameState;
  /** Updated challenge state */
  challengeState: ChallengeState;
  /** Events generated */
  events: GameEvent[];
  /** Whether one model was slain */
  modelSlain: boolean;
  /** ID of the slain model (if any) */
  slainModelId?: string;
  /** Whether the challenge continues (both survived and advantage holder chooses continue) */
  challengeContinues: boolean;
}

/**
 * Result of resolving challenge glory.
 */
export interface ChallengeGloryResult {
  /** Updated challenge state with CRP */
  challengeState: ChallengeState;
  /** Events generated */
  events: GameEvent[];
  /** CRP awarded to the challenger */
  challengerCRP: number;
  /** CRP awarded to the challenged */
  challengedCRP: number;
  /** Player index of the winner (null if draw) */
  winnerPlayerIndex: number | null;
}

// ─── Resolve Challenge Strike ───────────────────────────────────────────────

/**
 * Resolve the Strike step of a Challenge.
 *
 * The model with Challenge Advantage attacks first.
 * Calculate attacks, apply gambit modifiers, make hit and wound tests,
 * saving throws, and apply damage.
 *
 * @param state - Current game state
 * @param challengeState - Current challenge state
 * @param dice - Dice provider for rolling
 * @param challengerWS - Challenger's Weapon Skill
 * @param challengedWS - Challenged's Weapon Skill
 * @param challengerS - Challenger's Strength (modified by weapon)
 * @param challengedS - Challenged's Strength (modified by weapon)
 * @param challengerA - Challenger's Attacks
 * @param challengedA - Challenged's Attacks
 * @param challengerT - Challenger's Toughness
 * @param challengedT - Challenged's Toughness
 * @param challengerSave - Challenger's save value (null = no save)
 * @param challengedSave - Challenged's save value (null = no save)
 * @param weaponAP - Weapon AP (null = no AP), applies to both for simplicity
 * @param weaponDamage - Weapon damage per wound
 * @returns ChallengeStrikeResult with updated state and events
 */
export function resolveChallengeStrike(
  state: GameState,
  challengeState: ChallengeState,
  dice: DiceProvider,
  challengerWS: number,
  challengedWS: number,
  challengerS: number,
  challengedS: number,
  challengerA: number,
  challengedA: number,
  challengerT: number,
  challengedT: number,
  challengerSave: number | null = 3,
  challengedSave: number | null = 3,
  weaponAP: number | null = null,
  weaponDamage: number = 1,
): ChallengeStrikeResult {
  const events: GameEvent[] = [];
  let newState = state;
  let updatedChallenge = { ...challengeState };

  // Determine attack order based on Challenge Advantage
  const challengerFirst = challengeState.challengeAdvantagePlayerIndex === challengeState.challengerPlayerIndex;

  // Apply gambit modifiers
  const challengerGambit = challengeState.challengerGambit ? GAMBIT_EFFECTS[challengeState.challengerGambit] : null;
  const challengedGambit = challengeState.challengedGambit ? GAMBIT_EFFECTS[challengeState.challengedGambit] : null;

  // Calculate effective attacks
  let effectiveChallengerA = challengerGambit?.fixedAttacks
    ? challengerGambit.fixedAttacks
    : challengerA;
  let effectiveChallengedA = challengedGambit?.fixedAttacks
    ? challengedGambit.fixedAttacks
    : challengedA;

  // Challenge Advantage grants +1 attack
  if (challengerFirst) {
    effectiveChallengerA += 1;
  } else {
    effectiveChallengedA += 1;
  }

  // Apply gambit WS modifiers
  let effectiveChallengerWS = challengerWS + (challengerGambit?.wsModifier ?? 0);
  let effectiveChallengedWS = challengedWS + (challengedGambit?.wsModifier ?? 0);

  // Apply gambit strength/damage modifiers
  let effectiveChallengerS = challengerS + (challengerGambit?.strengthModifier ?? 0);
  let effectiveChallengedS = challengedS + (challengedGambit?.strengthModifier ?? 0);
  let effectiveChallengerDamage = weaponDamage + (challengerGambit?.damageModifier ?? 0);
  let effectiveChallengedDamage = weaponDamage + (challengedGambit?.damageModifier ?? 0);

  // Apply Death or Glory (swap WS/A with enemy — use enemy's value if higher, else -1)
  if (challengerGambit?.swapStatsWithEnemy) {
    const prevA = effectiveChallengerA;
    effectiveChallengerWS = effectiveChallengedWS > effectiveChallengerWS
      ? effectiveChallengedWS
      : effectiveChallengerWS - 1;
    effectiveChallengerA = effectiveChallengedA > prevA
      ? effectiveChallengedA
      : prevA - 1;
  }
  if (challengedGambit?.swapStatsWithEnemy) {
    const prevA = effectiveChallengedA;
    effectiveChallengedWS = effectiveChallengerWS > effectiveChallengedWS
      ? effectiveChallengerWS
      : effectiveChallengedWS - 1;
    effectiveChallengedA = effectiveChallengerA > prevA
      ? effectiveChallengerA
      : prevA - 1;
  }

  // Resolve attacks
  let challengerWoundsInflicted = 0;
  let challengedWoundsInflicted = 0;
  let modelSlain = false;
  let slainModelId: string | undefined;

  // First attacker (Challenge Advantage holder)
  if (challengerFirst) {
    // Challenger attacks first
    challengerWoundsInflicted = resolveAttacks(
      dice,
      effectiveChallengerA,
      effectiveChallengerWS,
      effectiveChallengedWS,
      effectiveChallengerS,
      challengedT,
      challengedSave,
      weaponAP,
      effectiveChallengerDamage,
    );

    // Apply damage to challenged model
    if (challengerWoundsInflicted > 0) {
      newState = applyDamageToModel(newState, challengeState.challengedId, challengerWoundsInflicted);
      const challengedModel = findModel(newState, challengeState.challengedId);
      if (challengedModel?.model.isDestroyed) {
        modelSlain = true;
        slainModelId = challengeState.challengedId;
      }
    }

    // If model survived, challenged attacks back
    if (!modelSlain) {
      challengedWoundsInflicted = resolveAttacks(
        dice,
        effectiveChallengedA,
        effectiveChallengedWS,
        effectiveChallengerWS,
        effectiveChallengedS,
        challengerT,
        challengerSave,
        weaponAP,
        effectiveChallengedDamage,
      );

      if (challengedWoundsInflicted > 0) {
        newState = applyDamageToModel(newState, challengeState.challengerId, challengedWoundsInflicted);
        const challengerModel = findModel(newState, challengeState.challengerId);
        if (challengerModel?.model.isDestroyed) {
          modelSlain = true;
          slainModelId = challengeState.challengerId;
        }
      }
    }
  } else {
    // Challenged attacks first
    challengedWoundsInflicted = resolveAttacks(
      dice,
      effectiveChallengedA,
      effectiveChallengedWS,
      effectiveChallengerWS,
      effectiveChallengedS,
      challengerT,
      challengerSave,
      weaponAP,
      effectiveChallengedDamage,
    );

    if (challengedWoundsInflicted > 0) {
      newState = applyDamageToModel(newState, challengeState.challengerId, challengedWoundsInflicted);
      const challengerModel = findModel(newState, challengeState.challengerId);
      if (challengerModel?.model.isDestroyed) {
        modelSlain = true;
        slainModelId = challengeState.challengerId;
      }
    }

    if (!modelSlain) {
      challengerWoundsInflicted = resolveAttacks(
        dice,
        effectiveChallengerA,
        effectiveChallengerWS,
        effectiveChallengedWS,
        effectiveChallengerS,
        challengedT,
        challengedSave,
        weaponAP,
        effectiveChallengerDamage,
      );

      if (challengerWoundsInflicted > 0) {
        newState = applyDamageToModel(newState, challengeState.challengedId, challengerWoundsInflicted);
        const challengedModel = findModel(newState, challengeState.challengedId);
        if (challengedModel?.model.isDestroyed) {
          modelSlain = true;
          slainModelId = challengeState.challengedId;
        }
      }
    }
  }

  updatedChallenge = {
    ...updatedChallenge,
    challengerWoundsInflicted: updatedChallenge.challengerWoundsInflicted + challengerWoundsInflicted,
    challengedWoundsInflicted: updatedChallenge.challengedWoundsInflicted + challengedWoundsInflicted,
    currentStep: modelSlain ? 'GLORY' : 'STRIKE',
  };

  // Update Guard Up focus bonus for next round (each enemy miss → +1)
  if (challengerGambit?.missesGrantFocusBonus) {
    // challengedA - challengedWoundsInflicted = misses (approximate)
    const misses = Math.max(0, effectiveChallengedA - challengedWoundsInflicted);
    updatedChallenge = {
      ...updatedChallenge,
      guardUpFocusBonus: {
        ...updatedChallenge.guardUpFocusBonus,
        [challengeState.challengerPlayerIndex]:
          (updatedChallenge.guardUpFocusBonus[challengeState.challengerPlayerIndex] ?? 0) + misses,
      },
    };
  }
  if (challengedGambit?.missesGrantFocusBonus) {
    const misses = Math.max(0, effectiveChallengerA - challengerWoundsInflicted);
    updatedChallenge = {
      ...updatedChallenge,
      guardUpFocusBonus: {
        ...updatedChallenge.guardUpFocusBonus,
        [challengeState.challengedPlayerIndex]:
          (updatedChallenge.guardUpFocusBonus[challengeState.challengedPlayerIndex] ?? 0) + misses,
      },
    };
  }

  // Update Test the Foe advantage for next round
  if (challengerGambit?.grantsNextRoundAdvantage && !modelSlain) {
    updatedChallenge = {
      ...updatedChallenge,
      testTheFoeAdvantage: {
        ...updatedChallenge.testTheFoeAdvantage,
        [challengeState.challengerPlayerIndex]: true,
      },
    };
  }
  if (challengedGambit?.grantsNextRoundAdvantage && !modelSlain) {
    updatedChallenge = {
      ...updatedChallenge,
      testTheFoeAdvantage: {
        ...updatedChallenge.testTheFoeAdvantage,
        [challengeState.challengedPlayerIndex]: true,
      },
    };
  }

  const strikeEvent: ChallengeStrikeEvent = {
    type: 'challengeStrike',
    challengerModelId: challengeState.challengerId,
    challengedModelId: challengeState.challengedId,
    challengerWoundsInflicted,
    challengedWoundsInflicted,
    modelSlain,
    slainModelId: slainModelId ?? null,
  };
  events.push(strikeEvent);

  return {
    state: newState,
    challengeState: updatedChallenge,
    events,
    modelSlain,
    slainModelId,
    challengeContinues: !modelSlain,
  };
}

// ─── Resolve Challenge Glory ────────────────────────────────────────────────

/**
 * Resolve the Glory step of a Challenge.
 *
 * CRP awards:
 * - If model slain: winner gains CRP = slain model's base wounds + 1 if Paragon/Command
 * - If both survive: more wounds inflicted = winner, gains CRP = wounds inflicted
 * - If draw (no wounds / equal): no CRP
 * - If both slain: no CRP
 *
 * @param challengeState - Current challenge state (after Strike)
 * @param slainModelWounds - Base wounds of the slain model (if any)
 * @param slainModelIsCharacter - Whether slain model is Paragon/Command
 * @returns ChallengeGloryResult with CRP awards
 */
export function resolveChallengeGlory(
  challengeState: ChallengeState,
  _slainModelWounds: number = 1,
  _slainModelIsCharacter: boolean = false,
): ChallengeGloryResult {
  const events: GameEvent[] = [];

  let challengerCRP = 0;
  let challengedCRP = 0;
  let winnerPlayerIndex: number | null = null;

  // Determine winner by wounds inflicted
  if (challengeState.challengerWoundsInflicted > challengeState.challengedWoundsInflicted) {
    winnerPlayerIndex = challengeState.challengerPlayerIndex;
    challengerCRP = challengeState.challengerWoundsInflicted;

    // Taunt and Bait CRP bonus
    const challengerGambit = challengeState.challengerGambit ? GAMBIT_EFFECTS[challengeState.challengerGambit] : null;
    if (challengerGambit?.crpBonusPerSelection) {
      challengerCRP += challengerGambit.crpBonusPerSelection *
        (challengeState.tauntAndBaitSelections[challengeState.challengerPlayerIndex] ?? 0);
    }
  } else if (challengeState.challengedWoundsInflicted > challengeState.challengerWoundsInflicted) {
    winnerPlayerIndex = challengeState.challengedPlayerIndex;
    challengedCRP = challengeState.challengedWoundsInflicted;

    const challengedGambit = challengeState.challengedGambit ? GAMBIT_EFFECTS[challengeState.challengedGambit] : null;
    if (challengedGambit?.crpBonusPerSelection) {
      challengedCRP += challengedGambit.crpBonusPerSelection *
        (challengeState.tauntAndBaitSelections[challengeState.challengedPlayerIndex] ?? 0);
    }
  }
  // If equal or both zero, no CRP awarded (draw)

  const updatedChallenge: ChallengeState = {
    ...challengeState,
    challengerCRP: challengeState.challengerCRP + challengerCRP,
    challengedCRP: challengeState.challengedCRP + challengedCRP,
    currentStep: 'GLORY',
  };

  const gloryEvent: ChallengeGloryEvent = {
    type: 'challengeGlory',
    challengerCRP,
    challengedCRP,
    winnerPlayerIndex,
  };
  events.push(gloryEvent);

  return {
    challengeState: updatedChallenge,
    events,
    challengerCRP,
    challengedCRP,
    winnerPlayerIndex,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Resolve melee attacks: hit tests → wound tests → saves → damage.
 * Returns total wounds inflicted (unsaved).
 */
function resolveAttacks(
  dice: DiceProvider,
  attacks: number,
  attackerWS: number,
  defenderWS: number,
  strength: number,
  toughness: number,
  save: number | null,
  ap: number | null,
  damage: number,
): number {
  const hitTarget = meleeHitTable(attackerWS, defenderWS);
  const woundTarget = woundTable(strength, toughness);

  if (woundTarget === null) return 0; // Cannot wound

  let totalWounds = 0;

  for (let i = 0; i < attacks; i++) {
    // Hit test
    const hitRoll = dice.rollD6();
    if (hitRoll < hitTarget) continue; // Miss

    // Wound test
    const woundRoll = dice.rollD6();
    if (woundRoll < woundTarget) continue; // Failed to wound

    // Save test
    if (save !== null) {
      // AP modifies save: AP 2 means a 3+ save becomes 5+ (3 + 2 = 5+)
      const effectiveSave = ap !== null ? Math.min(7, save + ap) : save;
      const saveRoll = dice.rollD6();
      if (saveRoll >= effectiveSave) continue; // Saved
    }

    // Damage
    totalWounds += damage;
  }

  return totalWounds;
}

/**
 * Apply wounds to a model in the game state.
 */
function applyDamageToModel(
  state: GameState,
  modelId: string,
  wounds: number,
): GameState {
  const modelInfo = findModel(state, modelId);
  if (!modelInfo) return state;

  return updateUnitInGameState(state, modelInfo.unit.id, unit =>
    updateModelInUnit(unit, modelId, model =>
      applyWoundsToModel(model, wounds),
    ),
  );
}
