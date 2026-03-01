/**
 * InfoPanel
 * Right sidebar showing selected model stats, LOS result,
 * coherency status, distance, blast hits, and movement info.
 */

import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
import { OverlayControls } from './OverlayControls';
import { TerrainEditorPanel } from './TerrainEditorPanel';

interface InfoPanelProps {
  state: DebugVisualizerState;
  dispatch: React.Dispatch<DebugVisualizerAction>;
}

export function InfoPanel({ state, dispatch }: InfoPanelProps) {
  const selectedModel = state.selectedModelId
    ? state.models.find(m => m.id === state.selectedModelId)
    : null;

  return (
    <div className="info-panel">
      {/* ── Selected Model ──────────────────────────────────────────────── */}
      <div className="panel-section">
        <div className="panel-title">Selected Model</div>
        {selectedModel ? (
          <>
            <div className="panel-row">
              <span className="panel-row-label">ID</span>
              <span className="panel-row-value">{selectedModel.id}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Label</span>
              <span className="panel-row-value">{selectedModel.label}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Player</span>
              <span className="panel-row-value">{selectedModel.player}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Type</span>
              <span className="panel-row-value">
                {selectedModel.shape.kind === 'circle' ? 'Infantry' : 'Vehicle'}
              </span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Position</span>
              <span className="panel-row-value">
                ({selectedModel.shape.center.x.toFixed(1)}", {selectedModel.shape.center.y.toFixed(1)}")
              </span>
            </div>
            {selectedModel.shape.kind === 'circle' && (
              <div className="panel-row">
                <span className="panel-row-label">Base</span>
                <span className="panel-row-value">
                  {(selectedModel.shape.radius * 2 * 25.4).toFixed(0)}mm
                </span>
              </div>
            )}
            {selectedModel.shape.kind === 'rect' && (
              <>
                <div className="panel-row">
                  <span className="panel-row-label">Hull</span>
                  <span className="panel-row-value">
                    {selectedModel.shape.width.toFixed(1)}" x {selectedModel.shape.height.toFixed(1)}"
                  </span>
                </div>
                <div className="panel-row">
                  <span className="panel-row-label">Rotation</span>
                  <span className="panel-row-value">
                    {((selectedModel.shape.rotation * 180) / Math.PI).toFixed(0)}°
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="panel-row">
            <span className="panel-row-label">None selected</span>
          </div>
        )}
      </div>

      {/* ── LOS Result ─────────────────────────────────────────────────── */}
      {state.los.result && (
        <div className="panel-section">
          <div className="panel-title">Line of Sight</div>
          <div className="panel-row">
            <span className="panel-row-label">From</span>
            <span className="panel-row-value">{state.los.modelAId}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">To</span>
            <span className="panel-row-value">{state.los.modelBId}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Result</span>
            <span className={`panel-row-value ${state.los.result.hasLOS ? 'success' : 'error'}`}>
              {state.los.result.hasLOS ? 'HAS LOS' : 'BLOCKED'}
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Rays</span>
            <span className="panel-row-value">
              {state.los.result.rays.filter(r => !r.isBlocked).length} clear / {state.los.result.rays.filter(r => r.isBlocked).length} blocked
            </span>
          </div>
          {state.los.result.rays.some(r => r.isBlocked && r.blockingReason) && (
            <div className="panel-row">
              <span className="panel-row-label">Blocked by</span>
              <span className="panel-row-value error">
                {[...new Set(state.los.result.rays
                  .filter(r => r.isBlocked && r.blockingReason)
                  .map(r => r.blockingReason)
                )].join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Distance Readout ───────────────────────────────────────────── */}
      {state.distanceReadout && (
        <div className="panel-section">
          <div className="panel-title">Distance</div>
          <div className="panel-row">
            <span className="panel-row-label">From</span>
            <span className="panel-row-value">{state.distanceReadout.modelAId}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">To</span>
            <span className="panel-row-value">{state.distanceReadout.modelBId}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Exact</span>
            <span className="panel-row-value">{state.distanceReadout.distance.toFixed(3)}"</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Rounded</span>
            <span className="panel-row-value">{state.distanceReadout.roundedDistance}"</span>
          </div>
        </div>
      )}

      {/* ── Coherency ──────────────────────────────────────────────────── */}
      {state.coherencyResult && (
        <div className="panel-section">
          <div className="panel-title">Coherency</div>
          <div className="panel-row">
            <span className="panel-row-label">Status</span>
            <span className={`panel-row-value ${state.coherencyResult.isCoherent ? 'success' : 'error'}`}>
              {state.coherencyResult.isCoherent ? 'COHERENT' : 'INCOHERENT'}
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Connected</span>
            <span className="panel-row-value">
              {state.coherencyResult.coherentModelIndices.length} models
            </span>
          </div>
          {state.coherencyResult.incoherentModelIndices.length > 0 && (
            <div className="panel-row">
              <span className="panel-row-label">Disconnected</span>
              <span className="panel-row-value error">
                {state.coherencyResult.incoherentModelIndices.length} models
              </span>
            </div>
          )}
          <div className="panel-row">
            <span className="panel-row-label">Links</span>
            <span className="panel-row-value">{state.coherencyResult.links.length}</span>
          </div>
        </div>
      )}

      {/* ── Blast ──────────────────────────────────────────────────────── */}
      {state.blast.center && (
        <div className="panel-section">
          <div className="panel-title">Blast Marker</div>
          <div className="panel-row">
            <span className="panel-row-label">Size</span>
            <span className="panel-row-value">{state.blast.blastSize}" (r={state.blast.radius.toFixed(2)}")</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Center</span>
            <span className="panel-row-value">
              ({state.blast.center.x.toFixed(1)}", {state.blast.center.y.toFixed(1)}")
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Hits</span>
            <span className={`panel-row-value ${state.blast.hitIndices.length > 0 ? 'success' : ''}`}>
              {state.blast.hitIndices.length} models
            </span>
          </div>
        </div>
      )}

      {/* ── Template ───────────────────────────────────────────────────── */}
      {state.template.template && (
        <div className="panel-section">
          <div className="panel-title">Template</div>
          <div className="panel-row">
            <span className="panel-row-label">Direction</span>
            <span className="panel-row-value">
              {((state.template.direction * 180) / Math.PI).toFixed(0)}°
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Hits</span>
            <span className={`panel-row-value ${state.template.hitIndices.length > 0 ? 'success' : ''}`}>
              {state.template.hitIndices.length} models
            </span>
          </div>
        </div>
      )}

      {/* ── Movement ───────────────────────────────────────────────────── */}
      {state.movement.envelope && (
        <div className="panel-section">
          <div className="panel-title">Movement</div>
          <div className="panel-row">
            <span className="panel-row-label">Max Move</span>
            <span className="panel-row-value">{state.movement.maxMove}"</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Difficult Zones</span>
            <span className="panel-row-value">{state.movement.envelope.difficultZones.length}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Dangerous Zones</span>
            <span className="panel-row-value">{state.movement.envelope.dangerousZones.length}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Impassable Zones</span>
            <span className="panel-row-value">{state.movement.envelope.impassableZones.length}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Exclusion Zones</span>
            <span className="panel-row-value">{state.movement.envelope.exclusionZones.length}</span>
          </div>
        </div>
      )}

      {/* ── Game State ────────────────────────────────────────────────── */}
      {state.gameState && (
        <div className="panel-section">
          <div className="panel-title">Game State</div>
          <div className="panel-row">
            <span className="panel-row-label">Turn</span>
            <span className="panel-row-value">
              {state.gameState.currentBattleTurn} / {state.gameState.maxBattleTurns}
            </span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Phase</span>
            <span className="panel-row-value">{state.gameState.currentPhase}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Sub-Phase</span>
            <span className="panel-row-value">{state.gameState.currentSubPhase}</span>
          </div>
          <div className="panel-row">
            <span className="panel-row-label">Active Player</span>
            <span className="panel-row-value">
              {state.gameState.armies[state.gameState.activePlayerIndex]?.playerName ?? `P${state.gameState.activePlayerIndex + 1}`}
            </span>
          </div>
          {state.gameState.awaitingReaction && (
            <div className="panel-row">
              <span className="panel-row-label">Status</span>
              <span className="panel-row-value error">Awaiting Reaction</span>
            </div>
          )}
          {state.gameState.isGameOver && (
            <div className="panel-row">
              <span className="panel-row-label">Result</span>
              <span className="panel-row-value success">
                Game Over — {state.gameState.winnerPlayerIndex !== null
                  ? `P${state.gameState.winnerPlayerIndex + 1} wins`
                  : 'Draw'}
              </span>
            </div>
          )}
          {state.ghostTrails.length > 0 && (
            <div className="panel-row">
              <span className="panel-row-label">Ghost Trails</span>
              <span className="panel-row-value">{state.ghostTrails.length}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Overlay Controls ───────────────────────────────────────────── */}
      <OverlayControls visibility={state.overlayVisibility} dispatch={dispatch} />

      {/* ── Terrain Editor (when in terrain edit mode) ─────────────────── */}
      {state.mode === 'terrainEdit' && (
        <TerrainEditorPanel state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
