import { describe, it, expect } from 'vitest';
import { QuadTree } from './quadtree';

// ─── Basic Operations ────────────────────────────────────────────────────────

describe('QuadTree', () => {
  it('starts empty', () => {
    const tree = new QuadTree<string>();
    expect(tree.size).toBe(0);
    expect(tree.all()).toHaveLength(0);
  });

  it('inserts and retrieves items', () => {
    const tree = new QuadTree<string>();
    tree.insert('model-1', { x: 10, y: 10, width: 1, height: 1 });
    tree.insert('model-2', { x: 30, y: 20, width: 1, height: 1 });
    expect(tree.size).toBe(2);
    expect(tree.all()).toHaveLength(2);
  });

  it('removes items', () => {
    const tree = new QuadTree<string>();
    tree.insert('model-1', { x: 10, y: 10, width: 1, height: 1 });
    tree.insert('model-2', { x: 30, y: 20, width: 1, height: 1 });
    expect(tree.remove('model-1')).toBe(true);
    expect(tree.size).toBe(1);
    expect(tree.remove('model-1')).toBe(false); // Already removed
  });

  it('clears all items', () => {
    const tree = new QuadTree<string>();
    tree.insert('a', { x: 1, y: 1, width: 1, height: 1 });
    tree.insert('b', { x: 2, y: 2, width: 1, height: 1 });
    tree.clear();
    expect(tree.size).toBe(0);
    expect(tree.all()).toHaveLength(0);
  });
});

// ─── Query ───────────────────────────────────────────────────────────────────

describe('QuadTree.query', () => {
  it('returns items within query bounds', () => {
    const tree = new QuadTree<string>();
    tree.insert('inside', { x: 5, y: 5, width: 1, height: 1 });
    tree.insert('outside', { x: 50, y: 50, width: 1, height: 1 });

    const results = tree.query({ x: 0, y: 0, width: 10, height: 10 });
    expect(results).toContain('inside');
    expect(results).not.toContain('outside');
  });

  it('returns items that overlap query bounds', () => {
    const tree = new QuadTree<string>();
    tree.insert('overlap', { x: 9, y: 9, width: 2, height: 2 });

    const results = tree.query({ x: 0, y: 0, width: 10, height: 10 });
    expect(results).toContain('overlap');
  });

  it('empty query region returns no results', () => {
    const tree = new QuadTree<string>();
    tree.insert('item', { x: 50, y: 50, width: 1, height: 1 });

    const results = tree.query({ x: 0, y: 0, width: 1, height: 1 });
    expect(results).toHaveLength(0);
  });

  it('query entire battlefield returns all items', () => {
    const tree = new QuadTree<string>();
    tree.insert('a', { x: 5, y: 5, width: 1, height: 1 });
    tree.insert('b', { x: 60, y: 40, width: 1, height: 1 });

    const results = tree.query({ x: 0, y: 0, width: 72, height: 48 });
    expect(results).toHaveLength(2);
  });
});

describe('QuadTree.queryRadius', () => {
  it('returns items within radius', () => {
    const tree = new QuadTree<string>();
    tree.insert('near', { x: 10, y: 10, width: 1, height: 1 });
    tree.insert('far', { x: 50, y: 50, width: 1, height: 1 });

    const results = tree.queryRadius({ x: 10, y: 10 }, 5);
    expect(results).toContain('near');
    expect(results).not.toContain('far');
  });
});

// ─── Subdivision ─────────────────────────────────────────────────────────────

describe('QuadTree subdivision', () => {
  it('handles many items (forces subdivision)', () => {
    const tree = new QuadTree<number>(
      { x: 0, y: 0, width: 72, height: 48 },
      4, // low threshold to force subdivision
    );

    for (let i = 0; i < 20; i++) {
      tree.insert(i, { x: i * 3, y: i * 2, width: 1, height: 1 });
    }

    expect(tree.size).toBe(20);
    expect(tree.all()).toHaveLength(20);
  });

  it('query after subdivision returns correct results', () => {
    const tree = new QuadTree<number>(
      { x: 0, y: 0, width: 72, height: 48 },
      4,
    );

    // Insert 20 items spread across the battlefield
    for (let i = 0; i < 20; i++) {
      tree.insert(i, { x: i * 3.5, y: 10, width: 1, height: 1 });
    }

    // Query a small region that should contain only a few items
    const results = tree.query({ x: 0, y: 0, width: 10, height: 48 });
    // Items at x=0, 3.5, 7 should be found (indices 0, 1, 2)
    expect(results).toContain(0);
    expect(results).toContain(1);
    expect(results).toContain(2);
    // Item at x=10.5 should NOT be found
    expect(results).not.toContain(3);
  });
});

// ─── Performance ─────────────────────────────────────────────────────────────

describe('QuadTree performance', () => {
  it('handles 200 items and queries quickly', () => {
    const tree = new QuadTree<number>();

    const start = performance.now();

    // Insert 200 items
    for (let i = 0; i < 200; i++) {
      tree.insert(i, {
        x: Math.random() * 72,
        y: Math.random() * 48,
        width: 1,
        height: 1,
      });
    }

    // Run 100 queries
    for (let i = 0; i < 100; i++) {
      tree.query({
        x: Math.random() * 60,
        y: Math.random() * 36,
        width: 12,
        height: 12,
      });
    }

    const elapsed = performance.now() - start;
    // Should complete in well under 100ms
    expect(elapsed).toBeLessThan(100);
    expect(tree.size).toBe(200);
  });
});
