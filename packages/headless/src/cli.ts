#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '@hh/types';
import { AIStrategyTier } from '@hh/ai';
import { runHeadlessMatch, type HeadlessAIPlayerConfig } from './index';
import {
  createReplayArtifactFromHeadlessRun,
  saveReplayArtifact,
  verifyReplayArtifact,
} from './replay';

interface CliOptions {
  statePath: string;
  outPath: string | null;
  replayOutPath: string | null;
  maxCommands: number;
  player0Tier: AIStrategyTier;
  player1Tier: AIStrategyTier;
  player0Enabled: boolean;
  player1Enabled: boolean;
}

function parseTier(raw: string): AIStrategyTier {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'basic') return AIStrategyTier.Basic;
  if (normalized === 'tactical') return AIStrategyTier.Tactical;
  throw new Error(`Unsupported AI tier "${raw}". Use "basic" or "tactical".`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    statePath: '',
    outPath: null,
    replayOutPath: null,
    maxCommands: 2000,
    player0Tier: AIStrategyTier.Tactical,
    player1Tier: AIStrategyTier.Tactical,
    player0Enabled: true,
    player1Enabled: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--state':
        options.statePath = argv[++i] ?? '';
        break;
      case '--out':
        options.outPath = argv[++i] ?? null;
        break;
      case '--replay-out':
        options.replayOutPath = argv[++i] ?? null;
        break;
      case '--max-commands':
        options.maxCommands = Number(argv[++i] ?? '2000');
        break;
      case '--player0-tier':
        options.player0Tier = parseTier(argv[++i] ?? '');
        break;
      case '--player1-tier':
        options.player1Tier = parseTier(argv[++i] ?? '');
        break;
      case '--disable-player0-ai':
        options.player0Enabled = false;
        break;
      case '--disable-player1-ai':
        options.player1Enabled = false;
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.statePath) {
    throw new Error('Missing required argument: --state <path-to-initial-game-state.json>');
  }

  if (!Number.isFinite(options.maxCommands) || options.maxCommands <= 0) {
    throw new Error('--max-commands must be a positive integer.');
  }

  return options;
}

function printHelp(): void {
  console.log(
    [
      'HHv2 Headless Runner',
      '',
      'Usage:',
      '  node packages/headless/dist/cli.js --state ./state.json [options]',
      '',
      'Options:',
      '  --state <path>            Required. JSON file containing initial GameState.',
      '  --out <path>              Optional. Write result JSON to this path.',
      '  --replay-out <path>       Optional. Write replay artifact JSON to this path.',
      '  --max-commands <number>   Optional. Default: 2000.',
      '  --player0-tier <tier>     Optional. basic|tactical (default: tactical).',
      '  --player1-tier <tier>     Optional. basic|tactical (default: tactical).',
      '  --disable-player0-ai      Optional. Disable AI control for player 0.',
      '  --disable-player1-ai      Optional. Disable AI control for player 1.',
      '  --help                    Show this message.',
    ].join('\n'),
  );
}

function readGameState(filePath: string): GameState {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as GameState;
}

function writeResult(filePath: string, payload: unknown): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const state = readGameState(options.statePath);

  const aiPlayers: HeadlessAIPlayerConfig[] = [
    {
      enabled: options.player0Enabled,
      playerIndex: 0,
      strategyTier: options.player0Tier,
    },
    {
      enabled: options.player1Enabled,
      playerIndex: 1,
      strategyTier: options.player1Tier,
    },
  ];

  const result = runHeadlessMatch(state, {
    maxCommands: options.maxCommands,
    aiPlayers,
  });

  const summary = {
    terminatedReason: result.terminatedReason,
    executedCommands: result.executedCommands,
    isGameOver: result.finalState.isGameOver,
    winnerPlayerIndex: result.finalState.winnerPlayerIndex,
    currentBattleTurn: result.finalState.currentBattleTurn,
    currentPhase: result.finalState.currentPhase,
    currentSubPhase: result.finalState.currentSubPhase,
    finalStateHash: result.finalStateHash,
    recordedDiceRolls: result.diceSequence.length,
  };

  console.log('Headless run summary:');
  console.log(JSON.stringify(summary, null, 2));

  if (options.outPath) {
    writeResult(options.outPath, {
      summary,
      result,
    });
    console.log(`Wrote output: ${path.resolve(process.cwd(), options.outPath)}`);
  }

  if (options.replayOutPath) {
    const artifact = createReplayArtifactFromHeadlessRun(state, result, {
      source: 'hh-headless-cli',
      statePath: path.resolve(process.cwd(), options.statePath),
      maxCommands: options.maxCommands,
    });
    saveReplayArtifact(options.replayOutPath, artifact);

    const verification = verifyReplayArtifact(artifact);
    const replayOutAbsolute = path.resolve(process.cwd(), options.replayOutPath);
    console.log(`Wrote replay artifact: ${replayOutAbsolute}`);
    console.log(
      `Replay verification: ${verification.matches ? 'PASS' : 'FAIL'} (${verification.expectedFinalHash} vs ${verification.actualFinalHash})`,
    );
  }
}

main();
