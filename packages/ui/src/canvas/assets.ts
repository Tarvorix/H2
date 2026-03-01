import { TerrainType } from '@hh/types';
import type { VisualizerModel } from '../state/types';

export type RendererAssetMode = 'placeholder' | 'sprite';
export type TerrainRenderPattern = 'none' | 'hatch';

export interface ModelAssetEntry {
  spriteSrc?: string;
  fallbackFill?: string;
  fallbackStroke?: string;
  labelColor?: string;
  anchorX?: number;
  anchorY?: number;
  scale?: number;
  zLayer?: number;
}

export interface TerrainAssetEntry {
  tileSrc?: string;
  fallbackFill?: string;
  fallbackStroke?: string;
  labelColor?: string;
  pattern?: TerrainRenderPattern;
  scale?: number;
  zLayer?: number;
}

export interface AssetManifest {
  id: string;
  mode: RendererAssetMode;
  modelAssets: Record<string, ModelAssetEntry>;
  terrainAssets: Partial<Record<TerrainType, TerrainAssetEntry>> & {
    default?: TerrainAssetEntry;
  };
}

export interface AssetManifestLoader {
  load(mode: RendererAssetMode): AssetManifest;
}

function cloneManifest(manifest: AssetManifest): AssetManifest {
  const terrainAssets: AssetManifest['terrainAssets'] = {};
  for (const [key, value] of Object.entries(manifest.terrainAssets)) {
    terrainAssets[key as keyof AssetManifest['terrainAssets']] = value
      ? { ...value }
      : undefined;
  }

  return {
    ...manifest,
    modelAssets: { ...manifest.modelAssets },
    terrainAssets,
  };
}

export class StaticAssetManifestLoader implements AssetManifestLoader {
  constructor(
    private readonly manifests: Record<RendererAssetMode, AssetManifest>,
  ) {}

  load(mode: RendererAssetMode): AssetManifest {
    const manifest = this.manifests[mode] ?? this.manifests.placeholder;
    return cloneManifest(manifest);
  }
}

const PLACEHOLDER_MANIFEST: AssetManifest = {
  id: 'default-placeholder',
  mode: 'placeholder',
  modelAssets: {
    default: {
      fallbackFill: 'rgba(120, 140, 180, 0.65)',
      fallbackStroke: 'rgba(235, 245, 255, 0.65)',
      labelColor: 'rgba(255, 255, 255, 0.5)',
      anchorX: 0.5,
      anchorY: 0.5,
      scale: 1,
      zLayer: 20,
    },
  },
  terrainAssets: {
    default: {
      fallbackStroke: 'rgba(255, 255, 255, 0.4)',
      labelColor: 'rgba(255, 255, 255, 0.7)',
      pattern: 'none',
      scale: 1,
      zLayer: 10,
    },
  },
};

const SPRITE_READY_MANIFEST: AssetManifest = {
  id: 'default-sprite-ready',
  mode: 'sprite',
  modelAssets: {
    default: {
      spriteSrc: 'sprites/units/placeholder-atlas.png',
      fallbackFill: 'rgba(98, 114, 136, 0.72)',
      fallbackStroke: 'rgba(222, 236, 255, 0.8)',
      labelColor: 'rgba(255, 255, 255, 0.7)',
      anchorX: 0.5,
      anchorY: 0.5,
      scale: 1,
      zLayer: 20,
    },
  },
  terrainAssets: {
    default: {
      tileSrc: 'sprites/terrain/placeholder-tiles.png',
      fallbackStroke: 'rgba(255, 255, 255, 0.45)',
      labelColor: 'rgba(255, 255, 255, 0.8)',
      pattern: 'hatch',
      scale: 1,
      zLayer: 10,
    },
  },
};

for (const type of Object.values(TerrainType)) {
  PLACEHOLDER_MANIFEST.terrainAssets[type] = {
    ...PLACEHOLDER_MANIFEST.terrainAssets.default,
  };
  SPRITE_READY_MANIFEST.terrainAssets[type] = {
    ...SPRITE_READY_MANIFEST.terrainAssets.default,
  };
}

export const defaultAssetManifestLoader = new StaticAssetManifestLoader({
  placeholder: PLACEHOLDER_MANIFEST,
  sprite: SPRITE_READY_MANIFEST,
});

export function createDefaultAssetManifest(mode: RendererAssetMode): AssetManifest {
  return defaultAssetManifestLoader.load(mode);
}

export function getNextRendererAssetMode(mode: RendererAssetMode): RendererAssetMode {
  return mode === 'placeholder' ? 'sprite' : 'placeholder';
}

export function resolveModelAsset(
  manifest: AssetManifest | undefined,
  model: VisualizerModel,
): ModelAssetEntry | undefined {
  if (!manifest) return undefined;
  return (
    manifest.modelAssets[model.label] ??
    manifest.modelAssets[model.id] ??
    manifest.modelAssets.default
  );
}

export function resolveTerrainAsset(
  manifest: AssetManifest | undefined,
  terrainType: TerrainType,
): TerrainAssetEntry | undefined {
  if (!manifest) return undefined;
  return manifest.terrainAssets[terrainType] ?? manifest.terrainAssets.default;
}
