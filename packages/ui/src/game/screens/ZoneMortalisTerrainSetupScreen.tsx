import { useCallback, useMemo, useState } from 'react';
import type { DeploymentMapDefinition, Position, TerrainPiece, ZoneMortalisBoundaryRef } from '@hh/types';
import { TerrainType } from '@hh/types';
import { createRectTerrain } from '@hh/geometry';
import { findDeploymentMapByType } from '@hh/data';
import type { GameUIAction, GameUIState } from '../types';

interface ZoneMortalisTerrainSetupScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

type BoundaryTool = 'wall' | 'door-2' | 'door-4' | 'barricade' | 'erase';

const SECTION_SIZE = 12;
const WALL_THICKNESS = 0.6;
const LIGHT_AREA_SIZE = 6;

function boundaryId(prefix: string, boundary: ZoneMortalisBoundaryRef): string {
  return `zm-${prefix}-${boundary.orientation}-${boundary.row}-${boundary.column}`;
}

function createWallTerrain(boundary: ZoneMortalisBoundaryRef, isPerimeter: boolean = false): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const terrain = createRectTerrain(
    boundaryId('wall', boundary),
    `Wall ${boundary.orientation} ${boundary.row}-${boundary.column}`,
    TerrainType.Impassable,
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE },
    isHorizontal ? SECTION_SIZE : WALL_THICKNESS,
    isHorizontal ? WALL_THICKNESS : SECTION_SIZE,
    false,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      kind: 'wall',
      boundary,
      isPerimeter,
    },
  };
}

function createDoorTerrain(boundary: ZoneMortalisBoundaryRef, width: number): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const offset = (SECTION_SIZE - width) / 2;
  const terrain = createRectTerrain(
    boundaryId('door', boundary),
    `Doorway (${width}) ${boundary.orientation} ${boundary.row}-${boundary.column}`,
    TerrainType.Impassable,
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE + offset, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE + offset },
    isHorizontal ? width : WALL_THICKNESS,
    isHorizontal ? WALL_THICKNESS : width,
    false,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      id: boundaryId('door', boundary),
      kind: 'doorway',
      boundary,
      width,
      state: 'closed',
      armourValue: 12,
      hullPoints: 3,
      maxHullPoints: 3,
    },
  };
}

function createBarricadeTerrain(boundary: ZoneMortalisBoundaryRef): TerrainPiece {
  const isHorizontal = boundary.orientation === 'horizontal';
  const terrain = createRectTerrain(
    boundaryId('barricade', boundary),
    `Barricade ${boundary.orientation} ${boundary.row}-${boundary.column}`,
    TerrainType.TerrainPiece,
    isHorizontal
      ? { x: boundary.column * SECTION_SIZE + 2, y: boundary.row * SECTION_SIZE - WALL_THICKNESS / 2 }
      : { x: boundary.column * SECTION_SIZE - WALL_THICKNESS / 2, y: boundary.row * SECTION_SIZE + 2 },
    isHorizontal ? SECTION_SIZE - 4 : WALL_THICKNESS,
    isHorizontal ? WALL_THICKNESS : SECTION_SIZE - 4,
    true,
    false,
  );
  return {
    ...terrain,
    zoneMortalis: {
      kind: 'barricade',
      boundary,
    },
  };
}

function createLightAreaTerrain(row: number, column: number): TerrainPiece {
  return createRectTerrain(
    `zm-light-${row}-${column}`,
    `Light Area ${row + 1}-${column + 1}`,
    TerrainType.LightArea,
    {
      x: column * SECTION_SIZE + (SECTION_SIZE - LIGHT_AREA_SIZE) / 2,
      y: row * SECTION_SIZE + (SECTION_SIZE - LIGHT_AREA_SIZE) / 2,
    },
    LIGHT_AREA_SIZE,
    LIGHT_AREA_SIZE,
    false,
    false,
  );
}

function getBoundaryTerrain(state: GameUIState, boundary: ZoneMortalisBoundaryRef): TerrainPiece | undefined {
  return state.terrain.find((terrain) => {
    const terrainId = terrain.id;
    return (
      terrainId === boundaryId('wall', boundary)
      || terrainId === boundaryId('door', boundary)
      || terrainId === boundaryId('barricade', boundary)
    );
  });
}

function getLightAreaTerrain(state: GameUIState, row: number, column: number): TerrainPiece | undefined {
  return state.terrain.find((terrain) => terrain.id === `zm-light-${row}-${column}`);
}

function getSectionOverlayLabel(
  deploymentMapDefinition: DeploymentMapDefinition | undefined,
  row: number,
  column: number,
): string {
  const trait = deploymentMapDefinition?.zoneMortalisSectionTraits?.find(
    (candidate) => candidate.row === row && candidate.column === column,
  );
  if (!trait) {
    return '';
  }

  if (trait.label && trait.confinedSpace) {
    return `${trait.label} / CS ${trait.confinedSpace}`;
  }
  if (trait.confinedSpace) {
    return `CS ${trait.confinedSpace}`;
  }
  return trait.label ?? '';
}

