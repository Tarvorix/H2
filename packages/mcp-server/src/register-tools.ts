import { AIStrategyTier } from '@hh/ai';
import type { HeadlessGameSetupOptions, HeadlessMatchSessionCreateOptions } from '@hh/headless';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Allegiance, LegionFaction, SpecialFaction } from '@hh/types';
import type { GameCommand } from '@hh/types';
import * as z from 'zod';
import type { HHMatchManager } from './match-manager';

function asToolResult(payload: unknown) {
  const structuredContent =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : Array.isArray(payload)
        ? { items: payload }
        : { value: payload };

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent,
  };
}

const playerConfigSchema = z.object({
  mode: z.enum(['human', 'agent', 'ai']).optional(),
  strategyTier: z.nativeEnum(AIStrategyTier).optional(),
  deploymentFormation: z.enum(['auto', 'line', 'double-rank', 'block', 'column']).optional(),
});

const setupUnitSchema = z.object({
  profileId: z.string().min(1),
  modelCount: z.number().int().positive(),
  unitId: z.string().min(1).optional(),
  isWarlord: z.boolean().optional(),
  originLegion: z.string().min(1).optional(),
});

const setupArmySchema = z.object({
  playerName: z.string().min(1),
  faction: z.union([z.nativeEnum(LegionFaction), z.nativeEnum(SpecialFaction)]),
  allegiance: z.nativeEnum(Allegiance),
  doctrine: z.unknown().optional(),
  pointsLimit: z.number().int().positive().optional(),
  units: z.array(setupUnitSchema),
});

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const objectiveSchema = z.object({
  id: z.string().min(1),
  position: positionSchema,
  vpValue: z.number(),
  currentVpValue: z.number(),
  isRemoved: z.boolean(),
  label: z.string().min(1).optional(),
});

const createMatchInputSchema = z.object({
  setupOptions: z.object({
    missionId: z.string().min(1),
    armies: z.tuple([setupArmySchema, setupArmySchema]),
    battlefieldWidth: z.number().positive().optional(),
    battlefieldHeight: z.number().positive().optional(),
    maxBattleTurns: z.number().int().positive().optional(),
    firstPlayerIndex: z.union([z.literal(0), z.literal(1)]).optional(),
    objectives: z.array(objectiveSchema).optional(),
    gameId: z.string().min(1).optional(),
  }).optional(),
  playerConfigs: z.tuple([playerConfigSchema, playerConfigSchema]).optional(),
});

const matchIdSchema = z.object({
  matchId: z.string().min(1),
});

const bindAgentSchema = z.object({
  matchId: z.string().min(1),
  playerIndex: z.union([z.literal(0), z.literal(1)]),
  agentId: z.string().min(1),
});

const legalActionsSchema = z.object({
  matchId: z.string().min(1),
  playerIndex: z.union([z.literal(0), z.literal(1)]),
  agentId: z.string().min(1).optional(),
});

const submitActionSchema = z.object({
  matchId: z.string().min(1),
  playerIndex: z.union([z.literal(0), z.literal(1)]),
  agentId: z.string().min(1).optional(),
  command: z.custom<GameCommand>(),
});

const advanceAiSchema = z.object({
  matchId: z.string().min(1),
  playerIndex: z.union([z.literal(0), z.literal(1)]).optional(),
});

export function registerTools(server: McpServer, matches: HHMatchManager): void {
  server.registerTool(
    'create_match',
    {
      description: 'Creates a new HH battle match session from headless setup options.',
      inputSchema: createMatchInputSchema.shape,
    },
    (args) => {
      if (!args.setupOptions) {
        throw new Error('create_match currently requires setupOptions in this vertical slice.');
      }
      const setupOptions = args.setupOptions as HeadlessGameSetupOptions;
      const playerConfigs = args.playerConfigs as HeadlessMatchSessionCreateOptions['playerConfigs'];
      return asToolResult(matches.createMatch({
        setupOptions,
        playerConfigs,
      }));
    },
  );

  server.registerTool(
    'list_matches',
    {
      description: 'Lists all known HH MCP matches.',
      inputSchema: {},
    },
    () => asToolResult(matches.listMatches()),
  );

  server.registerTool(
    'get_match',
    {
      description: 'Returns high-level match state and current nudge snapshot.',
      inputSchema: matchIdSchema.shape,
    },
    (args) => asToolResult(matches.getMatch(args.matchId)),
  );

  server.registerTool(
    'bind_agent_to_player',
    {
      description: 'Binds a stable agentId to one player slot for a match.',
      inputSchema: bindAgentSchema.shape,
    },
    (args) => asToolResult(matches.bindAgent(args.matchId, args.playerIndex, args.agentId)),
  );

  server.registerTool(
    'get_legal_actions',
    {
      description: 'Returns whether a player can act now and which command types are currently valid.',
      inputSchema: legalActionsSchema.shape,
    },
    (args) => asToolResult(matches.getLegalActions(args.matchId, args.playerIndex, args.agentId)),
  );

  server.registerTool(
    'submit_action',
    {
      description: 'Submits one validated HH engine command for the current acting player.',
      inputSchema: submitActionSchema.shape,
    },
    (args) => asToolResult(matches.submitAction(args.matchId, args.playerIndex, args.command, args.agentId)),
  );

  server.registerTool(
    'advance_ai_decision',
    {
      description: 'Advances one AI-owned decision window for the specified match.',
      inputSchema: advanceAiSchema.shape,
    },
    (args) => asToolResult(matches.advanceAiDecision(args.matchId, args.playerIndex)),
  );

  server.registerTool(
    'get_event_log',
    {
      description: 'Returns the full command/event history currently recorded for a match.',
      inputSchema: matchIdSchema.shape,
    },
    (args) => asToolResult(matches.getEventLog(args.matchId)),
  );

  server.registerTool(
    'get_observer_snapshot',
    {
      description: 'Returns a full-state observer snapshot for live bug-finding and replay review.',
      inputSchema: matchIdSchema.shape,
    },
    (args) => asToolResult(matches.getObserverSnapshot(args.matchId)),
  );

  server.registerTool(
    'export_replay_artifact',
    {
      description: 'Exports a deterministic replay artifact for the specified match.',
      inputSchema: matchIdSchema.shape,
    },
    (args) => asToolResult(matches.exportReplayArtifact(args.matchId)),
  );

  server.registerTool(
    'archive_match',
    {
      description: 'Marks a match as archived without deleting its state.',
      inputSchema: matchIdSchema.shape,
    },
    (args) => asToolResult(matches.archiveMatch(args.matchId)),
  );
}
