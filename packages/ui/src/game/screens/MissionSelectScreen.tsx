/**
 * MissionSelectScreen
 *
 * Shows 3 core missions with descriptions, deployment map preview, and confirm button.
 * Also allows selection of deployment map.
 */

import { useCallback, useMemo } from 'react';
import type { MissionDefinition, DeploymentMapDefinition } from '@hh/types';
import { DeploymentMap } from '@hh/types';
import {
  HEART_OF_BATTLE,
  CRUCIBLE_OF_WAR,
  TAKE_AND_HOLD,
  SEARCH_AND_DESTROY,
  HAMMER_AND_ANVIL,
  DAWN_OF_WAR,
} from '@hh/data';
import type { GameUIState, GameUIAction } from '../types';

interface MissionSelectScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

const MISSIONS: MissionDefinition[] = [
  HEART_OF_BATTLE,
  CRUCIBLE_OF_WAR,
  TAKE_AND_HOLD,
];

const DEPLOYMENT_MAPS: DeploymentMapDefinition[] = [
  SEARCH_AND_DESTROY,
  HAMMER_AND_ANVIL,
  DAWN_OF_WAR,
];

function getMissionDescription(mission: MissionDefinition): string {
  const objCount = mission.objectivePlacement.kind === 'fixed'
    ? mission.objectivePlacement.objectives.length
    : mission.objectivePlacement.kind === 'alternating'
      ? mission.objectivePlacement.count
      : mission.objectivePlacement.pairsCount;

  const specialRules = mission.specialRules
    .map((r) => r.replace(/([A-Z])/g, ' $1').trim())
    .join(', ');

  return `${objCount} objective(s). Special Rules: ${specialRules || 'None'}.`;
}

function getDeploymentMapDescription(map: DeploymentMapDefinition): string {
  switch (map.type) {
    case DeploymentMap.SearchAndDestroy:
      return 'Diagonal corners — players deploy in opposite triangular quarters.';
    case DeploymentMap.HammerAndAnvil:
      return 'Long edges — players deploy along the long table edges (12" deep).';
    case DeploymentMap.DawnOfWar:
      return 'Short edges — players deploy along the short table edges (12" deep).';
    default:
      return '';
  }
}

export function MissionSelectScreen({ state, dispatch, onReturnToMenu }: MissionSelectScreenProps) {
  const { missionSelect } = state;

  const handleSelectMission = useCallback(
    (missionId: string) => {
      dispatch({ type: 'SELECT_MISSION', missionId });
    },
    [dispatch],
  );

  const handleSelectDeploymentMap = useCallback(
    (deploymentMap: DeploymentMap) => {
      dispatch({ type: 'SELECT_DEPLOYMENT_MAP', deploymentMap });
    },
    [dispatch],
  );

  const handleConfirm = useCallback(() => {
    dispatch({ type: 'CONFIRM_MISSION' });
  }, [dispatch]);

  const canConfirm = missionSelect.selectedMissionId !== null && missionSelect.selectedDeploymentMap !== null;

  const selectedMission = useMemo(
    () => MISSIONS.find((m) => m.id === missionSelect.selectedMissionId),
    [missionSelect.selectedMissionId],
  );

  return (
    <div className="setup-screen mission-select-screen">
      <div className="setup-header">
        <h1 className="setup-title">Mission Selection</h1>
        <p className="setup-subtitle">Choose a mission and deployment map</p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content mission-select-content">
        {/* Mission Selection */}
        <div className="mission-select-section">
          <h2 className="mission-select-section-title">Missions</h2>
          <div className="mission-select-grid">
            {MISSIONS.map((mission) => (
              <div
                key={mission.id}
                className={`mission-card ${missionSelect.selectedMissionId === mission.id ? 'selected' : ''}`}
                onClick={() => handleSelectMission(mission.id)}
                role="button"
                tabIndex={0}
              >
                <div className="mission-card-name">{mission.name}</div>
                <div className="mission-card-description">
                  {getMissionDescription(mission)}
                </div>
                <div className="mission-card-secondaries">
                  {mission.secondaryObjectives.map((sec, i) => (
                    <span key={i} className="mission-card-secondary">
                      {sec.type} ({sec.vpValue}VP)
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deployment Map Selection */}
        <div className="mission-select-section">
          <h2 className="mission-select-section-title">Deployment Map</h2>
          <div className="mission-select-grid">
            {DEPLOYMENT_MAPS.map((map) => (
              <div
                key={map.id}
                className={`deployment-map-card ${missionSelect.selectedDeploymentMap === map.type ? 'selected' : ''}`}
                onClick={() => handleSelectDeploymentMap(map.type)}
                role="button"
                tabIndex={0}
              >
                <div className="deployment-map-name">{map.name}</div>
                <div className="deployment-map-description">
                  {getDeploymentMapDescription(map)}
                </div>
                <div className="deployment-map-preview">
                  <DeploymentMapPreview type={map.type} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Mission Summary */}
        {selectedMission && (
          <div className="mission-select-summary">
            <h3>Selected: {selectedMission.name}</h3>
            <div className="mission-select-summary-details">
              <div>Objectives: {getMissionDescription(selectedMission)}</div>
              <div>
                Deployment:{' '}
                {missionSelect.selectedDeploymentMap
                  ? DEPLOYMENT_MAPS.find((m) => m.type === missionSelect.selectedDeploymentMap)?.name
                  : 'Not selected'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="setup-footer">
        <button
          className={`setup-confirm-btn ${canConfirm ? '' : 'disabled'}`}
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          {canConfirm ? 'Continue to Terrain Setup →' : 'Select mission and deployment map'}
        </button>
      </div>
    </div>
  );
}

/**
 * Simple ASCII-art style deployment map preview.
 */
function DeploymentMapPreview({ type }: { type: DeploymentMap }) {
  switch (type) {
    case DeploymentMap.SearchAndDestroy:
      return (
        <div className="map-preview-ascii">
          <div>┌─────────────┐</div>
          <div>│ P1 ╲        │</div>
          <div>│     ╲       │</div>
          <div>│      ╲      │</div>
          <div>│       ╲  P2 │</div>
          <div>└─────────────┘</div>
        </div>
      );
    case DeploymentMap.HammerAndAnvil:
      return (
        <div className="map-preview-ascii">
          <div>┌─────────────┐</div>
          <div>│  Player 1   │</div>
          <div>├─────────────┤</div>
          <div>│  No Man's   │</div>
          <div>├─────────────┤</div>
          <div>│  Player 2   │</div>
          <div>└─────────────┘</div>
        </div>
      );
    case DeploymentMap.DawnOfWar:
      return (
        <div className="map-preview-ascii">
          <div>┌───┬─────┬───┐</div>
          <div>│   │     │   │</div>
          <div>│P1 │ NML │P2 │</div>
          <div>│   │     │   │</div>
          <div>└───┴─────┴───┘</div>
        </div>
      );
    default:
      return null;
  }
}
