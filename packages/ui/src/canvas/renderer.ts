/**
 * Master Renderer
 * Orchestrates all sub-renderers in the correct layer order.
 * Called once per animation frame.
 */

import type { DebugVisualizerState } from '../state/types';
import { BATTLEFIELD_BG, HUD_TEXT, HUD_BG } from '../styles/colors';
import { renderGrid } from './gridRenderer';
import { renderTerrain, renderTerrainPreview } from './terrainRenderer';
import { renderModels } from './modelRenderer';
import { renderSelection } from './selectionRenderer';
import { renderLOS } from '../overlays/losOverlay';
import { renderDistance } from '../overlays/distanceOverlay';
import { renderCoherency } from '../overlays/coherencyOverlay';
import { renderMovementEnvelope } from '../overlays/movementOverlay';
import { renderBlast } from '../overlays/blastOverlay';
import { renderVehicleFacing } from '../overlays/vehicleFacingOverlay';
import { renderGhostTrails } from '../overlays/ghostTrailOverlay';
import { renderObjectives } from '../overlays/objectiveOverlay';
import { renderGameOverlays } from '../game/canvas/gameCanvasAdapter';
import type { AssetManifest } from './assets';

export interface RenderFrameOptions {
  assetManifest?: AssetManifest;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: DebugVisualizerState,
  canvasWidth: number,
  canvasHeight: number,
  options: RenderFrameOptions = {},
): void {
  const { camera, overlayVisibility } = state;
  const zoom = camera.zoom;

  // ── 1. Clear ────────────────────────────────────────────────────────────────
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // ── 2. Apply camera transform ───────────────────────────────────────────────
  ctx.save();
  ctx.translate(camera.offsetX, camera.offsetY);
  ctx.scale(zoom, zoom);

  // ── 3. Battlefield background ───────────────────────────────────────────────
  ctx.fillStyle = BATTLEFIELD_BG;
  ctx.fillRect(0, 0, state.battlefieldWidth, state.battlefieldHeight);

  // ── 4. Grid ─────────────────────────────────────────────────────────────────
  if (overlayVisibility.grid) {
    renderGrid(ctx, state.battlefieldWidth, state.battlefieldHeight, zoom);
  }

  // ── 5. Terrain polygons ─────────────────────────────────────────────────────
  renderTerrain(ctx, state.terrain, zoom, options.assetManifest);

  // ── 6. Terrain editor preview ───────────────────────────────────────────────
  if (state.mode === 'terrainEdit') {
    renderTerrainPreview(
      ctx,
      state.terrainEditor.dragStart,
      state.terrainEditor.dragCurrent,
      state.terrainEditor.placingShape,
      zoom,
    );
  }

  // ── 6b. Objective markers ──────────────────────────────────────────────
  if (state.gameState?.missionState) {
    renderObjectives(ctx, state.gameState, zoom);
  }

  // ── 7. Movement envelope (behind models) ────────────────────────────────────
  if (overlayVisibility.movement && state.movement.envelope) {
    const movementModel = state.models.find(m => m.id === state.movement.selectedModelId);
    if (movementModel) {
      renderMovementEnvelope(ctx, state.movement.envelope, movementModel.shape, zoom);
    }
  }

  // ── 7b. Ghost trails (behind models) ─────────────────────────────────────
  if (state.ghostTrails.length > 0) {
    renderGhostTrails(ctx, state.ghostTrails, zoom);
  }

  // ── 8. Models ───────────────────────────────────────────────────────────────
  renderModels(ctx, state.models, zoom, options.assetManifest);

  // ── 9. Coherency overlay ────────────────────────────────────────────────────
  if (overlayVisibility.coherency && state.coherencyResult) {
    const p1Shapes = state.models
      .filter(m => m.player === 1)
      .map(m => m.shape);
    renderCoherency(ctx, state.coherencyResult, p1Shapes, zoom);
  }

  // ── 10. LOS rays ────────────────────────────────────────────────────────────
  if (overlayVisibility.los && state.los.result) {
    const modelA = state.models.find(m => m.id === state.los.modelAId);
    const modelB = state.models.find(m => m.id === state.los.modelBId);
    if (modelA && modelB) {
      renderLOS(ctx, state.los.result, modelA.shape, modelB.shape, zoom);
    }
  }

  // ── 11. Distance readout ────────────────────────────────────────────────────
  if (overlayVisibility.distance && state.distanceReadout) {
    renderDistance(ctx, state.distanceReadout, zoom);
  }

  // ── 12. Blast / template ────────────────────────────────────────────────────
  if (overlayVisibility.blast && state.blast.center) {
    renderBlast(
      ctx,
      state.blast.center,
      state.blast.radius,
      state.blast.hitIndices,
      state.models.map(m => m.shape),
      zoom,
    );
  }

  if (overlayVisibility.template && state.template.template) {
    renderBlast(
      ctx,
      state.template.origin!,
      0,
      state.template.hitIndices,
      state.models.map(m => m.shape),
      zoom,
      state.template.template,
    );
  }

  // ── 13. Vehicle facing arcs ─────────────────────────────────────────────────
  if (overlayVisibility.vehicleFacing && state.selectedModelId) {
    const selectedModel = state.models.find(m => m.id === state.selectedModelId);
    if (selectedModel && selectedModel.shape.kind === 'rect') {
      renderVehicleFacing(ctx, selectedModel.shape, zoom);
    }
  }

  // ── 14. Selection ring ──────────────────────────────────────────────────────
  renderSelection(ctx, state.models, state.selectedModelId, state.hoveredModelId, zoom);

  // ── 14b. Game-specific overlays (status rings, wounds, active glow, destroyed)
  if (state.gameState) {
    renderGameOverlays(
      ctx,
      {
        models: state.models,
        terrain: state.terrain,
        camera: state.camera,
        battlefieldWidth: state.battlefieldWidth,
        battlefieldHeight: state.battlefieldHeight,
        selectedModelId: state.selectedModelId,
        hoveredModelId: state.hoveredModelId,
        ghostTrails: state.ghostTrails,
        gameState: state.gameState,
        selectedUnitId: null,
        hoveredUnitId: null,
      },
      zoom,
    );
  }

  // ── 15. Restore transform ───────────────────────────────────────────────────
  ctx.restore();

  // ── 16. HUD (screen space) ──────────────────────────────────────────────────
  renderHUD(ctx, state, canvasWidth, canvasHeight);
}

