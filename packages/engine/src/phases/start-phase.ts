/**
 * Start Phase Handler
 * Processes the Start Phase of a player turn.
 *
 * Reference: HH_Rules_Battle.md — "Start Phase"
 *
 * The Start Phase handles:
 * - Reset per-turn legion tactica state (reaction discount, movement bonus)
 * - Start-of-turn effects (ongoing effects, aura abilities)
 * - Psychic powers that activate at the start of the turn
 */

import type { GameState, LegionTacticaState, ObjectiveMarker } from '@hh/types';
import { MissionSpecialRule } from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import { expirePsychicEffectsAtTurnStart } from '../psychic/psychic-runtime';
import {
  ensureZoneMortalisState,
  syncZoneMortalisMissionObjectives,
  updateZoneMortalisSections,
} from '../zone-mortalis/zone-mortalis';

function buildSignalInfluxObjectives(
  state: GameState,
  dice: DiceProvider,
): ObjectiveMarker[] {
  const positions: Array<{ x: number; y: number }> = [];
  while (positions.length < 3) {
    const position = {
      x: dice.rollD3() * 12,
      y: dice.rollD3() * 12,
    };
    if (positions.some((candidate) => candidate.x === position.x && candidate.y === position.y)) {
      continue;
    }
    positions.push(position);
  }

  return positions.map((position, index) => ({
    id: `signal-influx-${state.currentBattleTurn}-${index}`,
    position,
    vpValue: 2,
    currentVpValue: 2,
    isRemoved: false,
    label: `Signal ${index + 1}`,
  }));
}

/**
 * Process the Start Phase effects.
 * Resets per-turn legion tactica tracking state for the active player.
 *
 * @param state - Current game state
 * @param _dice - Dice provider (unused currently)
 * @returns CommandResult with updated state
 */
export function handleStartPhase(
  state: GameState,
  dice: DiceProvider,
): CommandResult {
  const psychicExpiredState = ensureZoneMortalisState(expirePsychicEffectsAtTurnStart(state));
  const events: GameEvent[] = [];

  // Reset per-turn legion tactica state for the active player
  const playerIndex = psychicExpiredState.activePlayerIndex;
  const resetState: LegionTacticaState = {
    reactionDiscountUsedThisTurn: false,
    movementBonusActiveThisTurn: false,
    perTurnFlags: {},
  };

  const newLegionTacticaState = [...psychicExpiredState.legionTacticaState] as [LegionTacticaState, LegionTacticaState];
  newLegionTacticaState[playerIndex] = resetState;

  let newState: GameState = {
    ...psychicExpiredState,
    legionTacticaState: newLegionTacticaState,
  };

  if (newState.gameMode === 'zone-mortalis' && newState.zoneMortalisState) {
    newState = {
      ...newState,
      zoneMortalisState: {
        ...newState.zoneMortalisState,
        doorwayOperationHistory: [],
      },
    };

    if (newState.activePlayerIndex === newState.firstPlayerIndex && newState.missionState) {
      if (newState.missionState.activeSpecialRules.includes(MissionSpecialRule.FailingPowerConduits)) {
        newState = updateZoneMortalisSections(newState, (sections) => sections.map((section) => {
          if (dice.rollD6() !== 1) {
            return section;
          }

          const updatedSection = {
            ...section,
            hasAbyssalDarkness: true,
            abyssalDarknessExpiresAfterPlayerTurn: {
              battleTurn: newState.currentBattleTurn,
              playerIndex: newState.activePlayerIndex === 0 ? 1 : 0,
            },
          };
          events.push({
            type: 'zoneMortalisSectionChanged',
            sectionId: updatedSection.id,
            confinedSpace: updatedSection.confinedSpace,
            hasAbyssalDarkness: updatedSection.hasAbyssalDarkness,
          });
          return updatedSection;
        }));
      }

      if (newState.missionState?.missionId === 'signal-influx') {
        newState = syncZoneMortalisMissionObjectives(
          newState,
          buildSignalInfluxObjectives(newState, dice),
        );
      }
    }
  }

  return {
    state: newState,
    events,
    errors: [],
    accepted: true,
  };
}
