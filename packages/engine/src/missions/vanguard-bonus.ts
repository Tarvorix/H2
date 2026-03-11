import type { GameState, MissionState, ObjectiveMarker, UnitState } from '@hh/types';
import type { GameEvent } from '../types';
import { findModel, findUnit, findUnitPlayerIndex } from '../game-queries';
import {
  getUnitObjectiveRuleSummary,
  OBJECTIVE_CONTROL_RANGE,
  resolveObjectiveControlForScoring,
} from './objective-queries';
import {
  hasVanguardBonusForObjective,
  recordObjectiveScored,
  recordVanguardBonus,
  setAssaultPhaseObjectiveSnapshot,
} from './mission-state';
import type { CombatState } from '../assault/assault-types';

interface VanguardScoringResult {
  state: GameState;
  events: GameEvent[];
}

function getVanguardScoringUnit(unit: UnitState | null): { unit: UnitState; vpValue: number } | null {
  if (!unit) return null;
  const summary = getUnitObjectiveRuleSummary(unit);
  if (summary.vanguardMajorityValue === null || summary.vanguardMajorityValue <= 0) {
    return null;
  }
  return {
    unit,
    vpValue: summary.vanguardMajorityValue,
  };
}

function getObjectiveById(missionState: MissionState, objectiveId: string): ObjectiveMarker | null {
  return missionState.objectives.find((objective) => objective.id === objectiveId) ?? null;
}

function applyVanguardObjectiveBonus(
  state: GameState,
  playerIndex: number,
  sourceUnitId: string,
  objectiveId: string,
  vpScored: number,
  trigger: MissionState['vanguardBonusHistory'][number]['trigger'],
): VanguardScoringResult {
  if (!state.missionState) {
    return { state, events: [] };
  }

  if (hasVanguardBonusForObjective(state.missionState, state.currentBattleTurn, playerIndex, objectiveId)) {
    return { state, events: [] };
  }

  const objective = getObjectiveById(state.missionState, objectiveId);
  if (!objective) {
    return { state, events: [] };
  }

  const updatedArmies = [...state.armies] as [typeof state.armies[0], typeof state.armies[1]];
  updatedArmies[playerIndex] = {
    ...updatedArmies[playerIndex],
    victoryPoints: updatedArmies[playerIndex].victoryPoints + vpScored,
  };

  const updatedMissionState = recordVanguardBonus(
    recordObjectiveScored(state.missionState, {
      battleTurn: state.currentBattleTurn,
      playerIndex,
      objectiveId,
      vpScored,
      source: `${objective.label} — Vanguard`,
    }),
    {
      battleTurn: state.currentBattleTurn,
      playerIndex,
      objectiveId,
      sourceUnitId,
      vpScored,
      trigger,
    },
  );

  return {
    state: {
      ...state,
      armies: updatedArmies,
      missionState: updatedMissionState,
    },
    events: [{
      type: 'objectiveScored',
      objectiveId,
      playerIndex,
      vpScored,
      objectiveLabel: `${objective.label} — Vanguard`,
    }],
  };
}

function collectAssignedObjectiveIdsForUnit(
  resolution: ReturnType<typeof resolveObjectiveControlForScoring>,
  playerIndex: number,
  unitId: string,
): string[] {
  return Object.entries(resolution.playerAssignments[playerIndex])
    .filter(([, assignedUnitId]) => assignedUnitId === unitId)
    .map(([objectiveId]) => objectiveId);
}

export function captureAssaultPhaseObjectiveSnapshot(state: GameState): MissionState['assaultPhaseObjectiveSnapshot'] {
  if (!state.missionState) return null;

  const unitIdsByObjectiveId: Record<string, string[]> = {};
  for (const objective of state.missionState.objectives) {
    if (objective.isRemoved) continue;

    const nearbyUnitIds = new Set<string>();
    for (const army of state.armies) {
      for (const unit of army.units) {
        const inRange = unit.models.some((model) => {
          if (model.isDestroyed) return false;
          const dx = model.position.x - objective.position.x;
          const dy = model.position.y - objective.position.y;
          return Math.sqrt(dx * dx + dy * dy) <= OBJECTIVE_CONTROL_RANGE;
        });
        if (inRange) {
          nearbyUnitIds.add(unit.id);
        }
      }
    }

    unitIdsByObjectiveId[objective.id] = [...nearbyUnitIds].sort();
  }

  return {
    battleTurn: state.currentBattleTurn,
    activePlayerIndex: state.activePlayerIndex,
    unitIdsByObjectiveId,
  };
}

