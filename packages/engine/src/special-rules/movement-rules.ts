/**
 * Movement Special Rules Implementations
 * Reference: HH_Armoury.md — movement-related special rules
 *
 * Each rule is implemented as a MovementRuleHandler and registered
 * with the rule registry.
 */

import { registerMovementRule } from './rule-registry';
import type { MovementRuleHandler } from './rule-registry';

// ─── Deep Strike ─────────────────────────────────────────────────────────────

/**
 * Deep Strike: Unit enters play anywhere on the battlefield (not within 1"
 * of enemies, board edges, or impassable terrain). Must maintain coherency.
 * Cannot move or charge on the turn it arrives. Can shoot.
 * Only one unit per turn may Deep Strike. Not on turn 1.
 *
 * Reference: HH_Armoury.md — "Deep Strike"
 */
const deepStrikeHandler: MovementRuleHandler = (_context, _value) => {
  return {
    allowsDeepStrike: true,
  };
};

// ─── Outflank ────────────────────────────────────────────────────────────────

/**
 * Outflank: Enter from any battlefield edge (not opposing deployment zone
 * edge, 7"+ from enemies). Cannot charge same turn.
 *
 * Reference: HH_Armoury.md — "Outflank"
 */
const outflankHandler: MovementRuleHandler = (_context, _value) => {
  return {
    allowsOutflank: true,
  };
};

// ─── Infiltrate ──────────────────────────────────────────────────────────────

/**
 * Infiltrate (X): Deploy X" from enemies, outside deployment zone.
 * The X value indicates the minimum distance from enemy models.
 *
 * Reference: HH_Armoury.md — "Infiltrate"
 */
const infiltrateHandler: MovementRuleHandler = (_context, _value) => {
  // Infiltrate affects deployment, not movement. Returns empty result for movement phase.
  return {};
};

// ─── Scout ───────────────────────────────────────────────────────────────────

/**
 * Scout: Pre-game move before the first turn.
 * Models can make a normal move before the game begins.
 *
 * Reference: HH_Armoury.md — "Scout"
 */
const scoutHandler: MovementRuleHandler = (_context, _value) => {
  // Scout affects pre-game setup, not in-game movement. Returns empty for movement phase.
  return {};
};

// ─── Fleet ───────────────────────────────────────────────────────────────────

/**
 * Fleet: Re-roll the Rush distance (M + I, can re-roll the I portion).
 *
 * Reference: HH_Armoury.md — "Fleet"
 */
const fleetHandler: MovementRuleHandler = (_context, _value) => {
  return {
    canRerollRush: true,
  };
};

// ─── Fast (X) ────────────────────────────────────────────────────────────────

/**
 * Fast (X): +X" to Rush and Charge moves.
 *
 * Reference: HH_Armoury.md — "Fast"
 */
const fastHandler: MovementRuleHandler = (_context, value) => {
  const bonus = typeof value === 'number' ? value : parseInt(String(value ?? '0'), 10);
  return {
    movementBonus: isNaN(bonus) ? 0 : bonus,
  };
};

// ─── Move Through Cover ──────────────────────────────────────────────────────

/**
 * Move Through Cover: Ignore Difficult and Dangerous terrain penalties
 * during movement. Still cannot enter Impassable terrain.
 *
 * Reference: HH_Armoury.md — "Move Through Cover"
 */
const moveThroughCoverHandler: MovementRuleHandler = (_context, _value) => {
  return {
    ignoresDifficultTerrain: true,
    ignoresDangerousTerrain: true,
  };
};

// ─── Implacable Advance ──────────────────────────────────────────────────────

/**
 * Implacable Advance: After making a normal move (not Rush), the unit
 * counts as Stationary for the purposes of shooting Heavy weapons, etc.
 *
 * Reference: HH_Armoury.md — "Implacable Advance"
 */
const implacableAdvanceHandler: MovementRuleHandler = (_context, _value) => {
  return {
    countsAsStationary: true,
  };
};

// ─── Antigrav ────────────────────────────────────────────────────────────────

/**
 * Antigrav: Ignore all terrain during movement (not start/end in impassable).
 * Effectively ignores difficult and dangerous terrain penalties.
 *
 * Reference: HH_Armoury.md — "Antigrav" (Jetbikes, skimmers)
 */
const antigravHandler: MovementRuleHandler = (_context, _value) => {
  return {
    ignoresDifficultTerrain: true,
    ignoresDangerousTerrain: true,
  };
};

// ─── Assault Vehicle ─────────────────────────────────────────────────────────

/**
 * Assault Vehicle: Units disembarking from this transport can charge
 * without being considered Disordered.
 *
 * Reference: HH_Armoury.md — "Assault Vehicle"
 */
const assaultVehicleHandler: MovementRuleHandler = (_context, _value) => {
  return {
    canChargeAfterDisembark: true,
  };
};

// ─── Bulky (X) ───────────────────────────────────────────────────────────────

/**
 * Bulky (X): Uses X transport capacity slots instead of 1.
 *
 * Reference: HH_Armoury.md — "Bulky"
 */
const bulkyHandler: MovementRuleHandler = (_context, value) => {
  const bulkyVal = typeof value === 'number' ? value : parseInt(String(value ?? '2'), 10);
  return {
    bulkyValue: isNaN(bulkyVal) ? 2 : bulkyVal,
  };
};

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register all movement special rules with the registry.
 * Call this once at engine initialization.
 */
export function registerAllMovementRules(): void {
  registerMovementRule('Deep Strike', deepStrikeHandler);
  registerMovementRule('Outflank', outflankHandler);
  registerMovementRule('Infiltrate', infiltrateHandler);
  registerMovementRule('Scout', scoutHandler);
  registerMovementRule('Fleet', fleetHandler);
  registerMovementRule('Fast', fastHandler);
  registerMovementRule('Move Through Cover', moveThroughCoverHandler);
  registerMovementRule('Implacable Advance', implacableAdvanceHandler);
  registerMovementRule('Antigrav', antigravHandler);
  registerMovementRule('Assault Vehicle', assaultVehicleHandler);
  registerMovementRule('Bulky', bulkyHandler);
}
