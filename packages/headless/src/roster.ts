import type { ArmyList, ArmyValidationResult, GameState } from '@hh/types';
import { BattlefieldRole, LegionFaction } from '@hh/types';
import { validateArmyListWithDoctrine } from '@hh/army-builder';
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
        originLegion:
          unit.originLegion ??
          (Object.values(LegionFaction).includes(detachment.faction as LegionFaction)
            ? (detachment.faction as LegionFaction)
            : undefined),
      };
    }),
  );

  return {
    playerName: armyList.playerName,
    faction: armyList.faction,
    allegiance: armyList.allegiance,
    doctrine: armyList.doctrine,
    pointsLimit: armyList.pointsLimit,
    units,
  };
}

/**
 * Validate two army lists for headless usage.
 * This is the headless entrypoint guard for roster legality.
 */
export function validateHeadlessArmyLists(
  armyLists: [ArmyList, ArmyList],
): HeadlessArmyListValidationSummary {
  const player0 = validateArmyListWithDoctrine(armyLists[0]);
  const player1 = validateArmyListWithDoctrine(armyLists[1]);

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
 * Throws if either army list is invalid.
 */
export function createHeadlessGameStateFromArmyLists(
  options: HeadlessArmyListGameSetupOptions,
): GameState {
  const validation = validateHeadlessArmyLists(options.armyLists);
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
