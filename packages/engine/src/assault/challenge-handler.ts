/**
 * Challenge Handler
 * Implements Challenge declaration and response (Steps 1-2 of the Challenge Sub-Phase).
 * Reference: HH_Rules_Battle.md — Challenge Sub-Phase Steps 1-2
 */

import type { GameState, ModelState } from '@hh/types';
import { ModelSubType, ModelType, TacticalStatus } from '@hh/types';
import type {
  GameEvent,
  ChallengeDeclaredEvent,
  ChallengeDeclinedEvent,
  DisgracedAppliedEvent,
} from '../types';
import {
  findUnit,
  findModel,
  findUnitPlayerIndex,
  getAliveModels,
} from '../game-queries';
import { applyDisgraced } from '../state-helpers';
import {
  getModelType,
  getModelWounds,
  modelHasSubType,
} from '../profile-lookup';
import { syncActiveCombats } from './combat-state';
import type { ChallengeState, CombatState } from './assault-types';
import {
  getMandatoryAcceptorPriority,
  getMandatoryChallengerPriority,
  modelHasExplicitChallengeEligibility,
  modelHasTargetSelectionOverride,
} from './challenge-rules';

type CombatSide = 'active' | 'reactive';

interface ChallengeEligibilitySnapshot {
  leftEligibleByUnit: Map<string, ModelState[]>;
  rightEligibleByUnit: Map<string, ModelState[]>;
  leftEligibleModels: ModelState[];
  rightEligibleModels: ModelState[];
}

// ─── Result Types ───────────────────────────────────────────────────────────

export interface ChallengeEligibilityResult {
  hasEligibleChallengers: boolean;
  eligibleChallengerIds: string[];
}

export interface ChallengeDeclareResult {
  state: GameState;
  events: GameEvent[];
  valid: boolean;
  error?: string;
}

export interface ChallengeResponseResult {
  state: GameState;
  events: GameEvent[];
  valid: boolean;
  accepted: boolean;
  challengedModelId?: string;
  disgracedModelId?: string;
  error?: string;
}

// ─── Public Queries ─────────────────────────────────────────────────────────

export function getEligibleChallengers(
  state: GameState,
  unitId: string,
): ChallengeEligibilityResult {
  const preparedState = prepareChallengeState(state);
  const unit = findUnit(preparedState, unitId);
  if (!unit || !unit.isLockedInCombat || unit.statuses.includes(TacticalStatus.Routed)) {
    return { hasEligibleChallengers: false, eligibleChallengerIds: [] };
  }

  const snapshot = buildChallengeEligibilityForSides(
    preparedState,
    [unitId],
    unit.engagedWithUnitIds,
  );
  const eligibleIds = (snapshot.leftEligibleByUnit.get(unitId) ?? []).map((model) => model.id);

  return {
    hasEligibleChallengers: eligibleIds.length > 0,
    eligibleChallengerIds: eligibleIds,
  };
}

export function getEligibleAcceptors(
  state: GameState,
  unitId: string,
): string[] {
  const preparedState = prepareChallengeState(state);
  const unit = findUnit(preparedState, unitId);
  if (!unit || !unit.isLockedInCombat || unit.statuses.includes(TacticalStatus.Routed)) {
    return [];
  }

  const snapshot = buildChallengeEligibilityForSides(
    preparedState,
    [unitId],
    unit.engagedWithUnitIds,
  );
  return (snapshot.leftEligibleByUnit.get(unitId) ?? []).map((model) => model.id);
}

// ─── Declare Challenge ──────────────────────────────────────────────────────

