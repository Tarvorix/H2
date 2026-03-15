/**
 * ChallengeFlow
 *
 * Modal for challenge declaration, gambit selection, focus roll,
 * and strike resolution during the assault phase.
 */

import { useCallback } from 'react';
import { ChallengeGambit } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';

interface ChallengeFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

const GAMBIT_INFO: Record<string, { name: string; description: string }> = {
  [ChallengeGambit.SeizeTheInitiative]: {
    name: 'Seize the Initiative',
    description: '+1 to Focus Roll. If you win the Focus Roll, strike first regardless of Initiative.',
  },
  [ChallengeGambit.Feint]: {
    name: 'Feint',
    description: '+1 to hit rolls in the first round of the challenge.',
  },
  [ChallengeGambit.Guard]: {
    name: 'Guard',
    description: '+1 to saving throws in the first round of the challenge.',
  },
  [ChallengeGambit.PressTheAttack]: {
    name: 'Press the Attack',
    description: '+1 Attack in the first round of the challenge.',
  },
  [ChallengeGambit.RecklessAssault]: {
    name: 'Reckless Assault',
    description: '+2 Attacks but -1 to saving throws in the first round.',
  },
  [ChallengeGambit.CautiousAdvance]: {
    name: 'Cautious Advance',
    description: '+2 to saving throws but -1 Attack in the first round.',
  },
  [ChallengeGambit.DefensiveStance]: {
    name: 'Defensive Stance',
    description: 'May re-roll failed saving throws in the first round. Cannot wound on rolls of 6.',
  },
  [ChallengeGambit.AllOutAttack]: {
    name: 'All Out Attack',
    description: 'May re-roll failed to-hit rolls in the first round. No saving throws allowed.',
  },
  [ChallengeGambit.DeathOrGlory]: {
    name: 'Death or Glory',
    description: '+1 Strength and +1 AP. If you lose the challenge, the winner gains +1 VP.',
  },
};

export function ChallengeFlow({ state, dispatch }: ChallengeFlowProps) {
  if (state.flowState.type !== 'challenge') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  const handleDeclareChallenge = useCallback(
    (challengerModelId: string, targetModelId: string) => {
      dispatch({ type: 'DECLARE_CHALLENGE', challengerModelId, targetModelId });
    },
    [dispatch],
  );

  const handleAcceptChallenge = useCallback(
    (modelId: string) => {
      dispatch({ type: 'ACCEPT_CHALLENGE', modelId });
    },
    [dispatch],
  );

  const handleDeclineChallenge = useCallback(() => {
    dispatch({ type: 'DECLINE_CHALLENGE' });
  }, [dispatch]);

  const handleSkipChallenges = useCallback(() => {
    if (step.step !== 'declareChallenge' || !step.canPass) {
      return;
    }
    dispatch({ type: 'PASS_CHALLENGE_COMBAT', combatId: step.combatId });
  }, [dispatch, step]);

  const handleSelectGambit = useCallback(
    (modelId: string, gambit: ChallengeGambit) => {
      dispatch({ type: 'SELECT_GAMBIT', modelId, gambit });
    },
    [dispatch],
  );

  return (
    <div className="reaction-modal-overlay">
      <div className="challenge-modal">
        {/* Declare Challenge */}
        {step.step === 'declareChallenge' && (
          <>
            <div className="challenge-modal-title">Issue Challenge</div>
            <div className="reaction-modal-desc">
              Select a character to issue a challenge, then select a target.
            </div>

            <div className="panel-title">Your Challengers</div>
            {step.eligibleChallengers.map(modelId => (
              <div key={modelId} style={{ marginBottom: 4 }}>
                {step.eligibleTargets.map(targetId => (
                  <button
                    key={targetId}
                    className="reaction-modal-unit-btn"
                    onClick={() => handleDeclareChallenge(modelId, targetId)}
                  >
                    Challenge: {modelId} vs {targetId}
                  </button>
                ))}
              </div>
            ))}

            {step.canPass && (
              <div className="reaction-modal-actions">
                <button className="toolbar-btn" onClick={handleSkipChallenges}>
                  Pass This Combat
                </button>
              </div>
            )}
          </>
        )}

        {/* Respond to Challenge */}
        {step.step === 'respondToChallenge' && (
          <>
            <div className="challenge-modal-title">Challenge Issued!</div>
            <div className="reaction-modal-desc">
              {step.challengerModelId} has challenged {step.targetModelId}!
              Accept or decline the challenge.
            </div>

            <div className="reaction-modal-actions">
              <button
                className="toolbar-btn"
                style={{ background: '#2563eb', borderColor: '#3b82f6', color: '#fff' }}
                onClick={() => handleAcceptChallenge(step.targetModelId)}
              >
                Accept Challenge
              </button>
              <button className="toolbar-btn" onClick={handleDeclineChallenge}>
                Decline (Disgraced!)
              </button>
            </div>
          </>
        )}

        {/* Select Gambit */}
        {step.step === 'selectGambit' && (
          <>
            <div className="challenge-modal-title">Select Gambit</div>
            <div className="reaction-modal-desc">
              Choose a gambit for your champion. This determines bonuses and penalties for the challenge.
            </div>

            <div className="gambit-list">
              {step.availableGambits.map(gambit => {
                const info = GAMBIT_INFO[gambit] ?? { name: gambit, description: '' };
                return (
                  <button
                    key={gambit}
                    className="gambit-btn"
                    onClick={() => handleSelectGambit(step.modelId, gambit)}
                  >
                    <div className="gambit-name">{info.name}</div>
                    <div className="gambit-desc">{info.description}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Focus Roll */}
        {step.step === 'focusRoll' && (
          <>
            <div className="challenge-modal-title">Focus Roll</div>
            <div className="reaction-modal-desc">
              Both champions roll for focus. The winner gains Challenge Advantage.
            </div>
            <div className="flow-panel-step" style={{ color: '#a855f7' }}>
              Resolving focus roll... Check the combat log for results.
            </div>
          </>
        )}

        {/* Strike */}
        {step.step === 'strike' && (
          <>
            <div className="challenge-modal-title">Challenge Strikes</div>
            <div className="reaction-modal-desc">
              Champions exchange blows. Hits, wounds, and saves are being resolved.
            </div>
            <div className="flow-panel-step" style={{ color: '#fb923c' }}>
              Resolving strikes... Check the combat log for results.
            </div>
          </>
        )}

        {/* Glory */}
        {step.step === 'glory' && (
          <>
            <div className="challenge-modal-title">Glory</div>
            <div className="reaction-modal-desc">
              The challenge is complete. Glory points and effects are applied.
            </div>
            <div className="flow-panel-step" style={{ color: '#fbbf24' }}>
              Check the combat log for glory results.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
