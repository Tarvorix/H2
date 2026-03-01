/**
 * Color Constants for the Debug Visualizer
 * Centralized definitions for all rendering colors.
 */

// ─── Player Colors ────────────────────────────────────────────────────────────

export const PLAYER_1_FILL = '#2563eb';
export const PLAYER_1_STROKE = '#1d4ed8';
export const PLAYER_1_FILL_ALPHA = 'rgba(37, 99, 235, 0.7)';

export const PLAYER_2_FILL = '#dc2626';
export const PLAYER_2_STROKE = '#b91c1c';
export const PLAYER_2_FILL_ALPHA = 'rgba(220, 38, 38, 0.7)';

// ─── Terrain Fill Colors ──────────────────────────────────────────────────────

export const TERRAIN_LIGHT_AREA = 'rgba(34, 139, 34, 0.25)';
export const TERRAIN_MEDIUM_AREA = 'rgba(204, 170, 0, 0.4)';
export const TERRAIN_HEAVY_AREA = 'rgba(180, 40, 40, 0.5)';
export const TERRAIN_TERRAIN_PIECE = 'rgba(40, 40, 40, 0.7)';
export const TERRAIN_IMPASSABLE = 'rgba(80, 0, 80, 0.6)';
export const TERRAIN_DANGEROUS = 'rgba(255, 140, 0, 0.35)';
export const TERRAIN_DIFFICULT = 'rgba(139, 119, 42, 0.3)';

export const TERRAIN_STROKE = 'rgba(255, 255, 255, 0.4)';
export const TERRAIN_LABEL = 'rgba(255, 255, 255, 0.7)';

// ─── LOS Overlay ──────────────────────────────────────────────────────────────

export const LOS_RAY_CLEAR = '#22c55e';
export const LOS_RAY_BLOCKED = '#ef4444';
export const LOS_ENTER_POINT = '#eab308';
export const LOS_EXIT_POINT = '#f97316';
export const LOS_TEXT_YES = '#22c55e';
export const LOS_TEXT_NO = '#ef4444';

// ─── Coherency Overlay ───────────────────────────────────────────────────────

export const COHERENCY_OK = '#22c55e';
export const COHERENCY_FAIL = '#ef4444';
export const COHERENCY_LINK = 'rgba(34, 197, 94, 0.3)';

// ─── Movement Envelope ───────────────────────────────────────────────────────

export const MOVEMENT_FILL = 'rgba(59, 130, 246, 0.15)';
export const MOVEMENT_STROKE = '#3b82f6';
export const MOVEMENT_DIFFICULT = 'rgba(234, 179, 8, 0.3)';
export const MOVEMENT_DANGEROUS = 'rgba(249, 115, 22, 0.3)';
export const MOVEMENT_IMPASSABLE = 'rgba(127, 29, 29, 0.5)';
export const MOVEMENT_EXCLUSION = 'rgba(239, 68, 68, 0.25)';

// ─── Blast / Template ─────────────────────────────────────────────────────────

export const BLAST_FILL = 'rgba(251, 146, 60, 0.3)';
export const BLAST_STROKE = '#f97316';
export const BLAST_HIT_HIGHLIGHT = '#fbbf24';
export const TEMPLATE_FILL = 'rgba(251, 146, 60, 0.25)';
export const TEMPLATE_STROKE = '#fb923c';

// ─── Vehicle Facing ───────────────────────────────────────────────────────────

export const FACING_FRONT = 'rgba(34, 197, 94, 0.15)';
export const FACING_SIDE = 'rgba(234, 179, 8, 0.15)';
export const FACING_REAR = 'rgba(239, 68, 68, 0.15)';
export const FACING_BOUNDARY = 'rgba(255, 255, 255, 0.5)';

// ─── Selection / Hover ────────────────────────────────────────────────────────

export const SELECTION_STROKE = '#fbbf24';
export const HOVER_STROKE = '#a3a3a3';

// ─── Grid ─────────────────────────────────────────────────────────────────────

export const GRID_MINOR = 'rgba(255, 255, 255, 0.08)';
export const GRID_MAJOR = 'rgba(255, 255, 255, 0.2)';
export const GRID_FOOT = 'rgba(255, 255, 255, 0.35)';

// ─── Backgrounds ──────────────────────────────────────────────────────────────

export const BATTLEFIELD_BG = '#1a1a2e';
export const PANEL_BG = '#0f0f23';
export const TOOLBAR_BG = '#16213e';
export const APP_BG = '#0a0a1a';

// ─── Distance Readout ─────────────────────────────────────────────────────────

export const DISTANCE_LINE = '#60a5fa';
export const DISTANCE_LABEL_BG = 'rgba(0, 0, 0, 0.8)';
export const DISTANCE_LABEL_TEXT = '#e0e0e0';

// ─── HUD ──────────────────────────────────────────────────────────────────────

export const HUD_TEXT = 'rgba(255, 255, 255, 0.6)';
export const HUD_BG = 'rgba(0, 0, 0, 0.5)';
