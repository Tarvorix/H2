import type {
  AftermathOption,
  BlastPlacement,
  GameCommand,
  GameState,
  Position,
  TemplatePlacement,
  UnitState,
} from '@hh/types';
import {
  ChallengeGambit,
  Phase,
  SubPhase,
  UnitMovementState,
} from '@hh/types';
import {
  canUnitMove,
  canUnitRush,
  formFireGroups,
  getAliveModels,
  getBlastSizeInches,
  getClosestModelDistance,
  getModelsWithLOSToUnit,
  getValidCommands,
  hasLOSToUnit,
} from '@hh/engine';
import type { MacroAction, SearchConfig } from '../types';
import { generateCandidatePositions, evaluateMovementDestination } from '../evaluation/position-evaluation';
import { prioritizeChargeTargets, prioritizeShootingTargets } from '../evaluation/target-priority';
import {
  getChargeableUnits,
  getModelMovementCharacteristic,
  getShootableUnits,
  getUnitCentroid,
  getValidChargeTargets,
  getValidShootingTargets,
} from '../helpers/unit-queries';
import { selectWeaponsForAttack } from '../helpers/weapon-selection';
import { getAvailableAftermathOptions } from '@hh/engine';
import { TacticalStatus } from '@hh/types';

export interface SearchNodeState {
  state: GameState;
  actedUnitIds: Set<string>;
}

function makeAction(
  id: string,
  label: string,
  commands: GameCommand[],
  orderingScore: number,
  actorIds: string[],
  reasons: string[],
): MacroAction {
  return { id, label, commands, orderingScore, actorIds, reasons };
}

function translateUnitToCentroid(unit: UnitState, targetCentroid: Position): { modelId: string; position: Position }[] | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) return null;

  const originCentroid = getUnitCentroid(unit);
  if (!originCentroid) return null;

  const dx = targetCentroid.x - originCentroid.x;
  const dy = targetCentroid.y - originCentroid.y;
  return aliveModels.map((model) => ({
    modelId: model.id,
    position: {
      x: model.position.x + dx,
      y: model.position.y + dy,
    },
  }));
}

function buildReserveEntryPositions(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
): { modelId: string; position: Position }[] {
  const aliveModels = getAliveModels(unit);
  const xCenter = state.battlefield.width / 2;
  const isBottomEdge = playerIndex === 0;
  const edgeY = isBottomEdge ? 0.5 : (state.battlefield.height - 0.5);
  const inwardY = isBottomEdge ? 2 : (state.battlefield.height - 2);
  const spacing = 1.5;

  return aliveModels.map((model, index) => {
    const offset = index - ((aliveModels.length - 1) / 2);
    return {
      modelId: model.id,
      position: {
        x: Math.max(1, Math.min(state.battlefield.width - 1, xCenter + (offset * spacing))),
        y: index === 0 ? edgeY : inwardY,
      },
    };
  });
}

function buildSpecialPlacements(
  state: GameState,
  attackingUnitId: string,
  targetUnitId: string,
  weaponSelections: { modelId: string; weaponId: string; profileName?: string }[],
): { blastPlacements: BlastPlacement[]; templatePlacements: TemplatePlacement[] } {
  const attackerUnit = state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === attackingUnitId);
  const targetUnit = state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === targetUnitId);

  if (!attackerUnit || !targetUnit) {
    return { blastPlacements: [], templatePlacements: [] };
  }

  const modelsWithLos = getModelsWithLOSToUnit(state, attackingUnitId, targetUnitId).map((model) => model.id);
  const targetDistance = getClosestModelDistance(state, attackingUnitId, targetUnitId) ?? 0;
  const fireGroups = formFireGroups(
    weaponSelections.map((selection) => ({
      modelId: selection.modelId,
      weaponId: selection.weaponId,
      profileName: selection.profileName,
    })),
    attackerUnit,
    modelsWithLos,
    targetDistance,
  );
  const targetCentroid = getUnitCentroid(targetUnit) ?? getAliveModels(targetUnit)[0]?.position;
  if (!targetCentroid) {
    return { blastPlacements: [], templatePlacements: [] };
  }

  const blastPlacements: BlastPlacement[] = [];
  const templatePlacements: TemplatePlacement[] = [];

  for (const fireGroup of fireGroups) {
    if (fireGroup.weaponProfile.hasTemplate) {
      const sourceModelId = fireGroup.attacks[0]?.modelId;
      const sourceModel = sourceModelId
        ? getAliveModels(attackerUnit).find((model) => model.id === sourceModelId)
        : null;
      if (!sourceModel || !hasLOSToUnit(state, attackingUnitId, targetUnitId)) continue;

      const directionRadians = Math.atan2(
        targetCentroid.y - sourceModel.position.y,
        targetCentroid.x - sourceModel.position.x,
      );
      templatePlacements.push({
        sourceModelId,
        directionRadians,
      });
      continue;
    }

    const blastSize = getBlastSizeInches(fireGroup.specialRules);
    if (blastSize === null) continue;
    blastPlacements.push({
      sourceModelIds: fireGroup.attacks.map((attack) => attack.modelId),
      position: targetCentroid,
    });
  }

  return { blastPlacements, templatePlacements };
}

