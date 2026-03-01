/**
 * FightFlow
 *
 * Handles the Fight sub-phase of assault: initiative steps, melee resolution,
 * combat resolution, and aftermath selection.
 */

import { useCallback } from 'react';
import { AftermathOption } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';

interface FightFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

const AFTERMATH_LABELS: Record<string, string> = {
  [AftermathOption.Hold]: 'Hold — Remain locked in combat',
  [AftermathOption.Disengage]: 'Disengage — Break off from combat',
  [AftermathOption.FallBack]: 'Fall Back — Retreat from the battle',
  [AftermathOption.Pursue]: 'Pursue — Chase the retreating enemy',
  [AftermathOption.GunDown]: 'Gun Down — Fire at retreating enemy',
  [AftermathOption.Consolidate]: 'Consolidate — Move after combat victory',
};

export function FightFlow({ state, dispatch }: FightFlowProps) {
  if (state.flowState.type !== 'assault') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  const handleResolveFight = useCallback(
    (combatId: string) => {
      dispatch({ type: 'RESOLVE_FIGHT', combatId });
    },
    [dispatch],
  );

  const handleSelectAftermath = useCallback(
    (unitId: string, option: AftermathOption) => {
      dispatch({ type: 'SELECT_AFTERMATH', unitId, option });
    },
    [dispatch],
  );

  return (
    <div className="flow-panel">
      <div className="flow-panel-title">Close Combat</div>

      {/* Fight Phase */}
      {step.step === 'fightPhase' && (
        <>
          <div className="flow-panel-step" style={{ color: '#fb923c' }}>
            Fight Sub-Phase — Resolving combat
          </div>

          {/* Show active combats */}
          {gs.activeCombats && gs.activeCombats.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {gs.activeCombats.map((combat) => (
                <div key={combat.combatId} className="fire-group-display">
                  <div className="fire-group-header">
                    <div className="fire-group-name">
                      Combat: {combat.combatId}
                    </div>
                    <div className="fire-group-stats">
                      {combat.resolved ? 'Resolved' : 'In Progress'}
                    </div>
                  </div>
                  <div className="fire-group-detail">
                    Active Units: {combat.activePlayerUnitIds.length} | Reactive Units: {combat.reactivePlayerUnitIds.length}
                  </div>
                  {combat.challengeState && (
                    <div className="fire-group-detail" style={{ color: '#a855f7' }}>
                      Challenge in progress — Step: {combat.challengeState.currentStep}
                    </div>
                  )}
                  <div className="fire-group-detail">
                    Casualties: Active {combat.activePlayerCasualties.length} | Reactive {combat.reactivePlayerCasualties.length}
                  </div>
                  {!combat.resolved && (
                    <button
                      className="toolbar-btn"
                      onClick={() => handleResolveFight(combat.combatId)}
                      style={{ marginTop: 4, width: '100%' }}
                    >
                      Resolve Combat
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Resolution */}
      {step.step === 'resolution' && (
        <>
          <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
            Combat Resolution — Determining winner
          </div>
          {gs.activeCombats && gs.activeCombats.map(combat => (
            <div key={combat.combatId} className="fire-group-display">
              <div className="fire-group-detail">
                Active Player CRP: <span style={{ color: '#60a5fa' }}>{combat.activePlayerCRP}</span>
              </div>
              <div className="fire-group-detail">
                Reactive Player CRP: <span style={{ color: '#f87171' }}>{combat.reactivePlayerCRP}</span>
              </div>
              {combat.isMassacre && (
                <div className="fire-group-detail" style={{ color: '#ef4444', fontWeight: 600 }}>
                  MASSACRE!
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Select Aftermath */}
      {step.step === 'selectAftermath' && (
        <>
          <div className="flow-panel-step" style={{ color: '#60a5fa' }}>
            Select aftermath action for your unit
          </div>
          <div style={{ marginTop: 8 }}>
            {step.availableOptions.map(option => (
              <button
                key={option}
                className="reaction-modal-unit-btn"
                onClick={() => handleSelectAftermath(step.unitId, option)}
                style={{ marginBottom: 4 }}
              >
                {AFTERMATH_LABELS[option] ?? option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
