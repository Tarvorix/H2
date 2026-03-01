/**
 * Dice Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { RandomDiceProvider, FixedDiceProvider } from './dice';

describe('RandomDiceProvider', () => {
  it('should return values between 1 and 6', () => {
    const dice = new RandomDiceProvider();
    for (let i = 0; i < 100; i++) {
      const result = dice.rollD6();
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(6);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it('should return correct number of dice for rollMultipleD6', () => {
    const dice = new RandomDiceProvider();
    const results = dice.rollMultipleD6(5);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  it('should return empty array for zero dice', () => {
    const dice = new RandomDiceProvider();
    expect(dice.rollMultipleD6(0)).toEqual([]);
  });

  it('should produce at least two distinct values over 100 rolls', () => {
    const dice = new RandomDiceProvider();
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(dice.rollD6());
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('FixedDiceProvider', () => {
  it('should return values in sequence', () => {
    const dice = new FixedDiceProvider([3, 5, 1, 6, 2, 4]);
    expect(dice.rollD6()).toBe(3);
    expect(dice.rollD6()).toBe(5);
    expect(dice.rollD6()).toBe(1);
    expect(dice.rollD6()).toBe(6);
    expect(dice.rollD6()).toBe(2);
    expect(dice.rollD6()).toBe(4);
  });

  it('should throw when sequence is exhausted', () => {
    const dice = new FixedDiceProvider([4]);
    expect(dice.rollD6()).toBe(4);
    expect(() => dice.rollD6()).toThrow('FixedDiceProvider exhausted');
  });

  it('should track rollsUsed and rollsRemaining', () => {
    const dice = new FixedDiceProvider([1, 2, 3]);
    expect(dice.rollsUsed).toBe(0);
    expect(dice.rollsRemaining).toBe(3);
    dice.rollD6();
    expect(dice.rollsUsed).toBe(1);
    expect(dice.rollsRemaining).toBe(2);
    dice.rollD6();
    expect(dice.rollsUsed).toBe(2);
    expect(dice.rollsRemaining).toBe(1);
  });

  it('should support rollMultipleD6 consuming from sequence', () => {
    const dice = new FixedDiceProvider([2, 4, 6, 1, 3]);
    const results = dice.rollMultipleD6(3);
    expect(results).toEqual([2, 4, 6]);
    expect(dice.rollsUsed).toBe(3);
    expect(dice.rollsRemaining).toBe(2);
  });

  it('should reset to the beginning of the sequence', () => {
    const dice = new FixedDiceProvider([5, 3]);
    expect(dice.rollD6()).toBe(5);
    expect(dice.rollD6()).toBe(3);
    dice.reset();
    expect(dice.rollsUsed).toBe(0);
    expect(dice.rollD6()).toBe(5);
    expect(dice.rollD6()).toBe(3);
  });

  it('should throw on exhaustion with rollMultipleD6', () => {
    const dice = new FixedDiceProvider([1, 2]);
    expect(() => dice.rollMultipleD6(3)).toThrow('FixedDiceProvider exhausted');
  });

  it('should handle empty sequence', () => {
    const dice = new FixedDiceProvider([]);
    expect(dice.rollsUsed).toBe(0);
    expect(dice.rollsRemaining).toBe(0);
    expect(() => dice.rollD6()).toThrow('FixedDiceProvider exhausted');
  });
});
