/**
 * Model Renderer
 * Draws circle bases (infantry) and rectangle hulls (vehicles).
 */

import { TWO_PI } from '@hh/geometry';
import type { VisualizerModel } from '../state/types';
import {
  PLAYER_1_FILL_ALPHA,
  PLAYER_1_STROKE,
  PLAYER_2_FILL_ALPHA,
  PLAYER_2_STROKE,
} from '../styles/colors';
import type { AssetManifest } from './assets';
import { resolveModelAsset } from './assets';

function getPlayerFill(player: 1 | 2): string {
  return player === 1 ? PLAYER_1_FILL_ALPHA : PLAYER_2_FILL_ALPHA;
}

function getPlayerStroke(player: 1 | 2): string {
  return player === 1 ? PLAYER_1_STROKE : PLAYER_2_STROKE;
}

export function renderModels(
  ctx: CanvasRenderingContext2D,
  models: VisualizerModel[],
  zoom: number,
  assetManifest?: AssetManifest,
): void {
  const isSpriteMode = assetManifest?.mode === 'sprite';

  for (const model of models) {
    const shape = model.shape;
    const asset = resolveModelAsset(assetManifest, model);
    const fill = asset?.fallbackFill ?? getPlayerFill(model.player);
    const stroke = asset?.fallbackStroke ?? getPlayerStroke(model.player);

    if (shape.kind === 'circle') {
      // Draw circle base
      ctx.beginPath();
      ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, TWO_PI);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();

      if (isSpriteMode) {
        // Sprite-ready mode keeps gameplay rendering but shows billboard framing.
        const size = shape.radius * 2;
        const topLeftX = shape.center.x - shape.radius;
        const topLeftY = shape.center.y - shape.radius;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.2 / zoom;
        ctx.strokeRect(topLeftX, topLeftY, size, size);
      }
    } else {
      // Draw rectangle hull
      ctx.save();
      ctx.translate(shape.center.x, shape.center.y);
      ctx.rotate(shape.rotation);

      const hw = shape.width / 2;
      const hh = shape.height / 2;

      // Hull body
      ctx.fillStyle = fill;
      ctx.fillRect(-hw, -hh, shape.width, shape.height);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(-hw, -hh, shape.width, shape.height);

      if (isSpriteMode) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(-hw - 0.15, -hh - 0.15, shape.width + 0.3, shape.height + 0.3);
      }

      // Facing arrow (points in +x local direction = forward)
      const arrowLen = hw * 0.6;
      const arrowW = hh * 0.3;
      ctx.beginPath();
      ctx.moveTo(hw * 0.2, 0);
      ctx.lineTo(hw * 0.2 + arrowLen, 0);
      ctx.moveTo(hw * 0.2 + arrowLen - arrowW, -arrowW);
      ctx.lineTo(hw * 0.2 + arrowLen, 0);
      ctx.lineTo(hw * 0.2 + arrowLen - arrowW, arrowW);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      ctx.restore();
    }

    // Label above the model
    const cx = shape.center.x;
    const cy = shape.kind === 'circle'
      ? shape.center.y - shape.radius - 0.3
      : shape.center.y - shape.height / 2 - 0.3;

    const fontSize = Math.min(0.5, 8 / zoom);
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = asset?.labelColor ?? 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      isSpriteMode ? `${model.label} [sprite]` : model.label,
      cx,
      cy,
    );
  }
}
