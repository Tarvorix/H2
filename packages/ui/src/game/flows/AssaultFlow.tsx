/**
 * AssaultFlow
 *
 * Top-level assault flow panel. Orchestrates the full assault procedure:
 * charge declaration → volley attacks → overwatch → charge move →
 * challenge → fight → resolution → aftermath.
 */

import type { GameUIState, GameUIAction } from '../types';
import { ChargeFlow } from './ChargeFlow';
import { FightFlow } from './FightFlow';

interface AssaultFlowProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
}

export function AssaultFlow({ state, dispatch }: AssaultFlowProps) {
  if (state.flowState.type !== 'assault') return null;

  const step = state.flowState.step;
  const gs = state.gameState;
  if (!gs) return null;

  // Charge-related steps
  if (
    step.step === 'selectCharger' ||
    step.step === 'selectTarget' ||
    step.step === 'confirmCharge' ||
    step.step === 'resolving' ||
    step.step === 'volleyAttacks' ||
    step.step === 'chargeRoll' ||
    step.step === 'chargeMove'
  ) {
    return <ChargeFlow state={state} dispatch={dispatch} />;
  }

  // Fight-related steps
  if (
    step.step === 'fightPhase' ||
    step.step === 'resolution' ||
    step.step === 'selectAftermath'
  ) {
    return <FightFlow state={state} dispatch={dispatch} />;
  }

  // Results
  if (step.step === 'showResults') {
    return (
      <div className="flow-panel">
        <div className="flow-panel-title">Assault Results</div>
        <div className="flow-panel-step" style={{ color: '#22c55e' }}>
          Assault resolved. Results are shown in the combat log.
        </div>
        <div className="flow-panel-actions">
          <button
            className="toolbar-btn"
            onClick={() => dispatch({ type: 'SET_FLOW_STATE', flowState: { type: 'idle' } })}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return null;
}