export function declareChallenge(
  state: GameState,
  challengerModelId: string,
  targetModelId: string,
): ChallengeDeclareResult {
  const preparedState = prepareChallengeState(state);
  const events: GameEvent[] = [];

  const challengerInfo = findModel(preparedState, challengerModelId);
  if (!challengerInfo || challengerInfo.model.isDestroyed) {
    return invalidDeclare(preparedState, events, `Challenger model '${challengerModelId}' not found`);
  }

  const targetInfo = findModel(preparedState, targetModelId);
  if (!targetInfo || targetInfo.model.isDestroyed) {
    return invalidDeclare(preparedState, events, `Target model '${targetModelId}' not found`);
  }

  const challengerPlayerIndex = findUnitPlayerIndex(preparedState, challengerInfo.unit.id);
  if (challengerPlayerIndex !== preparedState.activePlayerIndex) {
    return invalidDeclare(preparedState, events, 'Challenger must belong to the active player');
  }

  const combatInfo = findCombatByUnits(
    preparedState,
    challengerInfo.unit.id,
    targetInfo.unit.id,
  );
  if (!combatInfo) {
    return invalidDeclare(preparedState, events, 'Challenger and target units are not engaged in combat');
  }

  if (combatInfo.combat.challengeState) {
    return invalidDeclare(preparedState, events, 'A challenge is already active in this combat');
  }

  const challengerSide = getCombatSideForUnit(combatInfo.combat, challengerInfo.unit.id);
  const targetSide = getCombatSideForUnit(combatInfo.combat, targetInfo.unit.id);
  if (challengerSide !== 'active' || targetSide !== 'reactive') {
    return invalidDeclare(preparedState, events, 'Challenge must target an opposing unit in the active combat');
  }

  const eligibility = buildChallengeEligibilityForSides(
    preparedState,
    combatInfo.combat.activePlayerUnitIds,
    combatInfo.combat.reactivePlayerUnitIds,
  );
  const activeEligibleModels = eligibility.leftEligibleModels;
  const reactiveEligibleModels = eligibility.rightEligibleModels;

  if (!activeEligibleModels.some((model) => model.id === challengerModelId)) {
    return invalidDeclare(
      preparedState,
      events,
      `Model '${challengerModelId}' is not eligible to issue a challenge`,
    );
  }

  if (reactiveEligibleModels.length === 0) {
    return invalidDeclare(preparedState, events, 'No opposing eligible models can take part in this challenge');
  }

  const mandatoryChallengerIds = getMandatoryModelIds(
    activeEligibleModels,
    (model) => getMandatoryChallengerPriority(model),
  );
  if (
    mandatoryChallengerIds.length > 0 &&
    !mandatoryChallengerIds.includes(challengerModelId)
  ) {
    return invalidDeclare(
      preparedState,
      events,
      'Another model in this combat must be declared as the Challenger',
    );
  }

  if (modelHasTargetSelectionOverride(challengerInfo.model)) {
    const eligibleTargetIds = new Set(reactiveEligibleModels.map((model) => model.id));
    if (!eligibleTargetIds.has(targetModelId)) {
      return invalidDeclare(
        preparedState,
        events,
        'Selected challenged model is not eligible to accept this challenge',
      );
    }
  }

  const challengedPlayerIndex = findUnitPlayerIndex(preparedState, targetInfo.unit.id);
  if (challengedPlayerIndex === undefined) {
    return invalidDeclare(
      preparedState,
      events,
      `Could not determine the challenged player for unit '${targetInfo.unit.id}'`,
    );
  }

  const challengeEvent: ChallengeDeclaredEvent = {
    type: 'challengeDeclared',
    challengerModelId,
    challengerUnitId: challengerInfo.unit.id,
    targetModelId,
    targetUnitId: targetInfo.unit.id,
    challengerPlayerIndex,
  };
  events.push(challengeEvent);

  const challengeState: ChallengeState = {
    challengerId: challengerModelId,
    challengedId: targetModelId,
    challengerUnitId: challengerInfo.unit.id,
    challengedUnitId: targetInfo.unit.id,
    challengerPlayerIndex,
    challengedPlayerIndex,
    currentStep: 'DECLARE',
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
  };

  const updatedCombats = [...(preparedState.activeCombats ?? []) as CombatState[]];
  updatedCombats[combatInfo.index] = {
    ...updatedCombats[combatInfo.index],
    challengeState,
  };

  return {
    state: {
      ...preparedState,
      activeCombats: updatedCombats,
    },
    events,
    valid: true,
  };
}

// ─── Accept Challenge ───────────────────────────────────────────────────────

