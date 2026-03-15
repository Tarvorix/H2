import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import { CoreReaction } from '@hh/types';
import {
  getDeathOrGloryEligibleModelIds,
  getDeathOrGloryWeaponOptions,
} from '@hh/engine';
import type { GameUIAction, GameUIState } from '../types';

interface ReactionPromptProps {
  state: GameUIState;
  dispatch: Dispatch<GameUIAction>;
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
  nullify: {
    name: 'Nullify',
    description: 'After a failed Resistance Check against a Psychic Curse, a friendly Psyker with line of sight may attempt to cancel that curse before it resolves.',
  },
  evade: {
    name: 'Evade',
    description: 'After charge volley attacks, a Light or Cavalry target can make an Initiative move to try to push the charger beyond its maximum charge range.',
  },
  'death-or-glory': {
    name: 'Death or Glory',
    description: 'A unit moved through by a vehicle may nominate one non-vehicle model to make an automatic attack against the vehicle’s Front Armour.',
  },
  'heroic-intervention': {
    name: 'Heroic Intervention',
    description: 'When the active player passes a combat in the Challenge sub-phase, an eligible engaged reactive unit may declare its own challenge in that combat.',
  },
  'combat-air-patrol': {
    name: 'Combat Air Patrol',
    description: 'An eligible flyer in Aerial Reserves can enter from a battlefield edge, attack the target, then return to Aerial Reserves.',
  },
  'reserve-entry-intercept': {
    name: 'Intercept',
    description: 'Attack a unit that has just entered from Reserves or Aerial Reserves.',
  },
};

function getUnitInfo(
  gameState: NonNullable<GameUIState['gameState']>,
  unitId: string,
): { name: string; aliveModels: number; totalModels: number } {
  for (const army of gameState.armies) {
    for (const unit of army.units) {
      if (unit.id === unitId) {
        return {
          name: unit.profileId,
          aliveModels: unit.models.filter((model) => !model.isDestroyed).length,
          totalModels: unit.models.length,
        };
      }
    }
  }

  return { name: unitId, aliveModels: 0, totalModels: 0 };
}

interface DeathOrGloryAttackStepProps {
  gameState: NonNullable<GameUIState['gameState']>;
  unitId: string;
  reactionInfo: { name: string; description: string };
  triggerDescription: string;
  dispatch: Dispatch<GameUIAction>;
  onDecline: () => void;
}

