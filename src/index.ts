import { assess, renderReport, type Metadata } from './evidence.js';
import { tokenMatches, validateTarget, type Env } from './safety.js';
const MAX_BYTES = 64 * 1024;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function response(status: number, data: unknown): Response {
  return Response.json(data, { status, headers });
}
function object(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function validMetadata(x: unknown): x is Metadata {
  if (!object(x) || !object(x.capabilities) || !Array.isArray(x.tools) || x.tools.length > 50 || !object(x.publicConfiguration)) return false;
  if (!['required', 'none', 'unknown'].includes(String(x.publicConfiguration.authentication)) || !['https', 'stdio', 'unknown'].includes(String(x.publicConfiguration.transport))) return false;
  const names = new Set<string>();
  return x.tools.every(t => {
    if (!object(t) || typeof t.name !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(t.name) || names.has(t.name) || !object(t.inputSchema) || (t.annotations !== undefined && !object(t.annotations))) return false;
    names.add(t.name); return true;
  });
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Missing body');
  if (request.headers.get('content-encoding')) throw new Error('Encoded bodies unsupported');
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new Error('JSON required');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new Error('Body timeout')); }, 2000); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Bound nesting before recursive parsing/canonicalization of submitted JSON.
    let depth = 0, quoted = false, escaped = false;
    for (const c of text) {
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{' || c === '[') { if (++depth > 20) throw new Error('Too deeply nested'); }
      else if (c === '}' || c === ']') depth--;
    }
    return JSON.parse(text);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') return response(200, { status: 'ok', mode: 'submitted-metadata-only', live_probing: false, payments: false });
    if (!['/assessments', '/evidence-report', '/report'].includes(path)) return response(404, { error: 'Not found' });
    if (request.method !== 'POST') return response(405, { error: 'POST required' });
    // No permissive fallback: provision operator-approved scope and distributed limiter first.
    if (!env.ASSESSMENT_TOKEN || env.ASSESSMENT_TOKEN.length < 32 || !env.AUTHORIZED_SUBJECT || !env.AUTHORIZED_TARGET || !env.RATE_LIMITER)
      return response(503, { error: 'Authorization scope and rate limiter must be configured' });
    const bearer = request.headers.get('Authorization') ?? '';
    if (bearer.length > 1024 || !await tokenMatches(bearer, 'Bearer ' + env.ASSESSMENT_TOKEN)) return response(401, { error: 'Unauthorized' });
    try {
      // One scope per deployment; rotating tokens cannot bypass the scope quota.
      const result = await env.RATE_LIMITER.getByName('global-assessment-budget').fetch(new Request('https://limiter.internal', { method: 'POST' }));
      if (result.status === 429) return response(429, { error: 'Rate limit exceeded' });
      if (result.status !== 204) return response(503, { error: 'Rate limiter unavailable' });
    } catch { return response(503, { error: 'Rate limiter unavailable' }); }
    let body: unknown;
    try { body = await boundedJson(request); } catch { return response(400, { error: 'Invalid JSON body; maximum 64 KiB, depth 20, deadline 2s' }); }
    if (!object(body)) return response(400, { error: 'Object required' });
    if (typeof body.mode !== 'string') return response(400, { error: 'Mode required' });
    if (body.mode !== 'submitted-metadata') return response(422, { error: 'Live probing is disabled; only submitted-metadata mode is supported' });
    if (!object(body.authorization) || body.authorization.subject !== env.AUTHORIZED_SUBJECT || body.authorization.explicit_authorization !== true)
      return response(403, { error: 'Explicit authorization for configured subject required' });
    let target: string;
    try {
      target = validateTarget(body.target);
      if (target !== validateTarget(env.AUTHORIZED_TARGET)) return response(403, { error: 'Target outside authorized scope' });
    } catch { return response(400, { error: 'Disallowed target URL' }); }
    if (!validMetadata(body.metadata)) return response(400, { error: 'Invalid metadata; maximum 50 uniquely named tools' });
    const assessmentId = crypto.randomUUID();
    const events = await assess(body.metadata, assessmentId, new Date().toISOString());
    if (path === '/report') return new Response(renderReport(events), { headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' } });
    return response(200, { schema_version: '1', assessment_id: assessmentId, target, mode: body.mode, target_requests: 0, events, report: renderReport(events) });
  },
};

export { GlobalRateLimiter } from './limiter.js';
