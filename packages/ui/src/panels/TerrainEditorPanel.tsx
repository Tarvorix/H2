/**
 * TerrainEditorPanel
 * Terrain type/shape selector, terrain list, and remove button.
 * Visible when mode is 'terrainEdit'.
 */

import { useCallback } from 'react';
import { TerrainType } from '@hh/types';
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';

interface TerrainEditorPanelProps {
  state: DebugVisualizerState;
  dispatch: React.Dispatch<DebugVisualizerAction>;
}

const TERRAIN_TYPES: { type: TerrainType; label: string }[] = [
  { type: TerrainType.LightArea, label: 'Light Area' },
  { type: TerrainType.MediumArea, label: 'Medium Area' },
  { type: TerrainType.HeavyArea, label: 'Heavy Area' },
  { type: TerrainType.TerrainPiece, label: 'Terrain Piece' },
  { type: TerrainType.Impassable, label: 'Impassable' },
  { type: TerrainType.Dangerous, label: 'Dangerous' },
  { type: TerrainType.Difficult, label: 'Difficult' },
];

export function TerrainEditorPanel({ state, dispatch }: TerrainEditorPanelProps) {
  const { terrainEditor, terrain } = state;

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      dispatch({
        type: 'SET_TERRAIN_EDITOR',
        partial: { placingType: e.target.value as TerrainType },
      });
    },
    [dispatch],
  );

  const handleShapeChange = useCallback(
    (shape: 'rectangle' | 'circle') => {
      dispatch({
        type: 'SET_TERRAIN_EDITOR',
        partial: { placingShape: shape },
      });
    },
    [dispatch],
  );

  const handleDifficultToggle = useCallback(() => {
    dispatch({
      type: 'SET_TERRAIN_EDITOR',
      partial: { isDifficult: !terrainEditor.isDifficult },
    });
  }, [dispatch, terrainEditor.isDifficult]);

  const handleDangerousToggle = useCallback(() => {
    dispatch({
      type: 'SET_TERRAIN_EDITOR',
      partial: { isDangerous: !terrainEditor.isDangerous },
    });
  }, [dispatch, terrainEditor.isDangerous]);

  const handleRemoveTerrain = useCallback(
    (id: string) => {
      dispatch({ type: 'REMOVE_TERRAIN', terrainId: id });
    },
    [dispatch],
  );

  return (
    <div className="panel-section">
      <div className="panel-title">Terrain Editor</div>

      {/* Type selector */}
      <div className="panel-row">
        <span className="panel-row-label">Type</span>
        <select
          className="toolbar-select"
          value={terrainEditor.placingType}
          onChange={handleTypeChange}
        >
          {TERRAIN_TYPES.map(({ type, label }) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
      </div>

      {/* Shape selector */}
      <div className="panel-row">
        <span className="panel-row-label">Shape</span>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="terrainShape"
              checked={terrainEditor.placingShape === 'rectangle'}
              onChange={() => handleShapeChange('rectangle')}
            />
            Rect
          </label>
          <label>
            <input
              type="radio"
              name="terrainShape"
              checked={terrainEditor.placingShape === 'circle'}
              onChange={() => handleShapeChange('circle')}
            />
            Circle
          </label>
        </div>
      </div>

      {/* Difficult / Dangerous toggles */}
      <label className="overlay-checkbox">
        <input
          type="checkbox"
          checked={terrainEditor.isDifficult}
          onChange={handleDifficultToggle}
        />
        Difficult
      </label>
      <label className="overlay-checkbox">
        <input
          type="checkbox"
          checked={terrainEditor.isDangerous}
          onChange={handleDangerousToggle}
        />
        Dangerous
      </label>

      {/* Instructions */}
      <div style={{ padding: '8px 0', fontSize: 11, color: '#6b7fa0' }}>
        Click and drag on the battlefield to place terrain. Right-click terrain to remove.
      </div>

      {/* Terrain list */}
      {terrain.length > 0 && (
        <>
          <div className="panel-title" style={{ marginTop: 8 }}>Terrain Pieces ({terrain.length})</div>
          {terrain.map(piece => (
            <div key={piece.id} className="terrain-list-item">
              <div>
                <span className="terrain-name">{piece.name}</span>
                <br />
                <span className="terrain-type">{piece.type}</span>
              </div>
              <button
                className="terrain-remove-btn"
                onClick={() => handleRemoveTerrain(piece.id)}
              >
                X
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
