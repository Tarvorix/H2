import { AIStrategyTier } from '@hh/ai';
import type {
  HeadlessGameSetupOptions,
  HeadlessGeneratedArmyListGameSetupOptions,
  HeadlessMatchSessionCreateOptions,
} from '@hh/headless';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Allegiance, LegionFaction, SpecialFaction, TerrainType } from '@hh/types';
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

const idSchema = z.string().min(1);
const playableFactionSchema = z.enum([
  LegionFaction.DarkAngels,
  LegionFaction.WorldEaters,
  LegionFaction.AlphaLegion,
  SpecialFaction.Blackshields,
  SpecialFaction.ShatteredLegions,
]);
const playerIndexSchema = z.union([z.literal(0), z.literal(1)]);

const doctrineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blackshields'),
    oathIds: z.array(idSchema),
    selectedLegionForArmoury: z.nativeEnum(LegionFaction).optional(),
  }),
  z.object({
    kind: z.literal('shatteredLegions'),
    selectedLegions: z.array(z.nativeEnum(LegionFaction)),
    exemplarLegionByPrimeUnitId: z.record(z.string(), z.nativeEnum(LegionFaction)).optional(),
  }),
]);

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const modelPositionSchema = z.object({
  modelId: idSchema,
  position: positionSchema,
});

const terrainShapeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('polygon'),
    vertices: z.array(positionSchema),
  }),
  z.object({
    kind: z.literal('circle'),
    center: positionSchema,
    radius: z.number(),
  }),
  z.object({
    kind: z.literal('rectangle'),
    topLeft: positionSchema,
    width: z.number(),
    height: z.number(),
  }),
]);

const terrainPieceSchema = z.object({
  id: idSchema,
  name: idSchema,
  type: z.nativeEnum(TerrainType),
  shape: terrainShapeSchema,
  isDifficult: z.boolean(),
  isDangerous: z.boolean(),
});

const shootingWeaponSelectionSchema = z.object({
  modelId: idSchema,
  weaponId: idSchema,
  profileName: idSchema.optional(),
});

const blastPlacementSchema = z.object({
  sourceModelIds: z.array(idSchema).min(1),
  position: positionSchema,
});

const templatePlacementSchema = z.object({
  sourceModelId: idSchema,
  directionRadians: z.number(),
});

const gameCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('moveModel'),
    modelId: idSchema,
    targetPosition: positionSchema,
  }),
  z.object({
    type: z.literal('moveUnit'),
    unitId: idSchema,
    modelPositions: z.array(modelPositionSchema),
    isRush: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('declareShooting'),
    attackingUnitId: idSchema,
    targetUnitId: idSchema,
    weaponSelections: z.array(shootingWeaponSelectionSchema),
    blastPlacements: z.array(blastPlacementSchema).optional(),
    templatePlacements: z.array(templatePlacementSchema).optional(),
  }),
  z.object({
    type: z.literal('resolveShootingCasualties'),
  }),
  z.object({
    type: z.literal('declareCharge'),
    chargingUnitId: idSchema,
    targetUnitId: idSchema,
  }),
  z.object({
    type: z.literal('declareChallenge'),
    challengerModelId: idSchema,
    targetModelId: idSchema,
  }),
  z.object({
    type: z.literal('selectGambit'),
    modelId: idSchema,
    gambit: idSchema,
  }),
  z.object({
    type: z.literal('selectReaction'),
    unitId: idSchema,
    reactionType: idSchema,
  }),
  z.object({
    type: z.literal('declineReaction'),
  }),
  z.object({
    type: z.literal('endPhase'),
  }),
  z.object({
    type: z.literal('endSubPhase'),
  }),
  z.object({
    type: z.literal('selectTargetModel'),
    modelId: idSchema,
  }),
  z.object({
    type: z.literal('placeBlastMarker'),
    position: positionSchema,
    size: z.number(),
  }),
  z.object({
    type: z.literal('placeTerrain'),
    terrain: terrainPieceSchema,
  }),
  z.object({
    type: z.literal('removeTerrain'),
    terrainId: idSchema,
  }),
  z.object({
    type: z.literal('deployUnit'),
    unitId: idSchema,
    modelPositions: z.array(modelPositionSchema),
  }),
  z.object({
    type: z.literal('reservesTest'),
    unitId: idSchema,
  }),
  z.object({
    type: z.literal('rushUnit'),
    unitId: idSchema,
  }),
  z.object({
    type: z.literal('embark'),
    unitId: idSchema,
    transportId: idSchema,
  }),
  z.object({
    type: z.literal('disembark'),
    unitId: idSchema,
    modelPositions: z.array(modelPositionSchema),
  }),
  z.object({
    type: z.literal('selectWargearOption'),
    unitId: idSchema,
    modelId: idSchema,
    optionIndex: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('acceptChallenge'),
    challengedModelId: idSchema,
  }),
  z.object({
    type: z.literal('declineChallenge'),
  }),
  z.object({
    type: z.literal('declareWeapons'),
    weaponSelections: z.array(z.object({
      modelId: idSchema,
      weaponId: idSchema,
    })),
  }),
  z.object({
    type: z.literal('selectAftermath'),
    unitId: idSchema,
    option: idSchema,
  }),
  z.object({
    type: z.literal('resolveFight'),
    combatId: idSchema,
  }),
]);

