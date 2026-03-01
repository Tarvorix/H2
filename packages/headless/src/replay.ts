import fs from 'node:fs';
import path from 'node:path';
import type { GameCommand, GameState } from '@hh/types';
import { FixedDiceProvider, hashGameState, processCommand } from '@hh/engine';

export interface ReplayCommandInput {
  command: GameCommand;
  actingPlayerIndex?: number;
}

export interface HeadlessReplayStep {
  step: number;
  command: GameCommand;
  actingPlayerIndex: number;
  accepted: boolean;
  errorMessages: string[];
  events: import('@hh/engine').GameEvent[];
  eventCount: number;
  battleTurn: number;
  phase: string;
  subPhase: string;
  stateHash: string;
}

export interface HeadlessReplayArtifact {
  schemaVersion: 1;
  createdAt: string;
  metadata: Record<string, unknown>;
  initialState: GameState;
  initialStateHash: string;
  diceSequence: number[];
  steps: HeadlessReplayStep[];
  finalState: GameState;
  finalStateHash: string;
}

export interface HeadlessReplayVerificationResult {
  matches: boolean;
  expectedFinalHash: string;
  actualFinalHash: string;
  mismatchStep?: number;
  reason?: string;
}

function getReactivePlayerIndex(state: GameState): number {
  return state.activePlayerIndex === 0 ? 1 : 0;
}

function inferActingPlayerIndex(state: GameState): number {
  return state.awaitingReaction ? getReactivePlayerIndex(state) : state.activePlayerIndex;
}

export function createReplayArtifact(
  initialState: GameState,
  commandInputs: readonly ReplayCommandInput[],
  diceSequence: readonly number[],
  metadata: Record<string, unknown> = {},
): HeadlessReplayArtifact {
  let state = initialState;
  const dice = new FixedDiceProvider([...diceSequence]);
  const steps: HeadlessReplayStep[] = [];

  for (let i = 0; i < commandInputs.length; i++) {
    const input = commandInputs[i];
    const actingPlayerIndex = input.actingPlayerIndex ?? inferActingPlayerIndex(state);
    const result = processCommand(state, input.command, dice);
    state = result.state;

    steps.push({
      step: i + 1,
      command: input.command,
      actingPlayerIndex,
      accepted: result.accepted,
      errorMessages: result.errors.map((error) => error.message),
      events: result.events,
      eventCount: result.events.length,
      battleTurn: state.currentBattleTurn,
      phase: state.currentPhase,
      subPhase: state.currentSubPhase,
      stateHash: hashGameState(state),
    });
  }

  const finalState = state;
  const finalStateHash = hashGameState(finalState);

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    metadata,
    initialState,
    initialStateHash: hashGameState(initialState),
    diceSequence: [...diceSequence],
    steps,
    finalState,
    finalStateHash,
  };
}

export function createReplayArtifactFromHeadlessRun(
  initialState: GameState,
  runResult: {
    commandHistory: { command: GameCommand; actingPlayerIndex: number }[];
    diceSequence: number[];
    terminatedReason: string;
  },
  metadata: Record<string, unknown> = {},
): HeadlessReplayArtifact {
  const commandInputs: ReplayCommandInput[] = runResult.commandHistory.map((entry) => ({
    command: entry.command,
    actingPlayerIndex: entry.actingPlayerIndex,
  }));

  return createReplayArtifact(initialState, commandInputs, runResult.diceSequence, {
    ...metadata,
    terminatedReason: runResult.terminatedReason,
  });
}

export function verifyReplayArtifact(
  artifact: HeadlessReplayArtifact,
): HeadlessReplayVerificationResult {
  if (artifact.schemaVersion !== 1) {
    return {
      matches: false,
      expectedFinalHash: artifact.finalStateHash,
      actualFinalHash: '',
      reason: `Unsupported replay schema version: ${artifact.schemaVersion}`,
    };
  }

  let state = artifact.initialState;
  const dice = new FixedDiceProvider([...artifact.diceSequence]);

  for (let i = 0; i < artifact.steps.length; i++) {
    const expectedStep = artifact.steps[i];
    const result = processCommand(state, expectedStep.command, dice);
    state = result.state;

    const actualStateHash = hashGameState(state);
    const actualErrorMessages = result.errors.map((error) => error.message);

    if (result.accepted !== expectedStep.accepted) {
      return {
        matches: false,
        expectedFinalHash: artifact.finalStateHash,
        actualFinalHash: hashGameState(state),
        mismatchStep: i + 1,
        reason: 'Acceptance mismatch',
      };
    }

    if (result.events.length !== expectedStep.eventCount) {
      return {
        matches: false,
        expectedFinalHash: artifact.finalStateHash,
        actualFinalHash: hashGameState(state),
        mismatchStep: i + 1,
        reason: 'Event count mismatch',
      };
    }

    if (actualStateHash !== expectedStep.stateHash) {
      return {
        matches: false,
        expectedFinalHash: artifact.finalStateHash,
        actualFinalHash: hashGameState(state),
        mismatchStep: i + 1,
        reason: 'State hash mismatch',
      };
    }

    if (JSON.stringify(actualErrorMessages) !== JSON.stringify(expectedStep.errorMessages)) {
      return {
        matches: false,
        expectedFinalHash: artifact.finalStateHash,
        actualFinalHash: hashGameState(state),
        mismatchStep: i + 1,
        reason: 'Error message mismatch',
      };
    }
  }

  const actualFinalHash = hashGameState(state);
  if (actualFinalHash !== artifact.finalStateHash) {
    return {
      matches: false,
      expectedFinalHash: artifact.finalStateHash,
      actualFinalHash,
      reason: 'Final hash mismatch',
    };
  }

  return {
    matches: true,
    expectedFinalHash: artifact.finalStateHash,
    actualFinalHash,
  };
}

export function saveReplayArtifact(
  filePath: string,
  artifact: HeadlessReplayArtifact,
): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    'utf8',
  );
}

export function loadReplayArtifact(filePath: string): HeadlessReplayArtifact {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as HeadlessReplayArtifact;

  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported replay schema version: ${String((parsed as { schemaVersion?: number }).schemaVersion)}`);
  }

  return parsed;
}
