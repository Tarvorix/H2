import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HHMatchManager } from './match-manager';
import { registerTools } from './register-tools';

describe('registerTools', () => {
  it('exposes an MCP tool catalog that a client can enumerate', async () => {
    const server = new McpServer({
      name: 'hh-mcp-test',
      version: '0.1.0',
    }, {
      capabilities: {
        logging: {},
      },
    });
    registerTools(server, new HHMatchManager());

    const client = new Client({
      name: 'hh-mcp-test-client',
      version: '0.1.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
      'create_match',
      'list_matches',
      'get_match',
      'bind_agent_to_player',
      'get_legal_actions',
      'get_decision_options',
      'submit_action',
      'advance_ai_decision',
      'submit_decision_option',
      'get_event_log',
      'get_observer_snapshot',
      'export_replay_artifact',
      'archive_match',
    ]);

    const createMatch = result.tools.find((tool) => tool.name === 'create_match');
    expect(createMatch).toBeDefined();
    const submitAction = result.tools.find((tool) => tool.name === 'submit_action');
    expect(submitAction).toBeDefined();

    const inputSchema = createMatch!.inputSchema as {
      properties: {
        setupOptions: {
          properties: {
            armies: {
              items: [
                {
                  properties: {
                    faction: {
                      enum: string[];
                    };
                    doctrine: {
                      oneOf: Array<{
                        properties: Record<string, unknown>;
                      }>;
                    };
                  };
                },
              ];
            };
          };
        };
      };
    };

    const setupArmySchema = inputSchema.properties.setupOptions.properties.armies.items[0];
    const topLevelFactions = new Set(setupArmySchema.properties.faction.enum);
    expect(topLevelFactions).toEqual(new Set([
      'Dark Angels',
      'World Eaters',
      'Alpha Legion',
      'Blackshields',
      'Shattered Legions',
    ]));

    // Shattered Legions and Blackshields still need access to the full legion set internally.
    const doctrineSchema = setupArmySchema.properties.doctrine.oneOf;
    expect(JSON.stringify(doctrineSchema)).toContain('selectedLegions');
    expect(JSON.stringify(doctrineSchema)).toContain('selectedLegionForArmoury');
    expect(JSON.stringify(doctrineSchema)).toContain('Sons of Horus');
    expect(JSON.stringify(submitAction!.inputSchema)).not.toContain('placeBlastMarker');

    await clientTransport.close();
  });

  it('serves concrete decision options over MCP', async () => {
    const server = new McpServer({
      name: 'hh-mcp-test',
      version: '0.1.0',
    }, {
      capabilities: {
        logging: {},
      },
    });
    registerTools(server, new HHMatchManager());

    const client = new Client({
      name: 'hh-mcp-test-client',
      version: '0.1.0',
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const createResult = await client.callTool({
      name: 'create_match',
      arguments: {
        setupOptions: {
          missionId: 'heart-of-battle',
          armies: [
            {
              playerName: 'Player 1',
              faction: 'World Eaters',
              allegiance: 'Traitor',
              units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
            },
            {
              playerName: 'Player 2',
              faction: 'Alpha Legion',
              allegiance: 'Traitor',
              units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
            },
          ],
        },
        playerConfigs: [{ mode: 'agent' }, { mode: 'agent' }],
      },
    });

    const payload = createResult.structuredContent as { matchId: string };
    const optionsResult = await client.callTool({
      name: 'get_decision_options',
      arguments: {
        matchId: payload.matchId,
        playerIndex: 0,
      },
    });

    const optionsPayload = optionsResult.structuredContent as {
      canAct: boolean;
      options: Array<{ id: string; commands: Array<{ type: string }> }>;
    };
    expect(optionsPayload.canAct).toBe(true);
    expect(optionsPayload.options.length).toBeGreaterThan(0);
    expect(optionsPayload.options.some((option) => option.commands[0]?.type === 'endSubPhase')).toBe(true);

    await clientTransport.close();
  });
});