function DeathOrGloryAttackStep({
  gameState,
  unitId,
  reactionInfo,
  triggerDescription,
  dispatch,
  onDecline,
}: DeathOrGloryAttackStepProps) {
  const unit = gameState.armies.flatMap((army) => army.units).find((entry) => entry.id === unitId) ?? null;
  const eligibleModelIds = unit ? getDeathOrGloryEligibleModelIds(unit) : [];
  const [selectedModelId, setSelectedModelId] = useState<string>(eligibleModelIds[0] ?? '');
  const weaponOptions = useMemo(
    () => selectedModelId
      ? getDeathOrGloryWeaponOptions(gameState, unitId, selectedModelId)
      : [],
    [gameState, selectedModelId, unitId],
  );
  const [selectedWeaponKey, setSelectedWeaponKey] = useState<string>('');

  useEffect(() => {
    if (eligibleModelIds.length > 0 && !eligibleModelIds.includes(selectedModelId)) {
      setSelectedModelId(eligibleModelIds[0]);
    }
  }, [eligibleModelIds, selectedModelId]);

  useEffect(() => {
    const defaultWeaponKey = weaponOptions[0]
      ? `${weaponOptions[0].weaponId}::${weaponOptions[0].profileName ?? ''}`
      : '';
    if (!weaponOptions.some((option) => `${option.weaponId}::${option.profileName ?? ''}` === selectedWeaponKey)) {
      setSelectedWeaponKey(defaultWeaponKey);
    }
  }, [selectedWeaponKey, weaponOptions]);

  const selectedWeapon = weaponOptions.find((option) =>
    `${option.weaponId}::${option.profileName ?? ''}` === selectedWeaponKey,
  );

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

        <div className="reaction-modal-units">
          <div className="panel-title">Select attacking model</div>
          {eligibleModelIds.map((modelId) => (
            <button
              key={modelId}
              className="reaction-modal-unit-btn"
              onClick={() => setSelectedModelId(modelId)}
              style={selectedModelId === modelId ? { borderColor: '#60a5fa' } : undefined}
            >
              <div style={{ fontWeight: 600 }}>{modelId}</div>
            </button>
          ))}
        </div>

        <div className="reaction-modal-units" style={{ marginTop: 12 }}>
          <div className="panel-title">Select weapon</div>
          {weaponOptions.map((option) => {
            const key = `${option.weaponId}::${option.profileName ?? ''}`;
            return (
              <button
                key={key}
                className="reaction-modal-unit-btn"
                onClick={() => setSelectedWeaponKey(key)}
                style={selectedWeaponKey === key ? { borderColor: '#60a5fa' } : undefined}
              >
                <div style={{ fontWeight: 600 }}>{option.displayName}</div>
                <div style={{ fontSize: 11, color: '#6b7fa0' }}>
                  {option.category.toUpperCase()} • {option.attacks} attack(s) • S{option.strength} • AP {option.ap ?? '-'} • D{option.damage}
                </div>
              </button>
            );
          })}
        </div>

        <div className="reaction-modal-actions">
          <button
            className="toolbar-btn"
            disabled={!selectedModelId || !selectedWeapon}
            onClick={() => {
              if (!selectedWeapon) return;
              dispatch({
                type: 'CONFIRM_DEATH_OR_GLORY_ATTACK',
                unitId,
                reactingModelId: selectedModelId,
                weaponId: selectedWeapon.weaponId,
                profileName: selectedWeapon.profileName,
              });
            }}
          >
            Confirm Death or Glory
          </button>
          <button className="toolbar-btn" onClick={onDecline}>
            Decline Reaction
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReactionPrompt({ state, dispatch }: ReactionPromptProps) {
  if (state.flowState.type !== 'reaction') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;
  if (step.step === 'resolving') return null;

  const pendingReaction = gs.pendingReaction;
  const reactionType = step.step === 'prompt'
    ? step.pendingReaction.reactionType
    : step.reactionType;
  const reactionInfo = REACTION_INFO[reactionType] ?? {
    name: reactionType,
    description: '',
  };

  const reactivePlayerIndex = 1 - gs.activePlayerIndex;
  const reactiveArmy = gs.armies[reactivePlayerIndex];

  const handleDecline = useCallback(() => {
    dispatch({ type: 'DECLINE_REACTION' });
  }, [dispatch]);

  const handleSelectUnit = useCallback((unitId: string) => {
    dispatch({
      type: 'SELECT_REACTION_UNIT',
      unitId,
      reactionType: String(reactionType),
    });
  }, [dispatch, reactionType]);

  if (step.step === 'placeModels' || step.step === 'confirmMove') {
    const unitInfo = getUnitInfo(gs, step.unitId);
    const aliveModelIds = gs.armies
      .flatMap((army) => army.units)
      .find((unit) => unit.id === step.unitId)
      ?.models.filter((model) => !model.isDestroyed)
      .map((model) => model.id) ?? [];
    const placedCount = step.modelPositions.length;

    return (
      <div className="flow-panel">
        <div className="flow-panel-title">{reactionInfo.name}: {unitInfo.name}</div>
        {step.step === 'placeModels' && (
          <>
            <div className="flow-panel-step">
              Click the battlefield to place model `{step.currentModelId}`.
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Placed Models</span>
              <span className="panel-row-value">{placedCount} / {aliveModelIds.length}</span>
            </div>
          </>
        )}
        {step.step === 'confirmMove' && (
          <>
            <div className="flow-panel-step">
              Review the preview positions, then confirm the reaction move.
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Placed Models</span>
              <span className="panel-row-value">{placedCount}</span>
            </div>
          </>
        )}
        <div className="flow-panel-actions">
          {step.step === 'confirmMove' && (
            <button
              className="toolbar-btn"
              onClick={() => dispatch({ type: 'CONFIRM_REACTION_MOVE' })}
            >
              Confirm {reactionInfo.name}
            </button>
          )}
          <button
            className="toolbar-btn"
            onClick={() => dispatch({ type: 'RESET_REACTION_MOVE' })}
          >
            Reset Placement
          </button>
          <button className="toolbar-btn" onClick={handleDecline}>
            Decline Reaction
          </button>
        </div>
      </div>
    );
  }

  if (step.step === 'selectDeathOrGloryAttack') {
    return (
      <DeathOrGloryAttackStep
        gameState={gs}
        unitId={step.unitId}
        reactionInfo={reactionInfo}
        triggerDescription={pendingReaction?.triggerDescription ?? ''}
        dispatch={dispatch}
        onDecline={handleDecline}
      />
    );
  }

  const eligibleUnitIds = step.step === 'prompt'
    ? step.pendingReaction.eligibleUnitIds
    : step.step === 'selectUnit'
      ? step.eligibleUnitIds
      : [];

  return (
    <div className="reaction-modal-overlay">
      <div className="reaction-modal">
        <div className="reaction-modal-title">
          Reaction Available — {reactionInfo.name}
        </div>

        <div className="reaction-modal-desc">
          {pendingReaction?.triggerDescription ?? ''}
        </div>

        <div style={{ fontSize: 12, color: '#8899aa', marginBottom: 12 }}>
          {reactionInfo.description}
        </div>

        <div className="panel-row" style={{ marginBottom: 12 }}>
          <span className="panel-row-label">{reactiveArmy.playerName}'s Reactions Remaining</span>
          <span className="panel-row-value" style={{ color: reactiveArmy.reactionAllotmentRemaining > 0 ? '#34d399' : '#ef4444' }}>
            {reactiveArmy.reactionAllotmentRemaining}
          </span>
        </div>

        {reactiveArmy.reactionAllotmentRemaining <= 0 ? (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>
            No reactions remaining this turn. You must decline.
          </div>
        ) : (
          <div className="reaction-modal-units">
            <div className="panel-title">Select a unit to react with</div>
            {eligibleUnitIds.map((unitId) => {
              const info = getUnitInfo(gs, unitId);
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
