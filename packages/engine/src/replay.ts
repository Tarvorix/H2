import type { GameCommand, GameState } from '@hh/types';
import type { DiceProvider } from './types';
import { processCommand } from './command-processor';

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

type CanonicalValue =
  | null
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function toCanonicalValue(value: unknown): CanonicalValue {
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value.map((entry) => toCanonicalValue(entry));
  }

  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: { [key: string]: CanonicalValue } = {};

    const keys = Object.keys(input).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const entry = input[key];
      if (entry === undefined) continue;
      output[key] = toCanonicalValue(entry);
    }

    return output;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
  }

  return value as string | number | boolean;
}

function hashStringFnv64(input: string): string {
  let hash = FNV64_OFFSET_BASIS;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Stringify any JSON-like value in deterministic key order.
 * This is used for stable replay hashing.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

/**
 * Hash any JSON-like value using canonical serialization + FNV-1a 64-bit.
 */
export function hashStableValue(value: unknown): string {
  return hashStringFnv64(stableStringify(value));
}

/**
 * Compute a deterministic hash for a full GameState snapshot.
 */
export function hashGameState(state: GameState): string {
  return hashStableValue(state);
}

export interface ReplayCommandStepResult {
  step: number;
  command: GameCommand;
  accepted: boolean;
  errorMessages: string[];
  eventCount: number;
  stateHash: string;
}

export interface ReplayExecutionOptions {
  stopOnReject?: boolean;
}

export interface ReplayExecutionResult {
  finalState: GameState;
  finalStateHash: string;
  steps: ReplayCommandStepResult[];
}

/**
 * Replay a command sequence and return step-by-step acceptance + state hashes.
 */
export function replayCommands(
  initialState: GameState,
  commands: readonly GameCommand[],
  diceProvider: DiceProvider,
  options: ReplayExecutionOptions = {},
): ReplayExecutionResult {
  const stopOnReject = options.stopOnReject ?? false;
  let state = initialState;
  const steps: ReplayCommandStepResult[] = [];

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const result = processCommand(state, command, diceProvider);
    state = result.state;

    steps.push({
      step: i + 1,
      command,
      accepted: result.accepted,
      errorMessages: result.errors.map((error) => error.message),
      eventCount: result.events.length,
      stateHash: hashGameState(state),
    });

    if (!result.accepted && stopOnReject) break;
  }

  return {
    finalState: state,
    finalStateHash: hashGameState(state),
    steps,
  };
}