function generateReactionActions(node: SearchNodeState): MacroAction[] {
  const pendingReaction = node.state.pendingReaction;
  if (!node.state.awaitingReaction || !pendingReaction) return [];

  const actions = pendingReaction.eligibleUnitIds.map((unitId) =>
    makeAction(
      `reaction:${unitId}`,
      `React with ${unitId}`,
      [{
        type: 'selectReaction',
        unitId,
        reactionType: String(pendingReaction.reactionType),
      }],
      25,
      [unitId],
      ['legal reaction'],
    ),
  );

  actions.push(
    makeAction(
      'reaction:decline',
      'Decline reaction',
      [{ type: 'declineReaction' }],
      -10,
      [],
      ['decline'],
    ),
  );

  return actions;
}

function generateReserveActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const army = node.state.armies[playerIndex];

  for (const unit of army.units) {
    if (getAliveModels(unit).length === 0) continue;

    if (unit.isInReserves && !node.actedUnitIds.has(unit.id)) {
      actions.push(
        makeAction(
          `reserve:test:${unit.id}`,
          `Reserves test ${unit.id}`,
          [{ type: 'reservesTest', unitId: unit.id }],
          15,
          [unit.id],
          ['reserves test'],
        ),
      );
      continue;
    }

    if (unit.movementState === UnitMovementState.EnteredFromReserves && !node.actedUnitIds.has(unit.id)) {
      actions.push(
        makeAction(
          `reserve:deploy:${unit.id}`,
          `Deploy ${unit.id} from reserves`,
          [{
            type: 'deployUnit',
            unitId: unit.id,
            modelPositions: buildReserveEntryPositions(node.state, unit, playerIndex),
          }],
          18,
          [unit.id],
          ['reserves entry'],
        ),
      );
    }
  }

  return actions;
}

function generateMoveActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const battlefieldWidth = node.state.battlefield.width;
  const battlefieldHeight = node.state.battlefield.height;
  const movableUnits = node.state.armies[playerIndex].units.filter((unit) => {
    if (node.actedUnitIds.has(unit.id)) return false;
    if (getAliveModels(unit).length === 0) return false;
    if (!canUnitMove(unit)) return false;
    const centroid = getUnitCentroid(unit);
    return centroid !== null && unit.movementState === UnitMovementState.Stationary;
  });

  for (const unit of movableUnits) {
    const aliveModels = getAliveModels(unit);
    const centroid = getUnitCentroid(unit);
    if (!centroid || aliveModels.length === 0) continue;

    const maxMove = aliveModels.reduce(
      (currentMin, model) => Math.min(currentMin, getModelMovementCharacteristic(model)),
      Number.POSITIVE_INFINITY,
    );

    const destinations = generateCandidatePositions(centroid, maxMove, battlefieldWidth, battlefieldHeight)
      .map((position) => ({
        position,
        score: evaluateMovementDestination(node.state, unit.id, position, playerIndex),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, config.maxActionsPerUnit);

    for (const destination of destinations) {
      const modelPositions = translateUnitToCentroid(unit, destination.position);
      if (!modelPositions) continue;
      actions.push(
        makeAction(
          `move:${unit.id}:${destination.position.x.toFixed(1)}:${destination.position.y.toFixed(1)}`,
          `Move ${unit.id}`,
          [{
            type: 'moveUnit',
            unitId: unit.id,
            modelPositions,
          }],
          destination.score,
          [unit.id],
          ['movement candidate'],
        ),
      );
    }

    if (canUnitRush(unit)) {
      actions.push(
        makeAction(
          `rush:${unit.id}`,
          `Rush ${unit.id}`,
          [{ type: 'rushUnit', unitId: unit.id }],
          4,
          [unit.id],
          ['rush option'],
        ),
      );
    }
  }

  return actions;
}

function generateShootingContinuationActions(node: SearchNodeState): MacroAction[] {
  const attackState = node.state.shootingAttackState;
  if (!attackState) return [];

  const actions: MacroAction[] = [];
  const targetUnit = node.state.armies
    .flatMap((army) => army.units)
    .find((unit) => unit.id === attackState.targetUnitId);

  if (!targetUnit) {
    return [
      makeAction(
        'shoot:resolve',
        'Resolve shooting casualties',
        [{ type: 'resolveShootingCasualties' }],
        1,
        [],
        ['resolve attack'],
      ),
    ];
  }

  if (!attackState.selectedTargetModelId) {
    const candidateModels = getAliveModels(targetUnit)
      .sort((left, right) => {
        if (left.isWarlord !== right.isWarlord) return left.isWarlord ? -1 : 1;
        return left.currentWounds - right.currentWounds;
      })
      .slice(0, 2);

    for (const model of candidateModels) {
      actions.push(
        makeAction(
          `shoot:target:${model.id}`,
          `Direct hits onto ${model.id}`,
          [
            { type: 'selectTargetModel', modelId: model.id },
            { type: 'resolveShootingCasualties' },
          ],
          model.isWarlord ? 24 : 12 - model.currentWounds,
          [targetUnit.id],
          ['directed allocation'],
        ),
      );
    }
  }

  actions.push(
    makeAction(
      'shoot:resolve',
      'Resolve shooting casualties',
      [{ type: 'resolveShootingCasualties' }],
      0,
      [],
      ['resolve attack'],
    ),
  );

  return actions;
}

function generateShootingActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  if (node.state.shootingAttackState) {
    return generateShootingContinuationActions(node);
  }

  const actions: MacroAction[] = [];
  const shootableUnits = getShootableUnits(node.state, playerIndex, node.actedUnitIds);

  for (const unit of shootableUnits) {
    const prioritizedTargets = prioritizeShootingTargets(node.state, unit.id, playerIndex)
      .slice(0, config.maxActionsPerUnit);

    for (const targetScore of prioritizedTargets) {
      const target = getValidShootingTargets(node.state, unit.id).find((candidate) => candidate.id === targetScore.unitId);
      if (!target) continue;

      const weaponSelections = selectWeaponsForAttack(node.state, unit, target, 'tactical');
      if (weaponSelections.length === 0) continue;

      const placements = buildSpecialPlacements(node.state, unit.id, target.id, weaponSelections);
      actions.push(
        makeAction(
          `shoot:${unit.id}:${target.id}`,
          `Shoot ${target.id} with ${unit.id}`,
          [{
            type: 'declareShooting',
            attackingUnitId: unit.id,
            targetUnitId: target.id,
            weaponSelections,
            blastPlacements: placements.blastPlacements,
            templatePlacements: placements.templatePlacements,
          }],
          targetScore.score,
          [unit.id],
          targetScore.reasons,
        ),
      );
    }
  }

  return actions;
}

function generateChargeActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const chargeableUnits = getChargeableUnits(node.state, playerIndex, node.actedUnitIds);

  for (const unit of chargeableUnits) {
    const prioritizedTargets = prioritizeChargeTargets(node.state, unit.id, playerIndex)
      .slice(0, config.maxActionsPerUnit);

    for (const targetScore of prioritizedTargets) {
      actions.push(
        makeAction(
          `charge:${unit.id}:${targetScore.unitId}`,
          `Charge ${targetScore.unitId} with ${unit.id}`,
          [{
            type: 'declareCharge',
            chargingUnitId: unit.id,
            targetUnitId: targetScore.unitId,
          }],
          targetScore.score,
          [unit.id],
          targetScore.reasons,
        ),
      );
    }

    if (prioritizedTargets.length === 0 && getValidChargeTargets(node.state, unit.id).length === 0) {
      continue;
    }
  }

  return actions;
}

function generateChallengeActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const combats = node.state.activeCombats ?? [];

  for (const combat of combats) {
    const challengeState = (combat as typeof combat & {
      challengeState?: {
        challengerId: string;
        challengedId: string;
        challengerPlayerIndex: number;
        challengedPlayerIndex: number;
        challengerGambit: string | null;
        challengedGambit: string | null;
        currentStep: string;
      };
    }).challengeState;

    if (!challengeState) {
      const combatUnitIds = [...combat.activePlayerUnitIds, ...combat.reactivePlayerUnitIds];
      const ownUnitIds = combatUnitIds.filter((unitId) =>
        node.state.armies[playerIndex].units.some((unit) => unit.id === unitId),
      );
      const enemyUnitIds = combatUnitIds.filter((unitId) =>
        node.state.armies[playerIndex === 0 ? 1 : 0].units.some((unit) => unit.id === unitId),
      );
      if (ownUnitIds.length === 0 || enemyUnitIds.length === 0) continue;

      const ownModels = ownUnitIds
        .flatMap((unitId) => node.state.armies[playerIndex].units.find((unit) => unit.id === unitId)?.models ?? [])
        .filter((model) => !model.isDestroyed)
        .filter((model) => model.isWarlord || model.profileModelName.toLowerCase().includes('sergeant'));
      const enemyModels = enemyUnitIds
        .flatMap((unitId) => node.state.armies[playerIndex === 0 ? 1 : 0].units.find((unit) => unit.id === unitId)?.models ?? [])
        .filter((model) => !model.isDestroyed)
        .filter((model) => model.isWarlord || model.profileModelName.toLowerCase().includes('sergeant'));

      if (ownModels.length > 0 && enemyModels.length > 0) {
        actions.push(
          makeAction(
            `challenge:declare:${ownModels[0].id}:${enemyModels[0].id}`,
            `Declare challenge`,
            [{
              type: 'declareChallenge',
              challengerModelId: ownModels[0].id,
              targetModelId: enemyModels[0].id,
            }],
            8,
            [ownModels[0].id],
            ['challenge opportunity'],
          ),
        );
      }
      continue;
    }

    if (challengeState.challengedPlayerIndex === playerIndex && challengeState.currentStep === 'FACE_OFF') {
      actions.push(
        makeAction(
          `challenge:accept:${challengeState.challengedId}`,
          `Accept challenge`,
          [{ type: 'acceptChallenge', challengedModelId: challengeState.challengedId }],
          10,
          [challengeState.challengedId],
          ['accept challenge'],
        ),
      );
      actions.push(
        makeAction(
          'challenge:decline',
          'Decline challenge',
          [{ type: 'declineChallenge' }],
          -5,
          [],
          ['decline challenge'],
        ),
      );
    }

    const challengerNeedsGambit =
      challengeState.challengerPlayerIndex === playerIndex &&
      challengeState.challengerGambit === null;
    const challengedNeedsGambit =
      challengeState.challengedPlayerIndex === playerIndex &&
      challengeState.challengedGambit === null;

    if (challengerNeedsGambit || challengedNeedsGambit) {
      const modelId = challengerNeedsGambit ? challengeState.challengerId : challengeState.challengedId;
      const gambits = [
        ChallengeGambit.PressTheAttack,
        ChallengeGambit.Guard,
        ChallengeGambit.SeizeTheInitiative,
      ];

      gambits.forEach((gambit, index) => {
        actions.push(
          makeAction(
            `gambit:${modelId}:${gambit}`,
            `Select ${gambit}`,
            [{ type: 'selectGambit', modelId, gambit }],
            12 - (index * 2),
            [modelId],
            ['gambit selection'],
          ),
        );
      });
    }
  }

  return actions;
}

function generateFightActions(node: SearchNodeState): MacroAction[] {
  return (node.state.activeCombats ?? [])
    .filter((combat) => !combat.resolved)
    .map((combat, index) =>
      makeAction(
        `fight:${combat.combatId}`,
        `Resolve fight ${index + 1}`,
        [{ type: 'resolveFight', combatId: combat.combatId }],
        6,
        [combat.combatId],
        ['resolve combat'],
      ),
    );
}