export function recordAssaultPhaseObjectiveSnapshot(state: GameState): GameState {
  if (!state.missionState) return state;
  const snapshot = captureAssaultPhaseObjectiveSnapshot(state);
  return {
    ...state,
    missionState: setAssaultPhaseObjectiveSnapshot(state.missionState, snapshot),
  };
}

export function awardVanguardBonusForDestroyedUnits(
  state: GameState,
  attackerUnitId: string,
  destroyedUnitIds: string[],
): VanguardScoringResult {
  const attackerUnit = findUnit(state, attackerUnitId);
  const attackerPlayerIndex = findUnitPlayerIndex(state, attackerUnitId);
  const vanguardUnit = getVanguardScoringUnit(attackerUnit ?? null);
  if (!state.missionState || attackerPlayerIndex == null || !vanguardUnit || destroyedUnitIds.length === 0) {
    return { state, events: [] };
  }

  let currentState = state;
  const events: GameEvent[] = [];

  for (const destroyedUnitId of destroyedUnitIds) {
    const destroyedPlayerIndex = findUnitPlayerIndex(state, destroyedUnitId);
    if (destroyedPlayerIndex == null) continue;

    const resolution = resolveObjectiveControlForScoring(state, destroyedPlayerIndex);
    const objectiveIds = collectAssignedObjectiveIdsForUnit(resolution, destroyedPlayerIndex, destroyedUnitId);
    for (const objectiveId of objectiveIds) {
      const bonusResult = applyVanguardObjectiveBonus(
        currentState,
        attackerPlayerIndex,
        attackerUnitId,
        objectiveId,
        vanguardUnit.vpValue,
        'shooting-destruction',
      );
      currentState = bonusResult.state;
      events.push(...bonusResult.events);
    }
  }

  return {
    state: currentState,
    events,
  };
}

function getCombatVanguardScoringUnit(
  state: GameState,
  combatState: CombatState,
  playerIndex: number,
): { unit: UnitState; vpValue: number } | null {
  const attackerUnitIds = new Set<string>();

  for (const step of combatState.initiativeSteps) {
    for (const strikeGroup of step.strikeGroups) {
      if (strikeGroup.attackerPlayerIndex !== playerIndex || strikeGroup.attackerModelIds.length === 0) {
        continue;
      }

      for (const modelId of strikeGroup.attackerModelIds) {
        const found = findModel(state, modelId);
        if (found) {
          attackerUnitIds.add(found.unit.id);
        }
      }
    }
  }

  const candidates = [...attackerUnitIds]
    .map((unitId) => getVanguardScoringUnit(findUnit(state, unitId) ?? null))
    .filter((candidate): candidate is { unit: UnitState; vpValue: number } => candidate !== null)
    .sort((left, right) => {
      if (right.vpValue !== left.vpValue) {
        return right.vpValue - left.vpValue;
      }
      return left.unit.id.localeCompare(right.unit.id);
    });

  return candidates[0] ?? null;
}

export function awardVanguardBonusForCombatObjectiveUnits(
  state: GameState,
  combatState: CombatState,
  enemyUnitIds: string[],
  scorerPlayerIndex: number | null,
  trigger: 'assault-fallback' | 'assault-massacre',
): VanguardScoringResult {
  if (!state.missionState || scorerPlayerIndex === null || enemyUnitIds.length === 0) {
    return { state, events: [] };
  }

  const snapshot = state.missionState.assaultPhaseObjectiveSnapshot;
  if (
    !snapshot
    || snapshot.battleTurn !== state.currentBattleTurn
    || snapshot.activePlayerIndex !== state.activePlayerIndex
  ) {
    return { state, events: [] };
  }

  const vanguardUnit = getCombatVanguardScoringUnit(state, combatState, scorerPlayerIndex);
  if (!vanguardUnit) {
    return { state, events: [] };
  }

  let currentState = state;
  const events: GameEvent[] = [];
  for (const [objectiveId, unitIds] of Object.entries(snapshot.unitIdsByObjectiveId)) {
    if (!enemyUnitIds.some((unitId) => unitIds.includes(unitId))) {
      continue;
    }

    const bonusResult = applyVanguardObjectiveBonus(
      currentState,
      scorerPlayerIndex,
      vanguardUnit.unit.id,
      objectiveId,
      vanguardUnit.vpValue,
      trigger,
    );
    currentState = bonusResult.state;
    events.push(...bonusResult.events);
  }

  return {
    state: currentState,
    events,
  };
}
