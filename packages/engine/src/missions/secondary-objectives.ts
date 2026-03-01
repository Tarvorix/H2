/**
 * Secondary Objectives Module.
 * Evaluates the 4 secondary objectives at game end and during gameplay.
 *
 * Reference: HH_Battle_AOD.md — "Secondary Objectives"
 *
 * Secondary Objectives:
 * 1. Slay the Warlord (X VP) — enemy High Command unit destroyed
 * 2. Giant Killer (X VP) — enemy Lord of War unit destroyed
 * 3. Last Man Standing (X VP) — more non-routed units at game end
 * 4. First Strike (X VP) — destroyed enemy unit in first active turn
 */

import type {
  GameState,
  MissionState,
} from '@hh/types';
import {
  TacticalStatus,
  SecondaryObjectiveType,
  BattlefieldRole,
} from '@hh/types';
import { lookupUnitProfile } from '../profile-lookup';

// ─── Secondary Objective Checks ──────────────────────────────────────────────

/**
 * Check Slay the Warlord: has the opposing player's High Command unit been destroyed?
 *
 * "If an enemy High Command Choice is Removed as Casualty,
 *  Opposing Player scores X VP (can only be scored once per battle)"
 *
 * @param state - Current game state
 * @param scoringPlayerIndex - The player who would score VP
 * @returns true if the scoring player's opponent's HC unit is destroyed
 */
export function checkSlayTheWarlord(
  state: GameState,
  scoringPlayerIndex: number,
): boolean {
  const enemyIndex = scoringPlayerIndex === 0 ? 1 : 0;
  const enemyArmy = state.armies[enemyIndex];

  // Find HC units — check if all models are destroyed
  for (const unit of enemyArmy.units) {
    // We need to check if this unit is an HC unit by looking at profileId
    // Since we don't have the battlefield role on UnitState directly,
    // we check if all models in the unit have the warlord flag
    // (HC is the Warlord's unit) or check via the mission state
    // For now, check model isWarlord flags
    const hasWarlord = unit.models.some((m) => m.isWarlord);
    if (hasWarlord) {
      const allDestroyed = unit.models.every((m) => m.isDestroyed);
      if (allDestroyed) return true;
    }
  }

  return false;
}

/**
 * Check Giant Killer: has the opposing player's Lord of War unit been destroyed?
 *
 * "If an enemy Lord of War is Removed as Casualty,
 *  Opposing Player scores X VP (can only be scored once per battle)"
 *
 * Note: We track LoW units through their profileId matching Lord of War role.
 * Since UnitState doesn't carry battlefieldRole, the engine must track this
 * through the mission state or supplementary data.
 *
 * @param state - Current game state
 * @param scoringPlayerIndex - The player who would score VP
 * @returns true if any enemy LoW/Warlord-role unit is fully destroyed
 */
export function checkGiantKiller(
  state: GameState,
  scoringPlayerIndex: number,
): boolean {
  // Check if already achieved via explicit tracking
  if (state.missionState) {
    const secondary = state.missionState.secondaryObjectives.find(
      (s) => s.type === SecondaryObjectiveType.GiantKiller,
    );
    if (secondary?.achievedByPlayer === scoringPlayerIndex) return true;
  }

  // Look for destroyed Lord of War units in the enemy army using profile data
  const enemyIndex = scoringPlayerIndex === 0 ? 1 : 0;
  const enemyArmy = state.armies[enemyIndex];

  for (const unit of enemyArmy.units) {
    // Check if all models are destroyed
    const allDestroyed = unit.models.every((m) => m.isDestroyed);
    if (!allDestroyed) continue;

    // Look up the profile to check battlefield role
    const profile = lookupUnitProfile(unit.profileId);
    if (profile && profile.battlefieldRole === BattlefieldRole.LordOfWar) {
      return true;
    }
  }

  return false;
}

/**
 * Check Last Man Standing: does a player have more non-routed units than the opponent?
 *
 * "At end of battle, if a Player has more Units with no Routed models on
 *  battlefield than all opposing players combined, that Player scores X VP"
 *
 * Note: Cannot be scored if Sudden Death triggered.
 *
 * @param state - Current game state
 * @param playerIndex - The player to check
 * @returns true if the player has more non-routed units on the battlefield
 */
