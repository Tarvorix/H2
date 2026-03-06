import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HHMatchManager } from './match-manager';

function resourceContent(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function registerResources(server: McpServer, matches: HHMatchManager): void {
  server.registerResource(
    'server_status',
    'hh://server/status',
    {
      title: 'HH MCP Server Status',
      description: 'Current match summaries hosted by the HH MCP server.',
      mimeType: 'application/json',
    },
    () => resourceContent('hh://server/status', { matches: matches.listMatches() }),
  );
}
