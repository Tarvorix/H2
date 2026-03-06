import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Request, Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { isAuthorized } from './auth';
import { loadMcpConfig } from './config';
import { HHMatchManager } from './match-manager';
import { registerResources } from './register-resources';
import { registerTools } from './register-tools';

interface SessionRuntime {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

function jsonRpcError(res: Response, code: number, message: string): void {
  res.status(code >= 400 ? code : 400).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message,
    },
    id: null,
  });
}

function toHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) return header[0] ?? null;
  return typeof header === 'string' ? header : null;
}

function wsRawDataToUtf8(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

function observerPayloadObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

export async function startMcpServer(): Promise<void> {
  const config = loadMcpConfig();
  const matches = new HHMatchManager();
  const runtimes = new Map<string, SessionRuntime>();

  const app = createMcpExpressApp({
    host: config.hostValidationMode === 'strict' ? config.host : '0.0.0.0',
  });

  app.use(cors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
        origin.startsWith('chrome-extension://');
      callback(allowed ? null : new Error('CORS origin denied.'), allowed);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'mcp-session-id'],
    credentials: false,
  }));

  const createRuntime = async (): Promise<SessionRuntime> => {
    const server = new McpServer({
      name: 'hh-mcp',
      version: '0.1.0',
    }, {
      capabilities: {
        logging: {},
      },
    });
    registerResources(server, matches);
    registerTools(server, matches);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        runtimes.set(sessionId, { server, transport });
      },
    });

    let closeHandled = false;
    transport.onclose = () => {
      if (closeHandled) return;
      closeHandled = true;
      const sessionId = transport.sessionId;
      if (sessionId) {
        runtimes.delete(sessionId);
      }
      void server.close();
    };

    await server.connect(transport as unknown as Transport);
    return { server, transport };
  };

  const expectedBearerToken = config.authMode === 'bearer' ? config.bearerToken : null;

  const ensureAuthorized = (req: Request, res: Response): boolean => {
    if (!isAuthorized(req.headers, expectedBearerToken)) {
      jsonRpcError(res, 401, 'Unauthorized');
      return false;
    }
    return true;
  };

  app.post(config.mcpPath, async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res)) return;

    try {
      const sessionId = toHeaderValue(req.headers['mcp-session-id']);
      if (sessionId && runtimes.has(sessionId)) {
        const runtime = runtimes.get(sessionId)!;
        await runtime.transport.handleRequest(
          req as Parameters<typeof runtime.transport.handleRequest>[0],
          res as Parameters<typeof runtime.transport.handleRequest>[1],
          req.body,
        );
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const runtime = await createRuntime();
        await runtime.transport.handleRequest(
          req as Parameters<typeof runtime.transport.handleRequest>[0],
          res as Parameters<typeof runtime.transport.handleRequest>[1],
          req.body,
        );
        return;
      }

      jsonRpcError(res, 400, 'Bad Request: missing valid session or initialize payload.');
    } catch (error) {
      jsonRpcError(res, 500, error instanceof Error ? error.message : 'Internal server error');
    }
  });

  app.get(config.mcpPath, async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res)) return;

    const sessionId = toHeaderValue(req.headers['mcp-session-id']);
    if (!sessionId || !runtimes.has(sessionId)) {
      jsonRpcError(res, 400, 'Bad Request: missing or invalid mcp-session-id header.');
      return;
    }

    const runtime = runtimes.get(sessionId)!;
    await runtime.transport.handleRequest(
      req as Parameters<typeof runtime.transport.handleRequest>[0],
      res as Parameters<typeof runtime.transport.handleRequest>[1],
    );
  });

  app.delete(config.mcpPath, async (req: Request, res: Response) => {
    if (!ensureAuthorized(req, res)) return;

    const sessionId = toHeaderValue(req.headers['mcp-session-id']);
    if (!sessionId || !runtimes.has(sessionId)) {
      jsonRpcError(res, 400, 'Bad Request: missing or invalid mcp-session-id header.');
      return;
    }

    const runtime = runtimes.get(sessionId)!;
    await runtime.transport.handleRequest(
      req as Parameters<typeof runtime.transport.handleRequest>[0],
      res as Parameters<typeof runtime.transport.handleRequest>[1],
    );
    runtimes.delete(sessionId);
  });

  const httpServer = createServer(app);
  const observeWss = new WebSocketServer({ noServer: true });

  matches.on('observer_snapshot', (payload) => {
    const data = JSON.stringify({ type: 'snapshot', payload });
    for (const client of observeWss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  });

  observeWss.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: 'hello',
      payload: {
        publicHost: config.publicHost,
        mcpPath: config.mcpPath,
        observePath: config.observePath,
        matches: matches.listMatches(),
      },
    }));

    socket.on('message', (raw) => {
      try {
        const message = observerPayloadObject(JSON.parse(wsRawDataToUtf8(raw)));
        const type = typeof message.type === 'string' ? message.type : '';
        if (type === 'get_snapshot' && typeof message.matchId === 'string') {
          socket.send(JSON.stringify({
            type: 'snapshot',
            payload: matches.getObserverSnapshot(message.matchId, 'observer_pull'),
          }));
          return;
        }

        if (type === 'list_matches') {
          socket.send(JSON.stringify({
            type: 'matches',
            payload: matches.listMatches(),
          }));
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: 'error',
          payload: { message: error instanceof Error ? error.message : 'Observer request failed.' },
        }));
      }
    });
  });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== config.observePath) {
      socket.destroy();
      return;
    }

    if (!isAuthorized(req.headers, expectedBearerToken)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    observeWss.handleUpgrade(req, socket, head, (client) => {
      observeWss.emit('connection', client, req);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, config.host, () => {
      console.log(`HH MCP server listening on http://${config.host}:${config.port}${config.mcpPath}`);
      console.log(`HH Observe websocket available on ws://${config.host}:${config.port}${config.observePath}`);
      console.log(`Public host target: https://${config.publicHost}${config.mcpPath}`);
      resolve();
    });
  });
}

void startMcpServer();
