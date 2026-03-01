/**
 * VPTracker
 *
 * Shows VP per player, objective control status, and secondary objective progress.
 * Displayed during the Playing phase as part of the sidebar.
 */

import type { GameState, ObjectiveMarker, SecondaryObjective } from '@hh/types';
import { SecondaryObjectiveType } from '@hh/types';

interface VPTrackerProps {
  gameState: GameState;
}

export function VPTracker({ gameState }: VPTrackerProps) {
  const { armies, missionState } = gameState;
  const p0VP = armies[0].victoryPoints;
  const p1VP = armies[1].victoryPoints;

  return (
    <div className="vp-tracker">
      <div className="panel-title">Victory Points</div>

      {/* VP Totals */}
      <div className="vp-totals">
        <div className={`vp-player ${p0VP > p1VP ? 'leading' : ''}`}>
          <div className="vp-player-name">{armies[0].playerName}</div>
          <div className="vp-player-score">{p0VP}</div>
        </div>
        <div className="vp-separator">vs</div>
        <div className={`vp-player ${p1VP > p0VP ? 'leading' : ''}`}>
          <div className="vp-player-name">{armies[1].playerName}</div>
          <div className="vp-player-score">{p1VP}</div>
        </div>
      </div>

      {/* Objective Status */}
      {missionState && (
        <>
          <div className="vp-section-title">Objectives</div>
          <div className="vp-objectives">
            {missionState.objectives.map((obj) => (
              <ObjectiveStatus key={obj.id} objective={obj} gameState={gameState} />
            ))}
          </div>

          {/* Secondary Objectives */}
          <div className="vp-section-title">Secondary Objectives</div>
          <div className="vp-secondaries">
            {missionState.secondaryObjectives.map((sec, i) => (
              <SecondaryStatus key={i} secondary={sec} />
            ))}
          </div>

          {/* Scoring History */}
          {missionState.scoringHistory.length > 0 && (
            <>
              <div className="vp-section-title">Scoring History</div>
              <div className="vp-history">
                {missionState.scoringHistory.slice(-5).map((entry, i) => (
                  <div key={i} className="vp-history-entry">
                    <span className="vp-history-turn">T{entry.battleTurn}</span>
                    <span className="vp-history-player">P{entry.playerIndex + 1}</span>
                    <span className="vp-history-source">{entry.source}</span>
                    <span className="vp-history-vp">+{entry.vpScored}VP</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ObjectiveStatus({
  objective,
  gameState: _gameState,
}: {
  objective: ObjectiveMarker;
  gameState: GameState;
}) {
  if (objective.isRemoved) {
    return (
      <div className="vp-objective removed">
        <span className="vp-objective-label">{objective.label}</span>
        <span className="vp-objective-status">Removed</span>
      </div>
    );
  }

  return (
    <div className="vp-objective">
      <span className="vp-objective-label">{objective.label}</span>
      <span className="vp-objective-value">{objective.currentVpValue}VP</span>
      <span className="vp-objective-position">
        ({objective.position.x.toFixed(0)}", {objective.position.y.toFixed(0)}")
      </span>
    </div>
  );
}

function SecondaryStatus({ secondary }: { secondary: SecondaryObjective }) {
  const typeLabel = getSecondaryLabel(secondary.type);
  const achieved = secondary.achievedByPlayer !== null;

  return (
    <div className={`vp-secondary ${achieved ? 'achieved' : ''}`}>
      <span className="vp-secondary-type">{typeLabel}</span>
      <span className="vp-secondary-value">{secondary.vpValue}VP</span>
      {achieved && (
        <span className="vp-secondary-achieved">
          P{secondary.achievedByPlayer! + 1}
        </span>
      )}
    </div>
  );
}

function getSecondaryLabel(type: SecondaryObjectiveType): string {
  switch (type) {
    case SecondaryObjectiveType.SlayTheWarlord:
      return 'Slay the Warlord';
    case SecondaryObjectiveType.GiantKiller:
      return 'Giant Killer';
    case SecondaryObjectiveType.LastManStanding:
      return 'Last Man Standing';
    case SecondaryObjectiveType.FirstStrike:
      return 'First Strike';
    default:
      return type;
  }
}
