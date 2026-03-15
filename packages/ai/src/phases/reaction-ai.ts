/**
 * Reaction AI
 *
 * Handles reaction decisions for the AI when it's the reactive player.
 * Accepts valid reactions by default and only declines when reactions are
 * not legally usable by rules/state.
 */

import type { GameState, GameCommand, Position, UnitState } from '@hh/types';
import { CoreReaction } from '@hh/types';
import {
  findUnit,
  getAliveModels,
  getDeathOrGloryEligibleModelIds,
  getDeathOrGloryWeaponOptions,
} from '@hh/engine';
import type { StrategyMode } from '../types';

function buildStationaryModelPositions(
  unit: UnitState,
): Array<{ modelId: string; position: Position }> {
  return getAliveModels(unit).map((model) => ({
    modelId: model.id,
    position: { ...model.position },
  }));
}

function buildAerialReserveEntryPositions(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
): Array<{ modelId: string; position: Position }> | null {
  const aliveModels = getAliveModels(unit);
  if (aliveModels.length === 0) {
    return null;
  }

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

function buildReactionMovementPayload(
  state: GameState,
  unit: UnitState,
  playerIndex: number,
  reactionType: string,
): Array<{ modelId: string; position: Position }> | null {
  if (
    reactionType === 'combat-air-patrol' ||
    (reactionType === 'reserve-entry-intercept' &&
      unit.isInReserves &&
      (unit.reserveType ?? 'standard') === 'aerial')
  ) {
    return buildAerialReserveEntryPositions(state, unit, playerIndex);
  }

  return buildStationaryModelPositions(unit);
}

function buildDeathOrGloryCommand(
  state: GameState,
  unitId: string,
  reactionType: string,
): GameCommand {
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { type: 'declineReaction' };
  }

  const reactingModelId = getDeathOrGloryEligibleModelIds(unit)[0];
  if (!reactingModelId) {
    return { type: 'declineReaction' };
  }

  const weaponChoice = getDeathOrGloryWeaponOptions(state, unitId, reactingModelId)
    .sort((left, right) =>
      (right.strength - left.strength) ||
      (right.damage - left.damage) ||
      (right.attacks - left.attacks),
    )[0];
  if (!weaponChoice) {
    return { type: 'declineReaction' };
  }

  return {
    type: 'selectReaction',
    unitId,
    reactionType,
    reactingModelId,
    weaponId: weaponChoice.weaponId,
    profileName: weaponChoice.profileName,
  };
}

// ─── Main Entry ──────────────────────────────────────────────────────────────

/**
 * Generate a reaction command when the AI is the reactive player.
 * Only called when state.awaitingReaction is true.
 *
 * @returns selectReaction or declineReaction command
 */
export function generateReactionCommand(
  state: GameState,
  playerIndex: number,
  _strategy: StrategyMode,
): GameCommand | null {
  if (!state.awaitingReaction || !state.pendingReaction) {
    return null;
  }

  const pendingReaction = state.pendingReaction;
  const eligibleUnitIds = pendingReaction.eligibleUnitIds;

  if (!eligibleUnitIds || eligibleUnitIds.length === 0) {
    return { type: 'declineReaction' };
  }

  // Check reaction allotment
  const reactiveIndex = state.activePlayerIndex === 0 ? 1 : 0;
  if (reactiveIndex !== playerIndex) {
    return { type: 'declineReaction' };
  }

  const army = state.armies[reactiveIndex];
  if (army.reactionAllotmentRemaining <= 0) {
    return { type: 'declineReaction' };
  }

  const unitId = eligibleUnitIds[0];
  const unit = findUnit(state, unitId);
  if (!unit) {
    return { type: 'declineReaction' };
  }

  if (pendingReaction.reactionType === 'death-or-glory') {
    return buildDeathOrGloryCommand(state, unitId, pendingReaction.reactionType);
  }

  if (
    pendingReaction.reactionType === CoreReaction.Reposition ||
    pendingReaction.reactionType === 'evade' ||
    pendingReaction.reactionType === 'combat-air-patrol' ||
    pendingReaction.reactionType === 'reserve-entry-intercept' ||
    pendingReaction.reactionType === 'ws-chasing-wind'
  ) {
    const modelPositions = buildReactionMovementPayload(
      state,
      unit,
      reactiveIndex,
      pendingReaction.reactionType,
    );
    if (!modelPositions) {
      return { type: 'declineReaction' };
    }

    return {
      type: 'selectReaction',
      unitId,
      reactionType: pendingReaction.reactionType,
      modelPositions,
    };
  }

  return {
    type: 'selectReaction',
    unitId,
    reactionType: pendingReaction.reactionType,
  };
}
