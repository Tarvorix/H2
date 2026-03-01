/**
 * Unit Coherency Checking
 * Reference: HH_Principles.md — "Unit Coherency"
 *
 * All models in a unit must be within a coherency distance (base-to-base)
 * of at least one other model in the unit, and all models must form a single
 * contiguous group (graph connectivity). This is checked by building an
 * adjacency graph where models are nodes and edges connect models within
 * coherency range, then performing a BFS to verify a single connected component.
 *
 * Standard coherency distance: 2" (base-to-base)
 * Skirmish sub-type coherency distance: 3" (base-to-base)
 */

import type { ModelShape } from './shapes';
import { STANDARD_COHERENCY_RANGE, SKIRMISH_COHERENCY_RANGE, EPSILON } from './constants';
import { distanceShapes } from './distance';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Result of a unit coherency check.
 *
 * - isCoherent: true if all models form a single connected group within range
 * - coherentModelIndices: indices of models in the main connected component
 * - incoherentModelIndices: indices of models NOT in the main connected component
 * - links: pairs of model indices that are within coherency range of each other
 */
export interface CoherencyResult {
  /** Whether the entire unit is coherent (single connected component) */
  readonly isCoherent: boolean;
  /** Indices of models in the main (largest starting from 0) connected component */
  readonly coherentModelIndices: number[];
  /** Indices of models not connected to the main component */
  readonly incoherentModelIndices: number[];
  /** All adjacency pairs — each [i, j] means model i and j are within coherency range */
  readonly links: [number, number][];
}

// ─── Coherency Check ─────────────────────────────────────────────────────────

/**
 * Check whether all models in a unit satisfy coherency requirements.
 *
 * Algorithm:
 * 1. Build an adjacency list: model i is adjacent to model j if the
 *    base-to-base distance (distanceShapes) is within coherencyRange.
 * 2. Perform BFS starting from model 0 to find all reachable models.
 * 3. If every model is reachable from model 0, the unit is coherent.
 * 4. Return the adjacency links and the coherent/incoherent model indices.
 *
 * Edge cases:
 * - A unit with 0 models is trivially coherent (empty unit).
 * - A unit with 1 model is trivially coherent (no adjacency required).
 *
 * Reference: HH_Principles.md — "Unit Coherency"
 *
 * @param models - Array of model shapes representing the unit's models
 * @param coherencyRange - Maximum base-to-base distance for coherency (in inches)
 * @returns CoherencyResult with connectivity information
 */
export function checkCoherency(models: ModelShape[], coherencyRange: number): CoherencyResult {
  const n = models.length;

  // Trivial cases: 0 or 1 model is always coherent
  if (n === 0) {
    return {
      isCoherent: true,
      coherentModelIndices: [],
      incoherentModelIndices: [],
      links: [],
    };
  }

  if (n === 1) {
    return {
      isCoherent: true,
      coherentModelIndices: [0],
      incoherentModelIndices: [],
      links: [],
    };
  }

  // Step 1: Build adjacency list and collect all links
  const adjacency: number[][] = [];
  for (let i = 0; i < n; i++) {
    adjacency.push([]);
  }

  const links: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = distanceShapes(models[i], models[j]);
      if (dist <= coherencyRange + EPSILON) {
        adjacency[i].push(j);
        adjacency[j].push(i);
        links.push([i, j]);
      }
    }
  }

  // Step 2: BFS from model 0 to find the connected component
  const visited = new Set<number>();
  const queue: number[] = [0];
  visited.add(0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Step 3: Classify models as coherent or incoherent
  const coherentModelIndices: number[] = [];
  const incoherentModelIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) {
      coherentModelIndices.push(i);
    } else {
      incoherentModelIndices.push(i);
    }
  }

  // Step 4: Build result
  const isCoherent = incoherentModelIndices.length === 0;

  return {
    isCoherent,
    coherentModelIndices,
    incoherentModelIndices,
    links,
  };
}

// ─── Convenience Function ────────────────────────────────────────────────────

/**
 * Quick boolean check for whether a unit is coherent.
 *
 * Uses the standard coherency range (2") by default, or the skirmish
 * coherency range (3") if the unit has the Skirmish sub-type.
 *
 * Reference: HH_Principles.md — "Unit Coherency"
 * "All models in a unit must be within 2" of at least one other model."
 * "Skirmish sub-type uses 3" instead of 2"."
 *
 * @param models - Array of model shapes representing the unit's models
 * @param isSkirmish - If true, use 3" skirmish coherency range instead of 2"
 * @returns True if the unit is coherent (all models in one connected group)
 */
export function isUnitCoherent(models: ModelShape[], isSkirmish?: boolean): boolean {
  const range = isSkirmish ? SKIRMISH_COHERENCY_RANGE : STANDARD_COHERENCY_RANGE;
  return checkCoherency(models, range).isCoherent;
}