export function checkLastManStanding(
  state: GameState,
  playerIndex: number,
): boolean {
  const playerArmy = state.armies[playerIndex];
  const enemyArmy = state.armies[playerIndex === 0 ? 1 : 0];

  // Count non-routed units with at least one alive model on the battlefield
  const countNonRoutedUnits = (army: typeof playerArmy): number => {
    return army.units.filter((unit) => {
      // Must have at least one alive model
      const hasAliveModel = unit.models.some((m) => !m.isDestroyed);
      if (!hasAliveModel) return false;

      // Must not be Routed
      if (unit.statuses.includes(TacticalStatus.Routed)) return false;

      // Must be on the battlefield (not in reserves)
      if (unit.isInReserves) return false;

      return true;
    }).length;
  };

  const playerCount = countNonRoutedUnits(playerArmy);
  const enemyCount = countNonRoutedUnits(enemyArmy);

  return playerCount > enemyCount;
}

/**
 * Check First Strike: did the player destroy an enemy unit in their first active turn?
 *
 * "If a Player causes one or more enemy Units to have all remaining Models
 *  Removed as Casualties in their first Player Turn as Active Player,
 *  that Player scores X VP"
 *
 * @param state - Current game state
 * @param playerIndex - The player to check
 * @returns true if the player achieved First Strike
 */
export function checkFirstStrike(
  state: GameState,
  playerIndex: number,
): boolean {
  if (!state.missionState) return false;

  const tracking = state.missionState.firstStrikeTracking;
  if (playerIndex === 0) return tracking.player0Achieved;
  return tracking.player1Achieved;
}

// ─── Evaluation at Game End ──────────────────────────────────────────────────

/**
 * Evaluate all secondary objectives at game end and return VP awarded per player.
 *
 * @param state - Current game state (at game end)
 * @param isSuddenDeath - Whether the game ended via Sudden Death rule
 * @returns VP totals: [player0VP, player1VP]
 */
export function evaluateSecondaryObjectives(
  state: GameState,
  isSuddenDeath: boolean = false,
): [number, number] {
  if (!state.missionState) return [0, 0];

  let p0VP = 0;
  let p1VP = 0;

  for (const secondary of state.missionState.secondaryObjectives) {
    switch (secondary.type) {
      case SecondaryObjectiveType.SlayTheWarlord: {
        // Check if player 0 achieved it (enemy HC destroyed)
        if (
          secondary.achievedByPlayer === 0 ||
          checkSlayTheWarlord(state, 0)
        ) {
          p0VP += secondary.vpValue;
        }
        if (
          secondary.achievedByPlayer === 1 ||
          checkSlayTheWarlord(state, 1)
        ) {
          p1VP += secondary.vpValue;
        }
        break;
      }

      case SecondaryObjectiveType.GiantKiller: {
        if (secondary.achievedByPlayer === 0) {
          p0VP += secondary.vpValue;
        }
        if (secondary.achievedByPlayer === 1) {
          p1VP += secondary.vpValue;
        }
        break;
      }

      case SecondaryObjectiveType.LastManStanding: {
        // Cannot be scored during Sudden Death
        if (!isSuddenDeath) {
          if (checkLastManStanding(state, 0)) {
            p0VP += secondary.vpValue;
          }
          if (checkLastManStanding(state, 1)) {
            p1VP += secondary.vpValue;
          }
        }
        break;
      }

      case SecondaryObjectiveType.FirstStrike: {
        if (checkFirstStrike(state, 0)) {
          p0VP += secondary.vpValue;
        }
        if (checkFirstStrike(state, 1)) {
          p1VP += secondary.vpValue;
        }
        break;
      }
    }
  }

  return [p0VP, p1VP];
}

/**
 * Called when a unit is fully destroyed during gameplay.
 * Updates First Strike tracking if applicable.
 *
 * @param missionState - Current mission state
 * @param destroyerPlayerIndex - The player who destroyed the unit
 * @param currentBattleTurn - Current battle turn number
 * @returns Updated mission state
 */
export function updateSecondaryTrackingOnDestruction(
  missionState: MissionState,
  destroyerPlayerIndex: number,
  _currentBattleTurn: number,
): MissionState {
  let updated = missionState;

  // Check First Strike: was this the player's first active turn?
  const tracking = updated.firstStrikeTracking;
  if (destroyerPlayerIndex === 0 && !tracking.player0FirstTurnCompleted && !tracking.player0Achieved) {
    updated = {
      ...updated,
      firstStrikeTracking: {
        ...updated.firstStrikeTracking,
        player0Achieved: true,
      },
    };
  }
  if (destroyerPlayerIndex === 1 && !tracking.player1FirstTurnCompleted && !tracking.player1Achieved) {
    updated = {
      ...updated,
      firstStrikeTracking: {
        ...updated.firstStrikeTracking,
        player1Achieved: true,
      },
    };
  }

  return updated;
}
