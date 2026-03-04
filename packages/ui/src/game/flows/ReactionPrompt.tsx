/**
 * ReactionPrompt
 *
 * Modal overlay that appears when the engine sets awaitingReaction = true.
 * Shows the reaction type available, eligible units, and allows the reactive
 * player to select a unit to react with or decline the reaction.
 */

import { useCallback } from 'react';
import { CoreReaction } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';

interface ReactionPromptProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

const REACTION_INFO: Record<string, { name: string; description: string }> = {
  [CoreReaction.Reposition]: {
    name: 'Reposition',
    description: 'Move each model up to its Initiative value after an enemy unit ends a move within 12" and Line of Sight.',
  },
  [CoreReaction.ReturnFire]: {
    name: 'Return Fire',
    description: 'In Shooting Step 3, declare this for the targeted unit. Resolve your reaction shooting attack before the original attack finishes casualty removal.',
  },
  [CoreReaction.Overwatch]: {
    name: 'Overwatch',
    description: 'In Charge Step 4, fire at full BS with any ranged weapon instead of a snap-shot volley. No separate measurement declaration is required.',
  },
};

export function ReactionPrompt({ state, dispatch }: ReactionPromptProps) {
  // Only show during reaction flow
  if (state.flowState.type !== 'reaction') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  // Get reaction info from pending reaction or flow state
  const pendingReaction = gs.pendingReaction;
  if (!pendingReaction && step.step === 'resolving') return null;

  let reactionType: CoreReaction;
  let eligibleUnitIds: string[];

  if (step.step === 'prompt') {
    reactionType = step.pendingReaction.reactionType as CoreReaction;
    eligibleUnitIds = step.pendingReaction.eligibleUnitIds;
  } else if (step.step === 'selectUnit') {
    reactionType = step.reactionType;
    eligibleUnitIds = step.eligibleUnitIds;
  } else {
    // resolving step — handled above
    return null;
  }

  const triggerDescription = pendingReaction?.triggerDescription ?? '';

  const reactionInfo = REACTION_INFO[reactionType] ?? {
    name: reactionType,
    description: '',
  };

  // Get reactive player info
  const reactivePlayerIndex = 1 - gs.activePlayerIndex;
  const reactiveArmy = gs.armies[reactivePlayerIndex];
  const reactionsRemaining = reactiveArmy.reactionAllotmentRemaining;

  const handleSelectUnit = useCallback(
    (unitId: string) => {
      dispatch({
        type: 'SELECT_REACTION_UNIT',
        unitId,
        reactionType: reactionType as CoreReaction,
      });
    },
    [dispatch, reactionType],
  );

  const handleDecline = useCallback(() => {
    dispatch({ type: 'DECLINE_REACTION' });
  }, [dispatch]);

  // Find unit names
  const getUnitInfo = (unitId: string) => {
    for (const unit of reactiveArmy.units) {
      if (unit.id === unitId) {
        return {
          name: unit.profileId,
          aliveModels: unit.models.filter(m => !m.isDestroyed).length,
          totalModels: unit.models.length,
        };
      }
    }
    return { name: unitId, aliveModels: 0, totalModels: 0 };
  };

  return (
    <div className="reaction-modal-overlay">
      <div className="reaction-modal">
        <div className="reaction-modal-title">
          Reaction Available — {reactionInfo.name}
        </div>

        <div className="reaction-modal-desc">
          {triggerDescription}
        </div>

        <div style={{ fontSize: 12, color: '#8899aa', marginBottom: 12 }}>
          {reactionInfo.description}
        </div>

        <div className="panel-row" style={{ marginBottom: 12 }}>
          <span className="panel-row-label">{reactiveArmy.playerName}'s Reactions Remaining</span>
          <span className="panel-row-value" style={{ color: reactionsRemaining > 0 ? '#34d399' : '#ef4444' }}>
            {reactionsRemaining}
          </span>
        </div>

        {reactionsRemaining <= 0 ? (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>
            No reactions remaining this turn. You must decline.
          </div>
        ) : (
          <div className="reaction-modal-units">
            <div className="panel-title">Select a unit to react with</div>
            {eligibleUnitIds.map(unitId => {
              const info = getUnitInfo(unitId);
              return (
                <button
                  key={unitId}
                  className="reaction-modal-unit-btn"
                  onClick={() => handleSelectUnit(unitId)}
                >
                  <div style={{ fontWeight: 600 }}>{info.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7fa0' }}>
                    {info.aliveModels}/{info.totalModels} models alive
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="reaction-modal-actions">
          <button className="toolbar-btn" onClick={handleDecline}>
            Decline Reaction
          </button>
        </div>
      </div>
    </div>
  );
}
