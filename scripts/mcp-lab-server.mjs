// Self-owned, ephemeral loopback MCP lab. Never accepts a destination URL.
// Deliberately weak *application policy* is compared with a fixed policy;
// authentication, Host/Origin checks and resource bounds always remain active.
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export const PROTOCOL = '2025-06-18'; // Intentionally pinned legacy profile, not latest/full conformance.
const LIMIT = 8192;
const BODY_MS = 800;
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const ownKeys = (x, allowed) => Object.keys(x).every(k => allowed.includes(k));
const policies = Object.freeze({
  reader: { tenant: 'alpha', write: false },
  writer: { tenant: 'alpha', write: true },
  colleague: { tenant: 'alpha', write: true },
  outsider: { tenant: 'beta', write: true }
});
const tools = [
  { name: 'read_record', description: 'Read fictional record data.', inputSchema: { type: 'object', properties: { record_id: { type: 'string' } }, required: ['record_id'], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'set_note', description: 'Change an in-memory fictional note; server-issued lab approval required.', inputSchema: { type: 'object', properties: { record_id: { type: 'string' }, note: { type: 'string', maxLength: 120 }, approval: { type: 'string' } }, required: ['record_id', 'note'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true } }
];

function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const chunks = [];
    const done = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('error', broken); req.off('aborted', broken);
      if (error) { req.pause(); reject(error); } else resolve(value);
    };
    const failure = (status, code) => Object.assign(new Error(code), { status, code });
    const data = chunk => {
      bytes += chunk.length;
      if (bytes > LIMIT) done(failure(413, 'BODY_LIMIT')); else chunks.push(chunk);
    };
    const end = () => {
      try { done(null, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { done(failure(400, 'INVALID_JSON')); }
    };
    const broken = () => done(failure(400, 'INCOMPLETE_BODY'));
    const timer = setTimeout(() => done(failure(408, 'BODY_DEADLINE')), BODY_MS);
    req.on('data', data); req.once('end', end); req.once('error', broken); req.once('aborted', broken);
  });
}

