/**
 * Dice Providers
 * Reference: HH_Core.md — all tests use d6 (1-6)
 *
 * RandomDiceProvider: production use (true random d6)
 * FixedDiceProvider: deterministic testing (fixed sequence)
 */

import type { DiceProvider } from './types';

// ─── Random Dice Provider ────────────────────────────────────────────────────

/**
 * Production dice provider using Math.random().
 * Each roll returns 1-6 uniformly.
 */
export class RandomDiceProvider implements DiceProvider {
  rollD6(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  rollMultipleD6(count: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollD6());
    }
    return results;
  }

  roll2D6(): [number, number] {
    return [this.rollD6(), this.rollD6()];
  }

  rollD3(): number {
    return Math.ceil(this.rollD6() / 2);
  }

  rollScatter(): { direction: number; distance: number } {
    const direction = this.rollD6();
    const distance = this.rollD6();
    return { direction, distance };
  }
}

// ─── Fixed Dice Provider ─────────────────────────────────────────────────────

/**
 * Deterministic dice provider for testing.
 * Returns values from a pre-defined sequence.
 * Throws if the sequence is exhausted.
 */
export class FixedDiceProvider implements DiceProvider {
  private readonly sequence: number[];
  private index: number = 0;

  constructor(sequence: number[]) {
    this.sequence = sequence;
  }

  rollD6(): number {
    if (this.index >= this.sequence.length) {
      throw new Error(
        `FixedDiceProvider exhausted: requested roll #${this.index + 1} but only ${this.sequence.length} values provided`,
      );
    }
    const value = this.sequence[this.index];
    this.index++;
    return value;
  }

  rollMultipleD6(count: number): number[] {
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollD6());
    }
    return results;
  }

  roll2D6(): [number, number] {
    return [this.rollD6(), this.rollD6()];
  }

  rollD3(): number {
    return Math.ceil(this.rollD6() / 2);
  }

  rollScatter(): { direction: number; distance: number } {
    const direction = this.rollD6();
    const distance = this.rollD6();
    return { direction, distance };
  }

  /** Number of rolls consumed so far */
  get rollsUsed(): number {
    return this.index;
  }

  /** Number of rolls remaining in the sequence */
  get rollsRemaining(): number {
    return this.sequence.length - this.index;
  }

  /** Reset the provider to the beginning of the sequence */
  reset(): void {
    this.index = 0;
  }
}
