/**
 * Camera System
 * World↔screen coordinate transforms for the battlefield canvas.
 * World coordinates are in inches. Screen coordinates are in CSS pixels.
 */
import type { Position } from '@hh/types';
import type { CameraState } from '../state/types';
export declare function worldToScreen(camera: CameraState, world: Position): {
    x: number;
    y: number;
};
export declare function screenToWorld(camera: CameraState, screen: {
    x: number;
    y: number;
}): Position;
export declare function zoomAtPoint(camera: CameraState, screenX: number, screenY: number, zoomDelta: number): CameraState;
export declare function clampZoom(zoom: number): number;
export declare function fitBattlefield(canvasWidth: number, canvasHeight: number, bfWidth: number, bfHeight: number): CameraState;
//# sourceMappingURL=camera.d.ts.map