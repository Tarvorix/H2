import type { IncomingHttpHeaders } from 'node:http';

function toHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) return header[0] ?? null;
  return typeof header === 'string' ? header : null;
}

export function isAuthorized(
  headers: IncomingHttpHeaders,
  expectedBearerToken: string | null,
): boolean {
  if (!expectedBearerToken) return true;

  const authorization = toHeaderValue(headers.authorization);
  if (!authorization) return false;

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token === expectedBearerToken;
}
