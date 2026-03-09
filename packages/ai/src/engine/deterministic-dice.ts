import type { DiceProvider } from '@hh/engine';
import { hashStableValue } from '@hh/engine';

function seedToUint32(seed: unknown): number {
  const hash = hashStableValue(seed);
  const tail = hash.slice(-8);
  const parsed = Number.parseInt(tail, 16);
  return Number.isFinite(parsed) ? (parsed >>> 0) : 1;
}

export class SeededDiceProvider implements DiceProvider {
  private state: number;

  constructor(seed: unknown) {
    this.state = seedToUint32(seed) || 1;
  }

  private nextUint32(): number {
    let value = this.state || 1;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  private rollDie(sides: number): number {
    return (this.nextUint32() % sides) + 1;
  }

  rollD6(): number {
    return this.rollDie(6);
  }

  rollMultipleD6(count: number): number[] {
    return Array.from({ length: count }, () => this.rollD6());
  }

  roll2D6(): [number, number] {
    return [this.rollD6(), this.rollD6()];
  }

  rollD3(): number {
    return this.rollDie(3);
  }

  rollScatter(): { direction: number; distance: number } {
    return {
      direction: this.rollD6(),
      distance: this.rollD6(),
    };
  }
}
