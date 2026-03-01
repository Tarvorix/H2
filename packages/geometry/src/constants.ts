/**
 * Geometry Constants
 * Reference: HH_Principles.md — "Measuring", HH_Core.md — "Model"
 *
 * Unit conversions, floating-point tolerances, standard base sizes,
 * and default battlefield dimensions.
 */

// ─── Unit Conversion ─────────────────────────────────────────────────────────

/** Convert millimetres to inches (1mm = 1/25.4 inches) */
export const MM_TO_INCHES = 1 / 25.4;

/** Convert inches to millimetres */
export const INCHES_TO_MM = 25.4;

// ─── Floating-Point Tolerance ────────────────────────────────────────────────

/**
 * Epsilon for floating-point comparison.
 * Two values within EPSILON of each other are treated as equal.
 */
export const EPSILON = 1e-9;

// ─── Standard Base Sizes ─────────────────────────────────────────────────────

/**
 * Standard base sizes used in the game, expressed as diameter in inches.
 * Original sizes are in millimetres (e.g., 25mm, 32mm).
 * Reference: Datasheets specify base size per model definition.
 */

/** 25mm base diameter in inches */
export const BASE_25MM_DIAMETER = 25 * MM_TO_INCHES;
/** 25mm base radius in inches */
export const BASE_25MM_RADIUS = BASE_25MM_DIAMETER / 2;

/** 32mm base diameter in inches */
export const BASE_32MM_DIAMETER = 32 * MM_TO_INCHES;
/** 32mm base radius in inches */
export const BASE_32MM_RADIUS = BASE_32MM_DIAMETER / 2;

/** 40mm base diameter in inches */
export const BASE_40MM_DIAMETER = 40 * MM_TO_INCHES;
/** 40mm base radius in inches */
export const BASE_40MM_RADIUS = BASE_40MM_DIAMETER / 2;

/** 60mm base diameter in inches */
export const BASE_60MM_DIAMETER = 60 * MM_TO_INCHES;
/** 60mm base radius in inches */
export const BASE_60MM_RADIUS = BASE_60MM_DIAMETER / 2;

// ─── Standard Coherency Distances ────────────────────────────────────────────

/** Standard unit coherency distance in inches */
export const STANDARD_COHERENCY_RANGE = 2.0;

/** Skirmish sub-type coherency distance in inches */
export const SKIRMISH_COHERENCY_RANGE = 3.0;

// ─── Enemy Exclusion Zone ────────────────────────────────────────────────────

/** Minimum distance in inches that a model must maintain from enemy models */
export const ENEMY_EXCLUSION_ZONE = 1.0;

// ─── Terrain Constants ───────────────────────────────────────────────────────

/**
 * Medium Area Terrain blocks LOS only if a ray passes through more than
 * this many inches of it (chord length threshold).
 * Reference: HH_Principles.md — "Medium Area Terrain"
 */
export const MEDIUM_TERRAIN_CHORD_THRESHOLD = 3.0;

// ─── Blast Marker Sizes ──────────────────────────────────────────────────────

/** Standard blast marker radius in inches */
export const BLAST_STANDARD_RADIUS = 1.5;

/** Large blast marker radius in inches */
export const BLAST_LARGE_RADIUS = 2.5;

/** Massive blast marker radius in inches */
export const BLAST_MASSIVE_RADIUS = 3.5;

// ─── Template Dimensions ─────────────────────────────────────────────────────

/** Template (teardrop/flamer) length in inches */
export const TEMPLATE_LENGTH = 8.0;

/** Template narrow end width in inches */
export const TEMPLATE_NARROW_WIDTH = 1.0;

/** Template wide end width in inches (approximate physical GW template) */
export const TEMPLATE_WIDE_WIDTH = 4.0;

// ─── Battlefield Defaults ────────────────────────────────────────────────────

/** Default battlefield width in inches (72" = 6') */
export const DEFAULT_BATTLEFIELD_WIDTH = 72;

/** Default battlefield height in inches (48" = 4') */
export const DEFAULT_BATTLEFIELD_HEIGHT = 48;

// ─── Math Constants ──────────────────────────────────────────────────────────

/** Two PI (full circle in radians) */
export const TWO_PI = 2 * Math.PI;

/** Half PI (quarter turn in radians) */
export const HALF_PI = Math.PI / 2;

/** Degrees to radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians to degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;
