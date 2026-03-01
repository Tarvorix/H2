import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState, Position } from '@hh/types';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider, hashGameState, processCommand } from '@hh/engine';
import { createHeadlessGameState } from './setup';
import { runHeadlessMatch } from './index';
import {
  createReplayArtifact,
  createReplayArtifactFromHeadlessRun,
  loadReplayArtifact,
  saveReplayArtifact,
  verifyReplayArtifact,
} from './replay';

function moveFirstModelTo(
  state: GameState,
  playerIndex: number,
  unitIndex: number,
  position: Position,
): GameState {
  return {
    ...state,
    armies: state.armies.map((army, idx) => {
      if (idx !== playerIndex) return army;

      return {
        ...army,
        units: army.units.map((unit, uIdx) => {
          if (uIdx !== unitIndex) return unit;
          if (unit.models.length === 0) return unit;

          return {
            ...unit,
            models: unit.models.map((model, mIdx) =>
              mIdx === 0 ? { ...model, position } : model,
            ),
          };
        }),
      };
    }) as GameState['armies'],
  };
}

function buildEndSubPhaseScript(
  initialState: GameState,
  maxSteps: number,
  diceSequence: number[],
): {
  commands: ReplayCommand[];
  finalState: GameState;
} {
  let state = initialState;
  const commands: ReplayCommand[] = [];
  const dice = new FixedDiceProvider(diceSequence);

  for (let i = 0; i < maxSteps; i++) {
    if (state.isGameOver) break;

    const command: GameCommand = { type: 'endSubPhase' };
    const result = processCommand(state, command, dice);
    if (!result.accepted) {
      throw new Error(
        `endSubPhase rejected at step ${i + 1}: ${result.errors.map((error) => error.message).join('; ')}`,
      );
    }
    commands.push({ command });
    state = result.state;
  }

  return { commands, finalState: state };
}

type ReplayCommand = {
  command: GameCommand;
  actingPlayerIndex?: number;
};

describe('headless replay artifacts', () => {
  it('replays a deterministic AI match to the same final state hash', () => {
    const initialState = createHeadlessGameState({
      missionId: 'heart-of-battle',
      gameId: 'phase5-ai-deterministic',
      armies: [
        {
          playerName: 'Player 1',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
        {
          playerName: 'Player 2',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
      ],
    });

    const runResult = runHeadlessMatch(initialState, {
      maxCommands: 4000,
      diceProvider: new FixedDiceProvider(Array.from({ length: 24000 }, () => 3)),
    });

    expect(runResult.terminatedReason).toBe('game-over');
    expect(runResult.finalStateHash).toBe(hashGameState(runResult.finalState));
    expect(runResult.commandHistory.length).toBeGreaterThan(0);
    expect(runResult.diceSequence.length).toBeGreaterThanOrEqual(0);

    const artifact = createReplayArtifactFromHeadlessRun(initialState, runResult, {
      scenario: 'phase-5-deterministic-ai',
    });
    const verification = verifyReplayArtifact(artifact);

    expect(artifact.steps.length).toBe(runResult.commandHistory.length);
    expect(artifact.finalStateHash).toBe(runResult.finalStateHash);
    expect(verification.matches).toBe(true);
    expect(verification.actualFinalHash).toBe(artifact.finalStateHash);
  });

  it('saves and loads replay artifacts from disk', () => {
    const initialState = createHeadlessGameState({
      missionId: 'heart-of-battle',
      gameId: 'phase5-persistence',
      armies: [
        {
          playerName: 'Player 1',
          faction: LegionFaction.DarkAngels,
          allegiance: Allegiance.Loyalist,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
        {
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
      ],
    });

    const diceSequence = Array.from({ length: 2400 }, () => 3);
    const { commands } = buildEndSubPhaseScript(initialState, 240, diceSequence);
    const artifact = createReplayArtifact(initialState, commands, diceSequence, {
      scenario: 'phase-5-persistence',
    });

    const replayPath = path.join(
      os.tmpdir(),
      `hhv2-replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    );

    try {
      saveReplayArtifact(replayPath, artifact);
      const loaded = loadReplayArtifact(replayPath);
      const verification = verifyReplayArtifact(loaded);

      expect(loaded.schemaVersion).toBe(1);
      expect(loaded.initialStateHash).toBe(artifact.initialStateHash);
      expect(loaded.finalStateHash).toBe(artifact.finalStateHash);
      expect(verification.matches).toBe(true);
    } finally {
      if (fs.existsSync(replayPath)) {
        fs.unlinkSync(replayPath);
      }
    }
  });

  it('maintains golden turn snapshot hashes for mission regression safety', () => {
    let initialState = createHeadlessGameState({
      missionId: 'heart-of-battle',
      gameId: 'phase5-golden-hashes',
      armies: [
        {
          playerName: 'Player 1',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
        {
          playerName: 'Player 2',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
      ],
    });

    // Force a stable objective-control scoring profile for deterministic snapshots.
    initialState = moveFirstModelTo(initialState, 0, 0, { x: 36, y: 24 });
    initialState = moveFirstModelTo(initialState, 1, 0, { x: 70, y: 47 });

    const diceSequence = Array.from({ length: 2400 }, () => 3);
    const { commands, finalState } = buildEndSubPhaseScript(initialState, 240, diceSequence);
    expect(finalState.isGameOver).toBe(true);

    const artifact = createReplayArtifact(initialState, commands, diceSequence, {
      scenario: 'phase-5-golden-turn-hashes',
    });

    const perTurnHash = new Map<number, string>();
    for (const step of artifact.steps) {
      perTurnHash.set(step.battleTurn, step.stateHash);
    }

    const turnHashes = [...perTurnHash.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, hash]) => hash);

    expect(turnHashes).toEqual([
      'c4f0f1907002b9f3',
      '3f6da2e6382ae267',
      'faf2e53ca17fbec0',
      'e8632af5dd74ed1b',
    ]);
    expect(artifact.finalStateHash).toBe(hashGameState(finalState));
  });

  it('keeps an AI command signature stable for regression checks', () => {
    const initialState = createHeadlessGameState({
      missionId: 'heart-of-battle',
      gameId: 'phase5-ai-signature',
      armies: [
        {
          playerName: 'World Eaters',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'assault-squad', modelCount: 10, isWarlord: true }],
        },
        {
          playerName: 'Alpha Legion',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'tactical-squad', modelCount: 10, isWarlord: true }],
        },
      ],
    });

    const runResult = runHeadlessMatch(initialState, {
      maxCommands: 1500,
      diceProvider: new FixedDiceProvider(Array.from({ length: 32000 }, () => 3)),
    });

    expect(runResult.executedCommands).toBeGreaterThan(0);

    const signature = runResult.commandHistory
      .slice(0, 40)
      .map((entry) => `${entry.actingPlayerIndex}:${entry.command.type}`)
      .join('|');

    const strategicCommandCount = runResult.commandHistory.filter(
      (entry) =>
        entry.command.type !== 'endSubPhase' &&
        entry.command.type !== 'endPhase' &&
        entry.command.type !== 'declineReaction',
    ).length;

    expect(strategicCommandCount).toBeGreaterThan(0);
    expect(signature).toBe('0:endSubPhase|0:endSubPhase|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:moveModel|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|0:endSubPhase|1:endSubPhase|1:endSubPhase|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:moveModel|1:endSubPhase|1:endSubPhase|1:endSubPhase|1:endSubPhase|1:endSubPhase');
    expect(runResult.finalStateHash).toBe('9e7f9664af87dc26');
  });
});