export function acceptChallenge(
  state: GameState,
  challengedModelId: string,
  challengerModelId: string,
): ChallengeResponseResult {
  const preparedState = prepareChallengeState(state);
  const events: GameEvent[] = [];

  const challengedInfo = findModel(preparedState, challengedModelId);
  const challengerInfo = findModel(preparedState, challengerModelId);
  if (!challengedInfo || challengedInfo.model.isDestroyed || !challengerInfo) {
    return invalidResponse(preparedState, events, 'Challenge acceptance is not valid');
  }

  const combatInfo = findCombatByChallengerId(preparedState, challengerModelId);
  if (!combatInfo || !combatInfo.combat.challengeState) {
    return invalidResponse(preparedState, events, 'No active challenge is waiting for acceptance');
  }

  const challengerSide = getCombatSideForUnit(combatInfo.combat, challengerInfo.unit.id);
  const challengedSide = getCombatSideForUnit(combatInfo.combat, challengedInfo.unit.id);
  if (challengerSide === null || challengedSide === null || challengerSide === challengedSide) {
    return invalidResponse(preparedState, events, 'Challenge acceptance is not valid');
  }

  const eligibility = buildChallengeEligibilityForSides(
    preparedState,
    combatInfo.combat.activePlayerUnitIds,
    combatInfo.combat.reactivePlayerUnitIds,
  );
  const acceptingModels = challengedSide === 'active'
    ? eligibility.leftEligibleModels
    : eligibility.rightEligibleModels;
  if (!acceptingModels.some((model) => model.id === challengedModelId)) {
    return invalidResponse(preparedState, events, 'Selected model is not eligible to accept the challenge');
  }

  const mandatoryAcceptorIds = getMandatoryModelIds(
    acceptingModels,
    (model) => getMandatoryAcceptorPriority(model, challengerInfo.model.unitProfileId),
  );
  if (
    mandatoryAcceptorIds.length > 0 &&
    !mandatoryAcceptorIds.includes(challengedModelId)
  ) {
    return invalidResponse(preparedState, events, 'Another model in this combat must accept the challenge');
  }

  let challengerCRP = combatInfo.combat.challengeState.challengerCRP;
  const originallySelectedTargetId = combatInfo.combat.challengeState.challengedId;
  if (
    modelHasTargetSelectionOverride(challengerInfo.model) &&
    originallySelectedTargetId !== challengedModelId
  ) {
    const originallySelectedTarget = findModel(preparedState, originallySelectedTargetId);
    if (originallySelectedTarget && !originallySelectedTarget.model.isDestroyed) {
      challengerCRP += getModelWounds(
        originallySelectedTarget.model.unitProfileId,
        originallySelectedTarget.model.profileModelName,
      );
    }
  }

  const updatedChallenge: ChallengeState = {
    ...combatInfo.combat.challengeState,
    challengedId: challengedModelId,
    challengedUnitId: challengedInfo.unit.id,
    challengedPlayerIndex: challengedInfo.army.playerIndex,
    challengerCRP,
    currentStep: 'FACE_OFF',
  };

  const updatedCombats = [...(preparedState.activeCombats ?? []) as CombatState[]];
  updatedCombats[combatInfo.index] = {
    ...combatInfo.combat,
    challengeState: updatedChallenge,
  };

  return {
    state: {
      ...preparedState,
      activeCombats: updatedCombats,
    },
    events,
    valid: true,
    accepted: true,
    challengedModelId,
  };
}

// ─── Decline Challenge ──────────────────────────────────────────────────────

