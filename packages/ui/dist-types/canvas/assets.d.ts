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
export declare class StaticAssetManifestLoader implements AssetManifestLoader {
    private readonly manifests;
    constructor(manifests: Record<RendererAssetMode, AssetManifest>);
    load(mode: RendererAssetMode): AssetManifest;
}
export declare const defaultAssetManifestLoader: StaticAssetManifestLoader;
export declare function createDefaultAssetManifest(mode: RendererAssetMode): AssetManifest;
export declare function getNextRendererAssetMode(mode: RendererAssetMode): RendererAssetMode;
export declare function resolveModelAsset(manifest: AssetManifest | undefined, model: VisualizerModel): ModelAssetEntry | undefined;
export declare function resolveTerrainAsset(manifest: AssetManifest | undefined, terrainType: TerrainType): TerrainAssetEntry | undefined;
//# sourceMappingURL=assets.d.ts.map