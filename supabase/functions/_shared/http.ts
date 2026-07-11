/**
 * HTTP glue shared by every Edge Function: JSON responses, CORS, and a typed
 * error whose `code` is a STABLE, non-sensitive string safe to log and to return
 * to the client. We never put a secret, a stack, or an answer in an error body.
 */

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** An error with a stable machine code and an HTTP status. Message is client-safe. */
export class AppError extends Error {
  constructor(public code: string, public status = 400, message?: string) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/** Map any thrown value to a client-safe error response with a stable code. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: err.code }, err.status);
  // Anything unexpected: a generic code, and the detail stays server-side.
  console.error('unhandled_error', err instanceof Error ? err.message : String(err));
  return json({ error: 'internal_error' }, 500);
}

/** Parse a JSON body, or throw a stable `bad_request`. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body as Record<string, unknown>;
  } catch {
    throw new AppError('bad_request', 400);
  }
}

/** Guard: only POST is allowed; OPTIONS is answered for CORS preflight. */
export function methodGuard(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  return null;
}
