import { describe, expect, it } from 'vitest';
import { TerrainType } from '@hh/types';
import type { VisualizerModel } from '../state/types';
import {
  createDefaultAssetManifest,
  defaultAssetManifestLoader,
  getNextRendererAssetMode,
  resolveModelAsset,
  resolveTerrainAsset,
} from './assets';

function makeModel(overrides: Partial<VisualizerModel> = {}): VisualizerModel {
  return {
    id: overrides.id ?? 'model-1',
    player: overrides.player ?? 1,
    label: overrides.label ?? 'techmarine',
    shape: overrides.shape ?? {
      kind: 'circle',
      center: { x: 10, y: 10 },
      radius: 0.5,
    },
  };
}

describe('renderer asset manifests', () => {
  it('loads both placeholder and sprite-ready manifests', () => {
    const placeholder = createDefaultAssetManifest('placeholder');
    const sprite = createDefaultAssetManifest('sprite');

    expect(placeholder.mode).toBe('placeholder');
    expect(sprite.mode).toBe('sprite');
    expect(placeholder.id).not.toBe(sprite.id);
  });

  it('returns manifest clones so caller mutation does not leak', () => {
    const first = defaultAssetManifestLoader.load('placeholder');
    first.modelAssets.default = { fallbackFill: 'rgba(0, 0, 0, 1)' };

    const second = defaultAssetManifestLoader.load('placeholder');
    expect(second.modelAssets.default?.fallbackFill).not.toBe('rgba(0, 0, 0, 1)');
  });

  it('resolves model and terrain assets with default fallback entries', () => {
    const manifest = createDefaultAssetManifest('sprite');
    const model = makeModel();

    const modelAsset = resolveModelAsset(manifest, model);
    const terrainAsset = resolveTerrainAsset(manifest, TerrainType.MediumArea);

    expect(modelAsset).toBeDefined();
    expect(modelAsset?.fallbackFill).toBeDefined();
    expect(modelAsset?.spriteSrc).toBeDefined();
    expect(terrainAsset).toBeDefined();
    expect(terrainAsset?.pattern).toBe('hatch');
  });

  it('toggles renderer mode deterministically', () => {
    expect(getNextRendererAssetMode('placeholder')).toBe('sprite');
    expect(getNextRendererAssetMode('sprite')).toBe('placeholder');
  });
});
