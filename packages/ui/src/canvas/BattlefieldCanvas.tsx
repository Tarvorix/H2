/**
 * BattlefieldCanvas
 * React component wrapping the HTML5 <canvas>.
 * Handles: requestAnimationFrame render loop, mouse events,
 * resize / HiDPI, and dispatches actions to the reducer.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { DebugVisualizerState, DebugVisualizerAction } from '../state/types';
import { renderFrame } from './renderer';
import type { RenderFrameOptions } from './renderer';
import { fitBattlefield } from './camera';

interface BattlefieldCanvasProps {
  state: DebugVisualizerState;
  dispatch: React.Dispatch<DebugVisualizerAction>;
  renderOptions?: RenderFrameOptions;
}

export function BattlefieldCanvas({ state, dispatch, renderOptions }: BattlefieldCanvasProps) {
  const TAP_DRAG_THRESHOLD_PX = 8;
  const LONG_PRESS_MS = 450;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitializedCameraRef = useRef(false);
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const stateRef = useRef(state);
  const renderOptionsRef = useRef(renderOptions);
  stateRef.current = state;
  renderOptionsRef.current = renderOptions;
  const touchStateRef = useRef<{
    mode: 'idle' | 'pendingTap' | 'panning' | 'pinching';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pinchDistance: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  }>({
    mode: 'idle',
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pinchDistance: 0,
    longPressTimer: null,
  });

  const clearLongPressTimer = useCallback(() => {
    if (touchStateRef.current.longPressTimer) {
      clearTimeout(touchStateRef.current.longPressTimer);
      touchStateRef.current.longPressTimer = null;
    }
  }, []);

  // ── Resize handling ─────────────────────────────────────────────────────────
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const measuredWidth = rect.width > 0 ? rect.width : container.clientWidth;
    const measuredHeight = rect.height > 0 ? rect.height : container.clientHeight;
    if (measuredWidth <= 0 || measuredHeight <= 0) return;

    const cssWidth = measuredWidth;
    const cssHeight = measuredHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const previousViewport = viewportSizeRef.current;

    if (!hasInitializedCameraRef.current) {
      const fittedCamera = fitBattlefield(
        cssWidth,
        cssHeight,
        stateRef.current.battlefieldWidth,
        stateRef.current.battlefieldHeight,
      );
      dispatch({ type: 'SET_CAMERA', camera: fittedCamera });
      hasInitializedCameraRef.current = true;
      viewportSizeRef.current = { width: cssWidth, height: cssHeight };
      return;
    }

    if (previousViewport) {
      const viewportChanged = Math.abs(previousViewport.width - cssWidth) > 0.5
        || Math.abs(previousViewport.height - cssHeight) > 0.5;

      if (viewportChanged) {
        const camera = stateRef.current.camera;
        const hasValidCamera = Number.isFinite(camera.zoom)
          && camera.zoom > 0
          && Number.isFinite(camera.offsetX)
          && Number.isFinite(camera.offsetY);

        if (!hasValidCamera) {
          const fittedCamera = fitBattlefield(
            cssWidth,
            cssHeight,
            stateRef.current.battlefieldWidth,
            stateRef.current.battlefieldHeight,
          );
          dispatch({ type: 'SET_CAMERA', camera: fittedCamera });
          viewportSizeRef.current = { width: cssWidth, height: cssHeight };
          return;
        }

        const centerWorldX = (previousViewport.width * 0.5 - camera.offsetX) / camera.zoom;
        const centerWorldY = (previousViewport.height * 0.5 - camera.offsetY) / camera.zoom;

        dispatch({
          type: 'SET_CAMERA',
          camera: {
            offsetX: cssWidth * 0.5 - centerWorldX * camera.zoom,
            offsetY: cssHeight * 0.5 - centerWorldY * camera.zoom,
          },
        });
      }
    }

    viewportSizeRef.current = { width: cssWidth, height: cssHeight };
  }, [dispatch]);

  // ── Animation frame loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId: number;

    function loop() {
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas!.width / dpr;
      const cssHeight = canvas!.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      renderFrame(
        ctx,
        stateRef.current,
        cssWidth,
        cssHeight,
        renderOptionsRef.current,
      );
      ctx.restore();

      animationId = requestAnimationFrame(loop);
    }

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateCanvasSize();

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateCanvasSize]);

  // Re-fit if battlefield dimensions change (scenario swap, mission setup differences).
  useEffect(() => {
    hasInitializedCameraRef.current = false;
    viewportSizeRef.current = null;
    updateCanvasSize();
  }, [state.battlefieldWidth, state.battlefieldHeight, updateCanvasSize]);

  // ── Mouse event helpers ─────────────────────────────────────────────────────
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const getTouchCoords = useCallback((touch: React.Touch): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { x, y } = getCanvasCoords(e);
      dispatch({ type: 'MOUSE_DOWN', screenX: x, screenY: y, button: e.button });
    },
    [dispatch, getCanvasCoords],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      dispatch({ type: 'MOUSE_MOVE', screenX: x, screenY: y });
    },
    [dispatch, getCanvasCoords],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e);
      dispatch({ type: 'MOUSE_UP', screenX: x, screenY: y, button: e.button });
    },
    [dispatch, getCanvasCoords],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      const { x, y } = getCanvasCoords(e as unknown as React.MouseEvent<HTMLCanvasElement>);
      dispatch({ type: 'ZOOM_AT', screenX: x, screenY: y, delta: e.deltaY });
    },
    [dispatch, getCanvasCoords],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  // ── Touch handlers (tap select, drag pan, pinch zoom, long-press pan) ─────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const touches = e.touches;
      if (touches.length === 0) return;

      clearLongPressTimer();

      if (touches.length >= 2) {
        const a = getTouchCoords(touches[0]);
        const b = getTouchCoords(touches[1]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;

        touchStateRef.current.mode = 'pinching';
        touchStateRef.current.pinchDistance = Math.hypot(dx, dy);
        touchStateRef.current.lastX = (a.x + b.x) / 2;
        touchStateRef.current.lastY = (a.y + b.y) / 2;
        return;
      }

      const point = getTouchCoords(touches[0]);
      touchStateRef.current.mode = 'pendingTap';
      touchStateRef.current.startX = point.x;
      touchStateRef.current.startY = point.y;
      touchStateRef.current.lastX = point.x;
      touchStateRef.current.lastY = point.y;
      touchStateRef.current.longPressTimer = setTimeout(() => {
        if (touchStateRef.current.mode === 'pendingTap') {
          dispatch({ type: 'PAN_START', screenX: point.x, screenY: point.y });
          touchStateRef.current.mode = 'panning';
        }
      }, LONG_PRESS_MS);
    },
    [dispatch, getTouchCoords, clearLongPressTimer, LONG_PRESS_MS],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const touches = e.touches;
      if (touches.length === 0) return;

      if (touches.length >= 2) {
        clearLongPressTimer();

        const a = getTouchCoords(touches[0]);
        const b = getTouchCoords(touches[1]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const centerX = (a.x + b.x) / 2;
        const centerY = (a.y + b.y) / 2;

        if (touchStateRef.current.mode !== 'pinching') {
          touchStateRef.current.mode = 'pinching';
          touchStateRef.current.pinchDistance = distance;
        } else {
          const distanceDelta = distance - touchStateRef.current.pinchDistance;
          if (Math.abs(distanceDelta) > 0.5) {
            // Positive pinch delta means fingers moved apart -> zoom in (negative wheel delta).
            dispatch({
              type: 'ZOOM_AT',
              screenX: centerX,
              screenY: centerY,
              delta: -distanceDelta,
            });
            touchStateRef.current.pinchDistance = distance;
          }
        }

        touchStateRef.current.lastX = centerX;
        touchStateRef.current.lastY = centerY;
        return;
      }

      const point = getTouchCoords(touches[0]);
      const dx = point.x - touchStateRef.current.startX;
      const dy = point.y - touchStateRef.current.startY;
      const movedDistance = Math.hypot(dx, dy);

      if (touchStateRef.current.mode === 'pendingTap' && movedDistance > TAP_DRAG_THRESHOLD_PX) {
        clearLongPressTimer();
        dispatch({
          type: 'PAN_START',
          screenX: touchStateRef.current.startX,
          screenY: touchStateRef.current.startY,
        });
        touchStateRef.current.mode = 'panning';
      }

      if (touchStateRef.current.mode === 'panning') {
        dispatch({ type: 'MOUSE_MOVE', screenX: point.x, screenY: point.y });
      }

      touchStateRef.current.lastX = point.x;
      touchStateRef.current.lastY = point.y;
    },
    [dispatch, getTouchCoords, clearLongPressTimer, TAP_DRAG_THRESHOLD_PX],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      clearLongPressTimer();

      const touches = e.touches;
      if (touches.length > 0) {
        // Continue interaction with remaining touch point.
        if (touches.length === 1 && touchStateRef.current.mode === 'pinching') {
          const point = getTouchCoords(touches[0]);
          touchStateRef.current.mode = 'pendingTap';
          touchStateRef.current.startX = point.x;
          touchStateRef.current.startY = point.y;
          touchStateRef.current.lastX = point.x;
          touchStateRef.current.lastY = point.y;
        }
        return;
      }

      if (touchStateRef.current.mode === 'pendingTap') {
        const x = touchStateRef.current.lastX;
        const y = touchStateRef.current.lastY;
        dispatch({ type: 'MOUSE_DOWN', screenX: x, screenY: y, button: 0 });
        dispatch({ type: 'MOUSE_UP', screenX: x, screenY: y, button: 0 });
      } else if (touchStateRef.current.mode === 'panning') {
        dispatch({ type: 'PAN_END' });
      }

      touchStateRef.current.mode = 'idle';
      touchStateRef.current.pinchDistance = 0;
    },
    [dispatch, getTouchCoords, clearLongPressTimer],
  );

  const handleTouchCancel = useCallback(
    (_e: React.TouchEvent<HTMLCanvasElement>) => {
      clearLongPressTimer();
      if (touchStateRef.current.mode === 'panning') {
        dispatch({ type: 'PAN_END' });
      }
      touchStateRef.current.mode = 'idle';
      touchStateRef.current.pinchDistance = 0;
    },
    [dispatch, clearLongPressTimer],
  );

  // ── Prevent default wheel behavior (passive event workaround) ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const preventWheel = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener('wheel', preventWheel, { passive: false });
    return () => {
      clearLongPressTimer();
      canvas.removeEventListener('wheel', preventWheel);
    };
  }, [clearLongPressTimer]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: state.isPanning
          ? 'grabbing'
          : state.isDragging
            ? 'move'
            : state.mode === 'terrainEdit'
              ? 'crosshair'
              : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseLeave={() => {
          // End any ongoing interactions when mouse leaves
          if (state.isPanning) {
            dispatch({ type: 'PAN_END' });
          }
          if (state.isDragging) {
            dispatch({ type: 'END_DRAG' });
          }
        }}
        style={{
          display: 'block',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