function getResolutionState(
  state: GameState,
  unitId: string,
): { availableOptions: AftermathOption[]; isWinner: boolean } | null {
  const combats = state.activeCombats ?? [];
  const combat = combats.find((candidate) =>
    candidate.activePlayerUnitIds.includes(unitId) || candidate.reactivePlayerUnitIds.includes(unitId),
  );
  if (!combat) return null;

  const unit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === unitId);
  if (!unit) return null;

  const isActiveUnit = combat.activePlayerUnitIds.includes(unitId);
  const isWinner = (isActiveUnit && combat.activePlayerCRP > combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP > combat.activePlayerCRP);
  const isLoser = (isActiveUnit && combat.activePlayerCRP < combat.reactivePlayerCRP)
    || (!isActiveUnit && combat.reactivePlayerCRP < combat.activePlayerCRP);
  const isDraw = combat.activePlayerCRP === combat.reactivePlayerCRP;
  const enemyUnitIds = isActiveUnit ? combat.reactivePlayerUnitIds : combat.activePlayerUnitIds;
  const allEnemyFleeing = enemyUnitIds.every((enemyId) => {
    const enemyUnit = state.armies.flatMap((army) => army.units).find((candidate) => candidate.id === enemyId);
    return enemyUnit ? enemyUnit.statuses.includes(TacticalStatus.Routed) : true;
  });

  return {
    availableOptions: getAvailableAftermathOptions(
      state,
      unitId,
      isWinner,
      isLoser,
      isDraw,
      allEnemyFleeing,
    ),
    isWinner,
  };
}

function generateResolutionActions(
  node: SearchNodeState,
  playerIndex: number,
): MacroAction[] {
  const actions: MacroAction[] = [];
  const units = node.state.armies[playerIndex].units.filter((unit) =>
    unit.isLockedInCombat && getAliveModels(unit).length > 0 && !node.actedUnitIds.has(unit.id),
  );

  for (const unit of units) {
    const resolutionState = getResolutionState(node.state, unit.id);
    if (!resolutionState) continue;

    resolutionState.availableOptions.forEach((option, index) => {
      const score = resolutionState.isWinner
        ? (
          option === 'Pursue' ? 12 :
          option === 'Consolidate' ? 10 :
          option === 'Gun Down' ? 9 :
          4 - index
        )
        : (
          option === 'Hold' ? 7 :
          option === 'Disengage' ? 6 :
          option === 'Fall Back' ? 4 :
          2 - index
        );
      actions.push(
        makeAction(
          `aftermath:${unit.id}:${option}`,
          `Select ${option} for ${unit.id}`,
          [{ type: 'selectAftermath', unitId: unit.id, option }],
          score,
          [unit.id],
          ['aftermath'],
        ),
      );
    });
  }

  return actions;
}

export function generateMacroActions(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
  options: { includeAdvanceCommands?: boolean } = {},
): MacroAction[] {
  const includeAdvanceCommands = options.includeAdvanceCommands ?? true;
  const valid = new Set(getValidCommands(node.state));
  const actions = node.state.awaitingReaction
    ? generateReactionActions(node)
    : (() => {
      switch (node.state.currentPhase) {
        case Phase.Movement:
          switch (node.state.currentSubPhase) {
            case SubPhase.Reserves:
              return generateReserveActions(node, playerIndex);
            case SubPhase.Move:
              return generateMoveActions(node, playerIndex, config);
            default:
              return [];
          }
        case Phase.Shooting:
          return node.state.currentSubPhase === SubPhase.Attack
            ? generateShootingActions(node, playerIndex, config)
            : [];
        case Phase.Assault:
          switch (node.state.currentSubPhase) {
            case SubPhase.Charge:
              return generateChargeActions(node, playerIndex, config);
            case SubPhase.Challenge:
              return generateChallengeActions(node, playerIndex);
            case SubPhase.Fight:
              return generateFightActions(node);
            case SubPhase.Resolution:
              return generateResolutionActions(node, playerIndex);
            default:
              return [];
          }
        default:
          return [];
      }
    })();

  const filteredActions = actions
    .filter((action) => action.commands.every((command) => valid.has(command.type)))
    .sort((left, right) => right.orderingScore - left.orderingScore)
    .slice(0, config.maxRootActions);

  if (filteredActions.length > 0 || !includeAdvanceCommands) {
    return filteredActions;
  }

  if (valid.has('endSubPhase')) {
    return [
      makeAction(
        'advance:end-sub-phase',
        'End sub-phase',
        [{ type: 'endSubPhase' }],
        -1,
        [],
        ['advance'],
      ),
    ];
  }

  if (valid.has('endPhase')) {
    return [
      makeAction(
        'advance:end-phase',
        'End phase',
        [{ type: 'endPhase' }],
        -2,
        [],
        ['advance'],
      ),
    ];
  }

  return [];
}

export function isRealDecisionNode(
  node: SearchNodeState,
  playerIndex: number,
  config: SearchConfig,
): boolean {
  return generateMacroActions(node, playerIndex, config, { includeAdvanceCommands: false }).length > 0;
}
