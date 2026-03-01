/**
 * Toolbar
 * Top bar with mode selectors, scenario dropdown, blast size, movement distance.
 */

import { useCallback } from 'react';
import type { DebugVisualizerState, DebugVisualizerAction, InteractionMode } from '../state/types';
import {
  createOpenFieldScenario,
  createTerrainScenario,
  createVehicleScenario,
  createCoherencyTestScenario,
  createBlastTestScenario,
} from '@hh/geometry';

interface ToolbarProps {
  state: DebugVisualizerState;
  dispatch: React.Dispatch<DebugVisualizerAction>;
  onReturnToMenu?: () => void;
}

const MODES: { mode: InteractionMode; label: string }[] = [
  { mode: 'select', label: 'Select' },
  { mode: 'los', label: 'LOS' },
  { mode: 'distance', label: 'Distance' },
  { mode: 'coherency', label: 'Coherency' },
  { mode: 'movement', label: 'Movement' },
  { mode: 'blast', label: 'Blast' },
  { mode: 'template', label: 'Template' },
  { mode: 'vehicleFacing', label: 'Vehicle' },
  { mode: 'terrainEdit', label: 'Terrain' },
];

const SCENARIOS: { id: string; label: string; factory: () => ReturnType<typeof createOpenFieldScenario> }[] = [
  { id: 'open-field', label: 'Open Field', factory: createOpenFieldScenario },
  { id: 'terrain', label: 'Terrain', factory: createTerrainScenario },
  { id: 'vehicles', label: 'Vehicles', factory: createVehicleScenario },
  { id: 'coherency', label: 'Coherency Test', factory: createCoherencyTestScenario },
  { id: 'blast', label: 'Blast Test', factory: createBlastTestScenario },
];

export function Toolbar({ state, dispatch, onReturnToMenu }: ToolbarProps) {
  const handleScenarioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const scenario = SCENARIOS.find(s => s.id === e.target.value);
      if (scenario) {
        dispatch({ type: 'LOAD_SCENARIO', scenario: scenario.factory() });
      }
    },
    [dispatch],
  );

  const handleBlastSizeChange = useCallback(
    (size: 3 | 5 | 7) => {
      dispatch({ type: 'SET_BLAST_SIZE', size });
    },
    [dispatch],
  );

  const handleMovementDistanceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const distance = parseFloat(e.target.value);
      if (!isNaN(distance)) {
        dispatch({ type: 'SET_MOVEMENT_DISTANCE', distance });
      }
    },
    [dispatch],
  );

  const handleClearLOS = useCallback(() => {
    dispatch({ type: 'CLEAR_LOS' });
  }, [dispatch]);

  const handleClearBlast = useCallback(() => {
    dispatch({ type: 'CLEAR_BLAST' });
  }, [dispatch]);

  const handleClearTemplate = useCallback(() => {
    dispatch({ type: 'CLEAR_TEMPLATE' });
  }, [dispatch]);

  const handleClearMovement = useCallback(() => {
    dispatch({ type: 'CLEAR_MOVEMENT' });
  }, [dispatch]);

  return (
    <div className="toolbar">
      {/* ── Scenario Selector ──────────────────────────────────────────── */}
      <div className="toolbar-group">
        <span className="toolbar-label">Scene</span>
        <select className="toolbar-select" onChange={handleScenarioChange} defaultValue="open-field">
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="toolbar-separator" />

      {/* ── Mode Buttons ───────────────────────────────────────────────── */}
      <div className="toolbar-group">
        <span className="toolbar-label">Mode</span>
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            className={`toolbar-btn ${state.mode === mode ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_MODE', mode })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar-separator" />

      {/* ── Mode-specific controls ─────────────────────────────────────── */}
      {state.mode === 'blast' && (
        <div className="toolbar-group">
          <span className="toolbar-label">Blast</span>
          {([3, 5, 7] as const).map(size => (
            <button
              key={size}
              className={`toolbar-btn ${state.blast.blastSize === size ? 'active' : ''}`}
              onClick={() => handleBlastSizeChange(size)}
            >
              {size}"
            </button>
          ))}
          <button className="toolbar-btn" onClick={handleClearBlast}>Clear</button>
        </div>
      )}

      {state.mode === 'movement' && (
        <div className="toolbar-group">
          <span className="toolbar-label">Move</span>
          <input
            type="range"
            min="1"
            max="24"
            step="0.5"
            value={state.movement.maxMove}
            onChange={handleMovementDistanceChange}
            style={{ width: 100 }}
          />
          <span className="toolbar-label" style={{ color: '#e0e0e0', minWidth: 30 }}>
            {state.movement.maxMove}"
          </span>
          <button className="toolbar-btn" onClick={handleClearMovement}>Clear</button>
        </div>
      )}

      {state.mode === 'los' && state.los.result && (
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={handleClearLOS}>Clear LOS</button>
        </div>
      )}

      {state.mode === 'template' && state.template.template && (
        <div className="toolbar-group">
          <button className="toolbar-btn" onClick={handleClearTemplate}>Clear Template</button>
        </div>
      )}

      {/* ── Zoom Level ─────────────────────────────────────────────────── */}
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <span className="toolbar-label">
          {state.camera.zoom.toFixed(1)}px/in
        </span>
      </div>

      {/* ── Return to Menu ─────────────────────────────────────────────── */}
      {onReturnToMenu && (
        <>
          <div className="toolbar-separator" />
          <div className="toolbar-group">
            <button className="toolbar-btn" onClick={onReturnToMenu}>
              Menu
            </button>
          </div>
        </>
      )}
    </div>
  );
}