export async function startMcpLab(profile = 'fixed', requestLimit = 128) {
  assert.ok(['weak', 'fixed'].includes(profile));
  assert.ok(Number.isInteger(requestLimit) && requestLimit > 0 && requestLimit <= 256);
  const tokens = Object.fromEntries(Object.keys(policies).map(k => [k, randomBytes(32).toString('hex')]));
  const identities = new Map(Object.entries(tokens).map(([actor, token]) => [token, actor]));
  const records = new Map([['A1', { tenant: 'alpha', revision: 0, note: 'fictional alpha note' }], ['A2', { tenant: 'alpha', revision: 0, note: 'fictional alpha note' }], ['B1', { tenant: 'beta', revision: 0, note: 'fictional beta note' }]]);
  const sessions = new Map(), approvals = new Map();
  let clock = 0, requests = 0, writes = 0, host = '';
  const server = createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'close', ...extra });
      res.end(body === null ? undefined : JSON.stringify(body));
      // A stalled or oversized body cannot keep the server-side socket open.
      if (!req.complete) res.once('finish', () => req.destroy());
    };
    const deny = (status, code) => send(status, { code });
    try {
      if (req.headers.host !== host || req.headers.origin !== undefined) return deny(403, 'ORIGIN_OR_HOST');
      if (++requests > requestLimit) return deny(429, 'REQUEST_BUDGET');
      if (req.url !== '/mcp') return deny(404, 'NOT_FOUND');
      const auth = req.headers.authorization;
      const actor = typeof auth === 'string' && auth.startsWith('Bearer ') ? identities.get(auth.slice(7)) : undefined;
      if (!actor) return deny(401, 'UNAUTHENTICATED');
      if (!['POST', 'GET', 'DELETE'].includes(req.method)) return deny(405, 'METHOD');
      if (req.method === 'GET') return send(405, { code: 'SSE_NOT_OFFERED' }, { Allow: 'POST, DELETE' });
      const sessionId = req.headers['mcp-session-id'];
      const session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
      if (sessionId && (!session || session.actor !== actor || session.expires <= clock)) return deny(404, 'SESSION_NOT_FOUND');
      if (req.method === 'DELETE') {
        if (!session) return deny(400, 'SESSION_REQUIRED');
        sessions.delete(sessionId); return send(204, null);
      }
      if (req.headers['content-encoding'] !== undefined) return deny(415, 'ENCODING');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return deny(415, 'JSON_REQUIRED');
      if (!req.headers.accept?.includes('application/json') || !req.headers.accept?.includes('text/event-stream')) return deny(406, 'ACCEPT_REQUIRED');
      const message = await readBody(req);
      if (!plain(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
          (message.id !== undefined && !(typeof message.id === 'string' || Number.isSafeInteger(message.id))) ||
          (message.params !== undefined && !plain(message.params))) return deny(400, 'INVALID_RPC');
      const params = message.params ?? {};
      const result = value => send(200, { jsonrpc: '2.0', id: message.id, result: value });
      const rpcError = (code, text) => send(200, { jsonrpc: '2.0', id: message.id, error: { code, message: text } });
      if (message.method === 'initialize') {
        if (message.id === undefined || session) return deny(400, 'INVALID_INITIALIZE');
        if (params.protocolVersion !== PROTOCOL) return deny(400, 'PROTOCOL_VERSION');
        for (const [id, s] of sessions) if (s.expires <= clock) sessions.delete(id);
        if (sessions.size >= 16) return deny(429, 'SESSION_BUDGET');
        const id = randomUUID(); sessions.set(id, { actor, initialized: false, expires: clock + 60000 });
        return send(200, { jsonrpc: '2.0', id: message.id, result: { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'fictional-policy-lab', version: '1.0.0' } } }, { 'Mcp-Session-Id': id });
      }
      if (!session) return deny(400, 'SESSION_REQUIRED');
      if (req.headers['mcp-protocol-version'] !== PROTOCOL) return deny(400, 'PROTOCOL_VERSION');
      if (message.id === undefined) {
        if (message.method !== 'notifications/initialized') return deny(400, 'UNSUPPORTED_NOTIFICATION');
        session.initialized = true; return send(202, null);
      }
      if (!session.initialized) return deny(400, 'NOT_INITIALIZED');
      if (message.method === 'ping') return result({});
      if (message.method === 'tools/list') return result({ tools });
      if (message.method !== 'tools/call') return rpcError(-32601, 'METHOD_NOT_FOUND');
      if (!['read_record', 'set_note'].includes(params.name)) return rpcError(-32602, 'UNKNOWN_TOOL');
      const a = params.arguments, change = params.name === 'set_note';
      if (!plain(a) || !ownKeys(a, change ? ['record_id', 'note', 'approval'] : ['record_id']) ||
          typeof a.record_id !== 'string' || !/^A[12]$|^B1$/.test(a.record_id) ||
          (change && (typeof a.note !== 'string' || a.note.length > 120 || (a.approval !== undefined && typeof a.approval !== 'string')))) return rpcError(-32602, 'BAD_ARGUMENTS');
      const outcome = (code, ok, detail = {}) => result({ isError: !ok, content: [{ type: 'text', text: code }], structuredContent: { code, ...detail } });
      const record = records.get(a.record_id), policy = policies[actor];
      if (profile === 'fixed' && record.tenant !== policy.tenant) return outcome('OBJECT_DENIED', false);
      if (change) {
        if (profile === 'fixed') {
          if (!policy.write) return outcome('ROLE_DENIED', false);
          const grant = approvals.get(a.approval);
          if (!grant || grant.actor !== actor || grant.session !== sessionId || grant.record !== a.record_id || grant.expires <= clock) return outcome('APPROVAL_DENIED', false);
          approvals.delete(a.approval); // No await between consume and mutation: one winner, even concurrently.
        }
        record.note = a.note; record.revision++; writes++; return outcome('UPDATED', true, { revision: record.revision });
      }
      return outcome('READ', true, { record: a.record_id, revision: record.revision, note: record.note });
    } catch (error) {
      if (!res.headersSent) deny(error.status ?? 500, error.code ?? 'LAB_ERROR');
    }
  });
  server.requestTimeout = 3000; server.headersTimeout = 3000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  host = '127.0.0.1:' + server.address().port;
  const trace = [];
  const wire = (body, { actor = 'reader', session, headers = {}, method = 'POST', raw, unfinished = false } = {}) => new Promise((resolve, reject) => {
    const payload = raw ?? JSON.stringify(body);
    // Hostname, address family, port and path are fixed by this closure; no redirects/DNS/URL input.
    const req = httpRequest({ hostname: '127.0.0.1', family: 4, port: server.address().port, path: '/mcp', method,
      headers: { authorization: 'Bearer ' + (tokens[actor] ?? 'invalid'), 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': PROTOCOL } : {}), ...headers } }, res => {
      const chunks = []; let size = 0;
      res.on('data', b => { if ((size += b.length) > 65536) req.destroy(new Error('RESPONSE_LIMIT')); else chunks.push(b); });
      res.once('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8'), parsed = text ? JSON.parse(text) : null;
          const code = parsed?.result?.structuredContent?.code ?? parsed?.code ?? parsed?.error?.message ?? (res.statusCode === 202 ? 'ACCEPTED' : 'OK');
          trace.push({ method: typeof body?.method === 'string' && /^[a-z/]+$/.test(body.method) ? body.method : 'invalid', http: res.statusCode, code });
          resolve({ http: res.statusCode, code, body: parsed, session: res.headers['mcp-session-id'] });
        } catch (e) { reject(e); }
      });
      res.once('error', reject);
    });
    req.setTimeout(4000, () => req.destroy(new Error('CLIENT_DEADLINE'))); req.once('error', reject);
    if (unfinished) req.write(payload); else req.end(payload);
  });
  const initialize = async (actor = 'reader', notify = true) => {
    const r = await wire({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'local-test', version: '1' } } }, { actor });
    assert.equal(r.http, 200); assert.ok(r.session);
    if (notify) assert.equal((await wire({ jsonrpc: '2.0', method: 'notifications/initialized' }, { actor, session: r.session })).http, 202);
    return r.session;
  };
  return {
    wire, initialize, trace,
    approve(actor, session, record = 'A1', ttl = 1000) {
      assert.ok(policies[actor]?.write && sessions.get(session)?.actor === actor && records.get(record)?.tenant === policies[actor].tenant);
      assert.ok(Number.isFinite(ttl) && ttl > 0 && ttl <= 5000);
      const token = randomBytes(32).toString('hex'); approvals.set(token, { actor, session, record, expires: clock + ttl }); return token;
    },
    advance(ms) { assert.ok(Number.isFinite(ms) && ms >= 0); clock += ms; },
    snapshot() { return { writes, revisions: Object.fromEntries([...records].map(([id, x]) => [id, x.revision])) }; },
    async close() { server.closeAllConnections(); await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  };
}