export function declineChallenge(
  state: GameState,
  challengerModelId: string,
  targetUnitId: string,
): ChallengeResponseResult {
  const preparedState = prepareChallengeState(state);
  const events: GameEvent[] = [];

  const targetUnit = findUnit(preparedState, targetUnitId);
  const challengerInfo = findModel(preparedState, challengerModelId);
  if (!targetUnit || !challengerInfo) {
    return invalidResponse(preparedState, events, 'Challenge decline is not valid');
  }

  const combatInfo = findCombatByChallengerId(preparedState, challengerModelId);
  if (!combatInfo || !combatInfo.combat.challengeState) {
    return invalidResponse(preparedState, events, 'No active challenge is waiting for a response');
  }

  const challengerSide = getCombatSideForUnit(combatInfo.combat, challengerInfo.unit.id);
  const targetSide = getCombatSideForUnit(combatInfo.combat, targetUnitId);
  if (challengerSide === null || targetSide === null || challengerSide === targetSide) {
    return invalidResponse(preparedState, events, 'Challenge decline is not valid');
  }

  const eligibility = buildChallengeEligibilityForSides(
    preparedState,
    combatInfo.combat.activePlayerUnitIds,
    combatInfo.combat.reactivePlayerUnitIds,
  );
  const decliningEligibleModels = targetSide === 'active'
    ? eligibility.leftEligibleModels
    : eligibility.rightEligibleModels;
  const mandatoryAcceptorIds = getMandatoryModelIds(
    decliningEligibleModels,
    (model) => getMandatoryAcceptorPriority(model, challengerInfo.model.unitProfileId),
  );
  if (mandatoryAcceptorIds.length > 0) {
    return invalidResponse(
      preparedState,
      events,
      'This combat contains a model that must accept the challenge',
    );
  }

  const orderedDisgraceCandidates = [
    ...(targetSide === 'active'
      ? (eligibility.leftEligibleByUnit.get(targetUnitId) ?? [])
      : (eligibility.rightEligibleByUnit.get(targetUnitId) ?? [])),
    ...decliningEligibleModels.filter((model) =>
      !targetUnit.models.some((targetModel) => targetModel.id === model.id),
    ),
  ];

  let newState = preparedState;
  let disgracedModelId: string | undefined;

  if (orderedDisgraceCandidates.length > 0) {
    disgracedModelId = orderedDisgraceCandidates[0].id;
    newState = applyDisgraced(newState, disgracedModelId);

    const disgracedEvent: DisgracedAppliedEvent = {
      type: 'disgracedApplied',
      modelId: disgracedModelId,
      unitId: findModel(newState, disgracedModelId)?.unit.id ?? targetUnitId,
    };
    events.push(disgracedEvent);
  }

  const declinedEvent: ChallengeDeclinedEvent = {
    type: 'challengeDeclined',
    challengerModelId,
    decliningUnitId: targetUnitId,
    disgracedModelId: disgracedModelId ?? null,
  };
  events.push(declinedEvent);

  const updatedCombats = [...(newState.activeCombats ?? []) as CombatState[]];
  updatedCombats[combatInfo.index] = {
    ...combatInfo.combat,
    challengeState: null,
  };

  return {
    state: {
      ...newState,
      activeCombats: updatedCombats,
    },
    events,
    valid: true,
    accepted: false,
    disgracedModelId,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function prepareChallengeState(state: GameState): GameState {
  return state.activeCombats && state.activeCombats.length > 0
    ? state
    : syncActiveCombats(state).state;
}

function invalidDeclare(
  state: GameState,
  events: GameEvent[],
  error: string,
): ChallengeDeclareResult {
  return {
    state,
    events,
    valid: false,
    error,
  };
}

function invalidResponse(
  state: GameState,
  events: GameEvent[],
  error: string,
): ChallengeResponseResult {
  return {
    state,
    events,
    valid: false,
    accepted: false,
    error,
  };
}

function findCombatByUnits(
  state: GameState,
  firstUnitId: string,
  secondUnitId: string,
): { combat: CombatState; index: number } | null {
  const combats = (state.activeCombats ?? []) as CombatState[];
  const index = combats.findIndex((combat) => {
    const firstSide = getCombatSideForUnit(combat, firstUnitId);
    const secondSide = getCombatSideForUnit(combat, secondUnitId);
    return firstSide !== null && secondSide !== null && firstSide !== secondSide;
  });

  if (index < 0) {
    return null;
  }

  return {
    combat: combats[index],
    index,
  };
}

function findCombatByChallengerId(
  state: GameState,
  challengerModelId: string,
): { combat: CombatState; index: number } | null {
  const combats = (state.activeCombats ?? []) as CombatState[];
  const index = combats.findIndex((combat) =>
    combat.challengeState?.challengerId === challengerModelId,
  );
  if (index < 0) {
    return null;
  }

  return {
    combat: combats[index],
    index,
  };
}

function getCombatSideForUnit(
  combat: CombatState,
  unitId: string,
): CombatSide | null {
  if (combat.activePlayerUnitIds.includes(unitId)) {
    return 'active';
  }
  if (combat.reactivePlayerUnitIds.includes(unitId)) {
    return 'reactive';
  }
  return null;
}

function buildChallengeEligibilityForSides(
  state: GameState,
  leftUnitIds: string[],
  rightUnitIds: string[],
): ChallengeEligibilitySnapshot {
  const leftEnemyProfiles = collectAliveEnemyProfileIds(state, rightUnitIds);
  const rightEnemyProfiles = collectAliveEnemyProfileIds(state, leftUnitIds);

  const leftCandidates = buildChallengeCandidatesByUnit(state, leftUnitIds, leftEnemyProfiles);
  const rightCandidates = buildChallengeCandidatesByUnit(state, rightUnitIds, rightEnemyProfiles);

  const leftEligibleByUnit = filterChallengeCandidatesByEngagement(
    state,
    leftCandidates,
    rightCandidates,
  );
  const rightEligibleByUnit = filterChallengeCandidatesByEngagement(
    state,
    rightCandidates,
    leftCandidates,
  );

  return {
    leftEligibleByUnit,
    rightEligibleByUnit,
    leftEligibleModels: flattenModelMap(leftEligibleByUnit),
    rightEligibleModels: flattenModelMap(rightEligibleByUnit),
  };
}

function collectAliveEnemyProfileIds(
  state: GameState,
  unitIds: string[],
): Set<string> {
  const ids = new Set<string>();
  for (const unitId of unitIds) {
    const unit = findUnit(state, unitId);
    if (!unit) continue;
    for (const model of getAliveModels(unit)) {
      ids.add(model.unitProfileId);
    }
  }
  return ids;
}

function buildChallengeCandidatesByUnit(
  state: GameState,
  unitIds: string[],
  enemyProfileIds: Set<string>,
): Map<string, ModelState[]> {
  const candidatesByUnit = new Map<string, ModelState[]>();

  for (const unitId of unitIds) {
    const unit = findUnit(state, unitId);
    if (!unit || unit.statuses.includes(TacticalStatus.Routed)) {
      candidatesByUnit.set(unitId, []);
      continue;
    }

    const candidates = getAliveModels(unit).filter((model) =>
      isModelIntrinsicallyEligible(model, enemyProfileIds),
    );
    candidatesByUnit.set(unitId, candidates);
  }

  return candidatesByUnit;
}

function filterChallengeCandidatesByEngagement(
  state: GameState,
  candidatesByUnit: Map<string, ModelState[]>,
  enemyCandidatesByUnit: Map<string, ModelState[]>,
): Map<string, ModelState[]> {
  const eligibleByUnit = new Map<string, ModelState[]>();

  for (const [unitId, candidates] of candidatesByUnit.entries()) {
    const unit = findUnit(state, unitId);
    if (!unit || candidates.length === 0) {
      eligibleByUnit.set(unitId, []);
      continue;
    }

    const hasEligibleEngagedEnemy = unit.engagedWithUnitIds.some((enemyUnitId) =>
      (enemyCandidatesByUnit.get(enemyUnitId)?.length ?? 0) > 0,
    );
    eligibleByUnit.set(unitId, hasEligibleEngagedEnemy ? candidates : []);
  }

  return eligibleByUnit;
}

function flattenModelMap(
  modelMap: Map<string, ModelState[]>,
): ModelState[] {
  return Array.from(modelMap.values()).flat();
}

function isModelIntrinsicallyEligible(
  model: ModelState,
  enemyProfileIds: Set<string>,
): boolean {
  const modelType = getModelType(model.unitProfileId, model.profileModelName);
  if (modelType === ModelType.Paragon) {
    return true;
  }

  if (
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Command) ||
    modelHasSubType(model.unitProfileId, model.profileModelName, ModelSubType.Champion)
  ) {
    return true;
  }

  return modelHasExplicitChallengeEligibility(model, enemyProfileIds);
}

function getMandatoryModelIds(
  models: ModelState[],
  getPriority: (model: ModelState) => number | null,
): string[] {
  let bestPriority = 0;
  const mandatoryIds: string[] = [];

  for (const model of models) {
    const priority = getPriority(model);
    if (priority === null || priority <= 0) {
      continue;
    }

    if (priority > bestPriority) {
      bestPriority = priority;
      mandatoryIds.length = 0;
      mandatoryIds.push(model.id);
      continue;
    }

    if (priority === bestPriority) {
      mandatoryIds.push(model.id);
    }
  }

  return mandatoryIds;
}
