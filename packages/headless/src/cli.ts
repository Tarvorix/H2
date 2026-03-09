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
  player0TimeBudget: number | null;
  player1TimeBudget: number | null;
  player0ModelId: string | null;
  player1ModelId: string | null;
  player0BaseSeed: number | null;
  player1BaseSeed: number | null;
  player0RolloutCount: number | null;
  player1RolloutCount: number | null;
  player0MaxDepthSoft: number | null;
  player1MaxDepthSoft: number | null;
  player0Diagnostics: boolean;
  player1Diagnostics: boolean;
}

function parseTier(raw: string): AIStrategyTier {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'basic') return AIStrategyTier.Basic;
  if (normalized === 'tactical') return AIStrategyTier.Tactical;
  if (normalized === 'engine') return AIStrategyTier.Engine;
  throw new Error(`Unsupported AI tier "${raw}". Use "basic", "tactical", or "engine".`);
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
    player0TimeBudget: null,
    player1TimeBudget: null,
    player0ModelId: null,
    player1ModelId: null,
    player0BaseSeed: null,
    player1BaseSeed: null,
    player0RolloutCount: null,
    player1RolloutCount: null,
    player0MaxDepthSoft: null,
    player1MaxDepthSoft: null,
    player0Diagnostics: false,
    player1Diagnostics: false,
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
      case '--player0-time-budget':
        options.player0TimeBudget = Number(argv[++i] ?? '0');
        break;
      case '--player1-time-budget':
        options.player1TimeBudget = Number(argv[++i] ?? '0');
        break;
      case '--player0-model':
        options.player0ModelId = argv[++i] ?? null;
        break;
      case '--player1-model':
        options.player1ModelId = argv[++i] ?? null;
        break;
      case '--player0-seed':
        options.player0BaseSeed = Number(argv[++i] ?? '0');
        break;
      case '--player1-seed':
        options.player1BaseSeed = Number(argv[++i] ?? '0');
        break;
      case '--player0-rollouts':
        options.player0RolloutCount = Number(argv[++i] ?? '0');
        break;
      case '--player1-rollouts':
        options.player1RolloutCount = Number(argv[++i] ?? '0');
        break;
      case '--player0-depth':
        options.player0MaxDepthSoft = Number(argv[++i] ?? '0');
        break;
      case '--player1-depth':
        options.player1MaxDepthSoft = Number(argv[++i] ?? '0');
        break;
      case '--player0-diagnostics':
        options.player0Diagnostics = true;
        break;
      case '--player1-diagnostics':
        options.player1Diagnostics = true;
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
      '  --player0-tier <tier>     Optional. basic|tactical|engine (default: tactical).',
      '  --player1-tier <tier>     Optional. basic|tactical|engine (default: tactical).',
      '  --player0-time-budget <n> Optional. Engine search budget in ms for player 0.',
      '  --player1-time-budget <n> Optional. Engine search budget in ms for player 1.',
      '  --player0-model <id>      Optional. NNUE model ID for player 0 Engine.',
      '  --player1-model <id>      Optional. NNUE model ID for player 1 Engine.',
      '  --player0-seed <n>        Optional. Deterministic Engine seed for player 0.',
      '  --player1-seed <n>        Optional. Deterministic Engine seed for player 1.',
      '  --player0-rollouts <n>    Optional. Deterministic rollout count for player 0 Engine.',
      '  --player1-rollouts <n>    Optional. Deterministic rollout count for player 1 Engine.',
      '  --player0-depth <n>       Optional. Soft search depth for player 0 Engine.',
      '  --player1-depth <n>       Optional. Soft search depth for player 1 Engine.',
      '  --player0-diagnostics     Optional. Emit player 0 Engine diagnostics.',
      '  --player1-diagnostics     Optional. Emit player 1 Engine diagnostics.',
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
      ...(options.player0TimeBudget !== null ? { timeBudgetMs: options.player0TimeBudget } : {}),
      ...(options.player0ModelId ? { nnueModelId: options.player0ModelId } : {}),
      ...(options.player0BaseSeed !== null ? { baseSeed: options.player0BaseSeed } : {}),
      ...(options.player0RolloutCount !== null ? { rolloutCount: options.player0RolloutCount } : {}),
      ...(options.player0MaxDepthSoft !== null ? { maxDepthSoft: options.player0MaxDepthSoft } : {}),
      ...(options.player0Diagnostics ? { diagnosticsEnabled: true } : {}),
    },
    {
      enabled: options.player1Enabled,
      playerIndex: 1,
      strategyTier: options.player1Tier,
      ...(options.player1TimeBudget !== null ? { timeBudgetMs: options.player1TimeBudget } : {}),
      ...(options.player1ModelId ? { nnueModelId: options.player1ModelId } : {}),
      ...(options.player1BaseSeed !== null ? { baseSeed: options.player1BaseSeed } : {}),
      ...(options.player1RolloutCount !== null ? { rolloutCount: options.player1RolloutCount } : {}),
      ...(options.player1MaxDepthSoft !== null ? { maxDepthSoft: options.player1MaxDepthSoft } : {}),
      ...(options.player1Diagnostics ? { diagnosticsEnabled: true } : {}),
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
