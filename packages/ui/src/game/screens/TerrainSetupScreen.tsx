/**
 * TerrainSetupScreen
 *
 * Allows players to place terrain on the battlefield before deployment.
 * Reuses the existing terrain editor functionality from the debug visualizer.
 */

import { useCallback, useState } from 'react';
import { TerrainType } from '@hh/types';
import type { TerrainPiece } from '@hh/types';
import type { GameUIState, GameUIAction } from '../types';
import {
  createRectTerrain,
  createCircleTerrain,
} from '@hh/geometry';

interface TerrainSetupScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

type TerrainPreset = {
  name: string;
  description: string;
  terrain: TerrainPiece[];
};

function generateId(): string {
  return `terrain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TERRAIN_PRESETS: TerrainPreset[] = [
  {
    name: 'Open Field',
    description: 'No terrain — pure open ground.',
    terrain: [],
  },
  {
    name: 'Light Cover',
    description: 'A few scattered light terrain pieces.',
    terrain: [
      createRectTerrain(generateId(), 'Light Cover A', TerrainType.LightArea, { x: 18, y: 18 }, 6, 4, false, false),
      createRectTerrain(generateId(), 'Light Cover B', TerrainType.LightArea, { x: 48, y: 28 }, 5, 5, false, false),
    ],
  },
  {
    name: 'City Ruins',
    description: 'Dense urban terrain with heavy ruins.',
    terrain: [
      createRectTerrain(generateId(), 'Ruin A', TerrainType.HeavyArea, { x: 15, y: 12 }, 4, 4, true, false),
      createRectTerrain(generateId(), 'Ruin B', TerrainType.HeavyArea, { x: 50, y: 10 }, 5, 3, true, false),
      createRectTerrain(generateId(), 'Ruin C', TerrainType.MediumArea, { x: 30, y: 22 }, 8, 6, true, false),
      createRectTerrain(generateId(), 'Ruin D', TerrainType.HeavyArea, { x: 42, y: 34 }, 4, 4, true, false),
      createRectTerrain(generateId(), 'Ruin E', TerrainType.MediumArea, { x: 20, y: 35 }, 6, 4, true, false),
    ],
  },
  {
    name: 'Forest & Hills',
    description: 'Natural terrain with woods and elevated ground.',
    terrain: [
      createCircleTerrain(generateId(), 'Forest A', TerrainType.MediumArea, { x: 18, y: 24 }, 5, true, false),
      createCircleTerrain(generateId(), 'Forest B', TerrainType.MediumArea, { x: 54, y: 24 }, 4, true, false),
      createRectTerrain(generateId(), 'Hill A', TerrainType.LightArea, { x: 32, y: 16 }, 8, 6, false, false),
      createRectTerrain(generateId(), 'Hill B', TerrainType.LightArea, { x: 36, y: 32 }, 6, 5, false, false),
    ],
  },
];

export function TerrainSetupScreen({ state, dispatch, onReturnToMenu }: TerrainSetupScreenProps) {
  const [placingType, setPlacingType] = useState<TerrainType>(TerrainType.MediumArea);
  const [placingShape, setPlacingShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [isDifficult, setIsDifficult] = useState(true);
  const [isDangerous, setIsDangerous] = useState(false);

  const handleLoadPreset = useCallback(
    (preset: TerrainPreset) => {
      // Clear existing terrain
      for (const t of state.terrain) {
        dispatch({ type: 'REMOVE_TERRAIN', terrainId: t.id });
      }
      // Add preset terrain
      for (const t of preset.terrain) {
        dispatch({ type: 'ADD_TERRAIN', terrain: { ...t, id: generateId() } });
      }
    },
    [dispatch, state.terrain],
  );

  const handleAddTerrain = useCallback(() => {
    const id = generateId();
    const name = `${placingType} ${state.terrain.length + 1}`;
    // Place in center of battlefield
    const centerX = state.battlefieldWidth / 2;
    const centerY = state.battlefieldHeight / 2;

    let terrain: TerrainPiece;
    if (placingShape === 'rectangle') {
      terrain = createRectTerrain(id, name, placingType, { x: centerX - 3, y: centerY - 2 }, 6, 4, isDifficult, isDangerous);
    } else {
      terrain = createCircleTerrain(id, name, placingType, { x: centerX, y: centerY }, 3, isDifficult, isDangerous);
    }
    dispatch({ type: 'ADD_TERRAIN', terrain });
  }, [dispatch, placingType, placingShape, isDifficult, isDangerous, state.terrain.length, state.battlefieldWidth, state.battlefieldHeight]);

  const handleRemoveTerrain = useCallback(
    (terrainId: string) => {
      dispatch({ type: 'REMOVE_TERRAIN', terrainId });
    },
    [dispatch],
  );

  const handleConfirm = useCallback(() => {
    dispatch({ type: 'CONFIRM_TERRAIN' });
  }, [dispatch]);

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1 className="setup-title">Terrain Setup</h1>
        <p className="setup-subtitle">
          Place terrain on the {state.battlefieldWidth}" x {state.battlefieldHeight}" battlefield
        </p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content terrain-setup-content">
        {/* Terrain Controls */}
        <div className="terrain-setup-controls">
          {/* Presets */}
          <div className="panel-section">
            <div className="panel-title">Terrain Presets</div>
            {TERRAIN_PRESETS.map((preset, i) => (
              <button
                key={i}
                className="army-load-preset-btn"
                onClick={() => handleLoadPreset(preset)}
              >
                <div className="army-load-preset-name">{preset.name}</div>
                <div className="army-load-preset-desc">{preset.description}</div>
              </button>
            ))}
          </div>

          {/* Manual Placement */}
          <div className="panel-section">
            <div className="panel-title">Add Terrain</div>
            <div className="panel-row">
              <span className="panel-row-label">Type</span>
              <select
                className="toolbar-select"
                value={placingType}
                onChange={(e) => setPlacingType(e.target.value as TerrainType)}
              >
                <option value={TerrainType.LightArea}>Light Area</option>
                <option value={TerrainType.MediumArea}>Medium Area</option>
                <option value={TerrainType.HeavyArea}>Heavy Area</option>
                <option value={TerrainType.TerrainPiece}>Terrain Piece</option>
                <option value={TerrainType.Impassable}>Impassable</option>
              </select>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Shape</span>
              <div className="radio-group">
                <label>
                  <input type="radio" checked={placingShape === 'rectangle'} onChange={() => setPlacingShape('rectangle')} />
                  Rect
                </label>
                <label>
                  <input type="radio" checked={placingShape === 'circle'} onChange={() => setPlacingShape('circle')} />
                  Circle
                </label>
              </div>
            </div>
            <div className="panel-row">
              <label className="overlay-checkbox">
                <input type="checkbox" checked={isDifficult} onChange={(e) => setIsDifficult(e.target.checked)} />
                Difficult
              </label>
            </div>
            <div className="panel-row">
              <label className="overlay-checkbox">
                <input type="checkbox" checked={isDangerous} onChange={(e) => setIsDangerous(e.target.checked)} />
                Dangerous
              </label>
            </div>
            <button className="toolbar-btn" onClick={handleAddTerrain} style={{ width: '100%', marginTop: 8 }}>
              Add Terrain Piece
            </button>
          </div>

          {/* Current Terrain List */}
          <div className="panel-section">
            <div className="panel-title">Placed Terrain ({state.terrain.length})</div>
            {state.terrain.length === 0 ? (
              <div className="panel-row">
                <span className="panel-row-label">No terrain placed</span>
              </div>
            ) : (
              state.terrain.map(t => (
                <div key={t.id} className="terrain-list-item">
                  <div>
                    <span className="terrain-name">{t.name}</span>
                    <span className="terrain-type"> ({t.type})</span>
                  </div>
                  <button
                    className="terrain-remove-btn"
                    onClick={() => handleRemoveTerrain(t.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Battlefield Preview */}
        <div className="terrain-setup-preview">
          <div className="terrain-preview-battlefield" style={{
            width: '100%',
            aspectRatio: `${state.battlefieldWidth} / ${state.battlefieldHeight}`,
            background: '#1a2636',
            border: '1px solid #2a4a6f',
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {state.terrain.map(t => {
              if (t.shape.kind === 'rectangle') {
                const xPct = (t.shape.topLeft.x / state.battlefieldWidth) * 100;
                const yPct = (t.shape.topLeft.y / state.battlefieldHeight) * 100;
                const wPct = (t.shape.width / state.battlefieldWidth) * 100;
                const hPct = (t.shape.height / state.battlefieldHeight) * 100;
                return (
                  <div
                    key={t.id}
                    className="terrain-preview-piece"
                    style={{
                      position: 'absolute',
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${wPct}%`,
                      height: `${hPct}%`,
                      background: t.type === TerrainType.HeavyArea ? 'rgba(239,68,68,0.3)'
                        : t.type === TerrainType.MediumArea ? 'rgba(234,179,8,0.3)'
                        : t.type === TerrainType.LightArea ? 'rgba(34,197,94,0.2)'
                        : 'rgba(148,163,184,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 2,
                      fontSize: 8,
                      color: '#ccc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={`${t.name} (${t.type})`}
                  >
                    {t.name}
                  </div>
                );
              }
              if (t.shape.kind === 'circle') {
                const xPct = ((t.shape.center.x - t.shape.radius) / state.battlefieldWidth) * 100;
                const yPct = ((t.shape.center.y - t.shape.radius) / state.battlefieldHeight) * 100;
                const dPct = (t.shape.radius * 2 / state.battlefieldWidth) * 100;
                const hPct = (t.shape.radius * 2 / state.battlefieldHeight) * 100;
                return (
                  <div
                    key={t.id}
                    className="terrain-preview-piece"
                    style={{
                      position: 'absolute',
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${dPct}%`,
                      height: `${hPct}%`,
                      background: t.type === TerrainType.HeavyArea ? 'rgba(239,68,68,0.3)'
                        : t.type === TerrainType.MediumArea ? 'rgba(234,179,8,0.3)'
                        : 'rgba(34,197,94,0.2)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '50%',
                      fontSize: 8,
                      color: '#ccc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={`${t.name} (${t.type})`}
                  >
                    {t.name}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>

      <div className="setup-footer">
        <button className="setup-confirm-btn" onClick={handleConfirm}>
          Confirm Terrain → Deploy Units
        </button>
      </div>
    </div>
  );
}