function renderHUD(
  ctx: CanvasRenderingContext2D,
  state: DebugVisualizerState,
  canvasWidth: number,
  _canvasHeight: number,
): void {
  const padding = 8;
  const fontSize = 12;
  ctx.font = `${fontSize}px monospace`;
  ctx.textBaseline = 'top';

  // Mode indicator (top-left)
  const modeText = `Mode: ${state.mode}`;
  const zoomText = `Zoom: ${state.camera.zoom.toFixed(1)}px/in`;
  const coordText = state.mouseWorldPos
    ? `Pos: (${state.mouseWorldPos.x.toFixed(1)}", ${state.mouseWorldPos.y.toFixed(1)}")`
    : 'Pos: —';

  const lines = [modeText, zoomText, coordText];

  // Measure max width for background
  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }

  // Background
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(
    padding - 4,
    padding - 4,
    maxWidth + 16,
    lines.length * (fontSize + 4) + 12,
  );

  // Text
  ctx.fillStyle = HUD_TEXT;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * (fontSize + 4));
  }

  // Model count (top-right)
  const countText = `Models: ${state.models.length}`;
  const countWidth = ctx.measureText(countText).width;
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(canvasWidth - countWidth - padding - 12, padding - 4, countWidth + 16, fontSize + 12);
  ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = 'right';
  ctx.fillText(countText, canvasWidth - padding, padding);
  ctx.textAlign = 'left';
}
