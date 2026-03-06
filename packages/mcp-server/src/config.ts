export interface HHMcpConfig {
  host: string;
  port: number;
  mcpPath: string;
  observePath: string;
  publicHost: string;
  hostValidationMode: 'off' | 'strict';
  authMode: 'none' | 'bearer';
  bearerToken: string | null;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function loadMcpConfig(): HHMcpConfig {
  const bearerTokenRaw = process.env.HH_MCP_BEARER_TOKEN?.trim() ?? '';
  const requestedAuthMode = (process.env.HH_MCP_AUTH_MODE ?? '').trim().toLowerCase();
  const authMode: 'none' | 'bearer' =
    requestedAuthMode === 'none' || requestedAuthMode === 'bearer'
      ? requestedAuthMode
      : (bearerTokenRaw ? 'bearer' : 'none');

  if (authMode === 'bearer' && !bearerTokenRaw) {
    throw new Error('HH_MCP_AUTH_MODE is bearer but HH_MCP_BEARER_TOKEN is missing.');
  }

  const requestedHostValidationMode = (process.env.HH_MCP_HOST_VALIDATION ?? '').trim().toLowerCase();
  const hostValidationMode: 'off' | 'strict' = requestedHostValidationMode === 'strict' ? 'strict' : 'off';

  return {
    host: process.env.HH_MCP_HOST ?? '127.0.0.1',
    port: intFromEnv('HH_MCP_PORT', 8787),
    mcpPath: process.env.HH_MCP_PATH ?? '/mcp',
    observePath: process.env.HH_OBSERVE_PATH ?? '/observe',
    publicHost: process.env.HH_MCP_PUBLIC_HOST ?? 'hh.tarvorix.com',
    hostValidationMode,
    authMode,
    bearerToken: authMode === 'bearer' ? bearerTokenRaw : null,
  };
}
