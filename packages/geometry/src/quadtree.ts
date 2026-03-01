/**
 * Spatial Index (Quadtree)
 * Reference: Performance optimization for 100+ models on battlefield.
 *
 * A point-region quadtree for efficient spatial queries.
 * Used by the engine for range checks, LOS candidate filtering,
 * nearest-neighbor searches, and area queries.
 */

import type { Position } from '@hh/types';
import { DEFAULT_BATTLEFIELD_WIDTH, DEFAULT_BATTLEFIELD_HEIGHT } from './constants';
import type { AABB } from './shapes';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * An item stored in the quadtree with its bounding box.
 */
interface QuadTreeEntry<T> {
  item: T;
  bounds: AABB;
}

/**
 * A node in the quadtree.
 */
interface QuadNode<T> {
  bounds: AABB;
  entries: QuadTreeEntry<T>[];
  children: QuadNode<T>[] | null;
  depth: number;
}

// ─── QuadTree Class ──────────────────────────────────────────────────────────

/**
 * A spatial index using a quadtree data structure.
 * Provides efficient spatial queries for models on the battlefield.
 *
 * @typeParam T - The type of items stored in the tree
 */
export class QuadTree<T> {
  private root: QuadNode<T>;
  private readonly maxEntriesPerNode: number;
  private readonly maxDepth: number;
  private _size: number = 0;

  /**
   * Create a new quadtree.
   *
   * @param bounds - The root bounds (typically the full battlefield)
   * @param maxEntriesPerNode - Maximum entries before a node subdivides (default 8)
   * @param maxDepth - Maximum tree depth (default 8)
   */
  constructor(
    bounds: AABB = { x: 0, y: 0, width: DEFAULT_BATTLEFIELD_WIDTH, height: DEFAULT_BATTLEFIELD_HEIGHT },
    maxEntriesPerNode: number = 8,
    maxDepth: number = 8,
  ) {
    this.maxEntriesPerNode = maxEntriesPerNode;
    this.maxDepth = maxDepth;
    this.root = createNode(bounds, 0);
  }

  /** Number of items in the tree */
  get size(): number {
    return this._size;
  }

  /**
   * Insert an item with its bounding box into the tree.
   *
   * @param item - The item to insert
   * @param bounds - The item's axis-aligned bounding box
   */
  insert(item: T, bounds: AABB): void {
    this.insertIntoNode(this.root, { item, bounds });
    this._size++;
  }

  /**
   * Remove an item from the tree.
   * Uses reference equality (===) to find the item.
   *
   * @param item - The item to remove
   * @returns True if the item was found and removed
   */
  remove(item: T): boolean {
    const removed = this.removeFromNode(this.root, item);
    if (removed) {
      this._size--;
    }
    return removed;
  }

  /**
   * Query all items whose bounding boxes overlap the given region.
   *
   * @param bounds - The query region
   * @returns Array of items overlapping the region
   */
  query(bounds: AABB): T[] {
    const results = new Set<T>();
    this.queryNode(this.root, bounds, results);
    return Array.from(results);
  }

  /**
   * Query all items within a given radius of a point.
   * First performs a coarse AABB query, then the caller can refine
   * with exact distance checks.
   *
   * @param center - Center of the query circle
   * @param radius - Radius of the query circle
   * @returns Array of items whose bounds overlap the query circle's AABB
   */
  queryRadius(center: Position, radius: number): T[] {
    const queryBounds: AABB = {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    return this.query(queryBounds);
  }

  /**
   * Remove all items from the tree.
   */
  clear(): void {
    this.root = createNode(this.root.bounds, 0);
    this._size = 0;
  }

  /**
   * Get all items in the tree.
   *
   * @returns Array of all stored items
   */
  all(): T[] {
    const results: T[] = [];
    this.collectAll(this.root, results);
    return results;
  }

  // ─── Private Methods ─────────────────────────────────────────────────

  private insertIntoNode(node: QuadNode<T>, entry: QuadTreeEntry<T>): void {
    if (node.children !== null) {
      // Non-leaf: insert into overlapping children
      for (const child of node.children) {
        if (aabbOverlaps(child.bounds, entry.bounds)) {
          this.insertIntoNode(child, entry);
        }
      }
      return;
    }

    // Leaf node: add entry
    node.entries.push(entry);

    // Subdivide if over capacity and not at max depth
    if (node.entries.length > this.maxEntriesPerNode && node.depth < this.maxDepth) {
      this.subdivide(node);
    }
  }

  private subdivide(node: QuadNode<T>): void {
    const { x, y, width, height } = node.bounds;
    const halfW = width / 2;
    const halfH = height / 2;

    node.children = [
      createNode({ x, y, width: halfW, height: halfH }, node.depth + 1),                          // NW
      createNode({ x: x + halfW, y, width: halfW, height: halfH }, node.depth + 1),               // NE
      createNode({ x, y: y + halfH, width: halfW, height: halfH }, node.depth + 1),               // SW
      createNode({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, node.depth + 1),    // SE
    ];

    // Re-insert existing entries into children
    const entries = node.entries;
    node.entries = [];
    for (const entry of entries) {
      for (const child of node.children) {
        if (aabbOverlaps(child.bounds, entry.bounds)) {
          this.insertIntoNode(child, entry);
        }
      }
    }
  }

  private removeFromNode(node: QuadNode<T>, item: T): boolean {
    if (node.children !== null) {
      for (const child of node.children) {
        if (this.removeFromNode(child, item)) {
          return true;
        }
      }
      return false;
    }

    const idx = node.entries.findIndex(e => e.item === item);
    if (idx >= 0) {
      node.entries.splice(idx, 1);
      return true;
    }
    return false;
  }

  private queryNode(node: QuadNode<T>, bounds: AABB, results: Set<T>): void {
    if (!aabbOverlaps(node.bounds, bounds)) {
      return;
    }

    if (node.children !== null) {
      for (const child of node.children) {
        this.queryNode(child, bounds, results);
      }
      return;
    }

    for (const entry of node.entries) {
      if (aabbOverlaps(entry.bounds, bounds)) {
        results.add(entry.item);
      }
    }
  }

  private collectAll(node: QuadNode<T>, results: T[]): void {
    if (node.children !== null) {
      for (const child of node.children) {
        this.collectAll(child, results);
      }
      return;
    }

    for (const entry of node.entries) {
      if (!results.includes(entry.item)) {
        results.push(entry.item);
      }
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function createNode<T>(bounds: AABB, depth: number): QuadNode<T> {
  return {
    bounds,
    entries: [],
    children: null,
    depth,
  };
}

function aabbOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