function getDeploymentAreaPolygons(definition: DeploymentMapDefinition | undefined): Position[][] {
  if (!definition) {
    return [];
  }
  const [zoneA, zoneB] = definition.getZones(48, 48);
  return [...(zoneA.areas ?? [zoneA.vertices]), ...(zoneB.areas ?? [zoneB.vertices])];
}

function polygonToClipPath(vertices: Position[]): string {
  return `polygon(${vertices.map((vertex) => `${(vertex.x / 48) * 100}% ${(vertex.y / 48) * 100}%`).join(', ')})`;
}

export function ZoneMortalisTerrainSetupScreen({
  state,
  dispatch,
  onReturnToMenu,
}: ZoneMortalisTerrainSetupScreenProps) {
  const [tool, setTool] = useState<BoundaryTool>('wall');
  const deploymentMapDefinition = useMemo(
    () => state.missionSelect.selectedDeploymentMap
      ? findDeploymentMapByType(state.missionSelect.selectedDeploymentMap)
      : undefined,
    [state.missionSelect.selectedDeploymentMap],
  );
  const deploymentPolygons = useMemo(
    () => getDeploymentAreaPolygons(deploymentMapDefinition),
    [deploymentMapDefinition],
  );

  const applyBoundaryTool = useCallback((boundary: ZoneMortalisBoundaryRef) => {
    const existing = getBoundaryTerrain(state, boundary);
    if (existing) {
      dispatch({ type: 'REMOVE_TERRAIN', terrainId: existing.id });
    }

    if (tool === 'erase') {
      return;
    }

    const terrain = tool === 'wall'
      ? createWallTerrain(boundary)
      : tool === 'door-2'
        ? createDoorTerrain(boundary, 2)
        : tool === 'door-4'
          ? createDoorTerrain(boundary, 4)
          : createBarricadeTerrain(boundary);
    dispatch({ type: 'ADD_TERRAIN', terrain });
  }, [dispatch, state, tool]);

  const toggleLightArea = useCallback((row: number, column: number) => {
    const existing = getLightAreaTerrain(state, row, column);
    if (existing) {
      dispatch({ type: 'REMOVE_TERRAIN', terrainId: existing.id });
      return;
    }

    dispatch({ type: 'ADD_TERRAIN', terrain: createLightAreaTerrain(row, column) });
  }, [dispatch, state]);

  const handleAddPerimeterWalls = useCallback(() => {
    const boundaries: ZoneMortalisBoundaryRef[] = [];
    for (let column = 0; column < 4; column++) {
      boundaries.push({ orientation: 'horizontal', row: 0, column });
      boundaries.push({ orientation: 'horizontal', row: 4, column });
    }
    for (let row = 0; row < 4; row++) {
      boundaries.push({ orientation: 'vertical', row, column: 0 });
      boundaries.push({ orientation: 'vertical', row, column: 4 });
    }

    for (const boundary of boundaries) {
      if (!getBoundaryTerrain(state, boundary)) {
        dispatch({ type: 'ADD_TERRAIN', terrain: createWallTerrain(boundary, true) });
      }
    }
  }, [dispatch, state]);

  const handleClearZoneMortalisTerrain = useCallback(() => {
    for (const terrain of state.terrain.filter((piece) => piece.id.startsWith('zm-'))) {
      dispatch({ type: 'REMOVE_TERRAIN', terrainId: terrain.id });
    }
  }, [dispatch, state.terrain]);

  const handleConfirm = useCallback(() => {
    dispatch({ type: 'CONFIRM_TERRAIN' });
  }, [dispatch]);

  const wallCount = state.terrain.filter((terrain) => terrain.id.startsWith('zm-wall-')).length;
  const doorwayCount = state.terrain.filter((terrain) => terrain.id.startsWith('zm-door-')).length;
  const barricadeCount = state.terrain.filter((terrain) => terrain.id.startsWith('zm-barricade-')).length;
  const lightAreaCount = state.terrain.filter((terrain) => terrain.id.startsWith('zm-light-')).length;

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1 className="setup-title">Zone Mortalis Setup</h1>
        <p className="setup-subtitle">
          Build a snapped 4x4 section battlefield with walls, doors, barricades, and light terrain
        </p>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="setup-content terrain-setup-content">
        <div className="terrain-setup-controls">
          <div className="panel-section">
            <div className="panel-title">Boundary Tool</div>
            <div className="radio-group" style={{ display: 'grid', gap: 8 }}>
              {([
                ['wall', 'Wall'],
                ['door-2', 'Standard Door'],
                ['door-4', 'Wide Door'],
                ['barricade', 'Barricade'],
                ['erase', 'Erase'],
              ] as Array<[BoundaryTool, string]>).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    checked={tool === value}
                    onChange={() => setTool(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button className="toolbar-btn" style={{ width: '100%', marginTop: 8 }} onClick={handleAddPerimeterWalls}>
              Add Perimeter Walls
            </button>
            <button className="toolbar-btn" style={{ width: '100%', marginTop: 8 }} onClick={handleClearZoneMortalisTerrain}>
              Clear Zone Mortalis Terrain
            </button>
          </div>

          <div className="panel-section">
            <div className="panel-title">Battlefield Summary</div>
            <div className="panel-row">
              <span className="panel-row-label">Walls</span>
              <span>{wallCount}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Doorways</span>
              <span>{doorwayCount}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Barricades</span>
              <span>{barricadeCount}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Light Areas</span>
              <span>{lightAreaCount}</span>
            </div>
          </div>

          <div className="panel-section">
            <div className="panel-title">Official Overlay</div>
            <div className="panel-row">
              <span className="panel-row-label">Deployment</span>
              <span>{deploymentMapDefinition?.name ?? 'Select a mission first'}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Section Traits</span>
              <span>{deploymentMapDefinition?.zoneMortalisSectionTraits ? 'Shown on grid' : 'Mission-driven / dynamic'}</span>
            </div>
            <div className="panel-row">
              <span className="panel-row-label">Tip</span>
              <span>Click a section to toggle light area terrain.</span>
            </div>
          </div>
        </div>

        <div className="terrain-setup-preview">
          <div
            className="terrain-preview-battlefield"
            style={{
              width: '100%',
              aspectRatio: '1 / 1',
              background: '#111827',
              border: '1px solid #2a4a6f',
              borderRadius: 4,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {deploymentPolygons.map((polygon, index) => (
              <div
                key={`deployment-${index}`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  clipPath: polygonToClipPath(polygon),
                  background: index < deploymentPolygons.length / 2
                    ? 'rgba(148, 163, 184, 0.16)'
                    : 'rgba(226, 232, 240, 0.08)',
                }}
              />
            ))}

            {Array.from({ length: 4 }).map((_, row) =>
              Array.from({ length: 4 }).map((__, column) => (
                <button
                  key={`section-${row}-${column}`}
                  type="button"
                  onClick={() => toggleLightArea(row, column)}
                  style={{
                    position: 'absolute',
                    left: `${column * 25}%`,
                    top: `${row * 25}%`,
                    width: '25%',
                    height: '25%',
                    border: '1px dashed rgba(148, 163, 184, 0.3)',
                    background: getLightAreaTerrain(state, row, column)
                      ? 'rgba(34, 197, 94, 0.22)'
                      : 'transparent',
                    color: '#cbd5e1',
                    fontSize: 11,
                  }}
                >
                  {getSectionOverlayLabel(deploymentMapDefinition, row, column)}
                </button>
              )),
            )}

            {Array.from({ length: 5 }).map((_, row) =>
              Array.from({ length: 4 }).map((__, column) => {
                const boundary: ZoneMortalisBoundaryRef = { orientation: 'horizontal', row, column };
                const terrain = getBoundaryTerrain(state, boundary);
                return (
                  <button
                    key={`horizontal-${row}-${column}`}
                    type="button"
                    onClick={() => applyBoundaryTool(boundary)}
                    style={{
                      position: 'absolute',
                      left: `${column * 25}%`,
                      top: `calc(${row * 25}% - 4px)`,
                      width: '25%',
                      height: 8,
                      background: terrain?.id.startsWith('zm-wall-')
                        ? '#94a3b8'
                        : terrain?.id.startsWith('zm-door-')
                          ? '#f59e0b'
                          : terrain?.id.startsWith('zm-barricade-')
                            ? '#22c55e'
                            : 'rgba(148, 163, 184, 0.18)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  />
                );
              }),
            )}

            {Array.from({ length: 4 }).map((_, row) =>
              Array.from({ length: 5 }).map((__, column) => {
                const boundary: ZoneMortalisBoundaryRef = { orientation: 'vertical', row, column };
                const terrain = getBoundaryTerrain(state, boundary);
                return (
                  <button
                    key={`vertical-${row}-${column}`}
                    type="button"
                    onClick={() => applyBoundaryTool(boundary)}
                    style={{
                      position: 'absolute',
                      left: `calc(${column * 25}% - 4px)`,
                      top: `${row * 25}%`,
                      width: 8,
                      height: '25%',
                      background: terrain?.id.startsWith('zm-wall-')
                        ? '#94a3b8'
                        : terrain?.id.startsWith('zm-door-')
                          ? '#f59e0b'
                          : terrain?.id.startsWith('zm-barricade-')
                            ? '#22c55e'
                            : 'rgba(148, 163, 184, 0.18)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  />
                );
              }),
            )}
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