const playerConfigSchema = z.object({
  mode: z.enum(['human', 'agent', 'ai']).optional(),
  strategyTier: z.nativeEnum(AIStrategyTier).optional(),
  deploymentFormation: z.enum(['auto', 'line', 'double-rank', 'block', 'column']).optional(),
  timeBudgetMs: z.number().int().positive().optional(),
  nnueModelId: z.string().min(1).optional(),
  baseSeed: z.number().int().optional(),
  rolloutCount: z.number().int().positive().optional(),
  maxDepthSoft: z.number().int().positive().optional(),
  diagnosticsEnabled: z.boolean().optional(),
});

const setupUnitSchema = z.object({
  profileId: idSchema,
  modelCount: z.number().int().positive(),
  unitId: idSchema.optional(),
  isWarlord: z.boolean().optional(),
  originLegion: z.nativeEnum(LegionFaction).optional(),
});

const setupArmySchema = z.object({
  playerName: idSchema,
  faction: playableFactionSchema,
  allegiance: z.nativeEnum(Allegiance),
  doctrine: doctrineSchema.optional(),
  pointsLimit: z.number().int().positive().optional(),
  units: z.array(setupUnitSchema),
});

const objectiveSchema = z.object({
  id: idSchema,
  position: positionSchema,
  vpValue: z.number(),
  currentVpValue: z.number(),
  isRemoved: z.boolean(),
  label: idSchema.optional(),
});

const createMatchInputSchema = z.object({
  setupOptions: z.object({
    missionId: idSchema,
    armies: z.tuple([setupArmySchema, setupArmySchema]),
    battlefieldWidth: z.number().positive().optional(),
    battlefieldHeight: z.number().positive().optional(),
    maxBattleTurns: z.number().int().positive().optional(),
    firstPlayerIndex: playerIndexSchema.optional(),
    objectives: z.array(objectiveSchema).optional(),
    gameId: idSchema.optional(),
  }).optional(),
  generatedArmyListSetupOptions: z.object({
    missionId: idSchema,
    rosterConfigs: z.tuple([
      z.object({
        playerName: idSchema,
        faction: playableFactionSchema,
        allegiance: z.nativeEnum(Allegiance),
        pointsLimit: z.number().int().positive(),
        strategyTier: z.enum(['heuristic', 'model']).optional(),
        nnueModelId: idSchema.optional(),
        baseSeed: z.number().int().optional(),
        candidateCount: z.number().int().positive().optional(),
      }),
      z.object({
        playerName: idSchema,
        faction: playableFactionSchema,
        allegiance: z.nativeEnum(Allegiance),
        pointsLimit: z.number().int().positive(),
        strategyTier: z.enum(['heuristic', 'model']).optional(),
        nnueModelId: idSchema.optional(),
        baseSeed: z.number().int().optional(),
        candidateCount: z.number().int().positive().optional(),
      }),
    ]),
    battlefieldWidth: z.number().positive().optional(),
    battlefieldHeight: z.number().positive().optional(),
    maxBattleTurns: z.number().int().positive().optional(),
    firstPlayerIndex: playerIndexSchema.optional(),
    objectives: z.array(objectiveSchema).optional(),
    gameId: idSchema.optional(),
  }).optional(),
  playerConfigs: z.tuple([playerConfigSchema, playerConfigSchema]).optional(),
});

const matchIdSchema = z.object({
  matchId: idSchema,
});

const bindAgentSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema,
  agentId: idSchema,
});

const legalActionsSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema,
  agentId: idSchema.optional(),
});

const decisionOptionsSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema,
  agentId: idSchema.optional(),
});

const submitActionSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema,
  agentId: idSchema.optional(),
  command: gameCommandSchema,
});

const advanceAiSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema.optional(),
});

const submitDecisionOptionSchema = z.object({
  matchId: idSchema,
  playerIndex: playerIndexSchema,
  agentId: idSchema.optional(),
  optionId: idSchema,
});

export function registerTools(server: McpServer, matches: HHMatchManager): void {
  server.registerTool(
    'create_match',
    {
      description: 'Creates a new HH battle match session from explicit setup options or generated army-list configs.',
      inputSchema: createMatchInputSchema.shape,
    },
    (args) => {
      if (!args.setupOptions && !args.generatedArmyListSetupOptions) {
        throw new Error('create_match requires setupOptions or generatedArmyListSetupOptions.');
      }
      const setupOptions = args.setupOptions as HeadlessGameSetupOptions;
      const generatedArmyListSetupOptions =
        args.generatedArmyListSetupOptions as HeadlessGeneratedArmyListGameSetupOptions | undefined;
      const playerConfigs = args.playerConfigs as HeadlessMatchSessionCreateOptions['playerConfigs'];
      return asToolResult(matches.createMatch({
        setupOptions,
        generatedArmyListSetupOptions,
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
    'get_decision_options',
    {
      description: 'Returns concrete MCP-ready decision options for the current acting player, including full command payloads.',
      inputSchema: decisionOptionsSchema.shape,
    },
    (args) => asToolResult(matches.getDecisionOptions(args.matchId, args.playerIndex, args.agentId)),
  );

  server.registerTool(
    'submit_action',
    {
      description: 'Submits one validated HH engine command for the current acting player.',
      inputSchema: submitActionSchema.shape,
    },
    (args) =>
      asToolResult(matches.submitAction(
        args.matchId,
        args.playerIndex,
        args.command as GameCommand,
        args.agentId,
      )),
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
    'submit_decision_option',
    {
      description: 'Submits one previously listed concrete decision option and auto-advances through non-decision states.',
      inputSchema: submitDecisionOptionSchema.shape,
    },
    (args) => asToolResult(matches.submitDecisionOption(
      args.matchId,
      args.playerIndex,
      args.optionId,
      args.agentId,
    )),
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
