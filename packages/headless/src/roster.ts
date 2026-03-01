import type { ArmyList, ArmyValidationResult, GameState } from '@hh/types';
import { BattlefieldRole } from '@hh/types';
import { validateArmyListForMvp } from '@hh/army-builder';
import type { HeadlessArmySetup, HeadlessGameSetupOptions } from './setup';
import { createHeadlessGameState } from './setup';

export interface HeadlessArmyListValidationSummary {
  isValid: boolean;
  playerResults: [ArmyValidationResult, ArmyValidationResult];
  errors: string[];
}

export interface HeadlessArmyListGameSetupOptions
  extends Omit<HeadlessGameSetupOptions, 'armies'> {
  armyLists: [ArmyList, ArmyList];
}

function summarizeArmyErrors(
  playerIndex: number,
  validation: ArmyValidationResult,
): string[] {
  return validation.errors.map(
    (error) => `Player ${playerIndex + 1}: ${error.message}`,
  );
}

function convertArmyListToHeadlessArmySetup(armyList: ArmyList): HeadlessArmySetup {
  let assignedFallbackWarlord = false;

  const units = armyList.detachments.flatMap((detachment) =>
    detachment.units.map((unit) => {
      const isWarlord =
        armyList.warlordUnitId !== undefined
          ? unit.id === armyList.warlordUnitId
          : !assignedFallbackWarlord &&
            unit.battlefieldRole === BattlefieldRole.Warlord;

      if (isWarlord && armyList.warlordUnitId === undefined) {
        assignedFallbackWarlord = true;
      }

      return {
        profileId: unit.profileId,
        modelCount: unit.modelCount,
        unitId: unit.id,
        isWarlord,
      };
    }),
  );

  return {
    playerName: armyList.playerName,
    faction: armyList.faction,
    allegiance: armyList.allegiance,
    pointsLimit: armyList.pointsLimit,
    units,
  };
}

/**
 * Validate two army lists against the HHv2 MVP scope for headless usage.
 * This is the headless entrypoint guard for roster legality.
 */
export function validateHeadlessArmyListsForMvp(
  armyLists: [ArmyList, ArmyList],
): HeadlessArmyListValidationSummary {
  const player0 = validateArmyListForMvp(armyLists[0]);
  const player1 = validateArmyListForMvp(armyLists[1]);

  return {
    isValid: player0.isValid && player1.isValid,
    playerResults: [player0, player1],
    errors: [
      ...summarizeArmyErrors(0, player0),
      ...summarizeArmyErrors(1, player1),
    ],
  };
}

/**
 * Create a mission-initialized headless GameState from two ArmyList payloads.
 * Throws if either army list is invalid for HHv2 MVP.
 */
export function createHeadlessGameStateFromArmyLists(
  options: HeadlessArmyListGameSetupOptions,
): GameState {
  const validation = validateHeadlessArmyListsForMvp(options.armyLists);
  if (!validation.isValid) {
    throw new Error(
      `Cannot create headless game state from invalid army list(s):\n${validation.errors.join('\n')}`,
    );
  }

  return createHeadlessGameState({
    ...options,
    armies: [
      convertArmyListToHeadlessArmySetup(options.armyLists[0]),
      convertArmyListToHeadlessArmySetup(options.armyLists[1]),
    ],
  });
}
