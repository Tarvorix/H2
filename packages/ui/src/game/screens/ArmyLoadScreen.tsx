/**
 * ArmyLoadScreen
 *
 * UI for loading two armies before a game.
 * For Phase 6, provides preset army lists since the Army Builder is Phase 8.
 * Players can select from presets or (future) upload JSON army files.
 */

import { useCallback, useState } from 'react';
import { LegionFaction, Allegiance } from '@hh/types';
import { AIStrategyTier } from '@hh/ai';
import type { AIDeploymentFormation } from '@hh/ai';
import type { GameUIState, GameUIAction, PresetArmy } from '../types';
import { AI_DEPLOYMENT_FORMATION_LABELS } from './deployment-formations';

interface ArmyLoadScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

/**
 * Preset armies for quick game start.
 * These will be replaced by the Army Builder in Phase 8.
 */
const PRESET_ARMIES: PresetArmy[] = [
  {
    name: '10 Tactical Marines (Sons of Horus)',
    description: '10 Tactical Marines with bolters. Standard line infantry.',
    config: {
      playerIndex: 0,
      playerName: 'Player 1',
      faction: LegionFaction.SonsOfHorus,
      allegiance: Allegiance.Traitor,
      pointsLimit: 1500,
      unitSelections: [
        {
          profileId: 'tactical-squad',
          name: 'Tactical Squad',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
      ],
    },
  },
  {
    name: '10 Tactical Marines (Imperial Fists)',
    description: '10 Tactical Marines with bolters. Standard line infantry.',
    config: {
      playerIndex: 1,
      playerName: 'Player 2',
      faction: LegionFaction.ImperialFists,
      allegiance: Allegiance.Loyalist,
      pointsLimit: 1500,
      unitSelections: [
        {
          profileId: 'tactical-squad',
          name: 'Tactical Squad',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
      ],
    },
  },
  {
    name: '20 Tactical Marines (Ultramarines)',
    description: '2x 10 Tactical Marines. More models for testing.',
    config: {
      playerIndex: 0,
      playerName: 'Player 1',
      faction: LegionFaction.Ultramarines,
      allegiance: Allegiance.Loyalist,
      pointsLimit: 1500,
      unitSelections: [
        {
          profileId: 'tactical-squad-1',
          name: 'Tactical Squad I',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
        {
          profileId: 'tactical-squad-2',
          name: 'Tactical Squad II',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
      ],
    },
  },
  {
    name: '20 Tactical Marines (World Eaters)',
    description: '2x 10 Tactical Marines. More models for testing.',
    config: {
      playerIndex: 1,
      playerName: 'Player 2',
      faction: LegionFaction.WorldEaters,
      allegiance: Allegiance.Traitor,
      pointsLimit: 1500,
      unitSelections: [
        {
          profileId: 'tactical-squad-1',
          name: 'Tactical Squad I',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
        {
          profileId: 'tactical-squad-2',
          name: 'Tactical Squad II',
          modelCount: 10,
          pointsCost: 100,
          wargearOptions: [],
        },
      ],
    },
  },
];

function getPresetsForPlayer(playerIndex: number): PresetArmy[] {
  return PRESET_ARMIES.filter(p => p.config.playerIndex === playerIndex);
}

export function ArmyLoadScreen({ state, dispatch, onReturnToMenu }: ArmyLoadScreenProps) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTier, setAiTier] = useState<AIStrategyTier>(AIStrategyTier.Tactical);
  const [aiDeploymentFormation, setAiDeploymentFormation] = useState<AIDeploymentFormation>('auto');

  const handleSelectPreset = useCallback(
    (playerIndex: number, preset: PresetArmy) => {
      dispatch({
        type: 'LOAD_PRESET_ARMY',
        playerIndex,
        preset: {
          ...preset,
          config: { ...preset.config, playerIndex },
        },
      });
    },
    [dispatch],
  );

  const handleConfirm = useCallback(() => {
    if (aiEnabled) {
      dispatch({
        type: 'SET_AI_CONFIG',
        config: {
          playerIndex: 1,
          strategyTier: aiTier,
          deploymentFormation: aiDeploymentFormation,
          commandDelayMs: 600,
          enabled: true,
        },
      });
    } else {
      dispatch({ type: 'SET_AI_CONFIG', config: null });
    }
    dispatch({ type: 'CONFIRM_ARMIES' });
  }, [dispatch, aiEnabled, aiTier, aiDeploymentFormation]);

  const handlePlayerNameChange = useCallback(
    (playerIndex: number, name: string) => {
      const existing = state.armyConfigs[playerIndex];
      if (existing) {
        dispatch({
          type: 'SET_ARMY_CONFIG',
          playerIndex,
          config: { ...existing, playerName: name },
        });
      }
    },
    [dispatch, state.armyConfigs],
  );

  const bothSelected = state.armyConfigs[0] !== null && state.armyConfigs[1] !== null;

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1 className="setup-title">Army Selection</h1>
        <p className="setup-subtitle">Choose armies for both players</p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content army-load-content">
        {/* Player 1 Column */}
        <div className="army-load-column">
          <h2 className="army-load-player-title">Player 1</h2>
          {state.armyConfigs[0] && (
            <div className="army-load-selected">
              <input
                type="text"
                className="panel-input"
                value={state.armyConfigs[0].playerName}
                onChange={(e) => handlePlayerNameChange(0, e.target.value)}
                placeholder="Player Name"
              />
              <div className="army-load-faction">{state.armyConfigs[0].faction}</div>
              <div className="army-load-allegiance">{state.armyConfigs[0].allegiance}</div>
              <div className="army-load-units">
                {state.armyConfigs[0].unitSelections.map((u, i) => (
                  <div key={i} className="army-load-unit">
                    {u.name} ({u.modelCount} models, {u.pointsCost}pts)
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="army-load-presets">
            <div className="panel-title">Preset Armies</div>
            {getPresetsForPlayer(0).map((preset, i) => (
              <button
                key={i}
                className="army-load-preset-btn"
                onClick={() => handleSelectPreset(0, preset)}
              >
                <div className="army-load-preset-name">{preset.name}</div>
                <div className="army-load-preset-desc">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Player 2 Column */}
        <div className="army-load-column">
          <h2 className="army-load-player-title">Player 2{aiEnabled ? ' (AI)' : ''}</h2>
          <div className="ai-toggle-group">
            <label className="ai-toggle-label">
              <input
                type="checkbox"
                className="ai-toggle-checkbox"
                checked={aiEnabled}
                onChange={(e) => setAiEnabled(e.target.checked)}
              />
              <span>AI Opponent</span>
            </label>
            {aiEnabled && (
              <>
                <select
                  className="ai-tier-select"
                  value={aiTier}
                  onChange={(e) => setAiTier(e.target.value as AIStrategyTier)}
                >
                  <option value={AIStrategyTier.Basic}>Basic</option>
                  <option value={AIStrategyTier.Tactical}>Tactical</option>
                </select>
                <select
                  className="ai-tier-select"
                  value={aiDeploymentFormation}
                  onChange={(e) => setAiDeploymentFormation(e.target.value as AIDeploymentFormation)}
                >
                  {(Object.keys(AI_DEPLOYMENT_FORMATION_LABELS) as AIDeploymentFormation[]).map((formation) => (
                    <option key={formation} value={formation}>
                      {`Deploy: ${AI_DEPLOYMENT_FORMATION_LABELS[formation]}`}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {state.armyConfigs[1] && (
            <div className="army-load-selected">
              <input
                type="text"
                className="panel-input"
                value={state.armyConfigs[1].playerName}
                onChange={(e) => handlePlayerNameChange(1, e.target.value)}
                placeholder="Player Name"
              />
              <div className="army-load-faction">{state.armyConfigs[1].faction}</div>
              <div className="army-load-allegiance">{state.armyConfigs[1].allegiance}</div>
              <div className="army-load-units">
                {state.armyConfigs[1].unitSelections.map((u, i) => (
                  <div key={i} className="army-load-unit">
                    {u.name} ({u.modelCount} models, {u.pointsCost}pts)
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="army-load-presets">
            <div className="panel-title">Preset Armies</div>
            {getPresetsForPlayer(1).map((preset, i) => (
              <button
                key={i}
                className="army-load-preset-btn"
                onClick={() => handleSelectPreset(1, preset)}
              >
                <div className="army-load-preset-name">{preset.name}</div>
                <div className="army-load-preset-desc">{preset.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="setup-footer">
        <button
          className={`setup-confirm-btn ${bothSelected ? '' : 'disabled'}`}
          disabled={!bothSelected}
          onClick={handleConfirm}
        >
          {bothSelected ? 'Continue to Terrain Setup →' : 'Select armies for both players'}
        </button>
      </div>
    </div>
  );
}
